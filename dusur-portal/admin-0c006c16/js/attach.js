/**
 * <admin>/js/attach.js  -  sealed files kept with the records: invoices, and pictures of products
 * A file is sealed with the master key (AES-GCM, like the photos of a client but with the key of the administrator) and stored as data/private/files/<id>.bin.
 * The record keeps only { id, name, type, size, at }. A picture is shrunk in the browser first (JPEG); a PDF is kept as it is. The sealed file stays under about
 * 780 KB, because the contents API of GitHub hands out files up to 1 MB. Files are added to a record in memory and uploaded when the record is saved;
 * a file removed from a record is deleted after the record is saved. Nothing here is ever published to a client.
 * Loaded by: admin page
 */
'use strict';

const ATT_DIR = 'data/private/files/';
const ATT_MAX = 780000;                                                 // the sealed file, in bytes
const ATT_KEEP = 8;                                                     // files on one record
const ATT_ID_RE = /^f[0-9a-f]{16}$/;
const ATT_KINDS = { 'application/pdf': 'pdf', 'image/jpeg': 'image', 'image/png': 'image', 'image/webp': 'image', 'image/gif': 'image' };
const attNewId = () => 'f' + hex(rand(8));
const attOk = (id) => ATT_ID_RE.test(String(id || ''));
// the meta of a file as kept in a record
function normFiles(list) {
  const out = [];
  for (const x of Array.isArray(list) ? list : []) {
    if (!x || typeof x !== 'object' || !attOk(x.id) || out.length >= ATT_KEEP) continue;
    out.push({ id: x.id, name: String(x.name || '').replace(/[\\/\u0000-\u001f]/g, '').trim().slice(0, 120) || 'file', type: ATT_KINDS[x.type] ? x.type : 'application/pdf',
      size: Math.max(0, Math.round(Number(x.size) || 0)), at: String(x.at || '').slice(0, 30) });
  }
  return out;
}

