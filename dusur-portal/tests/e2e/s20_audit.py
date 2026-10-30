"""Quality audit: page speed (measured start-up with a throttled CPU, request count, transfer size, an estimate for a slow phone connection) and
user-friendliness (tap-target size, labels, contrast in both themes, keyboard focus, horizontal scroll, stray text, font size of inputs) on every screen
of both sites, in English and Arabic, dark and light, desktop and phone.  Results: tests/.out/audit.json (and docs/QUALITY.md says what they mean).

A rule that is ALWAYS wrong (an input with no name, a screen that scrolls sideways, the word "null" on screen, a target smaller than 24 px) fails the run.
Softer findings (a target under 40 px, contrast a little under 4.5:1 on a tiny decoration) are listed in the JSON so they can be improved, not failed."""
import gzip, json, os, statistics, zlib
from mockgh import BASE, ADMIN_URL, ROOT, OWNER, REPO
from lib import *

OUT = os.path.join(SP, 'audit.json')

AUDIT_JS = r"""(opts) => {
  const out = {};
  const add = (rule, e, info) => { (out[rule] = out[rule] || []).push(nameOf(e) + (info ? ' | ' + info : '')); };
  const nameOf = (e) => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : '') + ' "' + (e.textContent || e.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 22) + '"';
  const vis = (e) => { const r = e.getBoundingClientRect(), s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && !e.closest('[hidden],[inert]') && Number(s.opacity) > 0.05; };
  const parse = (c) => { if (!c) return null; let m = c.match(/^rgba?\(([^)]+)\)/); if (m) { const p = m[1].split(/[ ,\/]+/).filter(Boolean).map((x) => (x.endsWith('%') ? parseFloat(x) / 100 : Number(x))); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; }
    m = c.match(/^color\(srgb ([^)]+)\)/); if (m) { const p = m[1].split(/[ \/]+/).filter(Boolean).map(Number); return { r: p[0] * 255, g: p[1] * 255, b: p[2] * 255, a: p.length > 3 ? p[3] : 1 }; } return null; };
  const over = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
  const bgOf = (e) => { const layers = []; for (let n = e; n; n = n.parentElement) { const s = getComputedStyle(n); if (s.backgroundImage !== 'none' && n !== document.documentElement) return null; const b = parse(s.backgroundColor); if (b && b.a > 0) { layers.push(b); if (b.a >= 1) break; } }
    let c = { r: 255, g: 255, b: 255, a: 1 }; for (let i = layers.length - 1; i >= 0; i--) c = over(layers[i], c); return c; };
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

  // ---- page-level
  if (!document.title.trim()) out['page-title'] = ['empty <title>'];
  const vp = document.querySelector('meta[name=viewport]'); if (!vp || !/width=device-width/.test(vp.content) || /user-scalable=no|maximum-scale=1(\.0)?(,|$)/.test(vp.content)) out['viewport'] = [vp ? vp.content : 'missing'];
  if (!document.documentElement.lang || !document.documentElement.dir) out['lang-dir'] = [document.documentElement.lang + '/' + document.documentElement.dir];
  const h1 = [...document.querySelectorAll('h1')].filter(vis); if (h1.length !== 1) out['h1-count'] = [String(h1.length)];
  const ids = {}; document.querySelectorAll('[id]').forEach((e) => { ids[e.id] = (ids[e.id] || 0) + 1; }); const dups = Object.keys(ids).filter((k) => ids[k] > 1); if (dups.length) out['dup-id'] = dups;
  if (document.documentElement.scrollWidth > innerWidth + 1) {
    const wide = [...document.body.querySelectorAll('*')].filter((e) => vis(e) && e.getBoundingClientRect().right > innerWidth + 1 && !e.closest('nav, .tabs, [style*="overflow"]')).slice(0, 4).map((e) => nameOf(e) + ' right=' + Math.round(e.getBoundingClientRect().right));
    out['h-scroll'] = [document.documentElement.scrollWidth + ' > ' + innerWidth + ' | ' + wide.join('; ')];
  }
  const stray = (document.body.innerText || '').match(/(^|[^\w])(null|undefined|NaN|\[object Object\])([^\w]|$)/); if (stray) out['stray-text'] = [stray[0].trim()];
  document.querySelectorAll('img:not([alt])').forEach((e) => add('img-alt', e, e.getAttribute('src') ? e.getAttribute('src').slice(0, 30) : ''));
  document.querySelectorAll('a[target=_blank]:not([rel~=noopener])').forEach((e) => add('noopener', e));
  document.querySelectorAll('input[type=password]:not([autocomplete])').forEach((e) => add('autocomplete', e));

  // ---- names: every control must say what it is
  document.querySelectorAll('input:not([type=hidden]), select, textarea').forEach((e) => {
    if (!vis(e) && e.type !== 'checkbox') return;                                  // a hidden file input is opened by its button
    const named = e.getAttribute('aria-label') || e.getAttribute('aria-labelledby') || (e.labels && e.labels.length) || e.title;
    if (!named) add(e.getAttribute('placeholder') ? 'no-label-placeholder-only' : 'no-label', e, e.getAttribute('placeholder') || '');
  });
  document.querySelectorAll('button, a[href], [role=button], [role=tab]').forEach((e) => {
    if (!vis(e)) return; const n = (e.textContent || '').trim() || e.getAttribute('aria-label') || e.title || (e.querySelector('img[alt]') || {}).alt;
    if (!n) add('no-name', e);
  });

  // ---- tap targets (phone): buttons, links, fields, tabs, checkbox rows
  if (opts.phone) {
    document.querySelectorAll('button, a[href], select, textarea, input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]), [role=tab], summary, label.check').forEach((e) => {
      if (!vis(e)) return; const s = getComputedStyle(e);
      if (e.tagName === 'A' && s.display === 'inline' && e.closest('p, li, .hint, .small, .muted, .msg')) return;        // a link inside a sentence is exempt
      const r = e.getBoundingClientRect(), m = Math.min(r.width, r.height);
      if (m < 24) add('tap-under-24', e, Math.round(r.width) + 'x' + Math.round(r.height)); else if (m < 40) add('tap-under-40', e, Math.round(r.width) + 'x' + Math.round(r.height));
    });
    document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]):not([type=range]):not([type=color]), select, textarea').forEach((e) => {
      if (vis(e) && parseFloat(getComputedStyle(e).fontSize) < 16) add('input-font-under-16', e, getComputedStyle(e).fontSize);
    });
  }

  // ---- contrast of text (WCAG AA: 4.5, large text 3)
  let n = 0;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  for (let t = walker.nextNode(); t && n < 900; t = walker.nextNode()) {
    const e = t.parentElement; if (!e || seen.has(e) || !t.nodeValue.trim() || !vis(e) || e.closest('script,style,svg,[disabled],[aria-disabled=true],option')) continue; seen.add(e); n++;
    const s = getComputedStyle(e), bg = bgOf(e), fg = parse(s.color); if (!bg || !fg) continue;
    const col = over(fg, bg), px = parseFloat(s.fontSize), large = px >= 24 || (px >= 18.66 && Number(s.fontWeight) >= 700), need = large ? 3 : 4.5, rr = ratio(col, bg);
    if (rr < need) add(rr < need - 1.2 ? 'contrast-low' : 'contrast-near', e, rr.toFixed(2) + ' < ' + need);
  }
  return out;
}"""

