/**
 * <admin>/js/fin-data.js  -  financial status: direct, indirect and total operations cost
 * Direct cost = what a project costs to make (its COGS lines) plus pooled production costs from the expenses ledger.
 * Indirect cost = overheads: the operating lines of the projects plus the ledger's overhead expenses. Total operations cost = direct + indirect.
 * Recurring ledger entries are expanded into monthly / yearly occurrences; shared costs are spread over the projects by revenue, direct cost or equally.
 * Loaded by: admin page
 */
'use strict';

/* =====================================================================
   Finance: periods, expense occurrences, the cost picture
   ===================================================================== */
const FIN_PRESETS = ['month', 'lastmonth', 'quarter', 'year', 'last12', 'all', 'custom'];
const FIN_BASES = ['revenue', 'direct', 'equal'];
const ymd = (d) => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
const monthKey = (day) => String(day || '').slice(0, 7);
const endOfMonth = (y, m) => ymd(new Date(y, m + 1, 0));
const startOfMonth = (y, m) => ymd(new Date(y, m, 1));

// the dates of the chosen period: { from, to } ('' = no limit)
function finRange(sel) {
  const d = new Date(), y = d.getFullYear(), m = d.getMonth();
  switch (sel.preset) {
    case 'month': return { from: startOfMonth(y, m), to: endOfMonth(y, m) };
    case 'lastmonth': return { from: startOfMonth(y, m - 1), to: endOfMonth(y, m - 1) };
    case 'quarter': { const q = Math.floor(m / 3) * 3; return { from: startOfMonth(y, q), to: endOfMonth(y, q + 2) }; }
    case 'year': return { from: y + '-01-01', to: y + '-12-31' };
    case 'last12': return { from: startOfMonth(y, m - 11), to: endOfMonth(y, m) };
    case 'custom': return { from: oday(sel.from), to: oday(sel.to) };
    default: return { from: '', to: '' };
  }
}
const finPeriodText = (sel) => { const r = finRange(sel); return r.from || r.to ? (r.from ? fmtDay(r.from) : '…') + ' → ' + (r.to ? fmtDay(r.to) : '…') : t('rp.allDates'); };

// the dates a ledger entry falls on inside [from, to]; costs are counted up to the end of the current month (a rent for next month is not a cost yet)
function expenseOccurrences(e, from, to) {
  const out = [], cap = (() => { const n = new Date(); return endOfMonth(n.getFullYear(), n.getMonth()); })();
  const last = [to || cap, cap, e.until || '9999-12-31'].reduce((a, b) => (a < b ? a : b));
  if (!e.date || !e.amount) return out;
  const add = (d) => { if (d <= last && (!from || d >= from) && (!to || d <= to)) out.push({ e, date: d, amount: e.amount }); };
  if (e.repeat === 'none') { add(e.date); return out; }
  const s = parseDay(e.date); if (!s) return out;
  for (let i = 0; i < 600; i++) {
    const y = e.repeat === 'yearly' ? s.getFullYear() + i : s.getFullYear() + Math.floor((s.getMonth() + i) / 12), m = e.repeat === 'yearly' ? s.getMonth() : (s.getMonth() + i) % 12;
    const dim = new Date(y, m + 1, 0).getDate(), day = ymd(new Date(y, m, Math.min(s.getDate(), dim)));
    if (day > last) break;
    add(day);
  }
  return out;
}
const monthsBetween = (from, to) => {
  const a = parseDay(from), b = parseDay(to), out = []; if (!a || !b) return out;
  for (let y = a.getFullYear(), m = a.getMonth(); y < b.getFullYear() || (y === b.getFullYear() && m <= b.getMonth()); m++) { if (m > 11) { m = 0; y++; } out.push(y + '-' + pad2(m + 1)); if (out.length > 60) break; }
  return out;
};

