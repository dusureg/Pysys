/**
 * assets/js/client/portal.js  -  the project portal
 * Progress ring, tape-measure countdown, stages, parts, payments, photos, live refresh (60 s polling + Refresh button).
 * Loaded by: client page
 */
'use strict';

/* ---- project link / portal ---- */
// Every screen is a builder, so switching language can redraw it without asking for the key again.
const showC = (build) => { if (!cstate) return; cstate.redraw = () => mount(...[].concat(build())); cstate.redraw(); };

async function renderClient(id, token) {
  const alive = () => token === routeToken && cstate && cstate.id === id;
  if (!ID_RE.test(id)) return showC(() => [notice(t('cl.badLinkTitle'), t('cl.badLinkText'), 'bad', { actions: [homeBtn()] })]);
  const where = pagesRepo();
  if (!where) return showC(() => notice(t('cl.noRepoTitle'), t('cl.noRepoText'), 'bad'));
  if (pending && pending.id === id) { const p = pending; pending = null; return openPortal(p.rec, p.secret, p.cipher, where); }

  showC(() => notice(t('act.loading'), t('cl.loadingText'), 'info', { spinner: true }));
  let cipher;
  try { cipher = await fetchPayload(where, id); } catch (e) {
    if (!alive()) return;
    return showC(() => notice(t('cl.loadFail'), e.message, 'bad', { actions: [h('button', { class: 'btn primary', type: 'button', onclick: () => route() }, t('act.retry')), h('a', { class: 'btn', href: '#' }, t('cl.searchAgain'))] }));
  }
  if (!alive()) return;
  if (brandP) await brandP;
  const st = { fails: 0, err: false, busy: false };
  const submit = async (key) => {
    const rec = await decryptRecord(cipher, key, id);
    if (!alive()) return true;
    if (!rec) return false;
    openPortal(rec, normSecret(key), cipher, where); return true;
  };
  showC(() => h('div', { class: 'stack' }, h('section', { class: 'card gate-client' },
    h('div', { class: 'gate-icon' }, icon('lock')), h('p', { class: 'eyebrow' }, t('cl.passTitle')), h('h1', {}, t('cl.passHead')),
    h('p', { class: 'muted' }, t('cl.passText2')), h('span', { class: 'chip mono' }, id),
    keyForm(st, submit, () => cstate && cstate.redraw && cstate.redraw())),
  h('p', { class: 'center' }, h('a', { href: '#' }, t('cl.searchAgain')))));
}

function openPortal(rec, secret, cipher, where) {
  if (!cstate) return;
  Object.assign(cstate, { pub: upgradePublic(rec), secret, cipher, where, pi: 0, checked: new Date() });
  CUR = cstate.pub.currency || 'EGP';
  const c = cstate;
  c.timer = setInterval(() => { if (document.visibilityState === 'visible') checkUpdate(false); }, 60000);
  c.onVis = () => { if (document.visibilityState === 'visible' && Date.now() - c.checked > 30000) checkUpdate(false); };
  document.addEventListener('visibilitychange', c.onVis);
  c.stop = () => { clearInterval(c.timer); document.removeEventListener('visibilitychange', c.onVis); c.stop = null; };
  showC(clientNodes);
}
async function checkUpdate(manual) {
  const c = cstate; if (!c || !c.pub || c.checking) return;
  if (!manual && document.querySelector('dialog[open], #rateBox textarea:focus')) return;
  c.checking = true;
  try {
    const cipher = await fetchPayload(c.where, c.id);
    if (cstate !== c) return;
    c.checked = new Date();
    if (cipher !== c.cipher) {
      const rec = await decryptRecord(cipher, c.secret, c.id);
      if (cstate !== c) return;
      if (rec) {
        const fresh = upgradePublic(rec), changed = fresh.updatedAt !== c.pub.updatedAt;
        c.cipher = cipher; c.pub = fresh;
        if (changed) toast(t('cl.changed'), 'ok');
        c.redraw(); return;
      }
    }
    const s = $('#liveStamp'); if (s) s.textContent = t('cl.checked', { t: fmtTime(c.checked) });
    if (manual) toast(t('cl.upToDate'), 'ok');
  } catch (e) { if (manual) toast(e.message, 'bad'); } finally { c.checking = false; }
}
const fmtTime = (d) => d.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });

const metaItem = (k, v, cls) => h('div', {}, h('dt', {}, k), h('dd', { class: cls }, v));

