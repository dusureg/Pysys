/**
 * <admin>/js/codes.js  -  internal codes: the formula that gives every material, supplier and shipment its own code
 * A formula is plain text with tokens: {CAT} (3-letter category), {YY} {YYYY} {MM} (the month the record is created) and exactly one {N:4} (running number, 4 digits).
 * "MAT-{CAT}-{N:4}" gives MAT-BRD-0001, MAT-BRD-0002, MAT-EDG-0001 ...: the running number is counted per prefix, so every category starts at 1.
 * The code is the human label; the id (MAT-0001) stays the stable key of the record and never changes. The formulas are set in Settings.
 * Loaded by: admin page
 */
'use strict';

/* =====================================================================
   Internal codes
   ===================================================================== */
const CODE_NAMES = ['inventory', 'suppliers', 'logistics'];
const CODE_DEFAULTS = { inventory: 'MAT-{CAT}-{N:4}', suppliers: 'SUP-{CAT}-{N:3}', logistics: 'SHP-{YY}{MM}-{N:4}' };
const CODE_CATS = { board: 'BRD', boards: 'BRD', edge: 'EDG', hardware: 'HDW', finish: 'FIN', glass: 'GLS', accessory: 'ACC', accessories: 'ACC', transport: 'TRN', tools: 'TLS', services: 'SRV',
  inbound: 'INB', outbound: 'OUT', transfer: 'TRF', other: 'OTH' };
const CODE_MAX = 40;

// "MAT-{CAT}-{N:4}" -> { pre: ['MAT-', {tok:'CAT'}, '-'], post: [], pad: 4 }, or null when the formula is not valid
function codeParse(p) {
  p = String(p == null ? '' : p).trim();
  if (!p || p.length > CODE_MAX) return null;
  const re = /\{([A-Z]+)(?::(\d))?\}/g, pre = [], post = [];
  let cur = pre, m, last = 0, seq = 0, pad = 0;
  while ((m = re.exec(p))) {
    if (m.index > last) cur.push(p.slice(last, m.index));
    last = re.lastIndex;
    if (m[1] === 'N') { pad = m[2] ? Number(m[2]) : 1; if (++seq > 1 || pad < 1 || pad > 8) return null; cur = post; } else if (['CAT', 'YY', 'YYYY', 'MM'].includes(m[1]) && !m[2]) cur.push({ tok: m[1] }); else return null;
  }
  if (last < p.length) cur.push(p.slice(last));
  if (seq !== 1) return null;
  if (pre.concat(post).some((x) => typeof x === 'string' && !/^[A-Za-z0-9._/-]+$/.test(x))) return null;
  return { pre, post, pad };
}
const codePatternOk = (p) => !!codeParse(p);
const codePattern = (name) => { const c = session && session.settings && session.settings.codes; return c && codePatternOk(c[name]) ? c[name].trim() : CODE_DEFAULTS[name]; };
const normCodes = (c) => { const o = {}; for (const n of CODE_NAMES) o[n] = c && codePatternOk(c[n]) ? String(c[n]).trim() : CODE_DEFAULTS[n]; return o; };
function codeExpand(parts, name, rec, when) {
  return parts.map((x) => {
    if (typeof x === 'string') return x;
    if (x.tok === 'CAT') return CODE_CATS[name === 'logistics' ? rec.kind : rec.category] || 'OTH';
    if (x.tok === 'YYYY') return String(when.getFullYear());
    if (x.tok === 'YY') return String(when.getFullYear()).slice(2);
    return pad2(when.getMonth() + 1);
  }).join('');
}
// the next free code for this record (items = the records that already exist)
function codeNext(name, rec, items, when) {
  const f = codeParse(codePattern(name)) || codeParse(CODE_DEFAULTS[name]), d = when || new Date();
  const pre = codeExpand(f.pre, name, rec || {}, d), post = codeExpand(f.post, name, rec || {}, d);
  let max = 0;
  for (const x of items || []) {
    const c = String(x.code || '');
    if (c.length > pre.length + post.length && c.startsWith(pre) && c.endsWith(post)) { const mid = c.slice(pre.length, c.length - post.length); if (/^\d+$/.test(mid)) max = Math.max(max, Number(mid)); }
  }
  return pre + String(max + 1).padStart(f.pad, '0') + post;
}
const SAMPLE_REC = { inventory: { category: 'board' }, suppliers: { category: 'hardware' }, logistics: { kind: 'inbound' } };
const codeExample = (name, pattern) => {
  const keep = session.settings.codes; session.settings.codes = Object.assign({}, normCodes(keep), { [name]: pattern });
  try { return codeNext(name, SAMPLE_REC[name], []); } finally { session.settings.codes = keep; }
};
const codeClash = (name, r) => !!(r.code && opsList(name).some((x) => x.id !== r.id && x.code && x.code.toLowerCase() === r.code.toLowerCase()));
// give a code to every record that has none (one saved change per file); returns how many were coded
async function fillMissingCodes(name) {
  let n = 0;
  await opsMutate(name, (data) => {
    n = 0;
    for (const x of data.items.slice().sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))) if (!x.code) { x.code = codeNext(name, x, data.items, new Date(x.createdAt || Date.now())); x.updatedAt = oiso(); n++; }
  });
  if (n) audit({ area: name, act: 'update', ref: name, title: t('code.fillTitle'), note: t('code.filled', { n: nf(n) }) });
  return n;
}
