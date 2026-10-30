/**
 * <admin>/js/views/bom.js  -  BOM list (bill of materials)
 * Per-project BOM tab, totals, and the one-click sync into the COGS lines of the Costs tab.
 * Loaded by: admin page
 */
'use strict';

/* =====================================================================
   BOM (bill of materials) per project
   ===================================================================== */
const BOM_CATS = ['board', 'edge', 'hardware', 'finish', 'glass', 'accessory', 'other'];
const BOM_UNITS = ['pcs', 'sheet', 'm', 'm2', 'kg', 'l', 'set'];
const BOM_TO_COST = { board: 'materials', edge: 'materials', finish: 'materials', glass: 'materials', hardware: 'hardware', accessory: 'hardware', other: 'other' };
const bomTotal = (x) => num(x.qty) * num(x.cost);
const bomSum = (p) => sum(p.bom || [], bomTotal);
function bomByCat(p) { const m = new Map(); for (const x of p.bom || []) m.set(x.cat || 'other', (m.get(x.cat || 'other') || 0) + bomTotal(x)); return m; }

// records saved by an older version may lack the newer fields
function normalizeRec(rec) {
  for (const p of rec.projects || []) {
    p.costs = p.costs || []; p.bom = p.bom || []; p.parts = p.parts || []; p.payments = p.payments || []; p.schedule = p.schedule || []; p.photos = p.photos || []; p.stages = p.stages || [];
    if (p.feedback === undefined) p.feedback = null;
  }
  return rec;
}

// One COGS line per category, replacing earlier lines created from the BOM (marked src: 'bom'); lines typed by hand are untouched.
function syncBomToCosts(p) {
  p.costs = (p.costs || []).filter((c) => c.src !== 'bom');
  const byCost = new Map();
  for (const [cat, amt] of bomByCat(p)) { const k = BOM_TO_COST[cat] || 'other'; byCost.set(k, (byCost.get(k) || 0) + amt); }
  for (const [k, amt] of byCost) if (amt > 0) p.costs.push({ type: 'cogs', cat: k, note: t('bom.costNote'), amount: Math.round(amt * 100) / 100, src: 'bom' });
}

/* ---------------- link to the stock: take the materials of a project out of the inventory, put them back ---------------- */
// a BOM line may name a material of the inventory (itemId). issued = how much of it was already taken out of the stock for this project.
const bomNeed = (x) => r3(num(x.qty) - num(x.issued));
const bomItem = (x) => (x.itemId ? opsFind('inventory', x.itemId) : null);
// items = [{ x: bom line, delta }]: delta > 0 takes that much out of the stock, delta < 0 puts it back. One saved change for all lines; nothing moves when one line cannot be served.
async function bomIssue(p, items) {
  const note = t('bom.stockNote', { sku: p.sku, c: ed ? ed.rec.client.name : '' });
  let done = [];
  await opsMutate('inventory', (data) => {
    done = [];
    for (const { x, delta } of items) {
      const it = data.items.find((i) => i.id === x.itemId); if (!it) throw new Error(t('inv.gone'));
      if (it.unit !== (x.unit || 'pcs')) throw new Error(t('bom.unitMismatch', { n: it.name }));
      const was = it.qty; applyMove(it, delta > 0 ? 'out' : 'in', Math.abs(delta), note, p.sku); done.push({ id: it.id, name: it.name, was, now: it.qty, delta });
    }
  });
  items.forEach(({ x, delta }) => { x.issued = r3(num(x.issued) + delta); });
  for (const d of done) audit({ area: 'inventory', act: d.delta > 0 ? 'stock-out' : 'stock-in', ref: d.id, title: d.name, ch: [['qty', String(d.was), String(d.now)]], note });
  touch();
  // the stock and the project's memory of it must change together: save the project now (when it cannot be saved yet, say so)
  let saved = false; try { if (ed) { await saveEditor(true); saved = !ed.dirty; } } catch (_) { saved = false; }
  toast(t(saved ? 'bom.movedSaved' : 'bom.moved'), saved ? 'ok' : '');
}

