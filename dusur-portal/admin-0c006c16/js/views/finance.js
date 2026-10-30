/**
 * <admin>/js/views/finance.js  -  Financial status: direct cost, indirect cost and total operations cost
 * Three tabs over one period: Overview (the numbers, cost structure, month by month, budget), Projects (what each job really cost, with its share of the shared costs)
 * and Expenses (the ledger of company costs that belong to no single job: rent, power, wages, marketing; one-off or repeating). One expense form (#expenses/<id>).
 * Loaded by: admin page
 */
'use strict';

/* =====================================================================
   Finance screen
   ===================================================================== */
let finSel = { preset: 'year', from: '', to: '', basis: 'revenue', tab: 'overview', q: '', kind: '', cat: '' };
const FIN_TABS = ['overview', 'projects', 'expenses'];
const finMonthLabel = (k) => { const [y, m] = k.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString(locale(), { month: 'short', year: 'numeric' }); };
const catLabel = (kind, cat) => catText(kind, cat);
const kindBadge = (kind) => h('span', { class: 'badge ' + (kind === 'direct' ? 'progress' : 'pending'), 'data-kind': kind }, t('fin.kind.' + kind));
const shareOf = (part, whole) => (whole > 0 ? part / whole : null);

async function renderFinance(token) {
  if (!store) {
    mount(notice(t('dash.loading'), t('dash.loadingSub'), 'info', { spinner: true }));
    try { await loadStore(); } catch (e) {
      if (token === routeToken) mount(notice(t('err.load'), e.message, 'bad', { actions: [h('button', { class: 'btn', type: 'button', onclick: () => route() }, t('act.retry'))] }));
      return;
    }
    if (token !== routeToken) return;
  }
  if (!(await ensureOps(token, ['expenses']))) return;
  CUR = (session.settings && session.settings.currency) || CUR;
  drawFinance();
}

function drawFinance() {
  const body = h('div', { class: 'stack', id: 'finBody' }), sub = h('p', { class: 'hint', id: 'finPeriod', role: 'status' });
  const tabBtns = FIN_TABS.map((k) => h('button', { class: 'tab', type: 'button', role: 'tab', id: 'finTab-' + k, 'aria-controls': 'finBody', onclick: () => { finSel.tab = k; paint(); } }, t('fin.tab.' + k)));
  const paint = () => {
    const c = finCompute(finSel);
    sub.textContent = t('fin.periodIs', { p: finPeriodText(finSel), n: nf(c.projs.length), e: nf(c.occ.length) });
    tabBtns.forEach((b, i) => b.setAttribute('aria-selected', String(FIN_TABS[i] === finSel.tab)));
    body.setAttribute('aria-labelledby', 'finTab-' + finSel.tab);
    body.replaceChildren(...(finSel.tab === 'projects' ? finProjects(c) : finSel.tab === 'expenses' ? finExpenses(c, paint) : finOverview(c, paint)).filter(Boolean));
  };
  const custom = h('div', { class: 'grid2', id: 'finCustom', hidden: finSel.preset !== 'custom' },
    fld('fin.from', h('input', { type: 'date', id: 'finFrom', value: finSel.from, onchange: (e) => { finSel.from = e.target.value; paint(); } })),
    fld('fin.to', h('input', { type: 'date', id: 'finTo', value: finSel.to, onchange: (e) => { finSel.to = e.target.value; paint(); } })));
  const preset = selectEl(FIN_PRESETS.map((p) => [p, t('fin.p.' + p)]), finSel.preset, (v) => { finSel.preset = v; custom.hidden = v !== 'custom'; paint(); }, 'finPreset');
  const basis = selectEl(FIN_BASES.map((b) => [b, t('fin.basis.' + b)]), finSel.basis, (v) => { finSel.basis = v; paint(); }, 'finBasis');
  mount(h('section', { class: 'stack', id: 'finScreen' },
    h('div', { class: 'page-head' }, h('h1', {}, t('fin.title')),
      h('div', { class: 'actions' }, encBadge(),
        h('button', { class: 'btn', type: 'button', id: 'btnFinRefresh', onclick: () => { store = null; delete ops.expenses; route(); } }, t('act.refresh')),
        can('reports') ? h('a', { class: 'btn', href: '#reports/costs', id: 'btnFinPrint' }, t('ops.printReport')) : null,
        h('a', { class: 'btn', href: '#import/expenses', id: 'btnImp-expenses', 'data-edit': 'finance' }, t('imp.btn')),
        h('a', { class: 'btn primary', href: '#expenses/new', id: 'btnNewExpense', 'data-edit': 'finance' }, t('exp.add')))),
    h('p', { class: 'hint' }, t('fin.hint')),
    h('div', { class: 'card stack-sm finbar' }, h('div', { class: 'filters3' }, fld('fin.period', preset), fld('fin.basis', basis)), custom, sub),
    h('div', { class: 'tabs', role: 'tablist', 'aria-label': t('fin.tabs') }, tabBtns), body));
  paint();
}

