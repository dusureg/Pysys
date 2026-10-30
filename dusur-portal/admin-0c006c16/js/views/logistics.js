/**
 * <admin>/js/views/logistics.js  -  Logistics: shipments and their steps
 * List of shipments (incoming from a supplier, outgoing to a client, between places) with progress and the current step, "step done" in one tap,
 * and the form of one shipment: details, steps (add, edit, reorder, status, dates), materials, receiving into the inventory.
 * Loaded by: admin page
 */
'use strict';

/* =====================================================================
   Logistics
   ===================================================================== */
let lgSel = { q: '', show: 'active', kind: '' };
const LG_SHOWS = ['active', 'late', 'blocked', 'completed', 'cancelled', 'all'];
const blankShipment = () => normShipment({ kind: 'inbound', steps: lgStepsFor('inbound') });
const lgMatch = (s, mode) => mode === 'all' || (mode === 'active' && lgOpen(s)) || (mode === 'late' && lgLate(s)) || lgState(s) === mode;

async function renderLogistics(token, sub) {
  if (!(await ensureOps(token, OPS_NAMES))) return;
  if (sub) {
    if (!(await ensureStore(token))) return;                       // the client list for outgoing shipments
    return opsOpen('logistics', sub, blankShipment, '#logistics', 'nav.logistics', drawShipForm);
  }
  drawLogistics();
}
const lgParty = (s) => (s.kind === 'inbound' ? supName(s.supplierId) : s.kind === 'outbound' ? [s.clientName, s.project].filter(Boolean).join(' · ') : '');
const lgReady = (s) => s.kind === 'inbound' && !s.received && !s.cancelled && s.lines.some((l) => l.itemId && num(l.qty) > 0) && lgState(s) === 'completed';

