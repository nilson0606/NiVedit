const {chromium}=require('playwright'),fs=require('fs'),http=require('http'),path=require('path');
const HTML=process.env.NIVEDIT_HTML,CHROME=process.env.NIVEDIT_CHROME,FIX=process.env.NIVEDIT_FIX,OUT=path.dirname(HTML);
(async()=>{
 const srv=http.createServer((q,r)=>{r.setHeader('Content-Type','text/html; charset=utf-8');fs.createReadStream(HTML).pipe(r)});
 await new Promise(r=>srv.listen(0,'127.0.0.1',r));const b=await chromium.launch({executablePath:CHROME});
 const p=await(await b.newContext({viewport:{width:1500,height:980},acceptDownloads:true})).newPage();
 const errors=[],bad=[],facts={};let n=0;const chk=(s,v)=>{n++;if(!v)bad.push(s)};p.on('pageerror',e=>errors.push(e.message));
 try{
 await p.addInitScript(() => { window.showSaveFilePicker = undefined; }); // Test browser-download fallback; native save is covered separately.
  await p.goto('http://127.0.0.1:'+srv.address().port);await p.waitForFunction(()=>typeof A!=='undefined');
 chk('version',await p.textContent('#verTag')==='v10.6');
 await p.setInputFiles('#fileAny',FIX+'/t300.webm');await p.waitForFunction(()=>A.clips.length===1&&A.clips[0].el.readyState>=2);
 await p.evaluate(()=>{
   Object.assign(A.proj,{w:320,h:180,fps:20,bitrate:2,fadeIn:0,fadeOut:0});
   A.clips[0].outP=2;A.clips[0].trans.type='none';A.clips[0].transOut.type='none';
   A.subs=[{id:uid(),track:0,start:0,end:2,text:'LOWER'},{id:uid(),track:1,start:0,end:2,text:'UPPER'}];
   Object.assign(A.subStyle,{font:'Arial',size:90,color:'#00ff00',strokeW:0,shadow:false,box:false,x:.5,y:.92,maxW:.9});
   A.subStyleUpper={...A.subStyle,color:'#ff0000',y:.70};
   A.playhead=.7;A.sel={type:'sub',id:A.subs[1].id};A.pps=150;render();refreshProp();
   window.countText=cv=>{
     const d=cv.getContext('2d').getImageData(0,0,cv.width,cv.height).data;let red=0,green=0,ry=0,gy=0;
     let rx=0,gx=0,rBot=-1,gBot=-1;
     for(let y=0;y<cv.height;y++)for(let x=0;x<cv.width;x++){const i=(y*cv.width+x)*4;
       if(d[i]>90&&d[i]>d[i+1]*1.8&&d[i]>d[i+2]*1.8){red++;ry+=y;rx+=x;rBot=y;}
       if(d[i+1]>90&&d[i+1]>d[i]*1.8&&d[i+1]>d[i+2]*1.8){green++;gy+=y;gx+=x;gBot=y;}
     }return {red,green,ry:ry/Math.max(1,red),gy:gy/Math.max(1,green),
              rx:rx/Math.max(1,red),gx:gx/Math.max(1,green),rBot,gBot};
   };
   window.shotSubs=()=>{const cv=document.createElement('canvas');cv.width=320;cv.height=180;renderFrame(cv.getContext('2d'),.7,320,180);return countText(cv)};
 });
 // v10.6：下軌那一組排在上面，整條時間軸的 L 編號才由上往下遞增（L1,L1,L2,L2,L3…）。
 // y 一律照【DOM 目前的順序】去量，不要另外寫死一份名單 —— 兩份名單會各自漂移。
 const layout=await p.evaluate(()=>{
   const want=['videoLower','subLower','videoUpper','subUpper'];
   const ids=Array.from($('#trkVideo').children).filter(e=>want.includes(e.id)).map(e=>e.id);
   return {ids,y:ids.map(id=>$('#'+id).getBoundingClientRect().top),tl:$('#tl').offsetHeight,
           fit:$('#tlinner').scrollHeight-$('#tlwrap').clientHeight,cap:innerHeight-260,
           scrollable:getComputedStyle($('#tlwrap')).overflowY};
 });facts.layout=layout;
 chk('exact requested interleaved DOM order',layout.ids.join(',')==='videoLower,subLower,videoUpper,subUpper');
 chk('exact requested visual order (下軌組在上)',layout.y.every((y,i)=>i===0||y>layout.y[i-1]));
 // v10.6：時間軸高度自動貼合內容，L1~L5 加音軌不用捲就看得完；捲軸本身保留。
 chk('timeline auto-fits its content (no scrolling needed)',layout.fit<=0&&layout.tl<=layout.cap);
 chk('timeline can still scroll when it has to',layout.scrollable==='auto');
 chk('both subtitle lanes have independent blocks',await p.locator('#subUpper .sblk').count()===1&&await p.locator('#subLower .sblk').count()===1);
 const pixels=await p.evaluate(()=>shotSubs());facts.preview=pixels;
 chk('both subtitle tracks actually render',pixels.red>100&&pixels.green>100);
 chk('separate subtitle positions',pixels.ry<pixels.gy-20);

 // ── v10.6：字幕自由定位（x＝字幕框水平中心、y＝字幕框底緣，整軌共用）──
 const place=await p.evaluate(()=>{
   const lo=subStyleFor(0), up=subStyleFor(1);
   const cue=A.subs.find(c=>subTrack(c)===0);
   const base=shotSubs();
   lo.x=.20; const left=shotSubs();
   lo.x=.80; const right=shotSubs();
   lo.x=.5;
   // 底緣的意義：同一句變成兩行，最後一行必須留在原來的高度，往上長。
   const one=shotSubs();
   cue.text='LOWER\nLOWER';
   const two=shotSubs();
   cue.text='LOWER';
   // 移動下軌不該動到上軌
   const upBefore=shotSubs().ry;
   lo.y=.60; const upAfter=shotSubs().ry;
   lo.y=.92;
   return {base,left,right,one,two,upBefore,upAfter,
           loY:lo.y,upY:up.y,sameObject:subStyleFor(0)===subStyleFor(1)};
 });facts.place=place;
 chk('水平位置真的把字幕左右搬動',
     place.left.gx<place.base.gx-30&&place.right.gx>place.base.gx+30);
 chk('左右搬動不改變垂直位置',
     Math.abs(place.left.gy-place.base.gy)<1&&Math.abs(place.right.gy-place.base.gy)<1);
 chk('垂直是底緣：換兩行時最後一行留在原高度 '+place.one.gBot+'/'+place.two.gBot,
     Math.abs(place.two.gBot-place.one.gBot)<=1);
 // 行高是 90px×(180/1080)=15px，所以重心大約往上移半行（實測 9.5px）。
 chk('換兩行時字往上長 '+(place.one.gy-place.two.gy).toFixed(1)+'px',
     place.two.gy<place.one.gy-5&&place.two.green>place.one.green*1.6);
 chk('搬下軌不會動到上軌',Math.abs(place.upAfter-place.upBefore)<1);
 chk('上下兩軌是兩份獨立的樣式',!place.sameObject&&place.loY!==place.upY);

 // 九宮格快速對位：按下去就落在那一格，而且是改「這一軌」的樣式
 await p.evaluate(()=>{A.sel={type:'sub',id:A.subs.find(c=>subTrack(c)===0).id};refreshProp()});
 chk('字幕面板有九宮格',await p.locator('#snine button').count()===9);
 await p.locator('#snine button[data-p="0.15,0.155"]').click();
 chk('九宮格左上把底層字幕搬到左上',
     await p.evaluate(()=>Math.abs(subStyleFor(0).x-.15)<1e-9&&Math.abs(subStyleFor(0).y-.155)<1e-9));
 chk('九宮格沒有動到上軌',await p.evaluate(()=>Math.abs(subStyleFor(1).y-.70)<1e-9));
 await p.click('#btnUndo');
 chk('九宮格可以復原',await p.evaluate(()=>Math.abs(subStyleFor(0).y-.92)<1e-9));

 // 舊專案只有 pos／marginY：載進來要換算成同樣的高度，不能被預設值無聲吃掉
 const legacyPos=await p.evaluate(async()=>{
   const {st,files}=serialize();
   st.subStyle={...st.subStyle};delete st.subStyle.x;delete st.subStyle.y;
   st.subStyle.pos='bottom';st.subStyle.marginY=.25;
   st.subStyleUpper={...st.subStyleUpper};delete st.subStyleUpper.x;delete st.subStyleUpper.y;
   st.subStyleUpper.pos='top';st.subStyleUpper.marginY=.05;
   await deserialize(st,files);
   return {lo:subStyleFor(0).y,up:subStyleFor(1).y,loX:subStyleFor(0).x};
 });facts.legacyPos=legacyPos;
 chk('舊檔下方邊距換算精準 '+legacyPos.lo,Math.abs(legacyPos.lo-.75)<1e-9);
 chk('舊檔置頂換算成底緣 '+legacyPos.up.toFixed(3),legacyPos.up>.05&&legacyPos.up<.25);
 chk('舊檔一律置中',legacyPos.loX===.5);
 // deserialize 會把選取重設成專案，後面的 #sTrack 就找不到了 —— 把場景還原成進來時的樣子
 await p.evaluate(()=>{
   Object.assign(subStyleFor(0),{x:.5,y:.92});Object.assign(subStyleFor(1),{x:.5,y:.70});
   A.sel={type:'sub',id:A.subs.find(c=>subTrack(c)===1).id};
   _undo.length=0;_redo.length=0;render();refreshProp();
 });
 await p.waitForSelector('#sTrack');
 await p.selectOption('#sTrack','0');
 chk('selector moves subtitle to lower lane',await p.locator('#subUpper .sblk').count()===0&&await p.locator('#subLower .sblk').count()===2);
 await p.click('#btnUndo');
 chk('undo restores subtitle track',await p.locator('#subUpper .sblk').count()===1);
 await p.click('#btnRedo');
 chk('redo restores moved subtitle',await p.locator('#subUpper .sblk').count()===0);
 await p.selectOption('#sTrack','1');
 await p.locator('#sSize').fill('110');await p.locator('#sSize').dispatchEvent('input');
 chk('upper style does not alter lower style',await p.evaluate(()=>A.subStyle.size===90&&A.subStyleUpper.size===110));
 await p.evaluate(()=>{A.subStyleUpper.size=90;render();refreshProp()});
 // Drag upper subtitle to lower, then undo.
 let block=await p.locator('#subUpper .sblk').boundingBox(),lower=await p.locator('#subLower').boundingBox();
 // 真實滑鼠拖曳：整套連續跑時機器較忙，按下去之後馬上高速移動偶爾會漏掉，
 // 拖曳就沒落地。等狀態真的到位再斷言，而且斷言不要在 find() 的結果上直接取值 ——
 // 拿到 undefined 會 TypeError 中斷整支，一條紅變成整支沒數字。
 await p.mouse.move(block.x+60,block.y+16);await p.mouse.down();
 await p.waitForTimeout(60);
 await p.mouse.move(block.x+60,lower.y+30,{steps:12});
 await p.waitForTimeout(60);
 await p.mouse.up();
 await p.waitForFunction(()=>!document.querySelector('#subUpper .sblk'),null,{timeout:5000}).catch(()=>{});
 chk('actual drag changes subtitle lane',await p.locator('#subUpper .sblk').count()===0);
 await p.click('#btnUndo');
 const backUp=await p.evaluate(()=>{const c=A.subs.find(q=>q.text==='UPPER');return c?{track:c.track,start:c.start}:null});
 chk('drag undo retains timing and lane',!!backUp&&backUp.track===1&&backUp.start===0);
 // Double click empty space on each lane.
 let row=await p.locator('#subUpper').boundingBox();
 await p.mouse.dblclick(row.x+375,row.y+12);
 await p.waitForFunction(()=>A.subs.filter(c=>subTrack(c)===1).length===2,null,{timeout:5000}).catch(()=>{});
 chk('double click upper lane creates upper subtitle',await p.evaluate(()=>A.subs.filter(c=>subTrack(c)===1).length===2));
 await p.evaluate(()=>{A.subs=A.subs.filter(c=>c.text!=='在這裡輸入字幕');A.sel={type:'sub',id:(A.subs.find(c=>c.track===1)||{}).id};A.playhead=1;splitSub();});
 chk('subtitle split retains lane',await p.evaluate(()=>A.subs.filter(c=>subTrack(c)===1).length===2));
 await p.click('#btnUndo');
 await p.evaluate(()=>{A.sel={type:'sub',id:(A.subs.find(c=>c.track===1)||{}).id};render();refreshProp()});
 await p.setInputFiles('#fileSub',{name:'upper.srt',mimeType:'text/plain',buffer:Buffer.from('1\n00:00:03,000 --> 00:00:04,000\nImported\n')});
 // 匯入 SRT 是非同步的（讀檔＋解析）。整套連跑時機器較忙，沒等就斷言的話
 // find() 會回 undefined，下一步取 .track 直接 TypeError 中斷整支 ——
 // 一條紅變成整支沒數字。等它出現再取值，取不到就讓它正常地紅。
 await p.waitForFunction(()=>A.subs.some(c=>c.text==='Imported'),null,{timeout:8000}).catch(()=>{});
 const importedTrack=await p.evaluate(()=>{const c=A.subs.find(q=>q.text==='Imported');return c?c.track:null});
 chk('SRT imports into selected subtitle lane',importedTrack===1);
 // Real project pack/reopen retains both styles.
 const saved=await p.evaluate(async()=>{
   A.subs=A.subs.filter(c=>c.text!=='Imported');const blob=await buildProjBlob();
   await projImportFile(new File([blob],'subtitles.nvproj'));
   return A.subs.some(c=>c.track===0)&&A.subs.some(c=>c.track===1)&&A.subStyle.color==='#00ff00'&&A.subStyleUpper.color==='#ff0000';
 });
 chk('nvproj retains both subtitle tracks and styles',saved);
 await p.waitForFunction(()=>A.clips.every(c=>c.el.readyState>=2));
 // Editor can switch lanes and merge only within a lane.
 await p.evaluate(()=>{A.subs.push({id:uid(),track:1,start:2,end:3,text:'NEXT'});setSubEditorTrack(1);});
 chk('editor exposes a track selector per subtitle',await p.locator('.subTrackSelect').count()===2);
 const merged=await p.evaluate(()=>{
   const lower=A.subs.find(c=>c.track===0),upper=A.subs.find(c=>c.track===1);
   setSubEditorTrack(0);
   document.querySelector('.scue[data-id="'+lower.id+'"] [data-a="merge"]').click();
   const lowerKept=A.subs.length===3&&lower.text==='LOWER';
   setSubEditorTrack(1);
   document.querySelector('.scue[data-id="'+upper.id+'"] [data-a="merge"]').click();
   const upperMerged=A.subs.length===2&&upper.text==='UPPER NEXT';upper.text='UPPER';upper.end=2;
   return {lowerKept,upperMerged};
 });
 chk('editor merge never crosses subtitle tracks',merged.lowerKept);
 chk('editor merge joins next cue on same track',merged.upperMerged);

 await p.evaluate(()=>{A.subs=A.subs.filter(c=>c.text!=='NEXT');A.playhead=.7;A.sel={type:'sub',id:(A.subs.find(c=>c.track===1)||{}).id};render();refreshProp();});
 const [dl]=await Promise.all([p.waitForEvent('download',{timeout:120000}),p.click('#btnExport')]);await p.waitForFunction(()=>!A.exporting);await p.click('#mClose');
 const dest=path.join(OUT,'subtitles-export.mp4');await dl.saveAs(dest);
 const decoded=await p.evaluate(async bytes=>{
   const url=URL.createObjectURL(new Blob([Uint8Array.from(atob(bytes),c=>c.charCodeAt(0))],{type:'video/mp4'})),v=document.createElement('video');v.muted=true;
   await new Promise((r,j)=>{v.onloadeddata=r;v.onerror=j;v.src=url});
   await new Promise(r=>{v.onseeked=r;v.currentTime=.7});const cv=document.createElement('canvas');cv.width=320;cv.height=180;cv.getContext('2d').drawImage(v,0,0);
   const result=countText(cv);URL.revokeObjectURL(url);return result;
 },fs.readFileSync(dest).toString('base64'));facts.export=decoded;
 chk('MP4 contains both subtitle tracks',decoded.red>100&&decoded.green>100);
 chk('MP4 subtitle positions match preview',Math.abs(decoded.ry-pixels.ry)<2&&Math.abs(decoded.gy-pixels.gy)<2);
 await p.evaluate(()=>{setLang('zh');render();refreshProp()});await p.screenshot({path:path.join(OUT,'subtitles-both-ui.png')});
 const legacy=await p.evaluate(async()=>{
   const {st,files}=serialize();st.subs=st.subs.slice(0,1);delete st.subs[0].track;delete st.subStyleUpper;
   await deserialize(st,files);return subTrack(A.subs[0])===0&&A.subStyleUpper===null;
 });chk('old subtitles default lower with no stale upper style',legacy);
 await p.evaluate(()=>{setLang('en');A.sel={type:'sub',id:A.subs[0].id};render();refreshProp()});await p.waitForTimeout(120);
 chk('English subtitle controls translated',!/[\u3400-\u9fff]/.test(await p.textContent('#prop')));
 await p.evaluate(()=>{setLang('zh');render();refreshProp()});await p.waitForTimeout(120);
 chk('Chinese subtitle labels restored',(await p.textContent('#trkVideo')).includes('字幕頂層'));
 await p.setViewportSize({width:1366,height:768});await p.waitForTimeout(200);
 chk('compact layout keeps audio track visible',await p.evaluate(()=>$('#trkMusic').getBoundingClientRect().bottom<=innerHeight));

 // ── v10.6：字幕綁著某一段影片，那一段搬到哪就跟到哪（時間＋軌道）──
 // 舊行為只搬時間不搬軌道，結果字幕留在 L1、它綁的影片跑到 L2，
 // 字幕反而被自己那段影片蓋住。
 await p.setViewportSize({width:1500,height:980});await p.waitForTimeout(150);
 const follow=await p.evaluate(async()=>{
   A.overlays.length=0;A.titles.length=0;
   const src=A.clips[0];
   Object.assign(src,{outP:3,at:0,muted:true,trans:{type:'none',dur:.5},transOut:{type:'none',dur:.5}});
   // 第二段用同一支素材複製，才不用再等解碼
   const two={...src,id:uid(),track:0,at:3,kf:null,kfT:null};
   A.clips.push(two);MEDIA.set(two.id,MEDIA.get(src.id));
   A.subs=[{id:uid(),track:0,start:3.5,end:4.5,text:'BOUND'}];
   tagSubs();render();
   const boundTo=A.subs[0].cid===two.id, offset=+A.subs[0].cs.toFixed(3);
   // 1) 同軌左右搬
   placeClip(two,0,6);render();
   const afterMove={start:+A.subs[0].start.toFixed(3),track:subTrack(A.subs[0])};
   // 2) 搬到上軌
   placeClip(two,1,1);render();
   const afterTrack={start:+A.subs[0].start.toFixed(3),track:subTrack(A.subs[0]),
                     clipTrack:clipTrack(two),clipStart:+layout()[A.clips.indexOf(two)].start.toFixed(3)};
   A.clips.pop();A.subs.length=0;render();
   return {boundTo,offset,afterMove,afterTrack};
 });
 facts.follow=follow;
 chk('字幕記得自己綁在哪一段、第幾秒',follow.boundTo&&Math.abs(follow.offset-0.5)<1e-6);
 chk('片段左右搬動，字幕跟著走並保留偏移 '+follow.afterMove.start,
     Math.abs(follow.afterMove.start-6.5)<1e-6&&follow.afterMove.track===0);
 chk('片段換到上軌，字幕的時間跟著走 '+follow.afterTrack.start,
     Math.abs(follow.afterTrack.start-1.5)<1e-6);
 chk('片段換到上軌，字幕也跟著換到字幕頂層（否則會被自己那段影片蓋住）',
     follow.afterTrack.track===1&&follow.afterTrack.clipTrack===1);

 // 【原地換軌】：時間一秒都不改，只把片段搬到另一條影片軌。
 // 這是使用者實際踩到的情況，而且躲過了上面四條 —— 上面每次都順手改了時間。
 // 成因：syncSubsToClips 靠 layoutSig 判斷「排版有沒有變」，而那個指紋原本
 // 只記起點／長度／裁切，【沒記軌道】，所以同一個時間換軌看起來完全沒變，
 // 整個重算根本不會被觸發。
 const inPlace=await p.evaluate(()=>{
   A.overlays.length=0;A.titles.length=0;
   const src=A.clips[0];
   Object.assign(src,{outP:5,at:0,muted:true,track:0,
                      trans:{type:'none',dur:.5},transOut:{type:'none',dur:.5}});
   const two={...src,id:uid(),track:0,at:5,kf:null,kfT:null};
   A.clips.push(two);MEDIA.set(two.id,MEDIA.get(src.id));
   A.subs=[];
   for(let i=0;i<8;i++)A.subs.push({id:uid(),track:0,start:i*1.1+0.2,end:i*1.1+0.9,text:'S'+i});
   tagSubs();render();
   const snap=()=>A.subs.map(c=>({t:+c.start.toFixed(3),tr:subTrack(c)}));
   const before=snap();
   placeClip(src,1,0);render();                    // 時間不動，只換軌
   const after=snap();
   const sigHasTrack=(()=>{
     const a=layoutSig();const t=src.track;src.track=0;const b=layoutSig();src.track=t;
     return a!==b;                                  // 指紋要吃得到軌道
   })();
   const out={before,after,sigHasTrack,clipTrack:clipTrack(src),
              clipStart:+layout()[A.clips.indexOf(src)].start.toFixed(3)};
   A.clips.splice(A.clips.indexOf(two),1);A.subs.length=0;render();
   return out;
 });
 facts.inPlace=inPlace;
 chk('原地換軌：片段的時間沒有跑掉',Math.abs(inPlace.clipStart)<1e-6&&inPlace.clipTrack===1);
 chk('原地換軌：排版指紋吃得到軌道（少了它整個重算不會被觸發）',inPlace.sigHasTrack);
 chk('原地換軌：綁第一段的字幕換到上軌，時間一秒都沒改',
     inPlace.after.slice(0,5).every((a,i)=>a.tr===1&&Math.abs(a.t-inPlace.before[i].t)<1e-9));
 chk('原地換軌：綁第二段的字幕完全沒動',
     inPlace.after.slice(5).every((a,i)=>a.tr===0&&Math.abs(a.t-inPlace.before[i+5].t)<1e-9));

 // ── v10.6：開檔時把字幕拉回它綁的那一段所在的影片軌 ──────────
 // v10.3 以前搬過軌的專案會留下「影片在上軌、字幕在下軌」，那種狀態下
 // 字幕會被它自己綁的那段影片蓋住。開檔修一次，不必叫使用者手動再搬一遍。
 //
 // 但【只能】在開檔時做：曾經試過每次重繪都強制對齊，結果是使用者手動
 // 把字幕拖到另一條字幕軌之後，下一次重繪就被硬扳回去，等於廢掉分軌。
 const heal=await p.evaluate(async()=>{
   A.overlays.length=0;A.titles.length=0;
   if(!A.clips.length) return {stuck:'(沒有片段可測)',healed:'',manual:-1};
   const src=A.clips[0];
   Object.assign(src,{outP:5,at:0,muted:true,track:0,
                      trans:{type:'none',dur:.5},transOut:{type:'none',dur:.5}});
   const two={...src,id:uid(),track:0,at:5,kf:null,kfT:null};
   A.clips.push(two);MEDIA.set(two.id,MEDIA.get(src.id));
   A.subs=[];
   for(let i=0;i<6;i++)A.subs.push({id:uid(),track:0,start:i*0.6+0.2,end:i*0.6+0.7,text:'H'+i});
   render();
   // 做出舊版留下的壞狀態：影片都在上軌，字幕硬留在下軌，然後存檔
   src.track=1;two.track=1;render();
   for(const c of A.subs)c.track=0;
   const {st,files}=serialize();
   const stuck=A.subs.map(c=>c.track).join('');
   await deserialize(st,files);render();
   const healed=A.subs.map(c=>c.track).join('');
   // 開完檔之後使用者手動把第一句拖到下軌 —— 連續重繪都不該被扳回去
   A.subs[0].track=0;A.subs[0].start+=0.001;render();render();render();
   const manual=A.subs[0].track;
   const out={stuck,healed,manual};
   A.clips=A.clips.filter(c=>c.id!==two.id);A.subs.length=0;render();
   return out;
 });
 facts.heal=heal;
 chk('舊專案的錯位狀態確實存進檔案了 '+heal.stuck,heal.stuck==='000000');
 chk('開檔時自動把字幕拉回它綁的那一段所在的軌 '+heal.healed,heal.healed==='111111');
 chk('開檔之後手動選的字幕軌不會被硬扳回去（每次重繪都對齊會廢掉分軌）',heal.manual===0);

 // 只修一個方向：字幕比它綁的影片低（會被自己那段影片蓋住）才拉上來。
 // 反過來——使用者刻意把字幕放在上軌、影片留在下軌——照樣看得見，不能動它。
 const healDir=await p.evaluate(async()=>{
   if(!A.clips.length) return {kept:-1};
   const src=A.clips[0];
   Object.assign(src,{outP:5,at:0,muted:true,track:0,
                      trans:{type:'none',dur:.5},transOut:{type:'none',dur:.5}});
   A.subs=[{id:uid(),track:1,start:0.5,end:1.5,text:'刻意放上軌'}];
   render();
   const {st,files}=serialize();
   await deserialize(st,files);render();
   const kept=subTrack(A.subs[0]);
   A.subs.length=0;render();
   return {kept};
 });
 facts.healDir=healDir;
 chk('字幕在上軌、影片在下軌是合法擺法，開檔不會被拉下來',healDir.kept===1);

 // 界線：只有【那一段影片自己換軌】才動它連動的字幕。
 // 只有一條影片軌、卻用了兩條字幕軌（下軌 AI、上軌自己加）是既有用法，
 // 那些頂層字幕會依時間綁到下軌的影片。若寫成「字幕永遠跟影片同軌」，
 // 光是左右拖一下影片就會把它們整批拖下來 —— 分軌字幕直接廢掉。
 const scopeSafe=await p.evaluate(()=>{
   if(!A.clips.length) return {same:-1,afterMove:-1,afterTrack:-1};
   const src=A.clips[0];
   Object.assign(src,{outP:5,at:0,muted:true,track:0,
                      trans:{type:'none',dur:.5},transOut:{type:'none',dur:.5}});
   A.subs=[{id:uid(),track:1,start:1,end:2,text:'上軌自己加的'}];
   render();
   const same=subTrack(A.subs[0]);
   placeClip(src,0,2);render();            // 同軌左右拖 → 不該碰字幕
   const afterMove=subTrack(A.subs[0]);
   placeClip(src,1,2);render();            // 這一段真的換軌了 → 字幕才跟
   const afterTrack=subTrack(A.subs[0]);
   A.subs.length=0;render();
   return {same,afterMove,afterTrack};
 });
 facts.scopeSafe=scopeSafe;
 chk('一條影片軌＋兩條字幕軌：頂層字幕原地不動',scopeSafe.same===1);
 chk('同軌左右拖影片，不會把頂層字幕拖下來',scopeSafe.afterMove===1);
 chk('那一段真的換軌了，字幕才跟著走',scopeSafe.afterTrack===1);
 chk('no page errors',errors.length===0);
 await p.screenshot({path:path.join(OUT,'subtitles-ui.png')});
 fs.writeFileSync(path.join(OUT,'subtitles-results.json'),JSON.stringify({count:n,bad,errors,facts},null,2));
 console.log('通過 '+(n-bad.length)+' / '+n);if(bad.length){console.log(bad,JSON.stringify(facts));process.exitCode=1;}
 }finally{await b.close();await new Promise(r=>srv.close(r))}
})().catch(e=>{console.error(e);process.exit(1)});
