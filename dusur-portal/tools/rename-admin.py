#!/usr/bin/env python3
"""Give the admin folder a new random name.  python3 tools/rename-admin.py

Do this if the admin address ever leaked or you shared a screenshot of it. Nothing else references the name (headers use <admin>,
the client never mentions it), so renaming the folder is the whole change. Upload the renamed folder and delete the old one.
Note: a public repository's git history still shows the old name; the old address stops working once the old folder is deleted.
"""
import os, re, secrets, sys

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
old = next(d for d in sorted(os.listdir(ROOT)) if re.fullmatch(r'admin-[0-9a-f]{8}', d))
new = 'admin-' + secrets.token_hex(4)
os.rename(os.path.join(ROOT, old), os.path.join(ROOT, new))
print(f'{old}  ->  {new}\nNew address: https://<user>.github.io/<repo>/{new}/')