FOCUS_JS = r"""() => { const e = document.activeElement; if (!e || e === document.body || !e.matches(':focus')) return null; const s = getComputedStyle(e);   // (not :focus = the focus is inside a native control, e.g. the calendar button of a date field, which draws its own ring)
  const ring = (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) || (s.boxShadow && s.boxShadow !== 'none');
  return { ring: !!ring, name: e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + ' "' + ((e.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 20)) + '" outline=' + s.outlineStyle + ' ' + s.outlineWidth + ' shadow=' + String(s.boxShadow).slice(0, 30) + ' fv=' + e.matches(':focus-visible') }; }"""

PERF_INIT = """window.__perf = { lcp: 0, cls: 0, tbt: 0, tasks: 0 };
try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__perf.lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true }); } catch (e) {}
try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__perf.cls += e.value; }).observe({ type: 'layout-shift', buffered: true }); } catch (e) {}
try { new PerformanceObserver((l) => { for (const e of l.getEntries()) { window.__perf.tasks++; window.__perf.tbt += Math.max(0, e.duration - 50); } }).observe({ type: 'longtask', buffered: true }); } catch (e) {}"""

# the rules a screen must never break (the softer ones are listed in the JSON only); s28_audit_new uses the same list for the screens added in v4.5
HARD = ['no-label', 'no-name', 'h-scroll', 'stray-text', 'tap-under-24', 'input-font-under-16', 'dup-id', 'page-title', 'viewport', 'lang-dir', 'img-alt', 'noopener', 'autocomplete', 'focus-ring-missing', 'h1-count', 'contrast-low', 'contrast-near', 'tap-under-40']
findings, perf = {}, {}


