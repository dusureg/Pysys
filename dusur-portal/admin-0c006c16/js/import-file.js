/**
 * <admin>/js/import-file.js  -  reading a table from a file: CSV / TSV, JSON and Excel (.xlsx)
 * readTable(file) returns { rows: string[][], sheets?: string[], sheet?: string }: every cell as text, the first row usually holding the column names.
 * The Excel reader is written here (no library): a .xlsx is a zip of XML files, opened with the browser's own DecompressionStream.
 * Nothing leaves the device. Limits (file size, decompressed size, rows) protect the page from a damaged or hostile file.
 * Loaded by: admin page
 */
'use strict';

/* =====================================================================
   Reading CSV, JSON and XLSX
   ===================================================================== */
const IMP_MAX_BYTES = 8 * 1024 * 1024, IMP_MAX_UNZIPPED = 40 * 1024 * 1024, IMP_MAX_ROWS = 5000, IMP_MAX_COLS = 60;

// Western digits for Arabic-Indic and Persian digits, so a number typed on an Arabic keyboard reads as a number
const westDigits = (s) => String(s).replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x660)).replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 0x6f0));

/* ---------------- CSV ---------------- */
function csvDelimiter(text) {
  const line = text.split(/\r?\n/, 1)[0] || '', count = (ch) => { let n = 0, q = false; for (const c of line) { if (c === '"') q = !q; else if (!q && c === ch) n++; } return n; };
  const best = [',', ';', '\t'].map((d) => [d, count(d)]).sort((a, b) => b[1] - a[1])[0];
  return best[1] > 0 ? best[0] : ',';
}
function parseCsv(text) {
  text = String(text).replace(/^﻿/, '');
  const d = csvDelimiter(text), rows = []; let row = [], cell = '', q = false, i = 0;
  const endCell = () => { row.push(cell); cell = ''; }, endRow = () => { endCell(); if (row.some((c) => String(c).trim() !== '')) rows.push(row); row = []; };
  for (; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; continue; }
    if (c === '"' && cell === '') q = true; else if (c === d) endCell(); else if (c === '\n') endRow(); else if (c === '\r') { if (text[i + 1] === '\n') i++; endRow(); } else cell += c;
    if (rows.length > IMP_MAX_ROWS + 1) throw new Error(t('imp.tooMany', { n: nf(IMP_MAX_ROWS) }));
  }
  if (cell !== '' || row.length) endRow();
  return rows;
}

/* ---------------- JSON ---------------- */
// [{...}, {...}] or { items: [...] } (our own files) or { <anything>: [...] }: the keys of the first object become the column names
function jsonRows(text) {
  let data; try { data = JSON.parse(text); } catch (_) { throw new Error(t('imp.badJson')); }
  if (!Array.isArray(data) && data && typeof data === 'object') data = Array.isArray(data.items) ? data.items : Object.values(data).find((v) => Array.isArray(v)) || null;
  if (!Array.isArray(data) || !data.length) throw new Error(t('imp.badJson'));
  if (data.length > IMP_MAX_ROWS) throw new Error(t('imp.tooMany', { n: nf(IMP_MAX_ROWS) }));
  if (Array.isArray(data[0])) return data.map((r) => r.map((c) => (c == null ? '' : typeof c === 'object' ? JSON.stringify(c) : String(c))));
  const keys = []; for (const o of data) if (o && typeof o === 'object') for (const k of Object.keys(o)) if (!keys.includes(k) && keys.length < IMP_MAX_COLS) keys.push(k);
  return [keys].concat(data.map((o) => keys.map((k) => { const v = o ? o[k] : ''; return v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v); })));
}

