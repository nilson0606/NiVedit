
const {expectedFormat}=require('./_fmt.cjs');
const {chromium}=require('playwright'),fs=require('fs'),http=require('http'),path=require('path');
const { VER } = require('./_ver.cjs');
const HTML=process.env.NIVEDIT_HTML||'/home/claude/NiVedit.html';
const CHROME=process.env.NIVEDIT_CHROME||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const FIX=process.env.NIVEDIT_FIX||'/tmp/tv',OUT=path.dirname(HTML);
(async()=>{
 const srv=http.createServer((q,r)=>{r.setHeader('Content-Type','text/html; charset=utf-8');fs.createReadStream(HTML).pipe(r);});
 await new Promise(r=>srv.listen(0,'127.0.0.1',r));
 const b=await chromium.launch({executablePath:CHROME,args:['--autoplay-policy=no-user-gesture-required']});
 const ctx=await b.newContext({viewport:{width:1500,height:1050},acceptDownloads:true});
 const p=await ctx.newPage(),errors=[],bad=[],facts={};let n=0;
 const chk=(name,ok)=>{n++;if(!ok)bad.push(name);};
 p.on('pageerror',e=>errors.push(e.message));
 try{
 await p.addInitScript(() => { window.showSaveFilePicker = undefined; }); // Test browser-download fallback; native save is covered separately.
  await p.goto('http://127.0.0.1:'+srv.address().port);
 await p.waitForFunction(()=>typeof A!=='undefined');
 chk('version',await p.textContent('#verTag')===VER);
 await p.setInputFiles('#fileAny',[FIX+'/t300.webm',FIX+'/t900.webm']);
 await p.waitForFunction(()=>A.clips.length===2&&A.clips.every(c=>c.el.readyState>=2));
 const legacy=await p.evaluate(()=>({starts:layout().map(q=>q.start),dur:A.clips.map(clipDur),total:totalDur(),tracks:A.clips.map(clipTrack)}));
 chk('new clips retain full duration with inside transitions',legacy.starts[0]===0&&Math.abs(legacy.starts[1]-(legacy.dur[0]))<1e-6&&Math.abs(legacy.total-(legacy.dur[0]+legacy.dur[1]))<1e-6);
 chk('old clips lower by default',legacy.tracks.every(t=>t===0));
 await p.evaluate(()=>{
   window.original=A.clips.slice();
   window.dualReset=()=>{
     A.clips=original.slice();A.titles=[];A.subs=[];A.overlays=[];A.musics=[];
     A.proj.transAdd=false;A.proj.videoModes=null;Object.assign(A.proj,{w:320,h:180,fps:20,bitrate:2,fit:'contain',fadeIn:0,fadeOut:0});A.pps=55;
     A.clips.forEach((c,i)=>Object.assign(c,{track:i,at:0,inP:0,outP:3,x:.5,y:.5,scale:1,opacity:1,
       motionRot:0,rot:0,cropShape:'none',cropX:.5,cropY:.5,cropW:1,cropH:1,cropSize:1,
       kf:null,kfT:null,trans:{type:'none',dur:.6},transOut:{type:'none',dur:.6},
       grade:{...GRADE0},muted:false,vol:.5,exportSrc:null}));
     A.sel={type:'clip',id:A.clips[1].id};A.playhead=.5;render();refreshProp();
     return A.clips;
   };
   window.dualFrame=T=>{
     const c=document.createElement('canvas');c.width=320;c.height=180;
     renderFrame(c.getContext('2d'),T,320,180);return c;
   };
   window.pixel=(cv,x,y)=>Array.from(cv.getContext('2d').getImageData(x,y,1,1).data).slice(0,3);
   window.redStats=T=>{
     const cv=dualFrame(T),d=cv.getContext('2d').getImageData(0,0,320,180).data;
     let n=0,sx=0,sy=0;
     for(let y=0;y<180;y++)for(let x=0;x<320;x++){const i=(y*320+x)*4;if(d[i]>70&&d[i]>d[i+2]+30){n++;sx+=x;sy+=y;}}
     return {n,x:n?sx/n:0,y:n?sy/n:0};
   };
 });
 // Track selector and numeric timing use real UI events.
 await p.evaluate(()=>{A.sel={type:'clip',id:A.clips[1].id};render();refreshProp();});
 await p.selectOption('#cTrack','1');
 await p.locator('#cAt').fill('0');await p.locator('#cAt').press('Tab');
 chk('track selector assigns upper',await p.evaluate(()=>clipTrack(A.clips[1])===1&&layout()[1].start===0));
 chk('two actual video rows',await p.locator('.videoLane').count()===2&&await p.locator('#videoUpper .blk').count()===1&&await p.locator('#videoLower .blk').count()===1);
 await p.waitForTimeout(120);
 // v11.9：時間軸上「下軌」那一組排在上面，L 編號才由上往下遞增。
 // v11.9 名稱改成頂層／底層：講的是【疊放順序】（頂層蓋住底層），不是時間軸上的位置。
 chk('lower row above upper (L 編號由上往下遞增)',await p.evaluate(()=>$('#videoLower').getBoundingClientRect().top<$('#videoUpper').getBoundingClientRect().top));
 chk('English track labels',(await p.textContent('#trkVideo')).includes('Top video'));
 await p.evaluate(()=>setLang('zh'));await p.waitForTimeout(120);
 chk('Chinese track labels',(await p.textContent('#trkVideo')).includes('影片頂層'));
 await p.evaluate(()=>setLang('en'));
 const pixels=await p.evaluate(()=>{
   const [lo,up]=dualReset();
   const full=pixel(dualFrame(.5),160,90);
   up.cropShape='rect';up.cropW=.5;up.cropH=.5;
   const rect=dualFrame(.5),center=pixel(rect,160,90),outside=pixel(rect,20,20);
   up.cropShape='circle';up.cropSize=.6;
   const circle=dualFrame(.5),circleCorner=pixel(circle,110,40),circleCenter=pixel(circle,160,90);
   up.opacity=.5;const blend=pixel(dualFrame(.5),160,90);
   up.opacity=0;const zero=pixel(dualFrame(.5),160,90);
   up.opacity=1;up.cropShape='rect';
   const black=document.createElement('canvas');black.width=640;black.height=360;black.getContext('2d').fillRect(0,0,640,360);
   up.exportSrc=black;const realBlack=pixel(dualFrame(.5),160,90);up.exportSrc=null;
   up.cropShape='none';up.scale=.5;up.grade.temp=70;
   const gradedOutside=pixel(dualFrame(.5),10,10);
   up.grade={...GRADE0};up.rot=90;up.scale=1;
   const portraitOutside=pixel(dualFrame(.5),20,90);
   return {full,center,outside,circleCorner,circleCenter,blend,zero,realBlack,gradedOutside,portraitOutside};
 });facts.pixels=pixels;
 const isBlue=c=>c[2]>220&&c[0]<20, isRed=c=>c[0]>220&&c[2]<20;
 chk('upper covers lower',isRed(pixels.full));
 chk('rectangle inside covers',isRed(pixels.center));
 chk('rectangle outside reveals lower',isBlue(pixels.outside));
 chk('circle corners reveal lower',isBlue(pixels.circleCorner)&&isRed(pixels.circleCenter));
 chk('opacity mixes both clips',Math.abs(pixels.blend[0]-127)<6&&Math.abs(pixels.blend[2]-127)<6);
 chk('zero opacity reveals lower',isBlue(pixels.zero));
 chk('black in source is opaque',pixels.realBlack.every(c=>c<5));
 chk('grade does not create opaque upper background',isBlue(pixels.gradedOutside));
 chk('portrait letterbox reveals lower',isBlue(pixels.portraitOutside));
 const motion=await p.evaluate(()=>{
   const [lo,up]=dualReset();
   Object.assign(up,{cropShape:'rect',cropW:.4,cropH:.6,scale:.5,x:.25});
   up.kf={x:[{t:1,v:.7,e:'linear'}],scale:[{t:1,v:.75,e:'linear'}],cropW:[{t:1,v:.6,e:'linear'}],motionRot:[{t:1,v:70,e:'linear'}]};
   return [redStats(0),redStats(2.99)];
 });
 chk('upper crop and transform animate together',motion[0].x<90&&motion[1].x>200&&motion[1].n>motion[0].n*2);
 const timing=await p.evaluate(()=>{
   const [lo,up]=dualReset();lo.outP=5;up.at=1;up.outP=2;
   const results={before:activeTracksAt(.5).length,during:activeTracksAt(1.5).length,after:activeTracksAt(3.5).length,total:totalDur(),afterPixel:pixel(dualFrame(3.5),160,90)};
   lo.outP=1;up.at=2;up.outP=2;
   results.gap=activeTracksAt(1.5).length;results.upperOnly=activeTracksAt(3).length;results.total2=totalDur();
   return results;
 });
 chk('independent starts and ends',timing.before===1&&timing.during===2&&timing.after===1);
 chk('duration is maximum not array tail',timing.total===5&&timing.total2===4);
 chk('ended upper stops covering lower',isBlue(timing.afterPixel));
 chk('gaps do not hold old clips',timing.gap===0&&timing.upperOnly===1);
 const adjacency=await p.evaluate(()=>{
   const [lo,up]=dualReset();lo.outP=5;up.outP=4;
   const lo2={...lo,id:uid(),at:null,trans:{type:'dissolve',dur:.5}},up2={...up,id:uid(),at:null,trans:{type:'dissolve',dur:.75}};
   A.clips.push(lo2,up2);
   const L=layout();const a=activeAt(5.2,0),b=activeAt(4.2,1);
   const r={starts:L.map(q=>q.start),prev:L.map(q=>q.prev),a:!!a.intro&&a.a.clip.id===lo2.id,b:!!b.intro&&b.a.clip.id===up2.id};
   lo.transOut={type:'fade',dur:1};r.outEnd=outWindow(0,layout()).end;
   return r;
 });
 chk('opening transitions belong to their own clips',adjacency.a&&adjacency.b&&adjacency.prev[2]===0&&adjacency.prev[3]===1);
 chk('transition timings independent',Math.abs(adjacency.starts[2]-5)<.01&&Math.abs(adjacency.starts[3]-4)<.01);
 chk('inside ending transition ends at its own clip boundary',adjacency.outEnd===5);
 const transition=await p.evaluate(()=>{
   const [lo,up]=dualReset();up.cropShape='circle';up.cropSize=.5;
   const end={...up,id:uid(),at:null,outP:3,trans:{type:'dissolve',dur:.6}};
   A.clips.push(end);lo.outP=5;
   const mid=layout()[2].trAt+.3,frame=dualFrame(mid);
   const all=TRANSITIONS.filter(t=>t.id!=='none').map(t=>{
     end.trans.type=t.id;const cv=dualFrame(layout()[2].trAt+.3);
     return {type:t.id,corner:pixel(cv,0,0)};
   });
   return {center:pixel(frame,160,90),corner:pixel(frame,0,0),all};
 });facts.transitions=transition;
 chk('upper opening dissolve blends with lower',Math.abs(transition.center[0]-127)<8&&Math.abs(transition.center[2]-127)<8);
 chk('upper dissolve outside crop reveals lower',isBlue(transition.corner));
 chk('all upper transitions render without opaque canvas corners',transition.all.every(t=>isBlue(t.corner)));
 const release=await p.evaluate(()=>{
   const [lo,up]=dualReset();up.cropShape='circle';up.cropSize=.8;
   const end={...up,id:uid(),at:null,cropSize:.15,trans:{type:'dissolve',dur:1}};
   A.clips.push(end);lo.outP=5;
   return ['dissolve','blurDis','flash','slideL','slideR','slideU','slideD','lighten','darken','spin'].map(type=>{
     end.trans.type=type;const q=layout()[2];return {type,pixel:pixel(dualFrame(q.trAt+q.tr*.999),205,90)};
   });
 });
 chk('outgoing upper crop disappears by transition end',release.every(q=>q.pixel[0]<10&&q.pixel[2]>230));
 facts.transitionRelease=release;
 // Drag across actual rows and undo.
 await p.evaluate(()=>dualReset());await p.waitForTimeout(200);
 let box=await p.locator('#videoUpper .blk').boundingBox(),dest=await p.locator('#videoLower').boundingBox();
 await p.mouse.move(box.x+box.width*.5,box.y+box.height*.65);await p.mouse.down();
 await p.mouse.move(box.x+box.width*.5,dest.y+dest.height*.5,{steps:6});await p.mouse.up();
 chk('vertical drag changes video track',await p.evaluate(()=>A.clips.every(c=>clipTrack(c)===0)));
 await p.click('#btnUndo');
 chk('track move undo',await p.evaluate(()=>A.clips.filter(c=>clipTrack(c)===1).length===1));
 await p.click('#btnRedo');
 chk('track move redo',await p.evaluate(()=>A.clips.every(c=>clipTrack(c)===0)));
 await p.evaluate(()=>dualReset());await p.waitForTimeout(100);
 box=await p.locator('#videoUpper .blk').boundingBox();
 const my=box.y+box.height*.5;   // v11.9 方塊變薄了，寫死的 22 會落在框外
 await p.mouse.move(box.x+40,my);await p.mouse.down();await p.mouse.move(box.x+95,my,{steps:6});await p.mouse.up();
 chk('horizontal drag positions clip in time',await p.evaluate(()=>Math.abs(layout()[A.clips.findIndex(c=>clipTrack(c)===1)].start-1)<.04));
 const split=await p.evaluate(()=>{
   const [lo,up]=dualReset();up.cropShape='circle';up.cropSize=.3;up.kf={cropSize:[{t:1,v:.8,e:'linear'}]};
   A.playhead=1.5;A.sel={type:'clip',id:lo.id};splitClip();
   const lowerSplit=A.clips.filter(c=>clipTrack(c)===0).length===2&&A.clips.filter(c=>clipTrack(c)===1).length===1;
   undo();A.sel={type:'clip',id:A.clips.find(c=>clipTrack(c)===1).id};splitClip();
   const tops=A.clips.filter(c=>clipTrack(c)===1);
   return {lowerSplit,upperSplit:tops.length===2,continuous:Math.abs(kfAt(tops[0],'cropSize',tops[0].cropSize,1.5)-kfAt(tops[1],'cropSize',tops[1].cropSize,1.5))<1e-6};
 });
 chk('split targets selected lower despite upper overlap',split.lowerSplit);
 chk('upper split preserves crop and timing',split.upperSplit&&split.continuous);
 const saved=await p.evaluate(async()=>{
   const [lo,up]=dualReset();up.at=.7;up.cropShape='circle';up.cropSize=.5;up.kf={x:[{t:1,v:.7,e:'linear'}]};
   const blob=await buildProjBlob();await projImportFile(new File([blob],'dual-roundtrip.nvproj'));
   const c=A.clips.find(c=>c.track===1),L=layout();original=A.clips.slice();
   return c&&c.at===.7&&c.cropShape==='circle'&&c.kf.x[0].v===.7&&L.find(q=>q.track===1).start===.7;
 });
 chk('real project roundtrip preserves tracks timing crop and motion',saved);
 await p.waitForFunction(()=>A.clips.every(c=>c.el.readyState>=2));
 const old=await p.evaluate(async()=>{
   const {st,files}=serialize();for(const c of st.clips){delete c.track;delete c.at;}
   await deserialize(st,files);original=A.clips.slice();
   return A.clips.every(c=>c.track===0)&&layout()[1].start>2;
 });
 chk('legacy project missing track fields stays sequential',old);
 await p.waitForFunction(()=>A.clips.every(c=>c.el.readyState>=2));
 const audio=await p.evaluate(async()=>{
   const [lo,up]=dualReset();
   const level=(buf,f)=>{const d=buf.getChannelData(0),sr=buf.sampleRate;let re=0,im=0,n=0;for(let i=Math.floor(sr*.5);i<sr;i++){re+=d[i]*Math.cos(2*Math.PI*f*i/sr);im+=d[i]*Math.sin(2*Math.PI*f*i/sr);n++;}return 2*Math.hypot(re,im)/n;};
   const both=await buildAudio(totalDur()),mix=[level(both,300),level(both,900)];
   up.muted=true;const single=await buildAudio(totalDur());const muted=[level(single,300),level(single,900)];up.muted=false;
   A.playhead=.6;setPlaying(true);syncMedia();await new Promise(r=>setTimeout(r,120));
   const preview=A.clips.map(c=>({paused:c.video.paused,muted:c.video.muted,vol:c.video.volume}));
   setPlaying(false);return {mix,muted,preview};
 });facts.audio=audio;
 chk('export mixes both original audio tracks',audio.mix[0]>.02&&audio.mix[1]>.02);
 chk('mute affects only selected track audio',audio.muted[0]>.02&&audio.muted[1]<.001);
 chk('preview plays both original audio tracks',audio.preview.every(x=>!x.paused&&!x.muted&&Math.abs(x.vol-.5)<.01));
 // A time-varying upper fixture catches forgotten upper-track decoding.
 await p.setInputFiles('#fileAny',path.join(FIX,'upper-motion.webm'));
 await p.waitForFunction(()=>A.clips.length===3&&A.clips[2].el.readyState>=2);
 await p.evaluate(()=>{
   const lo=A.clips[0],up=A.clips[2];original=[lo,up];dualReset();
   up.at=.5;up.outP=2;up.cropShape='circle';up.cropSize=.7;up.x=.4;up.opacity=.8;
   up.kf={x:[{t:1,v:.65,e:'linear'}],cropSize:[{t:1,v:.9,e:'linear'}],motionRot:[{t:1,v:40,e:'linear'}]};
   A.playhead=.75;render();refreshProp();
 });
 const samples=await p.evaluate(async()=>{
   const results=[];
   for(const T of [.25,.75,2]){
     A.playhead=T;
     for(const a of activeTracksAt(T))for(const r of [a.a,a.b].filter(Boolean))if(r.clip.video)await seekVideo(r.clip.video,r.t);
     const cv=dualFrame(T);results.push({T,center:pixel(cv,160,90),corner:pixel(cv,0,0)});
   }return results;
 });
 const FMT=await expectedFormat(p);
 const [dl]=await Promise.all([p.waitForEvent('download',{timeout:120000}),p.click('#btnExport')]);
 await p.waitForFunction(()=>!A.exporting);await p.click('#mClose');
 const destFile=path.join(OUT,'dual-track-export.mp4');await dl.saveAs(destFile);
 const decoded=await p.evaluate(async bytes=>{
   const data=Uint8Array.from(atob(bytes),c=>c.charCodeAt(0)),url=URL.createObjectURL(new Blob([data],{type:'video/mp4'}));
   const v=document.createElement('video');v.muted=true;
   await new Promise((resolve,reject)=>{v.onloadeddata=resolve;v.onerror=reject;v.src=url;});
   const cv=document.createElement('canvas');cv.width=v.videoWidth;cv.height=v.videoHeight;const values=[];
   for(const T of [.25,.75,2]){
     await new Promise((resolve,reject)=>{v.onseeked=resolve;v.onerror=reject;v.currentTime=T;});
     cv.getContext('2d').drawImage(v,0,0);values.push({T,center:pixel(cv,160,90),corner:pixel(cv,0,0)});
   }
   URL.revokeObjectURL(url);return values;
 },fs.readFileSync(destFile).toString('base64'));facts.export={samples,decoded};
 chk('export container is '+FMT,dl.suggestedFilename().endsWith('.'+FMT)&&fs.statSync(destFile).size>1000);
 chk('export upper is decoded at current time',decoded[1].center[0]>150&&decoded[2].center[1]>150);
 chk('export shows lower outside upper crop',decoded.every(q=>isBlue(q.corner)));
 chk('export composition matches preview',samples.every((q,i)=>q.center.every((v,k)=>Math.abs(v-decoded[i].center[k])<15)));
 chk('no page errors',errors.length===0);
 await p.evaluate(()=>{A.playhead=.75;setLang('zh');render();refreshProp();seekTo(.75);});
 await p.waitForTimeout(250);await p.screenshot({path:path.join(OUT,'dual-track-ui.png')});
 fs.writeFileSync(path.join(OUT,'dual-track-results.json'),JSON.stringify({count:n,bad,errors,facts},null,2));
 console.log('通過 '+(n-bad.length)+' / '+n);
 if(bad.length){console.log('失敗:\n'+bad.join('\n')+'\n'+JSON.stringify(facts));process.exitCode=1;}
 }finally{await b.close();await new Promise(r=>srv.close(r));}
})().catch(e=>{console.error(e);process.exit(1)});
