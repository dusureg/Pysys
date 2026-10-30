/**
 * assets/js/core/brand.js  -  DUSUR logo, public company profile, contact links
 * The default logo, the sanitising whitelist for data/public/brand.json, applyBrand() for the header, wa.me / tel / mailto links,
 * and skuKey() (one-way hash used by the live-search index).
 * Loaded by: both pages
 */
'use strict';

/* =====================================================================
   Brand: DUSUR logo, public company profile (data/public/brand.json), contact links
   ===================================================================== */
const LOGO_MARK = '<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect width="48" height="48" rx="11" fill="#1c5cab"/><path fill="#fff" fill-rule="evenodd" d="M15 11h9.6c7.6 0 12.4 5 12.4 13s-4.8 13-12.4 13H15zm6.2 6v14h3.3c4 0 6.3-2.7 6.3-7s-2.3-7-6.3-7z"/><rect x="9" y="22" width="14" height="4.4" rx="2.2" fill="#eb6834"/></svg>';
const LOGO_FULL = (name) => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 250 56" width="250" height="56"><rect x="4" y="4" width="48" height="48" rx="11" fill="#1c5cab"/><path fill="#fff" fill-rule="evenodd" d="M19 15h9.6c7.6 0 12.4 5 12.4 13s-4.8 13-12.4 13H19zm6.2 6v14h3.3c4 0 6.3-2.7 6.3-7s-2.3-7-6.3-7z"/><rect x="13" y="26" width="14" height="4.4" rx="2.2" fill="#eb6834"/><text x="64" y="38" font-family="Segoe UI, system-ui, Arial, sans-serif" font-size="30" font-weight="800" letter-spacing="3" fill="#0d366b">' +
  String(name).replace(/[<>&"]/g, '') + '</text></svg>';

const BRAND_DEFAULT = () => ({ name: { en: 'DUSUR', ar: 'DUSUR' }, tagline: { en: '', ar: '' }, phone: '', whatsapp: '', email: '', website: '', address: '', logo: '', rating: true, inbox: '', look: { fontEn: 'plex', fontAr: 'plex', accent: '' } });
let brand = BRAND_DEFAULT();

// the only place a client's rating may be posted to: a Google Apps Script web app of the company (see docs/INBOX.md)
const INBOX_RE = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{8,200}\/exec$/;
// Everything that is published in brand.json (and shown to clients) goes through this whitelist.
function sanitizeBrand(j) {
  const d = BRAND_DEFAULT(), s = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
  const bi = (o, dflt) => ({ en: s(o && o.en, 80) || dflt.en, ar: s(o && o.ar, 80) || dflt.ar });
  j = j && typeof j === 'object' ? j : {};
  const logo = s(j.logo, 220000);
  return {
    name: bi(j.name, d.name), tagline: { en: s(j.tagline && j.tagline.en, 120), ar: s(j.tagline && j.tagline.ar, 120) },
    phone: s(j.phone, 30).replace(/[^\d+\s()-]/g, ''), whatsapp: s(j.whatsapp, 20).replace(/\D/g, ''),
    email: /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(s(j.email, 120)) ? s(j.email, 120) : '',
    website: /^https:\/\/[^\s<>"]+$/i.test(s(j.website, 200)) ? s(j.website, 200) : '',
    address: s(j.address, 200),
    logo: /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(logo) ? logo : '',
    rating: j.rating !== false,
    inbox: INBOX_RE.test(s(j.inbox, 300)) ? s(j.inbox, 300) : '',
    look: normLook(j.look),
  };
}
const brandName = () => L(brand.name) || 'DUSUR';
function brandMarkNode(size) {
  if (brand.logo) return h('img', { class: 'brandimg', src: brand.logo, alt: brandName(), style: 'height:' + size + 'px' });
  const s = h('span', { class: 'mark', 'aria-hidden': 'true', style: 'width:' + size + 'px;height:' + size + 'px' }); s.innerHTML = LOGO_MARK; return s;
}
function applyBrand() {
  const m = $('#brandMark'); if (m) m.replaceChildren(brandMarkNode(34));
  const n = $('#brandName'); if (n) n.textContent = brandName();
  applyLook(brand.look);
}
const rawUrl = (where, path) => 'https://raw.githubusercontent.com/' + encodeURIComponent(where.user) + '/' + encodeURIComponent(where.repo) + '/HEAD/' + path.split('/').map(encodeURIComponent).join('/');

// Contact links (client site + feedback delivery)
// A contact card (vCard 3.0, UTF-8) made from the public company profile, for "Save our contact"
const vcEsc = (v) => String(v || '').replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/([,;])/g, '\\$1');
function brandVcard() {
  const b = brand, nm = brandName(), digits = (v) => String(v || '').replace(/[^\d+]/g, ''), wa = String(b.whatsapp || '').replace(/\D/g, '');
  const L = ['BEGIN:VCARD', 'VERSION:3.0', 'FN:' + vcEsc(nm), 'N:' + vcEsc(nm) + ';;;;', 'ORG:' + vcEsc(nm)];
  if (b.phone && digits(b.phone).replace(/\D/g, '').length >= 5) L.push('TEL;TYPE=WORK,VOICE:' + digits(b.phone));
  if (wa.length >= 8 && wa !== digits(b.phone).replace(/\D/g, '')) L.push('TEL;TYPE=CELL:+' + wa);
  if (b.email && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(b.email)) L.push('EMAIL;TYPE=INTERNET,WORK:' + b.email.trim());
  if (b.website && /^https:\/\/[^\s<>"]+$/i.test(b.website)) L.push('URL:' + b.website.trim());
  if (b.address) L.push('ADR;TYPE=WORK:;;' + vcEsc(String(b.address).trim()) + ';;;;');
  L.push('END:VCARD');
  const fold = (line) => { const out = []; let s = line; while (s.length > 70) { out.push(s.slice(0, 70)); s = ' ' + s.slice(70); } out.push(s); return out.join('\r\n'); };
  return L.map(fold).join('\r\n') + '\r\n';
}
const saveContactFile = () => saveBlob(new Blob([brandVcard()], { type: 'text/vcard;charset=utf-8' }), (brandName().replace(/[^\w\u0600-\u06FF -]+/g, '').trim().replace(/\s+/g, '-') || 'contact') + '.vcf');
const waLink = (num, text) => 'https://wa.me/' + String(num).replace(/\D/g, '') + (text ? '?text=' + encodeURIComponent(text) : '');
const telLink = (num) => 'tel:' + String(num).replace(/[^\d+]/g, '');
const mailLink = (to, subject, body) => 'mailto:' + to + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);

// Live search by SKU: the public index only stores a one-way hash of each SKU next to its client id.
async function skuKey(sku) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode('dscl-sku-v1:' + String(sku).trim().toUpperCase())));
  return hex(d).slice(0, 16);
}

