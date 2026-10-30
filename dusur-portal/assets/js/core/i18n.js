/**
 * assets/js/core/i18n.js  -  language, numbers, money and dates
 * The t() translator, L() for {en, ar} values, locale-aware number / money / percent / date formatting.
 * Reads the dictionaries loaded by assets/i18n/*.js (and admin/i18n/*.js on the admin page).
 * Loaded by: both pages
 */
'use strict';

const I18N = window.__I18N;

/* =====================================================================
   Language, formatting
   ===================================================================== */
const ls = {
  get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (_) { /* ignore */ } },
};
let lang = document.documentElement.lang === 'ar' ? 'ar' : 'en';
const t = (key, vars) => {
  let s = I18N[lang][key];
  if (s === undefined) s = I18N.en[key];
  if (s === undefined) { console.warn('i18n missing: ' + key); return key; }
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m)) : s;
};
const L = (v) => (v && typeof v === 'object' ? (v[lang] || v.en || v.ar || '') : (v == null ? '' : String(v)));
const locale = () => (lang === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB');
let CUR = 'EGP';
const nf = (n, o) => new Intl.NumberFormat(locale(), o).format(n);
const money = (n) => { try { return nf(n, { style: 'currency', currency: CUR, maximumFractionDigits: 2 }); } catch (_) { return nf(n, { maximumFractionDigits: 2 }) + ' ' + CUR; } };
const pct = (x) => (x == null || !isFinite(x) ? '—' : nf(x * 100, { maximumFractionDigits: 1 }) + '%');
const pad2 = (n) => String(n).padStart(2, '0');
const parseDay = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
const todayStr = () => { const d = new Date(); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); };
const fmtDay = (s) => { const d = parseDay(s); return d ? d.toLocaleDateString(locale(), { day: 'numeric', month: 'short', year: 'numeric' }) : '—'; };
const fmtDateTime = (iso) => { const d = new Date(iso); return isNaN(d) ? '—' : d.toLocaleString(locale(), { dateStyle: 'medium', timeStyle: 'short' }); };
const daysUntil = (s) => { const d = parseDay(s); if (!d) return null; const n = new Date(); return Math.round((d - new Date(n.getFullYear(), n.getMonth(), n.getDate())) / 864e5); };
const dayWord = (n) => (lang === 'ar'
  ? (n === 1 ? 'يوم واحد' : n === 2 ? 'يومان' : n <= 10 ? nf(n) + ' أيام' : nf(n) + ' يومًا')
  : (n === 1 ? '1 day' : nf(n) + ' days'));
const timeLeft = (n) => (n === null ? '—' : n > 0 ? t('time.left', { d: dayWord(n) }) : n === 0 ? t('time.today') : t('time.overdue', { d: dayWord(-n) }));
