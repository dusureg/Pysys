# Tests

End-to-end tests that drive the real pages in a real Chromium (Playwright for Python) against a **simulated** GitHub. Nothing touches the network, a real repository or a real token.

```
cd tests/e2e
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers python3 run.py     # all suites, one shared simulated repository
python3 boot.py                                               # start-up resilience, both pages
python3 ../tools/test_get_fonts.py                            # the font self-hosting tool, against a fake font server
python3 run.py s01_admin_setup s02_photos_second_project     # selected suites only (they build on each other, keep the order)
HEADED=1 SLOWMO=300 python3 run.py s03_client_portal         # watch it in a visible browser
```

Exit code 0 means every check passed; each check prints `PASS`/`FAIL`. Screenshots and downloaded files go to `tests/.out/` (git-ignored). Use the browser path that matches your machine (the `PLAYWRIGHT_BROWSERS_PATH` line is only needed where Chromium is installed in a non-default place).

## What you need

- Python 3 with `playwright` and a Chromium it can launch.
- For suite `s04` only: `openpyxl` (reads the generated `.xlsx` and checks cells and charts) and LibreOffice (`soffice` on the PATH; it opens the workbook and renders it to PDF, which proves the native charts are valid). Without them `s04` fails; run the other suites by name if you cannot install them.
- For suite `s08` only: the poppler tools `pdfinfo`, `pdftotext`, `pdfimages` (and `pdftoppm` for the page pictures) to check the real PDF the browser produces for the contract (page count, text order, the signature image on the last page).
- Nothing else. Python's standard library does the rest.

## How the simulation works (`mockgh.py`)

Every request the browser makes is intercepted and answered by `Mock`:

| Real thing | Simulated by |
|---|---|
| GitHub Pages (`https://abdo.github.io/portal/...`) | Serves this project's folder (override the root with `PORTAL_ROOT=/path`) |
| GitHub contents API (`api.github.com`) | In-memory repository: GET/PUT/DELETE with SHA checks, conflicts, directory listings, a request log and commit list; it can inject a failure on purpose (`s99`) |
| `raw.githubusercontent.com` | Reads the same in-memory repository |
| The CryptoJS CDNs (cdnjs, jsDelivr, unpkg) | `fixtures/cryptojs-standin.js` |
| Google Fonts (`fonts.googleapis.com`, `fonts.gstatic.com`) | A stylesheet that declares the two families (weights 400 and 700) and one small stand-in font file (`fixtures/standin-font.ttf`); `mock.fonts = 'hold'` never answers, `'fail'` blocks the network |

The stand-in implements CryptoJS's AES passphrase mode (OpenSSL `Salted__`, MD5 key derivation, AES-256-CBC, PKCS7) in about 100 lines, because **the sandbox these tests were developed in could not download the real library**. To run against the real thing, set `CRYPTOJS_FILE=/path/to/crypto-js.min.js`; the mock then serves that file for all three CDN URLs. Do this at least once on your own machine.

The simulated site address is fixed (`abdo` / `portal`), so tests do not depend on your real account. The admin folder is found automatically (`admin-<8 hex>`), so renaming it does not break the tests.

## Suites

Suites run in order against **one shared repository**; each builds on the data the previous one created. `s99` is destructive and must stay last.