// Everything the Finance screen and the report need for one period. Needs `store` (clients) and the expenses ledger.
function finCompute(sel) {
  const { from, to } = finRange(sel), inR = (d) => !!d && (!from || d >= from) && (!to || d <= to);
  const projs = [];
  for (const it of store.items) for (const p of it.rec.projects) { const d = p.startDate || String(it.rec.createdAt || '').slice(0, 10); if (inR(d)) projs.push({ rec: it.rec, p, d, f: finance(p) }); }
  const occ = []; for (const e of opsList('expenses')) occ.push(...expenseOccurrences(e, from, to));
  occ.sort((a, b) => b.date.localeCompare(a.date) || a.e.name.localeCompare(b.e.name, locale()));
  const pool = (kind) => sumBy(occ.filter((o) => o.e.kind === kind), (o) => o.amount);
  const revenue = sumBy(projs, (x) => x.f.price), directProj = sumBy(projs, (x) => x.f.cogs), indirectProj = sumBy(projs, (x) => x.f.opex);
  let collected = 0; for (const it of store.items) for (const p of it.rec.projects) for (const x of p.payments || []) if (inR(String(x.date || '').slice(0, 10))) collected += num(x.amount);
  const directPool = pool('direct'), indirectPool = pool('indirect'), direct = directProj + directPool, indirect = indirectProj + indirectPool, total = direct + indirect;
  const profit = revenue - total, gross = revenue - direct, gm = revenue ? gross / revenue : null;

  // by category: [{ kind, cat, label, amount }]
  const cats = [];
  for (const c of COST_CATS) { const a = sumBy(projs.flatMap((x) => (x.p.costs || []).filter((k) => k.type !== 'opex' && (COST_CATS.includes(k.cat) ? k.cat : 'other') === c)), (k) => k.amount) + sumBy(occ.filter((o) => o.e.kind === 'direct' && o.e.cat === c), (o) => o.amount); if (a > 0) cats.push({ kind: 'direct', cat: c, label: catText('direct', c), amount: a }); }
  if (indirectProj > 0) cats.push({ kind: 'indirect', cat: 'projects', label: t('fin.projOpex'), amount: indirectProj });
  for (const c of IND_CATS) { const a = sumBy(occ.filter((o) => o.e.kind === 'indirect' && o.e.cat === c), (o) => o.amount); if (a > 0) cats.push({ kind: 'indirect', cat: c, label: catText('indirect', c), amount: a }); }

  // month by month
  const keys = from && to ? monthsBetween(from, to).slice(-24) : [...new Set(projs.map((x) => monthKey(x.d)).concat(occ.map((o) => monthKey(o.date))).filter(Boolean))].sort().slice(-24);
  const months = keys.map((k) => {
    const ps = projs.filter((x) => monthKey(x.d) === k), os = occ.filter((o) => monthKey(o.date) === k);
    const d = sumBy(ps, (x) => x.f.cogs) + sumBy(os.filter((o) => o.e.kind === 'direct'), (o) => o.amount), i = sumBy(ps, (x) => x.f.opex) + sumBy(os.filter((o) => o.e.kind === 'indirect'), (o) => o.amount);
    const rev = sumBy(ps, (x) => x.f.price);
    return { k, revenue: rev, direct: d, indirect: i, total: d + i, profit: rev - d - i };
  });

  // projects with their share of the pooled costs
  const w = (x) => (sel.basis === 'direct' ? x.f.cogs : sel.basis === 'equal' ? 1 : x.f.price), wsum = sumBy(projs, w);
  const share = (x) => (wsum > 0 ? w(x) / wsum : projs.length ? 1 / projs.length : 0);
  const rows = projs.map((x) => {
    const ad = directPool * share(x), ai = indirectPool * share(x), cost = x.f.cogs + x.f.opex + ad + ai;
    return { rec: x.rec, p: x.p, price: x.f.price, cogs: x.f.cogs, opex: x.f.opex, allocDirect: ad, allocIndirect: ai, cost, profit: x.f.price - cost, margin: x.f.price ? (x.f.price - cost) / x.f.price : null };
  }).sort((a, b) => b.price - a.price);
  const recurring = opsList('expenses').filter((e) => e.repeat !== 'none' && e.amount > 0 && (!e.until || e.until >= todayStr()));
  const monthly = sumBy(recurring, (e) => (e.repeat === 'monthly' ? e.amount : e.amount / 12));
  const nMonths = from && to ? Math.max(1, monthsBetween(from, to).length) : Math.max(1, keys.length);
  const bud = (session.settings && session.settings.budget) || {};
  return { from, to, projs, occ, revenue, collected, directProj, indirectProj, directPool, indirectPool, direct, indirect, total, profit, gross, grossMargin: gm, margin: revenue ? profit / revenue : null,
    overheadRate: direct > 0 ? indirect / direct : null, breakEven: gm > 0 ? indirect / gm : null, cats, months, rows, recurring, monthly, nMonths,
    budgetDirect: num(bud.direct) * nMonths, budgetIndirect: num(bud.indirect) * nMonths, perProject: projs.length ? total / projs.length : null, indirectPerProject: projs.length ? indirect / projs.length : null };
}
