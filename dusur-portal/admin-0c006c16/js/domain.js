/**
 * <admin>/js/domain.js  -  project types, settings defaults, SKUs, what the client may see
 * Default project types and stages, numbering, newProject(), and toPublic(): the field-by-field whitelist that turns a private record
 * into the client snapshot. Costs, notes, secret and profit never leave the private record.
 * Loaded by: admin page
 */
'use strict';

/* =====================================================================
   Domain: project types, settings, SKUs, publishing whitelist
   ===================================================================== */
const T2 = (en, ar) => ({ en, ar });
const mkStage = (key, en, ar, items) => ({ key, name: T2(en, ar), items: items.map(([a, b]) => T2(a, b)) });
const S_CUT = () => mkStage('cutting', 'Cutting', 'القص', [['Materials checked against the cut list', 'مراجعة الخامات على قائمة القص'], ['Panels cut to size', 'قص الألواح بالمقاسات'], ['Dimensions and quantities verified', 'التأكد من المقاسات والكميات']]);
const S_EDGE = () => mkStage('edge-banding', 'Edge Banding', 'تكسية الحواف', [['Edge banding colour matched', 'مطابقة لون الحواف'], ['Edges applied and trimmed', 'تركيب الحواف وتشطيبها'], ['Finish and glue lines inspected', 'فحص التشطيب وخطوط الغراء']]);
const S_CNC = () => mkStage('cnc', 'CNC', 'CNC', [['Drilling and grooving programmed', 'برمجة الخرط والتفريز'], ['Hardware holes machined', 'تفريز فتحات الاكسسوارات'], ['Machined parts quality-checked', 'فحص جودة القطع المشغولة']]);
const S_ASM = () => mkStage('assembly', 'Assembly', 'التجميع', [['Carcass assembled', 'تجميع الهيكل'], ['Doors, drawers and hardware fitted', 'تركيب الأبواب والأدراج والاكسسوارات'], ['Final inspection passed', 'اجتياز الفحص النهائي'], ['Packed and ready for delivery', 'التغليف والجاهزية للتسليم']]);
const S_INS = () => mkStage('installation', 'Delivery & Installation', 'التوصيل والتركيب', [['Delivered to site', 'التوصيل إلى الموقع'], ['Installed and levelled', 'التركيب والضبط'], ['Client handover completed', 'تسليم العميل واستلامه']]);
const defaultTypes = () => {
  const full = () => [S_CUT(), S_EDGE(), S_CNC(), S_ASM(), S_INS()], base = () => [S_CUT(), S_EDGE(), S_CNC(), S_ASM()];
  return [
    { code: 'KIT', name: T2('Kitchen', 'مطبخ'), stages: full() },
    { code: 'DRS', name: T2('Dressing room', 'غرفة ملابس'), stages: full() },
    { code: 'TVU', name: T2('TV unit', 'وحدة تلفاز'), stages: full() },
    { code: 'BTH', name: T2('Bathroom unit', 'وحدة حمام'), stages: full() },
    { code: 'BED', name: T2('Bedroom', 'غرفة نوم'), stages: full() },
    { code: 'OFC', name: T2('Office furniture', 'أثاث مكتبي'), stages: full() },
    { code: 'JNR', name: T2('Joinery', 'أعمال نجارة'), stages: base() },
    { code: 'OTH', name: T2('Custom project', 'مشروع مخصص'), stages: base() },
  ];
};
const defaultSettings = () => ({ v: 2, prefix: 'DS', currency: 'EGP', seq: 0, cseq: 1000, defaultDays: 30, reportFooter: { en: '', ar: '' }, brand: BRAND_DEFAULT(), contract: defaultContract(), codes: normCodes(null), costCats: normCostCats(null), paper: 'A4', labels: defaultLabels(), brands: [], types: defaultTypes() });
const addDays = (dayStr, n) => { const d = parseDay(dayStr); if (!d) return ''; d.setDate(d.getDate() + n); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); };

