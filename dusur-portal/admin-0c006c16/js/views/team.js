/**
 * <admin>/js/views/team.js  -  Team screen (administrator only)
 * Add members, give each one a role, pause / resume / block, reset a password, edit what each role may do, update everyone's access and change the encryption key.
 * Loaded by: admin page
 */
'use strict';

/* =====================================================================
   Team
   ===================================================================== */
let teamDraft = null;                 // the roles as they are being edited (saved with "Save roles")
let teamForm = null;                  // the add-member form: { name, username, role, password, created }
let teamBusy = false;

const memberLink = () => { const c = loadCfg(); return location.origin + location.pathname + '#join/' + c.user + '/' + c.repo; };
const stBadge = (s) => h('span', { class: 'badge ' + (s === 'active' ? 'done' : s === 'paused' ? 'progress' : 'late'), 'data-status': s }, t('team.st.' + s));
const rolesDirty = () => JSON.stringify(teamDraft.map(normRole)) !== JSON.stringify(team.data.roles.map(normRole));
const redrawTeam = () => { const y = window.scrollY; drawTeam(); window.scrollTo(0, y); };
// run one action with the buttons locked, then draw the screen again
async function teamRun(fn, okKey) {
  if (teamBusy) return; teamBusy = true;
  const hadDraft = team && rolesDirty();
  try { await fn(); if (okKey) toast(t(okKey), 'ok'); } catch (e) { toast(e.message, 'bad'); } finally { teamBusy = false; }
  if (!team) { try { await loadTeam(true); } catch (_) { /* shown when the screen is opened again */ } }
  if (team && !hadDraft) teamDraft = clone(team.data.roles);
  if (team) redrawTeam();
}

async function renderTeam(token) {
  mount(notice(t('team.loading'), t('team.loadingSub'), 'info', { spinner: true }));
  try { await loadTeam(true); } catch (e) {
    if (token === routeToken) mount(notice(t('err.load'), e.message, 'bad', { actions: [h('button', { class: 'btn', type: 'button', onclick: () => route() }, t('act.retry'))] }));
    return;
  }
  try { await loadAllProfiles(); } catch (_) { /* pictures and phone numbers are optional */ }
  if (token !== routeToken) return;
  teamDraft = clone(team.data.roles);
  if (!teamForm) teamForm = { name: '', username: '', role: team.data.roles[0].id, password: genPassword(), created: null, open: false };
  drawTeam();
}

function memberRow(u) {
  const roleSel = selectEl(team.data.roles.map((r) => [r.id, roleLabel(r)]), u.role, (v) => teamRun(() => setMemberRole(u.id, v), 'team.saved'), 'role-' + u.id, t('team.role') + ': ' + u.name);
  roleSel.disabled = u.status === 'blocked';
  const act = (id, key, fn, cls) => h('button', { class: 'btn small' + (cls ? ' ' + cls : ''), type: 'button', id: id + '-' + u.id, onclick: fn }, t(key));
  const acts = [];
  if (u.status === 'active') acts.push(act('btnPause', 'team.pause', () => teamRun(() => setMemberStatus(u.id, 'paused'), 'team.saved')));
  if (u.status === 'paused') acts.push(act('btnResume', 'team.resume', () => teamRun(() => setMemberStatus(u.id, 'active'), 'team.saved')));
  if (u.status !== 'blocked') acts.push(act('btnBlock', 'team.block', () => { if (confirm(t('team.blockConfirm', { n: u.name }))) teamRun(() => setMemberStatus(u.id, 'blocked'), 'team.saved'); }, 'danger'));
  acts.push(act('btnReset', u.status === 'blocked' ? 'team.unblock' : 'team.reset', () => {
    const pw = genPassword();
    if (!confirm(t(u.status === 'blocked' ? 'team.unblockConfirm' : 'team.resetConfirm', { n: u.name }))) return;
    teamRun(async () => { await resetMemberPassword(u.id, pw); teamForm.created = { name: u.name, username: u.username, password: pw, link: memberLink(), reset: true }; }, 'team.saved');
  }));
  if (u.status === 'blocked') acts.push(act('btnRemove', 'team.remove', () => { if (confirm(t('team.removeConfirm', { n: u.name }))) teamRun(() => removeMember(u.id), 'team.saved'); }, 'danger'));
  return h('tr', { 'data-id': u.id, 'data-user': u.username },
    h('td', {}, h('div', { class: 'who' }, avatarNode(u.name, profiles[u.id] && profiles[u.id].pic, 'sm'),
      h('div', {}, h('strong', { dir: 'auto' }, u.name), h('div', { class: 'small muted mono' }, '@' + u.username), profiles[u.id] && profiles[u.id].phone ? h('div', { class: 'small muted', dir: 'ltr', 'data-phone': '1' }, profiles[u.id].phone) : null))),
    h('td', {}, roleSel), h('td', {}, stBadge(u.status)), h('td', { class: 'small muted' }, u.created ? fmtDay(u.created.slice(0, 10)) : '—'),
    h('td', {}, h('div', { class: 'actions' }, acts)));
}

