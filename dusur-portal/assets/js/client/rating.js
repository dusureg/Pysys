/**
 * assets/js/client/rating.js  -  rating after completion
 * Score /10 + comment; builds the encrypted DSFB1 code and sends it straight to the company inbox from this page (when the company set one up);
 * WhatsApp / mail / copy stay as the other ways.
 * Loaded by: client page
 */
'use strict';

/* ---- rating after completion ---- */
const fbKey = (cid, sku) => 'dsp.fb.' + cid + '.' + sku;
// Post the encrypted code to the company inbox. 'sent' = the inbox answered "ok"; 'unsure' = the request went out but this browser would not show the answer; 'failed' = it did not go.
async function sendToInbox(code) {
  const body = JSON.stringify({ v: 1, code });
  const attempt = async (extra) => {
    const ac = new AbortController(), tm = setTimeout(() => ac.abort(), 20000);
    try { return await fetch(brand.inbox, Object.assign({ method: 'POST', body, signal: ac.signal, credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=UTF-8' } }, extra)); } finally { clearTimeout(tm); }
  };
  try {
    const r = await attempt({}); let j = null; try { j = await r.json(); } catch (_) { j = null; }
    return r.ok && j && j.ok === true ? 'sent' : 'failed';
  } catch (e) {
    if (e && e.name === 'AbortError') return 'failed';
    try { await attempt({ mode: 'no-cors' }); return 'unsure'; } catch (_) { return 'failed'; }     // the page may not read the answer, but the request can still arrive
  }
}
function ratingCard(p, ctx) {
  if (projState(p) !== 'completed' || brand.rating === false) return null;
  const fb = p.feedback;
  if (fb) {
    return h('section', { class: 'card rate done-rate', id: 'rateBox' },
      h('div', { class: 'rate-head' }, h('span', { class: 'okdot' }, icon('star')), h('div', {}, h('h2', {}, t('rate.thanks')), h('p', { class: 'muted small' }, t('rate.yours')))),
      h('div', { class: 'score-big' }, h('strong', {}, nf(fb.score)), h('span', { class: 'muted' }, '/ ' + nf(10))),
      h('div', { class: 'scorebar', role: 'img', 'aria-label': t('rate.score', { n: nf(fb.score) }) }, Array.from({ length: 10 }, (_, i) => h('i', { class: i < fb.score ? 'on' : '' }))),
      fb.comment ? h('blockquote', { dir: 'auto' }, fb.comment) : null);
  }
  let saved = null; try { saved = JSON.parse(ls.get(fbKey(ctx.cid, p.sku)) || 'null'); } catch (_) { saved = null; }
  const st = { score: saved ? saved.score : 0, comment: saved ? saved.comment : '', code: saved ? saved.code : '', err: '', send: saved && ['sent', 'unsure', 'failed'].includes(saved.send) ? saved.send : '' };
  const keep = () => ls.set(fbKey(ctx.cid, p.sku), JSON.stringify({ score: st.score, comment: st.comment.trim(), code: st.code, send: st.send }));
  const deliver = async () => { st.send = 'sending'; draw(); st.send = await sendToInbox(st.code); keep(); draw(); };
  const box = h('section', { class: 'card rate', id: 'rateBox' });
  const draw = () => box.replaceChildren(...(st.code ? sendPanel() : formPanel()).filter(Boolean));     // replaceChildren(null) would print the word "null"
  const message = () => t('rate.msgIntro', { b: brandName(), sku: p.sku, n: nf(st.score) }) + '\n\n' + st.code;
  function sendPanel() {
    const inbox = !!brand.inbox, sent = st.send === 'sent', sending = st.send === 'sending';
    const head = sent ? [t('rate.sentTitle'), t('rate.sentText', { b: brandName() })] : sending ? [t('rate.sendingTitle'), t('rate.sendingText')]
      : inbox ? [t(st.send === 'unsure' ? 'rate.unsureTitle' : st.send === 'failed' ? 'rate.failTitle' : 'rate.readyTitle'), t(st.send === 'unsure' ? 'rate.unsureText' : st.send === 'failed' ? 'rate.failText' : 'rate.readyText')] : [t('rate.sendTitle'), t('rate.sendText')];
    const out = [h('div', { class: 'rate-head' }, h('span', { class: 'okdot' }, sending ? h('span', { class: 'spin sm', 'aria-hidden': 'true' }) : icon('check')), h('div', {}, h('h2', {}, head[0]), h('p', { class: 'muted small', role: 'status', id: 'rateState', 'data-send': st.send || 'none' }, head[1]))),
      h('div', { class: 'score-big' }, h('strong', {}, nf(st.score)), h('span', { class: 'muted' }, '/ ' + nf(10)))];
    const acts = [];
    if (inbox && !sent && !sending) acts.push(h('button', { class: 'btn primary', type: 'button', id: 'btnRateRetry', onclick: deliver }, icon('refresh'), t(st.send ? 'rate.retry' : 'rate.sendNow')));
    if (brand.whatsapp) acts.push(h('a', { class: 'btn' + (inbox ? '' : ' primary'), id: 'btnRateWa', href: waLink(brand.whatsapp, message()), target: '_blank', rel: 'noopener noreferrer' }, icon('chat'), t('cl.whatsapp')));
    if (brand.email) acts.push(h('a', { class: 'btn', id: 'btnRateMail', href: mailLink(brand.email, t('rate.mailSubject', { sku: p.sku }), message()) }, icon('mail'), t('cl.email')));
    const copy = h('button', { class: 'btn', type: 'button', id: 'btnRateCopy' }, icon('key'), t('rate.copy'));
    copy.onclick = async () => { const ok = await copyText(message()); toast(ok ? t('act.copied') : t('act.copyFail'), ok ? 'ok' : 'bad'); };
    acts.push(copy);
    if (sent) out.push(h('details', { class: 'fbimport', id: 'rateOther' }, h('summary', {}, t('rate.otherWays')), h('div', { class: 'actions' }, acts)));
    else if (!sending) out.push(h('div', { class: 'actions' }, acts));
    if (!inbox && !brand.whatsapp && !brand.email) out.push(h('p', { class: 'muted small' }, t('rate.noContact')));
    out.push(h('p', { class: 'muted small' }, t('rate.privacy', { b: brandName() })));
    if (!sent && !sending) out.push(h('div', { class: 'actions' }, h('button', { class: 'small ghost', type: 'button', id: 'btnRateEdit', onclick: () => { st.code = ''; st.send = ''; ls.set(fbKey(ctx.cid, p.sku), JSON.stringify({ score: st.score, comment: st.comment, code: '' })); draw(); } }, t('rate.change'))));
    return out;
  }
  function formPanel() {
    const scale = h('div', { class: 'scale', role: 'radiogroup', 'aria-label': t('rate.title') }, Array.from({ length: 10 }, (_, i) => {
      const n = i + 1;
      return h('button', { type: 'button', role: 'radio', 'aria-checked': String(st.score === n), class: 'sc' + (st.score === n ? ' on' : ''), 'data-n': String(n), onclick: () => { st.score = n; st.err = ''; draw(); } }, nf(n));
    }));
    const ta = h('textarea', { id: 'rateComment', rows: 3, maxlength: 600, dir: 'auto', placeholder: t('rate.commentPh'), 'aria-label': t('rate.comment') });
    ta.value = st.comment; ta.addEventListener('input', () => { st.comment = ta.value; });
    const err = st.err ? h('p', { class: 'msg bad', role: 'alert' }, st.err) : null;
    const go = h('button', { class: 'btn primary', type: 'button', id: 'btnRateGo', onclick: async () => {
      if (!st.score) { st.err = t('rate.needScore'); return draw(); }
      go.disabled = true;
      try {
        st.code = await makeFeedbackCode({ sku: p.sku, score: st.score, comment: st.comment.trim().slice(0, 600) }, ctx.secret, ctx.cid);
        st.send = ''; keep();
      } catch (e) { st.err = e.message; }
      draw(); if (st.code && brand.inbox) deliver();
    } }, icon('star'), t(brand.inbox ? 'rate.submitSend' : 'rate.submit'));
    return [h('div', { class: 'rate-head' }, h('span', { class: 'okdot' }, icon('star')), h('div', {}, h('h2', {}, t('rate.title')), h('p', { class: 'muted small' }, t('rate.sub')))),
      scale, h('div', { class: 'scale-ends muted small' }, h('span', {}, t('rate.low')), h('span', {}, t('rate.high'))),
      h('label', {}, t('rate.comment'), ta), err, go];
  }
  draw();
  return box;
}

// Files the workshop keeps for this client (3D model, drawings, PDFs): downloaded sealed, opened with the key of the project and saved on the device
function downloadsCard(ctx, list) {
  return h('section', { class: 'card stack-sm', id: 'downloadsCard' }, h('h2', {}, t('dl.title')), h('p', { class: 'hint' }, t('dl.hint')),
    h('ul', { class: 'plainlist dl-list' }, list.map((d) => {
      const st = h('span', { class: 'small muted', role: 'status' });
      const btn = h('button', { class: 'btn small primary', type: 'button', 'data-dl': d.id, 'aria-label': t('dl.get') + ': ' + d.name, onclick: async () => {
        btn.disabled = true; st.className = 'small muted'; st.textContent = t('dl.loading', { p: '0%' });
        try { await downloadFile(ctx, d, (a, b) => { st.textContent = t('dl.loading', { p: b ? nf(Math.min(99, Math.round(a * 100 / b))) + '%' : nf(Math.round(a / 1024)) + ' KB' }); }); st.textContent = ''; } catch (_) { st.className = 'small msg bad'; st.textContent = t('dl.failed'); }
        btn.disabled = false;
      } }, t('dl.get'));
      return h('li', { class: 'dl-row', 'data-id': d.id },
        h('div', { class: 'dl-main' }, h('span', { class: 'badge pending', 'data-ext': dlExt(d.name) }, dlExt(d.name).toUpperCase() || '—'), h('strong', { dir: 'auto' }, dlName(d.name)), h('span', { class: 'small muted' }, dlSizeText(num(d.size))),
          d.caption ? h('div', { class: 'small muted', dir: 'auto', style: 'flex-basis:100%' }, d.caption) : null),
        h('div', { class: 'dl-ctl' }, btn, st));
    })));
}
function projectNodes(p, ctx) {
  const prog = progress(p), photos = (p.photos || []).slice().reverse(), parts = p.parts || [];
  const nodes = [
    h('section', { class: 'card stack-sm' },
      h('div', { class: 'proj-top' },
        h('div', { class: 'titleblock' }, h('h2', { dir: 'auto' }, p.title || p.sku),
          h('div', { class: 'chips' }, h('span', { class: 'chip mono' }, p.sku), L(p.typeName) ? h('span', { class: 'chip' }, L(p.typeName)) : null, statusBadge(projState(p)))),
        ring(prog)),
      p.description ? h('p', { class: 'desc', dir: 'auto' }, p.description) : null,
      h('div', { class: 'rowsep' }, h('span', { class: 'small muted' }, t('cl.progress')), h('strong', {}, pct(prog))), barFill(prog)),
    tapeCard(p), moneyCard(p),
  ];
  if ((p.stages || []).length) nodes.push(h('section', { class: 'stack-sm' }, h('h2', {}, t('cl.stages')), h('div', { class: 'stages' }, p.stages.map(stageCard))));
  if (parts.length) {
    const done = parts.filter((x) => x.status === 'completed').length;
    nodes.push(h('section', { class: 'card stack-sm', id: 'partsCard' }, h('div', { class: 'card-head' }, h('h2', {}, t('cl.parts')), h('span', { class: 'small muted' }, t('ed.partsSummary', { a: nf(done), b: nf(parts.length) }))),
      h('div', { class: 'parts' }, parts.map((x) => h('div', { class: 'part' },
        h('span', { class: 'nm', dir: 'auto' }, x.name, x.qty > 1 ? h('span', { class: 'muted' }, ' × ' + nf(x.qty)) : null), statusBadge(x.status),
        h('span', { class: 'when' }, x.status === 'completed' ? null : timeBadge(x.dueDate, false)))))));
  }
  if (photos.length) {
    nodes.push(h('section', { class: 'card stack-sm', id: 'photosCard' }, h('h2', {}, t('cl.photos')),
      h('div', { class: 'photos' }, photos.map((ph, i) => h('div', { class: 'ph' },
        h('button', { class: 'imgbtn', type: 'button', 'aria-label': t('ph.view'), onclick: () => openLightbox(ctx, photos, i) }, photoImg(ctx, ph, 't')),
        h('div', { class: 'cap', dir: 'auto' }, ph.caption || '', ph.date ? h('small', {}, fmtDay(ph.date)) : null))))));
  }
  if ((p.downloads || []).length) nodes.push(downloadsCard(ctx, p.downloads));
  const rate = ratingCard(p, ctx); if (rate) nodes.push(rate);
  return nodes;
}
