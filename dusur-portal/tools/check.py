#!/usr/bin/env python3
"""Static checks for the portal. Needs only Python 3 and Node (no network, no packages).

    python3 tools/check.py                    run every check, exit code 1 if anything is wrong
    python3 tools/check.py --write-codemap    also refresh docs/CODEMAP.md (the generated map of files and their globals)

What is checked
  pages      every <script>/<link> of index.html and <admin>/index.html exists; no orphan file; strict CSP present
  fonts      the font source in guard.js matches the CSP (Google addresses present or absent), fonts.css and its files exist when self-hosted
  syntax     every .js file parses (node --check) and stays within ES2018, so older phones keep working
  isolation  the client page loads no admin file and none of the files it loads contains admin-only code or the admin address
  i18n       en/ar have the same keys and placeholders; every t('key') exists for the page that uses it; the client
             dictionary holds only client keys; the admin dictionary holds only admin keys
  globals    all scripts share one global scope (no modules, no build): no name declared twice, nothing used while a
             file is loading that a LATER file declares, nothing that overrides a built-in window property
  headers    every source file starts with its documentation header
  codemap    docs/CODEMAP.md is up to date
"""
import glob, json, os, re, subprocess, sys

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
WRITE_CODEMAP = '--write-codemap' in sys.argv

FORBIDDEN_IN_CLIENT = ['api.github.com', 'deriveVaultKey', 'data/private', 'github_pat', 'putFile', 'vaultSeal', 'wrapMaster',
                       'dsp.config.v1', 'loadCfg', 'needMaster', 'sealObj', 'openObj', 'toPublic']
RESERVED = {'window', 'self', 'document', 'location', 'top', 'parent', 'frames', 'opener', 'closed', 'length', 'name', 'status', 'event',
            'history', 'screen', 'open', 'close', 'stop', 'print', 'find', 'focus', 'blur', 'confirm', 'alert', 'prompt', 'fetch', 'origin',
            'external', 'performance', 'crypto', 'navigator', 'console', 'scroll', 'scrollTo', 'scrollBy', 'postMessage', 'localStorage'}
KNOWN_GLOBALS = set('''window document location localStorage sessionStorage navigator history console fetch setTimeout clearTimeout setInterval
clearInterval requestAnimationFrame addEventListener removeEventListener confirm alert prompt getComputedStyle matchMedia URL URLSearchParams
Blob File FileReader Image Intl crypto TextEncoder TextDecoder atob btoa CryptoJS createImageBitmap ResizeObserver Event CustomEvent HTMLElement
DOMParser XMLSerializer Uint8Array Uint32Array Uint16Array Int32Array Float64Array ArrayBuffer DataView Object Array Promise Map Set WeakMap
JSON Math Number String Boolean Date RegExp Error TypeError Symbol parseInt parseFloat isFinite isNaN encodeURIComponent decodeURIComponent
undefined NaN Infinity globalThis'''.split())

errors, warns = [], []


def ok(msg):
    print('  ok   ' + msg)


def bad(msg):
    errors.append(msg); print('  FAIL ' + msg)


def warn(msg):
    warns.append(msg); print('  warn ' + msg)


def read(path):
    return open(os.path.join(ROOT, path), encoding='utf-8').read()


def section(name):
    print('\n' + name)


# --------------------------------------------------------------------------------------------- pages
admin_dirs = sorted(d for d in os.listdir(ROOT) if re.fullmatch(r'admin-[0-9a-f]{8}', d) and os.path.isdir(os.path.join(ROOT, d)))
if len(admin_dirs) != 1:
    print(f'expected exactly one admin-<8 hex> folder, found {admin_dirs}'); sys.exit(1)
ADMIN = admin_dirs[0]
PAGES = {'client': 'index.html', 'admin': ADMIN + '/index.html'}


def page_assets(page):
    html = read(page)
    base = os.path.dirname(page)
    norm = lambda u: os.path.normpath(os.path.join(base, u)).replace(os.sep, '/')
    scripts = [norm(u) for u in re.findall(r'<script[^>]*\bsrc="([^"]+)"', html)]
    styles = [norm(u) for u in re.findall(r'<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"', html)]
    return html, scripts, styles


