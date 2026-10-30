/**
 * <admin>/js/views/audit.js  -  History screen: who changed what, and when
 * One month at a time, newest first. Filters by person, area, action and text; a record's own history is opened with #audit/<record id>.
 * Every entry opens to show the fields it changed (before -> after). A badge tells whether the chain of entries of the month is unbroken.
 * Loaded by: admin page
 */
'use strict';

/* =====================================================================
   History screen
   ===================================================================== */
let audSel = { month: '', who: '', area: '', act: '', q: '', ref: '', shown: 40 };
const AUD_PAGE = 40;
// where an entry's record can be opened (null = nowhere to go)
const AUD_LINKS = { client: (r) => '#manage/' + r, suppliers: (r) => '#suppliers/' + r, inventory: (r) => '#inventory/' + r, logistics: (r) => '#logistics/' + r, expenses: (r) => '#expenses/' + r };
const AUD_TONE = { create: 'done', update: 'progress', delete: 'late', block: 'late', pause: 'pending', forced: 'late', rotate: 'late', export: 'pending', import: 'done' };
const audMonthLabel = (k) => { const [y, m] = k.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString(locale(), { month: 'long', year: 'numeric' }); };

async function renderAudit(token, ref) {
  mount(notice(t('aud.loading'), t('aud.loadingSub'), 'info', { spinner: true }));
  let months = [], data = null;
  try {
    months = await auditMonths();
    const cur = auditMonthOf(oiso());
    if (auditQ.length && !months.includes(cur)) months.unshift(cur);
    if (ref !== undefined && ref !== audSel.ref) { audSel.ref = ref; audSel.shown = AUD_PAGE; }
    if (!audSel.month || !months.includes(audSel.month)) audSel.month = months[0] || cur;
    data = months.length ? await loadAuditMonth(audSel.month) : { month: audSel.month, items: [], intact: true };
  } catch (e) {
    if (token === routeToken) mount(notice(t('err.load'), e.message, 'bad', { actions: [h('button', { class: 'btn', type: 'button', onclick: () => route() }, t('act.retry'))] }));
    return;
  }
  if (token !== routeToken) return;
  drawAudit(months, data);
}

