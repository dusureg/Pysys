"""Admin: the Troubleshooter (#doctor). It works before anybody signs in, runs every check one after the other, says what to do about each problem, can copy a report,
and changes nothing. Also: the same screen after signing in (repository, vault, data files, history, who is signed in) and under failure: GitHub unreachable,
rate limit nearly used up, a file of the page that fails when asked for.
(The page that cannot start at all, and its start-up diagnostics box, are covered by tests/e2e/boot.py.)"""
from mockgh import ADMIN_URL
from lib import *

ROWS_JS = "() => Object.fromEntries([...document.querySelectorAll('#docList .docrow')].map((r) => [r.id.slice(4), r.dataset.status]))"


def finished(pg, timeout=90000):
    pg.wait_for_function("() => { const s = document.querySelector('#docSummary'); return !!s && !s.hidden; }", timeout=timeout)
    return pg.evaluate(ROWS_JS)


def noise(S, n0):
    S.errors[n0:] = [e for e in S.errors[n0:] if not (e[1] == 'error' and ('Failed to load resource' in e[2] or 'net::ERR' in e[2]))]


def run(S):
    r, mock = S.r, S.mock
    ids = None

    # ================= before signing in =================
    n0 = len(S.errors)
    ctx, pg = new_page(S, 'doctor')
    pg.goto(ADMIN_URL + '#doctor'); pg.wait_for_selector('#docScreen', timeout=60000)
    ids = pg.evaluate("() => DOC_CHECKS.map((c) => c[0])")
    r.check('the troubleshooter opens without signing in and lists every check, in order', pg.locator('#docList .docrow').count() == len(ids) and ids[:3] == ['secure', 'storage', 'libs'], str(ids))
    st = finished(pg)
    r.check('browser checks pass: secure page, storage, CryptoJS, browser features, the files of this page, GitHub, clock', all(st[k] == 'ok' for k in ('secure', 'storage', 'libs', 'features', 'files', 'github', 'clock')), str(st))
    r.check('checks that need the repository are skipped (not failed) before sign-in', all(st[k] == 'skip' for k in ('repo', 'vault', 'data', 'history', 'me')) and st['site'] in ('skip', 'ok'), str(st))
    r.check('no check fails; the summary says so', 'bad' not in st.values() and 'problem' not in pg.inner_text('#docSummary'), pg.inner_text('#docSummary'))
    r.check('not signed in: a note explains and a Sign in link is offered', 'not signed in' in pg.inner_text('#docScreen') and pg.locator('#lnkDocSign').count() == 1)
    files_row = pg.inner_text('#doc-files')
    r.check('the files check says how many files of the page it reached', 'files' in files_row and any(ch.isdigit() for ch in files_row), files_row)
    pg.evaluate("() => { window.__copied = ''; navigator.clipboard.writeText = (s) => { window.__copied = s; return Promise.resolve(); }; }")
    pg.click('#docScreen .page-head .btn:has-text("Copy")'); pg.wait_for_function("() => !!window.__copied", timeout=5000)
    rep = pg.evaluate("() => window.__copied")
    r.check('Copy report puts one line per check, with its status, on the clipboard (ready to send to whoever helps)', rep.count('\n') >= len(ids) and '[ok]' in rep and 'Dusur portal' in rep, rep[:300])
    r.check('the report holds no token, no password, no key', 'ghp_' not in rep and 'github_pat' not in rep and S.secret not in rep and PW1 not in rep)
    pg.screenshot(path=f'{SP}/shot-doctor-ok.png', full_page=True)
    pg.set_viewport_size({'width': 390, 'height': 800}); pg.wait_for_timeout(200)
    r.check('on a phone the troubleshooter does not scroll sideways', pg.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'))
    pg.click('#btnLang'); pg.wait_for_function("() => document.documentElement.lang === 'ar'"); finished(pg)
    r.check('in Arabic the screen is right-to-left and every row has an Arabic label', pg.evaluate('document.dir') == 'rtl' and pg.locator('#docList .docrow').count() == len(ids) and not [x for x in pg.locator('#docList strong').all_inner_texts() if x.startswith('doc.')])
    pg.click('#btnLang'); pg.wait_for_function("() => document.documentElement.lang === 'en'"); finished(pg)
    pg.set_viewport_size({'width': 1280, 'height': 900})

    # ================= failures =================
    mock.gh_down = True
    pg.click('#btnDocRun'); st = finished(pg)
    r.check('GitHub unreachable: the GitHub row fails with advice, the clock check is skipped, the summary counts the problem', st['github'] == 'bad' and st['clock'] == 'skip' and '1 problem' in pg.inner_text('#docSummary') and 'internet connection' in pg.inner_text('#doc-github'), pg.inner_text('#doc-github') + ' / ' + pg.inner_text('#docSummary'))
    r.check('a failed run can be repeated with the same button', not pg.is_disabled('#btnDocRun'))
    mock.gh_down = False
    mock.rate_left = 3
    pg.click('#btnDocRun'); st = finished(pg)
    r.check('rate limit nearly used up: a warning (not an error) with minutes until it resets', st['github'] == 'warn' and 'resets in' in pg.inner_text('#doc-github') and 'problem' not in pg.inner_text('#docSummary') , pg.inner_text('#doc-github'))
    mock.rate_left = 57
    mock.head_fail = {'admin-0c006c16/js/views/audit.js'}
    pg.click('#btnDocRun'); st = finished(pg)
    r.check('a file of the page that cannot be reached is named', st['files'] == 'bad' and 'views/audit.js (404)' in pg.inner_text('#doc-files'), pg.inner_text('#doc-files'))
    mock.head_fail = set()
    pg.click('#btnDocRun'); st = finished(pg)
    r.check('after the problems are gone, running again shows everything fine', 'bad' not in st.values() and 'warn' not in st.values(), str(st))
    noise(S, n0)
    ctx.close()

    # ================= signed in =================
    adm = S.admin
    adm.set_viewport_size({'width': 1280, 'height': 900})
    adm.evaluate("() => { location.hash = '#doctor'; }"); adm.wait_for_selector('#docScreen', timeout=60000)
    st = finished(adm)
    r.check('signed in: repository, public site, vault, data files, history and "who am I" all pass', all(st[k] == 'ok' for k in ('repo', 'site', 'vault', 'data', 'history', 'me')) and 'bad' not in st.values(), str(st))
    r.check('the data check counts the client files and the currency', 'EGP' in adm.inner_text('#doc-data') or 'file' in adm.inner_text('#doc-data'), adm.inner_text('#doc-data'))
    r.check('the signed-in screen has no "not signed in" note', 'not signed in' not in adm.inner_text('#docScreen'))
    r.check('the menu keeps the Troubleshooter entry for the administrator', adm.locator('#adminNav a[data-route=doctor]').count() == 1)
    adm.evaluate("() => flushAudit()"); commits_before = len(mock.commits)
    adm.click('#btnDocRun'); finished(adm)
    r.check('running the checks changes nothing in the repository', len(mock.commits) == commits_before)
    adm.evaluate("() => { location.hash = '#dashboard'; }"); adm.wait_for_selector('#btnNewClient', timeout=30000)
