/**
 * <admin>/js/views/settings.js  -  Settings screen
 * Company profile (public), business defaults, this device, project types.
 * Loaded by: admin page
 */
'use strict';

/* =====================================================================
   Settings: company profile, business defaults, this device, project types
   ===================================================================== */
const openTypes = new Set();
let draftSet = null;      // company / business / device fields while editing (kept when a project type is added or removed)

async function logoFromFile(file) {
  if (file.size > 12 * 1024 * 1024) throw new Error(t('set.logoBig'));
  let bmp; try { bmp = await createImageBitmap(file); } catch (_) { throw new Error(t('ph.unsupported', { name: file.name })); }
  try {
    for (const max of [420, 320, 240, 160]) {
      const sc = Math.min(1, max / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(bmp.width * sc)); c.height = Math.max(1, Math.round(bmp.height * sc));
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      const url = c.toDataURL('image/png');
      if (url.length < 150000) return url;
    }
  } finally { if (bmp.close) bmp.close(); }
  throw new Error(t('set.logoBig'));
}

async function renderSettings(token, keep) {
  if (!session.settings) {
    mount(notice(t('act.loading'), '', 'info', { spinner: true }));
    try { await loadSettings(); } catch (e) { if (token !== routeToken) return; return mount(notice(t('err.load'), e.message, 'bad', { actions: [h('button', { class: 'btn', type: 'button', onclick: () => route() }, t('act.retry'))] })); }
    if (token !== routeToken) return;
  }
  const s = session.settings;
  if (!draftTypes || !draftSet || !keep) {
    draftTypes = clone(s.types);
    draftSet = { prefix: s.prefix, currency: s.currency, defaultDays: s.defaultDays, footer: clone(s.reportFooter), brand: clone(sanitizeBrand(s.brand)), idle: String(Math.round(idleMs() / 60000)), contract: clone(normContract(s.contract)), inboxKey: s.inboxKey || '', codes: normCodes(s.codes), costCats: clone(normCostCats(s.costCats)), paper: normPaper(s.paper), labels: clone(normLabels(s.labels)), brands: clone(normBrands(s.brands)) };
  }
  const d = draftSet, b = d.brand, existingCodes = new Set(s.types.map((x) => x.code));
  const msg = msgBox();

  // ---- company profile (public)
  const preview = h('div', { class: 'logo-preview' });
  const drawLogo = () => preview.replaceChildren(b.logo ? h('img', { src: b.logo, alt: '', style: 'max-height:56px;max-width:220px' }) : (() => { const x = h('span', { class: 'mark', style: 'width:48px;height:48px' }); x.innerHTML = LOGO_MARK; return x; })());
  drawLogo();
  const file = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', hidden: true, id: 'setLogoFile' });
  file.addEventListener('change', async () => {
    const f = file.files[0]; file.value = ''; if (!f) return;
    try { b.logo = await logoFromFile(f); drawLogo(); setMsg(msg, '', ''); } catch (e) { setMsg(msg, 'bad', e.message); }
  });
  const company = h('div', { class: 'card stack-sm' },
    h('div', { class: 'card-head' }, h('h2', {}, t('set.company')), h('span', { class: 'badge progress' }, t('set.public'))),
    h('p', { class: 'notice' }, t('set.companyHint')),
    fld('set.brandName', biInputs(b.name)),
    fld('set.tagline', biInputs(b.tagline)),
    h('div', { class: 'grid2' }, fld('set.phone', tin(b, 'phone', { id: 'setPhone', type: 'tel', dir: 'ltr', max: 30 })), fld('set.whatsapp', tin(b, 'whatsapp', { id: 'setWa', dir: 'ltr', max: 20, mode: 'numeric', ph: '2010XXXXXXXX' }), 'set.whatsappHint')),
    h('div', { class: 'grid2' }, fld('set.email', tin(b, 'email', { id: 'setEmail', type: 'email', dir: 'ltr', max: 120 })), fld('set.website', tin(b, 'website', { id: 'setWeb', type: 'url', dir: 'ltr', max: 200, ph: 'https://' }))),
    fld('set.address', tin(b, 'address', { id: 'setAddr', max: 200 })),
    h('div', { class: 'stack-sm' }, h('strong', { class: 'small' }, t('set.logo')), h('p', { class: 'hint' }, t('set.logoHint')),
      h('div', { class: 'actions' }, preview,
        h('button', { class: 'btn small', type: 'button', id: 'btnLogo', onclick: () => file.click() }, t('set.logoPick')),
        h('button', { class: 'btn small ghost', type: 'button', id: 'btnLogoReset', onclick: () => { b.logo = ''; drawLogo(); } }, t('set.logoReset')), file)),
    h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'setRating', checked: b.rating, onchange: (e) => { b.rating = e.target.checked; } }), h('span', {}, t('set.rating'))),
    h('p', { class: 'hint' }, t('set.ratingHint')));

  // ---- client inbox: where ratings sent from the client site arrive (the address is public, the key is private)
  const inboxState = h('p', { class: 'small', id: 'inboxTestMsg', role: 'status' });
  const testBtn = h('button', { class: 'btn small', type: 'button', id: 'btnInboxTest', onclick: async () => {
    const url = String(b.inbox || '').trim(), key = String(d.inboxKey || '').trim();
    if (!INBOX_RE.test(url)) return setInboxMsg('bad', t('set.badInbox'));
    if (!INBOX_KEY_RE.test(key)) return setInboxMsg('bad', t('set.badInboxKey'));
    testBtn.disabled = true; setInboxMsg('', t('set.inboxTesting'));
    try { const j = await inboxCall({ v: 1, op: 'ping', key }, url); setInboxMsg('ok', t('set.inboxWorks', { n: nf(Number(j.total) || 0) })); } catch (e) { setInboxMsg('bad', e.message); } finally { testBtn.disabled = false; }
  } }, t('set.inboxTest'));
  function setInboxMsg(kind, text) { inboxState.className = 'small' + (kind === 'bad' ? ' msg bad' : kind === 'ok' ? ' msg ok' : ''); inboxState.textContent = text; }
  const keyIn = tin(d, 'inboxKey', { id: 'setInboxKey', dir: 'ltr', max: 64 });
  const inboxCardEl = h('div', { class: 'card stack-sm', id: 'inboxCfg' },
    h('div', { class: 'card-head' }, h('h2', {}, t('set.inbox')), h('span', { class: 'badge progress' }, t('set.public'))),
    h('p', { class: 'notice' }, t('set.inboxHint')),
    fld('set.inboxUrl', tin(b, 'inbox', { id: 'setInbox', type: 'url', dir: 'ltr', max: 300, ph: 'https://script.google.com/macros/s/…/exec' }), 'set.inboxUrlHint'),
    fld('set.inboxKey', keyIn, 'set.inboxKeyHint'),
    h('div', { class: 'actions' }, h('button', { class: 'btn small', type: 'button', id: 'btnInboxKey', onclick: () => { d.inboxKey = randomKey(); keyIn.value = d.inboxKey; setInboxMsg('', ''); } }, t('set.inboxMake')), testBtn),
    inboxState);

  // ---- business defaults (private)
  const business = h('div', { class: 'card stack-sm' }, h('h2', {}, t('set.business')),
    h('div', { class: 'grid2' }, fld('set.prefix', tin(d, 'prefix', { id: 'setPrefix', max: 6, dir: 'ltr' }), 'set.prefixHint'), fld('set.currency', tin(d, 'currency', { id: 'setCur', max: 3, dir: 'ltr' }), 'set.currencyHint')),
    fld('set.defaultDays', tin(d, 'defaultDays', { id: 'setDays', type: 'number', num: true, min: 0, step: 1, mode: 'numeric' }), 'set.defaultDaysHint'),
    fld('set.footer', biInputs(d.footer), 'set.footerHint'));

  // ---- contract: owner, signature, standard clauses (private)
  const contract = contractCard(d.contract, msg);

  // ---- this device only
  const device = h('div', { class: 'card stack-sm' }, h('h2', {}, t('set.device')),
    fld('set.idle', selectEl([['5', t('set.min', { n: 5 })], ['15', t('set.min', { n: 15 })], ['30', t('set.min', { n: 30 })], ['60', t('set.min', { n: 60 })]], d.idle, (v) => { d.idle = v; }, 'setIdle'), 'set.idleHint'));

  const typeBlocks = draftTypes.map((ty, i) => {
    const det = h('details', { class: 'card', open: openTypes.has(ty) || !ty.code });
    det.addEventListener('toggle', () => { if (det.open) openTypes.add(ty); else openTypes.delete(ty); });
    const code = tin(ty, 'code', { max: 5, dir: 'ltr', ro: existingCodes.has(ty.code), on: () => { ty.code = ty.code.toUpperCase().replace(/[^A-Z0-9]/g, ''); } });
    det.append(
      h('summary', {}, h('span', { class: 'mono badge enc' }, ty.code || '—'), h('span', { dir: 'auto' }, L(ty.name) || t('set.newType'))),
      h('div', { class: 'stack-sm' },
        h('div', { class: 'grid2' }, fld('set.code', code, 'set.codeHint'), fld('set.typeName', biInputs(ty.name))),
        h('strong', {}, t('set.template')),
        h('p', { class: 'hint' }, t('set.templateHint')),
        stageEditor(ty.stages, { tpl: true, state: false, structure: true }),
        h('div', { class: 'actions' }, h('button', { class: 'small danger', type: 'button', disabled: draftTypes.length < 2, onclick: () => { if (confirm(t('set.removeConfirm'))) { draftTypes.splice(i, 1); renderSettings(routeToken, true); } } }, t('set.removeType')))));
    return det;
  });

  async function onSave() {
    const p = String(d.prefix || '').trim().toUpperCase(), c = String(d.currency || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{1,6}$/.test(p)) return setMsg(msg, 'bad', t('set.badPrefix'));
    if (!/^[A-Z]{3}$/.test(c)) return setMsg(msg, 'bad', t('set.badCur'));
    const days = d.defaultDays === '' ? 0 : Number(d.defaultDays);
    if (!Number.isInteger(days) || days < 0 || days > 730) return setMsg(msg, 'bad', t('set.badDays'));
    if (!(b.name.en || '').trim() && !(b.name.ar || '').trim()) return setMsg(msg, 'bad', t('set.badBrand'));
    if (b.website && !/^https:\/\/[^\s<>"]+$/i.test(b.website.trim())) return setMsg(msg, 'bad', t('set.badWebsite'));
    if (b.email && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(b.email.trim())) return setMsg(msg, 'bad', t('set.badEmail'));
    b.inbox = String(b.inbox || '').trim(); d.inboxKey = String(d.inboxKey || '').trim();
    if (b.inbox && !INBOX_RE.test(b.inbox)) return setMsg(msg, 'bad', t('set.badInbox'));
    if (b.inbox && !INBOX_KEY_RE.test(d.inboxKey)) return setMsg(msg, 'bad', t('set.badInboxKey'));
    if (b.whatsapp && !/^\d{8,15}$/.test(String(b.whatsapp).replace(/\D/g, ''))) return setMsg(msg, 'bad', t('set.badWa'));
    if (b.look && b.look.accent && !/^#[0-9a-f]{6}$/.test(String(b.look.accent).trim().toLowerCase())) return setMsg(msg, 'bad', t('look.badAccent'));
    for (const n of CODE_NAMES) if (!codePatternOk(d.codes[n])) return setMsg(msg, 'bad', t('code.badSave', { n: t('code.for.' + n) }));
    for (const k of ['direct', 'indirect']) { d.costCats[k] = d.costCats[k].filter((x) => (x.en || '').trim() || (x.ar || '').trim()); if (d.costCats[k].length > CATS_MAX) return setMsg(msg, 'bad', t('cc.tooMany', { n: CATS_MAX })); }
    { const names = new Set(); for (const x of normBrands(d.brands)) { const k = x.name.toLowerCase(); if (names.has(k)) return setMsg(msg, 'bad', t('brand.dup', { n: x.name })); names.add(k); } }
    const cw = d.contract.warrantyMonths === '' ? NaN : Number(d.contract.warrantyMonths);
    if (!Number.isInteger(cw) || cw < 0 || cw > 120) return setMsg(msg, 'bad', t('set.badWarranty'));
    const seen = new Set();
    for (const ty of draftTypes) {
      if (!/^[A-Z0-9]{2,5}$/.test(ty.code || '')) return setMsg(msg, 'bad', t('set.badCode'));
      if (seen.has(ty.code)) return setMsg(msg, 'bad', t('set.dupCode', { c: ty.code })); seen.add(ty.code);
      if (!(ty.name.en || '').trim() && !(ty.name.ar || '').trim()) return setMsg(msg, 'bad', t('set.noName', { c: ty.code }));
      if (!ty.stages.length || ty.stages.some((st) => !(st.name.en || '').trim() && !(st.name.ar || '').trim())) return setMsg(msg, 'bad', t('set.badStages', { c: ty.code }));
    }
    setMsg(msg, '', t('act.saving'));
    const before = clone(session.settings); let saved = false;
    try {
      session.settings = Object.assign({}, session.settings, { prefix: p, currency: c, defaultDays: days, reportFooter: { en: (d.footer.en || '').trim(), ar: (d.footer.ar || '').trim() }, brand: sanitizeBrand(b), contract: normContract(d.contract), inboxKey: d.inboxKey, codes: normCodes(d.codes), costCats: normCostCats(d.costCats), paper: normPaper(d.paper), labels: normLabels(d.labels), brands: normBrands(d.brands), types: clone(draftTypes) });
      applyCostCats(session.settings.costCats);
      await saveSettings(); saved = true;
      auditSave('settings', 'update', 'settings', t('nav.settings'), before, session.settings);
      await publishBrand(); applyPaper(session.settings.paper);
      ls.set('dsp.idle', d.idle); armIdle();
      CUR = c; draftTypes = null; draftSet = null; toast(t('set.saved'), 'ok'); renderSettings(routeToken, false);
    } catch (e) {
      if (!saved) { session.settings = before; brand = before.brand; applyBrand(); applyCostCats(before.costCats); }
      setMsg(msg, 'bad', saved ? t('set.publishFail') : '', e.message);
    }
  }

  mount(h('section', { class: 'stack' },
    h('div', { class: 'page-head' }, h('h1', {}, t('nav.settings')), encBadge(t('badge.synced'))),
    roWrap(readOnly('settings'), company, lookCard(d), labelsCard(d), inboxCardEl, business, codesCard(d), costCatsCard(d, () => renderSettings(routeToken, true)), brandsCard(d, () => renderSettings(routeToken, true)), contract, configCard(d, () => renderSettings(routeToken, true)), device,
    h('div', { class: 'card-head' }, h('h2', {}, t('set.types')),
      h('button', { class: 'btn', type: 'button', onclick: () => { draftTypes.push({ code: '', name: { en: '', ar: '' }, stages: [S_CUT(), S_EDGE(), S_CNC(), S_ASM()] }); renderSettings(routeToken, true); } }, t('set.addType'))),
    h('div', { class: 'stack-sm' }, typeBlocks)),
    readOnly('settings') ? null : h('div', { class: 'actions' },
      h('button', { class: 'btn primary', type: 'button', id: 'btnSaveSettings', onclick: onSave }, t('set.save')),
      h('button', { class: 'btn ghost', type: 'button', onclick: () => { if (confirm(t('set.resetConfirm'))) { draftTypes = defaultTypes(); renderSettings(routeToken, true); } } }, t('set.resetTypes'))),
    msg));
}
