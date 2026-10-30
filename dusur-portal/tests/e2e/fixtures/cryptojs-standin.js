/* TEST-ONLY stand-in for CryptoJS.AES passphrase mode (OpenSSL "Salted__" format, MD5 EVP_BytesToKey, AES-256-CBC, PKCS7).
   Exposes just what index.html uses: CryptoJS.AES.encrypt(str, pass).toString(), CryptoJS.AES.decrypt(b64, pass).toString(CryptoJS.enc.Utf8). */
(function (g) {
  function md5(msg) {
    const K = new Uint32Array(64);
    const S = [7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22,5,9,14,20,5,9,14,20,5,9,14,20,5,9,14,20,4,11,16,23,4,11,16,23,4,11,16,23,4,11,16,23,6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21];
    for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296);
    const len = msg.length, total = (((len + 8) >>> 6) + 1) << 6;
    const buf = new Uint8Array(total); buf.set(msg); buf[len] = 0x80;
    const dv = new DataView(buf.buffer);
    dv.setUint32(total - 8, (len * 8) >>> 0, true); dv.setUint32(total - 4, Math.floor(len / 0x20000000), true);
    let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
    for (let off = 0; off < total; off += 64) {
      const M = new Uint32Array(16); for (let i = 0; i < 16; i++) M[i] = dv.getUint32(off + i * 4, true);
      let A = a0, B = b0, C = c0, D = d0;
      for (let i = 0; i < 64; i++) {
        let F, k;
        if (i < 16) { F = (B & C) | (~B & D); k = i; }
        else if (i < 32) { F = (D & B) | (~D & C); k = (5 * i + 1) % 16; }
        else if (i < 48) { F = B ^ C ^ D; k = (3 * i + 5) % 16; }
        else { F = C ^ (B | ~D); k = (7 * i) % 16; }
        F = (F + A + K[i] + M[k]) >>> 0;
        A = D; D = C; C = B;
        B = (B + ((F << S[i]) | (F >>> (32 - S[i])))) >>> 0;
      }
      a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
    }
    const out = new Uint8Array(16), o = new DataView(out.buffer);
    o.setUint32(0, a0, true); o.setUint32(4, b0, true); o.setUint32(8, c0, true); o.setUint32(12, d0, true);
    return out;
  }

  const SBOX = new Uint8Array(256), INV = new Uint8Array(256);
  (function () {
    const rotl = (x, n) => ((x << n) | (x >> (8 - n))) & 0xff;
    let p = 1, q = 1;
    do {
      p = (p ^ (p << 1) ^ (p & 0x80 ? 0x11b : 0)) & 0xff;
      q = (q ^ (q << 1)) & 0xff; q = (q ^ (q << 2)) & 0xff; q = (q ^ (q << 4)) & 0xff;
      if (q & 0x80) q ^= 0x09;
      SBOX[p] = (q ^ rotl(q, 1) ^ rotl(q, 2) ^ rotl(q, 3) ^ rotl(q, 4) ^ 0x63) & 0xff;
    } while (p !== 1);
    SBOX[0] = 0x63;
    for (let i = 0; i < 256; i++) INV[SBOX[i]] = i;
  })();
  const xt = (a) => ((a << 1) ^ (a & 0x80 ? 0x1b : 0)) & 0xff;
  const mul = (a, b) => { let r = 0; while (b) { if (b & 1) r ^= a; a = xt(a); b >>= 1; } return r; };

  function expandKey(key) {
    const w = new Uint8Array(240); w.set(key);
    let rcon = 1;
    for (let i = 8; i < 60; i++) {
      let t = Array.from(w.slice((i - 1) * 4, i * 4));
      if (i % 8 === 0) { t = [SBOX[t[1]] ^ rcon, SBOX[t[2]], SBOX[t[3]], SBOX[t[0]]]; rcon = xt(rcon); }
      else if (i % 8 === 4) t = t.map((x) => SBOX[x]);
      for (let j = 0; j < 4; j++) w[i * 4 + j] = w[(i - 8) * 4 + j] ^ t[j];
    }
    return w;
  }
  const addRK = (s, w, r) => { for (let i = 0; i < 16; i++) s[i] ^= w[r * 16 + i]; };
  function shiftRows(s, inv) {
    const o = s.slice();
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
      if (inv) s[r + 4 * ((c + r) % 4)] = o[r + 4 * c]; else s[r + 4 * c] = o[r + 4 * ((c + r) % 4)];
    }
  }
  function mixCols(s, inv) {
    const m = inv ? [14, 11, 13, 9] : [2, 3, 1, 1];
    for (let c = 0; c < 4; c++) {
      const a = [s[4 * c], s[4 * c + 1], s[4 * c + 2], s[4 * c + 3]];
      for (let r = 0; r < 4; r++) {
        s[4 * c + r] = mul(a[0], m[(4 - r) % 4]) ^ mul(a[1], m[(5 - r) % 4]) ^ mul(a[2], m[(6 - r) % 4]) ^ mul(a[3], m[(7 - r) % 4]);
      }
    }
  }
  function encBlock(blk, w) {
    const s = blk.slice(); addRK(s, w, 0);
    for (let r = 1; r < 14; r++) { for (let i = 0; i < 16; i++) s[i] = SBOX[s[i]]; shiftRows(s); mixCols(s); addRK(s, w, r); }
    for (let i = 0; i < 16; i++) s[i] = SBOX[s[i]]; shiftRows(s); addRK(s, w, 14);
    return s;
  }
  function decBlock(blk, w) {
    const s = blk.slice(); addRK(s, w, 14);
    for (let r = 13; r >= 1; r--) { shiftRows(s, true); for (let i = 0; i < 16; i++) s[i] = INV[s[i]]; addRK(s, w, r); mixCols(s, true); }
    shiftRows(s, true); for (let i = 0; i < 16; i++) s[i] = INV[s[i]]; addRK(s, w, 0);
    return s;
  }

  function evp(pass, salt) { // EVP_BytesToKey, MD5, 1 iteration -> 32 byte key + 16 byte iv
    const p = new TextEncoder().encode(pass); let prev = new Uint8Array(0); const out = [];
    while (out.length < 48) {
      const inp = new Uint8Array(prev.length + p.length + salt.length);
      inp.set(prev); inp.set(p, prev.length); inp.set(salt, prev.length + p.length);
      prev = md5(inp); out.push(...prev);
    }
    return { key: Uint8Array.from(out.slice(0, 32)), iv: Uint8Array.from(out.slice(32, 48)) };
  }
  const b64 = (u8) => { let s = ''; u8.forEach((b) => { s += String.fromCharCode(b); }); return btoa(s); };
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

  const Utf8 = { name: 'utf8' };
  function WA(bytes) { this.bytes = bytes; }
  WA.prototype.toString = function (enc) {
    if (enc === Utf8) return new TextDecoder('utf-8', { fatal: true }).decode(this.bytes); // throws on malformed, like CryptoJS
    return Array.from(this.bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  };

  g.CryptoJS = {
    enc: { Utf8 },
    AES: {
      encrypt(str, pass) {
        const salt = crypto.getRandomValues(new Uint8Array(8)), { key, iv } = evp(pass, salt), w = expandKey(key);
        const data = new TextEncoder().encode(str), pad = 16 - (data.length % 16);
        const pt = new Uint8Array(data.length + pad); pt.set(data); pt.fill(pad, data.length);
        const ct = new Uint8Array(pt.length); let prev = iv;
        for (let o = 0; o < pt.length; o += 16) {
          const blk = pt.slice(o, o + 16).map((b, i) => b ^ prev[i]); prev = encBlock(blk, w); ct.set(prev, o);
        }
        const all = new Uint8Array(16 + ct.length); all.set(new TextEncoder().encode('Salted__')); all.set(salt, 8); all.set(ct, 16);
        return { toString: () => b64(all) };
      },
      decrypt(s, pass) {
        const all = unb64(s);
        if (new TextDecoder().decode(all.slice(0, 8)) !== 'Salted__') return new WA(new Uint8Array(0));
        const { key, iv } = evp(pass, all.slice(8, 16)), w = expandKey(key), ct = all.slice(16);
        if (ct.length % 16 || !ct.length) return new WA(new Uint8Array(0));
        const pt = new Uint8Array(ct.length); let prev = iv;
        for (let o = 0; o < ct.length; o += 16) {
          const blk = ct.slice(o, o + 16), d = decBlock(blk, w); pt.set(d.map((b, i) => b ^ prev[i]), o); prev = blk;
        }
        const pad = pt[pt.length - 1];
        if (pad < 1 || pad > 16) return new WA(new Uint8Array(0)); // wrong key
        for (let i = 1; i <= pad; i++) if (pt[pt.length - i] !== pad) return new WA(new Uint8Array(0));
        return new WA(pt.slice(0, pt.length - pad));
      },
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
