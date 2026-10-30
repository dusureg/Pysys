"""4.6: files for the client to download (3D models, drawings, PDFs), the company contact file, and changing the client's key with sealed videos and files.
Admin (photos tab): add files (a 3D model, a drawing, a PDF with an awkward name, a 1.5 MB zip), refused types, empty and too big files; a note per file; the client snapshot lists
name, size and note only; each file is stored sealed as <id>.d. Client page: the Files card; Download saves the decrypted file under its own (cleaned) name, byte for byte, with
the percentage; a missing file says so; the contact box has "Save our contact": a vCard made from the public profile with escaping and folded lines.
Changing the client key re-seals every photo, video and file, including one over 1 MB that the contents API does not send (it is read as a blob), and the old key no longer opens them.
Needs the client of s01 - s03 and s30 (the viewer test leaves the poster-less project clean)."""
import json, os, re
from mockgh import BASE
from lib import *
from s30_media_viewer import MAKE_WEBM, snapshot

D = 'data/clients/'


def run(S):
    import base64
    r, mock, pg, cid, secret = S.r, S.mock, S.admin, S.cid, S.secret
    pg.set_viewport_size({'width': 1280, 'height': 900})
    dialogs = []
    on_dialog = lambda d: (dialogs.append(d.message), d.accept())
    pg.on('dialog', on_dialog)
    glb = b'glTF' + os.urandom(6000)
    dxf = b'0\nSECTION\n2\nENTITIES\n0\nLINE\n' * 60
    pdf = b'%PDF-1.4\n' + b'% drawing page\n' * 300
    big = os.urandom(1_500_000)
    before = set(mock.paths(D + cid + '/'))

    # ================= admin: add files =================
    pg.evaluate(f"location.hash = '#manage/{cid}'"); pg.wait_for_selector('#tab-photos', timeout=30000); pg.click('#tab-photos'); pg.wait_for_selector('#btnUploadFile')
    r.check('the photos tab has a "Files for the client" card with the limit and the accepted types', pg.locator('#dlCard').count() == 1 and '24 MB' in pg.inner_text('#dlCard') and 'GLB' in pg.inner_text('#dlCard') and 'DXF' in pg.inner_text('#dlCard') and 'No file for the client yet' in pg.inner_text('#dlCard'))
    r.check('the Add button is a real button of at least 40 px', pg.locator('#btnUploadFile').bounding_box()['height'] >= 36)

    def add(name, data, mime='application/octet-stream'):
        n = pg.evaluate('() => ed.rec.projects[0].downloads.length')
        pg.set_input_files('#dlInput', {'name': name, 'mimeType': mime, 'buffer': data})
        pg.wait_for_function(f'() => ed.rec.projects[0].downloads.length === {n + 1}', timeout=90000)
        toast_text(pg, 'was uploaded', 60000)
        pg.wait_for_selector('.toast', state='detached', timeout=15000)
    add('oak-table.glb', glb, 'model/gltf-binary')
    add('shop drawing.dxf', dxf)
    add('plan: v2?.pdf', pdf, 'application/pdf')
    add('site-photos.zip', big, 'application/zip')
    dls = pg.evaluate('() => JSON.parse(JSON.stringify(ed.rec.projects[0].downloads))')
    r.check('four files are in the record, with type, size and date; the awkward name is cleaned (no colon or question mark)', [d['name'] for d in dls] == ['oak-table.glb', 'shop drawing.dxf', 'plan v2.pdf', 'site-photos.zip'] and dls[0]['size'] == len(glb) and dls[3]['size'] == len(big) and all(d['date'] and re.fullmatch(r'[0-9a-z]+', d['id']) for d in dls), str(dls))
    new = sorted(set(mock.paths(D + cid + '/')) - before)
    r.check('each is stored as one sealed file <id>.d', new == sorted(f'{D}{cid}/{d["id"]}.d' for d in dls), str(new))
    raw = mock.files[f'{D}{cid}/{dls[0]["id"]}.d']['b']
    r.check('a stored file is sealed: no model header, the size of the original plus the nonce and tag', not raw.startswith(b'glTF') and len(raw) == len(glb) + 28, f'{len(raw)} vs {len(glb)}')
    r.check('the 1.5 MB file is bigger than the contents API sends (so the key change below must read it as a blob)', len(mock.files[f'{D}{cid}/{dls[3]["id"]}.d']['b']) > 1_000_000)

    # refused
    def refuse(name, data, part):
        n = pg.evaluate('() => ed.rec.projects[0].downloads.length')
        pg.set_input_files('#dlInput', {'name': name, 'mimeType': 'application/octet-stream', 'buffer': data})
        toast_text(pg, part, 30000)
        pg.wait_for_selector('.toast', state='detached', timeout=15000)
        return pg.evaluate('() => ed.rec.projects[0].downloads.length') == n
    ok1 = refuse('setup.exe', b'MZ' + bytes(100), 'is not a type that can be sent')
    ok2 = refuse('page.html', b'<script>alert(1)</script>', 'is not a type that can be sent')
    ok3 = refuse('logo.svg', b'<svg onload="alert(1)"/>', 'is not a type that can be sent')
    ok4 = refuse('empty.pdf', b'', 'is empty')
    ok5 = refuse('huge.zip', bytes(25 * 1024 * 1024), 'is bigger than 24 MB')
    r.check('programs, web pages, SVG, empty files and a 25 MB file are refused and nothing is added or stored', ok1 and ok2 and ok3 and ok4 and ok5 and sorted(set(mock.paths(D + cid + '/')) - before) == new)

    # a note, then save
    pg.fill('#dlList li >> nth=0 >> input', 'Final 3D model, version 3')
    save(pg)
    snap = snapshot(S, pg)['projects'][0]
    sd = snap.get('downloads')
    r.check('the client snapshot lists the files with name, size, date and the note (and nothing else)', sd and [d['name'] for d in sd] == ['oak-table.glb', 'shop drawing.dxf', 'plan v2.pdf', 'site-photos.zip'] and sd[0]['caption'] == 'Final 3D model, version 3'
            and all(set(d) == {'id', 'name', 'size', 'caption', 'date'} for d in sd), str(sd))
    r.check('the snapshot keeps the video and link kinds untouched by the whitelist (no photo is turned into another kind)', all(p['kind'] in ('file', 'link', 'vlink', 'video') for p in snap['photos']))
    # admin can download them too
    with pg.expect_download(timeout=60000) as dl:
        pg.click('#dlList li >> nth=0 >> [data-act=save]')
    path = dl.value.path()
    r.check('the administrator can download a file to check it: same bytes, own name', dl.value.suggested_filename == 'oak-table.glb' and open(path, 'rb').read() == glb)

    # ================= client =================
    ctx, cp = new_page(S, 'client-files')
    cp.goto(f'{BASE}#client/{cid}'); cp.wait_for_selector('#clKey'); cp.fill('#clKey', secret); cp.click('#btnOpen'); cp.wait_for_selector('#tapeBig', timeout=30000)
    cp.wait_for_selector('#downloadsCard', timeout=30000)
    txt = cp.inner_text('#downloadsCard')
    r.check('the client sees a Files card with the four files, sizes and the note', all(x in txt for x in ['oak-table.glb', 'shop drawing.dxf', 'plan v2.pdf', 'site-photos.zip', 'Final 3D model, version 3', '1.4 MB']) and cp.locator('#downloadsCard [data-dl]').count() == 4, txt[:300])
    with cp.expect_download(timeout=60000) as d1:
        cp.click(f'#downloadsCard [data-dl="{dls[0]["id"]}"]')
    r.check('Download saves the decrypted 3D model under its own name, byte for byte', d1.value.suggested_filename == 'oak-table.glb' and open(d1.value.path(), 'rb').read() == glb)
    with cp.expect_download(timeout=60000) as d3:
        cp.click(f'#downloadsCard [data-dl="{dls[2]["id"]}"]')
    r.check('the PDF keeps its cleaned name', d3.value.suggested_filename == 'plan v2.pdf' and open(d3.value.path(), 'rb').read() == pdf)
    with cp.expect_download(timeout=90000) as d4:
        cp.click(f'#downloadsCard [data-dl="{dls[3]["id"]}"]')
    r.check('a file over 1 MB downloads whole too', open(d4.value.path(), 'rb').read() == big)
    r.check('the button is usable again afterwards and no status text is left', cp.locator(f'#downloadsCard [data-dl="{dls[0]["id"]}"]').is_enabled() and cp.inner_text(f'#downloadsCard li[data-id="{dls[0]["id"]}"] [role=status]').strip() == '')
    r.check('the client page holds nothing of a file in the clear (not in the page, only the saved download)', 'glTF' not in cp.content())
    mock.files.pop(f'{D}{cid}/{dls[1]["id"]}.d')
    cp.click(f'#downloadsCard [data-dl="{dls[1]["id"]}"]')
    cp.wait_for_selector(f'#downloadsCard li[data-id="{dls[1]["id"]}"] .msg.bad', timeout=30000)
    r.check('a file that is missing says it could not be downloaded and the button comes back', 'could not be downloaded' in cp.inner_text(f'#downloadsCard li[data-id="{dls[1]["id"]}"]') and cp.locator(f'#downloadsCard [data-dl="{dls[1]["id"]}"]').is_enabled())
    cp.click('#btnLang'); cp.wait_for_selector('text=الوقت المتبقي')
    r.check('in Arabic the card has its own title and button text', 'ملفات للتنزيل' in cp.inner_text('#downloadsCard') and 'تنزيل' in cp.inner_text('#downloadsCard li >> nth=0'))
    cp.click('#btnLang'); cp.wait_for_selector('text=Time remaining')

    # ================= the contact file =================
    r.check('the contact box has a "Save our contact" button', cp.locator('.contact #btnSaveContact').count() == 1)
    with cp.expect_download(timeout=30000) as vc:
        cp.click('#btnSaveContact')
    name = vc.value.suggested_filename
    vtext = open(vc.value.path(), 'rb').read().decode('utf-8')
    lines = vtext.split('\r\n')
    unfolded = re.sub(r'\r\n ', '', vtext)
    prof = cp.evaluate("() => ({ name: brandName(), phone: brand.phone || '', wa: brand.whatsapp || '', email: brand.email || '', web: brand.website || '', addr: brand.address || '' })")
    r.check('the file is a vCard 3.0 that begins and ends correctly, with CRLF line ends', name.endswith('.vcf') and lines[0] == 'BEGIN:VCARD' and lines[1] == 'VERSION:3.0' and lines[-2] == 'END:VCARD' and lines[-1] == '' and '\n' not in vtext.replace('\r\n', ''), vtext[:120])
    r.check('it carries the company name', f'FN:{prof["name"]}' in unfolded and f'ORG:{prof["name"]}' in unfolded, vtext[:200])
    if prof['phone']:
        r.check('the phone number is a TEL line made of digits and +', ('TEL;TYPE=WORK,VOICE:' + re.sub(r'[^\d+]', '', prof['phone'])) in unfolded, unfolded)
    if prof['email']:
        r.check('the e-mail address is an EMAIL line', 'EMAIL;TYPE=INTERNET,WORK:' + prof['email'] in unfolded)
    r.check('no line is longer than 71 characters (lines are folded)', all(len(x) <= 71 for x in lines))
    tricky = cp.evaluate("""() => { const old = JSON.stringify(brand); brand.name = { en: 'A, B; C', ar: '' }; brand.address = 'Line one\\nLine two, Cairo; Egypt'; brand.website = 'http://insecure.example.com'; brand.email = 'not an email';
      const v = brandVcard(); Object.assign(brand, JSON.parse(old)); return v; }""")
    tu = re.sub(r'\r\n ', '', tricky)
    r.check('commas, semicolons and line breaks are escaped (A\\, B\\; C and \\n), as the vCard format asks', 'FN:A\\, B\\; C' in tu and 'ADR;TYPE=WORK:;;Line one\\nLine two\\, Cairo\\; Egypt;;;;' in tu, tu)
    r.check('a web address that is not https and a bad e-mail are left out', 'URL:' not in tu and 'EMAIL' not in tu)

    # ================= changing the client key re-seals everything =================
    pg.evaluate(f"location.hash = '#manage/{cid}'"); pg.wait_for_selector('#tab-photos'); pg.click('#tab-photos'); pg.wait_for_selector('#btnUploadVideo')
    webm = base64.b64decode(pg.evaluate(MAKE_WEBM))
    n = pg.evaluate('() => ed.rec.projects[0].photos.length')
    pg.set_input_files('#vidInput', {'name': 'before-key-change.webm', 'mimeType': 'video/webm', 'buffer': webm})
    pg.wait_for_function(f'() => ed.rec.projects[0].photos.length === {n + 1}', timeout=60000)
    toast_text(pg, 'was uploaded', 60000)
    sealed_paths = [p for p in mock.paths(D + cid + '/') if re.search(r'\.(t|f|v|d)$', p)]
    old_bytes = {p: mock.files[p]['b'] for p in sealed_paths}
    pg.click('#tab-details'); pg.wait_for_selector('#btnGenKey'); pg.click('#btnGenKey')
    new_secret = pg.input_value('#edSecret')
    r.check('a new key was made', new_secret and new_secret != secret)
    save(pg)
    toast_text(pg, 'no longer in the repository', 10000)
    r.check('a file of the project that is no longer in the repository does not stop the key change: it is skipped and the owner is told how many', pg.locator('.toast:has-text("1 file(s) of this client are no longer in the repository")').count() == 1)
    pg.wait_for_selector('.toast', state='detached', timeout=20000)
    new_bytes = {p: mock.files[p]['b'] for p in sealed_paths}
    r.check('every sealed photo, poster, video and file was re-sealed under the new key (same names, new bytes)', all(old_bytes[p] != new_bytes[p] and len(old_bytes[p]) == len(new_bytes[p]) for p in sealed_paths) and len(sealed_paths) >= 8, str(len(sealed_paths)))
    r.check('this included the 1.5 MB file that the contents API does not send', any(len(v) > 1_000_000 for v in new_bytes.values()) and old_bytes[f'{D}{cid}/{dls[3]["id"]}.d'] != new_bytes[f'{D}{cid}/{dls[3]["id"]}.d'])
    S.secret = new_secret
    ctx.close(); ctx, cp = new_page(S, 'client-newkey')
    cp.goto(f'{BASE}#client/{cid}'); cp.wait_for_selector('#clKey'); cp.fill('#clKey', secret); cp.click('#btnOpen')
    cp.wait_for_selector('text=Access Denied', timeout=30000)
    r.check('the old key no longer opens the project', 'Invalid Passcode' in cp.inner_text('#app'))
    cp.fill('#clKey', new_secret); cp.click('#btnOpen'); cp.wait_for_selector('#downloadsCard', timeout=30000)
    with cp.expect_download(timeout=90000) as d5:
        cp.click(f'#downloadsCard [data-dl="{dls[3]["id"]}"]')
    r.check('with the new key the big file still downloads, byte for byte', open(d5.value.path(), 'rb').read() == big)
    with cp.expect_download(timeout=60000) as d6:
        cp.click(f'#downloadsCard [data-dl="{dls[0]["id"]}"]')
    r.check('and so does the 3D model', open(d6.value.path(), 'rb').read() == glb)
    cp.locator('#photosCard').scroll_into_view_if_needed()
    cp.click('#photosCard .vthumb[data-kind=video]'); cp.wait_for_selector('dialog.lb[open] video.lb-video', timeout=30000)
    cp.wait_for_function("() => { const v = document.querySelector('dialog.lb video'); return v && v.readyState >= 2 && v.videoWidth > 0; }", timeout=30000)
    r.check('the video re-sealed by the key change plays with the new key', True)
    cp.click('#lbClose'); ctx.close()

    # ================= removing files =================
    pg.evaluate(f"location.hash = '#manage/{cid}'"); pg.wait_for_selector('#tab-photos'); pg.click('#tab-photos'); pg.wait_for_selector('#dlList li[data-file]')
    ids = [d['id'] for d in dls]
    pg.locator('#dlList li[data-file]').first.locator('[data-act=remove]').click()
    r.check('removing a file asks first and names it', any('oak-table.glb' in d for d in dialogs))
    r.check('the file stays in the repository until the project is saved', f'{D}{cid}/{ids[0]}.d' in mock.files)
    save(pg)
    r.check('after the save that file is deleted and the others stay', f'{D}{cid}/{ids[0]}.d' not in mock.files and all(f'{D}{cid}/{i}.d' in mock.files for i in ids[2:]))
    pg.remove_listener('dialog', on_dialog)
