/**
 * <admin>/js/views/settings-contract.js  -  Settings: the contract card and the signature editor
 * Owner name and title, the signature (drawn on a pad or uploaded and cleaned), default language, warranty, the standard clauses and named
 * templates of clauses (a project can use one of them, or have clauses of its own: see contract.js).
 * Everything here lives in the encrypted private settings; nothing is published to the client site.
 * Loaded by: admin page
 */
'use strict';

const SIG_W = 600, SIG_H = 220;                    // the stored signature is scaled to fit this box

// Crop a canvas to its inked area (a little margin), scale it into the box and return a PNG data URL ('' when nothing is drawn).
function sigFromCanvas(src) {
  const w = src.width, hh = src.height, d = src.getContext('2d').getImageData(0, 0, w, hh).data;
  let x0 = w, y0 = hh, x1 = -1, y1 = -1;
  for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return '';
  x0 = Math.max(0, x0 - 6); y0 = Math.max(0, y0 - 6); x1 = Math.min(w - 1, x1 + 6); y1 = Math.min(hh - 1, y1 + 6);
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
  for (const k of [1, 0.8, 0.6, 0.45]) {            // shrink until the PNG is small enough to keep in the settings
    const sc = Math.min(1, SIG_W / cw, SIG_H / ch) * k, c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(cw * sc)); c.height = Math.max(1, Math.round(ch * sc));
    c.getContext('2d').drawImage(src, x0, y0, cw, ch, 0, 0, c.width, c.height);
    const url = c.toDataURL('image/png');
    if (url.length <= SIG_MAX) return url;
  }
  return '';
}
// A photo or scan of a signature on white paper: white becomes transparent, dark ink stays solid and is deepened a little.
async function signatureFromFile(file) {
  if (file.size > 12 * 1024 * 1024) throw new Error(t('set.logoBig'));
  let bmp; try { bmp = await createImageBitmap(file); } catch (_) { throw new Error(t('ph.unsupported', { name: file.name })); }
  try {
    const sc = Math.min(1, 1200 / Math.max(bmp.width, bmp.height)), c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(bmp.width * sc)); c.height = Math.max(1, Math.round(bmp.height * sc));
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(bmp, 0, 0, c.width, c.height);
    const im = g.getImageData(0, 0, c.width, c.height), px = im.data;
    for (let i = 0; i < px.length; i += 4) {
      const lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
      const a = Math.max(0, Math.min(255, Math.round((190 - lum) * 255 / 80)));          // lighter than 190 = paper (transparent), darker than 110 = ink (solid)
      px[i] = Math.round(px[i] * 0.55); px[i + 1] = Math.round(px[i + 1] * 0.55); px[i + 2] = Math.round(px[i + 2] * 0.55); px[i + 3] = Math.min(px[i + 3], a);
    }
    g.putImageData(im, 0, 0);
    const url = sigFromCanvas(c);
    if (!url) throw new Error(t('ct.sigBad'));
    return url;
  } finally { if (bmp.close) bmp.close(); }
}