assets = {k: page_assets(v) for k, v in PAGES.items()}

section('pages')
all_referenced = set()
for k, (html, scripts, styles) in assets.items():
    missing = [f for f in scripts + styles if not os.path.isfile(os.path.join(ROOT, f))]
    all_referenced.update(scripts + styles)
    (bad if missing else ok)(f'{PAGES[k]}: {len(scripts)} scripts + {len(styles)} stylesheets' + (f' - missing: {missing}' if missing else ' all exist'))
    csp = re.search(r'Content-Security-Policy"\s+content="([^"]+)"', html)
    script_src = re.search(r"script-src ([^;]+)", csp.group(1)).group(1) if csp else ''
    (ok if csp and "'unsafe-inline'" not in script_src and "'unsafe-eval'" not in script_src else bad)(f'{PAGES[k]}: strict CSP (no inline or eval scripts)')
    (ok if 'noindex' in html else bad)(f'{PAGES[k]}: robots noindex')
sources = [p.replace(os.sep, '/') for p in glob.glob(os.path.join(ROOT, '**', '*'), recursive=True)
           if os.path.isfile(p) and p.endswith(('.js', '.css')) and not any(s in p for s in ('/tests/', '/tools/', '/vendor/', '/node_modules/'))]
sources = [os.path.relpath(p, ROOT).replace(os.sep, '/') for p in sources]
fm = re.search(r"var FONTS='([a-z]+)'", read('assets/js/guard.js'))
FONTS_MODE = fm.group(1) if fm else '?'
if FONTS_MODE == 'self':
    all_referenced.add('assets/css/fonts.css')           # injected by guard.js, not by a <link> in the page
orphans = sorted(set(sources) - all_referenced)
(bad if orphans else ok)('no orphan .js/.css file' + (f': {orphans}' if orphans else ''))
js_files = sorted(f for f in sources if f.endswith('.js'))

section('fonts (IBM Plex Sans + IBM Plex Sans Arabic)')
if FONTS_MODE not in ('google', 'self', 'none'):
    bad('assets/js/guard.js: the FONTS line is missing or has an unknown value')
else:
    ok(f'font source: {FONTS_MODE}')
    for k, (html, _s, _c) in assets.items():
        csp = re.search(r'Content-Security-Policy"\s+content="([^"]+)"', html).group(1)
        style = (re.search(r'style-src ([^;]+)', csp) or [None, ''])[1]
        font = (re.search(r'font-src ([^;]+)', csp) or [None, ''])[1]
        g_in = 'https://fonts.googleapis.com' in style and 'https://fonts.gstatic.com' in font
        g_out = 'fonts.googleapis.com' not in style and 'fonts.gstatic.com' not in font
        if FONTS_MODE == 'google':
            (ok if g_in else bad)(f'{PAGES[k]}: CSP allows Google Fonts (style-src and font-src)')
        else:
            (ok if g_out and "'self'" in font else bad)(f'{PAGES[k]}: CSP has no Google Fonts address and font-src is self')
    if FONTS_MODE == 'self':
        css_path = os.path.join(ROOT, 'assets/css/fonts.css')
        if not os.path.isfile(css_path):
            bad('FONTS is "self" but assets/css/fonts.css is missing (run tools/get-fonts.py)')
        else:
            urls = re.findall(r'url\(([^)]+)\)', read('assets/css/fonts.css'))
            miss = [u for u in urls if not os.path.isfile(os.path.normpath(os.path.join(ROOT, 'assets/css', u.strip('\'"'))))]
            (bad if miss or not urls else ok)(f'assets/css/fonts.css: {len(urls)} font files, all present' + (f' - missing {miss[:3]}' if miss else ''))
            pre = re.search(r'FONT_PRELOAD=(\{.*?\});', read('assets/js/guard.js'))
            try:
                pl = [f for v in json.loads(pre.group(1)).values() for f in v]
            except Exception:
                pl = None
            (bad if pl is None or [f for f in pl if not os.path.isfile(os.path.join(ROOT, 'assets/fonts', f))] else ok)('guard.js FONT_PRELOAD names existing files')
    base = read('assets/css/base.css')
    (ok if '"IBM Plex Sans"' in base and '"IBM Plex Sans Arabic"' in base else bad)('base.css font stacks name both IBM Plex families')

