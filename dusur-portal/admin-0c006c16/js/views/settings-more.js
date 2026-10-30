/**
 * <admin>/js/views/settings-more.js  -  more cards of the Settings screen: internal codes, fonts and colours, labels, cost types, the config file
 * Each card edits a part of the draft (draftSet) and the Settings screen saves them all with its one Save button.
 * Loaded by: admin page
 */
'use strict';

/* =====================================================================
   Settings: internal codes
   ===================================================================== */
function codesCard(d) {
  const rows = CODE_NAMES.map((n) => {
    const ex = h('code', { class: 'mono', id: 'codeEx-' + n });
    const inp = h('input', { id: 'codePat-' + n, dir: 'ltr', maxlength: CODE_MAX, value: d.codes[n], spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off', 'aria-label': t('code.for.' + n) });
    const show = () => { const ok = codePatternOk(d.codes[n]); ex.textContent = ok ? codeExample(n, d.codes[n]) : t('code.bad'); ex.className = 'mono' + (ok ? '' : ' bad'); inp.setAttribute('aria-invalid', String(!ok)); };
    inp.addEventListener('input', () => { d.codes[n] = inp.value.trim(); show(); });
    show();
    return h('div', { class: 'coderow stack-sm' },
      fld('code.for.' + n, h('div', { class: 'input-row' }, inp, h('button', { class: 'small', type: 'button', id: 'codeReset-' + n, onclick: () => { d.codes[n] = CODE_DEFAULTS[n]; inp.value = CODE_DEFAULTS[n]; show(); } }, t('code.reset')))),
      h('p', { class: 'small' }, h('span', { class: 'muted' }, t('code.example') + ' '), ex));
  });
  const note = h('p', { class: 'small', id: 'codeFillMsg', role: 'status' });
  const fill = h('button', { class: 'btn small', type: 'button', id: 'btnCodeFill', onclick: async () => {
    fill.disabled = true; note.textContent = t('act.saving');
    try { let n = 0; for (const name of CODE_NAMES) n += await fillMissingCodes(name); note.textContent = n ? t('code.filled', { n: nf(n) }) : t('code.nothing'); } catch (e) { note.textContent = e.message; } finally { fill.disabled = false; }
  } }, t('code.fill'));
  return h('div', { class: 'card stack-sm', id: 'codesCard' }, h('div', { class: 'card-head' }, h('h2', {}, t('code.title'))), h('p', { class: 'notice' }, t('code.intro')),
    h('p', { class: 'hint' }, t('code.tokens')), rows, h('div', { class: 'actions' }, fill), note, h('p', { class: 'hint' }, t('code.fillHint')));
}

/* =====================================================================
   Settings: look (fonts, accent colour) and paper size
   ===================================================================== */
function lookCard(d) {
  const b = d.brand; b.look = normLook(b.look); const lk = b.look;
  const fontOpts = (L) => Object.keys(LOOK_FONTS[L]).map((k) => [k, LOOK_FONTS[L][k] ? LOOK_FONTS[L][k][0] : t('look.system')]);
  const sampleEn = h('p', { dir: 'ltr', lang: 'en', id: 'lookSampleEn' }, t('look.sampleEn')), sampleAr = h('p', { dir: 'rtl', lang: 'ar', id: 'lookSampleAr' }, t('look.sampleAr'));
  const sw = h('div', { class: 'looksw', id: 'lookSwatches' });
  const hex = h('input', { id: 'lookAccentHex', dir: 'ltr', maxlength: 7, value: lk.accent, placeholder: '#2563eb', spellcheck: 'false', autocomplete: 'off', 'aria-label': t('look.accent') });
  const pick = h('input', { type: 'color', id: 'lookAccent', value: lk.accent || '#2563eb', 'aria-label': t('look.accent') });
  const stack = (L, key) => { const f = LOOK_FONTS[L][key]; return (f ? '"' + f[0] + '",' : '') + LOOK_SYS; };
  const show = () => {
    sampleEn.style.fontFamily = stack('en', lk.fontEn) + ',' + stack('ar', lk.fontAr); sampleAr.style.fontFamily = stack('ar', lk.fontAr) + ',' + stack('en', lk.fontEn);
    lookLoadFonts(lk, 'dsLookPrev');
    const c = /^#[0-9a-f]{6}$/.test(lk.accent) ? lookColors(lk.accent) : null;
    sw.replaceChildren(...(c ? [['look.darkTheme', '#1e293b', c.dark, lk.accent], ['look.lightTheme', '#e2e8f0', c.light, lk.accent]].map(([k, bg, fg, want]) => h('div', { class: 'looksw-i', 'data-theme-sample': k === 'look.darkTheme' ? 'dark' : 'light', style: 'background:' + bg + ';color:' + fg },
      h('strong', {}, t(k)), h('span', {}, fg + (fg !== want ? ' · ' + t('look.adjusted') : ''))))
      .concat([h('span', { class: 'looksw-btn', style: 'background:linear-gradient(135deg,' + c.btn + ',' + c.btnDark + ')' }, t('look.button'))]) : [h('span', { class: 'muted small' }, t('look.standardColour'))]));
    hex.setAttribute('aria-invalid', String(hex.value.trim() !== '' && !/^#[0-9a-f]{6}$/i.test(hex.value.trim())));
  };
  const setAccent = (v) => { lk.accent = v; hex.value = v; if (v) pick.value = v; show(); };
  pick.addEventListener('input', () => setAccent(pick.value.toLowerCase()));
  hex.addEventListener('input', () => { const v = hex.value.trim().toLowerCase(); lk.accent = v; if (/^#[0-9a-f]{6}$/.test(v)) pick.value = v; show(); });         // a wrong value is kept so that Save can say so
  const selEn = selectEl(fontOpts('en'), lk.fontEn, (v) => { lk.fontEn = v; show(); }, 'lookEn', t('look.fontEn'));
  const selAr = selectEl(fontOpts('ar'), lk.fontAr, (v) => { lk.fontAr = v; show(); }, 'lookAr', t('look.fontAr'));
  const paperSel = selectEl(Object.keys(PAPERS).map((p) => [p, t('look.paper.' + p)]), normPaper(d.paper), (v) => { d.paper = v; }, 'setPaper', t('look.paperLabel'));
  show();
  return h('div', { class: 'card stack-sm', id: 'lookCard' }, h('div', { class: 'card-head' }, h('h2', {}, t('look.title')), h('span', { class: 'badge progress' }, t('set.public'))),
    h('p', { class: 'notice' }, t('look.intro')), lookFontsMode() === 'google' ? null : h('p', { class: 'msg info', id: 'lookNoGoogle' }, t('look.noGoogle')),
    h('div', { class: 'grid2' }, fld('look.fontEn', selEn), fld('look.fontAr', selAr)),
    h('div', { class: 'card-2 stack-sm looksample', id: 'lookSample' }, sampleEn, sampleAr),
    h('div', { class: 'stack-sm' }, h('strong', { class: 'small' }, t('look.accent')), h('p', { class: 'hint' }, t('look.accentHint')),
      h('div', { class: 'actions' }, pick, hex, h('button', { class: 'btn small ghost', type: 'button', id: 'lookAccentClear', onclick: () => setAccent('') }, t('look.accentClear'))), sw),
    h('hr', { class: 'sep' }), fld('look.paperLabel', paperSel, 'look.paperHint'));
}

/* =====================================================================
   Settings: labels (what a new label screen starts with)
   ===================================================================== */
function labelsCard(d) {
  const lb = d.labels = normLabels(d.labels);
  const len = h('input', { id: 'setLblLen', type: 'number', min: LABEL_LEN.min, max: LABEL_LEN.max, step: 0.5, inputmode: 'decimal', value: lb.length, 'aria-label': t('lbl.length') });
  len.addEventListener('input', () => { lb.length = len.value === '' ? LABEL_LEN.def : Number(len.value); });
  const sl = h('input', { id: 'setLblSlogan', maxlength: 40, dir: 'ltr', value: lb.slogan, 'aria-label': t('lbl.slogan') });
  sl.addEventListener('input', () => { lb.slogan = sl.value; });
  const cp = h('input', { id: 'setLblCopies', type: 'number', min: 1, max: 20, step: 1, inputmode: 'numeric', value: lb.copies, 'aria-label': t('lbl.copies') });
  cp.addEventListener('input', () => { lb.copies = Math.round(Number(cp.value)) || 1; });
  const mk = (f) => h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'setLblF-' + f, checked: lb.fields.includes(f), onchange: (e) => { lb.fields = e.target.checked ? lb.fields.concat([f]) : lb.fields.filter((x) => x !== f); } }), h('span', {}, t('lbl.f.' + f)));
  return h('div', { class: 'card stack-sm', id: 'labelsCard' }, h('div', { class: 'card-head' }, h('h2', {}, t('lbl.setTitle')), h('span', { class: 'badge enc' }, icon('lock'), t('ct.private'))),
    h('p', { class: 'notice' }, t('lbl.setIntro')),
    h('div', { class: 'grid2' }, fld('lbl.size', selectEl([['sq', t('lbl.size.sq')], ['strip', t('lbl.size.strip')]], lb.size, (v) => { lb.size = v; }, 'setLblSize')), fld('lbl.length', len)),
    h('div', { class: 'grid2' }, fld('lbl.slogan', sl, 'lbl.sloganHint'), fld('lbl.copies', cp)),
    h('fieldset', { class: 'lbl-fields' }, h('legend', {}, t('lbl.fields')), h('div', { class: 'checks' }, LABEL_FIELDS.map(mk))));
}

/* =====================================================================
   Settings: cost categories of your own (direct and indirect)
   ===================================================================== */
function costCatsCard(d, redraw) {
  const group = (kind) => {
    const list = d.costCats[kind], rows = list.map((x, i) => h('div', { class: 'rg', style: '--cols:minmax(0,1fr) minmax(0,1fr) auto', 'data-id': x.id },
      tin(x, 'en', { id: 'ccEn-' + kind + '-' + i, ph: 'English', dir: 'ltr', max: CAT_NAME_MAX, label: t('cc.nameEn') }), tin(x, 'ar', { id: 'ccAr-' + kind + '-' + i, ph: 'العربية', dir: 'rtl', max: CAT_NAME_MAX, label: t('cc.nameAr') }),
      h('button', { class: 'small danger x', type: 'button', id: 'ccDel-' + kind + '-' + i, 'aria-label': t('act.remove'), onclick: () => { list.splice(i, 1); redraw(); } }, '×')));
    return h('div', { class: 'stack-sm', id: 'ccGroup-' + kind },
      h('strong', {}, t('cc.' + kind)), h('p', { class: 'hint' }, t('cc.' + kind + 'Hint')),
      h('p', { class: 'small' }, h('span', { class: 'muted' }, t('cc.builtin') + ' '), (kind === 'direct' ? COST_BASE : IND_BASE).map((c) => catText(kind, c)).join(' · ')),
      rows.length ? rows : h('p', { class: 'empty' }, t('cc.none')),
      h('div', { class: 'actions' }, h('button', { class: 'btn small', type: 'button', id: 'ccAdd-' + kind, disabled: list.length >= CATS_MAX, onclick: () => { list.push({ id: newCatId(), en: '', ar: '' }); redraw(); } }, t('cc.add'))));
  };
  return h('div', { class: 'card stack-sm', id: 'costCatsCard' }, h('div', { class: 'card-head' }, h('h2', {}, t('cc.title'))), h('p', { class: 'notice' }, t('cc.intro')), group('direct'), group('indirect'), h('p', { class: 'hint' }, t('cc.removeNote')));
}

/* =====================================================================
   Settings: brands of the materials and products
   ===================================================================== */
function brandsCard(d, redraw) {
  d.brands = Array.isArray(d.brands) ? d.brands : [];
  const used = (id) => opsList('inventory').filter((x) => x.brandId === id).length;
  const rows = d.brands.map((x, i) => h('div', { class: 'rg', style: '--cols:minmax(0,1fr) auto', 'data-id': x.id },
    tin(x, 'name', { id: 'brName-' + i, max: BRAND_NAME_MAX, label: t('brand.name') }),
    h('button', { class: 'small danger x', type: 'button', id: 'brDel-' + i, 'aria-label': t('act.remove') + ': ' + (x.name || ''), onclick: () => {
      const n = ops.inventory ? used(x.id) : 0;
      if (n && !confirm(t('brand.removeConfirm', { n: x.name, c: nf(n) }))) return;
      d.brands.splice(i, 1); redraw();
    } }, '×')));
  return h('div', { class: 'card stack-sm', id: 'brandsCard' }, h('div', { class: 'card-head' }, h('h2', {}, t('brand.title')), h('span', { class: 'badge enc' }, icon('lock'), t('ct.private'))),
    h('p', { class: 'notice' }, t('brand.intro')),
    rows.length ? rows : h('p', { class: 'empty' }, t('brand.empty')),
    h('div', { class: 'actions' }, h('button', { class: 'btn small', type: 'button', id: 'brAdd', disabled: d.brands.length >= BRANDS_MAX, onclick: () => { d.brands.push({ id: newBrandId(), name: '' }); redraw(); } }, t('brand.add'))),
    h('p', { class: 'hint' }, t('brand.removeNote')));
}

/* =====================================================================
   Settings: the settings file (what to carry from one installation to another, never a secret)
   ===================================================================== */
const CFG_KIND = 'dusur-settings', CFG_V = 1, CFG_MAX = 600 * 1024;
function cfgExport() {
  const s = session.settings, b = sanitizeBrand(s.brand), look = b.look; delete b.look; b.inbox = '';
  return { kind: CFG_KIND, v: CFG_V, exported: oiso(), settings: { profile: b, business: { prefix: s.prefix, currency: s.currency, defaultDays: s.defaultDays, reportFooter: { en: (s.reportFooter || {}).en || '', ar: (s.reportFooter || {}).ar || '' } },
    contract: normContract(s.contract), codes: normCodes(s.codes), costCats: normCostCats(s.costCats), look, paper: normPaper(s.paper), labels: normLabels(s.labels) } };
}
// the file's sections, checked one by one, into the draft of the form (nothing is saved until the person presses Save). Returns the sections that were taken.
function cfgApply(d, file) {
  const s = file && file.settings && typeof file.settings === 'object' ? file.settings : {}, done = [];
  if (s.profile && typeof s.profile === 'object') { const nb = sanitizeBrand(s.profile); for (const k of Object.keys(nb)) if (k !== 'look' && k !== 'inbox') d.brand[k] = nb[k]; done.push('profile'); }
  if (s.business && typeof s.business === 'object') {
    const p = String(s.business.prefix || '').trim().toUpperCase(), c = String(s.business.currency || '').trim().toUpperCase(), n = Number(s.business.defaultDays);
    if (/^[A-Z0-9]{1,6}$/.test(p)) d.prefix = p; if (/^[A-Z]{3}$/.test(c)) d.currency = c; if (Number.isInteger(n) && n >= 0 && n <= 730) d.defaultDays = n;
    const f = s.business.reportFooter; if (f && typeof f === 'object') d.footer = { en: String(f.en || '').slice(0, 300), ar: String(f.ar || '').slice(0, 300) };
    done.push('business');
  }
  if (s.contract && typeof s.contract === 'object') { d.contract = clone(normContract(s.contract)); done.push('contract'); }
  if (s.codes && typeof s.codes === 'object') { d.codes = normCodes(s.codes); done.push('codes'); }
  if (s.costCats && typeof s.costCats === 'object') { d.costCats = clone(normCostCats(s.costCats)); done.push('costCats'); }
  if (s.labels && typeof s.labels === 'object') { d.labels = clone(normLabels(s.labels)); done.push('labels'); }
  if (s.look && typeof s.look === 'object') { d.brand.look = normLook(s.look); done.push('look'); }
  if (typeof s.paper === 'string') { d.paper = normPaper(s.paper); if (!done.includes('look')) done.push('look'); }
  return done;
}
function configCard(d, redraw) {
  const note = h('p', { class: 'small', id: 'cfgMsg', role: 'status' });
  const say = (kind, text) => { note.className = 'small' + (kind ? ' msg ' + kind : ''); note.textContent = text; };
  const file = h('input', { type: 'file', id: 'cfgFile', accept: '.json,application/json', hidden: true });
  file.addEventListener('change', async () => {
    const f = file.files && file.files[0]; file.value = ''; if (!f) return;
    try {
      if (f.size > CFG_MAX) throw new Error(t('cfg.bad'));
      let j; try { j = JSON.parse(await f.text()); } catch (_) { throw new Error(t('cfg.bad')); }
      if (!j || j.kind !== CFG_KIND || !j.settings) throw new Error(t('cfg.bad'));
      if (Number(j.v) > CFG_V) throw new Error(t('cfg.newer'));
      const done = cfgApply(d, j); if (!done.length) throw new Error(t('cfg.nothing'));
      cfgDone = t('cfg.loaded', { n: nf(done.length), f: f.name, s: done.map((k) => t('cfg.sec.' + k)).join(', ') }); redraw();
    } catch (e) { say('bad', e.message); }
  });
  const exp = h('button', { class: 'btn', type: 'button', id: 'btnCfgExport', onclick: () => {
    saveBlob(new Blob([JSON.stringify(cfgExport(), null, 2)], { type: 'application/json' }), 'dusur-settings.json');
    audit({ area: 'settings', act: 'export', ref: 'settings-file', title: t('cfg.title') }); say('ok', t('cfg.exported'));
  } }, t('cfg.export'));
  const card = h('div', { class: 'card stack-sm', id: 'cfgCard' }, h('h2', {}, t('cfg.title')), h('p', { class: 'notice' }, t('cfg.intro')),
    h('div', { class: 'actions' }, exp, h('button', { class: 'btn', type: 'button', id: 'btnCfgImport', onclick: () => file.click() }, t('cfg.import')), file), note, h('p', { class: 'hint' }, t('cfg.keeps')));
  if (cfgDone) { say('ok', cfgDone); cfgDone = ''; }
  return card;
}
let cfgDone = '';              // what the last loaded file brought in, shown once after the form is redrawn