// More icons for the client site
Object.assign(ICONS, {
  search: SVG('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>'),
  phone: SVG('<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>'),
  mail: SVG('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>'),
  chat: SVG('<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.9A8 8 0 1 1 21 12z"/>'),
  star: SVG('<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>'),
  refresh: SVG('<path d="M20 11a8 8 0 0 0-14-4L4 9M4 4v5h5M4 13a8 8 0 0 0 14 4l2-2M20 20v-5h-5"/>'),
  shield: SVG('<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2.2 2.2L15.5 10"/>'),
  key: SVG('<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3"/>'),
});

// Rating pipeline: the client's rating travels as an encrypted code, readable only with that client's secret key.
const FB_PREFIX = 'DSFB1.';
const b64url = (b) => b.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = (s) => { s = String(s).replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return s; };
async function makeFeedbackCode(fb, secret, id) {
  const body = { v: 1, id, sku: fb.sku, score: fb.score, comment: fb.comment, at: new Date().toISOString() };
  const cipher = CryptoJS.AES.encrypt(JSON.stringify(body), await clientPassphrase(secret, id)).toString();
  return FB_PREFIX + id + '.' + b64url(cipher);
}
async function readFeedbackCode(code, secret) {
  const m = /^DSFB1\.([A-Za-z0-9_-]{3,40})\.([A-Za-z0-9_-]+)$/.exec(String(code).trim());
  if (!m) return null;
  try {
    const o = JSON.parse(CryptoJS.AES.decrypt(unb64url(m[2]), await clientPassphrase(secret, m[1])).toString(CryptoJS.enc.Utf8));
    return o && o.v === 1 && o.id === m[1] && Number.isInteger(o.score) && o.score >= 1 && o.score <= 10 ? o : null;
  } catch (_) { return null; }
}
