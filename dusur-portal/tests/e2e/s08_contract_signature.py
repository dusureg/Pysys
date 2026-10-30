"""Admin: the printable contract. Signature (drawn and uploaded) and clauses in Settings, the contract screen (Arabic / English / both),
signature LAST on the paper, saving, privacy (nothing reaches the client or any public file), and the real PDF produced by the browser."""
import json, os, re, struct, subprocess, zlib
from mockgh import make_png, ADMIN_DIR, BASE
from lib import *


def ink_png(w=320, h=110):
    """A 'photo of a signature': white paper with a dark diagonal stroke and a loop."""
    rows = []
    for y in range(h):
        row = bytearray()
        for x in range(w):
            on = abs((x - 20) * 0.28 - (h - 15 - y)) < 2.5 or (60 < x < 140 and abs(y - 40 - 14 * ((x // 9) % 3)) < 2)
            row += bytes((25, 30, 70) if on else (250, 250, 250))
        rows.append(b'\x00' + bytes(row))
    def chunk(t, d):
        c = struct.pack('>I', len(d)) + t + d
        return c + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(b''.join(rows))) + chunk(b'IEND', b'')


ALPHA_JS = """async (src) => { const im = new Image(); im.src = src; await im.decode(); const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
  const g = c.getContext('2d'); g.drawImage(im, 0, 0); const d = g.getImageData(0, 0, c.width, c.height).data; let o = 0, t = 0;
  for (let i = 3; i < d.length; i += 4) { if (d[i] > 200) o++; else if (d[i] < 10) t++; } return { w: im.width, h: im.height, opaque: o, clear: t }; }"""


def run(S):
    r, mock, pg, cid = S.r, S.mock, S.admin, S.cid
    pg.set_viewport_size({'width': 1280, 'height': 900})
    pg.evaluate('location.hash = "#dashboard"'); pg.wait_for_selector('#btnNewClient')

    # ================= Settings: owner, signature, clauses
    pg.click('#adminNav a[data-route=settings]'); pg.wait_for_selector('#contractCard')
    name = pg.locator('#contractCard label', has_text='Name of the signatory').locator('input')
    title = pg.locator('#contractCard label', has_text='Title').locator('input')
    name.nth(0).fill('Abdo Kamel'); name.nth(1).fill('عبده كامل')
    r.check('Settings has a Contract card with the standard clauses in both languages', pg.input_value('#setCtTermsEn').startswith('Subject of the contract') and pg.input_value('#setCtTermsAr').startswith('موضوع العقد'))
    r.check('the card says it is private', pg.locator('#contractCard .badge:has-text("Private")').count() == 1)

    # a signature drawn with the mouse
    pg.click('#btnSigDraw'); pg.wait_for_selector('#sigPad')
    pg.click('#btnPadUse')
    r.check('using an empty pad is refused with a message', pg.locator('.sigpadbox .msg.bad').is_visible())
    b = pg.locator('#sigPad').bounding_box()
    pts = [(0.10, 0.65), (0.22, 0.25), (0.30, 0.70), (0.42, 0.30), (0.55, 0.72), (0.70, 0.28), (0.88, 0.60)]
    pg.mouse.move(b['x'] + b['width'] * pts[0][0], b['y'] + b['height'] * pts[0][1]); pg.mouse.down()
    for fx, fy in pts[1:]:
        pg.mouse.move(b['x'] + b['width'] * fx, b['y'] + b['height'] * fy, steps=6)
    pg.mouse.up()
    pg.click('#btnPadUse'); pg.wait_for_selector('#sigPreview img')
    drawn = pg.get_attribute('#sigPreview img', 'src')
    info = pg.evaluate(ALPHA_JS, drawn)
    r.check('drawn signature becomes a transparent PNG, cropped to the ink and small', drawn.startswith('data:image/png;base64,') and info['w'] <= 600 and info['h'] <= 220 and info['opaque'] > 100 and info['clear'] > info['opaque'] * 0.3 and len(drawn) < 150000, str(info) + str(len(drawn)))

    # an uploaded "photo of a signature on white paper": paper becomes transparent
    pg.set_input_files('#sigFile', files=[{'name': 'sig.png', 'mimeType': 'image/png', 'buffer': ink_png()}])
    pg.wait_for_function('(prev) => { const i = document.querySelector("#sigPreview img"); return i && i.src !== prev; }', arg=drawn, timeout=15000)
    up = pg.get_attribute('#sigPreview img', 'src'); info = pg.evaluate(ALPHA_JS, up)
    r.check('uploaded signature photo: white paper is removed (transparent), ink stays solid', info['clear'] > info['opaque'] and info['opaque'] > 50 and info['w'] <= 600, str(info))
    pg.set_input_files('#sigFile', files=[{'name': 'blank.png', 'mimeType': 'image/png', 'buffer': make_png(80, 40, (255, 255, 255))}])
    pg.wait_for_selector('.msg.bad:has-text("No signature was found")')
    r.check('an image with no ink is refused with a clear message and the old signature stays', pg.get_attribute('#sigPreview img', 'src') == up)

    # validation + save
    pg.fill('#setCtWarranty', '-1'); pg.click('#btnSaveSettings')
    pg.wait_for_selector('.msg.bad:has-text("whole number from 0 to 120")')
    r.check('a warranty outside 0–120 months is rejected', True)
    pg.fill('#setCtWarranty', '12'); pg.click('#btnSaveSettings'); pg.wait_for_selector('.toast.ok')
    pg.wait_for_selector('#contractCard')
    r.check('after saving, the signature and names are still there', pg.get_attribute('#sigPreview img', 'src') == up and name.nth(0).input_value() == 'Abdo Kamel')
    st = json.loads(mock.text('data/private/settings.json'))
    blob = ' '.join(mock.text(p) for p in mock.paths('data/') if not p.startswith('data/private/') and not re.search(r'\.(t|f)$', p))
    r.check('settings stay one encrypted envelope; the signature and clauses are not readable in the repository', set(st) == {'v', 'iv', 'ct'} and 'Abdo Kamel' not in mock.text('data/private/settings.json') and up[40:200] not in mock.text('data/private/settings.json'))
    r.check('no public file (brand.json, search index, client snapshots) contains the signature, owner name or clauses', up[40:200] not in blob and 'Abdo Kamel' not in blob and 'عبده كامل' not in blob and 'Subject of the contract' not in blob and 'موضوع العقد' not in blob)
    brand = json.loads(mock.text('data/public/brand.json'))
    r.check('brand.json keeps exactly its public whitelist of fields', set(brand) <= {'name', 'tagline', 'phone', 'whatsapp', 'email', 'website', 'address', 'logo', 'rating', 'inbox', 'look'}, str(sorted(brand)))

    # ================= the contract screen
    pg.click('#adminNav a[data-route=dashboard]'); pg.wait_for_selector('.item')
    pg.click('.item a:has-text("Contract")'); pg.wait_for_selector('#ctPaper')
    r.check('opens #contract/<client>/<n> from the Dashboard', pg.evaluate('location.hash') == f'#contract/{cid}/0')
    snap = json.loads(pg.evaluate(DECRYPT_JS, {'payload': json.loads(mock.text(f'data/clients/{cid}.json'))['payload'], 'secret': S.secret, 'id': cid}))
    kit = snap['projects'][0]
    text = pg.inner_text('#ctPaper')
    r.check('default paper is Arabic: title, contract number from the SKU, client name, project reference', 'عقد تصنيع وتركيب أثاث' in text and f'CT-{kit["sku"]}' in text and 'أحمد محمد' in text and kit['sku'] in text)
    r.check('the price and every payment received are on the paper', money_in(text, int(kit['price'])) and all(money_in(text, int(p['amount'])) for p in kit['payments']), text[:300])
    r.check('no template token is left unfilled ({...})', '{' not in text and '}' not in text)
    clauses = pg.locator('#ctPaper .ct-clause')
    r.check('the ten standard clauses are numbered and complete', clauses.count() == 10 and clauses.first.inner_text().startswith('1. موضوع العقد'), str(clauses.count()))
    r.check('the warranty clause says one year in Arabic', 'لمدة سنة واحدة' in text)
    r.check('your logo/name is at the top and your contact details are in the header', pg.locator('#ctPaper .rp-head').count() == 1 and pg.locator('#ctPaper .rp-head img, #ctPaper .rp-head svg').count() >= 1)
    # signature last
    last = pg.evaluate("document.querySelector('#ctPaper').lastElementChild.className")
    order = pg.evaluate("""() => { const p = document.querySelector('#ctPaper'), cl = [...p.querySelectorAll('.ct-clause')].pop().getBoundingClientRect(), sg = p.querySelector('#ctSigImg').getBoundingClientRect(), pr = p.getBoundingClientRect();
      return { clauseBottom: cl.bottom, sigTop: sg.top, sigBottom: sg.bottom, paperBottom: pr.bottom }; }""")
    r.check('the signature block is the LAST element of the paper, below the final clause', last == 'ct-signwrap' and order['sigTop'] > order['clauseBottom'] and order['sigBottom'] <= order['paperBottom'], f'{last} {order}')
    r.check('your signature image is printed in the first-party box, with your name and title; the client has a blank box', pg.locator('#ctSignCompany #ctSigImg').count() == 1 and 'عبده كامل' in pg.inner_text('#ctSignCompany') and pg.locator('#ctSignClient #ctSigImg').count() == 0 and 'أحمد محمد' in pg.inner_text('#ctSignClient'))
    pg.screenshot(path=f'{SP}/shot-contract-ar.png', full_page=True)

    # language: English, then both side by side
    pg.select_option('#ctLang', 'en')
    t_en = pg.inner_text('#ctPaper')
    r.check('English: title, clauses and signature labels are English', 'Furniture Manufacturing & Installation Contract' in t_en and pg.locator('#ctPaper .ct-clause').first.inner_text().startswith('1. Subject of the contract') and 'First party' in t_en and 'Abdo Kamel' in pg.inner_text('#ctSignCompany') and 'عبده' not in pg.inner_text('#ctSignCompany'))
    pg.select_option('#ctLang', 'both')
    r.check('both: the paper becomes two columns, English first (left) and Arabic second (right), row by row', pg.locator('#ctPaper.ct-bi').count() == 1 and pg.evaluate("""() => { const row = document.querySelector('#ctPaper .ct-clauserow'), c = row.querySelectorAll('.ct-cell');
      return c.length === 2 && c[0].lang === 'en' && c[1].lang === 'ar' && c[0].getBoundingClientRect().left < c[1].getBoundingClientRect().left && c[1].dir === 'rtl'; }"""))
    r.check('both: every clause row has the same clause number in both languages', pg.evaluate("""() => [...document.querySelectorAll('#ctPaper .ct-clauserow')].every((row) => { const s = [...row.querySelectorAll('.ct-clause strong')].map((x) => parseInt(x.textContent, 10)); return s.length === 2 && s[0] === s[1]; })"""))
    r.check('both: names appear in both languages in the signature box', 'Abdo Kamel' in pg.inner_text('#ctSignCompany') and 'عبده كامل' in pg.inner_text('#ctSignCompany'))
    pg.screenshot(path=f'{SP}/shot-contract-both.png', full_page=True)

    # options
    pg.select_option('#ctLang', 'ar')
    pg.fill('#ctWarranty', '0')
    r.check('warranty 0 removes the warranty clause (9 clauses left)', pg.locator('#ctPaper .ct-clause').count() == 9 and 'الضمان' not in pg.inner_text('#ctPaper'))
    pg.fill('#ctWarranty', '24')
    r.check('warranty 24 months is written as two years', pg.locator('#ctPaper .ct-clause').count() == 10 and 'لمدة سنتين' in pg.inner_text('#ctPaper'))
    pg.fill('#ctWarranty', '6')
    r.check('warranty 6 months uses the right Arabic number form', '6 أشهر' in pg.inner_text('#ctPaper'))
    pg.fill('#ctWarranty', '')
    pg.fill('#ctNo', 'CT-2026-017'); pg.fill('#ctDate', day(0)); pg.fill('#ctSite', 'التجمع الخامس، فيلا 12')
    pg.fill('#ctPayAr', '50% عند التعاقد، 30% عند التسليم، 20% بعد التركيب'); pg.fill('#ctExtraAr', 'يتم التسليم قبل بداية موسم الصيف.')
    t2 = pg.inner_text('#ctPaper')
    r.check('contract number, site address, payment schedule and special conditions appear on the paper', 'CT-2026-017' in t2 and 'فيلا 12' in t2 and '30% عند التسليم' in t2 and 'شروط خاصة' in t2 and 'موسم الصيف' in t2)
    r.check('special conditions are numbered after the standard clauses and the signature is still last', pg.locator('#ctPaper .ct-clause').count() == 11 and pg.evaluate("document.querySelector('#ctPaper').lastElementChild.className") == 'ct-signwrap')
    pg.uncheck('#ctClientSign')
    r.check('the client signature box can be switched off', pg.locator('#ctSignClient').count() == 0 and pg.locator('.ct-sign.one').count() == 1)
    pg.check('#ctClientSign')
    r.check('unsaved changes are flagged on the save bar', pg.locator('.savebar >> text=Unsaved').count() == 1)

    # save, privacy, persistence
    save(pg)
    snap = json.loads(pg.evaluate(DECRYPT_JS, {'payload': json.loads(mock.text(f'data/clients/{cid}.json'))['payload'], 'secret': S.secret, 'id': cid}))
    sj = json.dumps(snap, ensure_ascii=False)
    r.check('saved contract details never reach the client snapshot', 'فيلا 12' not in sj and 'CT-2026-017' not in sj and 'contract' not in sj and 'موسم الصيف' not in sj)
    pg.click('#adminNav a[data-route=dashboard]'); pg.wait_for_selector('#btnRefresh'); pg.click('#btnRefresh'); pg.wait_for_selector('.item')
    pg.click('.item a:has-text("Contract")'); pg.wait_for_selector('#ctPaper')
    r.check('reloaded from the repository: the contract details are kept', pg.input_value('#ctNo') == 'CT-2026-017' and pg.input_value('#ctSite') == 'التجمع الخامس، فيلا 12' and 'موسم الصيف' in pg.inner_text('#ctPaper'))

    # the real PDF the browser produces
    pg.emulate_media(media='print')
    try:
        pdf = pg.pdf(format='A4', print_background=True, prefer_css_page_size=True)
    finally:
        pg.emulate_media(media='null')
    path = f'{SP}/contract-test.pdf'; open(path, 'wb').write(pdf)
    pages = int(re.search(r'Pages:\s+(\d+)', subprocess.run(['pdfinfo', path], capture_output=True, text=True).stdout).group(1))
    last_txt = subprocess.run(['pdftotext', '-f', str(pages), '-l', str(pages), path, '-'], capture_output=True, text=True).stdout
    all_txt = subprocess.run(['pdftotext', path, '-'], capture_output=True, text=True).stdout
    imgs = subprocess.run(['pdfimages', '-list', '-f', str(pages), '-l', str(pages), path], capture_output=True, text=True).stdout.strip().splitlines()
    r.check(f'PDF: A4, {pages} page(s), the app screen around the paper is not printed', 1 <= pages <= 3 and 'Dashboard' not in all_txt and 'Save & publish' not in all_txt and 'Print / Save as PDF' not in all_txt, all_txt[:200])
    r.check('PDF: the last page ends with the acceptance sentence and the signature block (signature image included)', 'قرأ كل طرف' in last_txt and 'الطرف' in last_txt and len(imgs) >= 3, last_txt[-300:] + '|' + str(imgs))
    r.check('PDF: the signature block comes after the last clause in the document text', 0 < all_txt.rfind('المنازعات') < all_txt.rfind('قرأ كل طرف') < all_txt.rfind('الطرف'))
    subprocess.run(['pdftoppm', '-r', '60', '-png', path, f'{SP}/contract-test'], capture_output=True)
    page_txt = lambda n: subprocess.run(['pdftotext', '-f', str(n), '-l', str(n), path, '-'], capture_output=True, text=True).stdout
    r.check('PDF: the contract starts on page 1 (no wasted first page with only the app\'s project tabs)', 'عقد تصنيع وتركيب أثاث' in page_txt(1) and len(page_txt(1).strip()) > 300, page_txt(1)[:120])
    r.check('PDF: the payments table is not split from its heading (both on the same page)', next(n for n in range(1, pages + 1) if 'الدفعات المستلمة' in page_txt(n)) == next(n for n in range(1, pages + 1) if 'Deposit' in page_txt(n)))

    # Arabic screen + phone
    pg.click('#btnLang'); pg.wait_for_selector('label:has-text("لغة العقد")')
    r.check('Arabic screen: options are in Arabic, right to left, and the paper language is unchanged', pg.evaluate('document.documentElement.dir') == 'rtl' and 'لغة العقد' in pg.inner_text('#ctOptions') and 'عقد تصنيع وتركيب أثاث' in pg.inner_text('#ctPaper'))
    pg.select_option('#ctLang', 'both')
    r.check('Arabic screen, both languages: English column is still on the left', pg.evaluate("""() => { const c = document.querySelector('#ctPaper .ct-clauserow').querySelectorAll('.ct-cell'); return c[0].lang === 'en' && c[0].getBoundingClientRect().left < c[1].getBoundingClientRect().left; }"""))
    # both languages: nothing overflows its column, and the real PDF keeps the signature last
    r.check('both: every row spans the whole paper width and its two cells sit side by side (the layout cannot collapse into 4 columns)', pg.evaluate("""() => { const pw = document.querySelector('#ctPaper').clientWidth - 80, rows = [...document.querySelectorAll('#ctPaper .ct-row')];
      return rows.length > 8 && rows.every((r) => Math.abs(r.clientWidth - pw) <= 2 && r.children.length === 2 && Math.abs(r.children[0].getBoundingClientRect().top - r.children[1].getBoundingClientRect().top) < 2); }"""))
    over = pg.evaluate("""() => [...document.querySelectorAll('#ctPaper .ct-cell, #ctPaper .ct-tbl, #ctPaper .ct-dl dd, #ctPaper .ct-tbl td')].filter((x) => x.scrollWidth > x.clientWidth + 1).map((x) => x.tagName + '.' + x.className + ' ' + x.scrollWidth + '>' + x.clientWidth + ' ' + x.textContent.slice(0, 30))""")
    r.check('both: the payments table and the data rows fit inside their column (no overlapping text)', not over, str(over))
    pg.emulate_media(media='print')
    try: pdf2 = pg.pdf(format='A4', print_background=True, prefer_css_page_size=True)
    finally: pg.emulate_media(media='null')
    path2 = f'{SP}/contract-both-test.pdf'; open(path2, 'wb').write(pdf2)
    n2 = int(re.search(r'Pages:\s+(\d+)', subprocess.run(['pdfinfo', path2], capture_output=True, text=True).stdout).group(1))
    last2 = subprocess.run(['pdftotext', '-f', str(n2), '-l', str(n2), path2, '-'], capture_output=True, text=True).stdout
    img2 = subprocess.run(['pdfimages', '-list', '-f', str(n2), '-l', str(n2), path2], capture_output=True, text=True).stdout.strip().splitlines()
    r.check(f'PDF (both languages): {n2} page(s), the last one holds both acceptance sentences and the signature image', 2 <= n2 <= 4 and 'Each party has read' in last2 and 'قرأ كل طرف' in last2 and len(img2) >= 3, f'{n2} {last2[-200:]}')
    subprocess.run(['pdftoppm', '-r', '70', '-png', path2, f'{SP}/contract-both-test'], capture_output=True)
    pg.click('#btnLang'); pg.wait_for_selector('label:has-text("Contract language")')
    pg.select_option('#ctLang', '')
    pg.set_viewport_size({'width': 390, 'height': 844}); pg.wait_for_timeout(300)
    r.check('phone: the contract screen has no horizontal scroll', pg.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), str(pg.evaluate('document.documentElement.scrollWidth')))
    pg.screenshot(path=f'{SP}/shot-contract-phone.png', full_page=True)
    pg.set_viewport_size({'width': 1280, 'height': 900})

    # editor shortcut buttons (the language choice above left the record unsaved)
    save(pg)
    pg.click('#adminNav a[data-route=dashboard]'); pg.wait_for_selector('.item'); pg.click('.item a:has-text("Edit")'); pg.wait_for_selector('#btnToContract')
    r.check('the client editor has shortcuts to Progress and Contract', pg.locator('#btnToProgress').count() == 1 and pg.get_attribute('#btnToContract', 'href') == f'#contract/{cid}/0')
    pg.evaluate('location.hash = "#dashboard"'); pg.wait_for_selector('#btnNewClient')
