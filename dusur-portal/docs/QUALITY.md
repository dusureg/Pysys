# Quality report: speed and ease of use (v4.6)

What was measured, what was found, what was changed and what is still open. Everything here can be repeated: the audit is a test suite (`tests/e2e/s20_audit.py`) that runs with the others and fails when a rule is broken again.

## How it was measured, and what that cannot tell you

The audit runs in a real Chromium against the project files, with GitHub, the CDNs and Google Fonts **simulated** (see [../tests/README.md](../tests/README.md)). So:

- **Measured for real**: how many files each page needs, their size (raw and gzip, the way GitHub Pages sends them), the order requests are made in, and how long the browser takes to paint and become usable **with the CPU slowed 4 times** (a mid-range phone). Layout shifts and blocking time come from the browser itself.
- **Not measured**: the network. The local simulation answers instantly, so no real latency or bandwidth is in these numbers. The "slow 4G" figures below come from a simple model (150 ms round trip, 1.6 Mbit/s, 3 round trips to open a connection, 4 for each other host), and are an **estimate**, not a measurement.
- **Not done**: a Lighthouse / PageSpeed run against your real address, and tests on a real phone. Both need the site to be online. See [Check it on the real site](#check-it-on-the-real-site).

## Page speed

| | Client site | Admin site (lock screen) |
|---|---|---|
| Files on first visit (own files) | 23 | 84 (budget 96) |
| Size, raw / gzip | 144 KB / 54 KB | 972 KB / 321 KB (budget 330 KB gzip) |
| Other hosts | CryptoJS CDN, Google Fonts, `raw.githubusercontent.com` | CryptoJS CDN, Google Fonts |
| First paint (CPU 4x slower) | 0.3 s | 0.35 s |
| Usable (search box / password box ready) | 0.57 s | 0.73 s |
| Layout shift while loading | 0 | 0 |
| Main-thread blocking time | 70 ms | 56 ms |
| First visit on slow 4G (model) | about 2.2 s | about 3.6 s (3.1 s in 4.4) |

The 4.6 column is one full run of `s20_audit.py`; the older versions were measured the same way over several runs.

Ranges in older versions were the spread over several full runs on a shared machine. **4.6 grew the first visit of the admin site by 7 files (77 to 84) and about 40 KB gzip (281 to 321 KB)**: contracting, labels with a QR code generator, sealed files, brands, the overview report. The file budget was raised from 80 to 96 on purpose; the size budget (330 KB gzip) is nearly used. The owner is the only visitor and files are cached after the first visit, but this is the last headroom: the speed work planned for 4.8 is where the first visit is meant to get smaller again. The admin site grew from 54 to 64 files and from 159 to 225 KB gzip in 4.4 (team and roles, History, finance, inventory table, Troubleshooter); the owner is the only visitor and the files are cached after the first visit, so the budget was raised on purpose (80 files, 330 KB) instead of hiding the growth. Other numbers:

- Opening a client's private link (key stretching with 310,000 PBKDF2 rounds, download, decrypt, draw) takes **0.35 - 0.6 s** with the CPU 4 times slower. The PBKDF2 cost is a security setting and was deliberately **not** lowered.
- A client page with 40 photos starts as fast as one with 4: thumbnails are downloaded and decrypted only when they get within about 500 px of the screen (tested with 12 photos 6,000 px down the page: none requested at first, only the nearby ones after scrolling, all after scrolling through).
- The client page contains no admin code (enforced by `tools/check.py`), which is why it is about a third of the admin site's size.

### What was changed in 4.2

| Change | Why |
|---|---|
| Fonts load **without blocking** the first paint: the stylesheet is attached with `media=print` and switched on when it arrives, `font-display: swap`, and the font host is pre-connected | Text appears at once in the system font and changes to IBM Plex when the font arrives. If the font host is slow or blocked, nothing waits and nothing breaks (tested with a server that never answers and with a blocked network) |
| Only two weights of each family are requested (400 and 700) | Less to download. 500 maps to 400 and 600/800 map to 700 |
| The client page opens the connection to `raw.githubusercontent.com` early (`preconnect`) and starts the public company profile download from `guard.js` **while the scripts are still downloading** | `brand.json` used to be requested only after every script had run. Now it is requested once, before the scripts finish (tested by request order and count) |
| Photo thumbnails load lazily | See above |
| `loading="lazy"` on photo images | Link photos from other sites are not fetched until near the screen |
| Phone layout: compact static header (the old sticky three-row header took a large part of a small screen) | More room for content, less repainting while scrolling |

### Left as it is, on purpose

- **22 and 64 files instead of one bundle.** On GitHub Pages (HTTP/2) many small files load in parallel, the browser caches each one separately, and an update re-downloads only the files that changed. Bundling would need a build step, which this project does not have. If you ever want fewer requests, a bundler can be added without changing the code (the scripts are plain and in a fixed order, see [CODEMAP.md](CODEMAP.md)).
- **GitHub Pages caches files for about 10 minutes.** You cannot change that on GitHub Pages. After an update, reload with Ctrl+Shift+R.
- **Key stretching time.** Fast on a phone, intentionally not faster.

## Ease of use

Every screen of both sites was checked in English and Arabic, dark and light, on a desktop and on a 360 px phone (the client editor with every one of its tabs, the progress screen, the contract, reports, settings, the client search, the found-client form and the opened portal; since 4.3 also the supplier, material and shipment lists and forms, the quick stock-movement box, and the six new reports; since 4.4 also Team (list, member form, roles), History (list, record view), Finance (overview, costs, expense ledger and form, budget), the inventory table and cards in both languages and on a phone, the Troubleshooter, the inbox card in Settings and every state of the client's rating box: writing, sending, sent, not confirmed, not sent).

| Rule | Standard | Result now |
|---|---|---|
| Every field and drop-down has a name a screen reader can read | WCAG 4.1.2 | none missing |
| Every button and link has a name | WCAG 4.1.2 | none missing |
| Text contrast at least 4.5:1 (3:1 for large text) | WCAG 1.4.3 (AA) | none below |
| Tap targets at least 40 px on a phone (WCAG minimum is 24 px) | WCAG 2.5.8, Apple/Google guidance | none below 40 px |
| Fields at least 16 px on a phone, so iPhones do not zoom the page when you tap one | iOS behaviour | none below |
| No sideways scrolling at 360 px | WCAG 1.4.10 | none |
| Keyboard focus is visible (first 10 - 12 Tab stops of the search page, dashboard, progress project, contract and settings) | WCAG 2.4.7 | none missing |
| One main heading per screen | WCAG 1.3.1 / 2.4.6 | one |
| No `null`, `undefined`, `NaN` or `[object Object]` on any screen | - | none |
| `<title>`, `lang`, `dir`, viewport (zoom allowed), unique ids, image text, safe external links, password autocomplete | - | all in place |

### Found and fixed in 4.6 (Contracting, labels, files, media, down payment, overview)

The new screens are audited by `s35_audit_46.py` with the rules above (names on every control, tap targets, contrast in both themes, no sideways scroll, keyboard focus): Contracting, the contract (wording, own wording open, formal copy), Labels (square, with QR code and barcode, strip), the Overview and Contracts reports, the Settings cards, the inventory and shipment file cards, and on the client site the down payment, the viewer and the downloads, in English and Arabic, dark and light, desktop and phone. Real defects found by the tests of this release:

| Found | Fix |
|---|---|
| The picture viewer opened a small picture at about 1,440 px wide and had a live zoom-out button at 100 % | Sizes follow the fitted picture; the zoom buttons start disabled |
| Contract *own wording*: after *copy wording* or *clear* the text boxes were detached from the record (the clauses object was replaced), so typing changed nothing | The clauses are changed in place |
| Report row counts included the total row | Counted without it |
| A long label strip was squeezed to the screen width on a phone | The label keeps its size and its area scrolls |
| On a 2.5 cm label a whole SKU in Code 128 is too fine for many scanners | A **QR code** option was added (decoded with OpenCV from the printed PDF); the barcode stays as an option with a hint |
| Label settings changed in Settings were not picked up by an open Labels screen | The screen rebuilds its choices when the settings change |
| Changing a client's key stopped with "Not found (404)" when one sealed file of a project was no longer in the repository | A missing file is skipped and the save says how many could not be re-encrypted |
| *Print report* on Contracting kept the client picked in an earlier report | The company-wide reports start from all clients |
| The project tabs on the Labels screen were 29 px tall on a phone | 40 px |

Four checks were also changed because the **check** was wrong, not the product (a stock test read a stale toast; a "no plain text" check looked for 4-letter words in random base64 text; an expense clean-up in the audit raced the screen before it; two new suites left dialog handlers behind). Not tested here, because the sandbox cannot: a real label printer, a real barcode scanner (Code 128), real WhatsApp / Google Fonts / the phone's share sheet and contact import, real YouTube / Vimeo playback.

### Found and fixed in 4.5 (Owner sign-in, Profile, Import, Collections, Cost categories, Look, Codes, BOM)

The new screens are audited by `s28_audit_new.py` with exactly the rules above: Team (administrator sign-in card), Profile, the three steps of Import, Collections, Settings (look, paper, codes, cost categories, settings file), the schedule on the contract, the BOM with its stock links and the client's money card with the schedule, in English and Arabic, dark and light, desktop and phone.

| Found | Fix |
|---|---|
| The contract's "Open Settings" warning link was a bare text link, 22 px tall on a phone (under the 24 px limit) | It is a small button now, 40 px |
| The accent colour is chosen by the owner. Text in the accent colour on its own 14 % tint (notice boxes, badges) was at 3.9 - 4.0:1 on the dark theme even though the colour was readable on the page itself | The look settings now tune the accent against the surface **and** against its own tint (`lkTuneTint`), so a chosen colour that is too weak is nudged until the text on the tint is above 4.5:1 |
| On the client site the schedule badges **Pending** (4.47:1) and **Overdue by N days** (4.34:1) were just under the limit on the dark theme, English and Arabic | Their text is mixed toward the body text colour, as the admin site already did (above 4.5:1 on every surface) |
| Changing the unit of a BOM line did not refresh the *in stock* badge that links the line to a material | The line re-links when the unit changes |
| Removing a BOM line that had been taken from stock left the row on screen until the next redraw (the save redrew a list that was no longer attached) | The line is removed by identity and the screen that is attached is the one redrawn |

The audit reports **no finding** on any screen of either site after these fixes.

### Found and fixed in 4.4 (Team, History, Finance, Inventory table, Ratings, Troubleshooter)

| Found | Fix |
|---|---|
| The client rating form printed the word **null** between the comment box and the button (an empty child passed to `replaceChildren`) | The screen drops empty children, and so does the shared `mount()` helper and the two screens that spread arrays |
| The inventory **table** made the whole admin page scroll sideways on a phone (688 px on a 390 px screen): a screen-reader-only label inside the table was positioned outside the table's scrolling box | The scrolling box is now the positioning parent |
| History record links and "fields changed" summaries, the table header (sort) buttons and the role / permission drop-downs were under 40 px on phones (some under 24 px); the Arabic "Back" button was 36 px wide | At least 40 px on phones (44 px for Back) |
| The Troubleshooter's "files of this page" check and the start-up diagnostics of both pages were **blocked by the page's own security policy** (`connect-src` had no `'self'`) so they reported nothing useful | `'self'` added to `connect-src` on both pages; documented in [SECURITY.md](SECURITY.md) |
| Changing the encryption key could fail with "not a fast-forward" when the History writer committed at the same moment | The writer is paused and flushed first (`auditHold`), then released |
| A dictionary key that exists in no language file (inventory table) was not seen by the checker | The checker now treats any text that looks like a key as a key |

The audit now reports **no finding** on any screen of either site (English and Arabic, dark and light, desktop and 360 - 390 px phone).

### Found and fixed in 4.3 (Logistics, Supply chain, Inventory)

| Found | Fix |
|---|---|
| Once the Inventory menu item showed its alert number, the **whole admin page could be scrolled sideways on a phone** (578 px wide on a 360 px screen): the number's hidden screen-reader text was positioned outside the scrolling menu | The menu links are now the positioning parent, so the text stays inside the menu |
| The alert number in the menu, the red "Out of stock" badge and the grey "No supplier" / "Above maximum" badges were at 4.3 - 4.47:1 on the dark theme | The menu number is now solid (dark text on red); the red and grey badge text is mixed toward the body text colour (above 4.5:1) |
| The small "Open" link in the to-order card was 36 px wide (21 px in Arabic) on a phone | Links in rows are at least 40 px wide and tall on phones |
| The inactive suppliers were offered in the supplier drop-down of a new material or shipment | Only active suppliers are offered; the supplier already chosen on an old record stays visible |
| The shipment sheet needed two pages, ids and statuses broke across lines in report tables ("LG-" / "0003", "Complete" / "d"), and dates wrapped | Ids, dates, units and statuses never wrap in report tables; the shipment's details use two label / value pairs per row; the sheet is one page |
| After a reload, the first publish of a file that already exists sent a request GitHub answers with 422 (a red line in the console), then retried | The app asks for the file's version first when it has not seen it in this session; no failed request |

### Found and fixed in 4.2

| Found | Fix |
|---|---|
| Status drop-downs for stages, parts, cost type, category and unit had no name | They now say "Status: <stage>", "Cost type", "Category", "Unit" (English and Arabic) |
| Date fields in the Parts and Payments rows had no name | Named "Due date" / "Date" |
| Small buttons (33 px), the language and theme buttons (26 - 38 px), menu links (38 px), "Back" and tick-box rows (24 px), collapsible section headers (27 px) | At least 40 px on phones and touch screens |
| Single fields at 12.5 - 13.5 px (the key box, notes, rating import, contract text) | 16 px on phones |
| The contract page was 10 px wider than a 360 px phone | Grid children may shrink (`min-width: 0`), and a wide table scrolls inside its own box |
| Light theme: green and amber badges at 3.4 - 4.1:1, small grey report labels at 3.6:1 | Darker light-theme colours (5.1:1 and above), report grey 6:1 |
| Report and contract paper titles were second main headings | They are second-level headings |
| Earlier in this release: "null" printed in the stage list, the editor and the lightbox; a wrong "discard changes?" question after saving; tall sticky header on phones | Fixed and covered by tests |

The audit found no problem in keyboard focus. (One date field looked like a failure: Tab moves into the browser's own calendar button, which draws its own ring. The audit skips native controls.)

### Rules enforced from now on

`s20_audit.py` fails the run if any of these appear again on any screen: an unnamed field or button, text under the contrast limit, a tap target under 40 px or a field under 16 px on a phone, sideways scroll, a missing focus ring on those Tab stops, a second main heading, duplicate ids, stray `null`/`undefined`, missing page title / language / direction / viewport, an image without `alt`, an external link without `rel=noopener`, a password field without `autocomplete`. It also fails on speed budgets: client first paint within 1.5 s and usable within 2.5 s with a 4x slower CPU, admin within 3 s, layout shift at most 0.05, blocking time at most 300 ms, client page at most 25 files and 120 KB gzip, admin at most 80 files and 330 KB, opening a portal under 4 s, `brand.json` requested once and early, thumbnails lazy.

## How to run it

```
cd tests/e2e
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers python3 run.py          # everything, including s20_audit
```

The full measurements (every request with its timing, every finding) are written to `tests/.out/audit.json`.

## Check it on the real site

Do these once after deploying, they cover what a simulation cannot:

1. Open `https://pagespeed.web.dev/` (or Chrome DevTools, Lighthouse tab, mobile) and test the **client address**. Expect a good score for performance and accessibility. Items you may still see and can ignore: "serve static assets with an efficient cache policy" (GitHub Pages sets 10 minutes and you cannot change it) and the CryptoJS / font hosts.
2. Open the client link on a real phone over mobile data, once in English and once in Arabic. Check that text switches from the system font to IBM Plex shortly after appearing, that tapping a field does not zoom the page, and that the key form is easy to use.
3. Open the admin address on the phone, go to **Progress**, tick a task, take a photo, **Save & publish**, and check that the client page shows it.
4. Print one contract to PDF from the same phone or computer you will use at work, and check the logo, the signature and the page footer.
