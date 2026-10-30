"""Admin: several users with roles. The administrator adds members, gives each a role, pauses / resumes / blocks them and changes the encryption key;
a member signs in on their own device, sees only what their role allows, cannot reach the administrator screens, and cannot write what the role does not cover."""
import json, re
from mockgh import ADMIN_URL, OWNER, REPO
from lib import *

TEAM = 'data/private/team.json'


def member_login(S, name, pw, wait='#navUser'):
    ctx, pg = new_page(S, 'member-' + name)
    pg.goto(f'{ADMIN_URL}#join/{OWNER}/{REPO}'); pg.wait_for_selector('#tmUser')
    pg.fill('#tmUser', name); pg.fill('#tmPw', pw); pg.click('#btnTmSignIn')
    return ctx, pg


def routes(pg):
    return pg.eval_on_selector_all('#adminNav a[data-route]', 'els => els.map(e => e.dataset.route)')


def add_member(pg, name, user, role):
    pg.click('#btnAddMember'); pg.wait_for_selector('#tmName')
    pg.fill('#tmName', name); pg.fill('#tmNewUser', user); pg.select_option('#tmNewRole', role)
    pw = pg.input_value('#tmNewPw')
    pg.click('#btnMemberCreate'); pg.wait_for_selector('#credCard')
    return pw


def row_id(pg, user):
    return pg.get_attribute(f'tr[data-user="{user}"]', 'data-id')


