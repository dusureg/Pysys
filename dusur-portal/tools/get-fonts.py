#!/usr/bin/env python3
"""Self-host the IBM Plex fonts (optional, needs internet, run it on your own computer).

    python3 tools/get-fonts.py                 download IBM Plex Sans + IBM Plex Sans Arabic into assets/fonts/ and switch the site to them
    python3 tools/get-fonts.py --mode google   go back to loading the fonts from Google Fonts (the default of the shipped project)
    python3 tools/get-fonts.py --mode none     system fonts only

Why: out of the box the pages load the two fonts from Google Fonts (fonts.googleapis.com / fonts.gstatic.com). That needs no set-up, but it
is a third-party request on every first visit. Self-hosting serves the same fonts from your own site: faster (no extra connection),
private (no third party sees your visitors) and it works even where Google is blocked.

What it does, in order (nothing is changed if a download fails):
  1. asks Google Fonts for the CSS of the two families (regular 400 and bold 700), the same CSS a Chrome browser gets
  2. downloads every .woff2 file in it to assets/fonts/   (one file per script subset, so a page only fetches what its text needs)
  3. writes assets/css/fonts.css with @font-face rules that point at those files
  4. sets the FONTS / FONT_PRELOAD line at the top of assets/js/guard.js
  5. removes the Google addresses from the Content-Security-Policy of both pages
  6. downloads the licence text next to the fonts (the fonts are SIL Open Font License 1.1, free for any use incl. commercial)

Needs only Python 3. Re-run it any time; it overwrites its own files.
"""
import argparse, json, os, re, sys, urllib.request

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
CSS_URL = 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;700&family=IBM+Plex+Sans+Arabic:wght@400;700&display=swap'
LICENSE_URL = 'https://raw.githubusercontent.com/IBM/plex/master/LICENSE.txt'
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'   # a modern browser: Google then answers with .woff2
GUARD = 'assets/js/guard.js'
FONT_DIR, CSS_OUT = 'assets/fonts', 'assets/css/fonts.css'
G_STYLE, G_FONT = 'https://fonts.googleapis.com', 'https://fonts.gstatic.com'
ADMIN = next((d for d in sorted(os.listdir(ROOT)) if re.fullmatch(r'admin-[0-9a-f]{8}', d) and os.path.isdir(os.path.join(ROOT, d))), None)
PAGES = ['index.html'] + ([ADMIN + '/index.html'] if ADMIN else [])


def fetch(url, what):
    try:
        req = urllib.request.Request(url, headers={'User-Agent': UA})
        with urllib.request.urlopen(req, timeout=40) as r:
            return r.read()
    except Exception as e:
        sys.exit(f'Could not download {what} ({url}): {e}\nNothing was changed. Check your internet connection and try again.')


def read(rel):
    return open(os.path.join(ROOT, rel), encoding='utf-8').read()


def write(rel, text):
    path = os.path.join(ROOT, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, 'w', encoding='utf-8', newline='\n').write(text)


def parse_css(css):
    """Google answers with  /* subset */ @font-face { ... }  blocks. Returns one dict per block."""
    faces = []
    for sub, body in re.findall(r'/\*\s*([\w-]+)\s*\*/\s*@font-face\s*\{(.*?)\}', css, re.S):
        def prop(name):
            m = re.search(name + r'\s*:\s*([^;]+);', body)
            return m.group(1).strip() if m else ''
        fam = prop('font-family').strip('\'"')
        url = re.search(r'url\(([^)]+)\)', body)
        if not (fam and url):
            continue
        faces.append({'subset': sub, 'family': fam, 'style': prop('font-style') or 'normal', 'weight': prop('font-weight') or '400',
                      'url': url.group(1).strip('\'"'), 'range': prop('unicode-range')})
    return faces


def slug(s):
    return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')


def set_csp(mode):
    """Self-hosted or none: drop the Google addresses; google: make sure they are there."""
    for page in PAGES:
        html = read(page)

        def fix(m):
            parts = [x for x in m.group(0).split(' ') if x not in (G_STYLE, G_FONT)]
            if mode == 'google':
                parts.append(G_STYLE if m.group(1) == 'style-src' else G_FONT)
            return ' '.join(parts)
        new = re.sub(r'(style-src|font-src) [^;"]*', fix, html)
        if not re.search(r'font-src ', new):                        # a page without the directive yet
            new = new.replace("img-src ", "font-src 'self'" + (' ' + G_FONT if mode == 'google' else '') + "; img-src ", 1)
        if new != html:
            write(page, new)


