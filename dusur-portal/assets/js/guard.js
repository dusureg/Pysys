/**
 * assets/js/guard.js  -  runs first, synchronously, in <head>. Plain ES5 on purpose.
 *  1. sets language, direction and theme before the first paint (no flash)
 *  2. records script errors and, if the app never starts, shows WHY instead of an empty page
 *  3. loads the fonts (IBM Plex Sans + IBM Plex Sans Arabic) without blocking the first paint
 *  4. loads CryptoJS without blocking the page (local copy -> cdnjs -> jsDelivr -> unpkg)
 *  5. client page only: starts downloading the public company profile at once (<meta name="dsp-early">), while the scripts are still loading
 * Loaded by: both pages
 */
(function(){var d=document.documentElement;try{
var l=localStorage.getItem('dsp.lang');if(l!=='ar'&&l!=='en')l=((navigator.language||'en').slice(0,2)==='ar')?'ar':'en';
var th=localStorage.getItem('dsp.theme');if(th!=='light'&&th!=='dark')th='dark';
d.lang=l;d.dir=l==='ar'?'rtl':'ltr';d.setAttribute('data-theme',th);}catch(e){}
if(location.hash.indexOf('#client/')===0)d.classList.add('client-mode');})();

/* Fonts: IBM Plex Sans (English) and IBM Plex Sans Arabic (Arabic). They load WITHOUT blocking the first paint: the page shows system fonts
   until they arrive (font-display: swap), and if they never arrive the page simply stays in the system font.
     'google' = Google Fonts. Works as soon as the site is online (requests to fonts.googleapis.com and fonts.gstatic.com).
     'self'   = your own copy in assets/fonts/. Run  python3 tools/get-fonts.py  once on a computer with internet: it downloads the files,
                writes assets/css/fonts.css, removes the Google addresses from the CSP and sets the next line for you. No third party at all.
     'none'   = system fonts only.
   Only the weights the design uses are requested (regular 400 and bold 700); 500 maps to 400 and 600/800 map to 700. */
(function(){
var FONTS='google',FONT_PRELOAD={"en":[],"ar":[]};
document.documentElement.setAttribute('data-fonts',FONTS);                       // which font mode this site uses: Settings only offers more fonts when it is 'google'
if(FONTS==='none')return;
var cs=document.currentScript,base=cs&&cs.src?cs.src:'';
function link(rel,href,attrs){var l=document.createElement('link');l.rel=rel;l.href=href;if(attrs)for(var k in attrs)l.setAttribute(k,attrs[k]);document.head.appendChild(l);return l;}
function css(href){var l=link('stylesheet',href,{media:'print'});l.onload=function(){l.media='all';};}   // media=print first = does not block rendering
try{
  if(FONTS==='google'){
    link('preconnect','https://fonts.gstatic.com',{crossorigin:''});
    css('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;700&family=IBM+Plex+Sans+Arabic:wght@400;700&display=swap');
  }else if(base){
    (FONT_PRELOAD[document.documentElement.lang==='ar'?'ar':'en']||[]).forEach(function(f){link('preload',new URL('../fonts/'+f,base).href,{as:'font',type:'font/woff2',crossorigin:''});});
    css(new URL('../css/fonts.css',base).href);
  }
}catch(e){}
})();

/* Start-up safety net (plain ES5 so it works everywhere):
   - records script errors, and if the app never starts shows WHY instead of an empty page
   - loads CryptoJS without blocking the page, trying cdnjs, then jsDelivr, then unpkg */
