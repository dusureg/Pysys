"""Client ratings sent from the client site itself: the inbox card in Settings (address + private key, test button), the rating form posting the encrypted code
to the company inbox (a Google Apps Script web app, simulated by mockgh.py), every state the client can see (sending, sent, not confirmed, failed, retry),
the admin pulling the ratings (button and automatic check), the place kept between pulls, bad/unknown codes, a wrong key, no connection, and what stays private.
Real Apps Script behaviour (its redirect, its CORS headers) cannot be reached from this sandbox: that part is covered by docs/INBOX.md and the live test it asks for."""
import json, re
from mockgh import BASE
from lib import *
from s20_audit import AUDIT_JS, record as audit_record        # the screens of this suite are part of the quality audit (contrast, tap sizes, names, scrolling)

def drop_network_noise(S, n0):
    """A refused or unreachable inbox is logged by Chromium as a console error. That is what this suite provokes on purpose, so only these lines are removed."""
    S.errors[n0:] = [e for e in S.errors[n0:] if not (e[1] == 'error' and ('Failed to load resource' in e[2] or 'CORS policy' in e[2] or 'script.google.com' in e[2] or 'net::ERR' in e[2]))]


def open_rating(cp, cid, secret, sku):
    cp.goto(f'{BASE}#client/{cid}'); cp.wait_for_selector('#clKey')
    cp.fill('#clKey', secret); cp.click('#btnOpen'); cp.wait_for_selector('#tapeBig', timeout=30000)
    cp.click(f'.pcard:has-text("{sku}")'); cp.wait_for_selector('#rateBox', timeout=30000)


def state(cp):
    return cp.get_attribute('#rateState', 'data-send') if cp.locator('#rateState').count() else 'form'


def wait_state(cp, want, timeout=30000):
    cp.wait_for_selector(f'#rateState[data-send="{want}"]', timeout=timeout)


