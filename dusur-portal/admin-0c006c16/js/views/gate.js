/**
 * <admin>/js/views/gate.js  -  sign-in screen
 * Two ways in: the administrator (admin password) and a team member (user name + password, given by the administrator).
 * Also shows why a session was ended (paused, blocked, keys changed) and leads to the troubleshooting screen.
 * Loaded by: admin page
 */
'use strict';

/* =====================================================================
   Sign-in
   ===================================================================== */
const REPO_PAIR = /^([A-Za-z0-9-]{1,39})\/([A-Za-z0-9._-]{1,100})$/;
// where the data repository probably is: the address this page was opened from (user.github.io/<repo>/…)
function guessRepo() {
  const hm = location.hostname.match(/^([^.]+)\.github\.io$/i); if (!hm) return '';
  const seg = location.pathname.split('/').filter(Boolean)[0];
  return hm[1] + '/' + (seg && !/\.html?$/i.test(seg) && !/^admin-[0-9a-f]{8}$/.test(seg) ? seg : hm[1] + '.github.io');
}
// after signing in: a member who must choose a password goes to Account; otherwise the page that was asked for opens (a bookmarked link keeps working), or the dashboard
const goHome = () => {
  const here = location.hash, keep = here && here !== '#' && !/^#(signin|join\/|doctor$)/.test(here);
  const dest = session && session.must ? '#account' : keep ? here : '#dashboard';
  if (location.hash === dest) route(); else location.hash = dest;
};

function renderLocked() {
  const cfg = loadCfg(), join = /^#join\/([A-Za-z0-9-]{1,39})\/([A-Za-z0-9._-]{1,100})$/.exec(location.hash);
  let mode = join || location.hash === '#signin' || !cfg ? 'team' : ls.get('dsp.mode') === 'team' ? 'team' : 'admin';
  const note = lockNote; lockNote = '';
  const box = h('div', { class: 'gatebox' });

  const tabs = () => (cfg ? h('div', { class: 'tabs gate-tabs', role: 'tablist', 'aria-label': t('lock.who') },
    [['admin', 'lock.tabAdmin'], ['team', 'lock.tabTeam']].map(([k, key]) => h('button', { class: 'tab', type: 'button', role: 'tab', id: 'gateTab-' + k, 'aria-selected': String(mode === k),
      onclick: () => { mode = k; ls.set('dsp.mode', k); draw(); } }, t(key)))) : null);
  const shell = (title, sub, ...body) => h('div', { class: 'card gate' }, h('div', { class: 'gate-icon' }, icon('lock')), h('h1', {}, title), h('p', { class: 'muted' }, sub),
    note ? h('p', { class: 'msg warn', role: 'alert', id: 'lockNote' }, note) : null, tabs(), body, h('a', { class: 'small', href: '#doctor', id: 'lnkDoctor' }, t('lock.trouble')));

  function adminForm() {
    const err = h('p', { class: 'msg bad', role: 'alert', hidden: true });
    const pw = h('input', { id: 'lockPw', type: 'password', required: true, autocomplete: 'current-password', placeholder: t('lock.placeholder'), 'aria-label': t('lock.placeholder') });
    const btn = h('button', { class: 'btn primary', type: 'submit' }, t('lock.unlock'));
    const reset = h('button', { class: 'btn ghost small', type: 'button', onclick: wipeConfig }, t('lock.forgot'));
    const form = h('form', { class: 'stack-sm', onsubmit: async (e) => {
      e.preventDefault(); btn.disabled = true; btn.textContent = t('lock.unlocking'); err.hidden = true;
      if (await unlock(pw.value)) { goHome(); return; }
      await sleep(500); err.textContent = t('lock.wrong'); err.hidden = false; btn.disabled = false; btn.textContent = t('lock.unlock'); pw.select();
    } }, pw, err, btn, reset);
    setTimeout(() => pw.focus(), 0);
    return shell(t('lock.title'), t('lock.sub'), form);
  }

  function teamForm() {
    let saved = null; try { saved = JSON.parse(ls.get(LS_TEAM) || 'null'); } catch (_) { saved = null; }
    const repoVal = join ? join[1] + '/' + join[2] : saved && saved.user ? saved.user + '/' + saved.repo : guessRepo();
    const err = h('p', { class: 'msg bad', role: 'alert', hidden: true, id: 'tmErr' });
    const user = h('input', { id: 'tmUser', required: true, autocomplete: 'username', autocapitalize: 'off', spellcheck: 'false', dir: 'ltr', maxlength: 30, placeholder: t('lock.userPh'), 'aria-label': t('lock.userPh'), value: saved && saved.name ? saved.name : '' });
    const pw = h('input', { id: 'tmPw', type: 'password', required: true, autocomplete: 'current-password', placeholder: t('lock.placeholder'), 'aria-label': t('lock.placeholder') });
    const repo = h('input', { id: 'tmRepo', autocapitalize: 'off', spellcheck: 'false', dir: 'ltr', maxlength: 140, placeholder: 'owner/repository', 'aria-label': t('lock.repo'), value: repoVal });
    const btn = h('button', { class: 'btn primary', type: 'submit', id: 'btnTmSignIn' }, t('lock.signIn'));
    const form = h('form', { class: 'stack-sm', onsubmit: async (e) => {
      e.preventDefault(); err.hidden = true;
      const m = REPO_PAIR.exec(repo.value.trim());
      if (!m) { err.textContent = t('lock.repoBad'); err.hidden = false; repo.closest('details').open = true; return; }
      btn.disabled = true; btn.textContent = t('lock.signingIn');
      try { await memberSignIn({ user: m[1], repo: m[2] }, user.value, pw.value); goHome(); } catch (ex) {
        await sleep(400); err.textContent = ex.message; err.hidden = false; btn.disabled = false; btn.textContent = t('lock.signIn'); pw.select();
      }
    } }, user, pw, err, btn,
    h('details', { class: 'fbimport', open: !repoVal }, h('summary', {}, t('lock.firstTime')), h('div', { class: 'stack-sm' }, h('p', { class: 'hint' }, t('lock.firstTimeHint')), repo)),
    cfg ? null : h('a', { class: 'small', href: '#config', id: 'lnkSetup' }, t('lock.setup')));
    setTimeout(() => (user.value ? pw : user).focus(), 0);
    return shell(t('lock.teamTitle'), t('lock.teamSub'), form);
  }

  const draw = () => box.replaceChildren(mode === 'team' ? teamForm() : adminForm());
  draw(); mount(box);
}
function wipeConfig() {
  if (!confirm(t('cfg.resetConfirm'))) return;
  try { localStorage.removeItem(LS_CFG); } catch (_) { /* ignore */ }
  session = null; store = null; ed = null; masterP = null; clearTimeout(idleTimer); clearImages();
  if (location.hash === '#config') route(); else location.hash = '#config';
}
