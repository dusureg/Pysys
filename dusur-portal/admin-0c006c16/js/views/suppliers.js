/**
 * <admin>/js/views/suppliers.js  -  Supply Chain Management: the supplier directory
 * List with search and filters (phone, WhatsApp, e-mail, website, location, map link, address), add / edit / delete one supplier, and what each one supplies.
 * Loaded by: admin page
 */
'use strict';

/* =====================================================================
   Supply chain: suppliers
   ===================================================================== */
let supSel = { q: '', cat: '', show: 'active' };
const blankSupplier = () => normSupplier({ category: 'boards' });
const supCount = (id) => ({ mats: opsList('inventory').filter((x) => x.supplierId === id).length, open: opsList('logistics').filter((s) => s.supplierId === id && lgOpen(s)).length });

async function renderSuppliers(token, sub) {
  if (!(await ensureOps(token, OPS_NAMES))) return;
  if (sub) return opsOpen('suppliers', sub, blankSupplier, '#suppliers', 'nav.suppliers', drawSupplierForm);
  drawSuppliers();
}

function supplierCard(s) {
  const c = supCount(s.id);
  return h('div', { class: 'item sup-item', 'data-id': s.id },
    h('div', { class: 'item-top' }, h('strong', { dir: 'auto' }, s.name), h('span', { class: 'mono muted small' }, s.id), s.code ? h('span', { class: 'chip mono', 'data-code': '1' }, s.code) : null, h('span', { class: 'badge pending' }, t('sup.cat.' + s.category)),
      s.active ? null : h('span', { class: 'badge late' }, t('sup.inactive'))),
    s.contact ? h('span', { class: 'muted small', dir: 'auto' }, t('sup.contact') + ': ' + s.contact) : null,
    contactBlock(s),
    h('div', { class: 'chips' }, h('span', { class: 'chip' }, t('sup.nMaterials', { n: nf(c.mats) })), h('span', { class: 'chip' }, t('sup.nOpen', { n: nf(c.open) })),
      s.leadDays !== '' ? h('span', { class: 'chip' }, t('sup.leadN', { n: nf(s.leadDays) })) : null, s.terms ? h('span', { class: 'chip', dir: 'auto' }, s.terms) : null),
    h('div', { class: 'actions' }, h('a', { class: 'btn small primary', href: '#suppliers/' + s.id }, t('act.edit'))));
}
function drawSuppliers() {
  const all = opsList('suppliers'), list = h('div', { class: 'list', id: 'supList' }), count = h('p', { class: 'hint', id: 'supCount', role: 'status' });
  const draw = () => {
    const q = supSel.q.trim().toLowerCase();
    const rows = all.filter((s) => (supSel.show === 'all' || (supSel.show === 'active') === s.active) && (!supSel.cat || s.category === supSel.cat)
      && (!q || [s.id, s.code, s.name, s.contact, s.phone, s.phone2, s.email, s.website, s.location, s.address, s.link, s.notes].join(' ').toLowerCase().includes(q)))
      .sort((a, b) => a.name.localeCompare(b.name, locale()));
    count.textContent = t('sup.shown', { n: nf(rows.length), total: nf(all.length) });
    list.replaceChildren(...(rows.length ? rows.map(supplierCard) : [h('p', { class: 'empty' }, all.length ? t('sup.noMatch') : t('sup.empty'))]));
  };
  const search = h('input', { id: 'supSearch', type: 'search', placeholder: t('sup.search'), 'aria-label': t('sup.search'), value: supSel.q, dir: 'auto' });
  search.addEventListener('input', () => { supSel.q = search.value; draw(); });
  const cat = selectEl([['', t('sup.allCats')]].concat(SUP_CATS.map((c) => [c, t('sup.cat.' + c)])), supSel.cat, (v) => { supSel.cat = v; draw(); }, 'supCat', t('sup.category'));
  const show = selectEl([['active', t('sup.showActive')], ['inactive', t('sup.showInactive')], ['all', t('sup.showAll')]], supSel.show, (v) => { supSel.show = v; draw(); }, 'supShow', t('sup.showLabel'));
  const act = all.filter((s) => s.active), withMat = new Set(opsList('inventory').map((x) => x.supplierId).filter(Boolean));
  mount(h('section', { class: 'stack', id: 'supScreen' },
    opsHead('sup.title', opsRefresh('btnRefreshOps'), h('a', { class: 'btn', href: '#import/suppliers', id: 'btnImp-suppliers', 'data-edit': 'suppliers' }, t('imp.btn')), h('a', { class: 'btn', href: '#reports/suppliers', id: 'btnSupPrint' }, t('ops.printReport')), h('a', { class: 'btn primary', href: '#suppliers/new', id: 'btnNewSup', 'data-edit': 'suppliers' }, t('sup.add'))),
    h('p', { class: 'hint' }, t('sup.hint')),
    kpis(kpi(t('sup.k.total'), nf(all.length), '', t('sup.k.active', { n: nf(act.length) })), kpi(t('sup.k.cats'), nf(new Set(all.map((s) => s.category)).size)),
      kpi(t('sup.k.withMats'), nf(all.filter((s) => withMat.has(s.id)).length)), kpi(t('sup.k.open'), nf(opsList('logistics').filter((s) => lgOpen(s) && s.supplierId).length))),
    h('div', { class: 'card stack-sm' }, h('div', { class: 'filters3' }, search, cat, show), count, list)));
  draw();
}

