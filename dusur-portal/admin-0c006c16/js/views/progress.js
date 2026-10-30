/**
 * <admin>/js/views/progress.js  -  Progress & photos
 * A focused screen for the workshop day: pick a project, tick the tasks that were finished, set piece statuses, add photos (camera or gallery),
 * then save & publish. It edits the same open record `ed` as the full editor, so the two screens can never disagree.
 * Loaded by: admin page
 */
'use strict';

/* =====================================================================
   Progress & photos:  #progress (all projects)  and  #progress/<client id>/<project number> (one project)
   ===================================================================== */
let pgSel = { q: '', f: 'active' };                       // list filter, kept while the page is open
const PG_FILTERS = ['active', 'late', 'done', 'all'];

// the first stage that still has an open task (or is not marked completed when it has no tasks)
const stageNow = (p) => (p.stages || []).find((s) => ((s.checklist || []).length ? s.checklist.some((i) => !i.done) : s.status !== 'completed'));
// WhatsApp wants the number in international form without + or 00. A local Egyptian number (01xxxxxxxxx) gets 20 in front.
function waPhone(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2); else if (d.startsWith('0')) d = '20' + d.slice(1);
  return d.length >= 8 && d.length <= 15 ? d : '';
}
const waUpdateText = (rec, p) => t('pg.waMsg', { name: rec.client.name, project: p.title || pName(p) || p.sku, sku: p.sku, pct: pct(progress(p)), link: shareLink(rec.id) });

async function renderProgress(token, keep, id, pi) {
  if (!(await ensureStore(token))) return;
  CUR = store.settings.currency || CUR;
  if (id) return openProgress(id, pi);
  if (ed && !ed.dirty) ed = null;
  drawProgressList();
}

/* ---------------- list ---------------- */
function drawProgressList() {
  const rows = [];
  for (const it of store.items) it.rec.projects.forEach((p, i) => rows.push({ rec: it.rec, p, i }));
  const rank = ({ p }) => { const n = daysUntil(p.dueDate); return projState(p) === 'completed' ? 3 : n === null ? 2 : n < 0 ? 0 : 1; };
  rows.sort((a, b) => rank(a) - rank(b) || (a.p.dueDate || '9999').localeCompare(b.p.dueDate || '9999'));
  const shown = (r) => {
    const st = projState(r.p), n = daysUntil(r.p.dueDate);
    if (pgSel.f === 'active' && st === 'completed') return false;
    if (pgSel.f === 'done' && st !== 'completed') return false;
    if (pgSel.f === 'late' && !(st !== 'completed' && n !== null && n < 0)) return false;
    const q = pgSel.q.trim().toLowerCase();
    return !q || [r.rec.id, r.rec.client.name, r.p.sku, r.p.title || ''].join(' ').toLowerCase().includes(q);
  };
  const list = h('div', { class: 'list', id: 'pgList' });
  const draw = () => { const f = rows.filter(shown); list.replaceChildren(...(f.length ? f.map(pgItem) : [h('p', { class: 'empty' }, rows.length ? t('pg.noMatch') : t('pg.empty'))])); };
  const search = h('input', { id: 'pgSearch', type: 'search', placeholder: t('pg.search'), 'aria-label': t('pg.search'), value: pgSel.q, dir: 'auto', enterkeyhint: 'search' });
  search.addEventListener('input', () => { pgSel.q = search.value; draw(); });
  const filter = selectEl(PG_FILTERS.map((k) => [k, t('pg.f.' + k)]), pgSel.f, (v) => { pgSel.f = v; draw(); }, 'pgFilter');
  filter.setAttribute('aria-label', t('pg.filter'));
  draw();
  mount(h('section', { class: 'stack' },
    h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, t('pg.title')), h('p', { class: 'muted' }, t('pg.intro'))), encBadge()),
    h('div', { class: 'card stack-sm' }, h('div', { class: 'pg-filters' }, search, filter), list)));
}
function pgItem({ rec, p, i }) {
  const st = projState(p), pr = progress(p), now = stageNow(p), done = st === 'completed';
  return h('div', { class: 'item pg-item' },
    h('div', { class: 'item-top' }, h('strong', { dir: 'auto' }, rec.client.name), h('span', { class: 'mono muted small' }, rec.id), statusBadge(st)),
    h('div', { class: 'pg-row' }, h('span', { class: 'chip mono' }, p.sku), h('span', { class: 'chip' }, pName(p)), p.title ? h('span', { dir: 'auto' }, p.title) : null),
    h('div', { class: 'pg-bar' }, barFill(pr, done ? 'ok' : ''), h('strong', {}, pct(pr))),
    h('div', { class: 'pg-row small muted' }, done ? t('pg.allDone') : now ? t('pg.now', { s: L(now.name) }) : null, timeBadge(p.dueDate, done), p.dueDate ? t('pg.due', { d: fmtDay(p.dueDate) }) : null, t('pg.photosN', { n: nf((p.photos || []).length) })),
    h('div', { class: 'actions' }, h('a', { class: 'btn primary', href: '#progress/' + rec.id + '/' + i }, t('pg.update'))));
}

