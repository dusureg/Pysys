/**
 * <admin>/js/views/import.js  -  Import screen (#import/<section>): bring a CSV, Excel or JSON file into Inventory, Suppliers, Shipments or Expenses
 * Choose the file, check which column is which (guessed from the column names, in English or Arabic), see exactly what would happen to every row
 * (new, updated, skipped, rejected with the reason), then import it all in one saved change. Rejected rows can be downloaded to be corrected.
 * Loaded by: admin page
 */
'use strict';

/* =====================================================================
   Import
   ===================================================================== */
const IMP_TARGETS = ['inventory', 'suppliers', 'logistics', 'expenses'];
const IMP_AREA = { inventory: 'inventory', suppliers: 'suppliers', logistics: 'logistics', expenses: 'finance' };
const IMP_TITLE = { inventory: 'nav.inventory', suppliers: 'nav.suppliers', logistics: 'nav.logistics', expenses: 'imp.t.expenses' };
const IMP_BACK = { inventory: '#inventory', suppliers: '#suppliers', logistics: '#logistics', expenses: '#finance' };
let imp = null;                      // the open import: { target, file, table, header, map, mode, result }

// every way a value of a list may be written: our own key, its name in both languages, and a few common words
function enumMap(vals, prefix, extra) {
  const m = new Map();
  for (const v of vals) {
    m.set(wordKey(v), v);
    for (const lg of ['en', 'ar']) { const lab = window.__I18N[lg][prefix + v]; if (lab) m.set(wordKey(lab), v); }
    const mine = CUSTOM_CATS.direct.concat(CUSTOM_CATS.indirect).find((x) => x.id === v);          // a category of your own: both of its names
    if (mine) for (const nm of [mine.en, mine.ar]) if (nm) m.set(wordKey(nm), v);
    for (const a of (extra && extra[v]) || []) m.set(wordKey(a), v);
  }
  return m;
}
const IMP_UNIT_WORDS = { pcs: ['pc', 'pcs', 'piece', 'pieces', 'each', 'قطعة', 'قطع', 'حبة'], sheet: ['sheet', 'sheets', 'لوح', 'لوحة', 'الواح', 'ألواح'], m: ['m', 'meter', 'meters', 'metre', 'metres', 'متر', 'م'],
  m2: ['m2', 'sqm', 'م2', 'متر مربع'], kg: ['kg', 'kgs', 'kilo', 'kilogram', 'كجم', 'كيلو', 'كيلوجرام'], l: ['l', 'lt', 'liter', 'litre', 'لتر'], set: ['set', 'sets', 'طقم', 'مجموعة'] };
const IMP_CAT_WORDS = { board: ['panel', 'mdf', 'plywood', 'boards', 'لوح', 'الواح', 'ألواح', 'خشب'], edge: ['edgeband', 'edgetape', 'edge band', 'حافة', 'حواف', 'شريط'], hardware: ['fittings', 'fitting', 'hinges', 'مفصلات', 'خردوات', 'هاردوير'],
  finish: ['paint', 'varnish', 'glue', 'دهان', 'طلاء', 'تشطيب', 'غراء'], glass: ['mirror', 'زجاج', 'مرايا'], accessory: ['accessories', 'اكسسوار', 'اكسسوارات'] };
const IMP_SUPCAT_WORDS = { boards: ['board', 'panels', 'ألواح', 'الواح'], edge: ['edge band', 'حواف'], hardware: ['fittings', 'هاردوير', 'خردوات'], transport: ['shipping', 'نقل', 'شحن'], tools: ['tool', 'ادوات', 'أدوات', 'معدات'], services: ['service', 'خدمات'] };
const IMP_KIND_WORDS = { inbound: ['in', 'incoming', 'receiving', 'وارد'], outbound: ['out', 'delivery', 'صادر', 'تسليم'], transfer: ['move', 'internal', 'نقل', 'تحويل'] };
const IMP_FIN_WORDS = { direct: ['مباشر', 'مباشرة'], indirect: ['غير مباشر', 'غيرمباشر', 'عامة', 'overhead'] };