/* ---------------- overview ---------------- */
function finOverview(c, paint) {
  const dShare = shareOf(c.direct, c.total), iShare = shareOf(c.indirect, c.total);
  const k = kpis(
    kpi(t('fin.revenue'), money(c.revenue), '', t('fin.collectedN', { v: money(c.collected) })),
    kpi(t('fin.k.direct'), money(c.direct), '', t('fin.shareOfTotal', { p: pct(dShare) })),
    kpi(t('fin.k.indirect'), money(c.indirect), '', t('fin.shareOfTotal', { p: pct(iShare) })),
    kpi(t('fin.k.total'), money(c.total), c.total > 0 ? 'strong' : '', t('fin.k.totalSub')),
    kpi(t('fin.k.profit'), money(c.profit), profitCls(c.profit), t('fin.margin') + ' ' + pct(c.margin)),
    kpi(t('fin.k.overhead'), pct(c.overheadRate), '', t('fin.k.overheadSub')),
    kpi(t('fin.k.breakeven'), c.breakEven == null ? '—' : money(c.breakEven), '', t('fin.k.breakevenSub')),
    kpi(t('fin.k.monthly'), money(c.monthly), '', t('fin.k.monthlySub', { n: nf(c.recurring.length) })));
  const mix = c.total > 0 ? h('div', { class: 'stackbar', role: 'img', 'aria-label': t('fin.mixAria', { d: pct(dShare), i: pct(iShare) }) },
    h('i', { class: 'seg direct', style: 'width:' + Math.round((dShare || 0) * 1000) / 10 + '%' }), h('i', { class: 'seg indirect', style: 'width:' + Math.round((iShare || 0) * 1000) / 10 + '%' })) : null;
  const rows = c.cats.slice().sort((a, b) => (a.kind === b.kind ? b.amount - a.amount : a.kind === 'direct' ? -1 : 1));
  const struct = h('div', { class: 'card stack-sm', id: 'finStructure' }, h('div', { class: 'card-head' }, h('h2', {}, t('fin.structure'))), h('p', { class: 'hint' }, t('fin.formula')), mix,
    c.total > 0 ? h('div', { class: 'legend' }, h('span', {}, h('i', { class: 'dot direct' }), t('fin.k.direct') + ' · ' + money(c.direct)), h('span', {}, h('i', { class: 'dot indirect' }), t('fin.k.indirect') + ' · ' + money(c.indirect))) : null,
    rows.length ? h('div', { class: 'tablewrap' }, h('table', { class: 'tbl', id: 'finCats' },
      h('thead', {}, h('tr', {}, h('th', {}, t('fin.cat')), h('th', {}, t('fin.type')), h('th', { class: 'n' }, t('fin.amount')), h('th', { class: 'n' }, t('fin.share')), h('th', {}, h('span', { class: 'sr' }, t('fin.share'))))),
      h('tbody', {}, rows.map((r) => h('tr', { 'data-kind': r.kind }, h('td', {}, r.label), h('td', {}, kindBadge(r.kind)), h('td', { class: 'n' }, money(r.amount)), h('td', { class: 'n' }, pct(shareOf(r.amount, c.total))), h('td', { class: 'barcell' }, barFill(shareOf(r.amount, c.total), r.kind))))),
      h('tfoot', {}, h('tr', {}, h('th', { colspan: 2 }, t('fin.k.total')), h('th', { class: 'n' }, money(c.total)), h('th', { class: 'n' }, c.total ? '100%' : '—'), h('td', {}))))) : h('p', { class: 'empty' }, t('fin.noCosts')));
  const maxT = Math.max(0, ...c.months.map((m) => m.total));
  const trend = h('div', { class: 'card stack-sm', id: 'finTrend' }, h('div', { class: 'card-head' }, h('h2', {}, t('fin.monthly'))),
    c.months.length ? h('div', { class: 'tablewrap' }, h('table', { class: 'tbl' },
      h('thead', {}, h('tr', {}, h('th', {}, t('fin.month')), h('th', { class: 'n' }, t('fin.revenue')), h('th', { class: 'n' }, t('fin.k.direct')), h('th', { class: 'n' }, t('fin.k.indirect')), h('th', { class: 'n' }, t('fin.k.total')), h('th', { class: 'n' }, t('fin.k.profit')), h('th', {}, t('fin.mix')))),
      h('tbody', {}, c.months.map((m) => h('tr', { 'data-month': m.k }, h('td', {}, finMonthLabel(m.k)), h('td', { class: 'n' }, money(m.revenue)), h('td', { class: 'n' }, money(m.direct)), h('td', { class: 'n' }, money(m.indirect)), h('td', { class: 'n' }, money(m.total)),
        h('td', { class: 'n ' + profitCls(m.profit) }, money(m.profit)),
        h('td', { class: 'barcell' }, m.total > 0 && maxT > 0 ? h('div', { class: 'stackbar thin', style: 'width:' + Math.max(4, Math.round(m.total / maxT * 100)) + '%' },
          h('i', { class: 'seg direct', style: 'width:' + Math.round(m.direct / m.total * 100) + '%' }), h('i', { class: 'seg indirect', style: 'width:' + Math.round(m.indirect / m.total * 100) + '%' })) : null))))))
      : h('p', { class: 'empty' }, t('fin.noMonths')));
  return [k, struct, trend, finBudget(c, paint)];
}

