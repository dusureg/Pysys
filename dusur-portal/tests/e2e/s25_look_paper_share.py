"""Admin: Settings > Look and print (English and Arabic font, accent colour kept readable in both themes, published for the client site too), paper size (real PDFs come out A4 /
Letter / Legal and no report overflows its page), the settings file (export, edit, load, nothing secret, a bad file is refused), the report as a PNG picture, and the Share
button on reports and records (WhatsApp, e-mail, copy, the device share sheet, a picture)."""
import json, os, re, subprocess
from mockgh import BASE
from lib import *

OUT = f'{SP}/out'
os.makedirs(OUT, exist_ok=True)


def pdf_size(pg, name):
    path = f'{OUT}/{name}.pdf'
    pg.pdf(path=path, prefer_css_page_size=True, print_background=True)
    info = subprocess.run(['pdfinfo', path], capture_output=True, text=True).stdout
    w, h = map(float, re.search(r'Page size:\s+([\d.]+) x ([\d.]+)', info).groups())
    return round(w), round(h), int(re.search(r'Pages:\s+(\d+)', info).group(1))


def to_settings(pg):
    pg.evaluate("location.hash = '#settings'"); pg.wait_for_selector('#lookCard', timeout=30000)


def save_settings(pg):
    try: pg.wait_for_selector('.toast', state='detached', timeout=8000)          # the toast of an earlier save must be gone, or it would answer for this one
    except Exception: pass
    pg.click('#btnSaveSettings'); toast_text(pg, 'Settings saved', 30000); pg.wait_for_selector('#lookCard')


def contrast(pg, fg, bg):
    return pg.evaluate("([a, b]) => lkContrast(lkRgb(a), lkRgb(b))", [fg, bg])


def overflow(pg, w):
    """Elements of the open report sheet whose right edge is beyond the sheet's (in the print layout, at the width of the printable area)."""
    return pg.evaluate("""() => { const p = document.querySelector('#rpPaper'), pr = p.getBoundingClientRect(), bad = [];
      for (const e of p.querySelectorAll('*')) { const r = e.getBoundingClientRect(); if (r.width && r.right > pr.right + 1.5 && getComputedStyle(e).position !== 'fixed') bad.push(e.tagName + '.' + e.className + ' ' + Math.round(r.right - pr.right)); }
      return { sheet: Math.round(pr.width), scroll: p.scrollWidth - p.clientWidth, bad: bad.slice(0, 5) }; }""")


