/**
 * <admin>/js/views/reports/model-ops.js  -  report models of Supply chain, Inventory and Logistics
 * Inventory stock list and alerts, reorder (purchase) list by supplier, stock movements, supplier directory, shipments list and one shipment sheet,
 * as plain data (KPIs, charts, tables) like the other reports: the paper view and the Excel file both read it. Registers itself in REPORT_OPS.
 * Loaded by: admin page
 */
'use strict';

/* =====================================================================
   Reports for the operations sections
   ===================================================================== */
REPORT_TYPES.push('inventory', 'reorder', 'stockmoves', 'suppliers', 'logistics', 'shipment');
// which filter fields the report screen shows for each report
const REPORT_FILTERS = {
  finance: ['client', 'project', 'from', 'to'], bom: ['client', 'project', 'from', 'to'], production: ['client', 'project', 'from', 'to'], satisfaction: ['client', 'project', 'from', 'to'],
  inventory: ['cat', 'sup', 'state'], reorder: ['sup'], stockmoves: ['sup', 'from', 'to'], suppliers: ['cat'], logistics: ['state', 'kind', 'sup', 'from', 'to'], shipment: ['ship'],
};
const isOpsReport = (type) => !!REPORT_OPS[type];
const asOfText = () => t('rp.asOf', { d: fmtDay(todayStr()) });
const dayOf = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); };
const supMatch = (sel, id) => !sel.sup || (sel.sup === '-' ? !id : id === sel.sup);
const supFilterText = (sel) => (sel.sup ? (sel.sup === '-' ? t('ops.noSupplier') : supName(sel.sup)) : '');
function scopeOf(parts, n, allKey, someKey) { const p = parts.filter(Boolean); return p.length ? p.join(' · ') + ' · ' + t(someKey, { n: nf(n) }) : t(allKey, { n: nf(n) }); }
const flagText = (s) => { const f = s.flags.filter((x) => x !== 'nomin'); return f.length ? f.map((x) => t('inv.flag.' + x)).join(' · ') : s.flags.includes('nomin') ? t('inv.flag.nomin') : t('inv.flag.ok'); };
const donutOf = (title, fmt, entries, colors) => { const e = entries.filter((x) => x[1] > 0); return e.length ? { kind: 'donut', title, fmt, cats: e.map((x) => x[0]), colors: colors ? e.map((x) => x[2]) : undefined, series: [{ name: t('rp.col.total'), values: e.map((x) => x[1]) }] } : null; };