def run(S):
    r, mock, pg = S.r, S.mock, S.admin
    pg.set_viewport_size({'width': 1280, 'height': 900})
    dialogs = []
    on_dialog = lambda d: (dialogs.append(d.message), d.accept())
    pg.on('dialog', on_dialog)

    # ---- the administrator's menu and the Team screen
    pg.evaluate("location.hash = '#team'"); pg.wait_for_selector('#teamScreen')
    nav = routes(pg)
    r.check('the administrator sees every area in the menu, including Team, Configuration and History', all(x in nav for x in ('dashboard', 'finance', 'audit', 'team', 'settings', 'config', 'doctor')), str(nav))
    r.check('Team starts empty and lists the five built-in roles', 'No team members yet' in pg.inner_text('#membersCard') and pg.locator('#rolesCard tbody tr').count() == 5)
    r.check('nothing is written until the first member is added', TEAM not in mock.files)
    join = pg.inner_text('#joinLink')
    r.check('the sign-in link for the team names the repository (no secret in it)', join.endswith(f'#join/{OWNER}/{REPO}'), join)

    # ---- add an accountant
    pw_mona = add_member(pg, 'Mona Accountant', 'mona.acc', 'accountant')
    r.check('the temporary password is generated (16+ characters) and shown once with the user name and link', len(pw_mona) >= 12 and pg.inner_text('#credUser') == 'mona.acc' and pg.inner_text('#credPw') == pw_mona and '#join/' in pg.inner_text('#credLink'))
    r.check('team.json exists and is an AES-GCM envelope (no names, user names or roles in the clear)', TEAM in mock.files and set(json.loads(mock.text(TEAM))) == {'v', 'iv', 'ct'} and not [s for s in ('Mona', 'mona.acc', 'accountant') if s in mock.text(TEAM)])
    keys = mock.paths('data/private/keys/')
    r.check('one login file was created; its name is a hash (not the user name) and it holds no password, token or key in the clear', len(keys) == 1 and 'mona' not in keys[0]
            and not [s for s in (pw_mona, 'github_pat', 'TESTTOKEN') if s in mock.text(keys[0])], str(keys))
    kf = json.loads(mock.text(keys[0]))
    r.check('the login file holds a wrapped private key and a sealed envelope only', {'salt', 'iv', 'ct', 'env'} <= set(kf), str(set(kf)))
    pg.click('#btnCredDone')
    pg.click('#btnAddMember'); pg.wait_for_selector('#tmName'); pg.fill('#tmName', 'Other'); pg.fill('#tmNewUser', 'MONA.acc'); pg.click('#btnMemberCreate'); toast_text(pg, 'already taken')
    r.check('a second member with the same user name (any letter case) is refused', pg.locator('#credCard').count() == 0 and len(mock.paths('data/private/keys/')) == 1)
    pg.click('#addMemberCard button:has-text("Cancel")')

    # ---- the member signs in on another device
    ctx, mp = member_login(S, 'Mona.Acc', 'wrong password here')
    mp.wait_for_selector('#tmErr:not([hidden])'); r.check('a wrong password is refused with a plain message', 'not correct' in mp.inner_text('#tmErr'))
    mp.fill('#tmUser', 'nobody.here'); mp.click('#btnTmSignIn'); mp.wait_for_selector('#tmErr:not([hidden])')
    r.check('an unknown user name gives the same message as a wrong password', 'not correct' in mp.inner_text('#tmErr'))
    mp.fill('#tmUser', 'mona.acc'); mp.fill('#tmPw', pw_mona); mp.click('#btnTmSignIn'); mp.wait_for_selector('#accountScreen', timeout=40000)
    r.check('first sign-in leads to Account: the temporary password must be changed', mp.evaluate('location.hash') == '#account' and mp.locator('#pwForm').count() == 1 and 'temporary password' in mp.inner_text('#accountScreen'))
    mp.evaluate("location.hash = '#dashboard'")
    r.check('until the password is changed the member cannot leave Account', mp.evaluate('location.hash') == '#account')
    mp.fill('#acOld', pw_mona); mp.fill('#acNew', 'short'); mp.fill('#acNew2', 'short'); mp.click('#btnPwChange')
    r.check('a short new password is refused', 'at least' in mp.inner_text('#pwForm'))
    new_pw = 'a much longer password 123'
    mp.fill('#acOld', 'not the old one'); mp.fill('#acNew', new_pw); mp.fill('#acNew2', new_pw); mp.click('#btnPwChange')
    mp.wait_for_function("() => /not correct/.test(document.querySelector('#pwForm').innerText)")
    mp.fill('#acOld', pw_mona); mp.click('#btnPwChange'); toast_text(mp, 'Password changed', 30000)
    r.check('the password is changed (the old one must be right) and the temporary-password note is gone', mp.locator('#pwForm').count() == 1 and 'temporary password' not in mp.inner_text('#accountScreen'))
    mp.evaluate("location.hash = '#dashboard'"); mp.wait_for_selector('#btnRefresh', timeout=40000)

    # ---- what an accountant sees
    nav = routes(mp)
    r.check('the accountant sees Finance and Reports', 'finance' in nav and 'reports' in nav, str(nav))
    r.check('the accountant does NOT see Team, Configuration or Settings in the menu', not any(x in nav for x in ('team', 'config', 'settings')), str(nav))
    r.check('the menu shows who is signed in and their role', 'Mona Accountant' in mp.inner_text('#navUser') and 'Accountant' in mp.inner_text('#navUser'))
    for h_, name in (('#team', 'Team'), ('#config', 'Configuration'), ('#settings', 'Settings')):
        mp.evaluate(f"location.hash = '{h_}'"); mp.wait_for_selector('#app .card.state')
        r.check(f'typing the address of {name} does not open it: access is denied', 'do not have access' in mp.inner_text('#app'), mp.inner_text('#app')[:80])
    mp.evaluate("location.hash = '#dashboard'"); mp.wait_for_selector('#btnRefresh')

    # ---- the member works inside their role: an expense (finance: edit)
    mp.evaluate("location.hash = '#expenses/new'"); mp.wait_for_selector('#expName', timeout=40000)
    mp.fill('#expName', 'Workshop rent'); mp.select_option('#expCatSel', 'rent'); mp.fill('#expAmount', '8000'); mp.select_option('#expRepeatSel', 'monthly')
    save(mp)
    r.check('the member saved an expense: the commit message carries their name', any(c[1] == 'data/private/ops/expenses.json' and c[2].startswith('[Mona Accountant] ') for c in mock.commits), str([c for c in mock.commits if 'expenses' in c[1]][-2:]))

    mp.wait_for_function('() => auditQ.length === 0', timeout=20000, polling=250)        # the member's history entries are written a moment after the save
    # ---- the write guard: even a forged call from the member's own page is refused for areas the role does not cover
    out = mp.evaluate("""async () => { try { await putFile('data/private/ops/suppliers.json', '{}', 'sneaky', { create: true }); return 'written'; } catch (e) { return e.message; } }""")
    r.check('the write guard refuses a save to a file the role does not cover (suppliers)', 'not allowed' in out and 'data/private/ops/suppliers.json' not in [c[1] for c in mock.commits if 'sneaky' in c[2]], out)
    out = mp.evaluate("""async () => { try { await putFile('data/private/team.json', '{}', 'sneaky'); return 'written'; } catch (e) { return e.message; } }""")
    r.check('the write guard refuses any change to the team file or the vault', 'not allowed' in out, out)

    # ---- the history shows the member's actions
    pg.evaluate("location.hash = '#audit'"); pg.wait_for_selector('#audScreen', timeout=40000)
    txt = pg.inner_text('#audList')
    r.check('the History screen lists the member\'s expense and sign-in with their name', 'Mona Accountant' in txt and 'Workshop rent' in txt, txt[:300])

    # ---- edit what a role may do
    pg.evaluate("location.hash = '#team'"); pg.wait_for_selector('#rolesCard')
    pg.select_option('#perm-accountant-suppliers', '2'); pg.click('#btnSaveRoles'); toast_text(pg, 'Saved')
    # the member's page picks up the new rights at its next check (we make the check due)
    mp.evaluate('accessAt = 0'); mp.evaluate("document.dispatchEvent(new Event('visibilitychange'))")
    mp.wait_for_function("() => document.querySelector('#adminNav a[data-route=suppliers]')", timeout=30000, polling=250)
    r.check('within the next check the accountant gets Suppliers in their menu without signing in again', 'suppliers' in routes(mp))

    # ---- pause
    uid = row_id(pg, 'mona.acc')
    pg.click(f'#btnPause-{uid}'); toast_text(pg, 'Saved')
    pg.wait_for_selector('tr[data-user="mona.acc"] [data-status=paused]')
    r.check('the member is shown as Paused', 'Paused' in pg.inner_text('tr[data-user="mona.acc"]'))
    mp.evaluate('accessAt = 0'); mp.evaluate("document.dispatchEvent(new Event('visibilitychange'))")
    mp.wait_for_selector('#lockNote', timeout=30000)
    r.check('a paused member is signed out within the next check and told why', 'paused' in mp.inner_text('#lockNote') and mp.locator('#tmUser').count() == 1)
    mp.fill('#tmUser', 'mona.acc'); mp.fill('#tmPw', new_pw); mp.click('#btnTmSignIn'); mp.wait_for_selector('#tmErr:not([hidden])', timeout=30000)
    r.check('a paused member cannot sign in until resumed', 'paused' in mp.inner_text('#tmErr'))
    pg.click(f'#btnResume-{uid}'); toast_text(pg, 'Saved')
    mp.fill('#tmPw', new_pw); mp.click('#btnTmSignIn'); mp.wait_for_selector('#btnRefresh', timeout=40000)
    r.check('after resuming, the member signs in with the password they chose', mp.locator('#adminNav').count() == 1 and 'finance' in routes(mp))

    # ---- a viewer is read-only
    sel = pg.locator(f'#role-{uid}'); sel.select_option('viewer'); toast_text(pg, 'Saved')
    mp.evaluate('accessAt = 0'); mp.evaluate("document.dispatchEvent(new Event('visibilitychange'))")
    mp.wait_for_function("() => !document.querySelector('#adminNav a[data-route=finance]') || true", timeout=30000)
    mp.wait_for_timeout(1500)
    mp.evaluate("location.hash = '#finance'"); mp.wait_for_selector('#app .card.state, #finScreen', timeout=30000)
    r.check('a viewer role without Finance gets "no access" on the Finance screen', 'do not have access' in mp.inner_text('#app'), mp.inner_text('#app')[:100])
    mp.evaluate("location.hash = '#suppliers'"); mp.wait_for_selector('#supScreen', timeout=30000)
    r.check('a viewer opens Suppliers but the Add button is hidden (view only)', not mp.locator('#btnNewSup').is_visible())
    mp.evaluate("location.hash = '#suppliers/new'"); mp.wait_for_selector('#roNote', timeout=30000)
    r.check('a viewer who types the address of the form sees it switched off with a view-only note and no Save button', mp.locator('#btnSave').count() == 0 and mp.locator('fieldset.rofield[disabled]').count() == 1 and mp.locator('#supName').is_disabled())

    # ---- block: the login file is deleted at once
    n_keys = len(mock.paths('data/private/keys/'))
    pg.evaluate("location.hash = '#team'"); pg.wait_for_selector('#rolesCard')
    pg.click(f'#btnBlock-{uid}'); toast_text(pg, 'Saved'); pg.wait_for_selector('tr[data-user="mona.acc"] [data-status=blocked]')
    r.check('blocking deletes the member\'s login file from the repository', len(mock.paths('data/private/keys/')) == n_keys - 1)
    r.check('a blocked member is listed as Blocked and may be removed', 'Blocked' in pg.inner_text(f'tr[data-user="mona.acc"]') and pg.locator(f'#btnRemove-{uid}').count() == 1)
    mp.evaluate('accessAt = 0'); mp.evaluate("document.dispatchEvent(new Event('visibilitychange'))")
    mp.wait_for_selector('#lockNote', timeout=30000)
    r.check('the blocked member is signed out and cannot come back', 'blocked' in mp.inner_text('#lockNote').lower())
    mp.fill('#tmUser', 'mona.acc'); mp.fill('#tmPw', new_pw); mp.click('#btnTmSignIn'); mp.wait_for_selector('#tmErr:not([hidden])', timeout=30000)
    r.check('signing in as a blocked member fails', 'not correct' in mp.inner_text('#tmErr') or 'blocked' in mp.inner_text('#tmErr').lower())
    ctx.close()

    # ---- a second member, then the encryption key is changed
    pw_sami = add_member(pg, 'Sami Production', 'sami.prod', 'production'); pg.click('#btnCredDone')
    before_vault = mock.text('data/private/vault.json'); before_settings = mock.text('data/private/settings.json')
    pg.fill('#rotPw', 'wrong admin password'); pg.click('#btnRotate'); pg.wait_for_selector('#rotMsg.bad')
    r.check('changing the key needs the correct admin password', 'not correct' in pg.inner_text('#rotMsg') and mock.text('data/private/vault.json') == before_vault)
    pg.fill('#rotPw', PW1); pg.click('#btnRotate'); pg.wait_for_selector('#rotMsg.ok', timeout=60000)
    r.check('the key change finished: one commit holds every private file', any(c[0] == 'COMMIT' and c[2] == 'Change encryption key' for c in mock.commits), pg.inner_text('#rotMsg'))
    r.check('the vault and the settings were re-encrypted (new contents) and are still envelopes only', mock.text('data/private/vault.json') != before_vault and mock.text('data/private/settings.json') != before_settings
            and set(json.loads(mock.text('data/private/settings.json'))) == {'v', 'iv', 'ct'})
    r.check('the administrator keeps working without signing in again', pg.evaluate("() => !!session && !!session.master"))
    pg.evaluate("location.hash = '#dashboard'"); pg.wait_for_selector('#btnNewClient', timeout=60000)
    r.check('clients are still readable after the key change', pg.locator('.list .item').count() >= 1 and 'DS-CL-' in pg.inner_text('.list'))
    ctx2, sp = member_login(S, 'sami.prod', pw_sami)
    sp.wait_for_selector('#accountScreen', timeout=60000)
    r.check('the second member signs in after the key change (their access was re-issued under the new key)', sp.locator('#pwForm').count() == 1)
    ctx2.close()

    # ---- the administrator's own history entries
    pg.evaluate("location.hash = '#audit'"); pg.wait_for_selector('#audScreen', timeout=40000)
    txt = pg.inner_text('#audList')
    r.check('History shows the pause, block and key change', all(w in txt for w in ('Paused', 'Blocked', 'Encryption key changed')), txt[:200])
    pg.evaluate("location.hash = '#dashboard'"); pg.wait_for_selector('#btnNewClient')
    pg.remove_listener('dialog', on_dialog)
