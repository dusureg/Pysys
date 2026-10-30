/**
 * <admin>/js/ops-data.js  -  suppliers, inventory and logistics: storage and rules
 * Three sealed files (data/private/ops/<name>.json) are read on demand and changed one record at a time: when another device saved first,
 * the same change is applied again on the fresh copy. Also here: the record normalisers, stock alerts and reorder suggestions,
 * shipment states, and the safe link helpers (web address, tel:, WhatsApp, e-mail). Nothing in these files is ever published.
 * Loaded by: admin page
 */
'use strict';

/* =====================================================================
   Operations data: suppliers (supply chain), inventory, logistics
   ===================================================================== */
const OPS_DIR = 'data/private/ops/';
const OPS_NAMES = ['suppliers', 'inventory', 'logistics'];
const OPS_PREFIX = { suppliers: 'SUP-', inventory: 'MAT-', logistics: 'LG-', expenses: 'EXP-' }, OPS_PAD = { suppliers: 3, inventory: 4, logistics: 4, expenses: 4 };
const OPS_MAX_SEALED = 780000;                 // the contents API hands out a file of up to 1 MB as base64: stay well below that
const MOVES_KEEP = 40;                         // stock movements remembered per material
const EXPIRY_WARN_DAYS = 30, DEFAULT_CC = '20';   // days before the expiry date an alert starts · country code put before a local number starting with 0 (Egypt)
const SUP_CATS = ['boards', 'edge', 'hardware', 'finish', 'glass', 'accessories', 'transport', 'tools', 'services', 'other'];
const LG_KINDS = ['inbound', 'outbound', 'transfer'];
const LG_STEP_STATES = ['pending', 'in_progress', 'done', 'blocked'];
const LG_STATES = ['planned', 'in_progress', 'blocked', 'completed', 'cancelled'];
const LG_TEMPLATE = { inbound: 7, outbound: 5, transfer: 3 };      // number of standard steps (texts: lg.tpl.<kind>.<n>)

/* ---------------- small helpers ---------------- */
const ostr = (v, n) => String(v == null ? '' : v).trim().slice(0, n || 200);
const oarr = (v) => (Array.isArray(v) ? v : []);
const onum = (v) => (v === '' || v == null || !isFinite(Number(v)) ? '' : Math.max(0, Number(v)));      // optional number: '' when empty
const r3 = (x) => Math.round(x * 1000) / 1000;
const oday = (v) => (parseDay(ostr(v, 10)) ? ostr(v, 10) : '');
const oiso = () => new Date().toISOString();

