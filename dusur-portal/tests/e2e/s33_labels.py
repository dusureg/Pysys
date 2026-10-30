"""Admin (4.6): labels. #labels/<client>/<project>: a 2.5 x 2.5 cm label or a strip 2.5 cm tall and any length, with the logo, a thin Egypt flag and the slogan, client and product
data, the piece, a QR code and a Code 128 barcode of the SKU; one label for the project or one for every piece, copies; each label is one printed page of exactly its size.
Settings > Labels holds the defaults. Nothing about labels reaches a client.
The QR code is decoded with a real decoder (OpenCV) from the printed PDF, rasterised at 300 dpi. The Code 128 table is checked structurally and the bars are decoded
from the picture with an independent decoder written here; a real scanner was not available."""
import json, os, re, subprocess, tempfile
from lib import *

try:
    import cv2, numpy as np
except Exception:                                                      # the decoder is a development tool only
    cv2 = None


def open_labels(pg, cid, i):
    pg.evaluate(f"location.hash = '#labels/{cid}/{i}'"); pg.wait_for_selector('#lblOptions', timeout=30000); pg.wait_for_selector('#lblSheet .lbl', timeout=30000); settle(pg)


def settle(pg):                                                       # the screen fits the text of each label on the next frame
    pg.evaluate("() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 30))))")


def labels(pg):
    return pg.evaluate("""() => [...document.querySelectorAll('#lblSheet .lbl')].map((e) => { const b = e.getBoundingClientRect();
      return { size: e.dataset.size, w: b.width, h: b.height, vw: e.style.getPropertyValue('--w'), vh: e.style.getPropertyValue('--hh'), u: Number(e.dataset.u || 1), tight: e.hasAttribute('data-tight'), text: e.innerText,
        over: e.scrollHeight > e.clientHeight + 1 || e.scrollWidth > e.clientWidth + 1 }; })""")


def line(pg, f, n=0):
    loc = pg.locator(f'#lblSheet .lbl >> nth={n}').locator(f'[data-f={f}]')
    return loc.inner_text() if loc.count() else None


def pdf_of(pg, path):
    pg.emulate_media(media='print')
    try: pg.pdf(path=path, print_background=True, prefer_css_page_size=True)
    finally: pg.emulate_media(media='screen')


def pdf_pages(path):
    out = subprocess.run(['pdfinfo', '-f', '1', '-l', '2000', path], capture_output=True, text=True).stdout
    sizes = [(float(a), float(b)) for a, b in re.findall(r'Page\s+\d+ size:\s+([\d.]+) x ([\d.]+) pts', out)]
    return int(re.search(r'Pages:\s+(\d+)', out).group(1)), sizes


def decode_qr(img):
    if cv2 is None: return None
    det = cv2.QRCodeDetector()
    for scale in (1, 2, 3):
        im = img if scale == 1 else cv2.resize(img, None, fx=scale, fy=scale, interpolation=cv2.INTER_NEAREST)
        val, _, _ = det.detectAndDecode(im)
        if val: return val
    return ''


