# assets/

Everything shared by the client site and the admin site. This folder is public and is downloaded by every visitor, so it contains **no admin-only code**; `python3 tools/check.py` enforces that.

```
css/      base.css         variables (dark and light), reset, typography, layout
          components.css   buttons, cards, forms, badges, KPI tiles, dialogs
          client.css       client site screens (search, portal, tape measure, ring)
i18n/     en.js, ar.js     UI strings both sites need (admin strings are in the admin folder)
js/
  guard.js                 start-up safety net: pre-paint settings, error recording, font loader, early download of the company profile, CryptoJS loader, diagnostics
  core/                    used by BOTH pages, in this load order:
    constants.js           schema tag, PBKDF2 cost, localStorage keys, status table, route counter
    i18n.js                language, t(), numbers, money, dates
    dom.js                 h(), icons, toasts, clipboard, language and theme switches
    crypto.js              bytes helpers, PBKDF2, snapshot decryption, photo key
    brand.js               logo, public company profile, contact links, SKU hash, rating code
    domain.js              finance, progress, state, snapshot upgrade
    ui.js                  badges, KPI tiles, progress bars
    photos.js              fetch, decrypt and show encrypted photos (thumbnails load when near the screen), lightbox
  client/                  client site only:
    data.js, router.js, keyform.js, search.js, portal.js, rating.js, main.js
vendor/                    optional local copy of CryptoJS (see vendor/README.md)
fonts/ and css/fonts.css   only after `python3 tools/get-fonts.py`: your own copy of IBM Plex Sans and IBM Plex Sans Arabic (SIL OFL 1.1). Without it the fonts come from Google Fonts
```

Rules for this folder:

- A file goes in `core/` only if **both** pages need it. Admin-only code lives in the admin folder.
- Scripts are classic `<script defer>` files sharing one global scope. Load order is defined by the page's `<script>` list; see [../docs/CODEMAP.md](../docs/CODEMAP.md) and [../docs/DEVELOPMENT.md](../docs/DEVELOPMENT.md).
- Never put a secret, a token or a repository detail in here.
