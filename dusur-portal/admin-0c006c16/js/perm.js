/**
 * <admin>/js/perm.js  -  roles, permissions and the write guard
 * The areas a role can be given (none / view / edit), the built-in roles, can() for screens and buttons, which screen needs which area,
 * and canWritePath(): the last line of defence that refuses a save to a file the signed-in person's role does not cover.
 * The administrator (the person who knows the admin password) always has everything. Team members get what their role says.
 * Loaded by: admin page
 */
'use strict';

/* =====================================================================
   Roles and permissions
   ===================================================================== */
const PERM_AREAS = ['clients', 'progress', 'finance', 'suppliers', 'inventory', 'logistics', 'reports', 'ratings', 'settings', 'audit'];
const PERM_NONE = 0, PERM_VIEW = 1, PERM_EDIT = 2;
const MEMBER_STATES = ['active', 'paused', 'blocked'];
const mkPerms = (o) => { const p = {}; for (const a of PERM_AREAS) p[a] = Math.max(0, Math.min(2, Math.round(Number(o && o[a]) || 0))); return p; };
// The built-in roles. Their names come from the dictionary (team.role.<id>); the administrator can change what each one may do, or add roles of their own.
const defaultRoles = () => [
  { id: 'manager', name: '', perms: mkPerms({ clients: 2, progress: 2, finance: 2, suppliers: 2, inventory: 2, logistics: 2, reports: 2, ratings: 2, settings: 2, audit: 1 }) },
  { id: 'accountant', name: '', perms: mkPerms({ clients: 1, finance: 2, suppliers: 1, inventory: 1, logistics: 1, reports: 2, ratings: 1 }) },
  { id: 'production', name: '', perms: mkPerms({ clients: 1, progress: 2, suppliers: 1, inventory: 2, logistics: 2, reports: 1 }) },
  { id: 'sales', name: '', perms: mkPerms({ clients: 2, progress: 1, reports: 1, ratings: 2 }) },
  { id: 'viewer', name: '', perms: mkPerms({ clients: 1, progress: 1, suppliers: 1, inventory: 1, logistics: 1, reports: 1, ratings: 1 }) },
];
const BUILTIN_ROLES = ['manager', 'accountant', 'production', 'sales', 'viewer'];
const roleLabel = (r) => (r ? r.name || (BUILTIN_ROLES.includes(r.id) ? t('team.role.' + r.id) : r.id) : '—');

// the person who knows the admin password: everything is allowed
const ownerUser = () => ({ id: 'owner', owner: true, username: '', name: '', role: 'owner', perms: mkPerms({}), status: 'active', keyFile: '' });
const isOwner = () => !!(session && session.user && session.user.owner);
// can('finance') = may see it · can('finance', 2) = may change it. The administrator may do everything.
function can(area, level) {
  const u = session && session.user; if (!u) return false;
  return u.owner ? true : num(u.perms && u.perms[area]) >= (level || PERM_VIEW);
}
const canMoney = () => can('finance');
const canAny = (areas, level) => areas.some((a) => can(a, level));
const readOnly = (area) => !can(area, PERM_EDIT);

// body[data-ro] lists the areas the signed-in person may only look at; the stylesheet hides every control marked data-edit="<area>" for them
function applyRoleUi() {
  const ro = session && session.user && !session.user.owner ? PERM_AREAS.filter((a) => !can(a, PERM_EDIT)) : [];
  if (ro.length) document.body.setAttribute('data-ro', ro.join(' ')); else document.body.removeAttribute('data-ro');
}

// Which area opens which screen (null = every signed-in person; 'owner' = administrator only)
const VIEW_AREA = { dashboard: null, progress: 'progress', contract: 'clients', manage: 'clients', new: 'clients', logistics: 'logistics', suppliers: 'suppliers', inventory: 'inventory',
  finance: 'finance', collections: 'finance', contracting: 'clients', labels: 'clients', expenses: 'finance', reports: 'reports', settings: 'settings', audit: 'audit', team: 'owner', config: 'owner', doctor: null, account: null, import: null };
function viewAllowed(view) {
  const a = VIEW_AREA[view];
  if (a === undefined) return true;
  if (a === null) return !!(session && session.user);
  return a === 'owner' ? isOwner() : can(a, view === 'new' ? PERM_EDIT : PERM_VIEW);
}
// The first screen a person may open (the dashboard is always allowed, this is for the navigation)
const navAllowed = (route) => (route === 'progress' ? canAny(['progress', 'clients']) : viewAllowed(route));

// ---- the write guard: which file a role may change (path inside the repository)
function writeAreas(p) {
  let m;
  if (p.startsWith(AUDIT_DIR)) return 'any';                                     // everybody's actions are written to the history
  if (p.startsWith(PROFILE_DIR)) return 'profile';                              // everybody may change their own profile file, nobody else's
  if (p === TEAM_FILE || p === 'data/private/vault.json' || p.startsWith(KEYS_DIR)) return 'owner';
  if (p === 'data/private/settings.json') return ['settings', 'clients', 'finance'];
  if (p === 'data/public/brand.json') return ['settings'];
  if (p === 'data/public/index.json') return ['clients'];
  if (p.startsWith(ATT_DIR)) return ['inventory', 'logistics', 'finance'];                  // sealed invoices and pictures of products: whoever may edit one of the records that keep them
  if ((m = /^data\/private\/ops\/([a-z]+)\.json$/.exec(p))) return { suppliers: ['suppliers'], inventory: ['inventory', 'logistics'], logistics: ['logistics', 'inventory'], expenses: ['finance'] }[m[1]] || 'owner';
  if (/^data\/private\/[\w-]+\.json$/.test(p) || p.startsWith('data/clients/')) return ['clients', 'progress', 'ratings'];
  return 'owner';
}
function canWritePath(p) {
  const u = session && session.user; if (!u) return false;
  if (u.owner) return true;
  const a = writeAreas(p);
  if (a === 'any') return true;
  if (a === 'profile') return p === PROFILE_DIR + u.id + '.json';
  if (a === 'owner') return !!(u.keyFile && p === KEYS_DIR + u.keyFile + '.json');   // a member may change their own login file (their password) and nothing else of this kind
  return a.some((x) => can(x, PERM_EDIT));
}