# --------------------------------------------------------------------------------------------- syntax + analysis
section('syntax (ES2018)')
syntax_fail = []
for f in js_files:
    r = subprocess.run(['node', '--check', os.path.join(ROOT, f)], capture_output=True, text=True)
    if r.returncode:
        syntax_fail.append(f); bad(f'{f}: {r.stderr.strip().splitlines()[-1] if r.stderr.strip() else "syntax error"}')
analysis = {}
r = subprocess.run(['node', '--expose-internals', os.path.join(ROOT, 'tools/lib/analyze.js')] + [os.path.join(ROOT, f) for f in js_files], capture_output=True, text=True)
try:
    raw = json.loads(r.stdout)
except Exception:
    raw = {'unavailable': r.stderr[:200]}
if 'unavailable' in raw:
    warn('the acorn parser bundled in Node is not available in this Node version: ES2018 and load-order checks skipped (' + str(raw['unavailable'])[:80] + ')')
else:
    analysis = {os.path.relpath(k, ROOT).replace(os.sep, '/'): v for k, v in raw.items()}
    es = [(f, v['syntax']) for f, v in analysis.items() if v['syntax']]
    for f, m in es:
        bad(f'{f}: not valid ES2018 ({m})')
    if not es and not syntax_fail:
        ok(f'{len(js_files)} files parse as ES2018')

# --------------------------------------------------------------------------------------------- isolation
section('isolation of the client page')
c_html, c_scripts, c_styles = assets['client']
c_files = c_scripts + c_styles
leaks = []
for f in [PAGES['client']] + c_files:
    text = read(f)
    for s in FORBIDDEN_IN_CLIENT:
        if s in text:
            leaks.append((f, s))
    if re.search(r'admin-[0-9a-f]{8}', text):
        leaks.append((f, 'the admin address'))
(bad if leaks else ok)('client page + its files contain no admin-only code, token handling or admin address' + (f': {leaks}' if leaks else ''))
(bad if any(f.startswith(ADMIN + '/') for f in c_files) else ok)('client page loads nothing from the admin folder')
total = sum(os.path.getsize(os.path.join(ROOT, f)) for f in [PAGES['client']] + c_files)
ok(f'client page weight: {len(c_files) + 1} files, {total / 1024:.0f} KB (before CryptoJS)')

# --------------------------------------------------------------------------------------------- i18n
section('i18n')


def load_dicts(files):
    code = 'global.window={};' + ';'.join(read(f) for f in files) + ';console.log(JSON.stringify(window.__I18N))'
    r = subprocess.run(['node', '-'], input=code, capture_output=True, text=True)       # through stdin: the dictionaries are larger than one command-line argument may be
    if r.returncode:
        bad('dictionary does not evaluate: ' + r.stderr[:200]); return {'en': {}, 'ar': {}}
    return json.loads(r.stdout)


DICT_CLIENT = ['assets/i18n/en.js', 'assets/i18n/ar.js']
DICT_ADMIN = [ADMIN + '/i18n/en.js', ADMIN + '/i18n/ar.js']
dc = load_dicts(DICT_CLIENT)
dall = load_dicts(DICT_CLIENT + DICT_ADMIN)
da = {l: {k: v for k, v in dall[l].items() if k not in dc[l]} for l in ('en', 'ar')}
for name, d in (('client', dc), ('admin', da)):
    diff = sorted(set(d['en']) ^ set(d['ar']))
    (bad if diff else ok)(f'{name} dictionary: en and ar have the same keys' + (f' - only in one language: {diff[:8]}' if diff else f' ({len(d["en"])})'))
    ph = [k for k in d['en'] if k in d['ar'] and sorted(re.findall(r'\{(\w+)\}', d['en'][k])) != sorted(re.findall(r'\{(\w+)\}', d['ar'][k]))]
    (bad if ph else ok)(f'{name} dictionary: {{placeholders}} match between en and ar' + (f' - {ph[:8]}' if ph else ''))
