"""Admin: encrypted photo upload + link photo, second project (SKU generator), dashboard totals, share link."""
import re
from mockgh import PNG, BASE
from lib import *


def run(S):
    r, mock, pg, cid = S.r, S.mock, S.admin, S.cid
    snap = f'data/clients/{cid}.json'
    pg.click('#tab-photos')
    before = mock.files[snap]['sha']
    pg.set_input_files('input[type=file]', files=[{'name': 'kitchen.png', 'mimeType': 'image/png', 'buffer': PNG}])
    wait_until(pg, lambda: len(mock.paths(f'data/clients/{cid}/')) == 2, what='encrypted photo files')
    wait_until(pg, lambda: mock.files[snap]['sha'] != before, what='snapshot republished after upload')
    files = mock.paths(f'data/clients/{cid}/')
    r.check('photo stored as encrypted thumbnail (.t) + full image (.f)', sorted(f.rsplit('.', 1)[1] for f in files) == ['f', 't'], str(files))
    heads = [mock.files[f]['b'][:4] for f in files]
    r.check('photo files are ciphertext (no JPEG/PNG signature)', all(not h.startswith(b'\xff\xd8') and not h.startswith(b'\x89PNG') for h in heads))
    pg.wait_for_selector('.ph .imgbtn img[src^="blob:"]')
    r.check('uploaded photo is decrypted and shown in the editor', True)
    pg.locator('.ph .ctl input').first.fill('Cutting done')
    pg.fill('#phUrl', 'http://insecure.example.com/x.png'); pg.click('#btnAddLink')
    pg.wait_for_selector('.msg.bad:has-text("https://")')
    r.check('plain http image links are rejected', True)
    pg.fill('#phUrl', 'https://images.example.com/site.png'); pg.fill('#phCap', 'Delivered panels'); pg.click('#btnAddLink')
    pg.wait_for_selector('.ph:has-text("Link")')
    r.check('image link added as a second photo', pg.locator('.ph').count() == 2)
    save(pg)

    # ---- second project: SKU generator
    pg.select_option('#newProjType', 'DRS'); pg.fill('#newProjTitle', 'Dressing room'); pg.click('#btnAddProject')
    save(pg)
    skus = [s.strip() for s in pg.locator('.tabs .pill').all_inner_texts()]
    S.skus = skus
    ym = day(0)[2:4] + day(0)[5:7]
    r.check('SKUs generated per project: DS-KIT-<yymm>-0001 and DS-DRS-<yymm>-0002',
            skus == [f'DS-KIT-{ym}-0001', f'DS-DRS-{ym}-0002'], str(skus))
    pg.click('.tabs .pill >> nth=1')
    r.check('new project gets the default due date from Settings (start + 30 days)', pg.input_value('#pjDue') == day(30), pg.input_value('#pjDue'))
    pg.fill('#pjDue', ''); save(pg)
    pg.click('#btnRegenSku')
    new_sku = pg.input_value('#pjSku')
    r.check('regenerate SKU gives the next sequence number (0003)', new_sku.endswith('-0003'), new_sku)
    pg.click('.tabs .pill >> nth=0')
    save(pg)
    S.skus = [s.strip() for s in pg.locator('.tabs .pill').all_inner_texts()]

    # ---- dashboard totals + share link
    pg.click('#adminNav a[data-route=dashboard]'); pg.wait_for_selector('#btnNewClient')
    txt = pg.inner_text('main')
    r.check('dashboard: revenue / collected / remaining', money_in(txt, 50000) and money_in(txt, 20000) and money_in(txt, 30000))
    r.check('dashboard: COGS / gross profit / net profit', money_in(txt, 22000) and money_in(txt, 28000) and money_in(txt, 25000))
    r.check('dashboard: client card lists both SKUs, name and ID', all(s in txt for s in S.skus[:1]) and 'أحمد محمد' in txt and cid in txt)
    r.check('dashboard: profitability-by-type table has the KIT row', pg.locator('table.tbl tbody tr', has_text='KIT').count() == 1)
    link = f'{BASE}#client/{cid}'
    r.check('share link has the required format', link in txt)
    pg.click('.item button:has-text("Copy")')
    r.check('Copy Link puts the share link on the clipboard', pg.evaluate('navigator.clipboard.readText()') == link)
    pg.fill('#dashSearch', 'zzz-nothing'); r.check('search filters the client list', 'No client matches' in pg.inner_text('main'))
    pg.fill('#dashSearch', 'DRS'); r.check('search matches by SKU', cid in pg.inner_text('main'))
    pg.fill('#dashSearch', '')
    pg.screenshot(path=f'{SP}/shot-v2-dashboard-en-dark.png', full_page=True)
