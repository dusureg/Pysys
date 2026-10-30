/**
 * <admin>/js/session.js  -  connection config, unlock, lock, idle timer
 * The sealed connection config lives in localStorage; the GitHub token is decrypted only into memory while unlocked.
 * Loaded by: admin page
 */
'use strict';

/* =====================================================================
   Admin config + session
   ===================================================================== */
// the connection settings: a team member's session carries its own (nothing is stored on their device), the administrator's are sealed in localStorage
const loadCfg = () => { if (session && session.cfg) return session.cfg; try { return JSON.parse(localStorage.getItem(LS_CFG) || 'null'); } catch (_) { return null; } };
const saveCfg = (c) => localStorage.setItem(LS_CFG, JSON.stringify(c));

async function unlock(password) {
  const cfg = loadCfg();
  if (!cfg || !password) return false;
  try {
    const key = await deriveVaultKey(password, b64ToBytes(cfg.salt));
    const pat = await vaultOpen(key, { iv: cfg.iv, ct: cfg.ct });
    session = { key, pat, pw: password, master: null, settings: null, user: ownerUser(), teamSha: null }; masterP = null;
    armIdle(); return true;
  } catch (_) { return false; }
}
const idleMs = () => { const m = parseInt(ls.get('dsp.idle'), 10); return ([5, 15, 30, 60].includes(m) ? m : 15) * 60000; };
function armIdle() { clearTimeout(idleTimer); if (session) idleTimer = setTimeout(() => lock(true), idleMs()); }
// End the session. note = why (a team member who was paused or blocked, or whose keys changed): shown on the sign-in screen.
function lock(auto, note) {
  const who = session && session.user;
  if (who && session.master) audit({ area: 'session', act: note ? 'forced' : auto ? 'autolock' : 'signout', ref: who.id, title: who.owner ? '' : who.name, note: note ? t(ACCESS_MSG[note]) : '' });
  const done = () => {
    session = null; masterP = null; ed = null; store = null; draftTypes = null; draftSet = null; ops = {}; opsEd = null; opsAlerts = null; team = null; profiles = {}; auditQ = []; shaCache.clear();
    clearTimeout(idleTimer); clearInterval(accessTimer);
    document.querySelectorAll('dialog').forEach((d) => d.close()); clearImages();
    lockNote = note ? t(ACCESS_MSG[note]) : '';
    if (who && !who.owner && !/^#(signin|join\/)/.test(location.hash)) history.replaceState(null, '', '#signin');           // a member lands on the sign-in page, not on the administrator's setup
    if (auto && !note) toast(t('lock.auto'));
    route();
  };
  // the last entries of the history are written before the keys are forgotten (a forced stop is not allowed to write any more)
  if (who && session.master && !note && auditQ.length) Promise.race([flushAudit(), sleep(2500)]).then(done, done); else done();
}
['pointerdown', 'keydown', 'touchstart'].forEach((ev) => addEventListener(ev, () => { if (session) armIdle(); }, { passive: true }));
