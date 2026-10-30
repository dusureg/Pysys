/**
 * assets/js/core/photos.js  -  encrypted photos and videos: fetch, decrypt, show, viewer
 * photoUrl() downloads data/clients/<id>/<photo>.t|.f and decrypts it in the browser; photoImg() and openLightbox() render it.
 * A video kept in the repository is sealed like a photo (<id>.v, with a poster <id>.t) and is opened by videoUrl(); a video link (kind 'vlink') plays in the page when it
 * is a direct file (mp4, webm ...) and otherwise opens on its own site. The viewer zooms pictures (buttons, double tap, + - 0), moves with the arrow keys or a swipe.
 * clearImages() revokes every blob URL (called when the portal closes or the admin locks).
 * Loaded by: both pages
 */
'use strict';

const imgUrls = new Map();
let imgGen = 0;                  // bumps when the cache is cleared, so photos requested by a view that is gone are not shown
function clearImages() { imgGen++; imgUrls.forEach((p) => p.then((u) => { if (/^blob:/.test(u)) URL.revokeObjectURL(u); }, () => {})); imgUrls.clear(); }
// ctx = { cid, secret, where: {user, repo} }
function saveBlob(blob, name) {                                            // hand a file to the browser's download
  const u = URL.createObjectURL(blob), a = h('a', { href: u, download: name });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 15000);
}
const isVideo = (ph) => ph && (ph.kind === 'video' || ph.kind === 'vlink');
const VIDEO_FILE_RE = /\.(mp4|m4v|webm|ogv|mov)(\?[^#]*)?(#.*)?$/i;
const directVideo = (url) => VIDEO_FILE_RE.test(String(url || ''));
// the repository paths of one photo or video (to delete them together)
const photoFiles = (cid, ph) => (ph.kind === 'file' ? ['t', 'f'] : ph.kind === 'video' ? ['t', 'v'] : []).map((v) => 'data/clients/' + cid + '/' + ph.id + '.' + v);
function photoUrl(ctx, ph, variant) {
  if (ph.kind === 'link' || ph.kind === 'vlink') return Promise.resolve(ph.url);
  const k = ctx.cid + '/' + ph.id + '.' + variant;
  if (!imgUrls.has(k)) {
    imgUrls.set(k, (async () => {
      const res = await fetch('https://raw.githubusercontent.com/' + encodeURIComponent(ctx.where.user) + '/' + encodeURIComponent(ctx.where.repo) + '/HEAD/data/clients/' + encodeURIComponent(ctx.cid) + '/' + encodeURIComponent(ph.id) + '.' + variant);
      if (!res.ok) throw new Error('img ' + res.status);
      const bytes = await openBytes(await imageKey(ctx.secret, ctx.cid), new Uint8Array(await res.arrayBuffer()));
      return URL.createObjectURL(new Blob([bytes], { type: 'image/jpeg' }));
    })().catch((e) => { imgUrls.delete(k); throw e; }));
  }
  return imgUrls.get(k);
}
// A sealed video: downloaded whole (with the percentage), opened with the key of the project and kept as a blob until the viewer closes.
function videoUrl(ctx, ph, onProgress) {
  const k = ctx.cid + '/' + ph.id + '.v';
  if (!imgUrls.has(k)) {
    imgUrls.set(k, (async () => {
      const res = await fetch('https://raw.githubusercontent.com/' + encodeURIComponent(ctx.where.user) + '/' + encodeURIComponent(ctx.where.repo) + '/HEAD/data/clients/' + encodeURIComponent(ctx.cid) + '/' + encodeURIComponent(ph.id) + '.v');
      if (!res.ok) throw new Error('vid ' + res.status);
      const total = Number(res.headers.get('content-length')) || Number(ph.size) || 0;
      let bytes;
      if (res.body && res.body.getReader && onProgress) {
        const rd = res.body.getReader(), parts = []; let got = 0;
        for (;;) { const { done, value } = await rd.read(); if (done) break; parts.push(value); got += value.length; onProgress(got, total); }
        bytes = new Uint8Array(got); let o = 0; for (const c of parts) { bytes.set(c, o); o += c.length; }
      } else bytes = new Uint8Array(await res.arrayBuffer());
      const plain = await openBytes(await imageKey(ctx.secret, ctx.cid), bytes);
      return URL.createObjectURL(new Blob([plain], { type: /^video\/[\w.+-]+$/.test(ph.mime || '') ? ph.mime : 'video/mp4' }));
    })().catch((e) => { imgUrls.delete(k); throw e; }));
  }
  return imgUrls.get(k);
}
function dropVideo(ctx, ph) {                                              // the viewer is closed or moved on: the (large) video leaves memory
  const k = ctx.cid + '/' + ph.id + '.v', p = imgUrls.get(k); if (!p) return;
  imgUrls.delete(k); p.then((u) => { if (/^blob:/.test(u)) URL.revokeObjectURL(u); }, () => {});
}
// Files kept for the client to download (3D models, drawings, PDFs ...): sealed like photos as <id>.d, saved under their own name
const DL_EXT = ['glb', 'gltf', 'obj', 'stl', 'step', 'stp', 'skp', '3dm', '3ds', 'fbx', 'dwg', 'dxf', 'pdf', 'zip', 'png', 'jpg', 'jpeg', 'webp', 'txt', 'csv', 'xlsx', 'docx', 'pptx'];
const DL_MAX_MB = 24;
const dlName = (n) => String(n || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').replace(/^\.+/, '').trim().slice(0, 100) || 'file';
const dlExt = (n) => { const m = /\.([A-Za-z0-9]+)$/.exec(String(n || '')); return m ? m[1].toLowerCase() : ''; };
const dlOk = (n) => DL_EXT.includes(dlExt(n));
const dlFiles = (cid, d) => ['data/clients/' + cid + '/' + d.id + '.d'];
const dlSizeText = (n) => (n >= 1048576 ? nf(n / 1048576, { maximumFractionDigits: 1 }) + ' MB' : nf(Math.max(1, Math.round(n / 1024))) + ' KB');
async function downloadFile(ctx, d, onProgress) {
  const res = await fetch('https://raw.githubusercontent.com/' + encodeURIComponent(ctx.where.user) + '/' + encodeURIComponent(ctx.where.repo) + '/HEAD/data/clients/' + encodeURIComponent(ctx.cid) + '/' + encodeURIComponent(d.id) + '.d');
  if (!res.ok) throw new Error('file ' + res.status);
  const total = Number(res.headers.get('content-length')) || Number(d.size) || 0;
  let bytes;
  if (res.body && res.body.getReader && onProgress) {
    const rd = res.body.getReader(), parts = []; let got = 0;
    for (;;) { const { done, value } = await rd.read(); if (done) break; parts.push(value); got += value.length; onProgress(got, total); }
    bytes = new Uint8Array(got); let o = 0; for (const c of parts) { bytes.set(c, o); o += c.length; }
  } else bytes = new Uint8Array(await res.arrayBuffer());
  const plain = await openBytes(await imageKey(ctx.secret, ctx.cid), bytes);
  saveBlob(new Blob([plain], { type: 'application/octet-stream' }), dlName(d.name));       // always saved, never opened in the page: a file of the project cannot run inside it
  return plain.length;
}
// Thumbnails download and decrypt only when they are close to the screen (a page with 40 photos starts as fast as one with 4, and a phone on a slow
// connection spends its first seconds on what is visible). Without IntersectionObserver every thumbnail loads at once, as before.
const nearJobs = new WeakMap();
let nearObs = null;
function whenNear(el, job) {
  if (!('IntersectionObserver' in window)) return job();
  if (!nearObs) nearObs = new IntersectionObserver((list) => list.forEach((en) => {
    if (!en.isIntersecting) return;
    nearObs.unobserve(en.target); const j = nearJobs.get(en.target); nearJobs.delete(en.target); if (j) j();
  }), { rootMargin: '500px 0px' });
  nearJobs.set(el, job); nearObs.observe(el);
}
function plainImg(ctx, ph, variant) {
  const img = h('img', { alt: ph.caption || '', decoding: 'async', loading: 'lazy', referrerpolicy: 'no-referrer' });
  const fail = () => img.replaceWith(h('span', { class: 'ph-fail' }, icon('image'), t('ph.failed')));
  img.addEventListener('error', fail);
  const gen = imgGen;
  const load = () => { if (gen === imgGen) photoUrl(ctx, ph, variant).then((u) => { if (gen === imgGen) img.src = u; }, fail); };
  if (variant === 't' && ph.kind !== 'link') whenNear(img, load); else load();        // the full-size photo of the lightbox is wanted right now
  return img;
}
// what a list shows for one item: a photo, a video's poster with a play mark, or a card for a video that lives on another site
function photoImg(ctx, ph, variant) {
  if (ph.kind === 'vlink') return h('span', { class: 'vthumb vph', 'data-kind': 'vlink' }, icon('play'), h('span', { class: 'small', dir: 'auto' }, ph.caption || t('vid.link')));
  const img = plainImg(ctx, ph, variant);
  return ph.kind === 'video' ? h('span', { class: 'vthumb', 'data-kind': 'video' }, img, h('span', { class: 'vplay', 'aria-hidden': 'true' }, icon('play'))) : img;
}

/* ---- the viewer ---- */
const ZOOM_MAX = 5, ZOOM_STEP = 1.5;
function openLightbox(ctx, photos, start) {
  let i = start, zoom = 1, token = 0;
  const opened = new Set();
  const rtl = () => document.documentElement.dir === 'rtl';
  const body = h('div', { class: 'dlg-body' });
  const dlg = h('dialog', { class: 'lb', 'aria-label': t('ph.title') }, h('div', { class: 'dlg-head' }, h('strong', {}, t('ph.title')), h('button', { class: 'small ghost', type: 'button', id: 'lbClose', onclick: () => dlg.close() }, t('act.close'))), body);
  const go = (d) => { if (photos.length < 2) return; i = (i + d + photos.length) % photos.length; zoom = 1; draw(); };
  const setZoom = (z, img) => {
    zoom = Math.min(ZOOM_MAX, Math.max(1, z));
    const im = img || body.querySelector('.lb-stage img'); if (!im) return;
    // 100 % is the size the picture has when it fits the window; a zoomed picture is that size times the level (a small picture stays small, a big one grows)
    if (zoom > 1 && !im._fit) { im.style.width = ''; im.style.maxWidth = ''; im.style.maxHeight = ''; im._fit = im.getBoundingClientRect().width; }
    if (zoom > 1 && im._fit) { im.style.width = Math.round(im._fit * zoom) + 'px'; im.style.maxWidth = 'none'; im.style.maxHeight = 'none'; }
    else { im.style.width = ''; im.style.maxWidth = ''; im.style.maxHeight = ''; }
    const lv = body.querySelector('#lbZoomLevel'); if (lv) lv.textContent = nf(Math.round(zoom * 100)) + '%';
    const out = body.querySelector('#lbZoomOut'), inn = body.querySelector('#lbZoomIn'), rs = body.querySelector('#lbZoomReset');
    if (out) out.disabled = zoom <= 1; if (inn) inn.disabled = zoom >= ZOOM_MAX; if (rs) rs.disabled = zoom === 1;
  };
  const zoomTools = (img) => h('div', { class: 'lb-zoom', role: 'group', 'aria-label': t('zoom.label') },
    h('button', { class: 'small', type: 'button', id: 'lbZoomOut', disabled: true, 'aria-label': t('zoom.out'), onclick: () => setZoom(zoom / ZOOM_STEP, img) }, '−'),
    h('span', { class: 'small muted', id: 'lbZoomLevel', 'aria-live': 'polite' }, '100%'),
    h('button', { class: 'small', type: 'button', id: 'lbZoomIn', 'aria-label': t('zoom.in'), onclick: () => setZoom(zoom * ZOOM_STEP, img) }, '+'),
    h('button', { class: 'small', type: 'button', id: 'lbZoomReset', disabled: true, 'aria-label': t('zoom.reset'), onclick: () => setZoom(1, img) }, t('zoom.fit')));
  // a video that is kept in the repository: download with the percentage, then play from memory
  const sealedVideo = (ph, stage, mine) => {
    const note = h('p', { class: 'small muted', role: 'status', id: 'vidLoad' }, t('vid.loading', { p: '0%' }));
    stage.replaceChildren(h('div', { class: 'vid-wait' }, icon('play'), note));
    opened.add(ph);
    videoUrl(ctx, ph, (a, b) => { if (mine === token) note.textContent = t('vid.loading', { p: b ? nf(Math.min(99, Math.round(a * 100 / b))) + '%' : nf(Math.round(a / 1024)) + ' KB' }); }).then((u) => {
      if (mine !== token) return;
      const v = h('video', { class: 'lb-video', controls: true, playsinline: true, preload: 'metadata', src: u, 'aria-label': ph.caption || t('vid.label') });
      v.addEventListener('error', () => { if (mine === token) stage.replaceChildren(h('p', { class: 'msg warn' }, t('vid.cantPlay'))); });
      stage.replaceChildren(v);
    }, () => { if (mine === token) stage.replaceChildren(h('p', { class: 'msg bad', role: 'alert' }, t('vid.failed'))); });
  };
  const draw = () => {
    const ph = photos[i], mine = ++token;
    opened.forEach((x) => { if (x !== ph) dropVideo(ctx, x); });
    const stage = h('div', { class: 'lb-stage' + (isVideo(ph) ? ' is-video' : ''), tabindex: '0' });
    let tools = null;
    if (ph.kind === 'video') sealedVideo(ph, stage, mine);
    else if (ph.kind === 'vlink') {
      if (directVideo(ph.url)) {
        const v = h('video', { class: 'lb-video', controls: true, playsinline: true, preload: 'metadata', src: ph.url, 'aria-label': ph.caption || t('vid.label') });
        v.addEventListener('error', () => { if (mine === token) stage.replaceChildren(h('p', { class: 'msg warn' }, t('vid.cantPlay'))); });
        stage.append(v);
      } else stage.append(h('div', { class: 'vid-wait' }, icon('play'), h('p', { class: 'small' }, t('vid.elsewhere'))));
    } else {
      const img = photoImg(ctx, ph, 'f'); stage.append(img);
      if (img.tagName === 'IMG') {
        tools = zoomTools(img);
        img.addEventListener('dblclick', () => setZoom(zoom > 1 ? 1 : 2.5, img));
      }
    }
    // a swipe moves to the next or the previous item (only when the picture is not zoomed, so a zoomed picture can still be dragged)
    let x0 = null, y0 = 0;
    stage.addEventListener('touchstart', (e) => { x0 = e.touches.length === 1 && zoom === 1 ? e.touches[0].clientX : null; y0 = e.touches[0].clientY; }, { passive: true });
    stage.addEventListener('touchend', (e) => {
      if (x0 === null || !e.changedTouches.length) return;
      const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0; x0 = null;
      if (Math.abs(dx) > 60 && Math.abs(dx) > 2 * Math.abs(dy)) go((dx < 0) !== rtl() ? 1 : -1);
    }, { passive: true });
    const prev = h('button', { class: 'small', type: 'button', id: 'lbPrev', onclick: () => go(-1) }, t('act.prev'));
    const next = h('button', { class: 'small', type: 'button', id: 'lbNext', onclick: () => go(1) }, t('act.next'));
    body.replaceChildren(...[stage, tools,
      h('p', { class: 'small', dir: 'auto', id: 'lbCaption' }, ph.caption || '', ph.date ? h('span', { class: 'muted' }, (ph.caption ? ' · ' : '') + fmtDay(ph.date)) : null),
      ph.kind === 'link' || ph.kind === 'vlink' ? h('a', { class: 'small', href: ph.url, target: '_blank', rel: 'noopener noreferrer' }, ph.kind === 'vlink' ? t('vid.openOriginal') : t('ph.openOriginal')) : null,
      photos.length > 1 ? h('div', { class: 'lb-nav' }, prev, h('span', { class: 'muted small' }, nf(i + 1) + ' / ' + nf(photos.length)), next) : null].filter(Boolean));
    zoom = 1;
  };
  dlg.addEventListener('keydown', (e) => {
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    const k = e.key;
    if (k === 'ArrowRight' || k === 'ArrowLeft') { if (e.target && e.target.tagName === 'VIDEO') return; e.preventDefault(); go((k === 'ArrowRight') !== rtl() ? 1 : -1); }
    else if (k === '+' || k === '=') { e.preventDefault(); setZoom(zoom * ZOOM_STEP); }
    else if (k === '-' || k === '_') { e.preventDefault(); setZoom(zoom / ZOOM_STEP); }
    else if (k === '0') { e.preventDefault(); setZoom(1); }
  });
  dlg.addEventListener('close', () => { token++; opened.forEach((x) => dropVideo(ctx, x)); dlg.remove(); });
  document.body.append(dlg); draw(); dlg.showModal();
}
