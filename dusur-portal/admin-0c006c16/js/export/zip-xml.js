/**
 * <admin>/js/export/zip-xml.js  -  minimal .xlsx writer: ZIP + SpreadsheetML
 * CRC-32, ZIP "store" container, sheet and styles XML. No library, no network.
 * Loaded by: admin page
 */
'use strict';

/* =====================================================================
   Excel export: a hand-written .xlsx (ZIP "store" + SpreadsheetML) with native charts and the logo
   ===================================================================== */
const CRC_TBL = (() => { const a = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; a[n] = c >>> 0; } return a; })();
function crc32(u8) { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC_TBL[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function bytesConcat(list) { const out = new Uint8Array(list.reduce((a, x) => a + x.length, 0)); let o = 0; for (const x of list) { out.set(x, o); o += x.length; } return out; }
function zipStore(files) {
  const u16 = (v) => [v & 255, (v >>> 8) & 255], u32 = (v) => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];
  const d = new Date(), dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(), dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const parts = [], central = []; let off = 0;
  for (const f of files) {
    const name = enc.encode(f.name), crc = crc32(f.data), size = f.data.length;
    const head = new Uint8Array([0x50, 0x4b, 3, 4, ...u16(20), ...u16(0x0800), ...u16(0), ...u16(dosTime), ...u16(dosDate), ...u32(crc), ...u32(size), ...u32(size), ...u16(name.length), ...u16(0)]);
    parts.push(head, name, f.data);
    central.push(new Uint8Array([0x50, 0x4b, 1, 2, ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(dosTime), ...u16(dosDate), ...u32(crc), ...u32(size), ...u32(size), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(off)]), name);
    off += head.length + name.length + size;
  }
  const cd = bytesConcat(central), end = new Uint8Array([0x50, 0x4b, 5, 6, 0, 0, 0, 0, ...u16(files.length), ...u16(files.length), ...u32(cd.length), ...u32(off), 0, 0]);
  return bytesConcat(parts.concat([cd, end]));
}

const xe = (s) => String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main', NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
function colName(i) { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }
const serialOf = (day) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(day || ''); return m ? Math.round((Date.UTC(+m[1], +m[2] - 1, +m[3]) - Date.UTC(1899, 11, 30)) / 864e5) : ''; };
const xhex = (c) => c.replace('#', '').toUpperCase();

// fonts: 0 body, 1 header (white bold), 2 bold, 3 title, 4 muted, 5 KPI value, 6 bold red, 7 bold green
const XFONTS = [
  '<font><sz val="11"/><color rgb="FF1A2433"/><name val="Calibri"/><family val="2"/></font>',
  '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>',
  '<font><b/><sz val="11"/><color rgb="FF1A2433"/><name val="Calibri"/><family val="2"/></font>',
  '<font><b/><sz val="18"/><color rgb="FF184F95"/><name val="Calibri"/><family val="2"/></font>',
  '<font><sz val="10"/><color rgb="FF6B7280"/><name val="Calibri"/><family val="2"/></font>',
  '<font><b/><sz val="13"/><color rgb="FF1A2433"/><name val="Calibri"/><family val="2"/></font>',
  '<font><b/><sz val="13"/><color rgb="FFD03B3B"/><name val="Calibri"/><family val="2"/></font>',
  '<font><b/><sz val="13"/><color rgb="FF006300"/><name val="Calibri"/><family val="2"/></font>',
];
const XFILLS = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>',
  '<fill><patternFill patternType="solid"><fgColor rgb="FF184F95"/><bgColor indexed="64"/></patternFill></fill>',
  '<fill><patternFill patternType="solid"><fgColor rgb="FFF3F6FB"/><bgColor indexed="64"/></patternFill></fill>',
  '<fill><patternFill patternType="solid"><fgColor rgb="FFE6EDF7"/><bgColor indexed="64"/></patternFill></fill>'];
