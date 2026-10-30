/**
 * <admin>/js/views/reports/paper.js  -  printable report paper
 * The A4 sheet: logo, generated date, KPIs, charts, tables, footer. Always light so it prints the same everywhere.
 * Loaded by: admin page
 */
'use strict';

/* ---------------- paper view ---------------- */
function reportLogo() {
  if (brand.logo) return h('img', { class: 'rp-logoimg', src: brand.logo, alt: brandName() });
  const m = h('span', { class: 'rp-mark', 'aria-hidden': 'true' }); m.innerHTML = LOGO_MARK;
  return h('span', { class: 'rp-logo' }, m, h('span', { class: 'rp-brand', dir: 'auto' }, brandName()));
}
function renderTable(tb) {
  const isNum = (k) => k !== 'text' && k !== 'date';
  return h('section', { class: 'rp-sec rp-tblwrap' + (tb.rows.length <= 14 ? ' short' : '') }, h('h3', { dir: 'auto' }, tb.title),
    h('table', { class: 'rp-tbl' + (tb.cols.length > 9 ? ' dense' : '') },
      h('thead', {}, h('tr', {}, tb.cols.map((c) => h('th', { class: isNum(c.kind) ? 'n' : '' }, c.h)))),
      h('tbody', {}, tb.rows.map((r) => h('tr', {}, r.map((v, i) => { const c = tb.cols[i]; return h('td', { class: (isNum(c.kind) ? 'n ' : '') + (c.wide ? 'wide' : '') + (c.nw || c.kind === 'date' ? ' nw' : '') + (c.sign ? ' sign' : ''), dir: c.kind === 'text' ? 'auto' : null }, fmtCell(v, c.kind, true)); }))),
        // the total is an ordinary last row: a <tfoot> repeats on every printed page and splits small tables
        tb.foot ? h('tr', { class: 'total' }, tb.foot.map((v, i) => h('td', { class: isNum(tb.cols[i].kind) ? 'n' : '' }, v === '' ? '' : fmtCell(v, tb.cols[i].kind, true)))) : null)));
}
function renderPaper(m) {
  const contact = [brand.phone, brand.email, brand.website && brand.website.replace(/^https:\/\//, ''), brand.address].filter(Boolean);
  const footer = L(session.settings.reportFooter);
  const land = !!m.land || m.type === 'finance' || m.type === 'production';
  return h('article', { class: 'paper' + (land ? ' land' : ''), id: 'rpPaper' },
    h('header', { class: 'rp-head' }, reportLogo(),
      h('div', { class: 'rp-meta' }, h('span', {}, t('rp.generated')), h('strong', {}, fmtDateTime(m.generated.toISOString())))),
    h('div', { class: 'rp-band' }),
    h('div', { class: 'rp-titleblock' }, h('h2', { id: 'rpTitle' }, m.title),
      h('dl', {}, h('div', {}, h('dt', {}, t('rp.scope')), h('dd', { dir: 'auto' }, m.scope)), h('div', {}, h('dt', {}, t('rp.period')), h('dd', {}, m.period)), m.private ? h('div', {}, h('dt', {}, t('rp.currency')), h('dd', {}, CUR)) : null)),
    m.empty ? h('p', { class: 'rp-empty', id: 'rpEmpty' }, emptyText(m)) : null,
    m.kpis.length ? h('section', { class: 'rp-kpis' }, m.kpis.map((k) => h('div', { class: 'rp-kpi ' + (k.tone || '') }, h('span', { class: 'l' }, k.label), h('strong', { class: 'v' }, fmtCell(k.v, k.kind)), h('span', { class: 's' }, k.sub || '\u00a0')))) : null,
    m.charts.length ? h('section', { class: 'rp-charts' }, m.charts.map(chartFigure)) : null,
    m.tables.map(renderTable),
    h('footer', { class: 'rp-foot' },
      contact.length ? h('p', {}, dotJoin(contact.map((x, i) => h('bdi', { dir: i === contact.length - 1 && brand.address ? 'auto' : 'ltr' }, x)))) : null,
      footer ? h('p', { dir: 'auto' }, footer) : null,
      h('p', { class: 'rp-conf' }, dotJoin([m.private ? h('bdi', {}, t('rp.confidential')) : null, h('bdi', { dir: 'auto' }, brandName()), h('bdi', {}, fmtDay(todayStr()))]))));
}
