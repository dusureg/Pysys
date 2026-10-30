# Client rating inbox (optional, about 5 minutes)

By default a client who rates a finished project gets an encrypted code and sends it to you by WhatsApp, e-mail or copy-and-paste. With the inbox turned on, the client presses **Send my rating** on the client site and it reaches you directly, with no other app.

The portal has no server, so the inbox is a small free **Google Apps Script** that belongs to your own Google account. It only stores text it cannot read: every rating is encrypted in the client's browser with that client's own secret key before it leaves the page. Neither Google nor the script can read the score or the comment. Only the admin site, after you sign in, can decrypt it.

Nothing in the portal depends on the inbox. If you never set it up, or it is down, clients still have WhatsApp, e-mail and copy.

## Set it up

1. In Google Drive create a new **Google Sheet** (name it "Dusur ratings inbox").
2. In the sheet open **Extensions → Apps Script**. Delete the sample code and paste the whole of [`docs/inbox/Code.gs`](inbox/Code.gs).
3. In the admin site open **Settings → Client rating inbox** and press **Make a new key**. Copy that key.
4. In the script, replace `PUT-THE-SAME-KEY-AS-IN-SETTINGS` (the first line, `const PULL_KEY`) with the key. Leave the `PLACEHOLDER` line as it is. Press **Save**.
5. **Deploy → New deployment → type: Web app**. Set *Execute as*: **Me**, *Who has access*: **Anyone**. Press **Deploy** and accept the permission screen (**Advanced → Go to project**). Copy the **Web app URL** (it ends with `/exec`).
6. Back in **Settings → Client rating inbox**, paste the URL, press **Test the connection**. It should say the inbox answered and the key is right. Then **Save settings**.
7. Do one real test: finish a test project, open the client page, send a rating, then on the admin dashboard press **Check for new ratings**.

If you later change the script, use **Deploy → Manage deployments → edit → New version** so the URL stays the same. A brand-new deployment gives a new URL, which must then be pasted in Settings again.

## How it works

| Step | What happens |
|---|---|
| Client presses Send | The page posts `{v:1, code:"DSFB1.<client id>.<encrypted>"}` to the web app URL (published in `brand.json`). It states **Sent**, **Sent, not confirmed** or **Not sent yet** and keeps the rating on the device so the client can try again. |
| The script | Checks the shape of the code, ignores a rating it already holds, stops after 300 per day, and appends one row (time, code) to the sheet `ratings`. |
| Admin dashboard | When opened (at most once every 10 minutes, and only for people who may edit ratings) and whenever you press **Check for new ratings**, the admin site asks the script for the rows after the last one it saw (that place is remembered on this device), decrypts each code with the named client's secret, and saves the rating exactly as if you had pasted it. Every import is written to the History. |

## What is and is not protected

- **Comments are private.** The code is end-to-end encrypted. The sheet holds only codes.
- **The pick-up key is private.** It is kept in the encrypted settings, never in `brand.json`, never in the History. Anyone who has it can download the (encrypted) codes, so treat it like a password and make a new one (Settings and script both) if you suspect it leaked. Anyone who only knows the web app URL (it is public, anyone can read `brand.json`) can send codes but cannot collect them.
- **Spam.** Someone who knows the URL can fill the sheet with junk. The script accepts only well-formed codes and at most 300 a day; the admin site ignores anything that does not decrypt with a real client's secret and reports it once. A junk code can never become a rating.
- **A rating can be a retry.** Sending the same rating twice keeps one row. A client cannot overwrite a newer rating with an older one.
- **Where the sheet lives.** Rows stay in your Google account until you delete them. Deleting rows does not affect ratings already imported (they are in the encrypted client file). Do not delete rows you have not yet collected, and do not sort the sheet: the admin site remembers its place by row number.

## If it does not work

| Message | Meaning and fix |
|---|---|
| "The inbox refused the pick-up key" | The key in Settings and the key in the script differ, or the script still has the example key. Fix one of them and make a new deployment version. |
| "Could not reach the inbox" | No internet, wrong address, or the deployment's *Who has access* is not **Anyone**. Open the URL in a browser: you should see `{"ok":true,"service":"dusur-inbox"}`. |
| Client sees "Sent, not confirmed" | The request went out but the browser did not show the answer. It is normally fine; check **Check for new ratings**. If nothing arrives, use **Try again** or WhatsApp. |
| Client sees "Not sent yet" | The request did not go out. The rating is kept on that phone; they can try again later. |

## About testing

The automated tests (`tests/e2e/s19_inbox.py`) run the whole round trip against a simulated inbox that behaves like the script: sending, every state the client can see, pulling, remembered place, duplicates, bad codes, wrong key, no connection. The sandbox that built this version cannot reach Google, so **the real Apps Script behaviour (its redirect and its CORS answer) has not been observed**. Step 7 above is that test: do it once after setting up. If a browser refuses to show the script's answer, the client page falls back to a blind send and reports **Sent, not confirmed**, which still delivers.
