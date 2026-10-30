# DUSUR Production & Client Portal

A serverless production and client portal for a furniture workshop. It runs entirely on **GitHub Pages**: static files in the browser, the GitHub REST API for storage, and AES encryption so that a public repository can safely hold private data. There is **no backend, no database, no build step and no server of your own**.

| | Client site | Admin site |
|---|---|---|
| Address | `https://<user>.github.io/<repo>/` | `https://<user>.github.io/<repo>/admin-xxxxxxxx/` (unlisted) |
| Who uses it | Your clients | You only |
| Does | Live search by Client ID or project number, then a private progress page that opens with the client's secret key | Clients, projects, finance, BOM, photos, **logistics, supply chain, inventory**, reports, settings, ratings |
| Talks to | `raw.githubusercontent.com` (read only) | GitHub REST API (read and write, with your token) |
| Code size | 23 files, ~144 KB (54 KB gzipped) | 93 files, ~1,016 KB (336 KB gzipped), includes the shared `assets/` |

Both sites are bilingual (English / Arabic with full RTL, set in IBM Plex Sans and IBM Plex Sans Arabic), have a dark and a light theme and are responsive down to phone width.

## What it does

- **Clients and projects**: client ID generator (`DS-CL-1001`), project number (SKU) generator (`DS-KIT-2610-0001`), unlimited projects per client, editable project types with stage checklists.
- **Progress & photos screen** (admin): one screen for the workshop day: tick finished tasks, set part statuses, add photos from the gallery or the phone camera, save, and send the client a WhatsApp update.
- **Printable contract** per client project, with your logo and, last on the paper, your signature; Arabic, English or both; print or save as PDF.
- **Progress for the client**: progress ring, stage checklists, parts, remaining time (tape-measure countdown), remaining money and payment history, progress photos (uploaded or linked), live refresh every 60 s.
- **Finance (admin)**: revenue, COGS, operating cost, gross and net profit, margins, markup, collected percentage on the Dashboard; and the **Finance** screen (4.4): **direct cost, indirect cost and total operations cost** for any period, each project's real cost with its share of the shared costs, an expense ledger (one-off, monthly, yearly), a monthly budget and a printable **Costs** report.
- **Team and roles (4.4)**: several people can work in the system, each with a role chosen by the administrator (per area: no access, view or edit). Team, Configuration and the admin password are never available to a role. Members can be **paused** or **blocked**. Honest limits: [docs/SECURITY.md](docs/SECURITY.md#team-roles-and-the-history-44-what-they-really-protect).
- **History (4.4)**: every change by every person (who, when, which record, each field before and after), in sealed monthly files with a hash chain, a screen with filters and a printable report.
- **Collections (4.5)**: a payment schedule per project (due date, amount, note; split what is left into equal instalments). The client sees the next payment and what is overdue on the money card; you see every open instalment of every client on the **Collections** screen with a WhatsApp reminder and a printable report. Money received covers the deposit first, then the earliest instalment.
- **Everyday tools (4.5)**: sign in as the administrator with your own password (no token typed), a profile for everybody (phone, picture), **import** from CSV, Excel or JSON into Inventory, Suppliers, Shipments and Expenses (with a preview of every row), a **Share** button (device share sheet, WhatsApp, e-mail, copy), a report saved as a **picture**, paper size (A4, A3, Letter, Legal), fonts and an accent colour for both sites, a **settings file** you can export and load, internal **codes** with your own formula, units linked to the BOM and **your own cost categories** (direct and indirect). The company address also shows on the client site.
- **Contracting (4.6)**: a section listing the contract of every project (number, wording, status draft / issued / signed, dates); per-project wording (the standard clauses, a named template, or clauses of its own); a **formal black-and-white copy** for filing; a Contracts report.
- **Labels (4.6)**: stickers of 2.5 × 2.5 cm or a strip 2.5 cm tall, for a project or for every piece: logo, thin Egypt flag with the slogan, client and product data, a **QR code** and/or a Code 128 barcode of the SKU; one label per page, ready for a label printer or a PDF.
- **Files, brands and pictures (4.6)**: a list of brands and a picture for each inventory item; invoices and files kept with expenses and shipments (sealed with your key, never published).
- **Media for the client (4.6)**: videos kept in the repository (sealed, up to 24 MB) or linked, a picture and video viewer with zoom, **files to download** (3D models, drawings, documents; saved, never opened by the page), **Save our contact** (a vCard), and a **Down payment** box beside the next payment.
- **Company overview (4.6)**: one printable report of the whole company (clients, production, contract value, collected, to collect, overdue, late projects, stock alerts) with a *Needs attention* list.
- **BOM list**: per project, with one-click sync into the COGS lines.
- **Logistics** (admin, `#logistics`): track every shipment step by step: materials coming from suppliers, finished work going to a client project, moves between places. Add, edit, reorder, remove and complete steps, with a status, planned date and note on each; late and blocked shipments are flagged; a shipment can be received into the inventory in one tap.
- **Supply chain management** (admin, `#suppliers`): the directory of your suppliers with phone, second phone, WhatsApp, e-mail, website, location, map link, any other link, address, terms and lead time. Every contact detail is a safe, working link (call, WhatsApp, mail, open the site, open the map).
- **Inventory management** (admin, `#inventory`; a sorted, groupable **table** with a totals row, or cards on phones): every material with its quantity, minimum, maximum, cost, supplier, place and expiry date; receive, use and stock-take with a history; alerts for every item (out of stock, low, expired, expiring soon, above maximum, no supplier, no minimum); and a to-order list grouped by supplier with suggested quantities.
- **Reports**: finance, BOM, production and client satisfaction, plus **printable reports for every operations section**: inventory (stock list and alerts), reorder list by supplier, stock movements, supplier directory, logistics (shipments) and a one-shipment sheet to tick. Coloured, dated, with the company logo and charts. Print / Save as PDF through the browser, and Excel export with **native** Excel charts.
- **Ratings**: after a project is completed the client rates it out of 10 and leaves a comment. With the optional **rating inbox** (4.4, [docs/INBOX.md](docs/INBOX.md)) the client sends it from the site itself and you pull it from the dashboard; without it the rating travels as an encrypted code (WhatsApp, e-mail, copy) that you import.
- **Troubleshooter (4.4)**: a check-up screen that works before sign-in and explains what is wrong and what to do; plus start-up diagnostics when a page cannot start.
- **Settings screen**: company profile and logo, contract text and signature, project types, SKU prefix, currency, default duration, report footer, auto-lock time.

## How the "serverless and private" part works, in one paragraph

Everything the client site needs is a static file in the repository. Each client's project is encrypted with AES-256 under a key derived (PBKDF2, 310,000 rounds) from a secret key that only that client knows, so the encrypted file can sit in a public repository. Your own records (costs, internal notes, client secret keys, settings) are encrypted under a master key that is itself locked by your admin password. The GitHub token is stored only in your browser, sealed under the same password, and is decrypted into memory only while you are unlocked. Nothing secret is in the code. Details: [docs/SECURITY.md](docs/SECURITY.md).

## Quick start

1. Create a **public** GitHub repository and upload this project (or the output of `python3 tools/package.py`, see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)).
2. Repository Settings, then Pages: deploy from the `main` branch, root folder.
3. Create a **fine-grained personal access token** limited to that one repository with **Contents: Read and write**.
4. Open `https://<user>.github.io/<repo>/admin-xxxxxxxx/`, fill in the Configuration screen (owner, repository, token, a new admin password of at least 10 characters), press Test connection, then Save.
5. Settings: set your company profile and publish it. Then create a client. The editor gives you the private link and the secret key to send to the client.