function credentialsCard() {
  const c = teamForm.created; if (!c) return null;
  const text = t('team.cred.text', { name: c.name, link: c.link, user: c.username, pw: c.password });
  return h('div', { class: 'card stack-sm credcard', id: 'credCard', role: 'status' },
    h('div', { class: 'card-head' }, h('h2', {}, t(c.reset ? 'team.cred.titleReset' : 'team.cred.title', { n: c.name }))),
    h('p', { class: 'hint' }, t('team.cred.hint')),
    h('div', { class: 'meta' }, h('div', {}, h('dt', {}, t('lock.userPh')), h('dd', { class: 'mono', id: 'credUser' }, c.username)), h('div', {}, h('dt', {}, t('team.cred.pw')), h('dd', { class: 'mono', id: 'credPw' }, c.password))),
    h('code', { class: 'link', id: 'credLink' }, c.link),
    h('div', { class: 'actions' }, copyBtn(() => text, 'small'), h('button', { class: 'btn small', type: 'button', id: 'btnCredDone', onclick: () => { teamForm.created = null; redrawTeam(); } }, t('act.done'))));
}

function addMemberCard() {
  const f = teamForm;
  if (!f.open) return null;
  const nm = h('input', { id: 'tmName', maxlength: 80, dir: 'auto', value: f.name, autocomplete: 'off', oninput: (e) => { f.name = e.target.value; } });
  const un = h('input', { id: 'tmNewUser', maxlength: 30, dir: 'ltr', value: f.username, autocapitalize: 'off', spellcheck: 'false', autocomplete: 'off', oninput: (e) => { f.username = e.target.value; } });
  const pw = h('input', { id: 'tmNewPw', dir: 'ltr', value: f.password, spellcheck: 'false', autocomplete: 'off', oninput: (e) => { f.password = e.target.value; } });
  const rl = selectEl(team.data.roles.map((r) => [r.id, roleLabel(r)]), f.role, (v) => { f.role = v; }, 'tmNewRole');
  const go = h('button', { class: 'btn primary', type: 'button', id: 'btnMemberCreate', onclick: () => {
    f.name = nm.value; f.username = un.value; f.password = pw.value;
    teamRun(async () => {
      await addMember(f);
      teamForm = { name: '', username: '', role: f.role, password: genPassword(), open: false, created: { name: f.name, username: normUsername(f.username), password: f.password, link: memberLink() } };
    }, 'team.saved');
  } }, t('team.create'));
  return h('section', { class: 'card stack-sm', id: 'addMemberCard' }, h('div', { class: 'card-head' }, h('h2', {}, t('team.add'))),
    h('div', { class: 'grid2' }, fld('team.fullName', nm), fld('team.username', un, 'team.usernameHint')),
    h('div', { class: 'grid2' }, fld('team.role', rl, 'team.roleHint'),
      fld('team.initialPw', h('div', { class: 'input-row' }, pw, h('button', { class: 'small', type: 'button', id: 'btnGenPw', onclick: () => { f.password = genPassword(); pw.value = f.password; } }, t('act.generate'))), 'team.initialPwHint')),
    h('div', { class: 'actions' }, go, h('button', { class: 'btn', type: 'button', onclick: () => { f.open = false; redrawTeam(); } }, t('act.cancel'))));
}

