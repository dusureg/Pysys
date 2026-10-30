/**
 * <admin>/js/views/reports/model.js  -  report data models
 * Finance, BOM, production and satisfaction reports as plain data (KPIs, charts, tables). The paper view and the Excel export both read this model.
 * Loaded by: admin page
 */
'use strict';

/* =====================================================================
   Reports: finance, BOM, production status, customer satisfaction.
   One report model feeds the print view (PDF via the browser) and the Excel file.
   ===================================================================== */
let reportSel = { type: 'finance', client: '', project: '', from: '', to: '', cat: '', sup: '', state: '', kind: '', ship: '', amonth: '', awho: '', aarea: '' };
const REPORT_TYPES = ['finance', 'bom', 'production', 'satisfaction'];
const REPORT_OPS = {};          // reports of the Supply chain, Inventory and Logistics sections (model-ops.js adds them): type -> (selection) -> model
const REPORT_PREP = {};         // type -> async (selection): what a report must load before its model can be built (the month of history, for one)
const REPORT_NEEDS = {};        // type -> the operations files it reads (default for the operations reports: all of OPS_NAMES)
const reportNeeds = (type) => REPORT_NEEDS[type] || (REPORT_OPS[type] ? OPS_NAMES : []);
const prepReport = async (sel) => { if (REPORT_PREP[sel.type]) await REPORT_PREP[sel.type](sel); };
// categorical slots in fixed order (validated palette: adjacent colour-blind separation, lightness band); status colours are reserved for state
const PALETTE = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
const C_NEG = '#d03b3b', C_GOOD = '#0ca30c', C_MUTE = '#898781';
const tone = (x) => (x > 0 ? 'pos' : x < 0 ? 'neg' : '');
const monthOf = (s) => String(s || '').slice(0, 7);
const stLabel = (p) => t(statusInfo(projState(p))[1]);
const projLabel = (p) => p.sku + (p.title ? ' — ' + p.title : '');

function reportScope(sel) {
  const out = [];
  for (const it of store.items) {
    if (sel.client && it.rec.id !== sel.client) continue;
    for (const p of it.rec.projects) {
      if (sel.project && p.sku !== sel.project) continue;
      const d = p.startDate || String(it.rec.createdAt || '').slice(0, 10);
      if (sel.from && (!d || d < sel.from)) continue;
      if (sel.to && (!d || d > sel.to)) continue;
      out.push({ rec: it.rec, p });
    }
  }
  return out;
}
function fmtCell(v, kind, plain) {
  if (v === '' || v == null || (typeof v === 'number' && !isFinite(v))) return kind === 'pct' || kind === 'money' ? '—' : '';
  if (typeof v === 'string' && kind !== 'text' && kind !== 'date' && !isFinite(Number(v))) return v;
  switch (kind) {
    case 'money': return plain ? nf(v, { minimumFractionDigits: 0, maximumFractionDigits: 2 }) : money(v);
    case 'pct': return pct(v);
    case 'int': return nf(v);
    case 'score': return nf(v, { maximumFractionDigits: 1 });
    case 'qty': return nf(v, { maximumFractionDigits: 3 });
    case 'date': return fmtDay(v);
    default: return String(v);
  }
}
const dotJoin = (nodes) => nodes.filter(Boolean).reduce((a, n, i) => (i ? a.concat(['  ·  ', n]) : [n]), []);
const sumBy = (list, f) => list.reduce((a, x) => a + num(f(x)), 0);
const groupBy = (list, keyf) => { const m = new Map(); for (const x of list) { const k = keyf(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); } return m; };

