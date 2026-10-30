"""Start-up resilience, for BOTH pages: slow or blocked CDNs, fallback CDNs, a script that crashes, a file that fails to load,
scripts blocked by the host, and the optional local CryptoJS copy.   python3 tests/e2e/boot.py

The goal: a visitor (or you) never sees an empty page. Either the app starts, or a visible message says what went wrong.
"""
import base64, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright
from mockgh import Mock, BASE, ADMIN_URL
from lib import R, SP

r = R()
shim = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fixtures', 'cryptojs-standin.js'), encoding='utf-8').read()
SITES = [('client', BASE, '#clQ', 'DUSUR', 'assets/js/core/dom.js'), ('admin', ADMIN_URL, '#cfgUser', 'DUSUR', None)]
UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36'
CDNS = ['cdnjs.cloudflare.com', 'cdn.jsdelivr.net', 'unpkg.com']
abort = lambda rt: rt.abort()


def open_page(b, mock, url, cdn=None, wait_until='load'):
    """cdn: {host: handler} overrides; every other request goes to the mock (Pages, GitHub, CDN stand-in)."""
    ctx = b.new_context(viewport={'width': 412, 'height': 860}, is_mobile=True, has_touch=True, user_agent=UA)
    base = mock.handler('boot'); cdn = cdn or {}
    def handle(rt):
        host = urlparse(rt.request.url).netloc
        return cdn[host](rt) if host in cdn else base(rt)
    ctx.route('**/*', handle)
    pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(url, wait_until=wait_until)
    return ctx, pg, errs