/* ---------------- one project ---------------- */
function openProgress(id, pi) {
  if (!(ed && ed.id === id && !ed.isNew)) {
    const it = store.items.find((x) => x.rec.id === id);
    if (!it) return mount(notice(t('ed.notFound'), t('ed.notFoundSub', { id }), 'bad', { actions: [h('a', { class: 'btn', href: '#progress' }, t('nav.progress'))] }));
    ed = newEd(clone(it.rec), it.sha, false);
  }
  if (pi !== undefined && pi !== null) ed.pi = Math.max(0, Math.min(Number(pi) || 0, ed.rec.projects.length - 1));
  renderProgressScreen();
}

// project switcher: shown only when the client has more than one project (also used by the contract screen)
function projPills(redraw) {
  const r = ed.rec; if (r.projects.length < 2) return null;
  return h('div', { class: 'tabs', role: 'tablist', 'aria-label': t('ed.projects') }, r.projects.map((x, i) => h('button', { class: 'tab pill', type: 'button', role: 'tab', 'aria-selected': String(i === ed.pi), onclick: () => { ed.pi = i; redraw(); } }, h('span', { class: 'mono' }, x.sku))));
}

function pgParts(p) {
  if (!p.parts.length) return h('p', { class: 'hint' }, t('pg.noParts'));
  return h('div', { class: 'stack-sm' }, p.parts.map((x) => {
    if (!x.status) x.status = 'pending';
    const chip = h('span'); const upd = () => chip.replaceChildren(timeBadge(x.dueDate, x.status === 'completed')); upd();
    return h('div', { class: 'pg-part' }, h('div', { class: 'nm', dir: 'auto' }, x.name, num(x.qty) > 1 ? ' × ' + nf(num(x.qty)) : ''),
      selectEl(statusOptions(), x.status, (v) => { x.status = v; touch(); upd(); }, undefined, t('rp.col.status') + ': ' + x.name), chip);
  }));
}

function renderProgressScreen() {
  const r = ed.rec; ed.live = []; ed.redraw = renderProgressScreen;
  ed.hash = '#progress/' + r.id + '/' + ed.pi;
  if (location.hash !== ed.hash) history.replaceState(null, '', ed.hash);
  const p = r.projects[ed.pi];
  const head = h('div', { class: 'page-head' },
    h('div', {}, h('a', { class: 'back', href: '#progress' }, t('act.back')), h('h1', { dir: 'auto' }, r.client.name), p ? h('p', { class: 'small muted mono', id: 'pgSkuRef', dir: 'ltr' }, skuRef(r, p)) : null),
    h('div', { class: 'actions' }, encBadge(), h('a', { class: 'btn small', id: 'btnFullEditor', href: '#manage/' + r.id }, t('pg.fullEditor'))));
  if (!p) return mount(h('section', { class: 'stack' }, head, h('p', { class: 'empty' }, t('pg.noProjects'))));

  const top = h('section', { class: 'card stack-sm pg-big' },
    h('div', { class: 'titleblock' }, h('h2', { dir: 'auto' }, p.title || p.sku),
      h('div', { class: 'chips' }, h('span', { class: 'chip mono' }, p.sku), h('span', { class: 'chip' }, pName(p)), live(() => [statusBadge(projState(p)), timeBadge(p.dueDate, projState(p) === 'completed')], 'chips-inline'))),
    live(() => h('div', { class: 'pg-bar' }, barFill(progress(p), projState(p) === 'completed' ? 'ok' : ''), h('strong', { id: 'pgPct' }, pct(progress(p))))));
  const stages = h('section', { class: 'card stack-sm' }, h('div', { class: 'card-head' }, h('h2', {}, t('pg.stages'))), h('p', { class: 'hint' }, t('pg.stagesHint')),
    p.stages.length ? stageEditor(p.stages, { tpl: false, state: true, structure: false, tickAll: true }) : h('p', { class: 'empty' }, t('pg.noStages')));
  const parts = p.parts.length ? h('section', { class: 'card stack-sm' }, h('div', { class: 'card-head' }, h('h2', {}, t('pg.parts'))), pgParts(p)) : null;
  const photos = h('section', { class: 'card stack-sm' }, h('div', { class: 'card-head' }, h('h2', {}, t('pg.photos'))), tabPhotos(p));

  // tell the client: opens WhatsApp with a ready message that holds the private LINK only (never the secret key)
  const phone = waTarget(r.client.phone, r.client.whatsapp) || waPhone(r.client.phone);
  const tell = live(() => {
    const ready = !ed.dirty && !!phone;
    const btn = ready
      ? h('a', { class: 'btn', id: 'btnWaUpdate', href: waSendTo(r.client.phone, r.client.whatsapp, waUpdateText(r, p)) || waLink(phone, waUpdateText(r, p)), target: '_blank', rel: 'noopener noreferrer' }, icon('chat'), t('pg.sendWa'))
      : h('button', { class: 'btn', id: 'btnWaUpdate', type: 'button', disabled: true }, icon('chat'), t('pg.sendWa'));
    return [h('div', { class: 'actions' }, btn), h('p', { class: 'hint' }, !phone ? t('pg.waNoPhone') : ed.dirty ? t('pg.waNeedSave') : t('pg.waNote'))];
  });
  mount(h('section', { class: 'stack pg-screen' }, head, projPills(renderProgressScreen), roWrap(!canProgress(), top, stages, parts, photos, h('section', { class: 'card stack-sm' }, h('h2', {}, t('pg.tell')), tell)), canProgress() ? saveBar() : null));
  syncSaveBar();
}