/* ---------------- models ---------------- */
function financeModel(items) {
  if (!items.length) return { empty: true, private: true };
  const ps = items.map((x) => x.p), tot = finTotals(ps), charts = [];
  const kpis = [
    { label: t('fin.revenue'), v: tot.price, kind: 'money' },
    { label: t('fin.collected'), v: tot.paid, kind: 'money', sub: pct(tot.collected) },
    { label: t('fin.remaining'), v: tot.remaining, kind: 'money', tone: tot.remaining > 0 ? 'warn' : '' },
    { label: t('fin.cogs'), v: tot.cogs, kind: 'money' },
    { label: t('fin.gross'), v: tot.gross, kind: 'money', tone: tone(tot.gross), sub: t('fin.margin') + ' ' + pct(tot.grossMargin) },
    { label: t('fin.opex'), v: tot.opex, kind: 'money' },
    { label: t('fin.net'), v: tot.net, kind: 'money', tone: tone(tot.net), sub: t('fin.margin') + ' ' + pct(tot.netMargin) },
    { label: t('fin.markup'), v: tot.markup, kind: 'pct' },
  ];
  // revenue / COGS / gross: by project type, or by project when there is a single type
  let groups;
  if (new Set(ps.map((p) => p.type)).size > 1) groups = [...groupBy(ps, (p) => p.type || '—').entries()].map(([k, list]) => ({ label: L(list[0].typeName) || k, list }));
  else groups = ps.map((p) => ({ label: p.sku, list: [p] })).sort((a, b) => num(b.list[0].price) - num(a.list[0].price)).slice(0, 10);
  const gf = groups.map((g) => finTotals(g.list));
  charts.push({ kind: 'vbar', title: t('rp.c.revCogs'), fmt: 'money', cats: groups.map((g) => g.label), series: [
    { name: t('fin.revenue'), color: PALETTE[0], values: gf.map((f) => f.price) }, { name: t('fin.cogs'), color: PALETTE[1], values: gf.map((f) => f.cogs) }, { name: t('fin.gross'), color: PALETTE[2], values: gf.map((f) => f.gross) }] });

  const catOf = (c) => (COST_CATS.includes(c.cat) ? c.cat : 'other');
  const byCat = COST_CATS.map((k) => {
    const cs = ps.flatMap((p) => p.costs || []).filter((c) => catOf(c) === k);
    const cogs = sumBy(cs.filter((c) => c.type !== 'opex'), (c) => c.amount), opex = sumBy(cs.filter((c) => c.type === 'opex'), (c) => c.amount);
    return { k, cogs, opex, total: cogs + opex };
  }).filter((x) => x.total > 0);
  const costTotal = sumBy(byCat, (x) => x.total);
  if (costTotal > 0) charts.push({ kind: 'donut', title: t('rp.c.costMix'), fmt: 'money', cats: byCat.map((x) => catText('direct', x.k)), series: [{ name: t('rp.col.total'), values: byCat.map((x) => x.total) }] });

  const pm = new Map();
  for (const p of ps) for (const x of p.payments || []) { const k = monthOf(x.date); if (k) pm.set(k, (pm.get(k) || 0) + num(x.amount)); }
  const months = [...pm.keys()].sort().slice(-12);
  if (months.length) charts.push({ kind: 'vbar', title: t('rp.c.payMonth'), fmt: 'money', cats: months, series: [{ name: t('fin.paid'), color: PALETTE[2], values: months.map((k) => pm.get(k)) }] });

  const mg = items.filter((x) => num(x.p.price) > 0).map((x) => ({ k: x.p.sku, v: finance(x.p).grossMargin })).sort((a, b) => b.v - a.v).slice(0, 12);
  if (mg.length) charts.push({ kind: 'hbar', title: t('rp.c.margin'), fmt: 'pct', cats: mg.map((x) => x.k), series: [{ name: t('fin.grossMargin'), color: PALETTE[0], values: mg.map((x) => x.v) }] });

  const rows = items.map(({ rec, p }) => { const f = finance(p); return [p.sku, rec.client.name, L(p.typeName) || p.type, f.price, f.paid, f.remaining, f.cogs, f.opex, f.gross, f.grossMargin, f.net, f.netMargin]; });
  const tProjects = { title: t('rp.t.projects'), cols: [
    { h: t('rp.col.sku'), kind: 'text' }, { h: t('rp.col.client'), kind: 'text' }, { h: t('rp.col.type'), kind: 'text' },
    { h: t('fin.price'), kind: 'money' }, { h: t('fin.paid'), kind: 'money' }, { h: t('fin.remaining'), kind: 'money' }, { h: t('fin.cogs'), kind: 'money' }, { h: t('fin.opex'), kind: 'money' },
    { h: t('fin.gross'), kind: 'money' }, { h: t('fin.grossMargin'), kind: 'pct' }, { h: t('fin.net'), kind: 'money' }, { h: t('fin.netMargin'), kind: 'pct' }],
    rows, foot: [t('rp.col.total'), '', '', tot.price, tot.paid, tot.remaining, tot.cogs, tot.opex, tot.gross, tot.grossMargin, tot.net, tot.netMargin] };
  const tType = { title: t('rp.t.byType'), cols: [{ h: t('rp.col.type'), kind: 'text' }, { h: t('rp.col.count'), kind: 'int' }, { h: t('fin.revenue'), kind: 'money' }, { h: t('fin.cogs'), kind: 'money' }, { h: t('fin.gross'), kind: 'money' }, { h: t('fin.grossMargin'), kind: 'pct' }, { h: t('fin.net'), kind: 'money' }],
    rows: [...groupBy(ps, (p) => p.type || '—').entries()].map(([k, list]) => { const f = finTotals(list); return [(L(list[0].typeName) || k) + ' (' + k + ')', list.length, f.price, f.cogs, f.gross, f.grossMargin, f.net]; }) };
  const tCost = { title: t('rp.t.costs'), cols: [{ h: t('rp.col.cat'), kind: 'text' }, { h: t('fin.cogs'), kind: 'money' }, { h: t('fin.opex'), kind: 'money' }, { h: t('rp.col.total'), kind: 'money' }, { h: t('rp.col.share'), kind: 'pct' }],
    rows: byCat.map((x) => [catText('direct', x.k), x.cogs, x.opex, x.total, costTotal ? x.total / costTotal : null]), foot: [t('rp.col.total'), tot.cogs, tot.opex, costTotal, costTotal ? 1 : null] };
  return { private: true, kpis, charts, tables: [tProjects, tType].concat(byCat.length ? [tCost] : []) };
}

