"""Admin: the administrator's own user name + password (any device, no GitHub token typed) and everybody's profile (phone, picture).
The administrator sets a long password, signs in from a device that has never seen the connection, keeps full rights, changes the password, loses it again
when the sign-in is removed; a team member edits only their own phone and picture; the profile files are sealed and survive a change of the encryption key."""
import json, os
from mockgh import ADMIN_URL, OWNER, REPO
from lib import *
from s15_team import member_login, add_member, row_id

HERE = os.path.dirname(os.path.abspath(__file__))
PIC = os.path.join(HERE, 'fixtures', 'avatar.png')
KEYS = 'data/private/keys/'
TEAM = 'data/private/team.json'
OWN_PW, OWN_PW2 = 'owner-long-password-1', 'another long owner password 2'


def owner_login(S, user, pw, label='owner-dev'):
    ctx, pg = new_page(S, label)
    pg.goto(f'{ADMIN_URL}#join/{OWNER}/{REPO}'); pg.wait_for_selector('#tmUser')
    pg.fill('#tmUser', user); pg.fill('#tmPw', pw); pg.click('#btnTmSignIn')
    return ctx, pg


def run(S):
    r, mock, pg = S.r, S.mock, S.admin
    n0 = len(S.errors)
    pg.set_viewport_size({'width': 1280, 'height': 900})
    dialogs = []
    on_dialog = lambda d: (dialogs.append(d.message), d.accept())
    pg.on('dialog', on_dialog)

    # ================= the administrator's own sign-in =================
    pg.evaluate("location.hash = '#team'"); pg.wait_for_selector('#ownerLoginCard')
    keys0 = len(mock.paths(KEYS))
    r.check('Team has a card for the administrator\'s own sign-in, not set up yet', 'Not set up' in pg.inner_text('#ownState') and pg.locator('#btnOwnerRemove').count() == 0)
    pg.fill('#ownUser', 'abdo.owner'); pg.fill('#ownPw', 'too short'); pg.click('#btnOwnerSave'); toast_text(pg, 'at least 12')
    r.check('a short password is refused (the file is public, so it must be long)', len(mock.paths(KEYS)) == keys0)
    pg.fill('#ownUser', 'mona.acc'); pg.fill('#ownPw', OWN_PW); pg.click('#btnOwnerSave'); toast_text(pg, 'already taken')
    r.check('the user name of a team member cannot be used', len(mock.paths(KEYS)) == keys0)
    pg.fill('#ownUser', 'Abdo.Owner'); pg.fill('#ownPw', OWN_PW); pg.click('#btnOwnerSave'); toast_text(pg, 'Sign-in saved')
    pg.wait_for_selector('#ownLink')
    new_keys = [p for p in mock.paths(KEYS)]
    r.check('one more login file is written, named by a hash, holding no password, token or user name in the clear', len(new_keys) == keys0 + 1
            and not [s for s in (OWN_PW, 'abdo', 'github_pat', 'TESTTOKEN') if any(s in mock.text(k) for k in new_keys)])
    owner_files = [k for k in new_keys if json.loads(mock.text(k)).get('owner') is True]
    r.check('it is flagged as the administrator\'s and carries a sealed envelope and a wrapped private key', len(owner_files) == 1 and {'salt', 'iv', 'ct', 'env', 'owner'} <= set(json.loads(mock.text(owner_files[0]))))
    r.check('team.json stays sealed (the user name is not readable in the repository)', set(json.loads(mock.text(TEAM))) == {'v', 'iv', 'ct'} and 'abdo' not in mock.text(TEAM).lower())
    r.check('the card now shows it is on, with the address to open on another device', pg.inner_text('#ownState') == 'On' and '#join/' in pg.inner_text('#ownLink') and pg.locator('#btnOwnerRemove').count() == 1)

    # ---- from a device that never saw the connection
    ctx, op = owner_login(S, 'abdo.owner', 'not the password')
    op.wait_for_selector('#tmErr:not([hidden])'); r.check('a wrong password is refused with the same plain message', 'not correct' in op.inner_text('#tmErr'))
    op.fill('#tmUser', 'Abdo.Owner'); op.fill('#tmPw', OWN_PW); op.click('#btnTmSignIn'); op.wait_for_selector('#navUser', timeout=40000)
    nav = op.eval_on_selector_all('#adminNav a[data-route]', 'els => els.map(e => e.dataset.route)')
    r.check('signed in as the administrator: no forced password change, every area in the menu including Team and Configuration', op.evaluate('location.hash') == '#dashboard' and all(x in nav for x in ('team', 'config', 'finance', 'audit', 'settings')), str(nav))
    r.check('the session is the administrator\'s (owner, full rights) with no token typed on this device', op.evaluate("() => session.user.owner === true && !localStorage.getItem('dsp.config.v1')"))
    op.evaluate("location.hash = '#team'"); op.wait_for_selector('#teamScreen', timeout=30000)
    r.check('Team opens for the administrator signed in by user name', op.locator('#ownerLoginCard').count() == 1 and op.locator('#rolesCard').count() == 1)
    op.evaluate("location.hash = '#settings'"); op.wait_for_selector('#btnSaveSettings, #setPhone', timeout=30000)
    r.check('Settings opens and can read the encrypted settings (the master key came with the sign-in)', op.locator('#setPhone').count() == 1)

    # ================= profile =================
    op.evaluate("location.hash = '#account'"); op.wait_for_selector('#profileCard', timeout=30000)
    r.check('Account shows a profile card (name, phone, picture) and, for this sign-in, the password form', op.locator('#profName').count() == 1 and op.locator('#profPhone').count() == 1 and op.locator('#pwForm').count() == 1)
    op.fill('#profPhone', '12'); op.click('#btnProfSave')
    r.check('a phone number with fewer than 7 digits is refused', 'at least 7' in op.inner_text('#profileCard') and 'data/private/profiles/owner.json' not in mock.files)
    op.set_input_files('#profFile', PIC); op.wait_for_selector('#profPic img', timeout=15000)
    op.fill('#profPhone', '+20 100 123 4567'); op.fill('#profName', 'Abdo Kamel'); op.click('#btnProfSave'); op.wait_for_selector('#profileCard .msg.ok', timeout=20000)
    PF = 'data/private/profiles/owner.json'
    r.check('the profile is saved in one sealed file (the phone number is not readable in the repository)', PF in mock.files and set(json.loads(mock.text(PF))) == {'v', 'iv', 'ct'} and '123 4567' not in mock.text(PF))
    r.check('the menu shows the picture and the name the administrator chose', op.locator('#navUser img').count() == 1 and 'Abdo Kamel' in op.inner_text('#navWho'))
    pic = op.evaluate("() => profiles.owner.pic")
    r.check('the picture is a small square JPEG (at most 60 KB as text)', pic.startswith('data:image/jpeg;base64,') and len(pic) <= 60000)
    op.screenshot(path=f'{SP}/shot-account-profile.png', full_page=True)
    # ---- from the same login on yet another device the picture is there
    ctx2, op2 = owner_login(S, 'abdo.owner', OWN_PW, 'owner-dev2')
    op2.wait_for_selector('#navUser img', timeout=40000)
    r.check('on another device the same picture and name appear after signing in', op2.locator('#navUser img').count() == 1)
    ctx2.close()

    # ---- change the password
    op.fill('#acOld', OWN_PW); op.fill('#acNew', 'shortish'); op.fill('#acNew2', 'shortish'); op.click('#btnPwChange')
    r.check('a new password under 12 characters is refused', 'at least 12' in op.inner_text('#pwForm'))
    op.fill('#acNew', OWN_PW2); op.fill('#acNew2', OWN_PW2); op.click('#btnPwChange'); toast_text(op, 'Password changed', 30000)
    ctx3, op3 = owner_login(S, 'abdo.owner', OWN_PW, 'owner-old')
    op3.wait_for_selector('#tmErr:not([hidden])'); r.check('after the change the old password no longer works', 'not correct' in op3.inner_text('#tmErr'))
    op3.fill('#tmPw', OWN_PW2); op3.click('#btnTmSignIn'); op3.wait_for_selector('#navUser', timeout=40000)
    r.check('and the new one does', op3.evaluate('session.user.owner === true'))
    ctx3.close()

    # ================= a team member: phone and picture only =================
    pw_m = add_member(pg, 'Prof Member', 'prof.member', 'viewer'); pg.click('#btnCredDone')
    mctx, mp = member_login(S, 'prof.member', pw_m)
    mp.wait_for_selector('#accountScreen', timeout=40000)
    npw = 'member long password 987'
    mp.fill('#acOld', pw_m); mp.fill('#acNew', npw); mp.fill('#acNew2', npw); mp.click('#btnPwChange'); toast_text(mp, 'Password changed', 30000)
    mp.wait_for_selector('#profileCard')
    r.check('the member\'s name is read-only (the administrator sets it)', mp.get_attribute('#profName', 'readonly') is not None and mp.input_value('#profName') == 'Prof Member')
    mp.set_input_files('#profFile', PIC); mp.wait_for_selector('#profPic img'); mp.fill('#profPhone', '01001234567'); mp.click('#btnProfSave'); mp.wait_for_selector('#profileCard .msg.ok', timeout=20000)
    uid = row_id(pg, 'prof.member')
    r.check('the member\'s profile is written to their own file only', f'data/private/profiles/{uid}.json' in mock.files and '01001234567' not in mock.text(f'data/private/profiles/{uid}.json'))
    r.check('a member may write their own profile file and nobody else\'s, nor the administrator\'s', mp.evaluate(f"() => [canWritePath('data/private/profiles/{uid}.json'), canWritePath('data/private/profiles/owner.json'), canWritePath('data/private/team.json')]") == [True, False, False])
    pg.evaluate("location.hash = '#dashboard'"); pg.evaluate("location.hash = '#team'"); pg.wait_for_selector('tr[data-user="prof.member"] [data-phone]', timeout=30000)
    r.check('Team lists the member with their picture and phone number', pg.locator('tr[data-user="prof.member"] img').count() == 1 and '01001234567' in pg.inner_text('tr[data-user="prof.member"] [data-phone]'))
    mctx.close()

    # ================= changing the encryption key keeps both =================
    pg.fill('#rotPw', PW1); pg.click('#btnRotate'); pg.wait_for_selector('#rotMsg.ok', timeout=60000)
    r.check('changing the encryption key re-seals the profile files and the administrator\'s login file',
            set(json.loads(mock.text(PF))) == {'v', 'iv', 'ct'} and len([k for k in mock.paths(KEYS) if json.loads(mock.text(k)).get('owner') is True]) == 1)
    ctx4, op4 = owner_login(S, 'abdo.owner', OWN_PW2, 'owner-after-key')
    op4.wait_for_selector('#navUser img', timeout=60000)
    op4.evaluate("location.hash = '#settings'"); op4.wait_for_selector('#setPhone', timeout=30000)
    r.check('after the key change the user name sign-in still opens the data and the picture', op4.locator('#setPhone').count() == 1 and op4.locator('#navUser img').count() == 1)
    ctx4.close()

    # ================= remove it =================
    pg.click('#btnOwnerRemove')
    pg.wait_for_function("() => !document.querySelector('#btnOwnerRemove')", timeout=30000)
    r.check('removing the sign-in deletes its file and the card goes back to "Not set up"', 'Not set up' in pg.inner_text('#ownState') and not [k for k in mock.paths(KEYS) if 'owner' in mock.text(k) and json.loads(mock.text(k)).get('owner') is True])
    ctx5, op5 = owner_login(S, 'abdo.owner', OWN_PW2, 'owner-removed')
    op5.wait_for_selector('#tmErr:not([hidden])'); r.check('after removal that user name cannot sign in any more', 'not correct' in op5.inner_text('#tmErr'))
    ctx5.close(); ctx.close()
    pg.remove_listener('dialog', on_dialog)
    pg.evaluate("location.hash = '#dashboard'"); pg.wait_for_selector('#btnNewClient', timeout=30000)
    # several devices write the History file at the same moment on purpose here: GitHub answers 409 to the second one and the app retries (the browser prints the 409 itself)
    S.errors[n0:] = [e for e in S.errors[n0:] if not (e[1] == 'error' and 'Failed to load resource' in e[2] and '409' in e[2])]
