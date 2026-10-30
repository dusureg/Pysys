/**
 * <admin>/js/views/attach-ui.js  -  the controls that keep files with a record: invoices (expense, shipment) and the picture of a product (inventory)
 * The file is shrunk / checked and sealed by attach.js; here are the card with the list of files, the picture field of an item, the small picture shown in lists and the
 * brand drop-down. A file is kept in memory (opsEd.pending) until the record is saved; one removed from a record is deleted after the save (opsEd.trash).
 * Loaded by: admin page
 */
'use strict';

const attSize = (n) => (n >= 1048576 ? nf(n / 1048576, { maximumFractionDigits: 1 }) + ' MB' : nf(Math.max(1, Math.round(n / 1024))) + ' KB');
// a file leaves a record: one that was never uploaded is forgotten, one that was uploaded is deleted after the record is saved
function attDrop(e, id) {
  const i = (e.pending || []).findIndex((x) => x.id === id);
  if (i >= 0 && !e.pending[i].sent) e.pending.splice(i, 1); else e.trash = (e.trash || []).concat([id]);
}
async function attOpen(meta, download) {
  try {
    const url = await attUrl(meta, opsEd && opsEd.pending);
    const a = h('a', { href: url, target: '_blank', rel: 'noopener noreferrer' }); if (download) a.setAttribute('download', meta.name);
    document.body.appendChild(a); a.click(); a.remove();
  } catch (err) { toast(err.message, 'bad'); }
}
// the invoices of an expense or a shipment
function attCard(rec, id) {
  const e = opsEd, ro = readOnly(OPS_AREA[e.kind] || e.kind);
  const list = h('ul', { class: 'plainlist attlist', id: id + 'List' });
  rec.files = rec.files || [];
  const busy = h('span', { class: 'small muted', role: 'status' });
  const draw = () => {
    list.replaceChildren(...rec.files.map((f, i) => h('li', { class: 'row-between attrow', 'data-file': f.id },
      h('span', {}, h('span', { class: 'badge ' + (f.type === 'application/pdf' ? 'pending' : 'enc'), 'data-kind': f.type === 'application/pdf' ? 'pdf' : 'image' }, t('att.kind.' + (f.type === 'application/pdf' ? 'pdf' : 'image'))), ' ',
        h('bdi', { dir: 'auto' }, f.name), ' ', h('span', { class: 'small muted' }, attSize(f.size))),
      h('span', { class: 'actions' },
        h('button', { class: 'btn small', type: 'button', 'data-act': 'view', 'aria-label': t('att.view') + ': ' + f.name, onclick: () => attOpen(f, false) }, t('att.view')),
        h('button', { class: 'btn small', type: 'button', 'data-act': 'save', 'aria-label': t('att.download') + ': ' + f.name, onclick: () => attOpen(f, true) }, t('att.download')),
        ro ? null : h('button', { class: 'btn small danger', type: 'button', 'data-act': 'remove', 'aria-label': t('att.remove') + ': ' + f.name, onclick: () => {
          if (!confirm(t('att.removeConfirm', { n: f.name }))) return; attDrop(e, f.id); rec.files.splice(i, 1); touch(); draw();
        } }, t('att.remove')))
    )));
    if (!rec.files.length) list.replaceChildren(h('li', { class: 'muted small' }, t('att.none')));
  };
  const input = h('input', { type: 'file', id: id + 'Input', accept: 'application/pdf,image/*', multiple: true, hidden: true, 'aria-label': t('att.add'), onchange: async (ev) => {
    const files = Array.from(ev.target.files || []); ev.target.value = '';
    busy.textContent = t('att.preparing');
    for (const f of files) {
      if (rec.files.length >= ATT_KEEP) { toast(t('att.limit', { n: nf(ATT_KEEP) }), 'bad'); break; }
      try {
        const p = await attPrepare(f);
        e.pending = (e.pending || []).concat([p]); rec.files.push({ id: p.id, name: p.name, type: p.type, size: p.size, at: oiso() }); touch(); draw();
      } catch (err) { toast(err.message, 'bad'); }
    }
    busy.textContent = '';
  } });
  draw();
  return h('div', { class: 'card stack-sm', id }, h('h2', {}, t('att.title')), h('p', { class: 'hint' }, t('att.hint', { n: nf(ATT_KEEP), k: nf(Math.round(ATT_MAX / 1024)) })),
    list, ro ? null : h('div', { class: 'actions' }, h('button', { class: 'btn small', type: 'button', id: id + 'Add', onclick: () => input.click() }, t('att.add')), input, busy));
}