def record(key, res):
    for rule, items in res.items():
        findings.setdefault(rule, {}).setdefault(key, []).extend(items)


def file_size(url):
    """(raw, gzip) bytes of one of this site's own files, as GitHub Pages would send it."""
    rel = url.replace(BASE, '').split('?')[0].split('#')[0] or 'index.html'
    if rel.endswith('/'):
        rel += 'index.html'
    p = os.path.join(ROOT, rel)
    if not os.path.isfile(p):
        return 0, 0
    b = open(p, 'rb').read()
    return len(b), len(gzip.compress(b, 6)) if rel.rsplit('.', 1)[-1] in ('html', 'js', 'css', 'json', 'svg') else len(b)


def measure(S, label, url, ready, cpu=4, runs=3, storage=None):
    rows = []
    for i in range(runs):
        kw = {'storage_state': storage} if storage else {}
        ctx = S.browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, **kw)
        ctx.route('**/*', S.mock.handler(f'perf-{label}-{i}')); ctx.add_init_script(PERF_INIT)
        pg = ctx.new_page(); pg.on('pageerror', lambda e: S.errors.append((label, 'pageerror', str(e))))
        cdp = ctx.new_cdp_session(pg); cdp.send('Emulation.setCPUThrottlingRate', {'rate': cpu})
        pg.goto(url, wait_until='commit'); pg.wait_for_selector(ready, timeout=60000)
        t_ready = pg.evaluate('performance.now()'); pg.wait_for_timeout(1200)
        d = pg.evaluate("""() => { const n = performance.getEntriesByType('navigation')[0], f = performance.getEntriesByName('first-contentful-paint')[0], res = performance.getEntriesByType('resource');
          return { dcl: n.domContentLoadedEventEnd, fcp: f ? f.startTime : 0, lcp: window.__perf.lcp, cls: window.__perf.cls, tbt: window.__perf.tbt, tasks: window.__perf.tasks,
                   water: res.map((x) => [x.name, Math.round(x.startTime), Math.round(x.responseEnd)]) }; }""")
        d['ready'] = t_ready; d['reqs'] = [x[2] for x in S.mock.reqlog if x[0] == f'perf-{label}-{i}']
        rows.append(d); ctx.close()
    med = lambda k: round(statistics.median(x[k] for x in rows))
    own = [u for u in rows[0]['reqs'] if u.startswith(BASE)]
    sizes = [file_size(u) for u in own]
    ext = [u for u in rows[0]['reqs'] if not u.startswith(BASE)]
    res = {'url': url, 'cpu_throttle': cpu, 'runs': runs, 'fcp_ms': med('fcp'), 'lcp_ms': med('lcp'), 'ready_ms': med('ready'), 'dcl_ms': med('dcl'), 'tbt_ms': med('tbt'), 'cls': round(statistics.median(x['cls'] for x in rows), 3),
           'own_requests': len(own), 'own_raw_kb': round(sum(s[0] for s in sizes) / 1024, 1), 'own_gzip_kb': round(sum(s[1] for s in sizes) / 1024, 1), 'external_requests': sorted({u.split('?')[0].split('/')[2] for u in ext}), 'waterfall': rows[0]['water']}
    perf[label] = res
    return res


def slow_phone_estimate(res, rtt=0.15, mbps=1.6, hosts=2):
    """A rough model, not a measurement: first visit over 'slow 4G' (150 ms round trip, 1.6 Mbit/s). Connection set-up to the site 3 round trips (DNS, TCP, TLS),
    the page 1, the scripts and styles together 1 (they are requested in parallel over HTTP/2) plus the bytes; every other host costs 4 round trips for its first file."""
    bw = mbps * 1e6 / 8
    return round(3 * rtt + rtt + res['own_gzip_kb'] * 1024 / bw + rtt + hosts * 4 * rtt, 1)


