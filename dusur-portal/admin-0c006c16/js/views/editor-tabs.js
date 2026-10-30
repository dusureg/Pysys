/**
 * <admin>/js/views/editor-tabs.js  -  editor tabs
 * Details, Stages, Parts, Payments (with the collection schedule from schedule.js), Costs, Photos (BOM is in bom.js).
 * Loaded by: admin page
 */
'use strict';

/* ---- Details ---- */
function tabDetails(p) {
  const types = session.settings.types;
  const opts = types.map((x) => [x.code, L(x.name) + ' (' + x.code + ')']);
  if (!types.some((x) => x.code === p.type)) opts.unshift([p.type, pName(p) || p.type]);
  const typeSel = selectEl(opts, p.type, (v) => { const ty = types.find((x) => x.code === v); p.type = v; if (ty) p.typeName = clone(ty.name); touch(); drawBody(); }, 'pjType');
  const sku = tin(p, 'sku', { id: 'pjSku', dir: 'ltr', max: 40 });
  const regen = h('button', { class: 'small', type: 'button', id: 'btnRegenSku', onclick: () => { const ty = types.find((x) => x.code === p.type) || { code: p.type || 'OTH' }; p.sku = newSku(ty); ed.seqBump = true; sku.value = p.sku; touch(); } }, t('ed.regenSku'));
  return h('div', { class: 'stack-sm' },
    h('div', { class: 'grid2' }, fld('ed.projType', typeSel), fld('ed.sku', h('div', { class: 'input-row' }, sku, regen), 'ed.skuHint')),
    live(() => h('p', { class: 'small skuref' }, h('span', { class: 'muted' }, t('ed.skuRef') + ' '), h('code', { class: 'mono', id: 'pjSkuRef', dir: 'ltr' }, skuRef(ed.rec, p)), ' ', copyBtn(() => skuRef(ed.rec, p)))),
    fld('ed.projTitle', tin(p, 'title', { id: 'pjTitle', max: 120 })),
    fld('ed.projDesc', tarea(p, 'description', { id: 'pjDesc', rows: 3 })),
    h('div', { class: 'grid2' }, fld('ed.start', tin(p, 'startDate', { id: 'pjStart', type: 'date' })), fld('ed.due', tin(p, 'dueDate', { id: 'pjDue', type: 'date' }), 'ed.dueHint')),
    feedbackBlock(p),
    h('div', { class: 'actions' }, h('button', { class: 'btn danger small', type: 'button', id: 'btnDelProject', onclick: delProject }, t('ed.delProject'))));
}
function delProject() {
  const p = curProj(); if (!confirm(t('ed.delProjectConfirm', { s: p.sku }))) return;
  p.photos.forEach((x) => ed.trash.push(...photoFiles(ed.rec.id, x))); (p.downloads || []).forEach((x) => ed.trash.push(...dlFiles(ed.rec.id, x)));
  ed.rec.projects.splice(ed.pi, 1); touch(); drawProjects();
}

/* ---- Stages ---- */
function tabStages(p) {
  const prog = live(() => [h('div', { class: 'rowsep' }, h('span', { class: 'small muted' }, t('ed.progress')), h('strong', {}, pct(progress(p)))), barFill(progress(p))]);
  const editBtn = h('button', { class: 'small', type: 'button', id: 'btnEditStructure', onclick: () => { ed.edit = !ed.edit; drawBody(); } }, ed.edit ? t('ed.doneEditing') : t('ed.editStructure'));
  const tplBtn = h('button', { class: 'small', type: 'button', onclick: () => {
    const ty = session.settings.types.find((x) => x.code === p.type);
    if (!ty) return toast(t('ed.noTemplate'), 'bad');
    if (!confirm(t('ed.resetStagesConfirm'))) return;
    p.stages = makeStages(ty); touch(); drawBody();
  } }, t('ed.resetStages'));
  return h('div', { class: 'stack-sm' }, h('div', { class: 'actions' }, editBtn, tplBtn), prog, stageEditor(p.stages, { tpl: false, state: true, structure: ed.edit }));
}

