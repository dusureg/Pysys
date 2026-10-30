/**
 * Dusur client inbox  -  Google Apps Script web app (docs/INBOX.md explains every step)
 * Receives the ENCRYPTED rating codes (DSFB1.<client>.<...>) that clients send from the client site, keeps them in this Google Sheet,
 * and hands them to the admin site when it asks with the pick-up key. The script cannot read a rating: each code is encrypted with the
 * client's own secret key, which this script never sees.
 *   POST {v:1, code}                    -> {ok:true}                      (a client sends a rating)
 *   POST {v:1, op:'ping', key}          -> {ok:true, total}               (Settings > "Test the connection")
 *   POST {v:1, op:'pull', key, after}   -> {ok:true, items:[{n,code}], next, total}   (the admin collects; at most 200 per answer)
 */
const PULL_KEY = 'PUT-THE-SAME-KEY-AS-IN-SETTINGS';       // 16 to 64 letters and numbers: the same text as "Pick-up key" in the admin Settings
const PLACEHOLDER = 'PUT-THE-SAME-KEY-AS-IN-SETTINGS';    // do not change this line: it only lets the script refuse the example key above
const DAILY_LIMIT = 300;                                    // most ratings accepted per day, to blunt spam
const PAGE = 200;
const CODE_RE = /^DSFB1\.[A-Za-z0-9_-]{3,40}\.[A-Za-z0-9_-]{20,4000}$/;

function doGet() { return out_({ ok: true, service: 'dusur-inbox' }); }

function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return out_({ ok: false, error: 'bad' }); }
  if (!body || typeof body !== 'object') return out_({ ok: false, error: 'bad' });
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return out_({ ok: false, error: 'busy' });
  try {
    if (body.op === 'ping' || body.op === 'pull') {
      if (PULL_KEY === PLACEHOLDER || !same_(String(body.key || ''), PULL_KEY)) return out_({ ok: false, error: 'key' });
      return body.op === 'ping' ? out_({ ok: true, total: sheet_().getLastRow() }) : pull_(body);
    }
    return add_(body);
  } finally { lock.releaseLock(); }
}

function add_(body) {
  const code = String(body.code || '');
  if (!CODE_RE.test(code)) return out_({ ok: false, error: 'bad' });
  const sh = sheet_();
  if (sh.createTextFinder(code).matchEntireCell(true).findNext()) return out_({ ok: true });      // the same rating sent twice is kept once
  const props = PropertiesService.getScriptProperties(), today = Utilities.formatDate(new Date(), 'UTC', 'yyyy-MM-dd');
  let n = props.getProperty('day') === today ? Number(props.getProperty('n') || 0) : 0;
  if (n >= DAILY_LIMIT) return out_({ ok: false, error: 'limit' });
  props.setProperties({ day: today, n: String(n + 1) });
  sh.appendRow([new Date(), code]);
  return out_({ ok: true });
}

function pull_(body) {
  const sh = sheet_(), last = sh.getLastRow(), after = Math.max(0, parseInt(body.after, 10) || 0);
  const from = after + 1, to = Math.min(last, after + PAGE);
  const items = [];
  if (to >= from) {
    const codes = sh.getRange(from, 2, to - from + 1, 1).getValues();
    for (let i = 0; i < codes.length; i++) items.push({ n: from + i, code: String(codes[i][0]) });
  }
  return out_({ ok: true, items: items, next: items.length ? items[items.length - 1].n : after, total: last });
}

function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName('ratings') || ss.insertSheet('ratings');
}
function same_(a, b) { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }
function out_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
