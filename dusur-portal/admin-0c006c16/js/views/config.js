/**
 * <admin>/js/views/config.js  -  Configuration screen
 * Connection (owner, repository, token), admin password change, connection code for other devices, wipe.
 * Loaded by: admin page
 */
'use strict';

/* =====================================================================
   Configuration (connection + admin password)
   ===================================================================== */
const CONN_PREFIX = 'DSPCONN1.';
function connCode() { const c = loadCfg(); return CONN_PREFIX + textToB64(JSON.stringify({ v: 1, user: c.user, repo: c.repo, salt: c.salt, iv: c.iv, ct: c.ct })); }
function importConn(code) {
  const raw = String(code || '').trim(); let o = null;
  try { if (raw.startsWith(CONN_PREFIX)) o = JSON.parse(b64ToText(raw.slice(CONN_PREFIX.length))); } catch (_) { o = null; }
  const b64 = /^[A-Za-z0-9+/]+={0,2}$/;
  if (!o || !/^[A-Za-z0-9-]{1,39}$/.test(o.user) || !/^[A-Za-z0-9._-]{1,100}$/.test(o.repo) || !b64.test(o.salt || '') || !b64.test(o.iv || '') || !b64.test(o.ct || '') || o.ct.length > 4000) throw new Error(t('cfg.connBad'));
  try { localStorage.setItem(LS_CFG, JSON.stringify({ user: o.user, repo: o.repo, salt: o.salt, iv: o.iv, ct: o.ct })); } catch (_) { throw new Error(t('cfg.storage')); }
}
function importCard() {
  const box = h('textarea', { id: 'connIn', rows: 3, dir: 'ltr', spellcheck: 'false', placeholder: 'DSPCONN1.…' }), m = msgBox();
  return h('div', { class: 'card stack-sm' }, h('h2', {}, t('cfg.connImportTitle')), h('p', { class: 'hint' }, t('cfg.connImportHint')), box,
    h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'button', id: 'btnConnImport', onclick: () => { try { importConn(box.value); if (location.hash === '#dashboard') route(); else location.hash = '#dashboard'; } catch (e) { setMsg(m, 'bad', e.message); } } }, t('cfg.connImport'))), m);
}
function thisPageCard() {
  const url = location.origin + location.pathname;
  return h('div', { class: 'card stack-sm' }, h('h2', {}, t('cfg.thisPage')), h('p', { class: 'hint' }, t('cfg.thisPageHint')), h('code', { class: 'link', id: 'thisPageUrl' }, url), h('div', { class: 'actions' }, copyBtn(() => url, 'small')));
}
function connCard() {
  const out = h('textarea', { id: 'connOut', rows: 3, readonly: true, dir: 'ltr', hidden: true });
  const cp = copyBtn(() => out.value, 'small'); cp.hidden = true;
  const make = h('button', { class: 'btn', type: 'button', id: 'btnConnMake', onclick: () => { out.value = connCode(); out.hidden = false; cp.hidden = false; } }, t('cfg.connMake'));
  return h('div', { class: 'card stack-sm' }, h('h2', {}, t('cfg.conn')), h('p', { class: 'hint' }, t('cfg.connHint')), h('div', { class: 'actions' }, make, cp), out);
}

