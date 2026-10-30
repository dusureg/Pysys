/**
 * <admin>/js/views/doctor.js  -  the troubleshooter (#doctor)
 * Works before sign-in. Runs a list of small checks one after the other (browser, files of this page, GitHub, the repository, the data files),
 * shows each result with what to do about it, and can copy the whole report to send to whoever helps. Nothing is changed by a check.
 * Loaded by: admin page
 */
'use strict';

/* =====================================================================
   Troubleshooter
   ===================================================================== */
const DOC_TIMEOUT = 12000;
const docFetch = (url, o) => { const ac = new AbortController(), tm = setTimeout(() => ac.abort(), DOC_TIMEOUT); return fetch(url, Object.assign({ cache: 'no-store', signal: ac.signal }, o || {})).finally(() => clearTimeout(tm)); };
const DOC_OK = (d) => ({ s: 'ok', d: d || '' }), DOC_WARN = (d) => ({ s: 'warn', d: d || '' }), DOC_BAD = (d) => ({ s: 'bad', d: d || '' }), DOC_SKIP = (d) => ({ s: 'skip', d: d || '' });
let docRate = null;                          // the answer of the GitHub rate-limit call, shared by two checks

// [id, run]; the order is the order on the screen. Each run() returns { s: ok | warn | bad | skip, d: detail }.
const DOC_CHECKS = [
  ['secure', async () => (window.isSecureContext && crypto && crypto.subtle ? DOC_OK(location.protocol + '//' + location.host) : DOC_BAD(location.protocol + '//' + location.host))],
  ['storage', async () => { try { localStorage.setItem('dsp.doc', '1'); localStorage.removeItem('dsp.doc'); return DOC_OK(); } catch (e) { return DOC_BAD(e.message); } }],
  ['libs', async () => (window.CryptoJS ? DOC_OK('CryptoJS ' + (CryptoJS.version || '4.2')) : DOC_BAD())],
  ['features', async () => {
    const miss = [['createImageBitmap', 'photos'], ['TextEncoder', 'text'], ['AbortController', 'network'], ['Intl', 'numbers']].filter(([k]) => typeof window[k] === 'undefined').map(([, w]) => w);
    return miss.length ? DOC_BAD(miss.join(', ')) : DOC_OK(navigator.userAgent.slice(0, 80));
  }],
  ['files', async () => {
    const list = [...document.scripts].map((s) => s.src).filter((u) => u && u.startsWith(location.origin)); if (!list.length) return DOC_SKIP();
    const bad = []; await pool(list, 6, async (u) => { try { const r = await docFetch(u, { method: 'HEAD' }); if (!r.ok) bad.push(u.replace(location.origin, '') + ' (' + r.status + ')'); } catch (_) { bad.push(u.replace(location.origin, '') + ' (network)'); } });
    return bad.length ? DOC_BAD(bad.slice(0, 6).join(' · ') + (bad.length > 6 ? ' …' : '')) : DOC_OK(t('doc.d.files', { n: nf(list.length) }));
  }],
  ['fonts', async () => { try { await document.fonts.ready; return document.fonts.check('12px "IBM Plex Sans"') ? DOC_OK('IBM Plex') : DOC_WARN(t('doc.d.sysfont')); } catch (_) { return DOC_SKIP(); } }],
  ['github', async () => {
    try {
      const r = await docFetch('https://api.github.com/rate_limit'); if (!r.ok) return DOC_BAD('HTTP ' + r.status);
      docRate = (await r.json()).resources.core; const left = docRate.remaining;
      return left < 10 ? DOC_WARN(t('doc.d.rate', { n: nf(left), m: nf(Math.max(1, Math.round((docRate.reset * 1000 - Date.now()) / 60000))) })) : DOC_OK(t('doc.d.rateOk', { n: nf(left) }));
    } catch (e) { return DOC_BAD(e.name === 'AbortError' ? t('doc.d.timeout') : e.message); }
  }],
  ['clock', async () => {
    if (!docRate) return DOC_SKIP();
    const ahead = docRate.reset * 1000 - Date.now();                    // the limit resets within the next hour: a clock that disagrees by more than a few minutes shows up here
    return ahead < -300000 || ahead > 3900000 ? DOC_WARN(new Date().toString().slice(0, 33)) : DOC_OK(new Date().toLocaleString(locale()));
  }],
  ['repo', async () => {
    const c = loadCfg(); if (!c) return DOC_SKIP(t('doc.d.noCfg'));
    if (!session) return DOC_SKIP(t('doc.d.signFirst'));
    try {
      const r = await gh(repoBase(c.user, c.repo));
      if (r.permissions && r.permissions.push === false) return DOC_BAD(r.full_name + ' · ' + t('doc.d.readOnly'));
      return r.private ? DOC_WARN(r.full_name + ' · ' + t('doc.d.private')) : DOC_OK(r.full_name);
    } catch (e) { return DOC_BAD(e.status === 401 ? t('doc.d.token') : e.status === 404 ? t('doc.d.notFound') : e.message); }
  }],
  ['site', async () => {
    const c = loadCfg(); if (!c) return DOC_SKIP(t('doc.d.noCfg'));
    try { const r = await docFetch(rawUrl(c, 'data/public/brand.json') + '?t=' + Date.now()); return r.ok ? DOC_OK() : r.status === 404 ? DOC_WARN(t('doc.d.noBrand')) : DOC_BAD('HTTP ' + r.status); } catch (e) { return DOC_BAD(e.name === 'AbortError' ? t('doc.d.timeout') : e.message); }
  }],
  ['vault', async () => {
    if (!session) return DOC_SKIP(t('doc.d.signFirst'));
    try { await getFile('data/private/vault.json'); return DOC_OK(); } catch (e) { return e.status === 404 ? DOC_WARN(t('doc.d.noVault')) : DOC_BAD(e.message); }
  }],
  ['data', async () => {
    if (!session) return DOC_SKIP(t('doc.d.signFirst'));
    try {
      await needMaster(); const st = await loadSettings(); const files = (await listDir('data/private')).filter((f) => f.type === 'file' && /^[\w-]+\.json$/.test(f.name) && !['vault.json', 'settings.json', 'team.json'].includes(f.name));
      const bad = []; await pool(files, 5, async (f) => { try { normalizeRec(await openObj((await getFile(f.path)).text)); } catch (_) { bad.push(f.name); } });
      return bad.length ? DOC_BAD(t('doc.d.badFiles', { f: bad.slice(0, 5).join(', ') })) : DOC_OK(t('doc.d.dataOk', { n: nf(files.length), c: st.currency || '' }));
    } catch (e) { return DOC_BAD(e.message); }
  }],
  ['history', async () => {
    if (!session) return DOC_SKIP(t('doc.d.signFirst'));
    if (auditQ.length) return DOC_WARN(t('aud.waiting', { n: nf(auditQ.length) }) + (auditErr ? ' · ' + auditErr : ''));
    try { const m = await auditMonths(); return DOC_OK(t('doc.d.months', { n: nf(m.length) })); } catch (e) { return DOC_BAD(e.message); }
  }],
  ['me', async () => {
    if (!session || !session.user) return DOC_SKIP(t('doc.d.signFirst'));
    const u = session.user; return DOC_OK(u.owner ? t('team.owner') : (u.name || u.username) + ' · ' + roleLabel(teamRole(u.role)));
  }],
];
const DOC_ICON = { ok: 'check', warn: 'alert', bad: 'alert', skip: 'circle' };
const DOC_CLS = { ok: 'done', warn: 'progress', bad: 'late', skip: 'pending' };

