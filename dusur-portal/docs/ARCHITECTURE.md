# Architecture

## Constraints that shape everything

1. **Serverless.** GitHub Pages serves static files; the only "backend" is the GitHub REST API called from the admin's browser. There is no build step: what is in the repository is what runs.
2. **No modules, no bundler.** Scripts are classic `<script defer src>` files that share one global scope. This keeps the project openable by double click and editable with any text editor, at the price of discipline: load order matters and every top-level name must be unique across all files loaded on the same page. `tools/check.py` enforces both.
3. **ES2018.** No optional chaining (`?.`) and no nullish coalescing (`??`), so older phones and in-app browsers do not break on a syntax error. `check.py` parses every file and rejects newer syntax.
4. **Strict CSP.** Every page carries a `Content-Security-Policy` meta tag with no inline script and no `eval`. Everything dynamic is built with DOM calls, never with parsed HTML strings.
5. **Two audiences, one repository.** The public must never download admin code (smaller, and nothing to study), so the client page and the admin page are separate entry points with a shared `assets/` folder.

## The two pages

```
index.html                       admin-xxxxxxxx/index.html
  guard.js (head, sync)            guard.js (head, sync)
  assets/i18n/{en,ar}.js           assets/i18n/{en,ar}.js     + admin/i18n/{en,ar}.js
  assets/js/core/*   (8 files)     assets/js/core/*   (8 files)
  assets/js/client/* (7 files)     admin/js/*  (15 files), views/* (22), reports/* (6), export/* (3)
  assets/css/{base,components,client}.css      assets/css/{base,components}.css + admin css
```

Counts: client page 18 scripts + 3 stylesheets, admin page 59 scripts + 4 stylesheets. The exact order for each page is in [CODEMAP.md](CODEMAP.md), which is generated from the pages themselves.

### Load order rules

- `guard.js` first and synchronous (in `<head>`), everything else `defer`, which executes in document order after parsing.
- Dictionaries before `core/i18n.js` (it reads `window.__I18N`).
- `core/*` before anything that uses it, `client/*` or `admin/*` after `core/*`, `main.js` always last (it starts the router).
- A file may call, at load time, only things defined **earlier**. Calls made later (inside functions, event handlers) may reference anything on the page. `check.py` reports load-time use of a name that is defined in a later file.

### Global scope conventions

- Top-level `const`/`let`/`function` are shared by all files of a page; `window` properties are not used for state.
- Do **not** name a top-level binding after a `window` property (`name`, `status`, `length`, `top`, `event`, ...): a top-level `let` that collides with one throws at load. `check.py` reports these.
- Mutable shared state is declared once, in one place per page: `core/constants.js` (`routeToken`), `client/data.js` (`cstate`, `home`, ...), `admin/js/state.js` (`session`, `ed`, `store`, ...). `lock()` resets all admin state in one function.
- Files that exist in both pages' `core/` must not mention admin things; files in `client/` must not use admin-only globals. `check.py` verifies **client isolation**: the client page's script list is closed over its own definitions.

## Start-up: `guard.js`

Plain ES5, runs before anything else. It exists because a static site on someone else's CDN can fail silently, and a blank page tells nobody why.

1. Before first paint it sets `lang`, `dir` and `data-theme` on `<html>` from `localStorage` (no flash of the wrong theme or direction).
2. It records script errors into `window.__dsp.errs`. A load error counts as *hard* only for this site's own `<script>` tags (a CDN fallback failing is expected and not fatal). An uncaught error counts as hard when its file is on this origin.
3. It loads the **fonts** (IBM Plex Sans and IBM Plex Sans Arabic) without blocking the first paint: a `<link rel=stylesheet media=print>` is added and switched to `media=all` when it has loaded, with `font-display: swap`. `FONTS` at the top of the file selects `'google'` (default), `'self'` (files in `assets/fonts/`, written by `tools/get-fonts.py`, which also edits the CSP) or `'none'`.
3b. On the client page it reads `<meta name="dsp-early" content="data/public/brand.json">` and starts those downloads at once (`window.__dsp.early[path]`), in parallel with the scripts; `rawJson()` in `client/data.js` takes that answer instead of asking again, and asks normally if the early request failed.
3c. It loads **CryptoJS** without blocking the page, trying in order: the optional local copy (`assets/vendor/crypto-js.min.js`, if `USE_LOCAL_COPY` is `true`), cdnjs, jsDelivr, unpkg. It resolves `window.CryptoJS` when one works.
4. If the app never starts, or one of this site's own scripts failed, it shows a diagnostics box with the recorded errors and a hint (bilingual). A CSS-only "still loading" hint appears after about 8 seconds even when scripts are blocked entirely.