// A web address the browser may open: http(s) only, "www.x.com" gets https://, anything else (javascript:, data:, a bare word) is rejected.
function safeUrl(s) {
  s = ostr(s, 500); if (!s) return '';
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = 'https://' + s.replace(/^\/+/, '');
  try { const u = new URL(s); return /^https?:$/.test(u.protocol) && /\.[^.]{2,}$/.test(u.hostname) && !u.username && !u.password ? u.href : ''; } catch (_) { return ''; }
}
const urlHost = (s) => { try { return new URL(s).hostname.replace(/^www\./, ''); } catch (_) { return s; } };
const digitsOf = (s) => String(s || '').replace(/\D/g, '');
const phoneOk = (s) => !s || (/^[\d\s+().-]+$/.test(s) && digitsOf(s).length >= 5 && digitsOf(s).length <= 15);
const telHref = (s) => (phoneOk(s) && s ? 'tel:' + (/^\s*\+/.test(s) ? '+' : '') + digitsOf(s) : '');
function waHref(s) {                                             // https://wa.me/<number with country code>
  if (!s || !phoneOk(s)) return '';
  let d = digitsOf(s); if (d.startsWith('00')) d = d.slice(2); else if (d.startsWith('0')) d = DEFAULT_CC + d.slice(1);
  return d.length >= 8 && d.length <= 15 ? 'https://wa.me/' + d : '';
}
// A WhatsApp button is made from the phone number by itself. It can be changed by hand: a different number, or a WhatsApp link (a business "message" link, a group invite).
const WA_LINK_RE = /^https:\/\/(wa\.me|api\.whatsapp\.com|chat\.whatsapp\.com|web\.whatsapp\.com|wa\.link)\/[^\s<>"]+$/i;
const waOverrideOk = (s) => { s = String(s || '').trim(); return !s || WA_LINK_RE.test(s) || (phoneOk(s) && !!waHref(s)); };
function waTarget(phone, override) {                              // the address the WhatsApp button opens: the hand-made one when there is one, else the one made from the phone number
  const o = String(override || '').trim();
  return o ? (WA_LINK_RE.test(o) ? o : waHref(o)) : waHref(phone);
}
// the same with a first message in it (only a plain wa.me/<number> address can carry a text)
function waSendTo(phone, override, text) { const a = waTarget(phone, override); return /^https:\/\/wa\.me\/\d+$/.test(a) && text ? a + '?text=' + encodeURIComponent(text) : a; }
const emailOk = (s) => !s || /^[^\s@<>()]+@[^\s@<>()]+\.[^\s@<>()]{2,}$/.test(s);
const mailHref = (s) => (s && emailOk(s) ? 'mailto:' + s : '');

/* ---------------- normalisers: every record read from a file or sent to a file goes through one ---------------- */
function normSupplier(x) {
  x = x || {};
  return { id: ostr(x.id, 20), code: ostr(x.code, 40), name: ostr(x.name, 120), category: SUP_CATS.includes(x.category) ? x.category : 'other', contact: ostr(x.contact, 100),
    phone: ostr(x.phone, 40), phone2: ostr(x.phone2, 40), whatsapp: ostr(x.whatsapp, 200), email: ostr(x.email, 120), website: ostr(x.website, 300), location: ostr(x.location, 120),
    mapLink: ostr(x.mapLink, 500), link: ostr(x.link, 500), address: ostr(x.address, 300), terms: ostr(x.terms, 200), leadDays: onum(x.leadDays),
    notes: ostr(x.notes, 2000), active: x.active !== false, createdAt: ostr(x.createdAt, 30), updatedAt: ostr(x.updatedAt, 30) };
}
function normMove(m) {
  m = m || {};
  return { at: ostr(m.at, 30), type: ['in', 'out', 'count'].includes(m.type) ? m.type : 'count', delta: r3(num(m.delta)), qty: r3(num(m.qty)), note: ostr(m.note, 200), ref: ostr(m.ref, 20) };
}
function normItem(x) {
  x = x || {};
  return { id: ostr(x.id, 20), code: ostr(x.code, 40), name: ostr(x.name, 120), category: BOM_CATS.includes(x.category) ? x.category : 'other', unit: BOM_UNITS.includes(x.unit) ? x.unit : 'pcs',
    qty: r3(Math.max(0, num(x.qty))), min: onum(x.min), max: onum(x.max), reorderQty: onum(x.reorderQty), cost: onum(x.cost), supplierId: ostr(x.supplierId, 20),
    location: ostr(x.location, 80), expiry: oday(x.expiry), notes: ostr(x.notes, 1000), moves: oarr(x.moves).slice(0, MOVES_KEEP).map(normMove),
    brandId: ostr(x.brandId, 20), thumb: normThumb(x.thumb), image: attOk(x.image) ? x.image : '',
    createdAt: ostr(x.createdAt, 30), updatedAt: ostr(x.updatedAt, 30) };
}
const normLine = (l) => { l = l || {}; return { id: ostr(l.id, 12) || uid(), itemId: ostr(l.itemId, 20), name: ostr(l.name, 120), qty: r3(Math.max(0, num(l.qty))), unit: BOM_UNITS.includes(l.unit) ? l.unit : 'pcs' }; };
const normStep = (s) => { s = s || {}; return { id: ostr(s.id, 12) || uid(), name: ostr(s.name, 120), status: LG_STEP_STATES.includes(s.status) ? s.status : 'pending', due: oday(s.due), doneAt: oday(s.doneAt), note: ostr(s.note, 300) }; };
function normShipment(x) {
  x = x || {};
  return { id: ostr(x.id, 20), code: ostr(x.code, 40), title: ostr(x.title, 120), kind: LG_KINDS.includes(x.kind) ? x.kind : 'inbound', supplierId: ostr(x.supplierId, 20), clientId: ostr(x.clientId, 40), clientName: ostr(x.clientName, 120),
    project: ostr(x.project, 40), ref: ostr(x.ref, 60), carrier: ostr(x.carrier, 100), tracking: ostr(x.tracking, 80), from: ostr(x.from, 120), to: ostr(x.to, 120), eta: oday(x.eta),
    cost: onum(x.cost), notes: ostr(x.notes, 1500), cancelled: !!x.cancelled, received: oday(x.received), lines: oarr(x.lines).map(normLine), steps: oarr(x.steps).map(normStep), files: normFiles(x.files),
    createdAt: ostr(x.createdAt, 30), updatedAt: ostr(x.updatedAt, 30) };
}
// Company expenses (Finance section): costs that belong to no single project. direct = pooled production cost (e.g. workshop wages), indirect = overhead (rent, power, office, marketing...)
const FIN_KINDS = ['direct', 'indirect'], REPEATS = ['none', 'monthly', 'yearly'];
const IND_CATS = ['rent', 'utilities', 'salaries', 'marketing', 'vehicles', 'maintenance', 'insurance', 'taxes', 'depreciation', 'software', 'other'];
const expCats = (kind) => (kind === 'direct' ? COST_CATS : IND_CATS);
function normExpense(x) {
  x = x || {}; const kind = FIN_KINDS.includes(x.kind) ? x.kind : 'indirect';
  return { id: ostr(x.id, 20), date: oday(x.date), name: ostr(x.name, 120), kind, cat: expCats(kind).includes(x.cat) ? x.cat : 'other', amount: Math.round(Math.max(0, num(x.amount)) * 100) / 100,
    repeat: REPEATS.includes(x.repeat) ? x.repeat : 'none', until: oday(x.until), supplierId: ostr(x.supplierId, 20), notes: ostr(x.notes, 1000), files: normFiles(x.files), createdAt: ostr(x.createdAt, 30), updatedAt: ostr(x.updatedAt, 30) };
}
const OPS_NORM = { suppliers: normSupplier, inventory: normItem, logistics: normShipment, expenses: normExpense };
const normOps = (name, d) => ({ v: 1, seq: Math.max(0, num(d && d.seq)), updatedAt: ostr(d && d.updatedAt, 30), items: oarr(d && d.items).map(OPS_NORM[name]).filter((x) => x.id) });

/* ---------------- reading and writing ---------------- */
async function loadOps(name, force) {
  if (!force && ops[name]) return ops[name];
  await needMaster();
  let data = null, sha = null;
  try { const f = await getFile(OPS_DIR + name + '.json'); sha = f.sha; data = await openObj(f.text); } catch (e) { if (e.status !== 404) throw e; }
  ops[name] = { data: normOps(name, data), sha };
  return ops[name];
}
const loadAllOps = async (force) => { await Promise.all(OPS_NAMES.map((n) => loadOps(n, force))); refreshOpsAlerts(); };
async function saveOps(name) {
  const o = ops[name]; o.data.updatedAt = oiso();
  const body = await sealObj(o.data);
  if (body.length > OPS_MAX_SEALED) throw new Error(t('ops.tooBig'));
  try { o.sha = await putFile(OPS_DIR + name + '.json', body, (o.sha ? 'Update ' : 'Add ') + name, o.sha ? { sha: o.sha } : { create: true }); } catch (e) {
    if (e.status === 409 || e.status === 422) throw Object.assign(new Error(t('ops.conflict')), { status: 409 });
    throw e;
  }
}
// Apply one change (fn edits the list in place) and save. If another device saved first, take its copy, apply the same change again, save again.
async function opsMutate(name, fn) {
  await loadOps(name);
  try {
    for (let attempt = 0; ; attempt++) {
      fn(ops[name].data);
      try { await saveOps(name); break; } catch (e) {
        if (e.status === 409 && attempt < 2) { await loadOps(name, true); continue; }
        throw e;
      }
    }
  } catch (e) { delete ops[name]; throw e; }          // the in-memory copy may hold a change that was never saved: read it again next time
  refreshOpsAlerts();
}
function opsNextId(name, data) {
  const used = data.items.map((x) => parseInt((x.id.match(/(\d+)$/) || [])[1], 10) || 0);
  data.seq = Math.max(num(data.seq), ...used) + 1;
  return OPS_PREFIX[name] + String(data.seq).padStart(OPS_PAD[name], '0');
}
// Add or replace one record (isNew: the id is given by the file, which also settles two devices adding at the same time). Returns the saved record.
async function opsUpsert(name, rec, isNew, adjust) {
  let saved = null, before = null;
  await opsMutate(name, (data) => {
    const r = OPS_NORM[name](clone(rec)), now = oiso(), i = data.items.findIndex((x) => x.id === r.id);
    if (isNew && (!r.id || i >= 0)) r.id = opsNextId(name, data);
    const old = isNew ? null : data.items.find((x) => x.id === r.id); before = old ? clone(old) : null;
    r.updatedAt = now; r.createdAt = (old && old.createdAt) || r.createdAt || now;
    if (adjust) adjust(r, old);
    if (CODE_NAMES.includes(name) && !r.code) r.code = codeNext(name, r, data.items.filter((x) => x.id !== r.id), new Date(r.createdAt));          // every record gets its code from the formula in Settings
    const k = data.items.findIndex((x) => x.id === r.id);
    if (k >= 0) data.items[k] = r; else data.items.push(r);
    saved = r;
  });
  auditSave(name, before ? 'update' : 'create', saved.id, opsTitle(saved), before, saved);
  return saved;
}
async function opsRemove(name, id) {
  const gone = opsFind(name, id);
  await opsMutate(name, (data) => { data.items = data.items.filter((x) => x.id !== id); });
  audit({ area: name, act: 'delete', ref: id, title: gone ? opsTitle(gone) : id });
}
const opsTitle = (r) => r.name || r.title || r.code || r.id;
const opsList = (name) => (ops[name] ? ops[name].data.items : []);
const opsFind = (name, id) => opsList(name).find((x) => x.id === id) || null;
const supName = (id) => { const s = opsFind('suppliers', id); return s ? s.name : ''; };

/* ---------------- stock: movements, alerts, reorder ---------------- */
// type: 'in' (received) · 'out' (used) · 'count' (the new total after a stock-take). Edits the material in place.
function applyMove(it, type, amount, note, ref) {
  const a = r3(Math.max(0, num(amount))), before = num(it.qty);
  if (type === 'in') it.qty = r3(before + a);
  else if (type === 'out') { if (a > before) throw new Error(t('inv.notEnough', { n: nf(before), u: t('bom.unit.' + it.unit) })); it.qty = r3(before - a); } else it.qty = a;
  it.moves.unshift({ at: oiso(), type, delta: r3(it.qty - before), qty: it.qty, note: ostr(note, 200), ref: ostr(ref, 20) });
  it.moves.length = Math.min(it.moves.length, MOVES_KEEP); it.updatedAt = oiso();
}
async function moveItem(id, type, amount, note, ref) {
  let before = 0, after = 0, name = id;
  await opsMutate('inventory', (data) => {
    const it = data.items.find((x) => x.id === id); if (!it) throw new Error(t('inv.gone'));
    before = it.qty; applyMove(it, type, amount, note, ref); after = it.qty; name = it.name;
  });
  audit({ area: 'inventory', act: 'stock-' + type, ref: id, title: name, ch: [['qty', String(before), String(after)]], note: ostr(note, 200) });
}
// quantity on the way: lines of open inbound shipments that were not received yet
function onOrder(itemId) {
  let n = 0;
  for (const s of opsList('logistics')) if (s.kind === 'inbound' && !s.received && !s.cancelled) for (const l of s.lines) if (l.itemId === itemId) n += num(l.qty);
  return r3(n);
}
const ATTENTION = ['out', 'low', 'expired', 'expiring'];
// flags: out, low, expired, expiring (need attention) · over, nosupplier, nomin (information) · level: bad / warn / info / ok · suggest: how much to order
function stockInfo(it) {
  const q = num(it.qty), min = num(it.min), max = num(it.max), ordered = onOrder(it.id), flags = [], lowish = q <= 0 || (min > 0 && q <= min);
  if (q <= 0) flags.push('out'); else if (min > 0 && q <= min) flags.push('low');
  if (it.expiry) { const d = daysUntil(it.expiry); if (d !== null && d < 0) flags.push('expired'); else if (d !== null && d <= EXPIRY_WARN_DAYS) flags.push('expiring'); }
  if (max > 0 && q > max) flags.push('over');
  if (lowish && !it.supplierId) flags.push('nosupplier');
  if (!(min > 0)) flags.push('nomin');
  const target = max > 0 ? max : min * 2;
  let suggest = 0;
  if (lowish) suggest = Math.max(0, Math.ceil(Math.max(target - q, num(it.reorderQty)) * 100) / 100 - ordered);
  const attention = flags.some((f) => ATTENTION.includes(f));
  const level = flags.includes('out') || flags.includes('expired') ? 'bad' : attention ? 'warn' : flags.some((f) => f === 'over' || f === 'nosupplier') ? 'info' : 'ok';
  return { flags, level, attention, ordered, suggest: r3(suggest), lowish, value: num(it.qty) * num(it.cost) };
}
const stockSummary = (items) => {
  const info = items.map((it) => ({ it, s: stockInfo(it) }));
  return { n: items.length, attention: info.filter((x) => x.s.attention).length, out: info.filter((x) => x.s.flags.includes('out')).length, low: info.filter((x) => x.s.flags.includes('low')).length,
    expiring: info.filter((x) => x.s.flags.includes('expiring') || x.s.flags.includes('expired')).length, value: sum(info, (x) => x.s.value), info };
};

/* ---------------- shipments ---------------- */
function lgState(s) {
  if (s.cancelled) return 'cancelled';
  if (s.steps.length && s.steps.every((x) => x.status === 'done')) return 'completed';
  if (s.steps.some((x) => x.status === 'blocked')) return 'blocked';
  return s.steps.some((x) => x.status === 'done' || x.status === 'in_progress') ? 'in_progress' : 'planned';
}
const lgOpen = (s) => ['planned', 'in_progress', 'blocked'].includes(lgState(s));
const lgProgress = (s) => (s.steps.length ? s.steps.filter((x) => x.status === 'done').length / s.steps.length : 0);
const lgCurrent = (s) => s.steps.find((x) => x.status !== 'done') || null;
const lgLate = (s) => { if (!lgOpen(s)) return false; const d = daysUntil(s.eta); return d !== null && d < 0; };
const lgStepLate = (st) => st.status !== 'done' && !!st.due && daysUntil(st.due) < 0;
function lgDone(s) {                                               // complete the current step; the next waiting step becomes "in progress"
  const cur = lgCurrent(s); if (!cur) return false;
  cur.status = 'done'; cur.doneAt = todayStr();
  const next = lgCurrent(s); if (next && next.status === 'pending') next.status = 'in_progress';
  s.updatedAt = oiso(); return true;
}
const lgStepsFor = (kind) => Array.from({ length: LG_TEMPLATE[kind] || 0 }, (_, i) => normStep({ name: t('lg.tpl.' + kind + '.' + (i + 1)) }));
// apply fn to one shipment inside a safe save (used by the quick "step done" button and by receiving into stock)
async function changeShipment(id, fn) {
  let before = null, after = null;
  await opsMutate('logistics', (data) => { const s = data.items.find((x) => x.id === id); if (!s) throw new Error(t('lg.gone')); before = clone(s); fn(s); s.updatedAt = oiso(); after = clone(s); });
  auditSave('logistics', 'update', id, opsTitle(after), before, after);
}
// Add the materials of an inbound shipment to the stock (once: a movement carrying the shipment id marks it), then mark the shipment as received.
async function receiveShipment(id) {
  const s = opsFind('logistics', id); if (!s) throw new Error(t('lg.gone'));
  const per = new Map();
  for (const l of s.lines) if (l.itemId && num(l.qty) > 0) per.set(l.itemId, r3((per.get(l.itemId) || 0) + num(l.qty)));
  let moved = [];
  await opsMutate('inventory', (data) => {
    moved = [];
    for (const [itemId, q] of per) {
      const it = data.items.find((x) => x.id === itemId), was = it ? it.qty : 0;
      if (it && !it.moves.some((m) => m.ref === id && m.type === 'in')) { applyMove(it, 'in', q, t('lg.recvNote', { id }), id); moved.push({ id: itemId, name: it.name, was, now: it.qty }); }
    }
  });
  for (const m of moved) audit({ area: 'inventory', act: 'stock-in', ref: m.id, title: m.name, ch: [['qty', String(m.was), String(m.now)]], note: t('lg.recvNote', { id }) });
  await changeShipment(id, (x) => { x.received = todayStr(); });
  return per.size;
}

/* ---------------- numbers for the menu badge and the dashboard ---------------- */
function refreshOpsAlerts() {
  const inv = ops.inventory, lg = ops.logistics;
  opsAlerts = { stock: inv ? stockSummary(inv.data.items).attention : null, late: lg ? lg.data.items.filter(lgLate).length : null, blocked: lg ? lg.data.items.filter((s) => lgState(s) === 'blocked').length : null };
  paintOpsBadge();
}
function paintOpsBadge() {
  document.querySelectorAll('#adminNav .navbadge').forEach((n) => n.remove());
  if (!opsAlerts) return;
  const put = (route, n, label) => {
    const a = document.querySelector('#adminNav a[data-route=' + route + ']');
    if (a && n) a.append(h('span', { class: 'navbadge' }, h('span', { class: 'sr' }, label + ' '), String(n)));
  };
  put('inventory', opsAlerts.stock, t('inv.alertsLabel')); put('logistics', (opsAlerts.late || 0) + (opsAlerts.blocked || 0), t('lg.attentionLabel'));
}
