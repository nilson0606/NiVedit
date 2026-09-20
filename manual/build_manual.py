from pathlib import Path
import json,base64,html,re
ROOT=Path(__file__).resolve().parent.parent
VERSION=re.search(r"const VER = '([^']+)'", (ROOT/'nivedit-src/src/20_core.js').read_text(encoding='utf-8')).group(1)
MANUAL_DATE='2026-09-20'
chapters=json.loads((ROOT/'manual/chapters.json').read_text(encoding='utf-8'))
def screenshot(theme):
    path=ROOT/('manual/images/subtitles-'+theme+'.png')
    return '<img class="shot-'+theme+'" width="760" height="391" alt="字幕編輯器已選字幕頂層，僅列出頂層的兩句字幕" src="data:image/png;base64,'+base64.b64encode(path.read_bytes()).decode()+'">'
picture=screenshot('dark')+screenshot('light')
nav=''.join('<a class="chapter-link" data-chapter="'+c['id']+'" href="#'+c['id']+'"><span>'+str(i+1).zfill(2)+'</span>'+html.escape(c['title'])+'</a>' for i,c in enumerate(chapters))
cards=''.join('<a class="chapter-card" data-chapter="'+c['id']+'" href="#'+c['id']+'"><span class="card-no">'+str(i+1).zfill(2)+'</span><h3>'+html.escape(c['title'])+'</h3><p>'+html.escape(c['desc'])+'</p><span class="card-arrow" aria-hidden="true">↗</span></a>' for i,c in enumerate(chapters))
sections=[]
for i,c in enumerate(chapters):
    prev='<a href="#'+chapters[i-1]['id']+'">← 上一章</a>' if i else '<a href="#home">← 首頁目錄</a>'
    nxt='<a href="#'+chapters[i+1]['id']+'">下一章 →</a>' if i+1<len(chapters) else '<a href="#home">回首頁目錄 ↑</a>'
    sections.append('<section class="chapter" id="'+c['id']+'" data-title="'+html.escape(c['title'],quote=True)+'"><header class="chapter-heading"><span class="eyebrow">CHAPTER '+str(i+1).zfill(2)+'</span><h2 tabindex="-1">'+html.escape(c['title'])+'</h2><p>'+html.escape(c['desc'])+'</p></header>'+c['html'].replace('{{SUBTITLE_SCREEN}}',picture)+'<nav class="chapter-footer" aria-label="章節導覽">'+prev+'<a href="#home">目錄</a>'+nxt+'</nav></section>')
