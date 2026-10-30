/**
 * <admin>/js/views/labels.js  -  Labels: small stickers for a project or for every piece of it
 * #labels/<client id>/<project number>: choose the size (2.5 x 2.5 cm, or a strip 2.5 cm tall and any length), what is printed (logo, a thin Egypt flag with the
 * slogan, client and product data, the piece, a QR code and/or a Code 128 barcode of the SKU), one label for the project or one for every piece, and print. Every label is its own page
 * of exactly the label's size (@page lbl), so a label printer or "Save as PDF" gives one label per page. Nothing here is ever published to a client.
 * Loaded by: admin page
 */
'use strict';

let lblSel = null;                                            // what the screen is set to: { size, length, fields, slogan, copies, scope }
const EG_FLAG = ['#ce1126', '#ffffff', '#000000'];            // red, white, black (the eagle is left out: it is not readable at this size)

// the labels of one project: [{ part, k, n }]. Scope 'pieces' = one label for every piece of every part (a part with quantity 4 gives 4 labels), 'project' = one label.
function labelItems(p, scope, copies) {
  let list = [{ part: null, k: 0, n: 0 }];
  if (scope === 'pieces') {
    list = [];
    for (const x of p.parts || []) { const n = Math.max(1, Math.min(200, Math.round(num(x.qty)) || 1)); for (let k = 1; k <= n; k++) list.push({ part: x, k, n }); }
    if (!list.length) list = [{ part: null, k: 0, n: 0 }];
  }
  const out = []; for (const it of list) for (let c = 0; c < copies; c++) out.push(it);
  return out;
}
const labelPieces = (p) => (p.parts || []).reduce((a, x) => a + Math.max(1, Math.round(num(x.qty)) || 1), 0);
function labelData(rec, p, it) {
  const pcs = labelPieces(p);
  return { clientId: rec.id, clientName: rec.client.name, sku: p.sku, title: p.title || L(p.typeName) || p.type || '', date: fmtDay(todayStr()),
    piece: it.part ? (it.part.name || t('lbl.piece')) + ' ' + nf(it.k) + '/' + nf(it.n) : pcs ? t('lbl.nPieces', { n: nf(pcs) }) : '' };
}

/* ---- one label ---- */
function lblLogo() {
  if (brand.logo) return h('img', { class: 'lbl-logoimg', src: brand.logo, alt: '' });
  const m = h('span', { class: 'lbl-mark', 'aria-hidden': 'true' }); m.innerHTML = LOGO_MARK;
  return h('span', { class: 'lbl-logo' }, m, h('span', { class: 'lbl-brand', dir: 'auto' }, brandName()));
}
function lblFlag() {
  return h('span', { class: 'lbl-flag', 'aria-hidden': 'true' }, EG_FLAG.map((c) => h('i', { style: 'background:' + c })));
}
// the barcode of a text: Code 128 as an SVG of bars, drawn with the SVG helper (no markup from text)
function lblBarcode(text) {
  const b = code128Bars(text), Q = 10, W = b.modules + 2 * Q;
  const svg = se('svg', { viewBox: '0 0 ' + W + ' 10', class: 'lbl-bar', preserveAspectRatio: 'none', role: 'img', 'aria-label': text, 'data-code': text });
  let x = Q; b.bars.forEach((w, i) => { if (i % 2 === 0) svg.append(se('rect', { x, y: 0, width: w, height: 10, fill: '#000' })); x += w; });
  return svg;
}
// the QR code of a text: modules drawn as one path with the SVG helper (nothing from the text is ever used as markup). A QR code stays readable on a 2.5 cm label where a barcode is too fine.
function lblQr(text) {
  const q = qrMatrix(text), Q = 2, W = q.size + 2 * Q; let d = '';
  q.rows.forEach((row, y) => row.forEach((on, x) => { if (on) d += 'M' + (x + Q) + ' ' + (y + Q) + 'h1v1h-1z'; }));
  const svg = se('svg', { viewBox: '0 0 ' + W + ' ' + W, class: 'lbl-qr', role: 'img', 'aria-label': text, 'data-code': text, 'shape-rendering': 'crispEdges' });
  svg.append(se('rect', { x: 0, y: 0, width: W, height: W, fill: '#fff' }), se('path', { d, fill: '#000' }));
  return svg;
}
function renderLabel(sel, d) {
  const has = (f) => sel.fields.includes(f), strip = sel.size === 'strip', [w, hh] = labelPageMm(sel);
  const logo = has('logo') ? h('div', { class: 'lbl-top' }, lblLogo()) : null;
  const flag = has('flag') ? h('div', { class: 'lbl-eg' }, lblFlag(), sel.slogan ? h('span', { class: 'lbl-slogan', dir: 'ltr' }, sel.slogan) : null) : null;
  const lines = [has('clientId') ? h('div', { class: 'lbl-line mono', dir: 'ltr', 'data-f': 'clientId' }, d.clientId) : null, has('clientName') ? h('div', { class: 'lbl-line', dir: 'auto', 'data-f': 'clientName' }, d.clientName) : null,
    has('sku') ? h('div', { class: 'lbl-line lbl-sku mono', dir: 'ltr', 'data-f': 'sku' }, d.sku) : null, has('title') && d.title ? h('div', { class: 'lbl-line lbl-title', dir: 'auto', 'data-f': 'title' }, d.title) : null,
    has('piece') && d.piece ? h('div', { class: 'lbl-line lbl-piece', dir: 'auto', 'data-f': 'piece' }, d.piece) : null, has('date') ? h('div', { class: 'lbl-line', dir: 'ltr', 'data-f': 'date' }, d.date) : null].filter(Boolean);
  const bar = has('barcode') ? h('div', { class: 'lbl-barbox' }, lblBarcode(d.sku)) : null, qr = has('qr') ? h('div', { class: 'lbl-qrbox' }, lblQr(d.sku)) : null;
  const text = h('div', { class: 'lbl-text' }, lines);
  const el = h('div', { class: 'lbl lbl-' + sel.size, 'data-size': sel.size, dir: 'ltr' },
    strip ? [h('div', { class: 'lbl-side' }, logo, flag), text, qr, bar] : [logo, flag, qr ? h('div', { class: 'lbl-mid' }, text, qr) : text, bar]);
  el.style.setProperty('--w', w + 'mm'); el.style.setProperty('--hh', hh + 'mm');
  return el;
}
// shrink the text of a label that does not fit its size, a step at a time (down to about half); a label that still does not fit is marked
function fitLabel(el) {
  let u = 1; el.style.setProperty('--u', '1'); el.removeAttribute('data-tight');
  const over = () => el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1;
  while (over() && u > 0.52) { u = Math.round((u - 0.04) * 100) / 100; el.style.setProperty('--u', String(u)); }
  if (over()) el.setAttribute('data-tight', '1');
  el.setAttribute('data-u', String(u));
  return u;
}

