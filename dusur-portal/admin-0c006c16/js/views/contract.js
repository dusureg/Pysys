/**
 * <admin>/js/views/contract.js  -  printable client contract
 * #contract/<client id>/<project number>: contract options, an A4 paper with the logo, parties, work, price and payments, the standard clauses and,
 * LAST on the paper, the signature block with the owner's signature. Arabic, English or both side by side. Print / Save as PDF through the browser.
 * The contract and the signature exist only in the admin site (private record and encrypted settings): nothing here is ever published to a client.
 * Loaded by: admin page
 */
'use strict';

/* =====================================================================
   Helpers that take the language explicitly: the paper can be Arabic or English whatever language the screen is in.
   ===================================================================== */
const tl = (l, key, vars) => {
  let s = I18N[l][key]; if (s === undefined) s = I18N.en[key]; if (s === undefined) return key;
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m)) : s;
};
const Lx = (v, l) => (v && typeof v === 'object' ? (v[l] || v.en || v.ar || '') : (v == null ? '' : String(v)));
const cLoc = (l) => (l === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB');
const cNum = (n, l) => new Intl.NumberFormat(cLoc(l), { maximumFractionDigits: 2 }).format(n);
function cMoney(n, l) { try { return new Intl.NumberFormat(cLoc(l), { style: 'currency', currency: CUR, maximumFractionDigits: 2 }).format(n); } catch (_) { return cNum(n, l) + ' ' + CUR; } }
function cDayShort(s, l) { const d = parseDay(s); return d ? d.toLocaleDateString(cLoc(l), { day: 'numeric', month: 'short', year: 'numeric' }) : '—'; }
function cDay(s, l) { const d = parseDay(s); return d ? d.toLocaleDateString(cLoc(l), { day: 'numeric', month: 'long', year: 'numeric' }) : '—'; }
// "12 months" is written as "one year"; Arabic uses the right number form (شهر، شهران، 3 أشهر ... 11 شهرًا)
function monthsText(n, l) {
  if (n >= 12 && n % 12 === 0) {
    const y = n / 12;
    return l === 'ar' ? (y === 1 ? 'سنة واحدة' : y === 2 ? 'سنتين' : y <= 10 ? cNum(y, l) + ' سنوات' : cNum(y, l) + ' سنة') : (y === 1 ? '1 year' : cNum(y, l) + ' years');
  }
  return l === 'ar' ? (n === 1 ? 'شهر واحد' : n === 2 ? 'شهرين' : n <= 10 ? cNum(n, l) + ' أشهر' : cNum(n, l) + ' شهرًا') : (n === 1 ? '1 month' : cNum(n, l) + ' months');
}
const V = (v) => h('bdi', { dir: 'auto' }, v);                 // user text: its own direction
const LT = (v) => h('bdi', { dir: 'ltr' }, v);                // phone, e-mail, codes: always left to right
const uniq = (a) => a.filter((x, i) => x && a.indexOf(x) === i);

/* =====================================================================
   Model: everything the paper needs, in one place
   ===================================================================== */
function contractModel(rec, p) {
  const cs = normContract(session.settings.contract), pc = normPc(p.contract), mode = pc.lang || cs.lang;
  return { rec, p, cs, pc, langs: mode === 'both' ? ['en', 'ar'] : [mode], no: pc.no.trim() || 'CT-' + p.sku, date: pc.date || todayStr(),
    warranty: pc.warranty === '' ? cs.warrantyMonths : pc.warranty, clientSign: pc.clientSign === null ? cs.clientSign : pc.clientSign, f: finance(p) };
}
const ctCompany = (l) => Lx(brand.name, l) || brandName();
function ctFill(text, c, l) {
  const map = { company: ctCompany(l), client: c.rec.client.name, project: c.p.title || Lx(c.p.typeName, l) || c.p.sku, sku: c.p.sku, price: cMoney(num(c.p.price), l), currency: CUR,
    start: cDay(c.p.startDate, l), due: cDay(c.p.dueDate, l), warranty: monthsText(c.warranty, l), date: cDay(c.date, l), owner: Lx(c.cs.owner.name, l) || ctCompany(l) };
  return String(text).replace(/\{(\w+)\}/g, (m, k) => (Object.prototype.hasOwnProperty.call(map, k) ? map[k] : m));
}
// Where the clauses of a contract come from: the wording written for this project, else the template it uses, else the standard clauses of Settings.
// Each language is decided on its own, so a project with Arabic wording only still has English clauses when the contract is printed in both.
const ctTemplate = (c) => (c.pc.tpl ? (c.cs.templates || []).find((x) => x.id === c.pc.tpl) || null : null);
function ctTermsText(c, l) {
  const own = c.pc.own ? (c.pc.terms[l] || '').trim() : '', tp = ctTemplate(c), tt = tp ? (tp.terms[l] || '').trim() : '';
  return own || tt || c.cs.terms[l] || '';
}
// 'own' | 'tpl' | 'standard': the source of the wording of the contract of one project
const ctWording = (c) => (c.pc.own && (c.pc.terms.en.trim() || c.pc.terms.ar.trim()) ? 'own' : ctTemplate(c) ? 'tpl' : 'standard');
// the clauses of one language: [{ head, body }]. A clause with {warranty} is dropped when the warranty is 0.
function ctClauses(c, l) {
  const out = [];
  for (const block of ctTermsText(c, l).split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean)) {
    if (/\{warranty\}/.test(block) && c.warranty <= 0) continue;
    const ls = block.split('\n').map((x) => x.trim()).filter(Boolean), one = ls.length < 2;
    out.push({ head: one ? '' : ctFill(ls[0], c, l), body: ctFill(one ? ls[0] : ls.slice(1).join('\n'), c, l) });
  }
  const x = (c.pc.extra[l] || '').trim() || (c.pc.extra[l === 'ar' ? 'en' : 'ar'] || '').trim();    // special conditions: the other language when this one is empty
  if (x) out.push({ head: tl(l, 'ct.p.special'), body: x });
  return out;
}