const XBORDERS = ['<border><left/><right/><top/><bottom/><diagonal/></border>', '<border><left/><right/><top/><bottom style="thin"><color rgb="FFE1E0D9"/></bottom><diagonal/></border>'];
const XFMT = { gen: 0, int: 3, money: 164, pct: 165, date: 166, dec: 167 };
const KIND_FMT = { money: 'money', pct: 'pct', int: 'int', score: 'dec', qty: 'dec', date: 'date', text: 'gen' };
function xlsxStyles() {
  const list = [], map = new Map();
  const get = (o) => { const x = Object.assign({ font: 0, fill: 0, border: 0, fmt: 'gen', h: '', wrap: false }, o), k = JSON.stringify(x); if (!map.has(k)) { map.set(k, list.length); list.push(x); } return map.get(k); };
  get({});
  const xml = () => XML + '<styleSheet xmlns="' + NS_MAIN + '">'
    + '<numFmts count="4"><numFmt numFmtId="164" formatCode="#,##0.00"/><numFmt numFmtId="165" formatCode="0.0%"/><numFmt numFmtId="166" formatCode="yyyy\\-mm\\-dd"/><numFmt numFmtId="167" formatCode="#,##0.0"/></numFmts>'
    + '<fonts count="' + XFONTS.length + '">' + XFONTS.join('') + '</fonts><fills count="' + XFILLS.length + '">' + XFILLS.join('') + '</fills><borders count="' + XBORDERS.length + '">' + XBORDERS.join('') + '</borders>'
    + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
    + '<cellXfs count="' + list.length + '">' + list.map((x) => '<xf numFmtId="' + XFMT[x.fmt] + '" fontId="' + x.font + '" fillId="' + x.fill + '" borderId="' + x.border + '" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment' + (x.h ? ' horizontal="' + x.h + '"' : '') + ' vertical="center"' + (x.wrap ? ' wrapText="1"' : '') + '/></xf>').join('') + '</cellXfs>'
    + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
  return { get, xml };
}

class XSheet {
  constructor(name) { this.name = name; this.cells = new Map(); this.widths = []; this.heights = new Map(); this.merges = []; this.freeze = 0; this.grid = true; this.drawing = null; }
  put(r, c, v, s) { this.cells.set(r + ',' + c, { r, c, v, s: s || 0 }); }
  xml(rtl, first, footerText) {
    const rows = new Map();
    for (const cell of this.cells.values()) { if (!rows.has(cell.r)) rows.set(cell.r, []); rows.get(cell.r).push(cell); }
    const cellXml = ({ r, c, v, s }) => {
      const ref = colName(c) + (r + 1), st = s ? ' s="' + s + '"' : '';
      if (v === '' || v == null || (typeof v === 'number' && !isFinite(v))) return s ? '<c r="' + ref + '"' + st + '/>' : '';
      if (typeof v === 'number') return '<c r="' + ref + '"' + st + '><v>' + v + '</v></c>';
      return '<c r="' + ref + '"' + st + ' t="inlineStr"><is><t xml:space="preserve">' + xe(v) + '</t></is></c>';
    };
    const data = [...rows.keys()].sort((a, b) => a - b).map((r) => { const ht = this.heights.get(r); return '<row r="' + (r + 1) + '"' + (ht ? ' ht="' + ht + '" customHeight="1"' : '') + '>' + rows.get(r).sort((a, b) => a.c - b.c).map(cellXml).join('') + '</row>'; }).join('');
    const view = '<sheetViews><sheetView workbookViewId="0"' + (rtl ? ' rightToLeft="1"' : '') + (this.grid ? '' : ' showGridLines="0"') + (first ? ' tabSelected="1"' : '') + '>'
      + (this.freeze ? '<pane ySplit="' + this.freeze + '" topLeftCell="A' + (this.freeze + 1) + '" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A' + (this.freeze + 1) + '" sqref="A' + (this.freeze + 1) + '"/>' : '') + '</sheetView></sheetViews>';
    const cols = this.widths.length ? '<cols>' + this.widths.map((w, i) => '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>').join('') + '</cols>' : '';
    const hf = '<headerFooter><oddFooter>' + xe(footerText) + '</oddFooter></headerFooter>';
    return XML + '<worksheet xmlns="' + NS_MAIN + '" xmlns:r="' + NS_R + '"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>' + view + '<sheetFormatPr defaultRowHeight="15"/>' + cols
      + '<sheetData>' + data + '</sheetData>' + (this.merges.length ? '<mergeCells count="' + this.merges.length + '">' + this.merges.map((m) => '<mergeCell ref="' + m + '"/>').join('') + '</mergeCells>' : '')
      + '<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.7" header="0.3" footer="0.3"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/>' + hf
      + (this.drawing ? '<drawing r:id="rId1"/>' : '') + '</worksheet>';
  }
}