with sync_playwright() as p:
    b = p.chromium.launch(args=['--no-sandbox'], headless=not os.environ.get('HEADED'), slow_mo=int(os.environ.get('SLOWMO', '0')))
    for NAME, URL, READY, HDR, CORE in SITES:
        mock = Mock(shim)
        crash_file = 'assets/js/core/constants.js'
        missing = CORE or 'js/state.js'
        if NAME == 'admin':
            missing = URL.replace(BASE, '') + 'js/state.js'
        # 1 normal
        ctx, pg, e = open_page(b, mock, URL); pg.wait_for_selector(READY, timeout=20000)
        r.check(NAME + ': normal: app starts, header has its text and icons', HDR in pg.inner_text('header') and pg.locator('header svg').count() > 0 and not e, str(e)); ctx.close()
        # 2 cdnjs blocked -> jsDelivr
        ctx, pg, e = open_page(b, mock, URL, {CDNS[0]: abort}); pg.wait_for_selector(READY, timeout=20000)
        r.check(NAME + ': cdnjs blocked: falls back to jsDelivr and the app starts', pg.evaluate('typeof CryptoJS') == 'object'); ctx.close()
        # 3 cdnjs + jsDelivr blocked -> unpkg
        ctx, pg, e = open_page(b, mock, URL, {CDNS[0]: abort, CDNS[1]: abort}); pg.wait_for_selector(READY, timeout=20000)
        r.check(NAME + ': cdnjs + jsDelivr blocked: falls back to unpkg', pg.evaluate('typeof CryptoJS') == 'object'); ctx.close()
        # 4 every CDN blocked -> clear message, header intact
        ctx, pg, e = open_page(b, mock, URL, {h: abort for h in CDNS}); pg.wait_for_selector('text=could not be loaded', timeout=20000)
        r.check(NAME + ': all CDNs blocked: clear message instead of an empty page', 'three CDNs' in pg.inner_text('#app') and HDR in pg.inner_text('header')); ctx.close()
        # 5 stalled CDN (no answer at all): header + loading text at once, never blank
        held = []
        ctx, pg, e = open_page(b, mock, URL, {h: (lambda rt: held.append(rt)) for h in CDNS}, wait_until='domcontentloaded'); pg.wait_for_selector('#app .spin', timeout=10000)
        r.check(NAME + ': stalled CDN: header text + "Loading the encryption library…" shown at once', HDR in pg.inner_text('header') and pg.locator('#app .spin').count() == 1)
        pg.click('#btnLang'); pg.wait_for_timeout(300)
        r.check(NAME + ': language button works while the library is still loading', pg.evaluate('document.documentElement.dir') == 'rtl')
        cdp = ctx.new_cdp_session(pg); open(f'{SP}/shot-boot-stalled-{NAME}.png', 'wb').write(base64.b64decode(cdp.send('Page.captureScreenshot', {'format': 'png'})['data']))
        for rt in held:                       # release the held requests before closing, otherwise Playwright logs CancelledError noise at exit
            try: rt.abort()
            except Exception: pass
        ctx.close()
        # 6 a script crashes while loading -> visible diagnostics with the error text
        mock.overrides[crash_file] = lambda body: b"throw new Error('boom test');\n" + body
        ctx, pg, e = open_page(b, mock, URL); pg.wait_for_selector('text=could not start', timeout=15000)
        r.check(NAME + ': script crash: diagnostics box shows the error text', 'boom test' in pg.inner_text('#app') and 'secure context' in pg.inner_text('#app'))
        pg.screenshot(path=f'{SP}/shot-boot-crash-{NAME}.png'); ctx.close(); mock.overrides.clear()
        # 7 a core file does not load at all (partial deploy, stale cache, blocked) -> diagnostics name the file
        miss_path = missing
        ctx = b.new_context(viewport={'width': 412, 'height': 860}, is_mobile=True, has_touch=True, user_agent=UA)
        down = {'on': True}                   # the file is unreachable until we say otherwise (a transient failure)
        def make_handler(miss, base):
            return lambda rt: rt.abort() if (down['on'] and rt.request.url.endswith(miss)) else base(rt)
        ctx.route('**/*', make_handler(miss_path, mock.handler('boot')))
        pg = ctx.new_page(); pg.goto(URL); pg.wait_for_selector('text=could not start', timeout=15000)
        txt = pg.inner_text('#app')
        r.check(NAME + ': a file that fails to load: diagnostics name it (no blank page)', 'could not load' in txt and miss_path.split('/')[-1] in txt, txt[:300])
        try:
            pg.wait_for_function("() => /Missing or unreachable \\(1 of \\d+\\)/.test(document.querySelector('#app').innerText)", timeout=20000); probe_ok = True
        except Exception:
            probe_ok = False
        txt = pg.inner_text('#app')
        r.check(NAME + ': step 2 of the diagnostics asks the server and blames only the file that is really missing (the page may ask its own site: CSP connect-src self)', probe_ok and miss_path.split('/')[-1] in txt.split('Missing or unreachable')[-1], txt[-400:])
        pg.screenshot(path=f'{SP}/shot-boot-missing-{NAME}.png')
        down['on'] = False                    # the connection recovers; the Reload button in the diagnostics box brings the app up
        pg.click('#app button:has-text("Reload")'); pg.wait_for_selector(READY, timeout=20000)
        r.check(NAME + ': transient file failure: the Reload button in the diagnostics box recovers the app', pg.locator('#app[data-diag]').count() == 0 and pg.evaluate('typeof CryptoJS') == 'object')
        ctx.close()
        # 8 scripts blocked by the host (a viewer that sets its own CSP): the pure-CSS hint appears after ~8 s
        mock.page_headers = {'Content-Security-Policy': "script-src 'none'"}
        ctx, pg, e = open_page(b, mock, URL); pg.wait_for_timeout(9500)
        op = pg.evaluate("getComputedStyle(document.querySelector('.slowhint')).opacity")
        r.check(NAME + ': scripts blocked by the host: static hint becomes visible without any JS', float(op) > 0.9 and 'Still blank' in pg.inner_text('#app'), op)
        pg.screenshot(path=f'{SP}/shot-boot-blocked-{NAME}.png'); ctx.close(); mock.page_headers = {}
        # 9 optional local CryptoJS copy: used first, no CDN request at all
        mock.overrides['assets/js/guard.js'] = lambda body: body.replace(b'USE_LOCAL_COPY=false', b'USE_LOCAL_COPY=true')
        mock.virtual['assets/vendor/crypto-js.min.js'] = shim.encode()
        mock.reqlog.clear()
        ctx, pg, e = open_page(b, mock, URL); pg.wait_for_selector(READY, timeout=20000)
        r.check(NAME + ': vendored copy enabled: CryptoJS comes from assets/vendor and no CDN is contacted',
                pg.evaluate('typeof CryptoJS') == 'object' and not [x for x in mock.reqlog if any(h in x[2] for h in CDNS)] and any('assets/vendor/crypto-js.min.js' in x[2] for x in mock.reqlog))
        ctx.close(); mock.overrides.clear(); mock.virtual.clear()
    b.close()
sys.exit(0 if r.summary() else 1)
