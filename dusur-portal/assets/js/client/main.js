/**
 * assets/js/client/main.js  -  start-up of the client site
 * Hydrates the header, waits for CryptoJS (loaded by guard.js), then starts the router. Loaded last.
 * Loaded by: client page
 */
'use strict';

/* =====================================================================
   Boot
   ===================================================================== */
function fatal(title, text) { mount(notice(title, text, 'bad')); }

async function boot() {
  if (window.__dsp) {
    if (window.__dsp.broken) return window.__dsp.fail();   // another file of this site failed: show the diagnostics box
    window.__dsp.booted = true;                            // every file loaded: stop the start-up safety net
  }
  hydrate(document.querySelector('header'));
  applyBrand(); applyStatic(); syncTools();
  $('#btnLang').onclick = () => setLang(lang === 'ar' ? 'en' : 'ar');
  $('#btnTheme').onclick = () => setTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
  if (!window.CryptoJS && window.__dsp && window.__dsp.crypto) {
    mount(notice(t('boot.loadingLib'), t('boot.loadingLibText'), '', { spinner: true }));
    await window.__dsp.crypto;
  }
  if (!window.CryptoJS) return fatal(t('boot.noLib'), t('boot.noLibText'));
  if (!(window.crypto && crypto.subtle)) return fatal(t('boot.noSecure'), t('boot.noSecureText'));
  addEventListener('hashchange', () => route());
  route();
}
boot().catch((e) => {
  try { fatal('Error', String((e && e.message) || e)); } catch (_) {
    // nothing could be drawn (a core file is missing?): let the start-up guard show its diagnostics box
    if (window.__dsp && window.__dsp.fail) window.__dsp.fail(e);
  }
});
