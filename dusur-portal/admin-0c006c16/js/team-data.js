/**
 * <admin>/js/team-data.js  -  team members, their sign-in, pause / block, and changing the encryption key
 * The team list and roles live in ONE sealed file (data/private/team.json). Each member has a login file (data/private/keys/<hash>.json): their private key,
 * locked with their own password, plus a sealed envelope with the keys the app needs, which only the administrator can issue. A member signs in with a
 * user name and password, then the app re-reads the team list on every save and every few minutes: pause or block takes effect there.
 * Loaded by: admin page
 */
'use strict';

/* =====================================================================
   Team: registry, member files, sign-in, access checks, key change
   ===================================================================== */
const MIN_MEMBER_PW = 10, OWNER_MIN_PW = 12, ACCESS_CHECK_MS = 20000, ACCESS_WATCH_MS = 120000;
const ACCESS_MSG = { paused: 'team.msg.paused', blocked: 'team.msg.blocked', removed: 'team.msg.removed', keys: 'team.msg.keys', token: 'team.msg.token' };
let accessAt = 0, accessTimer = null;

const normUsername = (s) => String(s == null ? '' : s).normalize('NFKC').trim().toLowerCase();
const usernameOk = (s) => /^[a-z0-9][a-z0-9._-]{2,29}$/.test(s);
const slimJwk = (j) => (j && j.kty === 'RSA' ? { kty: 'RSA', n: String(j.n || ''), e: String(j.e || ''), alg: 'RSA-OAEP-256', ext: true } : null);
const normRole = (x) => { x = x || {}; return { id: ostr(x.id, 24), name: ostr(x.name, 40), perms: mkPerms(x.perms) }; };
const normMember = (x) => {
  x = x || {};
  return { id: ostr(x.id, 24), username: normUsername(x.username).slice(0, 30), name: ostr(x.name, 80), role: ostr(x.role, 24), status: MEMBER_STATES.includes(x.status) ? x.status : 'active',
    file: ostr(x.file, 40), pub: slimJwk(x.pub), note: ostr(x.note, 200), created: ostr(x.created, 30), createdBy: ostr(x.createdBy, 80), changed: ostr(x.changed, 30) };
};
// the administrator's own user name + password (works on any device, no GitHub token to type): one more login file, flagged owner
const normOwnerLogin = (x) => (x && x.file && x.username ? { username: normUsername(x.username).slice(0, 30), file: ostr(x.file, 40), pub: slimJwk(x.pub), created: ostr(x.created, 30) } : null);
function normTeam(d) {
  d = d || {};
  const roles = oarr(d.roles).map(normRole).filter((r) => r.id);
  for (const def of defaultRoles()) if (!roles.some((r) => r.id === def.id)) roles.push(def);       // the built-in roles can be edited but never disappear
  return { v: 1, rev: Math.max(0, num(d.rev)), kid: Math.max(1, num(d.kid)), updatedAt: ostr(d.updatedAt, 30), ownerName: ostr(d.ownerName, 80), ownerLogin: normOwnerLogin(d.ownerLogin), roles, users: oarr(d.users).map(normMember).filter((u) => u.id && u.username) };
}
const teamRole = (id) => (team ? team.data.roles.find((r) => r.id === id) : null) || null;
const ownerLabel = () => (team && team.data.ownerName) || t('team.owner');
// who is acting, for the history
const whoAmI = () => { const u = session && session.user; return u ? { id: u.id, name: u.owner ? ownerLabel() : u.name || u.username, role: u.owner ? 'owner' : u.role } : { id: '', name: '', role: '' }; };