// the administrator's own user name + password: signing in on any device without typing the GitHub token
function ownerLoginCard() {
  const ol = team.data.ownerLogin;
  const un = h('input', { id: 'ownUser', maxlength: 30, dir: 'ltr', value: ol ? ol.username : '', autocapitalize: 'off', spellcheck: 'false', autocomplete: 'off', 'aria-label': t('own.user') });
  const pw = h('input', { id: 'ownPw', type: 'password', autocomplete: 'new-password', 'aria-label': t('own.pw'), minlength: OWNER_MIN_PW });
  const link = memberLink();
  return h('section', { class: 'card stack-sm', id: 'ownerLoginCard' },
    h('div', { class: 'card-head' }, h('h2', {}, t('own.title')), h('span', { class: 'badge ' + (ol ? 'done' : 'progress'), id: 'ownState' }, ol ? t('own.on') : t('own.off'))),
    h('p', { class: 'hint' }, t('own.hint')),
    h('div', { class: 'grid2' }, fld('own.user', un), fld('own.pw', pw)),
    h('p', { class: 'hint' }, t('own.val.pw', { n: OWNER_MIN_PW })),
    h('div', { class: 'actions' },
      h('button', { class: 'btn primary', type: 'button', id: 'btnOwnerSave', onclick: () => teamRun(async () => { await setOwnerLogin(un.value, pw.value); pw.value = ''; }, 'own.saved') }, t(ol ? 'own.change' : 'own.save')),
      ol ? h('button', { class: 'btn danger', type: 'button', id: 'btnOwnerRemove', onclick: () => { if (confirm(t('own.removeConfirm'))) teamRun(removeOwnerLogin, 'own.removed'); } }, t('own.remove')) : null),
    ol ? h('div', { class: 'stack-sm' }, h('p', { class: 'hint' }, t('own.linkHint')), h('code', { class: 'link', id: 'ownLink' }, link), h('div', { class: 'actions' }, copyBtn(() => link, 'small'))) : null,
    h('p', { class: 'hint' }, t('own.limit')));
}

function rolesCard() {
  const dirty = rolesDirty(), used = new Set(team.data.users.map((u) => u.role));
  const cell = (r, a) => selectEl([[0, t('team.lvl.0')], [1, t('team.lvl.1')], [2, t('team.lvl.2')]].map(([v, l]) => [String(v), l]), String(r.perms[a]), (v) => { r.perms[a] = Number(v); redrawTeam(); }, 'perm-' + r.id + '-' + a, roleLabel(r) + ' · ' + t('team.area.' + a));
  const rows = teamDraft.map((r) => h('tr', { 'data-role': r.id },
    h('th', { scope: 'row' }, BUILTIN_ROLES.includes(r.id) ? h('span', {}, roleLabel(r)) : h('input', { id: 'rname-' + r.id, value: r.name, maxlength: 40, dir: 'auto', 'aria-label': t('team.roleName'), onchange: (e) => { r.name = e.target.value.trim() || r.name; redrawTeam(); } }),
      !BUILTIN_ROLES.includes(r.id) ? h('button', { class: 'x', type: 'button', id: 'btnDelRole-' + r.id, disabled: used.has(r.id), title: used.has(r.id) ? t('team.roleInUse') : t('act.remove'), 'aria-label': t('act.remove') + ' ' + roleLabel(r),
        onclick: () => { teamDraft = teamDraft.filter((x) => x.id !== r.id); redrawTeam(); } }, '✕') : null),
    PERM_AREAS.map((a) => h('td', {}, cell(r, a)))));
  const nameIn = h('input', { id: 'newRoleName', maxlength: 40, dir: 'auto', placeholder: t('team.newRolePh'), 'aria-label': t('team.newRolePh') });
  return h('section', { class: 'card stack-sm', id: 'rolesCard' }, h('div', { class: 'card-head' }, h('h2', {}, t('team.rolesTitle'))), h('p', { class: 'hint' }, t('team.rolesHint')),
    h('div', { class: 'tablewrap' }, h('table', { class: 'tbl permtbl' }, h('thead', {}, h('tr', {}, h('th', {}, t('team.role')), PERM_AREAS.map((a) => h('th', {}, t('team.area.' + a))))), h('tbody', {}, rows))),
    h('div', { class: 'addrow rolesadd' }, nameIn, h('button', { class: 'btn', type: 'button', id: 'btnAddRole', onclick: () => {
      const n = nameIn.value.trim(); if (!n) return toast(t('team.val.roleName'), 'bad');
      teamDraft.push({ id: 'r-' + hex(rand(3)), name: n, perms: mkPerms({}) }); redrawTeam();
    } }, t('team.addRole'))),
    h('div', { class: 'actions' }, h('button', { class: 'btn primary', type: 'button', id: 'btnSaveRoles', disabled: !dirty || teamBusy, onclick: () => teamRun(() => saveRoles(teamDraft), 'team.saved') }, t('team.saveRoles')),
      h('button', { class: 'btn', type: 'button', id: 'btnDiscardRoles', disabled: !dirty, onclick: () => { teamDraft = clone(team.data.roles); redrawTeam(); } }, t('team.discard')),
      dirty ? h('span', { class: 'hint' }, t('ed.unsaved')) : null));
}

