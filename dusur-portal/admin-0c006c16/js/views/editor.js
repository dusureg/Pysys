/**
 * <admin>/js/views/editor.js  -  client / project editor shell
 * Tabs, title block, live badges, the open-record state `ed`.
 * Loaded by: admin page
 */
'use strict';

/* =====================================================================
   Client / project editor
   ===================================================================== */
const TABS = ['details', 'stages', 'parts', 'payments', 'bom', 'costs', 'photos'];
const MONEY_TABS = ['payments', 'costs'];                      // payments and costs are only for people who may see Finance
const visibleTabs = () => TABS.filter((k) => canMoney() || !MONEY_TABS.includes(k));
const curProj = () => ed.rec.projects[ed.pi];
const pName = (p) => L(p.typeName) || p.type || '';
const hasFilePhotos = (rec) => rec.projects.some((p) => (p.photos || []).some((x) => x.kind === 'file' || x.kind === 'video') || (p.downloads || []).length);
const photoCtx = () => ({ cid: ed.rec.id, secret: ed.rec.secret, where: loadCfg() });

function touch() { if (opsEd) return opsTouch(); if (!ed) return; ed.dirty = true; syncSaveBar(); refreshLive(); }
function syncSaveBar() {
  if (!ed || !ed.bar) return;
  ed.bar.state.textContent = ed.saving ? t('act.saving') : ed.dirty ? t('ed.unsaved') : ed.savedAt ? t('ed.savedAt', { t: fmtDateTime(ed.savedAt) }) : t('ed.noChanges');
  ed.bar.btn.disabled = !!ed.saving || !(ed.dirty || ed.isNew);
}
function refreshLive() { (ed.live || []).forEach((l) => l.box.replaceChildren(...[].concat(l.build()).filter(Boolean))); }
function live(build, cls) { const box = h('div', { class: cls || 'stack-sm' }); ed.live.push({ box, build }); box.replaceChildren(...[].concat(build()).filter(Boolean)); return box; }

function nextClientId() {
  const s = session.settings;
  const used = store.items.map((x) => parseInt((x.rec.id.match(/-(\d+)$/) || [])[1], 10) || 0);
  s.cseq = Math.max(num(s.cseq), 1000, ...used) + 1;
  return s.prefix + '-CL-' + s.cseq;
}
function blankClient() {
  const now = new Date().toISOString();
  return { schema: PRIV, id: nextClientId(), secret: generateSecret(), client: { name: '', phone: '', phone2: '', whatsapp: '', email: '', address: '', notes: '' }, createdAt: now, updatedAt: now, projects: [] };
}
const newEd = (rec, sha, isNew) => ({ id: rec.id, rec, sha, isNew, base: isNew ? null : clone(rec), dirty: false, tab: 'details', pi: 0, edit: false, origSecret: rec.secret, live: [], trash: [], savedAt: null, saving: false, seqBump: isNew });

async function ensureStore(token) {
  if (store) return true;
  mount(notice(t('dash.loading'), t('dash.loadingSub'), 'info', { spinner: true }));
  try { await loadStore(); } catch (e) {
    if (token === routeToken) mount(notice(t('err.load'), e.message, 'bad', { actions: [h('button', { class: 'btn', type: 'button', onclick: () => route() }, t('act.retry'))] }));
    return false;
  }
  return token === routeToken;
}
async function openEditor(id, token) {
  if (ed && ed.id === id) return renderEditor();
  if (!(await ensureStore(token))) return;
  CUR = store.settings.currency || CUR;
  const it = store.items.find((x) => x.rec.id === id);
  if (!it) return mount(notice(t('ed.notFound'), t('ed.notFoundSub', { id }), 'bad', { actions: [h('a', { class: 'btn', href: '#dashboard' }, t('nav.dashboard'))] }));
  ed = newEd(clone(it.rec), it.sha, false);
  renderEditor();
}
async function openNew(token) {
  if (ed && ed.isNew) return renderEditor();
  if (!(await ensureStore(token))) return;
  CUR = store.settings.currency || CUR;
  ed = newEd(blankClient(), null, true); ed.dirty = true;
  renderEditor();
}

