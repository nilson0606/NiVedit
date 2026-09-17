/* 圖層（L 編號）專項 —— v11.8 規則。

   規則本身：
     L1  影片底層 ＋ 底層字幕（字幕畫在自己那一軌的影片前面）
     L2  影片頂層 ＋ 頂層字幕，整組蓋住 L1
     L3  圖片軌（預設）   ┐ 依軌道順序取號，用時間軸左側 ▲▼ 換，
     L4  疊圖軌（預設）   │ L3 是地板，換不進 L1／L2。
     L5  標題軌（預設）   ┘ 音軌不取號。
   號碼是【固定】的：加幾個疊圖都還是同一號。
   同一號之內，時間軸上起始時間較後的蓋住較前的。

   這支的重點不是「數字對不對」，而是「畫面上誰蓋住誰」——
   所以除了資料斷言，幾乎每一條都去量實際像素。
   這個專案吃過太多次「數值對、畫面不對」的虧。 */
const {chromium}=require('playwright'),fs=require('fs'),http=require('http'),path=require('path');
const HTML=process.env.NIVEDIT_HTML,CHROME=process.env.NIVEDIT_CHROME,FIX=process.env.NIVEDIT_FIX,OUT=path.dirname(HTML);
(async()=>{
const srv=http.createServer((q,r)=>{r.setHeader('Content-Type','text/html; charset=utf-8');fs.createReadStream(HTML).pipe(r)});
await new Promise(r=>srv.listen(0,'127.0.0.1',r));
const b=await chromium.launch({executablePath:CHROME}),
      p=await(await b.newContext({viewport:{width:1500,height:1050},acceptDownloads:true})).newPage();
let count=0;const bad=[],errors=[],facts={};const chk=(n,v)=>{count++;if(!v)bad.push(n)};
p.on('pageerror',e=>errors.push(e.message));
try{
await p.addInitScript(() => { window.showSaveFilePicker = undefined; }); // 測下載備援；原生另存由 rotation-save 專項覆蓋
await p.goto('http://127.0.0.1:'+srv.address().port);
await p.waitForFunction(()=>typeof A!=='undefined');
chk('version',await p.textContent('#verTag')==='v11.8');

/* 素材：藍色影片 ＋ 黃色疊圖 ＋ 一張圖片，標題用洋紅大字，字幕用純白。
   四者顏色分得開，量像素就知道最後是誰蓋在最上面。 */
await p.setInputFiles('#fileAny',FIX+'/t300.webm');
await p.waitForFunction(()=>A.clips.length===1&&A.clips[0].video.readyState>=2);
await p.setInputFiles('#fileOverlay',FIX+'/pic1.png');
await p.waitForFunction(()=>A.overlays.length===1);

await p.evaluate(()=>{
  Object.assign(A.proj,{w:320,h:180,fps:20,bitrate:2,fadeIn:0,fadeOut:0});
  Object.assign(A.clips[0],{outP:3,muted:true});
  // 疊圖鋪在中央下半，剛好壓在預設字幕的位置上
  Object.assign(A.overlays[0],{start:0,end:3,x:.5,y:.85,scale:.5,opacity:1,fadeIn:0,fadeOut:0});
  A.subs.length=0;
  A.subs.push({id:uid(),track:0,start:0,end:3,text:'SUB'});
  tagSubs();
  addTitle(0);Object.assign(A.titles[0],{start:0,end:3,text:'TTT',size:90,color:'#ff00ff',
    animIn:'none',animOut:'none',x:.5,y:.2,opacity:1});
  render();
});

/* ── 預設編號 ───────────────────────────────────────────── */
const lab=await p.evaluate(()=>layerLabels());facts.labels=lab;
chk('影片 L1',lab.clip[Object.keys(lab.clip)[0]]===1);
chk('底層字幕跟底層影片同一層 L1',lab.sub[0]===1);
chk('頂層字幕跟頂層影片同一層 L2',lab.sub[1]===2);
chk('圖片軌 L3',await p.evaluate(()=>layerOfTrack('img'))===3);
chk('疊圖 L4',Object.values(lab.item)[0]===4);
chk('標題 L5',Object.values(lab.item).slice(-1)[0]===5);
chk('最大 5 層',lab.max===5);

/* ── 號碼是固定的：再加兩個疊圖，三個都還是 L4 ─────────────
   這正是舊版最惱人的地方 —— 每加一個就多一號。 */
for(let i=0;i<2;i++){
  await p.setInputFiles('#fileOverlay',FIX+'/pic1.png');
  await p.waitForFunction(n=>A.overlays.length===n,i+2,{timeout:20000});
}
const fixed=await p.evaluate(()=>{const L=layerLabels();return A.overlays.map(o=>L.item[o.id])});
facts.fixedNumbers=fixed;
chk('三個疊圖全部都是 L4（號碼不隨數量增加）',fixed.join()==='4,4,4');
chk('加了疊圖之後標題仍是 L5',
  await p.evaluate(()=>layerLabels().item[A.titles[0].id])===5);
await p.evaluate(()=>{A.overlays.length=1;render()});

/* ── 時間軸標籤 ─────────────────────────────────────────── */
// 先放一張圖片，圖片軌才有方塊可以標
await p.setInputFiles('#fileImage',FIX+'/pic1.png');
await p.waitForFunction(()=>A.clips.length===2);
await p.evaluate(()=>{A.clips[1].at=6;render()});   // 挪開，不要擋住量像素的那一格
const tags=await p.evaluate(()=>[...document.querySelectorAll('.lz')]
  .map(n=>n.closest('.trk').dataset.tk+'/'+n.parentElement.className.split(' ')[0]+'='+n.textContent));
facts.tags=tags;
chk('影片方塊標 L1',tags.includes('video/blk=L1'));
chk('字幕方塊標 L1',tags.includes('video/sblk=L1'));
chk('圖片方塊標 L3',tags.includes('img/blk=L3'));
chk('疊圖方塊標 L4',tags.includes('over/oblk=L4'));
chk('標題方塊標 L5',tags.includes('title/tblk=L5'));
chk('音軌不標',!(await p.evaluate(()=>!!document.querySelector('.mblk .lz'))));
chk('軌道名稱旁也標了 L 編號',await p.evaluate(()=>
  [...document.querySelectorAll('.tklz')].map(n=>n.textContent).join()==='L3,L4,L5'));
chk('標籤不吃滑鼠事件',await p.evaluate(()=>
  getComputedStyle(document.querySelector('.lz')).pointerEvents==='none'));
chk('標籤讓開右邊的裁切把手',await p.evaluate(()=>{
  const lz=document.querySelector('.oblk .lz'),hd=document.querySelector('.oblk .hd.r');
  const a=lz.getBoundingClientRect(),c=hd.getBoundingClientRect();
  return a.right<=c.left+0.5;
}));

/* ── 實際像素：誰蓋住誰 ─────────────────────────────────── */
const px=()=>p.evaluate(()=>{
  const cv=document.createElement('canvas');cv.width=320;cv.height=180;
  const x=cv.getContext('2d');renderFrame(x,1,320,180);
  const at=(px,py)=>{const d=x.getImageData(px,py,1,1).data;return [d[0],d[1],d[2]];};
  return {sub:at(160,155),title:at(160,40),corner:at(4,4)};
});
const base=await px();facts.pixels={base};
const isYellow=c=>c[0]>180&&c[1]>180&&c[2]<90;
const isBlue=c=>c[2]>150&&c[0]<90;
chk('影片是底（角落仍是影片藍）',isBlue(base.corner));
chk('疊圖 L4 蓋住字幕 L1',isYellow(base.sub));

/* 字幕換到上軌（L2），仍然在疊圖（L4）之下 */
await p.evaluate(()=>{A.subs[0].track=1;tagSubs();render();});
const upperSub=await px();facts.pixels.subOnUpperTrack=upperSub;
chk('字幕換到上軌 L2 仍在疊圖 L4 之下',isYellow(upperSub.sub));
await p.evaluate(()=>{A.subs[0].track=0;tagSubs();render();});

/* ── 同一層之內：起始時間較後的蓋住較前的 ───────────────── */
const sameLayer=await p.evaluate(async()=>{
  const keep=A.overlays.map(o=>({...o}));
  const a=A.overlays[0];
  const bb={...a,id:uid(),start:0.5};              // 較晚開始 → 應該蓋住 a
  A.overlays.push(bb);MEDIA.set(bb.id,MEDIA.get(a.id));
  Object.assign(a,{start:0,end:3,x:.5,y:.5,scale:.6,opacity:1});
  Object.assign(bb,{start:.5,end:3,x:.5,y:.5,scale:.6,opacity:1});
  const plan=layerPlan().filter(r=>r.kind==='overlay').map(r=>r.obj.id);
  const sameL=layerLabels();
  const out={order:plan.join()===[a.id,bb.id].join(),
             bothSame:sameL.item[a.id]===sameL.item[bb.id]};
  A.overlays.length=0;for(const k of keep)A.overlays.push(k);
  render();return out;
});
facts.sameLayer=sameLayer;
chk('同一層之內依起始時間排序（晚的畫在後面＝蓋住早的）',sameLayer.order);
chk('同一層的兩個疊圖號碼相同',sameLayer.bothSame);

/* ── 雙軌連動：頂層影片＋頂層字幕是一組，整組蓋住下軌那一組 ── */
const dual=await p.evaluate(async()=>{
  const o=A.overlays[0],keep={start:o.start,end:o.end};
  o.start=9;o.end=12;                               // 疊圖挪到時間軸外
  const img=A.clips.find(isImg),keepImg=img?img.at:null;
  if(img)img.at=20;                                 // 圖片也挪開
  const src=A.clips[0];
  const up={...src,id:uid(),track:1,at:0,kf:null};
  A.clips.push(up);MEDIA.set(up.id,MEDIA.get(src.id));
  // 預設字幕有陰影＋描邊，在 320x180 下純白像素只有十幾個，量起來太脆弱。
  // 這一段改成實心大字，數量才有意義；測完還原。
  const keepStyle={...A.subStyle},keepUpper=A.subStyleUpper?{...A.subStyleUpper}:null;
  const solid={size:70,shadow:false,strokeW:0,box:false,color:'#ffffff'};
  Object.assign(A.subStyle,solid);
  A.subStyleUpper=Object.assign(A.subStyleUpper||{...A.subStyle},solid);
  const whiteAll=()=>{
    const cv=document.createElement('canvas');cv.width=320;cv.height=180;
    const x=cv.getContext('2d');renderFrame(x,1,320,180);
    const d=x.getImageData(0,0,320,180).data;let n=0;
    for(let i=0;i<d.length;i+=4)if(d[i]>245&&d[i+1]>245&&d[i+2]>245)n++;
    return n;
  };
  A.subs[0].track=0;tagSubs();render();
  const lower=whiteAll();
  const lab=layerLabels();
  A.subs[0].track=1;tagSubs();render();
  const upper=whiteAll();
  A.subs[0].track=0;tagSubs();
  Object.assign(A.subStyle,keepStyle);A.subStyleUpper=keepUpper;
  // 編號要在「上軌那一段還在」的時候取，pop 掉之後就只剩一段了
  const clipL=A.clips.filter(c=>!isImg(c)).map(c=>lab.clip[c.id]);
  A.clips.pop();if(img)img.at=keepImg;Object.assign(o,keep);render();
  return {lower,upper,clipL,subL:[lab.sub[0],lab.sub[1]]};
});
facts.dual=dual;
chk('底層字幕被不透明的頂層影片蓋住（整組連動）',dual.lower<10);
// 門檻取 20：實測被蓋住是 0、看得到是數十。純白判定 >245 很嚴，抗鋸齒邊緣都不算。
chk('同一句字幕改掛上軌就看得到',dual.upper>20);
chk('雙軌編號：影片底層 L1、影片頂層 L2、字幕各自同號',
  dual.clipL.join()==='1,2'&&dual.subL[0]===1&&dual.subL[1]===2);

/* ── 用軌道 ▲▼ 換層級 ──────────────────────────────────── */
await p.evaluate(()=>document.querySelector('.trk[data-tk="over"] .ord[data-mv="dn"]').click());
await p.waitForTimeout(250);
const moved=await p.evaluate(()=>({order:A.proj.tracks.join(),
  over:layerOfTrack('over'),title:layerOfTrack('title'),img:layerOfTrack('img')}));
facts.moved=moved;
chk('疊圖往下一列：疊圖變 L5、標題變 L4',moved.over===5&&moved.title===4&&moved.img===3);
chk('時間軸標籤同步',await p.evaluate(()=>
  document.querySelector('.oblk .lz').textContent==='L5'&&
  document.querySelector('.tblk .lz').textContent==='L4'));
const afterMove=await px();facts.pixels.afterMove=afterMove;
chk('換層之後畫面真的跟著變（疊圖仍在字幕之上）',isYellow(afterMove.sub));
await p.keyboard.press('Control+z');await p.waitForTimeout(250);
chk('Ctrl+Z 復原層級',await p.evaluate(()=>layerOfTrack('over'))===4);

/* ── 地板與天花板 ───────────────────────────────────────── */
const bounds=await p.evaluate(()=>{
  const before=A.proj.tracks.join();
  // 圖片軌已經在 L3（地板），再往上就是影片軌的位置，不該動
  document.querySelector('.trk[data-tk="img"] .ord[data-mv="up"]').click();
  const afterImgUp=A.proj.tracks.join();
  // 影片軌完全不能動
  moveTrack('video',1);
  const afterVideo=A.proj.tracks.join();
  return {before,afterImgUp,afterVideo,
    imgUpDisabled:document.querySelector('.trk[data-tk="img"] .ord[data-mv="up"]').disabled,
    videoUpDisabled:document.querySelector('.trk[data-tk="video"] .ord[data-mv="up"]').disabled,
    videoDnDisabled:document.querySelector('.trk[data-tk="video"] .ord[data-mv="dn"]').disabled};
});
facts.bounds=bounds;
chk('圖片軌在 L3 時往上無效（L3 是地板）',bounds.afterImgUp===bounds.before);
chk('圖片軌的 ▲ 是 disabled 的',bounds.imgUpDisabled);
chk('影片軌完全不能移動',bounds.afterVideo===bounds.before&&bounds.videoUpDisabled&&bounds.videoDnDisabled);
chk('屬性面板不再有「往上一層」按鈕',
  await p.evaluate(()=>{A.sel={type:'overlay',id:A.overlays[0].id};refreshProp();
    return !document.querySelector('#lzUp')&&!document.querySelector('#lzDown')}));
chk('屬性面板仍會報告目前在第幾層',
  /L4/.test(await p.evaluate(()=>{A.sel={type:'overlay',id:A.overlays[0].id};refreshProp();
    return $('#prop').textContent})));

/* ── 圖片自己一軌，但功能跟影片一樣 ─────────────────────── */
const imgFeat=await p.evaluate(()=>{
  const img=A.clips.find(isImg);
  Object.assign(img,{at:6,outP:2,trans:{type:'dissolve',dur:.6},cropShape:'circle',cropSize:.5});
  const q=layout()[A.clips.indexOf(img)];
  const act=activeAt(q.trAt+q.tr/2,IMG_TRACK);
  const has={track:clipTrack(img),intro:!!act&&!!act.intro,
             crop:img.cropShape,grade:!!img.grade};
  img.cropShape='none';A.sel={type:'clip',id:img.id};render();refreshProp();
  // 跟影片走同一個片段屬性面板：裁切、關鍵幀、調色的控制項都在
  has.panel=!!document.querySelector('#cCropShape')&&!!document.querySelector('#cKf');
  return has;
});
facts.imgFeat=imgFeat;
chk('圖片在自己的軌（IMG_TRACK=2）',imgFeat.track===2);
chk('圖片仍吃得到轉場',imgFeat.intro);
chk('圖片仍吃得到裁切與調色，且共用影片的片段面板',imgFeat.crop==='circle'&&imgFeat.grade&&imgFeat.panel);

/* 圖片畫在影片之上：把圖片跟影片排在同一個時間點 */
const cover=await p.evaluate(()=>{
  const img=A.clips.find(isImg);const keep=img.at;
  img.at=0;Object.assign(img,{x:.5,y:.5,scale:1,opacity:1});
  const o=A.overlays[0],ok={start:o.start,end:o.end};o.start=9;o.end=12;
  const cv=document.createElement('canvas');cv.width=320;cv.height=180;
  const x=cv.getContext('2d');renderFrame(x,1,320,180);
  const d=x.getImageData(160,90,1,1).data;
  img.at=keep;Object.assign(o,ok);render();
  return [d[0],d[1],d[2]];
});
facts.imgCoversVideo=cover;
chk('圖片 L3 蓋在影片 L1 上面',!isBlue(cover));

/* ── 舊專案遷移 ─────────────────────────────────────────── */
const mig=await p.evaluate(async()=>{
  const {st,files}=serialize();
  // 做一份 v11.8 格式的舊檔：圖片排在影片底層、疊圖／標題帶著已經廢掉的 z、
  // 軌道順序沒有 img。這是實際會在使用者硬碟上的樣子。
  const imgIdx=st.clips.findIndex(c=>c.kind==='image');
  st.clips[imgIdx].track=0;st.clips[imgIdx].at=3;
  st.clips[0].at=0;
  st.proj.tracks=['video','over','sub','title','music'];
  st.overlays.forEach((o,i)=>o.z=i+1);
  (st.titles||[]).forEach((t,i)=>t.z=i+9);
  await deserialize(st,files);
  const img=A.clips.find(isImg);
  return {imgTrack:clipTrack(img),imgAt:img.at,
          order:A.proj.tracks.join(),
          lz:{img:layerOfTrack('img'),over:layerOfTrack('over'),title:layerOfTrack('title')},
          videoAt:A.clips.find(c=>!isImg(c)).at};
});
facts.migrated=mig;
chk('舊專案的圖片自動搬到圖片軌',mig.imgTrack===2);
chk('搬家後圖片的時間沒有跑掉',Math.abs(mig.imgAt-3)<1e-6);
chk('搬家後影片沒有往前補位',Math.abs(mig.videoAt-0)<1e-6);
chk('舊專案補上圖片軌且排在影片之後',mig.order==='video,img,over,title,music');
chk('舊專案的 L 編號是預設的 3／4／5',mig.lz.img===3&&mig.lz.over===4&&mig.lz.title===5);

/* ── 存讀 ───────────────────────────────────────────────── */
const rt=await p.evaluate(async()=>{
  moveTrack('title',-1);                            // 標題排到疊圖前面
  const want=A.proj.tracks.join()+'|'+[layerOfTrack('img'),layerOfTrack('over'),layerOfTrack('title')].join();
  const blob=await buildProjBlob();
  await projImportFile(new File([blob],'layers.nvproj'));
  const got=A.proj.tracks.join()+'|'+[layerOfTrack('img'),layerOfTrack('over'),layerOfTrack('title')].join();
  moveTrack('title',1);
  return {want,got};
});
facts.roundTrip=rt;
chk('nvproj 存讀保留軌道順序與層級',rt.want===rt.got);

/* ── 分割 ───────────────────────────────────────────────── */
const sp=await p.evaluate(()=>{
  const o=A.overlays[0];Object.assign(o,{start:0,end:3});
  A.sel={type:'overlay',id:o.id};A.playhead=1.5;
  splitAtPlayhead();
  const L=layerLabels();
  const ns=A.overlays.map(x=>L.item[x.id]);
  return {n:A.overlays.length,same:ns.every(v=>v===ns[0]),v:ns[0]};
});
facts.split=sp;
chk('分割成兩段',sp.n===2);
chk('分割後兩半同一層 L'+sp.v,sp.same&&sp.v===4);

/* ── 匯出與預覽一致 ─────────────────────────────────────── */
await p.evaluate(()=>{A.overlays.length=1;Object.assign(A.overlays[0],{start:0,end:3,x:.5,y:.85,scale:.5});
  const img=A.clips.find(isImg);if(img)img.at=20;render();});
/* 不要只取單點：標題是文字，單點很容易落在筆畫的縫隙裡，
   量出來的差異是「取樣運氣」而不是「層級對不對」。改成數區域內的顏色像素。 */
await p.evaluate(()=>{
  window.countBands=d=>{
    let mag=0,yel=0;
    for(let y=0;y<180;y++)for(let px=0;px<320;px++){
      const i=(y*320+px)*4,r=d[i],g=d[i+1],bl=d[i+2];
      if(y<70  && r>140&&bl>140&&g<110) mag++;            // 標題（洋紅）在上半
      if(y>=90 && r>180&&g>180&&bl<90)  yel++;            // 疊圖（黃）在下半
    }
    return {mag,yel};
  };
});
const bands=()=>p.evaluate(()=>{
  const cv=document.createElement('canvas');cv.width=320;cv.height=180;
  const x=cv.getContext('2d');renderFrame(x,1,320,180);
  return countBands(x.getImageData(0,0,320,180).data);
});
const previewBands=await bands();
facts.exportState=await p.evaluate(()=>({
  ov:A.overlays.map(o=>({start:o.start,end:o.end,x:o.x,y:o.y,scale:o.scale})),
  ti:A.titles.map(t=>({start:t.start,end:t.end,color:t.color,size:t.size})),
  clips:A.clips.length, proj:{w:A.proj.w,h:A.proj.h}, tracks:A.proj.tracks}));
const dl=await Promise.all([p.waitForEvent('download',{timeout:120000}),p.click('#btnExport')]);
const d=dl[0];const file=path.join(OUT,'layers-export-'+d.suggestedFilename());
await d.saveAs(file);
const decoded=await p.evaluate(async data=>{
  const bin=Uint8Array.from(atob(data),c=>c.charCodeAt(0));
  const url=URL.createObjectURL(new Blob([bin]));
  const v=document.createElement('video');v.muted=true;
  await new Promise((ok,no)=>{v.onloadeddata=ok;v.onerror=no;v.src=url});
  await new Promise((ok,no)=>{v.onseeked=ok;v.onerror=no;v.currentTime=1});
  const cv=document.createElement('canvas');cv.width=320;cv.height=180;
  const x=cv.getContext('2d');x.drawImage(v,0,0,320,180);
  const out=countBands(x.getImageData(0,0,320,180).data);
  URL.revokeObjectURL(url);return out;
},fs.readFileSync(file).toString('base64'));
facts.export={preview:previewBands,decoded};
const near=(a,b)=>a>0&&b>0&&Math.abs(a-b)/Math.max(a,b)<0.2;
chk('匯出的標題份量與預覽相符',near(previewBands.mag,decoded.mag));
chk('匯出的疊圖份量與預覽相符',near(previewBands.yel,decoded.yel));

chk('no page errors',errors.length===0);
fs.writeFileSync(path.join(OUT,'layers-results.json'),JSON.stringify({count,bad,facts,errors},null,2));
console.log('通過 '+(count-bad.length)+' / '+count);
if(bad.length){console.log('失敗:\n'+bad.join('\n'));console.log(JSON.stringify(facts,null,2));process.exitCode=1}
}finally{await b.close();await new Promise(r=>srv.close(r))}
})().catch(e=>{console.error(e);process.exit(1)});
