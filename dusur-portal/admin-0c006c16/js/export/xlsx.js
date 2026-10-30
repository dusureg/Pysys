/**
 * <admin>/js/export/xlsx.js  -  workbook builder
 * Summary sheet, one sheet per table, one Charts sheet; RTL sheet view for Arabic; footer with the date.
 * Loaded by: admin page
 */
'use strict';

/* ---- workbook ---- */
async function buildXlsx(m) {
  const st = xlsxStyles(), rtl = m.lang === 'ar', sheets = [], used = new Set(), logo = await logoPng();
  const sheetName = (base) => {
    let n = String(base).replace(/[\\/?*[\]:]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31) || 'Sheet', k = 2, cand = n;
    while (used.has(cand.toLowerCase())) { const suf = ' ' + k++; cand = n.slice(0, 31 - suf.length) + suf; }
    used.add(cand.toLowerCase()); return cand;
  };
  const S = { title: st.get({ font: 3 }), muted: st.get({ font: 4 }), bold: st.get({ font: 2 }), head: st.get({ font: 1, fill: 2, wrap: true, h: 'center' }), headN: st.get({ font: 1, fill: 2, wrap: true, h: 'center' }), kpiLabel: st.get({ font: 2, fill: 3, border: 1 }), note: st.get({ font: 4, border: 1, wrap: true }) };
  const width = (rows, header, i) => Math.min(60, Math.max(10, Math.ceil(Math.max(String(header).length, ...rows.map((r) => String(r[i] == null ? '' : typeof r[i] === 'number' ? nf(r[i], { maximumFractionDigits: 2 }) : r[i]).length)) * 1.12 + 3)));
  const fe = (x) => String(x).replace(/&/g, '&&');           // a literal & inside a header/footer must be doubled
  const footerText = '&L' + fe(brandName()) + '&C' + fe(m.title) + '&R&D';

  // ---- Summary
  const sum = new XSheet(sheetName(t('rp.sheet.summary'))); sum.grid = false; sum.widths = [34, 26, 30, 14, 14, 14]; sheets.push(sum);
  [0, 1, 2].forEach((r) => sum.heights.set(r, 20));
  sum.put(4, 0, m.title, S.title); sum.heights.set(4, 28); sum.merges.push('A5:F5');
  [[t('rp.scope'), m.scope], [t('rp.period'), m.period], [t('rp.generated'), fmtDateTime(m.generated.toISOString())]].forEach(([k, v], i) => { sum.put(5 + i, 0, k, S.bold); sum.put(5 + i, 1, v, 0); });
  let r = 9;
  if (m.empty) { sum.put(r, 0, emptyText(m), S.muted); r += 2; }
  if (m.kpis.length) {
    ['rp.sheet.metric', 'rp.sheet.value', 'rp.sheet.note'].forEach((k, i) => sum.put(r, i, t(k), S.head)); r++;
    for (const k of m.kpis) {
      const font = k.tone === 'neg' ? 6 : k.tone === 'pos' ? 7 : 5;
      sum.put(r, 0, k.label, S.kpiLabel); sum.put(r, 1, typeof k.v === 'number' && isFinite(k.v) ? k.v : '', st.get({ font, fill: 3, border: 1, fmt: KIND_FMT[k.kind] || 'gen', h: 'right' })); sum.put(r, 2, k.sub || '', S.note); r++;
    }
  }
  r++;
  const contact = [brand.phone, brand.email, brand.website, brand.address].filter(Boolean).join('  ·  '), foot = L(session.settings.reportFooter);
  if (contact) sum.put(r++, 0, contact, S.muted);
  if (foot) sum.put(r++, 0, foot, S.muted);
  sum.put(r++, 0, (m.private ? t('rp.confidential') + '  ·  ' : '') + brandName() + '  ·  ' + fmtDay(todayStr()), S.muted);

  // ---- Charts (data blocks + native charts)
  let chartSheet = null; const chartDefs = [];
  if (m.charts.length) {
    chartSheet = new XSheet(sheetName(t('rp.sheet.charts'))); chartSheet.widths = [30, 16, 16, 16, 4]; sheets.push(chartSheet);
    m.charts.forEach((c, i) => {
      const r0 = i * 20, n = c.cats.length, q = qSheet(chartSheet.name), first = r0 + 3;
      chartSheet.put(r0, 0, c.title, S.bold);
      chartSheet.put(r0 + 1, 0, t('rp.col.cat'), S.head);
      c.series.forEach((s, j) => chartSheet.put(r0 + 1, 1 + j, s.name, S.headN));
      c.cats.forEach((cat, k) => {
        chartSheet.put(r0 + 2 + k, 0, cat, st.get({ border: 1, fill: k % 2 ? 3 : 0 }));
        c.series.forEach((s, j) => chartSheet.put(r0 + 2 + k, 1 + j, s.values[k], st.get({ border: 1, fill: k % 2 ? 3 : 0, fmt: c.fmt === 'money' ? 'money' : c.fmt === 'pct' ? 'pct' : c.fmt === 'score' ? 'dec' : 'int' })));
      });
      const L1 = (col) => q + '!$' + col + '$' + first + ':$' + col + '$' + (first + n - 1);
      chartDefs.push({ c, r0, ref: { cat: L1('A'), name: c.series.map((_, j) => q + '!$' + colName(1 + j) + '$' + (r0 + 2)), val: c.series.map((_, j) => L1(colName(1 + j))) } });
    });
  }

  // ---- one sheet per table
  for (const tb of m.tables) {
    const sh = new XSheet(sheetName(tb.title)); sheets.push(sh);
    sh.put(0, 0, tb.title, S.title); sh.heights.set(0, 28); sh.put(1, 0, m.scope + '  ·  ' + m.period, S.muted);
    tb.cols.forEach((c, i) => sh.put(3, i, c.h, S.head)); sh.heights.set(3, 32);
    tb.rows.forEach((row, ri) => row.forEach((v, i) => {
      const c = tb.cols[i], z = ri % 2 ? 3 : 0;
      const val = c.kind === 'date' ? serialOf(v) : (c.kind === 'text' ? (v == null ? '' : String(v)) : (v === '' || v == null ? '' : Number(v)));
      sh.put(4 + ri, i, val, st.get({ border: 1, fill: z, fmt: KIND_FMT[c.kind] || 'gen', wrap: !!c.wide, h: c.kind === 'text' || c.kind === 'date' ? '' : 'right' }));
    }));
    if (tb.foot) tb.foot.forEach((v, i) => { const c = tb.cols[i]; sh.put(4 + tb.rows.length, i, c.kind === 'text' || (typeof v === 'string' && !isFinite(Number(v))) ? v : (v === '' || v == null ? '' : Number(v)), st.get({ font: 2, fill: 4, border: 1, fmt: KIND_FMT[c.kind] || 'gen', h: c.kind === 'text' ? '' : 'right' })); });
    sh.widths = tb.cols.map((c, i) => (c.wide ? 60 : width(tb.rows.concat(tb.foot ? [tb.foot] : []), c.h, i)));
    sh.freeze = 4;
  }

  // ---- parts
  const files = [], ct = [], put = (name, text) => files.push({ name, data: typeof text === 'string' ? enc.encode(text) : text });
  let nDraw = 0, nChart = 0;
  const anchorEmu = (px) => Math.round(px * 9525);
  sheets.forEach((sh, i) => {
    const rels = [];
    const addDrawing = (inner, drels) => {
      const dn = ++nDraw;
      put('xl/drawings/drawing' + dn + '.xml', XML + '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="' + NS_R + '" xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart">' + inner + '</xdr:wsDr>');
      put('xl/drawings/_rels/drawing' + dn + '.xml.rels', XML + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + drels + '</Relationships>');
      ct.push('<Override PartName="/xl/drawings/drawing' + dn + '.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>');
      sh.drawing = true; rels.push('<Relationship Id="rId1" Type="' + REL + 'drawing" Target="../drawings/drawing' + dn + '.xml"/>');
    };
    if (sh === sum && logo) {
      const dh = 52, dw = Math.round((logo.w * dh) / logo.h);
      addDrawing('<xdr:oneCellAnchor><xdr:from><xdr:col>0</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>38100</xdr:rowOff></xdr:from><xdr:ext cx="' + anchorEmu(dw) + '" cy="' + anchorEmu(dh) + '"/>'
        + '<xdr:pic><xdr:nvPicPr><xdr:cNvPr id="2" name="Logo" descr="' + xe(brandName()) + '"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>'
        + '<xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + anchorEmu(dw) + '" cy="' + anchorEmu(dh) + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor>',
        '<Relationship Id="rId1" Type="' + REL + 'image" Target="../media/logo.png"/>');
    }
    if (sh === chartSheet) {
      let inner = '', drels = '';
      chartDefs.forEach((d, k) => {
        const cn = ++nChart;
        put('xl/charts/chart' + cn + '.xml', chartXml(d.c, d.ref));
        ct.push('<Override PartName="/xl/charts/chart' + cn + '.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>');
        drels += '<Relationship Id="rId' + (k + 1) + '" Type="' + REL + 'chart" Target="../charts/chart' + cn + '.xml"/>';
        inner += '<xdr:twoCellAnchor><xdr:from><xdr:col>5</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>' + d.r0 + '</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>15</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>' + (d.r0 + 18) + '</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>'
          + '<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="' + (k + 2) + '" name="Chart ' + (k + 1) + '" descr="' + xe(d.c.title) + '"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart r:id="rId' + (k + 1) + '"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>';
      });
      addDrawing(inner, drels);
    }
    put('xl/worksheets/sheet' + (i + 1) + '.xml', sh.xml(rtl, i === 0, footerText));
    if (rels.length) put('xl/worksheets/_rels/sheet' + (i + 1) + '.xml.rels', XML + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + rels.join('') + '</Relationships>');
    ct.push('<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>');
  });
  if (logo) put('xl/media/logo.png', logo.bytes);
  put('xl/styles.xml', st.xml());
  put('xl/workbook.xml', XML + '<workbook xmlns="' + NS_MAIN + '" xmlns:r="' + NS_R + '"><bookViews><workbookView/></bookViews><sheets>' + sheets.map((s, i) => '<sheet name="' + xe(s.name) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>').join('') + '</sheets></workbook>');
  put('xl/_rels/workbook.xml.rels', XML + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + sheets.map((_, i) => '<Relationship Id="rId' + (i + 1) + '" Type="' + REL + 'worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>').join('') + '<Relationship Id="rId' + (sheets.length + 1) + '" Type="' + REL + 'styles" Target="styles.xml"/></Relationships>');
  put('docProps/core.xml', XML + '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>' + xe(m.title) + '</dc:title><dc:creator>' + xe(brandName()) + '</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">' + m.generated.toISOString().replace(/\.\d+Z$/, 'Z') + '</dcterms:created></cp:coreProperties>');
  put('_rels/.rels', XML + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="' + REL + 'officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>');
  put('[Content_Types].xml', XML + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/>'
    + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' + ct.join('') + '</Types>');
  // [Content_Types].xml first, as Office writes it
  files.unshift(files.pop());
  return zipStore(files);
}