function renderEditor() {
  const rec = ed.rec; ed.live = []; ed.redraw = renderEditor; ed.hash = ed.isNew ? '#new' : '#manage/' + ed.id;
  mount(h('section', { class: 'stack' },
    h('div', { class: 'page-head' },
      h('div', {}, h('a', { class: 'back', href: '#dashboard' }, t('act.back')), h('h1', { dir: 'auto' }, rec.client.name || t('ed.newClient'))),
      h('div', { class: 'actions' }, h('span', { class: 'badge enc' }, icon('lock'), t('badge.enc')),
        ed.isNew || !rec.projects.length ? null : h('a', { class: 'btn small', id: 'btnToProgress', href: '#progress/' + ed.id + '/' + ed.pi }, t('pg.update')),
        ed.isNew || !rec.projects.length ? null : h('a', { class: 'btn small', id: 'btnToContract', href: '#contract/' + ed.id + '/' + ed.pi }, t('ct.open')),
        ed.isNew || !rec.projects.length ? null : h('a', { class: 'btn small', id: 'btnToLabels', href: '#labels/' + ed.id + '/' + ed.pi }, t('lbl.open')),
        ed.isNew || !can('audit') ? null : h('a', { class: 'btn small', id: 'btnRecHistory', href: '#audit/' + encodeURIComponent(ed.id), title: t('aud.historyOf') }, t('nav.audit')),
        ed.isNew ? null : h('button', { class: 'btn danger small', type: 'button', id: 'btnDelClient', 'data-edit': 'clients', onclick: deleteClientAction }, t('ed.delClient')))),
    roWrap(readOnly('clients'), clientCard(), projectsCard()), readOnly('clients') ? null : saveBar()));
  syncSaveBar();
}

function clientCard() {
  const r = ed.rec, c = r.client, link = shareLink(r.id);
  const secret = h('input', { id: 'edSecret', type: 'password', autocomplete: 'off', spellcheck: 'false', dir: 'ltr', maxlength: 60 });
  bindInput(secret, r, 'secret');
  const show = h('button', { class: 'small', type: 'button', id: 'btnShowKey' }, t('act.show'));
  show.onclick = () => { secret.type = secret.type === 'password' ? 'text' : 'password'; show.textContent = secret.type === 'password' ? t('act.show') : t('act.hide'); };
  const gen = h('button', { class: 'small', type: 'button', id: 'btnGenKey', onclick: () => { r.secret = generateSecret(); secret.value = r.secret; secret.type = 'text'; show.textContent = t('act.hide'); touch(); } }, t('act.generate'));
  return h('section', { class: 'card stack-sm' },
    h('div', { class: 'card-head' }, h('h2', {}, t('ed.client')), h('span', { class: 'badge enc mono' }, r.id)),
    h('div', { class: 'grid2' }, fld('ed.name', tin(c, 'name', { id: 'edName', max: 120, req: true })), fld('ed.phone', tin(c, 'phone', { id: 'edPhone', type: 'tel', dir: 'ltr', max: 40 }))),
    waField(c, 'edWhatsapp', 'edWaPreview', 'phone', 'edPhone', 'ed.whatsapp'),
    h('div', { class: 'grid2' }, fld('ed.phone2', tin(c, 'phone2', { id: 'edPhone2', type: 'tel', dir: 'ltr', max: 40 })), fld('ed.email', tin(c, 'email', { id: 'edEmail', type: 'email', dir: 'ltr', max: 120 }))),
    fld('ed.address', tin(c, 'address', { id: 'edAddress', max: 240 })),
    fld('ed.notes', tarea(c, 'notes', { id: 'edNotes', rows: 2 }), 'ed.notesHint'),
    h('div', { class: 'sep' }),
    fld('ed.secret', h('div', { class: 'input-row' }, secret, show, gen, copyBtn(() => r.secret)), 'ed.secretHint'),
    !ed.isNew && hasFilePhotos(r) ? h('p', { class: 'hint' }, t('ed.keyPhotos')) : null,
    h('div', { class: 'stack-sm' }, h('strong', { class: 'small' }, t('ed.link')), h('code', { class: 'link' }, link),
      h('div', { class: 'actions' }, copyBtn(() => link, 'small'), ed.isNew ? h('span', { class: 'hint' }, t('ed.linkAfterSave')) : h('a', { class: 'btn small', href: link, target: '_blank', rel: 'noopener noreferrer' }, t('act.open')))));
}

