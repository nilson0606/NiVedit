const {chromium}=require('playwright'),fs=require('fs'),http=require('http'),path=require('path');
const { VER } = require('./_ver.cjs');
const HTML=process.env.NIVEDIT_HTML,CHROME=process.env.NIVEDIT_CHROME,FIX=process.env.NIVEDIT_FIX,OUT=path.dirname(HTML);
(async()=>{
 const srv=http.createServer((q,r)=>{r.setHeader('Content-Type','text/html; charset=utf-8');fs.createReadStream(HTML).pipe(r)});
 await new Promise(r=>srv.listen(0,'127.0.0.1',r));
 const b=await chromium.launch({executablePath:CHROME,args:['--autoplay-policy=no-user-gesture-required']});
 const p=await(await b.newContext({viewport:{width:1500,height:1050},acceptDownloads:true})).newPage();
 const errors=[],bad=[],facts={};let n=0;const chk=(s,v)=>{n++;if(!v)bad.push(s)};
 p.on('pageerror',e=>errors.push(e.message));
 try{
 await p.addInitScript(() => { window.showSaveFilePicker = undefined; }); // Test browser-download fallback; native save is covered separately.
  await p.goto('http://127.0.0.1:'+srv.address().port);await p.waitForFunction(()=>typeof A!=='undefined');
 chk('version',await p.textContent('#verTag')===VER);
 await p.setInputFiles('#fileAny',[FIX+'/upper-motion.webm',FIX+'/t300.webm']);
 await p.waitForFunction(()=>A.clips.length===2&&A.clips.every(c=>c.el.readyState>=2));
 await p.evaluate(()=>{
   window.original=A.clips.slice();
   window.resetTiming=()=>{
     setPlaying(false);A.clips=original.slice();A.titles=[];A.subs=[];A.musics=[];A.overlays=[];
     Object.assign(A.proj,{videoModes:['overlap','overlap'],transAdd:false,w:320,h:180,fps:20,bitrate:2,fadeIn:0,fadeOut:0});
     A.clips.forEach((c,i)=>Object.assign(c,{track:i,at:0,transMode:'overlap',fadeIn:0,fadeOut:0,fadeAudio:true,inP:0,outP:2,vol:.5,muted:false,kf:null,kfT:null,
       trans:{type:'none',dur:.5},transOut:{type:'none',dur:.5},cropShape:'none',grade:{...GRADE0},x:.5,y:.5,scale:1,opacity:1,motionRot:0}));
     A.sel={type:'proj'};A.playhead=.5;A.pps=70;_undo.length=0;_redo.length=0;render();refreshProp();return A.clips;
   };
   window.sample=async T=>{
     A.playhead=T;
     for(const a of activeTracksAt(T))await seekVideo(a.a.clip.video,a.a.t);
     const cv=document.createElement('canvas');cv.width=320;cv.height=180;renderFrame(cv.getContext('2d'),T,320,180);
     return Array.from(cv.getContext('2d').getImageData(160,90,1,1).data).slice(0,3);
   };
   resetTiming();
 });
 chk('project no longer owns transition controls',await p.locator('#cVideoMode').count()===0&&await p.locator('#pFi').count()===0);
 const variants=await p.evaluate(()=>{
   const r=[];
   for(const lo of ['overlap','add'])for(const up of ['overlap','add']){
     const [a,b]=resetTiming();a.at=2;b.at=7;a.trans.type=b.trans.type='dissolve';a.transOut.type=b.transOut.type='dissolve';
     setClipMode(A.clips[0],lo);setClipMode(A.clips[1],up);const L=layout();r.push({lo,up,L});
   }return r;
 });facts.variants=variants;
 chk('all four combinations retain gaps',variants.every(v=>v.L[0].startAt===2&&v.L[1].startAt===7));
 chk('inside uses existing duration',variants.every(v=>v.L.every(q=>q.add||q.span===2)));
 chk('outside adds both head and tail holds',variants.every(v=>v.L.every(q=>!q.add||q.span===3&&q.start===q.startAt+.5)));
 await p.evaluate(()=>{const [a,b]=resetTiming();a.trans.type='dissolve';a.transOut.type='dissolve';A.sel={type:'clip',id:a.id};refreshProp();});
 await p.selectOption('#cVideoMode','add');
 chk('clip selector changes only requested clip',await p.evaluate(()=>clipMode(A.clips[0])==='add'&&clipMode(A.clips[1])==='overlap'));
 await p.click('#btnUndo');chk('transition mode undo',await p.evaluate(()=>clipMode(A.clips[0])==='overlap'));
 await p.click('#btnRedo');chk('transition mode redo',await p.evaluate(()=>clipMode(A.clips[0])==='add'));
 const independent=await p.evaluate(()=>{
   const [a,b]=resetTiming();b.track=0;b.at=8;render();placeClip(a,0,3);render();const moved=layout().map(q=>q.startAt);
   trimClip(a,0,1);render();const trimmed=layout().map(q=>q.startAt);A.sel={type:'clip',id:a.id};delSelected();
   const deleted=layout()[0].startAt;undo();return {moved,trimmed,deleted,restored:layout().map(q=>q.startAt)};
 });
 chk('inside allows moving with gaps',JSON.stringify(independent.moved)==='[3,8]');
 chk('trim and delete leave other clips fixed',JSON.stringify(independent.trimmed)==='[3,8]'&&independent.deleted===8);
 chk('undo restores independent positions',JSON.stringify(independent.restored)==='[3,8]');
 await p.evaluate(()=>{const [a,b]=resetTiming();A.sel={type:'clip',id:a.id};render();refreshProp();});
 chk('first clip has opening and ending controls',await p.locator('#cTrans').count()===1&&await p.locator('#cTrOut').count()===1);
 chk('timing input enabled for inside',await p.locator('#cAt').isEnabled());
 await p.selectOption('#cVideoMode','add');chk('timing input enabled for outside',await p.locator('#cAt').isEnabled());
 await p.locator('#cAt').fill('2');await p.locator('#cAt').press('Tab');
 chk('outside allows leading gap',await p.evaluate(()=>layout().find(q=>q.track===0).startAt===2));
 const held=await p.evaluate(async()=>{
   const [a,b]=resetTiming();A.clips=[a];a.trans={type:'dissolve',dur:1.5};a.transOut={type:'dissolve',dur:1.5};
   setClipMode(A.clips[0],'add');const outside=[activeAt(.3).a.t,activeAt(1.2).a.t,activeAt(3.7).a.t,activeAt(4.5).a.t];
   const colors=[await sample(1.2),await sample(3),await sample(3.7)];
   setClipMode(A.clips[0],'overlap');return {outside,inside:[activeAt(.2).a.t,activeAt(.8).a.t],colors};
 });facts.held=held;
 chk('outside opening repeats first frame',held.outside[0]===0&&held.outside[1]===0);
 chk('outside ending repeats last included frame',Math.abs(held.outside[2]-1.9999)<1e-5&&held.outside[2]===held.outside[3]);
 chk('inside advances source during transition',held.inside[1]-held.inside[0]>.59);
 chk('actual held opening remains red after source would turn green',held.colors[0][0]>170&&held.colors[0][1]<35);
 chk('body and held ending use green final source',held.colors[1][1]>170&&held.colors[2][1]>150);

 await p.evaluate(()=>{
   const [a,b]=resetTiming();A.clips=[a];a.trans={type:'dissolve',dur:1.5};a.transOut={type:'dissolve',dur:1.5};
   a.kf={x:[{t:1,v:.7,e:'linear'}]};setClipMode(A.clips[0],'add');render();refreshProp();
 });
 const marks=await p.locator('#videoLower .kfm').evaluateAll(ns=>ns.map(n=>parseFloat(n.style.left)));
 chk('keyframe markers exclude outside hold time',Math.abs(marks[0]-105)<1&&Math.abs(marks[1]-245)<1);
 const block=await p.locator('#videoLower .blk').boundingBox(),mark=await p.locator('#videoLower .kfm').first().boundingBox();
 await p.mouse.move(mark.x+mark.width/2,mark.y+mark.height/2);await p.mouse.down();
 await p.mouse.move(block.x+140,mark.y+mark.height/2,{steps:5});await p.mouse.up();
 chk('keyframe drag maps only to moving source time',await p.evaluate(()=>Math.abs(kfWin(A.clips[0])[0]-.25)<.025));
 const saved=await p.evaluate(async()=>{
   const [a,b]=resetTiming();a.at=1;b.at=5;a.trans.type='dissolve';a.transOut.type='dissolve';setClipMode(A.clips[0],'add');
   const blob=await buildProjBlob();await projImportFile(new File([blob],'timing.nvproj'));original=A.clips.slice();
   return clipMode(A.clips[0])==='add'&&clipMode(A.clips[1])==='overlap'&&layout()[0].startAt===1&&layout()[1].startAt===5;
 });
 chk('nvproj retains independent timing and mode',saved);
 await p.waitForFunction(()=>A.clips.every(c=>c.el.readyState>=2));
 // Export: gap, held red head, moving body, held green tail, gap, blue clip.
 await p.evaluate(()=>{
   const [a,b]=resetTiming();b.track=0;b.at=7;b.outP=1;a.at=1;
   a.trans={type:'dissolve',dur:1.5};a.transOut={type:'dissolve',dur:1.5};setClipMode(A.clips[0],'add');render();refreshProp();
 });
 const times=[.5,2.2,4,4.7,6.5,7.5];
 const samples=await p.evaluate(async times=>{const r=[];for(const t of times)r.push(await sample(t));return r;},times);
 const [dl]=await Promise.all([p.waitForEvent('download',{timeout:120000}),p.click('#btnExport')]);await p.waitForFunction(()=>!A.exporting);await p.click('#mClose');
 const dest=path.join(OUT,'track-modes-export.mp4');await dl.saveAs(dest);
 const decoded=await p.evaluate(async ({bytes,times})=>{
   const data=Uint8Array.from(atob(bytes),c=>c.charCodeAt(0)),ac=new AudioContext(),ab=await ac.decodeAudioData(data.buffer.slice(0));
   const levels=times.map(t=>{const d=ab.getChannelData(0),sr=ab.sampleRate;let sum=0,n=0;for(let i=Math.floor(t*sr);i<(t+.1)*sr;i++){sum+=d[i]*d[i];n++;}return Math.sqrt(sum/n);});await ac.close();
   const v=document.createElement('video');v.muted=true;const url=URL.createObjectURL(new Blob([data],{type:'video/mp4'}));
   await new Promise((r,j)=>{v.onloadeddata=r;v.onerror=j;v.src=url;});const cv=document.createElement('canvas');cv.width=320;cv.height=180;const colors=[];
   for(const t of times){await new Promise(r=>{v.onseeked=r;v.currentTime=t});cv.getContext('2d').drawImage(v,0,0);colors.push(Array.from(cv.getContext('2d').getImageData(160,90,1,1).data).slice(0,3));}
   URL.revokeObjectURL(url);return {levels,colors,duration:v.duration};
 },{bytes:fs.readFileSync(dest).toString('base64'),times});
 facts.export={times,samples,decoded};
 chk('actual MP4 duration includes both holds and gaps',Math.abs(decoded.duration-8)<.1);
 chk('MP4 hold and moving frames match preview',samples.every((q,i)=>q.every((v,k)=>Math.abs(v-decoded.colors[i][k])<18)));
 chk('MP4 gaps black',decoded.colors[0].every(v=>v<5)&&decoded.colors[4].every(v=>v<5));
 chk('MP4 holds and gaps have no source audio',[0,1,3,4].every(i=>decoded.levels[i]<.001));
 chk('MP4 original audio starts at body, resumes after gap',decoded.levels[2]>.02&&decoded.levels[5]>.02);
 chk('no page errors',errors.length===0);
 await p.evaluate(()=>{setLang('zh');A.sel={type:'proj'};render();refreshProp()});await p.screenshot({path:path.join(OUT,'track-modes-ui.png')});
 fs.writeFileSync(path.join(OUT,'track-modes-results.json'),JSON.stringify({count:n,bad,errors,facts},null,2));
 console.log('通過 '+(n-bad.length)+' / '+n);if(bad.length){console.log(bad,JSON.stringify(facts));process.exitCode=1;}
 }finally{await b.close();await new Promise(r=>srv.close(r));}
})().catch(e=>{console.error(e);process.exit(1)});
