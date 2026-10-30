/**
 * <admin>/js/views/collections.js  -  Collections: who has to pay what, and by when
 * #collections lists every open instalment of every client (from the collection schedule of each project, see schedule.js), plus the
 * balance of a project that has no date yet. Filters: all, overdue, next 7 days, next 30 days, no date. Each row has a WhatsApp reminder
 * and a copy button. The same rows feed the printable report #reports/collections.
 * Loaded by: admin page
 */
'use strict';

const COL_FILTERS = ['open', 'overdue', 'week', 'month', 'undated'];
let colSel = { f: 'open', q: '' };

// every open instalment of every client, and the part of each project's balance that has no date; overdue first, then by date, undated last
function collectionRows(today) {
  const rows = [];
  for (const it of store.items) for (const p of it.rec.projects) {
    const c = collectionSum(p, today);
    for (const x of c.plan) if (x.status !== 'paid') rows.push({ rec: it.rec, p, x, kind: 'due' });
    if (c.undated > 0.005 && finance(p).price > 0) rows.push({ rec: it.rec, p, kind: 'undated', x: { id: '', due: '', amount: c.undated, covered: 0, outstanding: c.undated, days: null, status: 'undated', note: '' } });
  }
  const key = (r) => (r.kind === 'undated' ? '9999-99-99' : r.x.due);
  return rows.sort((a, b) => key(a).localeCompare(key(b)) || a.rec.id.localeCompare(b.rec.id));
}
const colMatch = (r, f) => f === 'open' || (f === 'overdue' && r.x.status === 'overdue') || (f === 'week' && r.kind === 'due' && r.x.days >= 0 && r.x.days <= 7)
  || (f === 'month' && r.kind === 'due' && r.x.days >= 0 && r.x.days <= 30) || (f === 'undated' && r.kind === 'undated');
function collectionTotals(rows) {
  const sel = (f) => rows.filter((r) => colMatch(r, f));
  return { overdue: sel('overdue'), week: sel('week'), month: sel('month'), undated: sel('undated'), all: rows,
    sum: (list) => sumBy(list, (r) => r.x.outstanding) };
}
const colBadge = (r) => (r.kind === 'undated' ? h('span', { class: 'badge pending', 'data-status': 'undated' }, t('col.noDate')) : collectionBadge(r.x));
const colSearchText = (r) => [r.rec.id, r.rec.client.name, r.rec.client.phone, r.p.sku, r.p.title].join(' ').toLowerCase();

async function renderCollections(token) {
  if (!store) {
    mount(notice(t('dash.loading'), t('dash.loadingSub'), 'info', { spinner: true }));
    try { await loadStore(); } catch (e) {
      if (token === routeToken) mount(notice(t('err.load'), e.message, 'bad', { actions: [h('button', { class: 'btn', type: 'button', onclick: () => route() }, t('act.retry'))] }));
      return;
    }
    if (token !== routeToken) return;
  }
  CUR = (session.settings && session.settings.currency) || CUR;
  drawCollections();
}

function drawCollections() {
  const all = collectionRows(), tot = collectionTotals(all);
  const kpiTile = (key, list, cls) => kpi(t('col.k.' + key), money(tot.sum(list)), list.length && cls ? cls : '', t('col.nInstal', { n: nf(list.length) }));
  const list = h('div', { class: 'tablewrap', id: 'colList' }), count = h('p', { class: 'hint', id: 'colCount', role: 'status' });
  const draw = () => {
    const q = colSel.q.trim().toLowerCase(), rows = all.filter((r) => colMatch(r, colSel.f) && (!q || colSearchText(r).includes(q)));
    count.textContent = t('col.shown', { n: nf(rows.length), total: nf(all.length), sum: money(tot.sum(rows)) });
    list.replaceChildren(rows.length ? h('table', { class: 'tbl' },
      h('thead', {}, h('tr', {}, h('th', {}, t('col.client')), h('th', {}, t('col.project')), h('th', {}, t('sch.due')), h('th', {}, t('rp.col.status')), h('th', { class: 'n' }, t('col.instalment')), h('th', { class: 'n' }, t('col.toCollect')), h('th', {}, h('span', { class: 'sr' }, t('col.actions'))))),
      h('tbody', {}, rows.map((r) => {
        const text = r.kind === 'due' ? collectionText(r.rec, r.p, r.x) : '', wa = text ? waSendTo(r.rec.client.phone, r.rec.client.whatsapp, text) : '';
        return h('tr', { 'data-cid': r.rec.id, 'data-sku': r.p.sku, 'data-kind': r.kind, 'data-status': r.x.status },
          h('td', {}, h('a', { class: 'clink', href: '#manage/' + r.rec.id, dir: 'auto' }, r.rec.client.name), ' ', h('span', { class: 'small muted mono' }, r.rec.id)),
          h('td', {}, h('span', { class: 'mono', dir: 'ltr' }, skuRef(r.rec, r.p))),
          h('td', {}, r.kind === 'due' ? [fmtDay(r.x.due), r.x.deposit ? [' ', h('span', { class: 'chip', 'data-deposit': '1' }, t('sch.deposit'))] : null] : '—'), h('td', {}, colBadge(r)),
          h('td', { class: 'n' }, r.kind === 'due' ? money(r.x.amount) : '—'), h('td', { class: 'n' }, h('strong', {}, money(r.x.outstanding))),
          h('td', {}, h('div', { class: 'actions' },
            wa ? h('a', { class: 'btn small', href: wa, target: '_blank', rel: 'noopener noreferrer', 'aria-label': t('col.remindWa') + ' ' + r.rec.client.name }, icon('chat'), t('col.remindWa')) : null,
            text ? copyBtn(() => text, 'small') : null,
            h('a', { class: 'btn small', href: '#manage/' + r.rec.id, 'aria-label': t('col.open') + ' ' + r.rec.client.name }, t('col.open')))));
      })),
      h('tfoot', {}, h('tr', {}, h('th', { colspan: 5 }, t('fin.total')), h('th', { class: 'n' }, money(tot.sum(rows))), h('td', {})))) : h('p', { class: 'empty' }, all.length ? t('col.noMatch') : t('col.empty')));
  };
  const search = h('input', { id: 'colSearch', type: 'search', placeholder: t('col.search'), 'aria-label': t('col.search'), value: colSel.q, dir: 'auto' });
  search.addEventListener('input', () => { colSel.q = search.value; draw(); });
  const filter = selectEl(COL_FILTERS.map((f) => [f, t('col.f.' + f)]), colSel.f, (v) => { colSel.f = v; draw(); }, 'colFilter', t('col.filter'));
  mount(h('section', { class: 'stack', id: 'colScreen' },
    h('div', { class: 'page-head' }, h('h1', {}, t('col.title')),
      h('div', { class: 'actions' }, encBadge(),
        h('button', { class: 'btn', type: 'button', id: 'btnColRefresh', onclick: () => { store = null; route(); } }, t('act.refresh')),
        can('reports') ? h('a', { class: 'btn', href: '#reports/collections', id: 'btnColPrint' }, t('ops.printReport')) : null)),
    h('p', { class: 'hint' }, t('col.hint')),
    kpis(kpiTile('overdue', tot.overdue, 'neg'), kpiTile('week', tot.week, 'warn'), kpiTile('month', tot.month), kpiTile('undated', tot.undated, 'warn')),
    h('div', { class: 'card stack-sm' }, h('div', { class: 'filters3' }, search, filter), count, list)));
  draw();
}