/* =====================================================================
   Paper
   ===================================================================== */
const ctRow = (c, build, cls) => h('div', { class: 'ct-row' + (cls ? ' ' + cls : '') }, c.langs.map((l) => h('div', { class: 'ct-cell', lang: l, dir: l === 'ar' ? 'rtl' : 'ltr' }, build(l))));
const ctDl = (pairs) => h('dl', { class: 'ct-dl' }, pairs.filter((x) => x && x[1] !== '' && x[1] != null).map(([k, v]) => h('div', {}, h('dt', {}, k), h('dd', {}, v))));
const ctJoin = (c, f) => uniq(c.langs.map(f)).join(' / ');

function ctPaymentsTable(c, l) {
  const rows = (c.p.payments || []).filter((x) => num(x.amount) > 0);
  if (!rows.length) return null;
  // heading + table in one block that is kept together on a page (a table caption can be split from its rows when printing)
  return h('div', { class: 'ct-tblbox' }, h('strong', { class: 'ct-tblcap' }, tl(l, 'ct.p.payments')),
    h('table', { class: 'ct-tbl', 'aria-label': tl(l, 'ct.p.payments') },
      h('thead', {}, h('tr', {}, h('th', {}, tl(l, 'ct.p.payDate')), h('th', { class: 'n' }, tl(l, 'ct.p.payAmt')), h('th', {}, tl(l, 'ct.p.payNote')))),
      h('tbody', {}, rows.map((x) => h('tr', {}, h('td', { class: 'n' }, cDayShort(x.date, l)), h('td', { class: 'n' }, cMoney(num(x.amount), l)), h('td', {}, V(x.note || '')))))));
}
// the instalments the client agreed to pay (only when some were set)
function ctScheduleTable(c, l) {
  const rows = (c.p.schedule || []).filter((x) => num(x.amount) > 0 && parseDay(x.due)).slice().sort((a, b) => String(a.due).localeCompare(String(b.due)));
  if (!rows.length) return null;
  return h('div', { class: 'ct-tblbox' }, h('strong', { class: 'ct-tblcap' }, tl(l, 'ct.p.schedule')),
    h('table', { class: 'ct-tbl', 'aria-label': tl(l, 'ct.p.schedule') },
      h('thead', {}, h('tr', {}, h('th', {}, tl(l, 'ct.p.payDate')), h('th', { class: 'n' }, tl(l, 'ct.p.payAmt')), h('th', {}, tl(l, 'ct.p.payNote')))),
      h('tbody', {}, rows.map((x) => h('tr', {}, h('td', { class: 'n' }, cDayShort(x.due, l)), h('td', { class: 'n' }, cMoney(num(x.amount), l)), h('td', {}, V(x.note || '')))))));
}
function ctSignature(c) {
  const names = uniq(c.langs.map((l) => Lx(c.cs.owner.name, l))), titles = uniq(c.langs.map((l) => Lx(c.cs.owner.title, l))), companies = uniq(c.langs.map(ctCompany));
  const company = h('div', { class: 'ct-sigcol', id: 'ctSignCompany' },
    h('strong', { class: 'ct-party' }, ctJoin(c, (l) => tl(l, 'ct.p.party1'))),
    h('div', { class: 'ct-sigarea' }, c.cs.signature ? h('img', { class: 'ct-sigimg', id: 'ctSigImg', src: c.cs.signature, alt: '' }) : null),
    h('div', { class: 'ct-sigcap' },
      names.length ? names.map((x) => h('span', { class: 'ct-signame' }, V(x))) : null,
      h('span', {}, V((names.length && titles.length ? titles.join(' / ') + ' · ' : '') + companies.join(' / '))),
      h('span', {}, ctJoin(c, (l) => tl(l, 'ct.p.signDate')) + ': ', V(uniq(c.langs.map((l) => cDay(c.date, l))).join(' / ')))));
  const client = c.clientSign ? h('div', { class: 'ct-sigcol', id: 'ctSignClient' },
    h('strong', { class: 'ct-party' }, ctJoin(c, (l) => tl(l, 'ct.p.party2'))),
    h('div', { class: 'ct-sigarea' }),
    h('div', { class: 'ct-sigcap' }, h('span', { class: 'ct-signame' }, V(c.rec.client.name)),
      h('span', {}, ctJoin(c, (l) => tl(l, 'ct.p.signDate')) + ': ' + ' _______________'))) : null;
  return h('div', { class: 'ct-sign' + (client ? '' : ' one') }, company, client);
}

