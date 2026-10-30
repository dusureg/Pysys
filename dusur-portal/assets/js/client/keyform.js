/**
 * assets/js/client/keyform.js  -  secret-key form
 * Shared by the search page and the private link: brute-force delay, show/hide, opening the record.
 * Loaded by: client page
 */
'use strict';

/* ---- secret-key form, shared by the search page and the private link ---- */
function keyForm(st, onSubmit, redraw) {
  const key = h('input', { id: 'clKey', type: 'password', autocomplete: 'off', spellcheck: 'false', autocapitalize: 'characters', dir: 'ltr', maxlength: 60, placeholder: 'XXXX-XXXX-XXXX-XXXX', 'aria-label': t('key.label') });
  const show = h('button', { class: 'small', type: 'button', onclick: () => { key.type = key.type === 'password' ? 'text' : 'password'; show.textContent = key.type === 'password' ? t('act.show') : t('act.hide'); } }, t('act.show'));
  const go = h('button', { class: 'btn primary', type: 'submit', id: 'btnOpen' }, icon('key'), st.busy ? t('key.opening') : t('key.open'));
  go.disabled = !!st.busy;
  const form = h('form', { class: 'keyform', autocomplete: 'off', onsubmit: async (e) => {
    e.preventDefault(); if (st.busy || !key.value.trim()) { key.focus(); return; }
    st.busy = true; st.err = false; go.disabled = true; go.lastChild.textContent = t('key.opening');
    const ok = await onSubmit(key.value);
    if (ok === false) { st.fails++; await sleep(Math.min(st.fails * 400, 2500)); st.busy = false; st.err = true; redraw(); }
  } },
  h('label', {}, t('key.label'), h('div', { class: 'input-row' }, key, show)),
  st.err ? h('div', { class: 'msg bad shake', role: 'alert' }, h('strong', {}, t('cl.denied')), h('span', {}, t('cl.deniedText'))) : null,
  go);
  return form;
}
