/**
 * <admin>/js/views/reports/model-ctr.js  -  report model: Contracts (status, wording and value of every contract)
 * Plain data (KPIs, chart, table) like every other report, so the paper view and the Excel file read the same model. The rows come from
 * contractRows() (views/contracting.js).
 * Loaded by: admin page
 */
'use strict';

REPORT_NEEDS.contracts = [];                                  // reads the clients only, no operations files
function contractsModel(sel) {
  const f = CTR_FILTERS.includes(sel.state) ? sel.state : 'all', cl = sel.client ? store.items.find((x) => x.rec.id === sel.client) : null;
  const scope = contractRows().filter((r) => !sel.client || r.rec.id === sel.client), tot = ctrTotals(scope), rows = scope.filter((r) => ctrMatch(r, f));
  const base = { private: true, land: true, period: asOfText(), scope: scopeOf([f !== 'all' && t('ctr.f.' + f), cl && cl.rec.client.name], rows.length, 'ctr.rpAll', 'ctr.rpSome') };
  if (!rows.length) return Object.assign(base, { empty: true });
  const kpis = [{ label: t('ctr.k.all'), v: scope.length, kind: 'int', sub: money(tot.sum(scope)) }, { label: t('ctr.k.draft'), v: tot.draft.length, kind: 'int', tone: tot.draft.length ? 'warn' : '', sub: money(tot.sum(tot.draft)) },
    { label: t('ctr.k.issued'), v: tot.issued.length, kind: 'int', sub: money(tot.sum(tot.issued)) }, { label: t('ctr.k.signed'), v: tot.signed.length, kind: 'int', tone: 'pos', sub: money(tot.sum(tot.signed)) }];
  const charts = [donutOf(t('ctr.rp.split'), 'money', [[t('ct.st.draft'), tot.sum(tot.draft), C_MUTE], [t('ct.st.issued'), tot.sum(tot.issued), PALETTE[3]], [t('ct.st.signed'), tot.sum(tot.signed), PALETTE[0]]], true)].filter(Boolean);
  const cols = [{ h: t('ctr.no'), kind: 'text', nw: true }, { h: t('col.client'), kind: 'text' }, { h: t('col.project'), kind: 'text', nw: true }, { h: t('ct.p.price'), kind: 'money' }, { h: t('ct.wording'), kind: 'text' },
    { h: t('rp.col.status'), kind: 'text', nw: true }, { h: t('ct.issuedCol'), kind: 'date' }, { h: t('ct.signedCol'), kind: 'date' }];
  const table = { title: t('ctr.title'), cols, rows: rows.map((r) => [r.c.no, r.rec.client.name, skuRef(r.rec, r.p), r.price, r.wordingName, t('ct.st.' + r.status), r.c.pc.issuedAt || '', r.c.pc.signedAt || '']),
    foot: [t('fin.total'), '', '', tot.sum(rows), '', '', '', ''] };
  return Object.assign(base, { kpis, charts, tables: [table] });
}
REPORT_OPS.contracts = contractsModel;
