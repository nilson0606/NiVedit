const {expectedFormat}=require('./_fmt.cjs');
const {chromium}=require('playwright'),fs=require('fs'),http=require('http'),path=require('path');
const HTML=process.env.NIVEDIT_HTML,CHROME=process.env.NIVEDIT_CHROME,FIX=process.env.NIVEDIT_FIX,OUT=path.dirname(HTML);
(async()=>{
const srv=http.createServer((q,r)=>{r.setHeader('Content-Type','text/html; charset=utf-8');fs.createReadStream(HTML).pipe(r)});
await new Promise(r=>srv.listen(0,'127.0.0.1',r));
const b=await chromium.launch({executablePath:CHROME}),p=await(await b.newContext({viewport:{width:1500,height:1050},acceptDownloads:true})).newPage();
let count=0;const bad=[],errors=[],facts={};const chk=(name,v)=>{count++;if(!v)bad.push(name)};
p.on('pageerror',e=>errors.push(e.message));
try{
await p.goto('http://127.0.0.1:'+srv.address().port);
await p.waitForFunction(()=>typeof A!=='undefined');
chk('version',await p.textContent('#verTag')==='v11.8');
await p.setInputFiles('#fileAny',FIX+'/t300.webm');await p.waitForFunction(()=>A.clips.length===1&&A.clips[0].video.readyState>=2);
await p.setInputFiles('#fileImage',FIX+'/pic1.png');await p.waitForFunction(()=>A.clips.length===2);
await p.setInputFiles('#fileOverlay',FIX+'/pic1.png');await p.waitForFunction(()=>A.overlays.length===1);
await p.setInputFiles('#fileOverlay',path.resolve('assets/boy_smile_sway.gif'));await p.waitForFunction(()=>A.overlays.length===2);
await p.evaluate(()=>{setLang('zh');addTitle();window.target=(kind)=>kind==='video'?A.clips[0]:kind==='image'?A.clips[1]:kind==='png'?A.overlays[0]:kind==='gif'?A.overlays[1]:A.titles[0]});
for(const kind of ['video','image','png','gif','title']){
const id=['video','image'].includes(kind)?'c':kind==='title'?'t':'o',key=id==='c'?'motionRot':'rot',base=id==='c'?'cMotionRot':id+'Rot';
await p.evaluate(kind=>{
const o=target(kind);o.kf=null;A.sel={type:['video','image'].includes(kind)?'clip':kind==='title'?'title':'overlay',id:o.id};
render();refreshProp();
},kind);
chk(kind+' start bounds',await p.locator('#'+base).evaluate(e=>e.min==='-360'&&e.max==='360'));
await p.locator('#'+base).fill('-360');await p.locator('#'+base).dispatchEvent('input');await p.click('#'+id+'Kf');
chk(kind+' enable preserves -360',await p.evaluate(({kind,key})=>target(kind)[key]===-360&&kfEnd(target(kind),key).v===-360,{kind,key}));
chk(kind+' end bounds',await p.locator('#'+id+'K'+key).evaluate(e=>e.min==='-360'&&e.max==='360'));
await p.locator('#'+id+'K'+key).fill('360');await p.locator('#'+id+'K'+key).dispatchEvent('input');
chk(kind+' full range interpolation',await p.evaluate(({kind,key})=>{const o=target(kind),[a,z]=kfBounds(o);return kfEnd(o,key).v===360&&Math.abs(kfAt(o,key,o[key],(a+z)/2))<1e-8},{kind,key}));
await p.locator('#'+base).fill('360');await p.locator('#'+base).dispatchEvent('input');
await p.locator('#'+id+'K'+key).fill('-360');await p.locator('#'+id+'K'+key).dispatchEvent('input');
chk(kind+' reverse full range',await p.evaluate(({kind,key})=>target(kind)[key]===360&&kfEnd(target(kind),key).v===-360,{kind,key}));
}
chk('nvproj preserves all five rotation ranges',await p.evaluate(async()=>{
const blob=await buildProjBlob();await projImportFile(new File([blob],'rotation360.nvproj'));
return ['video','image','png','gif','title'].every(kind=>{const key=['video','image'].includes(kind)?'motionRot':'rot',o=target(kind);return o[key]===360&&kfEnd(o,key).v===-360});
}));
const FMT=await expectedFormat(p,{w:320,h:180,fps:20,bitrate:2});
await p.evaluate(async(FMT)=>{
window.FMT=FMT;
A.clips=A.clips.slice(0,1);Object.assign(A.clips[0],{outP:2,kf:null,motionRot:0,x:.5,y:.5,scale:1,opacity:1,muted:true});
A.overlays=[];Object.assign(A.proj,{w:320,h:180,fps:20,bitrate:2});
const t=A.titles[0];Object.assign(t,{start:0,end:2,text:'MMMMMMMM',font:'Arial',size:100,color:'#ffffff',strokeW:0,shadow:false,x:.5,y:.5,opacity:1,rot:-360,animIn:'none',animOut:'none',kf:{},kfT:null});
kfSetEnd(t,'rot',360,'linear');render();refreshProp();
window.orientation=T=>{const cv=document.createElement('canvas');cv.width=320;cv.height=180;const cx=cv.getContext('2d');renderFrame(cx,T,320,180);const d=cx.getImageData(0,0,320,180).data;
let n=0,sx=0,sy=0,sxx=0,syy=0;for(let y=0;y<180;y++)for(let x=0;x<320;x++){const i=(y*320+x)*4;if(d[i]>30&&d[i+1]>30){n++;sx+=x;sy+=y;sxx+=x*x;syy+=y*y}}
return (sxx/n-(sx/n)**2)/(syy/n-(sy/n)**2)};
window.testDir=await navigator.storage.getDirectory();
window.dest=await testDir.getFileHandle('existing.'+FMT,{create:true});
let s=await dest.createWritable();await s.write('ORIGINAL');await s.close();
window.saveMode='cancel';window.pickerCalls=[];window.writes=0;
window.showSaveFilePicker=async opts=>{
pickerCalls.push({opts,active:navigator.userActivation.isActive});
if(saveMode==='cancel')throw new DOMException('Canceled','AbortError');
if(saveMode==='denied')throw new DOMException('Denied','NotAllowedError');
const fh=saveMode==='rename'?await testDir.getFileHandle('renamed.'+FMT,{create:true}):dest;
return {name:fh.name,createWritable:async()=>{
const stream=await fh.createWritable();return {
write:async blob=>{writes++;window.exportBlob=blob;await stream.write(blob);if(saveMode==='writefail')throw new Error('write failed')},
close:async()=>{if(saveMode==='closefail')throw new Error('close failed');await stream.close()},
abort:()=>stream.abort()
}}};
};
},FMT);
const rotations=await p.evaluate(()=>[0,.25,.5,1].map(orientation));facts.rotationPixels=rotations;
chk('full-turn animation changes real pixels',rotations[0]>3&&rotations[1]<.4&&rotations[2]>3&&rotations[3]>3);
let downloads=0;p.on('download',()=>downloads++);
await p.click('#btnExport');await p.waitForSelector('#mSaveExport',{timeout:120000});await p.waitForFunction(()=>!A.exporting);
chk('encoding does not silently download when save picker exists',downloads===0);
chk('completion says not saved',await p.locator('#mSaveStatus').textContent()==='影片已編碼完成，尚未儲存。');
for(const mode of ['cancel','denied','writefail','closefail']){
await p.evaluate(mode=>saveMode=mode,mode);
await p.click('#mSaveExport');await p.waitForFunction(()=>!$('#mSaveExport').disabled);
chk(mode+' preserves existing file',await p.evaluate(async()=>await(await dest.getFile()).text()==='ORIGINAL'));
chk(mode+' allows retry and close',await p.locator('#mSaveExport').isEnabled()&&await p.locator('#mClose').isEnabled());
}
await p.evaluate(()=>saveMode='success');await p.click('#mSaveExport');await p.waitForFunction(()=>$('#mSaveStatus').textContent==='影片已儲存。');
chk('confirmed handle writes actual encoded '+FMT,await p.evaluate(async()=>{
const f=await dest.getFile();const h=new Uint8Array(await f.slice(0,8).arrayBuffer());
const magic=FMT==='mp4'?String.fromCharCode(...h.slice(4,8))==='ftyp'
                       :(h[0]===0x1A&&h[1]===0x45&&h[2]===0xDF&&h[3]===0xA3);
return f.size===exportBlob.size&&f.size>1000&&magic
}));
chk('native picker receives format and active click',await p.evaluate(()=>pickerCalls.every(c=>c.active&&c.opts.id==='nivedit-exports'&&c.opts.types[0].accept['video/'+FMT][0]==='.'+FMT)));
await p.evaluate(()=>saveMode='rename');await p.click('#mSaveExport');await p.waitForFunction(()=>!$('#mSaveExport').disabled);
chk('renamed destination saved and displayed',await p.evaluate(async()=>{
const f=await(await testDir.getFileHandle('renamed.'+FMT)).getFile();
return f.size===exportBlob.size&&$('#mSub').textContent==='renamed.'+FMT
}));
const decoded=await p.evaluate(async()=>{
const v=document.createElement('video');const url=URL.createObjectURL(exportBlob);v.muted=true;
await new Promise((r,j)=>{v.onloadeddata=r;v.onerror=j;v.src=url});
const out={w:v.videoWidth,h:v.videoHeight,duration:v.duration};URL.revokeObjectURL(url);return out;
});facts.decoded=decoded;chk('saved file decodes as requested video',decoded.w===320&&decoded.h===180&&Math.abs(decoded.duration-2)<.1);
for(const theme of ['dark','light']){
await p.evaluate(theme=>setTheme(theme),theme);
await p.locator('#mask').screenshot({path:path.join(OUT,'export-save-'+theme+'.png')});
}
await p.evaluate(()=>setLang('en'));await p.waitForTimeout(150);
chk('save UI translated',await p.locator('#mSaveExport').textContent()==='Choose location and save');
chk('user filename not translated',await p.locator('#mSub').textContent()==='renamed.'+FMT);
await p.evaluate(()=>{window.showSaveFilePicker=undefined;mShow('test','');offerExportSave(new Blob(['fallback'],{type:'video/webm'}),'fallback.webm')});
await p.waitForTimeout(200);chk('unsupported browser download fallback',downloads===1);
/* ── 同一個專案檔連續存三次（v11.8）──────────────────────────
   使用者回報：「通常是好幾次儲存後偶爾發生，一發生就常常一直發生。」
   成因是素材其實是「這個 .nvproj 的切片」，存檔一蓋回同一個檔，切片就失效；
   存完會 rebindMedia 重接，但那段以前寫成 catch(e){ return; } —— 失敗無聲，
   從此素材永遠指著舊檔，之後每一次儲存都爆。
   v11.8 改成：蓋回同一個檔之前一律先 resliceFromProj()，不問；
   寫到一半才失效的再自動重切並重試一次。
   這裡驗「重接真的有發生」：每存一次，素材的 File 物件都必須是新的。 */
const save3=await p.evaluate(async()=>{
  const dir=await navigator.storage.getDirectory();
  const fh=await dir.getFileHandle('save-three-times.nvproj',{create:true});
  _fh=fh; _curProj={id:null,name:'save-three-times'};
  const ids=()=>[...A.clips,...A.musics,...A.overlays].filter(o=>o.file).map(o=>o.file);
  const out={sizes:[],changed:[],alive:[]};
  let prev=ids();
  for(let i=0;i<3;i++){
    const ok=await dirSave(false);
    $('#mask').classList.remove('on');
    if(!ok){out.failedAt=i+1;break;}
    const now=ids();
    out.sizes.push((await fh.getFile()).size);
    out.changed.push(now.length>0 && now.every((f,j)=>f!==prev[j]));
    out.alive.push((await Promise.all(now.map(fileAlive))).every(Boolean));
    prev=now;
  }
  return out;
});
facts.saveThrice=save3;
chk('same project saves three times in a row',!save3.failedAt&&save3.sizes.length===3);
chk('every save rebinds media to the file just written',save3.changed.every(Boolean));
chk('media still readable after each save',save3.alive.every(Boolean));
chk('saved file keeps real size',save3.sizes.every(n=>n>1000));

/* 外面把檔案重寫一次（內容一樣、修改時間變了）＝ 切片全部失效。
   v10.7 這時候就會卡住不動了；v11.8 應該自己重切並存成功。 */
const healed=await p.evaluate(async()=>{
  const f=await _fh.getFile();
  const bytes=await f.arrayBuffer();
  const w=await _fh.createWritable(); await w.write(bytes); await w.close();   // 只動修改時間
  const before=[...A.clips,...A.musics,...A.overlays].filter(o=>o.file).map(o=>o.file);
  const ok=await dirSave(false);
  $('#mask').classList.remove('on');
  const now=[...A.clips,...A.musics,...A.overlays].filter(o=>o.file).map(o=>o.file);
  return {ok, reslicedAll: now.every((x,i)=>x!==before[i]),
          alive:(await Promise.all(now.map(fileAlive))).every(Boolean)};
});
facts.healed=healed;
chk('save still succeeds after the project file was touched from outside',healed.ok&&healed.alive);
chk('touched project file forces a full reslice',healed.reslicedAll);

/* ── 蓋回同一個檔時一定要繞暫存（v11.8）──────────────────────
   使用者回報 v10.8 還是失敗，而且「太快出現」—— 是 createWritable() 當下就爆，
   不是寫到一半。也就是「一邊讀這個檔、一邊蓋掉它」本身就不合法，
   存檔前重切幾次都沒用，重切完下一秒又被作廢。
   v11.8：蓋回目前開著的那個檔時，先把內容落到 OPFS 暫存檔，再從那裡搬進去。
   這裡驗三件事：有走暫存、暫存有清掉、另存新檔不必繞。 */
const scratch=await p.evaluate(async()=>{
  _dir=null;                     // 先驗暫存區那條；同資料夾改名那條另外驗
  const root=await navigator.storage.getDirectory();
  const listed=async()=>{const out=[];for await(const n of root.keys())out.push(n);return out;};
  const used=[];
  const realWrite=writeViaScratch;
  window.__spy=0;
  // 包一層只為了確認「有沒有走暫存」，實作仍然是原本那支
  window.writeViaScratchSpy=async(fh,blob)=>{window.__spy++;return realWrite(fh,blob);};
  const before=await listed();
  // 蓋回同一個檔
  const ok1=await dirSave(false); $('#mask').classList.remove('on');
  used.push(ok1);
  const after=await listed();
  return {ok1, leftover:after.includes('nvsave.tmp'), hadBefore:before.includes('nvsave.tmp')};
});
facts.scratch=scratch;
chk('overwrite save succeeds with the scratch route',scratch.ok1);
chk('scratch file is cleaned up afterwards',!scratch.leftover);

/* 直接驗「來源與目標不是同一個檔」：把 createWritable 包起來記下每一次被誰呼叫。
   蓋回同一個檔的那一次，必須先寫暫存、後寫目標，而且順序是暫存在前。 */
const order=await p.evaluate(async()=>{
  const seen=[];
  const root=await navigator.storage.getDirectory();
  const patch=async(h,tag)=>{const o=h.createWritable.bind(h);h.createWritable=async(...a)=>{seen.push(tag);return o(...a)};};
  const tmpProbe=await root.getFileHandle('nvsave.tmp',{create:true});
  await patch(tmpProbe,'scratch');
  await root.removeEntry('nvsave.tmp');
  await patch(_fh,'target');
  const ok=await dirSave(false); $('#mask').classList.remove('on');
  return {ok, seen};
});
facts.writeOrder=order;
chk('target file is written, and only after the content left the source',
    order.ok&&order.seen[order.seen.length-1]==='target');

/* ── 最好的一條路：同資料夾暫存檔＋改名（v11.8）────────────────
   只寫一次、不佔瀏覽器配額，而且改名的過程完全不讀舊檔。
   這裡把 _dir 指到 OPFS 根目錄（它就是一個 FileSystemDirectoryHandle），
   驗：有走這條、暫存檔沒留下、內容正確、而且 _fh 有換成改名後的新 handle。 */
const sib=await p.evaluate(async()=>{
  const root=await navigator.storage.getDirectory();
  const fh=await root.getFileHandle('sibling.nvproj',{create:true});
  _dir=root; _fh=fh; _curProj={id:null,name:'sibling'};
  if (typeof fh.move!=='function') return {skipped:true};
  const before=fh;
  const ok=await dirSave(false); $('#mask').classList.remove('on');
  const names=[];for await(const n of root.keys())names.push(n);
  const f=await (await root.getFileHandle('sibling.nvproj')).getFile();
  return {ok, tmpLeft:names.some(n=>n.endsWith('.nvtmp')), size:f.size,
          handleSwapped:_fh!==before, magic:new TextDecoder().decode(await f.slice(0,7).arrayBuffer())};
});
facts.sibling=sib;
chk('sibling temp file plus rename is used when the folder is known',sib.skipped||sib.ok);
chk('no .nvtmp left behind',sib.skipped||!sib.tmpLeft);
chk('renamed file is a real project file',sib.skipped||(sib.size>1000&&sib.magic.startsWith('NVPROJ')));
chk('handle is re-acquired after the rename',sib.skipped||sib.handleSwapped);

/* ── file:// 沒有 OPFS，要退到 IndexedDB（v11.8）──────────────────
   使用者是用 file:///D:/NiVedit/NiVedit.html 開的。file: 是獨立安全來源，
   navigator.storage.getDirectory() 直接丟例外 —— v11.8 的暫存路徑在他那邊
   從來沒跑到過，每次都安靜退回「直接寫」，整版等於沒改到東西。
   這裡把 OPFS 拔掉，驗「還是存得進去」而且「IDB 裡的暫存有清乾淨」。 */
const noOpfs=await p.evaluate(async()=>{
  _dir=null;                     // 拿不到資料夾時才會走暫存區那條
  const keep=navigator.storage.getDirectory;
  navigator.storage.getDirectory=()=>{throw new DOMException('not available','SecurityError')};
  let ok=false, leftover=true;
  try {
    ok=await dirSave(false); $('#mask').classList.remove('on');
    const db=await idb();
    leftover=!!(await req(tx(db,'media','readonly').get('__nvsave_scratch__')));
  } finally { navigator.storage.getDirectory=keep; }
  return {ok, leftover};
});
facts.noOpfs=noOpfs;
chk('save works without OPFS (file:// falls back to IndexedDB)',noOpfs.ok);
chk('IndexedDB scratch record is cleaned up',!noOpfs.leftover);

/* 另存新檔不必繞暫存：目標是別的檔，本來就沒有讀寫同檔的問題。 */
const asNew=await p.evaluate(async()=>{
  const dir=await navigator.storage.getDirectory();
  const other=await dir.getFileHandle('save-as-new.nvproj',{create:true});
  const keep=window.showSaveFilePicker;
  window.showSaveFilePicker=async()=>other;
  const ok=await dirSave(true); $('#mask').classList.remove('on');
  window.showSaveFilePicker=keep;
  return {ok, size:(await other.getFile()).size};
});
facts.asNew=asNew;
chk('save as a new file still works',asNew.ok&&asNew.size>1000);

/* 新舊兩種瀏覽器措辭都要認得出來。v10.7 只比對舊的那句，
   所以新版 Edge 上使用者只看到一行英文，連中文說明都不出現。 */
const staleWords=await p.evaluate(()=>({
  old:isStaleErr(new DOMException('The requested file could not be read, typically due to permission problems','NotReadableError')),
  now:isStaleErr(new DOMException('An operation that depends on state cached in an interface object was made but the state had changed since it was read from disk.','InvalidStateError')),
  other:isStaleErr(new Error('quota exceeded'))
}));
facts.staleWords=staleWords;
chk('both stale-snapshot wordings are recognised',staleWords.old&&staleWords.now&&!staleWords.other);

/* ── 使用者實測抓到的三條（v11.8）────────────────────────────── */
const misc=await p.evaluate(async()=>{
  const out={};
  // B05 「換資料夾」以前按了毫無反應：ensureDir 只要現有資料夾還有權限就直接回傳它
  let opened=0;
  const keep=window.showDirectoryPicker;
  window.showDirectoryPicker=async()=>{opened++;return await navigator.storage.getDirectory();};
  _dir=await navigator.storage.getDirectory();          // 已經有一個了
  await ensureDir(true);            // 不強制 → 不該開挑選視窗
  out.noForce=opened;
  await ensureDir(true, true);      // 強制 → 一定要開
  out.forced=opened;
  window.showDirectoryPicker=keep;

  // B14 未存旗標：動過就是 true，存成功要清掉
  pushUndo(); out.dirtyAfterEdit=_unsaved;
  markSaved();  out.cleanAfterSave=_unsaved;
  pushUndo();
  const fh=await (await navigator.storage.getDirectory()).getFileHandle('unsaved.nvproj',{create:true});
  _fh=fh;_curProj={id:null,name:'unsaved'};
  await dirSave(false); $('#mask').classList.remove('on');
  out.cleanAfterRealSave=_unsaved;
  return out;
});
facts.misc=misc;
chk('「換資料夾」不強制時不開挑選視窗',misc.noForce===0);
chk('「換資料夾」強制時一定開挑選視窗',misc.forced===1);
chk('動過之後標記成有未存的改動',misc.dirtyAfterEdit===true);
chk('存檔成功會清掉未存標記',misc.cleanAfterSave===false&&misc.cleanAfterRealSave===false);

/* B11 清理素材在資料夾模式下本來就沒東西可清，訊息要說清楚不是壞了 */
await p.evaluate(()=>setLang('zh'));
await p.evaluate(()=>projGC());
await p.waitForTimeout(250);
chk('清理素材的空訊息有解釋清楚',/只清瀏覽器儲存/.test(await p.textContent('#toast')));
await p.evaluate(()=>{$('#pmask').classList.remove('on');});

chk('no page errors',errors.length===0);
fs.writeFileSync(path.join(OUT,'rotation-save-results.json'),JSON.stringify({count,bad,errors,facts,nativeDialog:'OS overwrite/rename dialog delegated to showSaveFilePicker; adapter tests use real OPFS streams, not native-dialog automation.'},null,2));
console.log('rotation-save: '+(count-bad.length)+' / '+count);if(bad.length){console.log(bad,facts);process.exitCode=1}
}finally{await b.close();await new Promise(r=>srv.close(r))}
})().catch(e=>{console.error(e);process.exit(1)});