/* ---------------- one supplier ---------------- */
function validateSupplier(r) {
  if (!r.name.trim()) return t('sup.val.name');
  if (opsList('suppliers').some((x) => x.id !== r.id && x.name.trim().toLowerCase() === r.name.trim().toLowerCase())) return t('sup.val.dup', { n: r.name.trim() });
  if (codeClash('suppliers', r)) return t('code.dup', { c: r.code });
  if (!phoneOk(r.phone) || !phoneOk(r.phone2)) return t('sup.val.phone');
  if (!waOverrideOk(r.whatsapp)) return t('sup.val.wa');
  if (!emailOk(r.email.trim())) return t('sup.val.email');
  for (const [k, lab] of [['website', 'sup.website'], ['mapLink', 'sup.mapLink'], ['link', 'sup.link']]) if (r[k].trim() && !safeUrl(r[k])) return t('sup.val.url', { f: t(lab) });
  return '';
}
function saveSupplier() {
  const r = opsEd.rec;
  for (const k of ['name', 'code', 'contact', 'phone', 'phone2', 'whatsapp', 'email', 'location', 'address', 'terms']) r[k] = String(r[k] || '').trim();
  const bad = validateSupplier(r); if (bad) { toast(bad, 'bad'); return; }
  for (const k of ['website', 'mapLink', 'link']) r[k] = safeUrl(r[k]);
  r.leadDays = onum(r.leadDays) === '' ? '' : Math.round(onum(r.leadDays));
  return opsSaveOpen();
}
function drawSupplierForm() {
  const e = opsEd, r = e.rec; e.save = saveSupplier; e.live = null;
  const c = e.isNew ? { mats: 0, open: 0 } : supCount(e.id), mats = e.isNew ? [] : opsList('inventory').filter((x) => x.supplierId === e.id), ships = e.isNew ? [] : opsList('logistics').filter((s) => s.supplierId === e.id);
  const f = (labelKey, prop, id, o) => fld(labelKey, tin(r, prop, Object.assign({ id, max: 120 }, o || {})));
  const form = h('div', { class: 'card stack-sm' },
    h('div', { class: 'grid2' }, f('sup.name', 'name', 'supName', { req: true }),
      fld('sup.category', selectEl(SUP_CATS.map((k) => [k, t('sup.cat.' + k)]), r.category, (v) => { r.category = v; touch(); }, 'supCategory'))),
    h('div', { class: 'grid2' }, codeField('suppliers', r, 'supCode')),
    h('div', { class: 'grid2' }, f('sup.contact', 'contact', 'supContact'), f('sup.terms', 'terms', 'supTerms', { max: 200 })),
    h('div', { class: 'grid2' }, f('sup.phone', 'phone', 'supPhone', { type: 'tel', dir: 'ltr', mode: 'tel', max: 40 }), f('sup.phone2', 'phone2', 'supPhone2', { type: 'tel', dir: 'ltr', mode: 'tel', max: 40 })),
    waField(r, 'supWhatsapp', 'supWaPreview', 'phone', 'supPhone'),
    h('div', { class: 'grid2' }, f('sup.email', 'email', 'supEmail', { type: 'email', dir: 'ltr', mode: 'email' }), f('sup.website', 'website', 'supWebsite', { dir: 'ltr', max: 300, ph: 'www.example.com', mode: 'url' })),
    h('div', { class: 'grid2' }, f('sup.location', 'location', 'supLocation'), f('sup.mapLink', 'mapLink', 'supMapLink', { dir: 'ltr', max: 500, ph: 'https://maps.app.goo.gl/…', mode: 'url' })),
    h('div', { class: 'grid2' }, f('sup.link', 'link', 'supLink', { dir: 'ltr', max: 500, ph: 'https://…', mode: 'url' }), f('sup.leadDays', 'leadDays', 'supLead', { type: 'number', num: true, min: 0, step: 1, mode: 'numeric' })),
    fld('sup.address', tarea(r, 'address', { id: 'supAddress', rows: 2, max: 300 })),
    fld('sup.notes', tarea(r, 'notes', { id: 'supNotes', rows: 3, max: 2000 })),
    h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'supActive', checked: r.active, onchange: (ev) => { r.active = ev.target.checked; touch(); } }), h('span', {}, t('sup.activeLabel'))));
  const rel = e.isNew ? null : h('div', { class: 'card stack-sm', id: 'supRelated' },
    h('h2', {}, t('sup.related')),
    mats.length ? h('div', { class: 'stack-sm' }, h('strong', { class: 'small' }, t('sup.materialsFrom', { n: nf(mats.length) })),
      h('div', { class: 'chips' }, mats.map((m) => h('a', { class: 'chip', href: '#inventory/' + m.id, dir: 'auto' }, m.name)))) : h('p', { class: 'muted small' }, t('sup.noMaterials')),
    ships.length ? h('div', { class: 'stack-sm' }, h('strong', { class: 'small' }, t('sup.shipmentsFrom', { n: nf(ships.length) })),
      h('div', { class: 'chips' }, ships.map((s) => h('a', { class: 'chip', href: '#logistics/' + s.id, dir: 'auto' }, s.id + ' · ' + (s.title || ''))))) : h('p', { class: 'muted small' }, t('sup.noShipments')));
  const del = e.isNew ? null : h('div', { class: 'actions' }, opsDeleteBtn(() => {
    if (c.mats || ships.length) return toast(t('sup.inUse', { m: nf(c.mats), s: nf(ships.length) }), 'bad');
    return opsDeleteOpen(t('sup.delConfirm', { n: r.name || e.id }), '#suppliers');
  }), h('span', { class: 'hint' }, t('sup.delHint')));
  opsFormPage('#suppliers', 'nav.suppliers', e.isNew ? t('sup.new') : r.name || e.id, form, rel, del);
}
