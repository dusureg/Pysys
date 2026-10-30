"""Admin: import from a file (CSV with semicolons and Arabic digits, JSON, a real .xlsx made with openpyxl) into Inventory, Suppliers, Shipments and Expenses.
Columns are matched by name (English or Arabic), the preview says what happens to every row before anything is saved, bad rows are refused with the reason and can be
downloaded, existing records are skipped or updated (matched by code, then name), empty cells keep the old value, the whole file is one saved change and one History entry."""
import json, os
from lib import *

IMPDIR = os.path.join(SP, 'import')
os.makedirs(IMPDIR, exist_ok=True)


def go_import(pg, target):
    pg.evaluate(f"location.hash = '#import/{target}'"); pg.wait_for_selector('#impFile')


def load(pg, f):
    pg.set_input_files('#impFile', f); pg.wait_for_selector('#impPreview', timeout=20000)


def counts(pg):
    return pg.evaluate("() => [...document.querySelectorAll('#impCounts [data-n]')].map((e) => Number(e.dataset.n))")


def put(name, text, binary=False):
    path = os.path.join(IMPDIR, name)
    with open(path, 'wb' if binary else 'w', **({} if binary else {'encoding': 'utf-8', 'newline': ''})) as f:
        f.write(text)
    return path


def item(pg, code):
    return pg.evaluate("(c) => opsList('inventory').find((x) => x.code === c) || null", code)


def finish(pg):
    pg.click('#btnImportGo'); pg.wait_for_selector('#impResult', timeout=40000)
    return pg.inner_text('#impResult')