Full walkthrough, including a second-device setup and migrating from the old single-file version: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). Day-to-day use: [docs/USER-GUIDE.md](docs/USER-GUIDE.md). Arabic quick start: [docs/README.ar.md](docs/README.ar.md).

## Repository layout

```
index.html                  client site entry (the only page the public needs)
admin-xxxxxxxx/             admin site; the random folder name is its address (see docs/SECURITY.md)
  index.html
  css/   admin.css, report.css         (report.css also holds the contract paper)
  i18n/  en.js, ar.js                  admin-only strings
  js/    state, crypto, session, github, domain, contract-terms, store, ui, router, main
         perm, team-data, audit    roles and the write guard, members and the key change, the History
         ops-data, fin-data        suppliers, inventory, logistics, expenses: storage and rules; direct / indirect / total cost
         views/    gate, config, settings, settings-contract, dashboard, editor*, stage-editor, progress, contract, bom, feedback,
                   ops-ui, suppliers, inventory, logistics, finance, audit, team, doctor, reports/*
         export/   zip-xml, xlsx-drawing, xlsx      (Excel writer, no library)
assets/                     shared by both sites
  css/   base, components, client
  i18n/  en.js, ar.js                  strings both sites need
  js/    guard.js                      start-up safety net, CryptoJS loader, diagnostics
         core/     constants, i18n, dom, crypto, brand, domain, ui, photos
         client/   data, router, keyform, search, portal, rating, main
  vendor/                              optional local copy of CryptoJS (see its README)
data/                       created by the admin site in your repository (never part of the code)
docs/                       documentation (the table below)
tools/                      check.py, package.py, rename-admin.py, get-fonts.py
tests/                      end-to-end tests against a simulated GitHub
```