/* ---------------- keys and envelopes ---------------- */
async function userFileName(username) { return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode('dsp-user-v1:' + normUsername(username))))).slice(0, 32); }
const RSA_ALG = { name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' };
async function newUserKeys() {
  const kp = await crypto.subtle.generateKey(RSA_ALG, true, ['encrypt', 'decrypt']);
  return { pub: await crypto.subtle.exportKey('jwk', kp.publicKey), priv: await crypto.subtle.exportKey('jwk', kp.privateKey) };
}
// hybrid: a fresh AES key locks the data, the member's public key locks that AES key
async function sealEnvelope(pubJwk, obj) {
  const pub = await crypto.subtle.importKey('jwk', slimJwk(pubJwk), { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt']);
  const raw = rand(32), key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt']), iv = rand(12);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj))));
  return { k: bytesToB64(new Uint8Array(await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, pub, raw))), iv: bytesToB64(iv), ct: bytesToB64(ct) };
}
async function openEnvelope(privJwk, env) {
  const priv = await crypto.subtle.importKey('jwk', privJwk, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['decrypt']);
  const raw = new Uint8Array(await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, priv, b64ToBytes(env.k)));
  const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']);
  return JSON.parse(dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64ToBytes(env.iv) }, key, b64ToBytes(env.ct))));
}
const grantNow = () => ({ m: bytesToB64(session.master.raw), t: session.pat, kid: team ? team.data.kid : 1 });
async function wrapPrivate(password, privJwk) {
  const salt = rand(16), s = await vaultSeal(await deriveVaultKey(password, salt), JSON.stringify(privJwk));
  return { salt: bytesToB64(salt), iv: s.iv, ct: s.ct };
}
async function makeKeyFile(uid, keys, password, must) {
  return Object.assign({ v: 1, uid, pub: slimJwk(keys.pub), env: await sealEnvelope(keys.pub, grantNow()), must: !!must }, await wrapPrivate(password, keys.priv));
}
function genPassword() {
  const A = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s = '';
  rand(15).forEach((b, i) => { if (i && i % 5 === 0) s += '-'; s += A[b % A.length]; });
  return s;
}

/* ---------------- the team file ---------------- */
async function loadTeam(force) {
  if (!force && team) return team;
  await needMaster();
  let data = null, sha = null;
  try { const f = await getFile(TEAM_FILE); sha = f.sha; data = await openObj(f.text); } catch (e) { if (e.status !== 404) throw e; }
  team = { data: normTeam(data), sha };
  if (session) session.teamSha = sha;
  return team;
}
async function saveTeam() {
  team.data.rev += 1; team.data.updatedAt = oiso();
  try { team.sha = await putFile(TEAM_FILE, await sealObj(team.data), 'Update team', team.sha ? { sha: team.sha } : { create: true }); } catch (e) {
    if (e.status === 409 || e.status === 422) throw Object.assign(new Error(t('ops.conflict')), { status: 409 });
    throw e;
  }
  if (session) session.teamSha = team.sha;
}
// apply one change (fn edits the team in place) and save; when another device saved first, read its copy and apply the same change again
async function teamMutate(fn) {
  await loadTeam();
  try {
    for (let attempt = 0; ; attempt++) {
      fn(team.data);
      try { await saveTeam(); break; } catch (e) { if (e.status === 409 && attempt < 2) { await loadTeam(true); continue; } throw e; }
    }
  } catch (e) { team = null; throw e; }
}

