const {chromium}=require('playwright'),fs=require('fs'),http=require('http'),path=require('path');
const { VER } = require('./_ver.cjs');
const HTML=process.env.NIVEDIT_HTML,CHROME=process.env.NIVEDIT_CHROME,FIX=process.env.NIVEDIT_FIX,OUT=path.dirname(HTML);
(async()=>{
 const srv=http.createServer((q,r)=>{r.setHeader('Content-Type','text/html; charset=utf-8');fs.createReadStream(HTML).pipe(r)});
 await new Promise(r=>srv.listen(0,'127.0.0.1',r));
 const b=await chromium.launch({executablePath:CHROME,args:['--autoplay-policy=no-user-gesture-required']});
 const p=await(await b.newContext({viewport:{width:1500,height:1050},acceptDownloads:true})).newPage();
 const errors=[],bad=[],facts={};let n=0;const chk=(s,v)=>{n++;if(!v)bad.push(s)};p.on('pageerror',e=>errors.push(e.message));
 try{
 await p.addInitScript(() => { window.showSaveFilePicker = undefined; }); // Test browser-download fallback; native save is covered separately.
  await p.goto('http://127.0.0.1:'+srv.address().port);await p.waitForFunction(()=>typeof A!=='undefined');
 chk('version',await p.textContent('#verTag')===VER);
 // 拖放（#fileAny）只收影片與聲音；圖片一律走「＋ 圖片」那個獨立的 input。
 await p.setInputFiles('#fileAny',[FIX+'/t300.webm',FIX+'/t900.webm',FIX+'/tone440.wav']);
 await p.waitForFunction(()=>A.clips.length===2&&A.musics.length===1);
 await p.setInputFiles('#fileImage',FIX+'/pic1.png');
 await p.waitForFunction(()=>A.clips.length===3&&A.musics.length===1&&A.clips.filter(c=>c.video).every(c=>c.video.readyState>=2));
 await p.evaluate(()=>{
   setLang('zh');window.original=A.clips.slice();window.music=A.musics[0];
   window.resetClips=()=>{
     setPlaying(false);A.clips=original.slice();A.musics=[music];A.overlays=[];A.titles=[];A.subs=[];
     Object.assign(A.proj,{w:320,h:180,fps:20,bitrate:2,fit:'contain'});
     A.clips.forEach((c,i)=>Object.assign(c,{track:i?1:0,at:i===0?0:i===1?1:6,inP:0,outP:i===0?5:i===1?4:2,
       transMode:'overlap',fadeIn:0,fadeOut:0,fadeAudio:true,vol:i===0?.3:.4,muted:isImg(c),kf:null,kfT:null,
       x:.5,y:.5,scale:1,opacity:1,motionRot:0,cropShape:'none',cropX:.5,cropY:.5,cropW:1,cropH:1,cropSize:1,
       trans:{type:'none',dur:.5},transOut:{type:'none',dur:.5},grade:{...GRADE0}}));
     Object.assign(music,{startAt:0,len:8,autoLen:false,offset:0,vol:.2,fadeIn:0,fadeOut:0,loop:false,xfade:0,vk:[]});
     A.sel={type:'clip',id:A.clips[1].id};A.playhead=2;_undo.length=0;_redo.length=0;render();refreshProp();
   };
   window.sample=async T=>{
     for(const a of activeTracksAt(T))if(a.a.clip.video)await seekVideo(a.a.clip.video,a.a.t);
     const cv=document.createElement('canvas');cv.width=320;cv.height=180;const x=cv.getContext('2d');renderFrame(x,T,320,180);
     const rgb=(xx,yy)=>Array.from(x.getImageData(xx,yy,1,1).data).slice(0,3);
     const data=x.getImageData(0,0,320,180).data;let white=0,whiteTop=0,whiteBot=0;
     for(let i=0;i<data.length;i+=4){
       if(data[i]>245&&data[i+1]>245&&data[i+2]>245){
         white++; ((i/4/320|0)<90?whiteTop++:whiteBot++);   // 頂層字幕在上半，下軌在下半
       }
     }
     return {center:rgb(160,90),corner:rgb(10,10),white,whiteTop,whiteBot};
   };
   window.spectrum=(buf,t)=>{
     const ch=buf.getChannelData(0),sr=buf.sampleRate,a=Math.round((t-.05)*sr),N=Math.round(.1*sr);
     return [300,900,440].map(f=>{let re=0,im=0;for(let j=0;j<N;j++){const v=ch[a+j],w=2*Math.PI*f*(a+j)/sr;re+=v*Math.cos(w);im+=v*Math.sin(w)}return 2*Math.hypot(re,im)/N});
   };
   resetClips();
 });
 chk('exact requested mute wording',(await p.locator('#cMute').locator('..').textContent()).trim()==='勾選後靜音');
 chk('both mode choices belong to selected clip',await p.locator('#cVideoMode option').count()===2);
 chk('fade sliders and audio toggle in clip',await p.locator('#cFi').count()===1&&await p.locator('#cFo').count()===1&&await p.locator('#cFaudio').isChecked());
 await p.evaluate(()=>{A.sel={type:'proj'};refreshProp()});
 chk('project removed mode and fade controls; diagnostics retained',await p.locator('#pFi,#pFo,#pFaudio,#pVideoMode0,#pVideoMode1').count()===0&&await p.locator('#pDiag').count()===1);
 await p.evaluate(()=>{A.sel={type:'clip',id:A.clips[1].id};refreshProp()});
 await p.selectOption('#cVideoMode','add');
 chk('same lane peer keeps inside mode',await p.evaluate(()=>clipMode(A.clips[1])==='add'&&clipMode(A.clips[2])==='overlap'&&clipMode(A.clips[0])==='overlap'));
 await p.evaluate(()=>{placeClip(A.clips[1],0,7);render()});
 chk('mode follows clip across lanes',await p.evaluate(()=>clipTrack(A.clips[1])===0&&clipMode(A.clips[1])==='add'));
 await p.evaluate(()=>resetClips());
 await p.locator('#cFi').focus();await p.locator('#cFi').press('ArrowRight');
 chk('keyboard fade edit changes only selected clip',await p.evaluate(()=>Math.abs(A.clips[1].fadeIn-.1)<1e-6&&A.clips[0].fadeIn===0&&A.clips[2].fadeIn===0));
 await p.click('#btnUndo');chk('fade undo',await p.evaluate(()=>A.clips[1].fadeIn===0));
 await p.click('#btnRedo');chk('fade redo',await p.evaluate(()=>Math.abs(A.clips[1].fadeIn-.1)<1e-6));
 await p.evaluate(()=>{A.clips[1].fadeIn=0;refreshProp();A.playhead=2;markDirty()});
 const before=await p.evaluate(()=>sample(2));
 await p.locator('#cFi').fill('2');await p.locator('#cFi').dispatchEvent('input');
 const live=await p.evaluate(()=>({dirty:_dirty||_dirtyUntil>performance.now(),volume:A.clips[1].video.volume,playing:A.playing}));
 chk('paused change updates original audio immediately',Math.abs(live.volume-.2)<.001&&!live.playing);
 await p.waitForFunction(()=>{const q=pctx.getImageData(Math.floor(pcv.width/2),Math.floor(pcv.height/2),1,1).data;return q[0]>100&&q[0]<155&&q[2]>100});
 chk('paused preview updates without pressing play',true);
 await p.locator('#cFo').fill('1');await p.locator('#cFo').dispatchEvent('input');
 await p.locator('#cFaudio').uncheck();
 chk('audio toggle restores only this clip volume',await p.evaluate(()=>A.clips[1].video.volume===.4&&A.clips[0].video.volume===.3&&music.el.volume===.2));
 await p.locator('#cFaudio').check();
 await p.evaluate(()=>{
   Object.assign(A.clips[1],{cropShape:'circle',cropSize:.7,opacity:.8,kf:{x:[{t:1,v:.6,e:'linear'}]}});
   A.subs=[{id:uid(),track:0,start:0,end:8,text:'LOWER'},{id:uid(),track:1,start:0,end:8,text:'UPPER'}];
   Object.assign(A.subStyle,{font:'Arial',size:65,color:'#ffffff',strokeW:0,shadow:false,box:false,x:.5,y:.92,maxW:.9});
   A.subStyleUpper={...A.subStyle,y:.20};
   render();refreshProp();
 });
 const times=[1.25,2,3.5,4.75,6.5];
 const preview=await p.evaluate(async times=>{const out=[];for(const t of times)out.push(await sample(t));return out},times);
 facts.preview=preview;
 chk('upper clip fades into lower picture',preview[0].center[0]<40&&preview[0].center[2]>210&&preview[2].center[0]>180&&preview[2].center[2]<70);
 chk('upper fade-out exposes lower picture',preview[3].center[0]<65&&preview[3].center[2]>190);
 chk('crop boundary stays transparent throughout fade',preview.slice(0,4).every(q=>q.corner[2]>240&&q.corner[0]<10));
 // v9.9 起字幕與同編號的影片軌連動：頂層字幕貼頂層影片、底層字幕貼底層影片。
 // 頂層字幕在最上面，完全不受下軌淡化影響（嚴格等號）；
 // 底層字幕在頂層影片之下，上軌交叉淡入時會被半透明地疊過 —— 純白像素數小幅浮動，
 // 那是整組連動的正確結果，不是字幕被調暗。
 //
 // v11.9：最後一格（6.5 秒）是圖片軌 L3 在畫面上，它在 L1／L2 之上，
 // 所以連字幕都會被蓋掉 —— 那是「圖片浮在影片上方」這條規則的直接結果，
 // 不是字幕壞了。前四格沒有圖片，字幕照舊。
 chk('upper subtitle keeps exactly full brightness while no image layer covers it',
   preview.slice(0,4).every(q=>q.whiteTop===preview[0].whiteTop)&&preview[0].whiteTop>50);
 chk('lower subtitle stays legible under the upper track crossfade',
   preview.slice(0,4).every(q=>q.whiteBot>50));
 chk('image layer L3 covers the subtitles underneath',
   preview[4].whiteTop===0&&preview[4].whiteBot===0);
 chk('next same lane image has no inherited fade',preview[4].center[0]>240&&preview[4].center[1]>240&&preview[4].center[2]<10);
 const audio=await p.evaluate(async()=>{
   const buf=await buildAudio(totalDur()),ts=[1.25,2,3.5,4.75];
   const levels=ts.map(t=>spectrum(buf,t));const vols=ts.map(t=>{A.playhead=t;syncMedia();return [A.clips[0].video.volume,A.clips[1].video.volume,music.el.volume]});
   A.clips[1].fadeAudio=false;const noFade=await buildAudio(totalDur());A.clips[1].fadeAudio=true;
   return {levels,vols,plain:ts.map(t=>spectrum(noFade,t))};
 });facts.audio=audio;
 chk('preview own source fades only',audio.vols.every((q,i)=>Math.abs(q[0]-.3)<.001&&Math.abs(q[2]-.2)<.001&&Math.abs(q[1]-[.05,.2,.4,.1][i])<.001));
 chk('offline mix fades only own source frequency',audio.levels.every((q,i)=>Math.abs(q[1]/audio.plain[i][1]-[.125,.5,1,.25][i])<.035));
 chk('other video and music audio unchanged',audio.levels.every((q,i)=>Math.abs(q[0]/audio.plain[i][0]-1)<.03&&Math.abs(q[2]/audio.plain[i][2]-1)<.03));
 const clampFade=await p.evaluate(()=>{const c=A.clips[1];c.fadeIn=5;c.fadeOut=5;const q=layout()[1],lens=clipFadeLens(c,q.span),mid=clipFadeGain(c,3,q);c.fadeIn=2;c.fadeOut=1;return {lens,mid}});
 chk('overlong fades meet proportionally without dark middle',clampFade.lens[0]===2&&clampFade.lens[1]===2&&clampFade.mid===1);
 const held=await p.evaluate(()=>{const c=A.clips[1];c.transMode='add';c.trans.type='dissolve';c.transOut.type='dissolve';const L=layout(),q=L[1];const r={gain:clipFadeGain(c,1.25,q),sound:clipMixGain(1,1.25,L),span:q.span};c.transMode='overlap';c.trans.type='none';c.transOut.type='none';return r});
 chk('fades include outside holds; holds remain silent',held.gain===.125&&held.sound===0&&held.span===5);
 await p.evaluate(()=>{A.playhead=2;A.sel={type:'clip',id:A.clips[1].id};refreshProp();$('#cFi').scrollIntoView({block:'center'});});
 await p.screenshot({path:path.join(OUT,'clip-options-ui.png')});
 const [dl]=await Promise.all([p.waitForEvent('download',{timeout:120000}),p.click('#btnExport')]);await p.waitForFunction(()=>!A.exporting);await p.click('#mClose');
 const dest=path.join(OUT,'clip-options-export.mp4');await dl.saveAs(dest);
 const decoded=await p.evaluate(async({bytes,times})=>{
   const data=Uint8Array.from(atob(bytes),c=>c.charCodeAt(0)),ac=new AudioContext(),ab=await ac.decodeAudioData(data.buffer.slice(0));
   const levels=times.slice(0,4).map(t=>spectrum(ab,t));await ac.close();
   const v=document.createElement('video');v.muted=true;const url=URL.createObjectURL(new Blob([data],{type:'video/mp4'}));
   await new Promise((r,j)=>{v.onloadeddata=r;v.onerror=j;v.src=url});const cv=document.createElement('canvas');cv.width=320;cv.height=180;const colors=[];
   for(const t of times){await new Promise(r=>{v.onseeked=r;v.currentTime=t});cv.getContext('2d').drawImage(v,0,0);colors.push(Array.from(cv.getContext('2d').getImageData(160,90,1,1).data).slice(0,3))}
   URL.revokeObjectURL(url);return {levels,colors};
 },{bytes:fs.readFileSync(dest).toString('base64'),times});facts.export=decoded;
 chk('actual MP4 faded picture matches preview',preview.every((q,i)=>q.center.every((v,k)=>Math.abs(v-decoded.colors[i][k])<18)));
 chk('actual AAC faded source matches offline mix',decoded.levels.every((q,i)=>Math.abs(q[1]/audio.levels[i][1]-1)<.12));
 chk('actual AAC leaves other video and music unchanged',decoded.levels.every((q,i)=>[0,2].every(k=>Math.abs(q[k]/audio.levels[i][k]-1)<.12)));
 const saved=await p.evaluate(async()=>{
   A.clips[1].transMode='add';A.clips[2].fadeAudio=false;
   const blob=await buildProjBlob();await projImportFile(new File([blob],'per-clip.nvproj'));original=A.clips.slice();music=A.musics[0];
   return {mode:A.clips.map(clipMode),fade:A.clips.map(c=>[c.fadeIn,c.fadeOut,c.fadeAudio]),proj:serialize().st.proj};
 });
 facts.saved=saved;
 chk('nvproj retains different same lane modes',saved.mode.join(',')==='overlap,add,overlap');
 chk('nvproj retains per clip fades and audio toggle',JSON.stringify(saved.fade)==='[[0,0,true],[2,1,true],[0,0,false]]');
 chk('new saved project has no hidden global fade or mode',!('fadeIn' in saved.proj)&&!('videoModes' in saved.proj));
 const split=await p.evaluate(()=>{
   resetClips();const c=A.clips[1];c.fadeIn=.5;c.fadeOut=.7;c.fadeAudio=false;c.transMode='add';A.playhead=3;splitClip();
   const a=A.clips[1],b=A.clips[2];return {fades:[a.fadeIn,a.fadeOut,b.fadeIn,b.fadeOut],mode:[clipMode(a),clipMode(b)],audio:[a.fadeAudio,b.fadeAudio]};
 });
 chk('split keeps outer fades and clears new internal edges',JSON.stringify(split.fades)==='[0.5,0,0,0.7]');
 chk('split inherits own mode and audio toggle',split.mode.every(v=>v==='add')&&split.audio.every(v=>v===false));
 const legacy=await p.evaluate(async()=>{
   resetClips();const saved=serialize();
   for(const c of saved.st.clips)for(const k of ['transMode','fadeIn','fadeOut','fadeAudio'])delete c[k];
   Object.assign(saved.st.proj,{videoModes:['add','overlap'],fadeIn:.8,fadeOut:1.2,fadeAudio:false});
   await deserialize(saved.st,saved.files);original=A.clips.slice();music=A.musics[0];
   const once=A.clips.map(c=>[clipMode(c),c.fadeIn,c.fadeOut,c.fadeAudio]);
   const fresh=serialize();await deserialize(fresh.st,fresh.files);
   return {once,twice:A.clips.map(c=>[clipMode(c),c.fadeIn,c.fadeOut,c.fadeAudio]),clean:!('videoModes' in A.proj)&&!('fadeIn' in A.proj)};
 });
 facts.legacy=legacy;
 chk('old track modes migrate to each clip',legacy.once.map(q=>q[0]).join(',')==='add,overlap,overlap');
 // v11.9：圖片獨立一軌，所以它同時是那一軌的頭與尾，兩端的淡入淡出都要補到。
 chk('old project fades migrate to first and last on each lane',JSON.stringify(legacy.once.map(q=>q.slice(1)))==='[[0.8,1.2,false],[0.8,1.2,false],[0.8,1.2,false]]');
 chk('migration happens once and removes global settings',JSON.stringify(legacy.once)===JSON.stringify(legacy.twice)&&legacy.clean);
/* ── 「現在」要先看播放頭在不在這一段上（v11.9）──────────────────
   以前不管播放頭在哪都硬算：在片段之外時會把它砍到只剩 0.1 秒，
   看起來像「按一下片段就不見了」。使用者實測列為 NG（E05）。 */
{
  await p.evaluate(()=>{setLang('zh');A.clips.forEach(c=>{c.inP=0;c.outP=5.008});
    A.sel={type:'clip',id:A.clips[0].id};seekTo(6.0);render();refreshProp();});
  await p.waitForTimeout(150);
  const keep=await p.evaluate(()=>A.clips[0].inP);
  await p.click('#cInNow'); await p.waitForTimeout(200);
  const outside=await p.evaluate(()=>({inP:A.clips[0].inP,toast:$('#toast').textContent.trim()}));
  chk('起點「現在」：播放頭在片段外時不動它',outside.inP===keep);
  chk('起點「現在」：播放頭在片段外時有說明',/播放頭不在/.test(outside.toast));
  await p.evaluate(()=>{seekTo(1.0);refreshProp();}); await p.waitForTimeout(200);
  await p.click('#cInNow'); await p.waitForTimeout(200);
  chk('起點「現在」：播放頭在片段內照樣要能用',
      Math.abs(await p.evaluate(()=>A.clips[0].inP)-1)<0.02);

  /* 裁頭之後播放頭底下那一格要【留在原地】：片段左端移到播放頭、右端不動。
     拖左邊緣本來就是這樣，按鈕以前沒做，按下去畫面整個換掉。（v11.9） */
  const hold=await p.evaluate(async()=>{
    const c=A.clips[0];
    A.proj.videoMode='free';
    c.at=8; c.inP=1; c.outP=4.5;
    A.sel={type:'clip',id:c.id};
    const L0=layout(), i=A.clips.indexOf(c);
    seekTo(L0[i].startAt+1.2); render(); refreshProp();
    return {end0:+L0[i].end.toFixed(3), ph:A.playhead};
  });
  await p.waitForTimeout(200);
  await p.click('#cInNow'); await p.waitForTimeout(250);
  const held=await p.evaluate(()=>{const i=A.clips.indexOf(A.clips.find(x=>x.id===A.sel.id)),L=layout();
    return {startAt:+L[i].startAt.toFixed(3), end:+L[i].end.toFixed(3)};});
  chk('起點「現在」：片段左端移到播放頭',Math.abs(held.startAt-hold.ph)<0.02);
  chk('起點「現在」：右端不動（播放頭那一格留在原地）',Math.abs(held.end-hold.end0)<0.02);
}

/* ── 「歸零」「到底」（v11.9）────────────────────────────────────
   使用者在人工檢查表 E04 的備註要的功能。驗四件事：
   1 真的回到素材的頭／尾  2 語意跟拖左右緣一致（左緣往前長、右端不動）
   3 被同軌鄰段擋住時只退到擋住的地方，而且有說明  4 兩顆都吃得到復原。 */
{
  const zero=await p.evaluate(async()=>{
    setLang('zh');
    A.proj.videoMode='free';
    const c=A.clips[0];
    A.clips.forEach(x=>{x.at=undefined;});
    c.at=9; c.inP=2; c.outP=4.5;
    A.sel={type:'clip',id:c.id}; render(); refreshProp();
    const L0=layout(), i=A.clips.indexOf(c);
    return {end0:+L0[i].end.toFixed(3), start0:+L0[i].startAt.toFixed(3)};
  });
  await p.waitForTimeout(200);
  await p.click('#cInZero'); await p.waitForTimeout(250);
  const z=await p.evaluate(()=>{const c=A.clips.find(x=>x.id===A.sel.id),i=A.clips.indexOf(c),L=layout();
    return {inP:+c.inP.toFixed(3),startAt:+L[i].startAt.toFixed(3),end:+L[i].end.toFixed(3),
            toast:$('#toast').textContent.trim(),undo:typeof _undo!=='undefined'&&_undo.length>0};});
  chk('歸零：起點回到素材的 0 秒',z.inP===0);
  chk('歸零：右端不動（片段往前長，不是整段平移）',Math.abs(z.end-zero.end0)<0.02);
  chk('歸零：左端往前移了裁掉的那 2 秒',Math.abs(z.startAt-(zero.start0-2))<0.02);
  chk('歸零：有說明',/回到這支影片的開頭/.test(z.toast));
  chk('歸零：吃得到復原',z.undo);
  await p.evaluate(()=>undo()); await p.waitForTimeout(250);
  chk('歸零：復原回得去',Math.abs(await p.evaluate(()=>A.clips.find(x=>x.id===A.sel.id).inP)-2)<0.02);

  await p.click('#cInZero'); await p.waitForTimeout(200);
  await p.click('#cInZero'); await p.waitForTimeout(200);
  const again=await p.evaluate(()=>$('#toast').textContent.trim());
  chk('歸零：已經在開頭時只提示、不再推一筆復原',/已經是這支影片的開頭/.test(again));

  const max=await p.evaluate(()=>{
    const c=A.clips.find(x=>x.id===A.sel.id);
    c.inP=0; c.outP=2; render(); refreshProp();
    return +c.dur.toFixed(3);
  });
  await p.waitForTimeout(200);
  await p.click('#cOutMax'); await p.waitForTimeout(250);
  const m=await p.evaluate(()=>({outP:+A.clips.find(x=>x.id===A.sel.id).outP.toFixed(3),
                                 toast:$('#toast').textContent.trim()}));
  chk('到底：終點拉到素材的原始長度',Math.abs(m.outP-max)<0.02);
  chk('到底：有說明',/原始結尾/.test(m.toast));
  await p.evaluate(()=>undo()); await p.waitForTimeout(250);
  chk('到底：吃得到復原',Math.abs(await p.evaluate(()=>A.clips.find(x=>x.id===A.sel.id).outP)-2)<0.02);

  /* 同軌下一段擋住：把第二段釘在第一段結尾後面一點點，「到底」只能拉到那裡。 */
  const blocked=await p.evaluate(()=>{
    const c=A.clips[0], nx=A.clips.find(x=>x!==c&&!isImg(x));
    c.at=0; c.inP=0; c.outP=2;
    placeClip(nx,clipTrack(c),3);           // 同軌，起點 3 秒 —— 中間空一秒讓「到底」有得拉
    A.sel={type:'clip',id:c.id}; render(); refreshProp();
    const L=layout();
    return {same:clipTrack(nx)===clipTrack(c), limit:+L[A.clips.indexOf(nx)].startAt.toFixed(3)};
  });
  chk('到底：測試前置 —— 兩段真的在同一軌',blocked.same&&Math.abs(blocked.limit-3)<0.05);
  await p.waitForTimeout(200);
  await p.click('#cOutMax'); await p.waitForTimeout(250);
  const bl=await p.evaluate(()=>{const c=A.clips.find(x=>x.id===A.sel.id);
    return {outP:+c.outP.toFixed(3),toast:$('#toast').textContent.trim()};});
  chk('到底：被同軌下一段擋住時只拉到擋住的地方',Math.abs(bl.outP-blocked.limit)<0.05);
  chk('到底：被擋住時有說明',/擋住/.test(bl.toast));
}

 chk('no page errors',errors.length===0);
 fs.writeFileSync(path.join(OUT,'clip-options-results.json'),JSON.stringify({count:n,bad,errors,facts},null,2));
 console.log('通過 '+(n-bad.length)+' / '+n);if(bad.length){console.log(bad,JSON.stringify(facts));process.exitCode=1}
 }finally{await b.close();await new Promise(r=>srv.close(r))}
})().catch(e=>{console.error(e);process.exit(1)});
