/**
 * <admin>/js/views/inventory.js  -  Inventory Management System
 * Every material with its stock, alerts per item (out, low, expired / expiring, above maximum, no supplier), quick receive / use / stock-take,
 * a "to order" list grouped by supplier, and the form of one material with its movement history.
 * Loaded by: admin page
 */
'use strict';

/* =====================================================================
   Inventory
   ===================================================================== */
let invSel = { q: '', cat: '', sup: '', brand: '', show: 'all', view: '', group: 'category', sort: 'status', dir: 1, closed: [] };      // view '' = table on a wide screen, cards on a phone
let invMove = null;                                  // { id, type } while the quick receive / use / count box of one material is open
const INV_SHOWS = ['all', 'attention', 'out', 'low', 'expiring', 'ok'];
const INV_GROUPS = ['category', 'status', 'supplier', 'none'], INV_SORTS = ['status', 'name', 'category', 'stock', 'value', 'supplier'], INV_LEVEL = { bad: 0, warn: 1, info: 2, ok: 3 };
const invView = () => invSel.view || (innerWidth < 760 ? 'cards' : 'table');
const stockRatio = (it) => { const target = num(it.max) > 0 ? num(it.max) : num(it.min) * 2; return target > 0 ? num(it.qty) / target : num(it.qty) > 0 ? 1 : 0; };
// how two materials compare for each sort column; ties fall back to the name
const INV_CMP = {
  name: (a, b) => a.it.name.localeCompare(b.it.name, locale()),
  status: (a, b) => INV_LEVEL[a.s.level] - INV_LEVEL[b.s.level] || INV_CMP.name(a, b),
  category: (a, b) => BOM_CATS.indexOf(a.it.category) - BOM_CATS.indexOf(b.it.category) || INV_CMP.name(a, b),
  stock: (a, b) => stockRatio(a.it) - stockRatio(b.it) || INV_CMP.name(a, b),
  value: (a, b) => a.s.value - b.s.value || INV_CMP.name(a, b),
  supplier: (a, b) => supName(a.it.supplierId).localeCompare(supName(b.it.supplierId), locale()) || INV_CMP.name(a, b),
};
const blankItem = () => normItem({ category: 'board', unit: 'pcs' });
const invMatch = (s, mode) => mode === 'all' || (mode === 'attention' && s.attention) || (mode === 'out' && s.flags.includes('out')) || (mode === 'low' && s.flags.includes('low'))
  || (mode === 'expiring' && (s.flags.includes('expiring') || s.flags.includes('expired'))) || (mode === 'ok' && !s.attention);

async function renderInventory(token, sub) {
  if (!(await ensureOps(token, OPS_NAMES))) return;
  if (sub) return opsOpen('inventory', sub, blankItem, '#inventory', 'nav.inventory', drawItemForm);
  drawInventory();
}