`main.js` of each page marks `__dsp.booted = true` at the start of `boot()`; if `__dsp.broken` is already set (another file crashed), it calls `__dsp.fail()` instead of rendering half an app.

## Routing

Hash routes, one `route()` per page, called on `hashchange` and after language/theme changes.

| Page | Route | Screen |
|---|---|---|
| Client | `` (empty) | Live search |
| Client | `#client/<id>` | Private project page (asks for the secret key) |
| Admin | `#config` | Connection and admin password (first-run lands here) |
| Admin | `#dashboard` (default) | KPIs, ratings, profitability by type, client list |
| Admin | `#new`, `#manage/<id>` | Client / project editor |
| Admin | `#reports` | Report picker, print, Excel |
| Admin | `#settings` | Company profile, defaults, project types, this device |

**Stale-render protection.** `route()` increments the global `routeToken`. Every async screen reads the token at its start and stops drawing if it changed while it was awaiting the network. Photos have the same idea with `imgGen`, which is bumped whenever the image cache is cleared.

**Unsaved changes.** Leaving the editor while `ed.dirty` asks for confirmation; the previous hash is restored if the user cancels.

## Speed design

- The client page is small on purpose (no admin code), scripts are `defer`, and nothing blocks the first paint except three small stylesheets and `guard.js`.
- Fonts, CryptoJS and the public company profile are requested in parallel with the scripts (see Start-up), and the connection to `raw.githubusercontent.com` is opened early with `<link rel=preconnect crossorigin>`.
- Photo thumbnails are fetched and decrypted when they come within about 500 px of the screen (`whenNear()` in `core/photos.js`, an `IntersectionObserver`); the full-size photo of the lightbox loads at once. Without `IntersectionObserver` everything loads at once, as before.
- Measurements and budgets: [QUALITY.md](QUALITY.md).

## Rendering

- `h(tag, attrs, ...children)` in `core/dom.js` builds elements with `createElement`. Children are text nodes or elements, **never parsed HTML**, so no stored string (client name, comment, caption) can inject markup. Attributes starting with `on` and a function value become event listeners.
- Screens are plain functions that return nodes and call `mount()`/`replaceChildren()`. There is no virtual DOM: a screen that changes re-draws its own container (`draw()` closures inside the editor tabs).
- Form state survives a language or theme switch because `setLang()` re-runs the route after capturing field values (form-state preservation in `core/dom.js`).
- Icons are inline SVG from the `ICONS` table; static markup in the HTML files uses `data-icon` and `data-i18n` attributes, filled by `hydrate()` and `applyStatic()`.

## State

| State | Where | Lifetime |
|---|---|---|
| `session` (derived key, token, master key, settings) | `admin/js/state.js` | Memory only, cleared by `lock()` (manual, idle timer, or closing the tab) |
| `ed` (open record, dirty flag, files to delete) | `admin/js/state.js` | Until the editor closes |
| `store` (all private records for the dashboard) | `admin/js/state.js` | Until lock |
| `cstate`, `home` (open project, search state) | `client/data.js` | Until the route changes |
| Sealed connection config | `localStorage` `dsp.config.v1` | Persistent, encrypted |
| Language, theme, idle minutes | `localStorage` `dsp.lang`, `dsp.theme`, `dsp.idle` | Persistent, not secret |

The admin password is held in memory (`session.pw`) only until the master key is unwrapped, then dropped (`session.pw = null`).

## Internationalisation