| Suite | Covers |
|---|---|
| `s01_admin_setup` | First run and redirect to Configuration, password rules, test connection, vault creation (wrapped key only), no token or password in plain `localStorage`, creating a client with finance data (remaining balance, COGS, gross and net, margins, markup, stage ticking), and what actually reaches the repository: ciphertext only, no client data in commit messages |
| `s02_photos_second_project` | Encrypted photo upload (thumbnail and full image), link photos (plain `http` rejected), second project and the SKU generator, default due date, dashboard totals and profitability by type, share-link format and Copy Link, dashboard search |
| `s03_client_portal` | Private link and key form, wrong and right key, portal content (project switcher, time left, tape measure, money, stages, parts), what the client does **not** receive (costs, notes, secret), whitelist check on the decrypted snapshot, photos and lightbox, Arabic RTL, light theme, phone width, lock, not-found and malformed IDs |
| `s04_bom_reports_ratings` | BOM tab and sync to costs, company profile publishing, the four reports on screen, as print/PDF and as Excel (native charts, checked with openpyxl and LibreOffice), scope and date filters, Arabic reports, rating round trip (client makes a code, admin imports it), second-device login |
| `s05_client_search` | Live search by Client ID and by SKU through the hashed index, brand and contact buttons, key form from the search page, not-found and format hints, public index privacy, Arabic, phone width, no GitHub API calls from the client |
| `s06_visual_pass` | Screenshots of the BOM and reports screens and the rated client page for a human to look at, plus layout assertions (no horizontal scroll on a phone) |
| `s07_progress_photos` | The Progress & photos screen: list, filters and search, ticking tasks, Tick all, saving and publishing, the WhatsApp update link (international number, link only, never the secret key), photo upload from this screen, moving to the full editor and back without losing unsaved work, the unsaved-changes question, no false "discard" question after Settings, phone layout and tap size |
| `s08_contract_signature` | Settings, Contract and signature: drawing and uploading a signature, validation, what is stored (sealed, never public), the contract paper in Arabic, English and both languages, tokens, warranty wording, special conditions, the signature block being last, per-project options, **the real PDF** (page count, no app chrome, text order, signature image on the last page, both-languages layout, payments table not split), Arabic screen and phone |
| `s09_fonts` | The IBM Plex fonts: CSP hosts, one stylesheet request for both families and two weights, non-blocking link, the right family in English and in Arabic, a font server that never answers and a blocked network (the page still starts, no diagnostics box), the admin screens and the printable paper use the same stack |
| `s11_supply_chain` | Supply chain: menu items, empty state, adding a supplier with every field, sealed storage (no plain text), safe `tel:` / WhatsApp / `mailto:` / website / map links with `noopener`, refusal of bad e-mail, phone, `javascript:`, `data:` and `ftp:` addresses, duplicate names, unsaved-changes guard, search and filters, inactive suppliers, a change made on another device (conflict re-applied), a supplier added on Arabic input |
| `s12_inventory` | Inventory: adding materials, ids, opening stock as the first movement, an alert of every kind on the right item, filters and search, the to-order list (grouped by supplier, suggested quantities, on-order subtracted), receive / use / stock-take with history, refusing to use more than the stock, validation, a stale form that must not overwrite a quantity changed on another device, supplier deletion blocked while in use, the dashboard card, Arabic |
| `s13_logistics` | Logistics: a new shipment with standard steps, add / rename / reorder / remove / re-date steps, saved and reloaded after unlock, one-tap "Done", late and blocked states and the menu number, receiving into the inventory (adds once, even if asked twice), outgoing shipments to a client project, type switch rules, unsaved-changes guard, a shipment added on another device kept, cancel, delete, ids never reused, Arabic |
| `s14_ops_reports` | The six new reports: opened from each section's print button, numbers checked against the raw data, filters, real PDFs (orientation, logo, date, no menu; the shipment sheet is one page), Excel files (sheets, numbers, native charts, Arabic right-to-left, opens in LibreOffice), empty states, Arabic |
| `s15_team` | Team and roles: adding members, first sign-in with a temporary password that must be changed, the five built-in roles and custom ones, what each role sees (menu, read-only forms, no Save bar), the write guard (a role cannot save a file it does not cover), pause and resume, block (login file deleted, signed out within the check interval), reset, remove, changing the encryption key (one commit holds every re-encrypted file; the administrator and the remaining members keep working) and that the History records these, with nothing readable in `team.json` or a login file |
| `s16_history` | History: sealed monthly files, an edit listed field by field, record links and chips, filters, months with "show more", the hash chain (an edited or removed entry in the middle shows **Broken**), entries waiting while the connection is down, the History report and its Excel, who may open it |
| `s17_finance` | Finance: a hand-computed 2019 quarter (direct, indirect, total, profit, overhead rate, break-even), recurring and yearly expenses, spreading of shared costs by price, direct cost and equally (the shares always add up to the shared cost), the monthly budget, ledger filters, the Costs report (KPIs, tables, charts, Excel, empty state), view-only rights, and that deleting an expense is in the History |
| `s18_inventory_table` | The Inventory table and Cards: columns, totals row, grouping and sorting (and their reverse), folding groups, filters, quick stock movements from a row, view-only, Arabic, a phone (cards by default; the table scrolls inside its own frame, never the page) |
| `s19_inbox` | Ratings sent from the client site: the Settings card (address and key checks, key maker, test button), the client sending (sending, sent, sent-not-confirmed, failed, retry, a reload in the middle, Arabic), the admin pulling (button and automatic check, the remembered place, duplicates, rubbish codes, wrong key, no connection), what stays private (key never in public files or the History); the simulated Apps Script is `Mock.apps_script()` in `mockgh.py` |
| `s20_audit` | Page speed (first paint, usable, blocking time, layout shift, files and gzip size, opening a portal, early `brand.json`, lazy thumbnails) and usability rules on **every** screen of both sites (the new screens of 4.4 and the client rating states included) in English and Arabic, dark and light, desktop and 360 px phone (names, contrast, tap size, 16 px fields, focus ring, sideways scroll, heading count, the word "null"). It fills `tests/.out/audit.json` |
| `s21_doctor` | The Troubleshooter: before and after signing in, every check's status, skipped (not failed) checks when not signed in, GitHub unreachable, the rate limit nearly used up, a file of the page that cannot be reached, the copied report holds no secret, Arabic, phone, and that it changes nothing in the repository |
| `s22_owner` | The administrator's own user name and long password (no GitHub token typed) from a device that never saw the connection, full rights, a changed password, the sign-in removed; profiles (phone, picture): a member edits only their own, the files are sealed and survive a change of the encryption key |
| `s23_codes_bom` | Internal codes: the formula in Settings and its checks, MAT / SUP / LG codes with the running number per prefix, a changed formula that leaves old codes alone; the BOM linked to the stock: a BOM line names a material, "Take from stock" moves the quantity out of Inventory, "Put back" returns it, and the project remembers what was taken |
| `s24_import` | Import of CSV, TSV, JSON and Excel into Inventory, Suppliers, Shipments and Expenses: column guessing in English and Arabic, the preview of every row, new / updated / skipped / rejected, a hostile or damaged file, size and row limits, the rejected-rows download, one saved change, roles |
| `s25_look_paper_share` | Fonts and accent colour on both sites (and contrast of the accent), paper size of reports and contracts, the Share button and its text, a report saved as a picture, the settings file (export, load, bad files), the public `brand.json` whitelist |
| `s26_collections` | The collection schedule: instalments, split into equal parts, the deposit-first allocation checked by hand at four stages of payment, paid / partial / overdue / upcoming, what the client sees (and does not), the Collections screen (filters, search, WhatsApp reminder text and link, copy), the report and its Excel file, client id with the SKU, the WhatsApp number of a client that differs from the phone |
| `s27_cost_cats` | Your own cost categories: add direct and indirect names in two languages, use them in a project cost line, an expense, Finance and the Costs report, import by either name, the settings file, removal reading as "Other" with the amounts kept |
| `s28_audit_new` | The quality audit of the 4.5 screens (Collections, Import, the new Settings cards, Profile, the schedule card), English and Arabic, dark and light, desktop and phone: names, contrast, tap targets, sideways scroll |
| `s29_files_brands` | Brands (add, rename, duplicates refused, removal says how many materials use it), the picture of an inventory item (a small copy in the record, the full one sealed in `files/<id>.bin`), invoices on expenses and shipments (PDF and pictures sealed, removed after the save, refused when too big or wrong), the key change re-sealing the files, the write guard |
| `s30_media_viewer` | Videos sealed like photos (`.v` and a poster), video links told apart from picture links, the client's viewer (zoom, swipe, keys, playing a decrypted video from memory, a video on another site opening there, a failed download saying so) |
| `s31_downloads_contact` | Files for the client to download (3D, drawings, PDF with an awkward name, a 1.5 MB zip) stored sealed as `.d`, saved byte for byte under the cleaned name, refused types and sizes, the vCard of "Save our contact", the client's key change with sealed videos and files |
| `s32_contracting` | Contracting list and filters, the per-project wording (standard, template, own wording, copy and clear), status and dates, the report, contract data staying out of the client snapshot, the contract number and conditions on the paper |
| `s33_labels` | Labels: the sizes, fields, one label per page of exactly its size in real PDFs, the QR code **decoded from the PDF with OpenCV** at 300 and 203 dpi, Code 128 bars checked structurally and with an independent decoder, strips on phones, settings kept |
| `s34_addons` | The down payment (one per project, shown once, marked in Collections and its report), the formal black-and-white copy (the PDF checked pixel by pixel for colour) and the Company overview report with its *Needs attention* list |
| `s35_audit_46` | The quality audit of the 4.6 screens (Contracting, the contract with its wording and formal copy, Labels, the overview and contracts reports, Settings cards, inventory and shipment file cards, and on the client site the down payment, the viewer and the downloads), English and Arabic, dark and light, desktop and phone |
| `s99_admin_extras_destructive` | Language switch in the editor, unsaved-changes guard, GitHub 403 handling and retry, new project type, lock/unlock, password change (vault re-wrapped), delete client, reset configuration; the run ends by checking that no page logged an unexpected console error |

Plus `boot.py` (not part of the shared run): slow and blocked CDNs, fallback to the second and third CDN, the local `assets/vendor` copy, a script that crashes, a file that fails to load (and the Reload button that recovers it), scripts blocked by the host. The goal is that nobody ever sees an empty page: either the app starts or a visible message says why.

Counts at hand-over (4.6): `run.py` 1,313 checks, `boot.py` 24, `tests/tools/test_get_fonts.py` 24; `tools/check.py` all static checks. The last full pass of `run.py` was 1,313 / 1,313. Earlier passes of this release found real defects that are now fixed (see [../docs/QUALITY.md](../docs/QUALITY.md#found-and-fixed-in-46-contracting-labels-files-media-down-payment-overview)); run the suites one at a time, never two browsers at once on a small machine.
