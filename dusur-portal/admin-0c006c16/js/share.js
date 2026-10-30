/**
 * <admin>/js/share.js  -  the Share button: the device's share sheet when it has one, WhatsApp, e-mail, copy
 * shareButton(getPayload, id) puts a button with a small menu on a screen. The payload is { title, text, file? } (file: an async function giving a picture to send).
 * opsShareText() and reportShareText() write the plain text of a record or a report, from what is on the screen, nothing more.
 * Loaded by: admin page
 */
'use strict';

/* =====================================================================
   Share
   ===================================================================== */
function shareButton(getPayload, id, cls) {
  const wrap = h('span', { class: 'sharewrap' }), btn = h('button', { class: cls || 'btn', type: 'button', id, 'aria-haspopup': 'menu', 'aria-expanded': 'false' }, t('share.btn'));
  let menu = null;
  const away = (e) => { if (!wrap.contains(e.target)) close(); }, esc = (e) => { if (e.key === 'Escape') { close(); btn.focus(); } };
  function close() { if (!menu) return; menu.remove(); menu = null; btn.setAttribute('aria-expanded', 'false'); document.removeEventListener('click', away, true); document.removeEventListener('keydown', esc, true); }
  const item = (tag, label, kind, onclick, attrs) => h(tag, Object.assign({ class: 'shareitem', role: 'menuitem', 'data-share': kind, onclick }, tag === 'button' ? { type: 'button' } : {}, attrs || {}), label);
  const fail = (e) => { if (e && e.name !== 'AbortError') toast(e.message || String(e), 'bad'); };
  const items = (p) => [
    typeof navigator.share === 'function' ? item('button', t('share.device'), 'device', async () => { close(); try { await navigator.share({ title: p.title, text: p.text }); } catch (e) { fail(e); } }) : null,
    p.file ? item('button', t('share.picture'), 'picture', async () => {
      close(); try { const f = await p.file(); if (navigator.canShare && navigator.canShare({ files: [f] })) await navigator.share({ files: [f], title: p.title, text: p.text }); else { saveBlob(f, f.name); toast(t('share.saved'), 'ok'); } } catch (e) { fail(e); }
    }) : null,
    item('a', t('share.whatsapp'), 'whatsapp', close, { href: waLink('', p.text), target: '_blank', rel: 'noopener noreferrer' }),
    item('a', t('share.email'), 'email', close, { href: mailLink('', p.title, p.text) }),
    item('button', t('share.copy'), 'copy', async () => { const ok = await copyText(p.text); close(); toast(ok ? t('share.copied') : t('share.copyFail'), ok ? 'ok' : 'bad'); }),
  ].filter(Boolean);
  btn.addEventListener('click', async () => {
    if (menu) return close();
    let p; try { p = await getPayload(); } catch (e) { return toast(e.message, 'bad'); }
    if (menu) return;
    menu = h('div', { class: 'sharemenu', role: 'menu', id: id + 'Menu', 'aria-label': t('share.btn') }, items(p));
    wrap.append(menu); btn.setAttribute('aria-expanded', 'true');
    document.addEventListener('click', away, true); document.addEventListener('keydown', esc, true);                // the opening click is inside the wrapper, so it is ignored
    const first = menu.querySelector('[role=menuitem]'); if (first) first.focus();
  });
  wrap.append(btn); return wrap;
}

/* ---------------- the text of a record or a report ---------------- */
const shareLine = (label, v) => (v === '' || v == null || v === 0 ? '' : label + ': ' + v);
function opsShareText(kind, r) {
  const L = (k, v) => shareLine(t(k), v); let title = r.name || r.title || r.id, lines = [];
  if (kind === 'inventory') lines = [L('inv.code', r.code), L('inv.category', t('bom.cat.' + r.category)), L('inv.qty', qtyText(r.qty, r.unit)), L('inv.min', r.min ? qtyText(r.min, r.unit) : ''), L('inv.supplier', supName(r.supplierId)), L('inv.location', r.location)];
  else if (kind === 'suppliers') lines = [L('code.label', r.code), L('sup.category', t('sup.cat.' + r.category)), L('sup.contact', r.contact), L('sup.phone', r.phone), L('sup.phone2', r.phone2), L('sup.email', r.email), L('sup.website', r.website), L('sup.location', r.location), L('sup.address', r.address), L('sup.mapLink', r.mapLink)];
  else if (kind === 'logistics') lines = [L('code.label', r.code), L('lg.kindLabel', t('lg.kind.' + r.kind)), L('rp.f.status', t('lg.st.' + lgState(r))), L('lg.supplier', supName(r.supplierId)), L('lg.ref', r.ref), L('lg.carrier', r.carrier), L('lg.tracking', r.tracking), L('lg.from', r.from), L('lg.to', r.to), L('lg.eta', r.eta ? fmtDay(r.eta) : '')];
  else if (kind === 'expenses') lines = [L('exp.date', r.date ? fmtDay(r.date) : ''), L('fin.type', t('fin.kind.' + r.kind)), L('fin.cat', catLabel(r.kind, r.cat)), L('fin.amount', money(r.amount)), L('exp.repeat', r.repeat && r.repeat !== 'none' ? t('exp.rep.' + r.repeat) : ''), L('exp.supplier', supName(r.supplierId))];
  return { title, text: [title].concat(lines.filter(Boolean), ['— ' + brandName()]).join('\n') };
}
function reportShareText(m) {
  const lines = [m.title, m.scope ? t('rp.scope') + ': ' + m.scope : '', m.period ? t('rp.period') + ': ' + m.period : ''].concat((m.kpis || []).slice(0, 8).map((k) => k.label + ': ' + fmtCell(k.v, k.kind)), ['— ' + brandName() + ' · ' + fmtDay(todayStr())]);
  return { title: m.title, text: lines.filter(Boolean).join('\n') };
}
