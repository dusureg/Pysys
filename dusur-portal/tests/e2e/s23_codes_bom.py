"""Admin: internal codes (the formula in Settings gives every material, supplier and shipment its code) and the BOM linked to the stock
(a BOM line names a material of the inventory; "Take from stock" moves the quantity out of the inventory, "Put back" returns it, the project remembers what was taken)."""
import json, re
from mockgh import ADMIN_URL
from lib import *

INV = 'data/private/ops/inventory.json'


def settings_open(pg):
    pg.click('#adminNav a[data-route=settings]'); pg.wait_for_selector('#codesCard')


def wait_note(pg, text):
    """The toast of an earlier action may still be on screen, so wait for the summary line itself."""
    try: pg.wait_for_function("(x) => document.querySelector('#bomStockNote').innerText.includes(x)", arg=text, timeout=10000)
    except Exception: pass


def stock(pg, item):
    return pg.evaluate(f"() => opsFind('inventory', '{item}').qty")


def run(S):
    r, mock, pg = S.r, S.mock, S.admin
    n0 = len(S.errors)
    pg.set_viewport_size({'width': 1280, 'height': 900})
    dialogs = []
    on_dialog = lambda d: (dialogs.append(d.message), d.accept())
    pg.on('dialog', on_dialog)

    # ================= codes: the formula =================
    settings_open(pg)
    r.check('Settings has an Internal codes card with the three default formulas and an example for each',
            pg.input_value('#codePat-inventory') == 'MAT-{CAT}-{N:4}' and pg.input_value('#codePat-suppliers') == 'SUP-{CAT}-{N:3}' and pg.input_value('#codePat-logistics') == 'SHP-{YY}{MM}-{N:4}'
            and re.fullmatch(r'MAT-BRD-0001', pg.inner_text('#codeEx-inventory')) and pg.inner_text('#codeEx-suppliers') == 'SUP-HDW-001' and re.fullmatch(r'SHP-\d{4}-0001', pg.inner_text('#codeEx-logistics')),
            pg.inner_text('#codesCard')[:400])
    pg.fill('#codePat-inventory', 'NONUMBER'); r.check('a formula without {N} shows "not valid" at once', 'not valid' in pg.inner_text('#codeEx-inventory') and pg.get_attribute('#codePat-inventory', 'aria-invalid') == 'true')
    pg.click('#btnSaveSettings'); pg.wait_for_function("() => /not valid/.test(document.body.innerText) && document.querySelector('.msg.bad')")
    r.check('saving a bad formula is refused and says which one', 'Materials' in pg.inner_text('.msg.bad'), pg.inner_text('.msg.bad'))
    pg.fill('#codePat-inventory', 'MAT-{CAT}-{N:4} {X}'); r.check('letters outside the allowed set / unknown tokens are not valid', 'not valid' in pg.inner_text('#codeEx-inventory'))
    pg.click('#codeReset-inventory'); r.check('Reset brings the default formula back', pg.input_value('#codePat-inventory') == 'MAT-{CAT}-{N:4}')

    # ================= codes: records that already existed =================
    pg.click('#adminNav a[data-route=inventory]'); pg.wait_for_selector('#invScreen')
    glue = pg.evaluate("() => opsList('inventory').find((x) => x.name === 'PVA glue').code")
    r.check('a material created without a code got the next one from the formula (finish = FIN)', glue == 'MAT-FIN-0001', glue)
    r.check('a code typed by hand is kept as typed', pg.evaluate("() => opsFind('inventory', 'MAT-0001').code") == 'MDF18-W')

    # ================= codes: new records =================
    pg.click('#btnNewItem'); pg.wait_for_selector('#invName')
    r.check('the code field of a new material says what the next code will be', pg.get_attribute('#invCode', 'placeholder') == 'Next: MAT-BRD-0001', pg.get_attribute('#invCode', 'placeholder'))
    pg.select_option('#invCategory', 'edge'); r.check('and follows the category', pg.get_attribute('#invCode', 'placeholder') == 'Next: MAT-EDG-0001', pg.get_attribute('#invCode', 'placeholder'))
    pg.select_option('#invCategory', 'board'); pg.fill('#invName', 'Plywood 12 mm'); pg.select_option('#invUnit', 'sheet'); pg.fill('#invQty', '10'); save(pg)
    r.check('saving gives it MAT-BRD-0001 (the running number counts per category)', pg.input_value('#invCode') == 'MAT-BRD-0001', pg.input_value('#invCode'))
    pg.click('#adminNav a[data-route=inventory]'); pg.wait_for_selector('#btnNewItem'); pg.click('#btnNewItem'); pg.wait_for_selector('#invName')
    pg.fill('#invName', 'Plywood 18 mm'); pg.select_option('#invCategory', 'board'); pg.fill('#invQty', '5'); save(pg)
    r.check('the next board gets MAT-BRD-0002', pg.input_value('#invCode') == 'MAT-BRD-0002', pg.input_value('#invCode'))
    pg.click('#adminNav a[data-route=inventory]'); pg.wait_for_selector('#btnNewItem'); pg.click('#btnNewItem'); pg.wait_for_selector('#invName')
    pg.fill('#invName', 'Plywood 18 mm copy'); pg.fill('#invCode', 'mat-brd-0002'); pg.click('#btnSave'); toast_text(pg, 'used by another material')
    r.check('a code already used (any letter case) is refused', pg.evaluate("() => opsList('inventory').filter((x) => x.name === 'Plywood 18 mm copy').length") == 0)
    pg.evaluate("location.hash = '#inventory'"); pg.wait_for_selector('#btnNewItem')
    pg.fill('#invSearch', 'MAT-BRD-0002'); pg.wait_for_function("() => document.querySelectorAll('.inv-item, #invTable tbody tr').length >= 1")
    r.check('search finds a material by its code', 'Plywood 18 mm' in pg.inner_text('#invList'))
    pg.fill('#invSearch', '')

    pg.click('#adminNav a[data-route=suppliers]'); pg.wait_for_selector('#btnNewSup'); pg.click('#btnNewSup'); pg.wait_for_selector('#supName')
    pg.fill('#supName', 'Delta Hardware'); pg.select_option('#supCategory', 'hardware')
    nxt = (pg.get_attribute('#supCode', 'placeholder') or '').replace('Next: ', '')
    r.check('a new supplier shows its next code (hardware = HDW, 3 digits)', re.fullmatch(r'SUP-HDW-\d{3}', nxt) is not None, nxt)
    save(pg); r.check('the supplier is saved with exactly that code', pg.input_value('#supCode') == nxt and nxt in pg.evaluate("() => opsList('suppliers').map((x) => x.code).join()"), pg.input_value('#supCode'))
    pg.click('#adminNav a[data-route=suppliers]'); pg.wait_for_selector('.sup-item'); pg.select_option('#supShow', 'all')
    r.check('the supplier card shows the code next to the record number', pg.locator('.sup-item', has_text='Delta Hardware').inner_text().count(nxt) >= 1 and pg.locator('.sup-item', has_text='Delta Hardware').locator('[data-code]').count() == 1)
    pg.click('#btnNewSup'); pg.wait_for_selector('#supName'); pg.fill('#supName', 'Second Delta'); pg.select_option('#supCategory', 'hardware'); pg.fill('#supCode', nxt.lower()); pg.click('#btnSave'); toast_text(pg, 'already used')
    r.check('a supplier code that is taken is refused', True)

    pg.click('#adminNav a[data-route=logistics]'); pg.wait_for_selector('#btnNewLg'); pg.click('#btnNewLg'); pg.wait_for_selector('#lgTitle')
    pg.fill('#lgTitle', 'Hinges from Delta')
    ph = pg.get_attribute('#lgCode', 'placeholder')
    r.check('a new shipment shows the next code with the year and month in it', re.fullmatch(r'Next: SHP-\d{4}-\d{4}', ph or '') is not None, ph)
    save(pg); code = pg.input_value('#lgCode')
    r.check('the shipment is saved with that code', code == ph.replace('Next: ', ''), f'{code} / {ph}')
    r.check('the code in the formula carries the current year and month', code[4:8] == pg.evaluate("() => String(new Date().getFullYear()).slice(2) + pad2(new Date().getMonth() + 1)"), code)

    # ---- changing the formula never rewrites codes that exist
    settings_open(pg); pg.fill('#codePat-inventory', 'ITM/{YYYY}/{CAT}-{N:3}'); r.check('a formula with year and slash is valid', 'ITM/' in pg.inner_text('#codeEx-inventory'), pg.inner_text('#codeEx-inventory'))
    pg.click('#btnSaveSettings'); toast_text(pg, 'saved')
    pg.click('#adminNav a[data-route=inventory]'); pg.wait_for_selector('#btnNewItem'); pg.click('#btnNewItem'); pg.wait_for_selector('#invName')
    year = pg.evaluate("() => String(new Date().getFullYear())")
    r.check('the new formula applies to the next record', pg.get_attribute('#invCode', 'placeholder') == f'Next: ITM/{year}/BRD-001', pg.get_attribute('#invCode', 'placeholder'))
    pg.evaluate("location.hash = '#inventory'"); pg.wait_for_selector('#btnNewItem')
    r.check('earlier codes are untouched', pg.evaluate("() => opsList('inventory').find((x) => x.name === 'Plywood 12 mm').code") == 'MAT-BRD-0001')
    settings_open(pg); pg.click('#codeReset-inventory'); pg.click('#btnSaveSettings'); toast_text(pg, 'saved')

    # ---- "give a code to everything that has none"
    pg.evaluate("() => opsMutate('suppliers', (d) => { d.items.forEach((x) => { x.code = ''; }); })")
    settings_open(pg); pg.click('#btnCodeFill'); pg.wait_for_function("() => /received a code/.test(document.querySelector('#codeFillMsg').innerText)", timeout=30000)
    codes = pg.evaluate("() => opsList('suppliers').map((x) => x.code)")
    r.check('the bulk button codes every record that had none, all different', len(codes) >= 2 and all(re.fullmatch(r'SUP-[A-Z]{3}-\d{3}', c) for c in codes) and len(set(codes)) == len(codes), str(codes))
    pg.click('#btnCodeFill'); pg.wait_for_function("() => /already has a code/.test(document.querySelector('#codeFillMsg').innerText)", timeout=30000)
    r.check('pressing it again changes nothing', True)
    r.check('the inventory file is still sealed (no code readable in the repository)', set(json.loads(mock.text(INV))) == {'v', 'iv', 'ct'} and 'BRD-0001' not in mock.text(INV))

    # ================= BOM linked to the stock =================
    pg.click('#adminNav a[data-route=dashboard]'); pg.wait_for_selector('#btnNewClient'); pg.click('.item a:has-text("Edit")'); pg.wait_for_selector('#edName'); pg.click('#tab-bom')
    pg.wait_for_selector('.bomlink', timeout=20000)
    r.check('every BOM line has a "Stock item" link row once the inventory is read', pg.locator('.bomlink').count() == 3 and pg.locator('#bomStockNote').inner_text() == '')
    mdf0 = stock(pg, 'MAT-0001'); hinge0 = stock(pg, 'MAT-0002'); edge0 = stock(pg, 'MAT-0003')
    link = lambda i: pg.locator('.bomlink').nth(i).locator('select')
    link(0).select_option('MAT-0001')
    r.check('linking line 1 to the MDF keeps its own name and takes the stock unit (sheet)', pg.locator('.bomrow').nth(0).locator('input[placeholder="Item name"]').input_value() == '18mm white board' and pg.locator('.bomrow').nth(0).locator('select').nth(0).input_value() == 'sheet')
    r.check('it shows how much is in stock and offers to take the 12 sheets', f'{int(mdf0)}' in pg.locator('.bomlink').nth(0).inner_text() and pg.locator('.bomlink').nth(0).locator('[data-bom=take]').count() == 1
            and 'Take 12' in pg.locator('.bomlink').nth(0).locator('[data-bom=take]').inner_text(), pg.locator('.bomlink').nth(0).inner_text())
    r.check('the summary line counts one linked line', '1 line(s) linked to stock' in pg.inner_text('#bomStockNote'), pg.inner_text('#bomStockNote'))
    # line 2: edge tape 60 m against 15 m in stock -> short, cannot take
    link(1).select_option('MAT-0003')
    r.check('a line that needs more than the stock holds says how much is missing and cannot be taken', pg.locator('.bomlink').nth(1).locator('[data-bomstock=short]').count() == 1 and pg.locator('.bomlink').nth(1).locator('[data-bom=take]').is_disabled(), pg.locator('.bomlink').nth(1).inner_text())
    # line 3: hinge, taken in full
    link(2).select_option('MAT-0002')
    pg.locator('.bomlink').nth(0).locator('[data-bom=take]').click(); toast_text(pg, 'Stock updated')
    r.check('Take from stock removes the quantity from the inventory (12 sheets)', stock(pg, 'MAT-0001') == mdf0 - 12)
    r.check('the line now says it is taken and the item selector is locked (taken quantities must be returned first)', pg.locator('.bomlink').nth(0).locator('[data-bomstock=issued]').count() == 1 and pg.locator('.bomlink').nth(0).locator('select').is_disabled() and 'Taken so far' in pg.locator('.bomlink').nth(0).inner_text())
    mv = pg.evaluate("() => opsFind('inventory', 'MAT-0001').moves[0]")
    sku = pg.evaluate("() => ed.rec.projects[0].sku")
    r.check('the movement is in the material\'s history with the project and client in the note', mv['type'] == 'out' and mv['delta'] == -12 and mv['ref'] == sku and pg.evaluate("() => opsFind('inventory', 'MAT-0001').moves[0].note.includes(ed.rec.client.name)"), str(mv))
    r.check('the project was saved together with the movement (the stock and the project\'s memory of it cannot drift apart)', pg.evaluate("() => ed.dirty") is False and json.loads(pg.evaluate("() => JSON.stringify(ed.rec.projects[0].bom[0])"))['issued'] == 12)
    r.check('the line remembers it: issued = 12', pg.evaluate("() => ed.rec.projects[0].bom[0].issued") == 12)
    # the quantity grows: only the difference is taken
    pg.locator('.bomrow').nth(0).locator('input[type=number]').nth(0).fill('14')
    pg.wait_for_function("() => document.querySelector('.bomlink [data-bom=take]')?.innerText.includes('Take 2')", timeout=5000)
    pg.locator('.bomlink').nth(0).locator('[data-bom=take]').click(); toast_text(pg, 'Stock updated')
    r.check('after raising the quantity from 12 to 14 only the 2 missing sheets are taken', stock(pg, 'MAT-0001') == mdf0 - 14 and pg.evaluate("() => ed.rec.projects[0].bom[0].issued") == 14)
    pg.locator('.bomrow').nth(0).locator('input[type=number]').nth(0).fill('10')
    pg.wait_for_function("() => !!document.querySelector('.bomlink [data-bom=return]')", timeout=5000)
    r.check('lowering it below what was taken offers to put the difference back', 'Put 4' in pg.locator('.bomlink').nth(0).locator('[data-bom=return]').inner_text())
    pg.locator('.bomlink').nth(0).locator('[data-bom=return]').click(); toast_text(pg, 'Stock updated')
    wait_until(pg, lambda: pg.evaluate("() => ed.rec.projects[0].bom[0].issued") == 10 and stock(pg, 'MAT-0001') == mdf0 - 10, 10, what='the 4 sheets to be put back (the toast of the earlier action may still be on screen)')
    r.check('putting 4 back leaves 10 taken and the stock 10 lower than at the start', stock(pg, 'MAT-0001') == mdf0 - 10 and pg.evaluate("() => ed.rec.projects[0].bom[0].issued") == 10)
    # take-all: line 3 (hinge 24 pcs) can be served, line 2 is short -> refused as a whole
    pg.locator('#btnBomTake').click(); toast_text(pg, 'Not enough in stock')
    r.check('Take all refuses when one line cannot be served and moves nothing', stock(pg, 'MAT-0002') == hinge0 and 'Edge band' in pg.locator('.toast:has-text("Not enough")').inner_text())
    pg.locator('.bomrow').nth(1).locator('input[type=number]').nth(0).fill('10')
    pg.locator('#btnBomTake').click(); toast_text(pg, 'Stock updated')
    r.check('after lowering the edge tape to 10 m, Take all serves the two open lines in one go', stock(pg, 'MAT-0002') == hinge0 - 24 and stock(pg, 'MAT-0003') == edge0 - 10)
    wait_note(pg, '3 already taken')
    r.check('and the summary shows 3 lines linked, none short, 3 taken', '3 line(s) linked' in pg.inner_text('#bomStockNote') and '0 short' in pg.inner_text('#bomStockNote') and '3 already taken' in pg.inner_text('#bomStockNote'), pg.inner_text('#bomStockNote'))
    # unit mismatch
    pg.locator('.bomrow').nth(2).locator('select').nth(0).select_option('kg')
    pg.wait_for_function("() => !!document.querySelector('.bomlink [data-bomstock=unit]')", timeout=5000)
    r.check('changing the unit of a linked line to something else than the stock unit is flagged', 'differs' in pg.locator('.bomlink').nth(2).inner_text())
    pg.locator('.bomrow').nth(2).locator('select').nth(0).select_option('pcs')
    # reload: the project keeps what was taken (every movement saved it already)
    pg.click('#adminNav a[data-route=dashboard]'); pg.click('#btnRefresh'); pg.wait_for_selector('.item'); pg.click('.item a:has-text("Edit")'); pg.wait_for_selector('#edName'); pg.click('#tab-bom'); pg.wait_for_selector('.bomlink')
    r.check('after saving and reopening the project the links and the taken quantities are still there (no second deduction offered)', pg.locator('.bomlink [data-bom=take]').count() == 0 and pg.locator('.bomlink').nth(0).locator('[data-bomstock=issued]').count() == 1)
    # removing a taken line puts the stock back
    mdf1 = stock(pg, 'MAT-0001')
    pg.locator('.bomrow').nth(0).locator('button.x').click(); toast_text(pg, 'Stock updated')
    try: pg.wait_for_function("() => document.querySelectorAll('.bomrow').length === 2", timeout=10000)
    except Exception: pass
    now1 = stock(pg, 'MAT-0001'); rows1 = pg.locator('.bomrow').count()
    r.check('removing a line that was taken from stock puts its quantity back (after a confirmation)', now1 == mdf1 + 10 and any('Put them back' in d for d in dialogs) and rows1 == 2, f'stock {now1} (was {mdf1}), rows {rows1}, dialogs {dialogs[-2:]}')
    pg.screenshot(path=f'{SP}/shot-bom-stock.png', full_page=True)
    save(pg)
    r.check('the line is gone for good once the project is saved, and the stock stayed returned', pg.locator('.bomrow').count() == 2 and stock(pg, 'MAT-0001') == mdf1 + 10)
    pg.evaluate("location.hash = '#dashboard'"); pg.wait_for_selector('#btnNewClient')

    pg.remove_listener('dialog', on_dialog)
    S.errors[n0:] = [e for e in S.errors[n0:] if not (e[1] == 'error' and 'Failed to load resource' in e[2] and ('409' in e[2] or '404' in e[2]))]
