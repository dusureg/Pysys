/**
 * <admin>/js/paper-size.js  -  the paper size reports and contracts are printed on (Settings > Look and print)
 * A4, A3, Letter or Legal. The page rules (@page) are written when a report or contract is opened or printed, so the browser's "Save as PDF" gives pages of that size
 * and the sheet shown on screen has the same proportions. Without a choice the sheet is A4, as before.
 * Loaded by: admin page
 */
'use strict';

/* =====================================================================
   Paper size
   ===================================================================== */
const PAPERS = { A4: [210, 297], A3: [297, 420], Letter: [215.9, 279.4], Legal: [215.9, 355.6] };         // width x height in mm, portrait
const normPaper = (p) => (Object.prototype.hasOwnProperty.call(PAPERS, p) ? p : 'A4');
const paperPx = (mm) => Math.round(mm * 96 / 25.4);
function paperCss(p) {
  p = normPaper(p); const [w, hh] = PAPERS[p];
  return ':root{--pw:' + paperPx(w) + 'px;--pl:' + paperPx(hh) + 'px}\n@page{size:' + p + ';margin:12mm}\n@page land{size:' + p + ' landscape;margin:10mm}\n'
    + '@page contract{size:' + p + ';margin:14mm 14mm 18mm;@bottom-center{content:counter(page) " / " counter(pages);font:10px "IBM Plex Sans","IBM Plex Sans Arabic",system-ui,sans-serif;color:#898781}}';
}
function applyPaper(p) {
  let st = document.getElementById('dsPaper');
  if (!st) { st = document.createElement('style'); st.id = 'dsPaper'; document.head.appendChild(st); }
  st.textContent = paperCss(p);
}
const paperNow = () => applyPaper(session && session.settings ? session.settings.paper : 'A4');
