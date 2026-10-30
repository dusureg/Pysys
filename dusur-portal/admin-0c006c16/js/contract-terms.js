/**
 * <admin>/js/contract-terms.js  -  contract defaults and normalising
 * The standard contract clauses (English and Arabic), the default contract settings, and normContract() / normPc(), which turn whatever
 * is stored (older records, hand-edited data) into a complete, safe object. Contract data is private: it is never part of toPublic().
 * Wording can come from three places: the standard clauses of Settings, a named template of Settings (settings.contract.templates), or the
 * clauses written for ONE project (project.contract.terms, used when project.contract.own is set). A contract also has a status: draft, issued or signed.
 * Loaded by: admin page
 */
'use strict';

/* =====================================================================
   Contract: standard clauses and defaults.
   One clause per paragraph (blank line between clauses); the first line of a clause is its heading.
   {tokens} are replaced when the contract is drawn: company, client, project, sku, price, currency, start, due, warranty, date, owner.
   A clause that contains {warranty} is left out when the warranty is 0 months.
   These are general starting clauses, not legal advice: the owner edits them in Settings.
   ===================================================================== */
const CONTRACT_TERMS = {
  en: [
    'Subject of the contract\n{company} (the “Company”) agrees to design, manufacture and install for {client} (the “Client”) the work described in this contract ({project}, ref. {sku}), according to the dimensions, materials, colours and finishes agreed between the parties.',
    'Price and payment\nThe total price of the work is {price}. The Client pays it in the instalments written in this contract. The next stage of work may be delayed while a due instalment is unpaid.',
    'Duration and delivery\nThe work starts on {start} and is expected to be completed and handed over by {due}. The date moves by the same number of days if the Client changes the design, delays an approval or a payment, or if the site is not ready for installation.',
    'The Client’s responsibilities\nThe Client provides accurate site details, confirms the final drawings, materials and colours in writing before manufacturing starts, and makes sure the site is ready (finished walls and floors, electricity and plumbing points) and accessible on the installation date.',
    'Changes to the work\nAny change requested after the drawings are approved is agreed in writing and may change the price and the completion date.',
    'Materials and workmanship\nThe Company uses the materials listed in the approved specification and carries out the work according to good craft practice. Natural wood and board can show slight differences in grain and colour; this is not a defect.',
    'Handover and acceptance\nThe Client, or a representative, inspects the work at handover. Visible defects must be reported in writing at handover or within three days, and the Company repairs them within a reasonable time.',
    'Warranty\nThe Company warrants the workmanship and installation for {warranty} from the handover date and repairs or replaces defective parts free of charge. The warranty does not cover misuse, water or heat damage, overloading, normal wear, or changes and repairs made by others.',
    'Cancellation\nIf the Client cancels after manufacturing has started, the Client pays for the work completed and for the materials already bought or cut for this project.',
    'Disputes\nThe parties first try to settle any disagreement amicably. If that fails, the competent courts have jurisdiction.',
  ].join('\n\n'),
  ar: [
    'موضوع العقد\nتلتزم {company} («الشركة») بتصميم وتصنيع وتركيب الأعمال الموضحة في هذا العقد ({project}، مرجع {sku}) لصالح {client} («العميل»)، وفق المقاسات والخامات والألوان والتشطيبات المتفق عليها بين الطرفين.',
    'الثمن وطريقة السداد\nإجمالي ثمن الأعمال {price}، ويسدده العميل على الدفعات المبينة في هذا العقد. يجوز تأجيل مرحلة التنفيذ التالية إذا تأخر سداد دفعة مستحقة.',
    'مدة التنفيذ والتسليم\nتبدأ الأعمال في {start}، ومن المتوقع الانتهاء منها وتسليمها في {due}. يمتد الموعد بمقدار مدة التأخير إذا عدّل العميل التصميم أو تأخر في الاعتماد أو في السداد، أو إذا لم يكن موقع التركيب جاهزًا.',
    'التزامات العميل\nيلتزم العميل بتقديم بيانات الموقع الصحيحة، واعتماد الرسومات النهائية والخامات والألوان كتابةً قبل بدء التصنيع، وتجهيز الموقع (الحوائط والأرضيات بعد التشطيب ونقاط الكهرباء والسباكة) وإتاحة الدخول إليه في موعد التركيب.',
    'التعديلات\nأي تعديل يطلبه العميل بعد اعتماد الرسومات يتم الاتفاق عليه كتابةً، وقد يترتب عليه تغيير في الثمن وفي موعد التسليم.',
    'الخامات وجودة التنفيذ\nتستخدم الشركة الخامات المذكورة في المواصفات المعتمدة، وتنفذ الأعمال وفق الأصول الفنية للحرفة. قد يظهر في الخشب الطبيعي واللوح اختلاف طفيف في العروق واللون، ولا يُعدّ ذلك عيبًا.',
    'التسليم والاستلام\nيعاين العميل أو من ينوب عنه الأعمال عند التسليم، وتُبلَّغ الشركة كتابةً بأي عيوب ظاهرة عند التسليم أو خلال ثلاثة أيام منه، وتقوم الشركة بإصلاحها خلال مدة معقولة.',
    'الضمان\nتضمن الشركة جودة التصنيع والتركيب لمدة {warranty} من تاريخ التسليم، وتصلح أو تستبدل الأجزاء المعيبة دون مقابل. لا يشمل الضمان سوء الاستخدام، ولا تلف المياه أو الحرارة، ولا التحميل الزائد، ولا الاستهلاك الطبيعي، ولا أي تعديل أو إصلاح يتم بمعرفة الغير.',
    'الإلغاء\nإذا ألغى العميل العقد بعد بدء التصنيع، يلتزم بسداد قيمة ما تم تنفيذه والخامات التي تم شراؤها أو تقطيعها لهذا المشروع.',
    'المنازعات\nيسعى الطرفان إلى حل أي خلاف وديًا أولًا، فإذا تعذّر ذلك تختص المحاكم المختصة بنظره.',
  ].join('\n\n'),
};
const CONTRACT_LANGS = ['ar', 'en', 'both'];
const SIG_RE = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/;
const SIG_MAX = 150000;                                    // longest signature image kept (characters of the data URL)