/* ---- Parts / pieces ---- */
function tabParts(p) {
  const summary = live(() => { const n = p.parts.length; return n ? h('p', { class: 'small muted' }, t('ed.partsSummary', { a: nf(p.parts.filter((x) => x.status === 'completed').length), b: nf(n) })) : null; });
  const list = h('div', { class: 'stack-sm' });
  const row = (x, i) => {
    if (!x.status) x.status = 'pending';
    const chip = h('span'); const upd = () => chip.replaceChildren(timeBadge(x.dueDate, x.status === 'completed')); upd();
    return h('div', { class: 'rg', style: '--cols:minmax(0,2.2fr) 84px minmax(0,1.2fr) minmax(0,1.2fr) auto auto' },
      h('div', { class: 'wide' }, tin(x, 'name', { ph: t('ed.partName'), max: 120 })),
      tin(x, 'qty', { type: 'number', num: true, min: 1, step: 1, mode: 'numeric', ph: t('ed.qty') }),
      selectEl(statusOptions(), x.status, (v) => { x.status = v; touch(); upd(); }, undefined, t('rp.col.status') + ': ' + (x.name || '')),
      tin(x, 'dueDate', { type: 'date', on: upd, label: t('ed.due') }), chip,
      h('button', { class: 'small danger x', type: 'button', 'aria-label': t('act.remove'), onclick: () => { p.parts.splice(i, 1); touch(); draw(); } }, '×'));
  };
  const draw = () => list.replaceChildren(...(p.parts.length ? p.parts.map(row) : [h('p', { class: 'empty' }, t('ed.noParts'))]));
  draw();
  return h('div', { class: 'stack-sm' }, h('p', { class: 'hint' }, t('ed.partsHint')), summary, list,
    h('button', { class: 'btn', type: 'button', id: 'btnAddPart', onclick: () => { p.parts.push({ name: '', qty: 1, status: 'pending', dueDate: p.dueDate || '' }); touch(); draw(); } }, t('ed.addPart')));
}

/* ---- Payments (visible to the client) ---- */
function tabPayments(p) {
  const price = tin(p, 'price', { id: 'pjPrice', type: 'number', num: true, min: 0, step: '0.01', mode: 'decimal' });
  const sum = live(() => { const f = finance(p); return [kpis(kpi(t('fin.price'), money(f.price)), kpi(t('fin.paid'), money(f.paid), 'pos', pct(f.collected)), kpi(t('fin.remaining'), money(f.remaining), f.remaining > 0 ? 'warn' : '')), barFill(f.collected, 'ok')]; });
  const list = h('div', { class: 'stack-sm' });
  const row = (x, i) => h('div', { class: 'rg', style: '--cols:minmax(0,1fr) minmax(0,1fr) minmax(0,2fr) auto' },
    tin(x, 'date', { type: 'date', label: t('a11y.date') }), tin(x, 'amount', { type: 'number', num: true, min: 0, step: '0.01', mode: 'decimal', ph: t('ed.amount') }),
    h('div', { class: 'wide' }, tin(x, 'note', { ph: t('ed.payNote'), max: 120 })),
    h('button', { class: 'small danger x', type: 'button', 'aria-label': t('act.remove'), onclick: () => { p.payments.splice(i, 1); touch(); draw(); } }, '×'));
  const draw = () => list.replaceChildren(...(p.payments.length ? p.payments.map(row) : [h('p', { class: 'empty' }, t('ed.noPayments'))]));
  draw();
  return h('div', { class: 'stack-sm' },
    h('p', { class: 'notice' }, t('ed.clientSees')),
    fld('ed.price', price, 'ed.priceHint'), sum,
    h('strong', {}, t('ed.received')), list,
    h('button', { class: 'btn', type: 'button', id: 'btnAddPayment', onclick: () => { p.payments.push({ date: todayStr(), amount: Math.max(0, finance(p).remaining), note: '' }); touch(); draw(); } }, t('ed.addPayment')),
    scheduleCard(p));
}

