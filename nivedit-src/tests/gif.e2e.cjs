const {chromium}=require('playwright');
const { VER } = require('./_ver.cjs');
const assert=require('assert/strict');const fs=require('fs');const path=require('path');
const {expectedFormat}=require('./_fmt.cjs');
(async()=>{
 const workspace=process.env.NIVEDIT_WORKSPACE || path.resolve(__dirname,'../..');
 const html=process.env.NIVEDIT_HTML || path.join(workspace,'NiVedit.html');
 const dir=path.join(path.dirname(html),'gif-qa');fs.mkdirSync(dir,{recursive:true});
 // 其餘十六支都吃 NIVEDIT_CHROME，只有這支寫死 msedge，沒裝 Edge 的機器上第一行就爆。
 // 有設就用設的，沒設才退回 msedge —— 這樣任何環境都跑得起來。
 const LAUNCH = process.env.NIVEDIT_CHROME
   ? { executablePath: process.env.NIVEDIT_CHROME, headless:true,
       args:['--no-sandbox','--autoplay-policy=no-user-gesture-required'] }
   : { channel:'msedge', headless:true };
 const b=await chromium.launch(LAUNCH);
 const c=await b.newContext({viewport:{width:1440,height:960},acceptDownloads:true});const p=await c.newPage();
 const errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')console.log('browser:',m.text())});
 await p.addInitScript(() => { window.showSaveFilePicker = undefined; }); // Test browser-download fallback; native save is covered separately.
  await p.goto(require('url').pathToFileURL(html).href);
 await p.waitForFunction(v=>document.querySelector('#verTag').textContent===v,VER);
 await p.locator('#fileImage').setInputFiles(path.join(workspace,'logo/NiVedit_icon.png'));await p.waitForFunction(()=>A.clips.length===1);
 await p.locator('#fileOverlay').setInputFiles(path.join(workspace,'assets/boy_smile_sway.gif'));await p.waitForFunction(()=>A.overlays.length===1,{}, {timeout:30000});
 const info=await p.evaluate(()=>{const g=A.overlays[0]._gif;return {frames:g.frames.length,duration:g.duration,bytes:_gifBytes,serialized:snapshot().length};});
 assert.equal(info.frames,40);assert.equal(info.duration,2000000);assert.ok(info.serialized<20000);
 // 直接使用主程式共用 renderFrame，驗證逐幀取圖及循環、倒退 seek。
 await p.evaluate(()=>{window.frameAt=t=>{const cv=document.createElement('canvas');cv.width=320;cv.height=180;renderFrame(cv.getContext('2d'),t,320,180);return cv.toDataURL()};});
 const images=await p.evaluate(()=>[0,.5,1.5,2,.5].map(window.frameAt));
 assert.notEqual(images[0],images[1]);assert.notEqual(images[1],images[2]);assert.equal(images[0],images[3]);assert.equal(images[1],images[4]);
 await p.evaluate(()=>seekTo(.5));await p.waitForTimeout(100);const paused=await p.locator('#preview').screenshot();await p.waitForTimeout(450);assert.ok(paused.equals(await p.locator('#preview').screenshot()));
 await p.evaluate(()=>setPlaying(true));await p.waitForTimeout(250);const moving=await p.locator('#preview').screenshot();await p.waitForTimeout(350);assert.ok(!moving.equals(await p.locator('#preview').screenshot()));await p.evaluate(()=>setPlaying(false));
 await p.evaluate(()=>{seekTo(.5);A.sel={type:'overlay',id:A.overlays[0].id};refreshProp()});
 await p.screenshot({path:dir+'/gif-day-night-preview.png',fullPage:true});
 // 分割右半保留動畫相位，復原重做仍持有解碼畫格。
 const split=await p.evaluate(()=>{const before=frameAt(1.4);seekTo(.7);splitOverlay();return {before,after:frameAt(1.4),same:A.overlays[0]._gif===A.overlays[1]._gif,offset:A.overlays[1].gifOffset};});
 assert.equal(split.before,split.after);assert.equal(split.same,true);assert.equal(split.offset,.7);
 await p.evaluate(()=>undo());assert.equal(await p.evaluate(()=>A.overlays.length),1);assert.equal(await p.evaluate(()=>frameAt(1.4)),split.before);
 await p.evaluate(()=>redo());assert.equal(await p.evaluate(()=>A.overlays.length),2);assert.equal(await p.evaluate(()=>frameAt(1.4)),split.before);
 // 裁切與移動的動畫相位（使用既有數字欄位與時間軸拖曳事件）。
 const trim=await p.evaluate(()=>{const o=A.overlays[1];A.sel={type:'overlay',id:o.id};refreshProp();const expected=frameAt(1.4);document.querySelector('#oStart').value='1';document.querySelector('#oStart').dispatchEvent(new Event('input'));return {expected,after:frameAt(1.4),offset:o.gifOffset};});
 assert.equal(trim.after,trim.expected);assert.equal(trim.offset,1);
 await p.evaluate(()=>{const o=A.overlays[1];window.moveBefore=frameAt(1.4);const old=o.start;seekTo(1.3);refreshProp();document.querySelector('#oStartNow').click();window.moveResult={before:moveBefore,after:frameAt(1.4+1.3-old),offset:o.gifOffset};});
 const moved=await p.evaluate(()=>moveResult);assert.equal(moved.before,moved.after);assert.equal(moved.offset,1);
 // 真實 .nvproj 封裝與重新匯入，不序列化解碼畫格。
 const packed=await p.evaluate(async()=>{const blob=await buildProjBlob();const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='gif-roundtrip.nvproj';a.click();return blob.size;});
 assert.ok(packed<4000000);
 const saved=await p.evaluate(async()=>{const blob=await buildProjBlob();window.testBlob=blob;return {expected:frameAt(1.8),offset:A.overlays[1].gifOffset};});
 await p.evaluate(async()=>{await projImportFile(new File([testBlob],'gif-roundtrip.nvproj'));});
 assert.equal(await p.evaluate(()=>A.overlays.length),2);assert.equal(await p.evaluate(()=>frameAt(1.8)),saved.expected);assert.equal(await p.evaluate(()=>A.overlays[1].gifOffset),saved.offset);
 assert.equal(await p.evaluate(()=>A.overlays[0]._gif===A.overlays[1]._gif),true);
 // 連續覆寫真實 FileSystemFileHandle 並重綁素材；快取幀須保持可用。
 // file:// 不提供 OPFS；用本機 HTTP 的隔離頁面測真實 handle，主測試仍是 file://。
 const server=require('http').createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(fs.readFileSync(html))});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const p2=await c.newPage();await p2.goto('http://127.0.0.1:'+server.address().port);
 await p2.waitForFunction(v=>document.querySelector('#verTag').textContent===v,VER);
 await p2.locator('#fileImage').setInputFiles(path.join(workspace,'logo/NiVedit_icon.png'));await p2.waitForFunction(()=>A.clips.length===1);
 await p2.locator('#fileOverlay').setInputFiles(path.join(workspace,'assets/boy_smile_sway.gif'));await p2.waitForFunction(()=>A.overlays.length===1);
 const rebound=await p2.evaluate(async()=>{const root=await navigator.storage.getDirectory();const fh=await root.getFileHandle('gif-save-test.nvproj',{create:true});const g=A.overlays[0]._gif;for(let i=0;i<2;i++){const info={};const blob=await buildProjBlob(info);const w=await fh.createWritable();await w.write(blob);await w.close();await rebindMedia(fh,info.base,info.index);}return A.overlays[0]._gif===g && !g.closed && g.frames.length===40 && (await buildProjBlob()).size>3000000;});assert.equal(rebound,true);
 await p2.close();await new Promise(r=>server.close(r));
 // 舊專案沒有 gifOffset 欄位仍可載入，PNG 疊圖仍保持靜態。
 await p.evaluate(async()=>{const {st,files}=serialize();st.overlays=st.overlays.slice(0,1);delete st.overlays[0].gifOffset;await deserialize(st,files);_undo.length=0;_redo.length=0;});
 assert.equal(await p.evaluate(()=>A.overlays[0]._gif.frames.length),40);
 await p.locator('#fileOverlay').setInputFiles(path.join(workspace,'logo/NiVedit_icon.png'));await p.waitForFunction(()=>A.overlays.length===2);assert.equal(await p.evaluate(()=>A.overlays[1]._gif),null);
 // 匯出 3 秒影片（格式看瀏覽器能力），畫面上只保留一個完整的動畫疊圖。
 await p.evaluate(()=>{A.overlays=A.overlays.slice(0,1);Object.assign(A.overlays[0],{start:0,end:3,gifOffset:0,x:.7,y:.55,scale:.4});Object.assign(A.proj,{w:640,h:360,fps:20,bitrate:2});render();refreshProp();});
 const dlPromise=p.waitForEvent('download',{timeout:60000});
 await p.locator('#btnExport').click();const dl=await dlPromise;const video=dir+'/gif-export'+path.extname(dl.suggestedFilename());await dl.saveAs(video);await p.waitForFunction(()=>!A.exporting);
 // 容器沒有 AAC 編碼器時匯出會是 WebM，那是瀏覽器的能力差異、不是 NiVedit 壞掉。
 // 跟其他測試一樣先問瀏覽器實際做得到什麼，再拿那個當預期值。
 assert.equal(path.extname(video),'.'+await expectedFormat(p));assert.ok(fs.statSync(video).size>10000);
 // 無解碼支援要明確拒絕，不悄悄把動畫當成靜態圖片。
 const unsupported=await p.evaluate(async()=>{const d=window.ImageDecoder;window.ImageDecoder=undefined;try{await getOverlayGif(new File([A.overlays[0].file],'unsupported.gif'));return false;}catch(e){return /Edge/.test(e.message);}finally{window.ImageDecoder=d;}});assert.equal(unsupported,true);
 // 新建專案釋放所有 GIF ImageBitmap。
 const cleanup=await p.evaluate(()=>{const g=A.overlays[0]._gif;resetProject();return {closed:g.closed,frames:g.frames.length,bytes:_gifBytes,assets:_gifAssets.size};});assert.deepEqual(cleanup,{closed:true,frames:0,bytes:0,assets:0});
 assert.deepEqual(errors,[]);
 const report={browser:await b.version(),info,packedBytes:packed,video,checks:['timeline frames change','loop exact','backward seek deterministic','pause holds frame','playback animates','split phase continuous','undo redo','left trim phase','move phase','nvproj save/reopen','two saves and media rebinding','legacy missing offset','PNG unchanged','real video export','unsupported decoder error','GIF resources released'],errors};fs.writeFileSync(dir+'/result.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));await b.close();
})().catch(e=>{console.error(e);process.exit(1)});
