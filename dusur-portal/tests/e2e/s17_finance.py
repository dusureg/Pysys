"""Admin: the Finance screen. Direct cost, indirect cost and total operations cost over a period; the expense ledger (one-off, monthly, yearly); the cost structure,
month by month, projects with their share of the shared costs; the monthly budget; the printable Costs report and its Excel file; view-only rights; history of every change.
The numbers are worked out by hand for a quarter in 2019 (no project starts then), so the expectations do not depend on the other suites."""
import json, re
from mockgh import ADMIN_URL
from lib import *

EXP = 'data/private/ops/expenses.json'
FROM, TO = '2019-01-01', '2019-03-31'


def num(text):
    """'EGP 4,650.00' -> 4650.0 (also '-EGP 5,850.00')"""
    m = re.findall(r'[\d.,]+', text)
    if not m:
        return None
    v = float(m[0].replace(',', ''))
    return -v if '-' in text.split(m[0])[0] or '−' in text.split(m[0])[0] else v


def add_expense(pg, name, kind, cat, amount, date, repeat='none', until=''):
    pg.evaluate("location.hash = '#expenses/new'"); pg.wait_for_selector('#expName')
    pg.fill('#expName', name); pg.select_option('#expKindSel', kind); pg.select_option('#expCatSel', cat)
    pg.fill('#expAmount', str(amount)); pg.fill('#expDate', date); pg.select_option('#expRepeatSel', repeat)
    if until:
        pg.fill('#expUntil', until)
    save(pg)
    return pg.evaluate('location.hash').split('/')[-1]


def kpis(pg, scope='#finBody'):
    return {x.locator('.l').inner_text(): x.locator('.v').inner_text() for x in pg.locator(scope + ' .kpi').all()}


def rows(pg, sel):
    return [[c.strip() for c in r.locator('td, th').all_inner_texts()] for r in pg.locator(sel).all()]


def open_period(pg, frm=FROM, to=TO, basis=None):
    pg.evaluate("location.hash = '#finance'"); pg.wait_for_selector('#finScreen', timeout=40000)
    pg.select_option('#finPreset', 'custom'); pg.wait_for_selector('#finCustom:not([hidden])')
    pg.fill('#finFrom', frm); pg.fill('#finTo', to)
    if basis:
        pg.select_option('#finBasis', basis)


