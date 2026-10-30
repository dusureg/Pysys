"""Tests for tools/get-fonts.py (self-hosting the IBM Plex fonts) against a FAKE Google Fonts server on this computer. No internet, no changes to
the real project: everything happens in a temporary copy.   python3 tests/tools/test_get_fonts.py

Covers: the happy path (files, fonts.css, guard.js line, both CSPs, licence, tools/check.py still passes), the site really loading its own fonts in a
browser and never calling Google, refusing a bad download or an incomplete stylesheet without changing anything, and switching back (--mode google / none).
Stand-in font files start with the .woff2 signature but are not real fonts, so the browser logs a decode warning for them; that is expected here."""
import hashlib, http.server, os, re, shutil, subprocess, sys, tempfile, threading

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.normpath(os.path.join(HERE, '..', '..'))
RES = []


def check(name, cond, extra=''):
    RES.append(bool(cond)); print(('PASS ' if cond else 'FAIL ') + name + (f'  [{extra}]' if (extra and not cond) else ''), flush=True)


# ---------------------------------------------------------------- a fake Google Fonts
class Fake(http.server.BaseHTTPRequestHandler):
    mode = 'ok'      # ok | one-family | bad-font | missing-font | no-license

    def log_message(self, *a):
        pass

    def send(self, code, body, ctype):
        self.send_response(code); self.send_header('Content-Type', ctype); self.send_header('Content-Length', str(len(body))); self.end_headers(); self.wfile.write(body)

    def do_GET(self):
        port = self.server.server_address[1]
        if self.path.startswith('/css'):
            fams = [('IBM Plex Sans', ['latin', 'latin-ext']), ('IBM Plex Sans Arabic', ['arabic', 'latin'])]
            if Fake.mode == 'one-family':
                fams = fams[:1]
            out = []
            for fam, subs in fams:
                for sub in subs:
                    for w in (400, 700):
                        out.append("/* %s */\n@font-face {\n  font-family: '%s';\n  font-style: normal;\n  font-weight: %d;\n  font-display: swap;\n  src: url(http://127.0.0.1:%d/f/%s-%s-%d.woff2) format('woff2');\n  unicode-range: U+0600-06FF, U+0020-007E;\n}"
                                   % (sub, fam, w, port, fam.replace(' ', ''), sub, w))
            return self.send(200, '\n'.join(out).encode(), 'text/css')
        if self.path.startswith('/f/'):
            if Fake.mode == 'missing-font' and 'arabic-700' in self.path:
                return self.send(404, b'nope', 'text/plain')
            body = (b'NOT-A-FONT' if Fake.mode == 'bad-font' else b'wOF2' + os.urandom(900))
            return self.send(200, body, 'font/woff2')
        if self.path.startswith('/license'):
            return self.send(404, b'no', 'text/plain') if Fake.mode == 'no-license' else self.send(200, b'SIL OPEN FONT LICENSE Version 1.1 (stand-in)', 'text/plain')
        self.send(404, b'', 'text/plain')


srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Fake)
threading.Thread(target=srv.serve_forever, daemon=True).start()
PORT = srv.server_address[1]
ENV = dict(os.environ, no_proxy='127.0.0.1', NO_PROXY='127.0.0.1')
for k in ('http_proxy', 'https_proxy', 'HTTP_PROXY', 'HTTPS_PROXY'):
    ENV.pop(k, None)


def new_copy():
    d = tempfile.mkdtemp(prefix='dusur-fonts-')
    dst = os.path.join(d, 'site')
    shutil.copytree(SRC, dst, ignore=shutil.ignore_patterns('.out', '__pycache__', '.git', '*.zip'))
    return dst


def run(dst, *args):
    return subprocess.run([sys.executable, os.path.join(dst, 'tools', 'get-fonts.py'), '--css-url', f'http://127.0.0.1:{PORT}/css', '--license-url', f'http://127.0.0.1:{PORT}/license', *args],
                          capture_output=True, text=True, env=ENV, cwd=dst)


