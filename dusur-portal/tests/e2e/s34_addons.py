"""Admin and client (4.6 add-ons): the down payment, the formal black-and-white contract copy and the Company overview report.
1. Down payment: one instalment of a project is marked as the down payment (one per project). The client sees it in a box of its own ("Upcoming down payment" until it is
   paid, then "Down payment" with the Paid badge); when it is also the next payment it is shown once. The Collections screen and report mark it.
2. Formal copy: the contract paper in black and white only; the PDF has no colour at all (checked pixel by pixel); the colour copy still has colour.
3. Company overview: the whole company, from the Dashboard; the numbers agree with the clients' data; PDF and Excel; a phone.
Builds its own client (10,000 project, instalments of 3,000 / 4,000 / 3,000 in 7 / 30 / 60 days)."""
import json, os, re, subprocess, tempfile
from mockgh import BASE
from lib import *

try:
    import numpy as np
    from PIL import Image
except Exception:
    np = None

NAME, PHONE = 'Down Payment Client', '01002223344'


def go(pg, h, wait):
    pg.evaluate(f"location.hash = '{h}'"); pg.wait_for_selector(wait, timeout=40000)


def client_view(S, cid, secret, label):
    ctx, cp = new_page(S, label)
    cp.goto(f'{BASE}#client/{cid}'); cp.wait_for_selector('#clKey'); cp.fill('#clKey', secret); cp.click('#btnOpen'); cp.wait_for_selector('#tapeBig', timeout=30000)
    cp.wait_for_selector('#schedBlock', timeout=20000)
    return ctx, cp


def colourfulness(pdf, dpi, tmp, tag):
    """The most colourful pixel of page 1: max over pixels of (largest channel - smallest channel). 0 = pure grey."""
    subprocess.run(['pdftoppm', '-r', str(dpi), '-png', '-f', '1', '-l', '1', pdf, os.path.join(tmp, tag)], check=True)
    f = [x for x in os.listdir(tmp) if x.startswith(tag) and x.endswith('.png')][0]
    a = np.asarray(Image.open(os.path.join(tmp, f)).convert('RGB')).astype(int)
    return int((a.max(axis=2) - a.min(axis=2)).max())