/* ---------------- inventory ---------------- */
function inventoryModel(sel) {
  const rows = stockSummary(opsList('inventory')).info.filter(({ it, s }) => (!sel.cat || it.category === sel.cat) && supMatch(sel, it.supplierId) && invMatch(s, sel.state || 'all'))
    .sort((a, b) => a.it.category.localeCompare(b.it.category) || a.it.name.localeCompare(b.it.name, locale()));
  const base = { private: true, land: true, period: asOfText(),
    scope: scopeOf([sel.cat && t('bom.cat.' + sel.cat), supFilterText(sel), sel.state && sel.state !== 'all' && t('inv.show.' + sel.state)], rows.length, 'rp.nItemsAll', 'rp.nItems') };
  if (!rows.length) return Object.assign(base, { empty: true });
  const n = (f) => rows.filter((x) => x.s.flags.includes(f)).length, value = sum(rows, (x) => x.s.value);
  const kpis = [{ label: t('inv.k.items'), v: rows.length, kind: 'int' }, { label: t('inv.k.attention'), v: rows.filter((x) => x.s.attention).length, kind: 'int', tone: rows.some((x) => x.s.attention) ? 'warn' : '' },
    { label: t('inv.k.out'), v: n('out'), kind: 'int', tone: n('out') ? 'neg' : '' }, { label: t('inv.k.low'), v: n('low'), kind: 'int', tone: n('low') ? 'warn' : '' },
    { label: t('inv.k.expiring'), v: rows.filter((x) => x.s.flags.includes('expiring') || x.s.flags.includes('expired')).length, kind: 'int' }, { label: t('inv.k.value'), v: value, kind: 'money' }];
  const byCat = BOM_CATS.map((c) => [t('bom.cat.' + c), sum(rows.filter((x) => x.it.category === c), (x) => x.s.value)]);
  const top = rows.filter((x) => x.s.value > 0).sort((a, b) => b.s.value - a.s.value).slice(0, 10);
  const st = { ok: 0, low: 0, out: 0, exp: 0 };
  for (const { s } of rows) st[s.flags.includes('out') ? 'out' : s.flags.includes('expired') || s.flags.includes('expiring') ? 'exp' : s.flags.includes('low') ? 'low' : 'ok']++;
  const charts = [value > 0 ? donutOf(t('rp.c.invCat'), 'money', byCat) : null,
    top.length ? { kind: 'hbar', title: t('rp.c.invTop'), fmt: 'money', cats: top.map((x) => x.it.name), series: [{ name: t('inv.k.value'), color: PALETTE[0], values: top.map((x) => x.s.value) }] } : null,
    donutOf(t('rp.c.invStatus'), 'int', [[t('inv.flag.ok'), st.ok, C_GOOD], [t('inv.flag.low'), st.low, PALETTE[3]], [t('inv.flag.out'), st.out, C_NEG], [t('rp.c.expiring'), st.exp, PALETTE[1]]], true)].filter(Boolean);
  const cols = [{ h: '#', kind: 'int' }, { h: t('rp.col.code'), kind: 'text', nw: true }, { h: t('rp.col.item'), kind: 'text' }, { h: t('rp.col.cat'), kind: 'text' }, { h: t('rp.col.unit'), kind: 'text', nw: true },
    { h: t('inv.col.stock'), kind: 'qty' }, { h: t('inv.col.min'), kind: 'qty' }, { h: t('inv.max'), kind: 'qty' }, { h: t('rp.col.unitCost'), kind: 'money' }, { h: t('inv.col.value'), kind: 'money' },
    { h: t('inv.supplier'), kind: 'text' }, { h: t('inv.location'), kind: 'text' }, { h: t('rp.col.status'), kind: 'text' }];
  const tables = [{ title: t('rp.t.stock'), cols, rows: rows.map(({ it, s }, i) => [i + 1, it.code, it.name, t('bom.cat.' + it.category), t('bom.unit.' + it.unit), num(it.qty), num(it.min) || '', num(it.max) || '',
    num(it.cost) || '', s.value, supName(it.supplierId), it.location, flagText(s)]), foot: ['', '', t('rp.col.total'), '', '', '', '', '', '', value, '', '', ''] }];
  const att = rows.filter((x) => x.s.attention);
  if (att.length) tables.push({ title: t('rp.t.alerts'), cols: [{ h: t('rp.col.item'), kind: 'text' }, { h: t('inv.alert'), kind: 'text' }, { h: t('inv.col.stock'), kind: 'qty' }, { h: t('inv.col.min'), kind: 'qty' },
    { h: t('inv.col.ordered'), kind: 'qty' }, { h: t('inv.col.order'), kind: 'qty' }, { h: t('rp.col.unit'), kind: 'text', nw: true }, { h: t('inv.supplier'), kind: 'text' }, { h: t('inv.expiry'), kind: 'date' }],
    rows: att.map(({ it, s }) => [it.name, flagText(s), num(it.qty), num(it.min) || '', s.ordered || '', s.suggest || '', t('bom.unit.' + it.unit), supName(it.supplierId), it.expiry]) });
  return Object.assign(base, { kpis, charts, tables });
}

