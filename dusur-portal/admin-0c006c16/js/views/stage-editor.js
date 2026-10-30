/**
 * <admin>/js/views/stage-editor.js  -  stage and checklist editor
 * Used for project stages and for project-type templates.
 * Loaded by: admin page
 */
'use strict';

/* =====================================================================
   Stage editor (used for project stages and for project-type templates)
   mode = { tpl: bool (template shape: items[] of {en,ar}), state: bool (tick boxes + status), structure: bool (rename/add/remove/move), tickAll: bool (a "tick all" button per stage) }
   ===================================================================== */
function stageEditor(stages, mode, onChange) {
  const wrap = h('div', { class: 'stack-sm' });
  const list = (st) => (mode.tpl ? (st.items || (st.items = [])) : (st.checklist || (st.checklist = [])));
  const txt = (it) => (mode.tpl ? it : (it.text || (it.text = { en: '', ar: '' })));
  const changed = () => { touch(); if (onChange) onChange(); };
  const sync = (st) => {
    const items = list(st), n = items.filter((i) => i.done).length;
    if (items.length && n === items.length) st.status = 'completed'; else if (n > 0) st.status = 'in_progress'; else if (st.status === 'completed') st.status = 'pending';
  };
  function block(st, i) {
    if (!st.name) st.name = { en: '', ar: '' };
    const statusSel = mode.state ? selectEl(statusOptions(), st.status || 'pending', (v) => { st.status = v; changed(); }, undefined, t('rp.col.status') + ': ' + L(st.name)) : null;
    const items = list(st);
    const head = mode.structure
      ? h('div', { class: 'stack-sm' }, biInputs(st.name),
        h('div', { class: 'actions' }, statusSel,
          h('button', { class: 'small', type: 'button', disabled: i === 0, onclick: () => { stages.splice(i - 1, 0, stages.splice(i, 1)[0]); changed(); draw(); } }, t('act.up')),
          h('button', { class: 'small', type: 'button', disabled: i === stages.length - 1, onclick: () => { stages.splice(i + 1, 0, stages.splice(i, 1)[0]); changed(); draw(); } }, t('act.down')),
          h('button', { class: 'small danger', type: 'button', onclick: () => { stages.splice(i, 1); changed(); draw(); } }, t('act.remove'))))
      : h('div', { class: 'row' }, h('strong', { dir: 'auto' }, (i + 1) + '. ' + L(st.name)),
        h('div', { class: 'actions' }, mode.tickAll && mode.state && items.length ? h('button', { class: 'small', type: 'button', onclick: () => { const all = items.every((x) => x.done); items.forEach((x) => { x.done = !all; }); sync(st); changed(); draw(); } }, items.every((x) => x.done) ? t('pg.untickAll') : t('pg.tickAll')) : null, statusSel));
    const rows = items.map((it, j) => {
      if (mode.structure) {
        return h('div', { class: 'stack-sm' }, h('div', { class: 'rowsep' },
          mode.state ? h('input', { type: 'checkbox', checked: !!it.done, 'aria-label': t('ed.done'), onchange: (e) => { it.done = e.target.checked; sync(st); changed(); draw(); } }) : null,
          h('div', { style: 'flex:1;min-width:200px' }, biInputs(txt(it))),
          h('button', { class: 'small danger x', type: 'button', 'aria-label': t('act.remove'), onclick: () => { items.splice(j, 1); changed(); draw(); } }, '×')));
      }
      return h('label', { class: 'check' },
        h('input', { type: 'checkbox', checked: !!it.done, onchange: (e) => { it.done = e.target.checked; sync(st); changed(); draw(); } }),
        h('span', { dir: 'auto' }, L(txt(it))));
    });
    const add = mode.structure ? h('button', { class: 'small', type: 'button', onclick: () => { items.push(mode.tpl ? { en: '', ar: '' } : { text: { en: '', ar: '' }, done: false }); changed(); draw(); } }, t('ed.addTask')) : null;
    return h('div', { class: 'editor-stage' }, head, rows, add);
  }
  function draw() {
    wrap.replaceChildren(...stages.map(block).concat(mode.structure ? [h('button', { class: 'small', type: 'button', onclick: () => { stages.push(mode.tpl ? { key: 'c' + uid(), name: { en: '', ar: '' }, items: [] } : { key: 'c' + uid(), name: { en: '', ar: '' }, status: 'pending', checklist: [] }); changed(); draw(); } }, t('ed.addStage'))] : []));
  }
  draw();
  return wrap;
}
const uid = () => hex(rand(4));