def walk_client(S, pg, key, phone, stages):
    """Audit the three states of the client site: search page, a found client (key form), the opened portal."""
    pg.goto(BASE); pg.wait_for_selector('#clQ'); pg.wait_for_timeout(300)
    record(key + '|search', pg.evaluate(AUDIT_JS, {'phone': phone}))
    pg.fill('#clQ', S.cid); pg.wait_for_selector('.result.found #btnOpen', timeout=20000); pg.wait_for_timeout(200)
    record(key + '|found', pg.evaluate(AUDIT_JS, {'phone': phone}))
    if 'portal' in stages:
        pg.fill('#clKey', S.secret); pg.click('#btnOpen'); pg.wait_for_selector('#tapeBig', timeout=40000); pg.wait_for_timeout(400)
        record(key + '|portal', pg.evaluate(AUDIT_JS, {'phone': phone}))


def set_look(pg, lang, theme):
    if pg.evaluate('document.documentElement.lang') != lang:
        pg.click('#btnLang'); pg.wait_for_function(f"() => document.documentElement.lang === '{lang}'")
    if pg.evaluate("document.documentElement.getAttribute('data-theme')") != theme:
        pg.click('#btnTheme'); pg.wait_for_function(f"() => document.documentElement.getAttribute('data-theme') === '{theme}'")