const makeStages = (type) => type.stages.map((s) => ({ key: s.key, name: clone(s.name), status: 'pending', checklist: s.items.map((i) => ({ text: clone(i), done: false })) }));
// the client's id together with a project's SKU: one code that names both (the SKU itself keeps its format; it is unique on its own)
const skuRef = (rec, p) => rec.id + '/' + p.sku;
function newSku(type) {
  const s = session.settings; s.seq = (s.seq || 0) + 1;
  const d = new Date();
  return s.prefix + '-' + type.code + '-' + String(d.getFullYear()).slice(2) + pad2(d.getMonth() + 1) + '-' + String(s.seq).padStart(4, '0');
}
function newProject(type) {
  const days = num(session.settings.defaultDays);
  return { sku: newSku(type), type: type.code, typeName: clone(type.name), title: '', description: '', startDate: todayStr(), dueDate: days > 0 ? addDays(todayStr(), Math.round(days)) : '', price: '',
    payments: [], schedule: [], stages: makeStages(type), parts: [], photos: [], downloads: [], costs: [], bom: [], feedback: null, internalNotes: '' };
}

// one photo or video as the client may see it (only these fields): a picture or video link keeps its address, a sealed video its type and size
function photoPublic(x) {
  const b = { id: x.id, caption: x.caption || '', date: x.date || '' };
  if (x.kind === 'link' || x.kind === 'vlink') return Object.assign(b, { kind: x.kind, url: x.url });
  if (x.kind === 'video') return Object.assign(b, { kind: 'video', mime: /^video\/[\w.+-]+$/.test(x.mime || '') ? x.mime : 'video/mp4', size: num(x.size) });
  return Object.assign(b, { kind: 'file' });
}
// What the client may see. Whitelisted field by field: costs, notes, secret and profit never leave the private record.
function toPublic(rec) {
  const pj = (p) => Object.assign({
    sku: p.sku, type: p.type, typeName: p.typeName, title: p.title || '', description: p.description || '', startDate: p.startDate || '', dueDate: p.dueDate || '',
    price: num(p.price), payments: (p.payments || []).map((x) => ({ date: x.date || '', amount: num(x.amount), note: x.note || '' })),
    schedule: (p.schedule || []).filter((x) => num(x.amount) > 0 && parseDay(x.due)).map((x) => Object.assign({ id: x.id || '', due: x.due, amount: num(x.amount), note: String(x.note || '').slice(0, 80) }, x.deposit === true ? { deposit: true } : {})),
    stages: (p.stages || []).map((s) => ({ key: s.key, name: s.name, status: s.status, checklist: (s.checklist || []).map((i) => ({ text: i.text, done: !!i.done })) })),
    parts: (p.parts || []).map((x) => ({ name: x.name || '', qty: num(x.qty) || 1, status: x.status || 'pending', dueDate: x.dueDate || '' })),
    photos: (p.photos || []).map(photoPublic),
    feedback: p.feedback ? { score: num(p.feedback.score), comment: p.feedback.comment || '', at: p.feedback.at || '' } : null,
  }, (p.downloads || []).some((x) => dlOk(x.name)) ? { downloads: p.downloads.filter((x) => dlOk(x.name)).map((x) => ({ id: x.id, name: dlName(x.name), size: num(x.size), caption: String(x.caption || '').slice(0, 120), date: x.date || '' })) } : {});
  return { schema: SCHEMA, id: rec.id, name: rec.client.name, phone: rec.client.phone, currency: CUR, createdAt: rec.createdAt, updatedAt: rec.updatedAt, projects: rec.projects.map(pj) };
}
function recFromPublic(pub, secret) {
  const u = upgradePublic(pub);
  return { schema: PRIV, id: u.id, secret, client: { name: u.name, phone: u.phone, phone2: '', email: '', address: '', notes: '' }, createdAt: u.createdAt, updatedAt: u.updatedAt,
    projects: u.projects.map((p) => Object.assign({}, p, { costs: [], bom: [], internalNotes: '' })) };
}
