"""4.6: videos and the picture viewer, admin and client.
Admin (photos tab of the project): a video file is sealed like a photo (<id>.v with a poster <id>.t) and listed with a play mark; video links (a direct file, YouTube) are told apart from
picture links; files that are too big, not videos or wrongly named are refused; removing a video deletes both files after the save.
Client page: the poster tiles, the viewer plays the decrypted video from memory with the percentage while it loads, a video on another site opens there, a failed download says so;
pictures zoom (buttons, keys, double click), the arrow keys and a swipe move between items (mirrored in Arabic), everything fits a phone and its buttons are big enough, and the video
leaves memory when the viewer is closed.
Needs the client of s01 - s03 (S.cid, S.secret) with its two photos."""
import json, re
from mockgh import BASE
from lib import *

MAKE_WEBM = """async () => {
  const c = document.createElement('canvas'); c.width = 160; c.height = 120; const g = c.getContext('2d');
  const st = c.captureStream(15), rec = new MediaRecorder(st, { mimeType: 'video/webm;codecs=vp8' });
  const chunks = []; rec.ondataavailable = (e) => chunks.push(e.data);
  const done = new Promise((r) => { rec.onstop = r; });
  rec.start(); let n = 0;
  await new Promise((res) => { const iv = setInterval(() => { g.fillStyle = 'hsl(' + (n * 20) + ',70%,50%)'; g.fillRect(0, 0, 160, 120); g.fillStyle = '#fff'; g.fillText('frame ' + n, 10, 60); if (++n > 24) { clearInterval(iv); res(); } }, 60); });
  rec.stop(); await done;
  const buf = new Uint8Array(await new Blob(chunks).arrayBuffer()); let s = '';
  for (let i = 0; i < buf.length; i += 8192) s += String.fromCharCode(...buf.subarray(i, i + 8192));
  return btoa(s);
}"""


def snapshot(S, pg):
    payload = json.loads(S.mock.text(f'data/clients/{S.cid}.json'))['payload']
    return json.loads(pg.evaluate(DECRYPT_JS, {'payload': payload, 'secret': S.secret, 'id': S.cid}))


def touch_swipe(pg, dx):
    """a one-finger swipe on the viewer's stage (dx < 0 = finger moves left)"""
    pg.evaluate("""(dx) => {
      const el = document.querySelector('dialog.lb .lb-stage'), mk = (x, y) => new Touch({ identifier: 1, target: el, clientX: x, clientY: y });
      el.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [mk(300, 200)], changedTouches: [mk(300, 200)] }));
      el.dispatchEvent(new TouchEvent('touchend', { bubbles: true, touches: [], changedTouches: [mk(300 + dx, 205)] }));
    }""", dx)


def counter(pg):
    return pg.inner_text('dialog.lb .lb-nav .muted').strip()


