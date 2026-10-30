/**
 * <admin>/js/github.js  -  GitHub REST API (contents)
 * get / put / delete / list files in the repository. Writes are serialised because concurrent commits to one branch conflict.
 * Loaded by: admin page
 */
'use strict';

/* =====================================================================
   GitHub REST API (writes are serialised: concurrent commits to one branch conflict)
   ===================================================================== */
function ghError(status, data) {
  const m = data && data.message ? ': ' + data.message : '';
  switch (status) {
    case 401: return t('gh.401');
    case 403: return t('gh.403', { m });
    case 404: return t('gh.404');
    case 409: return t('gh.409');
    case 422: return t('gh.422', { m });
    default: return t('gh.other', { s: status, m });
  }
}
let wq = Promise.resolve();
const queueWrite = (fn) => { const p = wq.then(fn, fn); wq = p.catch(() => {}); return p; };
function gh(path, o = {}) {
  const run = async () => {
    if (o.method && o.method !== 'GET' && !o.pat) await guardWrite(path);        // the role may not cover this file: stop before anything is sent
    const token = o.pat || (session && session.pat);
    let res;
    try {
      res = await fetch(GH + path, {
        method: o.method || 'GET', cache: 'no-store',
        headers: Object.assign({ Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + token }, o.body ? { 'Content-Type': 'application/json' } : {}),
        body: o.body ? JSON.stringify(o.body) : undefined,
      });
    } catch (_) { throw new Error(t('gh.network')); }
    let data = null; try { data = await res.json(); } catch (_) { /* empty body */ }
    if (!res.ok) { const err = new Error(ghError(res.status, data)); err.status = res.status; throw err; }
    return data;
  };
  return o.method && o.method !== 'GET' ? queueWrite(run) : run();
}
const repoBase = (u, r) => '/repos/' + encodeURIComponent(u) + '/' + encodeURIComponent(r);
const contentsUrl = (path) => { const c = loadCfg(); return repoBase(c.user, c.repo) + '/contents/' + path.split('/').map(encodeURIComponent).join('/'); };
const shaCache = new Map();
// a team member's name is put in front of the commit message, so GitHub's own history says who saved it too
const commitMsg = (m) => (session && session.user && !session.user.owner && session.user.name ? '[' + session.user.name.slice(0, 40) + '] ' : '') + m;

async function getFile(path) {
  const r = await gh(contentsUrl(path));
  if (Array.isArray(r) || r.encoding !== 'base64') throw new Error(t('gh.badFile'));
  shaCache.set(path, r.sha); return { sha: r.sha, text: b64ToText(r.content) };
}
async function getSha(path) {
  try { const r = await gh(contentsUrl(path)); return Array.isArray(r) ? null : r.sha; } catch (e) { if (e.status === 404) return null; throw e; }
}
// opt.create: must not exist · opt.sha: strict update against a known version · default: create or overwrite
async function putFile(path, data, msg, opt = {}) {
  const content = typeof data === 'string' ? textToB64(data) : bytesToB64(data);
  const send = async (sha) => {
    const r = await gh(contentsUrl(path), { method: 'PUT', body: Object.assign({ message: commitMsg(msg), content }, sha ? { sha } : {}) });
    shaCache.set(path, r.content.sha); return r.content.sha;
  };
  if (opt.create) return send(null);
  if (opt.sha) return send(opt.sha);
  const first = shaCache.has(path) ? shaCache.get(path) : await getSha(path);        // a file this session has not seen yet: ask for its version first, instead of a PUT that GitHub answers with 422
  try { return await send(first); } catch (e) {
    if (e.status !== 409 && e.status !== 422) throw e;
    const cur = await getSha(path); shaCache.set(path, cur); return send(cur);
  }
}
async function delFile(path, msg, sha) {
  sha = sha || await getSha(path); if (!sha) return;
  await gh(contentsUrl(path), { method: 'DELETE', body: { message: commitMsg(msg || 'Delete ' + path), sha } }); shaCache.delete(path);
}
async function listDir(path) {
  try { const r = await gh(contentsUrl(path)); return Array.isArray(r) ? r : []; } catch (e) {
    if (e.status !== 404) throw e;
    const c = loadCfg(); await gh(repoBase(c.user, c.repo)); // throws a clear error if the repo itself is unreachable
    return [];
  }
}
async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) await fn(items[i++]); }));
}
function shareLink(id) {
  const c = loadCfg();
  const base = c.repo.toLowerCase() === c.user.toLowerCase() + '.github.io' ? 'https://' + c.user + '.github.io/' : 'https://' + c.user + '.github.io/' + c.repo + '/';
  return base + '#client/' + id;
}