page=r'''<!doctype html>
<html lang="zh-Hant" data-theme="dark">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark light">
<title>NiVedit 操作手冊｜電腦版</title>
<script>try{document.documentElement.dataset.theme=localStorage.getItem('nv.manual.theme')||localStorage.getItem('nv.theme')||'dark'}catch(e){}</script>
<style>
:root{--bg:#111820;--surface:#19242e;--surface2:#1e2c37;--text:#eaf1f6;--muted:#aabcc9;--line:#344653;--accent:#78dbc9;--accentbg:#213d3c;--header:#111820f5;--start:#1d3652;--end:#3c2b52;--shadow:0 12px 40px #0002}
:root[data-theme=light]{--bg:#f5f7f5;--surface:#fff;--surface2:#edf2ee;--text:#182e36;--muted:#51666d;--line:#d0dcd6;--accent:#096b5a;--accentbg:#e0f2e9;--header:#f5f7f5f5;--start:#e7f0ff;--end:#f2e9fc;--shadow:0 12px 40px #17372c0a}
*{box-sizing:border-box}html{scroll-behavior:smooth;scroll-padding-top:94px}body{margin:0;background:var(--bg);color:var(--text);font:16px/1.85 "Segoe UI","Microsoft JhengHei",sans-serif}
a{color:var(--accent);text-underline-offset:4px}a:hover{text-decoration-thickness:2px}button,input,select{font:inherit}button{cursor:pointer}a:focus-visible,button:focus-visible,input:focus-visible,summary:focus-visible{outline:3px solid var(--accent);outline-offset:4px}
.skip{position:absolute;top:-100px;left:12px;z-index:20;background:var(--surface);padding:10px}.skip:focus{top:8px}
.topbar{position:sticky;top:0;z-index:5;background:var(--header);border-bottom:1px solid var(--line);backdrop-filter:blur(12px)}
.topinner{max-width:1400px;margin:auto;display:flex;gap:18px;align-items:center;min-height:76px;padding:12px 34px}
.brand{color:var(--text);font-weight:800;font-size:21px;text-decoration:none;letter-spacing:-.5px}.brand span{color:var(--accent)}
.version{font-size:12px;border:1px solid var(--line);padding:3px 10px;border-radius:30px;color:var(--muted)}
.top-actions{margin-left:auto;display:flex;gap:8px;align-items:center}.top-actions a,.top-actions button{font-size:13px;font-weight:600;background:var(--surface);color:var(--text);border:1px solid var(--line);border-radius:8px;padding:6px 13px;text-decoration:none}
.top-actions .primary{background:var(--accent);color:var(--bg);border-color:var(--accent)}
#reading{height:2px;background:var(--accent);width:0;transition:width .15s}
.layout{max-width:1400px;margin:auto;padding:36px 34px 70px;display:grid;grid-template-columns:258px minmax(0,1fr);gap:48px}
aside{position:sticky;top:108px;align-self:start;max-height:calc(100vh - 128px);overflow:auto;padding:0 12px 16px 0;scrollbar-width:thin}
aside summary{font-size:13px;letter-spacing:2px;font-weight:700;cursor:pointer;margin-bottom:16px}
.search-wrap{display:flex;gap:6px;margin:0 0 10px}#search{width:100%;min-width:0;background:var(--surface);border:1px solid var(--line);border-radius:8px;color:var(--text);padding:9px 10px;font-size:13px}#clearSearch{background:none;border:1px solid var(--line);color:var(--muted);border-radius:8px;padding:4px 10px}
#searchStatus{font-size:12px;color:var(--muted);margin:0 0 13px}.home-link{font-weight:700;text-decoration:none;display:block;padding:8px 10px;margin-bottom:8px}
.chapter-link{display:flex;align-items:baseline;gap:10px;font-size:13px;line-height:1.65;padding:9px 9px;color:var(--muted);text-decoration:none;border-left:2px solid transparent;border-radius:0 7px 7px 0}
.chapter-link span{font-size:11px;font-variant-numeric:tabular-nums;color:var(--accent)}.chapter-link:hover,.chapter-link[aria-current=true]{color:var(--text);background:var(--surface);border-left-color:var(--accent)}
aside .aside-note{font-size:12px;color:var(--muted);border-top:1px solid var(--line);padding-top:16px;margin-top:18px}
main{min-width:0}.hero{padding:20px 0 34px}.eyebrow{font-size:11px;letter-spacing:2.7px;font-weight:700;color:var(--accent)}h1{font-size:clamp(34px,4.4vw,57px);line-height:1.28;letter-spacing:-1.5px;margin:18px 0 20px}h1 small{display:block;font:inherit;color:var(--muted)}
.hero>p{max-width:650px;color:var(--muted);font-size:17px}.hero-meta{display:flex;gap:8px;flex-wrap:wrap;margin:25px 0}.hero-meta span{font-size:12px;border:1px solid var(--line);padding:4px 12px;border-radius:40px}
.quick-links{display:flex;gap:10px;flex-wrap:wrap}.quick-links a{font-size:13px;border-radius:8px;padding:8px 14px;background:var(--accentbg);text-decoration:none;font-weight:700}
.toc-title{display:flex;align-items:center;gap:16px;margin:20px 0 14px}.toc-title h2{font-size:20px;margin:0}.toc-title span{font-size:12px;color:var(--muted)}
.cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.chapter-card{position:relative;color:var(--text);background:var(--surface);border:1px solid var(--line);border-radius:13px;padding:19px 19px 23px;text-decoration:none;transition:transform .15s,border-color .15s;box-shadow:var(--shadow)}
.chapter-card:hover{transform:translateY(-3px);border-color:var(--accent)}.card-no{font-size:12px;color:var(--accent);letter-spacing:2px}.chapter-card h3{font-size:16px;line-height:1.55;margin:12px 0 8px;max-width:90%}.chapter-card p{font-size:13px;line-height:1.65;color:var(--muted);margin:0}.card-arrow{position:absolute;top:16px;right:17px;color:var(--muted)}
.chapter{margin-top:72px;padding-top:35px;border-top:1px solid var(--line);scroll-margin-top:16px}.chapter-heading h2{font-size:30px;line-height:1.45;margin:10px 0 9px;letter-spacing:-.6px}.chapter-heading>p{color:var(--muted);font-size:14px;margin-bottom:30px}.chapter h3{font-size:20px;margin:32px 0 13px}.chapter p{margin:14px 0}.lead{font-size:19px;font-weight:600}
.chapter li{padding:3px 0 3px 4px;margin-bottom:7px}.chapter ol,.chapter ul{padding-left:25px}.steps{counter-reset:step;list-style:none;padding-left:0!important}.steps>li{position:relative;padding:12px 0 14px 48px;min-height:50px;border-bottom:1px solid var(--line)}
.steps>li:before{counter-increment:step;content:counter(step);position:absolute;left:0;top:13px;width:29px;height:29px;text-align:center;border-radius:50%;background:var(--accentbg);color:var(--accent);font-size:13px;font-weight:700;line-height:29px}
.note{margin:22px 0;padding:17px 20px;background:var(--accentbg);border-left:3px solid var(--accent);border-radius:0 9px 9px 0;font-size:15px}.note strong{color:var(--accent)}
table{width:100%;border-collapse:collapse;font-size:14px;margin:20px 0;overflow-wrap:anywhere}th{text-align:left;color:var(--accent);background:var(--surface2)}th,td{padding:12px 14px;border:1px solid var(--line);vertical-align:top}td:first-child{min-width:125px;font-weight:600}kbd,code{font-family:Consolas,"Microsoft JhengHei",monospace;font-size:.88em;background:var(--surface2);border:1px solid var(--line);padding:2px 6px;border-radius:4px}
.workspace-map{display:grid;grid-template-columns:1fr 1.6fr 1fr;gap:8px;margin:20px 0;font-size:12px;text-align:center}.workspace-map>div{padding:22px 10px;background:var(--surface);border:1px solid var(--line);border-radius:8px}.workspace-map .map-preview{background:var(--accentbg)}.map-timeline{grid-column:1/-1}
.track-stack{max-width:520px;margin:20px 0;display:grid;gap:7px}.track-stack>div{padding:9px 15px;border:1px solid var(--line);border-left:4px solid #8caeff;background:var(--surface);border-radius:6px}.track-stack>div:nth-child(even){border-left-color:var(--accent)}.track-stack small{color:var(--muted);margin-left:15px}
.two-up{display:grid;grid-template-columns:1fr 1fr;gap:14px}.two-up>div{padding:17px 20px;border-radius:8px}.start-state{background:var(--start)}.end-state{background:var(--end)}.two-up p{font-size:14px}
figure{margin:28px 0}figure img{display:block;width:100%;height:auto;max-width:760px;border:1px solid var(--line);border-radius:10px}figcaption{font-size:12px;color:var(--muted);margin-top:9px}
[data-theme=dark] .shot-light,[data-theme=light] .shot-dark{display:none}
.chapter details{border-bottom:1px solid var(--line);padding:18px 0}.chapter summary{cursor:pointer;font-size:17px;font-weight:700}.chapter details p{font-size:15px;color:var(--muted)}
.chapter-footer{display:flex;justify-content:space-between;gap:12px;margin-top:35px;padding:18px 0;font-size:13px}.chapter-footer a{text-decoration:none}footer{margin-top:55px;font-size:12px;color:var(--muted);border-top:1px solid var(--line);padding-top:22px}
[hidden]{display:none!important}
@media(max-width:1120px){.layout{gap:30px;grid-template-columns:220px minmax(0,1fr)}.cards{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:850px){.topinner{padding:10px 18px;gap:9px;flex-wrap:wrap}.version{font-size:10px}.top-actions{gap:5px}.top-actions a,.top-actions button{padding:6px 9px;font-size:12px}.layout{display:block;padding:22px 20px 50px}aside{position:static;max-height:none;padding:14px 16px;margin-bottom:24px;background:var(--surface);border:1px solid var(--line);border-radius:12px}.side-list{max-height:300px;overflow:auto}.aside-note{display:none}.hero{padding-top:10px}.chapter{margin-top:48px}.chapter-heading h2{font-size:25px}}
@media(max-width:500px){.cards{grid-template-columns:1fr}.brand{font-size:18px}.version{display:none}.top-actions .primary{display:none}.two-up{grid-template-columns:1fr}.workspace-map{grid-template-columns:1fr}.workspace-map .map-timeline{grid-column:auto}h1{font-size:36px}table{font-size:12px}th,td{padding:9px}td:first-child{min-width:80px}.chapter-footer{font-size:12px}}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}*{transition:none!important}}
@media print{@page{margin:18mm}html{scroll-padding-top:0}body{background:#fff;color:#111;font-size:11pt}aside,.topbar,.quick-links,.chapter-footer,.skip,#home .cards,#home .toc-title,button{display:none!important}.layout{display:block;padding:0}.hero{padding:0}h1{font-size:30pt}.chapter{break-before:page;margin-top:0;padding-top:0;border:0}.chapter-heading h2{font-size:23pt}h2,h3,summary{break-after:avoid}.note,table,figure,.two-up{break-inside:avoid}.note,.workspace-map>div,.track-stack>div{background:#f3f6f4;color:#111}.note strong,.eyebrow,th,a{color:#14594d}th,td{border-color:#bbb}.chapter-heading>p,.hero>p,figcaption,.chapter details p,footer{color:#444}.shot-dark{display:none!important}.shot-light{display:block!important}figure img{max-width:650px}.chapter details{break-inside:avoid}kbd,code{color:#111;background:#eee}}
@media print{#home,.chapter{display:block!important}}
</style></head>
<body>
<a class="skip" href="#home">跳到手冊內容</a>
<div class="topbar"><div class="topinner"><a class="brand" href="#home">Ni<span>Vedit</span> <span style="font-size:13px;font-weight:500;color:var(--muted)">操作手冊</span></a><span class="version">電腦版・更新至 {{VERSION}}</span><div class="top-actions"><a href="#home">首頁目錄</a><button id="theme" type="button" aria-pressed="false">切換模式</button><button id="print" type="button">列印 / PDF</button><a class="primary" id="editorLink" href="NiVedit.html" target="_blank" rel="noopener">開啟編輯器 ↗</a></div></div><div id="reading" aria-hidden="true"></div></div>
<div class="layout">
<aside><details open id="toc"><summary>章節導覽</summary><div class="search-wrap"><input id="search" type="search" aria-label="搜尋手冊章節" placeholder="搜尋：頂層、GIF、匯出…"><button id="clearSearch" type="button" aria-label="清除搜尋">×</button></div><p id="searchStatus" role="status">16 章・點選開啟該章</p><a class="home-link" href="#home">首頁與完整目錄</a><nav class="side-list" aria-label="操作手冊章節">{{NAV}}</nav><p class="aside-note">目前版本：{{VERSION}}<br>操作說明與疑難排解<br>更新：{{MANUAL_DATE}}<br>本手冊可單檔離線閱讀。</p></details></aside>
<main id="content">
<section id="home"><div class="hero"><div class="eyebrow">DESKTOP EDITOR · USER GUIDE</div><h1>從第一段素材，<small>到完成影片。</small></h1><p>NiVedit 電腦版操作手冊。從目錄選一章，開啟你需要的操作章節；第一次使用可以從「第一次剪片」開始。</p><div class="hero-meta"><span>操作指南 {{VERSION}}</span><span>Windows・Chrome / Edge</span><span>16 個操作章節</span><span>繁體中文</span></div><div class="quick-links"><a href="#quickstart">開始第一支影片 →</a><a href="#subtitles">我要新增頂層字幕 →</a><a href="#export">匯出與儲存 →</a></div></div>
<div class="toc-title"><h2>今天想做什麼？</h2><span>點章節卡片即可跳轉</span></div><div class="cards">{{CARDS}}</div></section>
{{SECTIONS}}
<footer>NiVedit 操作手冊｜適用編輯器 {{VERSION}}｜內容更新 {{MANUAL_DATE}}<br>手冊中的截圖為測試示範。實際可用功能以目前編輯器版本與裝置支援為準。<br><a href="#home">回到首頁目錄 ↑</a></footer>
</main></div>
<script>
(function(){
const root=document.documentElement,theme=document.getElementById('theme');
function syncTheme(){const dark=root.dataset.theme!=='light';theme.textContent=dark?'白天模式':'夜間模式';theme.setAttribute('aria-pressed',String(!dark));}
theme.onclick=function(){root.dataset.theme=root.dataset.theme==='light'?'dark':'light';try{localStorage.setItem('nv.manual.theme',root.dataset.theme)}catch(e){}syncTheme()};syncTheme();
const toc=document.getElementById('toc');if(matchMedia('(max-width:850px)').matches)toc.open=false;
document.getElementById('editorLink').href=location.protocol==='file:'?'NiVedit.html':'./';
document.getElementById('print').onclick=function(){window.print()};
const chapters=Array.from(document.querySelectorAll('.chapter'));
const search=document.getElementById('search'),status=document.getElementById('searchStatus');
function filter(){
const q=search.value.trim().toLocaleLowerCase(),matches=new Set(chapters.filter(s=>s.textContent.toLocaleLowerCase().includes(q)).map(s=>s.id));
document.querySelectorAll('[data-chapter]').forEach(el=>{el.hidden=!matches.has(el.dataset.chapter)});
status.textContent=q?(matches.size?'找到 '+matches.size+' 章；點目錄前往':'沒有符合的章節，試試其他關鍵字'):chapters.length+' 章・點選直接跳到該段';
}
search.addEventListener('input',filter);document.getElementById('clearSearch').onclick=function(){search.value='';filter();search.focus()};
function position(){
const max=document.documentElement.scrollHeight-innerHeight;
document.getElementById('reading').style.width=(max>0?Math.min(100,scrollY/max*100):0)+'%';
let active=location.hash.slice(1);
document.querySelectorAll('.chapter-link').forEach(a=>{if(a.dataset.chapter===active)a.setAttribute('aria-current','true');else a.removeAttribute('aria-current')});
}
function showChapter(){
let id=location.hash.slice(1)||'home';
if(id!=='home'&&!chapters.some(s=>s.id===id))id='home';
document.getElementById('home').hidden=id!=='home';
chapters.forEach(s=>s.hidden=s.id!==id);
scrollTo({top:0,behavior:'instant'});position();
const target=document.getElementById(id);const heading=target.querySelector('h1,h2');
if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true})}
}
addEventListener('hashchange',showChapter);showChapter();
let waiting=false;addEventListener('scroll',function(){if(!waiting){waiting=true;requestAnimationFrame(function(){position();waiting=false})}},{passive:true});addEventListener('resize',position);position();
document.querySelectorAll('a[href^="#"]').forEach(a=>a.addEventListener('click',function(){const dest=document.getElementById(a.hash.slice(1));if(!dest)return;const heading=dest.querySelector('h2,h1');if(heading){heading.tabIndex=-1;setTimeout(()=>heading.focus({preventScroll:true}),0)}}));
addEventListener('beforeprint',()=>document.querySelectorAll('.chapter details').forEach(d=>{d.dataset.printOpen=String(d.open);d.open=true}));
addEventListener('afterprint',()=>document.querySelectorAll('.chapter details').forEach(d=>{d.open=d.dataset.printOpen==='true'}));
})();
</script></body></html>'''
page=page.replace('{{NAV}}',nav).replace('{{CARDS}}',cards).replace('{{SECTIONS}}','\n'.join(sections))
page=page.replace('{{VERSION}}',VERSION).replace('{{MANUAL_DATE}}',MANUAL_DATE)
out=ROOT/'NiVedit_操作手冊.html'
out.write_bytes(page.encode('utf-8'))
(ROOT/'nivedit-src/manual.html').write_bytes(page.encode('utf-8'))
print(str(out),out.stat().st_size,'bytes;',len(chapters),'chapters')