// Drawing pad: pointer events cover mouse, finger and pen. onUse(dataUrl) / onCancel().
function sigPad(onUse, onCancel) {
  const W = 1120, H = 400, cv = h('canvas', { width: W, height: H, class: 'sigpad', id: 'sigPad', role: 'img', 'aria-label': t('ct.padLabel') });
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = 6; g.strokeStyle = '#10256b';
  let last = null, mid = null, inked = false;
  const at = (e) => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height }; };
  const stroke = (a, ctl, b) => { g.beginPath(); g.moveTo(a.x, a.y); g.quadraticCurveTo(ctl.x, ctl.y, b.x, b.y); g.stroke(); };
  cv.addEventListener('pointerdown', (e) => { e.preventDefault(); try { cv.setPointerCapture(e.pointerId); } catch (_) { /* not supported: drawing still works inside the box */ } last = mid = at(e); stroke(last, last, { x: last.x + 0.1, y: last.y + 0.1 }); inked = true; });
  cv.addEventListener('pointermove', (e) => { if (!last) return; const p = at(e), m = { x: (last.x + p.x) / 2, y: (last.y + p.y) / 2 }; stroke(mid, last, m); last = p; mid = m; });
  const end = () => { if (last) stroke(mid, last, last); last = null; };
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((n) => cv.addEventListener(n, end));
  const hint = h('p', { class: 'hint' }, t('ct.padHint')), err = h('p', { class: 'msg bad', hidden: true });
  return h('div', { class: 'stack-sm sigpadbox' }, hint, cv, err, h('div', { class: 'actions' },
    h('button', { class: 'btn small', type: 'button', id: 'btnPadClear', onclick: () => { g.clearRect(0, 0, W, H); inked = false; err.hidden = true; } }, t('ct.padClear')),
    h('button', { class: 'btn small primary', type: 'button', id: 'btnPadUse', onclick: () => { const url = inked ? sigFromCanvas(cv) : ''; if (!url) { err.textContent = t('ct.padEmpty'); err.hidden = false; return; } onUse(url); } }, t('ct.padUse')),
    h('button', { class: 'btn small ghost', type: 'button', id: 'btnPadCancel', onclick: onCancel }, t('ct.padCancel'))));
}

function signatureEditor(c, msg) {
  const box = h('div', { class: 'sigbox', id: 'sigPreview' }), padHost = h('div', { hidden: true });
  const show = () => box.replaceChildren(c.signature ? h('img', { class: 'sigprev', src: c.signature, alt: t('ct.signature') }) : h('span', { class: 'muted small' }, t('ct.sigNone')));
  show();
  const file = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', hidden: true, id: 'sigFile' });
  file.addEventListener('change', async () => {
    const f = file.files[0]; file.value = ''; if (!f) return;
    try { c.signature = await signatureFromFile(f); show(); setMsg(msg, ''); } catch (e) { setMsg(msg, 'bad', e.message); }
  });
  const close = () => { padHost.hidden = true; padHost.replaceChildren(); };
  const open = () => { padHost.replaceChildren(sigPad((url) => { c.signature = url; show(); close(); setMsg(msg, ''); }, close)); padHost.hidden = false; };
  return h('div', { class: 'stack-sm' }, h('strong', { class: 'small' }, t('ct.signature')), h('p', { class: 'hint' }, t('ct.sigHint')), box,
    h('div', { class: 'actions' }, h('button', { class: 'btn small', type: 'button', id: 'btnSigDraw', onclick: open }, t('ct.sigDraw')),
      h('button', { class: 'btn small', type: 'button', id: 'btnSigUpload', onclick: () => file.click() }, t('ct.sigUpload')),
      h('button', { class: 'btn small ghost', type: 'button', id: 'btnSigRemove', onclick: () => { c.signature = ''; show(); } }, t('ct.sigRemove')), file), padHost);
}

