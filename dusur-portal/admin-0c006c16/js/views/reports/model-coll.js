/**
 * <admin>/js/views/reports/model-coll.js  -  report model: Collections (instalments still to collect)
 * Plain data (KPIs, charts, table) like every other report, so the paper view and the Excel file read the same model. The rows come from
 * collectionRows() (views/collections.js): the open instalments of every client's collection schedule plus balances that have no date yet.
 * Loaded by: admin page
 */
'use strict';

REPORT_NEEDS.collections = [];                                // reads the clients only, no operations files
function collectionsModel(sel) {
  const f = COL_FILTERS.includes(sel.state) ? sel.state : 'open', cl = sel.client ? store.items.find((x) => x.rec.id === sel.client) : null;
  const scope = collectionRows().filter((r) => !sel.client || r.rec.id === sel.client), tot = collectionTotals(scope), rows = scope.filter((r) => colMatch(r, f));
  const base = { private: true, land: true, period: asOfText(), scope: scopeOf([f !== 'open' && t('col.f.' + f), cl && cl.rec.client.name], rows.length, 'col.rpAll', 'col.rpSome') };
  if (!rows.length) return Object.assign(base, { empty: true });
  const all = tot.sum(scope), later = Math.max(0, tot.sum(tot.all.filter((r) => r.kind === 'due')) - tot.sum(tot.overdue) - tot.sum(tot.week));
  const kpis = [{ label: t('col.k.all'), v: all, kind: 'money', sub: t('col.nInstal', { n: nf(scope.length) }) }, { label: t('col.k.overdue'), v: tot.sum(tot.overdue), kind: 'money', tone: tot.overdue.length ? 'neg' : '', sub: t('col.nInstal', { n: nf(tot.overdue.length) }) },
    { label: t('col.k.week'), v: tot.sum(tot.week), kind: 'money', tone: tot.week.length ? 'warn' : '', sub: t('col.nInstal', { n: nf(tot.week.length) }) }, { label: t('col.k.month'), v: tot.sum(tot.month), kind: 'money', sub: t('col.nInstal', { n: nf(tot.month.length) }) },
    { label: t('col.k.undated'), v: tot.sum(tot.undated), kind: 'money', tone: tot.undated.length ? 'warn' : '', sub: t('col.nInstal', { n: nf(tot.undated.length) }) }];
  const months = new Map();
  for (const r of rows) if (r.kind === 'due') { const k = monthOf(r.x.due); months.set(k, (months.get(k) || 0) + r.x.outstanding); }
  const mk = [...months.keys()].sort();
  const charts = [donutOf(t('col.rp.split'), 'money', [[t('col.k.overdue'), tot.sum(tot.overdue), PALETTE[7]], [t('col.k.week'), tot.sum(tot.week), PALETTE[3]], [t('col.rp.later'), later, PALETTE[0]], [t('col.k.undated'), tot.sum(tot.undated), C_MUTE]], true),
    mk.length > 1 ? { kind: 'vbar', title: t('col.rp.months'), fmt: 'money', cats: mk.map((k) => finMonthLabel(k)), series: [{ name: t('col.toCollect'), color: PALETTE[0], values: mk.map((k) => months.get(k)) }] } : null].filter(Boolean);
  const cols = [{ h: t('col.client'), kind: 'text' }, { h: t('col.project'), kind: 'text', nw: true }, { h: t('sch.due'), kind: 'date' }, { h: t('rp.col.status'), kind: 'text', nw: true },
    { h: t('col.instalment'), kind: 'money' }, { h: t('col.toCollect'), kind: 'money' }, { h: t('ed.phone'), kind: 'text', nw: true }];
  const status = (r) => (r.kind === 'undated' ? t('col.noDate') : r.x.status === 'partial' ? t('sch.st.partial') + ' · ' + timeLeft(r.x.days) : timeLeft(r.x.days));
  const table = { title: t('col.title'), cols, rows: rows.map((r) => [r.rec.client.name, skuRef(r.rec, r.p), r.kind === 'due' ? r.x.due : '', status(r) + (r.x.deposit ? ' · ' + t('sch.deposit') : ''), r.kind === 'due' ? r.x.amount : '', r.x.outstanding, r.rec.client.phone || '']),
    foot: [t('fin.total'), '', '', '', '', tot.sum(rows), ''] };
  return Object.assign(base, { kpis, charts, tables: [table] });
}
REPORT_OPS.collections = collectionsModel;