/* ---------------- the list ---------------- */
function moveBox(it) {
  const type = invMove.type;
  const qty = h('input', { type: 'number', id: 'mvQty', min: 0, step: 'any', inputmode: 'decimal', value: type === 'count' ? it.qty : '', autocomplete: 'off' });
  const note = h('input', { type: 'text', id: 'mvNote', maxlength: 200, placeholder: t('inv.mv.note'), 'aria-label': t('inv.mv.note'), dir: 'auto', autocomplete: 'off' });
  const go = h('button', { class: 'btn primary small', type: 'button', id: 'btnMvApply' }, t('inv.mv.apply.' + type));
  const apply = async () => {
    const a = Number(qty.value);
    if (qty.value === '' || !(a >= 0) || (type !== 'count' && !(a > 0))) return toast(t('inv.mv.bad'), 'bad');
    go.disabled = true;
    try { await moveItem(it.id, type, a, note.value, ''); invMove = null; toast(t('inv.mv.done'), 'ok'); drawInventory(); } catch (e) { go.disabled = false; toast(e.message, 'bad'); }
  };
  go.onclick = apply; [qty, note].forEach((x) => x.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); apply(); } }));
  return h('div', { class: 'mvbox' }, h('label', {}, t('inv.mv.q.' + type) + ' (' + t('bom.unit.' + it.unit) + ')', qty), h('label', {}, t('inv.mv.note'), note),
    h('div', { class: 'actions' }, go, h('button', { class: 'btn small', type: 'button', id: 'btnMvCancel', onclick: () => { invMove = null; drawInventory(); } }, t('act.cancel'))));
}
const mvBtn = (it, type, labelKey) => {
  const open = invMove && invMove.id === it.id;
  return h('button', { class: 'btn small' + (open && invMove.type === type ? ' primary' : ''), type: 'button', 'data-mv': type, 'data-edit': 'inventory', 'aria-label': t(labelKey) + ': ' + it.name,
    onclick: () => { invMove = open && invMove.type === type ? null : { id: it.id, type }; drawInventory(); } }, t(labelKey));
};
function itemCard(it, s) {
  const sup = opsFind('suppliers', it.supplierId), target = num(it.max) > 0 ? num(it.max) : num(it.min) * 2, ratio = target > 0 ? num(it.qty) / target : num(it.qty) > 0 ? 1 : 0;
  const open = invMove && invMove.id === it.id, mv = (type, labelKey) => mvBtn(it, type, labelKey);
  const d = daysUntil(it.expiry);
  return h('div', { class: 'item inv-item ' + s.level, 'data-id': it.id, 'data-level': s.level },
    h('div', { class: 'item-top' }, prodThumb(it), h('strong', { dir: 'auto' }, it.name), it.code ? h('span', { class: 'mono muted small' }, it.code) : null, h('span', { class: 'chip' }, t('bom.cat.' + it.category)), matBrand(it.brandId) ? h('span', { class: 'chip', 'data-brand': it.brandId, dir: 'auto' }, matBrand(it.brandId)) : null),
    h('div', { class: 'inv-qty' }, h('strong', { class: 'inv-big', 'data-qty': it.qty }, qtyText(it.qty, it.unit)), barFill(ratio, s.level === 'bad' ? 'bad' : s.level === 'warn' ? 'warn' : 'ok')),
    h('div', { class: 'chips' }, stockBadges(s)),
    h('div', { class: 'chips' },
      num(it.min) > 0 ? h('span', { class: 'chip' }, t('inv.minShort', { q: qtyText(it.min, it.unit) })) : null, num(it.max) > 0 ? h('span', { class: 'chip' }, t('inv.maxShort', { q: qtyText(it.max, it.unit) })) : null,
      s.ordered > 0 ? h('span', { class: 'chip' }, t('inv.onOrder', { q: qtyText(s.ordered, it.unit) })) : null,
      s.suggest > 0 ? h('span', { class: 'chip sugg' }, t('inv.suggest', { q: qtyText(s.suggest, it.unit) })) : null,
      num(it.cost) > 0 ? h('span', { class: 'chip' }, t('inv.valueShort', { v: money(s.value) })) : null,
      it.location ? h('span', { class: 'chip', dir: 'auto' }, t('inv.at', { l: it.location })) : null,
      it.expiry ? h('span', { class: 'chip' }, t('inv.expires', { d: fmtDay(it.expiry) })) : null),
    sup ? h('p', { class: 'small' }, h('span', { class: 'muted' }, t('inv.supplier') + ': '), h('a', { href: '#suppliers/' + sup.id, dir: 'auto' }, sup.name)) : null,
    h('div', { class: 'actions' }, mv('in', 'inv.receive'), mv('out', 'inv.use'), mv('count', 'inv.count'), h('a', { class: 'btn small', href: '#inventory/' + it.id }, t('act.edit'))),
    open ? moveBox(it) : null);
}
function orderCard(info) {
  const need = info.filter((x) => x.s.lowish).sort((a, b) => a.it.name.localeCompare(b.it.name, locale()));
  if (!need.length) return null;
  const groups = [...groupBy(need, (x) => x.it.supplierId || '').entries()].sort((a, b) => (a[0] === '' ? 1 : b[0] === '' ? -1 : supName(a[0]).localeCompare(supName(b[0]), locale())));
  let total = 0;
  const blocks = groups.map(([sid, rows]) => {
    const sup = opsFind('suppliers', sid), est = sum(rows, (x) => x.s.suggest * num(x.it.cost)); total += est;
    return h('div', { class: 'ordergrp', 'data-sup': sid },
      h('div', { class: 'item-top' }, h('strong', { dir: 'auto' }, sup ? sup.name : t('inv.noSupplierGroup')), sup ? h('a', { class: 'clink', href: '#suppliers/' + sup.id }, t('act.open')) : null,
        sup && telHref(sup.phone) ? h('a', { class: 'clink', href: telHref(sup.phone), dir: 'ltr' }, sup.phone) : null, sup && waTarget(sup.phone, sup.whatsapp) ? extA(waTarget(sup.phone, sup.whatsapp), t('sup.whatsapp')) : null),
      h('div', { class: 'tablewrap' }, h('table', { class: 'tbl' },
        h('thead', {}, h('tr', {}, h('th', {}, t('rp.col.item')), h('th', { class: 'n' }, t('inv.col.stock')), h('th', { class: 'n' }, t('inv.col.min')), h('th', { class: 'n' }, t('inv.col.ordered')), h('th', { class: 'n' }, t('inv.col.order')), h('th', { class: 'n' }, t('inv.col.est')))),
        h('tbody', {}, rows.map((x) => h('tr', { 'data-id': x.it.id }, h('td', { dir: 'auto' }, x.it.name), h('td', { class: 'n' }, qtyText(x.it.qty, x.it.unit)), h('td', { class: 'n' }, num(x.it.min) > 0 ? qtyText(x.it.min, x.it.unit) : '—'),
          h('td', { class: 'n' }, x.s.ordered > 0 ? qtyText(x.s.ordered, x.it.unit) : '—'), h('td', { class: 'n' }, h('strong', {}, x.s.suggest > 0 ? qtyText(x.s.suggest, x.it.unit) : '—')),
          h('td', { class: 'n' }, num(x.it.cost) > 0 && x.s.suggest > 0 ? money(x.s.suggest * num(x.it.cost)) : '—')))))));
  });
  return h('div', { class: 'card stack-sm', id: 'invOrder' }, h('div', { class: 'card-head' }, h('h2', {}, t('inv.orderTitle', { n: nf(need.length) })),
    h('a', { class: 'btn small', href: '#reports/reorder', id: 'btnOrderPrint' }, t('inv.printOrder'))), h('p', { class: 'hint' }, t('inv.orderHint')), blocks,
    total > 0 ? h('p', { class: 'small' }, h('strong', {}, t('inv.orderTotal') + ': ' + money(total))) : null);
}
/* ---------------- the table ---------------- */
const levelBar = (s) => (s.level === 'bad' ? 'bad' : s.level === 'warn' ? 'warn' : 'ok');
function invRow(it, s, showCat) {
  const sup = opsFind('suppliers', it.supplierId), ratio = stockRatio(it), badges = stockBadges(s);
  return h('tr', { class: 'inv-item ' + s.level, 'data-id': it.id, 'data-level': s.level },
    h('th', { scope: 'row', class: 'c-name' }, h('div', { class: 'item-top' }, prodThumb(it), h('strong', { dir: 'auto' }, it.name), it.code ? h('span', { class: 'mono muted small' }, it.code) : null),
      matBrand(it.brandId) ? h('div', { class: 'small muted', dir: 'auto', 'data-brand': it.brandId }, matBrand(it.brandId)) : null,
      it.location ? h('div', { class: 'small muted', dir: 'auto' }, t('inv.at', { l: it.location })) : null, it.expiry ? h('div', { class: 'small muted' }, t('inv.expires', { d: fmtDay(it.expiry) })) : null),
    showCat ? h('td', { class: 'c-cat' }, t('bom.cat.' + it.category)) : null,
    h('td', { class: 'n c-stock' }, h('strong', { class: 'inv-big', 'data-qty': it.qty }, qtyText(it.qty, it.unit)), barFill(ratio, levelBar(s))),
    h('td', { class: 'n c-min' }, num(it.min) > 0 ? qtyText(it.min, it.unit) : '—'), h('td', { class: 'n c-max' }, num(it.max) > 0 ? qtyText(it.max, it.unit) : '—'),
    h('td', { class: 'n c-ord' }, s.ordered > 0 ? qtyText(s.ordered, it.unit) : '—'),
    h('td', { class: 'c-status' }, h('div', { class: 'chips' }, badges.length ? badges : h('span', { class: 'muted small' }, t('inv.statusOk')), s.suggest > 0 ? h('span', { class: 'chip sugg' }, t('inv.suggest', { q: qtyText(s.suggest, it.unit) })) : null)),
    h('td', { class: 'n c-cost' }, num(it.cost) > 0 ? money(it.cost) : '—'), h('td', { class: 'n c-value' }, num(it.cost) > 0 ? money(s.value) : '—'),
    h('td', { class: 'c-sup' }, sup ? h('a', { href: '#suppliers/' + sup.id, dir: 'auto' }, sup.name) : h('span', { class: 'muted' }, '—')),
    h('td', { class: 'c-act' }, h('div', { class: 'actions' }, mvBtn(it, 'in', 'inv.receive'), mvBtn(it, 'out', 'inv.use'), mvBtn(it, 'count', 'inv.count'),
      h('a', { class: 'btn small', href: '#inventory/' + it.id, 'aria-label': t('act.edit') + ': ' + it.name }, t('act.edit')))));
}
function invTable(groups, rows, redraw) {
  const showCat = invSel.group !== 'category', ncols = showCat ? 11 : 10;
  const sortBy = (key) => { if (invSel.sort === key) invSel.dir *= -1; else { invSel.sort = key; invSel.dir = key === 'value' ? -1 : 1; } redraw(); };
  const th = (key, labelKey, cls) => { const on = invSel.sort === key; return h('th', { scope: 'col', class: cls || '', 'aria-sort': on ? (invSel.dir > 0 ? 'ascending' : 'descending') : 'none' },
    h('button', { class: 'thbtn', type: 'button', 'data-sort': key, onclick: () => sortBy(key) }, t(labelKey), on ? h('span', { class: 'sortmark', 'aria-hidden': 'true' }, invSel.dir > 0 ? '▲' : '▼') : null)); };
  const plain = (labelKey, cls) => h('th', { scope: 'col', class: cls || '' }, t(labelKey));
  const head = h('thead', {}, h('tr', {}, th('name', 'inv.col.material', 'c-name'), showCat ? th('category', 'inv.category', 'c-cat') : null, th('stock', 'inv.col.stock', 'n c-stock'), plain('inv.col.min', 'n c-min'), plain('inv.col.max', 'n c-max'),
    plain('inv.col.ordered', 'n c-ord'), th('status', 'inv.col.status', 'c-status'), plain('inv.cost', 'n c-cost'), th('value', 'inv.col.value', 'n c-value'), th('supplier', 'inv.supplier', 'c-sup'),
    h('th', { scope: 'col', class: 'c-act' }, h('span', { class: 'sr' }, t('inv.col.actions')))));
  const bodies = groups.map((g) => {
    const closed = !!g.key && invSel.closed.includes(g.key), value = sum(g.rows, (x) => x.s.value);
    const head1 = g.key ? h('tr', { class: 'grp', 'data-grp': g.key }, h('th', { colspan: ncols, scope: 'colgroup' },
      h('button', { class: 'grpbtn', type: 'button', 'aria-expanded': String(!closed), title: t('inv.toggleGroup'), onclick: () => { invSel.closed = closed ? invSel.closed.filter((k) => k !== g.key) : invSel.closed.concat(g.key); redraw(); } },
        h('strong', { dir: 'auto' }, g.label), h('span', { class: 'chip' }, t('inv.grpCount', { n: nf(g.rows.length) })), value > 0 ? h('span', { class: 'small muted' }, money(value)) : null))) : null;
    const body = closed ? [] : g.rows.flatMap((x) => [invRow(x.it, x.s, showCat)].concat(invMove && invMove.id === x.it.id ? [h('tr', { class: 'mvrow' }, h('td', { colspan: ncols }, moveBox(x.it)))] : []));
    return h('tbody', { 'data-grp': g.key }, head1, body);
  });
  const total = sum(rows, (x) => x.s.value);
  const foot = h('tfoot', {}, h('tr', {}, h('th', { colspan: showCat ? 8 : 7, scope: 'row' }, t('inv.totalRow', { n: nf(rows.length) })), h('td', { class: 'n c-value' }, h('strong', {}, money(total))), h('td', { colspan: 2 })));
  return h('table', { class: 'tbl invtbl', id: 'invTable' }, h('caption', { class: 'sr' }, t('inv.tblCaption')), head, bodies, foot);
}
function invGroups(rows) {
  const g = invSel.group;
  if (g === 'none') return [{ key: '', label: '', rows }];
  const keyOf = { category: (x) => (BOM_CATS.includes(x.it.category) ? x.it.category : 'other'), status: (x) => x.s.level, supplier: (x) => x.it.supplierId || '' }[g];
  const labelOf = { category: (k) => t('bom.cat.' + k), status: (k) => t('inv.grp.' + k), supplier: (k) => (k ? supName(k) || k : t('ops.noSupplier')) }[g];
  const m = groupBy(rows, keyOf);
  const order = g === 'category' ? BOM_CATS : g === 'status' ? ['bad', 'warn', 'info', 'ok'] : [...m.keys()].sort((a, b) => (a === '' ? 1 : b === '' ? -1 : supName(a).localeCompare(supName(b), locale())));
  return order.filter((k) => m.has(k)).map((k) => ({ key: g + ':' + k, label: labelOf(k), rows: m.get(k) }));
}
const invCards = (groups) => groups.map((g) => h('section', { class: 'invgrp', 'data-grp': g.key },
  g.key ? h('h3', { class: 'invgrp-h' }, h('span', { dir: 'auto' }, g.label), h('span', { class: 'chip' }, t('inv.grpCount', { n: nf(g.rows.length) }))) : null,
  h('div', { class: 'list' }, g.rows.map((x) => itemCard(x.it, x.s)))));