- Dictionaries: `window.__I18N = { en: {...}, ar: {...} }`. Client strings live in `assets/i18n/`, admin strings in `admin-xxxxxxxx/i18n/` and are merged in with `Object.assign(window.__I18N.en, {...})`. The client page never downloads admin strings.
- `t(key, vars)` looks up the current language, falls back to English, warns in the console about a missing key and returns the key. Placeholders are `{name}` and must match in both languages.
- Data that the user types in two languages (stage names, project types, company name) is stored as `{ en, ar }` objects and read with `L(value)`.
- Numbers, money, percentages and dates go through `Intl` with `en-GB` or `ar-EG-u-nu-latn` (Arabic text, Latin digits, so figures read the same on screen and in Excel).
- Direction is set on `<html dir>`; CSS uses logical properties (`margin-inline-start`, `inset-inline-end`) so RTL needs no separate stylesheet. Inputs holding codes, URLs and numbers are forced `dir="ltr"`.
- `check.py` verifies that `en` and `ar` have the same keys and the same placeholders, that every `t('...')` call has a key, and that client and admin dictionaries do not overlap.

## Theming

`:root` / `[data-theme=dark]` and `[data-theme=light]` in `assets/css/base.css` define colour variables (deep blue dark theme by default). Components use only the variables. The printable report paper is always light so it prints identically from either theme.

## Data flow

```
Admin browser                         GitHub repository                         Client browser
-------------                         -----------------                         --------------
edit record
  seal (AES-GCM, master key) ───────► data/private/<id>.json
  toPublic() whitelist
  encrypt (PBKDF2 + AES-256) ───────► data/clients/<id>.json  ───────────────► fetch (raw.githubusercontent.com)
  hash SKU ─────────────────────────► data/public/index.json  ───────────────►   search: SKU -> client id
  photo: resize, AES-GCM ───────────► data/clients/<id>/<photo>.t / .f ───────►   decrypt in browser
  company profile ──────────────────► data/public/brand.json  ───────────────►   header, contact card
                                                                              ◄─── rating code (WhatsApp, mail, copy)
import code, verify with client secret
```

Writes go through `github.js`, which **serialises** commits (`queueWrite`): concurrent commits to one branch conflict, so every PUT/DELETE waits for the previous one, and a 409/422 is retried once with a fresh `sha`.

Reads by clients use `raw.githubusercontent.com/<user>/<repo>/HEAD/<path>?t=<now>` with `cache: 'no-store'`; the query string avoids the raw CDN's roughly five-minute cache so progress updates show promptly. The repository is derived from the page address (`pagesRepo()` in `client/data.js`: `<user>.github.io/<repo>/`, or `<user>.github.io` for a user site), which is why the client code contains no repository detail.

## The editor, Progress and Contract screens

The admin keeps **one open record** in `ed` (`state.js`). The full editor (`#manage/<id>`), the Progress screen (`#progress/<id>/<n>`) and the Contract screen (`#contract/<id>/<n>`) are three views of that same record, so they cannot disagree and unsaved work follows you between them: the router's `inEditor(hash)` keeps `ed` while you move between these three routes for the same client, asks before you leave with unsaved changes, and drops an unmodified `ed` when you go anywhere else. Every view builds its screen from `ed.rec`, registers `ed.redraw` / `ed.hash`, and uses the shared `saveBar()` and `saveEditor()`.