function bomModel(items) {
  const withBom = items.filter((x) => (x.p.bom || []).length);
  if (!withBom.length) return { empty: true, private: true };
  const all = withBom.flatMap((x) => x.p.bom.map((b) => Object.assign({ _p: x.p }, b)));
  const total = sumBy(all, bomTotal), price = sumBy(withBom, (x) => x.p.price);
  const kpis = [{ label: t('bom.items'), v: all.length, kind: 'int' }, { label: t('bom.total'), v: total, kind: 'money' }, { label: t('rp.k.contract'), v: price, kind: 'money' }, { label: t('bom.ofPrice'), v: price ? total / price : null, kind: 'pct' }];
  const cats = BOM_CATS.map((c) => ({ c, list: all.filter((b) => (BOM_CATS.includes(b.cat) ? b.cat : 'other') === c) })).filter((x) => x.list.length).map((x) => ({ c: x.c, n: x.list.length, total: sumBy(x.list, bomTotal) }));
  const charts = [];
  if (total > 0) charts.push({ kind: 'donut', title: t('rp.c.bomCat'), fmt: 'money', cats: cats.map((x) => t('bom.cat.' + x.c)), series: [{ name: t('rp.col.total'), values: cats.map((x) => x.total) }] });
  const top = all.slice().sort((a, b) => bomTotal(b) - bomTotal(a)).slice(0, 10).filter((b) => bomTotal(b) > 0);
  if (top.length) charts.push({ kind: 'hbar', title: t('rp.c.bomTop'), fmt: 'money', cats: top.map((b) => b.name), series: [{ name: t('rp.col.totalCost'), color: PALETTE[1], values: top.map(bomTotal) }] });
  const cols = [{ h: '#', kind: 'int' }, { h: t('rp.col.code'), kind: 'text' }, { h: t('rp.col.item'), kind: 'text' }, { h: t('rp.col.cat'), kind: 'text' }, { h: t('rp.col.qty'), kind: 'score' }, { h: t('rp.col.unit'), kind: 'text' }, { h: t('rp.col.unitCost'), kind: 'money' }, { h: t('rp.col.totalCost'), kind: 'money' }];
  const tables = withBom.map(({ rec, p }) => ({ title: projLabel(p) + ' · ' + rec.client.name, cols,
    rows: p.bom.map((b, i) => [i + 1, b.code || '', b.name, t('bom.cat.' + (BOM_CATS.includes(b.cat) ? b.cat : 'other')), num(b.qty), t('bom.unit.' + (BOM_UNITS.includes(b.unit) ? b.unit : 'pcs')), num(b.cost), bomTotal(b)]),
    foot: ['', t('rp.col.total'), '', '', '', '', '', bomSum(p)] }));
  tables.push({ title: t('rp.t.bomCat'), cols: [{ h: t('rp.col.cat'), kind: 'text' }, { h: t('rp.col.count'), kind: 'int' }, { h: t('rp.col.totalCost'), kind: 'money' }, { h: t('rp.col.share'), kind: 'pct' }],
    rows: cats.map((x) => [t('bom.cat.' + x.c), x.n, x.total, total ? x.total / total : null]), foot: [t('rp.col.total'), all.length, total, total ? 1 : null] });
  if (withBom.length > 1) {
    const m = new Map();
    for (const b of all) {
      const k = ((b.code || b.name) + '|' + (b.unit || 'pcs')).toLowerCase();
      if (!m.has(k)) m.set(k, { code: b.code || '', name: b.name, unit: b.unit || 'pcs', qty: 0, total: 0 });
      const r = m.get(k); r.qty += num(b.qty); r.total += bomTotal(b);
    }
    tables.push({ title: t('rp.t.consol'), cols: [{ h: t('rp.col.code'), kind: 'text' }, { h: t('rp.col.item'), kind: 'text' }, { h: t('rp.col.unit'), kind: 'text' }, { h: t('rp.col.qty'), kind: 'score' }, { h: t('rp.col.totalCost'), kind: 'money' }],
      rows: [...m.values()].sort((a, b) => b.total - a.total).map((r) => [r.code, r.name, t('bom.unit.' + (BOM_UNITS.includes(r.unit) ? r.unit : 'pcs')), r.qty, r.total]), foot: [t('rp.col.total'), '', '', '', total] });
  }
  return { private: true, kpis, charts, tables };
}

