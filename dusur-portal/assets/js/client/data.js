/**
 * assets/js/client/data.js  -  what the client site reads from the repository
 * Raw file fetches (raw.githubusercontent.com), the public brand file and the SKU search index.
 * The repository is worked out from the page address, so no repository detail is stored in the code.
 * Loaded by: client page
 */
'use strict';

// Client portal state (the opened project) and the search page state.
let cstate = null;
let home = { q: '', st: 'idle', id: '', sku: '', cipher: null, fails: 0, err: false, busy: false };
let pending = null;            // a project already opened from the search page, handed to the portal route
let brandP = null, indexP = null;
let onBrand = null;           // the search page re-draws its contact card when the company profile arrives

function pagesRepo() {
  const m = location.hostname.match(/^([^.]+)\.github\.io$/i);
  if (!m) return null;
  const seg = location.pathname.split('/').filter(Boolean)[0];
  return { user: m[1], repo: seg && !/\.html?$/i.test(seg) ? seg : m[1] + '.github.io' };
}
async function rawJson(where, path) {                       // the query string sidesteps the ~5 minute raw CDN cache
  let res;
  const early = window.__dsp && window.__dsp.early && window.__dsp.early[path];                   // started by guard.js while the scripts were downloading
  if (early) { delete window.__dsp.early[path]; try { res = await early; } catch (_) { res = null; } }
  if (!res) { try { res = await fetch(rawUrl(where, path) + '?t=' + Date.now(), { cache: 'no-store' }); } catch (_) { throw new Error(t('cl.network')); } }
  if (res.status === 404) { const e = new Error(t('cl.notFound')); e.status = 404; throw e; }
  if (!res.ok) throw new Error(t('cl.serverErr', { s: res.status }));
  try { return await res.json(); } catch (_) { throw new Error(t('cl.badFormat')); }
}
async function fetchPayload(where, id) {
  const j = await rawJson(where, 'data/clients/' + id + '.json');
  if (!j || typeof j.payload !== 'string') throw new Error(t('cl.badFormat'));
  return j.payload;
}
function loadBrand(where) {
  return rawJson(where, 'data/public/brand.json').then((j) => { brand = sanitizeBrand(j); applyBrand(); document.title = brandName() + ' — ' + t('cl.docTitle'); if (onBrand) onBrand(); }, () => {});
}
const loadIndex = (where) => indexP || (indexP = rawJson(where, 'data/public/index.json').then((j) => (j && j.skus) || {}, (e) => { indexP = null; if (e.status === 404) return {}; throw e; }));
