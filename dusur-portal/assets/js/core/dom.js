/**
 * assets/js/core/dom.js  -  DOM helpers, icons, toasts, language and theme switches
 * h() builds elements (children are text nodes or elements, never parsed HTML), plus icons, toast, clipboard helpers,
 * form-state preservation and the language / theme switches (setLang re-runs the active route).
 * Loaded by: both pages
 */
'use strict';

/* =====================================================================
   DOM helpers
   ===================================================================== */
const $ = (sel, root = document) => root.querySelector(sel);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clone = (o) => JSON.parse(JSON.stringify(o));

// Children are always text nodes or elements, never parsed as HTML.
function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  let val;
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v == null) continue;
    if (k === 'class') e.className = v;
    else if (k === 'value') val = v;
    else if (k === 'checked') e.checked = !!v;
    else if (k.slice(0, 2) === 'on' && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : String(v));
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    e.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  if (val !== undefined) e.value = val;
  return e;
}
const SVG = (p) => '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>';
const ICONS = {
  lock: SVG('<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
  check: SVG('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  circle: SVG('<circle cx="12" cy="12" r="8"/>'),
  logo: SVG('<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5"/>'),
  alert: SVG('<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h.01"/>'),
  sun: SVG('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  moon: SVG('<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>'),
  play: SVG('<path d="M8 5.5v13l11-6.5z"/>'),
  image: SVG('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="M21 16l-5-5-8 8"/>'),
};
const icon = (name) => { const s = h('span', { class: 'ico', 'aria-hidden': 'true' }); s.innerHTML = ICONS[name]; return s; };
const hydrate = (root) => root.querySelectorAll('[data-icon]').forEach((n) => n.prepend(icon(n.dataset.icon)));
const applyStatic = () => document.querySelectorAll('[data-i18n]').forEach((n) => { n.textContent = t(n.dataset.i18n); });
const encBadge = (label) => h('span', { class: 'badge enc' }, icon('lock'), label || t('badge.enc'));
const mount = (...nodes) => $('#app').replaceChildren(...nodes.filter(Boolean));     // a null child would otherwise print the word "null"

function toast(text, kind) {
  const el = h('div', { class: 'toast ' + (kind || '') }, text);
  $('#toasts').append(el);
  setTimeout(() => el.remove(), kind === 'bad' ? 7000 : 3000);
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch (_) { /* fall through */ }
  const ta = h('textarea', { 'aria-hidden': 'true', style: 'position:fixed;opacity:0;top:0' });
  ta.value = text; document.body.append(ta); ta.select();
  let ok = false; try { ok = document.execCommand('copy'); } catch (_) { /* ignore */ }
  ta.remove(); return ok;
}
function flash(btn, text) {
  const old = btn.textContent; btn.textContent = text; btn.disabled = true;
  setTimeout(() => { btn.textContent = old; btn.disabled = false; }, 1400);
}
function copyBtn(textFn, cls) {
  const b = h('button', { class: cls || 'small', type: 'button' }, t('act.copy'));
  b.onclick = async () => flash(b, (await copyText(textFn())) ? t('act.copied') : t('act.copyFail'));
  return b;
}
function notice(title, text, kind, opts) {
  const o = opts || {};
  return h('section', { class: 'card state' },
    o.spinner ? h('div', { class: 'spin', role: 'progressbar', 'aria-label': t('act.loading') }) : null,
    kind === 'bad' ? h('span', { class: 'badge late' }, icon('alert'), title) : h('h1', {}, title),
    h('p', { class: 'muted' }, text),
    o.actions && o.actions.length ? h('div', { class: 'actions' }, o.actions) : null);
}
function fld(labelKey, el, hintKey) { return h('label', {}, t(labelKey), el, hintKey ? h('span', { class: 'hint' }, t(hintKey)) : null); }

// keep typed text when the language is switched on a form screen
function snapshotInputs() {
  const out = {};
  document.querySelectorAll('#app [id]').forEach((n) => { if ('value' in n && n.id) out[n.id] = n.type === 'checkbox' ? n.checked : n.value; });
  return out;
}
function restoreInputs(s) {
  Object.entries(s).forEach(([id, v]) => { const n = document.getElementById(id); if (!n) return; if (n.type === 'checkbox') n.checked = v; else n.value = v; });
}

function syncTools() {
  const b = $('#btnLang'); b.textContent = lang === 'ar' ? 'English' : 'العربية'; b.title = t('tools.lang');
  const th = document.documentElement.getAttribute('data-theme');
  const tb = $('#btnTheme'); tb.replaceChildren(icon(th === 'dark' ? 'sun' : 'moon'), h('span', { class: 'sr' }, t('tools.theme')));
  tb.title = t('tools.theme');
}
function setTheme(th) { document.documentElement.setAttribute('data-theme', th); ls.set(LS_THEME, th); syncTools(); }
function setLang(l) {
  lang = l; const d = document.documentElement; d.lang = l; d.dir = l === 'ar' ? 'rtl' : 'ltr';
  ls.set(LS_LANG, l); applyStatic(); syncTools();
  const snap = snapshotInputs();
  route({ keep: true }).then(() => restoreInputs(snap));
}
