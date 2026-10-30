"""Mock of GitHub for Playwright route interception: Pages (serves this project's folder), the contents API,
raw.githubusercontent.com and the CryptoJS CDNs. Nothing leaves the machine."""
import base64, hashlib, json, mimetypes, os, re, struct, zlib
from urllib.parse import urlparse, unquote, parse_qs

ROOT = os.environ.get('PORTAL_ROOT') or os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))

TOKEN = 'github_pat_TESTTOKEN123'
OWNER, REPO = 'abdo', 'portal'
BASE = f'https://{OWNER}.github.io/{REPO}/'
# the admin site is the folder named admin-<8 hex> in the project root
ADMIN_DIR = next((d for d in sorted(os.listdir(ROOT)) if re.fullmatch(r'admin-[0-9a-f]{8}', d)), 'admin-missing')
ADMIN_NAME = ADMIN_DIR
ADMIN_URL = BASE + ADMIN_DIR + '/'
CRYPTOJS_FILE = os.environ.get('CRYPTOJS_FILE')     # optional: serve the real library instead of the stand-in
CORS = {'access-control-allow-origin': '*'}


def make_png(w=64, h=48, rgb=(200, 120, 40)):
    raw = b''.join(b'\x00' + bytes(rgb) * w for _ in range(h))
    def chunk(t, d):
        c = struct.pack('>I', len(d)) + t + d
        return c + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw)) + chunk(b'IEND', b'')


PNG = make_png()