function productionModel(items) {
  if (!items.length) return { empty: true };
  const ps = items.map((x) => x.p), st = (s) => ps.filter((p) => projState(p) === s).length;
  const overdue = ps.filter((p) => projState(p) !== 'completed' && daysUntil(p.dueDate) !== null && daysUntil(p.dueDate) < 0).length;
  const kpis = [{ label: t('rp.k.projects'), v: ps.length, kind: 'int' }, { label: t('st.done'), v: st('completed'), kind: 'int', tone: 'pos' }, { label: t('st.progress'), v: st('in_progress'), kind: 'int' }, { label: t('st.pending'), v: st('pending'), kind: 'int' },
    { label: t('rp.k.overdue'), v: overdue, kind: 'int', tone: overdue ? 'neg' : '' }, { label: t('rp.k.avgProgress'), v: sumBy(ps, progress) / ps.length, kind: 'pct' }];
  const charts = [{ kind: 'donut', title: t('rp.c.status'), fmt: 'int', cats: [t('st.done'), t('st.progress'), t('st.pending')], colors: [C_GOOD, PALETTE[0], C_MUTE], series: [{ name: t('rp.k.projects'), values: [st('completed'), st('in_progress'), st('pending')] }] }];
  const pr = items.map((x) => ({ k: x.p.sku, v: progress(x.p) })).sort((a, b) => b.v - a.v).slice(0, 12);
  charts.push({ kind: 'hbar', title: t('rp.c.progress'), fmt: 'pct', cats: pr.map((x) => x.k), series: [{ name: t('rp.col.progress'), color: PALETTE[0], values: pr.map((x) => x.v) }] });
  const dm = new Map(); for (const p of ps) { const k = monthOf(p.dueDate); if (k) dm.set(k, (dm.get(k) || 0) + 1); }
  const months = [...dm.keys()].sort().slice(0, 12);
  if (months.length) charts.push({ kind: 'vbar', title: t('rp.c.dueMonth'), fmt: 'int', cats: months, series: [{ name: t('rp.k.projects'), color: PALETTE[1], values: months.map((k) => dm.get(k)) }] });
  const parts = ps.flatMap((p) => (p.parts || []).map((x) => Object.assign({ _s: p.sku }, x)));
  const pc = (s) => parts.filter((x) => (x.status || 'pending') === s).length;
  if (parts.length) charts.push({ kind: 'donut', title: t('rp.c.parts'), fmt: 'int', cats: [t('st.done'), t('st.progress'), t('st.pending')], colors: [C_GOOD, PALETTE[0], C_MUTE], series: [{ name: t('rp.col.piece'), values: [pc('completed'), pc('in_progress'), pc('pending')] }] });
  const tables = [{ title: t('rp.t.projects'), cols: [{ h: t('rp.col.sku'), kind: 'text' }, { h: t('rp.col.client'), kind: 'text' }, { h: t('rp.col.title'), kind: 'text' }, { h: t('rp.col.type'), kind: 'text' }, { h: t('rp.col.start'), kind: 'date' }, { h: t('rp.col.due'), kind: 'date' }, { h: t('rp.col.left'), kind: 'int' }, { h: t('rp.col.progress'), kind: 'pct' }, { h: t('rp.col.status'), kind: 'text' }],
    rows: items.map(({ rec, p }) => [p.sku, rec.client.name, p.title || '', L(p.typeName) || p.type, p.startDate || '', p.dueDate || '', projState(p) === 'completed' ? '' : daysUntil(p.dueDate), progress(p), stLabel(p)]) }];
  if (parts.length) tables.push({ title: t('rp.t.parts'), cols: [{ h: t('rp.col.sku'), kind: 'text' }, { h: t('rp.col.piece'), kind: 'text' }, { h: t('rp.col.qty'), kind: 'int' }, { h: t('rp.col.status'), kind: 'text' }, { h: t('rp.col.due'), kind: 'date' }],
    rows: parts.map((x) => [x._s, x.name, num(x.qty) || 1, t(statusInfo(x.status || 'pending')[1]), x.dueDate || '']) });
  return { kpis, charts, tables };
}

