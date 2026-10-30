/**
 * <admin>/js/ui.js  -  admin-only UI helpers
 * Select element, message box, form-field helpers.
 * Loaded by: admin page
 */
'use strict';

// icons for the side menu and the new screens (the core set is in assets/js/core/dom.js and brand.js)
Object.assign(ICONS, {
  home: SVG('<path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"/>'),
  progress: SVG('<path d="M4 6h10M4 12h16M4 18h7"/><path d="M16 18l2 2 4-4"/>'),
  truck: SVG('<path d="M3 6h11v10H3zM14 9h4l3 3v4h-7"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>'),
  factory: SVG('<path d="M3 20V9l6 4V9l6 4V5h3v15z"/>'),
  box: SVG('<path d="M3 8l9-5 9 5v8l-9 5-9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>'),
  coins: SVG('<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/>'),
  chart: SVG('<path d="M4 20V4M4 20h16"/><path d="M8 16v-5M12 16V8M16 16v-8"/>'),
  history: SVG('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>'),
  users: SVG('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.5 2.9-6 6.5-6s6.5 2.5 6.5 6"/><circle cx="17" cy="9" r="2.5"/><path d="M17 14c2.8 0 4.5 1.8 4.5 4.5"/>'),
  sliders: SVG('<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>'),
  pulse: SVG('<path d="M3 12h4l2-6 4 12 2-6h6"/>'),
  menu: SVG('<path d="M4 6h16M4 12h16M4 18h16"/>'),
  calendar: SVG('<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M8 3v4M16 3v4"/>'),
  doc: SVG('<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>'),
  user: SVG('<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/>'),
});

// A screen the person may only look at: its fields and buttons are switched off (a disabled fieldset) and a note says why. Links keep working.
function roWrap(isReadOnly, ...blocks) {
  if (!isReadOnly) return blocks;
  return [h('p', { class: 'msg info', id: 'roNote' }, t('perm.readOnlyNote')), h('fieldset', { class: 'stack rofield', disabled: true }, blocks)];
}
const canProgress = () => can('progress', PERM_EDIT) || can('clients', PERM_EDIT);

function selectEl(options, value, onChange, id, label) {            // label = the accessible name when no visible <label> is attached (rows of a table)
  const s = h('select', { id, 'aria-label': label || undefined }, options.map(([v, l]) => h('option', { value: v }, l)));
  s.value = value; s.addEventListener('change', () => onChange(s.value)); return s;
}
function bindInput(el, obj, key, o = {}) {
  el.value = obj[key] == null ? '' : obj[key];
  el.addEventListener('input', () => { obj[key] = o.num ? (el.value === '' ? '' : Number(el.value)) : el.value; touch(); if (o.on) o.on(); });
  return el;
}
const tin = (obj, key, o = {}) => bindInput(h('input', {
  type: o.type || 'text', id: o.id, dir: o.dir || (o.type && o.type !== 'text' ? null : 'auto'), placeholder: o.ph, maxlength: o.max, min: o.min, step: o.step,
  inputmode: o.mode, required: o.req, autocomplete: 'off', readonly: o.ro, 'aria-label': o.label || o.ph,       // a field with no visible label is named by its hint
}), obj, key, o);
const tarea = (obj, key, o = {}) => bindInput(h('textarea', { id: o.id, rows: o.rows || 3, dir: 'auto', maxlength: o.max || 2000, placeholder: o.ph, 'aria-label': o.label || o.ph }), obj, key, o);
function biInputs(o) { // o = { en, ar }
  return h('div', { class: 'bi' }, tin(o, 'en', { ph: 'English', dir: 'ltr', max: 120 }), tin(o, 'ar', { ph: 'العربية', dir: 'rtl', max: 120 }));
}
const currentHash = () => location.hash;
const msgBox = () => h('div', { class: 'msg', role: 'status', hidden: true });
function setMsg(box, kind, ...lines) { box.className = 'msg ' + kind; box.hidden = !lines.length; box.replaceChildren(...lines.map((l) => h('span', {}, l))); }