/* ---------------- members (the administrator's side) ---------------- */
function validateMember(m, isNew) {
  if (!ostr(m.name, 80)) return t('team.val.name');
  if (isNew) {
    if (!usernameOk(normUsername(m.username))) return t('team.val.username');
    if (team.data.users.some((u) => u.username === normUsername(m.username)) || (team.data.ownerLogin && team.data.ownerLogin.username === normUsername(m.username))) return t('team.val.userTaken');
    if (String(m.password || '').length < MIN_MEMBER_PW) return t('team.val.pw', { n: MIN_MEMBER_PW });
  }
  if (!team.data.roles.some((r) => r.id === m.role)) return t('team.val.role');
  return '';
}
async function addMember(m) {
  await loadTeam();
  const bad = validateMember(m, true); if (bad) throw new Error(bad);
  const username = normUsername(m.username), file = await userFileName(username), keys = await newUserKeys(), uid = 'u-' + hex(rand(5));
  await putFile(KEYS_DIR + file + '.json', JSON.stringify(await makeKeyFile(uid, keys, m.password, true)), 'Add team member');
  await teamMutate((d) => {
    if (d.users.some((u) => u.username === username)) throw new Error(t('team.val.userTaken'));
    d.users.push(normMember({ id: uid, username, name: m.name, role: m.role, status: 'active', file, pub: keys.pub, note: m.note, created: oiso(), createdBy: ownerLabel() }));
  });
  audit({ area: 'team', act: 'create', ref: uid, title: ostr(m.name, 80), note: t('team.audit.added', { role: roleLabel(teamRole(m.role)) }) });
  return uid;
}
const memberById = (id) => (team ? team.data.users.find((u) => u.id === id) : null) || null;
async function setMemberStatus(id, status) {
  await loadTeam();
  const u = memberById(id); if (!u) throw new Error(t('team.gone'));
  const was = u.status, name = u.name, file = u.file;
  await teamMutate((d) => { const x = d.users.find((y) => y.id === id); if (!x) throw new Error(t('team.gone')); x.status = status; x.changed = oiso(); });
  if (status === 'blocked') { try { await delFile(KEYS_DIR + file + '.json'); } catch (_) { /* the registry already says blocked: the app refuses them anyway */ } }
  audit({ area: 'team', act: status === 'active' ? 'resume' : status === 'paused' ? 'pause' : 'block', ref: id, title: name, ch: [['status', was, status]] });
}
async function setMemberRole(id, roleId) {
  await loadTeam(); const u = memberById(id); if (!u) throw new Error(t('team.gone'));
  const was = u.role, name = u.name;
  await teamMutate((d) => { const x = d.users.find((y) => y.id === id); if (!x) throw new Error(t('team.gone')); x.role = roleId; x.changed = oiso(); });
  audit({ area: 'team', act: 'role', ref: id, title: name, ch: [['role', roleLabel(teamRole(was)), roleLabel(teamRole(roleId))]] });
}
// A new password the administrator hands over (the member changes it at the first sign-in). Also how a blocked member gets back in.
async function resetMemberPassword(id, password) {
  await loadTeam(); const u = memberById(id); if (!u) throw new Error(t('team.gone'));
  if (String(password || '').length < MIN_MEMBER_PW) throw new Error(t('team.val.pw', { n: MIN_MEMBER_PW }));
  const keys = await newUserKeys(), was = u.status, name = u.name, file = u.file;
  await putFile(KEYS_DIR + file + '.json', JSON.stringify(await makeKeyFile(id, keys, password, true)), 'Reset team member password');
  await teamMutate((d) => { const x = d.users.find((y) => y.id === id); if (!x) throw new Error(t('team.gone')); x.pub = slimJwk(keys.pub); x.status = 'active'; x.changed = oiso(); });
  audit({ area: 'team', act: 'reset', ref: id, title: name, ch: was === 'active' ? [] : [['status', was, 'active']] });
}
async function removeMember(id) {
  await loadTeam(); const u = memberById(id); if (!u) throw new Error(t('team.gone'));
  const name = u.name, file = u.file;
  await teamMutate((d) => { d.users = d.users.filter((y) => y.id !== id); });
  try { await delFile(KEYS_DIR + file + '.json'); } catch (_) { /* already gone */ }
  audit({ area: 'team', act: 'delete', ref: id, title: name });
}
async function saveRoles(roles) {
  await loadTeam();
  const before = clone(team.data.roles);
  await teamMutate((d) => { d.roles = roles.map(normRole); });
  const ch = [];
  for (const r of team.data.roles) {
    const b = before.find((x) => x.id === r.id);
    if (!b) ch.push(['role ' + roleLabel(r), '', '+']);
    else for (const a of PERM_AREAS) if (b.perms[a] !== r.perms[a]) ch.push([roleLabel(r) + ' · ' + a, String(b.perms[a]), String(r.perms[a])]);
  }
  for (const b of before) if (!team.data.roles.some((r) => r.id === b.id)) ch.push(['role ' + roleLabel(b), '-', '']);
  if (ch.length) audit({ area: 'team', act: 'roles', ref: 'roles', title: t('team.rolesTitle'), ch });
}
async function setOwnerName(name) { await teamMutate((d) => { d.ownerName = ostr(name, 80); }); }
// The administrator's own user name + password. It opens the same private data as the admin password does, on any device, without typing the GitHub token.
// The login file is public (like a member's), so the password must be long: OWNER_MIN_PW characters.
async function setOwnerLogin(username, password) {
  if (!isOwner()) throw new Error(t('perm.noWrite'));
  await loadTeam();
  username = normUsername(username);
  if (!usernameOk(username)) throw new Error(t('team.val.username'));
  if (team.data.users.some((u) => u.username === username)) throw new Error(t('team.val.userTaken'));
  if (String(password || '').length < OWNER_MIN_PW) throw new Error(t('own.val.pw', { n: OWNER_MIN_PW }));
  const old = team.data.ownerLogin, file = await userFileName(username), keys = await newUserKeys();
  const kf = Object.assign(await makeKeyFile('owner', keys, password, false), { owner: true });
  await putFile(KEYS_DIR + file + '.json', JSON.stringify(kf), 'Set administrator sign-in');
  await teamMutate((d) => { d.ownerLogin = normOwnerLogin({ username, file, pub: keys.pub, created: oiso() }); });
  if (old && old.file !== file) { try { await delFile(KEYS_DIR + old.file + '.json'); } catch (_) { /* already gone */ } }
  if (session.user) Object.assign(session.user, { username, keyFile: file });
  audit({ area: 'team', act: old ? 'update' : 'create', ref: 'owner-login', title: t('own.title'), ch: [['username', old ? old.username : '', username]] });
}
async function removeOwnerLogin() {
  if (!isOwner()) throw new Error(t('perm.noWrite'));
  await loadTeam();
  const old = team.data.ownerLogin; if (!old) return;
  await teamMutate((d) => { d.ownerLogin = null; });
  try { await delFile(KEYS_DIR + old.file + '.json'); } catch (_) { /* already gone */ }
  if (session.user && session.user.keyFile === old.file) session.user.keyFile = '';
  audit({ area: 'team', act: 'delete', ref: 'owner-login', title: t('own.title'), ch: [['username', old.username, '']] });
}
// Every member's envelope holds the encryption key and the GitHub token. After the token changed (Configuration) the envelopes are written again.
async function reissueAccess() {
  await loadTeam();
  let done = 0, failed = 0;
  for (const u of team.data.users.concat(team.data.ownerLogin ? [team.data.ownerLogin] : [])) {
    if (u.status === 'blocked' || !u.pub || !u.file) continue;
    try {
      const path = KEYS_DIR + u.file + '.json', f = await getFile(path), kf = JSON.parse(f.text);
      kf.env = await sealEnvelope(u.pub, grantNow());
      await putFile(path, JSON.stringify(kf), 'Update team access', { sha: f.sha }); done++;
    } catch (_) { failed++; }
  }
  if (done) audit({ area: 'team', act: 'access', ref: 'access', title: t('team.accessTitle'), note: t('team.audit.access', { n: nf(done) }) });
  return { done, failed };
}

