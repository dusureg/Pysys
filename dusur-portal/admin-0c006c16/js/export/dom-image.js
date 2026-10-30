/**
 * <admin>/js/export/dom-image.js  -  draw a part of the page (a report sheet) as a PNG picture
 * No library: the element is copied into an SVG picture (foreignObject) together with the page's style rules and the colours/fonts variables of the moment, the browser draws that
 * picture onto a canvas, and the canvas is saved as PNG. Nothing leaves the device. The picture uses the device's own fonts for the text (a picture cannot load web fonts),
 * so it can look a little different from the PDF, which is printed by the browser with the real fonts.
 * Loaded by: admin page
 */
'use strict';

/* =====================================================================
   Page element -> PNG
   ===================================================================== */
const IMG_MAX_SIDE = 15000;                                      // browsers refuse canvases much larger than this
function imgPageCss() {
  let out = '';
  for (const sh of document.styleSheets) {
    let rules; try { rules = sh.cssRules; } catch (_) { continue; }          // another site's sheet (Google Fonts): not readable, not needed
    for (const r of rules) { if (r.type === CSSRule.IMPORT_RULE || r.type === CSSRule.FONT_FACE_RULE) continue; out += r.cssText + '\n'; }
  }
  return out;
}
// the first row from the bottom that is not white (+ a margin): the picture is drawn a little taller than needed, the empty end is cut off
function imgInkEnd(ctx, cw, ch) {
  const strip = 64;
  for (let y = ch; y > 0; y -= strip) {
    const y0 = Math.max(0, y - strip), d = ctx.getImageData(0, y0, cw, y - y0).data;
    for (let i = d.length - 4; i >= 0; i -= 4) if (d[i] < 250 || d[i + 1] < 250 || d[i + 2] < 250) return Math.min(ch, y0 + Math.floor(i / 4 / cw) + 1);
  }
  return ch;
}
async function domToPng(node, opts) {
  const o = Object.assign({ width: Math.round(node.getBoundingClientRect().width), scale: 2, margin: 16, background: '#ffffff' }, opts), width = Math.max(200, Math.round(o.width));
  const css = imgPageCss(), root = getComputedStyle(document.documentElement);
  // measure the element at that width in the page itself (with the real fonts); the picture gets some spare room because it is drawn with the device's fonts
  const probe = h('div', { style: 'position:fixed;left:-100000px;top:0;visibility:hidden;width:' + width + 'px' }), c1 = node.cloneNode(true);
  c1.style.width = width + 'px'; c1.style.maxWidth = 'none'; probe.append(c1); document.body.append(probe);
  const measured = Math.ceil(probe.scrollHeight || probe.getBoundingClientRect().height); probe.remove();
  const height = Math.ceil(measured * 1.12) + 40;
  const clone = node.cloneNode(true); clone.removeAttribute('id'); clone.style.width = width + 'px'; clone.style.maxWidth = 'none'; clone.style.boxShadow = 'none'; clone.style.borderRadius = '0';
  const wrap = document.createElement('div');
  wrap.setAttribute('dir', document.documentElement.getAttribute('dir') || 'ltr'); wrap.setAttribute('lang', document.documentElement.getAttribute('lang') || 'en');
  wrap.style.width = width + 'px'; wrap.style.background = o.background;
  for (const n of new Set(css.match(/--[\w-]+/g) || [])) { const v = root.getPropertyValue(n).trim(); if (v) wrap.style.setProperty(n, v); }       // the colours, fonts and sizes of this moment
  const style = document.createElement('style'); style.textContent = css; wrap.append(style, clone);
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '"><foreignObject x="0" y="0" width="' + width + '" height="' + height + '">' + new XMLSerializer().serializeToString(wrap) + '</foreignObject></svg>';
  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);          // a data address, not a blob: address (the browser then lets the page read back what it drew)
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error(t('img.fail'))); img.src = url; });
  const scale = Math.max(0.5, Math.min(o.scale, IMG_MAX_SIDE / height, IMG_MAX_SIDE / width)), cw = Math.round(width * scale), ch = Math.round(height * scale);
  const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch; const ctx = cv.getContext('2d');
  ctx.fillStyle = o.background; ctx.fillRect(0, 0, cw, ch); ctx.drawImage(img, 0, 0, cw, ch);
  let end; try { end = imgInkEnd(ctx, cw, ch); } catch (_) { throw new Error(t('img.tainted')); }
  const outH = Math.min(ch, end + Math.round(o.margin * scale));
  let out = cv; if (outH < ch) { out = document.createElement('canvas'); out.width = cw; out.height = outH; const c2 = out.getContext('2d'); c2.fillStyle = o.background; c2.fillRect(0, 0, cw, outH); c2.drawImage(cv, 0, 0); }
  const blob = await new Promise((res) => out.toBlob(res, 'image/png'));
  if (!blob) throw new Error(t('img.fail'));
  return blob;
}
