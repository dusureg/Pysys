"""Admin: first-run setup, vault, create a client + project with finance data, verify what reaches the repository."""
import re, json
from mockgh import TOKEN, BASE, PNG, ADMIN_URL
from lib import *


def run(S):
    r, mock = S.r, S.mock
    ctx, pg = new_page(S, 'admin', permissions=['clipboard-read', 'clipboard-write'])
    S.admin_ctx, S.admin = ctx, pg
    pg.goto(ADMIN_URL + '#dashboard'); pg.wait_for_selector('#btnSaveCfg')
    r.check('first run redirects #dashboard -> #config', pg.evaluate('location.hash') == '#config')
    r.check('admin nav hidden before setup', not pg.is_visible('#adminNav'))
    pg.fill('#cfgUser', 'abdo'); pg.fill('#cfgRepo', 'portal'); pg.fill('#cfgPat', TOKEN)
    pg.fill('#cfgPw', PW1); pg.fill('#cfgPw2', 'something else entirely'); pg.click('#btnSaveCfg')
    pg.wait_for_selector('form .msg:has-text("do not match")')
    r.check('mismatched passwords rejected', True)
    pg.fill('#cfgPw', 'short'); pg.fill('#cfgPw2', 'short'); pg.click('#btnSaveCfg')
    pg.wait_for_selector('form .msg:has-text("at least 10")')
    r.check('short admin password rejected', True)
    pg.fill('#cfgPw', PW1); pg.fill('#cfgPw2', PW1)
    pg.click('#btnTest'); pg.wait_for_selector('form .msg:has-text("Connected to abdo/portal")')
    r.check('test connection reports repo + vault status', 'No private vault yet' in pg.inner_text('form .msg'))
    pg.click('#btnSaveCfg'); pg.wait_for_selector('#btnNewClient', timeout=30000)
    cfg_raw = pg.evaluate("localStorage.getItem('dsp.config.v1')")
    r.check('PAT and password are not in localStorage in plaintext', TOKEN not in cfg_raw and PW1 not in cfg_raw and 'github_pat' not in cfg_raw)
    r.check('vault + settings written to data/private/', 'data/private/vault.json' in mock.files and 'data/private/settings.json' in mock.files)
    vault = json.loads(mock.text('data/private/vault.json'))
    r.check('vault holds a wrapped key only (salt/iv/ct)', set(vault) == {'v', 'salt', 'iv', 'ct'})
    # (a 3-letter code such as 'KIT' can occur by chance in ~16k characters of base64, so check the envelope and a long word instead)
    st = json.loads(mock.text('data/private/settings.json'))
    r.check('settings are encrypted (AES-GCM envelope only, no project type names in the clear)', set(st) == {'v', 'iv', 'ct'} and 'Kitchen' not in mock.text('data/private/settings.json') and '"types"' not in mock.text('data/private/settings.json'))
    r.check('empty dashboard message shown', 'No clients yet' in pg.inner_text('main'))

    # ---- new client
    pg.click('#btnNewClient'); pg.wait_for_selector('#edName')
    r.check('client ID generated before saving (DS-CL-1001)', 'DS-CL-1001' in pg.inner_text('main'))
    pg.fill('#edName', 'أحمد محمد'); pg.fill('#edPhone', '+20 100 123 4567'); pg.fill('#edEmail', 'ahmed@example.com')
    pg.fill('#edAddress', 'New Cairo, Egypt'); pg.fill('#edNotes', 'INTERNAL: prefers WhatsApp')
    pg.click('#btnShowKey'); S.secret = pg.input_value('#edSecret')
    r.check('client secret key pre-generated in expected format', re.fullmatch(r'[A-Z2-9]{4}(-[A-Z2-9]{4}){3}', S.secret), S.secret)
    pg.select_option('#newProjType', 'KIT'); pg.fill('#newProjTitle', 'Modern white kitchen'); pg.click('#btnAddProject')
    pg.wait_for_selector('#pjDesc')
    pg.fill('#pjDesc', 'Kitchen <img src=x onerror=window.__xss=1> & wardrobe'); pg.fill('#pjStart', day(-10)); pg.fill('#pjDue', day(20))

    pg.click('#tab-payments'); pg.fill('#pjPrice', '50000'); pg.click('#btnAddPayment')
    pg.locator('.rg input[type=number]').first.fill('20000'); pg.locator('.rg input[placeholder*="Note"]').first.fill('Deposit')
    r.check('payments tab: remaining balance computed (30,000)', money_in(pg.inner_text('main'), 30000))

    pg.click('#tab-costs')
    for _ in range(3): pg.click('#btnAddCost')
    rows = pg.locator('.rg')
    rows.nth(0).locator('input[type=number]').fill('18000')
    rows.nth(1).locator('select').nth(1).select_option('hardware'); rows.nth(1).locator('input[type=number]').fill('4000')
    rows.nth(2).locator('select').nth(0).select_option('opex'); rows.nth(2).locator('select').nth(1).select_option('labor'); rows.nth(2).locator('input[type=number]').fill('3000')
    txt = pg.inner_text('main')
    r.check('costs tab: COGS 22,000 / gross profit 28,000 / net 25,000', money_in(txt, 22000) and money_in(txt, 28000) and money_in(txt, 25000))
    r.check('costs tab: gross margin 56%, net margin 50%, markup 127.3%', '56%' in txt and '50%' in txt and '127.3%' in txt, txt[-600:])

    pg.click('#tab-parts'); pg.click('#btnAddPart'); pg.click('#btnAddPart')
    prow = pg.locator('.rg')
    prow.nth(0).locator('input').nth(0).fill('Base cabinets'); prow.nth(0).locator('input[type=number]').fill('6'); prow.nth(0).locator('select').select_option('completed')
    prow.nth(1).locator('input').nth(0).fill('Doors'); prow.nth(1).locator('input[type=number]').fill('12'); prow.nth(1).locator('input[type=date]').fill(day(5))

    pg.click('#tab-stages')
    for i in range(4): pg.locator('.editor-stage input[type=checkbox]').nth(i).check()
    r.check('stages tab: first stage auto-completed after ticking its 3 tasks', pg.locator('.editor-stage select').first.input_value() == 'completed')
    r.check('stages tab: progress shown', '%' in pg.inner_text('main'))

    pg.click('#tab-photos')
    r.check('photo upload disabled until the client is saved', pg.locator('#btnUpload').is_disabled())
    save(pg)
    S.cid = pg.evaluate('location.hash').split('/')[-1]
    r.check('saved: URL now #manage/DS-CL-1001', S.cid == 'DS-CL-1001', S.cid)
    cid = S.cid
    r.check('private record + client snapshot committed', f'data/private/{cid}.json' in mock.files and f'data/clients/{cid}.json' in mock.files)
    snap = json.loads(mock.text(f'data/clients/{cid}.json'))
    r.check('client file is {"payload": "U2FsdGVk..."} only', list(snap) == ['payload'] and snap['payload'].startswith('U2FsdGVk'))
    blob = ' '.join(mock.text(p) for p in mock.paths('data/'))
    leaks = [s for s in ['أحمد', '+20 100 123 4567', 'ahmed@', 'New Cairo', 'INTERNAL', 'Modern white', S.secret, 'Base cabinets', '18000'] if s in blob]
    r.check('no plaintext client data anywhere in the repository', not leaks, str(leaks))
    r.check('commit messages carry no client data', all('أحمد' not in c[2] and S.secret not in c[2] for c in mock.commits))
    r.check('settings counter persisted (SKU sequence bumped)', len([c for c in mock.commits if c[1].endswith('settings.json')]) >= 2)
