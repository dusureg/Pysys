"""Fonts: IBM Plex Sans (English) and IBM Plex Sans Arabic load from Google Fonts WITHOUT blocking the page, the right family is used per language,
and the site still starts and looks fine when the font servers are slow or unreachable. (The font files here are a small stand-in served by the mock.)"""
from urllib.parse import urlparse, parse_qs
from mockgh import BASE, ADMIN_URL
from lib import *

FAMILY_JS = "() => getComputedStyle(document.body).fontFamily"


def font_reqs(mock, label):
    return [x for x in mock.reqlog if x[0] == label and urlparse(x[2]).netloc in ('fonts.googleapis.com', 'fonts.gstatic.com')]


def run(S):
    r, mock = S.r, S.mock
    html = {n: open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', n), encoding='utf-8').read() for n in ('index.html', ADMIN_URL.split('/')[-2] + '/index.html')}
    for n, h in html.items():
        csp = re.search(r'Content-Security-Policy" content="([^"]+)"', h).group(1)
        style = re.search(r'style-src ([^;]+)', csp).group(1); font = re.search(r'font-src ([^;]+)', csp).group(1)
        r.check(f'{n}: the CSP lets in exactly Google Fonts (CSS host in style-src, file host in font-src) and nothing wider', 'https://fonts.googleapis.com' in style and font.strip() == "'self' https://fonts.gstatic.com" and '*' not in csp.replace("'unsafe-inline'", ''), csp)

    # ---- normal: the client site
    mock.fonts = 'ok'
    ctx, cp = new_page(S, 'fonts-ok')
    cp.goto(BASE); cp.wait_for_selector('#clQ')
    cp.wait_for_function("() => document.fonts && [...document.fonts].some((f) => f.family.replace(/['\"]/g, '') === 'IBM Plex Sans' && f.status === 'loaded')", timeout=15000)
    reqs = font_reqs(mock, 'fonts-ok'); css = [x for x in reqs if 'googleapis' in x[2]]
    q = parse_qs(urlparse(css[0][2]).query) if css else {}
    r.check('the Google Fonts stylesheet is requested once, for both families, only weights 400 and 700, with display=swap', len(css) == 1 and set(q.get('family', [])) == {'IBM Plex Sans:wght@400;700', 'IBM Plex Sans Arabic:wght@400;700'} and q.get('display') == ['swap'], str(css))
    r.check('the font files come from fonts.gstatic.com (at most one per weight and family)', 1 <= len([x for x in reqs if 'gstatic' in x[2]]) <= 4, str(reqs))
    r.check('the stylesheet link is non-blocking (print media first, switched to all once loaded) and the file host is preconnected', cp.evaluate("""() => { const l = [...document.querySelectorAll('link[rel=stylesheet]')].find((x) => x.href.includes('fonts.googleapis.com'));
        return !!l && l.media === 'all' && !!document.querySelector('link[rel=preconnect][href="https://fonts.gstatic.com"]'); }"""))
    fam = cp.evaluate(FAMILY_JS)
    r.check('English screen: the page text uses IBM Plex Sans first, then system fonts', fam.replace('"', '').startswith('IBM Plex Sans,') and 'sans-serif' in fam, fam)
    cp.click('#btnLang'); cp.wait_for_function("() => document.documentElement.lang === 'ar'")
    fam_ar = cp.evaluate(FAMILY_JS)
    r.check('Arabic screen: the page text uses IBM Plex Sans Arabic first', fam_ar.replace('"', '').startswith('IBM Plex Sans Arabic'), fam_ar)
    cp.evaluate("document.fonts.load('16px \"IBM Plex Sans Arabic\"', 'مرحبا')")
    r.check('Arabic text actually loads the Arabic family', cp.evaluate("document.fonts.check('16px \"IBM Plex Sans Arabic\"', 'مرحبا')"))
    cp.click('#btnLang'); cp.wait_for_function("() => document.documentElement.lang === 'en'")
    ctx.close()

    # ---- slow font server: the page must not wait for it
    mock.fonts = 'hold'
    ctx, hp = new_page(S, 'fonts-hold')
    hp.goto(BASE, wait_until='domcontentloaded'); hp.wait_for_selector('#clQ', timeout=8000)   # the load event itself waits for the pending stylesheet; the page does not
    fcp = hp.evaluate("() => { const e = performance.getEntriesByName('first-contentful-paint')[0]; return e ? Math.round(e.startTime) : -1; }")
    held = len(mock.held)
    r.check('font server never answers: the page is drawn and usable anyway (search box visible, text painted)', hp.is_visible('#clQ') and fcp > 0 and held >= 1, f'fcp={fcp} held={held}')
    hp.fill('#clQ', 'hello world'); hp.wait_for_selector('.live-out:has-text("does not look like")', timeout=8000)
    r.check('while the fonts are still pending the live search already works', True)
    mock.release_fonts(); hp.wait_for_timeout(300)
    r.check('and when the pending font requests finally fail, nothing breaks or shows a diagnostics box', hp.locator('#app[data-diag]').count() == 0 and hp.is_visible('#clQ'))
    ctx.close()

    # ---- fonts blocked completely (no Google, e.g. a restricted network)
    mock.fonts = 'fail'
    ctx, fp = new_page(S, 'fonts-fail')
    fp.goto(BASE); fp.wait_for_selector('#clQ', timeout=8000); fp.wait_for_timeout(500)
    fam = fp.evaluate(FAMILY_JS)
    r.check('fonts blocked: the page still starts with no diagnostics box and falls back to the system font stack', fp.locator('#app[data-diag]').count() == 0 and 'sans-serif' in fam and fp.evaluate("() => document.body.getBoundingClientRect().height > 300"), fam)
    r.check('fonts blocked: text is visible (not hidden while waiting for a font)', fp.evaluate("() => getComputedStyle(document.querySelector('h1,h2,.brandname,#brandName') || document.body).visibility === 'visible' && document.body.innerText.trim().length > 20"))
    ctx.close()
    # the admin site too (lock screen)
    ctx, ap = new_page(S, 'fonts-fail', storage_state=S.admin_ctx.storage_state())     # a browser that already has the connection saved: the lock screen
    ap.goto(ADMIN_URL); ap.wait_for_selector('#lockPw', timeout=8000)
    r.check('fonts blocked: the admin lock screen still appears', ap.is_visible('#lockPw') and ap.locator('#app[data-diag]').count() == 0)
    ctx.close()
    mock.fonts = 'ok'
    # the blocked / pending font requests are expected "Failed to load resource" console lines; real script errors and CSP violations still count
    S.errors[:] = [e for e in S.errors if not (e[0].startswith('fonts-') and 'Failed to load resource' in e[2])]

    # ---- the unlocked admin app and the printable paper use the same families
    pg = S.admin
    pg.evaluate("document.querySelector('#adminNav a[data-route=dashboard]').click()")
    pg.wait_for_selector('#btnNewClient')
    fam = pg.evaluate(FAMILY_JS)
    r.check('admin screen (English): IBM Plex Sans first', fam.replace('"', '').startswith('IBM Plex Sans,'), fam)
    pg.evaluate(f"location.hash = '#contract/{S.cid}/0'"); pg.wait_for_selector('#ctPaper')
    pf = pg.evaluate("() => getComputedStyle(document.querySelector('#ctPaper')).fontFamily")
    r.check('the printable contract paper uses the same font stack (so a saved PDF is in Plex too)', pf.replace('"', '').startswith('IBM Plex Sans'), pf)
    pg.evaluate("location.hash = '#dashboard'"); pg.wait_for_selector('#btnNewClient')
