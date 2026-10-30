/**
 * <admin>/js/views/editor-save.js  -  editor save bar
 * Validation, save & publish, delete.
 * Loaded by: admin page
 */
'use strict';

/* ---- Save bar, validation, save, delete ---- */
function saveBar() {
  const state = h('span', { class: 'small muted', role: 'status' });
  const btn = h('button', { class: 'btn primary', type: 'button', id: 'btnSave', onclick: () => saveEditor().catch(() => {}) }, t('ed.save'));
  ed.bar = { state, btn };
  return h('div', { class: 'savebar' }, state, btn);
}
function validateRec(rec) {
  if (!rec.client.name.trim()) return t('val.name');
  if (!waOverrideOk(rec.client.whatsapp)) return t('wa.invalid');
  if (normSecret(rec.secret).length < MIN_SECRET) return t('val.secret', { n: MIN_SECRET });
  const others = new Set(store.items.filter((x) => x.rec.id !== rec.id).flatMap((x) => x.rec.projects.map((p) => p.sku))), mine = new Set();
  for (const p of rec.projects) {
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{2,39}$/.test(p.sku || '')) return t('val.sku', { s: p.sku || '' });
    if (others.has(p.sku) || mine.has(p.sku)) return t('val.skuDup', { s: p.sku }); mine.add(p.sku);
    if (p.startDate && p.dueDate && p.dueDate < p.startDate) return t('val.dates', { s: p.sku });
    if (num(p.price) < 0) return t('val.price', { s: p.sku });
    if ((p.schedule || []).some((x) => !parseDay(x.due))) return t('val.sched', { s: p.sku });
    if ((p.stages || []).some((st) => !(st.name.en || '').trim() && !(st.name.ar || '').trim())) return t('val.stage', { s: p.sku });
  }
  return '';
}
function cleanRec(rec) {
  rec.secret = normSecret(rec.secret); rec.client.name = rec.client.name.trim(); rec.client.whatsapp = String(rec.client.whatsapp || '').trim();
  for (const p of rec.projects) {
    p.title = (p.title || '').trim();
    p.parts = p.parts.filter((x) => (x.name || '').trim()).map((x) => Object.assign(x, { name: x.name.trim(), qty: Math.max(1, Math.round(num(x.qty)) || 1) }));
    p.payments = p.payments.filter((x) => num(x.amount) > 0);
    p.schedule = (p.schedule || []).filter((x) => num(x.amount) > 0);
    for (const x of p.schedule) { x.id = x.id || uid(); x.due = x.due || ''; x.amount = Math.round(num(x.amount) * 100) / 100; x.note = String(x.note || '').trim().slice(0, 80); }       // in place: the rows on screen stay bound to these objects
    p.schedule.forEach((x, k) => { if (x.deposit !== true || p.schedule.findIndex((y) => y.deposit === true) !== k) delete x.deposit; });          // the down payment: at most one row
    p.costs = p.costs.filter((x) => num(x.amount) > 0 || (x.note || '').trim());
    p.bom = (p.bom || []).filter((x) => (x.name || '').trim()).map((x) => Object.assign(x, { name: x.name.trim(), code: (x.code || '').trim(), qty: num(x.qty), cost: num(x.cost) }));
    for (const st of p.stages) st.checklist = (st.checklist || []).filter((i) => (i.text.en || '').trim() || (i.text.ar || '').trim());
  }
}
async function getFileBytes(path) {
  const r = await gh(contentsUrl(path)); if (Array.isArray(r)) throw new Error(t('gh.badFile'));
  if (r.encoding === 'base64' && r.content) return b64ToBytes(r.content);
  const c = loadCfg(), b = await gh(repoBase(c.user, c.repo) + '/git/blobs/' + encodeURIComponent(r.sha));            // a file over 1 MB (a video, a 3D model) is not sent by the contents API: read its blob
  if (b.encoding !== 'base64') throw new Error(t('gh.badFile'));
  return b64ToBytes(b.content);
}
async function rekeyPhotos(rec, oldSecret) {
  const ok = await imageKey(oldSecret, rec.id), nk = await imageKey(rec.secret, rec.id);
  const paths = [];
  for (const p of rec.projects) { for (const ph of p.photos) paths.push(...photoFiles(rec.id, ph)); for (const d of p.downloads || []) paths.push(...dlFiles(rec.id, d)); }
  let missing = 0;                                                  // a file that is no longer in the repository cannot be re-sealed: it must not stop the key change
  for (const path of paths) {
    let bytes; try { bytes = await getFileBytes(path); } catch (e) { if (e.status === 404) { missing++; continue; } throw e; }
    await putFile(path, await sealBytes(nk, await openBytes(ok, bytes)), 'Re-encrypt file');
  }
  return missing;
}

