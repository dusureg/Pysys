# Security

This document says what the design protects, how, and where it stops protecting. Read [Known limits](#known-limits) before relying on it for anything beyond what it is built for: protecting a small business's client progress and finance data on free static hosting.

## Rules the code follows

- **No secrets, no repository details in code.** The token, the admin password, owner and repository names are entered by the admin at run time. The client site derives the repository from its own address.
- **No inline script, no `eval`, no HTML parsing of data.** All dynamic DOM is built with `h()` (text nodes and elements only). User-supplied strings are never assigned to `innerHTML`.
- **Whitelists, not blacklists.** What the client can see is built field by field (`toPublic()`); what the public brand file may contain is built field by field (`sanitizeBrand()`).

## What is stored where

Everything under `data/` is in a **public** repository, so anyone can read every byte. Confidentiality comes only from encryption.

| Path | Contents | Readable by the public? |
|---|---|---|
| `data/clients/<id>.json` | Client snapshot (name, phone, projects, stages, payments, photos list) | Ciphertext only |
| `data/clients/<id>/<photo>.t` and `.f` | Thumbnail and full photo | Ciphertext only |
| `data/public/index.json` | Hash of each SKU mapped to a client id | Yes, by design (hashed) |
| `data/public/brand.json` | Company name, tagline, phone, WhatsApp, e-mail, website, address, logo, rating switch, address of the optional rating inbox, fonts and accent colour (4.5) | Yes, by design (it is your public profile) |
| `data/private/vault.json` | Master key wrapped by the admin password | Ciphertext only |
| `data/private/settings.json` | Settings, project types, internal code patterns, your own cost categories, paper size, contract text and your signature image | Ciphertext only |
| `data/private/<id>.json` | Full private record: costs, internal notes, contact details, client secret key, per-project contract options | Ciphertext only |
| `data/private/ops/suppliers.json`, `inventory.json`, `logistics.json` | Your suppliers and their contact details, materials with quantities, costs and movements, shipments with carriers and tracking numbers | Ciphertext only |
| `data/private/ops/expenses.json` | Company expenses (rent, wages, power...) | Ciphertext only |
| `data/private/team.json` | Team members (names, user names, roles, status) and the roles | Ciphertext only |
| `data/private/profiles/<id>.json` | Phone number and picture of a signed-in person (4.5) | Ciphertext only |
| `data/private/keys/<hash>.json` | One login file per team member, and one for the administrator's own user name sign-in (4.5): public key, the keys the app needs sealed to that member, and the member's private key locked with their password | **Downloadable by anyone** (the contents are encrypted, but see [limit 14](#known-limits)) |
| `data/private/audit/YYYY-MM.json` | The History of every change | Ciphertext only |

In the browser:

| Place | Contents |
|---|---|
| `localStorage` `dsp.config.v1` | Owner, repository, and the GitHub token **sealed** (AES-GCM) under a key derived from the admin password |
| `localStorage` `dsp.lang`, `dsp.theme`, `dsp.idle` | Preferences, not secret |
| Memory only | Admin password (briefly), derived keys, decrypted token, master key, decrypted records, decrypted photos (as blob URLs) |

## Cryptography (exact)

| Purpose | Construction |
|---|---|
| Client secret key | 16 characters from a 32-symbol alphabet without look-alikes (`ABCDEFGHJKLMNPQRSTUVWXYZ23456789`), shown as `XXXX-XXXX-XXXX-XXXX`: **80 bits** from `crypto.getRandomValues` |
| Key stretching (client) | PBKDF2-HMAC-SHA256, **310,000** iterations, salt `"dscl-v1:" + clientId`, 256-bit output, hex-encoded |
| Client snapshot | CryptoJS `AES.encrypt(json, passphrase)`: AES-256-CBC with the OpenSSL-compatible salted format (`Salted__` + random salt, key and IV derived by CryptoJS from the 256-bit passphrase). Result is base64 in `{ "payload": "..." }` |
| Photos | AES-256-GCM, 12-byte random IV prepended. Key: PBKDF2-SHA256, 310,000 rounds, salt `"dscl-img-v1:" + clientId`, from the same client secret |
| Admin password to vault key | PBKDF2-SHA256, 310,000 rounds, 16-byte random salt, 256-bit AES-GCM key |
| Master key | 32 random bytes. Wrapped (AES-GCM) by the password-derived key and stored in `vault.json` |
| Private records and settings | AES-256-GCM under the master key, fresh 12-byte IV for every write |
| Token at rest | AES-256-GCM under the password-derived key (`dsp.config.v1`), never written anywhere else |
| SKU index | `sha256("dscl-sku-v1:" + SKU)`, first 16 hex characters, mapped to the client id |
| Rating code | Same construction as the client snapshot, keyed by that client's secret: `DSFB1.<id>.<base64url>` |

Notes on honesty about the choices:

- **CBC without a MAC (client snapshot).** CryptoJS's passphrase mode is unauthenticated. It is kept because it is the original, already-deployed format. The passphrase is a 256-bit PBKDF2 output, so the weak MD5-based KDF inside CryptoJS is not the bottleneck. After decrypting, the code requires valid UTF-8 JSON, schema `dscl/1` or `dscl/2` and `rec.id === id`, which rejects wrong keys and swapped files. An attacker who can write to your repository could corrupt a file, but could not produce one that decrypts to something chosen, because they do not have the key. Everything newer (photos, vault, private records, token) uses AES-GCM, which is authenticated.
- **The online "wrong key" delay is cosmetic.** The client page slows repeated attempts (0.4 s per failure up to 2.5 s) but a determined attacker downloads the ciphertext and attacks it offline. Protection against that is the **80-bit** secret plus 310,000 PBKDF2 rounds, which is not feasible to brute-force. Keep client secrets random (the generator does) and do not let clients choose their own.
- **The admin password is the weak point by nature.** `vault.json` and the private files are public ciphertext, so an attacker can run an offline guessing attack against your admin password at 310,000 PBKDF2 rounds per guess. The minimum is 10 characters; use a long passphrase (four or more random words, or 16+ characters). This matters more than anything else in this document.

## Threat model

| Threat | Result |
|---|---|
| Someone finds the repository and downloads `data/` | Sees ciphertext, public brand profile and hashed SKUs. Cannot read clients, prices, costs or photos without a client secret or the admin password |
| Someone finds the admin address | Sees a password screen. Cannot read or write without the password (which unseals the token and unwraps the master key) |
| A client opens another client's link | Needs that client's secret key; a client's key only decrypts that client's files (the key derivation is salted by the client id) |
| A client shares their link | Link alone shows only the key form. The secret travels separately. The URL fragment (`#client/<id>`) is never sent to a server, and the secret is never in the URL |
| Browser or device stolen, admin locked | The token is sealed under the password. Idle auto-lock (5/15/30/60 min, default 15) clears memory |
| Browser or device stolen, admin **unlocked** | Attacker has everything the session has. Lock when you leave; closing the tab clears memory |
| XSS on the admin page | The main risk to the token, so the page has a strict CSP, no inline script, no HTML parsing and a whitelist for public fields |
| Compromised token | Limited by token scope: fine-grained, **one repository**, **Contents read/write** only. Revoke it on GitHub and set a new one in Configuration |
| Leaked admin password | Change it in Configuration. This re-wraps the master key and re-seals the token; the master key itself is unchanged, so also consider the old password as compromised for anything an attacker already downloaded (see limits) |

## Content Security Policy

Set with a `<meta http-equiv>` tag in each page (GitHub Pages cannot send headers):

```
default-src 'none';
script-src 'self' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://unpkg.com;
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src 'self' https://fonts.gstatic.com;
connect-src 'self' https://raw.githubusercontent.com https://script.google.com https://script.googleusercontent.com;                          (client page)
connect-src 'self' https://api.github.com https://raw.githubusercontent.com https://script.google.com https://script.googleusercontent.com;  (admin page)
img-src 'self' data: blob: https:;
base-uri 'none'; form-action 'none'
```

- `connect-src 'self'` lets the page ask its own site whether a file exists (the troubleshooter and the start-up diagnostics do this). The two `script.google*` hosts are only for the optional client rating inbox (docs/INBOX.md); a page that does not use it never calls them.
- `script-src` has no `'unsafe-inline'` and no `'unsafe-eval'`. The three CDNs are only for CryptoJS (fallback chain).
- `style-src 'unsafe-inline'` is needed because the code sets inline `style` attributes (progress bars, chart colours). Styles cannot run script.
- `img-src https:` exists because a project photo can be an external **link**; photo images get `referrerpolicy="no-referrer"`.
- `fonts.googleapis.com` (the font stylesheet) and `fonts.gstatic.com` (the font files) are there only for the IBM Plex fonts. `python3 tools/get-fonts.py` removes both and the CSP then reads `font-src 'self'`. They can deliver only styles and fonts, never script.
- The client page cannot call `api.github.com` at all.
- `tools/check.py` fails if a page has no CSP tag, if its `script-src` contains `'unsafe-inline'` or `'unsafe-eval'`, or if it lacks `noindex`. It also fails if the client page loads any admin file or contains admin-only code (including `api.github.com`).
- Both pages carry `<meta name="robots" content="noindex,nofollow">`.

## Suppliers, inventory and logistics (4.3)

- The three files under `data/private/ops/` are sealed with the same AES-GCM master key as `settings.json`; the file names are the only plain text. They are never read by the client site, are not part of `toPublic()`, and a test checks that no supplier, material or shipment text appears in any public or client file.
- **Links are filtered before they become clickable.** A website, map link or other link must be `http` or `https` (`safeUrl()`); `javascript:`, `data:`, `ftp:` and similar are refused when you save and are not rendered as links if an old file contains one. Phone numbers become `tel:` or `https://wa.me/<digits>` only when they are digits with an optional `+`; an e-mail becomes `mailto:` only when it looks like one. Links that leave the app open in a new tab with `rel="noopener noreferrer"`.
- Text from these records is always drawn as text (never as HTML), like everything else in the admin site.
- **Concurrent devices.** Each save is sent against the version of the file the device last read (strict `sha`). When another device saved first, GitHub refuses it (409/422); the app reads the new copy, applies the same single change again and retries, up to three times, so one device cannot silently overwrite the other. A change that cannot be saved is not kept in memory.
- Changing the admin password re-wraps the master key only; these files are not rewritten and stay readable (checked by the destructive test suite).

## Team, roles and the History (4.4): what they really protect

The administrator is whoever knows the admin password (`session.user.owner`). Every other person is a **member** with a user name, a password and a role. Be clear about what this gives you:

**What it does well**

- Each member's screens, buttons and forms follow their role (*none / view / edit* per area). A member who may only view sees forms switched off and no Save button. Team and Configuration (admin password, token, connection codes, encryption key) are not an area any role can have: they are only for the administrator.
- A **write guard** in the app refuses to save a file the member's role does not cover (for example a *Production* member trying to write `ops/expenses.json`), and the access list is re-read on every save and every 20 seconds, so **Pause** and **Block** take effect almost at once on an honest, normal browser.
- **Pause** is reversible and keeps the member's login file. **Block** also deletes the login file. **Remove** deletes the member. A member who was blocked can be let back in only by a new password from the administrator.
- Every change is written to the History with who did it, when, which record and, field by field, what it was before and after. Entries are chained with a hash: editing or removing an entry in the middle of a month's file is detected and shown as **Broken** (tested).

**What it does not do** (and cannot, without a server)

- **A role is not a security boundary against a determined member.** To work, a member's browser receives, after they sign in, the same master key and the same GitHub token the administrator uses (they are sealed to the member's own key and opened with the member's password). The role rules are enforced by this page's code. A member who is technically skilled and willing to tamper with the page, or to call the GitHub API with the token directly, can read any sealed file, write any file (including `team.json` to give themselves a bigger role) and delete the History. Treat roles as a way to keep **honest colleagues** from touching the wrong thing, not as protection from someone you do not trust.
- **Blocking is not enough if the member should never see the data again.** A blocked member keeps whatever they already copied: the master key and the token. The full cut-off is: **Team, Change the encryption key** (re-encrypts every file in one commit with a new master key and re-issues the login files of the members who stay) **and replace the GitHub token** (create a new one, enter it in Configuration, delete the old one on GitHub). Only then can the old copy no longer read or change anything written from now on. It **can still read what was in the repository's git history at the time it had access** (older commits stay downloadable in a public repository and are sealed with the old key): the change protects the future, it cannot recall the past. Do both steps whenever a person who held a role leaves.
- **The login files are public.** A member's file sits in a public repository, so anyone can download it and try passwords offline against it (PBKDF2-SHA256, 310,000 rounds, which makes each guess slow but not impossible). The app enforces at least 10 characters; use a long phrase, never a password used elsewhere, and never a short one for a role that can read finance. A weak member password is the single easiest way into your data.
- **The hash chain proves the middle of a month, not its end.** Removing the last entries of a file, or deleting the whole file, leaves a chain that still verifies. GitHub's own commit history (the repository's *History* on github.com) is the second witness: every History write is a commit with a time. Someone with the token can still rewrite a file and the history of commits is only as safe as the repository.
- **Who did it is what the page says.** The name in an entry comes from the signed-in member in the page. A member who tampers with the page can write entries under another name. Commits on GitHub all show the token owner.
- **The History never stops a save.** If an entry cannot be written (no connection, a conflict) it waits in memory and is retried; the screen shows how many are waiting. If the tab is closed before it was written, that entry is lost. While the encryption key is being changed, writing is paused and finished first so the two never collide.

## Administrator sign-in with a user name (4.5)

The administrator can add a user name and a password (Team screen) and sign in with them from any device, without typing the GitHub token. It is the same mechanism as a team member's sign-in, with full rights, so everything said about the login files applies, and with more weight, because **this account can do everything and holds the token**:

- The login file is **public** (limit 14): anyone can try passwords against it offline (PBKDF2-SHA256, 310,000 rounds). The screen therefore asks for **at least 12 characters**; use a phrase of four or five unrelated words, used nowhere else.
- It counts only while the sealed `team.json` still lists it: removing the sign-in (or *Change the encryption key*) makes any downloaded copy useless for new sign-ins.
- A lost phone or computer: remove the sign-in, change the admin password, change the encryption key, replace the GitHub token.
- The token method and the admin password keep working exactly as before; nothing was weakened for people who do not set up the new sign-in.

**Other 4.5 notes.** The *settings file* never contains a password, token, key, the rating-inbox address or key, or the project types; loading one only fills the form. Imports are read in the browser, never uploaded anywhere, and every row is checked before it is stored (text is length-capped and treated as text, never as HTML). The WhatsApp field of a client or supplier accepts only a phone number or an address on `wa.me`, `api.whatsapp.com`, `chat.whatsapp.com`, `web.whatsapp.com` or `wa.link`. The collection schedule is shown to the client (dates, amounts, notes up to 80 characters): do not put anything private in an instalment's note.

## Files, media and contacts (4.6)

- **Invoices and product pictures** are sealed with the master key (`data/private/files/<id>.bin`, AES-GCM, random IV) like every other private file. They are never part of a client's snapshot. The record holds only the file's id, name, type and size; the key change re-seals them with the rest. File names and sizes are visible only after unsealing, but the **number and size of the sealed files are visible** in a public repository (known limit 3).
- **Videos and files for the client** (`.v`, `.d`) are sealed with the client's own key. The browser decrypts them and **saves** a download; it never opens it, so a file of a project (a `.zip`, a drawing) cannot run inside the portal. The type must be on the list `DL_EXT` and the name is cleaned of path characters. Only the direct links of videos play inside the page (`media-src 'self' blob: https:`); the page of another site is opened in its own tab, never embedded.
- **The contact file** (`.vcf`) is built in the browser from the **public** company profile only; nothing private is in it.
- **The contract** (wording, own clauses, template, status) stays in the private record: it is not copied into the snapshot (`toPublic()` has no field for it), and the test checks that.
- **Overview, Contracts and Labels** are private screens and reports; the labels print the client id, name and SKU on a sticker, so keep the printed sheets as private as the project papers.

## Client rating inbox (4.4, optional)

- It is a Google Apps Script **you** deploy on your own Google account ([INBOX.md](INBOX.md)). The client page posts the already-encrypted rating code to it; the script stores text it cannot decrypt (the client's key never leaves the client's browser and your admin page).
- The inbox **address is public** (it is in `brand.json`), so anyone can post codes to it. The script accepts only well-formed codes, keeps a code once and stops after 300 a day; the admin import discards anything that does not decrypt with a real client's key. A junk code can never become a rating, but it can make noise.
- The **pick-up key is private**: it lives in the sealed settings and in the script, and is sent only from the admin page to the script. A person who has it can download the encrypted codes (not read them).
- The CSP allows the page to talk to `script.google.com` and `script.googleusercontent.com` (Apps Script answers through a redirect). A site that does not set the inbox never calls them.
- Not tested against real Google from the delivery sandbox: see [INBOX.md](INBOX.md#about-testing).

## Known limits

1. **The admin address is unlisted, not secret.** The folder `admin-xxxxxxxx` is listed in a public repository's file view and in its git history. Do not rely on it for anything; the password does the protecting. If it spreads, run `python3 tools/rename-admin.py` or host the admin site in a separate repository (see [DEPLOYMENT.md](DEPLOYMENT.md)). A public repository's history will still show the old name.
2. **The repository must be public** for clients to read their files from `raw.githubusercontent.com`. A private repository would block them.
3. **Metadata is visible.** Client IDs (`DS-CL-1001` and so on are sequential), how many clients exist, file sizes, number of photos, and commit times and messages (`Publish DS-CL-1001`, `Update ...`) are readable by anyone. Contents are not.
4. **SKUs and client IDs are guessable**, so someone can test whether a given project number exists (the SKU hash index lets them map a guessed SKU to a client id). They learn only that mapping, never names, phones or any content. Impact is low; the fix would be random IDs, at the cost of friendly numbering.
5. **CryptoJS from a CDN, no integrity pinning.** If a CDN were compromised while you use the admin site, injected code could read what the page can read. Mitigation: vendor the library (`assets/vendor/`, see its README) and set `USE_LOCAL_COPY = true` in `guard.js`; then `script-src 'self'` is enough and you can remove the three CDN hosts from the CSP of the admin page. Recommended for the admin site.
6. **Shared browser origin.** All pages under `<user>.github.io` share one `localStorage`. Another page you host under the same GitHub account could read the sealed token blob (still protected by the password). Do not host untrusted pages under the same account, or use a separate account or organisation for this portal.
7. **No clickjacking header.** `frame-ancestors` cannot be set by a meta tag, and GitHub Pages sends no `X-Frame-Options`. The admin page could be framed by another site. Everything still needs your password and your clicks; use the admin site in a normal browser tab.
8. **Changing the admin password does not re-encrypt old data.** It re-wraps the master key and re-seals the token. Anyone who copied `vault.json` earlier and knew the *old* password can still unwrap the master key from their copy. If the old password leaked, treat the data as exposed up to that point and consider re-creating the vault (export reports first).
9. **Client-side throttling only.** See the note under Cryptography.
10. **The rating code is encrypted but unauthenticated at transport.** Anyone who has both the code and the client's secret can read it; anyone with only the client's secret could forge one. The admin import verifies it against the stored secret and the SKU. Treat ratings as client feedback, not as signed documents.
11. **Not tested against the real CDN or real GitHub in the delivery sandbox.** The test suite uses a simulated GitHub and a CryptoJS stand-in (see [tests/README.md](../tests/README.md)). Do one real run (create a client, open the link in a private window, rate a project) after deploying.

12. **Google Fonts is a third party.** With the default settings Google receives each first-time visitor's IP address and browser details when the fonts are fetched (it cannot see the page's content or the key). Self-hosting with `tools/get-fonts.py` removes this.
13. **The contract is a template.** Its clauses are general text; having them checked for your country is your responsibility. The signature image is a picture of a signature, not a digital signature in the legal sense (no certificate and no tamper detection on the printed or PDF paper).

14. **Team members' login files are public** and an offline guess against a weak member password can succeed. Enforce long passwords; see *Team, roles and the History*.
15. **Roles are enforced by the page**, not by GitHub. A skilled member with a role can exceed it; the real cut-off is changing the encryption key and the token.
16. **The History's hash chain does not detect removing the end of a month or a whole file**; compare with the repository's commit history when it matters.
17. **The rating inbox address is public** and accepts junk; it cannot create ratings. Its real Google behaviour was not observed in the delivery sandbox.

18. **Sealed files are limited by the contents API of GitHub** (about 780 KB sealed for invoices and pictures; 24 MB for a client's video or download, which the browser reads whole). A larger file is refused, not split. Larger files belong on a drive (planned).
19. **A downloaded file is only as safe as its source.** The portal saves it without opening it, but the client opens it in their own program; send files you made.
20. **The Code 128 barcode on a label has not been read by a real scanner** in the delivery sandbox (the QR code was decoded from the printed PDF with OpenCV). Test a printed label with your own scanner before relying on it.

## Hardening checklist

- [ ] Admin password: long passphrase, not reused anywhere.
- [ ] Fine-grained token: one repository, Contents read/write only, expiry date set.
- [ ] Vendor CryptoJS for the admin site (and ideally the client site).
- [ ] Members: a password of 4 random words or more, different for each person; roles as small as the job needs.
- [ ] When a person who had a role leaves: Block, then **Change the encryption key**, then replace the GitHub token.
- [ ] Do not share the admin address; rename the folder if you did.
- [ ] Keep the repository under an account that hosts nothing untrusted.
- [ ] Send the client link and the secret key through **different** channels.
- [ ] Lock the admin site when you leave the screen.
- [ ] Optionally self-host the fonts (`python3 tools/get-fonts.py`) so no third party sees your visitors.
