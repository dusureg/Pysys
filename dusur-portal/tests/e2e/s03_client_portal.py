"""Client portal: passcode flow, content, privacy of finance data, photos, switcher, language/theme, mobile."""
import re, json
from mockgh import BASE
from lib import *

ALLOWED_TOP = {'schema', 'id', 'name', 'phone', 'currency', 'createdAt', 'updatedAt', 'projects'}
ALLOWED_PROJ = {'sku', 'type', 'typeName', 'title', 'description', 'startDate', 'dueDate', 'price', 'payments', 'schedule', 'stages', 'parts', 'photos', 'downloads', 'feedback'}


def run(S):
    r, mock, cid, secret = S.r, S.mock, S.cid, S.secret
    ctx, cp = new_page(S, 'client'); S.client = cp
    prompts = []
    cp.on('dialog', lambda d: (prompts.append(d.message), d.dismiss()))
    link = f'{BASE}#client/{cid}'
    cp.goto(link); cp.wait_for_selector('#clKey')
    r.check('private link opens an in-page key form (no browser prompt)', not prompts and cp.locator('#btnOpen').count() == 1)
    cp.fill('#clKey', 'wrong-key-123456'); cp.click('#btnOpen'); cp.wait_for_selector('text=Access Denied')
    r.check('wrong key -> Access Denied / Invalid Passcode', 'Invalid Passcode' in cp.inner_text('#app'))
    r.check('admin navigation hidden for clients', not cp.is_visible('#adminNav') and cp.locator('#edName, #cfgUser, #btnNewClient, #dashSearch').count() == 0)
    r.check('secure client banner visible', cp.is_visible('#clientBanner') and 'Secure client portal' in cp.inner_text('#clientBanner'))
    cp.fill('#clKey', secret); cp.click('#btnOpen'); cp.wait_for_selector('#tapeBig', timeout=30000)
    r.check('retry with the right key opens the project', not prompts)

    page = cp.inner_text('#app')
    r.check('portal shows client name, client ID and last-updated', 'أحمد محمد' in page and cid in page and 'Last updated' in page)
    r.check('two projects -> project switcher with both SKUs', cp.locator('.pcard').count() == 2 and all(s in cp.inner_text('.pcards') for s in S.skus))
    r.check('project status badges reflect progress (In progress / Pending)', 'In progress' in cp.inner_text('.pcard >> nth=0') and 'Pending' in cp.inner_text('.pcard >> nth=1') and cp.locator('.titleblock .badge.progress').count() == 1)
    r.check('time remaining counts down to the due date (20 days)', '20 days left' in cp.inner_text('#tapeBig'), cp.inner_text('#tapeBig'))
    r.check('tape-measure shows elapsed time marker and both dates', cp.locator('.tape .tape-now').count() == 1 and 'Start' in cp.inner_text('.tape-ends') and 'Due' in cp.inner_text('.tape-ends'))
    money = cp.inner_text('#moneyCard')
    r.check('remaining money: price 50,000 / paid 20,000 / remaining 30,000 + payment note', all(money_in(money, n) for n in (50000, 20000, 30000)) and 'Deposit' in money)
    r.check('five production stages (type template incl. Delivery & Installation)', cp.locator('article.stage').count() == 5)
    r.check('first stage shows Completed; 4 of 16 tasks ticked; overall 25%', cp.locator('article.stage').first.locator('.badge.done').count() == 1 and cp.locator('.checks li.done').count() == 4 and '25%' in page)
    parts = cp.inner_text('#partsCard')
    r.check('parts list: names, quantities, per-part time left', 'Base cabinets' in parts and '× 6' in parts and 'Doors' in parts and '× 12' in parts and '5 days left' in parts and '1 of 2 pieces completed' in parts, parts)
    r.check('description rendered as text (no injected element, no script run)', cp.locator('.desc img').count() == 0 and '<img src=x' in cp.inner_text('.desc') and cp.evaluate('window.__xss') is None)

    # ---- finance must never reach the client
    banned = ['COGS', 'Gross', 'Net profit', 'Margin', 'Markup', 'Operating', '22,000', '28,000', '25,000', 'INTERNAL', 'ahmed@', 'New Cairo', secret]
    r.check('no cost / profit / margin / internal data on the client page', not [b for b in banned if b in page], str([b for b in banned if b in page]))
    payload = json.loads(mock.text(f'data/clients/{cid}.json'))['payload']
    plain = cp.evaluate(DECRYPT_JS, {'payload': payload, 'secret': secret, 'id': cid})
    pub = json.loads(plain)
    r.check('decrypted client snapshot contains only whitelisted fields', set(pub) <= ALLOWED_TOP and all(set(p) <= ALLOWED_PROJ for p in pub['projects']), str(set(pub) - ALLOWED_TOP))
    r.check('snapshot has no costs/notes/secret/email/address anywhere', not [k for k in ('costs', 'internalNotes', 'secret', 'email', 'address', 'notes', 'cogs', 'opex') if f'"{k}"' in plain])
    r.check('wrong key cannot decrypt the snapshot', cp.evaluate(DECRYPT_JS, {'payload': payload, 'secret': 'AAAA-BBBB-CCCC-DDDD', 'id': cid}) == '')
    r.check('client browser made no api.github.com calls and stores nothing', not [x for x in mock.reqlog if x[0] == 'client' and 'api.github.com' in x[2]] and cp.evaluate('localStorage.length') == 0)

    # ---- photos
    cp.locator('#photosCard').scroll_into_view_if_needed()      # thumbnails are loaded when they come near the screen
    cp.wait_for_selector('#photosCard .imgbtn img[src^="blob:"], #photosCard .imgbtn img[src^="https://images.example.com"]')
    cp.wait_for_selector('#photosCard img[src^="blob:"]', timeout=20000)
    ph = cp.inner_text('#photosCard')
    r.check('two photos: newest first, captions shown', cp.locator('#photosCard .ph').count() == 2 and 'Cutting done' in ph and 'Delivered panels' in ph)
    r.check('uploaded photo decrypted in the browser; link photo loaded from its URL', cp.locator('#photosCard img[src^="blob:"]').count() == 1 and cp.locator('#photosCard img[src^="https://images.example.com"]').count() == 1)
    raws = [x[2] for x in mock.reqlog if x[0] == 'client' and 'raw.githubusercontent.com' in x[2]]
    r.check('client fetched the snapshot and encrypted photo from raw.githubusercontent.com', any(f'/HEAD/data/clients/{cid}.json' in u for u in raws) and any(re.search(rf'/HEAD/data/clients/{cid}/\w+\.t', u) for u in raws))
    cp.click('#photosCard .ph >> nth=1 >> .imgbtn'); cp.wait_for_selector('dialog.lb[open] img')
    r.check('lightbox opens the full-size photo', True)
    cp.click('dialog.lb button:has-text("Close")'); cp.wait_for_selector('dialog.lb', state='detached')

    # ---- second project
    cp.click('.pcard >> nth=1')
    cp.wait_for_selector('.chip.mono:has-text("DRS")')
    r.check('switching project: no due date -> clear message; no payments card', 'No due date' in cp.inner_text('#tapeBig') and cp.locator('#moneyCard').count() == 0)
    cp.click('.pcard >> nth=0'); cp.wait_for_selector('#moneyCard')

    # ---- language + theme keep the decrypted view (no second prompt)
    cp.click('#btnLang'); cp.wait_for_selector('text=الوقت المتبقي')
    big = cp.inner_text('#tapeBig')
    r.check('Arabic: RTL layout, Arabic labels, countdown in Arabic', cp.evaluate('document.documentElement.dir') == 'rtl' and 'متبقي' in big and '20' in big, big)
    r.check('language switch did not ask for the key again and kept photos', cp.locator('#clKey').count() == 0 and cp.locator('#photosCard .ph').count() == 2)
    r.check('Arabic money still shows the remaining balance', money_in(cp.inner_text('#moneyCard'), 30000))
    cp.click('#btnTheme')
    r.check('light theme applied and preferences remembered', cp.evaluate('document.documentElement.dataset.theme') == 'light' and cp.evaluate("[localStorage.getItem('dsp.lang'), localStorage.getItem('dsp.theme')]") == ['ar', 'light'])
    cp.screenshot(path=f'{SP}/shot-v2-client-ar-light.png', full_page=True)
    cp.set_viewport_size({'width': 390, 'height': 844}); cp.wait_for_timeout(300)
    r.check('Arabic mobile: no horizontal scroll', cp.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'))
    cp.screenshot(path=f'{SP}/shot-v2-client-ar-mobile.png', full_page=True)
    cp.click('#btnLang'); cp.click('#btnTheme'); cp.wait_for_selector('text=Time remaining')
    r.check('English mobile: no horizontal scroll', cp.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'))
    cp.screenshot(path=f'{SP}/shot-v2-client-en-mobile.png', full_page=True)
    cp.set_viewport_size({'width': 1280, 'height': 900}); cp.wait_for_timeout(200)
    cp.screenshot(path=f'{SP}/shot-v2-client-en-dark.png', full_page=True)

    # ---- lock, unknown and malformed links
    cp.click('#btnClientLock'); cp.wait_for_selector('#clQ')
    r.check('Lock & close returns to the search page with no data shown', cp.locator('article.stage').count() == 0 and 'أحمد' not in cp.inner_text('#app'))
    cp.goto('about:blank'); cp.goto(f'{BASE}#client/DS-CL-9999'); cp.wait_for_selector('text=could not be found')
    r.check('unknown project -> clear not-found message', True)
    cp.goto('about:blank'); cp.goto(f'{BASE}#client/..%2Fsecret'); cp.wait_for_selector('text=Invalid link')
    r.check('malformed id rejected before any fetch', not [x for x in mock.reqlog if '..' in x[2] or '%2F' in x[2]])
    ctx.close()