let ctBw = false;                                              // the formal copy (black and white) is switched on from the contract screen; it is a way of showing and printing, not part of the contract
function renderContractPaper(c) {
  const contact = [brand.phone, brand.email, brand.website && brand.website.replace(/^https:\/\//, ''), brand.address].filter(Boolean);
  const owner = (l) => { const n = Lx(c.cs.owner.name, l), ti = Lx(c.cs.owner.title, l); return n ? n + (ti ? ' — ' + ti : '') : ''; };
  const lists = Object.fromEntries(c.langs.map((l) => [l, ctClauses(c, l)])), n = Math.max(...c.langs.map((l) => lists[l].length));
  const f = c.f;
  // the paper has the direction of its own language (Arabic: logo on the right), whatever language the screen is in; both languages: left to right, English first
  return h('article', { class: 'paper ct-paper' + (c.langs.length > 1 ? ' ct-bi' : '') + (ctBw ? ' ct-bw' : ''), id: 'ctPaper', dir: c.langs.length === 1 && c.langs[0] === 'ar' ? 'rtl' : 'ltr', lang: c.langs.length === 1 ? c.langs[0] : 'en' },
    h('header', { class: 'rp-head ct-head' }, reportLogo(),
      contact.length ? h('div', { class: 'rp-meta ct-contact' }, contact.map((x, i) => h('bdi', { dir: i === contact.length - 1 && brand.address ? 'auto' : 'ltr' }, x))) : null),
    h('div', { class: 'rp-band' }),
    ctRow(c, (l) => [h('h2', { class: 'ct-title', id: l === c.langs[0] ? 'ctTitle' : null }, tl(l, 'ct.p.title')),
      h('div', { class: 'ct-ref' }, h('span', {}, tl(l, 'ct.p.no') + ': ', LT(c.no)), h('span', {}, tl(l, 'ct.p.date') + ': ', cDay(c.date, l)))]),
    ctRow(c, (l) => [h('h3', {}, tl(l, 'ct.p.first')),
      ctDl([[tl(l, 'ct.p.name'), V(ctCompany(l))], [tl(l, 'ct.p.rep'), owner(l) ? V(owner(l)) : ''], [tl(l, 'ct.p.phone'), brand.phone ? LT(brand.phone) : ''], [tl(l, 'ct.p.email'), brand.email ? LT(brand.email) : ''], [tl(l, 'ct.p.address'), brand.address ? V(brand.address) : '']]),
      h('h3', {}, tl(l, 'ct.p.second')),
      ctDl([[tl(l, 'ct.p.name'), V(c.rec.client.name)], [tl(l, 'ct.p.phone'), [c.rec.client.phone, c.rec.client.phone2].filter(Boolean).map((x, i) => [i ? ' · ' : '', LT(x)])], [tl(l, 'ct.p.email'), c.rec.client.email ? LT(c.rec.client.email) : ''], [tl(l, 'ct.p.address'), c.rec.client.address ? V(c.rec.client.address) : '']])]),
    ctRow(c, (l) => [h('h3', {}, tl(l, 'ct.p.project')),
      ctDl([[tl(l, 'ct.p.type'), V(Lx(c.p.typeName, l) || c.p.type || '')], [tl(l, 'ct.p.projName'), c.p.title ? V(c.p.title) : ''], [tl(l, 'ct.p.ref'), LT(skuRef(c.rec, c.p))], [tl(l, 'ct.p.desc'), c.p.description ? V(c.p.description) : ''],
        [tl(l, 'ct.p.site'), c.pc.site ? V(c.pc.site) : ''], [tl(l, 'ct.p.start'), c.p.startDate ? cDay(c.p.startDate, l) : ''], [tl(l, 'ct.p.due'), c.p.dueDate ? cDay(c.p.dueDate, l) : '']])]),
    ctRow(c, (l) => [h('h3', {}, tl(l, 'ct.p.money')),
      ctDl([[tl(l, 'ct.p.price'), h('strong', {}, cMoney(f.price, l))], [tl(l, 'ct.p.paid'), cMoney(f.paid, l)], [tl(l, 'ct.p.remaining'), cMoney(f.remaining, l)]]),
      ctPaymentsTable(c, l), ctScheduleTable(c, l),
      (c.pc.payTerms[l] || c.pc.payTerms[l === 'ar' ? 'en' : 'ar']) ? h('div', { class: 'ct-payterms' }, h('strong', {}, tl(l, 'ct.p.payTerms') + ': '), V(c.pc.payTerms[l] || c.pc.payTerms[l === 'ar' ? 'en' : 'ar'])) : null]),
    n ? ctRow(c, (l) => h('h3', { class: 'ct-termshead' }, tl(l, 'ct.p.terms')), 'ct-keep') : null,
    Array.from({ length: n }, (_, i) => ctRow(c, (l) => { const k = lists[l][i]; return k ? h('div', { class: 'ct-clause' }, h('strong', {}, (i + 1) + '. ' + (k.head || '')), h('p', {}, V(k.body))) : null; }, 'ct-clauserow')),
    // the signature block is the LAST thing on the paper; the closing sentence is kept on the same page with it
    h('div', { class: 'ct-signwrap' }, ctRow(c, (l) => h('p', { class: 'ct-accept' }, tl(l, 'ct.p.accept'))), ctSignature(c)));
}

function printContract(c) {
  paperNow();
  const old = document.title; document.title = (brandName() + '-' + tl(c.langs[0], 'ct.p.fileName') + (ctBw ? '-bw' : '') + '-' + c.p.sku + '-' + c.rec.client.name).replace(/[^\w؀-ۿ-]+/g, '_').replace(/^_+|_+$/g, '');
  const back = () => { document.title = old; removeEventListener('afterprint', back); };
  addEventListener('afterprint', back); window.print();
}

/* =====================================================================
   Screen
   ===================================================================== */
async function renderContract(token, id, pi) {
  if (!(await ensureStore(token))) return;
  CUR = store.settings.currency || CUR; paperNow();
  if (!(ed && ed.id === id && !ed.isNew)) {
    const it = store.items.find((x) => x.rec.id === id);
    if (!it) return mount(notice(t('ed.notFound'), t('ed.notFoundSub', { id }), 'bad', { actions: [h('a', { class: 'btn', href: '#dashboard' }, t('nav.dashboard'))] }));
    ed = newEd(clone(it.rec), it.sha, false);
  }
  if (pi !== undefined && pi !== null) ed.pi = Math.max(0, Math.min(Number(pi) || 0, ed.rec.projects.length - 1));
  renderContractScreen();
}

function renderContractScreen() {
  const r = ed.rec; ed.live = []; ed.redraw = renderContractScreen;
  ed.hash = '#contract/' + r.id + '/' + ed.pi;
  if (location.hash !== ed.hash) history.replaceState(null, '', ed.hash);
  const p = r.projects[ed.pi];
  const head = h('div', { class: 'page-head rp-noprint' },
    h('div', {}, h('a', { class: 'back', href: '#manage/' + r.id }, t('act.back')), h('h1', { dir: 'auto' }, t('ct.title') + ' — ' + r.client.name)), encBadge());
  if (!p) return mount(h('section', { class: 'stack' }, head, h('p', { class: 'empty' }, t('pg.noProjects'))));
  const cs = normContract(session.settings.contract), pc = p.contract = normPc(p.contract);
  const langSel = selectEl([['', t('ct.langDefault', { l: t('ct.lang.' + cs.lang) })], ['ar', t('ct.lang.ar')], ['en', t('ct.lang.en')], ['both', t('ct.lang.both')]], pc.lang, (v) => { pc.lang = v; touch(); }, 'ctLang');
  const biArea = (o, id, rows) => h('div', { class: 'bi' }, tarea(o, 'ar', { id: id + 'Ar', rows, ph: 'العربية', max: 3000 }), tarea(o, 'en', { id: id + 'En', rows, ph: 'English', max: 3000 }));
  // ---- wording: the standard clauses, a template of Settings, or clauses written for this project only
  if (pc.tpl && !cs.templates.some((x) => x.id === pc.tpl)) pc.tpl = '';                      // the template was removed in Settings: the standard clauses apply again
  const ownBox = h('div', { class: 'stack-sm', id: 'ctOwnBox', hidden: !pc.own });
  const copyWording = () => {
    const base = { cs, pc: Object.assign({}, pc, { own: false }) };
    if ((pc.terms.en.trim() || pc.terms.ar.trim()) && !confirm(t('ct.w.copyConfirm'))) return;
    pc.terms.en = ctTermsText(base, 'en'); pc.terms.ar = ctTermsText(base, 'ar');                  // in place: the two boxes are bound to these very objects
    const a = document.getElementById('ctTermsAr'), e = document.getElementById('ctTermsEn'); if (a) a.value = pc.terms.ar; if (e) e.value = pc.terms.en;
    touch();
  };
  const wTerms = (key, id, dir) => { const e = tarea(pc.terms, key, { id, rows: 14, max: 12000 }); e.dir = dir; return e; };
  ownBox.replaceChildren(h('p', { class: 'hint' }, t('ct.w.ownHint')), h('div', { class: 'grid2' }, fld('ct.termsAr', wTerms('ar', 'ctTermsAr', 'rtl')), fld('ct.termsEn', wTerms('en', 'ctTermsEn', 'ltr'))),
    h('div', { class: 'actions' }, h('button', { class: 'btn small', type: 'button', id: 'btnOwnCopy', onclick: copyWording }, t('ct.w.copy')),
      h('button', { class: 'btn small ghost', type: 'button', id: 'btnOwnClear', onclick: () => { pc.terms.en = ''; pc.terms.ar = ''; pc.own = false; wSel.value = pc.tpl; ownBox.hidden = true; for (const k of ['ctTermsAr', 'ctTermsEn']) document.getElementById(k).value = ''; touch(); } }, t('ct.w.clear'))));
  const wSel = selectEl([['', t('ct.w.standard')]].concat(cs.templates.map((x) => [x.id, Lx(x.name, lang) || x.id])).concat([['@own', t('ct.w.own')]]), pc.own ? '@own' : pc.tpl, (v) => {
    if (v === '@own') { pc.own = true; ownBox.hidden = false; if (!pc.terms.en.trim() && !pc.terms.ar.trim()) copyWording(); } else { pc.own = false; pc.tpl = v; ownBox.hidden = true; }
    touch();
  }, 'ctWording');
  const stNote = h('span', { class: 'small muted', id: 'ctStatusNote' });
  const stText = () => [pc.issuedAt ? t('ct.issuedOn', { d: fmtDay(pc.issuedAt) }) : '', pc.signedAt ? t('ct.signedOn', { d: fmtDay(pc.signedAt) }) : ''].filter(Boolean).join(' · ');
  stNote.textContent = stText();
  const stSel = selectEl(CT_STATES.map((x) => [x, t('ct.st.' + x)]), pc.status, (v) => {
    pc.status = v; const d = todayStr();
    if (v === 'issued' && !pc.issuedAt) pc.issuedAt = d;
    if (v === 'signed') { if (!pc.issuedAt) pc.issuedAt = d; if (!pc.signedAt) pc.signedAt = d; }
    if (v === 'draft') { pc.issuedAt = ''; pc.signedAt = ''; }
    if (v === 'issued') pc.signedAt = '';
    stNote.textContent = stText(); touch();
  }, 'ctStatus');
  const warn = live(() => {
    const m = contractModel(r, p), w = [];
    if (!m.cs.signature) w.push(t('ct.noSig'));
    if (!num(p.price)) w.push(t('ct.noPrice'));
    return w.length ? h('div', { class: 'msg warn' }, w.map((x) => h('span', {}, x)), h('a', { class: 'btn small', href: '#settings', style: 'justify-self:start' }, t('ct.goSettings'))) : null;
  });
  const options = h('section', { class: 'card stack-sm rp-noprint', id: 'ctOptions' },
    h('div', { class: 'card-head' }, h('h2', {}, t('ct.options')), h('span', { class: 'chip mono' }, p.sku)),
    warn,
    h('div', { class: 'grid2' }, fld('ct.wording', wSel, 'ct.wordingHint'), fld('ct.status', h('div', { class: 'stack-sm' }, stSel, stNote))),
    ownBox,
    h('div', { class: 'grid2' }, fld('ct.lang', langSel), fld('ct.no', tin(pc, 'no', { id: 'ctNo', max: 40, dir: 'ltr', ph: 'CT-' + p.sku }), 'ct.noHint')),
    h('div', { class: 'grid2' }, fld('ct.date', tin(pc, 'date', { id: 'ctDate', type: 'date' }), 'ct.dateHint'),
      fld('ct.warranty', tin(pc, 'warranty', { id: 'ctWarranty', type: 'number', num: true, min: 0, step: 1, mode: 'numeric', ph: String(cs.warrantyMonths) }), 'ct.warrantyHint')),
    fld('ct.site', tin(pc, 'site', { id: 'ctSite', max: 240 })),
    fld('ct.payTerms', biArea(pc.payTerms, 'ctPay', 2), 'ct.payTermsHint'),
    fld('ct.extra', biArea(pc.extra, 'ctExtra', 3), 'ct.extraHint'),
    h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'ctClientSign', checked: pc.clientSign === null ? cs.clientSign : pc.clientSign, onchange: (e) => { pc.clientSign = e.target.checked; touch(); } }), h('span', {}, t('ct.clientSign'))),
    h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'ctFormal', checked: ctBw, onchange: (e) => { ctBw = e.target.checked; const el = document.getElementById('ctPaper'); if (el) el.classList.toggle('ct-bw', ctBw); } }), h('span', {}, t('ct.formal'))),
    h('p', { class: 'hint' }, t('ct.formalHint')),
    h('p', { class: 'hint' }, t('ct.clausesFrom') + ' ', h('a', { href: '#settings' }, t('ct.goSettings'))));
  const actions = h('div', { class: 'actions rp-noprint' }, h('button', { class: 'btn primary', type: 'button', id: 'btnCtPrint', onclick: () => printContract(contractModel(r, p)) }, t('ct.print')), h('span', { class: 'hint' }, t('ct.printHint')));
  const pills = projPills(renderContractScreen);
  mount(h('section', { class: 'stack rp-page ct-screen' }, head, pills ? h('div', { class: 'rp-noprint' }, pills) : null, options, actions,
    live(() => renderContractPaper(contractModel(r, p)), 'rp-area'), h('div', { class: 'rp-noprint' }, saveBar())));
  syncSaveBar();
}
