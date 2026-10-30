/**
 * <admin>/js/views/shell.js  -  the frame around every screen: side menu, who is signed in, the menu drawer on phones
 * The menu is built from the rights of the signed-in role: a link a person may not use is not drawn at all.
 * Loaded by: admin page
 */
'use strict';

/* =====================================================================
   Shell: side menu, user chip, drawer
   ===================================================================== */
const NAV = [
  { head: 'nav.g.work', items: [['dashboard', 'nav.dashboard', 'home'], ['progress', 'nav.progress', 'progress'], ['contracting', 'nav.contracting', 'doc']] },
  { head: 'nav.g.ops', items: [['logistics', 'nav.logistics', 'truck'], ['suppliers', 'nav.suppliers', 'factory'], ['inventory', 'nav.inventory', 'box']] },
  { head: 'nav.g.money', items: [['finance', 'nav.finance', 'coins'], ['collections', 'nav.collections', 'calendar'], ['reports', 'nav.reports', 'chart']] },
  { head: 'nav.g.admin', items: [['audit', 'nav.audit', 'history'], ['team', 'nav.team', 'users'], ['settings', 'nav.settings', 'sliders'], ['config', 'nav.config', 'key'], ['doctor', 'nav.doctor', 'pulse']] },
];
const initials = (name) => (String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => Array.from(w)[0] || '').join('') || '?').toUpperCase();

function navOpen(open) {
  const shell = $('.shell'); if (!shell) return;
  shell.classList.toggle('navopen', !!open);
  const b = $('#btnMenu'); if (b) b.setAttribute('aria-expanded', String(!!open));
  const sc = $('#navScrim'); if (sc) sc.hidden = !open;
  if (open) { const a = $('#navLinks a'); if (a) a.focus(); } else if (document.activeElement && document.activeElement.closest && document.activeElement.closest('#adminNav') && matchMedia('(max-width:899px)').matches && b) b.focus();
}
function setNav(visible) {
  const nav = $('#adminNav'), shell = $('.shell'), b = $('#btnMenu'); if (!nav || !shell) return;
  nav.hidden = !visible; shell.classList.toggle('hasnav', !!visible); if (b) b.hidden = !visible;
  if (!visible) navOpen(false);
}
function paintUser() {
  const box = $('#navUser'), u = session && session.user; if (!box) return;
  if (!u) { box.replaceChildren(); return; }
  const name = u.owner ? ownerLabel() : u.name || u.username, role = u.owner ? t('team.owner') : roleLabel(teamRole(u.role));
  const pr = profiles[u.id];
  box.replaceChildren(avatarNode(name, pr && pr.pic),
    h('a', { class: 'navwho', href: '#account', id: 'navWho', title: t('nav.account') }, h('strong', { dir: 'auto' }, name), h('span', { class: 'small muted' }, role)));
  const lockBtn = $('#btnLock'); if (lockBtn) lockBtn.textContent = u.owner ? t('nav.lock') : t('nav.signout');
}
// draw the menu for the signed-in role; view = the screen that is open
const NAV_OF = { manage: 'dashboard', new: 'dashboard', contract: 'progress', expenses: 'finance' };      // sub-screens light up the menu entry they belong to
function paintNav(view) {
  const box = $('#navLinks'); if (!box || !session || !session.user) return;
  view = NAV_OF[view] || view;
  box.replaceChildren(...NAV.map((g) => {
    const items = g.items.filter(([r]) => navAllowed(r)); if (!items.length) return null;
    return h('div', { class: 'navgroup', role: 'group', 'aria-label': t(g.head) }, h('span', { class: 'navhead' }, t(g.head)),
      items.map(([r, k, ic]) => h('a', { href: '#' + r, 'data-route': r, 'aria-current': r === view ? 'page' : null, onclick: () => navOpen(false) }, icon(ic), h('span', {}, t(k)))));
  }));
  paintUser(); paintOpsBadge(); paintAuditPill(); applyRoleUi(); navOpen(false);
  if (!session.profTried) { session.profTried = true; ensureMyProfile(); }
}
function initShell() {
  const b = $('#btnMenu'), sc = $('#navScrim'); if (!b) return;
  b.replaceChildren(icon('menu'), h('span', {}, t('nav.menu')));
  b.onclick = () => navOpen(!$('.shell').classList.contains('navopen'));
  if (sc) sc.onclick = () => navOpen(false);
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('.shell').classList.contains('navopen')) navOpen(false); });
}
