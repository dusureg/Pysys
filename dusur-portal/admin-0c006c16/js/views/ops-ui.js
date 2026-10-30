/**
 * <admin>/js/views/ops-ui.js  -  shared pieces of the Supply chain, Inventory and Logistics screens
 * Loading the sealed files with a spinner, the page header, the form shell (open / save / delete one record with the unsaved-changes bar),
 * contact links (call, WhatsApp, e-mail, website, map), stock and shipment badges, the dashboard card.
 * Loaded by: admin page
 */
'use strict';

/* =====================================================================
   Operations screens: shared UI
   ===================================================================== */
async function ensureOps(token, names) {
  const need = names.filter((n) => !ops[n]);
  if (!need.length && session.settings) return token === routeToken;
  mount(notice(t('ops.loading'), t('ops.loadingSub'), 'info', { spinner: true }));
  try { await loadSettings(); await Promise.all(need.map((n) => loadOps(n))); refreshOpsAlerts(); } catch (e) {
    if (token === routeToken) mount(notice(t('err.load'), e.message, 'bad', { actions: [h('button', { class: 'btn', type: 'button', onclick: () => route() }, t('act.retry'))] }));
    return false;
  }
  return token === routeToken;
}
const opsHead = (titleKey, ...actions) => h('div', { class: 'page-head' }, h('h1', {}, t(titleKey)), h('div', { class: 'actions' }, encBadge(), actions));
const opsRefresh = (id) => h('button', { class: 'btn', type: 'button', id, onclick: () => { OPS_NAMES.concat('expenses').forEach((n) => { delete ops[n]; }); route(); } }, t('act.refresh'));
const opsNotFound = (back, backKey) => mount(notice(t('ops.notFound'), t('ops.notFoundSub'), 'bad', { actions: [h('a', { class: 'btn', href: back }, t(backKey))] }));
const optList = (items, label) => [['', label]].concat(items.map((x) => [x.id, x.name || x.title || x.id]));

/* ---------------- form shell ---------------- */
function opsTouch() { if (!opsEd) return; opsEd.dirty = true; syncOpsBar(); if (opsEd.live) opsEd.live(); if (opsEd.codeRefresh) opsEd.codeRefresh(); }
// the code field of a form: empty means "give it the next code from the formula" (the placeholder shows which one)
function codeField(name, r, id, labelKey) {
  const input = tin(r, 'code', { id, dir: 'ltr', max: 40 });
  const hint = () => { input.placeholder = r.code ? '' : t('code.auto', { c: codeNext(name, r, opsList(name).filter((x) => x.id !== r.id)) }); };
  hint(); opsEd.codeRefresh = hint;
  return fld(labelKey || 'code.label', input, 'code.hint');
}
function syncOpsBar() {
  const e = opsEd; if (!e || !e.bar) return;
  e.bar.state.textContent = e.saving ? t('act.saving') : e.dirty ? t('ed.unsaved') : e.savedAt ? t('ed.savedAt', { t: fmtDateTime(e.savedAt) }) : t('ed.noChanges');
  e.bar.btn.disabled = !!e.saving || !(e.dirty || e.isNew);
}
function opsBar(onSave) {
  const state = h('span', { class: 'small muted', role: 'status' });
  const btn = h('button', { class: 'btn primary', type: 'button', id: 'btnSave', onclick: () => onSave() }, t('ops.save'));
  opsEd.bar = { state, btn }; syncOpsBar();
  return h('div', { class: 'savebar' }, state, btn);
}
// Open the form of one record (or come back to it after a language switch). blank() makes a new record; draw() paints the form from opsEd.rec.
function opsOpen(kind, sub, blank, backHash, backKey, draw) {
  const hash = '#' + kind + '/' + sub;
  if (!(opsEd && opsEd.kind === kind && opsEd.hash === hash)) {
    const isNew = sub === 'new', found = isNew ? null : opsFind(kind, sub);
    if (!isNew && !found) return opsNotFound(backHash, backKey);
    const rec = isNew ? blank() : clone(found);
    opsEd = { kind, hash, id: rec.id, rec, orig: clone(rec), isNew, dirty: false, saving: false, savedAt: null, bar: null, live: null, redraw: null };
  }
  opsEd.redraw = () => { const y = window.scrollY; draw(); window.scrollTo(0, y); };
  draw();
}
// Save the open record. adjust(rec, previous) may change it just before it is stored (previous = the copy in the file, null for a new record).
async function opsSaveOpen(adjust) {
  const e = opsEd; if (!e || e.saving) return;
  e.saving = true; syncOpsBar();
  try {
    await attFlush(e);                                                                                    // files added to the record go up first, so a record never points at a file that is not there
    const saved = await opsUpsert(e.kind, e.rec, e.isNew, adjust);
    try { await attAfter(e); } catch (_) { /* a file that could not be deleted is left behind, the record is saved */ }
    e.rec = clone(saved); e.orig = clone(saved); e.id = saved.id; e.dirty = false; e.savedAt = oiso(); e.saving = false;
    if (e.isNew) { e.isNew = false; e.hash = '#' + e.kind + '/' + saved.id; history.replaceState(null, '', e.hash); }
    toast(t('ops.saved'), 'ok'); e.redraw();
  } catch (err) { e.saving = false; syncOpsBar(); toast(err.message, 'bad'); }
}
async function opsDeleteOpen(confirmText, backHash) {
  const e = opsEd; if (!e || e.isNew || !confirm(confirmText)) return;
  try { await opsRemove(e.kind, e.id); for (const id of attIdsOf(e.orig)) await attDel(id); e.dirty = false; opsEd = null; toast(t('ops.deleted'), 'ok'); location.hash = backHash; } catch (err) { toast(err.message, 'bad'); }
}
const opsDeleteBtn = (onclick) => h('button', { class: 'btn danger', type: 'button', id: 'btnOpsDelete', onclick }, t('act.delete'));
// the permission area that guards each kind of record
const OPS_AREA = { suppliers: 'suppliers', inventory: 'inventory', logistics: 'logistics', expenses: 'finance' };
// A person with view-only rights sees the form but cannot change it: a disabled fieldset switches every field and button off, and there is no save bar.
function opsFormPage(backHash, backKey, titleText, ...blocks) {
  const ro = readOnly(OPS_AREA[opsEd.kind] || opsEd.kind);
  mount(h('section', { class: 'stack opsform' + (ro ? ' readonly' : '') }, h('div', {}, h('a', { class: 'back', href: backHash }, t(backKey))),
    h('div', { class: 'page-head' }, h('h1', { dir: 'auto' }, titleText), h('div', { class: 'actions' }, encBadge(), opsEd.isNew ? null : shareButton(() => opsShareText(opsEd.kind, opsEd.rec), 'btnShare', 'btn small'), opsEd.isNew || !can('audit') ? null : h('a', { class: 'btn small', id: 'btnRecHistory', href: '#audit/' + encodeURIComponent(opsEd.id), title: t('aud.historyOf') }, t('nav.audit')))), ro ? h('p', { class: 'msg info', id: 'roNote' }, t('perm.readOnlyNote')) : null,
    h('fieldset', { class: 'stack rofield', disabled: ro }, blocks), ro ? null : opsBar(opsEd.save)));
}

