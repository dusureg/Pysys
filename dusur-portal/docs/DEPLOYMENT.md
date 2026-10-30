# Deployment

The portal is plain static files. "Deploying" means putting them in a GitHub repository that serves GitHub Pages. Nothing is built, nothing runs on a server.

## 1. Requirements

- A GitHub account.
- A **public** repository (clients read their encrypted files from `raw.githubusercontent.com`, which does not serve private repositories to anonymous visitors). GitHub Pages on a free account also requires public.
- A modern browser for the admin (current Chrome, Edge, Firefox or Safari; it uses WebCrypto, `createImageBitmap` and `<dialog>`).

The client site works only on a `*.github.io` address, because it works out the repository from its own address: `https://<user>.github.io/<repo>/` or, for a user site, `https://<user>.github.io/` (repository named `<user>.github.io`). A custom domain is **not** supported by the client site as shipped.

## 2. Choose a layout

### A. One repository (simplest)

Everything in one public repository: client site, admin site, and `data/`.

1. Create the repository (for example `portal`).
2. Upload the contents of this project: `index.html`, `assets/`, `admin-xxxxxxxx/`, `.nojekyll`, and optionally `docs/`, `tools/`, `tests/` (they are harmless but not needed to run; leave them out of the public repository if you prefer).
3. Settings, Pages: Source = *Deploy from a branch*, branch `main`, folder `/ (root)`.
4. After a minute: client site at `https://<user>.github.io/portal/`, admin site at `https://<user>.github.io/portal/admin-xxxxxxxx/`.