function renderConfig() {
  const cfg = loadCfg();
  const f = {
    user: h('input', { id: 'cfgUser', required: true, maxlength: 39, spellcheck: 'false', autocapitalize: 'off', placeholder: 'octocat', dir: 'ltr', readonly: !!cfg }),
    repo: h('input', { id: 'cfgRepo', required: true, maxlength: 100, spellcheck: 'false', autocapitalize: 'off', placeholder: 'my-portal', dir: 'ltr', readonly: !!cfg }),
    pat: h('input', { id: 'cfgPat', type: 'password', autocomplete: 'off', spellcheck: 'false', placeholder: cfg ? t('cfg.keepBlank') : 'github_pat_…', dir: 'ltr' }),
    pw: h('input', { id: 'cfgPw', type: 'password', autocomplete: 'new-password', minlength: MIN_ADMIN_PW, placeholder: cfg ? t('cfg.keepBlank') : '' }),
    pw2: h('input', { id: 'cfgPw2', type: 'password', autocomplete: 'new-password', minlength: MIN_ADMIN_PW }),
  };
  if (cfg) { f.user.value = cfg.user; f.repo.value = cfg.repo; }
  const msg = msgBox();
  const btnSave = h('button', { class: 'btn primary', type: 'submit', id: 'btnSaveCfg' }, t('cfg.save'));
  const btnTest = h('button', { class: 'btn', type: 'button', id: 'btnTest', onclick: onTest }, t('cfg.test'));
  const btnWipe = h('button', { class: 'btn danger', type: 'button', id: 'btnWipe', onclick: wipeConfig, hidden: !cfg }, t('cfg.reset'));

  async function onTest() {
    const user = f.user.value.trim(), repo = f.repo.value.trim(), pat = f.pat.value.trim() || (session && session.pat);
    if (!user || !repo || !pat) return setMsg(msg, 'bad', t('cfg.fillFirst'));
    setMsg(msg, '', t('cfg.testing'));
    try {
      const r = await gh(repoBase(user, repo), { pat });
      const lines = [t('cfg.connected', { repo: r.full_name })]; let kind = 'ok';
      if (r.private) { kind = 'warn'; lines.push(t('cfg.private')); }
      if (r.permissions && r.permissions.push === false) { kind = 'bad'; lines.push(t('cfg.noPush')); }
      try { await gh(repoBase(user, repo) + '/contents/data/private/vault.json', { pat }); lines.push(t('cfg.vaultFound')); } catch (e) { if (e.status === 404) lines.push(t('cfg.vaultNew')); }
      lines.push(t('cfg.writeNote'));
      setMsg(msg, kind, ...lines);
    } catch (e) { setMsg(msg, 'bad', e.message); }
  }

  async function onSave(e) {
    e.preventDefault();
    const user = f.user.value.trim(), repo = f.repo.value.trim(), pat = f.pat.value.trim(), pw = f.pw.value, pw2 = f.pw2.value;
    if (!/^[A-Za-z0-9-]{1,39}$/.test(user)) return setMsg(msg, 'bad', t('cfg.badUser'));
    if (!/^[A-Za-z0-9._-]{1,100}$/.test(repo)) return setMsg(msg, 'bad', t('cfg.badRepo'));
    if (!cfg && (!pat || !pw)) return setMsg(msg, 'bad', t('cfg.needBoth'));
    if (pw && pw.length < MIN_ADMIN_PW) return setMsg(msg, 'bad', t('cfg.pwShort', { n: MIN_ADMIN_PW }));
    if (pw && pw !== pw2) return setMsg(msg, 'bad', t('cfg.pwMismatch'));
    btnSave.disabled = true; btnSave.textContent = t('cfg.saving'); setMsg(msg, '', t('cfg.checking'));
    const prevRaw = ls.get(LS_CFG), prevSession = session, prevMasterP = masterP;
    try {
      const patPlain = pat || (session && session.pat);
      let salt, key;
      if (pw || !cfg) { salt = rand(16); key = await deriveVaultKey(pw, salt); } else { salt = b64ToBytes(cfg.salt); key = session.key; }
      const sealed = await vaultSeal(key, patPlain);
      try { localStorage.setItem(LS_CFG, JSON.stringify({ user, repo, salt: bytesToB64(salt), iv: sealed.iv, ct: sealed.ct })); } catch (_) { throw new Error(t('cfg.storage')); }
      // Work with the NEW token but the OLD password until the vault is open: the vault in the repo is still wrapped with the old one.
      session = { key: cfg ? prevSession.key : key, pat: patPlain, pw: cfg ? prevSession.pw : pw, master: (prevSession && prevSession.master) || null, settings: (prevSession && prevSession.settings) || null, user: ownerUser(), teamSha: null };
      masterP = null;
      const master = await needMaster();                       // creates or opens data/private/vault.json: first real write to the repository
      if (cfg && pw) await putFile('data/private/vault.json', JSON.stringify(await wrapMaster(pw, master.raw)), 'Update vault');
      await loadSettings(); await saveSettings();             // proves the token can write
      await publishBrand();                                    // public company profile for the client site
      session.key = key; session.pw = null;
      audit({ area: 'config', act: cfg ? 'update' : 'create', ref: 'connection', title: user + '/' + repo, ch: [].concat(pat ? [['token', '•••', '•••']] : [], pw ? [['password', '•••', '•••']] : []) });
      let note = '';
      if (cfg && pat) { try { const r = await reissueAccess(); if (r.failed) note = t('cfg.reissuePartial', { n: nf(r.failed) }); } catch (_) { note = t('cfg.reissueFail'); } }       // team members keep working with the new token
      armIdle(); toast(note || t('cfg.saved'), note ? 'bad' : 'ok');
      if (location.hash === '#dashboard') route(); else location.hash = '#dashboard';
    } catch (err) {
      if (prevRaw === null) { try { localStorage.removeItem(LS_CFG); } catch (_) { /* ignore */ } } else ls.set(LS_CFG, prevRaw);
      session = prevSession; masterP = prevMasterP;
      setMsg(msg, 'bad', t('cfg.failed'), err.message);
    } finally { btnSave.disabled = false; btnSave.textContent = t('cfg.save'); }
  }

  mount(h('section', { class: 'stack' },
    h('div', { class: 'page-head' }, h('h1', {}, t('nav.config')), encBadge()),
    h('form', { class: 'card', autocomplete: 'off', novalidate: true, onsubmit: onSave },
      h('p', { class: 'notice' }, cfg ? t('cfg.noticeEdit') : t('cfg.noticeNew')),
      h('div', { class: 'grid2' }, fld('cfg.user', f.user), fld('cfg.repo', f.repo)),
      cfg ? h('p', { class: 'hint' }, t('cfg.repoLocked')) : null,
      fld('cfg.pat', f.pat, 'cfg.patHint'),
      h('div', { class: 'grid2' }, fld('cfg.pw', f.pw), fld('cfg.pw2', f.pw2)),
      h('p', { class: 'hint' }, t('cfg.pwHint', { n: MIN_ADMIN_PW })),
      h('p', { class: 'hint' }, t('cfg.publicHint')),
      h('div', { class: 'actions' }, btnSave, btnTest, btnWipe), msg),
    ...(cfg ? [thisPageCard(), connCard()] : [importCard()])));
}