def run(S):
    r, mock, pg, cid = S.r, S.mock, S.admin, S.cid
    pg.set_viewport_size({'width': 1280, 'height': 900})
    box = mock.inbox
    URL = 'https://script.google.com/macros/s/AKfycbxDUSURtestINBOX0123456789abcdef/exec'
    sku = S.skus[1]
    r.check('the second project of the test client exists', len(S.skus) >= 2, str(S.skus))

    # ================= Settings: the inbox card =================
    pg.click('#adminNav a[data-route=settings]'); pg.wait_for_selector('#inboxCfg')
    r.check('Settings has a "Client rating inbox" card with an address field, a key field, a key maker and a test button',
            all(pg.locator(x).count() == 1 for x in ('#setInbox', '#setInboxKey', '#btnInboxKey', '#btnInboxTest')) and 'Client rating inbox' in pg.inner_text('#inboxCfg'))
    pg.fill('#setInbox', 'https://evil.example/macros/s/AKfycbxDUSURtestINBOX0123456789abcdef/exec'); pg.click('#btnSaveSettings')
    pg.wait_for_selector('main .msg.bad', timeout=10000)
    r.check('an address that is not a Google Apps Script web app is refused', 'must look like https://script.google.com/macros/s/' in pg.inner_text('main'), pg.inner_text('main')[-300:])
    pg.fill('#setInbox', URL); pg.fill('#setInboxKey', ''); pg.click('#btnSaveSettings')
    pg.wait_for_function("() => /16 to 64 letters/.test(document.querySelector('main').innerText)", timeout=10000)
    r.check('an address without a pick-up key is refused', True)
    pg.click('#btnInboxKey')
    key = pg.input_value('#setInboxKey')
    r.check('"Make a new key" fills in a 32-character key of letters and numbers', re.fullmatch(r'[A-Za-z0-9]{32}', key) is not None, key)
    r.check('two new keys differ', (pg.click('#btnInboxKey'), pg.input_value('#setInboxKey'))[1] != key)
    key = pg.input_value('#setInboxKey')
    n0 = len(S.errors)
    box['key'] = 'a-different-key-0123456789'                     # the script still holds another key
    pg.click('#btnInboxTest'); pg.wait_for_selector('#inboxTestMsg.bad', timeout=15000)
    audit_record('admin|desktop|en|dark|settings-inbox-bad', pg.evaluate(AUDIT_JS, {'phone': False}))
    r.check('test with the wrong key: "refused the pick-up key"', 'refused the pick-up key' in pg.inner_text('#inboxTestMsg'), pg.inner_text('#inboxTestMsg'))
    box['key'] = key
    pg.click('#btnInboxTest'); pg.wait_for_selector('#inboxTestMsg.ok', timeout=15000)
    audit_record('admin|desktop|en|dark|settings-inbox-ok', pg.evaluate(AUDIT_JS, {'phone': False}))
    r.check('test with the right key: the inbox answers and says how many ratings it holds', '0 rating' in pg.inner_text('#inboxTestMsg'), pg.inner_text('#inboxTestMsg'))
    box['mode'] = 'offline'
    pg.click('#btnInboxTest'); pg.wait_for_selector('#inboxTestMsg.bad', timeout=30000)
    r.check('test without a connection: a plain message, nothing thrown', 'Could not reach the inbox' in pg.inner_text('#inboxTestMsg'))
    box['mode'] = 'ok'; drop_network_noise(S, n0)
    pg.click('#btnSaveSettings'); pg.wait_for_selector('.toast:has-text("Settings saved")', timeout=30000)
    b = json.loads(mock.text('data/public/brand.json'))
    r.check('brand.json now carries the (public) inbox address and never the key', b.get('inbox') == URL and key not in mock.text('data/public/brand.json'))
    everything = ''.join(f['b'].decode('utf-8', 'ignore') for p_, f in mock.files.items() if not p_.startswith('data/private/'))
    r.check('the key is nowhere in the public files; the private settings are sealed', key not in everything and key not in mock.text('data/private/settings.json'))
    pg.evaluate("() => flushAudit()")
    leaked = pg.evaluate("async (k) => { const ms = await auditMonths(); let all = ''; for (const m of ms) all += JSON.stringify((await loadAuditMonth(m)).items); return all.includes(k); }", key)
    saw = pg.evaluate("async () => { const ms = await auditMonths(); let all = []; for (const m of ms) all = all.concat((await loadAuditMonth(m)).items); return all.filter((e) => e.area === 'settings').some((e) => (e.ch || []).some((c) => /inbox/i.test(c[0]))); }")
    r.check('the history records that the inbox settings changed, without the key', saw and not leaked)

    # ================= the client page =================
    pg.click('#adminNav a[data-route=dashboard]'); pg.wait_for_selector('#btnNewClient')
    # finish the second project so the client can rate it
    pg.click('.item a:has-text("Edit")'); pg.wait_for_selector('#edName')
    pg.click('.tabs .pill >> nth=1'); pg.click('#tab-stages')
    for i in range(pg.locator('.editor-stage input[type=checkbox]').count()):
        pg.locator('.editor-stage input[type=checkbox]').nth(i).check()
    save(pg)
    ctx, cp = new_page(S, 'client-inbox')
    cp.set_viewport_size({'width': 390, 'height': 844})
    open_rating(cp, cid, S.secret, sku)
    r.check('with an inbox set, the form says "Send my rating"', 'Send my rating' in cp.inner_text('#btnRateGo'), cp.inner_text('#btnRateGo'))
    r.check('the client page accepts only a Google Apps Script address for the inbox (anything else in brand.json is dropped)',
            cp.evaluate("() => [sanitizeBrand({ inbox: 'https://evil.example/macros/s/AKfycbxDUSURtest0123/exec' }).inbox, sanitizeBrand({ inbox: 'http://script.google.com/macros/s/AKfycbxDUSURtest0123/exec' }).inbox, sanitizeBrand({ inbox: 'https://script.google.com/macros/s/AKfycbxDUSURtest0123/exec?x=1' }).inbox, sanitizeBrand({ inbox: 'https://script.google.com/macros/s/AKfycbxDUSURtest0123/exec' }).inbox]") ==
            ['', '', '', 'https://script.google.com/macros/s/AKfycbxDUSURtest0123/exec'])
    comment = 'عمل رائع وتسليم في الموعد — lovely finish, thank you'
    cp.click('button.sc[data-n="7"]'); cp.fill('#rateComment', comment)
    audit_record('client|phone|en|dark|rating-form', cp.evaluate(AUDIT_JS, {'phone': True}))

    # -- 1. the inbox answers with an error: the client is told, nothing is lost, the other ways are still there
    n0 = len(S.errors); box['mode'] = 'error'
    cp.click('#btnRateGo'); wait_state(cp, 'failed')
    t_ = cp.inner_text('#rateBox')
    r.check('inbox error: "Not sent yet" with Try again, WhatsApp, e-mail and Copy all offered', 'Not sent yet' in t_ and cp.locator('#btnRateRetry').count() == 1 and cp.locator('#btnRateWa').count() == 1 and cp.locator('#btnRateMail').count() == 1 and cp.locator('#btnRateCopy').count() == 1, t_)
    r.check('inbox error: nothing reached the inbox', len(box['rows']) == 0)
    cp.screenshot(path=f'{SP}/shot-inbox-failed-mobile.png', full_page=True)
    audit_record('client|phone|en|dark|rating-failed', cp.evaluate(AUDIT_JS, {'phone': True}))
    r.check('failed state on a phone: no horizontal scroll', cp.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'))
    cp.reload(); drop_network_noise(S, n0)
    open_rating(cp, cid, S.secret, sku)
    r.check('after a reload the rating is kept and can be sent again with one tap', state(cp) == 'failed' and cp.locator('#btnRateRetry').count() == 1 and cp.locator('#rateComment').count() == 0)

    # -- 2. no connection at all
    n0 = len(S.errors); box['mode'] = 'offline'
    cp.click('#btnRateRetry'); wait_state(cp, 'failed')
    r.check('no connection: still "Not sent yet", the button stays', cp.locator('#btnRateRetry').count() == 1)
    drop_network_noise(S, n0)

    # -- 3. the inbox gets it but the browser cannot read the answer (CORS)
    n0 = len(S.errors); box['mode'] = 'nocors'; box['nc'] = 0
    cp.click('#btnRateRetry'); wait_state(cp, 'unsure')
    t_ = cp.inner_text('#rateBox')
    r.check('answer not readable: "Sent, not confirmed", the request did arrive, Try again is offered', 'Sent, not confirmed' in t_ and len(box['rows']) == 1 and cp.locator('#btnRateRetry').count() == 1, t_)
    audit_record('client|phone|en|dark|rating-unsure', cp.evaluate(AUDIT_JS, {'phone': True}))
    drop_network_noise(S, n0)

    # -- 4. sent
    box['mode'] = 'ok'
    cp.click('#btnRateRetry'); wait_state(cp, 'sent')
    t_ = cp.inner_text('#rateBox')
    r.check('sent: "Sent. Thank you!", no retry button, other ways are folded away', 'Sent. Thank you!' in t_ and cp.locator('#btnRateRetry').count() == 0 and cp.locator('#rateOther').count() == 1 and cp.evaluate("() => !document.querySelector('#rateOther').open") and cp.locator('#btnRateEdit').count() == 0, t_)
    r.check('sending the same rating again changes nothing: still one row in the inbox', len(box['rows']) == 1)
    code = box['rows'][0]
    r.check('what the inbox holds is only the encrypted code: no comment, no score, no secret key', code.startswith(f'DSFB1.{cid}.') and 'lovely' not in code and 'رائع' not in code and S.secret not in code)
    cp.screenshot(path=f'{SP}/shot-inbox-sent-mobile.png', full_page=True)
    audit_record('client|phone|en|dark|rating-sent', cp.evaluate(AUDIT_JS, {'phone': True}))
    r.check('sent state on a phone: no horizontal scroll', cp.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'))
    cp.click('#btnLang'); cp.wait_for_selector('#rateBox:has-text("تم الإرسال")')
    r.check('Arabic: the sent message is translated', 'شكرًا' in cp.inner_text('#rateBox'))
    audit_record('client|phone|ar|dark|rating-sent', cp.evaluate(AUDIT_JS, {'phone': True}))
    cp.click('#btnLang'); cp.wait_for_selector('#rateBox:has-text("Sent. Thank you!")')
    cp.reload(); open_rating(cp, cid, S.secret, sku)
    r.check('after a reload the client still sees that the rating was sent', state(cp) == 'sent')

    # ================= the admin pulls it =================
    pg.evaluate("() => { inboxAutoAt = 0; }")
    pg.click('#adminNav a[data-route=settings]'); pg.wait_for_selector('#inboxCfg'); pg.click('#adminNav a[data-route=dashboard]'); pg.wait_for_selector('#btnNewClient')
    pg.wait_for_selector('#inboxRow', timeout=30000)
    pg.wait_for_function("() => /new rating\\(s\\) added/.test(document.querySelector('#inboxState').innerText)", timeout=60000)
    d = pg.inner_text('main')
    audit_record('admin|desktop|en|dark|dashboard-inbox', pg.evaluate(AUDIT_JS, {'phone': False}))
    r.check('the dashboard checks the inbox by itself when it opens and imports the rating (average of 9 and 7 = 8)', '1 new rating(s) added' in d and comment in d and '8 / 10' in d and '2 rated projects' in d, d[:900])
    snap = json.loads(pg.evaluate(DECRYPT_JS, {'payload': json.loads(mock.text(f'data/clients/{cid}.json'))['payload'], 'secret': S.secret, 'id': cid}))
    fb = [p_ for p_ in snap['projects'] if p_['sku'] == sku][0].get('feedback')
    r.check('the client snapshot carries the rating: score 7 with the comment', fb and fb['score'] == 7 and fb['comment'] == comment, str(fb))
    cur = pg.evaluate("() => localStorage.getItem(inboxCursorKey())")
    r.check('the place reached in the inbox is remembered on this device', cur == '1', str(cur))
    pg.evaluate("() => flushAudit()")
    ent = pg.evaluate("async () => { const ms = await auditMonths(); let all = []; for (const m of ms) all = all.concat((await loadAuditMonth(m)).items); return all.filter((e) => e.area === 'ratings' && e.act === 'import').map((e) => e.title); }")
    r.check('the History records the imported rating', any(sku in x for x in ent), str(ent))

    # the client's open page shows the thank-you with the score
    cp.click('#btnLiveRefresh'); cp.wait_for_selector('#rateBox.done-rate', timeout=30000)
    r.check('the client page now shows the rating as received: score and own comment', '7' in cp.inner_text('#rateBox') and comment in cp.inner_text('#rateBox'))

    # -- pulling again: nothing new, nothing duplicated
    pg.click('#btnInboxPull'); pg.wait_for_function("() => /No new ratings/.test(document.querySelector('#inboxState').innerText)", timeout=30000)
    r.check('a second check finds nothing new', 'No new ratings' in pg.inner_text('#inboxState') and 'already known' not in pg.inner_text('#inboxState'))
    pg.evaluate("() => localStorage.removeItem(inboxCursorKey())")
    pg.click('#btnInboxPull'); pg.wait_for_function("() => /1 already known/.test(document.querySelector('#inboxState').innerText)", timeout=30000)
    r.check('from another device (no remembered place) the same rating is recognised, not imported twice', 'No new ratings. 1 already known' in pg.inner_text('#inboxState') and len(snap['projects']) == len(json.loads(pg.evaluate(DECRYPT_JS, {'payload': json.loads(mock.text(f"data/clients/{cid}.json"))['payload'], 'secret': S.secret, 'id': cid}))['projects']))

    # -- rubbish in the inbox: reported, never blocks, not retried forever
    box['rows'].append('DSFB1.DS-CL-9999.AAAAAAAAAAAAAAAAAAAAAAAA')
    box['rows'].append(f'DSFB1.{cid}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')
    pg.click('#btnInboxPull'); pg.wait_for_selector('#inboxRes .msg.bad', timeout=30000)
    res = pg.inner_text('#inboxRes')
    r.check('an unknown client and an unreadable code are reported by name', 'DS-CL-9999 was not found' in res and 'could not be read' in res, res)
    pg.click('#btnInboxPull'); pg.wait_for_function("() => /No new ratings/.test(document.querySelector('#inboxState').innerText)", timeout=30000)
    r.check('they are not reported again on the next check (the place moved past them)', pg.locator('#inboxRes .msg.bad').count() == 0)

    # -- wrong key / no connection / not set up
    n0 = len(S.errors)
    box['key'] = 'changed-in-the-script-0123456789'
    pg.click('#btnInboxPull'); pg.wait_for_selector('#inboxRes .msg.bad', timeout=30000)
    r.check('a changed key in the script: the admin is told to make Settings and the script agree', 'refused the pick-up key' in pg.inner_text('#inboxRes'))
    box['key'] = key; box['mode'] = 'offline'
    pg.click('#btnInboxPull'); pg.wait_for_selector('#inboxRes .msg.bad:has-text("Could not reach")', timeout=60000)
    r.check('no connection: a plain message and the button works again afterwards', not pg.is_disabled('#btnInboxPull'))
    box['mode'] = 'ok'; drop_network_noise(S, n0)

    # -- automatic check: once per ten minutes, and only for someone who may edit ratings
    pg.click('#adminNav a[data-route=settings]'); pg.wait_for_selector('#inboxCfg'); pg.click('#adminNav a[data-route=dashboard]'); pg.wait_for_selector('#btnNewClient')
    before = box['requests']; pg.wait_for_timeout(600)
    r.check('opening the dashboard again within ten minutes does not call the inbox again', box['requests'] == before, f'{before} -> {box["requests"]}')
    pg.evaluate("() => { inboxAutoAt = 0; window.__can = can; can = (a, l) => (a === 'ratings' && l === PERM_EDIT ? false : window.__can(a, l)); }")
    try:
        pg.click('#adminNav a[data-route=settings]'); pg.wait_for_selector('#inboxCfg'); pg.click('#adminNav a[data-route=dashboard]'); pg.wait_for_selector('#btnNewClient'); pg.wait_for_timeout(800)
        r.check('a person who may only view ratings: no automatic check, and the check button is a protected control', box['requests'] == before and pg.get_attribute('#btnInboxPull', 'data-edit') == 'ratings')
    finally:
        pg.evaluate("() => { can = window.__can; }")

    # -- the inbox switched off again: the client page goes back to WhatsApp / e-mail / copy
    pg.click('#adminNav a[data-route=settings]'); pg.wait_for_selector('#inboxCfg')
    pg.fill('#setInbox', ''); pg.click('#btnSaveSettings'); pg.wait_for_selector('.toast:has-text("Settings saved")', timeout=30000)
    r.check('clearing the address removes it from brand.json', json.loads(mock.text('data/public/brand.json')).get('inbox') == '')
    r.check('the key kept in the private settings is not needed any more but never leaves it', key not in mock.text('data/public/brand.json'))
    ctx.close()
