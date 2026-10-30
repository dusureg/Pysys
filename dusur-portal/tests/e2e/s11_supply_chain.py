"""Admin: the Supply Chain Management section (#suppliers): the supplier directory with phone, WhatsApp, e-mail, website, location, map link, link and address;
add / edit / validate / deactivate, search and filters, links that are safe to open, sealed storage, a change made on another device, Arabic."""
import json, re
from mockgh import ADMIN_URL
from lib import *

SUP = 'data/private/ops/suppliers.json'


def fill_supplier(pg, **v):
    ids = dict(name='supName', contact='supContact', terms='supTerms', phone='supPhone', phone2='supPhone2', email='supEmail', website='supWebsite', location='supLocation',
               mapLink='supMapLink', link='supLink', lead='supLead', address='supAddress', notes='supNotes')
    for k, val in v.items():
        if k == 'category':
            pg.select_option('#supCategory', val)
        else:
            pg.fill('#' + ids[k], val)


def run(S):
    r, mock, pg = S.r, S.mock, S.admin
    pg.set_viewport_size({'width': 1280, 'height': 900})
    dialogs = []
    on_dialog = lambda d: (dialogs.append(d.message), d.dismiss())
    pg.on('dialog', on_dialog)

    # ---- the menu and the empty screen
    items = pg.eval_on_selector_all('#adminNav a', 'els => els.map(e => e.dataset.route)')
    r.check('the menu has Logistics, Supply chain and Inventory as their own items', all(x in items for x in ('logistics', 'suppliers', 'inventory')), str(items))
    pg.click('#adminNav a[data-route=suppliers]'); pg.wait_for_selector('#supScreen')
    r.check('Supply chain opens #suppliers with its own heading and a highlighted menu item', pg.evaluate('location.hash') == '#suppliers' and 'Supply Chain Management' in pg.inner_text('h1')
            and pg.get_attribute('#adminNav a[data-route=suppliers]', 'aria-current') == 'page')
    r.check('empty state invites to add the first supplier', 'No suppliers yet' in pg.inner_text('#supList'))
    r.check('nothing is written to the repository just by opening the section', SUP not in mock.files)

    # ---- add one supplier with every field
    pg.click('#btnNewSup'); pg.wait_for_selector('#supName')
    r.check('new supplier form: #suppliers/new', pg.evaluate('location.hash') == '#suppliers/new')
    fill_supplier(pg, name='Al Nour Boards', category='boards', contact='Hassan Ali', terms='30% advance, rest on delivery', phone='0100 123 4567', phone2='+20 2 2345 6789',
                  email='sales@alnour-boards.example', website='www.alnour-boards.example', location='10th of Ramadan City', mapLink='https://maps.app.goo.gl/abc123',
                  link='https://facebook.com/alnourboards', lead='5', address='Industrial Zone B2, Plot 14, 10th of Ramadan', notes='Best price on 18 mm MDF')
    save(pg)
    r.check('saved: the address becomes #suppliers/SUP-001 and the sealed file exists', pg.evaluate('location.hash') == '#suppliers/SUP-001' and SUP in mock.files)
    env = json.loads(mock.text(SUP))
    blob = mock.text(SUP)
    r.check('the file is an AES-GCM envelope only (no name, phone, e-mail, address or link in the clear)', set(env) == {'v', 'iv', 'ct'} and not [s for s in ('Al Nour', '0100', 'alnour', 'Hassan', 'Ramadan', 'maps.app') if s in blob])
    r.check('the supplier is not published anywhere public (clients folder, search index, public folder)', not [p for p in mock.paths('data/') if ('ops' not in p) and (b'Nour' in mock.files[p]['b'] or b'alnour' in mock.files[p]['b'])])
    r.check('commit message names the file, not the supplier', [c[2] for c in mock.commits if c[1] == SUP][-1] == 'Add suppliers')

    # ---- the list shows safe, working contact links
    pg.click('#adminNav a[data-route=suppliers]'); pg.wait_for_selector('.sup-item')
    card = pg.locator('.sup-item').first
    txt = card.inner_text()
    r.check('card shows name, id, category, contact person, address and location', all(x in txt for x in ('Al Nour Boards', 'SUP-001', 'Boards and panels', 'Hassan Ali', 'Industrial Zone B2', '10th of Ramadan City')), txt)
    hrefs = card.locator('a').evaluate_all('els => els.map(e => [e.getAttribute("href"), e.target, e.rel, e.textContent.trim()])')
    h = {x[0]: x for x in hrefs}
    r.check('phone is a tel: link with digits only', 'tel:01001234567' in h and 'tel:+20223456789' in h, str(hrefs))
    r.check('WhatsApp link uses the country code (01… becomes 201…) and opens in a new tab safely', 'https://wa.me/201001234567' in h and h['https://wa.me/201001234567'][1] == '_blank' and 'noopener' in h['https://wa.me/201001234567'][2], str(hrefs))
    r.check('e-mail is a mailto: link', 'mailto:sales@alnour-boards.example' in h)
    r.check('website gets https:// and shows only the host; every external link has rel=noopener', 'https://www.alnour-boards.example/' in h and h['https://www.alnour-boards.example/'][3] == 'alnour-boards.example'
            and all('noopener' in x[2] for x in hrefs if x[1] == '_blank'), str(hrefs))
    r.check('map link and other link are present', 'https://maps.app.goo.gl/abc123' in h and 'https://facebook.com/alnourboards' in h)
    r.check('lead time and payment terms show as chips', 'Delivers in 5 days' in txt and '30% advance' in txt)

    # ---- validation: nothing bad is saved
    pg.click('#btnNewSup'); pg.wait_for_selector('#supName')
    pg.click('#btnSave'); toast_text(pg, 'Enter the supplier name')
    r.check('a supplier needs a name', True)
    fill_supplier(pg, name='Al Nour Boards'); pg.click('#btnSave'); toast_text(pg, 'already exists')
    r.check('a duplicate name is refused', True)
    fill_supplier(pg, name='Bad Supplier', email='not-an-email'); pg.click('#btnSave'); toast_text(pg, 'e-mail address is not valid')
    fill_supplier(pg, email='', phone='call me'); pg.click('#btnSave'); toast_text(pg, 'phone number may contain only')
    fill_supplier(pg, phone='01234567', website='javascript:alert(1)'); pg.click('#btnSave'); toast_text(pg, 'not a valid web address')
    fill_supplier(pg, website='data:text/html,<script>1</script>'); pg.click('#btnSave'); toast_text(pg, 'not a valid web address')
    fill_supplier(pg, website='', mapLink='ftp://files.example.com/x'); pg.click('#btnSave'); toast_text(pg, 'not a valid web address')
    r.check('bad e-mail, bad phone, javascript:, data: and ftp: addresses are all refused with a clear message', True)
    r.check('still only one supplier in the file after the refusals', len([c for c in mock.commits if c[1] == SUP]) == 1 and pg.evaluate("() => opsList('suppliers').length") == 1)

    # ---- unsaved changes are protected
    pg.evaluate("location.hash = '#dashboard'"); pg.wait_for_timeout(300)
    r.check('leaving a form with unsaved text asks first and stays on the form when you cancel', dialogs and 'unsaved' in dialogs[-1].lower() and pg.evaluate('location.hash') == '#suppliers/new', str(dialogs))
    pg.fill('#supName', 'Cairo Hardware Co'); fill_supplier(pg, category='hardware', phone='0111 222 3333', website='', mapLink='', location='Shubra', address='12 Shubra St')
    save(pg)
    r.check('the second supplier is SUP-002', pg.evaluate('location.hash') == '#suppliers/SUP-002')

    # ---- search, filters, deactivate
    pg.click('#adminNav a[data-route=suppliers]'); pg.wait_for_selector('.sup-item')
    r.check('both suppliers listed, sorted by name, with a count', pg.locator('.sup-item').count() == 2 and '2 of 2' in pg.inner_text('#supCount') and pg.locator('.sup-item strong').first.inner_text() == 'Al Nour Boards')
    pg.fill('#supSearch', '0111'); r.check('search by a phone number', pg.locator('.sup-item').count() == 1 and 'Cairo Hardware' in pg.inner_text('#supList'))
    pg.fill('#supSearch', 'ramadan'); r.check('search by location, case-insensitive', pg.locator('.sup-item').count() == 1 and 'Al Nour' in pg.inner_text('#supList'))
    pg.fill('#supSearch', 'zzz'); r.check('no match message', 'No supplier matches' in pg.inner_text('#supList'))
    pg.fill('#supSearch', ''); pg.select_option('#supCat', 'hardware'); r.check('category filter', pg.locator('.sup-item').count() == 1 and 'Cairo' in pg.inner_text('#supList'))
    pg.select_option('#supCat', '')
    pg.locator('.sup-item', has_text='Cairo Hardware').locator('a:has-text("Edit")').click(); pg.wait_for_selector('#supActive')
    pg.uncheck('#supActive'); save(pg)
    pg.click('#adminNav a[data-route=suppliers]'); pg.wait_for_selector('.sup-item')
    r.check('an inactive supplier leaves the default list but is kept', pg.locator('.sup-item').count() == 1)
    pg.select_option('#supShow', 'inactive'); r.check('and shows under "Inactive suppliers" with a badge', pg.locator('.sup-item').count() == 1 and 'Inactive' in pg.inner_text('#supList'))
    pg.select_option('#supShow', 'all'); r.check('and under All suppliers', pg.locator('.sup-item').count() == 2)
    pg.select_option('#supShow', 'active')

    # ---- a change made on another device: nothing is lost
    ctx2 = S.admin_ctx
    pg2 = ctx2.new_page(); errs2 = []
    pg2.on('pageerror', lambda e: S.errors.append(('admin2', 'pageerror', str(e))))
    pg2.goto(ADMIN_URL + '#suppliers'); pg2.wait_for_selector('#lockPw'); unlock(pg2, PW1); pg2.wait_for_selector('#supScreen')
    pg2.click('#btnNewSup'); pg2.wait_for_selector('#supName'); fill_supplier(pg2, name='Delta Glass', category='glass', phone='0122 000 1111'); save(pg2)
    pg2.close()
    pg.locator('.sup-item', has_text='Al Nour').locator('a:has-text("Edit")').click(); pg.wait_for_selector('#supNotes')
    pg.fill('#supNotes', 'Best price on 18 mm MDF; ask for Hassan'); save(pg)     # this device still holds the old copy of the file
    S.errors[:] = [e for e in S.errors if not (e[0] == 'admin' and '409' in e[2])]          # the browser logs the refused first attempt (409): that is the conflict being detected, then re-applied
    names = json.loads(pg.evaluate("() => JSON.stringify(opsList('suppliers').map((s) => s.name))"))
    r.check('saving on a device with an old copy keeps the supplier added on the other device (the change is re-applied on the fresh file)', sorted(names) == ['Al Nour Boards', 'Cairo Hardware Co', 'Delta Glass'], str(names))
    pg.evaluate("() => { delete ops.suppliers; }")
    pg.click('#adminNav a[data-route=suppliers]'); pg.wait_for_selector('.sup-item')
    r.check('after a refresh from the repository the list shows the active ones (Cairo is inactive) and the new note is stored', pg.locator('.sup-item').count() == 2 and 'Delta Glass' in pg.inner_text('#supList')
            and 'ask for Hassan' in pg.evaluate("() => opsFind('suppliers', 'SUP-001').notes"))

    # ---- Arabic
    pg.click('#btnNewSup'); pg.wait_for_selector('#supName'); fill_supplier(pg, name='مؤسسة الأمل للأخشاب')
    pg.click('#btnLang'); pg.wait_for_function("() => document.documentElement.lang === 'ar'")
    r.check('switching to Arabic keeps what was typed, RTL, Arabic labels', pg.input_value('#supName') == 'مؤسسة الأمل للأخشاب' and pg.evaluate('document.dir') == 'rtl' and 'اسم المورّد' in pg.inner_text('#app'))
    fill_supplier(pg, phone='0100 555 6666', email='amal@example.com'); pg.click('#btnSave')
    pg.wait_for_function("() => /SUP-00\\d/.test(location.hash)", timeout=20000)
    pg.click('#adminNav a[data-route=suppliers]'); pg.wait_for_selector('.sup-item')
    r.check('Arabic list: title, category chip and WhatsApp label are translated', 'إدارة سلسلة الإمداد' in pg.inner_text('h1') and 'واتساب' in pg.inner_text('#supList') and 'ألواح' in pg.inner_text('#supList'))
    pg.click('#btnLang'); pg.wait_for_function("() => document.documentElement.lang === 'en'")

    # ---- the report button
    pg.click('#btnSupPrint'); pg.wait_for_selector('#rpPaper')
    r.check('Printable report button opens the supplier directory report', pg.evaluate("document.querySelector('#rpType').value") == 'suppliers' and 'Al Nour Boards' in pg.inner_text('#rpPaper') and 'alnour-boards.example' in pg.inner_text('#rpPaper'))
    pg.evaluate("location.hash = '#dashboard'"); pg.wait_for_selector('#btnNewClient')
    pg.remove_listener('dialog', on_dialog)
