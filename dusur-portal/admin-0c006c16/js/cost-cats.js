/**
 * <admin>/js/cost-cats.js  -  cost categories you can add yourself (direct and indirect)
 * The built-in lists COST_CATS (state.js, direct) and IND_CATS (ops-data.js, indirect) are extended in place with the categories kept in the settings
 * (settings.costCats = { direct: [{ id, en, ar }], indirect: [...] }), so every select, import and report that reads those lists sees them. The id never changes
 * (x + 6 hex digits), the name can be changed at any time. A category that is removed shows as "Other" wherever it was used.
 * Loaded by: admin page
 */
'use strict';

const COST_BASE = COST_CATS.filter((x) => x !== 'other'), IND_BASE = IND_CATS.filter((x) => x !== 'other');   // the built-in ones; "Other" always stays last
const CATS_MAX = 20, CAT_NAME_MAX = 60, catIdOk = (id) => /^x[0-9a-f]{6}$/.test(String(id || ''));
let CUSTOM_CATS = { direct: [], indirect: [] };
const newCatId = () => 'x' + hex(rand(3));

// a list of categories read from the settings file or the form: ids checked, names trimmed, empty ones dropped
function normCostCats(c) {
  const one = (list) => {
    const seen = new Set();
    return (Array.isArray(list) ? list : []).map((x) => ({ id: String((x && x.id) || ''), en: String((x && x.en) || '').trim().slice(0, CAT_NAME_MAX), ar: String((x && x.ar) || '').trim().slice(0, CAT_NAME_MAX) }))
      .filter((x) => catIdOk(x.id) && (x.en || x.ar) && !seen.has(x.id) && seen.add(x.id)).slice(0, CATS_MAX);
  };
  return { direct: one(c && c.direct), indirect: one(c && c.indirect) };
}
// make the lists the screens read include the custom categories
function applyCostCats(c) {
  CUSTOM_CATS = normCostCats(c);
  COST_CATS.splice(0, COST_CATS.length, ...COST_BASE, ...CUSTOM_CATS.direct.map((x) => x.id), 'other');
  IND_CATS.splice(0, IND_CATS.length, ...IND_BASE, ...CUSTOM_CATS.indirect.map((x) => x.id), 'other');
  if (typeof ops !== 'undefined' && ops.expenses && ops.expenses.data) ops.expenses.data.items = ops.expenses.data.items.map(normExpense);   // expenses of a removed category become "Other" in memory too
}
// the name of a category: a built-in one from the dictionary, one of your own as typed (the other language when this one is empty)
function catText(kind, id) {
  const x = (CUSTOM_CATS[kind] || []).find((y) => y.id === id);
  if (x) return L(x) || id;
  const key = (kind === 'direct' ? COST_BASE : IND_BASE).includes(id) ? id : 'other';                    // an id that is no longer in the settings reads as "Other"
  return kind === 'direct' ? t('cat.' + key) : t('icat.' + key);
}