/* ---------------- links: call, WhatsApp, e-mail, website, map ---------------- */
// the WhatsApp field of a supplier or a client: a number or a link typed by hand, with the address that will be opened shown under it (made from the phone number until something is typed)
function waField(rec, id, previewId, phoneKey, phoneId, labelKey) {
  const prev = h('a', { class: 'clink small', id: previewId, target: '_blank', rel: 'noopener noreferrer', dir: 'ltr' });
  const show = () => {
    const a = waTarget(rec[phoneKey], rec.whatsapp), bad = !waOverrideOk(rec.whatsapp);
    prev.textContent = bad ? t('wa.invalid') : a || t('wa.none'); prev.className = 'clink small' + (bad ? ' bad' : ''); if (a && !bad) prev.setAttribute('href', a); else prev.removeAttribute('href');
    prev.dataset.state = bad ? 'bad' : String(rec.whatsapp || '').trim() ? 'custom' : a ? 'auto' : 'none';
  };
  const inp = tin(rec, 'whatsapp', { id, dir: 'ltr', max: 200, mode: 'url', ph: t('wa.ph'), on: show });
  const onPhone = (e) => { if (!prev.isConnected) { document.removeEventListener('input', onPhone); return; } if (e.target && e.target.id === phoneId) setTimeout(show); };       // the phone changes: the address made from it changes
  document.addEventListener('input', onPhone);
  show();
  return h('div', { class: 'stack-sm' }, fld(labelKey || 'sup.whatsappField', inp), h('p', { class: 'small' }, h('span', { class: 'muted' }, t('wa.opens') + ' '), prev), h('p', { class: 'hint' }, t('wa.hint')));
}
const extA = (href, text, extra) => h('a', Object.assign({ class: 'clink', href, target: '_blank', rel: 'noopener noreferrer' }, extra || {}), text);
function contactBlock(s) {
  const row = (labelKey, ...nodes) => h('div', { class: 'crow' }, h('span', { class: 'clabel' }, t(labelKey)), h('span', { class: 'cval' }, nodes.filter(Boolean)));
  const rows = [];
  for (const [k, ph] of [['sup.phone', s.phone], ['sup.phone2', s.phone2]]) {
    if (!ph) continue;
    const wa = k === 'sup.phone' ? waTarget(ph, s.whatsapp) : waHref(ph);                                  // the first phone carries the hand-made WhatsApp target, if any
    rows.push(row(k, telHref(ph) ? h('a', { class: 'clink', href: telHref(ph), dir: 'ltr' }, ph) : h('bdi', { dir: 'ltr' }, ph), wa ? extA(wa, t('sup.whatsapp'), { 'data-wa': s.whatsapp ? 'custom' : 'auto' }) : null));
  }
  if (!s.phone && s.whatsapp && waTarget('', s.whatsapp)) rows.push(row('sup.whatsapp', extA(waTarget('', s.whatsapp), s.whatsapp.length > 40 ? urlHost(s.whatsapp) : s.whatsapp, { dir: 'ltr', 'data-wa': 'custom' })));
  if (s.email) rows.push(row('sup.email', mailHref(s.email) ? h('a', { class: 'clink', href: mailHref(s.email), dir: 'ltr' }, s.email) : h('bdi', { dir: 'ltr' }, s.email)));
  if (safeUrl(s.website)) rows.push(row('sup.website', extA(safeUrl(s.website), urlHost(safeUrl(s.website)), { dir: 'ltr' })));
  if (s.location || safeUrl(s.mapLink)) rows.push(row('sup.location', s.location ? h('bdi', { dir: 'auto' }, s.location) : null, safeUrl(s.mapLink) ? extA(safeUrl(s.mapLink), t('sup.openMap')) : null));
  if (safeUrl(s.link)) rows.push(row('sup.link', extA(safeUrl(s.link), urlHost(safeUrl(s.link)), { dir: 'ltr' })));
  if (s.address) rows.push(row('sup.address', h('bdi', { dir: 'auto' }, s.address)));
  return rows.length ? h('div', { class: 'contact' }, rows) : h('span', { class: 'muted small' }, t('sup.noContact'));
}

