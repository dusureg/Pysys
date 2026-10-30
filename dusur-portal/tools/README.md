# Tools

Small Python scripts that help you maintain the project. They are **not** part of the deployed site (you do not need to upload this folder) and need no packages: Python 3 and, for `check.py`, Node.js.

## `check.py`: static checks

```
python3 tools/check.py                   # run every check; exit code 1 if anything is wrong
python3 tools/check.py --write-codemap   # also regenerate docs/CODEMAP.md
```

Run it after every change. It takes a few seconds and needs no browser.

| Check | What it catches |
|---|---|
| **pages** | A `<script>` or `<link>` that points to a missing file; a `.js` or `.css` file that no page loads (orphan); a page without a CSP, with `unsafe-inline` / `unsafe-eval` in `script-src`, or without `noindex` |
| **syntax** | A file that does not parse, or uses syntax newer than ES2018 (`?.`, `??`, ...) |
| **isolation** | The client page loading an admin file, or any client-loaded file containing admin-only code or addresses (`api.github.com`, `data/private`, vault and sealing functions, `toPublic`, ...) |
| **i18n** | Different keys or placeholders between English and Arabic; a `t('key')` call with no key; a client dictionary holding admin keys or the other way round |
| **globals** | The same top-level name declared twice on one page; a name used while a file loads that a *later* file declares; a top-level binding named like a built-in window property (`name`, `status`, ...) |
| **headers** | A source file without its documentation header |
| **codemap** | `docs/CODEMAP.md` out of date |

The globals and isolation analysis parses the code with the `acorn` parser bundled inside Node (`node --expose-internals`, implemented in `tools/lib/analyze.js`). If Node is missing or cannot expose it, those checks are reported as a warning, not a pass; syntax is still checked with `node --check`.

The checker was itself tested by planting defects of each kind in a scratch copy (for example a missing Arabic key and a placeholder mismatch) and confirming each was reported.

## `package.py`: split into two deployable bundles

```
python3 tools/package.py [--out dist]
```

Writes `dist/public-site/` (client `index.html` + `assets/`) and `dist/admin-site/` (admin folder + `assets/`), each with `.nojekyll`, so the admin site can be hosted apart from the public data repository. It verifies that every file each page references exists inside its own bundle. See [../docs/DEPLOYMENT.md](../docs/DEPLOYMENT.md#b-two-repositories-admin-kept-out-of-the-public-listing). `dist/` is git-ignored.

## `rename-admin.py`: new admin address

```
python3 tools/rename-admin.py
```

Renames `admin-xxxxxxxx` to a fresh random name and prints the new address. Upload the renamed folder and delete the old one. Do this if the address was shared or leaked.

## `get-fonts.py`: self-host the IBM Plex fonts

```
python3 tools/get-fonts.py               # download the fonts and switch the site to them
python3 tools/get-fonts.py --mode google # back to Google Fonts (the shipped default)
python3 tools/get-fonts.py --mode none   # system fonts only
```

Run it **once, on a computer with internet**. It asks Google Fonts for the CSS of IBM Plex Sans and IBM Plex Sans Arabic (weights 400 and 700), downloads every `.woff2` file in it into `assets/fonts/`, writes `assets/css/fonts.css`, sets the `FONTS` line at the top of `assets/js/guard.js`, removes the Google hosts from the CSP of both pages and saves the licence (SIL Open Font License 1.1) next to the files. Nothing is changed if a download fails. Then upload `assets/` and the two `index.html` files, and reload with Ctrl+F5. The fonts then come from your own site: no third party, and they work where Google is blocked. `--css-url` and `--license-url` exist for testing against a fake server (see [../tests/README.md](../tests/README.md#teststools)).

## `lib/analyze.js`

The parser-based analyser used by `check.py`. For each file it prints JSON with the syntax error (or null, ES2018 is the ceiling), the top-level names it declares, and the names it uses while it is loading; `check.py` does the judging. Not meant to be run by hand.