/* ---------------- changing the encryption key (the full cut-off) ---------------- */
// One commit holds every re-encrypted file, so the repository is never half old / half new. If somebody saved meanwhile the commit is refused and nothing changes.
async function commitMany(files, msg, head, branch) {
  const c = loadCfg(), rb = repoBase(c.user, c.repo), commit = await gh(rb + '/git/commits/' + head), tree = [];
  await pool(files, 4, async (f) => {
    const b = await gh(rb + '/git/blobs', { method: 'POST', body: { content: f.bytes ? bytesToB64(f.bytes) : textToB64(f.text), encoding: 'base64' } });
    tree.push({ path: f.path, mode: '100644', type: 'blob', sha: b.sha });
  });
  const tr = await gh(rb + '/git/trees', { method: 'POST', body: { base_tree: commit.tree.sha, tree } });
  const nc = await gh(rb + '/git/commits', { method: 'POST', body: { message: msg, tree: tr.sha, parents: [head] } });
  try { await gh(rb + '/git/refs/heads/' + encodeURIComponent(branch), { method: 'PATCH', body: { sha: nc.sha, force: false } }); } catch (e) {
    if (e.status === 422 || e.status === 409) throw new Error(t('team.rot.moved'));
    throw e;
  }
}
async function rotateKeys(password, onStep) {
  await flushAudit();                                                          // what is waiting is written with the old key first; then nothing else is written until the new key is in place
  auditHold = true;
  try { return await rotateKeysNow(password, onStep); } finally { auditHold = false; flushAudit(); }
}
async function rotateKeysNow(password, onStep) {
  if (!isOwner()) throw new Error(t('perm.noWrite'));
  if ((ed && ed.dirty) || (opsEd && opsEd.dirty)) throw new Error(t('team.rot.unsaved'));
  const cur = await needMaster();
  let oldVault;
  try { oldVault = await getFile('data/private/vault.json'); if (bytesToB64(await unwrapMaster(password, JSON.parse(oldVault.text))) !== bytesToB64(cur.raw)) throw new Error('x'); } catch (_) { throw new Error(t('team.rot.badPw')); }
  const step = onStep || (() => {});
  const c = loadCfg(), rb = repoBase(c.user, c.repo), branch = (await gh(rb)).default_branch || 'main';
  const head = (await gh(rb + '/git/ref/heads/' + encodeURIComponent(branch))).object.sha;
  const atHead = (path) => contentsUrl(path) + '?ref=' + head;               // read every file as it was at that one commit: a consistent snapshot
  const readAt = async (path) => { const r = await gh(atHead(path)); return b64ToText(r.content); };
  const newRaw = rand(32), newKey = await crypto.subtle.importKey('raw', newRaw, 'AES-GCM', false, ['encrypt', 'decrypt']);
  const sealNew = async (obj) => { const s = await vaultSeal(newKey, JSON.stringify(obj)); return JSON.stringify({ v: 1, iv: s.iv, ct: s.ct }); };
  const lsAt = async (dir) => { try { const r = await gh(atHead(dir)); return Array.isArray(r) ? r.filter((f) => f.type === 'file') : []; } catch (e) { if (e.status === 404) return []; throw e; } };
  const paths = [];
  for (const f of await lsAt('data/private')) if (/^[\w-]+\.json$/.test(f.name) && f.name !== 'vault.json') paths.push(f.path);
  for (const d of [OPS_DIR.replace(/\/$/, ''), AUDIT_DIR.replace(/\/$/, ''), PROFILE_DIR.replace(/\/$/, '')]) for (const f of await lsAt(d)) if (/\.json$/.test(f.name)) paths.push(f.path);
  const binPaths = (await lsAt(ATT_DIR.replace(/\/$/, ''))).filter((f) => /\.bin$/.test(f.name)).map((f) => f.path);         // sealed invoices and pictures of products (bytes, not JSON)
  const files = []; let n = 0, kid = 1; const total = paths.length + binPaths.length;
  step(t('team.rot.reading', { n: nf(total) }));
  await pool(paths, 4, async (p) => {
    const obj = JSON.parse(await vaultOpen(cur.key, JSON.parse(await readAt(p))));
    if (p === TEAM_FILE) { obj.kid = kid = Math.max(1, num(obj.kid)) + 1; obj.rev = num(obj.rev) + 1; obj.updatedAt = oiso(); }
    files.push({ path: p, text: await sealNew(obj) }); step(t('team.rot.sealing', { a: nf(++n), b: nf(total) }));
  });
  await pool(binPaths, 4, async (p) => {
    const plain = await openBytes(cur.key, b64ToBytes((await gh(atHead(p))).content));
    files.push({ path: p, bytes: await sealBytes(newKey, plain) }); step(t('team.rot.sealing', { a: nf(++n), b: nf(total) }));
  });
  if (!paths.includes(TEAM_FILE)) kid = 2;
  const reg = team ? team.data : normTeam(null);
  step(t('team.rot.access'));
  for (const u of reg.users.concat(reg.ownerLogin ? [reg.ownerLogin] : [])) {
    if (u.status === 'blocked' || !u.pub || !u.file) continue;
    const path = KEYS_DIR + u.file + '.json'; let kf;
    try { kf = JSON.parse(await readAt(path)); } catch (_) { continue; }
    kf.env = await sealEnvelope(u.pub, { m: bytesToB64(newRaw), t: session.pat, kid });
    files.push({ path, text: JSON.stringify(kf) });
  }
  files.push({ path: 'data/private/vault.json', text: JSON.stringify(await wrapMaster(password, newRaw)) });
  step(t('team.rot.committing'));
  await commitMany(files, 'Change encryption key', head, branch);
  session.master = { raw: newRaw, key: newKey }; masterP = null; team = null; store = null; ops = {}; opsAlerts = null; profiles = {}; session.settings = null; shaCache.clear();
  audit({ area: 'team', act: 'rotate', ref: 'keys', title: t('team.rot.title'), note: t('team.audit.rotated', { n: nf(files.length) }) });
  return files.length;
}