async function saveEditor(quiet) {
  if (!ed || ed.saving) return;
  const rec = ed.rec, wasNew = ed.isNew;
  cleanRec(rec);
  const bad = validateRec(rec); if (bad) { toast(bad, 'bad'); return; }
  ed.saving = true; syncSaveBar();
  try {
    await needMaster();
    let missingFiles = 0;
    if (!ed.isNew && rec.secret !== ed.origSecret && hasFilePhotos(rec)) missingFiles = await rekeyPhotos(rec, ed.origSecret);
    rec.updatedAt = new Date().toISOString();
    if (ed.isNew) {
      for (let a = 0; ; a++) {
        try { ed.sha = await savePrivate(rec, null); break; } catch (e) { if (e.status === 422 && a < 5 && !hasFilePhotos(rec)) { rec.id = nextClientId(); continue; } throw e; }
      }
      ed.isNew = false; ed.id = rec.id;
    } else ed.sha = await savePrivate(rec, ed.sha);
    const entry = { rec: clone(rec), sha: ed.sha };
    const k = store.items.findIndex((x) => x.rec.id === rec.id);
    if (k >= 0) store.items[k] = entry; else store.items.unshift(entry);
    await publishClient(rec);                                  // if this fails the private copy is saved and the client still sees the old version
    if (ed.seqBump) { await saveSettings(); ed.seqBump = false; }
    for (const path of ed.trash.splice(0)) { try { await delFile(path); } catch (_) { /* best effort */ } }
    auditSave('client', wasNew ? 'create' : 'update', rec.id, rec.client.name, ed.base, rec); ed.base = clone(rec);
    ed.origSecret = rec.secret; ed.dirty = false; ed.savedAt = new Date().toISOString();
    if (!quiet) toast(t('ed.saved'), 'ok');
    if (missingFiles) toast(t('ed.rekeyMissing', { n: nf(missingFiles) }), 'bad');
    if (wasNew) history.replaceState(null, '', '#manage/' + rec.id);
    ed.saving = false;
    const y = window.scrollY; (ed.redraw || renderEditor)(); window.scrollTo(0, y);   // redraw the screen that is open (editor, progress or contract) without jumping to the top
  } catch (e) {
    ed.saving = false; syncSaveBar();
    toast(e.status === 409 ? t('ed.conflict') : e.message, 'bad'); // the private copy may already be saved: keep editing and save again to publish
    throw e;
  }
}

async function deleteClientAction() {
  if (!ed || ed.isNew) return;
  if (!confirm(t('ed.delClientConfirm', { n: ed.rec.client.name || ed.rec.id }))) return;
  const rec = ed.rec;
  try {
    await needMaster(); await deleteClient(rec);
    store.items = store.items.filter((x) => x.rec.id !== rec.id);
    audit({ area: 'client', act: 'delete', ref: rec.id, title: rec.client.name }); ed.dirty = false; ed = null; toast(t('ed.deleted'), 'ok'); location.hash = '#dashboard';
  } catch (e) { toast(e.message, 'bad'); }
}