function ring(frac) {
  const r = 34, C = 2 * Math.PI * r, f = Math.max(0, Math.min(1, frac || 0));
  const box = h('div', { class: 'ring', role: 'img', 'aria-label': t('cl.progress') + ' ' + pct(f) });
  box.innerHTML = '<svg viewBox="0 0 84 84" width="84" height="84" aria-hidden="true"><circle class="rb" cx="42" cy="42" r="34"/><circle class="rf" cx="42" cy="42" r="34" stroke-dasharray="' + (C * f).toFixed(1) + ' ' + C.toFixed(1) + '" transform="rotate(-90 42 42)"/></svg>';
  box.append(h('span', {}, pct(f)));
  return box;
}

function clientNodes() {
  const c = cstate, pub = c.pub, list = pub.projects || [];
  if (c.pi >= list.length) c.pi = 0;
  const switcher = list.length > 1 ? h('div', { class: 'pcards', role: 'group', 'aria-label': t('cl.projects') }, list.map((p, i) => h('button', {
    class: 'btn pcard', type: 'button', 'aria-pressed': String(i === c.pi), onclick: () => { c.pi = i; c.redraw(); },
  }, h('span', { class: 'mono small' }, p.sku), h('strong', { dir: 'auto' }, p.title || L(p.typeName) || p.sku),
  h('span', { class: 'chips' }, statusBadge(projState(p)), timeBadge(p.dueDate, projState(p) === 'completed'))))) : null;
  const contacts = contactButtons('small');
  return h('div', { class: 'stack' },
    h('section', { class: 'card hero' },
      h('div', { class: 'hero-top' }, h('div', {}, h('p', { class: 'eyebrow' }, t('cl.yourProject')), h('h1', { dir: 'auto' }, t('cl.hello', { name: pub.name }))),
        h('div', { class: 'livebox' }, h('span', { class: 'live' }, h('i', { class: 'dot' }), t('cl.live')), h('span', { class: 'muted small', id: 'liveStamp' }, t('cl.checked', { t: fmtTime(c.checked) })),
          h('button', { class: 'small', type: 'button', id: 'btnLiveRefresh', 'aria-label': t('act.refresh'), onclick: () => checkUpdate(true) }, icon('refresh'), t('act.refresh')))),
      h('dl', { class: 'meta' }, metaItem(t('cl.clientId'), pub.id, 'mono'), metaItem(t('cl.updated'), fmtDateTime(pub.updatedAt)), list.length > 1 ? metaItem(t('cl.projects'), nf(list.length)) : null),
      switcher),
    ...(list.length ? projectNodes(list[c.pi], { cid: pub.id, secret: c.secret, where: c.where }) : [h('p', { class: 'card empty' }, t('cl.noProjects'))]),
    contacts.length || brand.address ? h('section', { class: 'card contact' }, h('div', {}, h('strong', {}, t('cl.help')), h('div', { class: 'muted small' }, brandName()), brand.address ? h('div', { class: 'muted small', id: 'clAddress', dir: 'auto' }, brand.address) : null), h('div', { class: 'actions' }, contacts, h('button', { class: 'btn small', type: 'button', id: 'btnSaveContact', title: t('cl.saveContactHint'), onclick: saveContactFile }, icon('phone'), t('cl.saveContact')))) : null,
    h('div', { class: 'foot' }, h('p', { class: 'muted small' }, t('cl.footnote')),
      h('button', { class: 'btn ghost', type: 'button', id: 'btnClientLock', onclick: () => { cstate && cstate.stop && cstate.stop(); location.hash = '#'; } }, t('cl.lock'))));
}

function tapeCard(p) {
  const done = projState(p) === 'completed', n = daysUntil(p.dueDate), a = parseDay(p.startDate), b = parseDay(p.dueDate);
  const frac = a && b && b > a ? Math.max(0, Math.min(1, (new Date() - a) / (b - a))) : null;
  const cls = done ? 'done' : n !== null && n < 0 ? 'late' : '';
  const x = frac === null ? 0 : Math.round(frac * 1000) / 10;
  return h('section', { class: 'card tape-wrap', id: 'tapeCard' },
    h('div', { class: 'tape-head' },
      h('div', {}, h('div', { class: 'small muted' }, t('cl.timeLeft')), h('div', { class: 'tape-big', id: 'tapeBig' }, done ? t('time.done') : n === null ? t('time.noDate') : timeLeft(n))),
      frac !== null && !done ? h('span', { class: 'small muted' }, t('cl.timeUsed', { p: nf(Math.round(frac * 100)) })) : null),
    frac !== null ? h('div', { class: 'tape ' + cls, role: 'img', 'aria-label': t('cl.timeLeft') },
      h('div', { class: 'tape-used', style: 'width:' + x + '%' }), h('div', { class: 'tape-now', style: 'inset-inline-start:' + x + '%' })) : null,
    h('div', { class: 'tape-ends' }, h('span', {}, t('cl.start') + ': ' + fmtDay(p.startDate)), h('span', {}, t('cl.due') + ': ' + fmtDay(p.dueDate))));
}