/* ---------------- a member signs in ---------------- */
const signInError = (code) => Object.assign(new Error(t('team.err.' + code)), { code });
async function memberSignIn(where, username, password) {
  username = normUsername(username);
  if (!usernameOk(username) || !password) throw signInError('wrong');
  const file = await userFileName(username); let res;
  try { res = await fetch(rawUrl(where, KEYS_DIR + file + '.json') + '?t=' + Date.now(), { cache: 'no-store' }); } catch (_) { throw signInError('network'); }
  if (res.status === 404) throw signInError('wrong');                            // an unknown user name looks exactly like a wrong password
  if (!res.ok) throw signInError('network');
  let kf, priv, grant;
  try { kf = await res.json(); } catch (_) { throw signInError('wrong'); }
  try { priv = JSON.parse(await vaultOpen(await deriveVaultKey(password, b64ToBytes(kf.salt)), { iv: kf.iv, ct: kf.ct })); } catch (_) { throw signInError('wrong'); }
  try { grant = await openEnvelope(priv, kf.env); } catch (_) { throw signInError('keys'); }
  const raw = b64ToBytes(grant.m), owner = kf.owner === true;
  session = { key: null, pat: grant.t, pw: null, master: { raw, key: await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']) }, settings: null, cfg: { user: where.user, repo: where.repo },
    user: owner ? Object.assign(ownerUser(), { username, name: username, keyFile: file }) : { id: String(kf.uid || ''), username, owner: false, name: username, role: '', perms: mkPerms({}), status: 'active', keyFile: file }, must: owner ? false : !!kf.must, teamSha: null };
  masterP = null; accessAt = 0; team = null;
  if (owner) {
    // the administrator's own login: it counts only while the (sealed) team file still lists this very file
    try { await loadTeam(true); } catch (e) { session = null; team = null; throw e.status === 401 ? signInError('token') : e; }
    if (!team.data.ownerLogin || team.data.ownerLogin.file !== file) { session = null; team = null; throw signInError('wrong'); }
  } else {
    try { await refreshAccess(true); } catch (e) { session = null; team = null; throw e.access ? signInError(e.access) : e; }
  }
  ls.set(LS_TEAM, JSON.stringify({ user: where.user, repo: where.repo, name: username }));
  armIdle(); watchAccess();
  audit({ area: 'session', act: 'signin', ref: session.user.id, title: owner ? '' : session.user.name });
}
async function changeMemberPassword(oldPw, newPw) {
  const u = session.user, path = KEYS_DIR + u.keyFile + '.json';
  const min = u.owner ? OWNER_MIN_PW : MIN_MEMBER_PW;
  if (String(newPw || '').length < min) throw new Error(t(u.owner ? 'own.val.pw' : 'team.val.pw', { n: min }));
  const f = await getFile(path), kf = JSON.parse(f.text); let priv;
  try { priv = JSON.parse(await vaultOpen(await deriveVaultKey(oldPw, b64ToBytes(kf.salt)), { iv: kf.iv, ct: kf.ct })); } catch (_) { throw new Error(t('acct.wrongOld')); }
  Object.assign(kf, await wrapPrivate(newPw, priv), { must: false });
  await putFile(path, JSON.stringify(kf), 'Change password', { sha: f.sha });
  session.must = false;
  audit({ area: 'session', act: 'password', ref: u.id, title: u.name });
}

/* ---------------- are they still allowed? ---------------- */
const accessFail = (code) => Object.assign(new Error(t(ACCESS_MSG[code])), { access: code });
// Read the team file and apply this person's role and state. Throws an error with .access = 'paused' | 'blocked' | 'removed' | 'keys' | 'token' when they must stop.
async function refreshAccess(force) {
  const u = session && session.user; if (!u || u.owner) return;
  if (!force && Date.now() - accessAt < ACCESS_CHECK_MS) return;
  let f;
  try { f = await getFile(TEAM_FILE); } catch (e) {
    if (e.status === 401) throw accessFail('token');
    if (e.status === 404) throw accessFail('removed');
    if (force) throw e;
    return;                                                                       // a short network problem does not throw anybody out
  }
  accessAt = Date.now();
  if (!force && session.teamSha === f.sha) return;
  let data; try { data = normTeam(await openObj(f.text)); } catch (_) { throw accessFail('keys'); }
  team = { data, sha: f.sha }; session.teamSha = f.sha;
  const me = data.users.find((x) => x.id === u.id); if (!me) throw accessFail('removed');
  const role = data.roles.find((r) => r.id === me.role);
  const perms = mkPerms(role ? role.perms : {});
  if (u.role !== me.role || JSON.stringify(u.perms) !== JSON.stringify(perms)) session.accessChanged = !force;     // the role or its rights changed while this person was working
  u.name = me.name; u.role = me.role; u.perms = perms; u.status = me.status;
  if (me.status !== 'active') throw accessFail(me.status);
}
// before a save: check, and when the answer is "stop", end the session
async function accessGate() {
  try { await refreshAccess(false); } catch (e) { if (e.access) lock(true, e.access); throw e; }
}
function watchAccess() {
  clearInterval(accessTimer);
  if (!session || !session.user || session.user.owner) return;
  const check = () => { if (session && session.user && !session.user.owner) accessGate().then(() => { if (session && session.accessChanged) { session.accessChanged = false; toast(t('team.accessUpdated')); route({ keep: true }); } }, () => {}); };
  accessTimer = setInterval(() => { if (document.visibilityState !== 'hidden') check(); }, ACCESS_WATCH_MS);
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && session && session.user && !session.user.owner) { accessAt = 0; accessGate().catch(() => {}); } });
// called by gh() before every change
async function guardWrite(apiPath) {
  const m = /\/contents\/(.+?)(?:\?|$)/.exec(apiPath), p = m ? decodeURIComponent(m[1]) : '';
  if (!session || !session.user) throw new Error(t('err.relock'));
  if (session.user.owner) return;
  await accessGate();
  if (!canWritePath(p)) throw new Error(t('perm.noWrite'));
}
