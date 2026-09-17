const {chromium}=require('playwright'),fs=require('fs'),http=require('http'),path=require('path');
const { VER } = require('./_ver.cjs');
const HTML=process.env.NIVEDIT_HTML,CHROME=process.env.NIVEDIT_CHROME,FIX=process.env.NIVEDIT_FIX,OUT=path.dirname(HTML);
(async()=>{
 const srv=http.createServer((q,r)=>{r.setHeader('Content-Type','text/html; charset=utf-8');fs.createReadStream(HTML).pipe(r)});
 await new Promise(r=>srv.listen(0,'127.0.0.1',r));const b=await chromium.launch({executablePath:CHROME});
 const p=await(await b.newContext({viewport:{width:1500,height:1050},acceptDownloads:true})).newPage();
 const errors=[],bad=[],facts={};let n=0;const chk=(s,v)=>{n++;if(!v)bad.push(s)};p.on('pageerror',e=>errors.push(e.message));
 try{
 await p.addInitScript(() => { window.showSaveFilePicker = undefined; }); // Test browser-download fallback; native save is covered separately.
  await p.goto('http://127.0.0.1:'+srv.address().port);await p.waitForFunction(()=>typeof A!=='undefined');
 chk('version',await p.textContent('#verTag')===VER);
 await p.setInputFiles('#fileAny',FIX+'/t300.webm');await p.waitForFunction(()=>A.clips.length===1&&A.clips[0].video.readyState>=2);
 await p.evaluate(()=>{
   setLang('zh');Object.assign(A.proj,{w:320,h:180,fps:20,bitrate:2});A.clips[0].outP=2;A.clips[0].muted=true;addTitle();
   Object.assign(A.titles[0],{start:0,end:2,text:'MMMMMMMM',font:'Arial',size:100,color:'#ffffff',strokeW:0,shadow:false,
     x:.5,y:.5,align:'center',opacity:1,rot:0,animIn:'none',animOut:'none',kf:null,kfT:null});A.playhead=.5;render();refreshProp();
   window.orientation=cv=>{
     const W=cv.width,H=cv.height,d=cv.getContext('2d').getImageData(0,0,W,H).data;
     let n=0,sx=0,sy=0,sxx=0,syy=0,sxy=0;
     for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=(y*W+x)*4;if(d[i]>30&&d[i+1]>30){
       n++;sx+=x;sy+=y;sxx+=x*x;syy+=y*y;sxy+=x*y;
     }}
     const xx=sxx/n-(sx/n)**2,yy=syy/n-(sy/n)**2,xy=sxy/n-sx*sy/n/n;
     return {n,angle:Math.atan2(2*xy,xx-yy)*90/Math.PI};
   };
   window.shot=T=>{const cv=document.createElement('canvas');cv.width=320;cv.height=180;renderFrame(cv.getContext('2d'),T,320,180);return orientation(cv)};
 });
 chk('one size control inside the same start group',await p.locator('#tSize').count()===1&&await p.evaluate(()=>$('#tSize').closest('.grp')===$('#tX').closest('.grp')));
 chk('start controls ordered to match endpoints',await p.evaluate(()=>Array.from($('#tX').closest('.grp').querySelectorAll('input[type=range]')).map(e=>e.id).join(',')==='tX,tY,tSize,tOpa,tRot'));
 await p.locator('#tRot').fill('90');await p.locator('#tRot').dispatchEvent('input');
 chk('static UI rotation actually turns text vertical',await p.evaluate(()=>Math.abs(Math.abs(shot(.5).angle)-90)<2));
 await p.click('#tKf');
 chk('endpoint rotation starts from current angle',await p.evaluate(()=>kfEnd(A.titles[0],'rot').v===90));
 chk('five matching start and end highlights',await p.evaluate(()=>['tX','tY','tSize','tOpa','tRot','tKx','tKy','tKsize','tKopacity','tKrot'].every(id=>$('#'+id).closest('.row').classList.contains('kf-row'))));
 await p.locator('#tRot').fill('0');await p.locator('#tRot').dispatchEvent('input');
 await p.selectOption('#tKe','linear');
 const times=[.25,1,1.75],expected=await p.evaluate(ts=>ts.map(shot),times);facts.expected=expected;
 chk('rotation changes actual pixels through timeline',expected.every((q,i)=>q.n>100&&Math.abs(q.angle-[11.25,45,78.75][i])<2));
 const combined=await p.evaluate(()=>{
   const t=A.titles[0],saved=JSON.parse(JSON.stringify(t));
   t.kf=null;t.rot=45;t.animIn='rotate';t.animDur=1;
   const v=shot(.5),want=(45-.45*(1-ease(.5))*180/Math.PI);
   Object.assign(t,saved);return {v,want};
 });facts.combined=combined;
 chk('keyframe rotation composes with entrance rotation',Math.abs(combined.v.angle-combined.want)<2);
 for(const theme of ['dark','light']){
   await p.evaluate(theme=>{setTheme(theme);$('#tX').closest('.grp').scrollIntoView({block:'start'})},theme);await p.waitForTimeout(200);
   await p.locator('#right').screenshot({path:path.join(OUT,'title-framing-'+theme+'.png')});
 }
 await p.evaluate(()=>{A.playhead=.5;render();refreshProp()});
 const [dl]=await Promise.all([p.waitForEvent('download',{timeout:120000}),p.click('#btnExport')]);await p.waitForFunction(()=>!A.exporting);await p.click('#mClose');
 const dest=path.join(OUT,'title-rotation.mp4');await dl.saveAs(dest);
 const decoded=await p.evaluate(async({bytes,times})=>{
   const data=Uint8Array.from(atob(bytes),c=>c.charCodeAt(0)),v=document.createElement('video');v.muted=true;
   const url=URL.createObjectURL(new Blob([data],{type:'video/mp4'}));await new Promise((r,j)=>{v.onloadeddata=r;v.onerror=j;v.src=url});
   const cv=document.createElement('canvas');cv.width=320;cv.height=180;const out=[];
   for(const t of times){await new Promise(r=>{v.onseeked=r;v.currentTime=t});cv.getContext('2d').drawImage(v,0,0);out.push(orientation(cv))}
   URL.revokeObjectURL(url);return out;
 },{bytes:fs.readFileSync(dest).toString('base64'),times});facts.decoded=decoded;
 chk('actual MP4 angles match preview',decoded.every((q,i)=>Math.abs(q.angle-expected[i].angle)<2.5));
 const roundtrip=await p.evaluate(async()=>{
   A.titles[0].rot=-30;kfEnd(A.titles[0],'rot').v=120;
   const blob=await buildProjBlob();await projImportFile(new File([blob],'title-rotation.nvproj'));
   return A.titles[0].rot===-30&&kfEnd(A.titles[0],'rot').v===120;
 });
 chk('nvproj retains both rotation endpoints',roundtrip);
 await p.evaluate(()=>{A.sel={type:'title',id:A.titles[0].id};A.playhead=1;splitTitle()});
 chk('split keeps rotation continuous and independent',await p.evaluate(()=>{
   const [a,b]=A.titles;return Math.abs(kfEnd(a,'rot').v-b.rot)<1e-8&&Math.abs(b.rot-45)<1e-8&&a.kf!==b.kf;
 }));
 await p.click('#btnUndo');chk('undo restores unsplit rotation',await p.evaluate(()=>A.titles.length===1&&A.titles[0].rot===-30&&kfEnd(A.titles[0],'rot').v===120));
 await p.click('#tKf');chk('disable keeps static start rotation',await p.evaluate(()=>A.titles[0].rot===-30&&!kfOn(A.titles[0])));
 await p.evaluate(()=>{delete A.titles[0].rot;refreshProp()});
 chk('legacy title defaults to zero rotation',await p.evaluate(()=>A.titles[0].rot===0));
 /* ── 字體清單（v11.9 加到 30 種）────────────────────────────
    重點不是「有 30 個」，是三件會壞的事：
      1. 分成中文／英文兩組，而且 optgroup 的 label 在英文介面下要真的變英文
         （v11.9 以前 _ATTRS 沒收 label，轉場那幾個分組下拉的群組名一直是中文）。
      2. 這台電腦沒裝的字體要標「（未安裝）」並帶 miss class。
         容器裡幾乎什麼字都沒有，所以「至少有一個被標出來」就驗得到這條路有在跑。
      3. 選到帶引號的字體字串仍然存得進去、尺寸校正不會把字壓爛
         （字體不存在時 measureText 會量到離譜的值，sizeCorrection 夾在 0.8~1.25）。 */
 await p.evaluate(()=>{setLang('zh');A.sel={type:'title',id:A.titles[0].id};refreshProp()});
 await p.waitForTimeout(150);
 const fz=await p.evaluate(()=>{const s=$('#tFont');return{
   n:s.options.length, groups:[...s.querySelectorAll('optgroup')].map(g=>g.label),
   miss:[...s.options].filter(o=>o.classList.contains('miss')).length,
   marked:[...s.options].every(o=>o.classList.contains('miss')===/（未安裝）$/.test(o.textContent)),
   sub:FONTS.length };});
 facts.fonts=fz;
 chk('30 typefaces in two groups',fz.n===30&&fz.sub===30&&fz.groups.join(',')==='中文字體,英文字體');
 chk('missing typefaces are labelled and greyed',fz.miss>0&&fz.marked);
 await p.evaluate(()=>{setLang('en');A.sel={type:'title',id:A.titles[0].id};refreshProp()});
 await p.waitForTimeout(250);
 const fen=await p.evaluate(()=>{
   const s=$('#tFont');
   return {groups:[...s.querySelectorAll('optgroup')].map(g=>g.label),
     note:[...s.options].some(o=>o.textContent.indexOf('(not installed)')>=0),
     zh:[...s.options].some(o=>/[\u3400-\u9fff]/.test(o.textContent))};});
 facts.fontsEn=fen;
 chk('typeface groups translated',fen.groups.join(',')==='Chinese,Latin');
 chk('missing note translated and no Chinese left in the list',fen.note&&!fen.zh);
 await p.evaluate(()=>setLang('zh'));await p.waitForTimeout(150);
 const pick=await p.evaluate(()=>{const f=FONTS.find(x=>x.name==='思源黑體');
   A.sel={type:'title',id:A.titles[0].id};refreshProp();
   $('#tFont').value=f.id;$('#tFont').dispatchEvent(new Event('change'));
   return {stored:A.titles[0].font===f.id, corr:sizeCorrection(f.id,true,'標題ABC'),
           quoted:f.id.includes('"')};});
 facts.fontPick=pick;
 chk('quoted family survives the select and keeps sane size correction',
     pick.stored&&pick.quoted&&pick.corr>=0.8&&pick.corr<=1.25);
 await p.evaluate(()=>{A.titles[0].font='Arial';refreshProp()});
 /* ── 「＋ 標題」要能復原、要算成未存的改動（v11.9）──────────────
    以前 addTitle() 沒有 pushUndo()：加了標題 Ctrl+Z 移不掉、復原鈕還是灰的，
    關分頁也不會提醒。影片／圖片／疊圖／音軌／字幕全都有，只有標題漏掉。
    使用者是從「關分頁沒提醒」這一端發現的（B14）。 */
 {
   const add=await p.evaluate(async()=>{
     _undo.length=0;_redo.length=0;_unsaved=false;updateUndoBtns();
     const n0=A.titles.length;
     $('#btnAddTitle').click();
     return {n0, n1:A.titles.length, unsaved:_unsaved, undoOn:!$('#btnUndo').disabled};
   });
   chk('「＋ 標題」真的加了一個',add.n1===add.n0+1);
   chk('「＋ 標題」算成未存的改動',add.unsaved===true);
   chk('「＋ 標題」之後復原鈕可以按',add.undoOn===true);
   await p.evaluate(()=>undo()); await p.waitForTimeout(150);
   chk('「＋ 標題」可以用復原移掉',await p.evaluate(()=>A.titles.length)===add.n0);
   await p.evaluate(()=>redo()); await p.waitForTimeout(150);
   chk('「＋ 標題」復原之後還能重做',await p.evaluate(()=>A.titles.length)===add.n1);
 }

 chk('no page errors',errors.length===0);
 fs.writeFileSync(path.join(OUT,'title-rotation-results.json'),JSON.stringify({count:n,bad,errors,facts},null,2));
 console.log('通過 '+(n-bad.length)+' / '+n);if(bad.length){console.log(bad,JSON.stringify(facts));process.exitCode=1}
 }finally{await b.close();await new Promise(r=>srv.close(r))}
})().catch(e=>{console.error(e);process.exit(1)});
