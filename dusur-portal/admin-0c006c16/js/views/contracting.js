/**
 * <admin>/js/views/contracting.js  -  Contracting: the contracts of every project in one list
 * #contracting lists one line per project: contract number, client, project, price, the wording it uses (standard clauses, a template or its own),
 * language, status (draft, issued, signed) and dates. Filters: status and a search box. Opening a line goes to the contract screen of that project,
 * where the wording, the status and the printing are. The same lines feed the printable report #reports/contracts.
 * Loaded by: admin page
 */
'use strict';

const CTR_FILTERS = ['all', 'draft', 'issued', 'signed'];
let ctrSel = { f: 'all', q: '' };

// one line per project of every client
function contractRows() {
  const rows = [];
  for (const it of store.items) it.rec.projects.forEach((p, i) => {
    const c = contractModel(it.rec, p), w = ctWording(c), tp = ctTemplate(c);
    rows.push({ rec: it.rec, p, i, c, status: c.pc.status, wording: w, wordingName: w === 'own' ? t('ct.w.own') : w === 'tpl' ? L(tp.name) || tp.id : t('ct.w.standard'),
      langName: c.langs.map((l) => t('ct.lang.' + l)).join(' + '), price: finance(p).price });
  });
  return rows.sort((a, b) => a.rec.id.localeCompare(b.rec.id) || a.i - b.i);
}
const ctrMatch = (r, f) => f === 'all' || r.status === f;
const ctrSearchText = (r) => [r.c.no, r.rec.id, r.rec.client.name, r.rec.client.phone, r.p.sku, r.p.title].join(' ').toLowerCase();
function ctrTotals(rows) {
  const sel = (f) => rows.filter((r) => r.status === f), sum = (l) => sumBy(l, (r) => r.price);
  return { draft: sel('draft'), issued: sel('issued'), signed: sel('signed'), all: rows, sum };
}
const ctrBadge = (r) => h('span', { class: 'badge ct-st', 'data-status': r.status }, t('ct.st.' + r.status));

async function renderContracting(token) {
  if (!store) {
    mount(notice(t('dash.loading'), t('dash.loadingSub'), 'info', { spinner: true }));
    try { await loadStore(); } catch (e) {
      if (token === routeToken) mount(notice(t('err.load'), e.message, 'bad', { actions: [h('button', { class: 'btn', type: 'button', onclick: () => route() }, t('act.retry'))] }));
      return;
    }
    if (token !== routeToken) return;
  }
  CUR = (session.settings && session.settings.currency) || CUR;
  drawContracting();
}

function drawContracting() {
  const all = contractRows(), tot = ctrTotals(all);
  const tile = (key, list, cls) => kpi(t('ctr.k.' + key), nf(list.length), cls || '', money(tot.sum(list)));
  const list = h('div', { class: 'tablewrap', id: 'ctrList' }), count = h('p', { class: 'hint', id: 'ctrCount', role: 'status' });
  const draw = () => {
    const q = ctrSel.q.trim().toLowerCase(), rows = all.filter((r) => ctrMatch(r, ctrSel.f) && (!q || ctrSearchText(r).includes(q)));
    count.textContent = t('ctr.shown', { n: nf(rows.length), total: nf(all.length), sum: money(tot.sum(rows)) });
    list.replaceChildren(rows.length ? h('table', { class: 'tbl' },
      h('thead', {}, h('tr', {}, h('th', {}, t('ctr.no')), h('th', {}, t('col.client')), h('th', {}, t('col.project')), h('th', { class: 'n' }, t('ct.p.price')), h('th', {}, t('ct.wording')), h('th', {}, t('ct.lang')),
        h('th', {}, t('rp.col.status')), h('th', {}, t('ctr.dates')), h('th', {}, h('span', { class: 'sr' }, t('col.actions'))))),
      h('tbody', {}, rows.map((r) => h('tr', { 'data-cid': r.rec.id, 'data-sku': r.p.sku, 'data-status': r.status, 'data-wording': r.wording },
        h('td', {}, h('span', { class: 'mono', dir: 'ltr' }, r.c.no)),
        h('td', {}, h('a', { class: 'clink', href: '#manage/' + r.rec.id, dir: 'auto' }, r.rec.client.name), ' ', h('span', { class: 'small muted mono' }, r.rec.id)),
        h('td', {}, h('span', { class: 'mono', dir: 'ltr' }, skuRef(r.rec, r.p))),
        h('td', { class: 'n' }, money(r.price)), h('td', {}, h('span', { dir: 'auto' }, r.wordingName)), h('td', {}, r.langName), h('td', {}, ctrBadge(r)),
        h('td', { class: 'small' }, [r.c.pc.issuedAt ? t('ct.issuedOn', { d: fmtDay(r.c.pc.issuedAt) }) : '', r.c.pc.signedAt ? t('ct.signedOn', { d: fmtDay(r.c.pc.signedAt) }) : ''].filter(Boolean).join(' · ') || '—'),
        h('td', {}, h('div', { class: 'actions' }, h('a', { class: 'btn small', href: '#contract/' + r.rec.id + '/' + r.i, 'aria-label': t('ct.open') + ' ' + r.c.no }, t('ct.open')),
          h('a', { class: 'btn small', href: '#labels/' + r.rec.id + '/' + r.i, 'aria-label': t('lbl.open') + ' ' + r.c.no }, t('lbl.open')))))))) : h('p', { class: 'empty' }, all.length ? t('col.noMatch') : t('ctr.empty')));
  };
  const search = h('input', { id: 'ctrSearch', type: 'search', placeholder: t('ctr.search'), 'aria-label': t('ctr.search'), value: ctrSel.q, dir: 'auto' });
  search.addEventListener('input', () => { ctrSel.q = search.value; draw(); });
  const filter = selectEl(CTR_FILTERS.map((f) => [f, t('ctr.f.' + f)]), ctrSel.f, (v) => { ctrSel.f = v; draw(); }, 'ctrFilter', t('col.filter'));
  mount(h('section', { class: 'stack', id: 'ctrScreen' },
    h('div', { class: 'page-head' }, h('h1', {}, t('ctr.title')),
      h('div', { class: 'actions' }, encBadge(), h('button', { class: 'btn', type: 'button', id: 'btnCtrRefresh', onclick: () => { store = null; route(); } }, t('act.refresh')),
        can('reports') ? h('a', { class: 'btn', href: '#reports/contracts', id: 'btnCtrPrint' }, t('ops.printReport')) : null)),
    h('p', { class: 'hint' }, t('ctr.hint')),
    kpis(tile('all', all), tile('draft', tot.draft, tot.draft.length ? 'warn' : ''), tile('issued', tot.issued), tile('signed', tot.signed)),
    h('div', { class: 'card stack-sm' }, h('div', { class: 'filters3' }, search, filter), count, list)));
  draw();
}