/* ---- pictures: shrink in the browser ---- */
async function attBitmap(file) {
  try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (_) { throw new Error(t('ph.unsupported', { name: file.name })); }
}
async function attJpeg(bmp, max, q) {
  const sc = Math.min(1, max / Math.max(bmp.width, bmp.height)), w = Math.max(1, Math.round(bmp.width * sc)), hh = Math.max(1, Math.round(bmp.height * sc));
  const c = document.createElement('canvas'); c.width = w; c.height = hh;
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, w, hh); g.drawImage(bmp, 0, 0, w, hh);
  const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', q));
  if (!blob) throw new Error(t('att.badFile'));
  return { bytes: new Uint8Array(await blob.arrayBuffer()), url: null, canvas: c };
}
// a picture in a size that fits: the longest side first 1600 px (invoices must stay readable), then smaller and with less quality until it fits
async function attShrink(file, first) {
  if (file.size > 30 * 1024 * 1024) throw new Error(t('ph.tooBig', { name: file.name }));
  const bmp = await attBitmap(file);
  try {
    for (const [mx, q] of [[first, 0.82], [first, 0.7], [Math.round(first * 0.75), 0.7], [Math.round(first * 0.55), 0.65], [Math.round(first * 0.4), 0.6]]) {
      const r = await attJpeg(bmp, mx, q);
      if (r.bytes.length + 28 <= ATT_MAX) return r.bytes;
    }
  } finally { if (bmp.close) bmp.close(); }
  throw new Error(t('att.tooBig', { name: file.name, n: nf(Math.round(ATT_MAX / 1024)) }));
}
// a file chosen for a record -> { id, name, type, size, bytes } ready to be kept in memory until the record is saved
async function attPrepare(file) {
  const type = file.type === 'image/jpg' ? 'image/jpeg' : file.type;
  if (type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
    if (file.size + 28 > ATT_MAX) throw new Error(t('att.tooBig', { name: file.name, n: nf(Math.round(ATT_MAX / 1024)) }));
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (String.fromCharCode.apply(null, bytes.subarray(0, 4)) !== '%PDF') throw new Error(t('att.badFile'));
    return { id: attNewId(), name: file.name, type: 'application/pdf', size: bytes.length, bytes };
  }
  if (!/^image\//.test(type)) throw new Error(t('att.badType', { name: file.name }));
  const bytes = await attShrink(file, 1600);
  return { id: attNewId(), name: file.name.replace(/\.[A-Za-z0-9]+$/, '') + '.jpg', type: 'image/jpeg', size: bytes.length, bytes };
}
// the picture of a product: a small one kept in the record itself (a data URL, for the lists) and a larger one kept as a sealed file
async function attProductImage(file) {
  if (!/^image\//.test(file.type)) throw new Error(t('att.badType', { name: file.name }));
  if (file.size > 30 * 1024 * 1024) throw new Error(t('ph.tooBig', { name: file.name }));
  const bmp = await attBitmap(file);
  try {
    let thumb = '';
    for (const q of [0.7, 0.58, 0.46, 0.36]) { const r = await attJpeg(bmp, 72, q); thumb = r.canvas.toDataURL('image/jpeg', q); if (thumb.length <= THUMB_MAX) break; }
    if (!thumb || thumb.length > THUMB_MAX) throw new Error(t('att.badFile'));
    let full = null; for (const [mx, q] of [[900, 0.8], [900, 0.68], [700, 0.62], [520, 0.55]]) { const r = await attJpeg(bmp, mx, q); if (r.bytes.length + 28 <= ATT_MAX) { full = r.bytes; break; } }
    if (!full) throw new Error(t('att.tooBig', { name: file.name, n: nf(Math.round(ATT_MAX / 1024)) }));
    return { id: attNewId(), name: 'image.jpg', type: 'image/jpeg', size: full.length, bytes: full, thumb };
  } finally { if (bmp.close) bmp.close(); }
}
// brands: a list kept in Settings, an item of the inventory points at one by id
const BRANDS_MAX = 80, BRAND_NAME_MAX = 60;
const newBrandId = () => 'b' + hex(rand(4));
function normBrands(list) {
  const out = [], seen = new Set();
  for (const x of Array.isArray(list) ? list : []) {
    const name = String(x && x.name || '').replace(/\s+/g, ' ').trim().slice(0, BRAND_NAME_MAX), id = x && /^b[0-9a-f]{8}$/.test(String(x.id || '')) ? x.id : newBrandId();
    if (!name || seen.has(id) || out.length >= BRANDS_MAX) continue;
    seen.add(id); out.push({ id, name });
  }
  return out;
}
const THUMB_MAX = 4500;                                                 // longest data URL of a small picture kept in a record (a list of 100 pictures stays far below the 780 KB of a sealed file)
const THUMB_RE = /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/;
const normThumb = (v) => (typeof v === 'string' && v.length <= THUMB_MAX && THUMB_RE.test(v) ? v : '');

/* ---- the sealed files ---- */
async function attPut(f) {
  await needMaster();
  const sealed = await sealBytes(session.master.key, f.bytes);
  if (sealed.length > ATT_MAX + 64) throw new Error(t('att.tooBig', { name: f.name, n: nf(Math.round(ATT_MAX / 1024)) }));
  await putFile(ATT_DIR + f.id + '.bin', sealed, 'Add file', { create: true });
}
async function attGet(id) {
  if (!attOk(id)) throw new Error(t('att.missing'));
  await needMaster();
  let r; try { r = await gh(contentsUrl(ATT_DIR + id + '.bin')); } catch (e) { if (e.status === 404) throw new Error(t('att.missing')); throw e; }
  if (Array.isArray(r) || r.encoding !== 'base64') throw new Error(t('att.missing'));
  return openBytes(session.master.key, b64ToBytes(r.content));
}
async function attDel(id) { if (attOk(id)) { try { await delFile(ATT_DIR + id + '.bin', 'Delete file'); } catch (_) { /* a file that is already gone is fine */ } } }
// a blob address to show or download; kept in a cache and released when the admin locks
const attUrls = new Map();
async function attUrl(meta, pending) {
  const hit = pending && pending.find((x) => x.id === meta.id);
  if (hit) return URL.createObjectURL(new Blob([hit.bytes], { type: meta.type }));
  if (!attUrls.has(meta.id)) attUrls.set(meta.id, attGet(meta.id).then((b) => URL.createObjectURL(new Blob([b], { type: meta.type }))).catch((e) => { attUrls.delete(meta.id); throw e; }));
  return attUrls.get(meta.id);
}
function attClear() { attUrls.forEach((p) => p.then((u) => URL.revokeObjectURL(u), () => {})); attUrls.clear(); }

/* ---- saving with a record: used by the form pages (ops-ui.js) ---- */
// every file id a record keeps (invoices and the picture of a product)
const attIdsOf = (rec) => (rec && rec.files ? rec.files.map((x) => x.id) : []).concat(rec && rec.image ? [rec.image] : []).filter(attOk);
async function attFlush(e) {                                           // before the record is saved: send the files that were added
  const keep = new Set(attIdsOf(e.rec));
  e.pending = (e.pending || []).filter((f) => keep.has(f.id));
  for (const f of e.pending) { if (!f.sent) { await attPut(f); f.sent = true; } }
}
async function attAfter(e) {                                           // after it was saved: the new files are kept, the removed ones go
  e.pending = []; const gone = e.trash || []; e.trash = [];
  const keep = new Set(attIdsOf(e.rec));
  for (const id of gone) if (!keep.has(id)) await attDel(id);
}
