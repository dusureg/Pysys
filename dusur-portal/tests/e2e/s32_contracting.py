"""Admin (4.6): contracts per project and the Contracting section.
Settings > Contract: templates of wording (named sets of clauses). Contract screen of one project: the wording (standard clauses, a template, or clauses written for this project
only, each language on its own), warranty 0 drops the warranty clause, a number, special conditions, status draft / issued / signed with its dates, Arabic / English / both.
Contracting (#contracting): one line per project with number, wording, language, status and dates; filter and search; links to the contract and the labels; totals. The printable
Contracts report. Contract details are private (never in the client's snapshot) and are kept in the project record.
Needs the client of s01 - s03 (two projects)."""
import json, re
from lib import *


def to_settings(pg):
    pg.evaluate("location.hash = '#dashboard'"); pg.wait_for_selector('#dashSearch', timeout=30000)
    pg.evaluate("location.hash = '#settings'"); pg.wait_for_selector('#contractCard', timeout=30000)


def save_settings(pg):
    pg.click('#btnSaveSettings'); toast_text(pg, 'Settings saved', 30000); pg.wait_for_selector('#contractCard')


def open_contract(pg, cid, i):
    pg.evaluate(f"location.hash = '#contract/{cid}/{i}'"); pg.wait_for_selector('#ctOptions', timeout=30000); pg.wait_for_selector('#ctPaper', timeout=30000)


def paper(pg):
    return pg.inner_text('#ctPaper')


def paper_has(pg, text, timeout=8000):
    pg.wait_for_function("(s) => document.querySelector('#ctPaper').innerText.includes(s)", arg=text, timeout=timeout)


def paper_lacks(pg, text, timeout=8000):
    pg.wait_for_function("(s) => !document.querySelector('#ctPaper').innerText.includes(s)", arg=text, timeout=timeout)


