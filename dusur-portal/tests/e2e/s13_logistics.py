"""Admin: Logistics (#logistics): shipments with steps you can add, edit, reorder, remove and complete; late / blocked states, materials linked to the inventory,
receiving into stock (once), outgoing shipments to a client project, cancel, delete, protection against stale forms and unsaved work, sealed storage, Arabic."""
import json
from mockgh import ADMIN_URL
from lib import *

LG = 'data/private/ops/logistics.json'
INV = 'data/private/ops/inventory.json'


def lg_card(pg, text):
    return pg.locator('.lg-item', has_text=text)


def new_ship(pg):
    pg.click('#adminNav a[data-route=logistics]'); pg.wait_for_selector('#btnNewLg')
    pg.click('#btnNewLg'); pg.wait_for_selector('#lgTitle')


def step_names(pg):
    return pg.locator('#lgSteps .lgstep input[id^=lgStepName]').evaluate_all('els => els.map(e => e.value)')


def run(S):
    r, mock, pg = S.r, S.mock, S.admin
    pg.set_viewport_size({'width': 1280, 'height': 900})
    dialogs = []
    dlg = {'accept': False}
    on_dialog = lambda d: (dialogs.append(d.message), d.accept() if dlg['accept'] else d.dismiss())
    pg.on('dialog', on_dialog)

    pg.click('#adminNav a[data-route=logistics]'); pg.wait_for_selector('#lgScreen')
    r.check('Logistics opens #logistics with its own heading and highlighted menu item', pg.evaluate('location.hash') == '#logistics' and 'Shipping' in pg.inner_text('h1') or 'Logistics' in pg.inner_text('h1'))
    r.check('empty state', 'No shipments yet' in pg.inner_text('#lgList') and LG not in mock.files)

    # ---- a new incoming shipment starts with the standard steps
    pg.click('#btnNewLg'); pg.wait_for_selector('#lgTitle')
    r.check('a new shipment starts as "from a supplier" with the 7 standard steps, all waiting', pg.input_value('#lgKindSel') == 'inbound' and step_names(pg)[:2] == ['Order placed', 'Confirmed by the supplier'] and len(step_names(pg)) == 7
            and pg.locator('#lgSteps select[id^=lgStepStatus]').evaluate_all('els => els.every(e => e.value === "pending")'))
    pg.click('#btnSave'); toast_text(pg, 'Enter a name for the shipment')
    r.check('a shipment without a name is refused', pg.evaluate('location.hash') == '#logistics/new')
    pg.fill('#lgTitle', 'MDF boards from Al Nour'); pg.select_option('#lgSupplier', label='Al Nour Boards'); pg.fill('#lgRef', 'PO-7741'); pg.fill('#lgCarrier', 'Abu Ali Transport')
    pg.fill('#lgTracking', 'TRK-889900'); pg.fill('#lgFrom', '10th of Ramadan'); pg.fill('#lgTo', 'Factory'); pg.fill('#lgEta', day(5)); pg.fill('#lgCost', '-4'); pg.click('#btnSave'); toast_text(pg, 'cost cannot be negative')
    pg.fill('#lgCost', '1500')
    # materials: two linked to the inventory + one that is not in it
    pg.click('#btnAddLine'); pg.select_option('#lgLineItem0', 'MAT-0001'); pg.fill('#lgLineQty0', '60')
    pg.click('#btnAddLine'); pg.select_option('#lgLineItem1', 'MAT-0002'); pg.fill('#lgLineQty1', '100')
    pg.click('#btnAddLine'); pg.fill('#lgLineName2', 'Wooden pallets'); pg.fill('#lgLineQty2', '2')
    r.check('picking an inventory material fills its name and unit; an "other" line keeps a typed name', pg.locator('#lgLines .lgline').nth(0).inner_text().count('MDF 18') >= 1 and 'sheet' in pg.locator('#lgLines .lgline').nth(0).inner_text() and pg.locator('#lgLineName2').count() == 1)
    save(pg)
    lg1 = pg.evaluate('location.hash').split('/')[-1]
    r.check('first shipment is LG-0001 and the file is sealed (no title, supplier, carrier or tracking number in the clear)', lg1 == 'LG-0001' and LG in mock.files and set(json.loads(mock.text(LG))) == {'v', 'iv', 'ct'}
            and not [s for s in ('MDF', 'Nour', 'Abu Ali', 'TRK-', 'PO-7741') if s in mock.text(LG)])
    r.check('the first commit is "Add logistics"', [c for c in mock.commits if c[1] == LG][0][2].startswith('Add '), str([c for c in mock.commits if c[1] == LG][:1]))

    # ---- edit the steps: add, rename, reorder, remove
    pg.click('#btnAddStep'); pg.fill('#lgStepName7', 'Customs clearance'); 
    r.check('add a step: it is added at the end and focused', len(step_names(pg)) == 8 and step_names(pg)[-1] == 'Customs clearance')
    for _ in range(4): pg.locator('#lgSteps .lgstep').nth(7 - _).locator('button:has-text("Up")').click()
    r.check('"Up" moves a step one place', step_names(pg)[3] == 'Customs clearance' and step_names(pg)[4] == 'In transit' and step_names(pg)[2] == 'Dispatched by the supplier', str(step_names(pg)))
    r.check('the first step has no "Up" and the last no "Down"', pg.locator('#lgSteps .lgstep').nth(0).locator('button:has-text("Up")').is_disabled() and pg.locator('#lgSteps .lgstep').nth(7).locator('button:has-text("Down")').is_disabled())
    pg.fill('#lgStepName3', 'Customs clearance (port)'); pg.fill('#lgStepNote3', 'Agent: Mr. Samir'); pg.fill('#lgStepDue3', day(2))
    pg.locator('#lgSteps .lgstep').nth(7).locator('button:has-text("Remove")').click()
    r.check('"Remove" deletes a step', len(step_names(pg)) == 7 and 'Stored in inventory' not in step_names(pg))
    pg.select_option('#lgStepStatus0', 'done'); pg.select_option('#lgStepStatus1', 'in_progress')
    r.check('marking a step done stamps today, and the live summary shows 1 of 7 done', 'Done on' in pg.locator('#lgSteps .lgstep').nth(0).inner_text() and '1 of 7 steps done' in pg.inner_text('#lgProgressText'), pg.inner_text('#lgProgressText'))
    save(pg)
    pg.reload(); pg.wait_for_selector('#lockPw'); unlock(pg, PW1); pg.wait_for_selector('#lgTitle', timeout=30000)
    r.check('after reloading and unlocking, the edited steps (order, name, note, date, status) are all there', step_names(pg)[3] == 'Customs clearance (port)' and pg.input_value('#lgStepNote3') == 'Agent: Mr. Samir' and pg.input_value('#lgStepDue3') == day(2)
            and pg.input_value('#lgStepStatus0') == 'done' and pg.input_value('#lgStepStatus1') == 'in_progress' and len(step_names(pg)) == 7, str(step_names(pg)))

    # ---- the list: progress, current step, one-tap "step done"
    pg.click('#adminNav a[data-route=logistics]'); pg.wait_for_selector('.lg-item')
    c = lg_card(pg, 'MDF boards')
    t0 = c.inner_text()
    r.check('the card shows type, state, supplier, route, progress, the current step, the arrival date, carrier and tracking number',
            all(x in t0 for x in ('From a supplier', 'On the way', 'Al Nour Boards', '10th of Ramadan', 'Factory', '1 of 7 steps done', 'Confirmed by the supplier', 'Abu Ali Transport', 'TRK-889900', '3 materials')), t0)
    c.locator('[data-act=done]').click(); toast_text(pg, 'Step completed')
    pg.wait_for_function("() => /2 of 7/.test(document.querySelector('.lg-item').textContent)")
    t1 = lg_card(pg, 'MDF boards').inner_text()
    r.check('"Done" completes the current step and the next one becomes the current one', '2 of 7 steps done' in t1 and t1.split('steps done')[1].lstrip(' ·').startswith('Dispatched by the supplier'), t1)
    st = pg.evaluate("() => opsFind('logistics', 'LG-0001').steps.map((s) => s.status)")
    r.check('step statuses are done, done, in progress, then waiting', st[:3] == ['done', 'done', 'in_progress'] and set(st[3:]) == {'pending'}, str(st))

    # ---- the inventory knows what is on order
    pg.click('#adminNav a[data-route=inventory]'); pg.wait_for_selector('.inv-item')
    pg.fill('#invSearch', 'MDF'); r.check('the inventory shows the 60 sheets as "on order" from this open shipment (the On order column of the table)', pg.locator('#invList tr.inv-item .c-ord').first.inner_text().strip().startswith('60'), pg.inner_text('#invList')[:300]); pg.fill('#invSearch', '')

    # ---- late and blocked
    pg.click('#adminNav a[data-route=logistics]'); pg.wait_for_selector('.lg-item')
    lg_card(pg, 'MDF boards').locator('a:has-text("Edit")').click(); pg.wait_for_selector('#lgEta')
    pg.fill('#lgEta', day(-3)); save(pg)
    pg.click('#adminNav a[data-route=logistics]'); pg.wait_for_selector('.lg-item')
    r.check('an arrival date in the past makes the shipment Late: badge on the card and in the summary', lg_card(pg, 'MDF boards').locator('.badge.late').count() >= 1 and pg.locator('#lgScreen .kpis').inner_text().replace('\n', ' ').count('Late') >= 1)
    pg.select_option('#lgShow', 'late'); r.check('the "Late" filter shows it', pg.locator('.lg-item').count() == 1); pg.select_option('#lgShow', 'active')
    r.check('the menu item shows how many shipments need attention', pg.locator('#adminNav a[data-route=logistics] .navbadge').inner_text().strip().endswith('1'), pg.locator('#adminNav a[data-route=logistics]').inner_text())
    lg_card(pg, 'MDF boards').locator('a:has-text("Edit")').click(); pg.wait_for_selector('#lgEta')
    pg.select_option('#lgStepStatus2', 'blocked'); pg.fill('#lgStepNote2', 'Supplier is waiting for the advance payment')
    r.check('the live summary shows the shipment as Blocked', 'Blocked' in pg.inner_text('#lgProgressText'), pg.inner_text('#lgProgressText')); save(pg)
    pg.click('#adminNav a[data-route=logistics]'); pg.wait_for_selector('.lg-item')
    pg.select_option('#lgShow', 'blocked'); r.check('the "Blocked" filter shows it', pg.locator('.lg-item').count() == 1 and lg_card(pg, 'MDF boards').get_attribute('data-state') == 'blocked'); pg.select_option('#lgShow', 'active')
    r.check('a blocked shipment can still be moved on with "Done" for its current step', lg_card(pg, 'MDF boards').locator('[data-act=done]').count() == 1)
    lg_card(pg, 'MDF boards').locator('a:has-text("Edit")').click(); pg.wait_for_selector('#lgEta')
    pg.select_option('#lgStepStatus2', 'in_progress'); pg.fill('#lgEta', day(4)); save(pg)

    # ---- finishing every step makes it ready to receive into the inventory
    pg.click('#adminNav a[data-route=logistics]'); pg.wait_for_selector('.lg-item')
    for i in range(5):
        lg_card(pg, 'MDF boards').locator('[data-act=done]').click()
        pg.wait_for_function(f"() => opsFind('logistics', 'LG-0001').steps.filter((s) => s.status === 'done').length === {3 + i}")
        pg.wait_for_timeout(250)
    r.check('a completed shipment leaves the active list', lg_card(pg, 'MDF boards').count() == 0)
    pg.select_option('#lgShow', 'completed'); pg.wait_for_selector('.lg-item')
    c = lg_card(pg, 'MDF boards'); t2 = c.inner_text()
    r.check('it shows under Completed with 7 of 7 steps, no "Done" button, and suggests receiving into the inventory', '7 of 7' in t2 and 'Completed' in t2 and c.locator('[data-act=done]').count() == 0 and 'Ready to receive into inventory' in t2, t2)
    q_before = pg.evaluate("() => [opsFind('inventory', 'MAT-0001').qty, opsFind('inventory', 'MAT-0002').qty]")
    lg_card(pg, 'MDF boards').locator('a.sugg').click(); pg.wait_for_selector('#btnLgReceive')
    dlg['accept'] = False; pg.click('#btnLgReceive'); pg.wait_for_timeout(300)
    r.check('cancelling the confirmation changes nothing', pg.evaluate("() => [opsFind('inventory', 'MAT-0001').qty, opsFind('inventory', 'MAT-0002').qty]") == q_before and dialogs[-1].startswith('Add 2 material'), str(dialogs[-2:]))
    dlg['accept'] = True; pg.click('#btnLgReceive'); toast_text(pg, '2 material(s) added'); dlg['accept'] = False
    q_after = pg.evaluate("() => [opsFind('inventory', 'MAT-0001').qty, opsFind('inventory', 'MAT-0002').qty]")
    r.check('receiving adds 60 sheets and 100 hinges to the stock (the pallets are not in the inventory so they are skipped)', q_after == [q_before[0] + 60, q_before[1] + 100], f'{q_before} -> {q_after}')
    r.check('the form now says it was received and the button is gone', pg.locator('#lgReceived').count() == 1 and pg.locator('#btnLgReceive').count() == 0)
    mv = pg.evaluate("() => opsFind('inventory', 'MAT-0001').moves[0]")
    r.check('the stock movement carries a note and the shipment number (so it can never be added twice)', mv['type'] == 'in' and mv['delta'] == 60 and mv['ref'] == 'LG-0001' and 'LG-0001' in mv['note'], str(mv))
    # asking again, even by force, does not add the stock a second time
    again = pg.evaluate("async () => { await receiveShipment('LG-0001'); return [opsFind('inventory', 'MAT-0001').qty, opsFind('inventory', 'MAT-0002').qty]; }")
    r.check('receiving the same shipment again adds nothing (idempotent)', again == q_after, str(again))
    pg.click('#adminNav a[data-route=inventory]'); pg.wait_for_selector('.inv-item'); pg.fill('#invSearch', 'MDF')
    r.check('once received, the "on order" figure is gone (the cell shows a dash)', pg.locator('#invList tr.inv-item .c-ord').first.inner_text().strip() == '—'); pg.fill('#invSearch', '')

    # ---- an outgoing shipment to a client project; changing the type swaps the untouched standard steps
    new_ship(pg)
    pg.select_option('#lgKindSel', 'outbound')
    r.check('switching to "To a client" replaces the untouched steps with the 5 delivery steps and shows client and project', step_names(pg)[0] == 'Items packed' and len(step_names(pg)) == 5 and pg.locator('#lgClient').count() == 1 and pg.locator('#lgSupplier').count() == 0)
    copts = pg.locator('#lgClient option').all_inner_texts(); r.check('the client list has the saved client', any(S.cid in o for o in copts), str(copts))
    pg.fill('#lgTitle', 'Kitchen delivery'); pg.select_option('#lgClient', S.cid)
    popts = pg.locator('#lgProject option').all_inner_texts(); r.check('choosing a client lists that client\'s projects', len(popts) >= 2 and any('kitchen' in o.lower() or 'KIT' in o for o in popts), str(popts))
    pg.select_option('#lgProject', index=1); pg.fill('#lgTo', 'Client site - Maadi'); pg.fill('#lgEta', day(12)); save(pg)
    lg2 = pg.evaluate('location.hash').split('/')[-1]
    r.check('outgoing shipment saved as LG-0002', lg2 == 'LG-0002')
    pg.click('#adminNav a[data-route=logistics]'); pg.wait_for_selector('#lgShow'); pg.select_option('#lgShow', 'active'); pg.wait_for_selector('.lg-item')
    c2 = lg_card(pg, 'Kitchen delivery').inner_text()
    r.check('the card shows the client and project, and it is "Planned" (nothing started)', 'To a client' in c2 and 'Planned' in c2 and 'Modern white kitchen' in c2 or S.cid in c2 or 'Client site - Maadi' in c2, c2)
    # a changed list of steps is kept when the type changes
    new_ship(pg); pg.fill('#lgStepName0', 'My own first step'); pg.select_option('#lgKindSel', 'transfer')
    r.check('a hand-edited list of steps is NOT replaced when the type changes', step_names(pg)[0] == 'My own first step' and len(step_names(pg)) == 7, str(step_names(pg)))
    pg.click('#btnAddTpl'); r.check('"Add standard steps" appends the 3 steps of the chosen type', len(step_names(pg)) == 10 and step_names(pg)[-1] == 'Received')

    # ---- unsaved changes
    pg.fill('#lgTitle', 'Draft')
    pg.evaluate("location.hash = '#dashboard'"); pg.wait_for_timeout(300)
    r.check('leaving a form with unsaved changes asks first and stays on the form when you cancel', dialogs and 'unsaved' in dialogs[-1].lower() and pg.evaluate('location.hash') == '#logistics/new', str(dialogs[-1:]))
    dlg['accept'] = True; pg.click('#adminNav a[data-route=logistics]'); pg.wait_for_selector('#lgScreen'); dlg['accept'] = False
    r.check('accepting leaves without saving: no third shipment', pg.locator('.lg-item').count() + 0 >= 1 and pg.evaluate("() => opsList('logistics').length") == 2)

    # ---- search and filters
    pg.select_option('#lgShow', 'all'); r.check('"All shipments" lists both', pg.locator('.lg-item').count() == 2)
    pg.fill('#lgSearch', 'trk-889'); r.check('search by tracking number', pg.locator('.lg-item').count() == 1 and 'MDF' in pg.inner_text('#lgList'))
    pg.fill('#lgSearch', 'maadi'); r.check('search by destination', pg.locator('.lg-item').count() == 1 and 'Kitchen' in pg.inner_text('#lgList'))
    pg.fill('#lgSearch', 'al nour'); r.check('search by supplier', pg.locator('.lg-item').count() == 1); pg.fill('#lgSearch', '')
    pg.select_option('#lgKind', 'outbound'); r.check('type filter', pg.locator('.lg-item').count() == 1); pg.select_option('#lgKind', '')

    # ---- a shipment added on another device is not lost when this device saves
    lg_card(pg, 'Kitchen delivery').locator('a:has-text("Edit")').click(); pg.wait_for_selector('#lgTitle')
    pg.fill('#lgCarrier', 'Own truck')
    pg2 = S.admin_ctx.new_page(); pg2.on('pageerror', lambda e: S.errors.append(('admin2', 'pageerror', str(e))))
    pg2.goto(ADMIN_URL + '#logistics'); pg2.wait_for_selector('#lockPw'); unlock(pg2, PW1); pg2.wait_for_selector('#btnNewLg')
    pg2.click('#btnNewLg'); pg2.wait_for_selector('#lgTitle'); pg2.fill('#lgTitle', 'Hardware pickup'); pg2.select_option('#lgKindSel', 'transfer'); save(pg2); pg2.close()
    save(pg)
    r.check('saving with a stale copy keeps the shipment added on the other device (3 in the file) and applies the edit', pg.evaluate("() => opsList('logistics').length") == 3 and pg.evaluate("() => opsFind('logistics', 'LG-0002').carrier") == 'Own truck'
            and pg.evaluate("() => opsList('logistics').some((s) => s.title === 'Hardware pickup')"))
    S.errors[:] = [e for e in S.errors if not (e[0] == 'admin' and '409' in e[2])]

    # ---- cancel, print links, delete
    pg.fill('#lgTitle', 'Kitchen delivery'); pg.check('#lgCancelled'); save(pg)
    r.check('the print links point to the shipment sheet and to the list report', pg.get_attribute('#btnShipPrint', 'href') == '#reports/shipment/LG-0002')
    pg.click('#adminNav a[data-route=logistics]'); pg.wait_for_selector('#lgScreen')
    r.check('the list report button points to #reports/logistics', pg.get_attribute('#btnLgPrint', 'href') == '#reports/logistics')
    pg.select_option('#lgShow', 'active'); r.check('a cancelled shipment leaves the active list', lg_card(pg, 'Kitchen delivery').count() == 0)
    pg.select_option('#lgShow', 'cancelled'); r.check('and shows under Cancelled with no "Done" button', lg_card(pg, 'Kitchen delivery').count() == 1 and lg_card(pg, 'Kitchen delivery').locator('[data-act=done]').count() == 0)
    lg_card(pg, 'Kitchen delivery').locator('a:has-text("Edit")').click(); pg.wait_for_selector('#btnOpsDelete')
    dlg['accept'] = True; pg.click('#btnOpsDelete'); pg.wait_for_selector('#lgScreen'); dlg['accept'] = False
    r.check('delete (after a confirmation) removes the shipment for good', pg.evaluate("() => opsList('logistics').length") == 2 and pg.evaluate("() => opsFind('logistics', 'LG-0002')") is None)
    pg.click('#btnNewLg'); pg.wait_for_selector('#lgTitle'); pg.fill('#lgTitle', 'Temp'); save(pg)
    r.check('ids are never reused (the next one is LG-0004, not LG-0002)', pg.evaluate('location.hash').endswith('LG-0004'), pg.evaluate('location.hash'))

    # ---- dashboard + Arabic
    pg.click('#adminNav a[data-route=dashboard]'); pg.wait_for_selector('#opsCard .kpis', timeout=20000)
    pg.click('#adminNav a[data-route=logistics]'); pg.wait_for_selector('#lgScreen'); pg.select_option('#lgShow', 'all')
    pg.click('#btnLang'); pg.wait_for_function("() => document.documentElement.lang === 'ar'")
    txt = pg.inner_text('#lgScreen')
    r.check('Arabic: heading, states and steps are translated and the page is RTL', 'الشحن واللوجستيات' in pg.inner_text('h1') and 'مكتملة' in txt and pg.evaluate('document.dir') == 'rtl', txt[:300])
    pg.locator('.lg-item').first.locator('a.btn').last.click(); pg.wait_for_selector('#lgTitle')
    pg.click('#btnLang'); pg.wait_for_function("() => document.documentElement.lang === 'en'")
    r.check('switching language inside the form keeps what is typed', pg.input_value('#lgTitle') != '')
    pg.evaluate("location.hash = '#dashboard'"); pg.wait_for_selector('#btnNewClient'); pg.remove_listener('dialog', on_dialog)
