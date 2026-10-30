/**
 * <admin>/js/views/schedule.js  -  collection schedule (Payments tab of the editor)
 * The instalments a client agreed to pay: due date, amount, note. Each row shows whether the money received already covers it
 * (collectionPlan() in core/domain.js matches received money to the earliest instalment first). The client sees the next payment
 * on the money card; the Collections screen lists every open instalment of every client.
 * Loaded by: admin page
 */
'use strict';

/* ---- dates and the reminder text ---- */
// the same day of the month n months later (31 Jan + 1 month = 28/29 Feb)
function addMonths(dayStr, n) {
  const d = parseDay(dayStr); if (!d) return '';
  const day = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + n);
  d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}
// a short reminder to send to the client: name, amount still to pay, project reference, due date
const collectionText = (rec, p, x) => t('sch.msg', { name: rec.client.name, brand: brandName(), amount: money(x.outstanding), ref: skuRef(rec, p), date: fmtDay(x.due) });
// split an amount into k parts that add up exactly (the last one takes the rounding)
function splitAmount(total, k) {
  const cents = Math.round(total * 100), q = Math.floor(cents / k);
  return Array.from({ length: k }, (_, i) => (i === k - 1 ? cents - q * (k - 1) : q) / 100);
}

/* ---- the card ---- */
function scheduleCard(p) {
  p.schedule = p.schedule || [];
  const chips = [], list = h('div', { class: 'stack-sm', id: 'schList' });
  const refresh = () => {
    const plan = collectionPlan(p);
    chips.forEach((c) => { const r = plan.find((y) => y.id === c.x.id); c.box.replaceChildren(r ? collectionBadge(r) : h('span', { class: 'badge pending' }, '—')); });
  };
  const summary = live(() => {
    const c = collectionSum(p), next = collectionNext(c.plan), f = finance(p);
    return [kpis(kpi(t('sch.scheduled'), money(c.scheduled)), kpi(t('sch.next'), next ? fmtDay(next.due) : '—', next && next.status === 'overdue' ? 'neg' : '', next ? money(next.outstanding) : ''),
      kpi(t('sch.overdue'), money(c.overdue), c.overdue > 0 ? 'neg' : ''), kpi(t('sch.unscheduled'), money(c.undated), c.undated > 0 ? 'warn' : '')),
    c.over ? h('p', { class: 'msg warn', id: 'schOver' }, t('sch.over', { a: money(c.scheduled), b: money(f.price) })) : null];
  });
  const row = (x, i) => {
    const box = h('div', { class: 'sch-st' }); chips.push({ x, box });
    return h('div', { class: 'rg', style: '--cols:minmax(0,1fr) minmax(0,1fr) minmax(0,2fr) auto minmax(0,1.3fr) auto' },
      tin(x, 'due', { type: 'date', label: t('sch.due'), on: refresh }),
      tin(x, 'amount', { type: 'number', num: true, min: 0, step: '0.01', mode: 'decimal', ph: t('ed.amount'), on: refresh }),
      h('div', { class: 'wide' }, tin(x, 'note', { ph: t('sch.note'), max: 80 })),
      h('label', { class: 'check small', title: t('sch.depositHint') }, h('input', { type: 'checkbox', class: 'sch-dep', checked: x.deposit === true, 'aria-label': t('sch.deposit') + ' ' + (i + 1), onchange: (e) => {
        p.schedule.forEach((y) => { delete y.deposit; }); if (e.target.checked) x.deposit = true; touch(); draw();                    // one down payment per project
      } }), h('span', {}, t('sch.deposit'))), box,
      h('button', { class: 'small danger x', type: 'button', 'aria-label': t('act.remove'), onclick: () => { p.schedule.splice(i, 1); touch(); draw(); } }, '×'));
  };
  const draw = () => {
    for (const x of p.schedule) if (!x.id) x.id = uid();
    p.schedule.sort((a, b) => String(a.due || '9999').localeCompare(String(b.due || '9999')));
    chips.length = 0;
    list.replaceChildren(...(p.schedule.length ? p.schedule.map(row) : [h('p', { class: 'empty' }, t('sch.none'))]));
    refresh();
  };
  draw();
  const add = h('button', { class: 'btn', type: 'button', id: 'btnAddInstalment', onclick: () => {
    const c = collectionSum(p), last = c.plan.length ? c.plan[c.plan.length - 1].due : '', base = last > todayStr() ? last : todayStr();
    p.schedule.push({ id: uid(), due: addMonths(base, 1), amount: Math.max(0, c.undated), note: '' }); touch(); draw();
  } }, t('sch.add'));
  const n = h('input', { id: 'splitN', type: 'number', min: 2, max: 36, step: 1, value: 3, inputmode: 'numeric', 'aria-label': t('sch.splitN') });
  const from = h('input', { id: 'splitFrom', type: 'date', value: addMonths(todayStr(), 1), 'aria-label': t('sch.splitFrom') });
  const split = h('button', { class: 'btn', type: 'button', id: 'btnSplit', onclick: () => {
    const k = Math.round(num(n.value));
    if (k < 2 || k > 36) return toast(t('sch.splitBad'), 'bad');
    if (!parseDay(from.value)) return toast(t('sch.splitDate'), 'bad');
    const left = collectionSum(p).undated; if (left <= 0) return toast(t('sch.splitNone'), 'bad');
    splitAmount(left, k).forEach((amount, i) => p.schedule.push({ id: uid(), due: addMonths(from.value, i), amount, note: (i + 1) + '/' + k }));
    touch(); draw();
  } }, t('sch.split'));
  return h('section', { class: 'stack-sm', id: 'schCard' },
    h('strong', {}, t('sch.title')), h('p', { class: 'hint' }, t('sch.hint')), summary, list,
    h('div', { class: 'actions' }, add),
    h('div', { class: 'input-row sch-split' }, h('span', { class: 'small muted' }, t('sch.splitLead')), n, h('span', { class: 'small muted' }, t('sch.splitFromLead')), from, split));
}