// the fields of each section: k = key in the record, lab = label, kind, req = required, al = column names that mean this field (any case, English or Arabic), ex = sample value for the template
function impFields(target) {
  const T = (k, lab, al, o) => Object.assign({ k, lab, kind: 'text', max: 120, al }, o || {});
  if (target === 'inventory') return [
    T('name', 'inv.name', ['name', 'material', 'item', 'itemname', 'product', 'description', 'اسم', 'الاسم', 'الخامة', 'الصنف', 'المادة', 'البند'], { req: 1, ex: 'MDF 18 mm white' }),
    T('code', 'inv.code', ['code', 'sku', 'itemcode', 'materialcode', 'الكود', 'كود', 'رمز', 'الرمز'], { max: 40, ex: 'MDF18-W' }),
    T('category', 'inv.category', ['category', 'cat', 'type', 'group', 'الفئة', 'التصنيف', 'النوع'], { kind: 'enum', map: () => enumMap(BOM_CATS, 'bom.cat.', IMP_CAT_WORDS), def: 'other', ex: 'board' }),
    T('unit', 'inv.unit', ['unit', 'uom', 'unitofmeasure', 'الوحدة', 'وحدة'], { kind: 'enum', map: () => enumMap(BOM_UNITS, 'bom.unit.', IMP_UNIT_WORDS), def: 'pcs', ex: 'sheet' }),
    T('qty', 'inv.qty', ['qty', 'quantity', 'stock', 'onhand', 'instock', 'balance', 'الكمية', 'كمية', 'المخزون', 'الرصيد'], { kind: 'num', ex: '40' }),
    T('min', 'inv.min', ['min', 'minimum', 'minqty', 'minstock', 'reorderlevel', 'الحدالادنى', 'الحدالأدنى', 'حدادنى'], { kind: 'num', ex: '20' }),
    T('max', 'inv.max', ['max', 'maximum', 'maxqty', 'الحدالاقصى', 'الحدالأقصى', 'حداقصى'], { kind: 'num', ex: '100' }),
    T('reorderQty', 'inv.reorderQty', ['reorderqty', 'reorderquantity', 'orderqty', 'كميةاعادةالطلب'], { kind: 'num', ex: '30' }),
    T('cost', 'inv.cost', ['cost', 'unitcost', 'price', 'unitprice', 'التكلفة', 'السعر', 'سعرالوحدة', 'تكلفةالوحدة'], { kind: 'num', ex: '850' }),
    T('supplierId', 'inv.supplier', ['supplier', 'vendor', 'المورد', 'مورد'], { kind: 'sup', ex: 'Al Nour Boards' }),
    T('location', 'inv.location', ['location', 'place', 'rack', 'shelf', 'bin', 'المكان', 'الموقع', 'الرف'], { max: 80, ex: 'Rack A1' }),
    T('expiry', 'inv.expiry', ['expiry', 'expirydate', 'expires', 'انتهاء', 'تاريخالانتهاء'], { kind: 'date', ex: '2027-12-31' }),
    T('notes', 'inv.notes', ['notes', 'note', 'remarks', 'comment', 'comments', 'ملاحظات', 'ملاحظة'], { max: 1000, ex: '' }),
  ];
  if (target === 'suppliers') return [
    T('name', 'sup.name', ['name', 'supplier', 'suppliername', 'company', 'vendor', 'اسم', 'الاسم', 'المورد', 'الشركة'], { req: 1, ex: 'Al Nour Boards' }),
    T('code', 'code.label', ['code', 'suppliercode', 'الكود', 'كود', 'رمز'], { max: 40, ex: 'SUP-BRD-001' }),
    T('category', 'sup.category', ['category', 'cat', 'type', 'الفئة', 'التصنيف', 'النوع'], { kind: 'enum', map: () => enumMap(SUP_CATS, 'sup.cat.', IMP_SUPCAT_WORDS), def: 'other', ex: 'boards' }),
    T('contact', 'sup.contact', ['contact', 'contactperson', 'person', 'المسؤول', 'جهةالاتصال', 'الشخص'], { max: 100, ex: 'Hassan Ali' }),
    T('phone', 'sup.phone', ['phone', 'mobile', 'tel', 'telephone', 'number', 'الهاتف', 'الموبايل', 'رقمالهاتف', 'تليفون', 'محمول'], { max: 40, ex: '0100 123 4567' }),
    T('phone2', 'sup.phone2', ['phone2', 'mobile2', 'secondphone', 'otherphone', 'هاتف2', 'الهاتفالثاني'], { max: 40, ex: '' }),
    T('whatsapp', 'sup.whatsappField', ['whatsapp', 'wa', 'واتساب', 'الواتساب'], { max: 200, ex: '' }),
    T('email', 'sup.email', ['email', 'mail', 'emailaddress', 'البريد', 'ايميل', 'البريدالالكتروني'], { max: 120, ex: 'sales@example.com' }),
    T('website', 'sup.website', ['website', 'web', 'site', 'url', 'الموقعالالكتروني', 'الموقع الإلكتروني', 'موقعويب'], { max: 300, ex: 'www.example.com' }),
    T('location', 'sup.location', ['location', 'city', 'area', 'المدينة', 'المنطقة', 'المكان'], { max: 120, ex: '10th of Ramadan' }),
    T('mapLink', 'sup.mapLink', ['maplink', 'map', 'googlemaps', 'رابطالخريطة', 'الخريطة'], { max: 500, ex: '' }),
    T('link', 'sup.link', ['link', 'otherlink', 'رابط'], { max: 500, ex: '' }),
    T('address', 'sup.address', ['address', 'العنوان', 'عنوان'], { max: 300, ex: '' }),
    T('terms', 'sup.terms', ['terms', 'paymentterms', 'الشروط', 'شروطالدفع'], { max: 200, ex: '30 days' }),
    T('leadDays', 'sup.leadDays', ['leaddays', 'leadtime', 'deliverydays', 'مدةالتوريد', 'ايامالتوريد'], { kind: 'int', ex: '5' }),
    T('notes', 'sup.notes', ['notes', 'note', 'remarks', 'ملاحظات', 'ملاحظة'], { max: 2000, ex: '' }),
    T('active', 'sup.activeLabel', ['active', 'status', 'enabled', 'فعال', 'نشط', 'الحالة'], { kind: 'bool', ex: 'yes' }),
  ];
  if (target === 'logistics') return [
    T('title', 'lg.name', ['title', 'name', 'shipment', 'description', 'العنوان', 'الاسم', 'الشحنة', 'الوصف'], { req: 1, ex: 'Boards from Al Nour' }),
    T('code', 'code.label', ['code', 'shipmentcode', 'الكود', 'كود', 'رمز'], { max: 40, ex: '' }),
    T('kind', 'lg.kindLabel', ['kind', 'type', 'direction', 'النوع', 'الاتجاه'], { kind: 'enum', map: () => enumMap(LG_KINDS, 'lg.kind.', IMP_KIND_WORDS), def: 'inbound', ex: 'inbound' }),
    T('supplierId', 'lg.supplier', ['supplier', 'vendor', 'المورد', 'مورد'], { kind: 'sup', ex: 'Al Nour Boards' }),
    T('ref', 'lg.ref', ['ref', 'reference', 'po', 'ponumber', 'invoice', 'المرجع', 'رقمالطلب'], { max: 60, ex: 'PO-1021' }),
    T('carrier', 'lg.carrier', ['carrier', 'transporter', 'courier', 'shippingcompany', 'الناقل', 'شركةالشحن'], { max: 100, ex: '' }),
    T('tracking', 'lg.tracking', ['tracking', 'trackingnumber', 'awb', 'رقمالتتبع', 'التتبع'], { max: 80, ex: '' }),
    T('from', 'lg.from', ['from', 'origin', 'source', 'من', 'المصدر'], { ex: '' }),
    T('to', 'lg.to', ['to', 'destination', 'الى', 'إلى', 'الوجهة'], { ex: 'Workshop' }),
    T('eta', 'lg.eta', ['eta', 'date', 'expected', 'expecteddate', 'duedate', 'التاريخ', 'الموعد', 'تاريخالوصول'], { kind: 'date', ex: '2026-11-05' }),
    T('cost', 'lg.cost', ['cost', 'freight', 'shippingcost', 'التكلفة', 'تكلفةالشحن'], { kind: 'num', ex: '1500' }),
    T('notes', 'lg.notes', ['notes', 'note', 'remarks', 'ملاحظات'], { max: 1500, ex: '' }),
  ];
  return [
    T('date', 'exp.date', ['date', 'day', 'التاريخ', 'تاريخ'], { req: 1, kind: 'date', ex: '2026-10-01' }),
    T('name', 'exp.name', ['name', 'description', 'expense', 'item', 'details', 'البند', 'الوصف', 'المصروف', 'البيان'], { req: 1, ex: 'Workshop rent' }),
    T('amount', 'exp.amount', ['amount', 'total', 'value', 'cost', 'price', 'المبلغ', 'القيمة', 'الاجمالي', 'الإجمالي'], { req: 1, kind: 'num', ex: '12000' }),
    T('kind', 'fin.type', ['kind', 'type', 'costtype', 'نوعالتكلفة', 'النوع'], { kind: 'enum', map: () => enumMap(FIN_KINDS, 'fin.kind.', IMP_FIN_WORDS), def: 'indirect', ex: 'indirect' }),
    T('cat', 'fin.cat', ['category', 'cat', 'الفئة', 'التصنيف', 'البند'], { kind: 'cat', ex: 'rent' }),
    T('repeat', 'exp.repeat', ['repeat', 'recurring', 'frequency', 'التكرار'], { kind: 'enum', map: () => enumMap(REPEATS, 'exp.rep.', { none: ['once', 'one time', 'مرة'], monthly: ['month', 'شهري', 'شهريا'], yearly: ['year', 'annual', 'سنوي', 'سنويا'] }), def: 'none', ex: 'monthly' }),
    T('until', 'exp.until', ['until', 'end', 'enddate', 'حتى', 'تاريخالانتهاء'], { kind: 'date', ex: '' }),
    T('supplierId', 'exp.supplier', ['supplier', 'payee', 'vendor', 'المورد', 'المستفيد'], { kind: 'sup', ex: '' }),
    T('notes', 'exp.notes', ['notes', 'note', 'remarks', 'ملاحظات'], { max: 1000, ex: '' }),
  ];
}