function drawInventory() {
  const all = opsList('inventory'), sm = stockSummary(all), list = h('div', { id: 'invList' }), count = h('p', { class: 'hint', id: 'invCount', role: 'status' });
  const dirBtn = h('button', { class: 'btn iconbtn', type: 'button', id: 'invDir' });
  const draw = () => {
    const q = invSel.q.trim().toLowerCase();
    const rows = sm.info.filter(({ it, s }) => invMatch(s, invSel.show) && (!invSel.cat || it.category === invSel.cat) && (!invSel.sup || (invSel.sup === '-' ? !it.supplierId : it.supplierId === invSel.sup)) && (!invSel.brand || (invSel.brand === '-' ? !it.brandId : it.brandId === invSel.brand))
      && (!q || [it.id, it.code, it.name, it.location, supName(it.supplierId), matBrand(it.brandId)].join(' ').toLowerCase().includes(q))).sort((a, b) => INV_CMP[invSel.sort](a, b) * invSel.dir);
    const table = invView() === 'table';
    count.textContent = t('inv.shown', { n: nf(rows.length), total: nf(all.length) });
    dirBtn.textContent = invSel.dir > 0 ? '▲' : '▼'; dirBtn.setAttribute('aria-label', t(invSel.dir > 0 ? 'inv.dirAsc' : 'inv.dirDesc')); dirBtn.title = dirBtn.getAttribute('aria-label'); sortSel.value = invSel.sort;
    list.className = table ? 'tablewrap invwrap' : 'invcards';
    list.replaceChildren(...(rows.length ? (table ? [invTable(invGroups(rows), rows, draw)] : invCards(invGroups(rows))) : [h('p', { class: 'empty' }, all.length ? t('inv.noMatch') : t('inv.empty'))]));
  };
  dirBtn.onclick = () => { invSel.dir *= -1; draw(); };
  const search = h('input', { id: 'invSearch', type: 'search', placeholder: t('inv.search'), 'aria-label': t('inv.search'), value: invSel.q, dir: 'auto' });
  search.addEventListener('input', () => { invSel.q = search.value; draw(); });
  const sel = (key, id, opts, label) => selectEl(opts, invSel[key], (v) => { invSel[key] = v; draw(); }, id, label);
  const sortSel = selectEl(INV_SORTS.map((k) => [k, t('inv.sort.' + k)]), invSel.sort, (v) => { invSel.sort = v; invSel.dir = v === 'value' ? -1 : 1; draw(); }, 'invSort', t('inv.sortLabel'));
  const views = h('div', { class: 'segtoggle', role: 'group', 'aria-label': t('inv.viewLabel') }, ['table', 'cards'].map((v) => h('button', { class: 'btn' + (invView() === v ? ' primary' : ''), type: 'button', id: 'invView-' + v,
    'aria-pressed': String(invView() === v), onclick: () => { invSel.view = v; drawInventory(); } }, t('inv.view.' + v))));
  const bar = h('div', { class: 'card stack-sm' }, h('div', { class: 'filters4' }, search,
    sel('show', 'invShow', INV_SHOWS.map((k) => [k, t('inv.show.' + k)]), t('inv.showLabel')),
    sel('cat', 'invCat', [['', t('inv.allCats')]].concat(BOM_CATS.map((c) => [c, t('bom.cat.' + c)])), t('inv.category')),
    sel('sup', 'invSup', [['', t('inv.allSuppliers')], ['-', t('ops.noSupplier')]].concat(opsList('suppliers').map((s) => [s.id, s.name])), t('inv.supplier'))),
    h('div', { class: 'filters4 invbar2' }, sel('group', 'invGroup', INV_GROUPS.map((k) => [k, t('inv.group.' + k)]), t('inv.groupLabel')), h('div', { class: 'inline-pair' }, sortSel, dirBtn), views,
      brandList().length ? sel('brand', 'invBrandFilter', [['', t('inv.allBrands')], ['-', t('brand.none')]].concat(brandList().map((b) => [b.id, b.name])), t('inv.brand')) : null), count, list);
  mount(h('section', { class: 'stack', id: 'invScreen' },
    opsHead('inv.title', opsRefresh('btnRefreshOps'), h('a', { class: 'btn', href: '#import/inventory', id: 'btnImp-inventory', 'data-edit': 'inventory' }, t('imp.btn')), h('a', { class: 'btn', href: '#reports/inventory', id: 'btnInvPrint' }, t('ops.printReport')), h('a', { class: 'btn primary', href: '#inventory/new', id: 'btnNewItem', 'data-edit': 'inventory' }, t('inv.add'))),
    h('p', { class: 'hint' }, t('inv.hint')),
    kpis(kpi(t('inv.k.items'), nf(sm.n)), kpi(t('inv.k.attention'), nf(sm.attention), sm.attention ? 'warn' : ''), kpi(t('inv.k.out'), nf(sm.out), sm.out ? 'neg' : ''), kpi(t('inv.k.low'), nf(sm.low), sm.low ? 'warn' : ''),
      kpi(t('inv.k.expiring'), nf(sm.expiring), sm.expiring ? 'warn' : ''), kpi(t('inv.k.value'), money(sm.value))),
    orderCard(sm.info), bar));
  draw();
}