def run(S):
    r, mock, pg = S.r, S.mock, S.admin
    pg.set_viewport_size({'width': 1280, 'height': 900})
    on_dialog = lambda d: d.accept()
    pg.on('dialog', on_dialog)                                                       # removed at the end: later suites bring their own dialog handlers
    tmp = tempfile.mkdtemp(prefix='ad')

    # ================= a client with three instalments =================
    go(pg, '#new', '#edName')
    pg.fill('#edName', NAME); pg.fill('#edPhone', PHONE)
    pg.click('#btnShowKey'); secret = pg.input_value('#edSecret')
    pg.select_option('#newProjType', 'KIT'); pg.fill('#newProjTitle', 'Down payment kitchen'); pg.click('#btnAddProject'); pg.wait_for_selector('#pjDesc')
    sku = pg.input_value('#pjSku')
    pg.click('#tab-payments'); pg.fill('#pjPrice', '10000')
    for _ in range(3): pg.click('#btnAddInstalment')
    pg.wait_for_function('() => document.querySelectorAll("#schList .rg").length === 3')
    plan = [(7, '3000', 'Signing'), (30, '4000', 'Delivery of the carcasses'), (60, '3000', 'Final')]
    rows = pg.locator('#schList .rg')
    for i, (off, amt, note) in enumerate(plan):
        rows.nth(i).locator('input[type=date]').fill(day(off)); rows.nth(i).locator('input[type=number]').fill(amt); rows.nth(i).locator('input[placeholder*="Note"]').fill(note)
    r.check('each instalment row has a "Down payment" tick, none ticked at first', pg.locator('#schList .sch-dep').count() == 3 and not any(pg.locator('#schList .sch-dep').nth(i).is_checked() for i in range(3)))
    r.check('the ticks are labelled for a screen reader with the row number', pg.locator('#schList .sch-dep').nth(1).get_attribute('aria-label') == 'Down payment 2')
    pg.locator('#schList .sch-dep').nth(1).check()
    r.check('ticking the second row ticks it alone', [pg.locator('#schList .sch-dep').nth(i).is_checked() for i in range(3)] == [False, True, False])
    pg.locator('#schList .sch-dep').nth(0).check()
    r.check('ticking the first row moves the mark there: one down payment per project', [pg.locator('#schList .sch-dep').nth(i).is_checked() for i in range(3)] == [True, False, False] and pg.evaluate('() => curProj().schedule.filter((x) => x.deposit).length') == 1)
    save(pg)
    cid = pg.evaluate('() => ed.rec.id')
    r.check('Save keeps the mark in the project record (one row) and nothing else changes in the other rows', pg.evaluate('() => curProj().schedule.map((x) => x.deposit === true)') == [True, False, False] and pg.evaluate('() => curProj().schedule.map((x) => Object.keys(x).sort().join())') == ['amount,deposit,due,id,note', 'amount,due,id,note', 'amount,due,id,note'])

    # ================= what the client sees =================
    ctx, cp = client_view(S, cid, secret, 'client-dp')
    dp = cp.inner_text('#downPay')
    r.check('the client sees an "Upcoming down payment" box with the amount (3,000) and its date, and the badge', 'Upcoming down payment' in dp and money_in(dp, 3000) and cp.locator('#downPay .badge').count() == 1 and cp.get_attribute('#downPay', 'class').split()[-1] == 'upcoming', dp)
    r.check('when the down payment is also the next payment it is shown once (no separate "next payment" box)', cp.locator('#nextPay').count() == 0)
    r.check('in the list of instalments the row of the down payment says so', cp.locator('#schedList .pay[data-deposit="1"]').count() == 1 and 'Down payment' in cp.locator('#schedList .pay[data-deposit="1"]').inner_text() and cp.locator('#schedList .pay').count() == 3)
    snap = json.loads(pg.evaluate(DECRYPT_JS, {'payload': json.loads(mock.text(f'data/clients/{cid}.json'))['payload'], 'secret': secret, 'id': cid}))
    sch = snap['projects'][0]['schedule']
    r.check('the client\'s snapshot carries the mark on that one row only', [bool(x.get('deposit')) for x in sch] == [True, False, False] and set(sch[1]) == {'id', 'due', 'amount', 'note'}, str(sch))

    # the down payment is received
    go(pg, f'#manage/{cid}', '#tab-payments'); pg.click('#tab-payments'); pg.click('#btnAddPayment')
    pg.locator('.rg').first.locator('input[type=number]').fill('3000'); pg.locator('.rg').first.locator('input[placeholder*="Note"]').fill('Down payment')
    save(pg)
    cp.reload(); cp.wait_for_selector('#clKey'); cp.fill('#clKey', secret); cp.click('#btnOpen'); cp.wait_for_selector('#downPay', timeout=30000)
    dp = cp.inner_text('#downPay')
    r.check('once received the box reads "Down payment" with the Paid badge', 'Upcoming' not in dp and 'Down payment' in dp and cp.get_attribute('#downPay', 'class').split()[-1] == 'paid', dp)
    nx = cp.inner_text('#nextPay') if cp.locator('#nextPay').count() else ''
    r.check('and now the next payment box shows the second instalment (4,000, in 30 days)', money_in(nx, 4000) and 'Next payment' in nx, nx)

    # the Collections screen and report
    go(pg, '#collections', '#colList'); pg.select_option('#colFilter', 'open'); pg.fill('#colSearch', sku)
    r.check('the open lines of the project are the two instalments still to come (the down payment is collected)', pg.locator('#colList tbody tr').count() == 2 and pg.locator('#colList [data-deposit]').count() == 0)

    # un-ticking removes it from the client
    go(pg, f'#manage/{cid}', '#tab-payments'); pg.click('#tab-payments')
    pg.locator('#schList .sch-dep').nth(0).uncheck()
    save(pg)
    cp.reload(); cp.wait_for_selector('#clKey'); cp.fill('#clKey', secret); cp.click('#btnOpen'); cp.wait_for_selector('#schedBlock', timeout=30000)
    r.check('un-ticked: the client has no down-payment box and no mark, and the next payment is the first unpaid instalment again', cp.locator('#downPay').count() == 0 and cp.locator('#schedList .pay[data-deposit]').count() == 0 and cp.locator('#nextPay').count() == 1)
    snap = json.loads(pg.evaluate(DECRYPT_JS, {'payload': json.loads(mock.text(f'data/clients/{cid}.json'))['payload'], 'secret': secret, 'id': cid}))
    r.check('and the snapshot has no "deposit" field any more', all('deposit' not in x for x in snap['projects'][0]['schedule']))
    # mark again (the second row) with the money not yet covering it: the box says "Upcoming" with the days
    pg.locator('#schList .sch-dep').nth(1).check(); save(pg)
    go(pg, '#collections', '#colList'); pg.select_option('#colFilter', 'open'); pg.fill('#colSearch', sku)
    r.check('the Collections screen marks the down payment (here the second instalment) with a chip', pg.locator('#colList tbody tr [data-deposit]').count() == 1 and 'Down payment' in pg.locator('#colList tbody tr [data-deposit]').first.inner_text())
    pg.click('#btnColPrint'); pg.wait_for_selector('#rpPaper', timeout=40000); pg.select_option('#rpClient', cid)
    pg.wait_for_function("() => document.querySelector('#rpPaper').innerText.includes('Down payment')", timeout=10000)
    r.check('the Collections report says "Down payment" in the status of that line', 'Down payment' in pg.inner_text('#rpPaper'))
    cp.close()

    # ================= the formal black-and-white copy =================
    go(pg, f'#contract/{cid}/0', '#ctPaper')
    r.check('the contract screen has a "Formal copy (black and white)" tick, off by default', pg.locator('#ctFormal').count() == 1 and not pg.is_checked('#ctFormal') and pg.locator('#ctPaper.ct-bw').count() == 0)
    f0 = os.path.join(tmp, 'colour.pdf'); pg.emulate_media(media='print'); pg.pdf(path=f0, print_background=True, prefer_css_page_size=True); pg.emulate_media(media='screen')
    if np is not None:
        c0 = colourfulness(f0, 60, tmp, 'colour')
        r.check('the normal copy has colour (the brand band and headings): the most colourful pixel is far from grey', c0 > 60, str(c0))
    pg.check('#ctFormal')
    cols = pg.evaluate("""() => { const p = document.getElementById('ctPaper'), out = new Set();
      for (const e of p.querySelectorAll('*')) { if (!e.childNodes.length || ![...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue; out.add(getComputedStyle(e).color); }
      return [...out]; }""")
    r.check('with the tick, the paper is marked and every piece of text on it is black', pg.locator('#ctPaper.ct-bw').count() == 1 and cols == ['rgb(0, 0, 0)'], str(cols))
    bg = pg.evaluate("() => [getComputedStyle(document.querySelector('#ctPaper .ct-tbl th, #ctPaper .rp-band')).backgroundColor]")
    r.check('the brand band is a thin black rule, and the table headings are not coloured', pg.evaluate("() => getComputedStyle(document.querySelector('#ctPaper .rp-band')).backgroundColor") == 'rgb(0, 0, 0)' and (pg.locator('#ctPaper .ct-tbl th').count() == 0 or pg.evaluate("() => getComputedStyle(document.querySelector('#ctPaper .ct-tbl th')).backgroundColor") == 'rgb(255, 255, 255)'), str(bg))
    pg.evaluate("() => { window.__t = null; window.print = () => { window.__t = document.title; }; }")
    pg.click('#btnCtPrint'); t1 = pg.evaluate("() => window.__t")
    r.check('the file is named as a formal copy (-bw) so it cannot be mixed up with the colour one', t1 and '-bw-' in t1, str(t1))
    pg.evaluate("() => window.dispatchEvent(new Event('afterprint'))")
    f1 = os.path.join(tmp, 'bw.pdf'); pg.emulate_media(media='print'); pg.pdf(path=f1, print_background=True, prefer_css_page_size=True); pg.emulate_media(media='screen')
    txt0 = subprocess.run(['pdftotext', '-layout', f0, '-'], capture_output=True, text=True).stdout; txt1 = subprocess.run(['pdftotext', '-layout', f1, '-'], capture_output=True, text=True).stdout
    r.check('the formal PDF has the same wording as the colour one (only the look changes)', re.sub(r'\s+', ' ', txt0) == re.sub(r'\s+', ' ', txt1) and sku in txt1)
    if np is not None:
        c1 = colourfulness(f1, 60, tmp, 'bw')
        r.check('and no pixel of it has colour: the greyest-possible copy (the most colourful pixel is within JPEG noise of grey, a fifth of the colour copy at most)', c1 <= 12 and c1 * 5 < c0, f'{c1} vs {c0}')
    else:
        r.check('numpy / Pillow are not installed here: the pixel check is skipped', True)
    r.check('the black-and-white choice is not part of the contract (nothing about it in the project record)', 'bw' not in json.dumps(pg.evaluate('() => curProj().contract || {}')).lower() and 'formal' not in json.dumps(pg.evaluate('() => curProj().contract || {}')).lower())
    pg.uncheck('#ctFormal')
    r.check('un-ticking brings the colour back', pg.locator('#ctPaper.ct-bw').count() == 0 and pg.evaluate("() => getComputedStyle(document.querySelector('#ctPaper .rp-band')).backgroundImage").startswith('linear-gradient'))

    # ================= the Company overview report =================
    go(pg, f'#manage/{cid}', '#tab-payments'); pg.click('#tab-payments')
    pg.locator('#schList .rg').nth(1).locator('input[type=date]').fill(day(-3)); save(pg)                    # the second instalment (4,000) is now 3 days late and the 3,000 received covers 3,000 of it: 1,000 is overdue
    go(pg, '#dashboard', '#btnDashOverview')
    r.check('the Dashboard has a "Company overview" button', 'Company overview' in pg.inner_text('#btnDashOverview'))
    pg.click('#btnDashOverview'); pg.wait_for_selector('#rpPaper', timeout=60000); pg.wait_for_function("() => document.querySelector('#rpPaper').innerText.includes('Contract value')", timeout=30000)
    paper = pg.inner_text('#rpPaper')
    r.check('the report opens on the overview type, which is the first in the list', pg.input_value('#rpType') == 'overview' and pg.locator('#rpType option').first.get_attribute('value') == 'overview')
    missing = [x for x in ('Clients', 'In production', 'Contract value', 'Collected', 'To collect', 'Overdue', 'Late projects', 'Stock alerts', 'All projects', 'Needs attention') if x not in paper]
    r.check('it shows the eight tiles, the money and status charts, the list of every project and the needs-attention list', not missing and pg.locator('#rpPaper svg').count() >= 2, f'missing {missing}, svgs {pg.locator("#rpPaper svg").count()}')
    tot = pg.evaluate("() => { const f = finTotals(store.items.flatMap((i) => i.rec.projects)); return { price: f.price, paid: f.paid, rem: f.remaining, clients: store.items.length, projects: store.items.reduce((a, i) => a + i.rec.projects.length, 0) }; }")
    tiles = {x.locator('.l').inner_text(): x.locator('.v').inner_text() + ' | ' + x.locator('.s').inner_text() for x in pg.locator('#rpPaper .rp-kpi').all()}
    r.check('the tiles agree with the clients\' data: value, collected and still to collect', all(x in tiles for x in ('Contract value', 'Collected', 'To collect')) and money_in(tiles['Contract value'], int(tot['price'])) and money_in(tiles['Collected'], int(tot['paid'])) and money_in(tiles['To collect'], int(tot['rem'])) and tot['price'] - tot['paid'] == tot['rem'], f'{tot} {tiles}')
    r.check('Clients counts the clients and says how many projects', tiles['Clients'].split(' | ')[0] == str(tot['clients']) and f"{tot['projects']} projects" in tiles['Clients'], tiles['Clients'])
    rows = pg.locator('#rpPaper section:has(h3:text-is("All projects")) tbody tr:not(.total)')
    r.check('the project list has one line for every project, ours among them, with its SKU and client', rows.count() == tot['projects'] and sku in pg.inner_text('#rpPaper') and NAME in pg.inner_text('#rpPaper'))
    ov = pg.evaluate("() => store.items.flatMap((i) => i.rec.projects.map((p) => ({ sku: p.sku, left: collectionSum(p).plan.filter((x) => x.status === 'overdue').length }))).filter((x) => x.left > 0).map((x) => x.sku)")
    att = pg.inner_text('#rpPaper section:has(h3:text-is("Needs attention"))') if pg.locator('#rpPaper section:has(h3:text-is("Needs attention"))').count() else ''
    r.check('every project with an overdue instalment is in "Needs attention", with its amount and the days late', sku in ov and all(s in att for s in ov) and 'Overdue instalment' in att and re.search(r'1,000\D.*3 days late', att.replace('\n', ' ')) is not None, f'{ov} {att[:300]}')
    ovsum = pg.evaluate("() => store.items.flatMap((i) => i.rec.projects).reduce((a, p) => a + collectionSum(p).overdue, 0)")
    r.check('and the Overdue tile counts it (it is the sum of every late instalment)', ovsum >= 1000 and money_in(tiles['Overdue'], int(ovsum)), f'{ovsum} {tiles["Overdue"]}')
    # PDF
    f2 = os.path.join(tmp, 'overview.pdf'); pg.emulate_media(media='print'); pg.pdf(path=f2, print_background=True, prefer_css_page_size=True); pg.emulate_media(media='screen')
    info = subprocess.run(['pdfinfo', f2], capture_output=True, text=True).stdout
    pages = int(re.search(r'Pages:\s+(\d+)', info).group(1)); w, h = [float(x) for x in re.search(r'Page size:\s+([\d.]+) x ([\d.]+)', info).groups()]
    txt = subprocess.run(['pdftotext', '-layout', f2, '-'], capture_output=True, text=True).stdout
    r.check(f'the PDF: standard A4 paper ({pages} page(s)), the brand and the title on it, the project list, and none of the app around it', abs(max(w, h) - 841.9) < 2 and abs(min(w, h) - 595.3) < 2 and 'Company overview' in txt and sku in txt and 'Contract value' in txt and 'Dashboard' not in txt and 'Save & publish' not in txt, f'{w}x{h} {pages}')
    with pg.expect_download() as dl:
        pg.click('#btnRpXlsx')
    r.check('the Excel file of the overview downloads', dl.value.suggested_filename.endswith('.xlsx') and 'overview' in dl.value.suggested_filename.lower(), dl.value.suggested_filename)
    pg.set_viewport_size({'width': 390, 'height': 800}); go(pg, '#dashboard', '#btnDashOverview'); go(pg, '#reports/overview', '#rpPaper'); pg.wait_for_timeout(500)
    r.check('on a phone the overview does not widen the page', pg.evaluate("() => document.documentElement.scrollWidth <= window.innerWidth + 1"), str(pg.evaluate("() => document.documentElement.scrollWidth")))
    pg.set_viewport_size({'width': 1280, 'height': 900})
    pg.remove_listener('dialog', on_dialog)
    S.addons = {'cid': cid, 'secret': secret, 'sku': sku}