/* ---------------- the list ---------------- */
function shipCard(s) {
  const cur = lgCurrent(s), n = s.steps.length, done = s.steps.filter((x) => x.status === 'done').length, party = lgParty(s), open = lgOpen(s);
  return h('div', { class: 'item lg-item', 'data-id': s.id, 'data-state': lgState(s) },
    h('div', { class: 'item-top' }, h('strong', { dir: 'auto' }, s.title || s.id), h('span', { class: 'mono muted small' }, s.id), s.code ? h('span', { class: 'chip mono', 'data-code': '1' }, s.code) : null, h('span', { class: 'badge pending' }, t('lg.kind.' + s.kind)), lgBadge(s),
      lgLate(s) ? h('span', { class: 'badge late' }, t('lg.late')) : null),
    party ? h('p', { class: 'small' }, h('span', { dir: 'auto' }, party)) : null,
    s.from || s.to ? h('p', { class: 'small muted' }, h('bdi', { dir: 'auto' }, (s.from || '…') + ' → ' + (s.to || '…'))) : null,
    h('div', { class: 'lg-prog' }, barFill(lgProgress(s), lgState(s) === 'completed' ? 'ok' : lgState(s) === 'blocked' ? 'bad' : ''),
      h('span', { class: 'small' }, t('lg.stepsOf', { d: nf(done), n: nf(n) }), cur && open ? [' · ', h('strong', { dir: 'auto' }, cur.name)] : null)),
    h('div', { class: 'chips' }, s.eta ? timeBadge(s.eta, !open) : null, s.eta ? h('span', { class: 'chip' }, t('lg.etaShort', { d: fmtDay(s.eta) })) : null,
      s.carrier ? h('span', { class: 'chip', dir: 'auto' }, s.carrier) : null, s.tracking ? h('span', { class: 'chip mono' }, s.tracking) : null,
      s.lines.length ? h('span', { class: 'chip' }, t('lg.nLines', { n: nf(s.lines.length) })) : null,
      s.received ? h('span', { class: 'badge done' }, t('lg.receivedOn', { d: fmtDay(s.received) })) : null,
      lgReady(s) ? h('a', { class: 'chip sugg', href: '#logistics/' + s.id }, t('lg.readyToReceive')) : null),
    h('div', { class: 'actions' },
      open && cur ? h('button', { class: 'btn small primary', type: 'button', 'data-act': 'done', 'data-edit': 'logistics', 'aria-label': t('lg.stepDone', { s: cur.name }) + ': ' + (s.title || s.id),
        onclick: (ev) => { ev.target.disabled = true; changeShipment(s.id, lgDone).then(() => { toast(t('lg.stepDoneToast'), 'ok'); drawLogistics(); }, (e) => { ev.target.disabled = false; toast(e.message, 'bad'); }); } }, t('lg.stepDone', { s: cur.name })) : null,
      h('a', { class: 'btn small', href: '#logistics/' + s.id }, t('act.edit'))));
}
function drawLogistics() {
  const all = opsList('logistics'), list = h('div', { class: 'list', id: 'lgList' }), count = h('p', { class: 'hint', id: 'lgCount', role: 'status' });
  const draw = () => {
    const q = lgSel.q.trim().toLowerCase();
    const rows = all.filter((s) => lgMatch(s, lgSel.show) && (!lgSel.kind || s.kind === lgSel.kind) && (!q || [s.id, s.code, s.title, s.ref, s.carrier, s.tracking, s.from, s.to, lgParty(s)].join(' ').toLowerCase().includes(q)))
      .sort((a, b) => (lgOpen(b) ? 1 : 0) - (lgOpen(a) ? 1 : 0) || (lgOpen(a) ? (a.eta || '9999').localeCompare(b.eta || '9999') : String(b.updatedAt).localeCompare(String(a.updatedAt))));
    count.textContent = t('lg.shown', { n: nf(rows.length), total: nf(all.length) });
    list.replaceChildren(...(rows.length ? rows.map(shipCard) : [h('p', { class: 'empty' }, all.length ? t('lg.noMatch') : t('lg.empty'))]));
  };
  const search = h('input', { id: 'lgSearch', type: 'search', placeholder: t('lg.search'), 'aria-label': t('lg.search'), value: lgSel.q, dir: 'auto' });
  search.addEventListener('input', () => { lgSel.q = search.value; draw(); });
  const sel = (key, id, opts, label) => selectEl(opts, lgSel[key], (v) => { lgSel[key] = v; draw(); }, id, label);
  const n = (mode) => all.filter((s) => lgMatch(s, mode)).length;
  mount(h('section', { class: 'stack', id: 'lgScreen' },
    opsHead('lg.title', opsRefresh('btnRefreshOps'), h('a', { class: 'btn', href: '#import/logistics', id: 'btnImp-logistics', 'data-edit': 'logistics' }, t('imp.btn')), h('a', { class: 'btn', href: '#reports/logistics', id: 'btnLgPrint' }, t('ops.printReport')), h('a', { class: 'btn primary', href: '#logistics/new', id: 'btnNewLg', 'data-edit': 'logistics' }, t('lg.add'))),
    h('p', { class: 'hint' }, t('lg.hint')),
    kpis(kpi(t('lg.k.active'), nf(n('active'))), kpi(t('lg.k.late'), nf(n('late')), n('late') ? 'neg' : ''), kpi(t('lg.k.blocked'), nf(n('blocked')), n('blocked') ? 'warn' : ''), kpi(t('lg.k.completed'), nf(n('completed')), '', t('lg.k.of', { n: nf(all.length) }))),
    h('div', { class: 'card stack-sm' }, h('div', { class: 'filters3' }, search,
      sel('show', 'lgShow', LG_SHOWS.map((k) => [k, t('lg.show.' + k)]), t('lg.showLabel')), sel('kind', 'lgKind', [['', t('lg.allKinds')]].concat(LG_KINDS.map((k) => [k, t('lg.kind.' + k)])), t('lg.kindLabel'))), count, list)));
  draw();
}

