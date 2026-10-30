/**
 * assets/js/core/domain.js  -  money, progress and project state
 * Pure functions over a project object: finance (revenue, COGS, gross, net, margins), collection plan, progress, state, snapshot upgrade.
 * Loaded by: both pages
 */
'use strict';

/* =====================================================================
   Domain: money, progress
   ===================================================================== */
const num = (v) => { const n = Number(v); return isFinite(n) ? n : 0; };
const sum = (arr, f) => (arr || []).reduce((a, x) => a + num(f(x)), 0);

// Finance: revenue = contract price; COGS = direct costs; opex = operating costs.
function finance(p) {
  const price = num(p.price), paid = sum(p.payments, (x) => x.amount);
  const cogs = sum((p.costs || []).filter((c) => c.type !== 'opex'), (c) => c.amount);
  const opex = sum((p.costs || []).filter((c) => c.type === 'opex'), (c) => c.amount);
  return fin2(price, paid, cogs, opex);
}
function fin2(price, paid, cogs, opex) {
  const gross = price - cogs, net = gross - opex;
  return { price, paid, remaining: price - paid, cogs, opex, gross, net,
    grossMargin: price ? gross / price : null, netMargin: price ? net / price : null, markup: cogs ? gross / cogs : null, collected: price ? paid / price : null };
}
function finTotals(projects) {
  const a = projects.map(finance);
  return fin2(sum(a, (x) => x.price), sum(a, (x) => x.paid), sum(a, (x) => x.cogs), sum(a, (x) => x.opex));
}
/* ---- Collection plan: the instalments a client agreed to pay, matched against what has been received ----
   The part of the price that no instalment covers (a deposit paid at signing, say) is taken out of the money received first; what is left goes to the
   instalments, earliest first. So the schedule can list only what is still to come, or the whole price: both give the same answer, and payments never
   have to be tagged to an instalment.
   status: paid | overdue (a date in the past that is not fully covered) | partial (part covered, not yet due) | upcoming.
   An instalment can be marked as the down payment (deposit: true); at most one per project. */
const dayDiff = (a, b) => { const x = parseDay(a), y = parseDay(b); return x && y ? Math.round((y - x) / 864e5) : null; };
const cents = (x) => Math.round(x * 100) / 100;
function collectionPlan(p, today) {
  const t0 = today || todayStr(), rows = (p.schedule || []).filter((s) => num(s.amount) > 0 && parseDay(s.due));
  const outside = Math.max(0, num(p.price) - sum(rows, (s) => s.amount));
  let pool = Math.max(0, sum(p.payments, (x) => x.amount) - outside);
  return rows.slice().sort((a, b) => String(a.due).localeCompare(String(b.due)) || String(a.id || '').localeCompare(String(b.id || '')))
    .map((s) => {
      const amount = num(s.amount), covered = Math.min(amount, pool); pool -= covered;
      const outstanding = cents(amount - covered), days = dayDiff(t0, s.due);
      const status = outstanding <= 0 ? 'paid' : days < 0 ? 'overdue' : covered > 0 ? 'partial' : 'upcoming';
      return { id: s.id || '', due: s.due, amount, note: s.note || '', deposit: s.deposit === true, covered, outstanding, days, status };
    });
}
// the next instalment still to collect (overdue ones come first because they are the oldest)
const collectionNext = (plan) => (plan || []).find((x) => x.status !== 'paid') || null;
// totals for a plan: what is scheduled, what is late, and what is still owed on no date at all (the price minus the instalments minus what was received)
function collectionSum(p, today) {
  const plan = collectionPlan(p, today), f = finance(p), open = plan.filter((x) => x.status !== 'paid');
  const scheduled = sum(plan, (x) => x.amount), outside = Math.max(0, f.price - scheduled);
  return { plan, scheduled, overdue: sum(open.filter((x) => x.status === 'overdue'), (x) => x.outstanding), openAmount: sum(open, (x) => x.outstanding),
    undated: cents(Math.max(0, outside - f.paid)), over: scheduled > f.price + 0.005 };
}
function progress(p) {
  let done = 0, total = 0;
  for (const s of p.stages || []) {
    const items = s.checklist || [];
    if (items.length) { total += items.length; done += items.filter((i) => i.done).length; } else { total += 1; done += s.status === 'completed' ? 1 : 0; }
  }
  return total ? done / total : 0;
}
function projState(p) {
  const pr = progress(p);
  if (pr >= 1 && (p.stages || []).length) return 'completed';
  return pr > 0 || (p.stages || []).some((s) => s.status !== 'pending') ? 'in_progress' : 'pending';
}

function upgradePublic(r) {
  if (r.schema === SCHEMA) return r;
  return { schema: SCHEMA, id: r.id, name: r.name, phone: r.phone, currency: 'EGP', createdAt: r.createdAt, updatedAt: r.updatedAt,
    projects: [{ sku: r.id, type: '', typeName: '', title: r.description || r.name, description: r.description || '', startDate: '', dueDate: '', price: 0, payments: [], stages: r.stages || [], parts: [], photos: [] }] };
}