// the monthly budget the administrator sets for direct and indirect cost, against what the period actually cost
function finBudget(c, paint) {
  const st = session.settings, cur = (st && st.budget) || {}, b = { direct: cur.direct === undefined ? '' : cur.direct, indirect: cur.indirect === undefined ? '' : cur.indirect };
  const line = (key, actual, budget) => h('div', { class: 'budline', 'data-line': key }, h('div', { class: 'row-between' }, h('strong', {}, t('fin.k.' + key)), h('span', { class: 'small' }, budget > 0 ? t('fin.budOf', { a: money(actual), b: money(budget) }) : money(actual))),
    budget > 0 ? barFill(actual / budget, actual > budget ? 'bad' : actual > budget * 0.9 ? 'warn' : '') : h('span', { class: 'hint' }, t('fin.noBudget')),
    budget > 0 ? h('span', { class: 'small ' + (actual > budget ? 'neg' : 'pos') }, actual > budget ? t('fin.over', { v: money(actual - budget) }) : t('fin.left', { v: money(budget - actual) })) : null);
  const edit = can('finance', PERM_EDIT) ? h('form', { class: 'stack-sm', id: 'finBudgetForm', onsubmit: async (e) => {
    e.preventDefault(); const btn = e.target.querySelector('button[type=submit]'); btn.disabled = true;
    const before = clone(st.budget || {}), next = { direct: Math.max(0, num(b.direct)), indirect: Math.max(0, num(b.indirect)) };
    try { await loadSettings(); st.budget = next; await saveSettings(); auditSave('settings', 'update', 'budget', t('fin.budget'), before, next); toast(t('ops.saved'), 'ok'); paint(); } catch (ex) { st.budget = before; toast(ex.message, 'bad'); btn.disabled = false; }
  } },
  h('div', { class: 'grid2' }, fld('fin.budDirect', tin(b, 'direct', { id: 'finBudDirect', type: 'number', num: true, min: 0, step: 1, mode: 'numeric', ph: '0' })), fld('fin.budIndirect', tin(b, 'indirect', { id: 'finBudIndirect', type: 'number', num: true, min: 0, step: 1, mode: 'numeric', ph: '0' }))),
  h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'submit', id: 'btnSaveBudget' }, t('fin.saveBudget')))) : null;
  return h('div', { class: 'card stack-sm', id: 'finBudget' }, h('div', { class: 'card-head' }, h('h2', {}, t('fin.budget'))), h('p', { class: 'hint' }, t('fin.budgetHint', { n: nf(c.nMonths) })),
    line('direct', c.direct, c.budgetDirect), line('indirect', c.indirect, c.budgetIndirect), edit);
}

