"""End-to-end runner.  python3 tests/e2e/run.py [suite ...]

Runs the numbered suites (s01_..., s02_..., ...) in order against ONE shared mock repository, so each suite builds on the data
the previous one created. s99_* is destructive (deletes the client, changes the admin password) and must stay last.
Everything runs in a real Chromium with GitHub, the CDN and GitHub Pages simulated by mockgh.py: no network, no token, no side effects.
"""
import glob, importlib, os, sys, traceback
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from playwright.sync_api import sync_playwright
from mockgh import Mock
from lib import R, new_state

here = os.path.dirname(os.path.abspath(__file__))
mods = sys.argv[1:] or sorted(os.path.basename(p)[:-3] for p in glob.glob(os.path.join(here, 's[0-9][0-9]_*.py')))
shim = open(os.path.join(here, 'fixtures', 'cryptojs-standin.js'), encoding='utf-8').read()
r, mock = R(), Mock(shim)
with sync_playwright() as p:
    browser = p.chromium.launch(args=['--no-sandbox'], headless=not os.environ.get('HEADED'), slow_mo=int(os.environ.get('SLOWMO', '0')))
    S = new_state(browser, mock, r)
    try:
        for m in mods:
            print(f'\n=== {m}', flush=True)
            importlib.import_module(m).run(S)
    except Exception:
        traceback.print_exc()
        r.check('test run completed without a harness error', False)
    # the 404s are expected probes (missing optional files); the single 403 is the failure injected on purpose by s99
    seen403 = []
    def expected(e):
        if 'Failed to load resource' in e[2] and '404' in e[2]:
            return True
        if 'Failed to load resource' in e[2] and '403' in e[2] and not seen403:
            seen403.append(1); return True
        return False
    bad = [e for e in S.errors if not expected(e)]
    r.check('no JS errors / CSP violations in any page', not bad, str(bad[:4]))
    browser.close()
sys.exit(0 if r.summary() else 1)
