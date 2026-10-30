"""Admin: the History screen. Every change is listed with who, when and field by field before -> after; filters by person, area, action, text and record;
months; a "show more" page size; the integrity badge (an edited or removed entry breaks the chain); entries that could not be written yet wait and are retried;
the "History" link on a record; the printable History report; who may see it."""
import json
from mockgh import ADMIN_URL
from lib import *

AUD = 'data/private/audit/'

# a sealed month written straight into the repository, the way a second device would
SEED_JS = """async ({month, n, who}) => {
  const list = [];
  for (let i = 0; i < n; i++) list.push({ id: 'seed' + month + i, at: month + '-15T' + String(8 + (i % 10)).padStart(2, '0') + ':' + String(i % 60).padStart(2, '0') + ':00.000Z', uid: 'seed', who, role: 'owner',
    area: i % 2 ? 'settings' : 'suppliers', act: 'update', ref: 'R' + (i % 5), title: 'Seed entry ' + i, ch: [['field' + i, 'old' + i, 'new' + i]], note: '' });
  await appendMonth(month, list);
}"""
# the sealed file of a month, edited without fixing the chain (what an attacker with write access but no care would do)
TAMPER_JS = """async ({path, how}) => {
  const f = await getFile(path), d = await openObj(f.text);
  if (how === 'edit') d.items[0].title = 'Edited afterwards';
  if (how === 'remove') d.items.splice(1, 1);
  return { body: await sealObj(d), orig: f.text };
}"""


def put_raw(mock, path, text):
    mock.files[path] = {'b': text.encode('utf-8'), 'sha': mock.sha_of(text.encode('utf-8') + b'tamper')}
    mock.bump()


def entries(pg):
    return pg.locator('#audList li.audit-item')


def month(pg, m):
    """Choose a month on the History screen and wait until that month is on screen (the screen is redrawn after the file is read)."""
    pg.select_option('#audMonth', m); pg.wait_for_selector('#audScreen', timeout=30000)
    pg.wait_for_function("(m) => { const s = document.querySelector('#audMonth'); return !!s && s.value === m && !!document.querySelector('#audCount'); }", arg=m, timeout=30000, polling=200)


