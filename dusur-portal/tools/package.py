#!/usr/bin/env python3
"""Split the project into two deployable bundles, so the admin site never has to sit in the public client repository.

    python3 tools/package.py [--out dist]

  <out>/public-site/   index.html + assets/            -> the repository that serves the CLIENT site and holds the data/ folder
  <out>/admin-site/    admin-<8 hex>/ + assets/        -> any other place: a second repository with its own GitHub Pages,
                                                         a private host, or just a folder on your own computer / phone

Why: the client repository has to be public (clients read their encrypted files from raw.githubusercontent.com), and a public
repository lists every folder in it. An admin folder inside it is therefore only "hard to guess", not hidden. The admin site does not
need to live next to the data: it learns the owner/repository of the DATA repository from its Configuration screen.
"""
import os, re, shutil, sys

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
out = sys.argv[sys.argv.index('--out') + 1] if '--out' in sys.argv else os.path.join(ROOT, 'dist')
admin = next(d for d in sorted(os.listdir(ROOT)) if re.fullmatch(r'admin-[0-9a-f]{8}', d))
junk = shutil.ignore_patterns('__pycache__', '*.pyc', '.DS_Store')

for name in ('public-site', 'admin-site'):
    shutil.rmtree(os.path.join(out, name), ignore_errors=True)
pub, adm = os.path.join(out, 'public-site'), os.path.join(out, 'admin-site')
os.makedirs(pub); os.makedirs(adm)
shutil.copy(os.path.join(ROOT, 'index.html'), pub)
shutil.copytree(os.path.join(ROOT, 'assets'), os.path.join(pub, 'assets'), ignore=junk)
shutil.copytree(os.path.join(ROOT, admin), os.path.join(adm, admin), ignore=junk)
shutil.copytree(os.path.join(ROOT, 'assets'), os.path.join(adm, 'assets'), ignore=junk)
for d in (pub, adm):
    open(os.path.join(d, '.nojekyll'), 'w').close()

# self-check: every local script/stylesheet a page references must exist inside its own bundle
bad = []
for base, page in ((pub, 'index.html'), (adm, os.path.join(admin, 'index.html'))):
    html = open(os.path.join(base, page), encoding='utf-8').read()
    for ref in re.findall(r'(?:src|href)="([^"#:]+)"', html):
        if not os.path.isfile(os.path.normpath(os.path.join(base, os.path.dirname(page), ref))):
            bad.append(os.path.join(os.path.basename(base), page) + ' -> ' + ref)
if bad:
    sys.exit('Missing files in a bundle:\n  ' + '\n  '.join(bad))
print('self-check: every page reference resolves inside its own bundle')

print(f'public-site -> {pub}\n  upload to the repository that serves https://<user>.github.io/<repo>/ (the client site)')
print(f'admin-site  -> {adm}\n  upload to a SECOND repository (or host it privately / keep it on your computer)')
print(f'  its address will be https://<user>.github.io/<admin-repo>/{admin}/  - the admin page is told which repository holds the DATA in its Configuration screen')
