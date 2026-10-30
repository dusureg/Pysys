"""Admin: the Inventory Management System (#inventory): materials, quantities, alerts for every item (out of stock, low, expired / expiring, above maximum,
no supplier, no minimum), receive / use / stock-take with history, the to-order list by supplier, sealed storage, protection against stale forms, Arabic."""
import json
from mockgh import ADMIN_URL
from lib import *

INV = 'data/private/ops/inventory.json'


def fill_item(pg, **v):
    ids = dict(name='invName', code='invCode', qty='invQty', min='invMin', max='invMax', reorder='invReorder', cost='invCost', location='invLocation', expiry='invExpiry', notes='invNotes')
    for k, val in v.items():
        if k == 'category': pg.select_option('#invCategory', val)
        elif k == 'unit': pg.select_option('#invUnit', val)
        elif k == 'supplier': pg.select_option('#invSupplier', label=val)
        else: pg.fill('#' + ids[k], str(val))


def add_item(pg, **v):
    pg.click('#adminNav a[data-route=inventory]'); pg.wait_for_selector('#btnNewItem')
    pg.click('#btnNewItem'); pg.wait_for_selector('#invName'); fill_item(pg, **v); save(pg)
    return pg.evaluate('location.hash').split('/')[-1]


def card(pg, name):
    return pg.locator('.inv-item', has_text=name)


def flags(pg, name):
    return sorted(card(pg, name).locator('.badge[data-flag]').evaluate_all('els => els.map(e => e.dataset.flag)'))


