import datetime, re, json
from types import SimpleNamespace
from mockgh import TOKEN, BASE

PW1, PW2 = 'correct horse battery', 'staple battery horse 42'
import os
SP = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '.out')      # screenshots and downloaded files land here (git-ignored)
os.makedirs(SP, exist_ok=True)


class R:
    def __init__(self):
        self.rows = []

    def check(self, name, cond, extra=''):
        self.rows.append((bool(cond), name))
        print(('PASS ' if cond else 'FAIL ') + name + (f'  [{extra}]' if (extra and not cond) else ''), flush=True)

    def summary(self):
        bad = [n for ok, n in self.rows if not ok]
        print(f'\n{len(self.rows) - len(bad)}/{len(self.rows)} checks passed')
        return not bad


def day(offset=0):
    return (datetime.date.today() + datetime.timedelta(days=offset)).isoformat()


def new_state(browser, mock, results):
    return SimpleNamespace(browser=browser, mock=mock, r=results, errors=[], cid=None, secret=None, skus=[])


def new_page(S, label, **kw):
    ctx = S.browser.new_context(viewport={'width': 1280, 'height': 900}, **kw)
    ctx.route('**/*', S.mock.handler(label))
    pg = ctx.new_page()
    pg.on('pageerror', lambda e: S.errors.append((label, 'pageerror', str(e))))
    pg.on('console', lambda m: S.errors.append((label, m.type, m.text)) if m.type == 'error' else None)
    return ctx, pg


def toast_text(pg, contains, timeout=15000):
    pg.wait_for_selector(f'.toast:has-text("{contains}")', timeout=timeout)


def unlock(pg, pw):
    pg.fill('#lockPw', pw)
    pg.click('button:has-text("Unlock")')


def money_in(text, n):
    """True if the amount n (e.g. 28000) appears formatted with thousands separators."""
    return f'{n:,}' in text


# PBKDF2 + CryptoJS decrypt of a client payload inside a page (mirrors the app's clientPassphrase)
DECRYPT_JS = """async ({payload, secret, id}) => {
  const enc = new TextEncoder();
  const base = await crypto.subtle.importKey('raw', enc.encode(secret), 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode('dscl-v1:' + id), iterations: 310000}, base, 256));
  const pass = Array.from(bits, b => b.toString(16).padStart(2, '0')).join('');
  try { return CryptoJS.AES.decrypt(payload, pass).toString(CryptoJS.enc.Utf8); } catch (e) { return ''; }
}"""


def wait_until(pg, fn, timeout=20, step=200, what='condition'):
    waited = 0
    while waited < timeout * 1000:
        if fn():
            return True
        pg.wait_for_timeout(step)
        waited += step
    raise TimeoutError('timed out waiting for ' + what)


def save(pg):
    """Click Save & publish and wait for the 'Saved <time>' state (text-matches is case sensitive, so 'Unsaved' does not match)."""
    pg.click('#btnSave')
    pg.wait_for_selector('.savebar >> text=/^Saved /', timeout=20000)
