"""Admin (4.6): brands, the picture of a product, and invoices kept with an expense or a shipment.
Settings > Brands (add, rename, duplicate refused, removal says how many materials use it); an inventory item points at a brand and carries a picture (a small one kept in the
record for the lists, a larger one sealed in data/private/files/<id>.bin); the inventory can be filtered by brand; an expense and a shipment keep PDFs and pictures as sealed
files; a file removed from a record is deleted after the save, a record that is deleted takes its files with it; too big and wrong files are refused; the files are re-sealed by
the key change; the write guard knows the folder.
Needs the chain of s01 - s04 and s11 - s13, s17 (a supplier, the Finance screen)."""
import io, json, re
from PIL import Image
from lib import *

FILES = 'data/private/files/'
INV = 'data/private/ops/inventory.json'


def png(w=400, h=300, color=(200, 90, 40)):
    im = Image.new('RGB', (w, h), color)
    for x in range(0, w, 8):
        for y in range(0, h, 8):
            if (x // 8 + y // 8) % 2: im.putpixel((x, y), (20, 20, 20))
    b = io.BytesIO(); im.save(b, 'PNG'); return b.getvalue()


def pdf(n=3000):
    return b'%PDF-1.4\n' + (b'% invoice line of text\n' * (n // 24)) + b'\n%%EOF\n'


def bins(mock):
    return mock.paths(FILES)


def to_settings(pg):
    if pg.evaluate('location.hash') == '#settings':
        pg.evaluate("location.hash = '#dashboard'"); pg.wait_for_selector('#dashSearch', timeout=30000)
    pg.evaluate("location.hash = '#settings'"); pg.wait_for_selector('#brandsCard', timeout=30000)


def save_settings(pg):
    try: pg.wait_for_selector('.toast', state='detached', timeout=8000)
    except Exception: pass
    pg.click('#btnSaveSettings'); toast_text(pg, 'Settings saved', 30000); pg.wait_for_selector('#brandsCard')


def run(S):
    r, mock, pg = S.r, S.mock, S.admin
    pg.set_viewport_size({'width': 1280, 'height': 900})
    dialogs = []
    dlg = {'accept': True}
    on_dialog = lambda d: (dialogs.append(d.message), d.accept() if dlg['accept'] else d.dismiss())
    pg.on('dialog', on_dialog)

    # ================= brands =================
    to_settings(pg)
    r.check('Settings has a Brands card, empty at first', 'No brand yet' in pg.inner_text('#brandsCard') and pg.locator('#brAdd').is_enabled())
    for i, name in enumerate(['Egger', 'Blum', 'Hettich']):
        pg.click('#brAdd'); pg.wait_for_selector(f'#brName-{i}'); pg.fill(f'#brName-{i}', name)
    pg.click('#brAdd'); pg.wait_for_selector('#brName-3')                                      # a blank row: dropped on save
    r.check('the typed names survive adding another row (the draft is kept)', pg.input_value('#brName-0') == 'Egger' and pg.input_value('#brName-2') == 'Hettich')
    pg.fill('#brName-3', 'egger')
    pg.click('#btnSaveSettings'); pg.wait_for_selector('.msg.bad:not([hidden])', timeout=15000)
    r.check('a brand typed twice (any capitals) is refused with its name', 'egger' in pg.inner_text('.msg.bad').lower() and 'twice' in pg.inner_text('.msg.bad'), pg.inner_text('.msg.bad'))
    pg.fill('#brName-3', '')
    save_settings(pg)
    br = pg.evaluate('() => JSON.parse(JSON.stringify(session.settings.brands))')
    r.check('Save keeps the three brands (the blank row is dropped) with ids of the form b + 8 hex digits', len(br) == 3 and all(re.fullmatch(r'b[0-9a-f]{8}', x['id']) for x in br) and [x['name'] for x in br] == ['Egger', 'Blum', 'Hettich'], str(br))
    r.check('settings stay one sealed file (no brand name in the clear)', set(json.loads(mock.text('data/private/settings.json'))) == {'v', 'iv', 'ct'} and 'Hettich' not in mock.text('data/private/settings.json'))
    egger, blum = br[0]['id'], br[1]['id']

    # ================= an inventory item: brand and picture =================
    pg.evaluate("location.hash = '#inventory'"); pg.wait_for_selector('#btnNewItem', timeout=60000)
    pg.click('#btnNewItem'); pg.wait_for_selector('#invName')
    pg.fill('#invName', 'Oak veneer board 18 mm'); pg.fill('#invQty', '12'); pg.fill('#invMin', '4')
    opts = pg.locator('#invBrand option').all_inner_texts()
    r.check('the brand drop-down lists "No brand" and the brands in order', opts == ['No brand', 'Blum', 'Egger', 'Hettich'], str(opts))
    r.check('the item form has a picture card with an empty frame', 'No picture' in pg.inner_text('#invImagePreview') and pg.locator('#btnImgAdd').count() == 1 and pg.locator('#btnImgRemove').count() == 0)
    pg.select_option('#invBrand', egger)
    pg.set_input_files('#invImageInput', {'name': 'oak.png', 'mimeType': 'image/png', 'buffer': png()})
    pg.wait_for_selector('img#invImagePreview', timeout=30000)
    thumb = pg.evaluate('() => opsEd.rec.thumb'); iid = pg.evaluate('() => opsEd.rec.image')
    r.check('a small picture (a JPEG data address under 4,500 characters) is made and a file id is given before saving', thumb.startswith('data:image/jpeg;base64,') and len(thumb) <= 4500 and re.fullmatch(r'f[0-9a-f]{16}', iid), f'{len(thumb)} {iid}')
    r.check('nothing is uploaded until the record is saved', bins(mock) == [] and 'Unsaved' in pg.inner_text('.savebar'))
    save(pg)
    item_id = pg.evaluate('location.hash').split('/')[-1]
    r.check('after Save the sealed file exists under the id the record names', bins(mock) == [FILES + iid + '.bin'], str(bins(mock)))
    raw = mock.files[FILES + iid + '.bin']['b']
    r.check('the file is sealed: no PNG or JPEG header and no readable picture inside', not raw.startswith((b'\x89PNG', b'\xff\xd8')) and len(raw) < 780000 and len(raw) > 200)
    got = pg.evaluate("async (id) => { const b = await attGet(id); return [b[0], b[1], b.length]; }", iid)
    r.check('opening it with the key gives back a JPEG (FF D8) of a size that fits', got[0] == 0xFF and got[1] == 0xD8 and 1000 < got[2] < 780000, str(got))
    rec = pg.evaluate("(id) => JSON.parse(JSON.stringify(opsFind('inventory', id)))", item_id)
    r.check('the record keeps the brand id, the small picture and the file id', rec['brandId'] == egger and rec['image'] == iid and rec['thumb'] == thumb, str({k: rec[k] for k in ('brandId', 'image')}))
    r.check('the item file stays sealed (no brand id and no picture in the clear)', set(json.loads(mock.text(INV))) == {'v', 'iv', 'ct'} and egger not in mock.text(INV))

    # ================= lists show them, the brand filter works =================
    pg.click('a.back'); pg.wait_for_selector('#invList')
    pg.fill('#invSearch', 'oak')
    pg.wait_for_selector('.inv-item .prodthumb', timeout=15000)
    txt = pg.inner_text('#invList')
    r.check('the list shows the small picture and the brand of the item (table on a wide screen)', pg.locator('#invList .prodthumb').count() >= 1 and 'Egger' in txt, txt[:200])
    r.check('the brand filter appears once brands exist and offers them', pg.locator('#invBrandFilter').count() == 1 and 'Hettich' in pg.locator('#invBrandFilter option').all_inner_texts())
    pg.fill('#invSearch', '')
    pg.select_option('#invBrandFilter', egger)
    r.check('filtering by Egger keeps this item and hides the others', pg.locator('.inv-item', has_text='Oak veneer').count() == 1 and pg.locator('.inv-item').count() == 1, str(pg.locator('.inv-item').count()))
    pg.select_option('#invBrandFilter', blum)
    r.check('filtering by Blum shows none of them', pg.locator('.inv-item').count() == 0)
    pg.select_option('#invBrandFilter', '-')
    r.check('"No brand" lists the materials that have none and not this one', pg.locator('.inv-item').count() >= 1 and pg.locator('.inv-item', has_text='Oak veneer').count() == 0)
    pg.select_option('#invBrandFilter', '')
    pg.fill('#invSearch', 'egger')
    r.check('the search also looks at the brand name', pg.locator('.inv-item', has_text='Oak veneer').count() == 1)
    pg.set_viewport_size({'width': 390, 'height': 800}); pg.evaluate('() => { invSel.view = "cards"; drawInventory(); }'); pg.wait_for_selector('.invcards')
    pg.fill('#invSearch', 'oak')
    r.check('the cards view shows the picture and a brand chip too', pg.locator('.invcards .prodthumb').count() == 1 and pg.locator('.invcards .chip[data-brand]').count() == 1)
    pg.evaluate('() => { invSel.view = ""; invSel.q = ""; }'); pg.set_viewport_size({'width': 1280, 'height': 900})

    # ================= replace and remove the picture =================
    pg.evaluate(f"location.hash = '#inventory/{item_id}'"); pg.wait_for_selector('#invImageCard', timeout=30000)
    r.check('opening the item again shows the picture and the Replace / Remove buttons', pg.locator('img#invImagePreview').count() == 1 and 'Replace' in pg.inner_text('#btnImgAdd') and pg.locator('#btnImgRemove').count() == 1)
    pg.set_input_files('#invImageInput', {'name': 'oak2.png', 'mimeType': 'image/png', 'buffer': png(300, 300, (30, 120, 200))})
    pg.wait_for_function('() => opsEd.rec.image !== ' + json.dumps(iid), timeout=30000)
    iid2 = pg.evaluate('() => opsEd.rec.image')
    r.check('before saving, the old file is still in the repository (a cancelled form must not lose it)', bins(mock) == [FILES + iid + '.bin'])
    save(pg)
    r.check('after saving, the new file is there and the old one is deleted', bins(mock) == [FILES + iid2 + '.bin'], str(bins(mock)))
    pg.click('#btnImgRemove'); save(pg)
    r.check('Remove picture then Save deletes the file and clears the record', bins(mock) == [] and pg.evaluate("(id) => { const x = opsFind('inventory', id); return [x.image, x.thumb]; }", item_id) == ['', ''])
    pg.set_input_files('#invImageInput', {'name': 'notes.txt', 'mimeType': 'text/plain', 'buffer': b'hello'})
    toast_text(pg, 'not a PDF or a picture', 15000)
    r.check('a file that is not a picture is refused with its name', pg.evaluate('() => opsEd.rec.image') == '')
    pg.set_input_files('#invImageInput', {'name': 'oak3.png', 'mimeType': 'image/png', 'buffer': png(200, 200)})
    pg.wait_for_function('() => opsEd.rec.image !== ""', timeout=30000)
    pg.evaluate("location.hash = '#inventory'"); pg.wait_for_selector('#invList', timeout=30000)
    r.check('leaving the form without saving uploads nothing', bins(mock) == [])
    dlg['accept'] = True

    # ================= an expense with invoices =================
    pg.evaluate("location.hash = '#expenses/new'"); pg.wait_for_selector('#expName', timeout=30000)
    pg.fill('#expName', 'Workshop rent, October'); pg.fill('#expAmount', '9000')
    r.check('the expense form has an Invoices card with an Add button and no file yet', 'No file yet' in pg.inner_text('#expFiles') and pg.locator('#expFilesAdd').count() == 1)
    pg.set_input_files('#expFilesInput', [{'name': 'rent-oct.pdf', 'mimeType': 'application/pdf', 'buffer': pdf()}, {'name': 'receipt.png', 'mimeType': 'image/png', 'buffer': png(1800, 1200)}])
    pg.wait_for_function('() => opsEd.rec.files.length === 2', timeout=30000)
    fl = pg.evaluate('() => opsEd.rec.files.map((f) => [f.name, f.type, f.size])')
    r.check('a PDF is kept as it is and a picture is turned into a JPEG that fits', fl[0][:2] == ['rent-oct.pdf', 'application/pdf'] and fl[0][2] == len(pdf()) and fl[1][:2] == ['receipt.jpg', 'image/jpeg'] and 1000 < fl[1][2] < 780000, str(fl))
    r.check('the rows show kind, name and size, each with Open, Download and Remove', pg.locator('.attrow').count() == 2 and 'PDF' in pg.inner_text('.attrow >> nth=0') and pg.locator('.attrow [data-act=remove]').count() == 2)
    save(pg)
    eid = pg.evaluate('location.hash').split('/')[-1]
    fids = pg.evaluate("(id) => opsFind('expenses', id).files.map((f) => f.id)", eid)
    r.check('Save uploads both as sealed files named by their ids', bins(mock) == sorted(FILES + i + '.bin' for i in fids) and len(fids) == 2, str(bins(mock)))
    got = pg.evaluate("async (id) => { const b = await attGet(id); return String.fromCharCode(...b.slice(0, 5)); }", fids[0])
    r.check('the PDF comes back byte for byte after opening it with the key', got == '%PDF-', got)
    r.check('the expense file lists the two files in the sealed record only', 'rent-oct' not in mock.text('data/private/ops/expenses.json'))
    # opening and downloading
    with pg.expect_download(timeout=30000) as dl:
        pg.click('.attrow >> nth=0 >> [data-act=save]')
    r.check('Download hands over the decrypted file under its own name', dl.value.suggested_filename == 'rent-oct.pdf', dl.value.suggested_filename)
    with pg.context.expect_page(timeout=30000) as pop:
        pg.click('.attrow >> nth=1 >> [data-act=view]')
    page2 = pop.value; page2.wait_for_load_state()
    r.check('Open shows the file from a private (blob) address in a new tab', page2.url.startswith('blob:'), page2.url[:40]); page2.close()
    # remove one
    pg.click('.attrow >> nth=1 >> [data-act=remove]'); pg.wait_for_selector('.attrow', state='attached')
    r.check('Remove asks first and names the file', any('receipt.jpg' in d for d in dialogs))
    r.check('the removed file is still in the repository until the record is saved', len(bins(mock)) == 2)
    save(pg)
    r.check('after Save only the remaining file is left', bins(mock) == [FILES + fids[0] + '.bin'], str(bins(mock)))
    # limits
    pg.set_input_files('#expFilesInput', {'name': 'huge.pdf', 'mimeType': 'application/pdf', 'buffer': pdf(900000)})
    toast_text(pg, 'too big', 20000)
    r.check('a PDF over the limit is refused with the limit stated', pg.evaluate('() => opsEd.rec.files.length') == 1 and 'huge.pdf' not in pg.inner_text('#expFiles'))
    pg.set_input_files('#expFilesInput', {'name': 'fake.pdf', 'mimeType': 'application/pdf', 'buffer': b'not a pdf at all'})
    toast_text(pg, 'could not be read', 20000)
    r.check('a file called PDF that is not one is refused', pg.evaluate('() => opsEd.rec.files.length') == 1)
    pg.set_input_files('#expFilesInput', [{'name': f'p{i}.png', 'mimeType': 'image/png', 'buffer': png(120, 90, (i * 20, 50, 90))} for i in range(9)])
    pg.wait_for_function('() => opsEd.rec.files.length === 8', timeout=40000)
    toast_text(pg, 'at most 8 files', 20000)
    r.check('a record keeps at most 8 files', pg.evaluate('() => opsEd.rec.files.length') == 8)
    pg.evaluate("location.hash = '#finance'"); pg.wait_for_selector('#finScreen', timeout=30000)
    r.check('files added and not saved are not uploaded when the form is left', len(bins(mock)) == 1)

    # ================= a shipment with an invoice =================
    pg.evaluate("location.hash = '#logistics/new'"); pg.wait_for_selector('#lgTitle', timeout=30000)
    pg.fill('#lgTitle', 'Board delivery from supplier')
    r.check('the shipment form has the same Invoices card', pg.locator('#lgFiles').count() == 1 and pg.locator('#lgFilesAdd').count() == 1)
    pg.set_input_files('#lgFilesInput', {'name': 'delivery-note.pdf', 'mimeType': 'application/pdf', 'buffer': pdf(5000)})
    pg.wait_for_function('() => opsEd.rec.files.length === 1', timeout=30000)
    save(pg)
    sid = pg.evaluate('location.hash').split('/')[-1]
    sf = pg.evaluate("(id) => opsFind('logistics', id).files.map((f) => f.id)", sid)
    r.check('the shipment keeps its file as a sealed file', len(sf) == 1 and FILES + sf[0] + '.bin' in bins(mock) and len(bins(mock)) == 2)

    # ================= the write guard and the key change =================
    wa = pg.evaluate("() => [writeAreas('data/private/files/f0123456789abcdef.bin'), writeAreas('data/private/files/x.bin')]")
    r.check('the write guard lets the inventory, logistics and finance roles write files (and nobody else)', wa[0] == ['inventory', 'logistics', 'finance'])
    before = {p: mock.files[p]['b'] for p in bins(mock)}
    pg.evaluate("location.hash = '#team'"); pg.wait_for_selector('#rotPw', timeout=30000)
    pg.fill('#rotPw', PW1); pg.click('#btnRotate'); pg.wait_for_selector('#rotMsg.ok', timeout=90000)
    after = {p: mock.files[p]['b'] for p in bins(mock)}
    r.check('the key change re-sealed every file of invoices and pictures (new bytes, same names)', set(before) == set(after) and all(before[p] != after[p] for p in before), str(len(after)))
    got = pg.evaluate("async (id) => { const b = await attGet(id); return String.fromCharCode(...b.slice(0, 5)); }", fids[0])
    r.check('after the key change the PDF still opens, byte for byte, with the new key', got == '%PDF-', got)
    r.check('and the key change was still one commit', sum(1 for c in mock.commits if c[0] == 'COMMIT' and c[2] == 'Change encryption key') >= 1)

    # ================= deleting a record takes its files with it =================
    pg.evaluate(f"location.hash = '#expenses/{eid}'"); pg.wait_for_selector('#btnOpsDelete', timeout=30000)
    pg.click('#btnOpsDelete'); pg.wait_for_selector('#finScreen', timeout=30000)
    wait_until(pg, lambda: len(bins(mock)) == 1, 20, what='expense file deleted')
    r.check('deleting an expense deletes its invoice files', bins(mock) == [FILES + sf[0] + '.bin'], str(bins(mock)))
    pg.evaluate(f"location.hash = '#logistics/{sid}'"); pg.wait_for_selector('#btnOpsDelete', timeout=30000)
    pg.click('#btnOpsDelete'); pg.wait_for_selector('#lgScreen', timeout=30000)
    wait_until(pg, lambda: len(bins(mock)) == 0, 20, what='shipment file deleted')
    r.check('deleting the shipment deletes its file too: nothing is left behind', bins(mock) == [])
    # ================= removing a brand =================
    to_settings(pg)
    n0 = len(dialogs)
    pg.click('#brDel-1')
    r.check('removing a brand that no material uses (Blum) asks nothing', len(dialogs) == n0)
    pg.click('#brDel-0')
    r.check('removing one that a material uses (Egger) asks first and says how many', len(dialogs) == n0 + 1 and 'Egger' in dialogs[-1] and '1 material' in dialogs[-1], str(dialogs[-1:]))
    save_settings(pg)
    r.check('the list now holds only Hettich', pg.evaluate('() => session.settings.brands.map((b) => b.name)') == ['Hettich'])
    pg.evaluate(f"location.hash = '#inventory/{item_id}'"); pg.wait_for_selector('#invBrand', timeout=30000)
    r.check('the item that pointed at the removed brand keeps the id and the form says the brand was removed', pg.input_value('#invBrand') == egger and '(removed brand)' in pg.locator('#invBrand option').all_inner_texts())
    pg.evaluate("location.hash = '#inventory'"); pg.wait_for_selector('#invList', timeout=30000)
    r.check('the list shows no brand chip for it any more and the material is still there', pg.locator('.inv-item', has_text='Oak veneer').count() == 1 and pg.locator('[data-brand]').count() == 0)
    pg.evaluate(f"location.hash = '#inventory/{item_id}'"); pg.wait_for_selector('#btnOpsDelete', timeout=30000)
    pg.click('#btnOpsDelete'); pg.wait_for_selector('#invList', timeout=30000)
    pg.remove_listener('dialog', on_dialog)