r = subprocess.run(['node', '-'], input=("global.window={};const o=Object.assign,c=[];Object.assign=function(t){for(const s of [].slice.call(arguments,1))for(const k of Object.keys(s))if(k in t)c.push(k);return o.apply(Object,arguments)};"
                    + ';'.join(read(f) for f in DICT_CLIENT + DICT_ADMIN) + ';console.log(JSON.stringify(c))'), capture_output=True, text=True)
overlap = sorted(set(json.loads(r.stdout or '[]')))
(bad if overlap else ok)('no key lives in both dictionaries')


def code_of(scripts, html):
    parts = [read(f) for f in scripts if '/i18n/' not in f and not f.endswith('guard.js')]
    return '\n'.join(parts) + '\n' + html


def used_keys(keys, scan):
    lits = set(re.findall(r"""['"]([a-z][A-Za-z0-9]*(?:\.[A-Za-z0-9_]+)+)['"]""", scan))
    prefixes = set(re.findall(r"""['"]((?:[a-z][A-Za-z0-9]*\.)+)['"]\s*\+""", scan))
    return {k for k in keys if k in lits or any(k.startswith(p) for p in prefixes)}


def called_keys(scan):
    out = set()
    for m in re.finditer(r"""\bt\('([A-Za-z0-9_.]+)'|data-i18n="([A-Za-z0-9_.]+)"|fld\('([A-Za-z0-9_]+\.[A-Za-z0-9_.]+)'(?:,[^,]+,\s*'([A-Za-z0-9_]+\.[A-Za-z0-9_.]+)')?""", scan):
        out.update(g for g in m.groups() if g)
    return {k for k in out if not k.endswith('.')}


NOT_KEYS = {'team.json'}        # strings that only look like keys (file names...); add here when a real one turns up
scan_c = code_of(assets['client'][1], assets['client'][0])
scan_a = code_of(assets['admin'][1], assets['admin'][0])
for name, scan, dic in (('client', scan_c, dc), ('admin', scan_a, dall)):
    miss = sorted(k for k in called_keys(scan) if k not in dic['en'])
    (bad if miss else ok)(f'{name} page: every t("key") exists in the dictionaries it loads' + (f' - missing: {miss[:10]}' if miss else ''))
# a key passed to a helper (th('x', 'inv.col.max'), a table of labels...) is not a t('key') call, so look at every string that has the shape of a key in a namespace of the dictionary
for name, scan, dic in (('client', scan_c, dc), ('admin', scan_a, dall)):
    spaces = {k.split('.')[0] for k in dic['en']}
    shaped = {x for x in re.findall(r"""['"]([a-z][A-Za-z0-9]*(?:\.[A-Za-z0-9_]+)+)['"]""", scan) if x.split('.')[0] in spaces}
    lost = sorted(x for x in shaped if x not in dic['en'] and x not in NOT_KEYS)
    (bad if lost else ok)(f'{name} page: every string that looks like a dictionary key is one' + (f' - not in the dictionary: {lost[:10]}' if lost else ''))
stray = sorted(set(dc['en']) - used_keys(dc['en'], scan_c))
(bad if stray else ok)('client dictionary holds only keys the client page uses' + (f' - not used by the client, move them to the admin dictionary: {stray[:10]}' if stray else ''))
unused = sorted(set(da['en']) - used_keys(da['en'], scan_a))
(bad if unused else ok)('admin dictionary holds only keys the admin page uses' + (f' - unused: {unused[:10]}' if unused else ''))

