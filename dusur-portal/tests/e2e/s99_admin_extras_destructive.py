"""Admin extras: language in editor, unsaved guard, GitHub 403, settings, lock/unlock, password change, delete, reset."""
import json
from mockgh import BASE
from lib import *


def run(S):
    r, mock, pg, cid = S.r, S.mock, S.admin, S.cid
    mode, msgs = {'accept': True}, []
    pg.on('dialog', lambda d: (msgs.append(d.message), d.accept() if mode['accept'] else d.dismiss()))
    # the client of the first suites by its address: later suites add clients, so "the first one in the list" is not always this one
    edit = lambda: (pg.evaluate(f"location.hash = '#manage/{cid}'"), pg.wait_for_selector('#edName'))

    # ---- language switch inside the editor keeps unsaved typing
    edit()
    pg.fill('#edNotes', 'draft note typed in English')
    pg.click('#btnLang'); pg.wait_for_selector('text=التفاصيل')
    r.check('editor switches to Arabic/RTL without losing typed values', pg.evaluate('document.documentElement.dir') == 'rtl' and pg.input_value('#edNotes') == 'draft note typed in English' and pg.input_value('#edName') == 'أحمد محمد')
    pg.click('#tab-costs'); pg.click('#btnTheme')
    pg.screenshot(path=f'{SP}/shot-v2-editor-costs-ar-light.png', full_page=True)
    pg.click('#btnTheme'); pg.click('#btnLang'); pg.wait_for_selector('text=Costs & profit')

    # ---- unsaved-changes guard
    mode['accept'] = False
    pg.click('#adminNav a[data-route=dashboard]'); pg.wait_for_timeout(600)
    r.check('leaving with unsaved changes asks first; Cancel stays in the editor', msgs and 'unsaved' in msgs[-1].lower() and '#manage/' in pg.evaluate('location.hash') and pg.input_value('#edNotes') == 'draft note typed in English', str(msgs))
    mode['accept'] = True
    pg.click('#adminNav a[data-route=dashboard]'); pg.wait_for_selector('#btnNewClient')
    edit()
    r.check('discarded changes are really discarded', pg.input_value('#edNotes') == 'INTERNAL: prefers WhatsApp')

    # ---- GitHub 403 (token without write permission) is reported clearly, nothing is lost
    pg.fill('#edAddress', 'Cairo, Egypt'); mock.fail_next_put = 403
    pg.click('#btnSave'); pg.wait_for_selector('.toast:has-text("403")')
    r.check('403 from GitHub: clear message naming the missing permission', 'Contents: Read and write' in pg.inner_text('.toasts'))
    r.check('after the failure the editor still holds the unsaved change', 'Unsaved' in pg.inner_text('.savebar') and pg.input_value('#edAddress') == 'Cairo, Egypt')
    save(pg)
    r.check('retry after fixing the token saves normally', 'Saved' in pg.inner_text('.savebar'))

    # ---- settings: add a project type
    pg.click('#adminNav a[data-route=settings]'); pg.wait_for_selector('#setPrefix')
    sha_before = mock.files['data/private/settings.json']['sha']
    pg.click('button:has-text("Add project type")')
    box = pg.locator('details.card').last
    box.locator('input').nth(0).fill('wrd')
    box.locator('input[placeholder="English"]').first.fill('Wardrobe'); box.locator('input[placeholder="العربية"]').first.fill('دولاب')
    pg.click('button:has-text("Save settings")'); pg.wait_for_selector('.toast:has-text("Settings saved")')
    r.check('new project type saved (encrypted) and upper-cased code accepted', mock.files['data/private/settings.json']['sha'] != sha_before and 'Wardrobe' not in mock.text('data/private/settings.json'))
    pg.click('#adminNav a[data-route=dashboard]'); pg.wait_for_selector('#btnNewClient'); pg.click('#btnNewClient'); pg.wait_for_selector('#edName')
    pg.fill('#edName', 'Temp'); pg.select_option('#newProjType', 'WRD'); pg.click('#btnAddProject')
    r.check('new type is offered when adding a project and generates a WRD SKU', pg.locator('.tabs .pill').first.inner_text().strip().startswith('DS-WRD-'))
    pg.click('#adminNav a[data-route=dashboard]'); pg.wait_for_selector('#btnNewClient')   # discard the unsaved temp client

    # ---- lock / unlock: everything is read back from the encrypted repository
    pg.click('#btnLock'); pg.wait_for_selector('#lockPw')
    r.check('lock shows the password gate and hides admin UI', not pg.is_visible('#adminNav') and pg.locator('#btnNewClient').count() == 0)
    pg.evaluate("location.hash = '#config'"); pg.wait_for_timeout(300)
    r.check('#config is gated too while locked', pg.locator('#cfgPat').count() == 0 and pg.locator('#lockPw').count() == 1)
    unlock(pg, 'wrong password!!'); pg.wait_for_selector('text=Incorrect admin password.')
    r.check('wrong admin password rejected', True)
    unlock(pg, PW1); pg.wait_for_selector('#cfgPat')
    r.check('correct password reveals configuration (user/repo shown, token field empty)', pg.input_value('#cfgUser') == 'abdo' and pg.input_value('#cfgPat') == '')
    pg.click('#adminNav a[data-route=dashboard]'); pg.wait_for_selector('.item')
    r.check('records decrypt from the repository after unlock', 'أحمد محمد' in pg.inner_text('main') and any(s in pg.inner_text('main') for s in S.skus[:1]))

    # ---- admin password change re-wraps the vault (data is not re-encrypted)
    vault_before, rec_before = mock.files['data/private/vault.json']['sha'], mock.files[f'data/private/{cid}.json']['sha']
    ops_before = {p: mock.files[p]['sha'] for p in mock.files if p.startswith('data/private/ops/')}
    pg.click('#adminNav a[data-route=config]'); pg.wait_for_selector('#cfgPw')
    pg.fill('#cfgPw', PW2); pg.fill('#cfgPw2', PW2); pg.click('#btnSaveCfg'); pg.wait_for_selector('#btnNewClient', timeout=30000)
    r.check('password change: vault re-wrapped, records untouched', mock.files['data/private/vault.json']['sha'] != vault_before and mock.files[f'data/private/{cid}.json']['sha'] == rec_before)
    pg.reload(); pg.wait_for_selector('#lockPw')
    unlock(pg, PW1); pg.wait_for_selector('text=Incorrect admin password.')
    r.check('old password no longer works', True)
    unlock(pg, PW2); pg.wait_for_selector('.item', timeout=30000)
    r.check('new password opens the vault and all records', 'أحمد محمد' in pg.inner_text('main'))
    # the Supply chain, Inventory and Logistics files are sealed with the same master key: the key is re-wrapped, so they are not rewritten and still open
    r.check('the password change did not rewrite the sealed Supply chain, Inventory, Logistics and Expenses files', len(ops_before) >= 3 and ops_before == {p: mock.files[p]['sha'] for p in mock.files if p.startswith('data/private/ops/')}, str(ops_before))
    pg.click('#adminNav a[data-route=inventory]'); pg.wait_for_selector('.inv-item', timeout=30000)
    r.check('with the new password the inventory opens and shows the materials', pg.locator('.inv-item').count() >= 1 and 'MDF 18 mm white' in pg.inner_text('#invList'))
    pg.click('#adminNav a[data-route=suppliers]'); pg.wait_for_selector('#supShow'); pg.select_option('#supShow', 'all'); pg.wait_for_selector('.sup-item')
    r.check('and the suppliers (with their phone and e-mail) are readable', pg.locator('.sup-item').count() >= 3 and 'Al Nour Boards' in pg.inner_text('#supList'))
    pg.click('#adminNav a[data-route=logistics]'); pg.wait_for_selector('#lgShow'); pg.select_option('#lgShow', 'all'); pg.wait_for_selector('.lg-item')
    r.check('and the shipments with their steps', pg.locator('.lg-item').count() >= 2 and 'MDF boards from Al Nour' in pg.inner_text('#lgList'))
    pg.click('#adminNav a[data-route=dashboard]'); pg.wait_for_selector('.item')
    pg.screenshot(path=f'{SP}/shot-v2-dashboard-en-dark2.png')

    # ---- delete the client: every file for it disappears
    edit(); pg.click('#btnDelClient'); pg.wait_for_selector('#btnNewClient'); pg.wait_for_function(f"() => !document.body.innerText.includes('{cid}')", timeout=30000)      # other suites added clients: the list is not empty, this one is gone
    left = [p for p in mock.files if cid in p]
    r.check('delete client removes snapshot, private record and all photos', not left, str(left))
    r.check('vault and settings are kept', 'data/private/vault.json' in mock.files and 'data/private/settings.json' in mock.files)

    # ---- reset configuration
    pg.click('#btnLock'); pg.wait_for_selector('#lockPw'); pg.click('text=Forgot password? Reset configuration'); pg.wait_for_selector('#btnSaveCfg')
    r.check('reset wipes the saved connection and returns to first-run setup', pg.evaluate("localStorage.getItem('dsp.config.v1')") is None)
