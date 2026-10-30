"""Client site: live search by client ID / SKU, brand and contact buttons, key form from the search page, privacy of the public index."""
import re, json
from mockgh import BASE
from lib import *


def run(S):
    r, mock, cid, secret = S.r, S.mock, S.cid, S.secret
    ctx, cp = new_page(S, 'client3')
    cp.goto(BASE); cp.wait_for_selector('#clQ')
    try:
        cp.wait_for_selector('.card.contact a:has-text("WhatsApp")', timeout=8000)
    except Exception:
        print('DEBUG html:', cp.evaluate('document.body.innerHTML')[:1800].replace(chr(10),' ')); print('DEBUG cls:', cp.evaluate('document.documentElement.className + " | " + location.href + " | " + document.readyState')); print('DEBUG req:', [x for x in mock.reqlog if x[0] == 'client3'][-8:]); print('DEBUG err:', S.errors[-4:]); raise
    hrefs = cp.eval_on_selector_all('.card.contact a', 'els => els.map(e => e.getAttribute("href"))')
    r.check('search page: contact buttons come from the company profile (WhatsApp, call, email)', any(h.startswith('https://wa.me/201001234567') for h in hrefs) and 'tel:+201000001111' in hrefs and any(h.startswith('mailto:info@dusur.example') for h in hrefs), str(hrefs))
    r.check('search page: uploaded logo and company name in the header; document title is branded', cp.locator('#brandMark img.brandimg[src^="data:image/png"]').count() == 1 and 'DUSUR' in cp.title(), cp.title())
    r.check('search page has no admin controls and the admin link is not present', cp.locator('#adminNav, #btnNewClient, #cfgUser').count() == 0 or not cp.is_visible('#adminNav'))

    hint = cp.inner_text('.live-out')
    cp.fill('#clQ', 'ab'); cp.wait_for_timeout(500)
    r.check('too short to search: only the hint is shown, nothing is fetched', cp.locator('#btnOpen').count() == 0 and not [x for x in mock.reqlog if x[0] == 'client3' and '/data/clients/' in x[2]])
    cp.fill('#clQ', 'hello world'); cp.wait_for_selector('.live-out:has-text("does not look like")')
    r.check('wrong format: explains the expected format with an example', 'DS-CL-1001' in cp.inner_text('.live-out'))

    # ---- by client ID (lower case is fine), live, no button to press
    cp.fill('#clQ', cid.lower()); cp.wait_for_selector('.result.found #btnOpen', timeout=15000)
    r.check('typing a Client ID finds the file live and asks for the secret key', cid in cp.inner_text('.found-head') and cp.locator('#clKey').count() == 1)
    cp.fill('#clKey', 'wrong-key-123456'); cp.click('#btnOpen'); cp.wait_for_selector('.msg.bad:has-text("Invalid Passcode")')
    r.check('wrong key on the search page: Access Denied, nothing opens', cp.evaluate('location.hash') in ('', '#') and cp.locator('#tapeBig').count() == 0)
    fetches_before = len([x for x in mock.reqlog if x[0] == 'client3' and f'/data/clients/{cid}.json' in x[2]])
    cp.fill('#clKey', secret); cp.click('#btnOpen'); cp.wait_for_selector('#tapeBig', timeout=30000)
    fetches_after = len([x for x in mock.reqlog if x[0] == 'client3' and f'/data/clients/{cid}.json' in x[2]])
    r.check('right key opens the portal at #client/<id> without downloading the file a second time', cp.evaluate('location.hash') == f'#client/{cid}' and fetches_after == fetches_before, f'{fetches_before} {fetches_after}')
    r.check('portal shows the brand header, contact buttons and a Live indicator', cp.locator('.card.contact a').count() >= 3 and cp.locator('.live').count() == 1)
    cp.click('#btnClientLock'); cp.wait_for_selector('#clQ')

    # ---- by project number
    cp.fill('#clQ', S.skus[0].lower()); cp.wait_for_selector('.result.found #btnOpen', timeout=15000)
    r.check('typing a project number (SKU) finds its client file via the hashed index', S.skus[0] in cp.inner_text('.found-head') and cid in cp.inner_text('.found-head'), cp.inner_text('.found-head'))
    cp.fill('#clQ', S.skus[1]); cp.wait_for_selector('.result.found #btnOpen', timeout=15000)
    r.check('second project of the same client resolves to the same file', cid in cp.inner_text('.found-head'))
    ym = day(0)[2:4] + day(0)[5:7]
    cp.fill('#clQ', f'DS-DRS-{ym}-0002'); cp.wait_for_selector('.result:has-text("No project found")', timeout=15000)
    r.check('a project number that was regenerated is gone from the index (not found, contact buttons offered)', cp.locator('.result a:has-text("WhatsApp")').count() == 1)
    cp.fill('#clQ', 'DS-CL-9999'); cp.wait_for_selector('.result:has-text("No project found")', timeout=15000)
    r.check('unknown Client ID: friendly "not found" with contact buttons', cp.locator('.result a:has-text("Call")').count() == 1)

    # ---- the public index leaks nothing
    idx = mock.text('data/public/index.json'); j = json.loads(idx)
    r.check('public index: version + 16-hex hashes -> client IDs only (no SKU, no names, no phones)', set(j) == {'v', 'skus'} and len(j['skus']) == 2 and all(re.fullmatch(r'[0-9a-f]{16}', k) for k in j['skus']) and set(j['skus'].values()) == {cid} and not any(s in idx for s in S.skus + ['أحمد', '+20', 'Kitchen']), idx)

    # ---- language keeps the query and the result
    cp.fill('#clQ', cid); cp.wait_for_selector('.result.found #btnOpen', timeout=15000)
    cp.click('#btnLang'); cp.wait_for_selector('.result.found #btnOpen')
    r.check('Arabic: layout flips, the query and the found result stay', cp.evaluate('document.documentElement.dir') == 'rtl' and cp.input_value('#clQ') == cid and 'تم العثور' in cp.inner_text('.found-head'), cp.inner_text('.found-head'))
    cp.screenshot(path=f'{SP}/shot-e-home-ar.png', full_page=True)
    cp.click('#btnLang'); cp.wait_for_selector('.result.found #btnOpen')
    cp.screenshot(path=f'{SP}/shot-e-home-desktop.png', full_page=True)
    cp.set_viewport_size({'width': 390, 'height': 844}); cp.wait_for_timeout(300)
    r.check('search page on a phone: no horizontal scroll', cp.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'))
    cp.screenshot(path=f'{SP}/shot-e-home-mobile.png', full_page=True)
    cp.click('#btnTheme'); cp.screenshot(path=f'{SP}/shot-e-home-mobile-light.png', full_page=True)
    r.check('client site never called the GitHub API and stored no personal data in the browser', not [x for x in mock.reqlog if x[0] == 'client3' and 'api.github.com' in x[2]] and cp.evaluate('Object.keys(localStorage).filter(k => !k.startsWith("dsp.")).length') == 0)
    ctx.close()