Downside: the admin folder name is visible in the public file listing (see [SECURITY.md](SECURITY.md#known-limits)). The admin page still needs your password; this is about not advertising it.

### B. Two repositories (admin kept out of the public listing)

```
python3 tools/package.py            # writes dist/public-site and dist/admin-site
```

| Bundle | Contents | Goes to |
|---|---|---|
| `dist/public-site/` | `index.html`, `assets/`, `.nojekyll` | The **data repository**: public, Pages enabled. The admin site writes `data/` here |
| `dist/admin-site/` | `admin-xxxxxxxx/`, `assets/`, `.nojekyll` | A second repository with Pages (also public on a free account, but contains no data), **or** any private host, **or** just a folder on your own computer or phone opened as a file |

The admin site does not need to live next to the data: in its Configuration screen you type the owner and repository of the **data** repository. Share links always point at the data repository's client site, never at the admin page's own address. The packager checks that every file each page references exists inside its own bundle.

The admin site served from a second repository on the same account still shares the browser origin `<user>.github.io` with the first (see [SECURITY.md](SECURITY.md#known-limits), item 6). If you want a separate origin, use a second GitHub account or organisation, or a different host.

## 3. Create the token

GitHub, Settings, Developer settings, Personal access tokens, **Fine-grained tokens**, Generate new token:

- Repository access: **Only select repositories**, choose the data repository.
- Permissions, Repository: **Contents: Read and write** (Metadata: Read-only is added automatically). Nothing else.
- Set an expiry (for example 90 days) and a calendar reminder.

A classic token also works but is far broader; do not use one.

If you later see *"Resource not accessible by personal access token (403)"*, the token lacks **Contents: Read and write** on that repository, or it points at another repository.

## 4. First run

1. Open the admin address. With no stored configuration it goes straight to **Configuration**.
2. Enter GitHub user, repository name (the data repository), the token and a **new admin password** (at least 10 characters; use a long passphrase). The password is not stored anywhere; if you lose it, the data cannot be recovered.
3. **Test connection**: it reports the repository, whether it is public, whether the token can push, and whether a vault already exists.
4. **Save**. The token is sealed under the password in this browser. The vault (`data/private/vault.json`) is created on first unlock.
5. **Settings**: company name (English and Arabic), contacts, logo, currency, SKU prefix, default duration, project types. Save, which also publishes the public profile.
6. **New client**: fill the details, add a project, save. The editor shows the **private link** and the **secret key**. Send them through different channels.

## 5. Use it from a second device

On the first device: Configuration, *Connection code for other devices*, Generate, copy. On the second device: open the admin address, paste it in *Import connection code*, then unlock with the same admin password. The code contains the repository and the **sealed** token; it is useless without the password. You can use the code for a new browser on the same computer too.

## 6. Migrating from the single-file version

The earlier version was two files in the repository root, `index.html` (client) and `admin-1c0e9b6d.html` (admin). The data formats are unchanged, so your `data/` folder, clients, secret keys and links keep working.

1. Back up: download the repository as a ZIP (Code, Download ZIP) or clone it.
2. In the repository, **replace** `index.html` with the new one, **add** `assets/`, `admin-xxxxxxxx/` and `.nojekyll`, and **delete** the old admin file. Leave `data/` untouched.
3. Wait for Pages to rebuild. Open a client link you already gave out; it should still ask for the same secret key and open.
4. Open the new admin address. Because it is the same `<user>.github.io` origin, the browser already holds your sealed connection settings, so you only need to unlock with your existing password. If the browser asks you to configure again, paste a connection code from the old admin or enter the token again.
5. Old links `https://<user>.github.io/<repo>/#client/<id>` need no change.

The old admin file name stops working once deleted. Update bookmarks.

## 7. Give the admin folder a new name

```
python3 tools/rename-admin.py
```

It renames `admin-xxxxxxxx` to a new random `admin-` plus 8 hex characters and prints the new address. Upload the renamed folder and delete the old one from the repository. Nothing else refers to the name. (The git history of a public repository still shows the old name; the old address simply stops working after deletion.) Or rename by hand: any folder name matching `admin-` plus 8 hex characters keeps `tools/check.py` and the tests working.

## 8. Vendor CryptoJS (recommended)

See [assets/vendor/README.md](../assets/vendor/README.md). It removes the dependency on three CDNs at run time.

### 8b. Self-host the fonts (optional)

By default both sites load IBM Plex Sans and IBM Plex Sans Arabic from Google Fonts. To serve them from your own repository instead, run **once on a computer with internet**: `python3 tools/get-fonts.py` (see [tools/README.md](../tools/README.md#get-fontspy-self-host-the-ibm-plex-fonts)). It downloads the font files into `assets/fonts/`, writes `assets/css/fonts.css`, switches `guard.js` to `'self'` and removes the Google hosts from both CSPs. Then upload `assets/` and the two `index.html` files. `python3 tools/get-fonts.py --mode google` goes back.

## 9. Updating the code later

Replace the changed files in the repository (from 4.1 to 4.2: `index.html`, everything in `assets/`, and the whole admin folder; leave your `data/` folder alone). There is no cache-busting build step: after an update, a browser may keep old scripts for a few minutes. Reload with Ctrl+Shift+R (Cmd+Shift+R). If you change a file under `assets/`, both sites use it.

Before uploading, run `python3 tools/check.py` and (if you can) `python3 tests/e2e/run.py` (see [tools/README.md](../tools/README.md), [tests/README.md](../tests/README.md)).

## 10. Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| Blank page, or a box titled with diagnostics | A script failed to load or run. The box lists the recorded errors. Most common: a file missing from the upload (check that `assets/` and the admin folder are complete), a CDN blocked on that network (the guard tries three), or an ad blocker. Reload with cache bypass |
| The diagnostics box says `could not load .../some-file.js`, but the file is in your upload | A single request failed (weak connection, or a file previewer such as a zip viewer that serves files on demand: the admin page asks for about 45 files at once). Press **Reload**. If it fails on the same file every time, that file is missing or damaged in the upload. A zip previewer is not a reliable way to run the site; deploy to GitHub Pages (or any real web server) to test it |
| Client link says "not found" | The data repository is private, `data/clients/<id>.json` is not published yet (save the client in the admin), or the link points at the wrong repository |
| Client opens but shows old progress | The page polls every 60 s and has a Refresh button; raw files are fetched with a cache-busting query. After saving in the admin, wait a few seconds |
| Admin: 403 "Resource not accessible" | Token lacks Contents read/write on that repository (see section 3) |
| Admin: 404 from the connection test | Wrong owner/repository, or the token cannot see that repository |
| Admin: 409 / 422 on save | Concurrent change; the admin retries once automatically. Reload the record and save again |
| "Wrong password" on unlock | The password you configured. If the connection code came from another device, use that device's password |
| Arabic text shows in a boxy font | The system lacks an Arabic font; the site uses system fonts (no web fonts are loaded) |
| Search by project number finds nothing | The project was saved but not published, or the number is mistyped. Saving publishes and updates the search index |