/* ---------------- projects ---------------- */
function finProjects(c) {
  if (!c.rows.length) return [h('div', { class: 'card' }, h('p', { class: 'empty' }, t('fin.noProjects')))];
  const T = (f) => sumBy(c.rows, f);
  const th = (key, n) => h('th', { class: n ? 'n' : '' }, t(key));
  return [h('div', { class: 'card stack-sm', id: 'finProjects' }, h('div', { class: 'card-head' }, h('h2', {}, t('fin.tab.projects'))), h('p', { class: 'hint' }, t('fin.basisNote', { b: t('fin.basis.' + finSel.basis) })),
    h('div', { class: 'tablewrap' }, h('table', { class: 'tbl', id: 'finProjTable' },
      h('thead', {}, h('tr', {}, th('fin.project'), th('fin.price', 1), th('fin.directOwn', 1), th('fin.indirectOwn', 1), th('fin.sharedDirect', 1), th('fin.sharedIndirect', 1), th('fin.totalCost', 1), th('fin.k.profit', 1), th('fin.margin', 1))),
      h('tbody', {}, c.rows.map((r) => h('tr', { 'data-sku': r.p.sku },
        h('td', {}, h('a', { href: '#manage/' + r.rec.id, class: 'clink' }, h('span', { class: 'mono' }, r.p.sku)), ' ', h('span', { dir: 'auto', class: 'small muted' }, r.rec.client.name)),
        h('td', { class: 'n' }, money(r.price)), h('td', { class: 'n' }, money(r.cogs)), h('td', { class: 'n' }, money(r.opex)), h('td', { class: 'n' }, money(r.allocDirect)), h('td', { class: 'n' }, money(r.allocIndirect)),
        h('td', { class: 'n' }, money(r.cost)), h('td', { class: 'n ' + profitCls(r.profit) }, money(r.profit)), h('td', { class: 'n' }, pct(r.margin))))),
      h('tfoot', {}, h('tr', {}, h('th', {}, t('fin.total')), h('th', { class: 'n' }, money(T((r) => r.price))), h('th', { class: 'n' }, money(T((r) => r.cogs))), h('th', { class: 'n' }, money(T((r) => r.opex))),
        h('th', { class: 'n' }, money(T((r) => r.allocDirect))), h('th', { class: 'n' }, money(T((r) => r.allocIndirect))), h('th', { class: 'n' }, money(T((r) => r.cost))), h('th', { class: 'n' }, money(T((r) => r.profit))),
        h('th', { class: 'n' }, pct(c.revenue ? T((r) => r.profit) / c.revenue : null)))))))];
}