def checker(dst):
    return subprocess.run([sys.executable, os.path.join(dst, 'tools', 'check.py')], capture_output=True, text=True, env=ENV, cwd=dst)


def digest(dst):
    h = hashlib.sha256()
    for rel in sorted(['assets/js/guard.js', 'index.html'] + [d + '/index.html' for d in os.listdir(dst) if re.fullmatch(r'admin-[0-9a-f]{8}', d)]):
        h.update(open(os.path.join(dst, rel), 'rb').read())
    return h.hexdigest(), os.path.isdir(os.path.join(dst, 'assets', 'fonts')) and sorted(os.listdir(os.path.join(dst, 'assets', 'fonts')))


def pages(dst):
    admin = next(d for d in os.listdir(dst) if re.fullmatch(r'admin-[0-9a-f]{8}', d))
    return ['index.html', admin + '/index.html']


# ---------------------------------------------------------------- 1. happy path
dst = new_copy(); Fake.mode = 'ok'
before = digest(dst)
check('the shipped project starts in Google mode (guard.js and both CSPs)', "var FONTS='google'" in open(f'{dst}/assets/js/guard.js').read() and all('fonts.googleapis.com' in open(f'{dst}/{p}').read() for p in pages(dst)))
p = run(dst)
check('self-hosting finishes with exit code 0', p.returncode == 0, p.stdout[-300:] + p.stderr[-300:])
files = sorted(os.listdir(f'{dst}/assets/fonts')) if os.path.isdir(f'{dst}/assets/fonts') else []
check('every subset and weight is downloaded (8 font files) and the licence is saved next to them', len([f for f in files if f.endswith('.woff2')]) == 8 and 'LICENSE.txt' in files, str(files))
css = open(f'{dst}/assets/css/fonts.css').read() if os.path.isfile(f'{dst}/assets/css/fonts.css') else ''
check('fonts.css has one @font-face per file, relative urls, swap, no Google address', css.count('@font-face') == 8 and 'url(../fonts/' in css and 'font-display:swap' in css and 'google' not in css.lower() and '127.0.0.1' not in css, css[:300])
check('both families are declared with weights 400 and 700', all(f"font-family:'{f}'" in css for f in ('IBM Plex Sans', 'IBM Plex Sans Arabic')) and 'font-weight:400' in css and 'font-weight:700' in css)
g = open(f'{dst}/assets/js/guard.js').read()
m = re.search(r"var FONTS='(\w+)',FONT_PRELOAD=(\{.*?\});", g)
check("guard.js is switched to 'self' and preloads the Latin files for English and the Arabic file for Arabic", bool(m) and m.group(1) == 'self' and 'plex-sans-latin-400' in m.group(2) and 'plex-sans-arabic-arabic-400' in m.group(2), m.group(0) if m else '')
check('both CSPs no longer mention Google', all('fonts.googleapis.com' not in open(f'{dst}/{pg}').read() and 'fonts.gstatic.com' not in open(f'{dst}/{pg}').read() and "font-src 'self';" in open(f'{dst}/{pg}').read() for pg in pages(dst)))
c = checker(dst)
check('tools/check.py still passes on the self-hosted project (no orphan, no missing file)', c.returncode == 0, c.stdout[-500:] + c.stderr[-300:])
p2 = run(dst)
check('running it again is safe (same result, exit code 0)', p2.returncode == 0 and sorted(os.listdir(f'{dst}/assets/fonts')) == files)

