"""Admin: cost categories of your own. Settings > Cost categories adds direct and indirect categories (English and Arabic names); they appear in the cost lines of a project, in the
expense form, in the Finance structure, in imports and in the settings file; a removed one reads as "Other"; blank rows and bad ids are ignored.
Needs the client of s26 (S.col)."""
import json, re
from lib import *


def to_settings(pg):
    if pg.evaluate('location.hash') == '#settings':                  # coming back to the same address would keep the draft: leave first so the form is rebuilt from what is saved
        pg.evaluate("location.hash = '#dashboard'"); pg.wait_for_selector('#dashSearch', timeout=30000)
    pg.evaluate("location.hash = '#settings'"); pg.wait_for_selector('#costCatsCard', timeout=30000)


def save_settings(pg):
    try: pg.wait_for_selector('.toast', state='detached', timeout=8000)
    except Exception: pass
    pg.click('#btnSaveSettings'); toast_text(pg, 'Settings saved', 30000); pg.wait_for_selector('#costCatsCard')


def run(S):
    r, mock, pg = S.r, S.mock, S.admin
    cid = S.col['cid']
    pg.set_viewport_size({'width': 1280, 'height': 900})
    dialogs = []
    on_dialog = lambda d: (dialogs.append(d.message), d.accept())
    pg.on('dialog', on_dialog)

    # ================= add categories in Settings =================
    to_settings(pg)
    base_direct = pg.evaluate('() => COST_CATS.slice()'); base_ind = pg.evaluate('() => IND_CATS.slice()')
    r.check('the card lists the built-in categories of both kinds and has an Add button for each', 'Materials' in pg.inner_text('#ccGroup-direct') and 'Rent' in pg.inner_text('#ccGroup-indirect') and pg.locator('#ccAdd-direct, #ccAdd-indirect').count() == 2)
    pg.click('#ccAdd-direct'); pg.wait_for_selector('#ccEn-direct-0')
    pg.fill('#ccEn-direct-0', 'Packaging'); pg.fill('#ccAr-direct-0', 'تغليف')
    pg.click('#ccAdd-direct'); pg.wait_for_selector('#ccEn-direct-1')                       # a blank row: dropped on save
    pg.click('#ccAdd-indirect'); pg.wait_for_selector('#ccEn-indirect-0')
    pg.fill('#ccEn-indirect-0', 'Water'); pg.fill('#ccAr-indirect-0', 'مياه')
    pg.click('#ccAdd-indirect'); pg.wait_for_selector('#ccEn-indirect-1'); pg.fill('#ccAr-indirect-1', 'نقل داخلي')          # a name in one language only is enough
    r.check('the entered names survive a redraw of the screen (the draft is kept)', pg.input_value('#ccEn-direct-0') == 'Packaging' and pg.input_value('#ccAr-indirect-0') == 'مياه')
    save_settings(pg)
    cc = pg.evaluate('() => JSON.parse(JSON.stringify(session.settings.costCats))')
    r.check('Save keeps three categories (the blank row is dropped), each with an id of the form x + 6 hex digits',
            len(cc['direct']) == 1 and len(cc['indirect']) == 2 and all(re.fullmatch(r'x[0-9a-f]{6}', x['id']) for x in cc['direct'] + cc['indirect']) and cc['direct'][0]['en'] == 'Packaging', str(cc))
    pid, wid = cc['direct'][0]['id'], cc['indirect'][0]['id']
    cats_now = pg.evaluate('() => [COST_CATS.slice(), IND_CATS.slice()]')
    r.check('the lists the whole app reads now include them, with "Other" still last', cats_now[0] == base_direct[:-1] + [pid, 'other'] and cats_now[1][-1] == 'other' and wid in cats_now[1] and len(cats_now[1]) == len(base_ind) + 2, str(cats_now))
    r.check('settings are still stored as one sealed file (no category name in the clear)', set(json.loads(mock.text('data/private/settings.json'))) == {'v', 'iv', 'ct'} and 'Packaging' not in mock.text('data/private/settings.json'))
    r.check('the names come out in the language of the screen', pg.evaluate("(id) => catText('direct', id)", pid) == 'Packaging' and pg.evaluate("(id) => { lang = 'ar'; try { return catText('direct', id); } finally { lang = 'en'; } }", pid) == 'تغليف')
    r.check('a category named in Arabic only reads the same in English (the other language is used when one is empty)', pg.evaluate("(id) => catText('indirect', id)", cc['indirect'][1]['id']) == 'نقل داخلي')

    # ================= a project cost line =================
    pg.evaluate(f"location.hash = '#manage/{cid}'"); pg.wait_for_selector('#tab-costs', timeout=30000); pg.click('#tab-costs'); pg.click('#btnAddCost')
    row = pg.locator('.rg').last
    opts = row.locator('select').nth(1).locator('option').all_inner_texts()
    r.check('the category select of a cost line offers Packaging just before Other', 'Packaging' in opts and opts.index('Packaging') == len(opts) - 2 and opts[-1] == 'Other', str(opts))
    row.locator('select').nth(1).select_option(label='Packaging'); row.locator('input[type=number]').fill('1500')
    save(pg)
    line = pg.evaluate('() => ed.rec.projects[0].costs.filter((c) => c.amount === 1500)[0]')
    r.check('the cost line is saved with the category id', line and line['cat'] == pid, str(line))

    # ================= an indirect expense =================
    pg.evaluate("location.hash = '#expenses/new'"); pg.wait_for_selector('#expName')
    pg.fill('#expName', 'Water bill'); pg.select_option('#expKindSel', 'indirect')
    opts = pg.locator('#expCatSel option').all_inner_texts()
    r.check('the expense form offers the indirect category Water and not the direct one (Packaging)', 'Water' in opts and 'Packaging' not in opts, str(opts))
    pg.select_option('#expCatSel', label='Water'); pg.fill('#expAmount', '400'); pg.fill('#expDate', day(0)); save(pg)
    pg.evaluate("location.hash = '#expenses/new'"); pg.wait_for_selector('#expName'); pg.select_option('#expKindSel', 'direct')
    opts = pg.locator('#expCatSel option').all_inner_texts()
    r.check('a direct expense offers Packaging and not Water', 'Packaging' in opts and 'Water' not in opts, str(opts))
    pg.evaluate("() => { opsEd = null; }")

    # ================= Finance, reports =================
    pg.evaluate("location.hash = '#finance'"); pg.wait_for_selector('#finScreen', timeout=40000); pg.click('#finTab-overview'); pg.wait_for_selector('#finCats', timeout=20000)
    structure = pg.inner_text('#finCats')
    r.check('the Finance cost structure shows both categories under their own names', 'Packaging' in structure and 'Water' in structure, structure[:300])
    pg.evaluate("location.hash = '#reports/costs'"); pg.wait_for_selector('#rpPaper', timeout=40000)
    r.check('the Costs report prints them too', 'Packaging' in pg.inner_text('#rpPaper') and 'Water' in pg.inner_text('#rpPaper'))

    # ================= import understands the names =================
    r.check('import matches a category by either of its names (Arabic or English) and by its id',
            pg.evaluate("([a, b, c]) => { const m = enumMap(IND_CATS, 'icat.', {}); return [m.get(wordKey('مياه')), m.get(wordKey('water')), m.get(wordKey(c))]; }", [pid, wid, wid]) == [wid, wid, wid])

    # ================= the settings file =================
    to_settings(pg)
    with pg.expect_download() as dl:
        pg.click('#btnCfgExport')
    path = f'{SP}/settings-cc.json'; dl.value.save_as(path)
    data = json.load(open(path, encoding='utf-8'))
    r.check('the settings file carries the categories (names and ids, nothing else)', [x['en'] for x in data['settings']['costCats']['direct']] == ['Packaging'] and len(data['settings']['costCats']['indirect']) == 2)
    data['settings']['costCats'] = {'direct': [{'id': 'x0a0b0c', 'en': 'From file', 'ar': ''}, {'id': 'BAD ID', 'en': 'Bad id'}, {'id': 'x0a0b0c', 'en': 'Duplicate'}, {'id': 'x111111', 'en': '', 'ar': ''}], 'indirect': 'not a list'}
    json.dump(data, open(path, 'w', encoding='utf-8'))
    pg.set_input_files('#cfgFile', path); pg.wait_for_selector('#cfgMsg.ok', timeout=10000)
    pg.wait_for_selector('#ccEn-direct-0')
    r.check('loading a file fills the card: the good category is taken, bad ids, duplicates, empty names and a wrong shape are ignored', pg.input_value('#ccEn-direct-0') == 'From file' and pg.locator('#ccGroup-direct .rg').count() == 1 and pg.locator('#ccGroup-indirect .rg').count() == 0 and 'cost categories' in pg.inner_text('#cfgMsg'))
    r.check('nothing is saved until Save', pg.evaluate('() => session.settings.costCats.direct[0].en') == 'Packaging')

    # ================= removing a category =================
    to_settings(pg)                                                    # leave the loaded file unsaved
    pg.click('#ccDel-indirect-0'); pg.wait_for_selector('#ccEn-indirect-0')
    pg.click('#ccDel-direct-0'); pg.wait_for_selector('#ccGroup-direct .empty')
    save_settings(pg)
    r.check('removed categories are gone from the lists', wid not in pg.evaluate('() => IND_CATS') and pid not in pg.evaluate('() => COST_CATS'))
    r.check('an expense or cost line that used one now reads as "Other", the amount is kept',
            pg.evaluate("(id) => catText('indirect', id)", wid) == 'Other' and pg.evaluate("(id) => catText('direct', id)", pid) == 'Other')
    exp = pg.evaluate("() => opsList('expenses').filter((e) => e.name === 'Water bill').map((e) => [e.cat, e.amount])")
    r.check('the Water bill expense is now filed under other (400 kept)', exp == [['other', 400]], str(exp))
    pg.evaluate("location.hash = '#finance'"); pg.wait_for_selector('#finScreen', timeout=40000); pg.click('#finTab-overview'); pg.wait_for_selector('#finCats', timeout=40000)
    structure = pg.inner_text('#finCats')
    r.check('Finance no longer lists them by name, and the totals still include the amounts', 'Packaging' not in structure and 'Water' not in structure and 'Other' in structure, structure[:300])
    pg.remove_listener('dialog', on_dialog)