function securityCard() {
  const msg = h('p', { class: 'msg', id: 'rotMsg', role: 'status', hidden: true });
  const pw = h('input', { id: 'rotPw', type: 'password', autocomplete: 'current-password', 'aria-label': t('team.rot.pw'), placeholder: t('team.rot.pw') });
  const go = h('button', { class: 'btn danger', type: 'button', id: 'btnRotate', onclick: async () => {
    if (!pw.value) return toast(t('team.rot.needPw'), 'bad');
    if (!confirm(t('team.rot.confirm'))) return;
    go.disabled = true; msg.hidden = false; msg.className = 'msg';
    try {
      const n = await rotateKeys(pw.value, (s) => { msg.textContent = s; });
      msg.className = 'msg ok'; msg.textContent = t('team.rot.done', { n: nf(n) }); pw.value = '';
    } catch (e) { msg.className = 'msg bad'; msg.textContent = e.message; } finally { go.disabled = false; }
  } }, t('team.rot.go'));
  const reissue = h('button', { class: 'btn', type: 'button', id: 'btnReissue', onclick: () => teamRun(async () => { const r = await reissueAccess(); toast(t('team.reissued', { n: nf(r.done) }) + (r.failed ? ' · ' + t('team.reissueFailed', { n: nf(r.failed) }) : ''), r.failed ? 'bad' : 'ok'); }) }, t('team.reissue'));
  return h('section', { class: 'card stack-sm', id: 'securityCard' }, h('div', { class: 'card-head' }, h('h2', {}, t('team.secTitle'))),
    h('ul', { class: 'plain hint' }, ['team.sec.pause', 'team.sec.block', 'team.sec.limit'].map((k) => h('li', {}, t(k)))),
    h('div', { class: 'stack-sm' }, h('strong', {}, t('team.reissueTitle')), h('p', { class: 'hint' }, t('team.reissueHint')), h('div', { class: 'actions' }, reissue)),
    h('div', { class: 'sep' }),
    h('div', { class: 'stack-sm' }, h('strong', {}, t('team.rot.title')), h('p', { class: 'hint' }, t('team.rot.hint')), pw, h('div', { class: 'actions' }, go), msg));
}