// what the client has agreed to pay and when: the next payment first, then the list of instalments
function scheduleBlock(p) {
  const plan = collectionPlan(p), next = collectionNext(plan), dep = plan.find((x) => x.deposit);
  if (!plan.length) return null;
  // the down payment has a box of its own (paid, or still to come); when it is also the next payment, one box says it, so the same money is not shown twice
  return h('div', { class: 'stack-sm', id: 'schedBlock' },
    dep ? h('div', { class: 'nextpay ' + dep.status, id: 'downPay' },
      h('div', {}, h('div', { class: 'small muted' }, dep.status === 'paid' ? t('cl.downPay') : t('cl.downPayNext')), h('strong', { class: 'amt' }, money(dep.status === 'paid' ? dep.amount : dep.outstanding)), h('span', { class: 'muted small' }, ' · ' + fmtDay(dep.due))), collectionBadge(dep)) : null,
    next && !next.deposit ? h('div', { class: 'nextpay ' + next.status, id: 'nextPay' },
      h('div', {}, h('div', { class: 'small muted' }, t('cl.nextPay')), h('strong', { class: 'amt' }, money(next.outstanding)), h('span', { class: 'muted small' }, ' · ' + fmtDay(next.due))), collectionBadge(next)) : null,
    h('strong', {}, t('cl.schedule')),
    h('div', { id: 'schedList' }, plan.map((x) => h('div', { class: 'pay', 'data-status': x.status, 'data-deposit': x.deposit ? '1' : null },
      h('div', { class: 'who' }, h('strong', {}, fmtDay(x.due)), x.deposit ? h('span', { class: 'chip' }, t('cl.downPay')) : null, x.note ? h('span', { class: 'muted small', dir: 'auto' }, x.note) : null),
      h('span', { class: 'amt' }, money(x.amount)), collectionBadge(x)))));
}
function moneyCard(p) {
  const f = finance(p), pays = (p.payments || []).slice().sort((x, y) => String(x.date).localeCompare(String(y.date)));
  if (!f.price && !pays.length && !(p.schedule || []).length) return null;
  return h('section', { class: 'card stack-sm', id: 'moneyCard' },
    h('h2', {}, t('cl.money')),
    kpis(kpi(t('fin.price'), money(f.price)), kpi(t('fin.paid'), money(f.paid), 'pos', pct(f.collected)), kpi(t('fin.remaining'), money(f.remaining), f.remaining > 0 ? 'warn' : 'pos')),
    barFill(f.collected, 'ok'),
    scheduleBlock(p),
    pays.length ? h('div', {}, pays.map((x) => h('div', { class: 'pay' },
      h('div', { class: 'who' }, h('strong', {}, fmtDay(x.date)), x.note ? h('span', { class: 'muted small', dir: 'auto' }, x.note) : null),
      h('span', { class: 'amt' }, money(x.amount))))) : h('p', { class: 'muted small' }, t('cl.noPayments')));
}

function stageCard(st, idx) {
  const items = st.checklist || [], n = items.filter((i) => i.done).length, info = statusInfo(st.status);
  return h('article', { class: 'stage ' + info[2] },
    h('header', {}, h('span', { class: 'step' }, st.status === 'completed' ? icon('check') : String(idx + 1)), h('h3', { dir: 'auto' }, L(st.name)), h('span', { class: 'badge ' + info[2] }, t(info[1]))),
    h('p', { class: 'muted small' }, t('cl.tasksDone', { a: nf(n), b: nf(items.length) })),
    h('ul', { class: 'checks' }, items.map((i) => h('li', { class: i.done ? 'done' : '' }, icon(i.done ? 'check' : 'circle'), h('span', { dir: 'auto' }, L(i.text)),
      h('span', { class: 'sr' }, i.done ? ' (' + t('ed.done') + ')' : '')))));
}