/* ---------------- badges ---------------- */
const FLAG_BADGE = { out: 'late', expired: 'late', low: 'progress', expiring: 'progress', over: 'pending', nosupplier: 'pending', nomin: 'pending' };
const stockBadges = (s) => s.flags.filter((f) => f !== 'nomin' || !s.attention).map((f) => h('span', { class: 'badge ' + FLAG_BADGE[f], 'data-flag': f }, t('inv.flag.' + f)));
const LG_BADGE = { planned: 'pending', in_progress: 'progress', blocked: 'late', completed: 'done', cancelled: 'pending' };
const lgBadge = (s) => h('span', { class: 'badge ' + LG_BADGE[lgState(s)], 'data-state': lgState(s) }, t('lg.st.' + lgState(s)));
// the number a stock figure shows: "12.5 m²"
const qtyText = (q, unit) => nf(num(q), { maximumFractionDigits: 3 }) + ' ' + t('bom.unit.' + (BOM_UNITS.includes(unit) ? unit : 'pcs'));
const dateOpt = (rec, key, id, label) => h('input', { type: 'date', id, value: rec[key] || '', 'aria-label': label, onchange: (e) => { rec[key] = e.target.value; touch(); } });
const supplierSel = (value, onChange, id) => {
  // inactive suppliers are not offered for new work, but one that is already chosen stays visible so an old record still reads correctly
  const list = opsList('suppliers').filter((x) => x.active || x.id === value).sort((a, b) => a.name.localeCompare(b.name, locale()));
  return selectEl([['', t('ops.noSupplier')]].concat(list.map((x) => [x.id, x.name + (x.active ? '' : ' (' + t('sup.inactive') + ')')])), value || '', onChange, id);
};

/* ---------------- dashboard card ---------------- */
function opsCard() {
  const box = h('div', { class: 'card stack-sm', id: 'opsCard' }, h('div', { class: 'card-head' }, h('h2', {}, t('ops.cardTitle'))), h('p', { class: 'muted small' }, t('ops.loading')));
  const fill = () => {
    const a = opsAlerts, inv = opsList('inventory'), lg = opsList('logistics');
    box.replaceChildren(h('div', { class: 'card-head' }, h('h2', {}, t('ops.cardTitle'))),
      kpis(kpi(t('ops.k.stock'), nf(a.stock || 0), a.stock ? 'warn' : '', t('ops.k.stockSub', { n: nf(inv.length) })), kpi(t('ops.k.late'), nf(a.late || 0), a.late ? 'neg' : ''),
        kpi(t('ops.k.blocked'), nf(a.blocked || 0), a.blocked ? 'warn' : ''), kpi(t('ops.k.open'), nf(lg.filter(lgOpen).length), '', t('ops.k.suppliers', { n: nf(opsList('suppliers').length) }))),
      h('div', { class: 'actions' }, h('a', { class: 'btn small', href: '#inventory', id: 'btnCardInv' }, t('nav.inventory')), h('a', { class: 'btn small', href: '#logistics', id: 'btnCardLg' }, t('nav.logistics')),
        h('a', { class: 'btn small', href: '#suppliers', id: 'btnCardSup' }, t('nav.suppliers'))));
  };
  loadAllOps().then(fill, () => { box.replaceChildren(h('div', { class: 'card-head' }, h('h2', {}, t('ops.cardTitle'))), h('p', { class: 'muted small' }, t('ops.cardFail'))); });
  return box;
}
