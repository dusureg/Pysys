/**
 * <admin>/js/views/feedback.js  -  client ratings
 * Imports the encrypted rating codes clients send back (pasted by hand, or pulled from the company inbox the client site posts to), shows them on the dashboard and in the editor.
 * Loaded by: admin page
 */
'use strict';

/* =====================================================================
   Client ratings: import the encrypted codes clients send back, show them
   ===================================================================== */
const FB_FIND = /DSFB1\.[A-Za-z0-9_-]{3,40}\.[A-Za-z0-9_-]+/g;

function allRatings() {
  const out = [];
  for (const it of store.items) for (const p of it.rec.projects) if (p.feedback && num(p.feedback.score) > 0) out.push({ rec: it.rec, p, fb: p.feedback });
  return out.sort((a, b) => String(b.fb.at).localeCompare(String(a.fb.at)));
}
const avgScore = (list) => (list.length ? sum(list, (x) => x.fb.score) / list.length : null);
const scoreBar = (n) => h('div', { class: 'scorebar', role: 'img', 'aria-label': t('fb.outOf', { n: nf(n) }) }, Array.from({ length: 10 }, (_, i) => h('i', { class: i < n ? 'on' : '' })));

// Returns { out: [{kind, text}], changed }. Every code is verified with the secret key of the client it names.
async function importFeedback(text) {
  const codes = [...new Set(String(text || '').match(FB_FIND) || [])];
  const out = [], touched = new Map();
  if (!codes.length) return { out: [{ kind: 'bad', text: t('fb.none') }], changed: 0 };
  for (const code of codes) {
    const id = code.split('.')[1];
    const it = store.items.find((x) => x.rec.id === id);
    if (!it) { out.push({ kind: 'bad', text: t('fb.unknownClient', { id }) }); continue; }
    const o = await readFeedbackCode(code, it.rec.secret);
    if (!o) { out.push({ kind: 'bad', text: t('fb.unreadable', { id }) }); continue; }
    const p = it.rec.projects.find((x) => x.sku === o.sku);
    if (!p) { out.push({ kind: 'bad', text: t('fb.unknownProject', { id, sku: String(o.sku || '') }) }); continue; }
    const d = new Date(o.at), at = isNaN(d) ? new Date().toISOString() : d.toISOString();
    if (p.feedback && String(p.feedback.at || '') >= at) { out.push({ kind: 'warn', text: t('fb.older', { sku: p.sku }) }); continue; }
    p.feedback = { score: o.score, comment: String(o.comment || '').slice(0, 600), at };
    touched.set(id, it); (it.fbNew || (it.fbNew = [])).push({ sku: p.sku, score: o.score, comment: p.feedback.comment }); out.push({ kind: 'ok', text: t('fb.imported', { sku: p.sku, id, n: nf(o.score) }) });
  }
  let changed = 0, saveFailed = 0;
  for (const [id, it] of touched) {
    try {
      it.rec.updatedAt = new Date().toISOString();
      it.sha = await savePrivate(it.rec, it.sha);
      await publishClient(it.rec); changed++;
      for (const n of it.fbNew || []) audit({ area: 'ratings', act: 'import', ref: id, title: it.rec.client.name + ' · ' + n.sku, ch: [['feedback', '', n.score + '/10' + (n.comment ? ' · ' + n.comment : '')]] });
      it.fbNew = null;
      if (ed && ed.id === id && !ed.dirty) ed = null;       // the open editor would hold an older copy
    } catch (e) { saveFailed++; out.push({ kind: 'bad', text: t('fb.saveFail', { id, m: e.message }) }); }
  }
  return { out, changed, saveFailed };
}

