/**
 * <admin>/js/views/reports/screen.js  -  Reports screen
 * Report picker (type, client, project, dates), print / Save as PDF, Excel download.
 * Loaded by: admin page
 */
'use strict';

/* ---------------- screen ---------------- */
const auditExport = (m, how) => audit({ area: 'reports', act: 'export', ref: m.type || '', title: m.title || reportFileName(m), note: how });
function printReport(m) {
  paperNow(); auditExport(m, 'print');
  const old = document.title; document.title = reportFileName(m);
  const back = () => { document.title = old; removeEventListener('afterprint', back); };
  addEventListener('afterprint', back); window.print();
}
async function downloadXlsx(m, btn) {
  const label = btn.textContent; btn.disabled = true; btn.textContent = t('rp.building');
  try {
    const bytes = await buildXlsx(m);
    saveBlob(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), reportFileName(m) + '.xlsx'); auditExport(m, 'xlsx');
    toast(t('rp.xlsxDone'), 'ok');
  } catch (e) { toast(t('rp.xlsxFail', { m: e.message }), 'bad'); } finally { btn.disabled = false; btn.textContent = label; }
}

// the report sheet as a picture (PNG), for a message or a chat: the width of the chosen paper, sharp on a phone
const reportPngWidth = () => { const p = $('#rpPaper'), sz = PAPERS[normPaper(session.settings && session.settings.paper)]; return paperPx(p && p.classList.contains('land') ? sz[1] : sz[0]); };
async function reportPng(m) {
  const paper = $('#rpPaper'); if (!paper) throw new Error(t('img.fail'));
  const width = reportPngWidth();
  return domToPng(paper, { width, scale: Math.min(2, 1700 / width) });
}
async function downloadPng(m, btn) {
  const label = btn.textContent; btn.disabled = true; btn.textContent = t('rp.building');
  try { saveBlob(await reportPng(m), reportFileName(m) + '.png'); auditExport(m, 'png'); toast(t('rp.pngDone'), 'ok'); }
  catch (e) { toast(t('rp.pngFail', { m: e.message }), 'bad'); } finally { btn.disabled = false; btn.textContent = label; }
}

