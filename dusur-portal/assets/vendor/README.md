# vendor/

Optional local copies of third-party libraries. **Empty by default**: the only third-party library is CryptoJS, which `assets/js/guard.js` loads from a CDN fallback chain (cdnjs, jsDelivr, unpkg).

## Why vendor it

- The site then works with no CDN at all, including on networks that block CDNs.
- A compromised CDN can no longer inject code into the admin page. This is the main security reason; see [docs/SECURITY.md](../../docs/SECURITY.md#known-limits), item 5.

## How

1. Download `crypto-js.min.js` from a version you trust, for example `https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.2.0/crypto-js.min.js`, and check it against the hash published by the project or your package manager. (The delivery sandbox could not reach any CDN, so no copy is bundled and none was tested here.)
2. Save it in this folder as `crypto-js.min.js`.
3. In `assets/js/guard.js` set `var USE_LOCAL_COPY=true;`. The guard then tries `assets/vendor/crypto-js.min.js` first (resolved relative to `guard.js`, so it works from both the client page and the admin folder) and falls back to the CDNs if the file is missing.
4. Optional, for the admin site: edit the CSP `<meta>` in `admin-xxxxxxxx/index.html` and remove the three CDN hosts from `script-src`. `tools/check.py` only requires that `script-src` has no `'unsafe-inline'` and no `'unsafe-eval'`, so the stricter CSP passes. Note that without the CDN hosts there is no fallback: the local file must be present.
5. Run `python3 tools/check.py`, then open the admin page and the client page and make sure a client still opens.

The same copy serves both sites.
