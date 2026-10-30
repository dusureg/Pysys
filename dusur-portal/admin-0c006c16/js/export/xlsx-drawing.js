/**
 * <admin>/js/export/xlsx-drawing.js  -  native Excel charts and the logo image
 * DrawingML chart XML (bar, hbar, line, doughnut) and the logo rasterised to PNG through a canvas.
 * Loaded by: admin page
 */
'use strict';

/* ---- charts ---- */
const CHART_FMT = { money: '#,##0', pct: '0%', int: '0', score: '0.0' };
const qSheet = (n) => "'" + String(n).replace(/'/g, "''") + "'";
function chartXml(c, ref) {
  const fc = CHART_FMT[c.fmt] || 'General', n = c.cats.length, many = n > 12;
  const strCache = (arr) => '<c:strCache><c:ptCount val="' + arr.length + '"/>' + arr.map((v, i) => '<c:pt idx="' + i + '"><c:v>' + xe(v) + '</c:v></c:pt>').join('') + '</c:strCache>';
  const numCache = (arr) => '<c:numCache><c:formatCode>' + xe(fc) + '</c:formatCode><c:ptCount val="' + arr.length + '"/>' + arr.map((v, i) => '<c:pt idx="' + i + '"><c:v>' + v + '</c:v></c:pt>').join('') + '</c:numCache>';
  const fill = (col) => '<a:solidFill><a:srgbClr val="' + xhex(col) + '"/></a:solidFill>';
  const dl = (pctMode) => '<c:dLbls><c:numFmt formatCode="' + (pctMode ? '0%' : xe(fc)) + '" sourceLinked="0"/><c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr><c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="900"/></a:pPr><a:endParaRPr lang="en-US"/></a:p></c:txPr><c:showLegendKey val="0"/><c:showVal val="' + (pctMode ? 0 : 1) + '"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="' + (pctMode ? 1 : 0) + '"/><c:showBubbleSize val="0"/></c:dLbls>';
  const cat = '<c:cat><c:strRef><c:f>' + xe(ref.cat) + '</c:f>' + strCache(c.cats) + '</c:strRef></c:cat>';
  const ser = (s, i) => {
    const tx = '<c:tx><c:strRef><c:f>' + xe(ref.name[i]) + '</c:f>' + strCache([s.name]) + '</c:strRef></c:tx>';
    const val = '<c:val><c:numRef><c:f>' + xe(ref.val[i]) + '</c:f>' + numCache(s.values) + '</c:numRef></c:val>';
    const head = '<c:idx val="' + i + '"/><c:order val="' + i + '"/>' + tx;
    if (c.kind === 'donut') return '<c:ser>' + head + c.cats.map((_, k) => '<c:dPt><c:idx val="' + k + '"/><c:bubble3D val="0"/><c:spPr>' + fill(catColor(c, k)) + '<a:ln w="19050"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:ln></c:spPr></c:dPt>').join('') + dl(true) + cat + val + '</c:ser>';
    if (c.kind === 'line') return '<c:ser>' + head + '<c:spPr><a:ln w="31750" cap="rnd">' + fill(s.color) + '<a:round/></a:ln></c:spPr><c:marker><c:symbol val="circle"/><c:size val="7"/><c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln w="22225">' + fill(s.color) + '</a:ln></c:spPr></c:marker>' + (many ? '' : dl(false)) + cat + val + '<c:smooth val="0"/></c:ser>';
    return '<c:ser>' + head + '<c:spPr>' + fill(s.color) + '</c:spPr><c:invertIfNegative val="0"/>' + (many ? '' : dl(false)) + cat + val + '</c:ser>';
  };
  const sers = c.series.map(ser).join('');
  const hb = c.kind === 'hbar';
  const axes = '<c:catAx><c:axId val="5001"/><c:scaling><c:orientation val="' + (hb ? 'maxMin' : 'minMax') + '"/></c:scaling><c:delete val="0"/><c:axPos val="' + (hb ? 'l' : 'b') + '"/><c:numFmt formatCode="General" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="low"/><c:spPr><a:ln w="9525"><a:solidFill><a:srgbClr val="C3C2B7"/></a:solidFill></a:ln></c:spPr><c:crossAx val="5002"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>'
    + '<c:valAx><c:axId val="5002"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="' + (hb ? 'b' : 'l') + '"/><c:majorGridlines><c:spPr><a:ln w="6350"><a:solidFill><a:srgbClr val="E1E0D9"/></a:solidFill></a:ln></c:spPr></c:majorGridlines><c:numFmt formatCode="' + xe(fc) + '" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:spPr><a:ln><a:noFill/></a:ln></c:spPr><c:crossAx val="5001"/><c:crosses val="' + (hb ? 'max' : 'autoZero') + '"/><c:crossBetween val="between"/>' + (c.fmt === 'int' && Math.max.apply(null, c.series.reduce((a, s) => a.concat(s.values), [0])) <= 10 ? '<c:majorUnit val="1"/>' : '') + '</c:valAx>';
  let plot;
  if (c.kind === 'donut') plot = '<c:doughnutChart><c:varyColors val="1"/>' + sers + '<c:firstSliceAng val="0"/><c:holeSize val="58"/></c:doughnutChart>';
  else if (c.kind === 'line') plot = '<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>' + sers + '<c:marker val="1"/><c:axId val="5001"/><c:axId val="5002"/></c:lineChart>' + axes;
  else plot = '<c:barChart><c:barDir val="' + (hb ? 'bar' : 'col') + '"/><c:grouping val="clustered"/><c:varyColors val="0"/>' + sers + '<c:gapWidth val="70"/><c:axId val="5001"/><c:axId val="5002"/></c:barChart>' + axes;
  const legend = c.kind === 'donut' || c.series.length > 1 ? '<c:legend><c:legendPos val="' + (c.kind === 'donut' ? 'r' : 'b') + '"/><c:overlay val="0"/></c:legend>' : '';
  return XML + '<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="' + NS_R + '"><c:roundedCorners val="0"/><c:chart>'
    + '<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1200" b="1"/></a:pPr><a:r><a:rPr lang="' + (lang === 'ar' ? 'ar-EG' : 'en-US') + '" sz="1200" b="1"/><a:t>' + xe(c.title) + '</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/>'
    + '<c:plotArea><c:layout/>' + plot + '</c:plotArea>' + legend + '<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart>'
    + '<c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln w="9525"><a:solidFill><a:srgbClr val="E1E0D9"/></a:solidFill></a:ln></c:spPr></c:chartSpace>';
}

/* ---- logo as PNG ---- */
const loadImg = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('img')); i.src = src; });
async function logoPng() {
  try {
    const cv = document.createElement('canvas'); let ctx;
    if (brand.logo) {
      const im = await loadImg(brand.logo), sc = Math.min(1, 160 / im.naturalHeight);
      cv.width = Math.max(1, Math.round(im.naturalWidth * sc)); cv.height = Math.max(1, Math.round(im.naturalHeight * sc));
      ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height); ctx.drawImage(im, 0, 0, cv.width, cv.height);
    } else {
      const mark = await loadImg('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(LOGO_MARK)), name = brandName();
      const m = cv.getContext('2d'); m.font = '800 54px "Segoe UI", system-ui, Arial, sans-serif';
      const tw = Math.ceil(m.measureText(name).width);
      cv.width = 8 + 96 + 22 + tw + 16; cv.height = 112;
      ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.drawImage(mark, 8, 8, 96, 96); ctx.font = '800 54px "Segoe UI", system-ui, Arial, sans-serif'; ctx.fillStyle = '#0d366b'; ctx.textBaseline = 'middle'; ctx.fillText(name, 126, 58);
    }
    const blob = await new Promise((r) => cv.toBlob(r, 'image/png'));
    if (!blob) return null;
    return { bytes: new Uint8Array(await blob.arrayBuffer()), w: cv.width, h: cv.height };
  } catch (_) { return null; }
}