/* ---- the page rule of the label size and printing ---- */
function labelPageRule(sel) {
  const [w, hh] = labelPageMm(sel); let st = document.getElementById('dsLabelPage');
  if (!st) { st = document.createElement('style'); st.id = 'dsLabelPage'; document.head.appendChild(st); }
  st.textContent = '@page lbl{size:' + w + 'mm ' + hh + 'mm;margin:0}';
}
function printLabels(sel, c) {
  labelPageRule(sel);
  document.querySelectorAll('#lblSheet .lbl').forEach(fitLabel);
  const old = document.title; document.title = (brandName() + '-' + t('lbl.fileName') + '-' + c.p.sku).replace(/[^\w؀-ۿ-]+/g, '_').replace(/^_+|_+$/g, '');
  const back = () => { document.title = old; removeEventListener('afterprint', back); };
  addEventListener('afterprint', back); window.print();
}

/* ---- the screen ---- */
async function renderLabels(token, id, pi) {
  if (!(await ensureStore(token))) return;
  CUR = store.settings.currency || CUR;
  let rec;
  if (ed && ed.id === id && !ed.isNew) rec = ed.rec;                                                  // unsaved changes of the open client show on the labels too
  else { const it = store.items.find((x) => x.rec.id === id); if (!it) return mount(notice(t('ed.notFound'), t('ed.notFoundSub', { id }), 'bad', { actions: [h('a', { class: 'btn', href: '#dashboard' }, t('nav.dashboard'))] })); rec = it.rec; }
  const i = Math.max(0, Math.min(Number(pi) || 0, rec.projects.length - 1));
  // the screen starts from the defaults of Settings; it keeps what was chosen on it until another client is opened or the defaults change
  const cfg = JSON.stringify(normLabels(session.settings.labels));
  if (!lblSel || lblSel.cid !== id || lblSel.cfg !== cfg) lblSel = Object.assign({}, clone(normLabels(session.settings.labels)), { scope: 'project', cid: id, cfg });
  drawLabels(rec, i);
}