/* ---------------- reorder (purchase) list ---------------- */
function reorderModel(sel) {
  const rows = stockSummary(opsList('inventory')).info.filter(({ it, s }) => s.lowish && supMatch(sel, it.supplierId));
  const base = { private: true, period: asOfText(), scope: scopeOf([supFilterText(sel)], rows.length, 'rp.nItemsAll', 'rp.nItems') };
  if (!rows.length) return Object.assign(base, { empty: true });
  const groups = [...groupBy(rows, (x) => x.it.supplierId || '').entries()].sort((a, b) => (a[0] === '' ? 1 : b[0] === '' ? -1 : supName(a[0]).localeCompare(supName(b[0]), locale())));
  const est = (list) => sum(list, (x) => x.s.suggest * num(x.it.cost));
  const cols = [{ h: t('rp.col.code'), kind: 'text', nw: true }, { h: t('rp.col.item'), kind: 'text' }, { h: t('rp.col.unit'), kind: 'text', nw: true }, { h: t('inv.col.stock'), kind: 'qty' }, { h: t('inv.col.min'), kind: 'qty' },
    { h: t('inv.col.ordered'), kind: 'qty' }, { h: t('inv.col.order'), kind: 'qty' }, { h: t('rp.col.unitCost'), kind: 'money' }, { h: t('inv.col.est'), kind: 'money' }];
  const tables = groups.map(([sid, list]) => {
    const sup = opsFind('suppliers', sid);
    return { title: sup ? [sup.name, sup.contact, sup.phone, sup.email].filter(Boolean).join(' · ') : t('inv.noSupplierGroup'), cols,
      rows: list.sort((a, b) => a.it.name.localeCompare(b.it.name, locale())).map(({ it, s }) => [it.code, it.name, t('bom.unit.' + it.unit), num(it.qty), num(it.min) || '', s.ordered || '', s.suggest || '', num(it.cost) || '', s.suggest * num(it.cost) || '']),
      foot: ['', t('rp.col.total'), '', '', '', '', '', '', est(list)] };
  });
  const total = est(rows), withCost = groups.map(([sid, list]) => ({ k: sid ? supName(sid) : t('inv.noSupplierGroup'), v: est(list) })).filter((x) => x.v > 0);
  const kpis = [{ label: t('rp.k.toOrder'), v: rows.length, kind: 'int' }, { label: t('rp.k.suppliers'), v: groups.filter((g) => g[0]).length, kind: 'int' }, { label: t('inv.k.out'), v: rows.filter((x) => x.s.flags.includes('out')).length, kind: 'int', tone: 'neg' },
    { label: t('inv.col.est'), v: total, kind: 'money' }];
  const charts = withCost.length > 1 ? [{ kind: 'hbar', title: t('rp.c.orderBySup'), fmt: 'money', cats: withCost.map((x) => x.k), series: [{ name: t('inv.col.est'), color: PALETTE[1], values: withCost.map((x) => x.v) }] }] : [];
  return Object.assign(base, { kpis, charts, tables });
}

/* ---------------- stock movements ---------------- */
function stockmovesModel(sel) {
  const rows = [];
  for (const it of opsList('inventory')) {
    if (!supMatch(sel, it.supplierId)) continue;
    for (const m of it.moves) { const d = dayOf(m.at); if (!d || (sel.from && d < sel.from) || (sel.to && d > sel.to)) continue; rows.push({ it, m, d }); }
  }
  rows.sort((a, b) => String(b.m.at).localeCompare(String(a.m.at)));
  const base = { private: true, period: periodLabel(sel), scope: scopeOf([supFilterText(sel)], rows.length, 'rp.nMovesAll', 'rp.nMoves') };
  if (!rows.length) return Object.assign(base, { empty: true });
  const c = (type) => rows.filter((x) => x.m.type === type).length;
  const kpis = [{ label: t('rp.k.moves'), v: rows.length, kind: 'int' }, { label: t('inv.mt.in'), v: c('in'), kind: 'int' }, { label: t('inv.mt.out'), v: c('out'), kind: 'int' }, { label: t('inv.mt.count'), v: c('count'), kind: 'int' }];
  const months = [...new Set(rows.map((x) => x.d.slice(0, 7)))].sort().slice(-12);
  const charts = [{ kind: 'vbar', title: t('rp.c.movesMonth'), fmt: 'int', cats: months, series: [['in', C_GOOD], ['out', PALETTE[1]], ['count', PALETTE[0]]].map(([k, color]) => ({ name: t('inv.mt.' + k), color,
    values: months.map((mo) => rows.filter((x) => x.d.slice(0, 7) === mo && x.m.type === k).length) })) }];
  const tables = [{ title: t('rp.t.moves'), cols: [{ h: t('rp.col.date'), kind: 'date' }, { h: t('rp.col.code'), kind: 'text', nw: true }, { h: t('rp.col.item'), kind: 'text' }, { h: t('inv.col.type'), kind: 'text' }, { h: t('inv.col.change'), kind: 'qty' },
    { h: t('inv.col.balance'), kind: 'qty' }, { h: t('rp.col.unit'), kind: 'text', nw: true }, { h: t('inv.mv.note'), kind: 'text', wide: true }],
    rows: rows.map(({ it, m, d }) => [d, it.code, it.name, t('inv.mt.' + m.type), m.delta, m.qty, t('bom.unit.' + it.unit), m.note]) }];
  return Object.assign(base, { kpis, charts, tables });
}

