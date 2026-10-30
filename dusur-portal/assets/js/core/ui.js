/**
 * assets/js/core/ui.js  -  small shared UI pieces
 * Status and time badges, collection (instalment) badge, KPI tiles, progress bars.
 * Loaded by: both pages
 */
'use strict';

/* =====================================================================
   Shared UI bits
   ===================================================================== */
const noop = () => {};
const statusOptions = () => STATUS.map(([v, k]) => [v, t(k)]);
const statusBadge = (s) => { const i = statusInfo(s); return h('span', { class: 'badge ' + i[2] }, t(i[1])); };
function timeBadge(due, done) {
  if (done) return document.createTextNode('');                  // the status badge already says Completed
  const n = daysUntil(due);
  if (n === null) return h('span', { class: 'badge pending' }, t('time.noDate'));
  return h('span', { class: 'badge ' + (n < 0 ? 'late' : n <= 7 ? 'progress' : 'done') }, timeLeft(n));
}
// one instalment of the collection plan: collected, part paid, due in N days, overdue
const COLL_BADGE = { paid: 'done', overdue: 'late', partial: 'progress', upcoming: 'pending' };
const collectionBadge = (x) => h('span', { class: 'badge ' + COLL_BADGE[x.status], 'data-status': x.status },
  x.status === 'paid' ? t('sch.st.paid') : x.status === 'partial' ? t('sch.st.partial') + ' · ' + timeLeft(x.days) : timeLeft(x.days));
const kpi = (label, value, cls, sub) => h('div', { class: 'kpi ' + (cls || '') }, h('div', { class: 'l' }, label), h('div', { class: 'v' }, value), sub ? h('div', { class: 'sub' }, sub) : null);
const kpis = (...tiles) => { const f = tiles.flat().filter(Boolean); return h('div', { class: 'kpis', style: '--n:' + Math.min(4, f.length) }, f); };
const profitCls = (x) => (x > 0 ? 'pos' : x < 0 ? 'neg' : '');
const barFill = (x, cls) => h('div', { class: 'bar thin ' + (cls || '') }, h('i', { style: 'width:' + Math.round(Math.max(0, Math.min(1, x || 0)) * 100) + '%' }));