function satisfactionModel(items) {
  const rated = items.filter((x) => x.p.feedback && num(x.p.feedback.score) > 0);
  if (!rated.length) return { empty: true };
  const sc = rated.map((x) => num(x.p.feedback.score)), done = items.filter((x) => projState(x.p) === 'completed').length;
  const kpis = [{ label: t('rp.k.rated'), v: rated.length, kind: 'int' }, { label: t('fb.avg'), v: sumBy(sc, (x) => x) / sc.length, kind: 'score', sub: t('fb.outOf10'), tone: 'pos' },
    { label: t('rp.k.highest'), v: Math.max(...sc), kind: 'int' }, { label: t('rp.k.lowest'), v: Math.min(...sc), kind: 'int' }, { label: t('rp.k.response'), v: done ? Math.min(1, rated.length / done) : null, kind: 'pct' }];
  const charts = [{ kind: 'vbar', title: t('rp.c.dist'), fmt: 'int', cats: Array.from({ length: 10 }, (_, i) => String(i + 1)), series: [{ name: t('rp.k.rated'), color: PALETTE[0], values: Array.from({ length: 10 }, (_, i) => sc.filter((x) => x === i + 1).length) }] }];
  const bt = [...groupBy(rated, (x) => x.p.type || '—').entries()].map(([k, l]) => ({ k: L(l[0].p.typeName) || k, v: sumBy(l, (x) => x.p.feedback.score) / l.length }));
  if (bt.length > 1) charts.push({ kind: 'hbar', title: t('rp.c.byType'), fmt: 'score', cats: bt.map((x) => x.k), series: [{ name: t('fb.avg'), color: PALETTE[2], values: bt.map((x) => x.v) }] });
  const bm = [...groupBy(rated.filter((x) => monthOf(x.p.feedback.at)), (x) => monthOf(x.p.feedback.at)).entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).slice(-12);
  if (bm.length > 1) charts.push({ kind: 'line', title: t('rp.c.overTime'), fmt: 'score', cats: bm.map((x) => x[0]), series: [{ name: t('fb.avg'), color: PALETTE[1], values: bm.map((x) => sumBy(x[1], (y) => y.p.feedback.score) / x[1].length) }] });
  const tables = [{ title: t('rp.t.ratings'), cols: [{ h: t('rp.col.sku'), kind: 'text' }, { h: t('rp.col.client'), kind: 'text' }, { h: t('rp.col.title'), kind: 'text' }, { h: t('rp.col.score'), kind: 'int' }, { h: t('rp.col.date'), kind: 'date' }, { h: t('rp.col.comment'), kind: 'text', wide: true }],
    rows: rated.slice().sort((a, b) => String(b.p.feedback.at).localeCompare(String(a.p.feedback.at))).map(({ rec, p }) => [p.sku, rec.client.name, p.title || '', num(p.feedback.score), String(p.feedback.at || '').slice(0, 10), p.feedback.comment || '']) }];
  return { kpis, charts, tables };
}

