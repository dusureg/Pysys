/**
 * assets/js/core/look.js  -  fonts and accent colour chosen in Settings (published in data/public/brand.json, used by both sites)
 * normLook() is the whitelist (font keys from a short list, one #rrggbb colour), applyLook() writes the CSS variables and loads the Google font when the site uses Google Fonts.
 * The accent is adjusted per theme so text in that colour keeps a readable contrast (4.5 : 1) on the dark and on the light surfaces, whatever the person picks.
 * Loaded by: both pages (before brand.js)
 */
'use strict';

/* =====================================================================
   Look: fonts and accent colour
   ===================================================================== */
// key -> [family name, Google Fonts name]. 'plex' is the design's own font and always the first choice; 'system' uses the device's own font.
const LOOK_FONTS = {
  en: { plex: ['IBM Plex Sans', 'IBM+Plex+Sans'], inter: ['Inter', 'Inter'], roboto: ['Roboto', 'Roboto'], opensans: ['Open Sans', 'Open+Sans'], lato: ['Lato', 'Lato'], poppins: ['Poppins', 'Poppins'], system: null },
  ar: { plex: ['IBM Plex Sans Arabic', 'IBM+Plex+Sans+Arabic'], cairo: ['Cairo', 'Cairo'], tajawal: ['Tajawal', 'Tajawal'], almarai: ['Almarai', 'Almarai'], kufi: ['Noto Kufi Arabic', 'Noto+Kufi+Arabic'], naskh: ['Noto Naskh Arabic', 'Noto+Naskh+Arabic'], amiri: ['Amiri', 'Amiri'], system: null },
};
const LOOK_SYS = 'system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans Arabic","Noto Naskh Arabic",Tahoma,sans-serif';
const LOOK_DEFAULT = () => ({ fontEn: 'plex', fontAr: 'plex', accent: '' });
function normLook(j) {
  const d = LOOK_DEFAULT(); j = j && typeof j === 'object' ? j : {};
  return { fontEn: Object.prototype.hasOwnProperty.call(LOOK_FONTS.en, j.fontEn) ? j.fontEn : d.fontEn, fontAr: Object.prototype.hasOwnProperty.call(LOOK_FONTS.ar, j.fontAr) ? j.fontAr : d.fontAr,
    accent: typeof j.accent === 'string' && /^#[0-9a-f]{6}$/i.test(j.accent.trim()) ? j.accent.trim().toLowerCase() : '' };
}

/* ---- colours: contrast (WCAG) and nudging a colour until it is readable ---- */
const lkRgb = (hx) => [1, 3, 5].map((i) => parseInt(hx.slice(i, i + 2), 16));
const lkHex = (rgb) => '#' + rgb.map((c) => Math.round(Math.max(0, Math.min(255, c))).toString(16).padStart(2, '0')).join('');
const lkLum = (rgb) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }; return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]); };
const lkContrast = (a, b) => { const x = lkLum(a), y = lkLum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const lkToward = (rgb, to, k) => rgb.map((c, i) => c + (to[i] - c) * k);
// move a colour toward `to` (white or black) in small steps until it has `min` : 1 contrast against `bg`
function lkTune(hx, bg, to, min) {
  let c = lkRgb(hx), k = 0;
  while (lkContrast(c, bg) < min && k < 1) { k = Math.min(1, k + 0.04); c = lkToward(lkRgb(hx), to, k); }
  return lkHex(c);
}
// the same, for text that also sits on a tint of its own colour (notices, badges: about 12 % of the accent over the surface): that tint is lighter than the surface in the
// dark theme and darker in the light theme, so the text has to be readable on the tint as well (the contrast is measured against the worse of the two)
function lkTuneTint(hx, bg, to, min, tint) {
  const on = (c) => bg.map((b, i) => b + (c[i] - b) * tint);
  let c = lkRgb(hx), k = 0;
  while ((lkContrast(c, bg) < min || lkContrast(c, on(c)) < min) && k < 1) { k = Math.min(1, k + 0.04); c = lkToward(lkRgb(hx), to, k); }
  return lkHex(c);
}
// the colours a given accent gives in each theme: text/links (readable on the surfaces) and the primary button (white text on it)
function lookColors(accent) {
  if (!accent) return null;
  const W = [255, 255, 255], K = [0, 0, 0];
  const btn = lkTune(accent, W, K, 4.5), btnDark = lkHex(lkToward(lkRgb(btn), K, 0.18));
  return { dark: lkTuneTint(accent, lkRgb('#1e293b'), W, 4.5, 0.14), light: lkTuneTint(accent, lkRgb('#e2e8f0'), K, 4.5, 0.14), btn, btnDark, btnEdge: lkTune(accent, lkRgb('#0f172a'), W, 3) };
}
function lookCss(look) {
  look = normLook(look); const d = LOOK_DEFAULT(), out = [];
  if (look.fontEn !== d.fontEn || look.fontAr !== d.fontAr) {
    const en = LOOK_FONTS.en[look.fontEn], ar = LOOK_FONTS.ar[look.fontAr], q = (f) => (f ? '"' + f[0] + '",' : '');
    out.push(':root{--font:' + q(en) + q(ar) + LOOK_SYS + '}', 'html[lang=ar]{--font:' + q(ar) + q(en) + LOOK_SYS + '}');
  }
  const c = lookColors(look.accent);
  if (c) out.push(':root,[data-theme=dark]{--accent:' + c.dark + ';--accent-2:' + c.btn + ';--btn-1:' + c.btn + ';--btn-2:' + c.btnDark + ';--btn-b:' + c.btnEdge + '}',
    '[data-theme=light]{--accent:' + c.light + ';--accent-2:' + c.btn + ';--btn-1:' + c.btn + ';--btn-2:' + c.btnDark + ';--btn-b:' + c.btn + '}');
  return out.join('\n');
}
// the Google Fonts address for the chosen families (null when the design's own fonts are used, or the site does not use Google Fonts)
function lookFontUrl(look) {
  look = normLook(look); const fam = [];
  if (look.fontEn !== 'plex' && LOOK_FONTS.en[look.fontEn]) fam.push(LOOK_FONTS.en[look.fontEn][1]);
  if (look.fontAr !== 'plex' && LOOK_FONTS.ar[look.fontAr]) fam.push(LOOK_FONTS.ar[look.fontAr][1]);
  return fam.length ? 'https://fonts.googleapis.com/css2?' + fam.map((f) => 'family=' + f + ':wght@400;700').join('&') + '&display=swap' : null;
}
const lookFontsMode = () => document.documentElement.getAttribute('data-fonts') || 'google';
function applyLook(look) {
  let st = document.getElementById('dsLook');
  if (!st) { st = document.createElement('style'); st.id = 'dsLook'; document.head.appendChild(st); }
  st.textContent = lookCss(look);
  lookLoadFonts(look, 'dsLookFont');
}
// load the Google font files of a choice (id: the <link> that carries them; the Settings preview uses a second one so it can show a font before it is saved)
function lookLoadFonts(look, id) {
  const url = lookFontsMode() === 'google' ? lookFontUrl(look) : null; let lk = document.getElementById(id);
  if (!url) { if (lk) lk.remove(); return; }
  if (lk && lk.getAttribute('href') === url) return;
  if (lk) lk.remove();
  lk = document.createElement('link'); lk.id = id; lk.rel = 'stylesheet'; lk.href = url; lk.media = 'print'; lk.onload = () => { lk.media = 'all'; }; document.head.appendChild(lk);     // media=print first: does not block the first paint
}