(function(){
var D=window.__dsp={errs:[],booted:false,broken:false,crypto:null,early:{}};
// Early download (client page): <meta name="dsp-early" content="data/public/brand.json"> lists public files the page needs first. They are requested now,
// in parallel with the scripts, and rawJson() in assets/js/client/data.js takes the answer instead of asking again (same address rules as pagesRepo() / rawUrl()).
try{
  var em=document.querySelector('meta[name=dsp-early]'),hm=location.hostname.match(/^([^.]+)\.github\.io$/i);
  if(em&&hm&&window.fetch){
    var sg=location.pathname.split('/').filter(Boolean)[0],rp=sg&&!/\.html?$/i.test(sg)?sg:hm[1]+'.github.io';
    em.content.split(',').forEach(function(p){
      p=p.replace(/^\s+|\s+$/g,'');if(!p)return;
      var q=fetch('https://raw.githubusercontent.com/'+encodeURIComponent(hm[1])+'/'+encodeURIComponent(rp)+'/HEAD/'+p.split('/').map(encodeURIComponent).join('/')+'?t='+Date.now(),{cache:'no-store'});
      q.catch(function(){});D.early[p]=q;
    });
  }
}catch(e){}
// hard = one of THIS site's own scripts failed to load or threw while loading. The other files still run (they are separate
// <script defer> tags), so main.js asks D.broken before starting and shows the diagnostics box instead of a half-drawn page.
function rec(m,hard){if(D.errs.length<8)D.errs.push(String(m).slice(0,300));if(hard&&!D.booted)D.broken=true;}
function mine(u){return !!u&&String(u).indexOf(location.origin)===0;}
window.addEventListener('error',function(e){
  var t=e&&e.target;
  if(t&&t!==window&&(t.src||t.href)){rec('could not load '+(t.src||t.href),t.tagName==='SCRIPT'&&!t.hasAttribute('data-lib')&&mine(t.src));return;}
  rec((e&&e.message||'script error')+(e&&e.filename?' ('+e.lineno+':'+e.colno+')':''),mine(e&&e.filename));
},true);
window.addEventListener('unhandledrejection',function(e){rec('promise: '+(e.reason&&e.reason.message||e.reason));});

// CryptoJS 4.2.0. Order: your own copy (if enabled below) -> cdnjs -> jsDelivr -> unpkg.
// To stop depending on any CDN: download crypto-js.min.js into assets/vendor/ and set USE_LOCAL_COPY = true (see assets/vendor/README.md).
var USE_LOCAL_COPY=false;
var SRC=['https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.2.0/crypto-js.min.js','https://cdn.jsdelivr.net/npm/crypto-js@4.2.0/crypto-js.min.js','https://unpkg.com/crypto-js@4.2.0/crypto-js.js'];
if(USE_LOCAL_COPY&&document.currentScript&&document.currentScript.src){try{SRC.unshift(new URL('../vendor/crypto-js.min.js',document.currentScript.src).href);}catch(e){}}
D.crypto=new Promise(function(res){
  var i=0;
  (function next(){
    if(window.CryptoJS)return res(true);
    if(i>=SRC.length)return res(false);
    var s=document.createElement('script'),done=false,tm=0,url=SRC[i];
    function fin(){if(done)return;done=true;clearTimeout(tm);if(window.CryptoJS)res(true);else{i++;next();}}
    s.onload=fin;s.onerror=fin;tm=setTimeout(fin,9000);
    s.setAttribute('data-lib','1');s.async=true;s.crossOrigin='anonymous';s.referrerPolicy='no-referrer';s.src=url;
    document.head.appendChild(s);
  })();
});

function diag(){
  if(D.booted)return;
  var m=document.getElementById('app');if(!m||m.getAttribute('data-diag'))return;
  m.setAttribute('data-diag','1');m.textContent='';
  function el(tag,txt,st){var x=document.createElement(tag);if(txt)x.textContent=txt;if(st)x.style.cssText=st;m.firstChild?m.firstChild.appendChild(x):m.appendChild(x);return x;}
  var c=document.createElement('section');c.className='card state';m.appendChild(c);
  el('h1','The portal could not start — تعذّر تشغيل البوابة');
  el('p',D.broken?'A file of this site failed to load or crashed (details below). Press Reload first: on a weak connection or a busy preview a single file can fail to arrive. If you just updated the site, check that every file was uploaded, then reload with the cache cleared (Ctrl+F5). If it still fails, send a screenshot of this box.':'The page loaded but its script did not run. Open this page directly in Chrome from its https:// GitHub Pages address (not inside a file viewer, preview or in-app browser) and reload. If it still fails, send a screenshot of this box.','color:var(--muted)');
  if(D.broken)el('p','تعذّر تحميل أحد ملفات الموقع أو توقف عن العمل (التفاصيل بالأسفل). اضغط زر إعادة التحميل أولًا، فقد يفشل ملف واحد عند ضعف الاتصال. وإن استمر الخطأ تأكد من رفع كل الملفات ثم أعد التحميل مع مسح الذاكرة المؤقتة (Ctrl+F5).','color:var(--muted)');
  var info=[D.errs.length?D.errs.join('\n'):'(no script error was reported — scripts are probably blocked by the viewer)',
    'page: '+location.protocol+'//'+location.host,'secure context: '+(window.isSecureContext?'yes':'no'),'crypto.subtle: '+(window.crypto&&crypto.subtle?'yes':'no'),'CryptoJS: '+(window.CryptoJS?'yes':'no'),'browser: '+(navigator.userAgent||'').slice(0,140)].join('\n');
  el('pre',info,'white-space:pre-wrap;word-break:break-word;text-align:left;direction:ltr;font-size:12px;max-width:100%;overflow:auto;margin:0;padding:10px;border:1px solid var(--line);border-radius:8px');
  var rb=el('button','Reload — إعادة التحميل','margin-top:14px');rb.type='button';rb.className='btn primary';rb.addEventListener('click',function(){location.reload();});
  var cb=el('button','Copy report — نسخ التقرير','margin-top:14px;margin-inline-start:8px');cb.type='button';cb.className='btn';
  var ptxt=info;cb.addEventListener('click',function(){try{navigator.clipboard.writeText(ptxt).then(function(){cb.textContent='Copied — تم النسخ';});}catch(e){cb.textContent=ptxt.slice(0,40);}});
  probe(el('div','','margin-top:14px;text-align:left;direction:ltr;font-size:13px'),function(r){ptxt=info+'\n'+r;});
}
// Step 2 of the troubleshooter: ask the server for every script of this page. A missing file (404) is the most common reason for a half-started page.
function probe(box,done){
  var list=[].slice.call(document.scripts).map(function(s){return s.src;}).filter(function(u){return u&&u.indexOf(location.origin)===0;});
  if(!window.fetch||!list.length){return;}
  box.textContent='Checking '+list.length+' files… / جارٍ فحص '+list.length+' ملفًا…';
  var bad=[],left=list.length;
  function fin(){
    if(--left)return;
    var out=bad.length?'Missing or unreachable ('+bad.length+' of '+list.length+'):\n'+bad.join('\n')+'\n\n→ Upload the WHOLE folder again (every subfolder: assets, js, css, i18n, data) and make sure file names keep their lower-case spelling.\n→ ارفع المجلد كاملًا من جديد بكل المجلدات الفرعية، وانتبه لأن أسماء الملفات حساسة لحالة الأحرف.'
      :'All '+list.length+' files of this page are reachable. If the page still does not start, read the error lines above, then press Reload; if it repeats, clear the site data of this browser (or try a private window) and open the page again.\nجميع الملفات موجودة. إن استمر العطل فاقرأ سطور الخطأ بالأعلى ثم أعد التحميل، وإن تكرر فامسح بيانات الموقع في المتصفح أو جرّب نافذة خاصة.';
    box.style.whiteSpace='pre-wrap';box.textContent=out;if(done)done(out);
  }
  list.forEach(function(u){
    fetch(u,{method:'HEAD',cache:'no-store'}).then(function(r){if(!r.ok)bad.push(u.replace(location.origin,'')+'  ('+r.status+')');fin();},function(){bad.push(u.replace(location.origin,'')+'  (network)');fin();});
  });
}
D.fail=function(e){if(e)rec(e&&e.message||e);D.booted=false;diag();};   // called by main.js when start-up throws before it could draw anything
document.addEventListener('DOMContentLoaded',function(){setTimeout(diag,2500);});
})();