/* ---------------- guessing which column is which ---------------- */
const impColName = (i) => { let s = '', n = i + 1; while (n > 0) { s = String.fromCharCode(65 + ((n - 1) % 26)) + s; n = Math.floor((n - 1) / 26); } return s; };
function impAutoMap(fields, header, cols) {
  const keys = cols.map((c) => (header ? wordKey(c) : '')), map = {}, used = new Set();
  const labelKeys = (f) => ['en', 'ar'].map((L) => wordKey(window.__I18N[L][f.lab] || '')).filter(Boolean);
  for (const pass of [0, 1]) for (const f of fields) {
    if (map[f.k] !== undefined) continue;
    const al = f.al.map(wordKey).concat(labelKeys(f));
    const i = keys.findIndex((k, ix) => k && !used.has(ix) && (pass === 0 ? al.includes(k) : al.some((a) => a.length >= 4 && (k.includes(a) || a.includes(k)) && k.length >= 3)));
    if (i >= 0) { map[f.k] = i; used.add(i); }
  }
  for (const f of fields) if (map[f.k] === undefined) map[f.k] = -1;
  return map;
}

/* ---------------- one row -> one record ---------------- */
function impSupplier(text) {
  const k = String(text).trim().toLowerCase(); if (!k) return '';
  const s = opsList('suppliers').find((x) => x.id.toLowerCase() === k || (x.code && x.code.toLowerCase() === k) || x.name.toLowerCase() === k);
  return s ? s.id : null;                                                 // null: named but not found
}
function impCell(f, raw, E) {                                               // -> { v, err, warn } ; v === undefined: nothing to set
  const s = String(raw == null ? '' : raw).trim(); if (!s) return {};
  if (f.kind === 'num') { const n = numFrom(s); return n === '' || n < 0 ? { err: t('imp.err.num', { f: t(f.lab), v: s.slice(0, 20) }) } : { v: n }; }
  if (f.kind === 'int') { const n = numFrom(s); return n === '' || n < 0 ? { err: t('imp.err.num', { f: t(f.lab), v: s.slice(0, 20) }) } : { v: Math.round(n) }; }
  if (f.kind === 'date') { const d = dayFrom(s); return d ? { v: d } : { err: t('imp.err.date', { f: t(f.lab), v: s.slice(0, 20) }) }; }
  if (f.kind === 'bool') { const b = boolFrom(s); return b === null ? { warn: t('imp.warn.value', { f: t(f.lab), v: s.slice(0, 20) }) } : { v: b }; }
  if (f.kind === 'enum') { const v = E[f.k].get(wordKey(s)); return v ? { v } : { v: f.def, warn: t('imp.warn.value', { f: t(f.lab), v: s.slice(0, 20) }) }; }
  if (f.kind === 'cat') return { v: s };                                    // resolved later: it depends on the kind
  if (f.kind === 'sup') { const id = impSupplier(s); return id === null ? { warn: t('imp.warn.supplier', { v: s.slice(0, 30) }) } : { v: id }; }
  return { v: s.slice(0, f.max || 120) };
}
function impCategory(kind, s) {                                             // an expense category written as key or as its name in either language
  const keys = expCats(kind), m = enumMap(keys, kind === 'direct' ? 'cat.' : 'icat.', { rent: ['إيجار', 'ايجار'], salaries: ['رواتب', 'مرتبات'], utilities: ['كهرباء', 'مياه', 'electricity', 'water'] });
  return m.get(wordKey(s)) || 'other';
}
const impMatch = {
  inventory: (r, items) => (r.code ? items.find((x) => x.code && x.code.toLowerCase() === r.code.toLowerCase()) : null) || (!r.code && r.name ? items.find((x) => x.name.toLowerCase() === r.name.toLowerCase()) : null) || null,
  suppliers: (r, items) => (r.code ? items.find((x) => x.code && x.code.toLowerCase() === r.code.toLowerCase()) : null) || (!r.code && r.name ? items.find((x) => x.name.toLowerCase() === r.name.toLowerCase()) : null) || null,
  logistics: (r, items) => (r.code ? items.find((x) => x.code && x.code.toLowerCase() === r.code.toLowerCase()) : null) || (r.ref ? items.find((x) => x.ref && x.ref.toLowerCase() === r.ref.toLowerCase()) : null) || (!r.code && !r.ref && r.title ? items.find((x) => x.title.toLowerCase() === r.title.toLowerCase()) : null) || null,
  expenses: (r, items) => items.find((x) => x.date === r.date && x.name.toLowerCase() === r.name.toLowerCase() && Math.abs(x.amount - num(r.amount)) < 0.005) || null,
};
// the whole file -> a plan: one entry per row with what will happen to it
function impPlan(st) {
  const fields = impFields(st.target), rows = st.table.rows.slice(st.header ? 1 : 0), items = opsList(st.target), E = {};
  for (const f of fields) if (f.kind === 'enum') E[f.k] = f.map();
  const seen = new Set(), plan = [];
  rows.forEach((cells, ix) => {
    const line = ix + 1 + (st.header ? 1 : 0), rec = {}, present = new Set(), errs = [], warns = [];
    for (const f of fields) {
      const col = st.map[f.k]; if (col === undefined || col < 0) continue;
      const c = impCell(f, cells[col], E);
      if (c.err) errs.push(c.err); if (c.warn) warns.push(c.warn);
      if (c.v !== undefined) { rec[f.k] = c.v; present.add(f.k); }
    }
    if (st.target === 'expenses') { if (present.has('cat')) rec.cat = impCategory(rec.kind || 'indirect', rec.cat); }
    if (st.target === 'expenses' && present.has('amount') && !(num(rec.amount) > 0)) errs.push(t('exp.val.amount'));
    const norm = OPS_NORM[st.target](Object.assign({}, rec));
    let action = errs.length ? 'bad' : 'add', existing = null;
    if (!errs.length) {
      const key = (rec.code || rec.name || rec.title || '').toLowerCase() + '|' + (st.target === 'expenses' ? rec.date + '|' + rec.amount : '');
      if (st.target !== 'expenses' && rec.code && seen.has('c:' + rec.code.toLowerCase())) { action = 'bad'; errs.push(t('imp.err.dupFile', { c: rec.code })); }
      else if (st.target === 'expenses' ? false : seen.has('k:' + key) && !rec.code) { action = 'bad'; errs.push(t('imp.err.dupFile', { c: rec.name || rec.title })); }
      else {
        if (rec.code) seen.add('c:' + rec.code.toLowerCase()); seen.add('k:' + key);
        existing = impMatch[st.target](Object.assign({}, norm, rec), items);
        action = existing ? (st.mode === 'upsert' && st.target !== 'expenses' ? 'update' : 'skip') : 'add';
        const miss = existing ? null : fields.find((f) => f.req && !present.has(f.k));         // a field is only required for a new record: an update that names the record by its code may leave the name out
        if (miss) { action = 'bad'; errs.push(t('imp.err.req', { f: t(miss.lab) })); }
      }
    }
    plan.push({ line, cells, rec, present, norm, existing, action, errs, warns });
  });
  return plan;
}
const impCounts = (plan) => ({ add: plan.filter((p) => p.action === 'add').length, update: plan.filter((p) => p.action === 'update').length, skip: plan.filter((p) => p.action === 'skip').length, bad: plan.filter((p) => p.action === 'bad').length, warn: plan.filter((p) => p.warns.length && p.action !== 'bad').length });