# --------------------------------------------------------------------------------------------- globals
section('globals (shared scope, load order)')
if analysis:
    for k, (html, scripts, styles) in assets.items():
        order = [f for f in scripts if f in analysis]
        where, dup = {}, []
        for i, f in enumerate(order):
            for d in analysis[f]['declared']:
                if d['name'] in where:
                    dup.append((d['name'], where[d['name']][2], f))
                else:
                    where[d['name']] = (i, d['at'], f, d['kind'])
        (bad if dup else ok)(f'{k}: no name is declared twice' + (f': {dup[:6]}' if dup else ''))
        clash = sorted({n for n, (_, _, f, kind) in where.items() if n in RESERVED})
        (bad if clash else ok)(f'{k}: no top-level name overrides a window property' + (f': {clash}' if clash else ''))
        early, unknown = [], set()
        for i, f in enumerate(order):
            for ref in analysis[f]['loadRefs']:
                n = ref['name']
                if n in where:
                    j, at, _, kind = where[n]
                    if j > i or (j == i and at > ref['at'] and kind != 'function'):
                        early.append(f'{f} uses {n} (declared in {where[n][2]}) before it exists')
                elif n not in KNOWN_GLOBALS:
                    unknown.add(n)
        (bad if early else ok)(f'{k}: nothing is used while loading before the file that declares it' + (f': {early[:5]}' if early else ''))
        if unknown:
            warn(f'{k}: names used at load time but declared nowhere (check they are browser globals): {sorted(unknown)[:12]}')

# --------------------------------------------------------------------------------------------- headers
section('documentation headers')
nohdr = []
for f in js_files + [s for s in sources if s.endswith('.css')]:
    text = read(f)
    shown = re.sub(r'^' + re.escape(ADMIN) + '/', '<admin>/', f)
    first = text.split('\n', 3)
    if not (first[0].startswith('/*') and shown.replace('<admin>/', '') in ' '.join(first[:2])):
        nohdr.append(f)
(bad if nohdr else ok)('every .js and .css file starts with a header naming the file and its purpose' + (f': {nohdr[:6]}' if nohdr else ''))

# --------------------------------------------------------------------------------------------- codemap
section('code map')


def purpose(path):
    m = re.search(r'^/\*\*?\s*\n?\s*\*?\s*\S+\s+-\s+(.+)$', read(path), re.M)
    return m.group(1).strip().rstrip('*/ ').strip() if m else ''


def codemap():
    lines = ['# Code map', '', 'Generated by `python3 tools/check.py --write-codemap` - do not edit by hand. `<admin>` is the private folder named `admin-<8 hex>`.',
             'All scripts share ONE global scope (no modules, no build step), so the order below is the load order and matters.', '']
    for k, title in (('client', 'Client page (`index.html`)'), ('admin', 'Admin page (`<admin>/index.html`)')):
        lines += [f'## {title}', '', '| # | File | What it does | Defines |', '|---|------|--------------|---------|']
        n = 0
        for f in assets[k][1]:
            names = [d['name'] for d in analysis.get(f, {}).get('declared', [])] if analysis else []
            shown = re.sub(r'^' + re.escape(ADMIN) + '/', '<admin>/', f)
            if '/i18n/' in f:
                names = []
            n += 1
            more = ' ...' if len(names) > 14 else ''
            lines.append(f'| {n} | `{shown}` | {purpose(f)} | {", ".join("`" + x + "`" for x in names[:14])}{more} |')
        lines.append('')
    return '\n'.join(lines)


if analysis:
    cm = codemap()
    path = os.path.join(ROOT, 'docs', 'CODEMAP.md')
    if WRITE_CODEMAP:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        open(path, 'w', encoding='utf-8').write(cm)
        ok('docs/CODEMAP.md written')
    elif not os.path.isfile(path) or open(path, encoding='utf-8').read() != cm:
        bad('docs/CODEMAP.md is out of date - run: python3 tools/check.py --write-codemap')
    else:
        ok('docs/CODEMAP.md is up to date')

print()
if errors:
    print(f'{len(errors)} problem(s), {len(warns)} warning(s)')
    sys.exit(1)
print(f'all checks passed ({len(warns)} warning(s))')
