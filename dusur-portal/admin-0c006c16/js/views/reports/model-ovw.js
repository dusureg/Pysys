/**
 * <admin>/js/views/reports/model-ovw.js  -  report model: Company overview (the whole company on a few pages, for the owner)
 * Clients, projects by status and progress, contract value, money collected and still to collect, overdue instalments, late projects, stock alerts, open shipments and
 * contracts, with the list of every project and a "needs attention" list. Plain data (KPIs, charts, tables) like every other report, so the paper view, "Save as PDF"
 * and the Excel file all read the same model. It reads the clients and the inventory and logistics files; nothing here is ever published to a client.
 * Loaded by: admin page
 */
'use strict';

REPORT_TYPES.unshift('overview');                                 // the first report in the list
REPORT_FILTERS.overview = [];                                     // always the whole company, as of today
REPORT_NEEDS.overview = ['inventory', 'logistics'];

function overviewModel() {
  const items = store.items.flatMap((it) => it.rec.projects.map((p) => ({ rec: it.rec, p })));
  const base = { private: true, land: true, period: asOfText(), scope: t('ovw.scope', { c: nf(store.items.length), p: nf(items.length) }) };
  if (!items.length) return Object.assign(base, { empty: true });
  const ps = items.map((x) => x.p), n = (s) => ps.filter((p) => projState(p) === s).length, f = finTotals(ps);
  const late = items.filter(({ p }) => projState(p) !== 'completed' && daysUntil(p.dueDate) !== null && daysUntil(p.dueDate) < 0);
  const plans = items.map((x) => ({ x, c: collectionSum(x.p) })), instal = plans.flatMap(({ x, c }) => c.plan.filter((y) => y.status !== 'paid').map((y) => Object.assign({ x }, y)));
  const overdue = instal.filter((y) => y.status === 'overdue'), overdueSum = sumBy(overdue, (y) => y.outstanding);
  const contracts = contractRows(), cn = (s) => contracts.filter((r) => r.status === s);
  const stock = stockSummary(opsList('inventory')).info, out = stock.filter(({ s }) => s.flags.includes('out')), low = stock.filter(({ s }) => s.flags.includes('low') && !s.flags.includes('out'));
  const ships = opsList('logistics'), lateShips = ships.filter(lgLate);
  const kpis = [
    { label: t('ovw.k.clients'), v: store.items.length, kind: 'int', sub: t('ovw.sub.projects', { n: nf(items.length) }) },
    { label: t('ovw.k.inProd'), v: n('in_progress'), kind: 'int', sub: t('ovw.sub.prod', { a: nf(n('completed')), b: nf(n('pending')) }) },
    { label: t('ovw.k.value'), v: f.price, kind: 'money', sub: t('ovw.sub.contracts', { s: nf(cn('signed').length), n: nf(contracts.length) }) },
    { label: t('ovw.k.collected'), v: f.paid, kind: 'money', tone: 'pos', sub: f.price ? t('ovw.sub.pct', { p: nf(Math.round((f.paid / f.price) * 100)) }) : '' },
    { label: t('ovw.k.toCollect'), v: f.remaining, kind: 'money', tone: f.remaining > 0 ? 'warn' : '' },
    { label: t('ovw.k.overdue'), v: overdueSum, kind: 'money', tone: overdueSum > 0 ? 'neg' : '', sub: t('ovw.sub.instal', { n: nf(overdue.length) }) },
    { label: t('ovw.k.late'), v: late.length, kind: 'int', tone: late.length ? 'neg' : '', sub: t('ovw.sub.ships', { n: nf(ships.filter(lgOpen).length) }) },
    { label: t('ovw.k.stock'), v: out.length + low.length, kind: 'int', tone: out.length ? 'neg' : low.length ? 'warn' : '', sub: t('ovw.sub.stock', { o: nf(out.length), l: nf(low.length) }) }];
  const charts = [{ kind: 'donut', title: t('rp.c.status'), fmt: 'int', cats: [t('st.done'), t('st.progress'), t('st.pending')], colors: [C_GOOD, PALETTE[0], C_MUTE], series: [{ name: t('rp.k.projects'), values: [n('completed'), n('in_progress'), n('pending')] }] },
    donutOf(t('ovw.c.money'), 'money', [[t('ovw.k.collected'), f.paid, C_GOOD], [t('ovw.k.toCollect'), Math.max(0, f.remaining - overdueSum), PALETTE[0]], [t('ovw.k.overdue'), overdueSum, C_NEG]], true)].filter(Boolean);
  const months = new Map();                                                     // what is still to collect, by the month it falls due (late instalments in the first bar)
  for (const y of instal) { const k = y.status === 'overdue' ? t('ovw.late') : monthOf(y.due); months.set(k, (months.get(k) || 0) + y.outstanding); }
  const keys = [...months.keys()].sort((a, b) => (a === t('ovw.late') ? -1 : b === t('ovw.late') ? 1 : a < b ? -1 : 1)).slice(0, 9);
  if (keys.length) charts.push({ kind: 'vbar', title: t('ovw.c.due'), fmt: 'money', cats: keys, series: [{ name: t('ovw.k.toCollect'), color: PALETTE[1], values: keys.map((k) => months.get(k)) }] });
  const run = items.filter(({ p }) => projState(p) === 'in_progress').map(({ p }) => ({ k: p.sku, v: progress(p) })).sort((a, b) => b.v - a.v).slice(0, 10);
  if (run.length) charts.push({ kind: 'hbar', title: t('ovw.c.progress'), fmt: 'pct', cats: run.map((x) => x.k), series: [{ name: t('rp.col.progress'), color: PALETTE[2], values: run.map((x) => x.v) }] });
  const sorted = items.slice().sort((a, b) => (a.p.dueDate || '9999').localeCompare(b.p.dueDate || '9999') || a.p.sku.localeCompare(b.p.sku));
  const tables = [{ title: t('ovw.t.projects'), cols: [{ h: t('rp.col.sku'), kind: 'text', nw: true }, { h: t('rp.col.client'), kind: 'text' }, { h: t('rp.col.title'), kind: 'text' }, { h: t('rp.col.status'), kind: 'text', nw: true },
      { h: t('rp.col.progress'), kind: 'pct' }, { h: t('rp.col.due'), kind: 'date' }, { h: t('rp.col.left'), kind: 'int' }, { h: t('fin.price'), kind: 'money' }, { h: t('fin.paid'), kind: 'money' }, { h: t('fin.remaining'), kind: 'money' }],
    rows: sorted.map(({ rec, p }) => { const x = finance(p); return [p.sku, rec.client.name, p.title || '', stLabel(p), progress(p), p.dueDate || '', projState(p) === 'completed' ? '' : daysUntil(p.dueDate), x.price, x.paid, x.remaining]; }),
    foot: ['', t('rp.col.total'), '', '', '', '', '', f.price, f.paid, f.remaining] }];
  const att = [];                                                               // what needs a decision: late instalments, late projects, empty and low stock, late shipments
  for (const y of overdue.sort((a, b) => a.due.localeCompare(b.due))) att.push([t('ovw.at.instal'), skuRef(y.x.rec, y.x.p) + ' · ' + y.x.rec.client.name, t('ovw.d.instal', { a: money(y.outstanding), d: nf(-y.days) }), y.due]);
  for (const { rec, p } of late.sort((a, b) => a.p.dueDate.localeCompare(b.p.dueDate))) att.push([t('ovw.at.project'), skuRef(rec, p) + ' · ' + rec.client.name, t('ovw.d.late', { n: nf(-daysUntil(p.dueDate)), pr: nf(Math.round(progress(p) * 100)) }), p.dueDate]);
  for (const { it, s } of out.concat(low)) att.push([t('ovw.at.stock'), (it.code ? it.code + ' · ' : '') + it.name, (s.flags.includes('out') ? t('inv.flag.out') + ' · ' : '') + t('ovw.d.stock', { q: nf(num(it.qty)), u: t('bom.unit.' + it.unit), m: nf(num(it.min)) }), '']);
  for (const s of lateShips) att.push([t('ovw.at.ship'), s.id + ' · ' + (s.title || ''), t('ovw.d.ship', { n: nf(-daysUntil(s.eta)) }), s.eta]);
  if (att.length) tables.push({ title: t('ovw.t.attention'), cols: [{ h: t('ovw.col.type'), kind: 'text', nw: true }, { h: t('ovw.col.ref'), kind: 'text' }, { h: t('ovw.col.detail'), kind: 'text', wide: true }, { h: t('rp.col.due'), kind: 'date' }], rows: att.slice(0, 40) });
  return Object.assign(base, { kpis, charts, tables });
}
REPORT_OPS.overview = overviewModel;
