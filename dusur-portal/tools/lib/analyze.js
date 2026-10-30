/**
 * tools/lib/analyze.js  -  parses JavaScript files and reports, per file:
 *   syntax    null, or the error message (ES2018 is the ceiling: no ?. ?? etc., so older phones keep working)
 *   declared  top-level names (function / const / let / var / class) with the statement index they appear at
 *   loadRefs  names used while the file is LOADING (top-level code, not inside functions), with the statement index
 * Usage: node --expose-internals tools/lib/analyze.js file1.js file2.js ...   (prints JSON)
 * Uses the acorn parser bundled inside Node. If it is not available the caller skips these checks.
 */
'use strict';
const fs = require('fs');
let acorn;
try { acorn = require('internal/deps/acorn/acorn/dist/acorn'); } catch (e) { console.log(JSON.stringify({ unavailable: String(e.message) })); process.exit(0); }

const FUNC = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);

function patternNames(p, out) {
  if (!p) return;
  if (p.type === 'Identifier') out.push(p.name);
  else if (p.type === 'ObjectPattern') p.properties.forEach((x) => patternNames(x.type === 'RestElement' ? x.argument : x.value, out));
  else if (p.type === 'ArrayPattern') p.elements.forEach((x) => patternNames(x, out));
  else if (p.type === 'AssignmentPattern') patternNames(p.left, out);
  else if (p.type === 'RestElement') patternNames(p.argument, out);
}

// identifiers evaluated at load time inside one top-level statement (function bodies are skipped: they run later)
function refs(node, out) {
  if (!node || typeof node.type !== 'string') return;
  if (FUNC.has(node.type)) return;
  switch (node.type) {
    case 'Identifier': out.push(node.name); return;
    case 'MemberExpression': refs(node.object, out); if (node.computed) refs(node.property, out); return;
    case 'Property': if (node.computed) refs(node.key, out); refs(node.value, out); return;
    case 'VariableDeclarator': if (node.id.type !== 'Identifier') refs(node.id, out); refs(node.init, out); return;
    case 'LabeledStatement': refs(node.body, out); return;
    case 'BreakStatement': case 'ContinueStatement': return;
    case 'ClassDeclaration': case 'ClassExpression': refs(node.superClass, out); return;
  }
  for (const k of Object.keys(node)) {
    const v = node[k];
    if (k === 'type' || k === 'start' || k === 'end' || k === 'loc') continue;
    if (Array.isArray(v)) v.forEach((x) => refs(x, out)); else if (v && typeof v.type === 'string') refs(v, out);
  }
}

const result = {};
for (const file of process.argv.slice(2)) {
  const src = fs.readFileSync(file, 'utf8');
  let ast;
  try { ast = acorn.parse(src, { ecmaVersion: 2018, sourceType: 'script' }); } catch (e) { result[file] = { syntax: e.message, declared: [], loadRefs: [] }; continue; }
  const declared = [], loadRefs = [];
  ast.body.forEach((st, i) => {
    if (st.type === 'FunctionDeclaration') declared.push({ name: st.id.name, kind: 'function', at: i });
    else if (st.type === 'ClassDeclaration') declared.push({ name: st.id.name, kind: 'class', at: i });
    else if (st.type === 'VariableDeclaration') st.declarations.forEach((d) => { const n = []; patternNames(d.id, n); n.forEach((x) => declared.push({ name: x, kind: st.kind, at: i })); });
    if (st.type !== 'FunctionDeclaration') { const o = []; refs(st, o); new Set(o).forEach((name) => loadRefs.push({ name, at: i })); }
  });
  result[file] = { syntax: null, declared, loadRefs };
}
console.log(JSON.stringify(result));