# ---------------------------------------------------------------- 2. the site really uses its own fonts
sys.path.insert(0, os.path.join(SRC, 'tests', 'e2e'))
os.environ['PORTAL_ROOT'] = dst
try:
    from playwright.sync_api import sync_playwright
    import mockgh
    shim = open(os.path.join(SRC, 'tests', 'e2e', 'fixtures', 'cryptojs-standin.js'), encoding='utf-8').read()
    mock = mockgh.Mock(shim)
    with sync_playwright() as pw:
        br = pw.chromium.launch(args=['--no-sandbox'])
        for lang in ('en', 'ar'):
            ctx = br.new_context(viewport={'width': 1280, 'height': 900}); ctx.route('**/*', mock.handler('self-' + lang))
            pg = ctx.new_page(); errs = []
            pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'font' not in m.text.lower() and 'Failed to load resource' not in m.text else None)
            pg.add_init_script(f"try{{localStorage.setItem('dsp.lang','{lang}')}}catch(e){{}}")
            pg.goto(mockgh.BASE); pg.wait_for_selector('#clQ'); pg.wait_for_timeout(600)
            urls = [x[2] for x in mock.reqlog if x[0] == 'self-' + lang]
            check(f'[{lang}] the page loads fonts.css and its .woff2 files from its own site', any(u.endswith('/assets/css/fonts.css') for u in urls) and any(u.endswith('.woff2') for u in urls), str([u for u in urls if 'font' in u]))
            check(f'[{lang}] the right preload is made first (Latin for English, Arabic for Arabic)', any(('plex-sans-arabic-arabic-400' if lang == 'ar' else 'plex-sans-latin-400') in u for u in urls))
            check(f'[{lang}] nothing is requested from Google and the CSP raises no violation', not any('fonts.googleapis.com' in u or 'fonts.gstatic.com' in u for u in urls) and not errs, str(errs[:3]))
            ctx.close()
        br.close()
except ImportError as e:
    check('browser part skipped: Playwright is not installed here', True, str(e))

# ---------------------------------------------------------------- 3. refusing bad input without changing anything
for mode, why in (('one-family', 'the stylesheet has only one family'), ('bad-font', 'a download is not a font file'), ('missing-font', 'one font file is missing (404)')):
    d2 = new_copy(); Fake.mode = mode; b = digest(d2); q = run(d2)
    check(f'{why}: exit code is not 0, a clear message is printed, and nothing is changed', q.returncode != 0 and 'Nothing was changed' in (q.stdout + q.stderr) and digest(d2) == b and not os.path.isfile(f'{d2}/assets/css/fonts.css'), q.stdout[-200:] + q.stderr[-300:])
Fake.mode = 'no-license'
d3 = new_copy(); q = run(d3)
check('licence download fails: the fonts are still installed and a warning tells you to add the licence yourself', q.returncode == 0 and 'LICENSE.txt' in (q.stdout + q.stderr) and os.path.isfile(f'{d3}/assets/css/fonts.css'), q.stdout[-300:] + q.stderr[-200:])
Fake.mode = 'ok'

# ---------------------------------------------------------------- 4. going back
q = run(dst, '--mode', 'google'); g = open(f'{dst}/assets/js/guard.js').read()
check("--mode google restores the default: FONTS='google', Google addresses back in both CSPs, generated fonts.css removed", q.returncode == 0 and "var FONTS='google'" in g and all('fonts.googleapis.com' in open(f'{dst}/{pg}').read() and 'fonts.gstatic.com' in open(f'{dst}/{pg}').read() for pg in pages(dst)) and not os.path.isfile(f'{dst}/assets/css/fonts.css'), q.stdout + q.stderr)
check('after switching back the project passes tools/check.py', checker(dst).returncode == 0)
q = run(dst, '--mode', 'none'); g = open(f'{dst}/assets/js/guard.js').read()
check("--mode none: FONTS='none' and no Google address in the CSPs", q.returncode == 0 and "var FONTS='none'" in g and all('fonts.googleapis.com' not in open(f'{dst}/{pg}').read() for pg in pages(dst)))
check('and the project still passes tools/check.py', checker(dst).returncode == 0)
run(dst, '--mode', 'google')
sig = open(f'{dst}/assets/js/guard.js').read() == open(f'{SRC}/assets/js/guard.js').read()
check('google -> self -> google -> none -> google leaves guard.js byte-for-byte identical to the shipped file', sig)

srv.shutdown()
ok = all(RES); print(f'\n{sum(RES)}/{len(RES)} checks passed'); sys.exit(0 if ok else 1)