const defaultContract = () => ({
  lang: 'ar', warrantyMonths: 12, clientSign: true,
  owner: { name: { en: '', ar: '' }, title: { en: 'Owner', ar: 'المالك' } },
  signature: '', terms: { en: CONTRACT_TERMS.en, ar: CONTRACT_TERMS.ar }, templates: [],
});
const CT_STATES = ['draft', 'issued', 'signed'];
const CT_ID_RE = /^[a-z0-9]{3,12}$/;
// settings.contract: complete and safe whatever is stored
function normContract(c) {
  const d = defaultContract(), s = (v, n) => (typeof v === 'string' ? v.slice(0, n) : null);
  c = c && typeof c === 'object' ? c : {};
  const o = c.owner && typeof c.owner === 'object' ? c.owner : {}, on = o.name || {}, ot = o.title || {}, tm = c.terms || {};
  const wm = Math.round(Number(c.warrantyMonths));
  const sig = typeof c.signature === 'string' && c.signature.length <= SIG_MAX && SIG_RE.test(c.signature) ? c.signature : '';
  return {
    lang: CONTRACT_LANGS.includes(c.lang) ? c.lang : d.lang,
    warrantyMonths: isFinite(wm) && wm >= 0 && wm <= 120 ? wm : d.warrantyMonths,
    clientSign: c.clientSign !== false,
    owner: { name: { en: (s(on.en, 80) || '').trim(), ar: (s(on.ar, 80) || '').trim() },
      title: { en: s(ot.en, 60) === null ? d.owner.title.en : s(ot.en, 60).trim(), ar: s(ot.ar, 60) === null ? d.owner.title.ar : s(ot.ar, 60).trim() } },
    signature: sig,
    terms: { en: s(tm.en, 12000) === null ? d.terms.en : s(tm.en, 12000), ar: s(tm.ar, 12000) === null ? d.terms.ar : s(tm.ar, 12000) },
    templates: normTemplates(c.templates),
  };
}
// named sets of clauses (Kitchens, Dressing rooms ...): up to 12, each with an id that never changes, a name in two languages and its clauses
function normTemplates(list) {
  const seen = new Set(), out = [], s = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
  for (const x of Array.isArray(list) ? list : []) {
    if (!x || typeof x !== 'object' || out.length >= 12) continue;
    const id = typeof x.id === 'string' && CT_ID_RE.test(x.id) ? x.id : '';
    if (!id || seen.has(id)) continue;
    const nm = x.name && typeof x.name === 'object' ? x.name : {}, tm = x.terms && typeof x.terms === 'object' ? x.terms : {};
    const name = { en: s(nm.en, 60).trim(), ar: s(nm.ar, 60).trim() };
    if (!name.en && !name.ar) continue;
    seen.add(id); out.push({ id, name, terms: { en: s(tm.en, 12000), ar: s(tm.ar, 12000) } });
  }
  return out;
}
// p.contract: the details of ONE project's contract (everything optional; '' means "use the default")
//  tpl = the template of Settings this project uses ('' = the standard clauses) · own + terms = clauses written for this project only (own wins over tpl)
//  status = draft / issued / signed, with the day it was last changed to issued and to signed
function normPc(c) {
  c = c && typeof c === 'object' ? c : {};
  const s = (v, n) => (typeof v === 'string' ? v.slice(0, n) : ''), bi = (o, n) => ({ en: s(o && o.en, n), ar: s(o && o.ar, n) }), day = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : '');
  const w = c.warranty === '' || c.warranty == null ? '' : Math.max(0, Math.min(120, Math.round(Number(c.warranty)) || 0));
  return { lang: CONTRACT_LANGS.includes(c.lang) ? c.lang : '', no: s(c.no, 40), date: day(c.date), site: s(c.site, 240),
    warranty: w, payTerms: bi(c.payTerms, 600), extra: bi(c.extra, 3000), clientSign: typeof c.clientSign === 'boolean' ? c.clientSign : null,
    tpl: CT_ID_RE.test(c.tpl || '') ? c.tpl : '', own: c.own === true, terms: bi(c.terms, 12000),
    status: CT_STATES.includes(c.status) ? c.status : 'draft', issuedAt: day(c.issuedAt), signedAt: day(c.signedAt) };
}