/* ---------------- supplier directory ---------------- */
function suppliersModel(sel) {
  const rows = opsList('suppliers').filter((s) => !sel.cat || s.category === sel.cat).sort((a, b) => a.name.localeCompare(b.name, locale()));
  const base = { private: true, land: true, period: asOfText(), scope: scopeOf([sel.cat && t('sup.cat.' + sel.cat)], rows.length, 'rp.nSuppliersAll', 'rp.nSuppliers') };
  if (!rows.length) return Object.assign(base, { empty: true });
  const inv = opsList('inventory'), lg = opsList('logistics');
  const kpis = [{ label: t('sup.k.total'), v: rows.length, kind: 'int' }, { label: t('rp.k.activeSup'), v: rows.filter((s) => s.active).length, kind: 'int' }, { label: t('sup.k.cats'), v: new Set(rows.map((s) => s.category)).size, kind: 'int' },
    { label: t('sup.k.withMats'), v: rows.filter((s) => inv.some((x) => x.supplierId === s.id)).length, kind: 'int' }, { label: t('sup.k.open'), v: lg.filter((x) => lgOpen(x) && rows.some((s) => s.id === x.supplierId)).length, kind: 'int' }];
  const charts = [donutOf(t('rp.c.supCat'), 'int', SUP_CATS.map((c) => [t('sup.cat.' + c), rows.filter((s) => s.category === c).length]))].filter(Boolean);
  const tables = [{ title: t('rp.t.suppliers'), cols: [{ h: '#', kind: 'int' }, { h: t('sup.name'), kind: 'text' }, { h: t('sup.category'), kind: 'text' }, { h: t('sup.contact'), kind: 'text' }, { h: t('sup.phone'), kind: 'text' },
    { h: t('sup.email'), kind: 'text' }, { h: t('sup.website'), kind: 'text' }, { h: t('sup.location'), kind: 'text' }, { h: t('sup.address'), kind: 'text', wide: true }, { h: t('rp.col.status'), kind: 'text' }],
    rows: rows.map((s, i) => [i + 1, s.name, t('sup.cat.' + s.category), s.contact, [s.phone, s.phone2].filter(Boolean).join(' / '), s.email, safeUrl(s.website) ? urlHost(safeUrl(s.website)) : '', s.location, s.address, s.active ? t('sup.active') : t('sup.inactive')]) }];
  const sup = rows.map((s) => ({ s, mats: inv.filter((x) => x.supplierId === s.id) })).filter((x) => x.mats.length);
  if (sup.length) tables.push({ title: t('rp.t.supMaterials'), cols: [{ h: t('sup.name'), kind: 'text' }, { h: t('rp.col.count'), kind: 'int' }, { h: t('rp.t.materials'), kind: 'text', wide: true }],
    rows: sup.map(({ s, mats }) => [s.name, mats.length, mats.slice(0, 15).map((x) => x.name).join(', ') + (mats.length > 15 ? ' …' : '')]) });
  return Object.assign(base, { kpis, charts, tables });
}