/* ---------------- XLSX ---------------- */
const le16 = (b, o) => b[o] | (b[o + 1] << 8), le32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
async function inflateRaw(bytes) {
  if (typeof DecompressionStream !== 'function') throw new Error(t('imp.noInflate'));
  const ds = new DecompressionStream('deflate-raw'), w = ds.writable.getWriter();
  w.write(bytes).catch(() => {}); w.close().catch(() => {});
  return new Uint8Array(await new Response(ds.readable).arrayBuffer());
}
// the files of a zip: name -> { method, csize, size, off }
function zipDirectory(b) {
  let e = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 65535); i--) if (le32(b, i) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new Error(t('imp.badXlsx'));
  const count = le16(b, e + 10), cd = le32(b, e + 16), files = new Map(); let p = cd;
  for (let n = 0; n < count && p + 46 <= b.length; n++) {
    if (le32(b, p) !== 0x02014b50) throw new Error(t('imp.badXlsx'));
    const method = le16(b, p + 10), csize = le32(b, p + 20), size = le32(b, p + 24), nl = le16(b, p + 28), el = le16(b, p + 30), cl = le16(b, p + 32), off = le32(b, p + 42);
    files.set(new TextDecoder().decode(b.subarray(p + 46, p + 46 + nl)), { method, csize, size, off });
    p += 46 + nl + el + cl;
  }
  return files;
}
async function zipRead(b, files, name, budget) {
  const f = files.get(name); if (!f) return null;
  if (f.size > IMP_MAX_UNZIPPED || budget.left < f.size) throw new Error(t('imp.bigXlsx'));
  if (le32(b, f.off) !== 0x04034b50) throw new Error(t('imp.badXlsx'));
  const start = f.off + 30 + le16(b, f.off + 26) + le16(b, f.off + 28), raw = b.subarray(start, start + f.csize);
  const out = f.method === 0 ? raw : f.method === 8 ? await inflateRaw(raw) : null;
  if (!out) throw new Error(t('imp.badXlsx'));
  budget.left -= out.length; if (budget.left < 0) throw new Error(t('imp.bigXlsx'));
  return new TextDecoder().decode(out);
}
const xmlDoc = (s) => { const d = new DOMParser().parseFromString(s, 'application/xml'); if (d.querySelector('parsererror')) throw new Error(t('imp.badXlsx')); return d; };
const colIndex = (ref) => { const m = /^([A-Z]+)/.exec(ref || ''); if (!m) return -1; let n = 0; for (const ch of m[1]) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
const xlsxText = (el) => Array.from(el.getElementsByTagName('t')).map((x) => x.textContent).join('');
// returns { sheets: [name...], read(name) -> rows }
async function openXlsx(bytes) {
  const files = zipDirectory(bytes), budget = { left: IMP_MAX_UNZIPPED };
  const wbXml = await zipRead(bytes, files, 'xl/workbook.xml', budget); if (!wbXml) throw new Error(t('imp.badXlsx'));
  const wb = xmlDoc(wbXml), relsXml = await zipRead(bytes, files, 'xl/_rels/workbook.xml.rels', budget), rels = new Map();
  if (relsXml) for (const r of Array.from(xmlDoc(relsXml).getElementsByTagName('Relationship'))) rels.set(r.getAttribute('Id'), r.getAttribute('Target'));
  const sheets = Array.from(wb.getElementsByTagName('sheet')).map((s, i) => {
    const rid = s.getAttribute('r:id') || s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id'), tg = rels.get(rid) || 'worksheets/sheet' + (i + 1) + '.xml';
    return { name: s.getAttribute('name') || 'Sheet' + (i + 1), path: tg.startsWith('/') ? tg.slice(1) : 'xl/' + tg.replace(/^\.?\//, '') };
  });
  if (!sheets.length) throw new Error(t('imp.badXlsx'));
  const ssXml = await zipRead(bytes, files, 'xl/sharedStrings.xml', budget), shared = ssXml ? Array.from(xmlDoc(ssXml).getElementsByTagName('si')).map(xlsxText) : [];
  return {
    sheets: sheets.map((s) => s.name),
    async read(name) {
      const sh = sheets.find((s) => s.name === name) || sheets[0], xml = await zipRead(bytes, files, sh.path, budget); if (!xml) throw new Error(t('imp.badXlsx'));
      const rows = [];
      for (const r of Array.from(xmlDoc(xml).getElementsByTagName('row'))) {
        const row = []; let next = 0;
        for (const c of Array.from(r.getElementsByTagName('c'))) {
          let ci = colIndex(c.getAttribute('r')); if (ci < 0) ci = next; next = ci + 1; if (ci >= IMP_MAX_COLS) continue;
          const type = c.getAttribute('t'), v = c.getElementsByTagName('v')[0];
          let val = '';
          if (type === 'inlineStr') val = xlsxText(c); else if (v) val = type === 's' ? shared[Number(v.textContent)] || '' : type === 'b' ? (v.textContent === '1' ? 'TRUE' : 'FALSE') : v.textContent;
          row[ci] = val;
        }
        for (let i = 0; i < row.length; i++) if (row[i] === undefined) row[i] = '';
        if (row.some((x) => String(x).trim() !== '')) rows.push(row);
        if (rows.length > IMP_MAX_ROWS + 1) throw new Error(t('imp.tooMany', { n: nf(IMP_MAX_ROWS) }));
      }
      return rows;
    },
  };
}

/* ---------------- one entry point ---------------- */
// { kind: 'csv' | 'json' | 'xlsx', rows, sheets?, sheet?, book? }. For a workbook with several sheets the first is read; readSheet() reads another.
async function readTable(file) {
  if (!file) throw new Error(t('imp.noFile'));
  if (file.size > IMP_MAX_BYTES) throw new Error(t('imp.bigFile', { n: nf(Math.round(IMP_MAX_BYTES / 1048576)) }));
  const name = String(file.name || '').toLowerCase(), bytes = new Uint8Array(await file.arrayBuffer());
  if (/\.xlsx$/.test(name) || (bytes[0] === 0x50 && bytes[1] === 0x4b)) {
    const book = await openXlsx(bytes), first = book.sheets[0];
    return { kind: 'xlsx', rows: await book.read(first), sheets: book.sheets, sheet: first, book };
  }
  if (/\.xls$/.test(name)) throw new Error(t('imp.oldXls'));
  const text = new TextDecoder('utf-8').decode(bytes);
  if (/\.json$/.test(name) || /^\s*[[{]/.test(text)) return { kind: 'json', rows: jsonRows(text) };
  return { kind: 'csv', rows: parseCsv(text) };
}

/* ---------------- values: numbers, dates, words ---------------- */
// "1,234.50", "1.234,50", "٣٫٥", "12 " -> number; '' when it is not a number
function numFrom(v) {
  let s = westDigits(v).replace(/[\s ]/g, '').replace(/[٫]/g, '.').replace(/[٬]/g, ',');
  if (!s) return '';
  s = s.replace(/^[^\d.,+-]+|[^\d.,]+$/g, '');
  const lc = s.lastIndexOf(','), ld = s.lastIndexOf('.');
  if (lc >= 0 && ld >= 0) s = lc > ld ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (lc >= 0) s = /^-?\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  else if ((s.match(/\./g) || []).length > 1) s = s.replace(/\./g, '');
  const n = Number(s); return s !== '' && isFinite(n) ? n : '';
}
// 2026-10-24 · 24/10/2026 · 24-10-26 · 2026/10/24 · an Excel serial number (45000) -> 'YYYY-MM-DD', or '' when it is not a date
function dayFrom(v) {
  const s = westDigits(v).trim(); if (!s) return '';
  let y, m, d, x;
  if ((x = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s))) { y = +x[1]; m = +x[2]; d = +x[3]; }
  else if ((x = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/.exec(s))) { d = +x[1]; m = +x[2]; y = +x[3]; if (y < 100) y += 2000; }
  else if (/^\d{5}(\.\d+)?$/.test(s) && +s > 20000 && +s < 80000) { const dt = new Date(Date.UTC(1899, 11, 30) + Math.floor(+s) * 86400000); y = dt.getUTCFullYear(); m = dt.getUTCMonth() + 1; d = dt.getUTCDate(); }
  else return '';
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d ? y + '-' + pad2(m) + '-' + pad2(d) : '';
}
const wordKey = (s) => westDigits(s).toLowerCase().normalize('NFKC').replace(/[ً-ٟـ]/g, '').replace(/[^a-z0-9؀-ۿ]+/g, '');
const boolFrom = (v) => { const k = wordKey(v); if (['1', 'true', 'yes', 'y', 'active', 'نعم', 'فعال', 'نشط', 'ايوه', 'اه'].includes(k)) return true; if (['0', 'false', 'no', 'n', 'inactive', 'لا', 'غيرفعال', 'متوقف', 'موقوف'].includes(k)) return false; return null; };
// rows as CSV text (for the blank templates and the list of rejected rows); the BOM lets Excel read Arabic correctly
const csvCell = (v) => { v = String(v == null ? '' : v); return /[",;\n\r\t]/.test(v) || /^\s|\s$/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
const toCsv = (rows) => '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
