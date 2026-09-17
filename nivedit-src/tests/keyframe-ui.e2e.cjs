const {chromium}=require('playwright'),fs=require('fs'),http=require('http'),path=require('path');
const HTML=process.env.NIVEDIT_HTML,CHROME=process.env.NIVEDIT_CHROME,FIX=process.env.NIVEDIT_FIX,OUT=path.dirname(HTML);
(async()=>{
 const srv=http.createServer((q,r)=>{r.setHeader('Content-Type','text/html; charset=utf-8');fs.createReadStream(HTML).pipe(r)});
 await new Promise(r=>srv.listen(0,'127.0.0.1',r));const b=await chromium.launch({executablePath:CHROME});
 const p=await(await b.newContext({viewport:{width:1500,height:1050},acceptDownloads:true})).newPage();
 const errors=[],bad=[],facts={};let n=0;const chk=(s,v)=>{n++;if(!v)bad.push(s)};p.on('pageerror',e=>errors.push(e.message));
 try{
 await p.addInitScript(() => { window.showSaveFilePicker = undefined; }); // Test browser-download fallback; native save is covered separately.
  await p.goto('http://127.0.0.1:'+srv.address().port);await p.waitForFunction(()=>typeof A!=='undefined');
 chk('version',await p.textContent('#verTag')==='v11.8');
 await p.setInputFiles('#fileAny',[FIX+'/t300.webm',FIX+'/t900.webm']);
 await p.waitForFunction(()=>A.clips.length===2&&A.clips.every(c=>c.video.readyState>=2));
 await p.evaluate(()=>{
   setLang('zh');Object.assign(A.proj,{w:320,h:180,fps:20,bitrate:2});
   A.clips.forEach((c,i)=>Object.assign(c,{track:i,at:0,inP:0,outP:2,muted:true,trans:{type:'none',dur:0},transOut:{type:'none',dur:0}}));
   A.clips[1].cropShape='circle';A.sel={type:'clip',id:A.clips[1].id};A.playhead=.4;render();refreshProp();
   window.colors=cv=>{
     const d=cv.getContext('2d').getImageData(0,0,cv.width,cv.height).data;let red=0,blue=0,black=0;
     for(let i=0;i<d.length;i+=4){if(d[i]>80&&d[i]>d[i+2]*2)red++;if(d[i+2]>80&&d[i+2]>d[i]*2)blue++;if(d[i]<5&&d[i+1]<5&&d[i+2]<5)black++}
     return {red,blue,black};
   };
   window.shot=T=>{const cv=document.createElement('canvas');cv.width=320;cv.height=180;renderFrame(cv.getContext('2d'),T,320,180);return colors(cv)};
 });
 chk('static circle slider includes zero',await p.getAttribute('#cCropcropSize','min')==='0');
 chk('no keyframe shading before enabled',await p.locator('#prop .kf-row').count()===0);
 await p.locator('#cCropcropSize').fill('0');await p.locator('#cCropcropSize').dispatchEvent('input');
 chk('zero circle reveals entire lower track',await p.evaluate(()=>A.clips[1].cropSize===0&&shot(.4).blue===320*180));
 chk('zero on bottom track renders black',await p.evaluate(()=>{Object.assign(A.clips[0],{cropShape:'circle',cropSize:0});const black=shot(.4).black;A.clips[0].cropShape='none';return black===320*180}));
 await p.click('#cKf');
 chk('circle endpoint slider includes zero',await p.getAttribute('#cKcropSize','min')==='0');
 chk('zero is retained when enabling animation',await p.evaluate(()=>kfEnd(A.clips[1],'cropSize').v===0));
 chk('start and end animated rows marked',await p.locator('#cCropcropSize').evaluate(e=>e.closest('.row').dataset.kfRole==='start')&&await p.locator('#cKcropSize').evaluate(e=>e.closest('.row').dataset.kfRole==='end'));
 chk('unrelated volume and fade controls stay plain',await p.locator('#cVol').evaluate(e=>!e.closest('.row').classList.contains('kf-row'))&&await p.locator('#cFi').evaluate(e=>!e.closest('.row').classList.contains('kf-row')));
 const palette=[];
 for(const theme of ['dark','light']){
   await p.evaluate(theme=>{setTheme(theme);$('#cKcropSize').scrollIntoView({block:'center'})},theme);
   const col=await p.evaluate(()=>['cCropcropSize','cKcropSize'].map(id=>{const r=$('#'+id).closest('.row');return {bg:getComputedStyle(r).backgroundColor,fg:getComputedStyle(r.querySelector('label')).color,mark:getComputedStyle(r.querySelector('label'),'::before').content}}));
   palette.push(col);chk(theme+' distinct start and end backgrounds',col[0].bg!==col[1].bg&&col.every(q=>q.mark.includes('◆')));
   await p.waitForTimeout(200); // let the theme button color transition settle before visual inspection
   await p.screenshot({path:path.join(OUT,'keyframes-'+theme+'.png')});
 }
 facts.palette=palette;
 chk('both row backgrounds follow editor theme',palette[0].every((q,i)=>q.bg!==palette[1][i].bg&&q.fg!==palette[1][i].fg));
 await p.click('#cKf');chk('disable clears shading',await p.locator('#prop .kf-row').count()===0);
 await p.click('#btnUndo');chk('undo restores shading',await p.locator('#cX').evaluate(e=>e.closest('.row').classList.contains('kf-row')));
 await p.evaluate(()=>{A.clips[1].kf={x:[{t:1,v:.7,e:'linear'}]};refreshProp()});
 chk('partial keyframes shade only actual keyed properties',await p.locator('#cX').evaluate(e=>e.closest('.row').classList.contains('kf-row'))&&await p.locator('#cY').evaluate(e=>!e.closest('.row').classList.contains('kf-row')));
 await p.locator('#cKcropSize').fill('0');await p.locator('#cKcropSize').dispatchEvent('input');
 chk('adding endpoint immediately marks matching start and end',await p.locator('#cCropcropSize').evaluate(e=>e.closest('.row').classList.contains('kf-row'))&&await p.locator('#cKcropSize').evaluate(e=>e.closest('.row').classList.contains('kf-row')));
 await p.evaluate(()=>setLang('en'));await p.waitForTimeout(100);
 chk('new legend is translated',await p.locator('#prop').textContent().then(t=>t.includes('Shaded items marked')));
 await p.evaluate(async()=>{
   const c=A.clips[1];c.cropSize=0;c.kf={cropSize:[{t:1,v:0,e:'linear'}]};const blob=await buildProjBlob();await projImportFile(new File([blob],'zero.nvproj'));
 });
 chk('nvproj retains exact zero at both endpoints',await p.evaluate(()=>A.clips[1].cropSize===0&&kfEnd(A.clips[1],'cropSize').v===0));
 await p.waitForFunction(()=>A.clips.every(c=>c.video.readyState>=2));
 await p.evaluate(()=>{const c=A.clips[1];c.cropSize=1;c.kfT=[0,.5];A.playhead=0;render();refreshProp()});
 const expected=await p.evaluate(()=>[.25,1.5].map(shot));facts.expected=expected;
 chk('circle shrinks to zero and stays absent after motion ends',expected[0].red>1000&&expected[1].red===0&&expected[1].blue===320*180);
 const [dl]=await Promise.all([p.waitForEvent('download',{timeout:120000}),p.click('#btnExport')]);await p.waitForFunction(()=>!A.exporting);await p.click('#mClose');
 const dest=path.join(OUT,'zero-circle.mp4');await dl.saveAs(dest);
 const decoded=await p.evaluate(async bytes=>{
   const data=Uint8Array.from(atob(bytes),c=>c.charCodeAt(0)),v=document.createElement('video');v.muted=true;
   const url=URL.createObjectURL(new Blob([data],{type:'video/mp4'}));await new Promise((r,j)=>{v.onloadeddata=r;v.onerror=j;v.src=url});
   const cv=document.createElement('canvas');cv.width=320;cv.height=180;const out=[];
   for(const t of [.25,1.5]){await new Promise(r=>{v.onseeked=r;v.currentTime=t});cv.getContext('2d').drawImage(v,0,0);out.push(colors(cv))}
   URL.revokeObjectURL(url);return out;
 },fs.readFileSync(dest).toString('base64'));facts.decoded=decoded;
 chk('MP4 shrinking circle matches preview',Math.abs(decoded[0].red/expected[0].red-1)<.06);
 chk('MP4 zero diameter has no residual dot',decoded[1].red===0&&decoded[1].blue===320*180);
 await p.setInputFiles('#fileOverlay',FIX+'/pic1.png');await p.waitForFunction(()=>A.overlays.length===1);
 await p.click('#oKf');
 chk('overlay start and end share keyframe shading',await p.locator('#oOpa').evaluate(e=>e.closest('.row').dataset.kfRole==='start')&&await p.locator('#oKrot').evaluate(e=>e.closest('.row').dataset.kfRole==='end'));
 await p.evaluate(()=>addTitle());await p.click('#tKf');
 chk('title size and endpoint share keyframe shading',await p.locator('#tSize').evaluate(e=>e.closest('.row').dataset.kfRole==='start')&&await p.locator('#tKopacity').evaluate(e=>e.closest('.row').dataset.kfRole==='end'));
 chk('no page errors',errors.length===0);
 fs.writeFileSync(path.join(OUT,'keyframe-ui-results.json'),JSON.stringify({count:n,bad,errors,facts},null,2));
 console.log('通過 '+(n-bad.length)+' / '+n);if(bad.length){console.log(bad,JSON.stringify(facts));process.exitCode=1}
 }finally{await b.close();await new Promise(r=>srv.close(r))}
})().catch(e=>{console.error(e);process.exit(1)});
