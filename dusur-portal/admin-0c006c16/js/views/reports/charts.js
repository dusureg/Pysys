/**
 * <admin>/js/views/reports/charts.js  -  SVG charts
 * Hand-drawn SVG: bars, horizontal bars, lines, donuts. Integer axes for counts. Colours come from PALETTE.
 * Loaded by: admin page
 */
'use strict';

/* ---------------- SVG charts ---------------- */
const SVGNS = 'http://www.w3.org/2000/svg';
function se(tag, attrs, ...kids) {
  const e = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs || {})) if (v != null && v !== false) e.setAttribute(k, v);
  for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) e.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return e;
}
const cShort = (fmt) => (v) => (v == null || !isFinite(v) ? '' : fmt === 'money' ? nf(v, { notation: 'compact', maximumFractionDigits: 1 }) : fmt === 'pct' ? pct(v) : nf(v, { maximumFractionDigits: 1 }));
const cFull = (fmt) => (v) => (fmt === 'money' ? money(v) : cShort(fmt)(v));
const clip = (s, n) => { s = String(s); return s.length > n ? s.slice(0, Math.max(1, n - 1)) + '…' : s; };
const catColor = (c, i) => (c.colors && c.colors[i]) || PALETTE[i % PALETTE.length];
function niceRange(minv, maxv, ticks, whole) {
  minv = Math.min(0, isFinite(minv) ? minv : 0); maxv = Math.max(0, isFinite(maxv) ? maxv : 0);
  if (minv === 0 && maxv === 0) maxv = 1;
  const raw = (maxv - minv) / (ticks || 4), mag = Math.pow(10, Math.floor(Math.log10(raw))), n = raw / mag;
  let step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
  if (whole) step = Math.max(1, Math.ceil(step));
  return { min: Math.floor(minv / step + 1e-9) * step, max: Math.ceil(maxv / step - 1e-9) * step, step };
}
const svgRoot = (W, H, label) => se('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'rp-svg', role: 'img', 'aria-label': label, direction: 'ltr', style: 'direction:ltr' });

function plotFrame(svg, r, x0, x1, y0, y1, fmt) {
  const yv = (v) => y1 - ((v - r.min) / (r.max - r.min)) * (y1 - y0);
  for (let v = r.min; v <= r.max + r.step / 2; v += r.step) {
    svg.append(se('line', { x1: x0, x2: x1, y1: yv(v), y2: yv(v), class: Math.abs(v) < r.step / 1e6 ? 'axis' : 'grid' }),
      se('text', { x: x0 - 6, y: yv(v) + 3.5, 'text-anchor': 'end', class: 'tick' }, cShort(fmt)(v)));
  }
  return yv;
}
function chartVBar(c) {
  const W = 560, H = 250, x0 = 54, x1 = W - 10, y0 = 14, y1 = H - 34, n = c.cats.length, ns = c.series.length;
  const vals = c.series.reduce((a, s) => a.concat(s.values), []), r = niceRange(Math.min.apply(null, vals), Math.max.apply(null, vals), 4, c.fmt === 'int');
  const svg = svgRoot(W, H, c.title), yv = plotFrame(svg, r, x0, x1, y0, y1, c.fmt), gw = (x1 - x0) / n, groupW = Math.min(gw * 0.72, ns * 46), bw = groupW / ns, full = cFull(c.fmt), short = cShort(c.fmt);
  c.cats.forEach((cat, i) => {
    c.series.forEach((s, j) => {
      const v = s.values[i], x = x0 + i * gw + (gw - groupW) / 2 + j * bw, ya = yv(Math.max(v, 0)), yb = yv(Math.min(v, 0)), hgt = Math.max(1, yb - ya);
      svg.append(se('rect', { x: x + 1, y: ya, width: Math.max(1, bw - 2), height: hgt, rx: 2, fill: v < 0 && ns === 1 ? C_NEG : s.color }, se('title', {}, cat + ' · ' + s.name + ': ' + full(v))));
      if (n * ns <= 12) svg.append(se('text', { x: x + bw / 2, y: v >= 0 ? ya - 4 : ya + hgt + 11, 'text-anchor': 'middle', class: 'val' }, short(v)));
    });
    svg.append(se('text', { x: x0 + i * gw + gw / 2, y: y1 + 16, 'text-anchor': 'middle', class: gw < 60 ? 'cat sm' : 'cat' }, clip(cat, Math.max(4, Math.floor(gw / (gw < 60 ? 5.6 : 6.4))))));
  });
  return svg;
}
function chartLine(c) {
  const W = 560, H = 250, x0 = 54, x1 = W - 14, y0 = 16, y1 = H - 34, n = c.cats.length;
  const vals = c.series.reduce((a, s) => a.concat(s.values), []), r = niceRange(Math.min.apply(null, vals), Math.max.apply(null, vals), 4, c.fmt === 'int');
  const svg = svgRoot(W, H, c.title), yv = plotFrame(svg, r, x0, x1, y0, y1, c.fmt), gw = (x1 - x0) / n, xv = (i) => x0 + (i + 0.5) * gw, full = cFull(c.fmt), short = cShort(c.fmt);
  c.series.forEach((s) => {
    svg.append(se('polyline', { points: s.values.map((v, i) => xv(i).toFixed(1) + ',' + yv(v).toFixed(1)).join(' '), fill: 'none', stroke: s.color, 'stroke-width': 2.5, 'stroke-linejoin': 'round' }));
    s.values.forEach((v, i) => {
      svg.append(se('circle', { cx: xv(i), cy: yv(v), r: 3.6, fill: '#fff', stroke: s.color, 'stroke-width': 2 }, se('title', {}, c.cats[i] + ' · ' + s.name + ': ' + full(v))));
      if (n <= 10) svg.append(se('text', { x: xv(i), y: yv(v) - 8, 'text-anchor': 'middle', class: 'val' }, short(v)));
    });
  });
  c.cats.forEach((cat, i) => svg.append(se('text', { x: xv(i), y: y1 + 16, 'text-anchor': 'middle', class: gw < 60 ? 'cat sm' : 'cat' }, clip(cat, Math.max(4, Math.floor(gw / 5.6))))));
  return svg;
}
function chartHBar(c) {
  const s = c.series[0], n = c.cats.length, W = 560, rowH = 26, ml = 150, mr = 58, mt = 6, H = n * rowH + mt + 8, x1 = W - mr;
  const r = niceRange(Math.min.apply(null, s.values), Math.max.apply(null, s.values), 4, c.fmt === 'int'), xv = (v) => ml + ((v - r.min) / (r.max - r.min)) * (x1 - ml), zero = xv(0), full = cFull(c.fmt), short = cShort(c.fmt);
  const svg = svgRoot(W, H, c.title);
  for (let v = r.min; v <= r.max + r.step / 2; v += r.step) svg.append(se('line', { x1: xv(v), x2: xv(v), y1: mt, y2: H - 8, class: Math.abs(v) < r.step / 1e6 ? 'axis' : 'grid' }));
  c.cats.forEach((cat, i) => {
    const v = s.values[i], y = mt + i * rowH + 4, x = Math.min(xv(v), zero), w = Math.max(1, Math.abs(xv(v) - zero));
    svg.append(se('text', { x: ml - 8, y: y + 12, 'text-anchor': 'end', class: 'cat' }, clip(cat, 24)),
      se('rect', { x, y, width: w, height: 16, rx: 3, fill: v < 0 ? C_NEG : s.color }, se('title', {}, cat + ': ' + full(v))),
      se('text', { x: v < 0 ? x - 5 : x + w + 5, y: y + 12, 'text-anchor': v < 0 ? 'end' : 'start', class: 'val' }, short(v)));
  });
  return svg;
}
function chartDonut(c) {
  const s = c.series[0], vals = s.values.map((v) => Math.max(0, v)), total = vals.reduce((a, b) => a + b, 0), S = 180, R = 84, r0 = 52, cx = S / 2, cy = S / 2, full = cFull(c.fmt);
  const svg = svgRoot(S, S, c.title);
  if (total <= 0) { svg.append(se('circle', { cx, cy, r: (R + r0) / 2, fill: 'none', stroke: '#e3e8f0', 'stroke-width': R - r0 })); return { svg, total, vals, full }; }
  let a = -Math.PI / 2;
  vals.forEach((v, i) => {
    if (v <= 0) return;
    const f = v / total, a2 = a + f * 2 * Math.PI, col = catColor(c, i), tip = se('title', {}, c.cats[i] + ': ' + full(v) + ' (' + pct(f) + ')');
    if (f > 0.9999) svg.append(se('circle', { cx, cy, r: (R + r0) / 2, fill: 'none', stroke: col, 'stroke-width': R - r0 }, tip));
    else {
      const p = (ang, rad) => (cx + rad * Math.cos(ang)).toFixed(2) + ' ' + (cy + rad * Math.sin(ang)).toFixed(2), big = a2 - a > Math.PI ? 1 : 0;
      svg.append(se('path', { d: 'M' + p(a, R) + ' A' + R + ' ' + R + ' 0 ' + big + ' 1 ' + p(a2, R) + ' L' + p(a2, r0) + ' A' + r0 + ' ' + r0 + ' 0 ' + big + ' 0 ' + p(a, r0) + ' Z', fill: col, stroke: '#fff', 'stroke-width': 2 }, tip));
    }
    a = a2;
  });
  svg.append(se('text', { x: cx, y: cy + 1, 'text-anchor': 'middle', class: 'center' }, cShort(c.fmt)(total)), se('text', { x: cx, y: cy + 16, 'text-anchor': 'middle', class: 'tick' }, t('rp.col.total')));
  return { svg, total, vals, full };
}
function chartFigure(c) {
  const fig = h('figure', { class: 'rp-chart ' + c.kind }, h('figcaption', {}, c.title));
  if (c.kind === 'donut') {
    const d = chartDonut(c);
    fig.append(h('div', { class: 'donutwrap' }, d.svg, h('ul', { class: 'legend v' }, c.cats.map((cat, i) => (d.vals[i] > 0 ? h('li', {}, h('i', { style: 'background:' + catColor(c, i) }), h('span', { class: 'lb', dir: 'auto' }, cat), h('b', {}, d.full(d.vals[i])), h('span', { class: 'sh' }, pct(d.vals[i] / d.total))) : null)))));
    return fig;
  }
  fig.append((c.kind === 'hbar' ? chartHBar : c.kind === 'line' ? chartLine : chartVBar)(c));
  if (c.series.length > 1) fig.append(h('ul', { class: 'legend' }, c.series.map((s) => h('li', {}, h('i', { style: 'background:' + s.color }), h('span', { dir: 'auto' }, s.name)))));
  return fig;
}