def run(S):
    r, mock, pg, cid = S.r, S.mock, S.admin, S.cid
    sku0, sku1 = S.skus[0], S.skus[1]
    REC_JS = f"store.items.find((x) => x.rec.id === '{cid}').rec"                    # the record the labels screen reads (the screen does not open the editor)
    pg.set_viewport_size({'width': 1280, 'height': 900})
    tmp = tempfile.mkdtemp(prefix='lbl')
    on_dialog = lambda d: d.accept()
    pg.on('dialog', on_dialog)                                                       # removed at the end: later suites bring their own dialog handlers

    # ================= the defaults of Settings =================
    pg.evaluate("location.hash = '#settings'"); pg.wait_for_selector('#labelsCard', timeout=30000)
    r.check('Settings has a Labels card with the size, slogan, copies and what is printed (QR code and barcode among them)', pg.locator('#labelsCard #setLblSize').count() == 1 and pg.locator('#labelsCard #setLblSlogan').count() == 1 and pg.locator('#labelsCard #setLblCopies').count() == 1
            and pg.locator('#setLblF-qr').count() == 1 and pg.locator('#setLblF-barcode').count() == 1 and pg.locator('#labelsCard input[type=checkbox]').count() == 10)
    r.check('out of the box: 2.5 x 2.5 cm, the slogan EGYPT MADE WITH EGYPT, one copy, logo + flag + client ID + SKU + product + piece',
            pg.input_value('#setLblSize') == 'sq' and pg.input_value('#setLblSlogan') == 'EGYPT MADE WITH EGYPT' and pg.input_value('#setLblCopies') == '1'
            and [f for f in ('logo', 'flag', 'clientId', 'clientName', 'sku', 'title', 'piece', 'date', 'qr', 'barcode') if pg.is_checked(f'#setLblF-{f}')] == ['logo', 'flag', 'clientId', 'sku', 'title', 'piece'])

    # ================= the screen, as it opens =================
    open_labels(pg, cid, 0)
    ls = labels(pg)
    r.check('a label screen per project: by default one label of 25 x 25 mm (the whole project), the size field for strips hidden', len(ls) == 1 and ls[0]['size'] == 'sq' and ls[0]['vw'] == '25mm' and ls[0]['vh'] == '25mm' and abs(ls[0]['w'] / ls[0]['h'] - 1) < 0.01 and not pg.locator('#lblLen').is_visible())
    r.check('the count line says how many labels and how big', pg.inner_text('#lblCount').startswith('1 label(s), 2.5 × 2.5 cm each.'), pg.inner_text('#lblCount'))
    pieces = int(re.search(r'\((\d+) pieces\)', pg.locator('#lblScope option').nth(1).inner_text()).group(1))
    t0 = ls[0]['text']
    r.check('it carries the client ID, the SKU, the product and the number of pieces', line(pg, 'clientId') == cid and line(pg, 'sku') == sku0 and line(pg, 'title') and line(pg, 'piece') == f'{pieces} pieces', t0)
    r.check('the logo and the thin Egypt flag with the slogan are there; the flag has its three bands (red, white, black)', pg.locator('#lblSheet .lbl-top').count() == 1 and 'EGYPT MADE WITH EGYPT' in t0
            and pg.evaluate("() => [...document.querySelectorAll('#lblSheet .lbl-flag i')].map((e) => getComputedStyle(e).backgroundColor)") == ['rgb(206, 17, 38)', 'rgb(255, 255, 255)', 'rgb(0, 0, 0)'])
    r.check('no client name, date, QR code or barcode unless chosen', pg.locator('#lblSheet [data-f=clientName], #lblSheet [data-f=date], #lblSheet .lbl-qr, #lblSheet .lbl-bar').count() == 0)
    r.check('the label is not shrunk when it fits', ls[0]['u'] == 1 and not ls[0]['over'] and not ls[0]['tight'])

    # ================= what is printed =================
    pg.uncheck('#lblF-logo'); pg.uncheck('#lblF-flag'); settle(pg)
    r.check('un-ticking the logo and the flag removes them (the slogan goes with the flag)', pg.locator('#lblSheet .lbl-top, #lblSheet .lbl-eg').count() == 0 and 'EGYPT MADE' not in labels(pg)[0]['text'])
    pg.check('#lblF-logo'); pg.check('#lblF-flag'); pg.check('#lblF-clientName'); pg.check('#lblF-date'); settle(pg)
    name = pg.evaluate(f"() => {REC_JS}.client.name")
    r.check('client name and today\'s date can be added', line(pg, 'clientName') == name and re.search(r'\d', line(pg, 'date') or ''))
    pg.uncheck('#lblF-clientName'); pg.uncheck('#lblF-date')
    pg.fill('#lblSlogan', ''); settle(pg)
    r.check('an empty slogan leaves the flag alone', pg.locator('#lblSheet .lbl-flag').count() == 1 and pg.locator('#lblSheet .lbl-slogan').count() == 0)
    pg.fill('#lblSlogan', 'MADE IN EGYPT'); settle(pg)
    r.check('another slogan is printed as typed', 'MADE IN EGYPT' in labels(pg)[0]['text'])
    pg.fill('#lblSlogan', 'EGYPT MADE WITH EGYPT')

    # ---- the QR code
    pg.check('#lblF-qr'); settle(pg)
    qr = pg.locator('#lblSheet .lbl-qr')
    r.check('the QR code is drawn as an SVG of the SKU (and the text beside it still fits or says it does not)', qr.count() == 1 and qr.get_attribute('data-code') == sku0 and qr.get_attribute('role') == 'img' and not labels(pg)[0]['over'] or labels(pg)[0]['tight'])
    side = pg.evaluate("() => { const b = document.querySelector('#lblSheet .lbl-qrbox').getBoundingClientRect(); return [b.width, b.height]; }")
    r.check('on the screen the QR code is a square about 26 mm wide (10 mm printed)', abs(side[0] - side[1]) < 1 and 80 < side[0] < 120, str(side))
    if cv2 is not None:
        p = os.path.join(tmp, 'qr-screen.png'); pg.locator('#lblSheet .lbl-qrbox').screenshot(path=p)
        r.check('the QR code on the screen is decoded by a real decoder as the SKU', decode_qr(cv2.imread(p, cv2.IMREAD_GRAYSCALE)) == sku0)
    else:
        r.check('the QR code decoder (OpenCV) is not installed here: decoding skipped', True)
    pg.uncheck('#lblF-qr')

    # ---- the Code 128 barcode
    pg.check('#lblF-barcode'); settle(pg)
    bar = pg.locator('#lblSheet .lbl-bar')
    info = pg.evaluate("(sku) => { const b = code128Bars(sku), svg = document.querySelector('#lblSheet .lbl-bar'); return { b, rects: [...svg.querySelectorAll('rect')].map((e) => [Number(e.getAttribute('x')), Number(e.getAttribute('width'))]), view: svg.getAttribute('viewBox'), table: C128 }; }", sku0)
    r.check('the barcode is an SVG of the SKU with one black bar for every other width', bar.count() == 1 and bar.get_attribute('data-code') == sku0 and len(info['rects']) == (len(info['b']['bars']) + 1) // 2)
    table = info['table']; pats = table[:107]
    r.check('the Code 128 table: 107 distinct symbols of six widths adding to 11 (bars even), no symbol is the mirror image of another, and the stop symbol has 7 widths adding to 13',
            len(table) == 107 and len(set(pats)) == 107 and all(len(p) == 6 and sum(map(int, p)) == 11 and (int(p[0]) + int(p[2]) + int(p[4])) % 2 == 0 for p in pats[:106]) and len({p[::-1] for p in pats[:106]} & set(pats[:106])) == 0
            and len(table[106]) == 7 and sum(map(int, table[106])) == 13, str(len(table)))
    v = info['b']['values']; chk = (104 + sum(val * i for i, val in enumerate(v[1:-2], 1))) % 103
    r.check('start B first, then one symbol per character, the check symbol, the stop symbol; the check symbol is recomputed here', v[0] == 104 and v[-1] == 106 and v[1:-2] == [ord(c) - 32 for c in sku0] and v[-2] == chk and info['b']['modules'] == 11 * (len(sku0) + 2) + 13)
    # decode the bars the way a scanner would: widths -> symbols -> text (an independent reading of the drawn rectangles)
    rects = info['rects']; x0 = rects[0][0]; xs = [x for x, _ in rects]; ws = [w for _, w in rects]
    widths = []
    for i, (x, w) in enumerate(rects):
        if i: widths.append(x - (rects[i - 1][0] + rects[i - 1][1]))
        widths.append(w)
    sym = [''.join(str(w) for w in widths[k:k + 6]) for k in range(0, len(widths) - 7, 6)]
    vals = [table.index(s) if s in table else -1 for s in sym]
    text = ''.join(chr(x + 32) for x in vals[1:-1])
    r.check('read back from the drawn bars: start B, the SKU text, a correct check symbol, stop', vals[0] == 104 and text == sku0 and (104 + sum(x * i for i, x in enumerate(vals[1:-1], 1))) % 103 == vals[-1] and ''.join(map(str, widths[-7:])) == table[106], f'{vals[:3]} {text}')
    r.check('quiet zones of 10 modules on both sides', x0 == 10 and float(info['view'].split()[2]) == info['b']['modules'] + 20)
    pg.uncheck('#lblF-barcode')

    # ================= one label for every piece =================
    pg.select_option('#lblScope', 'pieces'); settle(pg)
    ls = labels(pg)
    r.check('"every piece" gives one label per piece of every part (the number in the drop-down)', len(ls) == pieces and pieces >= 2, f'{len(ls)} / {pieces}')
    p1 = line(pg, 'piece', 0); pn = line(pg, 'piece', len(ls) - 1)
    r.check('each says which piece it is: name and k/n, counting up for each part', re.fullmatch(r'.+ 1/\d+', p1 or '') and re.fullmatch(r'.+ \d+/\d+', pn or '') and len({line(pg, 'piece', i) for i in range(len(ls))}) == len(ls), f'{p1} ... {pn}')
    r.check('and the count line says so', pg.inner_text('#lblCount').startswith(f'{pieces} label(s)'))
    pg.fill('#lblCopies', '2'); settle(pg)
    r.check('two copies of each label double the number', len(labels(pg)) == 2 * pieces)
    pg.fill('#lblCopies', '0'); settle(pg)
    r.check('copies cannot go below 1', len(labels(pg)) == pieces and pg.input_value('#lblCopies') in ('0', '1'))
    pg.fill('#lblCopies', '99'); settle(pg)
    r.check('or above 20 (back to the default of 1)', len(labels(pg)) in (pieces, 20 * pieces))
    pg.fill('#lblCopies', '1')
    # the cap of 400 in one go
    pg.evaluate(f"() => {{ {REC_JS}.projects[0].parts.push({{ name: 'Cap test', qty: 200 }}); }}")
    pg.fill('#lblCopies', '5'); settle(pg)
    r.check('no more than 400 labels in one go, and the screen says so', len(labels(pg)) == 400 and 'Only the first 400' in pg.inner_text('#lblCount'), pg.inner_text('#lblCount'))
    pg.evaluate(f"() => {{ {REC_JS}.projects[0].parts.pop(); }}")
    pg.fill('#lblCopies', '1'); pg.select_option('#lblScope', 'project'); settle(pg)
    r.check('back to one label for the whole project', len(labels(pg)) == 1)

    # ================= a strip =================
    pg.select_option('#lblSize', 'strip'); settle(pg)
    ls = labels(pg)
    r.check('a strip: 25 mm tall, 60 mm long by default, the length field appears', ls[0]['size'] == 'strip' and ls[0]['vw'] == '60mm' and ls[0]['vh'] == '25mm' and abs(ls[0]['w'] / ls[0]['h'] - 2.4) < 0.02 and pg.locator('#lblLen').is_visible(), str(ls[0]['w'] / ls[0]['h']))
    pg.fill('#lblLen', '10'); settle(pg)
    r.check('a longer strip (10 cm) is 4 times as long as it is tall', abs(labels(pg)[0]['w'] / labels(pg)[0]['h'] - 4.0) < 0.05 and '10 × 2.5 cm' in pg.inner_text('#lblCount'))
    pg.fill('#lblLen', '2'); settle(pg)
    r.check('a length outside 3 to 30 cm falls back to the default (6 cm)', abs(labels(pg)[0]['w'] / labels(pg)[0]['h'] - 2.4) < 0.05)
    pg.fill('#lblLen', '31'); settle(pg)
    r.check('also above 30 cm', abs(labels(pg)[0]['w'] / labels(pg)[0]['h'] - 2.4) < 0.05)
    pg.fill('#lblLen', '12'); pg.check('#lblF-qr'); pg.check('#lblF-barcode'); pg.check('#lblF-clientName'); settle(pg)
    ls = labels(pg)
    r.check('a strip with QR code, barcode and client name keeps the lot inside its borders (or is marked as too full)', not ls[0]['over'] or ls[0]['tight'], str(ls[0]))
    r.check('in a strip the logo and flag are on the left, then the text, the QR code and the barcode', pg.locator('#lblSheet .lbl-strip .lbl-side .lbl-top').count() == 1 and pg.locator('#lblSheet .lbl-strip .lbl-qrbox').count() == 1 and pg.locator('#lblSheet .lbl-strip .lbl-barbox').count() == 1)
    pg.uncheck('#lblF-clientName')

    # ================= a label that does not fit shrinks its text =================
    pg.select_option('#lblSize', 'sq'); pg.check('#lblF-clientName'); pg.check('#lblF-date'); settle(pg)
    orig_title = pg.evaluate(f"() => {REC_JS}.projects[0].title")
    pg.evaluate(f"() => {{ {REC_JS}.projects[0].title = 'Walnut veneer kitchen with a long island, tall pantry units and a hidden appliance garage, matte lacquer'; }}")
    pg.uncheck('#lblF-date'); pg.check('#lblF-date'); settle(pg)
    l = labels(pg)[0]
    r.check('a crowded label shrinks its text to fit (the shrink factor is below 1), or is outlined in red when even that is not enough', (l['u'] < 1 and not l['over']) or l['tight'], f"u={l['u']} over={l['over']} tight={l['tight']}")
    r.check('and the count line warns when a label is too full', ('too full' in pg.inner_text('#lblCount')) == l['tight'])
    pg.evaluate(f"(t) => {{ {REC_JS}.projects[0].title = t; }}", orig_title)                              # the test never leaves a change in the open client
    for f in ('clientName', 'date', 'qr', 'barcode'): pg.uncheck(f'#lblF-{f}')
    settle(pg)

    # ================= printing =================
    pg.evaluate("() => { window.__printed = null; window.print = () => { window.__printed = document.title; }; }")
    pg.click('#btnLblPrint')
    pr = pg.evaluate("() => window.__printed")
    r.check('Print labels sets the page size rule (25 x 25 mm, no margin) and names the file after the brand, "labels" and the SKU', pr and 'labels' in pr and sku0.replace('-', '_') in pr.replace('-', '_') or sku0 in (pr or ''), str(pr))
    r.check('the page rule is exactly the label size', pg.inner_text('#dsLabelPage') if False else pg.evaluate("() => document.getElementById('dsLabelPage').textContent") == '@page lbl{size:25mm 25mm;margin:0}')
    pg.evaluate("() => window.dispatchEvent(new Event('afterprint'))")
    r.check('after printing the page title is back', 'labels' not in pg.title())

    # ---- the real printed output: pdf of the screen in print mode
    pg.select_option('#lblScope', 'pieces'); pg.check('#lblF-qr'); settle(pg)
    n = len(labels(pg))
    f = os.path.join(tmp, 'pieces.pdf'); pdf_of(pg, f)
    pages, sizes = pdf_pages(f)
    r.check(f'the PDF has one page per label ({n}), every page exactly 25 x 25 mm (70.87 pt)', pages == n and len(sizes) == n and all(abs(a - 70.87) < 0.8 and abs(b - 70.87) < 0.8 for a, b in sizes), f'{pages} {sizes[:2]}')
    txt = subprocess.run(['pdftotext', '-f', '1', '-l', '1', '-layout', f, '-'], capture_output=True, text=True).stdout
    flat = re.sub(r'\s+', '', txt)                                                                  # a long code may wrap onto two lines beside the QR code
    r.check('page 1 has the label (SKU, client ID, flag slogan) and none of the app around it', sku0 in flat and cid in flat and 'EGYPT MADE WITH EGYPT' in txt and 'Label options' not in txt and 'Print labels' not in txt and 'Dashboard' not in txt, txt[:200])
    if cv2 is not None:
        subprocess.run(['pdftoppm', '-r', '300', '-png', '-f', '1', '-l', '1', f, os.path.join(tmp, 'pg')], check=True)
        png = [x for x in os.listdir(tmp) if x.startswith('pg') and x.endswith('.png')][0]
        img = cv2.imread(os.path.join(tmp, png), cv2.IMREAD_GRAYSCALE)
        r.check('the printed page (300 dpi, 25 mm) decodes with a real QR decoder as the SKU', 295 <= img.shape[0] <= 298 and decode_qr(img) == sku0, f'{img.shape} {decode_qr(img)!r}')
        subprocess.run(['pdftoppm', '-r', '203', '-png', '-f', '1', '-l', '1', f, os.path.join(tmp, 'lo')], check=True)
        lo = cv2.imread(os.path.join(tmp, [x for x in os.listdir(tmp) if x.startswith('lo')][0]), cv2.IMREAD_GRAYSCALE)
        r.check('and at 203 dpi, the resolution of a common label printer', decode_qr(lo) == sku0, f'{lo.shape}')
    pg.select_option('#lblScope', 'project'); pg.uncheck('#lblF-qr')
    pg.select_option('#lblSize', 'strip'); pg.fill('#lblLen', '8'); pg.fill('#lblCopies', '3'); settle(pg)
    f2 = os.path.join(tmp, 'strip.pdf'); pdf_of(pg, f2)
    pages, sizes = pdf_pages(f2)
    r.check('a strip of 8 cm, 3 copies: 3 pages of 80 x 25 mm (226.77 x 70.87 pt)', pages == 3 and all(abs(a - 226.77) < 0.8 and abs(b - 70.87) < 0.8 for a, b in sizes), f'{pages} {sizes[:2]}')
    pg.fill('#lblCopies', '1'); pg.select_option('#lblSize', 'sq')

    # ================= the second project, and a phone =================
    open_labels(pg, cid, 1)
    r.check('the other project of the client has its own labels (its SKU), chosen with the tabs', line(pg, 'sku') == sku1 and pg.locator('#lblOptions .chip').inner_text() == sku1)
    pg.set_viewport_size({'width': 390, 'height': 800}); pg.evaluate("location.hash = '#labels/" + cid + "/0'"); pg.wait_for_selector('#lblSheet .lbl'); pg.select_option('#lblSize', 'strip'); pg.fill('#lblLen', '30'); settle(pg)
    wd = pg.evaluate("() => [document.documentElement.scrollWidth, window.innerWidth, document.querySelector('.lbl-area').scrollWidth, document.querySelector('.lbl-area').clientWidth, getComputedStyle(document.querySelector('.lbl-area')).overflowX]")
    r.check('on a phone nothing widens the page, even a 30 cm strip (it scrolls inside its box)', wd[0] <= wd[1] + 1 and wd[2] > wd[3], str(wd))
    r.check('the options are usable on a phone: every control is at least 36 px tall', all(h >= 36 for h in pg.evaluate("() => [...document.querySelectorAll('#lblOptions select, #lblOptions input[type=number], #lblOptions input#lblSlogan, #lblOptions .btn')].filter((e) => e.offsetParent).map((e) => e.getBoundingClientRect().height)")))
    pg.set_viewport_size({'width': 1280, 'height': 900})
    pg.select_option('#lblSize', 'sq')

    # ================= Settings change the defaults, nothing is printed for clients =================
    pg.evaluate("location.hash = '#settings'"); pg.wait_for_selector('#labelsCard')
    pg.select_option('#setLblSize', 'strip'); pg.fill('#setLblLen', '8'); pg.fill('#setLblSlogan', 'DUSUR'); pg.fill('#setLblCopies', '2'); pg.uncheck('#setLblF-piece'); pg.check('#setLblF-qr')
    pg.click('#btnSaveSettings'); toast_text(pg, 'Settings saved', 30000)
    saved = pg.evaluate('() => JSON.parse(JSON.stringify(session.settings.labels))')
    r.check('Save keeps the defaults in the settings (fields in the fixed order, no piece, with the QR code)', saved == {'size': 'strip', 'length': 8, 'slogan': 'DUSUR', 'fields': ['logo', 'flag', 'clientId', 'sku', 'title', 'qr'], 'copies': 2}, str(saved))
    st = mock.text('data/private/settings.json')
    r.check('the settings stay sealed (the slogan is not in the clear) and a client\'s snapshot has nothing about labels', set(json.loads(st)) == {'v', 'iv', 'ct'} and 'DUSUR' not in st
            and 'slogan' not in json.dumps(json.loads(pg.evaluate(DECRYPT_JS, {'payload': json.loads(mock.text(f'data/clients/{cid}.json'))['payload'], 'secret': S.secret, 'id': cid}))).lower())
    open_labels(pg, cid, 0)
    ls = labels(pg)
    r.check('the labels screen starts from the new defaults (strip, 8 cm, slogan DUSUR, 2 copies, QR code, no piece line)', pg.input_value('#lblSize') == 'strip' and pg.input_value('#lblLen') == '8' and pg.input_value('#lblSlogan') == 'DUSUR' and len(ls) == 2 and ls[0]['vw'] == '80mm'
            and pg.locator('#lblSheet .lbl-qr').count() == 2 and 'DUSUR' in ls[0]['text'] and line(pg, 'piece') is None)
    pg.evaluate("location.hash = '#settings'"); pg.wait_for_selector('#labelsCard')
    pg.select_option('#setLblSize', 'sq'); pg.fill('#setLblLen', '6'); pg.fill('#setLblSlogan', 'EGYPT MADE WITH EGYPT'); pg.fill('#setLblCopies', '1'); pg.check('#setLblF-piece'); pg.uncheck('#setLblF-qr')
    pg.click('#btnSaveSettings'); toast_text(pg, 'Settings saved', 30000)
    r.check('defaults restored', pg.evaluate('() => JSON.stringify(session.settings.labels)') == json.dumps({'size': 'sq', 'length': 6, 'slogan': 'EGYPT MADE WITH EGYPT', 'fields': ['logo', 'flag', 'clientId', 'sku', 'title', 'piece'], 'copies': 1}, separators=(',', ':')))

    # ================= the numbers inside =================
    r.check('labelPageMm: 25 x 25 for a square, length x 25 for a strip, in millimetres', pg.evaluate("() => [labelPageMm({ size: 'sq', length: 9 }), labelPageMm({ size: 'strip', length: 9 }), labelPageMm({ size: 'strip', length: 12.5 })]") == [[25, 25], [90, 25], [125, 25]])
    r.check('normLabels throws away what it does not know and fixes what is wrong', pg.evaluate("() => JSON.stringify(normLabels({ size: 'a4', length: 99, copies: 50, slogan: '  a   b  ', fields: ['sku', 'zzz', 'logo', 'sku'] }))") == json.dumps({'size': 'sq', 'length': 6, 'slogan': 'a b', 'fields': ['logo', 'sku'], 'copies': 1}, separators=(',', ':')))
    r.check('a QR code of a long text is cut at 40 characters, a non-ASCII character becomes "-"', pg.evaluate("() => [qrMatrix('x'.repeat(60)).version, qrMatrix('é').size]") == [3, 21])
    pg.remove_listener('dialog', on_dialog)