The client page loads only `index.html` plus `assets/`. It contains **no admin code**; `tools/check.py` enforces that.

## Documentation

| Document | For |
|---|---|
| [docs/USER-GUIDE.md](docs/USER-GUIDE.md) | Using the admin and client sites |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Putting it on GitHub Pages, tokens, second device, migration, renaming the admin folder |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | How the code is organised and why |
| [docs/SECURITY.md](docs/SECURITY.md) | Threat model, exact cryptography, CSP, what is public, known limits |
| [docs/DATA-FORMAT.md](docs/DATA-FORMAT.md) | Every file in `data/`, record schemas, rating and connection codes |
| [docs/INBOX.md](docs/INBOX.md) | Optional: let clients send their rating from the site (Google Apps Script setup, what is protected, testing) |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | Conventions, how to add a screen / tab / report / language / project type |
| [docs/QUALITY.md](docs/QUALITY.md) | Page speed and ease-of-use audit: numbers, what was fixed, how to re-run it |
| [docs/CODEMAP.md](docs/CODEMAP.md) | Generated: every script in load order with what it defines |
| [docs/CHANGELOG.md](docs/CHANGELOG.md) | Version history |

## Tools and tests

```
python3 tools/check.py            # static checks: pages, CSP, syntax, i18n parity, globals, load order, codemap
python3 tools/package.py          # split into public-site/ and admin-site/ bundles
python3 tools/rename-admin.py     # give the admin folder a new random name
python3 tools/get-fonts.py        # optional: serve the IBM Plex fonts from your own repository
cd tests/e2e && python3 run.py    # full end-to-end run in Chromium, GitHub simulated
```

See [tools/README.md](tools/README.md) and [tests/README.md](tests/README.md).

## Known limits (short list)

- The admin address is **unlisted, not secret**. What protects your data is the encryption and your password, not the folder name.
- The repository must be **public** so that clients can read their encrypted files.
- It works on `*.github.io` addresses; a custom domain is not supported by the client site as shipped.
- CryptoJS is loaded from a CDN without integrity pinning. You can vendor it locally ([assets/vendor/README.md](assets/vendor/README.md)); doing so is recommended for the admin site.
- A static site cannot receive data, so ratings reach you either through the optional Google Apps Script inbox you deploy yourself (its real Google behaviour was not testable in the delivery sandbox) or as an encrypted code the client sends (WhatsApp, mail, copy).
- **Roles are enforced by the page, not by GitHub**: team members receive the repository token and the encryption key when they sign in, so a skilled member could exceed their role. The full cut-off is changing the encryption key and the token. Member login files are public, so member passwords must be long. See [docs/SECURITY.md](docs/SECURITY.md).
- PDF output (reports and contracts) uses the browser's print dialog (Save as PDF). Excel output is a real `.xlsx` with native charts.
- The contract text is a **general template**, not legal advice. Have a lawyer read it once and edit it in Settings.
- Suppliers, materials and shipments are sealed in three files (about 780 KB each at most) and each material remembers its last 40 stock movements. Using materials in a project does **not** subtract them from the inventory automatically; you record what was used.
- The fonts come from Google Fonts by default (Google sees each first-time visitor's address). `tools/get-fonts.py` removes that.

More in [docs/SECURITY.md](docs/SECURITY.md#known-limits).
