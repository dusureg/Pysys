/**
 * <admin>/js/views/dashboard.js  -  Dashboard
 * KPIs, ratings card, profitability by type, client list with private links.
 * Loaded by: admin page
 */
'use strict';

/* =====================================================================
   Dashboard
   ===================================================================== */
async function loadStore() {
  const settings = await loadSettings();
  const files = (await listDir('data/private')).filter((f) => f.type === 'file' && /^[\w-]+\.json$/.test(f.name) && f.name !== 'vault.json' && f.name !== 'settings.json' && f.name !== 'team.json');
  const items = [], bad = [];
  await pool(files, 5, async (f) => {
    const id = f.name.slice(0, -5);
    try { items.push(await loadPrivate(id)); } catch (e) { bad.push({ id, msg: e.message }); }
  });
  items.sort((a, b) => String(b.rec.createdAt).localeCompare(String(a.rec.createdAt)) || b.rec.id.localeCompare(a.rec.id));
  store = { settings, items, bad, q: '' };
  return store;
}
const allProjects = () => store.items.flatMap((x) => x.rec.projects);

async function renderDashboard(token, keep) {
  if (!store) {
    mount(notice(t('dash.loading'), t('dash.loadingSub'), 'info', { spinner: true }));
    try { await loadStore(); } catch (e) {
      if (token !== routeToken) return;
      return mount(notice(t('err.load'), e.message, 'bad', { actions: [h('button', { class: 'btn', type: 'button', onclick: () => route() }, t('act.retry'))] }));
    }
    if (token !== routeToken) return;
  }
  CUR = store.settings.currency || CUR;
  if (ed && !ed.dirty) ed = null;          // reopen records from the freshly loaded store
  drawDashboard();
}