def run(S):
    r, mock, pg = S.r, S.mock, S.admin
    n0 = len(S.errors)
    pg.set_viewport_size({'width': 1280, 'height': 900})
    pg.context.grant_permissions(['clipboard-read', 'clipboard-write'])
    dialogs = []
    on_dialog = lambda d: (dialogs.append(d.message), d.accept())
    pg.on('dialog', on_dialog)

    # ================= fonts and accent colour =================
    to_settings(pg)
    r.check('Settings has a "Look and print" card with the two fonts, the accent colour and the paper size',
            all(pg.locator(s).count() == 1 for s in ('#lookEn', '#lookAr', '#lookAccent', '#lookAccentHex', '#setPaper')) and pg.input_value('#lookEn') == 'plex' and pg.input_value('#lookAr') == 'plex' and pg.input_value('#setPaper') == 'A4')
    r.check('the fonts on offer are short lists of Google fonts plus the device font', pg.locator('#lookEn option').count() == 7 and pg.locator('#lookAr option').count() == 8 and 'Cairo' in pg.inner_text('#lookAr'))
    r.check('the site uses Google Fonts, so no "own fonts" warning is shown', pg.locator('#lookNoGoogle').count() == 0 and pg.evaluate("document.documentElement.dataset.fonts") == 'google')
    pg.select_option('#lookEn', 'inter'); pg.select_option('#lookAr', 'cairo')
    r.check('the sample text follows the choice at once', 'Inter' in pg.evaluate("getComputedStyle(document.querySelector('#lookSampleEn')).fontFamily") and 'Cairo' in pg.evaluate("getComputedStyle(document.querySelector('#lookSampleAr')).fontFamily"))
    r.check('the chosen font files are requested from Google Fonts for the preview', 'family=Inter' in (pg.get_attribute('#dsLookPrev', 'href') or '') and 'family=Cairo' in (pg.get_attribute('#dsLookPrev', 'href') or ''))
    pg.fill('#lookAccentHex', '#ffee00')                                          # a yellow: unreadable as text on white if used as it is
    r.check('a pale accent is adjusted per theme and the swatches say so', 'adjusted' in pg.inner_text('#lookSwatches') and pg.locator('#lookSwatches [data-theme-sample]').count() == 2)
    pg.fill('#lookAccentHex', '#12'); pg.click('#btnSaveSettings')
    pg.wait_for_selector('.msg.bad:has-text("accent colour")', timeout=10000)
    r.check('a colour that is not #rrggbb is refused with a message and nothing is saved', pg.get_attribute('#lookAccentHex', 'aria-invalid') == 'true')
    pg.fill('#lookAccentHex', '#ffee00'); save_settings(pg)
    look = pg.evaluate("() => JSON.parse(JSON.stringify(brand.look))")
    r.check('saved: the look is part of the company profile (brand)', look == {'fontEn': 'inter', 'fontAr': 'cairo', 'accent': '#ffee00'}, str(look))
    pub = json.loads(mock.text('data/public/brand.json'))
    r.check('and it is published in brand.json (public) with nothing but those three values', pub['look'] == {'fontEn': 'inter', 'fontAr': 'cairo', 'accent': '#ffee00'})
    css = pg.evaluate("document.getElementById('dsLook').textContent")
    r.check('the admin site applies it: font stacks start with Inter / Cairo, accent variables are set for both themes', '"Inter"' in css and '"Cairo"' in css and '[data-theme=light]{--accent:' in css and '--btn-1:' in css, css[:300])
    r.check('the Google Fonts file for the choice is loaded without blocking the first paint', 'family=Inter:wght@400;700' in pg.get_attribute('#dsLookFont', 'href') and 'family=Cairo' in pg.get_attribute('#dsLookFont', 'href'))
    c = pg.evaluate("() => lookColors('#ffee00')")
    r.check('yellow text on the dark surface and on the light surface both keep a contrast of at least 4.5 : 1', contrast(pg, c['dark'], '#1e293b') >= 4.5 and contrast(pg, c['light'], '#e2e8f0') >= 4.5, str(c))
    r.check('the main button keeps white text readable on it (4.5 : 1)', contrast(pg, c['btn'], '#ffffff') >= 4.5 and contrast(pg, c['btnDark'], '#ffffff') >= 4.5, str(c))
    for acc in ('#000000', '#ffffff', '#0000ff', '#ff0000', '#808080'):
        c2 = pg.evaluate("(a) => lookColors(a)", acc)
        r.check(f'accent {acc}: still readable in both themes and on the button', contrast(pg, c2['dark'], '#1e293b') >= 4.5 and contrast(pg, c2['light'], '#e2e8f0') >= 4.5 and contrast(pg, c2['btn'], '#ffffff') >= 4.5, str(c2))
    live = pg.evaluate("() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()")
    r.check('the live accent of the page is the dark-theme colour computed for it', live == c['dark'], live)
    pg.click('#btnTheme'); pg.wait_for_function("() => document.documentElement.dataset.theme === 'light'")
    live2 = pg.evaluate("() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()")
    r.check('switching to the light theme gives the light-theme colour', live2 == c['light'], live2)
    pg.click('#btnTheme'); pg.wait_for_function("() => document.documentElement.dataset.theme === 'dark'")
    pg.screenshot(path=f'{SP}/shot-look-card.png', full_page=False)

    # ---- the client site shows the same look
    ctx, cp = new_page(S, 'client-look')
    cp.goto(f'{BASE}#client/{S.cid}'); cp.wait_for_selector('#clKey')
    cp.wait_for_function("() => { const s = document.getElementById('dsLook'); return !!s && s.textContent.includes('--accent'); }", timeout=20000)
    r.check('the client page applies the published look (Inter / Cairo, accent)', '"Inter"' in cp.evaluate("document.getElementById('dsLook').textContent") and 'family=Cairo' in (cp.get_attribute('#dsLookFont', 'href') or ''))
    ctx.close()
    pg.click('#lookAccentClear'); pg.select_option('#lookEn', 'plex'); pg.select_option('#lookAr', 'plex'); save_settings(pg)
    r.check('"Use the standard colour" and the standard fonts remove the look again (nothing left in brand.json to apply)', json.loads(mock.text('data/public/brand.json'))['look'] == {'fontEn': 'plex', 'fontAr': 'plex', 'accent': ''} and pg.evaluate("document.getElementById('dsLook').textContent") == '' and pg.locator('#dsLookFont').count() == 0)

    # ================= the settings file =================
    with pg.expect_download() as dl:
        pg.click('#btnCfgExport')
    orig_path = f'{OUT}/settings-orig.json'; dl.value.save_as(orig_path)
    orig = json.load(open(orig_path, encoding='utf-8'))
    text = open(orig_path, encoding='utf-8').read()
    r.check('the settings file is JSON of kind dusur-settings with the profile, business defaults, contract, codes, look and paper', orig['kind'] == 'dusur-settings' and orig['v'] == 1 and {'profile', 'business', 'contract', 'codes', 'look', 'paper'} <= set(orig['settings']), str(list(orig['settings'])))
    r.check('it holds no password, token, key, inbox key or project types', not [s for s in ('TESTTOKEN', 'github_pat', 'inboxKey', 'types', PW1, 'password', 'token') if s in text] and orig['settings']['profile']['inbox'] == '', text[:200])
    mod = json.loads(text)
    mod['settings']['business'].update({'currency': 'USD', 'prefix': 'ZZ', 'defaultDays': 45}); mod['settings']['profile']['name'] = {'en': 'Loaded Co', 'ar': 'شركة محملة'}
    mod['settings']['look'] = {'fontEn': 'lato', 'fontAr': 'tajawal', 'accent': '#aa3300'}; mod['settings']['paper'] = 'Legal'; mod['settings']['codes']['inventory'] = 'LD-{N:3}'
    mod['settings'].update({'inboxKey': 'SECRETKEY123456', 'token': 'github_pat_EVIL', 'types': [{'code': 'EVL'}]}); mod['settings']['profile'].update({'inbox': 'https://script.google.com/macros/s/EVILEVILEVIL/exec', 'look': {'accent': '#000000'}})
    mod_path = f'{OUT}/settings-mod.json'; json.dump(mod, open(mod_path, 'w', encoding='utf-8'))
    pg.set_input_files('#cfgFile', mod_path); pg.wait_for_selector('#cfgMsg.ok', timeout=10000)
    r.check('loading the file fills the form and says which sections it brought', 'Loaded 7 sections' in pg.inner_text('#cfgMsg') and 'company profile' in pg.inner_text('#cfgMsg') and 'labels' in pg.inner_text('#cfgMsg'), pg.inner_text('#cfgMsg'))
    r.check('the fields show the file\'s values (currency, prefix, days, name, codes, look, paper)', pg.input_value('#setCur') == 'USD' and pg.input_value('#setPrefix') == 'ZZ' and pg.input_value('#setDays') == '45' and pg.input_value('#codePat-inventory') == 'LD-{N:3}'
            and pg.input_value('#lookEn') == 'lato' and pg.input_value('#lookAr') == 'tajawal' and pg.input_value('#lookAccentHex') == '#aa3300' and pg.input_value('#setPaper') == 'Legal')
    r.check('nothing is saved until Save: the stored settings are still the old ones', pg.evaluate("() => session.settings.currency") == 'EGP' and pg.evaluate("() => session.settings.paper") == 'A4')
    r.check('what must not travel stays out: the inbox address and key, tokens and project types were ignored', pg.input_value('#setInboxKey') != 'SECRETKEY123456' and pg.input_value('#setInbox') == '' and pg.evaluate("() => draftTypes.length") == 8 and 'EVIL' not in pg.inner_text('#lookCard'))
    save_settings(pg)
    st = pg.evaluate("() => ({ cur: session.settings.currency, paper: session.settings.paper, name: brand.name.en, inboxKey: session.settings.inboxKey, inbox: brand.inbox, types: session.settings.types.length })")
    r.check('after Save the file\'s settings are in force', st['cur'] == 'USD' and st['paper'] == 'Legal' and st['name'] == 'Loaded Co' and st['inbox'] == '' and st['types'] == 8 and 'EVIL' not in json.dumps(st), str(st))
    # ---- a bad file
    for name, data, expect in (('x.json', b'{"a": 1}', 'not a Dusur settings file'), ('y.json', b'not json', 'not a Dusur settings file'), ('z.json', json.dumps({'kind': 'dusur-settings', 'v': 9, 'settings': {}}).encode(), 'newer version'),
                               ('w.json', json.dumps({'kind': 'dusur-settings', 'v': 1, 'settings': {}}).encode(), 'nothing that can be loaded')):
        pg.set_input_files('#cfgFile', {'name': name, 'mimeType': 'application/json', 'buffer': data}); pg.wait_for_selector('#cfgMsg.bad', timeout=10000)
        r.check(f'{name}: refused with a plain message', expect in pg.inner_text('#cfgMsg'), pg.inner_text('#cfgMsg'))
        pg.evaluate("() => { const m = document.querySelector('#cfgMsg'); m.className = 'small'; m.textContent = ''; }")

    # ================= paper: real PDFs =================
    pg.evaluate("location.hash = '#reports/reorder'"); pg.wait_for_selector('#rpPaper', timeout=30000)
    r.check('the sheet on screen has the width of the chosen paper (Legal 8.5 in = 816 px)', abs(pg.evaluate("document.querySelector('#rpPaper').getBoundingClientRect().width") - 816) <= 1)
    w, h, n = pdf_size(pg, 'legal'); r.check('the PDF of a portrait report is Legal: 612 x 1008 pt', (w, h) == (612, 1008), f'{w}x{h}')
    to_settings(pg); pg.select_option('#setPaper', 'Letter'); save_settings(pg)
    pg.evaluate("location.hash = '#reports/reorder'"); pg.wait_for_selector('#rpPaper', timeout=30000)
    w, h, n = pdf_size(pg, 'letter'); r.check('with Letter selected the PDF is 612 x 792 pt', (w, h) == (612, 792), f'{w}x{h}')
    pg.select_option('#rpType', 'costs'); pg.wait_for_selector('#rpPaper.land', timeout=30000)
    w, h, n = pdf_size(pg, 'letter-land'); r.check('a landscape report (costs) is Letter landscape: 792 x 612 pt', (w, h) == (792, 612), f'{w}x{h}')
    to_settings(pg); pg.select_option('#setPaper', 'A4'); save_settings(pg)
    pg.evaluate("location.hash = '#reports/reorder'"); pg.wait_for_selector('#rpPaper', timeout=30000)
    w, h, n = pdf_size(pg, 'a4'); r.check('back to A4: 595 x 842 pt', (w, h) == (595, 842), f'{w}x{h}')
    to_settings(pg); pg.select_option('#setPaper', 'A3'); save_settings(pg)
    pg.evaluate("location.hash = '#reports/reorder'"); pg.wait_for_selector('#rpPaper', timeout=30000)
    w, h, n = pdf_size(pg, 'a3'); r.check('A3: 842 x 1191 pt', (w, h) == (842, 1191), f'{w}x{h}')
    to_settings(pg); pg.select_option('#setPaper', 'A4'); save_settings(pg)

    # ---- contract: its own page rule follows the paper too
    pg.evaluate(f"location.hash = '#contract/{S.cid}'"); pg.wait_for_selector('#ctPaper', timeout=30000)
    w, h, n = pdf_size(pg, 'contract-a4'); r.check('the contract PDF is A4 (its @page rule carries the chosen paper)', (w, h) == (595, 842), f'{w}x{h}')
    to_settings(pg); pg.select_option('#setPaper', 'Letter'); save_settings(pg)
    pg.evaluate(f"location.hash = '#contract/{S.cid}'"); pg.wait_for_selector('#ctPaper', timeout=30000)
    w, h, n = pdf_size(pg, 'contract-letter'); r.check('and Letter when Letter is chosen', (w, h) == (612, 792), f'{w}x{h}')

    # ---- no report is wider than its page, on any paper
    pg.evaluate("location.hash = '#reports/inventory'"); pg.wait_for_selector('#rpPaper', timeout=30000)
    types = pg.eval_on_selector_all('#rpType option', 'o => o.map(x => x.value)')
    for paper, wmm in (('Letter', 215.9), ('A4', 210), ('Legal', 215.9)):
        pg.evaluate("(p) => { applyPaper(p); }", paper)
        for ty in types:
            pg.select_option('#rpType', ty); pg.wait_for_selector('#rpPaper', timeout=30000); pg.wait_for_timeout(150)
            land = pg.evaluate("document.querySelector('#rpPaper').classList.contains('land')")
            usable = (297 if paper == 'A4' else 279.4 if paper == 'Letter' else 355.6) - 20 if land else wmm - 24
            pg.set_viewport_size({'width': round(usable * 96 / 25.4), 'height': 900}); pg.emulate_media(media='print')
            o = overflow(pg, usable)
            r.check(f'{paper} / {ty}{" (landscape)" if land else ""}: nothing sticks out of the printable width', o['scroll'] <= 1 and not o['bad'], str(o))
            pg.emulate_media(media='screen'); pg.set_viewport_size({'width': 1280, 'height': 900})
    to_settings(pg); pg.select_option('#setPaper', 'A4'); save_settings(pg)

    # ================= the report as a picture =================
    pg.evaluate("location.hash = '#reports/reorder'"); pg.wait_for_selector('#rpPaper', timeout=30000)
    with pg.expect_download(timeout=60000) as dl:
        pg.click('#btnRpPng')
    png = f'{OUT}/report.png'; dl.value.save_as(png)
    data = open(png, 'rb').read()
    wpx, hpx = int.from_bytes(data[16:20], 'big'), int.from_bytes(data[20:24], 'big')
    r.check('the picture is a real PNG named after the report', data[:8] == b'\x89PNG\r\n\x1a\n' and dl.value.suggested_filename.endswith('.png') , dl.value.suggested_filename)
    r.check('it is the width of an A4 sheet at 2x (794 px -> 1588 px) and as tall as the report needs', wpx == 1588 and 600 < hpx < 12000, f'{wpx}x{hpx}')
    from PIL import Image
    im = Image.open(png).convert('RGB'); cols = im.getcolors(maxcolors=1 << 20) or []
    px = im.load(); top_ink = any(px[x, y] != (255, 255, 255) for x in range(0, wpx, 7) for y in range(0, 90, 3)); bottom_blank = all(px[x, hpx - 4] == (255, 255, 255) for x in range(0, wpx, 9))
    r.check('the picture is not blank: the head (logo, band) and the tables are drawn, with many colours', top_ink and len(cols) > 12, f'{len(cols)} colours')
    r.check('the empty end of the sheet is cut off (a small margin only)', bottom_blank)
    im.save(f'{SP}/shot-report-png.png')

    # ================= share: reports =================
    pg.evaluate("() => { window.__shared = []; Object.defineProperty(navigator, 'share', { configurable: true, value: async (d) => { window.__shared.push({ title: d.title, text: d.text, files: (d.files || []).map((f) => ({ name: f.name, type: f.type, size: f.size })) }); } }); Object.defineProperty(navigator, 'canShare', { configurable: true, value: (d) => !!(d && d.files) }); }")
    pg.click('#btnRpShare'); pg.wait_for_selector('#btnRpShareMenu')
    kinds = pg.eval_on_selector_all('#btnRpShareMenu [data-share]', 'els => els.map(e => e.dataset.share)')
    r.check('Share on a report offers the device share sheet, a picture, WhatsApp, e-mail and copy', kinds == ['device', 'picture', 'whatsapp', 'email', 'copy'], str(kinds))
    r.check('the menu is a proper menu: the button says it is expanded, the first item has focus, every item is at least 44 px tall',
            pg.get_attribute('#btnRpShare', 'aria-expanded') == 'true' and pg.evaluate("document.activeElement.dataset.share") == 'device' and all(b['height'] >= 44 for b in [e.bounding_box() for e in pg.locator('#btnRpShareMenu [role=menuitem]').all()]))
    wa = pg.get_attribute('#btnRpShareMenu [data-share=whatsapp]', 'href'); em = pg.get_attribute('#btnRpShareMenu [data-share=email]', 'href')
    from urllib.parse import unquote
    r.check('the WhatsApp link carries the report text (title and the company)', wa.startswith('https://wa.me/?text=') and 'Reorder' in unquote(wa) and '— ' in unquote(wa), unquote(wa)[:200])
    r.check('the e-mail link has a subject and the same text', em.startswith('mailto:?subject=') and '&body=' in em)
    pg.click('#btnRpShareMenu [data-share=copy]'); toast_text(pg, 'Copied')
    clip = pg.evaluate("navigator.clipboard.readText()")
    r.check('Copy puts the text of the report on the clipboard', 'Reorder' in clip and '—' in clip, clip[:200])
    r.check('the menu closes after an action', pg.locator('#btnRpShareMenu').count() == 0 and pg.get_attribute('#btnRpShare', 'aria-expanded') == 'false')
    pg.click('#btnRpShare'); pg.click('#btnRpShareMenu [data-share=device]'); pg.wait_for_function("() => window.__shared.length === 1")
    sh = pg.evaluate("window.__shared[0]")
    r.check('the device share sheet receives the title and the text', 'Reorder' in sh['title'] and sh['text'].startswith(sh['title']) and not sh['files'], str(sh)[:200])
    pg.click('#btnRpShare'); pg.click('#btnRpShareMenu [data-share=picture]'); pg.wait_for_function("() => window.__shared.length === 2", timeout=60000)
    sh = pg.evaluate("window.__shared[1]")
    r.check('"Share as a picture" hands the device a PNG file made from the report', len(sh['files']) == 1 and sh['files'][0]['type'] == 'image/png' and sh['files'][0]['name'].endswith('.png') and sh['files'][0]['size'] > 5000, str(sh)[:300])
    pg.click('#btnRpShare'); pg.wait_for_selector('#btnRpShareMenu'); pg.keyboard.press('Escape')
    r.check('Escape closes the menu and returns focus to the button', pg.locator('#btnRpShareMenu').count() == 0 and pg.evaluate("document.activeElement.id") == 'btnRpShare')
    pg.click('#btnRpShare'); pg.wait_for_selector('#btnRpShareMenu'); pg.mouse.click(5, 5)
    r.check('a click elsewhere closes it too', pg.locator('#btnRpShareMenu').count() == 0)
    pg.evaluate("() => { delete navigator.share; delete navigator.canShare; }")
    pg.click('#btnRpShare'); pg.wait_for_selector('#btnRpShareMenu')
    r.check('on a device without a share sheet the menu has only picture, WhatsApp, e-mail and copy', pg.eval_on_selector_all('#btnRpShareMenu [data-share]', 'els => els.map(e => e.dataset.share)') == ['picture', 'whatsapp', 'email', 'copy'])
    with pg.expect_download(timeout=60000) as dl2:
        pg.click('#btnRpShareMenu [data-share=picture]')
    r.check('"picture" then saves the PNG to the downloads', dl2.value.suggested_filename.endswith('.png'))

    # ================= share: records =================
    def first_id(kind, hash_, js="(x) => true"):
        pg.evaluate(f"location.hash = '#{hash_}'"); pg.wait_for_function(f"() => !!(ops.{kind} && ops.{kind}.data)", timeout=30000)
        return pg.evaluate(f"() => (opsList('{kind}').find({js}) || {{}}).id || ''")
    inv_id = first_id('inventory', 'inventory')
    pg.evaluate(f"location.hash = '#inventory/{inv_id}'"); pg.wait_for_selector('#btnShare', timeout=30000)
    pg.click('#btnShare'); pg.click('#btnShareMenu [data-share=copy]'); toast_text(pg, 'Copied')
    clip = pg.evaluate("navigator.clipboard.readText()"); name = pg.evaluate(f"opsFind('inventory', '{inv_id}').name")
    r.check('an inventory item is shared as its name, then its code, stock and place, then the company', clip.splitlines()[0] == name and 'in stock' in clip and clip.rstrip().splitlines()[-1].startswith('— '), clip)
    pg.evaluate("location.hash = '#inventory/new'"); pg.wait_for_selector('#invName')
    r.check('a new, unsaved record has no Share button', pg.locator('#btnShare').count() == 0)
    sup_id = first_id('suppliers', 'suppliers', "(x) => x.phone")
    pg.evaluate(f"location.hash = '#suppliers/{sup_id}'"); pg.wait_for_selector('#btnShare', timeout=30000)
    pg.click('#btnShare'); pg.click('#btnShareMenu [data-share=copy]'); toast_text(pg, 'Copied')
    clip = pg.evaluate("navigator.clipboard.readText()"); sp = pg.evaluate(f"opsFind('suppliers', '{sup_id}').phone")
    r.check('a supplier is shared with its phone number', sp in clip and 'hone' in clip, clip)
    lg_id = first_id('logistics', 'logistics')
    pg.evaluate(f"location.hash = '#logistics/{lg_id}'"); pg.wait_for_selector('#btnShare', timeout=30000)
    pg.click('#btnShare'); pg.click('#btnShareMenu [data-share=copy]'); toast_text(pg, 'Copied')
    clip = pg.evaluate("navigator.clipboard.readText()")
    r.check('a shipment is shared with its status', 'Status' in clip and pg.evaluate(f"opsFind('logistics', '{lg_id}').title") in clip, clip)
    exp_id = first_id('expenses', 'finance')
    if exp_id:
        pg.evaluate(f"location.hash = '#expenses/{exp_id}'"); pg.wait_for_selector('#btnShare', timeout=30000)
        pg.click('#btnShare'); pg.click('#btnShareMenu [data-share=copy]'); toast_text(pg, 'Copied')
        clip = pg.evaluate("navigator.clipboard.readText()"); r.check('an expense is shared with its date, type and amount', 'Amount' in clip and 'Type' in clip, clip)
    # ---- Arabic
    pg.evaluate("location.hash = '#reports/inventory'"); pg.wait_for_selector('#rpPaper')
    pg.click('#btnLang'); pg.wait_for_function("() => document.documentElement.lang === 'ar'")
    pg.click('#btnRpShare'); pg.wait_for_selector('#btnRpShareMenu')
    r.check('Arabic: the menu is translated and sits at the start of the button', 'واتساب' in pg.inner_text('#btnRpShareMenu') and 'نسخ' in pg.inner_text('#btnRpShareMenu'))
    pg.keyboard.press('Escape'); pg.click('#btnLang'); pg.wait_for_function("() => document.documentElement.lang === 'en'")
    to_settings(pg); pg.fill('#setCur', 'EGP'); pg.fill('#setPrefix', 'DS'); pg.fill('#setDays', '30'); save_settings(pg)         # the file loaded above changed these: later suites start from the usual ones
    pg.remove_listener('dialog', on_dialog)
    pg.evaluate("location.hash = '#dashboard'"); pg.wait_for_selector('#btnNewClient', timeout=30000)
    S.errors[n0:] = [e for e in S.errors[n0:] if not (e[1] == 'error' and 'Failed to load resource' in e[2] and ('409' in e[2] or '404' in e[2]))]