def run(S):
    import base64
    r, mock, pg, cid, secret = S.r, S.mock, S.admin, S.cid, S.secret
    pg.set_viewport_size({'width': 1280, 'height': 900})
    dialogs = []
    on_dialog = lambda d: (dialogs.append(d.message), d.accept())
    pg.on('dialog', on_dialog)
    webm = base64.b64decode(pg.evaluate(MAKE_WEBM))
    r.check('the test could record a real WebM clip in this browser', webm[:4] == b'\x1a\x45\xdf\xa3' and len(webm) > 2000, str(len(webm)))
    files_before = set(mock.paths(f'data/clients/{cid}/'))

    # ================= admin: a video file =================
    pg.evaluate(f"location.hash = '#manage/{cid}'"); pg.wait_for_selector('#tab-photos', timeout=30000); pg.click('#tab-photos')
    pg.wait_for_selector('#btnUploadVideo')
    n0 = pg.evaluate('() => ed.rec.projects[0].photos.length')
    r.check('the photos tab has an Add video button and says what is accepted (size limit stated)', pg.is_enabled('#btnUploadVideo') and '24 MB' in pg.inner_text('body'))
    pg.set_input_files('#vidInput', {'name': 'progress-week1.webm', 'mimeType': 'video/webm', 'buffer': webm})
    pg.wait_for_function(f'() => ed.rec.projects[0].photos.length === {n0 + 1}', timeout=60000)
    toast_text(pg, 'was uploaded', 60000)
    vid = pg.evaluate('() => JSON.parse(JSON.stringify(ed.rec.projects[0].photos.slice(-1)[0]))')
    r.check('the record names the video: kind, type and size, a date, an id', vid['kind'] == 'video' and vid['mime'] == 'video/webm' and vid['size'] == len(webm) and re.fullmatch(r'[0-9a-z]+', vid['id']) and vid['date'], str(vid))
    new = sorted(set(mock.paths(f'data/clients/{cid}/')) - files_before)
    r.check('two sealed files were stored: the poster (.t) and the video (.v)', new == sorted([f'data/clients/{cid}/{vid["id"]}.t', f'data/clients/{cid}/{vid["id"]}.v']), str(new))
    raw = mock.files[f'data/clients/{cid}/{vid["id"]}.v']['b']
    r.check('the video is sealed: no WebM header, a little larger than the clip (nonce and tag)', not raw.startswith(b'\x1a\x45\xdf\xa3') and len(webm) < len(raw) <= len(webm) + 64, f'{len(raw)} vs {len(webm)}')
    r.check('the client record was saved with it (the video is in the client snapshot)', any(p['id'] == vid['id'] and p['kind'] == 'video' for p in snapshot(S, pg)['projects'][0]['photos']))
    pg.wait_for_selector('.photos .vthumb[data-kind=video] .vplay', timeout=20000)
    r.check('the tile shows the poster with a play mark and says "Video file"', pg.locator('.photos .vthumb[data-kind=video] img').count() == 1 and 'Video file' in pg.inner_text('.photos'))

    # ================= admin: refused files =================
    pg.set_input_files('#vidInput', {'name': 'notes.txt', 'mimeType': 'text/plain', 'buffer': b'hello'})
    toast_text(pg, 'not a video this page can keep', 15000)
    pg.set_input_files('#vidInput', {'name': 'fake.mp4', 'mimeType': 'video/mp4', 'buffer': b'this is not a video, only text ' * 40})
    toast_text(pg, 'does not look like a video', 15000)
    pg.set_input_files('#vidInput', {'name': 'big.webm', 'mimeType': 'video/webm', 'buffer': b'\x1a\x45\xdf\xa3' + bytes(25 * 1024 * 1024)})
    toast_text(pg, 'is bigger than 24 MB', 30000)
    r.check('a text file, a file that only claims to be a video and a 25 MB clip are refused, nothing is added', pg.evaluate('() => ed.rec.projects[0].photos.length') == n0 + 1 and sorted(set(mock.paths(f'data/clients/{cid}/')) - files_before) == new)

    # ================= admin: links =================
    def add_link(u, cap):
        pg.fill('#phUrl', u); pg.fill('#phCap', cap); pg.click('#btnAddLink')
    add_link('https://example.com/clips/finishing.mp4', 'Finishing (direct file)')
    add_link('https://youtu.be/dQw4w9WgXcQ', 'Walk-through on YouTube')
    add_link('https://images.example.com/extra.jpg', 'A picture link')
    kinds = pg.evaluate('() => ed.rec.projects[0].photos.slice(-3).map((p) => p.kind)')
    r.check('a direct video file and a YouTube address become video links, a picture address stays a picture link', kinds == ['vlink', 'vlink', 'link'], str(kinds))
    pg.fill('#phUrl', 'http://insecure.example.com/a.mp4'); pg.click('#btnAddLink')
    r.check('an address that is not https is still refused', pg.evaluate('() => ed.rec.projects[0].photos.length') == n0 + 4 and pg.locator('.msg.bad').count() >= 1)
    save(pg)
    total = n0 + 4
    snap = snapshot(S, pg)['projects'][0]['photos']
    r.check('saved: the client snapshot lists the video, the two video links and the picture link', len(snap) == total and [p['kind'] for p in snap][-4:] == ['video', 'vlink', 'vlink', 'link'])

    # ================= client: the page =================
    ctx, cp = new_page(S, 'client-media')
    cp.route('https://example.com/**', lambda route: route.fulfill(status=200, content_type='video/webm', body=webm, headers={'access-control-allow-origin': '*'}))     # the "other site" that serves a direct video file
    cp.goto(f'{BASE}#client/{cid}'); cp.wait_for_selector('#clKey'); cp.fill('#clKey', secret); cp.click('#btnOpen'); cp.wait_for_selector('#tapeBig', timeout=30000)
    cp.locator('#photosCard').scroll_into_view_if_needed()
    cp.wait_for_selector('#photosCard .vthumb[data-kind=video] img[src^="blob:"]', timeout=30000)
    r.check('the client sees the video as a poster with a play mark, newest first', cp.locator('#photosCard .ph').count() == total and cp.locator('#photosCard .ph').first.locator('.vthumb').count() == 0 and cp.locator('#photosCard .vthumb[data-kind=video] .vplay').count() == 1)
    r.check('a video on another site is a card with a play mark and its caption', cp.locator('#photosCard .vph').count() == 2 and 'Walk-through on YouTube' in cp.inner_text('#photosCard'))
    r.check('the list needs no video download: only the poster is requested (nothing of the video is held in memory yet)', cp.evaluate("() => [...imgUrls.keys()].filter((k) => k.endsWith('.v')).length") == 0)

    # ---- play the sealed video
    cp.click('#photosCard .vthumb[data-kind=video]')
    cp.wait_for_selector('dialog.lb[open] video.lb-video', timeout=30000)
    cp.wait_for_function("() => { const v = document.querySelector('dialog.lb video'); return v && v.readyState >= 2 && v.videoWidth > 0; }", timeout=30000)
    info = cp.evaluate("() => { const v = document.querySelector('dialog.lb video'); return [v.src.slice(0, 5), v.controls, v.videoWidth, v.videoHeight, v.hasAttribute('playsinline')]; }")
    r.check('the viewer plays the decrypted video from memory (blob address, controls, inline on phones)', info[0] == 'blob:' and info[1] and info[2] == 160 and info[3] == 120 and info[4], str(info))
    r.check('a video shows no zoom buttons', cp.locator('#lbZoomIn').count() == 0 and cp.locator('#lbPrev').count() == 1 and counter(cp).endswith('/ ' + str(total)))
    cp.evaluate("() => document.querySelector('dialog.lb video').play().catch(() => {})")
    cp.wait_for_function("() => { const v = document.querySelector('dialog.lb video'); return v.currentTime > 0 || !v.paused; }", timeout=15000)
    r.check('it can be played', True)
    held = cp.evaluate("() => [...imgUrls.keys()].filter((k) => k.endsWith('.v')).length")
    r.check('one video is held in memory while the viewer shows it', held == 1)
    # ---- the other items (newest first: 1 picture link, 2 YouTube, 3 direct file, 4 the sealed video, then the older photos)
    r.check('the sealed video is the 4th item', counter(cp).startswith('4 '), counter(cp))
    cp.press('dialog.lb', 'ArrowLeft')
    cp.wait_for_selector('dialog.lb video.lb-video[src^="https://example.com/clips/finishing.mp4"]', timeout=15000)
    r.check('a direct video file plays in the page from its own address, and the sealed video left memory', counter(cp).startswith('3 ') and cp.evaluate("() => [...imgUrls.keys()].filter((k) => k.endsWith('.v')).length") == 0, counter(cp))
    cp.press('dialog.lb', 'ArrowLeft')
    cp.wait_for_selector('dialog.lb .vid-wait', timeout=15000)
    link = cp.locator('dialog.lb a:has-text("Open the video")')
    r.check('a video on another site says so and links there safely (new tab, noopener)', 'another website' in cp.inner_text('dialog.lb .lb-stage') and link.get_attribute('href') == 'https://youtu.be/dQw4w9WgXcQ' and link.get_attribute('target') == '_blank' and 'noopener' in link.get_attribute('rel'))
    cp.press('dialog.lb', 'ArrowLeft'); cp.wait_for_selector('dialog.lb a:has-text("Open original")', timeout=15000)
    r.check('a picture link opens its picture and offers the original address', counter(cp).startswith('1 '))
    cp.press('dialog.lb', 'ArrowLeft')
    cp.wait_for_function("() => document.querySelector('dialog.lb .lb-nav .muted').textContent.trim().startsWith('" + str(total) + " ')", timeout=10000)
    r.check('the arrow keys wrap around from the first item to the last', counter(cp).startswith(f'{total} '), counter(cp))
    cp.click('dialog.lb #lbNext'); cp.wait_for_function("() => document.querySelector('dialog.lb .lb-nav .muted').textContent.trim().startsWith('1 ')")
    # ---- swipe
    touch_swipe(cp, -150)
    cp.wait_for_function("() => document.querySelector('dialog.lb .lb-nav .muted').textContent.trim().startsWith('2 ')", timeout=10000)
    touch_swipe(cp, 150)
    cp.wait_for_function("() => document.querySelector('dialog.lb .lb-nav .muted').textContent.trim().startsWith('1 ')", timeout=10000)
    r.check('a swipe to the left goes to the next item, to the right to the previous one', counter(cp).startswith('1 '))
    touch_swipe(cp, 20)
    r.check('a short movement is not a swipe', counter(cp).startswith('1 '))
    cp.click('#lbClose'); cp.wait_for_selector('dialog.lb', state='detached')
    r.check('closing the viewer leaves nothing of the video in memory', cp.evaluate("() => [...imgUrls.keys()].filter((k) => k.endsWith('.v')).length") == 0)

    # ---- zoom on a picture (the uploaded photo, third from the end)
    photo_idx = cp.evaluate("() => [...document.querySelectorAll('#photosCard .ph')].findIndex((e) => e.querySelector('img[src^=\"blob:\"]') && !e.querySelector('.vthumb'))")
    cp.click(f'#photosCard .ph >> nth={photo_idx} >> .imgbtn')
    cp.wait_for_selector('dialog.lb[open] .lb-stage img[src^="blob:"]', timeout=20000)
    r.check('a picture has zoom buttons, at 100 % the "smaller" and "fit" buttons are off', cp.locator('#lbZoomIn').is_enabled() and cp.locator('#lbZoomOut').is_disabled() and cp.locator('#lbZoomReset').is_disabled() and '100' in cp.inner_text('#lbZoomLevel'))
    w0 = cp.evaluate("() => document.querySelector('dialog.lb .lb-stage img').getBoundingClientRect().width")
    cp.click('#lbZoomIn')
    w1 = cp.evaluate("() => document.querySelector('dialog.lb .lb-stage img').getBoundingClientRect().width")
    r.check('Zoom in makes the picture 150 % wide and shows the level', abs(w1 / w0 - 1.5) < 0.12 and '150' in cp.inner_text('#lbZoomLevel') and cp.locator('#lbZoomOut').is_enabled() and cp.locator('#lbZoomReset').is_enabled(), f'{w0} -> {w1}')
    cp.press('dialog.lb', '+'); cp.press('dialog.lb', '+')
    lvl = int(re.sub(r'\D', '', cp.inner_text('#lbZoomLevel')) or 0)
    r.check('the + key zooms too (150 % x 1.5 x 1.5 = about 338 %)', 300 <= lvl <= 350, str(lvl))
    for _ in range(6): cp.press('dialog.lb', '+')
    r.check('the zoom stops at 500 % (the button is then off)', '500' in cp.inner_text('#lbZoomLevel') and cp.locator('#lbZoomIn').is_disabled())
    cp.press('dialog.lb', '0')
    r.check('the 0 key fits the picture again', '100' in cp.inner_text('#lbZoomLevel') and cp.locator('#lbZoomReset').is_disabled())
    cp.press('dialog.lb', '-')
    r.check('the - key at 100 % changes nothing', '100' in cp.inner_text('#lbZoomLevel'))
    cp.dblclick('dialog.lb .lb-stage img')
    r.check('a double click zooms to 250 %, another one fits again', '250' in cp.inner_text('#lbZoomLevel'))
    cp.dblclick('dialog.lb .lb-stage img')
    r.check('the second double click returns to 100 %', '100' in cp.inner_text('#lbZoomLevel'))
    cp.click('#lbZoomIn'); c_before = counter(cp); touch_swipe(cp, -200)
    r.check('a zoomed picture is dragged, not swiped away (the item does not change)', counter(cp) == c_before)
    cp.click('#lbClose'); cp.wait_for_selector('dialog.lb', state='detached')

    # ---- Arabic: the swipe is mirrored
    cp.click('#btnLang'); cp.wait_for_selector('text=الوقت المتبقي')
    is_rtl = cp.evaluate("() => document.documentElement.dir")
    cp.click('#photosCard .ph >> nth=0 >> .imgbtn'); cp.wait_for_selector('dialog.lb[open]')
    c0 = counter(cp)
    touch_swipe(cp, -150)
    cp.wait_for_function("(c) => document.querySelector('dialog.lb .lb-nav .muted').textContent.trim() !== c", arg=c0, timeout=10000)
    r.check('in Arabic (right to left) the same swipe goes the other way: from the first item to the last', is_rtl == 'rtl' and c0.startswith('1 ') and counter(cp).startswith(f'{total} '), f'{is_rtl} {c0} -> {counter(cp)}')
    cp.click('#lbClose'); cp.wait_for_selector('dialog.lb', state='detached')
    cp.click('#btnLang'); cp.wait_for_selector('text=Time remaining')

    # ---- a video that cannot be downloaded
    del mock.files[f'data/clients/{cid}/{vid["id"]}.v']
    cp.reload(); cp.wait_for_selector('#clKey'); cp.fill('#clKey', secret); cp.click('#btnOpen'); cp.wait_for_selector('#tapeBig', timeout=30000)
    cp.locator('#photosCard').scroll_into_view_if_needed(); cp.wait_for_selector('#photosCard .ph')
    cp.click('#photosCard .vthumb[data-kind=video]')
    cp.wait_for_selector('dialog.lb .msg.bad', timeout=30000)
    r.check('a video that is missing says it could not be loaded (and does not hang)', 'could not be loaded' in cp.inner_text('dialog.lb .lb-stage') and cp.locator('dialog.lb video').count() == 0)
    cp.click('#lbClose')

    # ---- a phone
    cp.set_viewport_size({'width': 390, 'height': 800}); cp.reload(); cp.wait_for_selector('#clKey'); cp.fill('#clKey', secret); cp.click('#btnOpen'); cp.wait_for_selector('#tapeBig', timeout=30000)
    cp.locator('#photosCard').scroll_into_view_if_needed(); cp.wait_for_selector('#photosCard .ph')
    cp.click(f'#photosCard .ph >> nth={photo_idx} >> .imgbtn'); cp.wait_for_selector('dialog.lb[open] .lb-stage img[src^="blob:"]', timeout=20000)
    box = cp.evaluate("""() => { const d = document.querySelector('dialog.lb').getBoundingClientRect(); const bs = [...document.querySelectorAll('dialog.lb button')].map((b) => [b.id || b.textContent, Math.round(b.getBoundingClientRect().height), Math.round(b.getBoundingClientRect().width)]);
      return { w: Math.round(d.width), right: Math.round(d.right), sw: document.documentElement.scrollWidth, bs }; }""")
    r.check('on a phone the viewer fits the screen and the page does not scroll sideways', box['right'] <= 390 and box['sw'] <= 390, str(box))
    r.check('every viewer button is at least 40 px tall and wide (zoom, previous, next, close)', all(h >= 40 and w >= 40 for _, h, w in box['bs']), str(box['bs']))
    cp.click('#lbClose'); ctx.close()

    # ================= admin: removing a video =================
    pg.evaluate(f"location.hash = '#manage/{cid}'"); pg.wait_for_selector('#tab-photos'); pg.click('#tab-photos'); pg.wait_for_selector('.photos .vthumb[data-kind=video]')
    idx = pg.evaluate("() => [...document.querySelectorAll('.photos .ph')].findIndex((e) => e.querySelector('.vthumb[data-kind=video]'))")
    pg.locator('.photos .ph').nth(idx).locator('button.danger').click()
    r.check('removing a video asks first', any('Remove' in d or 'remove' in d for d in dialogs))
    r.check('the poster is still in the repository until the project is saved', f'data/clients/{cid}/{vid["id"]}.t' in mock.files)
    save(pg)
    r.check('after the save the poster and the video are deleted from the repository', f'data/clients/{cid}/{vid["id"]}.t' not in mock.files and f'data/clients/{cid}/{vid["id"]}.v' not in mock.files)
    pg.remove_listener('dialog', on_dialog)