function drawTeam() {
  const c = loadCfg(), users = team.data.users.slice().sort((a, b) => String(a.name).localeCompare(String(b.name), locale()));
  const nameIn = h('input', { id: 'ownerName', maxlength: 80, dir: 'auto', value: team.data.ownerName, placeholder: t('team.owner') });
  const link = memberLink();
  mount(h('section', { class: 'stack', id: 'teamScreen' },
    h('div', { class: 'page-head' }, h('h1', {}, t('nav.team')), h('div', { class: 'actions' }, encBadge(), h('button', { class: 'btn primary', type: 'button', id: 'btnAddMember', onclick: () => { teamForm.open = true; redrawTeam(); setTimeout(() => { const i = $('#tmName'); if (i) i.focus(); }, 0); } }, t('team.add')))),
    h('p', { class: 'hint' }, t('team.hint')),
    credentialsCard(), addMemberCard(),
    h('section', { class: 'card stack-sm', id: 'membersCard' }, h('div', { class: 'card-head' }, h('h2', {}, t('team.members', { n: nf(users.length) }))),
      users.length ? h('div', { class: 'tablewrap' }, h('table', { class: 'tbl memtbl' }, h('thead', {}, h('tr', {}, ['team.col.name', 'team.role', 'team.col.status', 'team.col.added', 'team.col.actions'].map((k) => h('th', {}, t(k))))), h('tbody', {}, users.map(memberRow)))) : h('p', { class: 'empty' }, t('team.empty'))),
    h('section', { class: 'card stack-sm' }, h('div', { class: 'card-head' }, h('h2', {}, t('team.signinTitle'))), h('p', { class: 'hint' }, t('team.signinHint', { repo: c.user + '/' + c.repo })), h('code', { class: 'link', id: 'joinLink' }, link), h('div', { class: 'actions' }, copyBtn(() => link, 'small')),
      h('div', { class: 'sep' }), fld('team.ownerName', h('div', { class: 'input-row' }, nameIn, h('button', { class: 'small', type: 'button', id: 'btnOwnerName', onclick: () => teamRun(() => setOwnerName(nameIn.value), 'team.saved') }, t('act.save'))), 'team.ownerNameHint')),
    ownerLoginCard(), rolesCard(), securityCard()));
}