def run(S):
    r, mock, pg = S.r, S.mock, S.admin
    pg.set_viewport_size({'width': 1280, 'height': 900})
    dialogs = []
    on_dialog = lambda d: (dialogs.append(d.message), d.accept())
    pg.on('dialog', on_dialog)
    pg.evaluate("() => flushAudit()")

    # ---- what is stored
    files = mock.paths(AUD)
    blob = ''.join(mock.text(p) for p in files)
    import base64 as _b64
    raw = b''.join(_b64.b64decode(json.loads(mock.text(p))['ct']) for p in files)       # the words are looked for in the decoded bytes: a short word can turn up by chance in random base64 text
    r.check('the history is stored in sealed monthly files (envelopes only, no names, records or amounts in the clear)', files and all(set(json.loads(mock.text(p))) == {'v', 'iv', 'ct'} for p in files)
            and not [w for w in ('Al Nour', 'Workshop rent', 'Mona', 'Kitchen') if w in blob.replace('/', '').replace('+', '') and len(w) > 5 or w.encode() in raw], str(files))

    # ---- one change, then find it in History
    pg.evaluate("location.hash = '#suppliers/SUP-001'"); pg.wait_for_selector('#supLead')
    r.check('a saved record has a History link that opens its own history', pg.locator('#btnRecHistory').count() == 1 and pg.get_attribute('#btnRecHistory', 'href') == '#audit/SUP-001')
    before = pg.input_value('#supLead')
    pg.fill('#supLead', '9'); save(pg)
    pg.wait_for_function('() => auditQ.length === 0', timeout=20000, polling=250)
    pg.evaluate("location.hash = '#audit'"); pg.wait_for_selector('#audScreen')
    pg.wait_for_selector('#audList li.audit-item')
    first = entries(pg).first
    txt = first.inner_text()
    r.check('the newest entry is the supplier change: who, role, when, what', all(w in txt for w in ('Al Nour Boards', 'Changed', 'Suppliers', 'Administrator')) and first.locator('time').count() == 1, txt)
    first.locator('summary').click()
    rows = first.locator('.audit-ch tbody tr')
    cells = [rows.nth(i).locator('td').all_inner_texts() for i in range(rows.count())]
    r.check('opening it shows exactly the field that changed with its old and new value', len(cells) == 1 and cells[0] == ['leadDays', before, '9'], str(cells))
    r.check('the integrity badge says the history is intact', pg.locator('#audIntact').count() == 1 and pg.locator('#audBroken').count() == 0)

    # ---- the History link of a record shows only that record
    pg.evaluate("location.hash = '#suppliers/SUP-001'"); pg.wait_for_selector('#btnRecHistory'); pg.click('#btnRecHistory')
    pg.wait_for_selector('#audRefChip')
    n_ref = entries(pg).count()
    r.check('the record link opens the History screen limited to that record, with a chip saying so', n_ref >= 2 and 'SUP-001' in pg.inner_text('#audRefChip')
            and all('Al Nour Boards' in entries(pg).nth(i).inner_text() or 'SUP-001' in entries(pg).nth(i).inner_text() for i in range(n_ref)))
    r.check('it lists the creation and the later change, newest first', 'Created' in entries(pg).last.inner_text() and 'Changed' in entries(pg).first.inner_text(), entries(pg).last.inner_text()[:80])
    pg.click('#btnAudClearRef'); pg.wait_for_selector('#audRefChip', state='detached'); pg.wait_for_selector('#audScreen'); pg.wait_for_selector('#audList li.audit-item')
    r.check('"Show everything" removes the chip and goes back to #audit', pg.evaluate('location.hash') == '#audit' and entries(pg).count() > n_ref)

    # ---- filters
    total = pg.inner_text('#audCount')
    pg.select_option('#audArea', 'suppliers')
    areas = set(entries(pg).evaluate_all('els => els.map(e => e.dataset.area)'))
    r.check('filter by area: only supplier entries remain', areas == {'suppliers'} and entries(pg).count() >= 2, str(areas))
    pg.select_option('#audAct', 'create')
    acts = set(entries(pg).evaluate_all('els => els.map(e => e.dataset.act)'))
    r.check('filter by action on top of the area: only creations of suppliers', acts == {'create'} and 'Al Nour Boards' in pg.inner_text('#audList'), str(acts))
    pg.select_option('#audArea', ''); pg.select_option('#audAct', '')
    pg.fill('#audSearch', 'workshop rent')
    r.check('search finds an entry by what it is about (case does not matter)', entries(pg).count() >= 1 and all('Workshop rent' in entries(pg).nth(i).inner_text() for i in range(entries(pg).count())))
    pg.fill('#audSearch', 'zzzz-nothing-like-this')
    r.check('a search without matches says so instead of showing a blank page', 'No entry matches' in pg.inner_text('#audList') and entries(pg).count() == 0)
    pg.fill('#audSearch', '')
    people = pg.locator('#audWho option').all_inner_texts()
    r.check('the person filter lists everyone who acted this month (the administrator and the team member)', 'Administrator' in people and 'Mona Accountant' in people and people[0] == 'Everyone', str(people))
    pg.select_option('#audWho', label='Mona Accountant')
    mine = entries(pg).all_inner_texts()
    r.check('filter by person: only that member\'s entries', mine and all('Mona Accountant' in x for x in mine), str(mine[:2]))
    pg.select_option('#audWho', '')
    r.check('removing the filters brings back the full month', pg.inner_text('#audCount') == total)

    # ---- months, page size, the integrity badge
    pg.evaluate(SEED_JS, {'month': '2025-10', 'n': 55, 'who': 'Seeded Person'})
    pg.evaluate(SEED_JS, {'month': '2025-11', 'n': 4, 'who': 'Seeded Person'})
    pg.evaluate(SEED_JS, {'month': '2025-12', 'n': 3, 'who': 'Seeded Person'})
    pg.evaluate("location.hash = '#reports'"); pg.evaluate("location.hash = '#audit'"); pg.wait_for_selector('#audMonth')
    months = pg.locator('#audMonth option').evaluate_all('els => els.map(e => e.value)')
    r.check('the month list holds every month that has a file, newest first (this month, then the seeded ones)', months[-3:] == ['2025-12', '2025-11', '2025-10'] and months == sorted(months, reverse=True), str(months))
    month(pg, '2025-10')
    r.check('a month with many entries shows 40 first, says how many there are and offers "Show more"', entries(pg).count() == 40 and 'of 55' in pg.inner_text('#audCount') and pg.is_visible('#btnAudMore'), pg.inner_text('#audCount'))
    pg.click('#btnAudMore')
    r.check('"Show more" adds the rest and then hides itself', entries(pg).count() == 55 and not pg.is_visible('#btnAudMore'))
    r.check('a month written by someone else reads fine and is intact', 'Seeded Person' in entries(pg).first.inner_text() and pg.locator('#audIntact').count() == 1)

    p12, p11 = AUD + '2025-12.json', AUD + '2025-11.json'
    month(pg, '2025-12'); r.check('a small month is intact too', pg.locator('#audIntact').count() == 1 and entries(pg).count() == 3)
    t12 = pg.evaluate(TAMPER_JS, {'path': p12, 'how': 'edit'})
    put_raw(mock, p12, t12['body']); month(pg, '2025-11'); month(pg, '2025-12')
    r.check('an entry edited after it was written breaks the chain: the badge turns red and says so', pg.locator('#audBroken').count() == 1 and pg.get_attribute('#audBroken', 'role') == 'alert' and pg.locator('#audIntact').count() == 0
            and 'broken' in pg.inner_text('#audScreen').lower())
    put_raw(mock, p12, t12['orig']); month(pg, '2025-11'); month(pg, '2025-12')
    r.check('putting the original file back makes the badge green again', pg.locator('#audIntact').count() == 1 and pg.locator('#audBroken').count() == 0)
    t11 = pg.evaluate(TAMPER_JS, {'path': p11, 'how': 'remove'})
    put_raw(mock, p11, t11['body']); month(pg, '2025-12'); month(pg, '2025-11')
    r.check('an entry removed from the middle of a month breaks the chain too', entries(pg).count() == 3 and pg.locator('#audBroken').count() == 1)

    # ---- the report of the history
    month(pg, '2025-10')
    pg.click('#btnAudPrint'); pg.wait_for_selector('#rpPaper', timeout=30000)
    r.check('the "printable report" button opens the History report for the month that was on screen', pg.input_value('#rpType') == 'audit' and pg.input_value('#rpAudMonth') == '2025-10' and pg.evaluate('location.hash') == '#reports' and 'History' in pg.inner_text('#rpTitle'))
    pg.wait_for_function("() => document.querySelectorAll('#rpPaper .rp-tbl tbody tr:not(.total)').length === 55", timeout=20000, polling=250)
    r.check('it shows the month named in the title block, the number of entries, a summary chart and a row per entry', 'October 2025' in pg.inner_text('.rp-titleblock') and 'Entries' in pg.inner_text('#rpPaper') and pg.locator('#rpPaper svg.rp-svg').count() >= 1
            and 'Seeded' in pg.inner_text('#rpPaper .rp-tbl'), pg.inner_text('.rp-titleblock')[:200])
    pg.select_option('#rpAudMonth', '2025-11')
    pg.wait_for_function("() => document.querySelectorAll('#rpPaper .rp-tbl tbody tr:not(.total)').length === 3", timeout=20000, polling=250)
    r.check('choosing another month in the report loads that month', pg.input_value('#rpAudMonth') == '2025-11' and 'November 2025' in pg.inner_text('.rp-titleblock'))
    pg.select_option('#rpAudMonth', '2025-10')
    pg.wait_for_function("() => document.querySelectorAll('#rpPaper .rp-tbl tbody tr:not(.total)').length === 55", timeout=20000, polling=250)
    pg.select_option('#rpAudArea', 'settings')
    pg.wait_for_function("() => document.querySelectorAll('#rpPaper .rp-tbl tbody tr:not(.total)').length === 27", timeout=20000, polling=250)
    r.check('the area filter narrows the report (27 of the 55 are Settings) and its scope line says so', 'Settings' in pg.inner_text('.rp-titleblock'))
    with pg.expect_download() as dl:
        pg.click('#btnRpXlsx')
    r.check('the Excel file of the History report downloads', dl.value.suggested_filename.endswith('.xlsx') and 'History' in dl.value.suggested_filename, dl.value.suggested_filename)
    pg.wait_for_function('() => auditQ.length === 0', timeout=20000, polling=250)

    # ---- entries that could not be written wait and are tried again
    pg.evaluate("""() => { window.__putOrig = putFile; putFile = async (p, ...a) => { if (p.startsWith(AUDIT_DIR)) throw new Error('offline test'); return window.__putOrig(p, ...a); };
      audit({ area: 'settings', act: 'update', ref: 'pending-test', title: 'Pending entry', ch: [['x', '1', '2']] }); }""")
    pg.wait_for_function("() => auditErr === 'offline test'", timeout=20000, polling=250)
    r.check('when the history cannot be written the top bar says how many entries are waiting and offers Retry', pg.is_visible('#auditPill') and pg.is_visible('#btnAuditRetry') and '1' in pg.inner_text('#auditPill'))
    pg.evaluate("location.hash = '#audit'"); pg.wait_for_selector('#audScreen'); month(pg, months[0]); pg.wait_for_selector('#audList li.audit-item')
    r.check('the waiting entry is already shown in History, marked "Waiting to be written"', 'Pending entry' in pg.inner_text('#audList') and 'Waiting to be written' in pg.inner_text('#audList'))
    pg.evaluate("() => { putFile = window.__putOrig; }")
    pg.click('#btnAuditRetry'); pg.wait_for_function('() => auditQ.length === 0', timeout=20000, polling=250)
    pg.wait_for_selector('#auditPill', state='hidden')
    r.check('after Retry the entry is written, the note disappears, and nothing was lost or doubled', pg.evaluate("async () => (await loadAuditMonth(auditMonthOf(oiso()))).items.filter((e) => e.ref === 'pending-test').length") == 1)

    # ---- who may see it (pure rules, checked with a made-up member)
    out = pg.evaluate("""() => { const u = session.user; const probe = (perms) => { session.user = { id: 'x', owner: false, name: 'X', role: 'viewer', perms: mkPerms(perms) }; return { audit: viewAllowed('audit'), team: viewAllowed('team'), repAudit: reportAllowed('audit'), repCosts: reportAllowed('costs'), types: allowedReports().join(',') }; };
      const a = probe({ reports: 1, audit: 1 }), b = probe({ reports: 1, clients: 1 }), c = probe({ reports: 2, finance: 1 }); session.user = u; return { a, b, c }; }""")
    r.check('a role with History may open it and its report; a role without it may not', out['a']['audit'] and out['a']['repAudit'] and not out['b']['audit'] and not out['b']['repAudit'], str(out))
    r.check('the Team screen stays closed to every member role, whatever rights it has', not out['a']['team'] and not out['c']['team'])
    r.check('a role without Finance cannot pick the Costs report; with Finance it can', not out['b']['repCosts'] and out['c']['repCosts'] and 'costs' in out['c']['types'] and 'costs' not in out['b']['types'], str(out))

    # ---- tidy: the seeded months leave the repository so later suites see only real history
    for p in [p for p in mock.paths(AUD) if any(m in p for m in ('2025-10', '2025-11', '2025-12'))]:
        del mock.files[p]
    mock.bump()
    pg.evaluate("() => { for (const k of Object.keys(auditParts)) if (/^2025-/.test(k)) delete auditParts[k]; }")
    pg.evaluate("location.hash = '#dashboard'"); pg.wait_for_selector('#btnNewClient')
    pg.remove_listener('dialog', on_dialog)