function drawDashboard() {
  const money$ = canMoney(), projects = allProjects(), tot = finTotals(projects);
  const active = projects.filter((p) => projState(p) !== 'completed'), late = active.filter((p) => { const n = daysUntil(p.dueDate); return n !== null && n < 0; });
  const list = h('div', { class: 'list' });
  const drawList = () => {
    const q = (store.q || '').trim().toLowerCase();
    const rows = store.items.filter((x) => !q || [x.rec.id, x.rec.client.name, x.rec.client.phone, ...x.rec.projects.map((p) => p.sku + ' ' + skuRef(x.rec, p) + ' ' + (p.title || ''))].join(' ').toLowerCase().includes(q));
    list.replaceChildren(...(rows.length ? rows.map(clientItem) : [h('p', { class: 'empty' }, store.items.length ? t('dash.noMatch') : t('dash.empty'))]),
      ...store.bad.map((b) => h('p', { class: 'msg bad' }, t('dash.badFile', { id: b.id }), b.msg)));
  };
  const search = h('input', { id: 'dashSearch', type: 'search', placeholder: t('dash.search'), 'aria-label': t('dash.search'), value: store.q || '', dir: 'auto' });
  search.addEventListener('input', () => { store.q = search.value; drawList(); });

  // profitability by project type
  const byType = new Map();
  for (const p of projects) { const k = p.type || '—'; if (!byType.has(k)) byType.set(k, { name: L(p.typeName) || k, list: [] }); byType.get(k).list.push(p); }
  const typeRows = [...byType.entries()].map(([k, v]) => { const f = finTotals(v.list); return h('tr', {}, h('td', {}, h('span', { class: 'mono' }, k), ' ', L(v.name)), h('td', { class: 'n' }, nf(v.list.length)), h('td', { class: 'n' }, money(f.price)), h('td', { class: 'n' }, money(f.cogs)), h('td', { class: 'n' }, money(f.gross)), h('td', { class: 'n' }, pct(f.grossMargin))); });

  mount(h('section', { class: 'stack' },
    h('div', { class: 'page-head' }, h('h1', {}, t('nav.dashboard')),
      h('div', { class: 'actions' }, encBadge(),
        h('button', { class: 'btn', type: 'button', id: 'btnRefresh', onclick: () => { store = null; route(); } }, t('act.refresh')),
        can('reports') ? h('a', { class: 'btn', href: '#reports/overview', id: 'btnDashOverview' }, t('ovw.open')) : null,
        h('a', { class: 'btn', href: '#reports', id: 'btnDashReports' }, t('nav.reports')),
        h('a', { class: 'btn primary', href: '#new', id: 'btnNewClient', 'data-edit': 'clients' }, t('dash.newClient')))),
    kpis(
      kpi(t('dash.active'), nf(active.length), '', late.length ? t('dash.lateN', { n: nf(late.length) }) : null),
      kpi(t('dash.clients'), nf(store.items.length)),
      money$ ? kpi(t('fin.revenue'), money(tot.price), '', t('dash.clientsN', { n: nf(store.items.length) })) : null,
      money$ ? kpi(t('fin.collected'), money(tot.paid), '', pct(tot.collected)) : null,
      money$ ? kpi(t('fin.remaining'), money(tot.remaining), tot.remaining > 0 ? 'warn' : '') : null,
      money$ ? kpi(t('fin.cogs'), money(tot.cogs)) : null,
      money$ ? kpi(t('fin.gross'), money(tot.gross), profitCls(tot.gross), t('fin.margin') + ' ' + pct(tot.grossMargin)) : null,
      money$ ? kpi(t('fin.net'), money(tot.net), profitCls(tot.net), t('fin.margin') + ' ' + pct(tot.netMargin)) : null,
      money$ ? kpi(t('fin.opex'), money(tot.opex)) : null),
    can('ratings') ? ratingsCard() : null,
    canAny(['inventory', 'logistics', 'suppliers']) ? opsCard() : null,
    money$ && byType.size ? h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', {}, t('dash.byType'))),
      h('div', { class: 'tablewrap' }, h('table', { class: 'tbl' },
        h('thead', {}, h('tr', {}, h('th', {}, t('dash.type')), h('th', { class: 'n' }, t('dash.projects')), h('th', { class: 'n' }, t('fin.revenue')), h('th', { class: 'n' }, t('fin.cogs')), h('th', { class: 'n' }, t('fin.gross')), h('th', { class: 'n' }, t('fin.margin')))),
        h('tbody', {}, typeRows)))) : null,
    h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', {}, t('dash.clients')), h('div', { style: 'flex:1;max-width:320px' }, search)), list)));
  drawList();
}

function clientItem(it) {
  const rec = it.rec, link = shareLink(rec.id), tot = finTotals(rec.projects);
  return h('div', { class: 'item' },
    h('div', { class: 'item-top' }, h('strong', { class: 'mono' }, rec.id), h('span', { dir: 'auto' }, rec.client.name), encBadge()),
    rec.client.phone ? h('span', { class: 'muted small ltr' }, rec.client.phone) : null,
    rec.projects.length ? h('div', { class: 'chips' }, rec.projects.map((p) => h('span', { class: 'chip' }, h('span', { class: 'mono', title: skuRef(rec, p) }, p.sku), statusBadge(projState(p)), timeBadge(p.dueDate, projState(p) === 'completed')))) : h('span', { class: 'small muted' }, t('dash.noProjects')),
    canMoney() ? h('div', { class: 'small' }, h('span', { class: 'muted' }, t('fin.remaining') + ': '), h('strong', {}, money(tot.remaining))) : null,
    h('code', { class: 'link' }, link),
    h('div', { class: 'actions' },
      h('a', { class: 'btn small primary', href: '#manage/' + rec.id }, t('act.edit')),
      rec.projects.length ? h('a', { class: 'btn small', href: '#progress/' + rec.id + '/0' }, t('pg.update')) : null,
      rec.projects.length ? h('a', { class: 'btn small', href: '#contract/' + rec.id + '/0' }, t('ct.open')) : null,
      copyBtn(() => link, 'small'),
      h('a', { class: 'btn small', href: link, target: '_blank', rel: 'noopener noreferrer' }, t('act.open'))));
}
