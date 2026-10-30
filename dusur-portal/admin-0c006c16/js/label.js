/**
 * <admin>/js/label.js  -  labels: the settings of a label and the Code 128 barcode
 * settings.labels = { size: 'sq' (2.5 x 2.5 cm) | 'strip' (2.5 cm tall, any length), length (cm), slogan, fields: [...], copies }.
 * code128Bars(text) gives the bar widths of a Code 128 (set B) barcode: the SKU of a project, readable by any scanner. No library.
 * The screen that shows and prints the labels is views/labels.js.
 * qrMatrix(text) gives the modules of a QR code (byte mode, error correction M, versions 1 to 3) for the same SKU: on a 2.5 cm label a QR code is much easier to scan than a barcode.
 * Loaded by: admin page
 */
'use strict';

const LABEL_FIELDS = ['logo', 'flag', 'clientId', 'clientName', 'sku', 'title', 'piece', 'date', 'qr', 'barcode'];
const LABEL_SIZES = ['sq', 'strip'];
const LABEL_H_MM = 25, LABEL_LEN = { min: 3, max: 30, def: 6 };            // a label is 25 mm tall; a strip may be 3 to 30 cm long
const LABEL_MAX = 400;                                                      // the most labels printed in one go
const defaultLabels = () => ({ size: 'sq', length: LABEL_LEN.def, slogan: 'EGYPT MADE WITH EGYPT', fields: ['logo', 'flag', 'clientId', 'sku', 'title', 'piece'], copies: 1 });
function normLabels(c) {
  const d = defaultLabels(); c = c && typeof c === 'object' ? c : {};
  const len = Number(c.length), cp = Math.round(Number(c.copies));
  const fields = Array.isArray(c.fields) ? LABEL_FIELDS.filter((f) => c.fields.includes(f)) : d.fields;           // in the order of LABEL_FIELDS, no duplicates, nothing unknown
  return { size: LABEL_SIZES.includes(c.size) ? c.size : d.size, length: isFinite(len) && len >= LABEL_LEN.min && len <= LABEL_LEN.max ? Math.round(len * 10) / 10 : d.length,
    slogan: typeof c.slogan === 'string' ? c.slogan.replace(/\s+/g, ' ').trim().slice(0, 40) : d.slogan, fields,
    copies: isFinite(cp) && cp >= 1 && cp <= 20 ? cp : d.copies };
}
// the page the label is printed on: width x height in mm
const labelPageMm = (l) => (l.size === 'strip' ? [Math.round(l.length * 10), LABEL_H_MM] : [LABEL_H_MM, LABEL_H_MM]);

/* =====================================================================
   Code 128, set B (ASCII 32 to 126). Each symbol is six alternating widths (bar, space, ...), the stop symbol seven.
   ===================================================================== */
const C128 = ['212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213', '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221',
  '223211', '221132', '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211', '212123', '212321', '232121', '111323', '131123', '131321', '112313',
  '132113', '132311', '211313', '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331', '231131', '213113', '213311', '213131', '311123', '311321',
  '331121', '312113', '312311', '332111', '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214', '112412', '122114', '122411', '142112', '142211',
  '241211', '221114', '413111', '241112', '134111', '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141', '214121', '412121', '111143', '111341',
  '131141', '114113', '114311', '411113', '411311', '113141', '114131', '311141', '411131', '211412', '211214', '211232', '2331112'];
// text -> { bars: [width in modules, ...] starting with a bar, modules: total width, values: [symbol values] }; characters outside ASCII 32-126 become "-"
function code128Bars(text) {
  const chars = Array.from(String(text == null ? '' : text)).map((ch) => { const c = ch.charCodeAt(0); return c >= 32 && c <= 126 ? c : 45; }).slice(0, 40);
  const values = [104].concat(chars.map((c) => c - 32));
  let sum = 104; for (let i = 1; i < values.length; i++) sum += values[i] * i;
  values.push(sum % 103, 106);
  const bars = []; for (const v of values) for (const ch of C128[v]) bars.push(Number(ch));
  return { bars, modules: bars.reduce((a, b) => a + b, 0), values };
}

/* =====================================================================
   QR code, byte mode, error correction level M, versions 1 to 3 (up to 42 bytes; the text is limited to 40 ASCII characters). One block, so the data
   and error-correction codewords are simply placed one after the other. Written from the QR specification (ISO/IEC 18004); checked in the tests by decoding
   the printed page with a real decoder.
   qrMatrix(text) -> { size, rows: [[true = dark, ...], ...], version }
   ===================================================================== */
