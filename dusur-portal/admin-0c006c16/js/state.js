/**
 * <admin>/js/state.js  -  admin constants and shared state
 * Private-record schema tag, minimum secret lengths, the localStorage key of the sealed connection config, the GitHub API origin,
 * cost categories, and every piece of shared mutable state of the admin site.
 * Loaded by: admin page
 */
'use strict';

const PRIV = 'dscl-priv/2';                            // schema tag of the private record (data/private/<id>.json)
const MIN_SECRET = 10, MIN_ADMIN_PW = 10;               // shortest client secret / admin password accepted
const LS_CFG = 'dsp.config.v1';                         // localStorage: the connection config, sealed under the admin password
const GH = 'https://api.github.com';
const LS_TEAM = 'dsp.team.v1';                          // localStorage: where a team member signs in (owner + repository + last user name). Nothing secret.
const TEAM_FILE = 'data/private/team.json', KEYS_DIR = 'data/private/keys/', AUDIT_DIR = 'data/private/audit/', PROFILE_DIR = 'data/private/profiles/';
const COST_CATS = ['materials', 'hardware', 'labor', 'outsourced', 'delivery', 'installation', 'other'];

// Shared mutable state (declared once here so lock() can reset all of it)
let session = null;      // { key, pat, pw, master, settings, user, cfg }: exists only while unlocked, never stored. user = who is signed in (see perm.js)
let idleTimer = null, masterP = null;
let ed = null;           // the open client/project editor
let store = null;        // dashboard cache (all records)
let draftTypes = null;   // project-type editor draft
let ops = {};            // suppliers, inventory and logistics, read on demand: { <name>: { data, sha } } (see ops-data.js)
let opsEd = null;        // the open supplier / material / shipment form
let team = null;         // the team list and the roles, read on demand: { data, sha } (see team-data.js)
let lockNote = '';       // why the last session ended (paused, blocked, keys changed): shown once on the sign-in screen
let profiles = {};      // id -> { phone, pic }, read on demand (see profile.js)
let opsAlerts = null;    // counts shown in the menu badge and on the dashboard: { stock, late, blocked } (null until the data has been read)