def set_guard(mode, preload):
    text = read(GUARD)
    line = "var FONTS='%s',FONT_PRELOAD=%s;" % (mode, json.dumps(preload, separators=(',', ':')))
    new, n = re.subn(r"var FONTS='[a-z]+',FONT_PRELOAD=\{.*?\};", lambda m: line, text, count=1)
    if n != 1:
        sys.exit('Could not find the FONTS line in ' + GUARD + ' (was it edited?). Nothing else was changed.')
    write(GUARD, new)


def main():
    ap = argparse.ArgumentParser(description='Self-host IBM Plex Sans and IBM Plex Sans Arabic.')
    ap.add_argument('--mode', choices=['self', 'google', 'none'], default='self')
    ap.add_argument('--css-url', default=CSS_URL, help='where to get the @font-face CSS (for testing)')
    ap.add_argument('--license-url', default=LICENSE_URL, help='where to get the licence text (for testing)')
    a = ap.parse_args()

    if a.mode != 'self':
        set_guard(a.mode, {'en': [], 'ar': []}); set_csp(a.mode)
        if os.path.isfile(os.path.join(ROOT, CSS_OUT)):
            os.remove(os.path.join(ROOT, CSS_OUT))          # generated file; the font files in assets/fonts/ are kept
        print(f'Fonts set to "{a.mode}". Upload assets/js/guard.js and the two index.html files, then reload with the cache cleared (Ctrl+F5).')
        return

    css = fetch(a.css_url, 'the font CSS').decode('utf-8', 'replace')
    faces = [f for f in parse_css(css) if f['style'] == 'normal']
    families = {f['family'] for f in faces}
    if not {'IBM Plex Sans', 'IBM Plex Sans Arabic'} <= families:
        sys.exit('The CSS did not contain both IBM Plex Sans and IBM Plex Sans Arabic (got: %s). Nothing was changed.' % (sorted(families) or 'nothing'))

    # download first, change files only when everything arrived
    blobs = {}
    for f in faces:
        f['file'] = '%s-%s-%s.woff2' % (slug(f['family']), f['subset'], f['weight'])
        data = fetch(f['url'], f['file'])
        if data[:4] != b'wOF2':
            sys.exit(f'{f["file"]}: the download is not a .woff2 font file. Nothing was changed.')
        blobs[f['file']] = data
        print(f'  downloaded {f["file"]:46} {len(data) / 1024:6.1f} KB')

    os.makedirs(os.path.join(ROOT, FONT_DIR), exist_ok=True)
    for name, data in blobs.items():
        open(os.path.join(ROOT, FONT_DIR, name), 'wb').write(data)

    out = ['/* assets/css/fonts.css  -  self-hosted IBM Plex Sans and IBM Plex Sans Arabic (SIL Open Font License 1.1).',
           '   GENERATED by tools/get-fonts.py: do not edit by hand, run the tool again instead. Loaded by assets/js/guard.js. */', '']
    for f in faces:
        out += ['/* %s */' % f['subset'], '@font-face{font-family:\'%s\';font-style:normal;font-weight:%s;font-display:swap;' % (f['family'], f['weight']),
                "src:url(../fonts/%s) format('woff2');" % f['file'] + ('unicode-range:%s;' % f['range'] if f['range'] else '') + '}']
    write(CSS_OUT, '\n'.join(out) + '\n')

    pick = lambda fam, sub, w: [f['file'] for f in faces if f['family'] == fam and f['subset'] == sub and f['weight'] == w]
    preload = {'en': pick('IBM Plex Sans', 'latin', '400') + pick('IBM Plex Sans', 'latin', '700'),
               'ar': pick('IBM Plex Sans Arabic', 'arabic', '400') + pick('IBM Plex Sans Arabic', 'arabic', '700') + pick('IBM Plex Sans Arabic', 'latin', '400')}
    set_guard('self', preload); set_csp('self')

    try:
        lic = fetch(a.license_url, 'the licence text')
        open(os.path.join(ROOT, FONT_DIR, 'LICENSE.txt'), 'wb').write(lic)
    except SystemExit as e:
        print('Warning: ' + str(e).split('\n')[0] + '\n  The fonts are SIL OFL 1.1; please add the licence text yourself as assets/fonts/LICENSE.txt (https://openfontlicense.org).')
    total = sum(len(b) for b in blobs.values())
    print(f'\nDone: {len(blobs)} font files, {total / 1024:.0f} KB in assets/fonts/, rules in {CSS_OUT}, guard.js and both CSPs updated.')
    print('Next: python3 tools/check.py   then upload assets/ and the two index.html files, and reload with the cache cleared (Ctrl+F5).')


if __name__ == '__main__':
    main()