/* ---------------- one shipment ---------------- */
function validateShipment(r) {
  if (!r.title) return t('lg.val.title');
  if (codeClash('logistics', r)) return t('code.dup', { c: r.code });
  if (r.eta && !parseDay(r.eta)) return t('lg.val.date');
  if (r.cost !== '' && num(r.cost) < 0) return t('lg.val.cost');
  return '';
}
function saveShipment() {
  const r = opsEd.rec;
  r.title = String(r.title || '').trim(); r.code = String(r.code || '').trim(); r.steps = r.steps.filter((s) => String(s.name || '').trim()).map((s) => Object.assign(s, { name: s.name.trim() }));
  r.lines = r.lines.filter((l) => l.itemId || String(l.name || '').trim());
  if (r.kind !== 'outbound') { r.clientId = ''; r.clientName = ''; r.project = ''; }
  if (r.kind !== 'inbound') r.supplierId = '';
  const bad = validateShipment(r); if (bad) { toast(bad, 'bad'); return; }
  return opsSaveOpen((rec, old) => { if (old && old.received && !rec.received) rec.received = old.received; });          // "received" is set by the receive button, never lost by a stale form
}
const capt = (text, control, cls) => h('label', { class: 'fcap' + (cls ? ' ' + cls : '') }, h('span', { class: 'fcap-l' }, text), control);          // a visible caption above one control of a compact row
function stepsEditor(r) {
  const box = h('div', { class: 'stack-sm', id: 'lgSteps' }), summary = h('p', { class: 'small', id: 'lgProgressText', role: 'status' }), bar = h('div', {});
  const refreshSummary = () => {
    const d = r.steps.filter((x) => x.status === 'done').length;
    summary.textContent = t('lg.stepsOf', { d: nf(d), n: nf(r.steps.length) }) + ' · ' + t('lg.st.' + lgState(Object.assign({}, r, { cancelled: false })));
    bar.replaceChildren(barFill(r.steps.length ? d / r.steps.length : 0, d && d === r.steps.length ? 'ok' : ''));
  };
  opsEd.live = refreshSummary;
  const move = (i, k) => { r.steps.splice(i + k, 0, r.steps.splice(i, 1)[0]); touch(); draw(); };
  const row = (st, i) => h('div', { class: 'lgstep ' + st.status + (lgStepLate(st) ? ' late' : ''), 'data-i': i },
    h('div', { class: 'lgstep-head' }, h('span', { class: 'step', 'aria-hidden': 'true' }, String(i + 1)), h('div', { class: 'lgstep-name' }, tin(st, 'name', { id: 'lgStepName' + i, label: t('lg.stepName') + ' ' + (i + 1), ph: t('lg.stepName'), max: 120 })),
      lgStepLate(st) ? h('span', { class: 'badge late' }, t('lg.late')) : null),
    h('div', { class: 'rg', style: '--cols:minmax(0,1.3fr) minmax(0,1.1fr) minmax(0,3fr)' },
      capt(t('rp.col.status'), selectEl(LG_STEP_STATES.map((k) => [k, t('lg.ss.' + k)]), st.status, (v) => { st.status = v; st.doneAt = v === 'done' ? st.doneAt || todayStr() : ''; touch(); draw(); }, 'lgStepStatus' + i, t('rp.col.status') + ': ' + (st.name || i + 1))),
      capt(t('lg.stepDue'), h('input', { type: 'date', id: 'lgStepDue' + i, value: st.due, 'aria-label': t('lg.stepDue') + ': ' + (st.name || i + 1), onchange: (ev) => { st.due = ev.target.value; touch(); draw(); } })),
      capt(t('lg.stepNote'), tin(st, 'note', { id: 'lgStepNote' + i, label: t('lg.stepNote') + ': ' + (st.name || i + 1), ph: t('lg.stepNote'), max: 300 }), 'wide')),
    st.doneAt ? h('span', { class: 'hint' }, t('lg.doneOn', { d: fmtDay(st.doneAt) })) : null,
    h('div', { class: 'actions' }, h('button', { class: 'small', type: 'button', disabled: i === 0, 'aria-label': t('act.up') + ': ' + (st.name || i + 1), onclick: () => move(i, -1) }, t('act.up')),
      h('button', { class: 'small', type: 'button', disabled: i === r.steps.length - 1, 'aria-label': t('act.down') + ': ' + (st.name || i + 1), onclick: () => move(i, 1) }, t('act.down')),
      h('button', { class: 'small danger', type: 'button', 'aria-label': t('act.remove') + ': ' + (st.name || i + 1), onclick: () => { r.steps.splice(i, 1); touch(); draw(); } }, t('act.remove'))));
  const draw = () => { box.replaceChildren(...(r.steps.length ? r.steps.map(row) : [h('p', { class: 'empty' }, t('lg.noSteps'))])); refreshSummary(); };
  draw();
  const add = h('button', { class: 'btn', type: 'button', id: 'btnAddStep', onclick: () => { r.steps.push(normStep({ name: '' })); touch(); draw(); const k = r.steps.length - 1; document.getElementById('lgStepName' + k).focus(); } }, t('lg.addStep'));
  const tpl = h('button', { class: 'btn', type: 'button', id: 'btnAddTpl', onclick: () => { r.steps.push(...lgStepsFor(r.kind)); touch(); draw(); } }, t('lg.addTpl', { k: t('lg.kind.' + r.kind) }));
  return h('div', { class: 'card stack-sm', id: 'lgStepsCard' }, h('div', { class: 'card-head' }, h('h2', {}, t('lg.steps'))), h('p', { class: 'hint' }, t('lg.stepsHint')), summary, bar, box, h('div', { class: 'actions' }, add, tpl));
}
function linesEditor(r) {
  const inv = opsList('inventory'), box = h('div', { class: 'stack-sm', id: 'lgLines' });
  const row = (l, i) => {
    const opts = [['', t('lg.otherMaterial')]].concat(inv.map((x) => [x.id, x.name + (x.code ? ' · ' + x.code : '')]));
    if (l.itemId && !inv.some((x) => x.id === l.itemId)) opts.push([l.itemId, l.name || l.itemId]);
    return h('div', { class: 'rg lgline', style: '--cols:minmax(0,2.4fr) minmax(0,2fr) minmax(0,1fr) minmax(0,1fr) auto', 'data-i': i },
      selectEl(opts, l.itemId, (v) => { l.itemId = v; const it = opsFind('inventory', v); if (it) { l.name = it.name; l.unit = it.unit; } touch(); draw(); }, 'lgLineItem' + i, t('lg.material') + ' ' + (i + 1)),
      l.itemId ? h('span', { class: 'muted small', dir: 'auto' }, l.name) : tin(l, 'name', { id: 'lgLineName' + i, label: t('lg.materialName') + ' ' + (i + 1), ph: t('lg.materialName'), max: 120 }),
      capt(t('ed.qty'), tin(l, 'qty', { id: 'lgLineQty' + i, type: 'number', num: true, min: 0, step: 'any', mode: 'decimal', label: t('ed.qty') + ' ' + (i + 1), ph: t('ed.qty') })),
      l.itemId ? h('span', { class: 'muted small' }, t('bom.unit.' + l.unit)) : selectEl(BOM_UNITS.map((u) => [u, t('bom.unit.' + u)]), l.unit, (v) => { l.unit = v; touch(); }, 'lgLineUnit' + i, t('a11y.unit') + ' ' + (i + 1)),
      h('button', { class: 'small danger x', type: 'button', 'aria-label': t('act.remove') + ' ' + (i + 1), onclick: () => { r.lines.splice(i, 1); touch(); draw(); } }, '×'));
  };
  const draw = () => box.replaceChildren(...(r.lines.length ? r.lines.map(row) : [h('p', { class: 'empty' }, t('lg.noLines'))]));
  draw();
  return h('div', { class: 'card stack-sm', id: 'lgLinesCard' }, h('div', { class: 'card-head' }, h('h2', {}, t('lg.materials'))), h('p', { class: 'hint' }, t('lg.materialsHint')), box,
    h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'button', id: 'btnAddLine', onclick: () => { r.lines.push(normLine({ qty: 1 })); touch(); draw(); } }, t('lg.addMaterial'))));
}
function receiveBlock(e) {
  const r = e.rec;
  if (e.isNew || r.kind !== 'inbound') return null;
  if (r.received) return h('p', { class: 'msg ok', id: 'lgReceived' }, t('lg.receivedOn', { d: fmtDay(r.received) }));
  const linked = r.lines.filter((l) => l.itemId && num(l.qty) > 0);
  if (!linked.length) return h('p', { class: 'hint' }, t('lg.receiveHint'));
  const b = h('button', { class: 'btn', type: 'button', id: 'btnLgReceive', onclick: async () => {
    if (e.dirty) return toast(t('lg.saveFirst'), 'bad');
    if (!confirm(t('lg.recvConfirm', { n: nf(linked.length) }))) return;
    b.disabled = true;
    try { const n = await receiveShipment(e.id); const fresh = clone(opsFind('logistics', e.id)); e.rec = fresh; e.orig = clone(fresh); toast(t('lg.recvDone', { n: nf(n) }), 'ok'); e.redraw(); } catch (err) { b.disabled = false; toast(err.message, 'bad'); }
  } }, t('lg.receive'));
  return h('div', { class: 'stack-sm' }, b, h('p', { class: 'hint' }, t('lg.receiveHint2')));
}
function drawShipForm() {
  const e = opsEd, r = e.rec; e.save = saveShipment;
  const f = (labelKey, prop, id, o) => fld(labelKey, tin(r, prop, Object.assign({ id, max: 120 }, o || {})));
  const clients = store.items.map((x) => x.rec), cl = clients.find((c) => c.id === r.clientId);
  const clientOpts = [['', t('lg.noClient')]].concat(clients.map((c) => [c.id, c.client.name + ' · ' + c.id]));
  if (r.clientId && !cl) clientOpts.push([r.clientId, r.clientName || r.clientId]);
  const projOpts = [['', t('lg.noProject')]].concat(cl ? cl.projects.map((p) => [p.sku, projLabel(p)]) : r.project ? [[r.project, r.project]] : []);
  const onKind = (v) => {
    const same = !r.steps.length || r.steps.every((s, i) => s.status === 'pending' && s.name === t('lg.tpl.' + r.kind + '.' + (i + 1)));      // still the untouched standard steps of the old kind
    r.kind = v; if (same) r.steps = lgStepsFor(v); touch(); e.redraw();
  };
  const party = r.kind === 'inbound' ? h('div', { class: 'grid2' }, fld('lg.supplier', supplierSel(r.supplierId, (v) => { r.supplierId = v; touch(); }, 'lgSupplier')), f('lg.ref', 'ref', 'lgRef', { dir: 'ltr', max: 60 }))
    : r.kind === 'outbound' ? h('div', { class: 'grid2' }, fld('lg.client', selectEl(clientOpts, r.clientId, (v) => { const c = clients.find((x) => x.id === v); r.clientId = v; r.clientName = c ? c.client.name : ''; r.project = ''; touch(); e.redraw(); }, 'lgClient')),
      fld('lg.project', selectEl(projOpts, r.project, (v) => { r.project = v; touch(); }, 'lgProject'))) : null;
  const details = h('div', { class: 'card stack-sm' },
    h('div', { class: 'grid2' }, f('lg.name', 'title', 'lgTitle', { req: true }), fld('lg.kindLabel', selectEl(LG_KINDS.map((k) => [k, t('lg.kind.' + k)]), r.kind, onKind, 'lgKindSel'))),
    h('div', { class: 'grid2' }, codeField('logistics', r, 'lgCode')),
    party,
    h('div', { class: 'grid2' }, f('lg.carrier', 'carrier', 'lgCarrier', { max: 100 }), f('lg.tracking', 'tracking', 'lgTracking', { dir: 'ltr', max: 80 })),
    h('div', { class: 'grid2' }, f('lg.from', 'from', 'lgFrom'), f('lg.to', 'to', 'lgTo')),
    h('div', { class: 'grid2' }, fld('lg.eta', dateOpt(r, 'eta', 'lgEta', t('lg.eta'))), fld('lg.cost', tin(r, 'cost', { id: 'lgCost', type: 'number', num: true, min: 0, step: 'any', mode: 'decimal' }))),
    fld('lg.notes', tarea(r, 'notes', { id: 'lgNotes', rows: 2, max: 1500 })),
    h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'lgCancelled', checked: r.cancelled, onchange: (ev) => { r.cancelled = ev.target.checked; touch(); } }), h('span', {}, t('lg.cancelled'))));
  const extra = e.isNew ? null : h('div', { class: 'card stack-sm' }, receiveBlock(e), h('div', { class: 'actions' }, h('a', { class: 'btn', href: '#reports/shipment/' + e.id, id: 'btnShipPrint' }, t('lg.printSheet')),
    opsDeleteBtn(() => opsDeleteOpen(t('lg.delConfirm', { n: r.title || e.id }), '#logistics'))));
  opsFormPage('#logistics', 'nav.logistics', e.isNew ? t('lg.new') : (r.title || e.id) + (e.isNew ? '' : '  ·  ' + e.id), details, stepsEditor(r), linesEditor(r), attCard(r, 'lgFiles'), extra);
}
