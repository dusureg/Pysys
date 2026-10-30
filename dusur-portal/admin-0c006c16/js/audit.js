/**
 * <admin>/js/audit.js  -  the history of every change
 * audit() queues one entry (who, when, what, field by field before -> after). Entries are written in small batches to sealed monthly files
 * (data/private/audit/YYYY-MM.json), each entry carrying a hash of the one before it, so a removed or edited entry shows up as a broken chain.
 * diffObj() compares two versions of a record. Nothing here ever stops a save: a history entry that could not be written waits and is retried.
 * Loaded by: admin page
 */
'use strict';

/* =====================================================================
   History: queue, files, comparison
   ===================================================================== */
const AUDIT_MAX_SEALED = 700000, AUDIT_BATCH = 40, AUDIT_FIELDS = 30;
const AUDIT_AREAS = ['client', 'ratings', 'suppliers', 'inventory', 'logistics', 'expenses', 'settings', 'team', 'session', 'reports', 'config'];
const AUD_SKIP = new Set(['updatedAt', 'createdAt', 'schema', 'seq', 'cseq', 'moves', 'v']);        // bookkeeping that changes with every save
const AUD_HIDE = new Set(['secret', 'inboxKey']);                                                                 // the value is never written to the history
const AUD_KEYS = ['id', 'sku', 'key', 'code'];
let auditQ = [], auditBusy = null, auditErr = '', auditTimer = null, auditHold = false;     // auditHold: no history file is written while the encryption key is being changed
const auditParts = {};                                                                                 // month -> number of the newest part file

/* ---------------- comparing two versions ---------------- */
function audVal(v) {
  if (v === undefined || v === null) return '';
  if (typeof v === 'object') { try { v = JSON.stringify(v); } catch (_) { v = ''; } }
  v = String(v);
  if (/^data:/.test(v)) return '(image)';
  return v.length > 90 ? v.slice(0, 87) + '…' : v;
}
function audSummary(o) {
  if (o === null || typeof o !== 'object') return audVal(o);
  for (const k of ['name', 'title', 'sku', 'caption', 'text', 'note', 'cat', 'id']) {
    let v = o[k]; if (v && typeof v === 'object') v = v.en || v.ar;
    if (v != null && v !== '') return audVal(v);
  }
  return audVal(o);
}
const audIsObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const audKey = (x) => { if (!audIsObj(x)) return null; for (const k of AUD_KEYS) if (x[k] != null && x[k] !== '' && typeof x[k] !== 'object') return String(x[k]); return null; };
function diffObj(a, b, path, out) {
  if (out.length > 200) return;
  if (Array.isArray(a) || Array.isArray(b)) {
    a = Array.isArray(a) ? a : []; b = Array.isArray(b) ? b : [];
    if (a.length + b.length && a.concat(b).every((x) => audKey(x) !== null)) {                         // elements with an id / sku / key: match them by it
      const am = new Map(a.map((x) => [audKey(x), x])), bm = new Map(b.map((x) => [audKey(x), x]));
      for (const [k, x] of bm) { if (am.has(k)) diffObj(am.get(k), x, path + '[' + k + ']', out); else out.push([path + '[' + k + ']', '', '+ ' + audSummary(x)]); }
      for (const [k, x] of am) if (!bm.has(k)) out.push([path + '[' + k + ']', '- ' + audSummary(x), '']);
      return;
    }
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      if (i >= a.length) out.push([path + '[' + (i + 1) + ']', '', '+ ' + audSummary(b[i])]);
      else if (i >= b.length) out.push([path + '[' + (i + 1) + ']', '- ' + audSummary(a[i]), '']);
      else diffObj(a[i], b[i], path + '[' + (i + 1) + ']', out);
    }
    return;
  }
  if (audIsObj(a) || audIsObj(b)) {
    a = audIsObj(a) ? a : {}; b = audIsObj(b) ? b : {};
    for (const k of new Set(Object.keys(a).concat(Object.keys(b)))) if (!AUD_SKIP.has(k)) diffObj(a[k], b[k], path ? path + '.' + k : k, out);
    return;
  }
  const empty = (x) => x === undefined || x === null || x === '';
  if (a !== b && !(empty(a) && empty(b))) out.push(AUD_HIDE.has(path.split('.').pop()) ? [path, '•••', '•••'] : [path, audVal(a), audVal(b)]);
}
// [[field, before, after], ...] limited to the first 30 differences
function auditChanges(before, after) {
  const out = []; diffObj(before == null ? {} : before, after == null ? {} : after, '', out);
  if (out.length > AUDIT_FIELDS) { const n = out.length - AUDIT_FIELDS; out.length = AUDIT_FIELDS; out.push(['…', '', '+' + n]); }
  return out;
}
// the usual call after a save: compare the two versions; an update that changed nothing is not an event
function auditSave(area, act, ref, title, before, after, note) {
  const ch = act === 'delete' ? [] : auditChanges(act === 'create' ? null : before, after);
  if (act === 'update' && !ch.length) return;
  audit({ area, act, ref, title, ch, note });
}

