"""Admin: collection schedule (the dates each client agreed to pay on), the Collections screen and report, what the client sees; the WhatsApp link that can be changed by hand
(client and supplier); the client ID shown together with the project SKU.
One new client with a 12,000 project, 3,000 received and four instalments worked out by hand:
    instalment  due        amount   covered by the 3,000 received (earliest first)   status
    1           -20 days    2,000   2,000                                              collected
    2            -5 days    4,000   1,000                                              overdue, 3,000 still to pay
    3           +10 days    3,000   0                                                  upcoming
    4           +40 days    2,000   0                                                  upcoming
    scheduled 11,000, still to collect on dates 8,000, no date yet 1,000 (price 12,000 - received 3,000 - 8,000)."""
import datetime, json, re
from mockgh import BASE
from lib import *

NAME, PHONE = 'Collections Client', '01001234567'


def plan_badges(pg):
    return pg.evaluate("() => [...document.querySelectorAll('#schList .sch-st .badge')].map((b) => b.dataset.status)")


def kpi_map(pg, scope):
    return {x.locator('.l').inner_text(): x.locator('.v').inner_text() for x in pg.locator(scope + ' .kpi').all()}


def fmt_day(offset):
    d = datetime.date.today() + datetime.timedelta(days=offset)
    return f'{d.day} {d.strftime("%b")} {d.year}'


def go(pg, h, wait):
    pg.evaluate(f"location.hash = '{h}'"); pg.wait_for_selector(wait, timeout=40000)


