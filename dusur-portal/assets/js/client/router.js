/**
 * assets/js/client/router.js  -  client routing
 * Two routes: "" (live search) and "#client/<id>" (the private link).
 * Loaded by: client page
 */
'use strict';

/* ---- routing ---- */
async function route(opts = {}) {
  const token = ++routeToken, cm = location.hash.match(/^#client\/(.*)$/);
  document.documentElement.classList.toggle('client-mode', !!cm);
  syncTools(); applyStatic();
  const where = pagesRepo();
  if (where && !brandP) brandP = loadBrand(where);
  document.title = brandName() + ' — ' + t('cl.docTitle');
  if (cm) {
    let id = ''; try { id = decodeURIComponent(cm[1]); } catch (_) { /* invalid */ }
    if (opts.keep && cstate && cstate.id === id && cstate.redraw) return cstate.redraw();
    stopLive(); cstate = { id, redraw: null };
    return renderClient(id, token);
  }
  stopLive(); if (cstate) { cstate = null; clearImages(); }
  return renderHome(token);
}
function stopLive() { if (cstate && cstate.stop) cstate.stop(); }
const goHome = h('a', { class: 'btn', href: '#' }, '');
const homeBtn = () => h('a', { class: 'btn primary', href: '#' }, icon('search'), t('cl.searchAgain'));