def run(S):
    r, mock, pg = S.r, S.mock, S.admin
    pg.set_viewport_size({'width': 1280, 'height': 900})
    dialogs = []
    on_dialog = lambda d: (dialogs.append(d.message), d.accept())
    pg.on('dialog', on_dialog)

    # ---- the form checks what it is given
    pg.evaluate("location.hash = '#expenses/new'"); pg.wait_for_selector('#expName')
    n0 = len(json.loads(pg.evaluate("() => JSON.stringify(opsList('expenses'))")))
    pg.click('#btnSave'); toast_text(pg, 'Write what the expense is for')
    pg.fill('#expName', 'Check form'); pg.click('#btnSave'); toast_text(pg, 'more than zero')
    pg.fill('#expAmount', '10'); pg.select_option('#expRepeatSel', 'monthly'); pg.fill('#expDate', '2019-05-01'); pg.fill('#expUntil', '2019-04-01'); pg.click('#btnSave'); toast_text(pg, 'cannot be before')
    r.check('an expense with no name, no amount or an end date before the start is refused with a plain message and nothing is saved',
            len(json.loads(pg.evaluate("() => JSON.stringify(opsList('expenses'))"))) == n0 and pg.evaluate('location.hash') == '#expenses/new')
    pg.select_option('#expKindSel', 'direct'); direct_cats = pg.locator('#expCatSel option').evaluate_all('els => els.map(e => e.value)')
    pg.select_option('#expKindSel', 'indirect'); ind_cats = pg.locator('#expCatSel option').evaluate_all('els => els.map(e => e.value)')
    r.check('direct expenses take the cost categories of a job (materials, labour...), indirect ones the overhead categories (rent, utilities...)', 'materials' in direct_cats and 'rent' not in direct_cats and 'rent' in ind_cats and 'materials' not in ind_cats, f'{direct_cats} {ind_cats}')
    pg.evaluate("() => { opsEd = null; }"); pg.evaluate("location.hash = '#finance'"); pg.wait_for_selector('#finScreen')          # drop the half-filled form

    # ---- four expenses for a quarter of 2019, worked out by hand
    #   Rent        indirect  1000 monthly, 15th, until 31 Mar   -> Jan, Feb, Mar            = 3000
    #   Edge band   direct     450 once, 10 Feb                                            =  450
    #   Insurance   indirect  1200 yearly, 20 Feb                -> one occurrence         = 1200
    #   Power       indirect   600 monthly from 1 Feb, no end    -> Feb, Mar                = 1200
    id_rent = add_expense(pg, 'Rent 2019', 'indirect', 'rent', 1000, '2019-01-15', 'monthly', '2019-03-31')
    id_edge = add_expense(pg, 'Edge banding 2019', 'direct', 'materials', 450, '2019-02-10')
    id_ins = add_expense(pg, 'Insurance 2019', 'indirect', 'insurance', 1200, '2019-02-20', 'yearly')
    id_pow = add_expense(pg, 'Power 2019', 'indirect', 'utilities', 600, '2019-02-01', 'monthly')
    r.check('the four expenses were saved with their own ids (EXP-…) into one sealed file', all(re.fullmatch(r'EXP-\d+', x) for x in (id_rent, id_edge, id_ins, id_pow)) and len({id_rent, id_edge, id_ins, id_pow}) == 4
            and set(json.loads(mock.text(EXP))) == {'v', 'iv', 'ct'} and not [w for w in ('Rent 2019', 'Edge banding', 'Insurance 2019') if w in mock.text(EXP)])

    # ---- the overview of the quarter
    open_period(pg)
    pg.wait_for_selector('#finStructure')
    r.check('the period line names the dates, the number of projects (none start in 2019) and of expense entries (3 + 1 + 1 + 2 = 7)', '2019' in pg.inner_text('#finPeriod') and '0 project' in pg.inner_text('#finPeriod') and '7 expense' in pg.inner_text('#finPeriod'), pg.inner_text('#finPeriod'))
    k = kpis(pg)
    r.check('direct cost 450 · indirect cost 5,400 · total operations cost 5,850 (= direct + indirect)', num(k['Direct cost']) == 450 and num(k['Indirect cost']) == 5400 and num(k['Total operations cost']) == 5850, str(k))
    r.check('with no revenue the operating profit is the negative of the total, and break-even cannot be worked out', num(k['Operating profit']) == -5850 and num(k['Revenue']) == 0 and k['Break-even revenue'] == '—', str(k))
    r.check('the share of each part is shown (450 of 5,850 is 7.7 %)', '7.7' in pg.inner_text('.kpi:has(.l:text-is("Direct cost"))') and '92.3' in pg.inner_text('.kpi:has(.l:text-is("Indirect cost"))'))
    cats = rows(pg, '#finCats tbody tr')
    by_kind = {}
    for tr in pg.locator('#finCats tbody tr').all():
        by_kind.setdefault(tr.get_attribute('data-kind'), []).append(num(tr.locator('td').nth(2).inner_text()))
    r.check('the cost structure lists 1 direct and 3 indirect lines that add up to the totals, with the grand total in the footer', len(cats) == 4 and sum(by_kind['direct']) == 450 and sorted(by_kind['indirect']) == [1200, 1200, 3000]
            and num(pg.inner_text('#finCats tfoot')) == 5850, str(cats))
    r.check('a bar shows the direct / indirect mix', pg.locator('#finStructure .stackbar .seg.direct').count() == 1 and pg.locator('#finStructure .stackbar .seg.indirect').count() == 1)
    mon = {tr.get_attribute('data-month'): [num(c) for c in tr.locator('td').all_inner_texts()[1:6]] for tr in pg.locator('#finTrend tbody tr').all()}
    r.check('month by month: Jan 1,000 · Feb 3,250 (450 direct + 2,800 indirect) · Mar 1,600; the three months add up to 5,850',
            list(mon) == ['2019-01', '2019-02', '2019-03'] and mon['2019-02'] == [0, 450, 2800, 3250, -3250] and mon['2019-01'][3] == 1000 and mon['2019-03'][3] == 1600 and sum(v[3] for v in mon.values()) == 5850, str(mon))
    fixed = pg.evaluate("""() => { const mine = new Set(['Insurance 2019', 'Power 2019']); const others = opsList('expenses').filter((e) => e.repeat !== 'none' && e.amount > 0 && (!e.until || e.until >= todayStr()) && !mine.has(e.name)).reduce((a, e) => a + (e.repeat === 'monthly' ? e.amount : e.amount / 12), 0);
      return { shown: finCompute(finSel).monthly, others }; }""")
    r.check('"Fixed costs per month" counts the repeating expenses with no end (power 600 + insurance 1,200 / 12 = 700) and not the rent that ended', abs(fixed['shown'] - fixed['others'] - 700) < 0.01, str(fixed))

    # ---- projects tab: none start in 2019
    pg.click('#finTab-projects')
    r.check('the Projects tab says so when no project started in the period', 'No project started' in pg.inner_text('#finBody'))

    # ---- the expense ledger
    pg.click('#finTab-expenses'); pg.wait_for_selector('#expList table')
    r.check('the ledger lists all 7 entries (monthly and yearly ones expanded) and the counter gives their sum', pg.locator('#expList tbody tr').count() == 7 and '7 of 7' in pg.inner_text('#expCount') and num(pg.inner_text('#expCount').split('·')[1]) == 5850, pg.inner_text('#expCount'))
    pg.select_option('#expKind', 'direct')
    r.check('filter by type: direct shows the edge banding only', pg.locator('#expList tbody tr').count() == 1 and 'Edge banding 2019' in pg.inner_text('#expList'))
    pg.select_option('#expKind', ''); pg.select_option('#expCat', 'utilities')
    r.check('filter by category: utilities shows the two power entries (600 each)', pg.locator('#expList tbody tr').count() == 2 and num(pg.inner_text('#expCount').split('·')[1]) == 1200)
    pg.select_option('#expCat', ''); pg.fill('#expSearch', 'rent')
    r.check('search by name: "rent" finds the three rent entries (case does not matter)', pg.locator('#expList tbody tr').count() == 3)
    pg.fill('#expSearch', 'nothing like this')
    r.check('a search with no match says so', 'No expense matches' in pg.inner_text('#expList'))
    pg.fill('#expSearch', '')
    rec = pg.inner_text('#expRecurring')
    r.check('the repeating list names the open-ended expenses and leaves out the ended rent and the one-off', 'Power 2019' in rec and 'Insurance 2019' in rec and 'Rent 2019' not in rec and 'Edge banding' not in rec, rec[:200])

    # ---- the monthly budget
    pg.click('#finTab-overview'); pg.wait_for_selector('#finBudget')
    r.check('before a budget is set both lines say so', pg.locator('#finBudget .budline').count() == 2 and 'No budget set' in pg.inner_text('#finBudget'))
    pg.fill('#finBudDirect', '100'); pg.fill('#finBudIndirect', '1000'); pg.click('#btnSaveBudget'); toast_text(pg, 'Saved')
    d_line, i_line = pg.inner_text('#finBudget .budline[data-line=direct]'), pg.inner_text('#finBudget .budline[data-line=indirect]')
    r.check('a monthly budget is multiplied by the 3 months of the period: direct 450 of 300 is over by 150; indirect 5,400 of 3,000 is over by 2,400', 'Over by' in d_line and num(d_line.split('Over by')[1]) == 150 and 'Over by' in i_line and num(i_line.split('Over by')[1]) == 2400, d_line + ' | ' + i_line)
    pg.fill('#finBudIndirect', '2000'); pg.click('#btnSaveBudget'); toast_text(pg, 'Saved')
    i_line = pg.inner_text('#finBudget .budline[data-line=indirect]')
    r.check('a bigger budget turns it into "left": 5,400 of 6,000 leaves 600', 'left' in i_line and '600' in i_line, i_line)
    r.check('the budget is stored with the sealed settings, not in the clear', pg.evaluate('() => session.settings.budget') == {'direct': 100, 'indirect': 2000} and 'budget' not in mock.text('data/private/settings.json'))

    # ---- the history of what we did
    pg.wait_for_function('() => auditQ.length === 0', timeout=20000, polling=250)
    h = pg.evaluate("""async () => { const d = await loadAuditMonth(auditMonthOf(oiso())); return d.items.filter((e) => e.area === 'expenses' || e.ref === 'budget').map((e) => [e.area, e.act, e.title, e.ref, (e.ch || []).map((c) => c.join('|'))]); }""")
    names = [x[2] for x in h if x[0] == 'expenses' and x[1] == 'create']
    r.check('History recorded the four new expenses by name and the two budget changes (the second shows 1000 -> 2000)', all(n in names for n in ('Rent 2019', 'Edge banding 2019', 'Insurance 2019', 'Power 2019'))
            and len([x for x in h if x[3] == 'budget']) == 2 and any('indirect|1000|2000' in c for x in h if x[3] == 'budget' for c in x[4]), str(h)[:400])

    # ---- change one expense: the numbers follow, History shows before -> after
    pg.evaluate(f"location.hash = '#expenses/{id_rent}'"); pg.wait_for_selector('#expAmount')
    r.check('the expense form has a History link for that record', pg.get_attribute('#btnRecHistory', 'href') == '#audit/' + id_rent)
    pg.fill('#expAmount', '1100'); save(pg)
    open_period(pg); pg.wait_for_selector('#finStructure')
    k = kpis(pg)
    r.check('after raising the rent to 1,100 the three months follow: indirect 5,700 and total 6,150', num(k['Indirect cost']) == 5700 and num(k['Total operations cost']) == 6150, str(k))
    pg.wait_for_function('() => auditQ.length === 0', timeout=20000, polling=250)
    pg.evaluate(f"location.hash = '#audit/{id_rent}'"); pg.wait_for_selector('#audRefChip')
    first = pg.locator('#audList li.audit-item').first; first.locator('summary').click()
    cells = [first.locator('.audit-ch tbody tr').nth(i).locator('td').all_inner_texts() for i in range(first.locator('.audit-ch tbody tr').count())]
    r.check('the record history shows the change as amount 1000 -> 1100, and the creation below it', cells == [['amount', '1000', '1100']] and 'Created' in pg.locator('#audList li.audit-item').last.inner_text(), str(cells))

    # ---- the printable Costs report
    open_period(pg); pg.wait_for_selector('#finStructure')
    pg.click('#btnFinPrint'); pg.wait_for_selector('#rpPaper', timeout=30000)
    r.check('"Printable report" on the Finance screen opens the Costs report, landscape, with the same period and basis', pg.input_value('#rpType') == 'costs' and pg.locator('#rpPaper.land').count() == 1 and pg.input_value('#rpFinPreset') == 'custom'
            and pg.input_value('#rpFinFrom') == FROM and pg.input_value('#rpFinBasis') == 'revenue' and '2019' in pg.inner_text('.rp-titleblock') and 'Confidential' in pg.inner_text('.rp-foot'))
    kk = {x.locator('.l').inner_text(): x.locator('.v').inner_text() for x in pg.locator('#rpPaper .rp-kpi').all()}
    r.check('the report KPIs match the screen: direct 450, indirect 5,700, total 6,150', num(kk['Direct cost']) == 450 and num(kk['Indirect cost']) == 5700 and num(kk['Total operations cost']) == 6150, str(kk))
    titles = pg.locator('#rpPaper .rp-tblwrap h3').all_inner_texts()
    r.check('it carries the cost structure, month by month and the expense ledger (no projects table: none started)', titles == ['Cost structure', 'Month by month', 'Expenses'], str(titles))
    r.check('and three real charts: direct vs indirect, cost by category, cost by month', pg.locator('#rpPaper figure.rp-chart').count() == 3 and pg.locator('#rpPaper svg.rp-svg').count() == 3, pg.locator('#rpPaper figure.rp-chart figcaption').all_inner_texts())
    r.check('the ledger table has the 7 entries and a total row of 6,150', pg.locator('#rpPaper .rp-tbl').last.locator('tbody tr:not(.total)').count() == 7 and '6,150' in pg.locator('#rpPaper .rp-tbl').last.inner_text())
    pg.fill('#rpFinFrom', '2019-02-01')
    pg.wait_for_function("() => { const v = [...document.querySelectorAll('#rpPaper .rp-kpi')].find((x) => x.querySelector('.l').textContent === 'Total operations cost'); return v && /5,050/.test(v.textContent); }", timeout=20000, polling=250)
    r.check('moving the start to 1 February drops January (rent 1,100): rent 2,200 + edge banding 450 + insurance 1,200 + power 1,200 = total 5,050', True)
    with pg.expect_download() as dl:
        pg.click('#btnRpXlsx')
    r.check('the Excel file of the Costs report downloads', dl.value.suggested_filename.endswith('.xlsx') and 'Costs' in dl.value.suggested_filename, dl.value.suggested_filename)
    pg.select_option('#rpFinPreset', 'custom'); pg.fill('#rpFinFrom', '2018-01-01'); pg.fill('#rpFinTo', '2018-03-31')
    pg.wait_for_selector('#rpEmpty', timeout=20000)
    r.check('a period with no projects and no expenses says so instead of printing a page of zeros', 'no projects or expenses' in pg.inner_text('#rpEmpty').lower())
    pg.fill('#rpFinFrom', FROM); pg.fill('#rpFinTo', TO)

    # ---- projects: the shared costs are shared, nothing is lost or counted twice
    pg.evaluate("location.hash = '#finance'"); pg.wait_for_selector('#finScreen'); pg.select_option('#finPreset', 'all'); pg.click('#finTab-projects'); pg.wait_for_selector('#finProjTable')
    n_proj = pg.locator('#finProjTable tbody tr').count()
    r.check('over all time every project of every client is listed', n_proj >= 2, str(n_proj))

    def totals(basis):
        pg.select_option('#finBasis', basis); pg.click('#finTab-overview'); k2 = kpis(pg); pg.click('#finTab-projects'); pg.wait_for_selector('#finProjTable')
        foot = [num(x) for x in pg.locator('#finProjTable tfoot th').all_inner_texts()[1:]]
        body = [[num(x) for x in tr.locator('td').all_inner_texts()[1:8]] for tr in pg.locator('#finProjTable tbody tr').all()]
        return k2, foot, body
    for basis in ('revenue', 'direct', 'equal'):
        k2, foot, body = totals(basis)
        price, own_d, own_i, sh_d, sh_i, cost, profit = foot[:7]
        ok = (abs(own_d + sh_d - num(k2['Direct cost'])) <= 1 and abs(own_i + sh_i - num(k2['Indirect cost'])) <= 1 and abs(cost - num(k2['Total operations cost'])) <= 1 and abs(price - cost - profit) <= 1 and abs(price - num(k2['Revenue'])) <= 1)
        r.check(f'sharing basis "{basis}": own cost + shared cost = the direct / indirect cost of the overview, and revenue - cost = profit', ok, f'{foot} {k2}')
        if basis == 'equal':
            r.check('equal sharing gives every project the same share of the direct and indirect pool', len({round(b[3], 1) for b in body}) == 1 and len({round(b[4], 1) for b in body}) == 1, str(body))
        if basis == 'revenue':
            wrong = [b for b in body if price and abs(b[3] - sh_d * b[0] / price) > 1]
            r.check('sharing by revenue gives each project its revenue share of the shared direct cost', not wrong, str(wrong[:2]))

    # ---- a view-only finance role cannot change anything here
    out = pg.evaluate("""async () => {
      const u = session.user, at = accessAt; try {
      accessAt = Date.now() + 3600000;                                 // a made-up member is not in the team file: do not let the periodic check sign it out
      session.user = { id: 'x', owner: false, name: 'Viewer', role: 'viewer', perms: mkPerms({ finance: 1, reports: 1 }) }; applyRoleUi(); location.hash = '#expenses/new';
      await new Promise((ok) => setTimeout(ok, 600));
      const a = { note: !!document.getElementById('roNote'), save: !!document.getElementById('btnSave'), name: !!document.getElementById('expName') && document.getElementById('expName').matches(':disabled') };
      opsEd = null; location.hash = '#finance'; await new Promise((ok) => setTimeout(ok, 900));
      const b = { add: (() => { const e = document.getElementById('btnNewExpense'); return !!e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0; })(), budget: !!document.getElementById('finBudgetForm'), screen: !!document.getElementById('finScreen') };
      return { a, b }; } finally { accessAt = at; if (session) { session.user = u; applyRoleUi(); } } }""")
    r.check('finance view-only: the expense form is switched off with a note and no Save, the Add button is hidden and the budget form is not offered', out['a']['note'] and not out['a']['save'] and out['a']['name'] and out['b']['screen'] and not out['b']['add'] and not out['b']['budget'], str(out))
    pg.evaluate("location.hash = '#finance'"); pg.wait_for_selector('#finScreen')

    # ---- tidy: the 2019 expenses are deleted again (and the deletion is recorded)
    for eid in (id_rent, id_edge, id_ins, id_pow):
        pg.evaluate(f"location.hash = '#expenses/{eid}'"); pg.wait_for_selector('#btnOpsDelete'); pg.click('#btnOpsDelete'); toast_text(pg, 'Deleted'); pg.wait_for_selector('#finScreen')
    r.check('the delete button asks first, and the deleted expenses are gone from the ledger', any('Rent 2019' in d for d in dialogs) and not [e for e in json.loads(pg.evaluate("() => JSON.stringify(opsList('expenses'))")) if e['name'].endswith('2019')])
    open_period(pg); pg.click('#finTab-overview'); pg.wait_for_selector('#finStructure')
    r.check('the quarter is empty again: "No costs in this period"', 'No costs in this period' in pg.inner_text('#finStructure') and num(kpis(pg)['Total operations cost']) == 0)
    pg.wait_for_function('() => auditQ.length === 0', timeout=20000, polling=250)
    dels = pg.evaluate("""async () => (await loadAuditMonth(auditMonthOf(oiso()))).items.filter((e) => e.area === 'expenses' && e.act === 'delete').map((e) => e.title)""")
    r.check('History recorded the four deletions with the names', sorted(dels) == ['Edge banding 2019', 'Insurance 2019', 'Power 2019', 'Rent 2019'], str(dels))
    pg.select_option('#finPreset', 'year')
    pg.evaluate("location.hash = '#dashboard'"); pg.wait_for_selector('#btnNewClient')
    pg.remove_listener('dialog', on_dialog)