/* ---------------- writing ---------------- */
function audit(ev) {
  if (!session || !session.user) return;
  const w = whoAmI();
  auditQ.push({ id: hex(rand(4)), at: oiso(), uid: w.id, who: ostr(w.name, 80), role: ostr(w.role, 24), area: ostr(ev.area, 20), act: ostr(ev.act, 20), ref: ostr(ev.ref, 60), title: ostr(ev.title, 100),
    ch: oarr(ev.ch).slice(0, AUDIT_FIELDS + 1).map((c) => [ostr(c[0], 160), ostr(c[1], 100), ostr(c[2], 100)]), note: ostr(ev.note, 200) });
  paintAuditPill();
  clearTimeout(auditTimer); auditTimer = setTimeout(() => { flushAudit(); }, 800);
}
const auditPending = () => auditQ.length;
const auditMonthOf = (iso) => { const d = new Date(iso); return d.getFullYear() + '-' + pad2(d.getMonth() + 1); };
const auditPath = (month, part) => AUDIT_DIR + month + (part > 1 ? '-' + part : '') + '.json';
async function auditHash(prev, entry) {
  const copy = Object.assign({}, entry); delete copy.h;
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(prev + JSON.stringify(copy))))).slice(0, 12);
}
async function auditLastPart(month) {
  if (auditParts[month]) return auditParts[month];
  let best = 1;
  for (const f of await listDir(AUDIT_DIR)) { const m = /^(\d{4}-\d{2})(?:-(\d+))?\.json$/.exec(f.name); if (m && m[1] === month) best = Math.max(best, m[2] ? parseInt(m[2], 10) : 1); }
  return (auditParts[month] = best);
}
async function appendMonth(month, list) {
  await needMaster();
  let part = await auditLastPart(month);
  for (let attempt = 0; attempt < 5; attempt++) {
    const path = auditPath(month, part); let data = { v: 1, month, part, items: [] }, sha = null;
    try { const f = await getFile(path); sha = f.sha; data = await openObj(f.text); data.items = oarr(data.items); } catch (e) { if (e.status !== 404) throw e; }
    let prev = data.items.length ? data.items[data.items.length - 1].h || '' : '';
    for (const e of list) { const x = Object.assign({}, e); x.h = await auditHash(prev, x); prev = x.h; data.items.push(x); }
    const body = await sealObj(data);
    if (body.length > AUDIT_MAX_SEALED && data.items.length > list.length) { part++; auditParts[month] = part; continue; }      // this part is full: carry on in the next file
    try { await putFile(path, body, 'History', sha ? { sha } : { create: true }); return; } catch (e) { if ((e.status === 409 || e.status === 422) && attempt < 4) continue; throw e; }
  }
  throw new Error(t('aud.saveFail'));
}
// write what is waiting; entries that could not be written stay in the queue (see the "history waiting" note in the top bar) and are tried again
function flushAudit() {
  if (auditBusy) return auditBusy;
  clearTimeout(auditTimer);
  if (auditHold) return Promise.resolve();
  auditBusy = (async () => {
    while (auditQ.length && session && !auditHold) {
      const batch = auditQ.slice(0, AUDIT_BATCH), month = auditMonthOf(batch[0].at), same = batch.filter((e) => auditMonthOf(e.at) === month);
      try { await appendMonth(month, same); auditQ.splice(0, same.length); auditErr = ''; } catch (e) { auditErr = e.message || String(e); break; }
    }
  })().then(() => { auditBusy = null; paintAuditPill(); }, () => { auditBusy = null; paintAuditPill(); });
  return auditBusy;
}
function paintAuditPill() {
  const box = document.getElementById('auditPill'); if (!box) return;
  box.replaceChildren();
  if (!session || !auditQ.length || !auditErr) { box.hidden = true; return; }
  box.hidden = false;
  box.append(h('span', { class: 'small' }, t('aud.waiting', { n: nf(auditQ.length) })), h('button', { class: 'small', type: 'button', id: 'btnAuditRetry', onclick: () => { auditErr = ''; flushAudit(); } }, t('act.retry')));
}

/* ---------------- reading ---------------- */
// the months that have a history file, newest first
async function auditMonths() {
  const set = new Set();
  for (const f of await listDir(AUDIT_DIR)) { const m = /^(\d{4}-\d{2})(?:-\d+)?\.json$/.exec(f.name); if (m) set.add(m[1]); }
  return [...set].sort().reverse();
}
// every entry of one month, newest first, plus whether the hash chain is unbroken
async function loadAuditMonth(month) {
  await needMaster();
  const files = (await listDir(AUDIT_DIR)).filter((f) => { const m = /^(\d{4}-\d{2})(?:-(\d+))?\.json$/.exec(f.name); return m && m[1] === month; });
  const parts = [];
  await pool(files, 3, async (f) => { const m = /-(\d+)\.json$/.exec(f.name); parts.push({ n: m ? parseInt(m[1], 10) : 1, data: await openObj((await getFile(f.path)).text) }); });
  parts.sort((a, b) => a.n - b.n);
  const items = []; let intact = true;
  for (const p of parts) {
    let prev = '';
    for (const e of oarr(p.data.items)) {
      if (e.h !== await auditHash(prev, e)) intact = false;
      prev = e.h || ''; items.push(e);
    }
  }
  const have = new Set(items.map((e) => e.id));
  for (const e of auditQ) if (auditMonthOf(e.at) === month && !have.has(e.id)) items.push(Object.assign({ pending: true }, e));      // entries that are still being written
  items.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  return { month, items, intact };
}