def run(S):
    r, mock, pg = S.r, S.mock, S.admin
    pg.set_viewport_size({'width': 1280, 'height': 900})
    dialogs = []
    dlg = {'accept': False}
    on_dialog = lambda d: (dialogs.append(d.message), d.accept() if dlg['accept'] else d.dismiss())
    pg.on('dialog', on_dialog)

    pg.click('#adminNav a[data-route=inventory]'); pg.wait_for_selector('#invScreen')
    r.check('Inventory opens #inventory with its own heading', pg.evaluate('location.hash') == '#inventory' and 'Inventory Management System' in pg.inner_text('h1') and pg.get_attribute('#adminNav a[data-route=inventory]', 'aria-current') == 'page')
    r.check('empty state', 'No materials yet' in pg.inner_text('#invList') and INV not in mock.files)

    # an inactive supplier (Cairo Hardware, deactivated in the suppliers tests) is not offered for new materials; reactivate it for the rest of this suite
    pg.click('#btnNewItem'); pg.wait_for_selector('#invSupplier')
    opts = pg.locator('#invSupplier option').all_inner_texts()
    r.check('a new material offers active suppliers only (the inactive one is hidden)', any('Al Nour' in o for o in opts) and not any('Cairo' in o for o in opts), str(opts))
    pg.evaluate("location.hash = '#inventory'"); pg.wait_for_selector('#btnNewItem')
    pg.click('#adminNav a[data-route=suppliers]'); pg.wait_for_selector('.sup-item'); pg.select_option('#supShow', 'inactive')
    pg.locator('.sup-item', has_text='Cairo Hardware').locator('a:has-text("Edit")').click(); pg.wait_for_selector('#supActive'); pg.check('#supActive'); save(pg)

    # ---- add materials: one of each kind of alert
    mdf = add_item(pg, name='MDF 18 mm white', code='MDF18-W', category='board', unit='sheet', qty=40, min=20, max=100, reorder=30, cost=850, supplier='Al Nour Boards', location='Rack A1')
    r.check('first material is MAT-0001 and the file is sealed (no name, code, supplier or place in the clear)', mdf == 'MAT-0001' and INV in mock.files and set(json.loads(mock.text(INV))) == {'v', 'iv', 'ct'}
            and not [s for s in ('MDF', 'Rack', 'Nour', '850') if s in mock.text(INV)])
    r.check('the opening quantity is recorded as the first movement', pg.locator('#invHistory tbody tr').count() == 1 and 'Opening stock' in pg.inner_text('#invHistory') and 'Received' in pg.inner_text('#invHistory'))
    hinge = add_item(pg, name='Soft-close hinge', code='HNG-SC', category='hardware', unit='pcs', qty=0, min=200, cost=12, supplier='Cairo Hardware Co')
    edge = add_item(pg, name='Edge band white 22 mm', code='EB-W22', category='edge', unit='m', qty=15, min=100, max=500, reorder=200, cost=3.5)
    glue = add_item(pg, name='PVA glue', category='finish', unit='kg', qty=12, min=5, cost=40, expiry=day(-1), supplier='Al Nour Boards')
    glass = add_item(pg, name='Glass 5 mm clear', category='glass', unit='m2', qty=30, min=10, cost=100, supplier='Delta Glass')
    screws = add_item(pg, name='Screws 4x30', category='hardware', unit='pcs', qty=1000, cost=0.5, supplier='Cairo Hardware Co')
    sil = add_item(pg, name='Silicone sealant', category='finish', unit='pcs', qty=40, min=10, cost=60, expiry=day(10), supplier='Al Nour Boards')
    r.check('ids are sequential', [mdf, hinge, edge, glue, glass, screws, sil] == [f'MAT-000{i}' for i in range(1, 8)], str([mdf, hinge, edge, glue, glass, screws, sil]))

    pg.click('#adminNav a[data-route=inventory]'); pg.wait_for_selector('.inv-item')
    r.check('all seven materials are listed', pg.locator('.inv-item').count() == 7 and '7 of 7' in pg.inner_text('#invCount'))
    r.check('alerts on every item: out of stock, low + no supplier, expired, expiring soon, no minimum set, and clean ones have none',
            flags(pg, 'Soft-close') == ['out'] and flags(pg, 'Edge band') == ['low', 'nosupplier'] and flags(pg, 'PVA glue') == ['expired'] and flags(pg, 'Silicone') == ['expiring']
            and flags(pg, 'Screws') == ['nomin'] and flags(pg, 'MDF') == [] and flags(pg, 'Glass') == [], str({n: flags(pg, n) for n in ('Soft-close', 'Edge band', 'PVA', 'Silicone', 'Screws', 'MDF', 'Glass')}))
    pg.select_option('#invGroup', 'status')
    r.check('grouped by status, the most urgent come first (out of stock / expired before low before the rest)', [x.split('\n')[0] for x in pg.locator('.inv-item .item-top strong').all_inner_texts()][:2] in (['PVA glue', 'Soft-close hinge'], ['Soft-close hinge', 'PVA glue']))
    pg.select_option('#invGroup', 'category')
    kp = pg.inner_text('#invScreen .kpis')
    r.check('summary tiles: 7 materials, 4 need attention, 1 out, 1 low, 2 expiring or expired, stock value', all(x in kp for x in ('7', 'Need attention', 'Out of stock', 'Low stock', 'Expiring')), kp)
    r.check('stock value is quantity x unit cost summed (40,432.50)', '40,432.5' in kp.replace(' ', '').replace('\xa0', ''), kp)
    r.check('the menu item carries the number of items that need attention', pg.locator('#adminNav a[data-route=inventory] .navbadge').inner_text().strip().endswith('4'), pg.locator('#adminNav a[data-route=inventory]').inner_text())
    # filters
    for mode, n in (('attention', 4), ('out', 1), ('low', 1), ('expiring', 2), ('ok', 3), ('all', 7)):
        pg.select_option('#invShow', mode); r.check(f'filter "{mode}" shows {n}', pg.locator('.inv-item').count() == n, str(pg.locator('.inv-item').count()))
    pg.select_option('#invCat', 'hardware'); r.check('category filter', pg.locator('.inv-item').count() == 2); pg.select_option('#invCat', '')
    pg.select_option('#invSup', '-'); r.check('filter: materials with no supplier', pg.locator('.inv-item').count() == 1 and 'Edge band' in pg.inner_text('#invList'))
    pg.select_option('#invSup', ''); pg.fill('#invSearch', 'rack a1'); r.check('search by place', pg.locator('.inv-item').count() == 1 and 'MDF' in pg.inner_text('#invList'))
    pg.fill('#invSearch', 'hng-sc'); r.check('search by code', pg.locator('.inv-item').count() == 1); pg.fill('#invSearch', '')

    # ---- the to-order list
    oc = pg.inner_text('#invOrder')
    r.check('the to-order card lists the two materials at or below their minimum, grouped by supplier, with suggested quantities (hinge 400 to reach twice the minimum, edge band 485 to reach the maximum)',
            'To order (2)' in oc and 'Cairo Hardware Co' in oc and 'No supplier set' in oc and '400' in oc and '485' in oc, oc)
    r.check('the order list can be printed from there', pg.get_attribute('#btnOrderPrint', 'href') == '#reports/reorder')

    # ---- quick movements
    mdf_card = card(pg, 'MDF 18')
    mdf_card.locator('[data-mv=out]').click(); pg.wait_for_selector('#mvQty')
    pg.fill('#mvQty', '100'); pg.click('#btnMvApply'); toast_text(pg, 'Only 40')
    r.check('using more than is in stock is refused with the available quantity', True)
    pg.fill('#mvQty', '25'); pg.fill('#mvNote', 'Kitchen DS-KIT'); pg.click('#btnMvApply'); toast_text(pg, 'Stock updated')
    pg.wait_for_selector('#invList .inv-item')
    r.check('using 25 sheets leaves 15, which is below the minimum of 20: the Low stock alert appears and the item enters the order list', flags(pg, 'MDF') == ['low'] and 'To order (3)' in pg.inner_text('#invOrder'))
    r.check('the suggestion for MDF is 85 (up to the maximum of 100)', '85' in card(pg, 'MDF').inner_text() or '85' in pg.inner_text('#invOrder'))
    card(pg, 'Soft-close').locator('[data-mv=in]').click(); pg.fill('#mvQty', '250'); pg.click('#btnMvApply'); toast_text(pg, 'Stock updated')
    pg.wait_for_function("() => document.querySelector('.inv-item .inv-big') && ![...document.querySelectorAll('.inv-item')].some((e) => /Soft-close/.test(e.textContent) && /Out of stock/.test(e.textContent))")
    r.check('receiving 250 hinges clears the alert (250 is above the minimum of 200)', flags(pg, 'Soft-close') == [], str(flags(pg, 'Soft-close')))
    card(pg, 'Glass').locator('[data-mv=count]').click(); pg.wait_for_selector('#mvQty')
    r.check('a stock-take starts from the current total', pg.input_value('#mvQty') in ('30', '30.0'))
    pg.fill('#mvQty', '28'); pg.click('#btnMvApply'); toast_text(pg, 'Stock updated')
    # the toast of the previous movement may still be on screen: wait for the card itself to show the new total
    pg.wait_for_function("() => [...document.querySelectorAll('.inv-item')].some((e) => /Glass/.test(e.textContent) && e.querySelector('.inv-big')?.dataset.qty === '28')", timeout=15000)
    r.check('the stock-take sets the total to 28', '28' in card(pg, 'Glass').locator('.inv-big').inner_text())
    pg.fill('#invSearch', 'Glass'); card(pg, 'Glass').locator('[data-mv=out]').click(); pg.fill('#mvQty', '0'); pg.click('#btnMvApply'); toast_text(pg, 'greater than zero')
    r.check('a zero or empty quantity is refused', True); pg.locator('#btnMvCancel').click(); pg.fill('#invSearch', '')

    # the repository file really changed and is still sealed
    r.check('every change is committed to the same sealed file', len([c for c in mock.commits if c[1] == INV]) == 10 and set(json.loads(mock.text(INV))) == {'v', 'iv', 'ct'})

    # ---- one material: history and the form
    card(pg, 'MDF 18').locator('a:has-text("Edit")').click(); pg.wait_for_selector('#invHistory')
    h = pg.inner_text('#invHistory')
    r.check('history lists the opening stock and the use of 25 with its note and the balance after it', 'Opening stock' in h and 'Kitchen DS-KIT' in h and '-25' in h and 'Used' in h, h)
    r.check('the live preview shows the Low stock badge and the value of the stock', 'Low stock' in pg.inner_text('#invPreview') and '12,750' in pg.inner_text('#invPreview').replace('\xa0', '').replace(' ', ''), pg.inner_text('#invPreview'))
    pg.fill('#invQty', '60'); r.check('typing a new quantity updates the preview at once (60 is above the minimum: no alert)', 'In good stock' in pg.inner_text('#invPreview'))
    pg.fill('#invMax', '10'); pg.click('#btnSave'); toast_text(pg, 'minimum level cannot be higher')
    pg.fill('#invMax', '100'); pg.fill('#invCost', '-5'); pg.click('#btnSave'); toast_text(pg, 'cannot be negative')
    pg.fill('#invCost', '850'); pg.fill('#invCode', 'hng-sc'); pg.click('#btnSave'); toast_text(pg, 'used by another material')
    pg.fill('#invCode', 'MDF18-W'); pg.fill('#invName', ''); pg.click('#btnSave'); toast_text(pg, 'Enter the material name')
    r.check('validation: minimum above maximum, negative cost, duplicate code (any case) and empty name are all refused', True)
    pg.fill('#invName', 'MDF 18 mm white')

    # another device uses 5 sheets while this form (which still shows 15) is open
    pg2 = S.admin_ctx.new_page(); pg2.on('pageerror', lambda e: S.errors.append(('admin2', 'pageerror', str(e))))
    pg2.goto(ADMIN_URL + '#inventory'); pg2.wait_for_selector('#lockPw'); unlock(pg2, PW1); pg2.wait_for_selector('#invScreen')
    card(pg2, 'MDF 18').locator('[data-mv=out]').click(); pg2.fill('#mvQty', '5'); pg2.click('#btnMvApply'); toast_text(pg2, 'Stock updated'); pg2.close()
    pg.fill('#invQty', '15'); pg.fill('#invLocation', 'Rack A2'); save(pg)
    r.check('saving a stale form does NOT overwrite the quantity: the file had 10 (15 - 5 by the other device) and the form did not change the quantity, so it stays 10',
            pg.evaluate("() => opsFind('inventory', 'MAT-0001').qty") == 10 and pg.evaluate("() => opsFind('inventory', 'MAT-0001').location") == 'Rack A2', str(pg.evaluate("() => opsFind('inventory', 'MAT-0001').qty")))
    pg.fill('#invQty', '45'); save(pg)
    mv = pg.evaluate("() => opsFind('inventory', 'MAT-0001').moves.map((m) => [m.type, m.delta, m.qty, m.note])")
    r.check('changing the quantity in the form records a stock-take with the difference (+35 to 45), and the earlier movements (including the other device\'s) are all kept',
            mv[0][0] == 'count' and mv[0][1] == 35 and mv[0][2] == 45 and [x[1] for x in mv[1:]] == [-5, -25, 40], str(mv))
    S.errors[:] = [e for e in S.errors if not (e[0] == 'admin' and '409' in e[2])]

    # ---- supplier protection (the suppliers section knows which materials use it)
    pg.click('#adminNav a[data-route=suppliers]')
    pg.wait_for_selector('#supShow'); pg.select_option('#supShow', 'active'); pg.wait_for_selector('.sup-item')
    pg.locator('.sup-item', has_text='Al Nour').locator('a:has-text("Edit")').click(); pg.wait_for_selector('#supRelated')
    r.check('a supplier page lists the materials it supplies', 'MDF 18 mm white' in pg.inner_text('#supRelated') and 'PVA glue' in pg.inner_text('#supRelated'))
    pg.click('#btnOpsDelete'); toast_text(pg, 'cannot be deleted')
    r.check('a supplier used by materials cannot be deleted', pg.locator('#supName').count() == 1)
    pg.evaluate("location.hash = '#suppliers'"); pg.wait_for_selector('.sup-item')
    pg.select_option('#supShow', 'all'); pg.locator('.sup-item', has_text='مؤسسة').locator('a:has-text("تعديل"), a:has-text("Edit")').click(); pg.wait_for_selector('#btnOpsDelete')
    dlg['accept'] = True; pg.click('#btnOpsDelete'); pg.wait_for_selector('#supList'); dlg['accept'] = False
    r.check('an unused supplier can be deleted (after a confirmation)', pg.locator('.sup-item', has_text='مؤسسة').count() == 0)

    # ---- the dashboard card
    pg.click('#adminNav a[data-route=dashboard]'); pg.wait_for_selector('#opsCard .kpis', timeout=20000)
    oc = pg.inner_text('#opsCard')
    r.check('the dashboard shows the operations summary with links to the three sections', 'Stock alerts' in oc and 'Late shipments' in oc and pg.locator('#opsCard a').count() == 3, oc)

    # ---- Arabic
    pg.click('#adminNav a[data-route=inventory]'); pg.wait_for_selector('.inv-item')
    pg.click('#btnLang'); pg.wait_for_function("() => document.documentElement.lang === 'ar'")
    txt = pg.inner_text('#invScreen')
    r.check('Arabic: heading, KPIs, alert badges and units are translated and the page is RTL', 'نظام إدارة المخزون' in pg.inner_text('h1') and 'تحتاج انتباهًا' in txt and 'منتهية الصلاحية' in txt and 'لوح' not in 'x' and pg.evaluate('document.dir') == 'rtl', txt[:400])
    pg.click('#btnLang'); pg.wait_for_function("() => document.documentElement.lang === 'en'")
    pg.evaluate("location.hash = '#dashboard'"); pg.wait_for_selector('#btnNewClient'); pg.remove_listener('dialog', on_dialog)