/* ---------------- logistics ---------------- */
const lgDay = (s) => s.eta || dayOf(s.createdAt);
function logisticsModel(sel) {
  const rows = opsList('logistics').filter((s) => lgMatch(s, sel.state || 'all') && (!sel.kind || s.kind === sel.kind)
    && (!sel.sup || (sel.sup === '-' ? s.kind === 'inbound' && !s.supplierId : s.supplierId === sel.sup)) && (!sel.from || (lgDay(s) && lgDay(s) >= sel.from)) && (!sel.to || (lgDay(s) && lgDay(s) <= sel.to)))
    .sort((a, b) => (lgOpen(b) ? 1 : 0) - (lgOpen(a) ? 1 : 0) || (a.eta || '9999').localeCompare(b.eta || '9999'));
  const base = { private: true, land: true, period: periodLabel(sel), scope: scopeOf([sel.state && sel.state !== 'all' && t('lg.show.' + sel.state), sel.kind && t('lg.kind.' + sel.kind), supFilterText(sel)], rows.length, 'rp.nShipmentsAll', 'rp.nShipments') };
  if (!rows.length) return Object.assign(base, { empty: true });
  const st = (k) => rows.filter((s) => lgState(s) === k).length, open = rows.filter(lgOpen), late = rows.filter(lgLate).length;
  const kpis = [{ label: t('rp.k.shipments'), v: rows.length, kind: 'int' }, { label: t('lg.k.active'), v: open.length, kind: 'int' }, { label: t('lg.k.late'), v: late, kind: 'int', tone: late ? 'neg' : '' },
    { label: t('lg.k.blocked'), v: st('blocked'), kind: 'int', tone: st('blocked') ? 'warn' : '' }, { label: t('lg.k.completed'), v: st('completed'), kind: 'int', tone: 'pos' }];
  const prog = open.slice(0, 12), months = [...new Set(open.map((s) => (s.eta || '').slice(0, 7)).filter(Boolean))].sort().slice(0, 12);
  const charts = [donutOf(t('rp.c.lgState'), 'int', [[t('lg.st.planned'), st('planned'), C_MUTE], [t('lg.st.in_progress'), st('in_progress'), PALETTE[0]], [t('lg.st.blocked'), st('blocked'), C_NEG], [t('lg.st.completed'), st('completed'), C_GOOD], [t('lg.st.cancelled'), st('cancelled'), '#b3b1a8']], true),
    prog.length ? { kind: 'hbar', title: t('rp.c.lgProgress'), fmt: 'pct', cats: prog.map((s) => s.id + ' ' + (s.title || '')), series: [{ name: t('rp.col.progress'), color: PALETTE[0], values: prog.map(lgProgress) }] } : null,
    months.length ? { kind: 'vbar', title: t('rp.c.lgEta'), fmt: 'int', cats: months, series: [{ name: t('rp.k.shipments'), color: PALETTE[1], values: months.map((m) => open.filter((s) => (s.eta || '').slice(0, 7) === m).length) }] } : null].filter(Boolean);
  const tables = [{ title: t('rp.t.shipments'), cols: [{ h: t('lg.col.id'), kind: 'text', nw: true }, { h: t('lg.name'), kind: 'text' }, { h: t('lg.kindLabel'), kind: 'text' }, { h: t('lg.col.party'), kind: 'text' }, { h: t('lg.col.route'), kind: 'text' },
    { h: t('lg.carrier'), kind: 'text' }, { h: t('lg.tracking'), kind: 'text' }, { h: t('lg.eta'), kind: 'date' }, { h: t('rp.col.progress'), kind: 'pct' }, { h: t('lg.col.current'), kind: 'text' }, { h: t('rp.col.status'), kind: 'text', nw: true }],
    rows: rows.map((s) => { const cur = lgCurrent(s); return [s.id, s.title, t('lg.kind.' + s.kind), lgParty(s), [s.from, s.to].some(Boolean) ? (s.from || '…') + ' → ' + (s.to || '…') : '', s.carrier, s.tracking, s.eta, lgProgress(s),
      lgOpen(s) && cur ? cur.name : '', t('lg.st.' + lgState(s)) + (lgLate(s) ? ' · ' + t('lg.late') : '')]; }) }];
  const steps = open.flatMap((s) => s.steps.filter((x) => x.status !== 'done').map((x) => [s.id, s.title, x.name, t('lg.ss.' + x.status) + (lgStepLate(x) ? ' · ' + t('lg.late') : ''), x.due, x.note]));
  if (steps.length) tables.push({ title: t('rp.t.openSteps'), cols: [{ h: t('lg.col.id'), kind: 'text', nw: true }, { h: t('lg.name'), kind: 'text' }, { h: t('lg.stepName'), kind: 'text' }, { h: t('rp.col.status'), kind: 'text', nw: true }, { h: t('lg.stepDue'), kind: 'date' }, { h: t('lg.stepNote'), kind: 'text', wide: true }], rows: steps });
  return Object.assign(base, { kpis, charts, tables });
}