/* ---- Costs, profit and margin (admin only) ---- */
function tabCosts(p) {
  const banner = h('div', { class: 'msg warn private' }, h('strong', {}, t('ed.privateTitle')), h('span', {}, t('ed.privateText')));
  const sum = live(() => {
    const f = finance(p);
    return kpis(kpi(t('fin.revenue'), money(f.price)), kpi(t('fin.cogs'), money(f.cogs)), kpi(t('fin.gross'), money(f.gross), profitCls(f.gross)), kpi(t('fin.grossMargin'), pct(f.grossMargin), profitCls(f.gross)),
      kpi(t('fin.opex'), money(f.opex)), kpi(t('fin.net'), money(f.net), profitCls(f.net)), kpi(t('fin.netMargin'), pct(f.netMargin), profitCls(f.net)), kpi(t('fin.markup'), pct(f.markup)));
  });
  const list = h('div', { class: 'stack-sm' });
  const row = (x, i) => h('div', { class: 'rg', style: '--cols:minmax(0,1fr) minmax(0,1.2fr) minmax(0,2fr) minmax(0,1fr) auto' },
    selectEl([['cogs', t('cost.cogs')], ['opex', t('cost.opex')]], x.type || 'cogs', (v) => { x.type = v; touch(); }, undefined, t('a11y.costType')),
    selectEl(COST_CATS.map((c) => [c, catText('direct', c)]), COST_CATS.includes(x.cat) ? x.cat : 'other', (v) => { x.cat = v; touch(); }, undefined, t('a11y.category')),
    h('div', { class: 'wide' }, tin(x, 'note', { ph: t('ed.costNote'), max: 120 })),
    tin(x, 'amount', { type: 'number', num: true, min: 0, step: '0.01', mode: 'decimal', ph: t('ed.amount') }),
    h('button', { class: 'small danger x', type: 'button', 'aria-label': t('act.remove'), onclick: () => { p.costs.splice(i, 1); touch(); draw(); } }, '×'));
  const draw = () => list.replaceChildren(...(p.costs.length ? p.costs.map(row) : [h('p', { class: 'empty' }, t('ed.noCosts'))]));
  draw();
  return h('div', { class: 'stack-sm' }, banner, sum,
    h('p', { class: 'hint' }, t('ed.costsHint')), list,
    h('button', { class: 'btn', type: 'button', id: 'btnAddCost', onclick: () => { p.costs.push({ type: 'cogs', cat: 'materials', note: '', amount: '' }); touch(); draw(); } }, t('ed.addCost')),
    fld('ed.internalNotes', tarea(p, 'internalNotes', { id: 'pjInternal', rows: 3 })));
}

