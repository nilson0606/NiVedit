
const {expectedFormat}=require('./_fmt.cjs');
const {chromium}=require('playwright');
const fs=require('fs'),http=require('http'),path=require('path');
const HTML=process.env.NIVEDIT_HTML||'/home/claude/NiVedit.html';
const CHROME=process.env.NIVEDIT_CHROME||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const FIX=process.env.NIVEDIT_FIX||'/tmp/tv';
(async()=>{
 const srv=http.createServer((q,r)=>{r.setHeader('Content-Type','text/html; charset=utf-8');fs.createReadStream(HTML).pipe(r);});
 await new Promise(r=>srv.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:CHROME,args:['--autoplay-policy=no-user-gesture-required']});
 const ctx=await browser.newContext({viewport:{width:1500,height:980},acceptDownloads:true});
 const p=await ctx.newPage(),bad=[];let count=0;
 const chk=(name,ok)=>{count++;if(!ok)bad.push(name);};
 const errors=[];p.on('pageerror',e=>errors.push(e.message));
 try{
 await p.addInitScript(() => { window.showSaveFilePicker = undefined; }); // Test browser-download fallback; native save is covered separately.
  await p.goto('http://127.0.0.1:'+srv.address().port);
 await p.waitForFunction(()=>typeof A!=='undefined');
 chk('version',await p.textContent('#verTag')==='v11.8');
 await p.setInputFiles('#fileAny',FIX+'/t300.webm');
 await p.waitForFunction(()=>A.clips.length===1&&A.clips[0].el.readyState>=2);
 await p.evaluate(()=>{
   Object.assign(A.proj,{w:320,h:180,fps:20,bitrate:2,fadeIn:0,fadeOut:0,fit:'contain'});
   const c=A.clips[0];c.outP=2;
   A.sel={type:'clip',id:c.id};A.playhead=.1;render();refreshProp();
   window.cropMetric=(cv)=>{
     const W=cv.width,H=cv.height,d=cv.getContext('2d').getImageData(0,0,W,H).data;
     let n=0,sx=0,sy=0,sum=0,minX=W,maxX=-1,minY=H,maxY=-1;
     for(let y=0;y<H;y++)for(let x=0;x<W;x++){
       const i=(y*W+x)*4;
       if(d[i+2]>20&&d[i+2]>d[i]+12&&d[i+2]>d[i+1]+12){
         n++;sx+=x;sy+=y;sum+=d[i+2];minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
       }
     }
     return {n,cx:n?sx/n/W:0,cy:n?sy/n/H:0,avg:n?sum/n:0,w:maxX-minX+1,h:maxY-minY+1};
   };
   window.cropShot=(T,W=320,H=180)=>{
     const cv=document.createElement('canvas');cv.width=W;cv.height=H;
     renderFrame(cv.getContext('2d'),T,W,H);return cropMetric(cv);
   };
   window.cropReset=()=>{
     const c=A.clips[0];
     Object.assign(c,{x:.5,y:.5,scale:1,opacity:1,motionRot:0,rot:0,cropShape:'none',
       cropX:.5,cropY:.5,cropW:1,cropH:1,cropSize:1,kf:null,kfT:null});
     return c;
   };
 });
 await p.selectOption('#cCropShape','rect');
 chk('rectangle UI',await p.locator('#cCropcropW').count()===1&&await p.locator('#cCropcropH').count()===1);
 await p.click('#cKf');
 chk('rectangle endpoint UI',await p.locator('#cKcropW').count()===1&&await p.locator('#cKmotionRot').count()===1);
 await p.selectOption('#cCropShape','circle');
 chk('circle endpoint UI',await p.locator('#cKcropSize').count()===1&&await p.locator('#cKcropW').count()===0);
 chk('switch shape preserves motion',await p.evaluate(()=>kfOn(A.clips[0])&&kfEnd(A.clips[0],'cropSize').v===1));
 await p.waitForTimeout(100);
 chk('English crop labels', (await p.textContent('#prop')).includes('Crop diameter'));
 await p.evaluate(()=>setLang('zh'));await p.waitForTimeout(100);
 chk('Chinese crop labels',(await p.textContent('#prop')).includes('裁切直徑'));
 await p.evaluate(()=>setLang('en'));

 const metrics=await p.evaluate(()=>{
   const c=cropReset(),full=cropShot(.5);
   c.cropShape='rect';c.cropW=.5;c.cropH=.4;const rect=cropShot(.5);
   c.cropShape='circle';c.cropSize=.8;const circle=cropShot(.5);
   c.cropShape='rect';c.cropW=.2;c.cropH=.5;c.kf={cropW:[{t:1,v:.6,e:'linear'}]};
   const anim=[cropShot(0),cropShot(1),cropShot(1.99)];
   c.kfT=[.25,.75];const hold=[cropShot(0),cropShot(.4),cropShot(1.6),cropShot(1.99)];
   c.kfT=null;c.cropShape='circle';c.cropSize=.2;c.kf={cropSize:[{t:1,v:.8,e:'linear'}]};
   const circleAnim=[cropShot(0),cropShot(1.99)];
   cropReset();c.cropShape='rect';c.cropW=.4;c.cropH=.8;c.scale=.6;c.x=.3;c.opacity=.9;
   c.kf={x:[{t:1,v:.7,e:'linear'}],y:[{t:1,v:.6,e:'linear'}],scale:[{t:1,v:.8,e:'linear'}],
     opacity:[{t:1,v:.4,e:'linear'}],motionRot:[{t:1,v:90,e:'linear'}],
     cropW:[{t:1,v:.6,e:'linear'}],cropH:[{t:1,v:.3,e:'linear'}]};
   const combined=[cropShot(0),cropShot(1.99)];
   cropReset();c.cropShape='circle';c.cropSize=.8;c.rot=90;
   const portrait=cropShot(.5);
   A.proj.fit='cover';const cover=cropShot(.5);A.proj.fit='contain';
   cropReset();c.cropShape='rect';c.cropW=.3;c.cropH=.3;c.cropX=0;c.cropY=0;
   const corner=cropShot(.5);
   c.cropX=.5;c.cropY=.5;c.scale=.5;
   const small=cropShot(.5,320,180),large=cropShot(.5,640,360);
   // No crop must be byte-identical to the original paint path.
   cropReset();
   const cv=document.createElement('canvas');cv.width=320;cv.height=180;const x=cv.getContext('2d');
   paintClipRaw(x,{clip:c,T:.5},320,180);const before=cv.toDataURL();
   paintClip(x,{clip:c,T:.5},320,180);const legacy=before===cv.toDataURL();
   return {full,rect,circle,anim,hold,circleAnim,combined,portrait,cover,corner,small,large,legacy};
 });
 chk('rectangle actual width/height',Math.abs(metrics.rect.w-160)<3&&Math.abs(metrics.rect.h-72)<3);
 chk('rectangle area',Math.abs(metrics.rect.n/metrics.full.n-.2)<.02);
 chk('circle stays round',Math.abs(metrics.circle.w-metrics.circle.h)<=2);
 chk('circle corners removed',metrics.circle.n/(metrics.circle.w*metrics.circle.h)>.75&&metrics.circle.n/(metrics.circle.w*metrics.circle.h)<.82);
 chk('rectangle size interpolates',metrics.anim[0].w<70&&metrics.anim[1].w>120&&metrics.anim[2].w>185);
 chk('crop holds outside motion window',metrics.hold[0].n===metrics.hold[1].n&&metrics.hold[2].n===metrics.hold[3].n);
 chk('circle diameter animates',metrics.circleAnim[1].n>metrics.circleAnim[0].n*14);
 chk('combined transform position',metrics.combined[0].cx<.35&&metrics.combined[1].cx>.65&&metrics.combined[1].cy>.55);
 chk('combined transform opacity',metrics.combined[1].avg<metrics.combined[0].avg*.55);
 chk('combined rotation and crop dimensions',metrics.combined[1].h>metrics.combined[1].w*3);
 chk('portrait circle has equal pixel axes',Math.abs(metrics.portrait.w-metrics.portrait.h)<=2&&metrics.portrait.w<90);
 chk('cover circle has equal pixel axes',Math.abs(metrics.cover.w-metrics.cover.h)<=2&&metrics.cover.w>140);
 chk('crop center selects corner',metrics.corner.cx<.17&&metrics.corner.cy<.17);
 chk('crop scales with export resolution',Math.abs(metrics.large.n/metrics.small.n-4)<.25);
 chk('legacy no-crop pixels unchanged',metrics.legacy);

 // Paused preview must update through actual controls, without pressing play.
 await p.evaluate(()=>{const c=cropReset();c.cropShape='rect';A.sel={type:'clip',id:c.id};A.playhead=.5;render();refreshProp();});
 await p.waitForTimeout(350);const before=await p.locator('#preview').screenshot();
 const slider=p.locator('#cCropcropW');await slider.focus();await slider.press('Home');
 await p.waitForTimeout(350);const after=await p.locator('#preview').screenshot();
 chk('paused slider redraw',!before.equals(after));
 await p.click('#btnUndo');await p.waitForTimeout(150);
 chk('crop slider undo',await p.evaluate(()=>A.clips[0].cropW===1));
 await p.click('#btnRedo');await p.waitForTimeout(150);
 chk('crop slider redo',await p.evaluate(()=>A.clips[0].cropW===.01));

 const split=await p.evaluate(()=>{
   const c=cropReset();c.cropShape='rect';c.cropW=.2;
   c.kf={cropW:[{t:1,v:.8,e:'linear'}],motionRot:[{t:1,v:60,e:'linear'}]};
   A.sel={type:'clip',id:c.id};A.playhead=1;splitClip();
   const a=A.clips[0],b=A.clips[1];
   return {left:kfAt(a,'cropW',a.cropW,1),right:kfAt(b,'cropW',b.cropW,1),shared:a.kf===b.kf||a.kf.cropW===b.kf.cropW,shape:b.cropShape};
 });
 chk('split crop continuous and independent',Math.abs(split.left-split.right)<1e-6&&!split.shared&&split.shape==='rect');
 await p.evaluate(()=>undo());

 // Actual nvproj binary save/import plus legacy data without crop fields.
 const roundtrip=await p.evaluate(async()=>{
   const c=cropReset();c.cropShape='circle';c.cropSize=.3;c.cropX=.4;
   c.kf={cropSize:[{t:1,v:.7,e:'linear'}],scale:[{t:1,v:.8,e:'linear'}]};c.kfT=[.2,.8];
   const blob=await buildProjBlob();
   await projImportFile(new File([blob],'crop-roundtrip.nvproj'));
   const r=A.clips[0];return {shape:r.cropShape,size:r.cropSize,x:r.cropX,end:r.kf.cropSize[0].v,window:r.kfT};
 });
 chk('nvproj crop roundtrip',roundtrip.shape==='circle'&&roundtrip.size===.3&&roundtrip.x===.4&&roundtrip.end===.7&&roundtrip.window[0]===.2);
 const legacy=await p.evaluate(async()=>{
   const {st,files}=serialize();
   for(const key of ['cropShape','cropX','cropY','cropW','cropH','cropSize'])delete st.clips[0][key];
   st.clips[0].kf=null;await deserialize(st,files);return A.clips[0].cropShape==='none'&&A.clips[0].cropW===1;
 });
 chk('old project crop defaults',legacy);
 await p.waitForFunction(()=>A.clips[0].el.readyState>=2);


 // Imported image clips use the same crop path; crop masks must survive transitions.
 const png=await p.evaluate(()=>{const c=document.createElement('canvas');c.width=640;c.height=360;const x=c.getContext('2d');x.fillStyle='blue';x.fillRect(0,0,640,360);return c.toDataURL().split(',')[1];});
 await p.setInputFiles('#fileImage',{name:'crop-blue.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
 await p.waitForFunction(()=>A.clips.length===2&&A.clips[1].el.naturalWidth>0);
 const imageAndTransition=await p.evaluate(()=>{
   const a=cropReset(),b=A.clips[1];
   Object.assign(a,{cropShape:'rect',cropW:.4,cropH:.4});
   // v11.8：圖片自己一條軌（IMG_TRACK），不再接在影片後面。
   // 排到影片結束之後，畫面上才只有這張圖，量到的才是它的遮罩。
   Object.assign(b,{cropShape:'circle',cropSize:.5,trans:{type:'dissolve',dur:.6},outP:2,
                    at:layout()[0].end+0.5});
   const q=layout()[1],image=cropShot(q.start+1),T=q.trAt+q.tr/2;
   const transition=cropShot(T),hasTransition=!!activeAt(T,IMG_TRACK).intro;
   // A second full-frame render must not inherit the previous circular canvas clip.
   b.cropShape='none';const noLeak=cropShot(q.start+1);
   A.clips.length=1;return {image,transition,hasTransition,noLeak};
 });
 chk('image clip circle',Math.abs(imageAndTransition.image.w-imageAndTransition.image.h)<=2&&imageAndTransition.image.w===90);
 chk('cropped image opening transition preserves its mask',imageAndTransition.hasTransition&&imageAndTransition.transition.n>5000&&imageAndTransition.transition.n<16000);
 chk('crop mask does not leak to next draw',imageAndTransition.noLeak.n===320*180);

 // Export both shapes; decode the MP4 and compare its pixels with preview.
 const FMT=await expectedFormat(p);
 for(const shape of ['rect','circle']){
   await p.evaluate(shape=>{
     const c=cropReset();Object.assign(c,{cropShape:shape,cropW:.3,cropH:.6,cropSize:.3,x:.3,scale:.7,outP:2});
     c.kf={cropW:[{t:1,v:.6,e:'linear'}],cropSize:[{t:1,v:.8,e:'linear'}],
       x:[{t:1,v:.65,e:'linear'}],scale:[{t:1,v:.9,e:'linear'}],opacity:[{t:1,v:.5,e:'linear'}],
       motionRot:[{t:1,v:45,e:'linear'}]};
     A.playhead=0;render();refreshProp();
   },shape);
   const expected=await p.evaluate(()=>[.25,1,1.75].map(t=>cropShot(t)));
   const [d]=await Promise.all([p.waitForEvent('download',{timeout:120000}),p.click('#btnExport')]);
   await p.waitForFunction(()=>!A.exporting);
   await p.click('#mClose');
   const file=await d.path();
   const outputDir=path.dirname(HTML);await d.saveAs(path.join(outputDir,'crop-'+shape+'.mp4'));
   const payload=fs.readFileSync(file).toString('base64');
   const decoded=await p.evaluate(async payload=>{
     const bytes=Uint8Array.from(atob(payload),c=>c.charCodeAt(0));
     const url=URL.createObjectURL(new Blob([bytes],{type:'video/mp4'}));
     const v=document.createElement('video');v.muted=true;v.preload='auto';
     await new Promise((resolve,reject)=>{v.onloadeddata=resolve;v.onerror=reject;v.src=url;});
     const cv=document.createElement('canvas');cv.width=v.videoWidth;cv.height=v.videoHeight;
     const out=[];
     for(const t of [.25,1,1.75]){
       await new Promise((resolve,reject)=>{v.onseeked=resolve;v.onerror=reject;v.currentTime=t;});
       cv.getContext('2d').drawImage(v,0,0);out.push(cropMetric(cv));
     }
     URL.revokeObjectURL(url);return out;
   },payload);
   // H.264 chroma subsampling spreads blue into edge pixels; compare integrated
   // brightness, not the average of a threshold-selected region.
   chk(shape+' exports '+FMT,d.suggestedFilename().endsWith('.'+FMT)&&fs.statSync(file).size>1000);
   chk(shape+' export crop matches preview pixels',decoded.every((m,i)=>Math.abs(m.cx-expected[i].cx)<.015&&Math.abs(m.cy-expected[i].cy)<.015&&Math.abs(m.n/expected[i].n-1)<.13&&Math.abs(m.n*m.avg/(expected[i].n*expected[i].avg)-1)<.08&&Math.abs(m.w-expected[i].w)<=4&&Math.abs(m.h-expected[i].h)<=4));
 }
 chk('no page errors',errors.length===0);
 console.log('通過 '+(count-bad.length)+' / '+count);
 if(bad.length)console.log('失敗:\n'+bad.join('\n')+'\n'+JSON.stringify(metrics,null,2));
 fs.writeFileSync(path.join(path.dirname(HTML),'crop-results.json'),JSON.stringify({count,bad,metrics,errors},null,2));
 if(bad.length)process.exitCode=1;
 }finally{await browser.close();await new Promise(r=>srv.close(r));}
})().catch(e=>{console.error(e);process.exit(1);});
