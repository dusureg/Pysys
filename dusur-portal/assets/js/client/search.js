/**
 * assets/js/client/search.js  -  home page: live search
 * Type a Client ID or a project number; the SKU goes through data/public/index.json (hashed), then the key form appears.
 * Loaded by: client page
 */
'use strict';

/* ---- home: live search ---- */
const QID = /^[A-Z0-9]{1,6}-CL-\d{3,8}$/, QSKU = /^[A-Z0-9]{1,6}-[A-Z0-9]{2,5}-\d{4}-\d{3,6}$/;
function parseQuery(q) {
  let s = String(q || '').trim();
  const m = s.match(/#client\/([A-Za-z0-9_-]+)/); if (m) s = m[1];
  s = s.toUpperCase().replace(/\s+/g, '');
  return QID.test(s) ? { kind: 'id', v: s } : QSKU.test(s) ? { kind: 'sku', v: s } : { kind: s.length >= 4 ? 'bad' : 'none', v: s };
}
async function liveFind(q, draw) {
  const where = pagesRepo(), seq = (home.seq = (home.seq || 0) + 1), p = parseQuery(q);
  Object.assign(home, { id: '', sku: '', cipher: null, err: false, fails: 0, busy: false });
  if (!q.trim()) { home.st = 'idle'; return draw(); }
  if (p.kind === 'none') { home.st = 'typing'; return draw(); }
  if (p.kind === 'bad') { home.st = 'format'; return draw(); }
  if (!where) { home.st = 'error'; return draw(); }
  home.st = 'searching'; draw();
  try {
    let id = p.v;
    if (p.kind === 'sku') { const idx = await loadIndex(where); id = idx[await skuKey(p.v)] || ''; home.sku = p.v; }
    if (seq !== home.seq) return;
    if (!id) { home.st = 'none'; return draw(); }
    const cipher = await fetchPayload(where, id);
    if (seq !== home.seq) return;
    Object.assign(home, { st: 'found', id, cipher }); draw();
  } catch (e) {
    if (seq !== home.seq) return;
    home.st = e.status === 404 ? 'none' : 'error'; home.msg = e.message; draw();
  }
}

function contactButtons(cls) {
  const b = brand, out = [];
  if (b.whatsapp) out.push(h('a', { class: 'btn ' + (cls || ''), href: waLink(b.whatsapp), target: '_blank', rel: 'noopener noreferrer' }, icon('chat'), t('cl.whatsapp')));
  if (b.phone) out.push(h('a', { class: 'btn ' + (cls || ''), href: telLink(b.phone) }, icon('phone'), t('cl.call')));
  if (b.email) out.push(h('a', { class: 'btn ' + (cls || ''), href: mailLink(b.email, brandName(), '') }, icon('mail'), t('cl.email')));
  return out;
}

function homeResult(draw) {
  const st = home.st;
  if (st === 'idle' || st === 'typing') return h('p', { class: 'muted small center' }, t('home.hint'));
  if (st === 'format') return h('p', { class: 'muted small center' }, t('home.format'));
  if (st === 'searching') return h('div', { class: 'result center' }, h('div', { class: 'spin', role: 'progressbar', 'aria-label': t('home.searching') }), h('span', { class: 'muted' }, t('home.searching')));
  if (st === 'none') return h('div', { class: 'result bad-soft' }, h('strong', {}, t('home.none')), h('p', { class: 'muted small' }, t('home.noneText', { q: home.q.trim() })), contactButtons('small').length ? h('div', { class: 'actions' }, contactButtons('small')) : null);
  if (st === 'error') return h('div', { class: 'result bad-soft' }, h('strong', {}, t('home.error')), home.msg ? h('p', { class: 'muted small' }, home.msg) : null,
    h('div', { class: 'actions' }, h('button', { class: 'btn small', type: 'button', onclick: () => liveFind(home.q, draw) }, t('act.retry'))));
  // found
  const open = async (key) => {
    const rec = await decryptRecord(home.cipher, key, home.id);
    if (!rec) return false;
    pending = { id: home.id, cipher: home.cipher, rec, secret: normSecret(key) };
    location.hash = '#client/' + home.id; return true;
  };
  return h('div', { class: 'result found' },
    h('div', { class: 'found-head' }, h('span', { class: 'okdot' }, icon('check')), h('div', {}, h('strong', {}, t('home.found')), h('div', { class: 'muted small' }, home.sku ? t('home.foundSku', { sku: home.sku, id: home.id }) : t('home.foundId', { id: home.id })))),
    keyForm(home, open, draw));
}

function renderHome(token) {
  const q = h('input', { id: 'clQ', type: 'search', class: 'bigsearch', placeholder: t('home.ph'), 'aria-label': t('home.label'), autocomplete: 'off', spellcheck: 'false', autocapitalize: 'characters', dir: 'ltr', value: home.q });
  const out = h('div', { class: 'live-out', 'aria-live': 'polite' });
  const draw = () => { if (token === routeToken) out.replaceChildren(homeResult(draw)); };
  let timer = 0;
  q.addEventListener('input', () => { home.q = q.value; clearTimeout(timer); home.st = q.value.trim() ? 'typing' : 'idle'; draw(); timer = setTimeout(() => liveFind(q.value, draw), 320); });
  const steps = [['search', 'home.s1', 'home.s1d'], ['key', 'home.s2', 'home.s2d'], ['refresh', 'home.s3', 'home.s3d']];
  const slot = h('div', { class: 'contact-slot' });
  const fillContact = () => {
    const contacts = contactButtons();
    slot.replaceChildren(...(contacts.length ? [h('section', { class: 'card contact' }, h('div', {}, h('strong', {}, t('cl.help')), h('div', { class: 'muted small' }, brand.address || brandName())), h('div', { class: 'actions' }, contacts))] : []));
  };
  fillContact();
  onBrand = () => { if (token !== routeToken) return; fillContact(); if (home.st === 'none') draw(); };
  mount(h('div', { class: 'stack home' },
    h('section', { class: 'card homehero' },
      h('p', { class: 'eyebrow' }, t('home.eyebrow')),
      h('h1', {}, t('home.title')),
      h('p', { class: 'muted lead' }, t('home.sub')),
      h('div', { class: 'searchbox' }, h('span', { class: 'si' }, icon('search')), q),
      out),
    h('section', { class: 'stack-sm' }, h('h2', {}, t('home.how')),
      h('div', { class: 'steps' }, steps.map((s, i) => h('div', { class: 'step-card' }, h('span', { class: 'sn' }, nf(i + 1)), h('strong', {}, t(s[1])), h('span', { class: 'muted small' }, t(s[2])))))),
    slot,
    h('p', { class: 'muted small center secure-note' }, icon('shield'), t('home.secure'))));
  if (home.st !== 'idle') { out.replaceChildren(homeResult(draw)); if (home.st === 'typing' && home.q.trim()) liveFind(home.q, draw); }
  else draw();
  q.focus({ preventScroll: true });
}