/* ---- Photos ---- */
function tabPhotos(p) {
  const ctx = photoCtx(), status = msgBox(), grid = h('div', { class: 'photos' });
  const keyChanged = !ed.isNew && ed.rec.secret !== ed.origSecret;
  const blocked = ed.isNew ? t('ph.saveFirst') : keyChanged ? t('ph.saveKeyFirst') : '';
  const tile = (ph, i) => h('div', { class: 'ph' },
    h('button', { class: 'imgbtn', type: 'button', 'aria-label': t('ph.view'), onclick: () => openLightbox(ctx, p.photos, i) }, photoImg(ctx, ph, 't')),
    h('div', { class: 'ctl' }, tin(ph, 'caption', { ph: t('ed.caption'), max: 120 }), h('span', { class: 'small muted' }, ph.kind === 'link' ? t('ph.link') : ph.kind === 'vlink' ? t('vid.link') : ph.kind === 'video' ? t('vid.file') : t('ph.file')),
      h('button', { class: 'small danger', type: 'button', onclick: () => removePhoto(p, i, draw) }, t('act.remove'))));
  const draw = () => grid.replaceChildren(...(p.photos.length ? p.photos.map(tile) : [h('p', { class: 'empty', style: 'grid-column:1/-1' }, t('ed.noPhotos'))]));
  draw();
  const onFiles = (inp) => async () => { const files = [...inp.files]; inp.value = ''; if (files.length) await uploadPhotos(p, files, status, draw); };
  const file = h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true });
  file.addEventListener('change', onFiles(file));
  const pick = h('button', { class: 'btn primary', type: 'button', id: 'btnUpload', disabled: !!blocked, onclick: () => file.click() }, t('ed.uploadPhotos'));
  // on a phone or tablet the camera opens directly (the capture hint is ignored on a computer, so the button is only shown on touch screens)
  const cam = h('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true });
  cam.addEventListener('change', onFiles(cam));
  const shoot = window.matchMedia && matchMedia('(pointer:coarse)').matches ? h('button', { class: 'btn', type: 'button', id: 'btnCamera', disabled: !!blocked, onclick: () => cam.click() }, icon('image'), t('ph.camera')) : null;
  const vfile = h('input', { type: 'file', id: 'vidInput', accept: 'video/mp4,video/webm,video/quicktime,video/ogg,.mp4,.m4v,.webm,.mov,.ogv', hidden: true, 'aria-label': t('vid.add') });
  vfile.addEventListener('change', async () => { const f = vfile.files && vfile.files[0]; vfile.value = ''; if (f) await uploadVideo(p, f, status, draw); });
  const vpick = h('button', { class: 'btn', type: 'button', id: 'btnUploadVideo', disabled: !!blocked, onclick: () => vfile.click() }, icon('play'), t('vid.add'));
  const url = h('input', { id: 'phUrl', type: 'url', dir: 'ltr', placeholder: 'https://…', 'aria-label': t('ed.photoUrl') });
  const cap = h('input', { id: 'phCap', maxlength: 120, dir: 'auto', placeholder: t('ed.caption'), 'aria-label': t('ed.caption') });
  const addLink = h('button', { class: 'btn', type: 'button', id: 'btnAddLink', onclick: () => {
    const u = url.value.trim();
    if (!/^https:\/\/[^\s]+$/i.test(u)) return setMsg(status, 'bad', t('ph.badUrl'));
    p.photos.push({ id: 'l' + uid(), kind: videoLinkOk(u) ? 'vlink' : 'link', url: u, caption: cap.value.trim(), date: todayStr() });
    url.value = ''; cap.value = ''; setMsg(status, 'ok', t('ph.linkAdded')); touch(); draw();
  } }, t('ed.addLink'));
  p.downloads = p.downloads || [];
  const dlBox = filesCard(p, ctx, status, blocked);
  return h('div', { class: 'stack-sm' }, h('p', { class: 'hint' }, t('ed.photosHint')),
    blocked ? h('p', { class: 'msg warn' }, blocked) : null,
    h('div', { class: 'up' }, pick, vpick, shoot, file, cam, vfile), h('p', { class: 'hint' }, t('vid.hint', { n: nf(VIDEO_MAX_MB) })), h('div', { class: 'addrow' }, url, cap, addLink), status, grid, dlBox);
}
async function uploadPhotos(p, files, status, redraw) {
  const rec = ed.rec, errors = []; let done = 0;
  try {
    await needMaster();
    const key = await imageKey(rec.secret, rec.id);
    for (const f of files) {
      setMsg(status, '', t('ph.uploading', { a: nf(done + errors.length + 1), b: nf(files.length) }));
      try {
        const v = await makeVariants(f), id = uid(), base = 'data/clients/' + rec.id + '/' + id;
        await putFile(base + '.t', await sealBytes(key, v.thumb), 'Add photo', { create: true });
        await putFile(base + '.f', await sealBytes(key, v.full), 'Add photo', { create: true });
        imgUrls.set(rec.id + '/' + id + '.t', Promise.resolve(URL.createObjectURL(new Blob([v.thumb], { type: 'image/jpeg' }))));
        imgUrls.set(rec.id + '/' + id + '.f', Promise.resolve(URL.createObjectURL(new Blob([v.full], { type: 'image/jpeg' }))));
        p.photos.push({ id, kind: 'file', caption: '', date: todayStr() }); done++; touch(); redraw();
      } catch (e) { errors.push(e.message); }
    }
  } catch (e) { errors.push(e.message); }
  if (done) { try { await saveEditor(true); } catch (e) { errors.push(e.message); } }
  if (errors.length) setMsg(status, 'bad', t('ph.uploadFailed', { n: nf(errors.length) }), ...errors); else setMsg(status, 'ok', t('ph.uploaded', { n: nf(done) }));
  toast(errors.length ? t('ph.uploadFailed', { n: nf(errors.length) }) : t('ph.uploaded', { n: nf(done) }), errors.length ? 'bad' : 'ok');   // the screen is redrawn after the save, so say it here too
}
/* ---- files for the client to download (3D models, drawings, PDFs) ---- */
function filesCard(p, ctx, status, blocked) {
  const list = h('ul', { class: 'plainlist dl-admin', id: 'dlList' });
  const draw = () => list.replaceChildren(...(p.downloads.length ? p.downloads.map((d, i) => h('li', { class: 'dl-row', 'data-file': d.id },
    h('div', { class: 'dl-main' }, h('span', { class: 'badge pending', 'data-ext': dlExt(d.name) }, dlExt(d.name).toUpperCase() || '—'), ' ', h('bdi', { dir: 'auto' }, d.name), ' ', h('span', { class: 'small muted' }, dlSizeText(d.size))),
    h('div', { class: 'dl-ctl' }, tin(d, 'caption', { ph: t('dl.caption'), max: 120, label: t('dl.caption') + ': ' + d.name }),
      h('button', { class: 'btn small', type: 'button', 'data-act': 'save', 'aria-label': t('att.download') + ': ' + d.name, onclick: async (ev) => { const b = ev.currentTarget; b.disabled = true; try { await downloadFile(ctx, d); } catch (e) { toast(t('dl.failed'), 'bad'); } b.disabled = false; } }, t('att.download')),
      h('button', { class: 'btn small danger', type: 'button', 'data-act': 'remove', 'aria-label': t('att.remove') + ': ' + d.name, onclick: () => {
        if (!confirm(t('att.removeConfirm', { n: d.name }))) return; ed.trash.push(...dlFiles(ed.rec.id, d)); p.downloads.splice(i, 1); touch(); draw();
      } }, t('att.remove'))))) : [h('li', { class: 'muted small' }, t('dl.none'))]));
  draw();
  const input = h('input', { type: 'file', id: 'dlInput', accept: DL_EXT.map((x) => '.' + x).join(','), hidden: true, 'aria-label': t('dl.add') });
  input.addEventListener('change', async () => { const f = input.files && input.files[0]; input.value = ''; if (f) await uploadDownload(p, f, status, draw); });
  return h('div', { class: 'card stack-sm', id: 'dlCard' }, h('h2', {}, t('dl.adminTitle')), h('p', { class: 'hint' }, t('dl.adminHint', { n: nf(DL_MAX_MB) })), list,
    h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'button', id: 'btnUploadFile', disabled: !!blocked, onclick: () => input.click() }, t('dl.add')), input),
    h('p', { class: 'small muted' }, t('dl.types', { list: DL_EXT.map((x) => x.toUpperCase()).join(', ') })));
}
async function uploadDownload(p, file, status, redraw) {
  const rec = ed.rec, name = dlName(file.name), fail = (m) => { setMsg(status, 'bad', m); toast(m, 'bad'); };
  if (!dlOk(name)) return fail(t('dl.badType', { name }));
  if (!file.size) return fail(t('dl.empty', { name }));
  if (file.size > DL_MAX_MB * 1024 * 1024) return fail(t('vid.tooBig', { name, n: nf(DL_MAX_MB) }));
  try {
    setMsg(status, '', t('vid.uploading', { name }));
    await needMaster();
    const bytes = new Uint8Array(await file.arrayBuffer()), id = uid();
    await putFile('data/clients/' + rec.id + '/' + id + '.d', await sealBytes(await imageKey(rec.secret, rec.id), bytes), 'Add file', { create: true });
    p.downloads.push({ id, name, size: bytes.length, caption: '', date: todayStr() }); touch(); redraw();
    await saveEditor(true);
    setMsg(status, 'ok', t('vid.uploaded', { name })); toast(t('vid.uploaded', { name }), 'ok');
  } catch (e) { fail(e.message); }
}

