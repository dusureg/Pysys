"""Visual pass: screenshots of the new admin screens and the rated client page (checked by eye, plus a few layout assertions)."""
from lib import *


def run(S):
    r, pg, cp = S.r, S.admin, S.client2
    pg.set_viewport_size({'width': 1280, 'height': 900})
    pg.click('#adminNav a[data-route=dashboard]'); pg.wait_for_selector('#btnNewClient'); pg.wait_for_timeout(300)
    pg.screenshot(path=f'{SP}/shot-f-dashboard.png', full_page=True)
    pg.click('#adminNav a[data-route=reports]'); pg.wait_for_selector('#rpPaper'); pg.wait_for_timeout(300)
    pg.screenshot(path=f'{SP}/shot-f-reports.png')
    pg.click('#adminNav a[data-route=settings]'); pg.wait_for_selector('#btnSaveSettings'); pg.wait_for_timeout(300)
    pg.screenshot(path=f'{SP}/shot-f-settings.png', full_page=True)
    pg.click('#adminNav a[data-route=dashboard]'); pg.wait_for_selector('#btnNewClient')
    pg.click('.item a:has-text("Edit")'); pg.wait_for_selector('#edName')
    pg.screenshot(path=f'{SP}/shot-f-details.png', full_page=True)
    pg.click('#tab-bom'); pg.wait_for_selector('#btnAddBom'); pg.wait_for_timeout(300)
    pg.screenshot(path=f'{SP}/shot-f-bom.png', full_page=True)
    r.check('BOM tab fits the screen without horizontal scroll', pg.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'))
    pg.set_viewport_size({'width': 390, 'height': 844}); pg.wait_for_timeout(300)
    pg.screenshot(path=f'{SP}/shot-f-bom-mobile.png', full_page=True)
    r.check('BOM tab on a phone: no horizontal scroll', pg.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), str(pg.evaluate('document.documentElement.scrollWidth')))
    pg.click('#tab-details'); pg.wait_for_timeout(200)
    pg.screenshot(path=f'{SP}/shot-f-details-mobile.png', full_page=True)
    pg.set_viewport_size({'width': 1280, 'height': 900})
    pg.click('#adminNav a[data-route=reports]'); pg.wait_for_selector('#rpPaper')
    pg.set_viewport_size({'width': 390, 'height': 844}); pg.wait_for_timeout(300)
    pg.screenshot(path=f'{SP}/shot-f-reports-mobile.png', full_page=True)
    r.check('reports page on a phone: no horizontal scroll of the page itself', pg.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), str(pg.evaluate('document.documentElement.scrollWidth')))
    pg.set_viewport_size({'width': 1280, 'height': 900})
    pg.click('#adminNav a[data-route=dashboard]'); pg.wait_for_selector('#btnNewClient')