/* ---------------- doing it ---------------- */
// one saved change for the whole file. Fields that were not in the file (or left empty) keep their value when a record is updated.
async function impApply(st, plan) {
  const target = st.target, todo = plan.filter((p) => p.action === 'add' || p.action === 'update'); let added = 0, updated = 0;
  await opsMutate(target, (data) => {
    added = 0; updated = 0; const now = oiso();
    for (const p of todo) {
      const found = impMatch[target](Object.assign({}, p.norm, p.rec), data.items) || (p.existing ? data.items.find((x) => x.id === p.existing.id) : null);
      if (found && (st.mode === 'upsert' && target !== 'expenses')) {
        const old = found, merged = Object.assign({}, old); for (const k of p.present) if (k !== 'qty' && k !== 'code') merged[k] = p.rec[k];                // the code is what found the record: it keeps its own spelling (and the quantity goes through a stock movement)
        const n = OPS_NORM[target](merged); Object.assign(old, n, { id: found.id, createdAt: found.createdAt, updatedAt: now, moves: found.moves, steps: n.steps && n.steps.length ? n.steps : found.steps, lines: found.lines || n.lines });
        if (target === 'inventory' && p.present.has('qty') && r3(num(p.rec.qty)) !== r3(old.qty)) applyMove(old, 'count', num(p.rec.qty), t('imp.moveNote'), '');
        updated++;
      } else if (!found) {
        const n = OPS_NORM[target](Object.assign({}, p.rec)); n.id = opsNextId(target, data); n.createdAt = n.updatedAt = now;
        if (target === 'logistics') n.steps = lgStepsFor(n.kind);
        if (target === 'inventory') { n.moves = []; const q = r3(num(p.rec.qty)); n.qty = 0; if (q > 0) applyMove(n, 'in', q, t('imp.moveNote'), ''); }
        if (CODE_NAMES.includes(target) && !n.code) n.code = codeNext(target, n, data.items, new Date());
        data.items.push(n); added++;
      }
    }
  });
  const c = impCounts(plan);
  audit({ area: target, act: 'import', ref: target, title: st.file ? st.file.name : '', note: t('imp.auditNote', { a: nf(added), u: nf(updated), s: nf(c.skip), f: nf(c.bad) }) });
  return { added, updated, skipped: c.skip, bad: c.bad };
}

