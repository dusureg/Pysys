/**
 * <admin>/js/router.js  -  admin routing
 * Hash routes: #dashboard, #progress[/<id>/<n>], #logistics | #suppliers | #inventory [/<id> | /new], #finance, #collections, #contracting, #labels/<id>/<n>, #reports[/<type>[/<id>]], #audit[/<ref>], #team, #account, #doctor,
 * #settings, #config, #new, #manage/<id>, #contract/<id>/<n>, #signin, #join/<owner>/<repo>. Guards unsaved changes and the rights of the signed-in role.
 * Loaded by: admin page
 */
'use strict';

/* =====================================================================
   Routing (admin site)
   ===================================================================== */
// The editor, the progress screen and the contract screen all work on the same open record `ed`: moving between them keeps unsaved changes.
const editorHash = () => (ed ? (ed.isNew ? '#new' : ed.hash || '#manage/' + ed.id) : '');
const inEditor = (hash) => !!ed && (ed.isNew ? hash === '#new' : ['#manage/', '#progress/', '#contract/'].some((x) => hash === x + ed.id || hash.startsWith(x + ed.id + '/')));

const opsView = (hash) => { const m = /^#(logistics|suppliers|inventory)(?:\/([\w-]+))?$/.exec(hash) || /^#(expenses)\/([\w-]+)$/.exec(hash); return m ? { view: m[1], sub: m[2] || '' } : null; };

async function route(opts = {}) {
  const token = ++routeToken, hash = location.hash;
  if (ed && ed.dirty && !opts.keep && !inEditor(hash)) {
    if (!confirm(t('ed.discardConfirm'))) { location.replace(editorHash()); return; }
    ed = null;
  }
  if (ed && !ed.dirty && !inEditor(hash)) ed = null;
  if (opsEd && hash !== opsEd.hash) {                      // leaving a supplier / material / shipment form
    if (opsEd.dirty && !opts.keep && !confirm(t('ed.discardConfirm'))) { location.replace(opsEd.hash); return; }
    opsEd = null;
  }
  syncTools(); applyStatic(); paintOpsBadge();
  document.title = brandName() + ' — ' + t('app.adminTag');
  const cfg = loadCfg();
  if (hash === '#doctor') { setNav(!!session); if (session) paintNav('doctor'); return renderDoctor(token); }     // the check that explains a failed start works without signing in
  if (!cfg) { // first run: nothing to protect yet, go straight to setup (a team member's device has no setup: they sign in)
    setNav(false);
    if (hash === '#signin' || /^#join\//.test(hash) || ls.get(LS_TEAM)) return renderLocked();                         // a device that already signed a member in opens the sign-in page
    if (hash !== '#config') { location.replace('#config'); return; }
    return renderConfig();
  }
  if (!session) { setNav(false); return renderLocked(); }

  setNav(true); armIdle();
  const ov = opsView(hash);
  const m = hash.match(/^#manage\/([\w-]+)$/), mp = hash.match(/^#progress\/([\w-]+)(?:\/(\d+))?$/), mc = hash.match(/^#contract\/([\w-]+)(?:\/(\d+))?$/), ml = hash.match(/^#labels\/([\w-]+)(?:\/(\d+))?$/);
  const view = hash === '#config' ? 'config' : hash === '#settings' ? 'settings' : hash === '#team' ? 'team' : hash === '#account' ? 'account' : /^#import(\/|$)/.test(hash) ? 'import' : /^#finance$/.test(hash) ? 'finance' : hash === '#collections' ? 'collections' : hash === '#contracting' ? 'contracting' : /^#labels\//.test(hash) ? 'labels' : /^#audit(\/|$)/.test(hash) ? 'audit'
    : /^#reports(\/|$)/.test(hash) ? 'reports' : /^#progress(\/|$)/.test(hash) ? 'progress' : /^#contract\//.test(hash) ? 'contract' : ov ? ov.view : hash === '#new' ? 'new' : m ? 'manage' : 'dashboard';
  paintNav(view);
  if (session.must && view !== 'account') { location.replace('#account'); return; }                          // a new member chooses their own password first
  if (!viewAllowed(view)) return mount(notice(t('perm.denied'), t('perm.deniedSub'), 'bad', { actions: [h('a', { class: 'btn', href: '#dashboard' }, t('nav.dashboard'))] }));
  if (view === 'config') return renderConfig();
  if (view === 'team') return renderTeam(token);
  if (view === 'account') return renderAccount();
  if (view === 'import') return renderImport(token, hash.split('/')[1] || '');
  if (view === 'finance') return renderFinance(token);
  if (view === 'collections') return renderCollections(token);
  if (view === 'contracting') return renderContracting(token);
  if (view === 'labels') return ml ? renderLabels(token, ml[1], ml[2]) : (location.hash = '#dashboard');
  if (view === 'audit') return renderAudit(token, (() => { try { return decodeURIComponent(hash.split('/')[1] || ''); } catch (_) { return ''; } })());
  if (view === 'settings') return renderSettings(token, !!opts.keep);
  if (view === 'reports') return renderReports(token, !!opts.keep, hash.split('/').slice(1));
  if (ov && view === 'suppliers') return renderSuppliers(token, ov.sub);
  if (ov && view === 'inventory') return renderInventory(token, ov.sub);
  if (ov && view === 'logistics') return renderLogistics(token, ov.sub);
  if (ov && view === 'expenses') return renderExpense(token, ov.sub);
  if (view === 'progress') return renderProgress(token, !!opts.keep, mp && mp[1], mp && mp[2]);
  if (view === 'contract') return mc ? renderContract(token, mc[1], mc[2]) : (location.hash = '#dashboard');
  if (hash === '#new') return openNew(token);
  if (m) return openEditor(m[1], token);
  return renderDashboard(token, !!opts.keep);
}