function drawLabels(rec, i) {
  const p = rec.projects[i], sel = lblSel;
  const head = h('div', { class: 'page-head rp-noprint' },
    h('div', {}, h('a', { class: 'back', href: '#manage/' + rec.id }, t('act.back')), h('h1', { dir: 'auto' }, t('lbl.title') + ' — ' + rec.client.name)), encBadge());
  if (!p) return mount(h('section', { class: 'stack' }, head, h('p', { class: 'empty' }, t('pg.noProjects'))));
  const sheet = h('div', { class: 'lbl-sheet', id: 'lblSheet' }), count = h('p', { class: 'hint', id: 'lblCount', role: 'status' });
  const draw = () => {
    Object.assign(sel, normLabels(sel), { scope: sel.scope === 'pieces' ? 'pieces' : 'project', cid: rec.id });
    const items = labelItems(p, sel.scope, sel.copies), shown = items.slice(0, LABEL_MAX), [w, hh] = labelPageMm(sel);
    sheet.setAttribute('data-size', sel.size); labelPageRule(sel);
    sheet.replaceChildren(...shown.map((it) => renderLabel(sel, labelData(rec, p, it))));
    requestAnimationFrame(() => { const tight = [...sheet.querySelectorAll('.lbl')].map(fitLabel).filter((u, k) => sheet.children[k].hasAttribute('data-tight')).length;
      count.textContent = t('lbl.count', { n: nf(shown.length), w: nf(w / 10, { maximumFractionDigits: 1 }), h: nf(hh / 10, { maximumFractionDigits: 1 }) }) + (items.length > shown.length ? ' ' + t('lbl.capped', { n: nf(LABEL_MAX) }) : '') + (tight ? ' ' + t('lbl.tight') : ''); });
  };
  const mk = (f) => h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'lblF-' + f, checked: sel.fields.includes(f), onchange: (e) => { sel.fields = e.target.checked ? sel.fields.concat([f]) : sel.fields.filter((x) => x !== f); draw(); } }), h('span', {}, t('lbl.f.' + f)));
  const len = h('input', { id: 'lblLen', type: 'number', min: LABEL_LEN.min, max: LABEL_LEN.max, step: 0.5, inputmode: 'decimal', value: sel.length, 'aria-label': t('lbl.length') });
  len.addEventListener('input', () => { sel.length = len.value === '' ? LABEL_LEN.def : Number(len.value); draw(); });
  const lenFld = fld('lbl.length', len); const syncLen = () => { lenFld.hidden = sel.size !== 'strip'; }; syncLen();
  const slogan = h('input', { id: 'lblSlogan', maxlength: 40, dir: 'ltr', value: sel.slogan, 'aria-label': t('lbl.slogan') });
  slogan.addEventListener('input', () => { sel.slogan = slogan.value; draw(); });
  const copies = h('input', { id: 'lblCopies', type: 'number', min: 1, max: 20, step: 1, inputmode: 'numeric', value: sel.copies, 'aria-label': t('lbl.copies') });
  copies.addEventListener('input', () => { sel.copies = Math.round(Number(copies.value)) || 1; draw(); });
  const pcs = labelPieces(p);
  const options = h('section', { class: 'card stack-sm rp-noprint', id: 'lblOptions' },
    h('div', { class: 'card-head' }, h('h2', {}, t('lbl.options')), h('span', { class: 'chip mono' }, p.sku)),
    h('p', { class: 'hint' }, t('lbl.hint')),
    h('div', { class: 'grid2' }, fld('lbl.size', selectEl([['sq', t('lbl.size.sq')], ['strip', t('lbl.size.strip')]], sel.size, (v) => { sel.size = v; syncLen(); draw(); }, 'lblSize')), lenFld),
    h('div', { class: 'grid2' }, fld('lbl.scope', selectEl([['project', t('lbl.scope.project')], ['pieces', t('lbl.scope.pieces', { n: nf(pcs) })]], sel.scope, (v) => { sel.scope = v; draw(); }, 'lblScope'), pcs ? null : 'lbl.noParts'), fld('lbl.copies', copies)),
    h('fieldset', { class: 'lbl-fields' }, h('legend', {}, t('lbl.fields')), h('div', { class: 'checks' }, LABEL_FIELDS.map(mk))), h('p', { class: 'hint' }, t('lbl.codeHint')),
    fld('lbl.slogan', slogan, 'lbl.sloganHint'),
    h('div', { class: 'actions' }, h('button', { class: 'btn primary', type: 'button', id: 'btnLblPrint', onclick: () => printLabels(sel, { p }) }, t('lbl.print')), h('span', { class: 'hint' }, t('lbl.printHint')), can('settings') ? h('a', { class: 'btn small ghost', href: '#settings' }, t('lbl.defaults')) : null),
    count);
  const pills = (() => { if (rec.projects.length < 2) return null; return h('div', { class: 'tabs', role: 'tablist', 'aria-label': t('ed.projects') }, rec.projects.map((x, k) => h('a', { class: 'tab pill', role: 'tab', 'aria-selected': String(k === i), href: '#labels/' + rec.id + '/' + k }, h('span', { class: 'mono' }, x.sku)))); })();
  mount(h('section', { class: 'stack rp-page lbl-screen' }, head, pills ? h('div', { class: 'rp-noprint' }, pills) : null, options, h('div', { class: 'lbl-area' }, sheet)));
  draw();
}