/* ---------------- the screen ---------------- */
const impEditable = () => IMP_TARGETS.filter((n) => can(IMP_AREA[n], PERM_EDIT));
async function renderImport(token, target) {
  const ok = impEditable();
  if (!ok.length) return mount(notice(t('perm.denied'), t('perm.deniedSub'), 'bad', { actions: [h('a', { class: 'btn', href: '#dashboard' }, t('nav.dashboard'))] }));
  if (target && !ok.includes(target)) target = '';
  if (!imp || imp.target !== target) imp = { target, file: null, table: null, header: true, map: {}, mode: 'add', result: null };
  if (target && !(await ensureOps(token, [target === 'expenses' ? 'expenses' : target, 'suppliers']))) return;
  drawImport();
}
function impTemplate(target) {
  const f = impFields(target); saveBlob(new Blob([toCsv([f.map((x) => t(x.lab)), f.map((x) => x.ex || '')])], { type: 'text/csv;charset=utf-8' }), 'import-' + target + '.csv');
}
function drawImport() {
  const st = imp, ok = impEditable();
  if (!st.target) {
    return mount(h('section', { class: 'stack', id: 'importScreen' }, h('div', { class: 'page-head' }, h('h1', {}, t('imp.title')), h('div', { class: 'actions' }, encBadge())),
      h('p', { class: 'hint' }, t('imp.intro')),
      h('div', { class: 'card stack-sm' }, h('h2', {}, t('imp.pick')), h('div', { class: 'actions' }, ok.map((n) => h('a', { class: 'btn', href: '#import/' + n, id: 'impPick-' + n }, t(IMP_TITLE[n])))))));
  }
  const fields = impFields(st.target), plan = st.table ? impPlan(st) : [], c = impCounts(plan), msg = h('p', { class: 'msg', id: 'impMsg', role: 'status', hidden: true });
  const file = h('input', { type: 'file', id: 'impFile', accept: '.csv,.tsv,.txt,.json,.xlsx,text/csv,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'aria-label': t('imp.file') });
  file.addEventListener('change', async () => {
    const f = file.files && file.files[0]; if (!f) return;
    msg.hidden = false; msg.className = 'msg'; msg.textContent = t('imp.reading');
    try {
      const table = await readTable(f); if (table.rows.length < 1) throw new Error(t('imp.empty'));
      st.file = f; st.table = table; st.result = null; st.header = true; st.map = impAutoMap(impFields(st.target), true, table.rows[0].map((x) => String(x))); drawImport();
    } catch (e) { msg.className = 'msg bad'; msg.textContent = e.message; }
  });
  const pickCard = h('div', { class: 'card stack-sm' }, h('div', { class: 'card-head' }, h('h2', {}, t('imp.s1', { n: t(IMP_TITLE[st.target]) }))),
    h('p', { class: 'hint' }, t('imp.fileHint')), h('div', { class: 'actions' }, file, h('button', { class: 'btn small', type: 'button', id: 'btnImpTemplate', onclick: () => impTemplate(st.target) }, t('imp.template'))), msg,
    ok.length > 1 ? h('div', { class: 'chips' }, ok.map((n) => h('a', { class: 'chip' + (n === st.target ? ' on' : ''), href: '#import/' + n, 'aria-current': n === st.target ? 'page' : null }, t(IMP_TITLE[n])))) : null);
  const body = [pickCard];
  if (st.table) {
    const first = st.table.rows[0].map((x) => String(x)), colsN = Math.max(...st.table.rows.slice(0, 50).map((r) => r.length)), cols = Array.from({ length: colsN }, (_, i) => (st.header ? first[i] || '' : '') || t('imp.col', { n: impColName(i) }));
    const sample = st.table.rows[st.header ? 1 : 0] || [];
    const colSel = (f) => selectEl([['-1', t('imp.notInFile')]].concat(cols.map((n, i) => [String(i), impColName(i) + ': ' + n])), String(st.map[f.k] === undefined ? -1 : st.map[f.k]), (v) => { st.map[f.k] = Number(v); drawImport(); }, 'impMap-' + f.k, t(f.lab));
    const sheetSel = st.table.sheets && st.table.sheets.length > 1 ? selectEl(st.table.sheets.map((s) => [s, s]), st.table.sheet, async (v) => { st.table.rows = await st.table.book.read(v); st.table.sheet = v; st.map = impAutoMap(impFields(st.target), st.header, st.table.rows[0].map((x) => String(x))); drawImport(); }, 'impSheet', t('imp.sheet')) : null;
    body.push(h('div', { class: 'card stack-sm', id: 'impMapCard' }, h('div', { class: 'card-head' }, h('h2', {}, t('imp.s2'))),
      h('p', { class: 'small' }, t('imp.fileInfo', { f: st.file.name, n: nf(st.table.rows.length - (st.header ? 1 : 0)) })), sheetSel ? fld('imp.sheet', sheetSel) : null,
      h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'impHeader', checked: st.header, onchange: (e) => { st.header = e.target.checked; st.map = impAutoMap(impFields(st.target), st.header, first); drawImport(); } }), h('span', {}, t('imp.header'))),
      h('div', { class: 'tablewrap' }, h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, [t('imp.col.field'), t('imp.col.column'), t('imp.col.sample')].map((x) => h('th', {}, x)))),
        h('tbody', {}, fields.map((f) => h('tr', { 'data-field': f.k }, h('th', { scope: 'row' }, t(f.lab), f.req ? h('span', { class: 'req', title: t('imp.required') }, ' *') : null), h('td', {}, colSel(f)),
          h('td', { class: 'small muted', dir: 'auto' }, st.map[f.k] >= 0 ? String(sample[st.map[f.k]] == null ? '' : sample[st.map[f.k]]).slice(0, 40) : '—')))))),
      h('p', { class: 'hint' }, t('imp.mapHint'))));
    const act = { add: 'done', update: 'progress', skip: 'pending', bad: 'late' };
    const main = { inventory: ['name', 'code', 'qty', 'unit', 'cost'], suppliers: ['name', 'code', 'phone', 'category'], logistics: ['title', 'kind', 'eta', 'supplierId'], expenses: ['date', 'name', 'kind', 'amount'] }[st.target];
    const show = (p, k) => { const v = p.rec[k]; if (v === undefined || v === '') return '—'; if (k === 'supplierId') return supName(v) || v; const f = fields.find((x) => x.k === k); if (f && f.kind === 'enum') return t(({ category: st.target === 'inventory' ? 'bom.cat.' : 'sup.cat.', unit: 'bom.unit.', kind: st.target === 'expenses' ? 'fin.kind.' : 'lg.kind.', repeat: 'exp.rep.' })[k] + v); return String(v); };
    const rejects = plan.filter((p) => p.action === 'bad');
    const go = h('button', { class: 'btn primary', type: 'button', id: 'btnImportGo', disabled: !(c.add + c.update), onclick: async () => {
      go.disabled = true; msg.hidden = false; msg.className = 'msg'; msg.textContent = t('imp.working');
      try { st.result = await impApply(st, plan); st.table = null; st.file = null; st.mode = 'add'; drawImport(); } catch (e) { msg.className = 'msg bad'; msg.textContent = e.message; go.disabled = false; }
    } }, t('imp.go', { n: nf(c.add + c.update) }));
    body.push(h('div', { class: 'card stack-sm', id: 'impPreview' }, h('div', { class: 'card-head' }, h('h2', {}, t('imp.s3'))),
      st.target !== 'expenses' ? h('div', { class: 'stack-sm' }, h('label', { class: 'check' }, h('input', { type: 'radio', name: 'impMode', id: 'impModeAdd', checked: st.mode === 'add', onchange: () => { st.mode = 'add'; drawImport(); } }), h('span', {}, t('imp.mode.add'))),
        h('label', { class: 'check' }, h('input', { type: 'radio', name: 'impMode', id: 'impModeUpsert', checked: st.mode === 'upsert', onchange: () => { st.mode = 'upsert'; drawImport(); } }), h('span', {}, t('imp.mode.upsert')))) : h('p', { class: 'hint' }, t('imp.expDup')),
      h('div', { class: 'chips', id: 'impCounts' }, h('span', { class: 'badge done', 'data-n': c.add }, t('imp.c.add', { n: nf(c.add) })), st.target !== 'expenses' ? h('span', { class: 'badge progress', 'data-n': c.update }, t('imp.c.update', { n: nf(c.update) })) : null,
        h('span', { class: 'badge pending', 'data-n': c.skip }, t('imp.c.skip', { n: nf(c.skip) })), h('span', { class: 'badge ' + (c.bad ? 'late' : 'pending'), 'data-n': c.bad }, t('imp.c.bad', { n: nf(c.bad) })), c.warn ? h('span', { class: 'badge pending' }, t('imp.c.warn', { n: nf(c.warn) })) : null),
      h('div', { class: 'tablewrap' }, h('table', { class: 'tbl', id: 'impTable' }, h('thead', {}, h('tr', {}, [t('imp.col.line'), t('imp.col.result')].concat(main.map((k) => t(fields.find((f) => f.k === k).lab))).map((x) => h('th', {}, x)))),
        h('tbody', {}, plan.slice(0, 12).map((p) => h('tr', { 'data-action': p.action }, h('td', { class: 'n' }, String(p.line)), h('td', {}, h('span', { class: 'badge ' + act[p.action] }, t('imp.a.' + p.action)), p.errs.length ? h('div', { class: 'small bad', dir: 'auto' }, p.errs.join(' · ')) : p.warns.length ? h('div', { class: 'small muted', dir: 'auto' }, p.warns.join(' · ')) : null),
          main.map((k) => h('td', { dir: 'auto' }, show(p, k)))))))),
      plan.length > 12 ? h('p', { class: 'hint' }, t('imp.more', { n: nf(plan.length - 12) })) : null,
      rejects.length ? h('div', { class: 'stack-sm', id: 'impRejects' }, h('strong', { class: 'small' }, t('imp.rejected')), h('ul', { class: 'plain small' }, rejects.slice(0, 15).map((p) => h('li', { dir: 'auto' }, t('imp.rejLine', { n: String(p.line), r: p.errs.join(' · ') })))),
        h('button', { class: 'btn small', type: 'button', id: 'btnImpRejects', onclick: () => saveBlob(new Blob([toCsv([[t('imp.col.line'), t('imp.reason')].concat(first)].concat(rejects.map((p) => [String(p.line), p.errs.join(' · ')].concat(p.cells.map((x) => String(x))))))], { type: 'text/csv;charset=utf-8' }), 'rejected-rows-' + st.target + '.csv') }, t('imp.rejDownload'))) : null,
      h('div', { class: 'actions' }, go), h('p', { class: 'hint' }, t('imp.goHint'))));
  }
  if (st.result) {
    const r = st.result;
    body.unshift(h('div', { class: 'card stack-sm', id: 'impResult', role: 'status' }, h('div', { class: 'card-head' }, h('h2', {}, t('imp.done'))),
      h('p', {}, t('imp.doneText', { a: nf(r.added), u: nf(r.updated), s: nf(r.skipped), f: nf(r.bad) })), h('div', { class: 'actions' }, h('a', { class: 'btn primary', href: IMP_BACK[st.target], id: 'impOpen' }, t(IMP_TITLE[st.target])))));
  }
  mount(h('section', { class: 'stack', id: 'importScreen' }, h('div', {}, h('a', { class: 'back', href: IMP_BACK[st.target] }, t(IMP_TITLE[st.target]))),
    h('div', { class: 'page-head' }, h('h1', {}, t('imp.title') + ' · ' + t(IMP_TITLE[st.target])), h('div', { class: 'actions' }, encBadge())), h('p', { class: 'hint' }, t('imp.intro')), body));
}