async function renderDoctor(token) {
  const results = {}, list = h('ul', { class: 'doclist', id: 'docList' }), sumBox = h('p', { class: 'msg', id: 'docSummary', role: 'status', hidden: true });
  let running = false;
  const row = (id) => {
    const r = results[id], s = r ? r.s : 'wait';
    return h('li', { class: 'docrow ' + s, id: 'doc-' + id, 'data-status': s },
      h('span', { class: 'badge ' + (DOC_CLS[s] || 'pending') }, r ? icon(DOC_ICON[s]) : h('span', { class: 'spin sm', 'aria-hidden': 'true' }), t('doc.s.' + (r ? s : 'wait'))),
      h('div', { class: 'stack-xs' }, h('strong', {}, t('doc.c.' + id)), r && r.d ? h('span', { class: 'small muted', dir: 'auto' }, r.d) : null,
        r && (r.s === 'bad' || r.s === 'warn') ? h('span', { class: 'small', dir: 'auto' }, t('doc.fix.' + id)) : null));
  };
  const paint = () => list.replaceChildren(...DOC_CHECKS.map(([id]) => row(id)));
  const report = () => ['Dusur portal · ' + new Date().toISOString() + ' · ' + location.href.split('#')[0]].concat(DOC_CHECKS.map(([id]) => '[' + (results[id] ? results[id].s : '-') + '] ' + t('doc.c.' + id) + (results[id] && results[id].d ? ' — ' + results[id].d : ''))).concat(window.__dsp && window.__dsp.errs.length ? ["errors: " + window.__dsp.errs.join(" | ")] : []).join('\n');
  async function run() {
    if (running) return; running = true; for (const k of Object.keys(results)) delete results[k]; docRate = null; sumBox.hidden = true; paint(); btnRun.disabled = true;
    for (const [id, fn] of DOC_CHECKS) {
      let r; try { r = await fn(); } catch (e) { r = DOC_BAD(e && e.message ? e.message : String(e)); }
      results[id] = r; if (token !== routeToken) { running = false; return; } paint();
    }
    const bad = DOC_CHECKS.filter(([id]) => results[id].s === 'bad').length, warn = DOC_CHECKS.filter(([id]) => results[id].s === 'warn').length;
    sumBox.className = 'msg ' + (bad ? 'bad' : warn ? 'warn' : 'ok'); sumBox.hidden = false;
    sumBox.textContent = bad ? t('doc.sum.bad', { n: nf(bad) }) : warn ? t('doc.sum.warn', { n: nf(warn) }) : t('doc.sum.ok');
    btnRun.disabled = false; btnRun.textContent = t('doc.again'); running = false;
  }
  const btnRun = h('button', { class: 'btn primary', type: 'button', id: 'btnDocRun', onclick: run }, t('doc.run'));
  mount(h('section', { class: 'stack', id: 'docScreen' },
    h('div', { class: 'page-head' }, h('h1', {}, t('doc.title')), h('div', { class: 'actions' }, btnRun, copyBtn(report, 'btn'))),
    h('p', { class: 'hint' }, t('doc.hint')),
    session ? null : h('p', { class: 'msg info' }, t('doc.notSigned'), ' ', h('a', { href: '#signin', class: 'clink', id: 'lnkDocSign' }, t('lock.signIn'))),
    sumBox, h('div', { class: 'card' }, list),
    h('div', { class: 'card stack-sm' }, h('h2', {}, t('doc.tips')), h('ul', { class: 'plainlist' }, ['1', '2', '3', '4'].map((n) => h('li', {}, t('doc.tip.' + n)))))));
  paint(); run();
}