function projectsCard() {
  ed.pillBox = h('div', { class: 'stack-sm' }); ed.bodyBox = h('div', { class: 'stack-sm' });
  drawProjects();
  return h('section', { class: 'card stack-sm' }, h('div', { class: 'card-head' }, h('h2', {}, t('ed.projects'))), ed.pillBox, ed.bodyBox);
}
function addProjectRow() {
  const types = session.settings.types;
  const tsel = h('select', { id: 'newProjType', 'aria-label': t('ed.projType') }, types.map((x) => h('option', { value: x.code }, L(x.name) + ' (' + x.code + ')')));
  const ttl = h('input', { id: 'newProjTitle', maxlength: 120, dir: 'auto', placeholder: t('ed.projTitlePh'), 'aria-label': t('ed.projTitle') });
  const add = h('button', {
    class: 'btn', type: 'button', id: 'btnAddProject',
    onclick: () => {
      const type = types.find((x) => x.code === tsel.value); if (!type) return;
      const p = newProject(type); p.title = ttl.value.trim();
      ed.rec.projects.push(p); ed.seqBump = true; ed.pi = ed.rec.projects.length - 1; ed.tab = 'details'; touch(); drawProjects();
    },
  }, t('ed.addProject'));
  return h('div', { class: 'addrow' }, tsel, ttl, add);
}
function drawProjects() {
  const r = ed.rec;
  if (ed.pi >= r.projects.length) ed.pi = Math.max(0, r.projects.length - 1);
  ed.pillBox.replaceChildren(...[
    r.projects.length ? h('div', { class: 'tabs', role: 'tablist', 'aria-label': t('ed.projects') }, r.projects.map((p, i) => h('button', { class: 'tab pill', type: 'button', role: 'tab', 'aria-selected': String(i === ed.pi), onclick: () => { ed.pi = i; drawProjects(); } }, h('span', { class: 'mono' }, p.sku)))) : null,
    addProjectRow()].filter(Boolean));
  drawBody();
}
function drawBody() {
  ed.live = [];
  if (!ed.rec.projects.length) { ed.bodyBox.replaceChildren(h('p', { class: 'empty' }, t('ed.noProjects'))); return; }
  const p = curProj();
  if (!visibleTabs().includes(ed.tab)) ed.tab = 'details';
  const tabs = h('div', { class: 'tabs', role: 'tablist' }, visibleTabs().map((k) => h('button', { class: 'tab', type: 'button', role: 'tab', id: 'tab-' + k, 'aria-selected': String(ed.tab === k), onclick: () => { ed.tab = k; drawBody(); } }, t('ed.tab.' + k))));
  const builders = { details: tabDetails, stages: tabStages, parts: tabParts, payments: tabPayments, bom: tabBom, costs: tabCosts, photos: tabPhotos };
  ed.bodyBox.replaceChildren(
    h('div', { class: 'titleblock' }, h('h3', { dir: 'auto' }, p.title || p.sku),
      h('div', { class: 'chips' }, h('span', { class: 'chip mono' }, p.sku), h('span', { class: 'chip' }, pName(p)), live(() => [statusBadge(projState(p)), timeBadge(p.dueDate, projState(p) === 'completed')], 'chips-inline'))),
    tabs, builders[ed.tab](p));
}