def run(S):
    r, mock, pg = S.r, S.mock, S.admin
    n0 = len(S.errors)
    pg.set_viewport_size({'width': 1280, 'height': 900})

    # ================= the way in =================
    have = []
    for h, b in (('suppliers', 'suppliers'), ('logistics', 'logistics'), ('finance', 'expenses'), ('inventory', 'inventory')):
        pg.evaluate(f"() => {{ location.hash = '#{h}'; }}"); have.append(pg.wait_for_selector(f'#btnImp-{b}', timeout=30000) is not None)
    r.check('Inventory, Suppliers, Shipments and Finance each have an Import button', all(have), str(have))
    pg.click('#btnImp-inventory'); pg.wait_for_selector('#impFile')
    r.check('the button opens the import screen for that section', pg.evaluate('location.hash') == '#import/inventory' and 'Inventory' in pg.inner_text('#importScreen h1'))
    pg.evaluate("location.hash = '#import'"); pg.wait_for_selector('#impPick-inventory')
    r.check('#import alone offers the four sections', pg.locator('[id^=impPick-]').count() == 4)
    go_import(pg, 'inventory')
    with pg.expect_download() as dl:
        pg.click('#btnImpTemplate')
    tpl = open(dl.value.path(), encoding='utf-8', newline='').read()
    r.check('the blank template is a CSV with the expected columns (and an example row)', tpl.startswith('﻿') and 'Material name' in tpl.split('\r\n')[0] and 'Code' in tpl.split('\r\n')[0] and 'MDF 18 mm white' in tpl, tpl[:200])

    # ================= inventory: semicolon CSV, Arabic headers and digits =================
    csv = ('الاسم;الكود;الفئة;الوحدة;الكمية;الحد الأدنى;التكلفة;المورد;ملاحظات\n'
           'لوح MDF 25 ملم;IMPA-1;لوح;لوح;٤٠;٢٠;١٬٢٥٠٫٥;;جديد\n'
           'Imp hinge;IMPB-2;hardware;pcs;100;30;12.5;;\n'
           ';IMPC-3;board;sheet;5;;;;\n'
           'Bad qty;IMPD-4;board;sheet;abc;;;;\n'
           'Imp hinge copy;IMPB-2;hardware;pcs;1;;;;\n'
           'Unknown cat;IMPE-5;wood-stuff;pcs;3;;;;\n')
    load(pg, put('inv1.csv', csv))
    maps = {k: pg.input_value(f'#impMap-{k}') for k in ('name', 'code', 'category', 'unit', 'qty', 'min', 'cost', 'supplierId', 'notes', 'max')}
    r.check('the Arabic column names were matched on their own (name, code, category, unit, quantity, minimum, cost, supplier, notes)',
            maps == {'name': '0', 'code': '1', 'category': '2', 'unit': '3', 'qty': '4', 'min': '5', 'cost': '6', 'supplierId': '7', 'notes': '8', 'max': '-1'}, str(maps))
    r.check('the preview counts 3 new rows and 3 rejected rows, one warning', counts(pg) == [3, 0, 0, 3], str(counts(pg)))
    txt = pg.inner_text('#impPreview')
    r.check('the preview names the reason for every rejected row (missing name, not a number, repeated code)', 'Material name is missing' in txt and '“abc” is not a number' in txt and '“IMPB-2” appears twice' in txt, txt[-700:])
    r.check('the unknown category is a warning (the default is used), not a rejection', pg.locator('tr[data-action=add]').count() == 3 and 'not recognised' in txt)
    with pg.expect_download() as dl:
        pg.click('#btnImpRejects')
    rej = open(dl.value.path(), encoding='utf-8', newline='').read()
    r.check('the rejected rows can be downloaded with the reason, ready to correct and import again', rej.count('\r\n') == 4 and 'abc' in rej and 'not a number' in rej, rej[:300])
    r.check('nothing is saved before the Import button', item(pg, 'IMPA-1') is None)
    r.check('the button says how many rows it will import', pg.inner_text('#btnImportGo') == 'Import 3 rows')
    out = finish(pg)
    r.check('the result says 3 added and 3 rejected', '3 added' in out and '3 rejected' in out, out)
    a, b, e = item(pg, 'IMPA-1'), item(pg, 'IMPB-2'), item(pg, 'IMPE-5')
    r.check('the first row arrived with Arabic digits read as numbers: quantity 40, minimum 20, cost 1250.5, unit sheet, category board',
            a and a['qty'] == 40 and a['min'] == 20 and a['cost'] == 1250.5 and a['unit'] == 'sheet' and a['category'] == 'board' and a['name'] == 'لوح MDF 25 ملم' and a['notes'] == 'جديد', str(a))
    r.check('the file\'s own codes are kept (not replaced by the formula) and each item has an id', a['id'].startswith('MAT-') and b['code'] == 'IMPB-2' and b['qty'] == 100)
    r.check('the opening quantity is a stock movement of type "in" (the history of the material starts with it)', a['moves'][0]['type'] == 'in' and a['moves'][0]['delta'] == 40 and len(b['moves']) == 1)
    r.check('the unknown category became "other" and the rejected rows were not saved', e['category'] == 'other' and item(pg, 'IMPC-3') is None and item(pg, 'IMPD-4') is None)
    r.check('after a successful import the mode goes back to "add only" (a leftover "update" would be dangerous)', pg.evaluate("() => imp.mode") == 'add')
    pg.click('#impOpen'); pg.wait_for_selector('#invScreen')
    r.check('the result links back to the inventory, where the new materials are listed', 'IMPA-1' in pg.inner_text('#invScreen') or pg.locator('[data-code="IMPA-1"]').count() == 1)

    # ================= inventory: JSON, update existing rows =================
    js = json.dumps([{'code': 'IMPA-1', 'qty': 55, 'cost': 1300}, {'code': 'IMPJ-6', 'name': 'Imp json item', 'unit': 'kg', 'qty': 7}, {'code': 'impb-2', 'qty': 100}])
    go_import(pg, 'inventory'); load(pg, put('inv2.json', js))
    r.check('a JSON list of records is read (the keys are the columns)', pg.input_value('#impMap-code') != '-1' and pg.input_value('#impMap-qty') != '-1')
    r.check('by default existing records are skipped: 1 new, 2 skipped (the code matches without regard to upper or lower case)', counts(pg) == [1, 0, 2, 0], str(counts(pg)))
    pg.check('#impModeUpsert'); r.check('with "update" the same rows count as 2 updates', counts(pg) == [1, 2, 0, 0], str(counts(pg)))
    out = finish(pg)
    a, b, j = item(pg, 'IMPA-1'), item(pg, 'IMPB-2'), item(pg, 'IMPJ-6')
    r.check('the result says 1 added and 2 updated', '1 added' in out and '2 updated' in out, out)
    r.check('an update changes only the columns that are in the file (quantity and cost) and keeps name, minimum and unit', a['qty'] == 55 and a['cost'] == 1300 and a['min'] == 20 and a['unit'] == 'sheet' and a['name'] == 'لوح MDF 25 ملم')
    r.check('a changed quantity is written as a stock-take movement (+15), an unchanged one adds nothing', a['moves'][0]['type'] == 'count' and a['moves'][0]['delta'] == 15 and len(b['moves']) == 1 and b['qty'] == 100)
    r.check('the new JSON row arrived with its unit', j and j['unit'] == 'kg' and j['qty'] == 7)

    # ================= no header row: choose the columns by hand =================
    go_import(pg, 'inventory'); load(pg, put('inv3.csv', 'Imp nohdr,IMPN-7,pcs,9\n'))
    r.check('a file with no header row looks empty when the first row is taken as the header', counts(pg)[:2] == [0, 0] and pg.is_disabled('#btnImportGo'))
    pg.uncheck('#impHeader')
    r.check('without the header row nothing is matched on its own and every row is rejected until the columns are chosen', pg.input_value('#impMap-name') == '-1' and counts(pg)[3] == 1)
    for k, v in (('name', '0'), ('code', '1'), ('unit', '2'), ('qty', '3')):
        pg.select_option(f'#impMap-{k}', v)
    r.check('choosing the columns by hand makes the row valid', counts(pg) == [1, 0, 0, 0], str(counts(pg)))
    finish(pg); r.check('and it is imported', (item(pg, 'IMPN-7') or {}).get('qty') == 9)

    # ================= suppliers: a real Excel file =================
    from openpyxl import Workbook
    wb = Workbook(); ws = wb.active; ws.title = 'Suppliers'
    ws.append(['Name', 'Phone', 'Category', 'Contact', 'Active'])
    ws.append(['Imp Supplier One', '0100 111 2222', 'hardware', 'Mr Hassan', 'yes'])
    ws.append(['مورد الأخشاب الحديثة', 1002223333, 'boards', None, 'no'])
    ws.append(['imp supplier one', '0100 999 9999', 'hardware', None, 'yes'])
    ws2 = wb.create_sheet('Notes'); ws2.append(['Remark']); ws2.append(['nothing here'])
    xl = os.path.join(IMPDIR, 'sup.xlsx'); wb.save(xl)
    go_import(pg, 'suppliers'); load(pg, xl)
    r.check('an .xlsx opens (shared strings, numbers and a second sheet) and offers the sheets', pg.locator('#impSheet option').count() == 2 and counts(pg) == [2, 0, 0, 1], str(counts(pg)))
    r.check('the second row of the same name is refused as a repeat', 'appears twice' in pg.inner_text('#impPreview'))
    pg.select_option('#impSheet', 'Notes'); pg.wait_for_function("() => document.querySelector('#impCounts [data-n]').dataset.n !== '2'", timeout=10000)
    r.check('another sheet can be chosen (its rows are shown instead)', counts(pg)[0] == 0)
    pg.select_option('#impSheet', 'Suppliers'); pg.wait_for_function("() => document.querySelector('#impCounts [data-n]').dataset.n === '2'", timeout=10000)
    finish(pg)
    s1 = pg.evaluate("() => opsList('suppliers').find((x) => x.name === 'Imp Supplier One') || null")
    s2 = pg.evaluate("() => opsList('suppliers').find((x) => x.name === 'مورد الأخشاب الحديثة') || null")
    r.check('the suppliers arrived with phone, category and contact, and a code from the formula (the file had none)', s1 and s1['category'] == 'hardware' and s1['contact'] == 'Mr Hassan' and s1['phone'] == '0100 111 2222' and s1['code'].startswith('SUP-HDW-') and s2 and s2['code'].startswith('SUP-BRD-'), str((s1, s2)))
    r.check('a number cell is read as a phone number and "no" marks the supplier inactive', s2['phone'] == '1002223333' and s2['active'] is False and s1['active'] is True)

    # ================= expenses: dates, thousands separators, Arabic words =================
    exp = ('Date,Description,Amount,Type,Category,Repeat\n'
           '2026-10-01,Imp workshop rent,"12,000",indirect,rent,monthly\n'
           '24/10/2026,Imp electricity bill,٣٥٠٫٧٥,غير مباشر,كهرباء,\n'
           '2026-10-05,Imp wood panels,4800,direct,materials,\n'
           'not a date,Imp bad date,100,indirect,rent,\n'
           '2026-10-06,Imp zero,0,indirect,rent,\n')
    go_import(pg, 'expenses'); load(pg, put('exp.csv', exp))
    r.check('expenses: no "update" choice (they are only added) and the preview counts 3 new, 2 rejected', pg.locator('#impModeUpsert').count() == 0 and counts(pg) == [3, 0, 2], str(counts(pg)))
    finish(pg)
    g = lambda n: pg.evaluate("(n) => opsList('expenses').find((x) => x.name === n) || null", n)
    rent, elec, wood = g('Imp workshop rent'), g('Imp electricity bill'), g('Imp wood panels')
    r.check('"12,000" is 12000, the date 24/10/2026 is read day first, Arabic words give the kind and category', rent['amount'] == 12000 and rent['repeat'] == 'monthly' and rent['cat'] == 'rent'
            and elec['date'] == '2026-10-24' and elec['amount'] == 350.75 and elec['kind'] == 'indirect' and elec['cat'] == 'utilities' and wood['kind'] == 'direct' and wood['cat'] == 'materials', str((rent, elec, wood)))
    r.check('the rows with a bad date and a zero amount were refused', g('Imp bad date') is None and g('Imp zero') is None)
    go_import(pg, 'expenses'); load(pg, put('exp2.csv', exp))
    r.check('importing the same file again adds nothing (same date, name and amount are skipped)', counts(pg) == [0, 3, 2] and pg.is_disabled('#btnImportGo'), str(counts(pg)))

    # ================= shipments: supplier found by name =================
    lg = ('Title,Type,Supplier,Date,Reference,Cost\n'
          'Imp boards delivery,inbound,Imp Supplier One,2026-11-05,PO-IMP-1,1500\n'
          'Imp pickup,outbound,,2026-11-06,,\n'
          'Imp unknown supplier,inbound,Nobody Ltd,2026-11-07,,\n')
    go_import(pg, 'logistics'); load(pg, put('lg.csv', lg))
    r.check('shipments: 3 new rows, the unknown supplier is a warning', counts(pg) == [3, 0, 0, 0] and 'Nobody Ltd' in pg.inner_text('#impPreview'), str(counts(pg)))
    finish(pg)
    sh = pg.evaluate("() => opsList('logistics').filter((x) => x.title.startsWith('Imp '))")
    by = {x['title']: x for x in sh}
    sid = pg.evaluate("() => opsList('suppliers').find((x) => x.name === 'Imp Supplier One').id")
    r.check('the supplier was found by its name, the kind and the date read, a code from the formula given and the standard steps added',
            by['Imp boards delivery']['supplierId'] == sid and by['Imp boards delivery']['kind'] == 'inbound' and by['Imp boards delivery']['eta'] == '2026-11-05' and by['Imp boards delivery']['code'].startswith('SHP-')
            and by['Imp pickup']['kind'] == 'outbound' and len(by['Imp boards delivery']['steps']) > 0 and by['Imp unknown supplier']['supplierId'] == '', str(by['Imp boards delivery']))
    go_import(pg, 'logistics'); load(pg, put('lg2.csv', lg))
    r.check('importing the shipments again skips them (matched by reference, then by title)', counts(pg) == [0, 0, 3, 0], str(counts(pg)))

    # ================= wrong files =================
    go_import(pg, 'inventory')
    for name, data, expect in (('old.xls', b'\xd0\xcf\x11\xe0junk', '.xls'), ('bad.json', b'{"a": ', 'JSON'), ('broken.xlsx', b'PK\x03\x04 not a workbook', 'could not be read'), ('empty.csv', b'', 'no rows')):
        pg.set_input_files('#impFile', {'name': name, 'mimeType': 'application/octet-stream', 'buffer': data})
        pg.wait_for_selector('#impMsg.bad', timeout=10000)
        r.check(f'{name}: refused with a plain message', expect in pg.inner_text('#impMsg') and pg.locator('#impPreview').count() == 0, pg.inner_text('#impMsg'))
        pg.evaluate("() => { const m = document.querySelector('#impMsg'); m.className = 'msg'; m.textContent = ''; }")

    # ================= History: one entry per file =================
    pg.evaluate("location.hash = '#audit'"); pg.wait_for_selector('#audList', timeout=30000)
    pg.wait_for_function("() => /Imported/.test(document.body.innerText) && /3 added, 0 updated/.test(document.body.innerText)", timeout=40000)
    r.check('History has one "Imported" entry per file with the counts', pg.evaluate("() => (document.body.innerText.match(/Imported/g) || []).length") >= 6)
    pg.evaluate("location.hash = '#dashboard'"); pg.wait_for_selector('#btnNewClient', timeout=30000)
    S.errors[n0:] = [e for e in S.errors[n0:] if not (e[1] == 'error' and 'Failed to load resource' in e[2] and '409' in e[2])]
