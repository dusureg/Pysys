"""Quality audit of the screens and parts added in v4.6, with the same rules as s20_audit (names on every control, tap targets, contrast in both themes, no sideways scroll,
keyboard focus): Contracting, the contract (wording, own wording open, formal copy), Labels (square, with QR code and barcode, strip), the Company overview and Contracts reports,
Settings (contract templates, labels, brands), the inventory item and shipment forms with their picture and files cards, and on the client site the down-payment box, the photo / video viewer
and the downloads. English and Arabic, dark and light, desktop and phone.
Needs s29 to s34 (the client with videos and downloads, and the client of s34 with a down payment)."""
from mockgh import BASE
from lib import *
from s20_audit import AUDIT_JS, FOCUS_JS, HARD, set_look


def run(S):
    r, mock, pg, cid = S.r, S.mock, S.admin, S.cid
    ad = S.addons
    findings = {}
    on_dialog = lambda d: d.accept()                              # the contract's "remove own wording" and leaving a screen with changes both ask first
    pg.on('dialog', on_dialog)

    def record(key, res):
        for rule, items in res.items():
            findings.setdefault(rule, {}).setdefault(key, []).extend(items)

    def go(h, sel):
        pg.evaluate(f'location.hash = "{h}"'); pg.wait_for_selector(sel, timeout=30000); pg.wait_for_timeout(300)

    # =============================================================== the admin screens
    for key, vp, lang, theme in (('admin|desktop|en|dark', (1280, 900), 'en', 'dark'), ('admin|desktop|en|light', (1280, 900), 'en', 'light'),
                                 ('admin|phone|en|dark', (360, 740), 'en', 'dark'), ('admin|phone|ar|dark', (360, 740), 'ar', 'dark'), ('admin|phone|ar|light', (360, 740), 'ar', 'light')):
        pg.set_viewport_size({'width': vp[0], 'height': vp[1]}); set_look(pg, lang, theme); phone = vp[0] < 700
        opt = {'phone': phone}

        def look(name):
            record(f'{key}|{name}', pg.evaluate(AUDIT_JS, opt))

        go('#contracting', '#ctrList table'); look('contracting')
        pg.select_option('#ctrFilter', 'issued'); pg.wait_for_timeout(200); look('contracting-filtered'); pg.select_option('#ctrFilter', 'all')
        go(f'#contract/{cid}/0', '#ctPaper'); look('contract')
        pg.select_option('#ctWording', '@own'); pg.wait_for_selector('#ctOwnBox:not([hidden])'); pg.wait_for_timeout(200); look('contract-own-wording')
        pg.click('#btnOwnClear'); pg.check('#ctFormal'); pg.wait_for_timeout(200); look('contract-formal'); pg.uncheck('#ctFormal')
        go(f'#labels/{cid}/0', '#lblSheet .lbl'); look('labels')
        pg.check('#lblF-qr'); pg.check('#lblF-barcode'); pg.select_option('#lblScope', 'pieces'); pg.wait_for_timeout(300); look('labels-codes-pieces')
        pg.select_option('#lblSize', 'strip'); pg.wait_for_timeout(300); look('labels-strip')
        pg.select_option('#lblSize', 'sq'); pg.select_option('#lblScope', 'project'); pg.uncheck('#lblF-qr'); pg.uncheck('#lblF-barcode')
        go('#reports/overview', '#rpPaper'); pg.wait_for_function("() => document.querySelector('#rpPaper').innerText.includes('Contract value') || document.querySelector('#rpPaper').innerText.includes('قيمة التعاقدات')", timeout=30000); look('report-overview')
        go('#reports/contracts', '#rpPaper'); look('report-contracts')
        go('#settings', '#contractCard'); pg.click('#btnTplAdd'); pg.wait_for_selector('#ctTplNameAr0'); pg.wait_for_timeout(200); look('settings-contract-templates-labels-brands')
        go('#dashboard', '#btnNewClient')                                        # the unsaved template is dropped
        go('#inventory/new', '#invImageCard'); look('inventory-new-picture')
        go('#logistics/new', '#lgFiles'); look('shipment-new-files')
        go('#dashboard', '#btnNewClient'); look('dashboard-overview-button')
        if key == 'admin|desktop|en|dark':                                       # keyboard: every stop of the first tab presses shows where the focus is
            for name, h, sel in (('contracting', '#contracting', '#ctrScreen'), ('contract', f'#contract/{cid}/0', '#ctOptions'), ('labels', f'#labels/{cid}/0', '#lblOptions')):
                go(h, sel)
                pg.evaluate('document.activeElement && document.activeElement.blur()'); pg.evaluate('window.scrollTo(0, 0)'); bad = []
                for _ in range(16):
                    pg.keyboard.press('Tab'); pg.wait_for_timeout(150); f = pg.evaluate(FOCUS_JS)
                    if f and not f['ring']:
                        bad.append(f['name'])
                record(f'{key}|{name}', {'focus-ring-missing': bad} if bad else {})
    pg.set_viewport_size({'width': 1280, 'height': 900}); set_look(pg, 'en', 'dark'); go('#dashboard', '#btnNewClient')

    # =============================================================== the client site: down payment, viewer, downloads
    for key, vp, lang, theme in (('client|desktop|en|light', (1280, 900), 'en', 'light'), ('client|phone|en|dark', (360, 740), 'en', 'dark'), ('client|phone|ar|dark', (360, 740), 'ar', 'dark'), ('client|phone|ar|light', (360, 740), 'ar', 'light')):
        phone = vp[0] < 700
        for what, cc, sec, sel in (('downpayment', ad['cid'], ad['secret'], '#schedBlock'), ('media', cid, S.secret, '#photosCard .ph')):
            ctx = S.browser.new_context(viewport={'width': vp[0], 'height': vp[1]}, is_mobile=phone, has_touch=phone); ctx.route('**/*', mock.handler('audit-client-46'))
            cp = ctx.new_page(); cp.on('pageerror', lambda e: S.errors.append(('audit-client-46', 'pageerror', str(e))))
            cp.add_init_script(f"try{{localStorage.setItem('dsp.lang','{lang}');localStorage.setItem('dsp.theme','{theme}')}}catch(e){{}}")
            cp.goto(f'{BASE}#client/{cc}'); cp.wait_for_selector('#clKey'); cp.fill('#clKey', sec); cp.click('#btnOpen'); cp.wait_for_selector('#tapeBig', timeout=40000); cp.wait_for_selector(sel, timeout=30000); cp.wait_for_timeout(500)
            record(f'{key}|portal-{what}', cp.evaluate(AUDIT_JS, {'phone': phone}))
            if what == 'media':
                cp.locator('#photosCard .ph .imgbtn').first.click(); cp.wait_for_selector('dialog.lb[open]', timeout=20000); cp.wait_for_timeout(500)
                record(f'{key}|viewer', cp.evaluate(AUDIT_JS, {'phone': phone}))
            ctx.close()

    pg.remove_listener('dialog', on_dialog)

    # =============================================================== verdict
    for rule in HARD:
        places = findings.get(rule, {})
        r.check(f'v4.6 screens audit [{rule}]: none ({sum(len(v) for v in places.values())} found)', not places, '; '.join(f'{k}: {v[:3]}' for k, v in list(places.items())[:4]))
    soft = {k: sum(len(v) for v in d.values()) for k, d in findings.items() if k not in HARD}
    print('  softer findings:', soft or 'none')