def run(S):
    r, mock, pg = S.r, S.mock, S.admin
    pg.set_viewport_size({'width': 1280, 'height': 900})
    dialogs = []
    on_dialog = lambda d: (dialogs.append(d.message), d.accept())
    pg.on('dialog', on_dialog)

    # ================= a client with a price, a payment and four instalments =================
    go(pg, '#new', '#edName')
    pg.fill('#edName', NAME); pg.fill('#edPhone', PHONE)
    cid = pg.input_value('#edId') if pg.locator('#edId').count() else re.search(r'[A-Z0-9]+-CL-\d+', pg.inner_text('main')).group(0)
    pg.click('#btnShowKey'); secret = pg.input_value('#edSecret')
    pg.select_option('#newProjType', 'KIT'); pg.fill('#newProjTitle', 'Collect kitchen'); pg.click('#btnAddProject'); pg.wait_for_selector('#pjDesc')
    sku = pg.input_value('#pjSku') if pg.locator('#pjSku').count() else ''
    pg.click('#tab-payments'); pg.fill('#pjPrice', '12000'); pg.click('#btnAddPayment')
    pg.locator('.rg').first.locator('input[type=number]').fill('3000'); pg.locator('.rg').first.locator('input[placeholder*="Note"]').fill('Deposit')
    r.check('the Payments tab has a Collection schedule card with an empty-state sentence, the add button and the split controls',
            pg.locator('#schCard').count() == 1 and pg.locator('#btnAddInstalment').count() == 1 and pg.locator('#btnSplit').count() == 1 and 'No instalments yet' in pg.inner_text('#schList'))
    k = kpi_map(pg, '#schCard')
    r.check('with nothing scheduled the whole balance (9,000) is "Not yet scheduled"', money_in(k.get('Not yet scheduled', ''), 9000), str(k))

    # ---- split: the balance into equal monthly instalments, the last one takes the rounding
    pg.fill('#splitN', '1'); pg.click('#btnSplit'); toast_text(pg, 'between 2 and 36')
    pg.fill('#splitN', '3'); pg.fill('#splitFrom', day(10)); pg.click('#btnSplit')
    pg.wait_for_function('() => document.querySelectorAll("#schList .rg").length === 3')
    amounts = [float(x) for x in pg.locator('#schList .rg input[type=number]').evaluate_all('els => els.map(e => e.value)')]
    dues = pg.locator('#schList .rg input[type=date]').evaluate_all('els => els.map(e => e.value)')
    r.check('Split makes three instalments of 3,000 (9,000 / 3), the first on the chosen date, one month apart', amounts == [3000, 3000, 3000] and dues[0] == day(10) and dues[1] > dues[0] and dues[2] > dues[1], f'{amounts} {dues}')
    r.check('after the split nothing is left unscheduled and Split says so', pg.evaluate('() => collectionSum(curProj()).undated') == 0)
    pg.click('#btnSplit'); toast_text(pg, 'Nothing left to schedule')
    # an odd amount: 10,000 / 3 -> 3,333.33 + 3,333.33 + 3,333.34 (adds up exactly)
    parts = pg.evaluate('() => splitAmount(10000, 3)')
    r.check('splitting an amount that does not divide evenly gives parts that add up exactly (3,333.33 + 3,333.33 + 3,333.34)', parts == [3333.33, 3333.33, 3333.34] and abs(sum(parts) - 10000) < 1e-9, str(parts))
    r.check('addMonths keeps the day of the month and never overflows (31 Jan + 1 month = 28 Feb 2019)', pg.evaluate("() => [addMonths('2019-01-31', 1), addMonths('2019-12-15', 2), addMonths('2020-01-31', 1)]") == ['2019-02-28', '2020-02-15', '2020-02-29'])

    # ---- replace the split with four instalments (9,000 in all: the 3,000 deposit is the part of the price that no instalment covers)
    for _ in range(3):
        pg.locator('#schList .rg').first.locator('button.x').click()
    pg.wait_for_selector('#schList .empty')
    for _ in range(4):
        pg.click('#btnAddInstalment')
    pg.wait_for_function('() => document.querySelectorAll("#schList .rg").length === 4')
    plan = [(-20, '3000', 'First'), (-5, '2000', 'Second'), (10, '3000', 'Third'), (40, '1000', 'Fourth')]
    rows = pg.locator('#schList .rg')
    for i, (off, amt, note) in enumerate(plan):
        rows.nth(i).locator('input[type=date]').fill(day(off)); rows.nth(i).locator('input[type=number]').fill(amt); rows.nth(i).locator('input[placeholder*="Note"]').fill(note)
    r.check('the deposit already received (3,000) is taken off the price first, so no instalment is covered yet: overdue, overdue, upcoming, upcoming', plan_badges(pg) == ['overdue', 'overdue', 'upcoming', 'upcoming'], str(plan_badges(pg)))
    r.check('the first instalment says it is 20 days overdue, the third says 10 days left', 'Overdue by 20 days' in rows.nth(0).inner_text() and '10 days left' in rows.nth(2).inner_text(), rows.nth(0).inner_text() + ' / ' + rows.nth(2).inner_text())
    k = kpi_map(pg, '#schCard'); nextk = pg.locator('#schCard .kpi:has(.l:text-is("Next payment"))').inner_text()
    r.check('summary: scheduled 9,000 / overdue 5,000 / next payment = the oldest overdue instalment (3,000, with its date) / nothing without a date',
            money_in(k['Scheduled'], 9000) and money_in(k['Overdue'], 5000) and money_in(nextk, 3000) and fmt_day(-20) in nextk and money_in(k['Not yet scheduled'], 0), str(k) + nextk)
    # money received moves the plan on: each step worked out by hand (deposit 3,000 is outside the schedule, so the instalments get what is above 3,000)
    def paid(n):
        pg.locator('.rg').first.locator('input[type=number]').fill(str(n)); pg.click('#tab-details'); pg.click('#tab-payments')
        return pg.evaluate('() => collectionPlan(curProj()).map((x) => [x.status, x.outstanding])')
    r.check('received 6,000: the first instalment is collected', paid(6000) == [['paid', 0], ['overdue', 2000], ['upcoming', 3000], ['upcoming', 1000]])
    r.check('received 7,000: the second is part paid, 1,000 still overdue', paid(7000) == [['paid', 0], ['overdue', 1000], ['upcoming', 3000], ['upcoming', 1000]])
    r.check('received 9,500: two collected, the third is part paid before its date (1,500 to go)', paid(9500) == [['paid', 0], ['paid', 0], ['partial', 1500], ['upcoming', 1000]])
    r.check('the status badges follow', plan_badges(pg) == ['paid', 'paid', 'partial', 'upcoming'], str(plan_badges(pg)))
    r.check('received 12,000 (everything): all four collected', [x[0] for x in paid(12000)] == ['paid'] * 4)
    r.check('back to 3,000: nothing is covered again', [x[0] for x in paid(3000)] == ['overdue', 'overdue', 'upcoming', 'upcoming'])
    # the whole price listed as instalments works too: with a 12,000 schedule the first dollars go to the first instalment
    r.check('a schedule that lists the whole price needs no deposit rule: the same 3,000 received pays the first 3,000 instalment',
            pg.evaluate("() => collectionPlan({ price: 12000, payments: [{ amount: 3000 }], schedule: [{ id: 'a', due: '2999-01-01', amount: 3000 }, { id: 'b', due: '2999-02-01', amount: 9000 }] }, '2998-12-01').map((x) => x.status)") == ['paid', 'upcoming'])
    # drop the fourth instalment: 8,000 scheduled, 4,000 outside the schedule, 3,000 received -> 1,000 has no date
    pg.locator('#schList .rg').last.locator('button.x').click()
    k = kpi_map(pg, '#schCard')
    r.check('with three instalments (8,000) the 1,000 that no date covers shows as Not yet scheduled', money_in(k['Scheduled'], 8000) and money_in(k['Not yet scheduled'], 1000), str(k))
    pg.click('#btnAddInstalment')
    pg.locator('#schList .rg').last.locator('input[type=date]').fill('')
    pg.locator('#schList .rg').last.locator('input[type=number]').fill('500')
    pg.click('#btnSave'); toast_text(pg, 'needs a due date')
    r.check('an instalment with an amount but no date is refused with a plain message and nothing is saved', pg.locator('.savebar >> text=/^Saved /').count() == 0)
    pg.locator('#schList .rg').last.locator('button.x').click()
    save(pg)
    sku = pg.evaluate('() => ed.rec.projects[0].sku')
    S.col = {'cid': cid, 'secret': secret, 'sku': sku}

    # ---- what is stored: the private record and the client snapshot hold the schedule, in the right shape
    rec = pg.evaluate('() => JSON.parse(JSON.stringify(store.items.find((x) => x.rec.id === ed.rec.id).rec.projects[0].schedule))')
    r.check('the saved project keeps three instalments with ids, dates, rounded amounts and notes (the empty one was dropped)', len(rec) == 3 and all(x['id'] and re.fullmatch(r'\d{4}-\d{2}-\d{2}', x['due']) and x['amount'] > 0 for x in rec) and [x['note'] for x in rec] == ['First', 'Second', 'Third'], str(rec))

    # ================= the client site =================
    ctx, cp = new_page(S, 'client-coll')
    cp.goto(f'{BASE}#client/{cid}'); cp.wait_for_selector('#clKey'); cp.fill('#clKey', secret); cp.click('#btnOpen'); cp.wait_for_selector('#tapeBig', timeout=30000)
    cp.wait_for_selector('#nextPay', timeout=20000)
    nxt = cp.inner_text('#nextPay')
    r.check('the client money card shows the next payment first: the overdue 3,000 with its date', money_in(nxt, 3000) and 'Next payment' in nxt and 'overdue' in nxt.lower(), nxt)
    sched = cp.evaluate("() => [...document.querySelectorAll('#schedList .pay')].map((e) => [e.dataset.status, e.innerText.replace(/\\s+/g, ' ')])")
    r.check('the client sees the whole schedule: three instalments with status, amount and note', [s[0] for s in sched] == ['overdue', 'overdue', 'upcoming'] and money_in(sched[1][1], 2000) and 'Second' in sched[1][1] and 'Overdue by 20 days' in sched[0][1], str(sched))
    payload = json.loads(mock.text(f'data/clients/{cid}.json'))['payload']
    pub = json.loads(cp.evaluate(DECRYPT_JS, {'payload': payload, 'secret': secret, 'id': cid}))
    r.check('the client snapshot carries the schedule (id, due, amount, note) and nothing else about it', set(pub['projects'][0].get('schedule', [{}])[0]) == {'id', 'due', 'amount', 'note'} and len(pub['projects'][0]['schedule']) == 3, str(pub['projects'][0].get('schedule')))
    addr = cp.inner_text('#clAddress') if cp.locator('#clAddress').count() else ''
    r.check('the contact box of the opened project shows the company address of Settings (it was only on the search page)', 'Industrial zone' in addr, addr)
    cp.set_viewport_size({'width': 390, 'height': 800}); cp.wait_for_timeout(200)
    r.check('on a phone the next-payment block and the schedule fit the screen (no sideways scroll)', cp.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'))
    ctx.close()

    # ================= the contract lists the agreed instalments =================
    go(pg, f'#contract/{cid}/0', '#ctPaper')
    caps = pg.evaluate("() => [...document.querySelectorAll('#ctPaper .ct-tblcap')].map((e) => e.textContent)")
    sched_rows = pg.evaluate("() => [...document.querySelectorAll('#ctPaper .ct-tbl')].map((t) => [...t.querySelectorAll('tbody tr')].map((r) => r.innerText.replace(/\\s+/g, ' ')))")
    r.check('the contract paper has a second table, the agreed instalments, with the three notes and amounts (in the language of the contract)', len(caps) == 2 and caps[0] != caps[1] and any(len(t) == 3 and 'First' in t[0] and 'Second' in t[1] and 'Third' in t[2] for t in sched_rows), str(caps) + str(sched_rows))

    # ================= the Collections screen =================
    go(pg, '#collections', '#colScreen')
    r.check('Collections is in the Money group of the menu and the screen has its title', pg.locator('#navLinks a[href="#collections"]').count() == 1 and 'Collections' in pg.inner_text('#colScreen h1'))
    rowsel = f'#colList tr[data-cid="{cid}"]'
    mine = pg.evaluate("(cid) => [...document.querySelectorAll('#colList tr[data-cid=\"' + cid + '\"]')].map((e) => [e.dataset.kind, e.dataset.status])", cid)
    r.check('the new client has four open lines: two overdue instalments, the upcoming one and the 1,000 with no date',
            sorted(mine) == sorted([['due', 'overdue'], ['due', 'overdue'], ['due', 'upcoming'], ['undated', 'undated']]), str(mine))
    first = pg.locator(rowsel).first.inner_text()
    r.check('the first line of this client is the oldest overdue one: 3,000 to collect, 20 days overdue', money_in(first, 3000) and 'Overdue by 20 days' in first and sku in first and cid in first, first)
    k = kpi_map(pg, '#colScreen')
    r.check('the tiles add up all clients: overdue includes our 5,000',  float(re.sub(r'[^\d.]', '', k['Overdue'].split('\n')[0]) or 0) >= 3000, str(k))
    pg.select_option('#colFilter', 'overdue')
    only = pg.evaluate("() => [...document.querySelectorAll('#colList tbody tr')].map((e) => e.dataset.status)")
    r.check('the Overdue filter lists only overdue lines (both of ours)', only and set(only) == {'overdue'} and pg.locator(rowsel).count() == 2, str(only))
    pg.select_option('#colFilter', 'week')
    r.check('the 7-day filter does not list our instalments (they are due in 10 and 40 days)', pg.locator(rowsel).count() == 0)
    pg.select_option('#colFilter', 'month')
    r.check('the 30-day filter lists the third instalment only (due in 10 days)', pg.locator(rowsel).count() == 1 and money_in(pg.locator(rowsel).first.inner_text(), 3000))
    pg.select_option('#colFilter', 'undated')
    only = pg.evaluate("() => [...document.querySelectorAll('#colList tbody tr')].map((e) => e.dataset.kind)")
    r.check('the No-date filter lists balances without a schedule, including our 1,000', only and set(only) == {'undated'} and pg.locator(rowsel).count() == 1 and money_in(pg.locator(rowsel).first.inner_text(), 1000))
    pg.select_option('#colFilter', 'open'); pg.fill('#colSearch', PHONE)
    r.check('searching by the client phone finds the client\'s lines only', pg.locator('#colList tbody tr').count() == 4 and pg.locator(rowsel).count() == 4, str(pg.locator('#colList tbody tr').count()))
    # the WhatsApp reminder: a wa.me link with the message in it
    pg.fill('#colSearch', sku)
    pg.select_option('#colFilter', 'overdue')
    href = pg.locator(f'{rowsel} a[href^="https://wa.me/"]').first.get_attribute('href')
    msg = __import__('urllib.parse', fromlist=['unquote']).unquote(href.split('?text=')[1])
    r.check('the reminder button opens WhatsApp for the client with a ready message: name, amount, project reference and date',
            href.startswith('https://wa.me/201001234567?text=') and NAME in msg and '3,000' in msg and f'{cid}/{sku}' in msg, href)
    r.check('a copy button gives the same reminder text', pg.locator(f'{rowsel} button:has-text("Copy")').count() == 2)
    pg.fill('#colSearch', 'zzzz-no-such-client'); r.check('a search with no match says so', 'No instalment matches' in pg.inner_text('#colList'))
    pg.fill('#colSearch', '')

    # ================= the report =================
    pg.select_option('#colFilter', 'open')
    pg.click('#btnColPrint'); pg.wait_for_selector('#rpPaper', timeout=40000)
    r.check('Print report opens the Collections report with the same lines', 'Collections' in pg.inner_text('#rpPaper') and NAME in pg.inner_text('#rpPaper'))
    paper = pg.inner_text('#rpPaper')
    r.check('the report has the KPI tiles (To collect, Overdue, Due in 7/30 days, No date yet), the split chart and the table with the client and the reference', all(x in paper for x in ('To collect', 'Overdue', 'Due in 7 days', 'No date yet')) and f'{cid}/{sku}' in paper and pg.locator('#rpPaper .rp-chart, #rpPaper svg').count() >= 1, paper[:400])
    pg.select_option('#rpState', 'overdue')
    t1 = pg.inner_text('#rpPaper')
    r.check('the report filter by status works (overdue only) and its scope line says so', 'Overdue' in t1 and pg.locator('#rpPaper tbody tr').count() >= 1)
    pg.select_option('#rpClient', cid)
    pg.select_option('#rpState', '')
    t2 = pg.inner_text('#rpPaper')
    r.check('filtering the report by client lists that client only (4 lines)', pg.evaluate("(n) => [...document.querySelectorAll('#rpPaper tbody tr')].filter((r) => r.innerText.includes(n)).length", NAME) == 4 and NAME in t2)
    with pg.expect_download() as dl:
        pg.click('#btnRpXlsx')
    r.check('the Excel file of the report downloads', dl.value.suggested_filename.endswith('.xlsx') and 'Collections' in dl.value.suggested_filename)

    # ================= the WhatsApp link that can be changed by hand =================
    go(pg, f'#manage/{cid}', '#edWhatsapp')
    r.check('the client form has a WhatsApp field; empty, the link is made from the phone number (01001234567 -> country code 20)', pg.get_attribute('#edWaPreview', 'href') == 'https://wa.me/201001234567' and pg.get_attribute('#edWaPreview', 'data-state') == 'auto')
    pg.fill('#edWhatsapp', 'https://wa.me/201112223334'); pg.wait_for_timeout(100)
    r.check('typing another number or a WhatsApp link changes the address that will be opened', pg.get_attribute('#edWaPreview', 'href') == 'https://wa.me/201112223334' and pg.get_attribute('#edWaPreview', 'data-state') == 'custom')
    pg.fill('#edWhatsapp', '0100 999 8888'); pg.wait_for_timeout(100)
    r.check('a plain number typed there is turned into a wa.me address too', pg.get_attribute('#edWaPreview', 'href') == 'https://wa.me/201009998888', str(pg.get_attribute('#edWaPreview', 'href')))
    pg.fill('#edWhatsapp', 'not a number or link'); pg.wait_for_timeout(100)
    r.check('something that is neither a number nor a WhatsApp link is flagged', pg.get_attribute('#edWaPreview', 'data-state') == 'bad' and 'neither a phone number nor a WhatsApp link' in pg.inner_text('#edWaPreview'))
    pg.click('#btnSave'); toast_text(pg, 'neither a phone number nor a WhatsApp link')
    pg.fill('#edWhatsapp', 'https://evil.example.com/x'); pg.wait_for_timeout(100)
    r.check('a link to any other site is refused (only WhatsApp addresses)', pg.get_attribute('#edWaPreview', 'data-state') == 'bad')
    pg.fill('#edWhatsapp', 'https://wa.me/201112223334'); save(pg)
    go(pg, f'#progress/{cid}/0', '#btnWaUpdate')
    wa = pg.get_attribute('#btnWaUpdate', 'href') or ''
    r.check('the "Tell the client" button on the progress screen uses the hand-made WhatsApp number', wa.startswith('https://wa.me/201112223334?text='), wa[:80])
    r.check('the client ID and the SKU are shown together on the progress screen', pg.inner_text('#pgSkuRef').strip() == f'{cid}/{sku}')
    go(pg, f'#manage/{cid}', '#edWhatsapp'); pg.fill('#edWhatsapp', ''); save(pg)
    go(pg, f'#progress/{cid}/0', '#btnWaUpdate')
    r.check('emptying the field goes back to the number made from the phone', (pg.get_attribute('#btnWaUpdate', 'href') or '').startswith('https://wa.me/201001234567?text='))

    # ================= client ID <-> SKU =================
    go(pg, f'#manage/{cid}', '#pjSkuRef')
    r.check('the project Details tab shows the client ID and the SKU as one reference, with a copy button', pg.inner_text('#pjSkuRef').strip() == f'{cid}/{sku}' and pg.locator('.skuref button:has-text("Copy")').count() == 1)
    pg.fill('#pjSku', sku + '-X'); r.check('the reference follows the SKU as it is edited', pg.inner_text('#pjSkuRef').strip() == f'{cid}/{sku}-X'); pg.fill('#pjSku', sku)
    go(pg, f'#contract/{cid}/0', '#ctPaper')
    r.check('the contract paper carries the same reference', f'{cid}/{sku}' in pg.inner_text('#ctPaper'))
    go(pg, '#dashboard', '#dashSearch'); pg.fill('#dashSearch', NAME)
    r.check('the dashboard chip has the full reference as its tooltip', pg.locator(f'.item .mono[title="{cid}/{sku}"]').count() == 1)

    # ================= a supplier: the same hand-made WhatsApp link =================
    go(pg, '#suppliers/new', '#supName')
    pg.fill('#supName', 'Coll WhatsApp Supplier'); pg.fill('#supPhone', '0122 333 4444')
    r.check('a supplier\'s WhatsApp is made from its phone until something is typed (country code 20 added)', pg.get_attribute('#supWaPreview', 'href') == 'https://wa.me/201223334444')
    pg.fill('#supWhatsapp', 'https://wa.me/201555000111'); pg.wait_for_timeout(100)
    r.check('typing a WhatsApp address changes the preview', pg.get_attribute('#supWaPreview', 'href') == 'https://wa.me/201555000111')
    save(pg)
    sid = pg.evaluate('location.hash').split('/')[-1]
    S.col['sup'] = sid
    sup = pg.evaluate('(id) => opsFind("suppliers", id)', sid)
    r.check('the supplier keeps the hand-made WhatsApp address in its sealed file', sup and sup['whatsapp'] == 'https://wa.me/201555000111' and 'wa.me/201555000111' not in mock.text('data/private/ops/suppliers.json'))
    go(pg, f'#suppliers/{sid}', '#supWhatsapp')
    go(pg, '#suppliers', '#supList')
    pg.fill('#supSearch', 'Coll WhatsApp')
    pg.wait_for_selector('#supList [data-wa="custom"]', timeout=10000)
    r.check('the supplier list opens the hand-made address from its WhatsApp button', pg.get_attribute('#supList [data-wa="custom"]', 'href') == 'https://wa.me/201555000111')
    pg.remove_listener('dialog', on_dialog)