function auditFilter(items) {
  const q = audSel.q.trim().toLowerCase();
  return items.filter((e) => (!audSel.who || e.uid === audSel.who) && (!audSel.area || e.area === audSel.area) && (!audSel.act || e.act === audSel.act) && (!audSel.ref || e.ref === audSel.ref)
    && (!q || [e.title, e.ref, e.who, e.note, ...(e.ch || []).map((c) => c.join(' '))].join(' ').toLowerCase().includes(q)));
}
function auditEntry(e) {
  const link = AUD_LINKS[e.area] && e.ref && e.act !== 'delete' ? AUD_LINKS[e.area](e.ref) : null;
  const ch = e.ch || [];
  return h('li', { class: 'audit-item', 'data-act': e.act, 'data-area': e.area },
    h('div', { class: 'audit-top' },
      h('span', { class: 'badge ' + (AUD_TONE[e.act] || 'pending') }, t('aud.act.' + e.act) === 'aud.act.' + e.act ? e.act : t('aud.act.' + e.act)),
      h('span', { class: 'chip' }, t('aud.area.' + e.area) === 'aud.area.' + e.area ? e.area : t('aud.area.' + e.area)),
      link ? h('a', { class: 'clink', href: link, dir: 'auto' }, e.title || e.ref) : h('strong', { dir: 'auto' }, e.title || e.ref || '—'),
      e.ref && e.title && e.ref !== e.title ? h('a', { class: 'mono small muted', href: '#audit/' + encodeURIComponent(e.ref), title: t('aud.historyOf') }, e.ref) : null,
      e.pending ? h('span', { class: 'badge pending' }, t('aud.pending')) : null),
    h('div', { class: 'small muted' }, h('bdi', { dir: 'auto' }, e.who || '—'), e.role ? ' · ' + (BUILTIN_ROLES.includes(e.role) ? t('team.role.' + e.role) : e.role === 'owner' ? t('team.owner') : e.role) : '', ' · ', h('time', { datetime: e.at }, fmtDateTime(e.at))),
    e.note ? h('p', { class: 'small', dir: 'auto' }, e.note) : null,
    ch.length ? h('details', { class: 'audit-ch' }, h('summary', {}, t('aud.fields', { n: nf(ch.length) })),
      h('div', { class: 'tablewrap' }, h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, h('th', {}, t('aud.field')), h('th', {}, t('aud.before')), h('th', {}, t('aud.after')))),
        h('tbody', {}, ch.map((c) => h('tr', {}, h('td', { class: 'mono small', dir: 'ltr' }, c[0]), h('td', { dir: 'auto', class: 'aud-old' }, c[1] || '—'), h('td', { dir: 'auto', class: 'aud-new' }, c[2] || '—'))))))) : null);
}
function drawAudit(months, data) {
  const list = h('ol', { class: 'audit-list', id: 'audList' }), count = h('p', { class: 'hint', id: 'audCount', role: 'status' }), more = h('button', { class: 'btn', type: 'button', id: 'btnAudMore' }, t('aud.more'));
  const people = [...new Map(data.items.map((e) => [e.uid, e.who || e.uid])).entries()].sort((a, b) => String(a[1]).localeCompare(String(b[1]), locale()));
  const acts = [...new Set(data.items.map((e) => e.act))].sort();
  const draw = () => {
    const rows = auditFilter(data.items), shown = rows.slice(0, audSel.shown);
    count.textContent = t('aud.shown', { n: nf(shown.length), total: nf(rows.length), all: nf(data.items.length) });
    list.replaceChildren(...(shown.length ? shown.map(auditEntry) : [h('li', { class: 'empty' }, data.items.length ? t('aud.noMatch') : t('aud.empty'))]));
    more.hidden = rows.length <= shown.length;
  };
  more.onclick = () => { audSel.shown += AUD_PAGE; draw(); };
  const reset = () => { audSel = { month: audSel.month, who: '', area: '', act: '', q: '', ref: '', shown: AUD_PAGE }; location.hash = '#audit'; };
  const pick = (k) => (v) => { audSel[k] = v; audSel.shown = AUD_PAGE; draw(); };
  const search = h('input', { id: 'audSearch', type: 'search', placeholder: t('aud.search'), 'aria-label': t('aud.search'), value: audSel.q, dir: 'auto' });
  search.addEventListener('input', () => { audSel.q = search.value; audSel.shown = AUD_PAGE; draw(); });
  const monthSel = selectEl((months.length ? months : [audSel.month]).map((m) => [m, audMonthLabel(m)]), audSel.month, (v) => { audSel.month = v; audSel.shown = AUD_PAGE; renderAudit(routeToken); }, 'audMonth', t('aud.month'));
  const who = selectEl([['', t('aud.allPeople')]].concat(people), audSel.who, pick('who'), 'audWho', t('aud.person'));
  const area = selectEl([['', t('aud.allAreas')]].concat(AUDIT_AREAS.map((a) => [a, t('aud.area.' + a)])), audSel.area, pick('area'), 'audArea', t('aud.areaLabel'));
  const act = selectEl([['', t('aud.allActs')]].concat(acts.map((a) => [a, t('aud.act.' + a) === 'aud.act.' + a ? a : t('aud.act.' + a)])), audSel.act, pick('act'), 'audAct', t('aud.actLabel'));
  const badge = data.intact ? h('span', { class: 'badge done', id: 'audIntact' }, icon('check'), t('aud.intact')) : h('span', { class: 'badge late', id: 'audBroken', role: 'alert' }, icon('alert'), t('aud.broken'));
  mount(h('section', { class: 'stack', id: 'audScreen' },
    h('div', { class: 'page-head' }, h('h1', {}, t('aud.title')), h('div', { class: 'actions' }, encBadge(), badge,
      can('reports') ? h('a', { class: 'btn', href: '#reports/audit', id: 'btnAudPrint', onclick: () => { reportSel.amonth = audSel.month; } }, t('ops.printReport')) : null)),
    h('p', { class: 'hint' }, t('aud.hint')),
    audSel.ref ? h('p', { class: 'msg info', id: 'audRefChip' }, t('aud.onlyRef', { r: audSel.ref }), ' ', h('button', { class: 'btn small', type: 'button', id: 'btnAudClearRef', onclick: reset }, t('aud.clearRef'))) : null,
    data.intact ? null : h('p', { class: 'msg bad' }, t('aud.brokenHint')),
    h('div', { class: 'card stack-sm' }, h('div', { class: 'filters4' }, monthSel, who, area, act), search, count, list, h('div', { class: 'actions' }, more))));
  draw();
}
