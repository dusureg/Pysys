# Development guide

How to work on the code without breaking it. Read [ARCHITECTURE.md](ARCHITECTURE.md) first for the big picture.

## Setup

You need nothing to edit: any text editor. To run the checks you need **Python 3** and **Node.js** (no packages). To run the end-to-end tests you also need Python Playwright with Chromium (see [../tests/README.md](../tests/README.md)).

There is no dev server to start. The pages need a `*.github.io` address and a GitHub API to do real work, so the practical loops are:

- `python3 tools/check.py` after every change (a few seconds; no browser).
- `python3 tests/e2e/run.py` before delivering (a few minutes; simulated GitHub).
- For trying a screen by eye, run the tests with `HEADED=1` (a visible Chromium against the simulated GitHub); see [tests/README.md](../tests/README.md).

## The rules (all enforced by `tools/check.py` unless marked)

1. **Classic scripts, one global scope.** No `import`/`export`, no `type="module"`. A file's top-level names are visible to every file loaded after it and, from inside functions, to every file on the page.
2. **Unique names.** A top-level `const`, `let`, `function` or `class` may be declared once per page. Prefix helpers that are local to one feature (`fbKey`, `tapeCard`) or keep them inside a function.
3. **Do not use a `window` property name** (`name`, `status`, `length`, `top`, `event`, `print`, ...) as a top-level binding.
4. **Load order matters.** Do not call at load time anything defined in a file loaded later. Calls inside functions are fine.
5. **ES2018 only.** No `?.`, no `??`, no `||=`, no `#private`, no top-level `await`. `Object.fromEntries`, `async/await`, spread, `Array.prototype.flat` are fine.
6. **Client isolation.** Nothing under `assets/` may refer to admin-only things (`api.github.com`, `data/private`, `deriveVaultKey`, `sealObj`, `toPublic`, ...) and the client page must not load any admin file. Put code in `core/` only if **both** pages need it.
7. **Every source file starts with a header comment**: path, one-line title, a paragraph, and `Loaded by:`. Use `<admin>/` for the admin folder in headers so renaming the folder never breaks a header.
8. **Strict CSP.** No inline `<script>`, no inline event attributes (`onclick="..."`), no `eval`/`new Function`. Attach handlers with `addEventListener` or `h()`'s `onclick`.
9. **Build DOM with `h()`**, never with `innerHTML` and strings that contain data. The only places allowed to create markup from a string are the SVG icon table and the static chart/xlsx XML builders, and none of them may include user text unescaped. *(review rule)*
10. **i18n parity.** Every user-visible string goes through `t('key')`. Add the key to **both** `en.js` and `ar.js` of the right dictionary; placeholders (`{n}`) must match.
11. **Both languages and both directions.** Check the screen in Arabic (RTL) and in the light theme. Use logical CSS properties (`margin-inline-start`, `padding-inline`, `inset-inline-end`, `text-align: start`). *(review rule)*
12. **Regenerate the code map** when JS files change: `python3 tools/check.py --write-codemap`. The check fails when [CODEMAP.md](CODEMAP.md) is stale.
13. **Do not change a salt string, an iteration count, a prefix or a schema tag** without a migration (see [DATA-FORMAT.md](DATA-FORMAT.md#compatibility)). Existing clients' data would stop opening. *(review rule)*

## Where things live

| I want to change... | Look in |
|---|---|
| Colours, spacing, typography | `assets/css/base.css` (variables), `components.css` |
| Client pages' look | `assets/css/client.css` |
| Admin look | `<admin>/css/admin.css` |
| Printed report look | `<admin>/css/report.css` (`@page`, print rules) |
| Money maths, progress, status | `assets/js/core/domain.js` |
| What the client may see | `toPublic()` in `<admin>/js/domain.js` (and the client reading code in `assets/js/client/`) |
| Default project types and stages | `defaultTypes()` in `<admin>/js/domain.js` (new installs); users edit them in Settings |
| ID and SKU patterns | `newSku()` in `<admin>/js/domain.js`, `nextClientId()` in `<admin>/js/views/editor.js`, `ID_RE` and the search patterns in `client/search.js` |
| Wording | `assets/i18n/*.js` (both sites) and `<admin>/i18n/*.js` (admin only) |
| GitHub calls | `<admin>/js/github.js` |
| Suppliers, inventory and logistics: stock alerts, reorder quantity, shipment states, links | `<admin>/js/ops-data.js` |
| Their screens | `<admin>/js/views/suppliers.js`, `inventory.js`, `logistics.js`, shared helpers in `ops-ui.js` |
| Their reports | `<admin>/js/views/reports/model-ops.js` |
| Encryption | `assets/js/core/crypto.js` (read side), `<admin>/js/crypto.js` (write side) |
| Collection schedule maths (paid / overdue / next payment) | `collectionPlan()` and friends in `assets/js/core/domain.js` (both sites) |
| The schedule card, the Collections screen and its report | `<admin>/js/views/schedule.js`, `views/collections.js`, `views/reports/model-coll.js` |
| Internal code formulas, units of materials | `<admin>/js/codes.js`, `ops-data.js` (`normItem`) |
| Your own cost categories | `<admin>/js/cost-cats.js` (lists), Settings card in `views/settings-more.js` |
| Import from CSV / Excel / JSON | `<admin>/js/import-file.js` (reading), `views/import.js` (screen and rules) |
| Fonts, accent colour, paper size, the settings file | `assets/js/core/look.js`, `<admin>/js/paper-size.js`, `views/settings-more.js` |
| Share button, report as a picture | `<admin>/js/share.js`, `export/dom-image.js` |
| Profile and the owner login file | `<admin>/js/profile.js`, `session.js`, `views/gate.js` |
| Contract wording (templates, own clauses, status), the Contracting list | `<admin>/js/contract-terms.js` (`normPc`, `normTemplates`), `views/contract.js`, `views/contracting.js`, `views/settings-contract.js` |
| Labels: sizes, fields, QR code, barcode | `<admin>/js/label.js` (`normLabels`, `qrMatrix`, `code128Bars`), `views/labels.js`, the `.lbl` rules in `css/report.css` |
| Invoices, product pictures, brands | `<admin>/js/attach.js` (sealing, limits, `normBrands`, `normThumb`), `views/attach-ui.js`, Settings card in `views/settings-more.js` |
| Videos, downloads and the viewer on the client site | `assets/js/core/photos.js` (`DL_EXT`, `DL_MAX_MB`, `videoUrl`, `dlUrl`, viewer), the Photos tab in `views/editor-tabs.js` |
| The contact file (vCard) | `brandVcard()` in `assets/js/core/brand.js` |
| The company overview | `<admin>/js/views/reports/model-ovw.js` (`overviewModel`) |

## Recipes

### Add or change a string

1. Pick the dictionary: used by the client page (or by `core/`)? Then `assets/i18n/`. Admin only? Then `<admin>/i18n/`.
2. Add `"group.key": "Text"` to `en.js` and the Arabic text to `ar.js`, in the same group (keys are sorted by prefix).
3. Use `t('group.key')` or `t('group.key', { n: 3 })` for placeholders.
4. `python3 tools/check.py` tells you about a missing key, a mismatch in placeholders, or a key in the wrong dictionary.

### Add a field to a project

1. Default it where projects are created (`newProject()` in `<admin>/js/domain.js`) and make `normalizeRec()` (in `<admin>/js/views/bom.js`) tolerate its absence in old records.
2. Add an input in the right editor tab (`editor-tabs.js`); call `touch()` on change so the editor knows it is dirty.
3. Is it for the client to see? Add it to the whitelist in `toPublic()` **and** to `upgradePublic()`/the portal code. If not, do nothing: private by default.
4. Document it in [DATA-FORMAT.md](DATA-FORMAT.md).

### Add an editor tab

1. In `<admin>/js/views/editor.js` add the key to `TABS` and the builder function to the `builders` map.
2. Write `tabYourThing(p)` (in `editor-tabs.js` or its own file; if its own file, add it to the admin `index.html` script list before `main.js` and after anything it needs).
3. Add `ed.tab.yourthing` to both admin dictionaries.

### Add a report

1. Write `yourModel(items)` in `<admin>/js/views/reports/model.js`. `items` is an array of `{ rec, p }` (client record and project). Return `{ kpis, charts, tables, private }`:
   - `kpis`: `{ label, v, kind: 'money'|'pct'|'int'|'text', tone?, sub? }`
   - `charts`: `{ kind: 'vbar'|'hbar'|'line'|'donut', title, fmt, cats, series: [{ name, color?, values }] }`
   - `tables`: `{ title, cols: [{ h, kind }], rows, foot? }`
   - Return `{ empty: true }` when there is nothing to show.
2. Register it in `REPORT_TYPES` and in the `buildReport()` map.
3. Add `rp.type.yourkey` and any new labels to both admin dictionaries.

The paper view and the Excel export both read the model, so nothing else changes. Charts use `PALETTE`; give counts `kind: 'int'` so axes use whole numbers.

### Add an operations report

Same as a report, but the model reads `opsList('inventory')` and friends and is registered in `REPORT_OPS` (not `buildReport()`'s map): write `yourModel(sel)` in `reports/model-ops.js` (`sel` holds `cat`, `sup`, `state`, `kind`, `ship`, `from`, `to`), add its key to the `REPORT_TYPES.push(...)` line and to `REPORT_FILTERS` (which filter fields it shows), put the model in the `Object.assign(REPORT_OPS, { ... })` line, add the `rp.type.<key>` and `rp.empty*` strings (and the `emptyText()` map in `model.js`), and give wide tables `land: true`. Mark columns that must not wrap (`nw: true`) or that need room to write (`sign: true`). A section's "Printable report" button is just a link to `#reports/<key>`.

### Add a field to a supplier, material or shipment

Add it to the normaliser in `ops-data.js` (`normSupplier`, `normItem`, `normShipment`: default and length cap), to the form in the matching view, and to the dictionaries. Old files open unchanged because the normaliser fills the default. If a stale form could overwrite the field while another action owns it (like a material's quantity), protect it in the `adjust` hook passed to `opsSaveOpen()`.

### Add a project type

For a user: Settings, Project types, *Add project type*. For a new default: `defaultTypes()` in `<admin>/js/domain.js` (affects new installs only, not existing settings).

### Add a screen to the admin

1. A `renderYourScreen(token)` function in `<admin>/js/views/yourscreen.js`; start with `const token = ...` passed from `route()` and stop drawing if `token !== routeToken` after any `await`.
2. Add the file to the admin `index.html` before `main.js`; add a `data-route` link in the header if it needs a menu entry.
3. Handle the hash in `route()` in `<admin>/js/router.js`.
4. Strings in the admin dictionaries.

### Give a new screen a role area

Every admin screen belongs to an **area** that a role can be given (none / view / edit): the list is `PERM_AREAS` in `<admin>/js/perm.js`.

1. Put the screen in `VIEW_AREA` (`perm.js`): an area name, `null` (every signed-in person) or `'owner'` (administrator only; this is what Team and Configuration use and it can never be granted to a role).
2. Mark every control that changes data with `data-edit="<area>"` (the stylesheet hides it for a person who may only view) and wrap forms in a `<fieldset>` you disable with `readOnly('<area>')`.
3. Files the screen writes must be covered by `writeAreas()` in `perm.js`, which is what the write guard (`canWritePath`) checks on every save. A file that no area covers can be written by the administrator only.
4. A new report type goes in `REPORT_AREA` (`reports/model-fin.js`) so the report list shows it only to people who may see that area.
5. Add a line to the test of the role you expect to see it (`tests/e2e/s15_team.py`). A new area also needs its names in both admin dictionaries (`team.area.<id>`).

Remember the limit stated in [SECURITY.md](SECURITY.md): roles are enforced by the page, not by GitHub.

### Record a change in the History

Call `auditSave(area, act, ref, title, before, after)` after a successful save (`act` is `create`, `update` or `delete`; an update that changed nothing records nothing), or `audit({ area, act, ref, title, ch, note })` for an action that is not a plain save (a stock movement, an import, a pause). Fields whose name is in `AUD_HIDE` (`audit.js`) are recorded as `•••`; add the name of any new secret field there. The call never blocks or fails a save: entries that could not be written wait and are retried. If the screen has a record view, add a *History* button that opens `#audit` filtered on the record (see `views/ops-ui.js`).

### Add an import target

An importable section is listed in `IMP_TARGETS` (`views/import.js`) with its role area (`IMP_AREA`), its title (`IMP_TITLE`) and the screen to go back to (`IMP_BACK`). Its columns are described by `impFields(target)`: the field key, the column names it understands in English and Arabic (matched by `wordKey()`), the kind of value and a checker; `impPlan()` turns the mapped rows into add / update / skip / reject, and `enumMap()` matches a choice by its key or by its English or Arabic name (and by the names of your own cost categories). Add the strings to both admin dictionaries and a case to `tests/e2e/s24_import.py`.

### Add a setting that travels in the settings file

1. Default and normalise it in one function (`normYours()`), used by Save **and** by `cfgApply()` in `views/settings-more.js`, so a bad value in a file is dropped the same way a bad value in the form is.
2. Add it to `cfgExport()` and `cfgApply()` (and a `cfg.sec.<name>` string in both admin dictionaries). A secret never goes in the file.
3. If both sites read it, publish it through `brand.json` (`sanitizeBrand()` is the whitelist; `tests/e2e/s08_contract_signature.py` lists the exact fields).

### Add a cost or collection rule

Cost totals come from `finance(p)` / `finCompute()`; what the client still owes on a date comes only from `collectionPlan()`. Change the rule there and the screens, reports and the client's money card follow. `tests/e2e/s26_collections.py` holds the scenario with the numbers worked out by hand.

### Add a screen to the client

Same idea in `assets/js/client/`. Remember the client page must not load anything from the admin folder, and everything it fetches must be public ciphertext or public data.

### Add a contract token or clause

Tokens are filled by `ctFill()` in `views/contract.js` (`{company} {client} {project} {sku} {price} {start} {due} {warranty} {date} {owner}`): add the name to the `map` there and to the token hint in `views/settings-contract.js`. The shipped clauses are `CONTRACT_TERMS` in `contract-terms.js` (one block per clause, a blank line between, the first line is the heading); changing them changes only the default, never text a user has already saved. A clause containing `{warranty}` is dropped when the warranty is 0.

### Add a field to a label

Add its name to `LABEL_FIELDS` in `label.js` (the order there is the order on the label), draw it in `renderLabel()` (`views/labels.js`) for both sizes, add `lbl.f.<name>` to both admin dictionaries and, if it should be a default, to `defaultLabels()`. A field that is not on the list is dropped by `normLabels()`, also when it comes from a settings file. `tests/e2e/s33_labels.py` prints real PDFs and checks every label is one page of exactly its size.

### Allow another file type for the client to download

Add the extension to `DL_EXT` in `assets/js/core/photos.js` (both sites use it; `dlOk()` is also what `toPublic()` filters with). The page only ever **saves** such a file; do not add a type that the page would open or run. The size limit is `DL_MAX_MB`: a sealed file is read whole in the browser and the contents API of GitHub stops at 1 MB for a plain read (larger ones are read as blobs).

### Add a script file

1. Create it with the header comment.
2. Add a `<script defer src>` line to every page that needs it, in the right position.
3. `python3 tools/check.py --write-codemap`, then `python3 tools/check.py`.

### Add a language (large change)

Dictionaries are keyed by language code in `window.__I18N`; `lang` is `'en'` or `'ar'` in several places (`core/i18n.js`, `guard.js`, the language switch, locale in `locale()`, direction, `{ en, ar }` data fields such as stage names). A third language means touching all of those and the data format. Treat it as a project of its own.

## The check tool

`python3 tools/check.py` prints `ok`/`FAIL`/`warn` per check and exits 1 on failure. See [../tools/README.md](../tools/README.md) for the list. It parses JavaScript with the `acorn` parser that ships inside Node (`node --expose-internals`); if that is unavailable it degrades to a warning for the checks that need a parser (syntax is still checked with `node --check`).

## Debugging

- **Blank page or a diagnostics box**: read the listed error first. `window.__dsp.errs` holds up to eight recorded errors; `window.__dsp.broken` is true when one of this site's own files failed.
- **"i18n missing: key" in the console**: a key is absent from the current language (and from English).
- **Admin cannot write**: open the Configuration screen and press *Test connection*; it reports the exact GitHub error (403 token permission, 404 repository, 409/422 conflict).
- **Something works locally in tests but not on GitHub Pages**: Pages is case-sensitive and serves exactly what you uploaded. Check file names and paths in the page's script list, and that `.nojekyll` is present (Jekyll ignores folders starting with `_`).
- **Stale code after an update**: hard reload; Pages caches for a few minutes.

## Releasing

1. `python3 tools/check.py --write-codemap && python3 tools/check.py`
2. `cd tests/e2e && python3 run.py && python3 boot.py` (and `python3 ../tools/test_get_fonts.py` after touching `tools/get-fonts.py` or the font loader); `run.py` includes the quality audit, whose budgets and rules are in [QUALITY.md](QUALITY.md)
3. Add an entry to [CHANGELOG.md](CHANGELOG.md).
4. `python3 tools/package.py` if you deploy the two-bundle layout; upload.
5. After deploying, do one real run against the live site: create a test client, open the link in a private window, enter the key, rate a completed project, import the rating. Delete the test client afterwards.