/* ---------------- one material ---------------- */
function validateItem(r) {
  if (!r.name) return t('inv.val.name');
  if (r.code && opsList('inventory').some((x) => x.id !== r.id && x.code && x.code.toLowerCase() === r.code.toLowerCase())) return t('inv.val.code', { c: r.code });
  if (num(r.qty) < 0) return t('inv.val.qty');
  for (const k of ['min', 'max', 'reorderQty', 'cost']) if (r[k] !== '' && num(r[k]) < 0) return t('inv.val.neg');
  if (num(r.max) > 0 && num(r.min) > num(r.max)) return t('inv.val.minmax');
  if (r.expiry && !parseDay(r.expiry)) return t('inv.val.date');
  return '';
}
function saveItem() {
  const e = opsEd, r = e.rec, origQty = e.isNew ? 0 : num(e.orig.qty);
  r.name = String(r.name || '').trim(); r.code = String(r.code || '').trim(); r.location = String(r.location || '').trim(); r.qty = r3(num(r.qty));
  const bad = validateItem(r); if (bad) { toast(bad, 'bad'); return; }
  // the quantity is only ever changed through a recorded movement, on top of what the file holds now (another device may have used some meanwhile)
  return opsSaveOpen((rec, old) => {
    const wanted = rec.qty;
    if (old) { rec.moves = old.moves; rec.qty = old.qty; if (r3(wanted) !== r3(origQty) && r3(wanted) !== r3(old.qty)) applyMove(rec, 'count', wanted, t('inv.editNote'), ''); } else {
      rec.moves = []; rec.qty = 0; if (wanted > 0) applyMove(rec, 'in', wanted, t('inv.openNote'), '');
    }
  });
}
function drawItemForm() {
  const e = opsEd, r = e.rec; e.save = saveItem;
  const f = (labelKey, prop, id, o) => fld(labelKey, tin(r, prop, Object.assign({ id, max: 120 }, o || {})));
  const numF = (labelKey, prop, id, hint) => fld(labelKey, tin(r, prop, { id, type: 'number', num: true, min: 0, step: 'any', mode: 'decimal' }), hint);
  const preview = h('div', { class: 'card stack-sm', id: 'invPreview', 'aria-live': 'polite' });
  e.live = () => {
    const s = stockInfo(Object.assign({}, r, { qty: num(r.qty) }));
    preview.replaceChildren(h('div', { class: 'chips' }, stockBadges(s).length ? stockBadges(s) : h('span', { class: 'badge done' }, t('inv.flag.ok'))),
      h('p', { class: 'small' }, h('span', { class: 'muted' }, t('inv.stockValue') + ': '), h('strong', {}, money(s.value)),
        s.suggest > 0 ? [' · ', h('span', { class: 'muted' }, t('inv.suggestLabel') + ': '), h('strong', {}, qtyText(s.suggest, r.unit))] : null));
  };
  e.live();
  const form = h('div', { class: 'card stack-sm' },
    h('div', { class: 'grid2' }, f('inv.name', 'name', 'invName', { req: true }), codeField('inventory', r, 'invCode', 'inv.code')),
    h('div', { class: 'grid2' }, fld('inv.category', selectEl(BOM_CATS.map((c) => [c, t('bom.cat.' + c)]), r.category, (v) => { r.category = v; touch(); }, 'invCategory')),
      fld('inv.unit', selectEl(BOM_UNITS.map((u) => [u, t('bom.unit.' + u)]), r.unit, (v) => { r.unit = v; touch(); }, 'invUnit'))),
    h('div', { class: 'grid3' }, numF(e.isNew ? 'inv.qtyOpening' : 'inv.qty', 'qty', 'invQty', e.isNew ? null : 'inv.qtyHint'), numF('inv.min', 'min', 'invMin', 'inv.minHint'), numF('inv.max', 'max', 'invMax')),
    h('div', { class: 'grid2' }, numF('inv.reorderQty', 'reorderQty', 'invReorder'), numF('inv.cost', 'cost', 'invCost')),
    h('div', { class: 'grid2' }, fld('inv.supplier', supplierSel(r.supplierId, (v) => { r.supplierId = v; touch(); }, 'invSupplier')), fld('inv.brand', brandSel(r.brandId, (v) => { r.brandId = v; touch(); }, 'invBrand'), 'inv.brandHint')),
    h('div', { class: 'grid2' }, f('inv.location', 'location', 'invLocation', { max: 80 }), fld('inv.expiry', dateOpt(r, 'expiry', 'invExpiry', t('inv.expiry')), 'inv.expiryHint')),
    fld('inv.notes', tarea(r, 'notes', { id: 'invNotes', rows: 2, max: 1000 })));
  const hist = e.isNew ? null : h('div', { class: 'card stack-sm', id: 'invHistory' }, h('h2', {}, t('inv.history')),
    r.moves.length ? h('div', { class: 'tablewrap' }, h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, h('th', {}, t('rp.col.date')), h('th', {}, t('inv.col.type')), h('th', { class: 'n' }, t('inv.col.change')), h('th', { class: 'n' }, t('inv.col.balance')), h('th', {}, t('inv.mv.note')))),
      h('tbody', {}, r.moves.map((m) => h('tr', {}, h('td', {}, fmtDateTime(m.at)), h('td', {}, t('inv.mt.' + m.type)), h('td', { class: 'n' }, (m.delta > 0 ? '+' : '') + nf(m.delta, { maximumFractionDigits: 3 })),
        h('td', { class: 'n' }, nf(m.qty, { maximumFractionDigits: 3 })), h('td', { dir: 'auto' }, m.note)))))) : h('p', { class: 'muted small' }, t('inv.noHistory')),
    h('p', { class: 'hint' }, t('inv.historyHint', { n: nf(MOVES_KEEP) })));
  const del = e.isNew ? null : h('div', { class: 'actions' }, opsDeleteBtn(() => opsDeleteOpen(t('inv.delConfirm', { n: r.name || e.id }), '#inventory')), h('span', { class: 'hint' }, t('inv.delHint')));
  opsFormPage('#inventory', 'nav.inventory', e.isNew ? t('inv.new') : r.name || e.id, form, productImageField(r), preview, hist, del);
}