const qrMatrix = (() => {
  const CAP = [0, 14, 26, 42], DATA = [0, 16, 28, 44], EC = [0, 10, 16, 26];
  const EXP = [], LOG = [];
  for (let i = 0, x = 1; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 256) x ^= 0x11d; }
  const mul = (a, b) => (a && b ? EXP[(LOG[a] + LOG[b]) % 255] : 0);
  function remainder(data, n) {                                               // Reed-Solomon: the n error-correction codewords of the data
    const g = new Array(n).fill(0); g[n - 1] = 1; let root = 1;
    for (let i = 0; i < n; i++) { for (let j = 0; j < n; j++) { g[j] = mul(g[j], root); if (j + 1 < n) g[j] ^= g[j + 1]; } root = mul(root, 2); }
    const res = new Array(n).fill(0);
    for (const d of data) { const f = d ^ res.shift(); res.push(0); for (let i = 0; i < n; i++) res[i] ^= mul(g[i], f); }
    return res;
  }
  const MASKS = [(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x, y) => x % 3 === 0, (x, y) => (x + y) % 3 === 0, (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
    (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0, (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0];
  function penalty(m, size) {
    let p = 0, dark = 0;
    const line = (get) => {                                                    // rule 1 (runs of 5 or more) and rule 3 (finder-like pattern) along one line
      let run = 1;
      for (let i = 1; i < size; i++) { if (get(i) === get(i - 1)) { run++; if (run === 5) p += 3; else if (run > 5) p++; } else run = 1; }
      const s = Array.from({ length: size }, (_, i) => (get(i) ? 1 : 0)).join('');
      for (const pat of ['10111010000', '00001011101']) { let at = s.indexOf(pat); while (at >= 0) { p += 40; at = s.indexOf(pat, at + 1); } }
    };
    for (let y = 0; y < size; y++) { line((i) => m[y][i]); line((i) => m[i][y]); for (let x = 0; x < size; x++) if (m[y][x]) dark++; }
    for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) if (m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1]) p += 3;      // rule 2
    return p + (Math.ceil(Math.abs(dark * 20 - size * size * 10) / (size * size)) - 1) * 10;                                                                                   // rule 4
  }
  return (text) => {
    const bytes = Array.from(String(text == null ? '' : text)).map((ch) => { const c = ch.charCodeAt(0); return c >= 32 && c <= 126 ? c : 45; }).slice(0, 40);
    const ver = [1, 2, 3].find((v) => bytes.length <= CAP[v]), size = ver * 4 + 17, cap = DATA[ver] * 8;
    const bits = []; const put = (v, n) => { for (let i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1); };
    put(4, 4); put(bytes.length, 8); bytes.forEach((b) => put(b, 8)); put(0, Math.min(4, cap - bits.length)); while (bits.length % 8) bits.push(0);
    const cw = []; for (let i = 0; i < bits.length; i += 8) cw.push(parseInt(bits.slice(i, i + 8).join(''), 2));
    for (let pad = 0xec; cw.length < DATA[ver]; pad ^= 0xec ^ 0x11) cw.push(pad);
    const all = cw.concat(remainder(cw, EC[ver]));
    const m = Array.from({ length: size }, () => new Array(size).fill(false)), fn = Array.from({ length: size }, () => new Array(size).fill(false));
    const set = (x, y, d) => { m[y][x] = d; fn[y][x] = true; };
    for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }                                              // timing
    for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {   // finders and their white border
      const x = cx + dx, y = cy + dy, d = Math.max(Math.abs(dx), Math.abs(dy)); if (x >= 0 && y >= 0 && x < size && y < size) set(x, y, d !== 2 && d !== 4);
    }
    if (ver > 1) { const c = size - 7; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(c + dx, c + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1); }   // the one alignment pattern
    const format = (mask) => {
      const data = (0 << 3) | mask; let rem = data; for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      const bits15 = ((data << 10) | rem) ^ 0x5412, b = (i) => ((bits15 >>> i) & 1) === 1;
      for (let i = 0; i <= 5; i++) set(8, i, b(i)); set(8, 7, b(6)); set(8, 8, b(7)); set(7, 8, b(8)); for (let i = 9; i < 15; i++) set(14 - i, 8, b(i));
      for (let i = 0; i < 8; i++) set(size - 1 - i, 8, b(i)); for (let i = 8; i < 15; i++) set(8, size - 15 + i, b(i)); set(8, size - 8, true);
    };
    format(0);
    let k = 0;                                                                                                                       // the codewords, in two-column zigzag from the bottom right
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let v = 0; v < size; v++) for (let j = 0; j < 2; j++) {
        const x = right - j, y = ((right + 1) & 2) === 0 ? size - 1 - v : v;
        if (!fn[y][x] && k < all.length * 8) { m[y][x] = ((all[k >> 3] >>> (7 - (k & 7))) & 1) === 1; k++; }
      }
    }
    const apply = (mask) => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && MASKS[mask](x, y)) m[y][x] = !m[y][x]; };
    let best = 0, bestP = Infinity;
    for (let mask = 0; mask < 8; mask++) { apply(mask); format(mask); const p = penalty(m, size); if (p < bestP) { bestP = p; best = mask; } apply(mask); }
    apply(best); format(best);
    return { size, rows: m, version: ver };
  };
})();