/* ---------------- one shipment: a sheet to print and tick ---------------- */
function shipmentModel(sel) {
  const list = opsList('logistics'), s = opsFind('logistics', sel.ship) || list.slice().sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0];
  if (!s) return { empty: true, private: true, scope: '', period: asOfText() };
  const done = s.steps.filter((x) => x.status === 'done').length, d = daysUntil(s.eta);
  const kv = [[t('lg.kindLabel'), t('lg.kind.' + s.kind)], [t('rp.col.status'), t('lg.st.' + lgState(s)) + (lgLate(s) ? ' · ' + t('lg.late') : '')], [t('lg.col.party'), lgParty(s)], [t('lg.ref'), s.ref], [t('lg.carrier'), s.carrier], [t('lg.tracking'), s.tracking],
    [t('lg.from'), s.from], [t('lg.to'), s.to], [t('lg.eta'), s.eta ? fmtDay(s.eta) : ''], [t('lg.cost'), num(s.cost) ? money(s.cost) : ''], [t('lg.notes'), s.notes]].filter((x) => x[1]);
  const half = Math.ceil(kv.length / 2), pairs = Array.from({ length: half }, (_, i) => kv[i].concat(kv[half + i] || ['', '']));       // two label / value pairs per row: shorter, so the sheet fits one page
  const kvCols = [{ h: t('rp.col.item'), kind: 'text', nw: true }, { h: t('rp.col.value'), kind: 'text' }];
  const tables = [{ title: t('rp.t.details'), cols: kvCols.concat(kvCols), rows: pairs },
    { title: t('lg.steps'), cols: [{ h: '#', kind: 'int' }, { h: t('lg.stepName'), kind: 'text', wide: true }, { h: t('rp.col.status'), kind: 'text', nw: true }, { h: t('lg.stepDue'), kind: 'date' }, { h: t('lg.stepDoneAt'), kind: 'date' }, { h: t('lg.stepNote'), kind: 'text' }, { h: t('lg.signoff'), kind: 'text', sign: true }],
      rows: s.steps.map((x, i) => [i + 1, x.name, t('lg.ss.' + x.status), x.due, x.doneAt, x.note, ''])}];
  if (s.lines.length) tables.push({ title: t('lg.materials'), cols: [{ h: '#', kind: 'int' }, { h: t('rp.col.item'), kind: 'text', wide: true }, { h: t('rp.col.qty'), kind: 'qty' }, { h: t('rp.col.unit'), kind: 'text', nw: true }, { h: t('lg.checked'), kind: 'text', sign: true }],
    rows: s.lines.map((l, i) => [i + 1, l.name, l.qty, t('bom.unit.' + l.unit), ''])});
  return { private: true, scope: s.id + ' · ' + s.title, period: s.eta ? t('lg.etaShort', { d: fmtDay(s.eta) }) : asOfText(), title: t('rp.type.shipment') + ' · ' + s.id,
    kpis: [{ label: t('rp.col.progress'), v: lgProgress(s), kind: 'pct', tone: lgState(s) === 'completed' ? 'pos' : '' }, { label: t('rp.k.stepsDone'), v: done, kind: 'int', sub: t('lg.stepsOf', { d: nf(done), n: nf(s.steps.length) }) },
      { label: t('rp.k.daysToEta'), v: lgOpen(s) ? d : null, kind: 'int', tone: d !== null && d < 0 && lgOpen(s) ? 'neg' : '', sub: s.eta ? fmtDay(s.eta) : '' }, { label: t('lg.cost'), v: num(s.cost) || null, kind: 'money' }], charts: [], tables };
}
Object.assign(REPORT_OPS, { inventory: inventoryModel, reorder: reorderModel, stockmoves: stockmovesModel, suppliers: suppliersModel, logistics: logisticsModel, shipment: shipmentModel });
