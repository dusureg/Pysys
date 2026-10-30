"""Quality audit of the screens and parts added in v4.5, with the same rules as s20_audit (names on every control, tap targets, contrast in both themes, no sideways scroll,
keyboard focus): Collections and its report, the import screens (empty and with a file loaded), the collection schedule card with rows, the WhatsApp and client-ID fields, the contract with the
instalments table, the share menu, Settings with cost categories, and the client site money card with the schedule. English and Arabic, dark and light, desktop and phone.
Needs the client and supplier made by s26."""
import os
from mockgh import BASE
from lib import *
from s20_audit import AUDIT_JS, FOCUS_JS, HARD, set_look

IMPDIR = os.path.join(SP, 'import')
CSV = 'name,code,category,unit,qty\nAudit board,AUD-1,board,sheet,5\nAudit screw,AUD-2,hardware,pcs,200\n'


def run(S):
    r, mock, pg = S.r, S.mock, S.admin
    col = S.col; cid, sku, sup = col['cid'], col['sku'], col['sup']
    findings = {}

    def record(key, res):
        for rule, items in res.items():
            findings.setdefault(rule, {}).setdefault(key, []).extend(items)

    os.makedirs(IMPDIR, exist_ok=True)
    csv_path = os.path.join(IMPDIR, 'audit.csv'); open(csv_path, 'w', encoding='utf-8').write(CSV)

    def go(h, sel):
        pg.evaluate(f'location.hash = "{h}"'); pg.wait_for_selector(sel, timeout=30000); pg.wait_for_timeout(300)

    # =============================================================== the admin screens
    for key, vp, lang, theme in (('admin|desktop|en|dark', (1280, 900), 'en', 'dark'), ('admin|desktop|en|light', (1280, 900), 'en', 'light'),
                                 ('admin|phone|en|dark', (360, 740), 'en', 'dark'), ('admin|phone|ar|dark', (360, 740), 'ar', 'dark'), ('admin|phone|ar|light', (360, 740), 'ar', 'light')):
        pg.set_viewport_size({'width': vp[0], 'height': vp[1]}); set_look(pg, lang, theme); phone = vp[0] < 700
        opt = {'phone': phone}

        def look(name):
            record(f'{key}|{name}', pg.evaluate(AUDIT_JS, opt))

        go('#collections', '#colScreen'); look('collections')
        pg.select_option('#colFilter', 'overdue'); pg.wait_for_timeout(200); look('collections-overdue'); pg.select_option('#colFilter', 'open')
        go('#reports/collections', '#rpPaper'); look('report-collections')
        pg.click('#btnRpShare'); pg.wait_for_selector('#btnRpShareMenu'); pg.wait_for_timeout(200); look('share-menu'); pg.keyboard.press('Escape')
        go('#import', '#impPick-inventory'); look('import-pick')
        go('#import/inventory', '#impFile'); look('import-inventory')
        pg.set_input_files('#impFile', csv_path); pg.wait_for_selector('#impPreview', timeout=20000); pg.wait_for_timeout(300); look('import-preview')
        go(f'#manage/{cid}', '#pjSkuRef'); look('editor-details')
        pg.click('#tab-payments'); pg.wait_for_selector('#schList .rg', timeout=20000); pg.wait_for_timeout(250); look('editor-payments-schedule')
        pg.evaluate("() => { window.__schBadge = document.querySelector('#schList .sch-st .badge'); }")
        go(f'#progress/{cid}/0', '#btnWaUpdate'); look('progress-project')
        go(f'#contract/{cid}/0', '#ctPaper'); look('contract-schedule')
        go(f'#suppliers/{sup}', '#supWhatsapp'); look('supplier-whatsapp')
        pg.click('#btnShare'); pg.wait_for_selector('#btnShareMenu'); pg.wait_for_timeout(200); look('record-share-menu'); pg.keyboard.press('Escape')
        go('#dashboard', '#btnNewClient'); go('#settings', '#costCatsCard')
        pg.click('#ccAdd-direct'); pg.wait_for_selector('#ccEn-direct-0'); pg.click('#ccAdd-indirect'); pg.wait_for_selector('#ccEn-indirect-0'); pg.wait_for_timeout(200); look('settings-cost-categories')
        go('#dashboard', '#btnNewClient')                                       # the unsaved rows are dropped
        if key == 'admin|desktop|en|dark':                                      # keyboard: every stop of the first tab presses shows where the focus is
            for name, h, sel in (('collections', '#collections', '#colScreen'), ('import-inventory', '#import/inventory', '#impFile'), ('editor-payments', f'#manage/{cid}', '#pjSkuRef')):
                go(h, sel)
                if name == 'editor-payments':
                    pg.click('#tab-payments'); pg.wait_for_selector('#schList .rg')
                pg.evaluate('document.activeElement && document.activeElement.blur()'); pg.evaluate('window.scrollTo(0, 0)'); bad = []
                for _ in range(14):
                    pg.keyboard.press('Tab'); pg.wait_for_timeout(150); f = pg.evaluate(FOCUS_JS)
                    if f and not f['ring']:
                        bad.append(f['name'])
                record(f'{key}|{name}', {'focus-ring-missing': bad} if bad else {})
    pg.set_viewport_size({'width': 1280, 'height': 900}); set_look(pg, 'en', 'dark'); go('#dashboard', '#btnNewClient')

    # =============================================================== the client site: money card with the schedule
    for key, vp, lang, theme in (('client|desktop|en|light', (1280, 900), 'en', 'light'), ('client|phone|en|dark', (360, 740), 'en', 'dark'), ('client|phone|ar|dark', (360, 740), 'ar', 'dark'), ('client|phone|ar|light', (360, 740), 'ar', 'light')):
        phone = vp[0] < 700
        ctx = S.browser.new_context(viewport={'width': vp[0], 'height': vp[1]}, is_mobile=phone, has_touch=phone); ctx.route('**/*', mock.handler('audit-client-coll'))
        cp = ctx.new_page(); cp.on('pageerror', lambda e: S.errors.append(('audit-client-coll', 'pageerror', str(e))))
        cp.add_init_script(f"try{{localStorage.setItem('dsp.lang','{lang}');localStorage.setItem('dsp.theme','{theme}')}}catch(e){{}}")
        cp.goto(f'{BASE}#client/{cid}'); cp.wait_for_selector('#clKey'); cp.fill('#clKey', col['secret']); cp.click('#btnOpen'); cp.wait_for_selector('#nextPay', timeout=40000); cp.wait_for_timeout(400)
        record(key + '|portal-schedule', cp.evaluate(AUDIT_JS, {'phone': phone}))
        ctx.close()

    # =============================================================== verdict
    for rule in HARD:
        places = findings.get(rule, {})
        r.check(f'v4.5 screens audit [{rule}]: none ({sum(len(v) for v in places.values())} found)', not places, '; '.join(f'{k}: {v[:3]}' for k, v in list(places.items())[:4]))
    soft = {k: sum(len(v) for v in d.values()) for k, d in findings.items() if k not in HARD}
    print('  softer findings:', soft or 'none')