def run(S):
    r, mock, cid = S.r, S.mock, S.cid
    mock.fonts = 'ok'
    # =============================================================== speed
    c = measure(S, 'client-search', BASE, '#clQ')
    a = measure(S, 'admin-lock', ADMIN_URL, '#lockPw', storage=S.admin_ctx.storage_state())
    for lab, x in (('client site', c), ('admin site (lock screen)', a)):
        print(f'  {lab}: {x["own_requests"]} own requests, {x["own_raw_kb"]} KB raw / {x["own_gzip_kb"]} KB gzip; '
              f'4x slower CPU: first paint {x["fcp_ms"]} ms, usable {x["ready_ms"]} ms, blocking time {x["tbt_ms"]} ms, layout shift {x["cls"]}; slow-4G first visit ≈ {slow_phone_estimate(x)} s (model)')
    r.check('client site: first paint within 1.5 s and usable within 2.5 s on a phone-class CPU (4x throttle, local files)', c['fcp_ms'] <= 1500 and c['ready_ms'] <= 2500, str({k: c[k] for k in ('fcp_ms', 'ready_ms')}))
    wf = {x[0].split('?')[0].rsplit('/', 1)[-1]: x for x in c['waterfall']}; nbrand = len([x for x in mock.reqlog if x[0] == 'perf-client-search-0' and 'brand.json' in x[2]])
    r.check('client site: the company profile (brand.json) is requested ONCE, and while the scripts are still downloading (not after they ran)', nbrand == 1 and 'brand.json' in wf and wf['brand.json'][1] < wf['main.js'][2], f"{nbrand} brand.json at {wf.get('brand.json')} vs main.js {wf.get('main.js')}")
    r.check('admin lock screen: usable within 3 s on a phone-class CPU', a['ready_ms'] <= 3000, str(a['ready_ms']))
    r.check('no layout shift while loading (CLS <= 0.05) on both sites', c['cls'] <= 0.05 and a['cls'] <= 0.05, f"{c['cls']} {a['cls']}")
    r.check('client site: total blocking time under 300 ms', c['tbt_ms'] <= 300, str(c['tbt_ms']))
    r.check('client site first visit: at most 25 own files and 120 KB gzip (pages, scripts, styles)', c['own_requests'] <= 25 and c['own_gzip_kb'] <= 120, f"{c['own_requests']} files {c['own_gzip_kb']} KB")
    r.check('admin site first visit: at most 96 own files and 330 KB gzip', a['own_requests'] <= 96 and a['own_gzip_kb'] <= 330, f"{a['own_requests']} files {a['own_gzip_kb']} KB")
    r.check('the only other hosts contacted on first load are the font and library CDNs and GitHub raw (nothing else, no analytics)', set(c['external_requests'] + a['external_requests']) <= {'fonts.googleapis.com', 'fonts.gstatic.com', 'cdnjs.cloudflare.com', 'raw.githubusercontent.com', 'api.github.com'}, str(c['external_requests'] + a['external_requests']))

    # the portal itself: time from pressing "Open" to the project on screen (key stretching included), phone-class CPU
    ctx = S.browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True); ctx.route('**/*', mock.handler('perf-portal'))
    pg = ctx.new_page(); cdp = ctx.new_cdp_session(pg); cdp.send('Emulation.setCPUThrottlingRate', {'rate': 4})
    pg.goto(f'{BASE}#client/{cid}'); pg.wait_for_selector('#clKey'); pg.fill('#clKey', S.secret)
    t0 = pg.evaluate('performance.now()'); pg.click('#btnOpen'); pg.wait_for_selector('#tapeBig', timeout=60000); t1 = pg.evaluate('performance.now()')
    perf['portal-open'] = {'ms_from_click_to_project': round(t1 - t0), 'cpu_throttle': 4}
    print(f'  opening a private link on a phone-class CPU: {round(t1 - t0)} ms from pressing Open to the project on screen')
    r.check('opening a private portal (key stretching + download + decrypt) takes under 4 s on a phone-class CPU', t1 - t0 < 4000, str(round(t1 - t0)))
    # photo thumbnails far below the screen are not downloaded until they get close (12 photos 6000 px down the page)
    pg.evaluate("""([cid, secret, user, repo]) => { const box = document.createElement('div'); box.id = 'lazyBox'; box.innerHTML = '<div style="height:6000px"></div>'; document.body.append(box);
        const ctx = { cid, secret, where: { user, repo } };
        for (let i = 0; i < 12; i++) { const d = document.createElement('div'); d.style.cssText = 'width:200px;height:150px'; d.append(photoImg(ctx, { id: 'zz' + i, kind: 'file' }, 't')); box.append(d); } }""", [cid, S.secret, OWNER, REPO])
    pg.wait_for_timeout(900); asked = lambda: len({x[2] for x in mock.reqlog if x[0] == 'perf-portal' and '/zz' in x[2]})
    n0 = asked()
    pg.evaluate("document.querySelector('#lazyBox').lastElementChild.scrollIntoView()"); pg.wait_for_timeout(900); n1 = asked()
    pg.evaluate("document.querySelector('#lazyBox').firstElementChild.nextElementSibling.scrollIntoView()"); pg.wait_for_timeout(900); n2 = asked()
    r.check(f'photo thumbnails load lazily: none of 12 far-away photos requested at first ({n0}), only the nearby ones after scrolling to the end ({n1}), all once passed ({n2})', n0 == 0 and 1 <= n1 <= 10 and n2 == 12, f'{n0} {n1} {n2}')
    perf['lazy-photos'] = {'requested_at_start': n0, 'after_scroll_to_end': n1, 'after_scroll_through': n2}
    ctx.close()

    # =============================================================== usability: client site
    for key, vp, lang, theme in (('client|desktop|en|dark', (1280, 900), 'en', 'dark'), ('client|desktop|en|light', (1280, 900), 'en', 'light'),
                                 ('client|phone|en|dark', (360, 740), 'en', 'dark'), ('client|phone|ar|dark', (360, 740), 'ar', 'dark'), ('client|phone|ar|light', (360, 740), 'ar', 'light')):
        phone = vp[0] < 700
        ctx = S.browser.new_context(viewport={'width': vp[0], 'height': vp[1]}, is_mobile=phone, has_touch=phone); ctx.route('**/*', mock.handler('audit-client'))
        pg = ctx.new_page(); pg.on('pageerror', lambda e: S.errors.append(('audit-client', 'pageerror', str(e))))
        pg.add_init_script(f"try{{localStorage.setItem('dsp.lang','{lang}');localStorage.setItem('dsp.theme','{theme}')}}catch(e){{}}")
        walk_client(S, pg, key, phone, ('portal',) if (theme == 'dark' or key.endswith('en|light')) else ('portal',))
        if key == 'client|desktop|en|dark':                     # keyboard: every stop of the first tab presses shows where the focus is
            pg.goto(BASE); pg.wait_for_selector('#clQ'); bad = []
            for _ in range(10):
                pg.keyboard.press('Tab'); pg.wait_for_timeout(180); f = pg.evaluate(FOCUS_JS)
                if f and not f['ring']:
                    bad.append(f['name'])
            record(key + '|search', {'focus-ring-missing': bad} if bad else {})
        ctx.close()

    # =============================================================== usability: admin site (the unlocked page of the test)
    pg = S.admin
    # a few expenses so that Finance, the expense form and the Costs report have something to show (removed again after the audit)
    exp_ids = []
    for name, kind, cat, amount, when, rep_ in (('Workshop rent', 'indirect', 'rent', 4500, day(-20), 'monthly'), ('Edge banding', 'direct', 'materials', 1850, day(-12), 'none'), ('Electricity', 'indirect', 'utilities', 960, day(-6), 'monthly')):
        pg.evaluate("location.hash = '#expenses/new'"); pg.wait_for_selector('#expName')
        pg.fill('#expName', name); pg.select_option('#expKindSel', kind); pg.select_option('#expCatSel', cat); pg.fill('#expAmount', str(amount)); pg.fill('#expDate', when); pg.select_option('#expRepeatSel', rep_)
        save(pg); exp_ids.append(pg.evaluate('location.hash').split('/')[-1])
    pg.evaluate("location.hash = '#dashboard'"); pg.wait_for_selector('#btnNewClient')
    screens = [('dashboard', '#dashboard', '#btnNewClient'), ('progress', '#progress', '#pgList'), ('progress-project', f'#progress/{cid}/0', '#pgPct'), ('editor', f'#manage/{cid}', '#edName'),
               ('contract', f'#contract/{cid}/0', '#ctPaper'), ('reports', '#reports', '#rpPaper, .rp-page, h1'), ('settings', '#settings', '#btnSaveSettings'),
               # Supply chain, Inventory and Logistics (data created by s11 to s13) and their reports
               ('suppliers', '#suppliers', '.sup-item'), ('supplier-form', '#suppliers/SUP-001', '#supRelated'), ('supplier-new', '#suppliers/new', '#supName'),
               ('inventory', '#inventory', '.inv-item'), ('item-form', '#inventory/MAT-0001', '#invHistory'), ('item-new', '#inventory/new', '#invName'),
               ('logistics', '#logistics', '#lgScreen'), ('shipment-form', '#logistics/LG-0001', '#lgSteps'), ('shipment-new', '#logistics/new', '#lgTitle'),
               ('report-inventory', '#reports/inventory', '#rpPaper'), ('report-reorder', '#reports/reorder', '#rpPaper'), ('report-suppliers', '#reports/suppliers', '#rpPaper'),
               ('report-logistics', '#reports/logistics', '#rpPaper'), ('report-shipment', '#reports/shipment/LG-0001', '#rpPaper'), ('report-stockmoves', '#reports/stockmoves', '#rpPaper'),
               # v4.4: finance (direct, indirect and total operations cost), expenses, history, team and account, troubleshooter, the two new reports
               ('finance', '#finance', '#finScreen'), ('expense-new', '#expenses/new', '#expName'), ('expense-form', f'#expenses/{exp_ids[0]}', '#expAmount'),
               ('history', '#audit', '#audList, #audScreen'), ('team', '#team', '#rolesCard'), ('account', '#account', '#accountScreen'), ('doctor', '#doctor', '#docSummary:not([hidden])'),
               ('report-costs', '#reports/costs', '#rpPaper'), ('report-audit', '#reports/audit', '#rpPaper')]
    for key, vp, lang, theme in (('admin|desktop|en|dark', (1280, 900), 'en', 'dark'), ('admin|desktop|en|light', (1280, 900), 'en', 'light'),
                                 ('admin|phone|en|dark', (360, 740), 'en', 'dark'), ('admin|phone|ar|dark', (360, 740), 'ar', 'dark'), ('admin|phone|ar|light', (360, 740), 'ar', 'light')):
        pg.set_viewport_size({'width': vp[0], 'height': vp[1]}); set_look(pg, lang, theme); phone = vp[0] < 700
        for name, h, sel in screens:
            pg.evaluate(f'location.hash = "{h}"'); pg.wait_for_selector(sel, timeout=20000); pg.wait_for_timeout(350)
            record(f'{key}|{name}', pg.evaluate(AUDIT_JS, {'phone': phone}))
            if name == 'inventory':                               # the other of the two views (table / cards), then back to the default for this screen size
                pg.click('#invView-cards' if not phone else '#invView-table'); pg.wait_for_selector('.invcards' if not phone else '#invTable'); pg.wait_for_timeout(250)
                record(f'{key}|inventory-other-view', pg.evaluate(AUDIT_JS, {'phone': phone})); pg.evaluate("() => { invSel.view = ''; }"); pg.evaluate('location.hash = "#settings"'); pg.wait_for_selector('#btnSaveSettings')
                pg.evaluate('location.hash = "#inventory"'); pg.wait_for_selector('.inv-item', timeout=20000); pg.wait_for_timeout(250)
            if name == 'finance':                                 # every tab of the Finance screen
                for tid in pg.eval_on_selector_all('#finScreen .tabs [role=tab]', 'els => els.map((e) => e.id).filter(Boolean)'):
                    pg.click('#' + tid); pg.wait_for_timeout(250); record(f'{key}|finance-{tid}', pg.evaluate(AUDIT_JS, {'phone': phone}))
            if name == 'inventory':                               # the quick "use / receive / stock-take" box open
                pg.locator('.inv-item [data-mv=out]').first.click(); pg.wait_for_selector('#mvQty'); pg.wait_for_timeout(200); record(f'{key}|inventory-move', pg.evaluate(AUDIT_JS, {'phone': phone})); pg.click('#btnMvCancel')
            if name == 'editor':                                  # every tab of the client editor (stages, parts, payments, costs, BOM, photos...)
                for tid in pg.eval_on_selector_all('.tabs [role=tab]:not(.pill)', 'els => els.map((e) => e.id).filter(Boolean)'):
                    pg.click('#' + tid); pg.wait_for_timeout(250); record(f'{key}|editor-{tid}', pg.evaluate(AUDIT_JS, {'phone': phone}))
                pg.click('.tabs [role=tab]:not(.pill) >> nth=0')
            if key == 'admin|desktop|en|dark' and name in ('dashboard', 'progress-project', 'contract', 'settings'):
                pg.evaluate('document.activeElement && document.activeElement.blur()'); pg.evaluate('window.scrollTo(0, 0)'); bad = []
                for _ in range(12):
                    pg.keyboard.press('Tab'); pg.wait_for_timeout(180); f = pg.evaluate(FOCUS_JS)
                    if f and not f['ring']:
                        bad.append(f['name'])
                record(f'{key}|{name}', {'focus-ring-missing': bad} if bad else {})
    pg.set_viewport_size({'width': 1280, 'height': 900}); set_look(pg, 'en', 'dark')
    for eid in exp_ids:                                          # the expenses made for the audit are removed again
        for attempt in range(3):                                 # the screen of the one deleted before may still be settling: open this record again if the button is not there
            pg.evaluate('location.hash = "#finance"'); pg.wait_for_timeout(300)
            pg.evaluate(f'location.hash = "#expenses/{eid}"')
            try: pg.wait_for_selector('#btnOpsDelete', timeout=15000); break
            except Exception:
                if attempt == 2:
                    print('DEBUG s20 delete:', pg.evaluate('location.hash'), '|', pg.evaluate('() => document.body.innerText.slice(0, 400)').replace('\n', ' / '), '|', pg.evaluate('() => JSON.stringify(opsList("expenses").map((e) => e.id))'))
                    raise
        pg.once('dialog', lambda d: d.accept()); pg.click('#btnOpsDelete', timeout=15000); pg.wait_for_selector('.toast:has-text("deleted")', timeout=20000)
        pg.wait_for_function('() => location.hash === "#finance"', timeout=10000)
    pg.evaluate('location.hash = "#dashboard"'); pg.wait_for_selector('#btnNewClient')

    # =============================================================== verdict
    json.dump({'performance': perf, 'findings': findings}, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    for rule in HARD:
        places = findings.get(rule, {})
        r.check(f'audit [{rule}]: none on any screen ({sum(len(v) for v in places.values())} found)', not places, '; '.join(f'{k}: {v[:3]}' for k, v in list(places.items())[:4]))
    soft = {k: sum(len(v) for v in d.values()) for k, d in findings.items() if k not in HARD}
    print('  softer findings (listed in tests/.out/audit.json):', soft or 'none')