/* ---------------- expenses ledger ---------------- */
function finExpenses(c, paint) {
  const list = h('div', { class: 'tablewrap', id: 'expList' }), count = h('p', { class: 'hint', id: 'expCount', role: 'status' });
  const draw = () => {
    const q = finSel.q.trim().toLowerCase();
    const rows = c.occ.filter((o) => (!finSel.kind || o.e.kind === finSel.kind) && (!finSel.cat || o.e.cat === finSel.cat) && (!q || [o.e.id, o.e.name, o.e.notes, supName(o.e.supplierId)].join(' ').toLowerCase().includes(q)));
    count.textContent = t('exp.shown', { n: nf(rows.length), total: nf(c.occ.length), sum: money(sumBy(rows, (o) => o.amount)) });
    list.replaceChildren(rows.length ? h('table', { class: 'tbl' },
      h('thead', {}, h('tr', {}, h('th', {}, t('exp.date')), h('th', {}, t('exp.name')), h('th', {}, t('fin.type')), h('th', {}, t('fin.cat')), h('th', {}, t('exp.repeat')), h('th', { class: 'n' }, t('fin.amount')), h('th', {}, h('span', { class: 'sr' }, t('act.edit'))))),
      h('tbody', {}, rows.map((o) => h('tr', { 'data-id': o.e.id },
        h('td', {}, fmtDay(o.date)), h('td', { dir: 'auto' }, o.e.name, o.e.supplierId ? h('span', { class: 'small muted' }, ' · ' + supName(o.e.supplierId)) : null), h('td', {}, kindBadge(o.e.kind)), h('td', {}, catLabel(o.e.kind, o.e.cat)),
        h('td', {}, o.e.repeat === 'none' ? h('span', { class: 'muted' }, '—') : h('span', { class: 'badge done' }, t('exp.rep.' + o.e.repeat))), h('td', { class: 'n' }, money(o.amount)),
        h('td', {}, h('a', { class: 'btn small', href: '#expenses/' + o.e.id, 'aria-label': t('act.edit') + ' ' + o.e.name }, t(can('finance', PERM_EDIT) ? 'act.edit' : 'act.open')))))),
      h('tfoot', {}, h('tr', {}, h('th', { colspan: 5 }, t('fin.total')), h('th', { class: 'n' }, money(sumBy(rows, (o) => o.amount))), h('td', {})))) : h('p', { class: 'empty' }, c.occ.length ? t('exp.noMatch') : t('exp.empty')));
  };
  const search = h('input', { id: 'expSearch', type: 'search', placeholder: t('exp.search'), 'aria-label': t('exp.search'), value: finSel.q, dir: 'auto' });
  search.addEventListener('input', () => { finSel.q = search.value; draw(); });
  const kind = selectEl([['', t('exp.allKinds')]].concat(FIN_KINDS.map((x) => [x, t('fin.kind.' + x)])), finSel.kind, (v) => { finSel.kind = v; draw(); }, 'expKind', t('fin.type'));
  const allCats = COST_CATS.map((x) => [x, catText('direct', x)]).concat(IND_CATS.filter((x) => !COST_CATS.includes(x)).map((x) => [x, catText('indirect', x)]));
  const cat = selectEl([['', t('exp.allCats')]].concat(allCats), finSel.cat, (v) => { finSel.cat = v; draw(); }, 'expCat', t('fin.cat'));
  const rec = c.recurring.slice().sort((a, b) => (a.kind === b.kind ? b.amount - a.amount : a.kind === 'direct' ? -1 : 1));
  const recCard = h('div', { class: 'card stack-sm', id: 'expRecurring' }, h('div', { class: 'card-head' }, h('h2', {}, t('exp.recurring'))), h('p', { class: 'hint' }, t('exp.recurringHint')),
    rec.length ? h('ul', { class: 'plainlist' }, rec.map((e) => h('li', { class: 'row-between', 'data-id': e.id }, h('span', {}, h('a', { class: 'clink', href: '#expenses/' + e.id, dir: 'auto' }, e.name), ' ', kindBadge(e.kind), ' ', h('span', { class: 'small muted' }, t('exp.rep.' + e.repeat) + (e.until ? ' · ' + t('exp.until') + ' ' + fmtDay(e.until) : ''))),
      h('strong', {}, money(e.amount))))) : h('p', { class: 'empty' }, t('exp.noRecurring')));
  const out = [h('div', { class: 'card stack-sm' }, h('div', { class: 'card-head' }, h('h2', {}, t('fin.tab.expenses')), h('a', { class: 'btn small primary', href: '#expenses/new', 'data-edit': 'finance', id: 'btnNewExpense2' }, t('exp.add'))),
    h('div', { class: 'filters3' }, search, kind, cat), count, list), recCard];
  draw(); return out;
}