// the report types the signed-in person may open, and the files a type needs before it can be drawn
const allowedReports = () => REPORT_TYPES.filter(reportAllowed);
async function loadReportData(token, sel) {
  if (!(await ensureOps(token, reportNeeds(sel.type)))) return false;
  try { await prepReport(sel); } catch (e) { if (token === routeToken) mount(notice(t('err.load'), e.message, 'bad', { actions: [h('button', { class: 'btn', type: 'button', onclick: () => route() }, t('act.retry'))] })); return false; }
  return token === routeToken;
}
async function renderReports(token, keep, parts) {
  if (!(await ensureStore(token))) return;
  CUR = store.settings.currency || CUR; paperNow();
  if (ed && !ed.dirty) ed = null;
  if (parts && parts.length) {                                   // #reports/<type>[/<id>]: the "print report" buttons of the Logistics, Supply chain, Inventory, Finance and History screens
    if (REPORT_TYPES.includes(parts[0]) && reportAllowed(parts[0])) Object.assign(reportSel, { type: parts[0], cat: '', sup: '', state: '', kind: '', ship: parts[0] === 'shipment' ? parts[1] || '' : '', from: '', to: '', awho: '', aarea: '' }, parts[0] === 'contracts' ? { client: parts[1] || '' } : parts[0] === 'overview' ? { client: '' } : {});   // the company-wide reports must not keep the client chosen in an earlier report
    history.replaceState(null, '', '#reports');                  // so a language switch redraws the same report without applying the address again
  }
  if (!reportAllowed(reportSel.type)) reportSel.type = allowedReports()[0] || 'finance';
  if (!(await loadReportData(token, reportSel))) return;
  drawReports();
}
const RP_HINT = { inventory: 'rp.hint.asOf', reorder: 'rp.hint.asOf', suppliers: 'rp.hint.asOf', stockmoves: 'rp.hint.moves', logistics: 'rp.hint.lg', shipment: 'rp.hint.ship', costs: 'rp.hint.costs', collections: 'rp.hint.coll', contracts: 'rp.hint.ctr', overview: 'rp.hint.ovw', audit: 'rp.hint.audit' };
function drawReports() {
  const sel = reportSel, rec = store.items.find((x) => x.rec.id === sel.client);
  if (sel.client && !rec) { sel.client = ''; sel.project = ''; }
  if (sel.project && !(rec && rec.rec.projects.some((p) => p.sku === sel.project))) sel.project = '';
  let model = null; const area = h('div', { class: 'rp-area' });
  const draw = () => { model = buildReport(sel); area.replaceChildren(renderPaper(model)); };
  const typeSel = selectEl(allowedReports().map((k) => [k, t('rp.type.' + k)]), sel.type, (v) => {
    Object.assign(sel, { type: v, cat: '', state: '' });
    const need = reportNeeds(v).filter((n) => !ops[n]);
    Promise.all([Promise.all(need.map((n) => loadOps(n))).then(() => refreshOpsAlerts()), prepReport(sel)]).then(drawReports, (e) => { toast(e.message, 'bad'); drawReports(); });
  }, 'rpType');
  const date = (key, id) => h('input', { type: 'date', id, value: sel[key], onchange: (e) => { sel[key] = e.target.value; draw(); } });
  const pick = (key, id, opts, label) => selectEl(opts, sel[key], (v) => { sel[key] = v; draw(); }, id, label);
  const supOpts = () => [['', t('inv.allSuppliers')], ['-', t('ops.noSupplier')]].concat(opsList('suppliers').map((s) => [s.id, s.name]));
  const catOpts = () => [['', t('inv.allCats')]].concat(sel.type === 'suppliers' ? SUP_CATS.map((c) => [c, t('sup.cat.' + c)]) : BOM_CATS.map((c) => [c, t('bom.cat.' + c)]));
  const stateOpts = () => (sel.type === 'collections' ? COL_FILTERS.map((k) => [k === 'open' ? '' : k, t('col.f.' + k)]) : sel.type === 'contracts' ? CTR_FILTERS.map((k) => [k === 'all' ? '' : k, t('ctr.f.' + k)]) : sel.type === 'logistics' ? LG_SHOWS.map((k) => [k, t('lg.show.' + k)]) : INV_SHOWS.map((k) => [k, t('inv.show.' + k)]));
  const shipOpts = () => opsList('logistics').map((s) => [s.id, s.id + ' · ' + (s.title || '')]);
  const make = {
    client: () => fld('rp.client', selectEl([['', t('rp.allClients')]].concat(store.items.map((x) => [x.rec.id, x.rec.client.name + ' · ' + x.rec.id])), sel.client, (v) => { sel.client = v; sel.project = ''; drawReports(); }, 'rpClient')),
    project: () => { const s = selectEl([['', t('rp.allProjects')]].concat(rec ? rec.rec.projects.map((p) => [p.sku, projLabel(p)]) : []), sel.project, (v) => { sel.project = v; draw(); }, 'rpProject'); s.disabled = !rec; return fld('rp.project', s); },
    from: () => fld('rp.from', date('from', 'rpFrom')), to: () => fld('rp.to', date('to', 'rpTo')),
    cat: () => fld('inv.category', pick('cat', 'rpCat', catOpts(), t('inv.category'))), sup: () => fld('inv.supplier', pick('sup', 'rpSup', supOpts(), t('inv.supplier'))),
    state: () => fld('rp.f.status', pick('state', 'rpState', stateOpts(), t('rp.f.status'))), kind: () => fld('lg.kindLabel', pick('kind', 'rpKind', [['', t('lg.allKinds')]].concat(LG_KINDS.map((k) => [k, t('lg.kind.' + k)])), t('lg.kindLabel'))),
    ship: () => { if (!shipOpts().some((x) => x[0] === sel.ship)) sel.ship = (shipOpts()[0] || [''])[0]; return fld('rp.f.shipment', pick('ship', 'rpShip', shipOpts(), t('rp.f.shipment'))); },
    // costs: the period and the way shared costs are spread are the ones of the Finance screen
    fperiod: () => [fld('fin.period', selectEl(FIN_PRESETS.map((p) => [p, t('fin.p.' + p)]), finSel.preset, (v) => { finSel.preset = v; drawReports(); }, 'rpFinPreset')),
      finSel.preset === 'custom' ? fld('fin.from', h('input', { type: 'date', id: 'rpFinFrom', value: finSel.from, onchange: (e) => { finSel.from = e.target.value; draw(); } })) : null,
      finSel.preset === 'custom' ? fld('fin.to', h('input', { type: 'date', id: 'rpFinTo', value: finSel.to, onchange: (e) => { finSel.to = e.target.value; draw(); } })) : null],
    fbasis: () => fld('fin.basis', selectEl(FIN_BASES.map((b) => [b, t('fin.basis.' + b)]), finSel.basis, (v) => { finSel.basis = v; draw(); }, 'rpFinBasis')),
    // history: one month of the audit trail at a time
    amonth: () => fld('aud.month', selectEl(auditRep.months.length ? auditRep.months.map((m) => [m, audMonthLabel(m)]) : [[auditRep.month, audMonthLabel(auditRep.month || auditMonthOf(oiso()))]], sel.amonth, (v) => {
      sel.amonth = v; sel.awho = ''; prepReport(sel).then(drawReports, (e) => toast(e.message, 'bad')); }, 'rpAudMonth')),
    awho: () => fld('aud.person', selectEl([['', t('aud.allPeople')]].concat([...new Map(auditRep.items.map((e) => [e.uid, e.who || e.uid])).entries()]), sel.awho, (v) => { sel.awho = v; draw(); }, 'rpAudWho')),
    aarea: () => fld('aud.areaLabel', selectEl([['', t('aud.allAreas')]].concat(AUDIT_AREAS.map((a) => [a, t('aud.area.' + a)])), sel.aarea, (v) => { sel.aarea = v; draw(); }, 'rpAudArea')),
  };
  const fields = (REPORT_FILTERS[sel.type] || []).flatMap((k) => [].concat(make[k]())).filter(Boolean);
  const bPrint = h('button', { class: 'btn primary', type: 'button', id: 'btnRpPrint', onclick: () => printReport(model) }, t('rp.print'));
  const bXlsx = h('button', { class: 'btn', type: 'button', id: 'btnRpXlsx', onclick: () => downloadXlsx(model, bXlsx) }, t('rp.xlsx'));
  const bPng = h('button', { class: 'btn', type: 'button', id: 'btnRpPng', onclick: () => downloadPng(model, bPng) }, t('rp.png'));
  draw();
  mount(h('section', { class: 'stack rp-page' },
    h('div', { class: 'page-head rp-noprint' }, h('h1', {}, t('nav.reports')), encBadge()),
    h('div', { class: 'card stack-sm rp-noprint rp-bar' },
      h('div', { class: 'rp-filters' }, fld('rp.type', typeSel), fields),
      h('p', { class: 'hint' }, t(RP_HINT[sel.type] || 'rp.rangeHint')),
      h('div', { class: 'actions' }, bPrint, bXlsx, bPng, shareButton(() => Object.assign(reportShareText(model), { file: async () => new File([await reportPng(model)], reportFileName(model) + '.png', { type: 'image/png' }) }), 'btnRpShare')), h('p', { class: 'hint' }, t('rp.printHint'))),
    area));
}
