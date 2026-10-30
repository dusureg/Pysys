/**
 * <admin>/js/crypto.js  -  admin-side crypto
 * Secret generation, the password-derived vault key (AES-GCM), the master key wrap, sealing of private records,
 * encrypting the client snapshot (CryptoJS) and photo bytes.
 * Loaded by: admin page
 */
'use strict';

function generateSecret() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 symbols, no look-alikes -> 80 bits
  let s = ''; rand(16).forEach((b, i) => { if (i && i % 4 === 0) s += '-'; s += A[b & 31]; }); return s;
}
async function deriveVaultKey(password, salt) {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITERS }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function vaultSeal(key, plaintext) {
  const iv = rand(12);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plaintext)));
  return { iv: bytesToB64(iv), ct: bytesToB64(ct) };
}
async function vaultOpen(key, sealed) {
  return dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64ToBytes(sealed.iv) }, key, b64ToBytes(sealed.ct)));
}
// master key wrapped by the admin password (stored in the repo so any device with the password can unlock)
async function wrapMaster(password, raw) {
  const salt = rand(16); const kek = await deriveVaultKey(password, salt); const s = await vaultSeal(kek, bytesToB64(raw));
  return { v: 1, salt: bytesToB64(salt), iv: s.iv, ct: s.ct };
}
async function unwrapMaster(password, v) {
  const kek = await deriveVaultKey(password, b64ToBytes(v.salt));
  return b64ToBytes(await vaultOpen(kek, { iv: v.iv, ct: v.ct }));
}
const sealObj = async (obj) => { const s = await vaultSeal(session.master.key, JSON.stringify(obj)); return JSON.stringify({ v: 1, iv: s.iv, ct: s.ct }); };
const openObj = async (text) => JSON.parse(await vaultOpen(session.master.key, JSON.parse(text)));
async function encryptRecord(record, secret) {
  return CryptoJS.AES.encrypt(JSON.stringify(record), await clientPassphrase(secret, record.id)).toString();
}
async function sealBytes(key, bytes) {
  const iv = rand(12); const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes));
  const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12); return out;
}
