/**
 * <admin>/js/views/reports/model-fin.js  -  report models: Costs (direct, indirect, total operations cost) and History
 * Plain data (KPIs, charts, tables) like every other report, so the paper view and the Excel file read the same model. The Costs report follows the period and the
 * sharing basis chosen on the Finance screen; the History report lists one month of the audit trail. Also: which report types each role may open.
 * Loaded by: admin page
 */
'use strict';

/* =====================================================================
   Reports: costs and history
   ===================================================================== */
REPORT_TYPES.push('costs', 'collections', 'contracts', 'audit');
Object.assign(REPORT_FILTERS, { costs: ['fperiod', 'fbasis'], collections: ['client', 'state'], contracts: ['client', 'state'], audit: ['amonth', 'awho', 'aarea'] });   // costs follow the period and sharing basis of the Finance screen
// the permission area each report needs: a role sees only the report types of areas it may open
const REPORT_AREA = { overview: 'reports', finance: 'finance', costs: 'finance', collections: 'finance', contracts: 'clients', bom: 'clients', production: 'progress', satisfaction: 'ratings', inventory: 'inventory', reorder: 'inventory', stockmoves: 'inventory', suppliers: 'suppliers', logistics: 'logistics', shipment: 'logistics', audit: 'audit' };
const reportAllowed = (type) => can(REPORT_AREA[type] || 'reports');
let auditRep = { month: '', items: [], intact: true, months: [] };               // the month of history the report shows (loaded before the report is drawn)

// what a report loads before it is drawn: the costs report reads the expense ledger; the history report reads one month of the audit trail
REPORT_NEEDS.costs = ['expenses']; REPORT_NEEDS.audit = [];
Object.assign(REPORT_PREP, {
  audit: async (sel) => {
    const months = await auditMonths(), cur = auditMonthOf(oiso());
    if (auditQ.length && !months.includes(cur)) months.unshift(cur);
    if (!sel.amonth || !months.includes(sel.amonth)) sel.amonth = months[0] || cur;
    const d = months.length ? await loadAuditMonth(sel.amonth) : { items: [], intact: true };
    auditRep = { month: sel.amonth, items: d.items, intact: d.intact, months };
  },
});

/* ---------------- costs ---------------- */
function costsModel() {
  const c = finCompute(finSel), base = { private: true, land: true, period: finPeriodText(finSel), scope: t('fin.basisNote', { b: t('fin.basis.' + finSel.basis) }) };
  if (!c.projs.length && !c.occ.length) return Object.assign(base, { empty: true });
  const kpis = [{ label: t('fin.revenue'), v: c.revenue, kind: 'money' }, { label: t('fin.k.direct'), v: c.direct, kind: 'money' }, { label: t('fin.k.indirect'), v: c.indirect, kind: 'money' },
    { label: t('fin.k.total'), v: c.total, kind: 'money', sub: t('fin.k.totalSub') }, { label: t('fin.k.profit'), v: c.profit, kind: 'money', tone: tone(c.profit), sub: pct(c.margin) },
    { label: t('fin.k.overhead'), v: c.overheadRate, kind: 'pct', sub: t('fin.k.overheadSub') }, { label: t('fin.k.breakeven'), v: c.breakEven, kind: 'money' }, { label: t('fin.k.monthly'), v: c.monthly, kind: 'money' }];
  const top = c.cats.slice().sort((a, b) => b.amount - a.amount).slice(0, 8), mx = c.months.filter((m) => m.total > 0);
  const charts = [donutOf(t('rp.c.costSplit'), 'money', [[t('fin.k.direct'), c.direct, PALETTE[0]], [t('fin.k.indirect'), c.indirect, PALETTE[1]]], true),
    top.length ? { kind: 'hbar', title: t('rp.c.costCats'), fmt: 'money', cats: top.map((x) => x.label), series: [{ name: t('fin.amount'), color: PALETTE[0], values: top.map((x) => x.amount) }] } : null,
    mx.length > 1 ? { kind: 'vbar', title: t('rp.c.costMonths'), fmt: 'money', cats: mx.map((m) => finMonthLabel(m.k)), series: [{ name: t('fin.k.direct'), color: PALETTE[0], values: mx.map((m) => m.direct) }, { name: t('fin.k.indirect'), color: PALETTE[1], values: mx.map((m) => m.indirect) }] } : null].filter(Boolean);
  const tables = [];
  if (c.cats.length) tables.push({ title: t('fin.structure'), cols: [{ h: t('fin.cat'), kind: 'text' }, { h: t('fin.type'), kind: 'text', nw: true }, { h: t('fin.amount'), kind: 'money' }, { h: t('fin.share'), kind: 'pct' }],
    rows: c.cats.slice().sort((a, b) => (a.kind === b.kind ? b.amount - a.amount : a.kind === 'direct' ? -1 : 1)).map((x) => [x.label, t('fin.kind.' + x.kind), x.amount, c.total ? x.amount / c.total : null]), foot: [t('fin.total'), '', c.total, c.total ? 1 : null] });
  if (c.months.length) tables.push({ title: t('fin.monthly'), cols: [{ h: t('fin.month'), kind: 'text', nw: true }, { h: t('fin.revenue'), kind: 'money' }, { h: t('fin.k.direct'), kind: 'money' }, { h: t('fin.k.indirect'), kind: 'money' }, { h: t('fin.k.total'), kind: 'money' }, { h: t('fin.k.profit'), kind: 'money', sign: true }],
    rows: c.months.map((m) => [finMonthLabel(m.k), m.revenue, m.direct, m.indirect, m.total, m.profit]), foot: [t('fin.total'), c.revenue, c.direct, c.indirect, c.total, c.profit] });
  if (c.rows.length) tables.push({ title: t('fin.tab.projects'), cols: [{ h: t('fin.project'), kind: 'text', nw: true }, { h: t('rp.col.client'), kind: 'text' }, { h: t('fin.price'), kind: 'money' }, { h: t('fin.directOwn'), kind: 'money' }, { h: t('fin.indirectOwn'), kind: 'money' },
      { h: t('fin.sharedDirect'), kind: 'money' }, { h: t('fin.sharedIndirect'), kind: 'money' }, { h: t('fin.totalCost'), kind: 'money' }, { h: t('fin.k.profit'), kind: 'money', sign: true }, { h: t('fin.margin'), kind: 'pct' }],
    rows: c.rows.map((r) => [r.p.sku, r.rec.client.name, r.price, r.cogs, r.opex, r.allocDirect, r.allocIndirect, r.cost, r.profit, r.margin]),
    foot: [t('fin.total'), '', c.revenue, sumBy(c.rows, (r) => r.cogs), sumBy(c.rows, (r) => r.opex), c.directPool, c.indirectPool, sumBy(c.rows, (r) => r.cost), sumBy(c.rows, (r) => r.profit), c.revenue ? sumBy(c.rows, (r) => r.profit) / c.revenue : null] });
  if (c.occ.length) tables.push({ title: t('fin.tab.expenses'), cols: [{ h: t('exp.date'), kind: 'date' }, { h: t('exp.name'), kind: 'text' }, { h: t('fin.type'), kind: 'text', nw: true }, { h: t('fin.cat'), kind: 'text' }, { h: t('exp.repeat'), kind: 'text', nw: true }, { h: t('fin.amount'), kind: 'money' }],
    rows: c.occ.map((o) => [o.date, o.e.name, t('fin.kind.' + o.e.kind), catLabel(o.e.kind, o.e.cat), t('exp.rep.' + o.e.repeat), o.amount]), foot: [t('fin.total'), '', '', '', '', sumBy(c.occ, (o) => o.amount)] });
  return Object.assign(base, { kpis, charts, tables });
}