/* ---- the picture of a product ---- */
// the small picture shown in lists (kept in the record itself, so a list needs no download); nothing when the item has none
const prodThumb = (it, cls) => (it && it.thumb ? h('img', { class: 'prodthumb ' + (cls || ''), src: it.thumb, alt: '', width: 40, height: 40, loading: 'lazy', decoding: 'async' }) : null);
function productImageField(rec) {
  const e = opsEd, ro = readOnly('inventory');
  const box = h('div', { class: 'card stack-sm', id: 'invImageCard' });
  const busy = h('span', { class: 'small muted', role: 'status' });
  const pick = h('input', { type: 'file', id: 'invImageInput', accept: 'image/*', hidden: true, 'aria-label': t('img.add'), onchange: async (ev) => {
    const f = ev.target.files && ev.target.files[0]; ev.target.value = ''; if (!f) return;
    busy.textContent = t('att.preparing');
    try { const p = await attProductImage(f); if (rec.image) attDrop(e, rec.image); e.pending = (e.pending || []).concat([p]); rec.image = p.id; rec.thumb = p.thumb; touch(); draw(); } catch (err) { toast(err.message, 'bad'); }
    busy.textContent = '';
  } });
  const draw = () => {
    box.replaceChildren(h('h2', {}, t('img.title')), h('p', { class: 'hint' }, t('img.hint')),
      h('div', { class: 'imgrow' }, rec.thumb ? h('img', { class: 'prodbig', id: 'invImagePreview', src: rec.thumb, alt: t('img.alt', { n: rec.name || rec.code || '' }), width: 72, height: 72 }) : h('div', { class: 'prodbig empty', id: 'invImagePreview' }, t('img.none')),
        h('div', { class: 'stack-sm' },
          rec.image ? h('button', { class: 'btn small', type: 'button', id: 'btnImgView', onclick: () => attOpen({ id: rec.image, name: (rec.name || 'image') + '.jpg', type: 'image/jpeg' }, false) }, t('att.view')) : null,
          ro ? null : h('button', { class: 'btn small', type: 'button', id: 'btnImgAdd', onclick: () => pick.click() }, rec.image ? t('img.replace') : t('img.add')),
          ro || !rec.image ? null : h('button', { class: 'btn small danger', type: 'button', id: 'btnImgRemove', onclick: () => { attDrop(e, rec.image); rec.image = ''; rec.thumb = ''; touch(); draw(); } }, t('img.remove')),
          busy), pick));
  };
  draw();
  return box;
}

/* ---- brands (a list kept in Settings; an item points at one by id) ---- */
const brandList = () => (session.settings && Array.isArray(session.settings.brands) ? session.settings.brands : []);
const matBrand = (id) => { const b = brandList().find((x) => x.id === id); return b ? b.name : ''; };
function brandSel(value, onChange, id) {
  const list = brandList().slice().sort((a, b) => a.name.localeCompare(b.name, locale()));
  const opts = [['', t('brand.none')]].concat(list.map((b) => [b.id, b.name]));
  if (value && !list.some((b) => b.id === value)) opts.push([value, t('brand.removed')]);
  return selectEl(opts, value || '', onChange, id);
}
