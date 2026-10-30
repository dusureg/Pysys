"""Admin: the separate Progress & photos section (#progress): list and filters, one project, ticking tasks, saving and publishing,
photo upload from there, WhatsApp update link, moving between screens without losing work, the unsaved-changes guard, and a phone."""
import json, re
from mockgh import PNG, BASE
from lib import *


def snapshot(S, pg):
    payload = json.loads(S.mock.text(f'data/clients/{S.cid}.json'))['payload']
    return json.loads(pg.evaluate(DECRYPT_JS, {'payload': payload, 'secret': S.secret, 'id': S.cid}))


def run(S):
    r, mock, pg, cid = S.r, S.mock, S.admin, S.cid
    pg.set_viewport_size({'width': 1280, 'height': 900})
    dialogs = []
    on_dialog = lambda d: (dialogs.append(d.message), d.dismiss())
    pg.on('dialog', on_dialog)                       # removed again at the end: later suites bring their own dialog handlers

    # ---- the list
    pg.click('#adminNav a[data-route=progress]'); pg.wait_for_selector('#pgList .pg-item')
    r.check('Progress is its own item in the admin menu and opens #progress', pg.evaluate('location.hash') == '#progress' and pg.get_attribute('#adminNav a[data-route=progress]', 'aria-current') == 'page')
    pg.select_option('#pgFilter', 'all')
    total = pg.locator('#pgList .pg-item').count()
    pg.select_option('#pgFilter', 'active'); n_active = pg.locator('#pgList .pg-item').count()
    pg.select_option('#pgFilter', 'done'); n_done = pg.locator('#pgList .pg-item').count()
    r.check('list: Active + Completed add up to All projects', total == 2 and n_active + n_done == total, f'{n_active}+{n_done} vs {total}')
    pg.select_option('#pgFilter', 'all'); pg.fill('#pgSearch', 'DRS')
    r.check('list: search by SKU narrows to one project', pg.locator('#pgList .pg-item').count() == 1)
    item = pg.locator('#pgList .pg-item').first
    r.check('list: each project shows its client, SKU, progress bar and an Update button', 'أحمد' in item.inner_text() and 'DRS' in item.inner_text() and item.locator('.bar').count() == 1 and item.locator('a.btn.primary').get_attribute('href') == f'#progress/{cid}/1')
    pg.fill('#pgSearch', 'zzz-nothing'); r.check('list: nothing matches shows a message', pg.locator('#pgList .empty').count() == 1)
    pg.fill('#pgSearch', 'DRS')

    # ---- one project (the dressing room, which has no progress yet)
    item.locator('a.btn.primary').click(); pg.wait_for_selector('#pgPct')
    r.check('opens the project screen #progress/<client>/<n>', pg.evaluate('location.hash') == f'#progress/{cid}/1' and 'أحمد' in pg.inner_text('h1'))
    r.check('starts at 0 %', pg.inner_text('#pgPct').strip() in ('0%', '٠٪'), pg.inner_text('#pgPct'))
    r.check('project switcher lists both projects', pg.locator('.tabs .pill').count() == 2)
    r.check('before any change the WhatsApp update link is available', pg.locator('a#btnWaUpdate').count() == 1)
    first_box = pg.locator('.editor-stage input[type=checkbox]').first
    first_box.check()
    after_one = pg.inner_text('#pgPct')
    r.check('ticking one task raises the percentage at once', after_one not in ('0%', '٠٪'), after_one)
    r.check('the save bar says there are unsaved changes and WhatsApp waits for the save', pg.locator('.savebar >> text=Unsaved').count() == 1 and pg.locator('button#btnWaUpdate[disabled]').count() == 1)
    pg.locator('.editor-stage').first.locator('button:has-text("Tick all")').click()
    stage_sel = pg.locator('.editor-stage').first.locator('select')
    r.check('Tick all completes the stage and its status becomes Completed', stage_sel.input_value() == 'completed' and pg.locator('.editor-stage').first.locator('input[type=checkbox]:not(:checked)').count() == 0)
    pct_before_save = pg.inner_text('#pgPct')

    # moving to the full editor keeps the unsaved work and asks nothing
    pg.click('#btnFullEditor'); pg.wait_for_selector('#edName')
    r.check('Full editor opens on the same project without a discard prompt', not dialogs and pg.evaluate('location.hash') == f'#manage/{cid}' and pg.locator('.tab.pill[aria-selected=true]').inner_text().strip().startswith('DS-DRS'))
    pg.click('#tab-stages')
    r.check('the unsaved ticks are still there in the full editor', pg.locator('.editor-stage input[type=checkbox]:checked').count() > 0)
    pg.click('#btnToProgress'); pg.wait_for_selector('#pgPct')
    r.check('and back on the progress screen the percentage is unchanged', pg.inner_text('#pgPct') == pct_before_save)

    # leaving with unsaved work asks first
    pg.click('#adminNav a[data-route=dashboard]')
    pg.wait_for_timeout(400)
    r.check('leaving with unsaved changes shows the discard question and stays when dismissed', len(dialogs) == 1 and pg.evaluate('location.hash') == f'#progress/{cid}/1', str(dialogs))

    # ---- save & publish, then the client snapshot has it
    save(pg)
    snap = snapshot(S, pg)
    st0 = snap['projects'][1]['stages'][0]
    r.check('saved: the client snapshot has the completed stage', st0['status'] == 'completed' and all(i['done'] for i in st0['checklist']), str(st0)[:200])
    r.check('the screen stays on #progress after saving (it does not jump to the editor)', pg.evaluate('location.hash') == f'#progress/{cid}/1' and pg.locator('#pgPct').count() == 1)
    wa = pg.locator('a#btnWaUpdate'); href = wa.get_attribute('href')
    r.check('after saving, the WhatsApp link opens wa.me with the client number in international form', href.startswith('https://wa.me/201001234567?text='), href[:80])
    msg = __import__('urllib.parse', fromlist=['unquote']).unquote(href.split('?text=', 1)[1])
    r.check('the WhatsApp message holds the private link and the percentage, never the secret key', f'#client/{cid}' in msg and '%' in msg and S.secret not in msg and 'DS-DRS' in msg, msg)

    # ---- photos from this screen
    n0 = len(mock.paths(f'data/clients/{cid}/'))
    pg.locator('input[type=file]:not([capture])').first.set_input_files(files=[{'name': 'wardrobe.png', 'mimeType': 'image/png', 'buffer': PNG}, {'name': 'doors.png', 'mimeType': 'image/png', 'buffer': PNG}])
    wait_until(pg, lambda: len(mock.paths(f'data/clients/{cid}/')) == n0 + 4, what='two more encrypted photos (thumb + full each)')
    pg.wait_for_selector('.toast:has-text("uploaded")', timeout=20000)
    pg.wait_for_selector('.savebar >> text=/^Saved /', timeout=20000)
    r.check('two photos uploaded from the progress screen are stored encrypted and the record is saved automatically', all(not mock.files[f]['b'].startswith((b'\xff\xd8', b'\x89PNG')) for f in mock.paths(f'data/clients/{cid}/')))
    pg.locator('.ph').first.scroll_into_view_if_needed()          # thumbnails load when they come near the screen
    pg.wait_for_selector('.ph .imgbtn img[src^="blob:"]')
    r.check('the new photos appear in the grid, decrypted', pg.locator('.ph .imgbtn img[src^="blob:"]').count() >= 2)
    snap = snapshot(S, pg)
    r.check('the client snapshot lists the new photos', len([x for x in snap['projects'][1]['photos'] if x['kind'] == 'file']) == 2)
    r.check('no contract, signature, internal note or cost is in the client snapshot', not any(k in json.dumps(snap) for k in ('contract', 'signature', 'internalNotes', 'costs', 'warranty')))

    # ---- editing Settings after a save must not mark the saved record as unsaved
    dialogs.clear()
    pg.click('#adminNav a[data-route=settings]'); pg.wait_for_selector('#btnSaveSettings')
    pg.fill('#setCur', 'EGP')
    pg.click('#adminNav a[data-route=dashboard]'); pg.wait_for_selector('#btnNewClient')
    r.check('typing in Settings after saving a client does not trigger a false "discard changes" question', not dialogs, str(dialogs))

    # ---- a phone: camera button, big tap targets, no horizontal scroll
    ctx = S.browser.new_context(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True, storage_state=S.admin_ctx.storage_state())
    ctx.route('**/*', mock.handler('admin-phone'))
    ph = ctx.new_page(); ph.on('pageerror', lambda e: S.errors.append(('admin-phone', 'pageerror', str(e))))
    ph.on('console', lambda m: S.errors.append(('admin-phone', m.type, m.text)) if m.type == 'error' else None)
    ph.goto(f'{BASE}{__import__("mockgh").ADMIN_DIR}/#progress/{cid}/0'); ph.wait_for_selector('#lockPw'); unlock(ph, PW1)
    ph.wait_for_selector('#pgPct', timeout=40000)
    r.check('phone: the "Take a photo" button is offered on touch screens', ph.locator('#btnCamera').count() == 1 and ph.get_attribute('input[capture]', 'capture') == 'environment')
    r.check('phone: no horizontal scroll', ph.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), str(ph.evaluate('document.documentElement.scrollWidth')))
    box = ph.locator('.editor-stage label.check').first.bounding_box()
    r.check('phone: a task row is at least 44 px tall (easy to tap)', box and box['height'] >= 43.5, str(box))
    ph.screenshot(path=f'{SP}/shot-progress-phone.png', full_page=True)
    ctx.close()
    pg.set_viewport_size({'width': 1280, 'height': 900})
    pg.click('#adminNav a[data-route=progress]'); pg.wait_for_selector('#pgList .pg-item')
    pg.screenshot(path=f'{SP}/shot-progress-list.png', full_page=True)
    pg.evaluate(f'location.hash = "#progress/{cid}/1"'); pg.wait_for_selector('#pgPct')
    pg.screenshot(path=f'{SP}/shot-progress-project.png', full_page=True)
    pg.evaluate('location.hash = "#dashboard"'); pg.wait_for_selector('#btnNewClient')
    pg.remove_listener('dialog', on_dialog)