/* ---------------- the company inbox: ratings sent from the client site ---------------- */
let inboxAutoAt = 0, inboxBusy = false;
const INBOX_KEY_RE = /^[A-Za-z0-9_-]{16,64}$/;
const randomKey = () => Array.from(rand(32), (x) => 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'[x % 57]).join('');
const inboxOn = () => !!(brand.inbox && session.settings && session.settings.inboxKey);
const inboxCursorKey = () => 'dsp.inbox.' + String(brand.inbox || '').slice(-24);
// One request to the inbox. The answer is JSON {ok, ...}; anything else is reported in words the person can act on.
async function inboxCall(payload, url) {
  const ac = new AbortController(), tm = setTimeout(() => ac.abort(), 25000);
  try {
    const r = await fetch(url || brand.inbox, { method: 'POST', body: JSON.stringify(payload), signal: ac.signal, credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=UTF-8' } });
    let j = null; try { j = await r.json(); } catch (_) { j = null; }
    if (!r.ok || !j) throw new Error(t('fb.inboxFail'));
    if (j.ok !== true) throw new Error(t(j.error === 'key' ? 'fb.inboxKeyBad' : 'fb.inboxFail'));
    return j;
  } catch (e) { throw e instanceof Error && e.name !== 'AbortError' && e.name !== 'TypeError' ? e : new Error(t('fb.inboxFail')); } finally { clearTimeout(tm); }
}
// Fetch what clients sent since the last time (the place we stopped is kept on this device), import it like pasted codes, and move the place on only when every code was dealt with.
async function inboxPull() {
  if (!inboxOn()) throw new Error(t('fb.inboxOff'));
  if (inboxBusy) return null; inboxBusy = true;
  const sum = { fresh: 0, known: 0, bad: [], total: 0 };
  try {
    let after = Math.max(0, parseInt(ls.get(inboxCursorKey()) || '0', 10) || 0);
    for (let round = 0; round < 10; round++) {
      const j = await inboxCall({ v: 1, op: 'pull', key: session.settings.inboxKey, after });
      const items = Array.isArray(j.items) ? j.items : []; sum.total = Number(j.total) || sum.total;
      if (!items.length) break;
      const r = await importFeedback(items.map((x) => String(x.code || '')).join('\n'));
      sum.fresh += r.changed; sum.known += r.out.filter((o) => o.kind === 'warn').length; sum.bad.push(...r.out.filter((o) => o.kind === 'bad'));
      if (r.saveFailed) break;                                      // not saved: keep the place, so the next check tries these again
      after = Math.max(after, Number(j.next) || after); ls.set(inboxCursorKey(), String(after));
      if (items.length < 200) break;
    }
    return sum;
  } finally { inboxBusy = false; }
}

function ratingsCard() {
  const box = h('textarea', { id: 'fbIn', rows: 4, dir: 'ltr', spellcheck: 'false', placeholder: t('fb.placeholder'), 'aria-label': t('fb.import') });
  const res = h('div', { class: 'stack-sm', id: 'fbRes' }), sumBox = h('div', { class: 'stack-sm' });
  const draw = () => {
    const rs = allRatings(), avg = avgScore(rs);
    sumBox.replaceChildren(rs.length
      ? h('div', { class: 'stack-sm' },
        kpis(kpi(t('fb.avg'), nf(avg, { maximumFractionDigits: 1 }) + ' / 10', avg >= 8 ? 'pos' : avg >= 5 ? '' : 'neg', t('fb.count', { n: nf(rs.length) }))),
        h('strong', { class: 'small' }, t('fb.latest')),
        ...rs.slice(0, 5).map((x) => h('div', { class: 'fbitem' },
          h('div', { class: 'rowsep' }, h('span', {}, h('strong', { class: 'mono' }, x.p.sku), ' ', h('span', { dir: 'auto', class: 'muted' }, x.rec.client.name)), h('strong', {}, nf(x.fb.score) + '/10')),
          scoreBar(x.fb.score),
          x.fb.comment ? h('p', { class: 'fbquote', dir: 'auto' }, x.fb.comment) : h('p', { class: 'small muted' }, t('fb.noComment')),
          h('span', { class: 'small muted' }, t('fb.onDate', { d: fmtDateTime(x.fb.at) })))))
      : h('p', { class: 'empty' }, t('fb.noRatings')));
  };
  draw();
  const inboxMsg = h('p', { class: 'small muted', id: 'inboxState', role: 'status' });
  const inboxRes = h('div', { class: 'stack-sm', id: 'inboxRes' });
  const pull = async (quiet) => {
    if (inboxBusy) return;
    pullBtn.disabled = true; inboxMsg.textContent = t('fb.inboxChecking'); inboxRes.replaceChildren();
    try {
      const r = await inboxPull();
      if (!r) return;
      inboxMsg.textContent = r.fresh ? t('fb.inboxGot', { n: nf(r.fresh) }) : t('fb.inboxNone') + (r.known ? ' ' + t('fb.inboxKnown', { n: nf(r.known) }) : '');
      inboxRes.replaceChildren(...r.bad.map((o) => h('p', { class: 'msg bad', role: 'alert' }, o.text)));
      if (r.fresh) { draw(); if (quiet) toast(t('fb.inboxGot', { n: nf(r.fresh) }), 'ok'); }
    } catch (e) { inboxMsg.textContent = quiet ? '' : e.message; if (!quiet) inboxRes.replaceChildren(h('p', { class: 'msg bad', role: 'alert' }, e.message)); } finally { pullBtn.disabled = false; }
  };
  const pullBtn = h('button', { class: 'btn', type: 'button', id: 'btnInboxPull', 'data-edit': 'ratings', onclick: () => pull(false) }, t('fb.inboxPull'));
  const inboxRow = brand.inbox
    ? h('div', { class: 'stack-sm', id: 'inboxRow' }, h('div', { class: 'rowsep' }, h('span', { class: 'small' }, t(inboxOn() ? 'fb.inboxOn' : 'fb.inboxNoKey')), inboxOn() ? pullBtn : null), inboxMsg, inboxRes)
    : null;
  if (inboxOn() && can('ratings', PERM_EDIT) && Date.now() - inboxAutoAt > 600000) { inboxAutoAt = Date.now(); setTimeout(() => pull(true), 0); }
  const go = h('button', { class: 'btn primary', type: 'button', id: 'btnFbImport', onclick: async () => {
    go.disabled = true; res.replaceChildren(h('p', { class: 'msg' }, t('fb.working')));
    try {
      const r = await importFeedback(box.value);
      res.replaceChildren(...r.out.map((o) => h('p', { class: 'msg ' + o.kind, role: o.kind === 'bad' ? 'alert' : 'status' }, o.text)));
      if (r.changed) { box.value = ''; draw(); }
    } catch (e) { res.replaceChildren(h('p', { class: 'msg bad', role: 'alert' }, e.message)); } finally { go.disabled = false; }
  } }, t('fb.importBtn'));
  return h('section', { class: 'card stack-sm' },
    h('div', { class: 'card-head' }, h('h2', {}, t('fb.title')), h('a', { class: 'btn small', href: '#reports', id: 'btnRatingsReport', onclick: () => { reportSel = { type: 'satisfaction', client: '', project: '', from: '', to: '' }; } }, t('fb.report'))),
    sumBox, inboxRow,
    h('details', { class: 'fbimport', 'data-edit': 'ratings' }, h('summary', {}, t('fb.import')),
      h('div', { class: 'stack-sm' }, h('p', { class: 'hint' }, t('fb.importHint')), box, h('div', { class: 'actions' }, go), res)));
}

// Shown in the project editor (read only: the rating is the client's own words)
function feedbackBlock(p) {
  const done = projState(p) === 'completed';
  if (!p.feedback) return done ? h('p', { class: 'notice' }, t('fb.waiting')) : null;
  return h('div', { class: 'fbitem' }, h('div', { class: 'rowsep' }, h('strong', {}, t('fb.rated')), h('strong', {}, nf(p.feedback.score) + '/10')), scoreBar(p.feedback.score),
    p.feedback.comment ? h('p', { class: 'fbquote', dir: 'auto' }, p.feedback.comment) : h('p', { class: 'small muted' }, t('fb.noComment')),
    h('span', { class: 'small muted' }, t('fb.onDate', { d: fmtDateTime(p.feedback.at) })));
}