class Mock:
    def __init__(self, shim=None):
        if CRYPTOJS_FILE:
            shim = open(CRYPTOJS_FILE, encoding='utf-8').read()
        self.shim = shim
        self.overrides = {}  # path (relative to the site root) -> callable(bytes) -> bytes, to simulate a broken deployment
        self.virtual = {}    # path -> bytes for files that do not exist in the project (e.g. a vendored crypto-js copy)
        self.page_headers = {}  # extra response headers for every Pages document (e.g. a host-imposed CSP)
        self.files = {}      # path -> {'b': bytes, 'sha': str}
        self.commits = []    # (method, path, message)
        self.reqlog = []     # (label, method, url)
        self.fail_next_put = None   # status code to return for the next PUT
        self.fonts = 'ok'    # Google Fonts: 'ok' (answer), 'hold' (never answer until release_fonts()), 'fail' (blocked network)
        self.held = []       # font requests being held
        self.n_commits = 0   # Git Data API (used by the key change): every change makes a new commit, and a snapshot of all files is kept per commit
        self.head = self._new_head()
        self.snaps = {self.head: {}}
        self.blobs = {}      # sha -> bytes
        self.trees = {}      # sha -> {path: blob sha}
        self.gitcommits = {} # sha -> {'tree': sha, 'parents': [...], 'message': str}
        # the company inbox (a Google Apps Script web app): mode 'ok' | 'offline' (no connection) | 'nocors' (stores it, but the page may not read the answer) | 'error' (answers 500)
        self.gh_down = False         # api.github.com cannot be reached
        self.rate_left = 57          # what GitHub's rate-limit answer says is left
        self.head_fail = set()       # site files (relative to the site root) that answer 404 when asked with HEAD only (what the troubleshooter does)
        self.inbox = {'mode': 'ok', 'rows': [], 'key': 'inbox-key-0123456789abcdef', 'requests': 0}

    def _new_head(self):
        self.n_commits += 1
        return f'{self.n_commits:040x}'

    def bump(self):
        """A change was made: the repository has a new head, and its files are remembered as they were at that commit."""
        self.head = self._new_head()
        self.snaps[self.head] = dict(self.files)

    def release_fonts(self):
        held, self.held = self.held, []
        for r in held:
            try: r.abort()
            except Exception: pass

    # -- helpers
    @staticmethod
    def sha_of(b):
        return hashlib.sha1(b).hexdigest()

    def text(self, path):
        return self.files[path]['b'].decode('utf-8')

    def paths(self, prefix):
        return sorted(p for p in self.files if p.startswith(prefix))

    def api(self, route, status, obj):
        route.fulfill(status=status, content_type='application/json', body=json.dumps(obj), headers=CORS)

    # -- the static site (what GitHub Pages would serve)
    def site_file(self, rel):
        rel = unquote(rel)
        if rel == '' or rel.endswith('/'):
            rel += 'index.html'
        path = os.path.normpath(os.path.join(ROOT, rel))
        if not path.startswith(ROOT + os.sep) or not os.path.isfile(path) or rel.startswith('tests/') or rel.startswith('tools/'):
            return None
        return path

    def client_text(self):
        """Everything the client page loads, as one string (for 'the client never mentions X' checks)."""
        out = []
        for base, dirs, files in os.walk(ROOT):
            rel = os.path.relpath(base, ROOT)
            if rel.startswith(('tests', 'tools', 'docs', '.')) or os.path.basename(base).startswith('admin-') or '/admin-' in rel + '/':
                dirs[:] = []
                continue
            for f in files:
                if f.endswith(('.html', '.js', '.css')):
                    out.append(open(os.path.join(base, f), encoding='utf-8').read())
        return '\n'.join(out)

    # -- routing
    def handler(self, label):
        def handle(route):
            req = route.request
            u, m = urlparse(req.url), req.method
            self.reqlog.append((label, m, req.url))
            if u.netloc == f'{OWNER}.github.io':
                rel = u.path[len(f'/{REPO}/'):] if u.path.startswith(f'/{REPO}/') else None
                if m == 'HEAD' and rel in self.head_fail:
                    return route.fulfill(status=404, content_type='text/plain', body='', headers=CORS)
                if rel in self.virtual:
                    return route.fulfill(status=200, content_type='application/javascript', body=self.virtual[rel], headers=CORS)
                path = self.site_file(rel) if rel is not None else None
                if not path:
                    return route.fulfill(status=404, content_type='text/plain', body='404', headers=CORS)
                body = open(path, 'rb').read()
                key = os.path.relpath(path, ROOT).replace(os.sep, '/')
                if key in self.overrides:
                    body = self.overrides[key](body)
                ctype = 'text/html; charset=utf-8' if path.endswith('.html') else (mimetypes.guess_type(path)[0] or 'application/octet-stream')
                if path.endswith('.js'):
                    ctype = 'application/javascript'
                return route.fulfill(status=200, content_type=ctype, body=body, headers=self.page_headers if path.endswith('.html') else {})
            if u.netloc in ('cdnjs.cloudflare.com', 'cdn.jsdelivr.net', 'unpkg.com'):
                return route.fulfill(status=200, content_type='application/javascript', body=self.shim, headers=CORS)
            if u.netloc in ('fonts.googleapis.com', 'fonts.gstatic.com'):
                if self.fonts == 'fail':
                    return route.abort()
                if self.fonts == 'hold':
                    self.held.append(route); return
                if u.netloc == 'fonts.googleapis.com':
                    css = ''.join(f"@font-face{{font-family:'{fam}';font-style:normal;font-weight:{w};font-display:swap;src:url(https://fonts.gstatic.com/s/standin/{w}.ttf) format('truetype');unicode-range:U+0000-00FF,U+0600-06FF}}"
                                  for fam in ('IBM Plex Sans', 'IBM Plex Sans Arabic') for w in (400, 700))
                    return route.fulfill(status=200, content_type='text/css', body=css, headers=CORS)
                return route.fulfill(status=200, content_type='font/ttf', body=open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fixtures', 'standin-font.ttf'), 'rb').read(), headers=CORS)
            if u.netloc == 'images.example.com':
                return route.fulfill(status=200, content_type='image/png', body=PNG, headers=CORS)
            if u.netloc == 'raw.githubusercontent.com':
                mm = re.match(rf'^/{OWNER}/{REPO}/HEAD/(.+)$', u.path)
                p = unquote(mm.group(1)) if mm else ''
                if p in self.files:
                    return route.fulfill(status=200, content_type='application/octet-stream', body=self.files[p]['b'], headers=CORS)
                return route.fulfill(status=404, content_type='text/plain', body='404: Not Found', headers=CORS)
            if u.netloc == 'api.github.com':
                if self.gh_down:
                    return route.abort()
                return self.github(route, req, u, m)
            if u.netloc == 'script.google.com' and re.match(r'^/macros/s/[A-Za-z0-9_-]+/exec$', u.path):
                return self.apps_script(route, req, m)
            return route.abort()
        return handle

    def apps_script(self, route, req, m):
        box = self.inbox; box['requests'] += 1
        if box['mode'] == 'offline':
            return route.abort()
        if box['mode'] == 'error':
            return route.fulfill(status=500, content_type='text/plain', body='Server error', headers=CORS)
        # 'nocors': the script receives and stores every request, but the browser may not read the answer. Playwright adds CORS headers by itself and shows no
        # fetch mode, so the block is simulated by cutting the answer of the 1st, 3rd, ... request: the client page always tries once in "cors" mode (cut here),
        # then once more in "no-cors" mode (answered here, as an opaque response)
        blocked = box['mode'] == 'nocors' and box.setdefault('nc', 0) % 2 == 0
        if box['mode'] == 'nocors':
            box['nc'] += 1
        def reply(obj, status=200):
            if blocked:
                return route.abort()
            return route.fulfill(status=status, content_type='application/json', body=json.dumps(obj), headers=CORS)
        if m == 'OPTIONS':
            if blocked:
                return route.abort()
            return route.fulfill(status=204, headers={**CORS, 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'POST'})
        if m != 'POST':
            return reply({'ok': True, 'service': 'dusur-inbox'})
        try:
            body = json.loads(req.post_data or '')
        except ValueError:
            return reply({'ok': False, 'error': 'bad'})
        if body.get('op') == 'ping':
            return reply({'ok': True, 'total': len(box['rows'])} if body.get('key') == box['key'] else {'ok': False, 'error': 'key'})
        if body.get('op') == 'pull':
            if body.get('key') != box['key']:
                return reply({'ok': False, 'error': 'key'})
            after = int(body.get('after') or 0)
            items = [{'n': i + 1, 'code': c} for i, c in enumerate(box['rows']) if i + 1 > after][:200]
            return reply({'ok': True, 'items': items, 'next': items[-1]['n'] if items else after, 'total': len(box['rows'])})
        code = str(body.get('code') or '')
        if not re.match(r'^DSFB1\.[A-Za-z0-9_-]{3,40}\.[A-Za-z0-9_-]{20,4000}$', code):
            return reply({'ok': False, 'error': 'bad'})
        if code not in box['rows']:
            box['rows'].append(code)
        return reply({'ok': True})

    def github(self, route, req, u, m):
        if m == 'OPTIONS':
            return route.fulfill(status=204, headers={**CORS, 'access-control-allow-headers': 'authorization, content-type',
                                                     'access-control-allow-methods': 'GET, PUT, DELETE'})
        if u.path == '/rate_limit' and m == 'GET':
            import time
            return self.api(route, 200, {'resources': {'core': {'limit': 60, 'remaining': self.rate_left, 'reset': int(time.time()) + 3000}}})
        if req.headers.get('authorization') != f'Bearer {TOKEN}':
            return self.api(route, 401, {'message': 'Bad credentials'})
        if u.path == f'/repos/{OWNER}/{REPO}' and m == 'GET':
            return self.api(route, 200, {'full_name': f'{OWNER}/{REPO}', 'private': False, 'permissions': {'push': True}, 'default_branch': 'main'})
        gm = re.match(rf'^/repos/{OWNER}/{REPO}/git/(.+)$', u.path)
        if gm:
            return self.git_data(route, req, m, unquote(gm.group(1)))
        mm = re.match(rf'^/repos/{OWNER}/{REPO}/contents/(.+)$', u.path)
        if not mm:
            return self.api(route, 404, {'message': 'Not Found'})
        path = unquote(mm.group(1)).rstrip('/')
        ref = (parse_qs(u.query).get('ref') or [''])[0]
        files = self.snaps.get(ref, self.files) if ref else self.files        # ?ref=<commit>: the files as they were at that commit
        f = files.get(path)
        if m == 'GET':
            if f and len(f['b']) > 1000000:                    # like GitHub: the contents API does not send a file over 1 MB (read its blob instead)
                return self.api(route, 200, {'type': 'file', 'name': path.split('/')[-1], 'path': path, 'sha': f['sha'], 'size': len(f['b']), 'content': '', 'encoding': 'none'})
            if f:
                b64 = base64.b64encode(f['b']).decode()
                wrapped = '\n'.join(b64[i:i + 60] for i in range(0, len(b64), 60))
                return self.api(route, 200, {'type': 'file', 'name': path.split('/')[-1], 'path': path, 'sha': f['sha'], 'content': wrapped, 'encoding': 'base64'})
            kids = {}
            for p, v in files.items():
                if p.startswith(path + '/'):
                    name = p[len(path) + 1:].split('/')[0]
                    kids[name] = ({'name': name, 'path': p, 'sha': v['sha'], 'type': 'file'} if '/' not in p[len(path) + 1:]
                                  else {'name': name, 'path': path + '/' + name, 'sha': 'dir', 'type': 'dir'})
            if kids:
                return self.api(route, 200, list(kids.values()))
            return self.api(route, 404, {'message': 'Not Found'})
        body = json.loads(req.post_data or '{}')
        if m == 'PUT':
            if self.fail_next_put:
                st, self.fail_next_put = self.fail_next_put, None
                return self.api(route, st, {'message': 'Resource not accessible by personal access token'})
            if f and 'sha' not in body:
                return self.api(route, 422, {'message': 'Invalid request.\n\n"sha" wasn\'t supplied.'})
            if f and body['sha'] != f['sha']:
                return self.api(route, 409, {'message': f'{path} does not match {body["sha"]}'})
            b = base64.b64decode(body['content'])
            self.files[path] = {'b': b, 'sha': self.sha_of(b + str(len(self.commits)).encode())}
            self.commits.append(('PUT', path, body['message'])); self.bump()
            return self.api(route, 200 if f else 201, {'content': {'sha': self.files[path]['sha']}})
        if m == 'DELETE':
            if not f:
                return self.api(route, 404, {'message': 'Not Found'})
            if body.get('sha') != f['sha']:
                return self.api(route, 409, {'message': 'sha does not match'})
            del self.files[path]
            self.commits.append(('DELETE', path, body.get('message', ''))); self.bump()
            return self.api(route, 200, {'commit': {}})
        return self.api(route, 405, {'message': 'Method not allowed'})

    # -- Git Data API: enough for "one commit that changes many files" (the encryption key change)
    def git_data(self, route, req, m, rest):
        body = json.loads(req.post_data or '{}') if m in ('POST', 'PATCH') else {}
        if m == 'GET' and rest.startswith('ref/heads/'):
            return self.api(route, 200, {'object': {'sha': self.head}})
        if m == 'GET' and rest.startswith('commits/'):
            c = self.gitcommits.get(rest[8:])
            return self.api(route, 200, {'tree': {'sha': (c or {}).get('tree', 'root')}}) if (c or rest[8:] in self.snaps) else self.api(route, 404, {'message': 'Not Found'})
        if m == 'GET' and rest.startswith('blobs/'):
            want = rest[6:]
            hit = next((v for v in self.files.values() if v['sha'] == want), None)
            if not hit: return self.api(route, 404, {'message': 'Not Found'})
            return self.api(route, 200, {'sha': want, 'size': len(hit['b']), 'encoding': 'base64', 'content': base64.b64encode(hit['b']).decode()})
        if m == 'POST' and rest == 'blobs':
            b = base64.b64decode(body['content']); sha = self.sha_of(b); self.blobs[sha] = b
            return self.api(route, 201, {'sha': sha})
        if m == 'POST' and rest == 'trees':
            sha = self.sha_of(json.dumps(body, sort_keys=True).encode()); self.trees[sha] = {t['path']: t['sha'] for t in body['tree']}
            return self.api(route, 201, {'sha': sha})
        if m == 'POST' and rest == 'commits':
            sha = self.sha_of(json.dumps(body, sort_keys=True).encode() + str(len(self.gitcommits)).encode())
            self.gitcommits[sha] = {'tree': body['tree'], 'parents': body.get('parents', []), 'message': body.get('message', '')}
            return self.api(route, 201, {'sha': sha})
        if m == 'PATCH' and rest.startswith('refs/heads/'):
            c = self.gitcommits.get(body.get('sha'))
            if not c or c['parents'] != [self.head]:
                return self.api(route, 422, {'message': 'Update is not a fast forward'})
            for path, bsha in self.trees.get(c['tree'], {}).items():
                b = self.blobs[bsha]; self.files[path] = {'b': b, 'sha': self.sha_of(b + str(self.n_commits).encode())}
            self.commits.append(('COMMIT', f"{len(self.trees.get(c['tree'], {}))} files", c['message'])); self.bump()
            return self.api(route, 200, {'object': {'sha': self.head}})
        return self.api(route, 404, {'message': 'Not Found'})