/* ---------------- everybody's own page: profile (phone, picture) and, with a login file, the password ---------------- */
async function renderAccount() {
  const u = session.user, owner = u.owner, tok = routeToken;
  if (!profiles[u.id]) { mount(notice(t('act.loading'), '', 'info', { spinner: true })); try { await loadProfile(u.id); } catch (_) { profiles[u.id] = normProfile(null); } }
  if (tok !== routeToken) return;
  const pr = profiles[u.id] || normProfile(null), draft = { pic: pr.pic }, minPw = owner ? OWNER_MIN_PW : MIN_MEMBER_PW;
  const old = h('input', { id: 'acOld', type: 'password', autocomplete: 'current-password', 'aria-label': t('acct.old') });
  const n1 = h('input', { id: 'acNew', type: 'password', autocomplete: 'new-password', minlength: minPw, 'aria-label': t('acct.new') });
  const n2 = h('input', { id: 'acNew2', type: 'password', autocomplete: 'new-password', minlength: minPw, 'aria-label': t('acct.new2') });
  const m = msgBox(), pm = msgBox();
  const form = u.keyFile ? h('form', { class: 'card stack-sm', id: 'pwForm', novalidate: true, onsubmit: async (e) => {
    e.preventDefault();
    if (n1.value.length < minPw) return setMsg(m, 'bad', t(owner ? 'own.val.pw' : 'team.val.pw', { n: minPw }));
    if (n1.value !== n2.value) return setMsg(m, 'bad', t('cfg.pwMismatch'));
    try { await changeMemberPassword(old.value, n1.value); old.value = n1.value = n2.value = ''; toast(t('acct.changed'), 'ok'); if (location.hash === '#account') route(); } catch (ex) { setMsg(m, 'bad', ex.message); }
  } }, h('div', { class: 'card-head' }, h('h2', {}, t('acct.pwTitle'))), session.must ? h('p', { class: 'msg warn', role: 'alert' }, t('acct.mustChange')) : null,
  fld('acct.old', old), h('div', { class: 'grid2' }, fld('acct.new', n1), fld('acct.new2', n2)), h('p', { class: 'hint' }, t(owner ? 'own.val.pw' : 'team.val.pw', { n: minPw })), h('div', { class: 'actions' }, h('button', { class: 'btn primary', type: 'submit', id: 'btnPwChange' }, t('acct.change'))), m) : null;
  const perms = PERM_AREAS.filter((a) => owner || u.perms[a] > 0);
  // ---- profile: name (the administrator's own name can be changed here), phone, picture
  const shown = owner ? ownerLabel() : u.name || u.username;
  const nameIn = h('input', { id: 'profName', maxlength: 80, dir: 'auto', value: owner && team && team.data.ownerName ? team.data.ownerName : owner ? '' : shown, placeholder: owner ? t('team.owner') : '', readonly: !owner, 'aria-label': t('prof.name') });
  const phone = h('input', { id: 'profPhone', type: 'tel', dir: 'ltr', maxlength: 30, inputmode: 'tel', autocomplete: 'tel', value: pr.phone, placeholder: '+20 10 0000 0000', 'aria-label': t('prof.phone') });
  const pic = h('div', { id: 'profPic' }), file = h('input', { type: 'file', accept: 'image/*', hidden: true, id: 'profFile', 'aria-label': t('prof.pic') });
  const drawPic = () => pic.replaceChildren(avatarNode(shown, draft.pic, 'lg'));
  drawPic();
  file.addEventListener('change', async () => {
    const f = file.files && file.files[0]; file.value = ''; if (!f) return;
    try { draft.pic = await profilePicFromFile(f); drawPic(); setMsg(pm, '', ''); } catch (e) { setMsg(pm, 'bad', e.message); }
  });
  const saveBtn = h('button', { class: 'btn primary', type: 'button', id: 'btnProfSave', onclick: async () => {
    const digits = phone.value.replace(/\D/g, '');
    if (digits && digits.length < 7) return setMsg(pm, 'bad', t('prof.val.phone'));
    saveBtn.disabled = true;
    try {
      await saveMyProfile({ phone: phone.value, pic: draft.pic });
      if (owner && nameIn.value.trim() !== ((team && team.data.ownerName) || '')) await setOwnerName(nameIn.value);
      setMsg(pm, 'ok', t('prof.saved')); paintUser();
    } catch (e) { setMsg(pm, 'bad', e.message); } finally { saveBtn.disabled = false; }
  } }, t('prof.save'));
  const profile = h('section', { class: 'card stack-sm', id: 'profileCard' }, h('div', { class: 'card-head' }, h('h2', {}, t('prof.title'))),
    h('div', { class: 'profrow' }, pic, h('div', { class: 'stack-sm' },
      h('div', { class: 'actions' }, h('button', { class: 'btn small', type: 'button', id: 'btnProfPic', onclick: () => file.click() }, t('prof.picPick')),
        h('button', { class: 'btn small ghost', type: 'button', id: 'btnProfPicRemove', onclick: () => { draft.pic = ''; drawPic(); } }, t('prof.picRemove')), file),
      h('p', { class: 'hint' }, t('prof.picHint')))),
    h('div', { class: 'grid2' }, fld('prof.name', nameIn, owner ? null : 'prof.nameFixed'), fld('prof.phone', phone)),
    h('div', { class: 'actions' }, saveBtn), pm);
  mount(h('section', { class: 'stack', id: 'accountScreen' }, h('div', { class: 'page-head' }, h('h1', {}, t('acct.title'))),
    profile,
    h('div', { class: 'card stack-sm' }, h('div', { class: 'meta' },
      h('div', {}, h('dt', {}, t('team.col.name')), h('dd', { dir: 'auto' }, shown)),
      h('div', {}, h('dt', {}, t('team.role')), h('dd', {}, owner ? t('team.owner') : roleLabel(teamRole(u.role)))),
      h('div', {}, h('dt', {}, t('lock.userPh')), h('dd', { class: 'mono' }, u.keyFile ? u.username : '—'))),
    h('strong', { class: 'small' }, t('acct.access')),
    h('div', { class: 'chips', id: 'acctPerms' }, perms.map((a) => h('span', { class: 'chip' }, t('team.area.' + a) + ' · ' + t('team.lvl.' + (owner ? 2 : u.perms[a]))))),
    h('p', { class: 'hint' }, t(owner ? 'own.acctHint' : 'acct.accessHint')), owner && !u.keyFile ? h('a', { class: 'btn small', href: '#team', id: 'lnkOwnLogin' }, t('own.setUp')) : null),
    form));
}
