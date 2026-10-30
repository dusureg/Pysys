/**
 * assets/js/core/crypto.js  -  client-side crypto: decrypting a client snapshot and its photos
 * Byte/base64 helpers, PBKDF2 key stretching, CryptoJS AES decrypt of data/clients/<id>.json, AES-GCM photo key.
 * The encrypting counterparts live in admin/js/crypto.js. CryptoJS itself is loaded by assets/js/guard.js.
 * Loaded by: both pages
 */
'use strict';

/* =====================================================================
   Bytes & crypto
   ===================================================================== */
const enc = new TextEncoder(), dec = new TextDecoder();
const bytesToB64 = (bytes) => { let s = ''; const CH = 0x8000; for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH)); return btoa(s); };
const b64ToBytes = (b64) => Uint8Array.from(atob(String(b64).replace(/\s+/g, '')), (c) => c.charCodeAt(0));
const textToB64 = (s) => bytesToB64(enc.encode(s));
const b64ToText = (b) => dec.decode(b64ToBytes(b));
const rand = (n) => crypto.getRandomValues(new Uint8Array(n));
const hex = (u8) => Array.from(u8, (b) => b.toString(16).padStart(2, '0')).join('');
const normSecret = (s) => String(s == null ? '' : s).normalize('NFKC').trim();
async function pbkdf2Bits(secret, salt) {
  const base = await crypto.subtle.importKey('raw', enc.encode(secret), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITERS }, base, 256);
}
// Client snapshot: AES-256 via CryptoJS; the key is stretched with PBKDF2 (salted by the client id) first.
async function clientPassphrase(secret, id) { return hex(new Uint8Array(await pbkdf2Bits(normSecret(secret), enc.encode('dscl-v1:' + id)))); }
async function decryptRecord(cipher, secret, id) {
  try {
    if (!normSecret(secret)) return null;
    const text = CryptoJS.AES.decrypt(String(cipher), await clientPassphrase(secret, id)).toString(CryptoJS.enc.Utf8);
    if (!text) return null;
    const rec = JSON.parse(text);
    return rec && /^dscl\/[12]$/.test(rec.schema) && rec.id === id ? rec : null;
  } catch (_) { return null; }
}
// Photos: AES-256-GCM, separate key derivation from the same client secret.
const imgKeys = new Map();
async function imageKey(secret, cid) {
  const k = cid + '|' + secret;
  if (!imgKeys.has(k)) imgKeys.set(k, crypto.subtle.importKey('raw', await pbkdf2Bits(normSecret(secret), enc.encode('dscl-img-v1:' + cid)), 'AES-GCM', false, ['encrypt', 'decrypt']));
  return imgKeys.get(k);
}
const openBytes = async (key, bytes) => new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12) }, key, bytes.slice(12)));
