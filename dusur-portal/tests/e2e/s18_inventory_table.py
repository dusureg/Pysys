"""Admin: Inventory as an organised table. Materials grouped by category (or status, or supplier) with a count and a subtotal per group, sortable columns,
a totals row, collapsible groups, filters, a Cards view for phones, quick stock movements from a table row, view-only rights, Arabic.
Runs after the inventory suite, so the seven materials of that suite are there."""
import re
from mockgh import ADMIN_URL
from lib import *


def money_of(text):
    m = re.findall(r'[\d,]+\.\d{2}', text)
    return float(m[-1].replace(',', '')) if m else None


def goto(pg):
    pg.evaluate("location.hash = '#dashboard'"); pg.wait_for_selector('#btnRefresh, #btnNewClient', timeout=30000)
    pg.evaluate("location.hash = '#inventory'"); pg.wait_for_selector('#invScreen', timeout=30000); pg.wait_for_selector('.inv-item')


def names(pg):
    return [x.split('\n')[0] for x in pg.locator('#invTable tbody tr.inv-item .item-top strong').all_inner_texts()]


def values(pg):
    return [money_of(x) for x in pg.locator('#invTable tbody tr.inv-item td.c-value').all_inner_texts()]


def run(S):
    r, mock, pg = S.r, S.mock, S.admin
    pg.set_viewport_size({'width': 1280, 'height': 900})
    pg.evaluate("() => { invSel = { q: '', cat: '', sup: '', show: 'all', view: '', group: 'category', sort: 'status', dir: 1, closed: [] }; }")
    goto(pg)
    n_items = pg.evaluate("() => opsList('inventory').length")

    # ---- the table
    r.check('on a wide screen Inventory opens as a table with the Table view selected', pg.locator('#invTable').count() == 1 and pg.get_attribute('#invView-table', 'aria-pressed') == 'true' and pg.get_attribute('#invView-cards', 'aria-pressed') == 'false')
    heads = [x.strip() for x in pg.locator('#invTable thead th').all_inner_texts()]
    r.check('the columns are Material, In stock, Minimum, Maximum, On order, Status, Unit cost, Value, Supplier (and the actions)', all(x in [h_.split('\n')[0].strip() for h_ in heads] for x in ('Material', 'In stock', 'Minimum', 'Maximum', 'On order', 'Status', 'Unit cost', 'Value', 'Supplier')), str(heads))
    r.check('the table has a caption for screen readers and every material is a row with its name as the row header', pg.locator('#invTable caption').count() == 1 and pg.locator('#invTable tbody tr.inv-item th[scope=row]').count() == n_items == pg.locator('.inv-item').count())
    groups = pg.locator('#invTable tr.grp').all()
    labels = [g.locator('strong').inner_text() for g in groups]
    cats = pg.evaluate("() => [...new Set(opsList('inventory').map((i) => i.category))]")
    order = ['board', 'edge', 'hardware', 'finish', 'glass', 'accessory', 'other']
    r.check('materials are grouped by category in the usual order, one header per category in use, each with its count', len(groups) == len(cats) and [g.get_attribute('data-grp') for g in groups] == ['category:' + c for c in order if c in cats]
            and all('item(s)' in g.inner_text() for g in groups), str(labels))
    sub = [money_of(g.inner_text()) for g in groups]
    foot = pg.inner_text('#invTable tfoot')
    kp_value = money_of(pg.locator('#invScreen .kpis .kpi', has_text='Stock value').inner_text())
    r.check('the group subtotals add up to the total row, which equals the "Stock value" tile', abs(sum(x or 0 for x in sub) - money_of(foot)) < 0.01 and abs(money_of(foot) - kp_value) < 0.01 and f'Total · {n_items} materials' in foot, f'{sub} {foot} {kp_value}')
    r.check('the sort mark sits on the Status column (most urgent first) by default', pg.get_attribute('#invTable th:has([data-sort=status])', 'aria-sort') == 'ascending' and pg.get_attribute('#invTable th:has([data-sort=name])', 'aria-sort') == 'none')

    # ---- sorting
    pg.select_option('#invGroup', 'none')
    r.check('"No grouping" shows one flat table without group headers', pg.locator('#invTable tr.grp').count() == 0 and pg.locator('.inv-item').count() == n_items)
    pg.click('#invTable [data-sort=name]'); a = names(pg)
    r.check('clicking the Material header sorts by name (A to Z) and marks it ascending', a == sorted(a, key=str.casefold) and pg.get_attribute('#invTable th:has([data-sort=name])', 'aria-sort') == 'ascending' and pg.input_value('#invSort') == 'name', str(a))
    pg.click('#invTable [data-sort=name]'); b = names(pg)
    r.check('clicking it again reverses the order', b == a[::-1] and pg.get_attribute('#invTable th:has([data-sort=name])', 'aria-sort') == 'descending')
    pg.click('#invTable [data-sort=value]'); v = [x for x in values(pg) if x is not None]
    r.check('the Value column sorts from the largest value down first', v == sorted(v, reverse=True) and len(v) >= 3, str(v))
    pg.click('#invDir'); v2 = [x for x in values(pg) if x is not None]
    r.check('the direction button flips it and says which way it goes', v2 == sorted(v2) and 'Ascending' in pg.get_attribute('#invDir', 'aria-label'))
    pg.select_option('#invSort', 'stock'); cover = pg.evaluate("() => [...document.querySelectorAll('#invTable tbody tr.inv-item')].map((r) => { const it = opsFind('inventory', r.dataset.id); const t = Number(it.max) > 0 ? Number(it.max) : Number(it.min) * 2; return t > 0 ? Number(it.qty) / t : Number(it.qty) > 0 ? 1 : 0; })")
    r.check('the sort list offers the same choice: Stock level puts the lowest cover first', cover == sorted(cover), str(cover))
    pg.select_option('#invSort', 'status')

    # ---- other groupings
    pg.select_option('#invGroup', 'status')
    gl = [g.get_attribute('data-grp') for g in pg.locator('#invTable tr.grp').all()]
    r.check('grouping by status shows the groups that are in use, most urgent first (Act now, then Needs attention, ...)', gl == sorted(gl, key=lambda x: ['status:bad', 'status:warn', 'status:info', 'status:ok'].index(x)) and gl[0] == 'status:bad' and 'Act now' in pg.locator('#invTable tr.grp').first.inner_text(), str(gl))
    pg.select_option('#invGroup', 'supplier')
    gl = pg.locator('#invTable tr.grp strong').all_inner_texts()
    r.check('grouping by supplier lists the suppliers alphabetically and "No supplier" last', gl[-1] == 'No supplier' and gl[:-1] == sorted(gl[:-1], key=str.casefold) and 'Al Nour Boards' in gl, str(gl))
    r.check('a table that is not grouped by category adds a Category column', pg.locator('#invTable thead th.c-cat').count() == 1 and pg.locator('#invTable tbody tr.inv-item td.c-cat').count() == n_items)
    pg.select_option('#invGroup', 'category')
    r.check('grouped by category the Category column is dropped (the header says it)', pg.locator('#invTable thead th.c-cat').count() == 0)

    # ---- collapse a group
    first = pg.locator('#invTable tr.grp').first; key = first.get_attribute('data-grp'); in_group = pg.locator(f'#invTable tbody[data-grp="{key}"] tr.inv-item').count(); total_before = pg.inner_text('#invTable tfoot')
    first.locator('.grpbtn').click()
    r.check('a group folds away (aria-expanded=false) and its rows disappear; the total row still counts every material', pg.get_attribute(f'#invTable tr.grp[data-grp="{key}"] .grpbtn', 'aria-expanded') == 'false' and pg.locator('.inv-item').count() == n_items - in_group and pg.inner_text('#invTable tfoot') == total_before)
    pg.locator(f'#invTable tr.grp[data-grp="{key}"] .grpbtn').click()
    r.check('and opens again', pg.locator('.inv-item').count() == n_items)

    # ---- filters work on the table, and the totals follow them
    pg.select_option('#invShow', 'attention'); n_att = pg.locator('.inv-item').count()
    r.check('the "need attention" filter keeps only those rows and the total row counts them', n_att >= 1 and n_att == pg.evaluate("() => stockSummary(opsList('inventory')).attention") and f'Total · {n_att} materials' in pg.inner_text('#invTable tfoot'))
    pg.select_option('#invShow', 'all'); pg.fill('#invSearch', 'zzzz-no-such-material')
    r.check('no match: a plain message instead of an empty table', pg.locator('#invTable').count() == 0 and 'matches' in pg.inner_text('#invList').lower())
    pg.fill('#invSearch', '')

    # ---- quick stock movement from a row
    row = pg.locator('tr.inv-item', has_text='Glass 5 mm'); q0 = float(row.locator('.inv-big').get_attribute('data-qty'))
    row.locator('[data-mv=in]').click(); pg.wait_for_selector('tr.mvrow #mvQty')
    r.check('Receive opens its box in a row under the material', pg.locator('tr.mvrow').count() == 1 and pg.locator('tr.mvrow').locator('xpath=preceding-sibling::tr[1]').get_attribute('data-id') == row.get_attribute('data-id'))
    pg.fill('#mvQty', '12'); pg.fill('#mvNote', 'Delivery note 77'); pg.click('#btnMvApply'); toast_text(pg, 'Stock updated')
    pg.wait_for_function('() => auditQ.length === 0', timeout=20000, polling=250)
    q1 = float(pg.locator('tr.inv-item', has_text='Glass 5 mm').locator('.inv-big').get_attribute('data-qty'))
    h = pg.evaluate("""async () => (await loadAuditMonth(auditMonthOf(oiso()))).items.filter((e) => e.area === 'inventory' && e.act === 'stock-in' && /Glass 5 mm/.test(e.title)).map((e) => [e.note, e.ch.map((c) => c.join('|'))])""")
    r.check('the row shows the new quantity and History recorded it (before -> after, with the note)', q1 == q0 + 12 and ['Delivery note 77', [f'qty|{q0:g}|{q1:g}']] in h, f'{q0} {q1} {h}')

    # ---- cards view
    pg.click('#invView-cards'); pg.wait_for_selector('.invcards')
    r.check('Cards view lists the same materials as cards under a heading per category', pg.locator('#invTable').count() == 0 and pg.locator('div.inv-item').count() == n_items and pg.locator('h3.invgrp-h').count() == len(cats) and pg.get_attribute('#invView-cards', 'aria-pressed') == 'true')
    pg.click('#invView-table'); pg.wait_for_selector('#invTable')

    # ---- view-only rights: the movement buttons go, the table stays
    out = pg.evaluate("""async () => {
      const u = session.user, at = accessAt; try {
        accessAt = Date.now() + 3600000; session.user = { id: 'x', owner: false, name: 'Viewer', role: 'viewer', perms: mkPerms({ inventory: 1, reports: 1 }) }; applyRoleUi(); drawInventory();
        await new Promise((ok) => setTimeout(ok, 300));
        const shown = (sel) => [...document.querySelectorAll(sel)].filter((e) => getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0).length;
        return { rows: document.querySelectorAll('.inv-item').length, mv: shown('[data-mv]'), add: shown('#btnNewItem'), edit: shown('.inv-item a.btn') };
      } finally { accessAt = at; if (session) { session.user = u; applyRoleUi(); drawInventory(); } } }""")
    r.check('with view-only rights every material is still listed and openable, but Receive / Use / Count and "Add material" are hidden', out['rows'] == n_items and out['mv'] == 0 and out['add'] == 0 and out['edit'] == n_items, str(out))

    # ---- Arabic and RTL
    pg.click('#btnLang'); pg.wait_for_function("() => document.documentElement.lang === 'ar'")
    r.check('in Arabic the table is right-to-left with Arabic headers, groups and totals', pg.evaluate('document.dir') == 'rtl' and 'المادة' in pg.inner_text('#invTable thead') and 'الإجمالي' in pg.inner_text('#invTable tfoot') and pg.locator('#invTable tr.grp').count() == len(cats))
    pg.click('#btnLang'); pg.wait_for_function("() => document.documentElement.lang === 'en'")

    # ---- a phone: cards by default, and nothing makes the page scroll sideways
    pg.set_viewport_size({'width': 390, 'height': 800}); pg.evaluate("() => { invSel.view = ''; }"); goto(pg)
    r.check('on a phone the default view is Cards and the page does not scroll sideways', pg.locator('.invcards').count() == 1 and pg.locator('#invTable').count() == 0 and pg.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'))
    pg.click('#invView-table'); pg.wait_for_selector('#invTable')
    wide = pg.evaluate("""() => [...document.body.querySelectorAll('*')].filter((e) => !e.closest('.tablewrap') && !e.closest('.sr') && e.getBoundingClientRect().right > innerWidth + 1 && getComputedStyle(e).display !== 'none').slice(0, 6).map((e) => e.tagName + '#' + e.id + '.' + e.className + ' ' + Math.round(e.getBoundingClientRect().right))""")
    r.check('the table can still be chosen on a phone: it scrolls inside its own frame, the page does not', pg.evaluate('document.documentElement.scrollWidth <= innerWidth + 1') and pg.evaluate("() => { const w = document.querySelector('.invwrap'); return w.scrollWidth > w.clientWidth; }"), str(wide) + ' ' + str(pg.evaluate('[document.documentElement.scrollWidth, innerWidth]')))
    pg.set_viewport_size({'width': 1280, 'height': 900}); pg.evaluate("() => { invSel.view = ''; }")
    pg.evaluate("location.hash = '#dashboard'"); pg.wait_for_selector('#btnNewClient')