function tabBom(p) {
  const sum2 = live(() => { const tot = bomSum(p), pr = num(p.price); return kpis(kpi(t('bom.items'), nf((p.bom || []).length)), kpi(t('bom.total'), money(tot)), pr ? kpi(t('bom.ofPrice'), pct(tot / pr)) : null); });
  const list = h('div', { class: 'stack-sm' });
  const row = (x, i, relink) => {
    const tot = h('span', { class: 'bomtot' }); const upd = () => { tot.textContent = money(bomTotal(x)); relink(); }; upd();
    return h('div', { class: 'rg bomrow', style: '--cols:minmax(0,2fr) minmax(0,1fr) 78px minmax(0,1fr) minmax(0,1fr) minmax(132px,1.4fr) minmax(0,1.1fr) auto' },
      h('div', { class: 'wide' }, tin(x, 'name', { ph: t('bom.name'), max: 120 })),
      tin(x, 'code', { ph: t('bom.code'), max: 30, dir: 'ltr' }),
      tin(x, 'qty', { type: 'number', num: true, min: 0, step: 'any', mode: 'decimal', ph: t('ed.qty'), on: upd }),
      selectEl(BOM_UNITS.map((u) => [u, t('bom.unit.' + u)]), x.unit || 'pcs', (v) => { x.unit = v; touch(); relink(); }, undefined, t('a11y.unit')),
      tin(x, 'cost', { type: 'number', num: true, min: 0, step: '0.01', mode: 'decimal', ph: t('bom.cost'), on: () => { upd(); } }),
      selectEl(BOM_CATS.map((c) => [c, t('bom.cat.' + c)]), x.cat || 'board', (v) => { x.cat = v; touch(); }, undefined, t('a11y.category')),
      tot,
      h('button', { class: 'small danger x', type: 'button', 'aria-label': t('act.remove'), onclick: async () => {
        if (num(x.issued) > 0 && bomItem(x)) { if (!confirm(t('bom.removeIssued', { n: qtyText(x.issued, x.unit) }))) return; try { await bomIssue(p, [{ x, delta: -num(x.issued) }]); } catch (e) { return toast(e.message, 'bad'); } }
        const k = p.bom.indexOf(x); p.bom.splice(k >= 0 ? k : i, 1); touch();
        if (list.isConnected) draw(); else if (ed && ed.bodyBox) drawBody();                 // saving the project (done by bomIssue) redraws the whole tab: the list this line was drawn in is gone then
      } }, '×'));
  };
  // ---- the stock link of one line
  const stockOn = () => can('inventory') && !!ops.inventory;
  const run = async (fn) => { try { await fn(); draw(); } catch (e) { toast(e.message, 'bad'); } };
  const linkRow = (x, i) => {
    const items = opsList('inventory').slice().sort((a, b) => a.name.localeCompare(b.name, locale()));
    const it = bomItem(x), need = bomNeed(x), same = !it || it.unit === (x.unit || 'pcs');
    const sel = selectEl([['', t('bom.noStock')]].concat(items.map((m) => [m.id, m.name + (m.code ? ' · ' + m.code : '') + ' (' + qtyText(m.qty, m.unit) + ')'])), x.itemId || '', (v) => {
      x.itemId = v; const m = v ? opsFind('inventory', v) : null;
      if (m) { if (!String(x.name || '').trim()) x.name = m.name; if (!String(x.code || '').trim()) x.code = m.code; x.unit = m.unit; if (!num(x.cost) && num(m.cost)) x.cost = m.cost; if (BOM_CATS.includes(m.category)) x.cat = m.category; }
      touch(); draw();
    }, undefined, t('bom.stockItem'));
    sel.disabled = num(x.issued) > 0;
    const short = it && same && need > 0 && need > it.qty;
    const state = !it ? (x.itemId ? h('span', { class: 'badge late' }, t('bom.stockGone')) : null)
      : !same ? h('span', { class: 'badge late', 'data-bomstock': 'unit' }, t('bom.unitMismatch', { n: it.name }))
      : h('span', { class: 'badge ' + (short ? 'late' : need > 0 ? 'done' : 'pending'), 'data-bomstock': short ? 'short' : need > 0 ? 'ok' : 'issued' },
        short ? t('bom.short', { have: qtyText(it.qty, it.unit), n: qtyText(need - it.qty, it.unit) }) : need > 0 ? t('bom.enough', { have: qtyText(it.qty, it.unit) }) : need < 0 ? t('bom.over', { n: qtyText(-need, x.unit) }) : t('bom.allTaken'));
    const btn = it && same && need > 0 ? h('button', { class: 'btn small', type: 'button', 'data-edit': 'inventory', 'data-bom': 'take', disabled: short, onclick: () => run(() => bomIssue(p, [{ x, delta: need }])) }, t('bom.take', { n: qtyText(need, x.unit) }))
      : it && same && need < 0 ? h('button', { class: 'btn small', type: 'button', 'data-edit': 'inventory', 'data-bom': 'return', onclick: () => run(() => bomIssue(p, [{ x, delta: need }])) }, t('bom.putBack', { n: qtyText(-need, x.unit) })) : null;
    return h('div', { class: 'bomlink', 'data-line': x.id }, h('span', { class: 'small muted' }, t('bom.stockItem') + ':'), sel, state, num(x.issued) > 0 ? h('span', { class: 'small muted' }, t('bom.takenN', { n: qtyText(x.issued, x.unit) })) : null, btn);
  };
  const stockNote = h('p', { class: 'hint', id: 'bomStockNote', role: 'status' });
  const takeAll = h('button', { class: 'btn', type: 'button', id: 'btnBomTake', 'data-edit': 'inventory', onclick: () => run(async () => {
    const lines = p.bom.filter((x) => x.itemId && bomItem(x) && bomItem(x).unit === (x.unit || 'pcs') && bomNeed(x) > 0), per = new Map();
    for (const x of lines) per.set(x.itemId, r3((per.get(x.itemId) || 0) + bomNeed(x)));
    const lacking = [...per].filter(([id, q]) => q > opsFind('inventory', id).qty).map(([id]) => opsFind('inventory', id).name);
    if (lacking.length) throw new Error(t('bom.takeShort', { names: lacking.join(', ') }));
    if (!lines.length) throw new Error(t('bom.nothingToTake'));
    await bomIssue(p, lines.map((x) => ({ x, delta: bomNeed(x) })));
  }) }, t('bom.takeAll'));
  const rowFor = (x, i) => {                                                  // typing a quantity redraws only this line's stock link (the take / put back button follows it)
    const slot = h('div', { class: 'bomslot' }); const relink = () => slot.replaceChildren(...(stockOn() ? [linkRow(x, i)] : []));
    const r = row(x, i, relink); relink(); return h('div', { class: 'bomwrap' }, r, slot);
  };
  const draw = () => {
    list.replaceChildren(...(p.bom.length ? p.bom.map(rowFor) : [h('p', { class: 'empty' }, t('bom.none'))]));
    const linked = p.bom.filter((x) => x.itemId && bomItem(x)), shortN = linked.filter((x) => bomItem(x).unit === (x.unit || 'pcs') && bomNeed(x) > bomItem(x).qty).length;
    stockNote.textContent = stockOn() && linked.length ? t('bom.stockSummary', { n: nf(linked.length), s: nf(shortN), t: nf(linked.filter((x) => num(x.issued) > 0).length) }) : '';
    takeAll.hidden = !(stockOn() && linked.length); refreshLive();
  };
  draw();
  if (can('inventory') && !ops.inventory) loadOps('inventory').then(() => { if (list.isConnected) draw(); }, () => {});
  const add = h('button', { class: 'btn', type: 'button', id: 'btnAddBom', onclick: () => { p.bom.push({ id: uid(), code: '', name: '', cat: 'board', qty: 1, unit: 'pcs', cost: '' }); touch(); draw(); } }, t('bom.add'));
  const sync = h('button', { class: 'btn', type: 'button', id: 'btnBomSync', onclick: () => { syncBomToCosts(p); touch(); toast(t('bom.synced'), 'ok'); } }, t('bom.sync'));
  const print = h('a', { class: 'btn', id: 'btnBomPrint', href: '#reports', onclick: () => { reportSel = { type: 'bom', client: ed.rec.id, project: p.sku, from: '', to: '' }; } }, t('bom.print'));
  return h('div', { class: 'stack-sm' }, h('p', { class: 'hint' }, t('bom.hint')), sum2, list,
    stockNote, h('div', { class: 'actions' }, add, sync, takeAll, print), h('p', { class: 'hint' }, t('bom.syncHint')), can('inventory') ? h('p', { class: 'hint' }, t('bom.stockHint')) : null);
}