def run(S):
    r, mock, pg, cid = S.r, S.mock, S.admin, S.cid
    pg.set_viewport_size({'width': 1280, 'height': 900})
    on_dialog = lambda d: d.accept()
    pg.on('dialog', on_dialog)

    # ================= templates in Settings =================
    to_settings(pg)
    r.check('the contract card has a templates block, empty at first', 'No templates yet' in pg.inner_text('#ctTplBox'))
    pg.click('#btnTplAdd'); pg.wait_for_selector('#ctTplNameAr0')
    pg.fill('#ctTplNameAr0', 'مطابخ'); pg.fill('#ctTplNameEn0', 'Kitchens')
    pg.fill('#ctTplEn0', 'Kitchen scope\nThe Company installs the kitchen of {client} ({sku}) and hands it over by {due}.\n\nKitchen warranty\nThe kitchen is covered for {warranty} from handover.\n\nKitchen care\nUse only mild cleaners on the doors.')
    pg.fill('#ctTplAr0', 'نطاق المطبخ\nتركب الشركة مطبخ {client} ({sku}) وتسلمه في {due}.\n\nضمان المطبخ\nيغطي الضمان المطبخ لمدة {warranty} من التسليم.')
    pg.click('#btnTplAdd'); pg.wait_for_selector('#ctTplNameAr1')
    pg.fill('#ctTplNameEn1', 'Dressing rooms')                                   # a name in one language only is enough
    r.check('a new template starts from the current standard clauses', pg.input_value('#ctTplEn1').startswith('Subject of the contract'))
    pg.click('#btnTplAdd'); pg.wait_for_selector('#ctTplNameAr2')                # no name: not saved
    save_settings(pg)
    tpls = pg.evaluate('() => JSON.parse(JSON.stringify(session.settings.contract.templates))')
    r.check('Save keeps the two named templates (the one without a name is dropped) with ids that never change', len(tpls) == 2 and all(re.fullmatch(r'[a-z0-9]{3,16}', x['id']) for x in tpls) and tpls[0]['name']['en'] == 'Kitchens' and tpls[1]['name']['en'] == 'Dressing rooms', str(tpls)[:300])
    st = mock.text('data/private/settings.json')
    r.check('the settings stay one sealed file (no clause text in the clear)', set(json.loads(st)) == {'v', 'iv', 'ct'} and 'Kitchen scope' not in st)
    tk, tdr = tpls[0]['id'], tpls[1]['id']

    # ================= the contract of the first project =================
    open_contract(pg, cid, 0)
    pg.select_option('#ctLang', 'en')
    wopts = pg.locator('#ctWording option').all_inner_texts()
    r.check('the wording drop-down offers the standard clauses, each template and "Own wording"', wopts == ['Standard clauses (Settings)', 'Kitchens', 'Dressing rooms', 'Own wording for this project'], str(wopts))
    r.check('by default the paper uses the standard clauses (numbered, with headings)', '1. Subject of the contract' in paper(pg) and 'Kitchen scope' not in paper(pg))
    r.check('the status starts as Draft and shows no dates', pg.input_value('#ctStatus') == 'draft' and pg.inner_text('#ctStatusNote').strip() == '')
    pg.select_option('#ctWording', tk)
    paper_has(pg, 'Kitchen scope')
    pp = paper(pg)
    r.check('choosing the Kitchens template puts its clauses on the paper, numbered, with the client and the SKU filled in', '1. Kitchen scope' in pp and 'Subject of the contract' not in pp and '{' not in pp and S.skus[0] in pp and 'Kitchen care' in pp, pp[:400])
    r.check('{warranty} reads as a period (the default of 12 months is "1 year")', 'covered for 1 year' in pp, pp[:600])
    pg.fill('#ctWarranty', '0')
    paper_lacks(pg, 'Kitchen warranty')
    r.check('warranty 0 drops the clause that mentions the warranty and renumbers the rest', '2. Kitchen care' in paper(pg), paper(pg)[:500])
    pg.fill('#ctWarranty', '18')
    paper_has(pg, 'Kitchen warranty')
    r.check('18 months reads as "18 months" and the clause comes back', 'covered for 18 months' in paper(pg))
    pg.fill('#ctNo', 'KIT-2610/A')
    pg.fill('#ctExtraEn', 'The client supplies the sink and the hob.'); pg.fill('#ctExtraAr', 'يوفر العميل الحوض والموقد.')
    pg.fill('#ctPayEn', 'Deposit now, balance on handover.')
    paper_has(pg, 'Deposit now, balance on handover.')
    pp = paper(pg)
    r.check('the contract number, the special conditions (last clause) and the payment terms are on the paper', 'KIT-2610/A' in pp and 'Special conditions' in pp and pp.index('Special conditions') > pp.index('Kitchen care') and 'The client supplies the sink' in pp)

    # own wording
    pg.select_option('#ctWording', '@own')
    pg.wait_for_selector('#ctOwnBox:not([hidden])')
    r.check('"Own wording" opens two boxes (Arabic and English), started from the clauses in use (the template)', pg.input_value('#ctTermsEn').startswith('Kitchen scope') and pg.input_value('#ctTermsAr').startswith('نطاق المطبخ'))
    pg.fill('#ctTermsEn', 'Scope of this job\nOnly for {client}: ref {sku}.\n\nPriority\nThe cabinets are delivered first.')
    paper_has(pg, '1. Scope of this job')
    pp = paper(pg)
    r.check('the clauses written for this project replace the template on the paper', 'Only for' in pp and 'Kitchen scope' not in pp and '2. Priority' in pp, pp[:300])
    pg.select_option('#ctLang', 'both')
    pg.wait_for_selector('#ctPaper.ct-bi')
    r.check('with both languages the paper has English and Arabic side by side, English first', pg.locator('#ctPaper .ct-row').first.locator('.ct-cell').first.get_attribute('lang') == 'en' and pg.locator('#ctPaper .ct-cell[lang=ar]').count() > 3)
    both = paper(pg)
    r.check('English shows the wording written here, Arabic the copied template (each language is decided on its own)', '1. Scope of this job' in both and '1. نطاق المطبخ' in both, both[:300])
    pg.select_option('#ctLang', 'en')
    pg.click('#btnOwnClear')
    paper_has(pg, 'Kitchen scope')
    r.check('"Remove own wording" goes back to the template and hides the boxes', pg.input_value('#ctWording') == tk and pg.locator('#ctOwnBox[hidden]').count() == 1 and 'Scope of this job' not in paper(pg))
    pg.select_option('#ctWording', '@own')
    pg.fill('#ctTermsEn', 'Scope of this job\nOnly for {client}: ref {sku}.')
    # status
    pg.select_option('#ctStatus', 'issued')
    note = pg.inner_text('#ctStatusNote')
    r.check('setting the status to Issued stamps today as the day it was issued', note.startswith('Issued ') and 'Signed' not in note, note)
    save(pg)
    pc = pg.evaluate('() => JSON.parse(JSON.stringify(ed.rec.projects[0].contract))')
    r.check('Save keeps the details in the project record: own wording, status with date, number, warranty, special conditions', pc['own'] is True and pc['status'] == 'issued' and pc['issuedAt'] and pc['no'] == 'KIT-2610/A' and pc['warranty'] == 18 and pc['extra']['en'].startswith('The client supplies') and pc['terms']['en'].startswith('Scope of this job'), str(pc)[:400])
    snap = json.loads(pg.evaluate(DECRYPT_JS, {'payload': json.loads(mock.text(f'data/clients/{cid}.json'))['payload'], 'secret': S.secret, 'id': cid}))
    r.check('the contract details are private: the client snapshot has no contract field, no wording and no special conditions', all('contract' not in p for p in snap['projects']) and 'Only for' not in json.dumps(snap) and 'sink and the hob' not in json.dumps(snap))

    # second project: a template, signed
    open_contract(pg, cid, 1)
    pg.select_option('#ctLang', 'en'); pg.select_option('#ctWording', tdr)
    pg.select_option('#ctStatus', 'signed')
    note2 = pg.inner_text('#ctStatusNote')
    r.check('Signed sets both dates (issued and signed) when none was set', 'Issued ' in note2 and 'Signed ' in note2, note2)
    r.check('a template that kept the standard text shows the standard clauses on this project', '1. Subject of the contract' in paper(pg))
    pg.select_option('#ctStatus', 'draft')
    r.check('going back to Draft clears both dates', pg.inner_text('#ctStatusNote').strip() == '')
    pg.select_option('#ctStatus', 'signed')
    save(pg)
    pc1 = pg.evaluate('() => JSON.parse(JSON.stringify(ed.rec.projects[1].contract))')
    r.check('the second project keeps its own status, template and language', pc1['status'] == 'signed' and pc1['tpl'] == tdr and pc1['lang'] == 'en' and pc1['signedAt'] and not pc1['own'], str(pc1))

    # ================= the Contracting screen =================
    pg.evaluate("location.hash = '#contracting'"); pg.wait_for_selector('#ctrScreen', timeout=30000); pg.wait_for_selector('#ctrList table')
    r.check('the menu has a Contracting entry', pg.locator('#adminNav a[data-route=contracting]').count() == 1)

    def rows_of():
        return pg.evaluate("() => [...document.querySelectorAll('#ctrList tbody tr')].map((r) => ({ cid: r.dataset.cid, sku: r.dataset.sku, st: r.dataset.status, w: r.dataset.wording, text: r.innerText }))")
    rows = rows_of(); mine = [x for x in rows if x['cid'] == cid]
    r.check('one line per project of every client, ours among them', len(mine) == 2 and len(rows) >= 2, str(len(rows)))
    r.check('the first project: issued, own wording, with its number and the day issued', mine[0]['st'] == 'issued' and mine[0]['w'] == 'own' and 'KIT-2610/A' in mine[0]['text'] and 'Issued ' in mine[0]['text'] and 'Own wording' in mine[0]['text'], mine[0]['text'])
    r.check('the second project: signed, a template wording named in English, both dates', mine[1]['st'] == 'signed' and mine[1]['w'] == 'tpl' and 'Dressing rooms' in mine[1]['text'] and 'Signed ' in mine[1]['text'] and 'Issued ' in mine[1]['text'], mine[1]['text'])
    r.check('every line has links to the contract and to the labels of its project', pg.locator(f'#ctrList tr[data-cid="{cid}"] a[href="#contract/{cid}/0"]').count() == 1 and pg.locator(f'#ctrList tr[data-cid="{cid}"] a[href="#labels/{cid}/1"]').count() == 1)
    k = {x.locator('.l').inner_text(): x.locator('.v').inner_text() for x in pg.locator('#ctrScreen .kpi').all()}
    n_all = len(rows); n_signed = sum(1 for x in rows if x['st'] == 'signed'); n_issued = sum(1 for x in rows if x['st'] == 'issued'); n_draft = sum(1 for x in rows if x['st'] == 'draft')
    r.check('the four tiles count all, draft, issued and signed contracts and add up', k.get('Contracts') == str(n_all) and k.get('Drafts') == str(n_draft) and k.get('Issued') == str(n_issued) and k.get('Signed') == str(n_signed) and n_draft + n_issued + n_signed == n_all, str(k))
    pg.select_option('#ctrFilter', 'issued')
    r.check('the filter keeps only issued contracts', pg.locator('#ctrList tbody tr').count() == n_issued and all(x['st'] == 'issued' for x in rows_of()))
    pg.select_option('#ctrFilter', 'all')
    pg.fill('#ctrSearch', 'KIT-2610/A')
    r.check('the search finds a contract by its number', pg.locator('#ctrList tbody tr').count() == 1 and 'KIT-2610/A' in pg.inner_text('#ctrList'))
    pg.fill('#ctrSearch', S.skus[1])
    r.check('and by the SKU of its project', pg.locator('#ctrList tbody tr').count() == 1 and pg.locator('#ctrList tbody tr').first.get_attribute('data-status') == 'signed')
    pg.fill('#ctrSearch', 'zzz-nothing')
    r.check('nothing matching shows a message', pg.locator('#ctrList .empty').count() == 1)
    pg.fill('#ctrSearch', '')
    # what is on the screen comes from the saved record: reload everything from the repository
    pg.click('#btnCtrRefresh'); pg.wait_for_selector('#ctrList table', timeout=40000)
    again = [x for x in rows_of() if x['cid'] == cid]
    r.check('after a refresh from the repository the lines are the same (status, wording and dates were saved)', [x['st'] for x in again] == ['issued', 'signed'] and [x['w'] for x in again] == ['own', 'tpl'] and again[0]['text'] == mine[0]['text'], str(again)[:300])
    pg.click(f'#ctrList tr[data-cid="{cid}"] a[href="#contract/{cid}/0"]'); pg.wait_for_selector('#ctOptions')
    r.check('opening a line goes to the contract of that project, which remembers its wording and status', pg.input_value('#ctStatus') == 'issued' and pg.input_value('#ctWording') == '@own' and pg.input_value('#ctNo') == 'KIT-2610/A' and pg.input_value('#ctWarranty') == '18')

    # ================= the report =================
    pg.evaluate("() => { const other = store.items.find((x) => x.rec.id !== %s); reportSel.client = other ? other.rec.id : ''; }" % json.dumps(cid))   # a client chosen in an earlier report must not narrow this one
    pg.evaluate("location.hash = '#contracting'"); pg.wait_for_selector('#btnCtrPrint'); pg.click('#btnCtrPrint'); pg.wait_for_selector('#rpPaper', timeout=40000)
    pg.wait_for_function("() => document.querySelector('#rpPaper').innerText.includes('KIT-2610/A')", timeout=20000)
    rp = pg.inner_text('#rpPaper')
    r.check('Print report opens the Contracts report with every contract (a line each, both of ours)', pg.input_value('#rpType') == 'contracts' and 'KIT-2610/A' in rp and pg.locator('#rpPaper tbody tr:not(.total)').count() == n_all, rp[:200])
    r.check('the report shows the four counts, the value-by-status chart and a total row', all(x in rp for x in ('Contracts', 'Drafts', 'Issued', 'Signed', 'Value by status', 'Total')))
    pg.select_option('#rpState', 'signed')
    pg.wait_for_function("(n) => document.querySelectorAll('#rpPaper tbody tr:not(.total)').length === n", arg=n_signed, timeout=10000)
    r.check('the status filter of the report keeps the signed contracts', pg.locator('#rpPaper tbody tr:not(.total)').count() == n_signed)
    pg.select_option('#rpState', ''); pg.select_option('#rpClient', cid)
    pg.wait_for_function("() => document.querySelectorAll('#rpPaper tbody tr:not(.total)').length === 2", timeout=10000)
    r.check('filtering by client lists this client only', pg.locator('#rpPaper tbody tr:not(.total)').count() == 2)
    with pg.expect_download() as dl:
        pg.click('#btnRpXlsx')
    r.check('the Excel file of the report downloads', dl.value.suggested_filename.endswith('.xlsx') and 'ontract' in dl.value.suggested_filename, dl.value.suggested_filename)

    # ================= a phone =================
    pg.set_viewport_size({'width': 390, 'height': 800})
    for h_ in ('#contracting', f'#contract/{cid}/0'):
        pg.evaluate(f"location.hash = '{h_}'"); pg.wait_for_selector('#ctrScreen, #ctOptions', timeout=30000); pg.wait_for_timeout(300)
        r.check(f'{h_.split("/")[0]} has no sideways scroll on a phone', pg.evaluate("() => document.documentElement.scrollWidth <= window.innerWidth + 1"), str(pg.evaluate("() => document.documentElement.scrollWidth")))
    pg.set_viewport_size({'width': 1280, 'height': 900})
    pg.remove_listener('dialog', on_dialog)