/* ---------------- one expense ---------------- */
const blankExpense = () => normExpense({ kind: 'indirect', cat: 'rent', date: todayStr(), repeat: 'none' });
async function renderExpense(token, sub) {
  if (!(await ensureOps(token, ['expenses', 'suppliers']))) return;
  opsOpen('expenses', sub, blankExpense, '#finance', 'nav.finance', drawExpenseForm);
}
function validateExpense(r) {
  if (!r.name.trim()) return t('exp.val.name');
  if (!(num(r.amount) > 0)) return t('exp.val.amount');
  if (!oday(r.date)) return t('exp.val.date');
  if (r.repeat !== 'none' && r.until && r.until < r.date) return t('exp.val.until');
  return '';
}
function saveExpense() {
  const r = opsEd.rec; r.name = String(r.name || '').trim(); r.amount = Math.round(num(r.amount) * 100) / 100;
  if (r.repeat === 'none') r.until = '';
  if (!expCats(r.kind).includes(r.cat)) r.cat = 'other';
  const bad = validateExpense(r); if (bad) { toast(bad, 'bad'); return; }
  return opsSaveOpen();
}
function drawExpenseForm() {
  const e = opsEd, r = e.rec; e.save = saveExpense; e.live = null;
  const form = h('div', { class: 'card stack-sm' },
    fld('exp.name', tin(r, 'name', { id: 'expName', max: 120, req: true })),
    h('div', { class: 'grid2' },
      fld('fin.type', selectEl(FIN_KINDS.map((x) => [x, t('fin.kind.' + x)]), r.kind, (v) => { r.kind = v; if (!expCats(v).includes(r.cat)) r.cat = 'other'; touch(); e.redraw(); }, 'expKindSel'), r.kind === 'direct' ? 'exp.kindHintDirect' : 'exp.kindHintIndirect'),
      fld('fin.cat', selectEl(expCats(r.kind).map((x) => [x, catLabel(r.kind, x)]), r.cat, (v) => { r.cat = v; touch(); }, 'expCatSel'))),
    h('div', { class: 'grid2' },
      fld('exp.amount', tin(r, 'amount', { id: 'expAmount', type: 'number', num: true, min: 0, step: 0.01, mode: 'decimal', req: true })),
      fld('exp.date', tin(r, 'date', { id: 'expDate', type: 'date', req: true }))),
    h('div', { class: 'grid2' },
      fld('exp.repeat', selectEl(REPEATS.map((x) => [x, t('exp.rep.' + x)]), r.repeat, (v) => { r.repeat = v; touch(); e.redraw(); }, 'expRepeatSel'), 'exp.repeatHint'),
      r.repeat !== 'none' ? fld('exp.until', tin(r, 'until', { id: 'expUntil', type: 'date' }), 'exp.untilHint') : h('div', {})),
    fld('exp.supplier', supplierSel(r.supplierId, (v) => { r.supplierId = v; touch(); }, 'expSupplier')),
    fld('exp.notes', tarea(r, 'notes', { id: 'expNotes', rows: 3, max: 1000 })));
  const del = e.isNew ? null : h('div', { class: 'actions', 'data-edit': 'finance' }, opsDeleteBtn(() => opsDeleteOpen(t('exp.delConfirm', { n: r.name || e.id }), '#finance')), h('span', { class: 'hint' }, t('exp.delHint')));
  opsFormPage('#finance', 'nav.finance', e.isNew ? t('exp.new') : r.name || e.id, form, attCard(r, 'expFiles'), del);
}