/* ---- videos ---- */
const VIDEO_MAX_MB = 24;                                                    // a sealed video is read whole in the browser: a clip of this size is a minute or two on a phone
const VIDEO_MIME = { mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', ogv: 'video/ogg' };
const VIDEO_HOSTS = /^https:\/\/(www\.|m\.)?(youtube\.com|youtu\.be|youtube-nocookie\.com|vimeo\.com|player\.vimeo\.com|facebook\.com\/[^\s]*\/videos|fb\.watch|drive\.google\.com|tiktok\.com|instagram\.com\/(reel|tv)|loom\.com)\//i;
const videoLinkOk = (u) => directVideo(u) || VIDEO_HOSTS.test(u);
// does the start of the file look like a video container? (mp4 / mov: "ftyp", "moov", "mdat" ...; webm: EBML; ogg: "OggS")
function videoSniff(b) {
  const s4 = String.fromCharCode(...b.subarray(4, 8));
  return ['ftyp', 'moov', 'mdat', 'wide', 'free', 'skip'].includes(s4) || (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) || String.fromCharCode(...b.subarray(0, 4)) === 'OggS';
}
// a poster for the grid: a frame of the video (when this browser can decode it) or a plain dark card with a play mark
async function videoPoster(file) {
  const W = 360, jpeg = (c) => new Promise((r) => c.toBlob(async (b) => r(b ? new Uint8Array(await b.arrayBuffer()) : null), 'image/jpeg', 0.72));
  const url = URL.createObjectURL(file), v = document.createElement('video');
  v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = url;
  try {
    await new Promise((res, rej) => { v.onloadeddata = res; v.onerror = () => rej(new Error('video')); setTimeout(() => rej(new Error('timeout')), 8000); });
    v.currentTime = Math.min(1, (v.duration || 2) / 2);
    await new Promise((res) => { v.onseeked = res; setTimeout(res, 3000); });
    const sc = Math.min(1, W / Math.max(1, v.videoWidth)), c = document.createElement('canvas'); c.width = Math.max(1, Math.round(v.videoWidth * sc)); c.height = Math.max(1, Math.round(v.videoHeight * sc));
    c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
    const b = await jpeg(c); if (b) return b;
  } catch (_) { /* codec this browser cannot decode: the plain card below */ } finally { URL.revokeObjectURL(url); v.removeAttribute('src'); }
  const c = document.createElement('canvas'); c.width = W; c.height = 240; const g = c.getContext('2d');
  g.fillStyle = '#1e293b'; g.fillRect(0, 0, W, 240); g.fillStyle = '#e2e8f0'; g.beginPath(); g.moveTo(150, 80); g.lineTo(150, 160); g.lineTo(220, 120); g.closePath(); g.fill();
  return jpeg(c);
}
async function uploadVideo(p, file, status, redraw) {
  const rec = ed.rec, ext = (/\.([A-Za-z0-9]+)$/.exec(file.name) || [])[1] || '', mime = VIDEO_MIME[ext.toLowerCase()] || (/^video\/(mp4|webm|quicktime|ogg)$/.test(file.type) ? file.type : '');
  const fail = (m) => { setMsg(status, 'bad', m); toast(m, 'bad'); };
  if (!mime) return fail(t('vid.badType', { name: file.name }));
  if (file.size > VIDEO_MAX_MB * 1024 * 1024) return fail(t('vid.tooBig', { name: file.name, n: nf(VIDEO_MAX_MB) }));
  try {
    setMsg(status, '', t('vid.uploading', { name: file.name }));
    await needMaster();
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!videoSniff(bytes)) return fail(t('vid.badFile', { name: file.name }));
    const key = await imageKey(rec.secret, rec.id), id = uid(), base = 'data/clients/' + rec.id + '/' + id, poster = await videoPoster(file);
    await putFile(base + '.t', await sealBytes(key, poster), 'Add video', { create: true });
    await putFile(base + '.v', await sealBytes(key, bytes), 'Add video', { create: true });
    imgUrls.set(rec.id + '/' + id + '.t', Promise.resolve(URL.createObjectURL(new Blob([poster], { type: 'image/jpeg' }))));
    p.photos.push({ id, kind: 'video', mime, size: bytes.length, caption: '', date: todayStr() }); touch(); redraw();
    await saveEditor(true);
    setMsg(status, 'ok', t('vid.uploaded', { name: file.name })); toast(t('vid.uploaded', { name: file.name }), 'ok');
  } catch (e) { fail(e.message); }
}
function removePhoto(p, i, redraw) {
  if (!confirm(t('ph.removeConfirm'))) return;
  const ph = p.photos[i];
  ed.trash.push(...photoFiles(ed.rec.id, ph));
  p.photos.splice(i, 1); touch(); redraw();
}