// named templates of clauses: d.templates = [{ id, name: { en, ar }, terms: { en, ar } }]. A template without a name is dropped when Settings is saved.
function templatesBlock(d) {
  d.templates = Array.isArray(d.templates) ? d.templates : [];
  const box = h('div', { class: 'stack-sm', id: 'ctTplBox' });
  const ta = (o, key, id, dir) => { const e = tarea(o, key, { id, rows: 10, max: 12000 }); e.dir = dir; return e; };
  const draw = () => box.replaceChildren(h('strong', {}, t('ct.tpl.title')), h('p', { class: 'hint' }, t('ct.tpl.hint')),
    ...(d.templates.length ? d.templates.map((x, i) => h('div', { class: 'card stack-sm ct-tpl', 'data-id': x.id },
      h('div', { class: 'grid2' }, fld('ct.tpl.nameAr', tin(x.name, 'ar', { id: 'ctTplNameAr' + i, max: 60 })), fld('ct.tpl.nameEn', tin(x.name, 'en', { id: 'ctTplNameEn' + i, max: 60 }))),
      h('div', { class: 'grid2' }, fld('ct.termsAr', ta(x.terms, 'ar', 'ctTplAr' + i, 'rtl')), fld('ct.termsEn', ta(x.terms, 'en', 'ctTplEn' + i, 'ltr'))),
      h('div', { class: 'actions' }, h('button', { class: 'btn small danger', type: 'button', id: 'ctTplDel' + i, onclick: () => { d.templates.splice(i, 1); draw(); } }, t('act.remove'))))) : [h('p', { class: 'empty', id: 'ctTplNone' }, t('ct.tpl.none'))]),
    h('div', { class: 'actions' }, h('button', { class: 'btn small', type: 'button', id: 'btnTplAdd', disabled: d.templates.length >= 12, onclick: () => {
      d.templates.push({ id: 't' + uid(), name: { en: '', ar: '' }, terms: { en: d.terms.en, ar: d.terms.ar } }); draw();
      const n = document.getElementById('ctTplNameAr' + (d.templates.length - 1)); if (n) n.focus();
    } }, t('ct.tpl.add'))));
  draw(); return box;
}

// d = the draft copy of settings.contract (edited in place; Save in Settings stores it)
function contractCard(d, msg) {
  const taOf = (o, key, id, dir) => { const e = tarea(o, key, { id, rows: 16, max: 12000 }); e.dir = dir; return e; };
  return h('div', { class: 'card stack-sm', id: 'contractCard' },
    h('div', { class: 'card-head' }, h('h2', {}, t('set.contract')), h('span', { class: 'badge enc' }, icon('lock'), t('ct.private'))),
    h('p', { class: 'notice' }, t('set.contractHint')),
    h('div', { class: 'grid2' }, fld('ct.ownerName', biInputs(d.owner.name)), fld('ct.ownerTitle', biInputs(d.owner.title))),
    signatureEditor(d, msg),
    h('div', { class: 'grid2' },
      fld('ct.defLang', selectEl([['ar', t('ct.lang.ar')], ['en', t('ct.lang.en')], ['both', t('ct.lang.both')]], d.lang, (v) => { d.lang = v; }, 'setCtLang')),
      fld('ct.defWarranty', tin(d, 'warrantyMonths', { id: 'setCtWarranty', type: 'number', num: true, min: 0, step: 1, mode: 'numeric' }), 'ct.warrantyHint0')),
    h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'setCtClient', checked: d.clientSign, onchange: (e) => { d.clientSign = e.target.checked; } }), h('span', {}, t('ct.defClientSign'))),
    h('div', { class: 'sep' }), h('strong', {}, t('ct.terms')), h('p', { class: 'hint' }, t('ct.termsHint')),
    h('p', { class: 'hint' }, t('ct.tokens') + ' ', h('code', { class: 'ltr' }, '{company} {client} {project} {sku} {price} {start} {due} {warranty} {date} {owner}')),
    h('div', { class: 'grid2' }, fld('ct.termsAr', taOf(d.terms, 'ar', 'setCtTermsAr', 'rtl')), fld('ct.termsEn', taOf(d.terms, 'en', 'setCtTermsEn', 'ltr'))),
    h('p', { class: 'msg warn' }, t('ct.legal')),
    templatesBlock(d),
    h('div', { class: 'actions' }, h('button', { class: 'btn small', type: 'button', id: 'btnTermsReset', onclick: () => {
      if (!confirm(t('ct.termsResetConfirm'))) return;
      d.terms.en = CONTRACT_TERMS.en; d.terms.ar = CONTRACT_TERMS.ar;
      document.getElementById('setCtTermsEn').value = d.terms.en; document.getElementById('setCtTermsAr').value = d.terms.ar;
    } }, t('ct.termsReset'))));
}