/* ---------------- history ---------------- */
const audWho = (e) => (e.who || '—') + (e.role ? ' (' + (BUILTIN_ROLES.includes(e.role) ? t('team.role.' + e.role) : e.role === 'owner' ? t('team.owner') : e.role) + ')' : '');
const audActText = (a) => (t('aud.act.' + a) === 'aud.act.' + a ? a : t('aud.act.' + a));
const audAreaText = (a) => (t('aud.area.' + a) === 'aud.area.' + a ? a : t('aud.area.' + a));
function auditModel(sel) {
  const rows = auditRep.items.filter((e) => (!sel.awho || e.uid === sel.awho) && (!sel.aarea || e.area === sel.aarea));
  const base = { private: true, land: true, period: auditRep.month ? audMonthLabel(auditRep.month) : '', scope: scopeOf([sel.awho && (rows[0] ? rows[0].who : ''), sel.aarea && audAreaText(sel.aarea)], rows.length, 'rp.nEntriesAll', 'rp.nEntries') };
  if (!rows.length) return Object.assign(base, { empty: true });
  const people = groupBy(rows, (e) => e.uid), areas = groupBy(rows, (e) => e.area), changes = sumBy(rows, (e) => (e.ch || []).length);
  const kpis = [{ label: t('rp.k.entries'), v: rows.length, kind: 'int' }, { label: t('rp.k.people'), v: people.size, kind: 'int' }, { label: t('rp.k.fields'), v: changes, kind: 'int' },
    { label: t('rp.k.integrity'), v: auditRep.intact ? t('aud.intact') : t('aud.broken'), kind: 'text', tone: auditRep.intact ? 'pos' : 'neg' }];
  const byPerson = [...people.values()].map((l) => [l[0].who || '—', l.length]).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const charts = [donutOf(t('rp.c.audAreas'), 'int', [...areas.entries()].map(([a, l]) => [audAreaText(a), l.length])),
    byPerson.length > 1 ? { kind: 'hbar', title: t('rp.c.audPeople'), fmt: 'int', cats: byPerson.map((x) => x[0]), series: [{ name: t('rp.k.entries'), color: PALETTE[0], values: byPerson.map((x) => x[1]) }] } : null].filter(Boolean);
  const shown = rows.slice(0, 600), sum1 = (e) => (e.ch || []).slice(0, 4).map((c) => c[0] + ': ' + (c[1] || '—') + ' → ' + (c[2] || '—')).join('; ') + ((e.ch || []).length > 4 ? ' …' : '');
  const tables = [{ title: t('rp.t.history') + (rows.length > shown.length ? ' · ' + t('rp.firstN', { n: nf(shown.length) }) : ''), cols: [{ h: t('aud.when'), kind: 'text', nw: true }, { h: t('aud.person'), kind: 'text' }, { h: t('aud.areaLabel'), kind: 'text', nw: true }, { h: t('aud.actLabel'), kind: 'text', nw: true },
    { h: t('aud.record'), kind: 'text' }, { h: t('aud.changes'), kind: 'text', wide: true }],
  rows: shown.map((e) => [fmtDateTime(e.at), audWho(e), audAreaText(e.area), audActText(e.act), (e.title || '') + (e.ref && e.ref !== e.title ? ' [' + e.ref + ']' : ''), sum1(e) || e.note || '']) }];
  return Object.assign(base, { kpis, charts, tables });
}
Object.assign(REPORT_OPS, { costs: costsModel, audit: auditModel });