- `views/progress.js`: the list (`drawProgressList`) and one project (`renderProgressScreen`); reuses `stageEditor()` (`tickAll`, `state`, no structure editing) and `tabPhotos()` from the editor.
- `views/contract.js`: `contractModel()` (everything the paper needs, in one place), `renderContractPaper()` (rows with one cell per language), `printContract()`. `contract-terms.js` holds the standard clauses and the normalisers; `views/settings-contract.js` is the signature pad / upload and the clause editor in Settings.
- The paper is an A4 `.paper.ct-paper` with its own named print page (`@page contract`), so it prints with a page counter. In "both languages" mode each row is a two-cell grid forced to `direction: ltr` (English left, Arabic right) and each cell has its own `dir`, so numbers and Latin text keep their order inside Arabic. (The class that marks this mode is `ct-bi`, not `bi`: `.bi` is the editor's two-column field layout.)
- Nothing from the contract (signature, clauses, per-project options) is copied into `toPublic()`, which is a whitelist.

## The editor

`admin/js/views/editor.js` owns the open record `ed = { rec, sha, isNew, dirty, trash, ... }` and draws the title block, live badges and tabs. Tabs (`editor-tabs.js`): Details, Stages, Parts, Payments, Costs, Photos, plus BOM (`bom.js`). Stage and checklist editing is shared with the project-type template editor (`stage-editor.js`). Saving (`editor-save.js`): validate, write the private record, publish the encrypted snapshot, upload new photos, delete removed ones (`ed.trash`), update the search index. Photos are encoded in the browser by `makeVariants()` (`createImageBitmap` + canvas): a 360 px thumbnail and a 1600 px full image, both JPEG, then AES-GCM encrypted.

## Logistics, Supply chain and Inventory

Three admin screens share one small data layer, `js/ops-data.js`, and one set of UI helpers, `js/views/ops-ui.js`. They are separate from the client records on purpose: a shipment or a material is not part of a client, and one file per kind keeps the number of GitHub requests low.

```
ops-data.js        storage + rules (no DOM): loadOps, saveOps, opsMutate, opsUpsert, opsRemove, ids (SUP-/MAT-/LG-),
                   normalisers, stockInfo / stockSummary / applyMove / onOrder, lgState / lgDone / receiveShipment, safe links
views/ops-ui.js    page header with Refresh and the report button, the form page (back link, Save bar), badges, contact links, dashboard card
views/suppliers.js | inventory.js | logistics.js     list + filters + one form each
views/reports/model-ops.js                              the six report models
```

- **Storage.** `data/private/ops/<name>.json`, sealed with the master key, `{ v, seq, updatedAt, items: [] }`. Loaded on demand (`ensureOps()`), cached in `ops`, and changed **one record at a time**: `opsMutate(name, fn)` applies `fn` to the cached list and saves with the strict `sha`; on 409/422 it reads the fresh copy, applies `fn` again and retries (3 attempts). That is why a stock movement made on a phone and a form saved on the computer both survive. The commit message is `Add <name>` or `Update <name>`.
- **One open form.** The client editor keeps the open record in `ed`; these screens keep theirs in `opsEd` (`{ name, id, rec, orig, isNew, dirty, ... }`). `touch()` marks the right one dirty, and the router's unsaved-work guard looks at both. Saving a form replaces only its own record (`opsSaveOpen` → `opsUpsert`); the fields that other actions own are protected by an `adjust` hook: a stale material form never overwrites the quantity (a changed quantity becomes a recorded stock-take on top of the fresh quantity), and a stale shipment form never loses `received`.
- **Stock rules live in one place** (`stockInfo()`), and the list, the form preview, the menu badge, the dashboard card and the reports all call it, so they cannot disagree.
- **Receiving a shipment** adds each linked line as an `in` movement carrying `ref = <shipment id>`, skips a material that already has such a movement, and then sets `received`; running it twice, or after a failure half-way, adds nothing twice.
- **Badges.** `refreshOpsAlerts()` recomputes the numbers after every load and change and `paintOpsBadge()` puts them on the Inventory and Logistics menu items (it is called again after the menu is translated).
- **Reports.** `model-ops.js` registers six models in `REPORT_OPS` (`inventory`, `reorder`, `stockmoves`, `suppliers`, `logistics`, `shipment`) and their filters in `REPORT_FILTERS`; the report screen shows the right filter fields for the type, and `#reports/<type>[/<id>]` is how the section buttons open a report. The models return the same `{ kpis, charts, tables }` as the other reports, so paper, PDF and Excel need no special case. Column hints `nw` (never wrap: ids, dates, units, statuses) and `sign` (room to write) are read by `paper.js`.

## Reports and Excel export

One **model**, two renderers:

```
reports/model.js   plain data: KPIs, chart specs, tables (finance, BOM, production, satisfaction)
   ├─ reports/paper.js + charts.js   A4 paper (HTML + hand-drawn SVG) -> window.print() -> "Save as PDF"
   └─ export/xlsx.js                 workbook: Summary, one sheet per table, one Charts sheet
        ├─ export/zip-xml.js         ZIP "store" container, CRC-32, sheet and style XML (no library)
        └─ export/xlsx-drawing.js    native DrawingML charts (bar, hbar, line, doughnut) and the logo (canvas -> PNG)
```

Because both renderers read the same model, the PDF and the Excel file always agree. Print rules (`@page`, portrait and landscape) are in `report.css`. In Arabic the workbook sheets use a right-to-left sheet view. Chart axes for counts use integer ticks, and the Excel charts set `majorUnit` to match.

## Team, roles and the History (4.4)

Four admin files and four views, all plain shared-scope scripts like the rest.

```
perm.js            areas, built-in roles, can(area, level), body[data-ro], which screen needs which area, canWritePath() (the write guard)
team-data.js       team.json, member login files, sign-in, pause / block, access re-check, rotateKeys() (the key change)
audit.js           audit() queue, diffObj(), the monthly sealed files with their hash chain, auditSave()
fin-data.js        finCompute(): direct / indirect / total cost of a period, spreading of shared costs, budget
views/team.js | audit.js | finance.js | doctor.js     the Team and My account screens, History, Finance (+ expense form), Troubleshooter
views/reports/model-fin.js                              the Costs and History report models, which report types each role may open
```

- **Who is signed in.** `session.user` is `{ id, owner, name, role, perms }`. The administrator (admin password) is `owner: true` and `can()` is always true for them. A member signs in on the second lock-screen tab: `memberSignIn()` fetches `data/private/keys/<hash>.json`, unwraps the member's private key with their password and opens the sealed envelope that holds the master key and the GitHub token, so from then on the app works like it does for the administrator, **restricted by the page**.
- **Role enforcement happens in five places**, all driven by `can()`: the router (`viewAllowed()` for each screen and the menu), `body[data-ro="<areas>"]` which the stylesheet uses to hide every control marked `data-edit="<area>"`, disabled `<fieldset>`s on the forms of areas the member may only view, the report picker (`reportAllowed()`), and **`guardWrite()`**, which every write goes through and which refuses a path outside the member's areas (`writeAreas()` maps files to areas). It is a guard against honest mistakes and a confused page, not a security boundary: see SECURITY.md.
- **Pause and block** are read from `team.json`. `refreshAccess()` runs before every save, every `ACCESS_CHECK_MS` (20 s) and when the tab becomes visible again; `accessGate()` signs the member out with a plain message when the status is paused, blocked or removed, or the key number (`kid`) moved on. Roles are re-read about every 2 minutes (`ACCESS_WATCH_MS`).
- **The key change** (`rotateKeys()`): read every sealed file as it was at **one commit**, re-seal it under a new master key, re-issue the envelopes of the members who stay, write a new `vault.json`, and publish all of it as **one Git Data commit** (blobs, tree, commit, fast-forward ref update). If somebody saved in the meantime the ref update is refused and nothing changes. The History writer is paused (`auditHold`) while this runs, because its own commit would otherwise move the head and make the key change fail (found by a test).
- **History.** Every `save` path calls `auditSave(area, act, ref, title, before, after)`, which diffs the two versions field by field (`diffObj()`, skipping bookkeeping such as `updatedAt`) and queues one entry with the signed-in person from `whoAmI()`. The queue is written in batches (800 ms after the last change) to the month's sealed file with a read-modify-write against the file's `sha`, retried on a conflict, and **never blocks or fails the user's save**; what could not be written waits and is shown. Entries are chained with `auditHash(prev, entry)`.
- **Finance.** `finCompute(sel)` is pure data: from the projects, the expense ledger, the period and the sharing basis it returns the direct and indirect totals, the share of every project, the months, the categories and the budget lines. The Finance screen and the Costs report both call it, so they cannot disagree (a test compares them). Shared costs are spread in proportion to a weight (contract price, direct cost, or 1 for each project); the fractions add up to 1, so the shares add up to the pool, and nothing is rounded until it is drawn.
- **Troubleshooter.** `views/doctor.js` is a list of small checks (`DOC_CHECKS`) that each return ok, warn, bad or skip with a detail; it is reachable before sign-in (the router handles `#doctor` first). `guard.js` shows the same kind of diagnostics when the app cannot start at all.

## Everyday tools (4.5)

Small plain scripts again, each with one job. The new ones, by theme:

```
Sign-in and profile   profile.js         own profile file data/private/profiles/<id>.json ("owner" for the administrator), picture + phone; canWritePath lets everybody write only their own
                      session.js / views/gate.js   the owner login file (team.json.ownerLogin, owner:true): the administrator signs in with a long password and no token typed
Import                import-file.js     readTable(file): CSV / TSV, JSON, .xlsx (zip + XML read with DecompressionStream, size and row limits), every cell as text
                      views/import.js    #import/<section>: map columns (guessed from English/Arabic names), preview every row (new / updated / skipped / rejected), one saved change
Share and picture     share.js           shareButton(): device share sheet, WhatsApp, e-mail, copy; text built from what is on screen only
                      export/dom-image.js  a report sheet -> SVG foreignObject -> canvas -> PNG (device fonts)
                      paper-size.js      A4 / A3 / Letter / Legal: @page rules written when a report or contract opens
Look and settings     core/look.js       fonts (short list) and one accent colour, both sites; contrast of the accent is corrected per theme
                      views/settings-more.js   cards: internal codes, fonts and colours, cost types, the settings file (export / load, applied to the draft, saved with Save)
Codes and units       codes.js           formulas such as MAT-{CAT}-{N:4}: normCodes(), the running number counted per prefix; the id stays the key, the code is the label
                      cost-cats.js       your own direct / indirect cost categories, extended in place into COST_CATS and IND_CATS; a removed one reads as "Other"
Collections           core/domain.js     collectionPlan / collectionNext / collectionSum (shared by both sites; the client sees the plan through toPublic)
                      views/schedule.js  the card on the Payments tab (rows, split into equal instalments)
                      views/collections.js     #collections: every open instalment of every client, filters, WhatsApp reminder, copy
                      views/reports/model-coll.js   #reports/collections: the same rows as a report
```

- **Collection plan.** The money outside the schedule (price minus scheduled amounts) is taken off what the client paid first (the deposit), and what is left covers the instalments from the earliest due date on. Each row gets `covered`, `outstanding`, `days` (to the due date) and a status: paid, overdue, partial, upcoming. Both sites call the same function, so the number on the client's money card and the number in Collections cannot disagree (a test compares them). A balance with no date is `undated`; a schedule that adds up to more than the price is `over` and is flagged in the editor.
- **WhatsApp links.** `waHref()` / `waSendTo()` build the link from the phone number; the WhatsApp number of a client can differ from the phone (`waOverrideOk()` checks it), and the reminder text is one translated string filled with name, amount, project reference and date.
- **Client id with the SKU.** `skuRef(rec, p)` gives `<client id>/<sku>` wherever a project is named for a person (Collections, reminders, contract, reports). The SKU itself is unchanged.
- **The settings file** is the settings that can be carried to another installation, written as JSON (`{ kind: 'dusur-settings', v, exported, settings: { profile, business, contract, codes, costCats, look, paper } }`); `cfgApply()` checks each section with the same normalisers the Save button uses (`sanitizeBrand`, `normCodes`, `normLook`, `normCostCats`, `normPaper`) and fills the draft of the cards, so nothing is saved until Save. It never contains a token, a password, a key or the client inbox address.
- **The import** never writes while you look: the preview is computed from the file and the saved data, and "Import" applies all rows in one `opsMutate` per section, so a failed save changes nothing. Rejected rows can be downloaded with the reason.

## Contracts, labels, files and pictures (4.6)

Again small plain scripts, each with one job. The new ones, by theme:

```
Contracts            contract-terms.js  normPc(): per-project wording (template id, own clauses, status draft / issued / signed, dates); normTemplates(): up to 12 named sets of clauses
                     views/contract.js  the contract screen: wording picker (standard / template / own), status, formal black-and-white copy (class ct-bw, print title "-bw")
                     views/contracting.js     #contracting: one line per project (contractRows()), filters, search
                     views/reports/model-ctr.js   #reports/contracts: the same rows as a report
                     views/settings-contract.js   templates card in Settings (add, rename, edit clauses in both languages)
Labels               label.js           settings.labels (normLabels), Code 128 set B bars (code128Bars), QR code (qrMatrix: byte mode, level M, versions 1 to 3, Reed-Solomon over GF(256))
                     views/labels.js    #labels/<client>/<n>: the sheet of labels, one @page lbl of exactly the label's size per label
Files with records   attach.js          sealed files with the master key (data/private/files/<id>.bin), pictures shrunk to JPEG, a 72 px thumbnail kept in the record, brands list
                     views/attach-ui.js the card with the list of files, the picture field of an item, the brand drop-down; pending in memory until the record is saved
Client media         core/photos.js     photoUrl / videoUrl / dlUrl (decrypt in the browser), viewer with zoom, swipe and keys, video link kinds, download list (DL_EXT), saveBlob
                     core/brand.js      brandVcard() / saveContactFile(): a vCard 3.0 made from the public profile
                     views/editor-tabs.js     the Photos tab: video upload and link, the downloads card
Overview             views/reports/model-ovw.js   #reports/overview: the whole company in one report model (KPIs, charts, tables), private
```

- **Contract wording.** Three sources, in this order: the clauses written for the project (`contract.own`), a template of Settings (`contract.tpl`), the standard clauses of Settings. `ctTermsText()` fills the tokens; the text boxes are bound to `pc.terms.en / ar`, so *copy wording* and *clear* **change those objects in place** (replacing them detaches the boxes: found in testing). The formal copy is only a CSS class on the paper; nothing is stored for it.
- **Labels.** A label is a DOM block the size of the label in millimetres; `@page lbl { size: W mm H mm; margin: 0 }` makes every label its own page. A long strip scrolls in its area on a phone instead of shrinking; the text shrinks inside the label (`fitLabel`) rather than the label growing. The QR code is drawn as one SVG path of dark modules with a quiet zone of 2; the barcode is kept as an option because 25 mm is too small for a whole SKU in Code 128 for many scanners.
- **Sealed files.** `attSeal` / `attOpen` use AES-GCM with the master key and an `IV || ciphertext` layout, like a client's photo. A file is kept in `opsEd.pending` until the record is saved and the ones dropped from a record are in `opsEd.trash`, deleted after the save. The key change re-seals `files/*.bin` with the other private files.
- **Media on the client site.** `.v` and `.d` use the client's key like `.f`. A video is read whole and played from a blob URL (limit 24 MB); a download is decrypted and **saved** with `saveBlob`, never opened in the page. The Content-Security-Policy gives `media-src` to `'self' blob: https:` for direct video links only; the pages of other sites are opened, not embedded.
- **Down payment.** One schedule row has `deposit: true` (the editor keeps the first when several are flagged). `collectionPlan()` returns it as `deposit` on its row; the client site shows `#downPay` and takes the flagged row out of the *next payment* box; Collections and the report add *Down payment* to the status.
- **Overview report.** `overviewModel()` reads the clients, the inventory and the logistics files and returns `{ kpis, charts, tables }` like every report, so the paper view, *Save as PDF*, the picture and Excel use the same model. *Needs attention* is only added when something needs it.

## Ratings

1. The portal shows a rating card when a project is completed (`client/rating.js`), `score` 1 to 10 plus an optional comment (600 characters).
2. `makeFeedbackCode()` encrypts `{ v, id, sku, score, comment, at }` with the **client's own secret key** (same derivation as the snapshot) and prints `DSFB1.<client id>.<base64url ciphertext>`.
3. The client page **sends the code itself** to the company inbox when `brand.inbox` is set: `sendToInbox()` posts `{ v: 1, code }` (`text/plain`, no credentials, 20 s timeout) to a Google Apps Script web app ([INBOX.md](INBOX.md)). Answer `{ ok: true }` = **sent**; the answer cannot be read by this browser (a CORS refusal) = it tries again in `no-cors` mode and reports **sent, not confirmed**; anything else = **failed**. The state is kept in `localStorage` (`dsp.fb.<client>.<sku>`) so a reload or a later **Try again** works. WhatsApp, e-mail and copy stay as other ways.
3b. The admin page pulls from the inbox with the private pick-up key (`inboxPull()` in `views/feedback.js`): rows after the last one imported (kept in `localStorage`), up to 200 per request, imported exactly like pasted codes, place moved on only when every code was dealt with. The dashboard does it once on opening (at most every 10 minutes, only for people who may edit ratings) and the ratings card has a button.
4. In the admin Dashboard, "Import ratings" accepts any text containing codes; each is verified with the secret of the client it names (`readFeedbackCode`), checked for a known SKU, and ignored if older than the rating already stored. Accepted ratings are saved into the private record and republished, so they show on the dashboard, in the editor, and in the satisfaction report.

## Why these choices

| Choice | Reason |
|---|---|
| Separate client and admin pages | The public downloads ~100 KB with no admin code; the admin has no reason to be indexed or linked |
| Hash routing | GitHub Pages cannot rewrite URLs; `#client/<id>` works on any static host |
| No framework | Zero build, zero dependencies besides CryptoJS, long-term readable code |
| Vault in the repository | Any device with the admin password can unlock, with no server to sync |
| SKU index hashed | Live search by project number without publishing names or phone numbers |
| CryptoJS for the snapshot, WebCrypto for the rest | The snapshot format is the original one (kept for compatibility); everything newer uses native AES-GCM |