function scopeLabel(sel, items) {
  const it = sel.client ? store.items.find((x) => x.rec.id === sel.client) : null;
  if (sel.project) return sel.project + (it ? ' · ' + it.rec.client.name : '');
  if (it) return it.rec.client.name + ' (' + it.rec.id + ')' + ' · ' + t('rp.nProjects', { n: nf(items.length) });
  return t('rp.scopeAll', { c: nf(new Set(items.map((x) => x.rec.id)).size), p: nf(items.length) });
}
const periodLabel = (sel) => (sel.from || sel.to ? (sel.from ? fmtDay(sel.from) : '…') + ' → ' + (sel.to ? fmtDay(sel.to) : '…') : t('rp.allDates'));
function buildReport(sel) {
  const own = REPORT_OPS[sel.type], items = own ? [] : reportScope(sel);
  const body = own ? own(sel) : { finance: financeModel, bom: bomModel, production: productionModel, satisfaction: satisfactionModel }[sel.type](items);
  return Object.assign({ type: sel.type, title: t('rp.type.' + sel.type), scope: own ? '' : scopeLabel(sel, items), period: own ? '' : periodLabel(sel), generated: new Date(), lang, kpis: [], charts: [], tables: [] }, body);
}
// the sentence shown when a report has nothing to list
const emptyText = (m) => t({ bom: 'rp.emptyBom', satisfaction: 'rp.emptySat', suppliers: 'rp.emptySup', inventory: 'rp.emptyInv', reorder: 'rp.emptyReorder', stockmoves: 'rp.emptyMoves', logistics: 'rp.emptyLg', shipment: 'rp.emptyShip', costs: 'rp.emptyCosts', collections: 'rp.emptyColl', contracts: 'rp.emptyCtr', overview: 'rp.emptyOvw', audit: 'rp.emptyAudit' }[m.type] || 'rp.empty');
const reportFileName = (m) => (brandName() + '-' + m.title + '-' + todayStr()).replace(/[^\w؀-ۿ-]+/g, '_').replace(/^_+|_+$/g, '');
