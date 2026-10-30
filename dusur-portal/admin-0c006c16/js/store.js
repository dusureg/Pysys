/**
 * <admin>/js/store.js  -  repository store: vault, settings, private records, publishing, photos
 * needMaster() unlocks the vault, load/save settings and records, publishClient() writes the encrypted snapshot and updates the search index,
 * publishBrand() writes the public company profile, makeVariants() prepares photo thumbnails.
 * Loaded by: admin page
 */
'use strict';

/* =====================================================================
   Repository store: vault, settings, private records, publishing, photos
   ===================================================================== */
function needMaster() {
  if (!session) return Promise.reject(new Error(t('err.relock')));
  if (session.master) return Promise.resolve(session.master);
  if (masterP) return masterP;
  masterP = (async () => {
    const pw = session.pw; if (!pw) throw new Error(t('err.relock'));
    let vault = null;
    try { vault = JSON.parse((await getFile('data/private/vault.json')).text); } catch (e) { if (e.status !== 404) throw e; }
    let raw;
    if (vault) { try { raw = await unwrapMaster(pw, vault); } catch (_) { throw new Error(t('err.vaultPw')); } } else {
      raw = rand(32); await putFile('data/private/vault.json', JSON.stringify(await wrapMaster(pw, raw)), 'Initialize private vault', { create: true });
    }
    session.master = { raw, key: await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']) };
    session.pw = null;
    if (session.user && session.user.owner) audit({ area: 'session', act: 'signin', ref: 'owner' });          // the administrator's sign-in is written to the history once the key is open
    return session.master;
  })().catch((e) => { masterP = null; throw e; });
  return masterP;
}
async function loadSettings() {
  if (session.settings) return session.settings;
  await needMaster();
  try { session.settings = await openObj((await getFile('data/private/settings.json')).text); } catch (e) {
    if (e.status !== 404) throw e; session.settings = defaultSettings();
  }
  const st = session.settings;
  st.brand = sanitizeBrand(st.brand); if (st.defaultDays === undefined) st.defaultDays = 30; if (!st.reportFooter) st.reportFooter = { en: '', ar: '' };
  st.contract = normContract(st.contract); if (typeof st.inboxKey !== 'string') st.inboxKey = ''; st.codes = normCodes(st.codes); st.paper = normPaper(st.paper); st.labels = normLabels(st.labels); st.brands = normBrands(st.brands); st.costCats = normCostCats(st.costCats); applyCostCats(st.costCats);
  brand = st.brand; applyBrand();
  CUR = st.currency || 'EGP'; return st;
}
async function saveSettings() { await putFile('data/private/settings.json', await sealObj(session.settings), 'Update settings'); }
async function savePrivate(rec, sha) {
  const clean = clone(rec); delete clean._sha;
  const body = await sealObj(clean), path = 'data/private/' + rec.id + '.json';
  return sha ? putFile(path, body, 'Update ' + rec.id, { sha }) : putFile(path, body, 'Add ' + rec.id, { create: true });
}
async function publishClient(rec) {
  const cipher = await encryptRecord(toPublic(rec), rec.secret);
  await putFile('data/clients/' + rec.id + '.json', JSON.stringify({ payload: cipher }), 'Publish ' + rec.id);
  await updateIndex(rec, false);
}
// Public company profile for the client site (public on purpose: name, contacts, logo)
async function publishBrand() {
  brand = sanitizeBrand(session.settings.brand); session.settings.brand = brand; applyBrand();
  await putFile('data/public/brand.json', JSON.stringify(brand), 'Update company profile');
}
// Client-site live search by SKU: one-way hash of each SKU -> client id (no names, no phones)
async function updateIndex(rec, remove) {
  const path = 'data/public/index.json'; let idx = { v: 1, skus: {} };
  try { idx = JSON.parse((await getFile(path)).text); } catch (e) { if (e.status !== 404) throw e; }
  const skus = idx.skus || (idx.skus = {});
  for (const k of Object.keys(skus)) if (skus[k] === rec.id) delete skus[k];
  if (!remove) for (const p of rec.projects) skus[await skuKey(p.sku)] = rec.id;
  await putFile(path, JSON.stringify(idx), 'Update search index');
}
async function loadPrivate(id) {
  const f = await getFile('data/private/' + id + '.json'); const rec = normalizeRec(await openObj(f.text)); return { rec, sha: f.sha };
}
async function deleteClient(rec) {
  for (const f of await listDir('data/clients/' + rec.id)) await delFile(f.path, 'Delete photo', f.sha);
  await delFile('data/clients/' + rec.id + '.json', 'Delete ' + rec.id);
  await delFile('data/private/' + rec.id + '.json', 'Delete ' + rec.id);
  await updateIndex(rec, true);
}

// Photos
async function makeVariants(file) {
  if (file.size > 30 * 1024 * 1024) throw new Error(t('ph.tooBig', { name: file.name }));
  let bmp; try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (_) { throw new Error(t('ph.unsupported', { name: file.name })); }
  const encode = async (max, q) => {
    const sc = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * sc)), hh = Math.max(1, Math.round(bmp.height * sc));
    const c = document.createElement('canvas'); c.width = w; c.height = hh;
    const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, hh); ctx.drawImage(bmp, 0, 0, w, hh);
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', q));
    if (!blob) throw new Error(t('ph.unsupported', { name: file.name }));
    return new Uint8Array(await blob.arrayBuffer());
  };
  try { return { thumb: await encode(360, 0.72), full: await encode(1600, 0.82) }; } finally { if (bmp.close) bmp.close(); }
}
