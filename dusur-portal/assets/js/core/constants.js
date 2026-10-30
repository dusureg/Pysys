/**
 * assets/js/core/constants.js  -  values every page needs
 * Snapshot schema tag, key-stretching cost, localStorage keys, project status table and the route counter.
 * Nothing here is secret and nothing is specific to one repository.
 * Loaded by: both pages
 */
'use strict';

const SCHEMA = 'dscl/2';                                // schema tag inside every client snapshot (data/clients/<id>.json once decrypted)
const PBKDF2_ITERS = 310000;                            // PBKDF2-SHA256 rounds used to stretch secrets (client secret key, admin password)
const LS_LANG = 'dsp.lang', LS_THEME = 'dsp.theme';     // localStorage keys for the language and theme choice
const ID_RE = /^[A-Za-z0-9_-]{3,40}$/;                  // what a client id may look like inside a URL
const STATUS = [['pending', 'st.pending', 'pending'], ['in_progress', 'st.progress', 'progress'], ['completed', 'st.done', 'done']];
const statusInfo = (s) => STATUS.find((x) => x[0] === s) || STATUS[0];

// Bumped by every route() call. Async screens remember their own value and stop drawing when it is no longer current.
let routeToken = 0;
