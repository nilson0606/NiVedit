const {chromium}=require('playwright');
const assert=require('assert/strict');
const fs=require('fs'),path=require('path'),http=require('http'),crypto=require('crypto');
const {pathToFileURL}=require('url');
const {VER}=require('./_ver.cjs');
(async()=>{
 const workspace=process.env.NIVEDIT_WORKSPACE||path.resolve(__dirname,'../..');
 const html=process.env.NIVEDIT_HTML||path.join(workspace,'NiVedit.html');
 const out=path.join(path.dirname(html),'effects-qa');fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({executablePath:process.env.NIVEDIT_CHROME,headless:true});
 const errors=[],results=[];
 const check=(name,value)=>{assert.ok(value,name);results.push(name);console.log('PASS',name)};
 const server=http.createServer((req,res)=>{
   const rel=decodeURIComponent(req.url.split('?')[0]).replace(/^\/NiVedit\/?/,'');
   const file=rel?path.join(path.dirname(html),rel):html;
   if(!file.startsWith(path.dirname(html))||!fs.existsSync(file)){res.writeHead(404);return res.end();}
   res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.webp')?'image/webp':'text/html; charset=utf-8');res.end(fs.readFileSync(file));
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
  for(const [protocol,url] of [['file',pathToFileURL(html).href],['http','http://127.0.0.1:'+server.address().port+'/NiVedit/']]){
   const p=await browser.newPage({viewport:{width:1440,height:1000}});
   p.on('pageerror',e=>errors.push(e.message));
   const payloads=[];p.on('request',r=>{if(/animation-effects\/.*\.js/.test(r.url()))payloads.push(r.url())});
   await p.goto(url);await p.waitForFunction(v=>document.querySelector('#verTag').textContent===v,VER);
   await p.evaluate(()=>setLang('zh'));
   await p.locator('#fileImage').setInputFiles(path.join(workspace,'logo/NiVedit_icon.png'));
   await p.waitForFunction(()=>A.clips.length===1);
   check(protocol+': button renamed',(await p.locator('#btnAddOverlay').textContent()).includes('動畫效果'));
   await p.locator('#btnAddOverlay').click();
   check(protocol+': no GIF download just opening',payloads.length===0);
   check(protocol+': 240 choices, first 24 cards',await p.evaluate(()=>EFFECT_CATALOG.length===240&&document.querySelectorAll('.fx-card').length===24));
   await p.waitForFunction(()=>[...document.querySelectorAll('.fx-card img')].every(x=>x.complete&&x.naturalWidth>0));
   check(protocol+': posters loaded',true);
   await p.locator('#fxNext').click();check(protocol+': pagination',await p.evaluate(()=>FX.page===1));
   await p.locator('#fxPack').selectOption('shorts');
   check(protocol+': pack filter',await p.evaluate(()=>[...document.querySelectorAll('.fx-card')].every(x=>x.dataset.id.startsWith('shorts-'))&&FX.page===0));
   await p.locator('#fxPack').selectOption('');await p.locator('#fxSearch').fill('灑花');
   check(protocol+': Chinese search',(await p.locator('.fx-card').count())>0);
   await p.locator('#fxSearch').fill('confetti');check(protocol+': English search',(await p.locator('.fx-card').count())>0);
   await p.locator('#fxSearch').fill('nothing-matches-123');check(protocol+': no-results state',await p.locator('.fx-card').count()===0);
   await p.locator('#fxSearch').fill('');await p.locator('#fxCategory').selectOption('表情反應');
   check(protocol+': category filter',await p.evaluate(()=>[...document.querySelectorAll('.fx-card')].every(x=>EFFECT_CATALOG.find(e=>e.id===x.dataset.id).category==='表情反應')));
   await p.locator('#fxCategory').selectOption('');
   const undoBefore=await p.evaluate(()=>_undo.length);
   await p.locator('.fx-card').first().click();await p.waitForFunction(()=>FX.file&&document.querySelector('#fxPreview').complete);
   check(protocol+': preview uses no decoded timeline memory',await p.evaluate(()=>_gifBytes===0&&A.overlays.length===0));
   check(protocol+': one GIF loaded',payloads.length===1);
   await p.locator('#fxAdd').focus();await p.keyboard.press('Delete');await p.keyboard.press('s');await p.keyboard.press('Control+z');
   check(protocol+': dialog blocks timeline shortcuts',await p.evaluate(n=>A.clips.length===1&&A.overlays.length===0&&_undo.length===n,undoBefore));
   await p.screenshot({path:path.join(out,protocol+'-dark.png')});
   await p.evaluate(()=>{setLang('en');setTheme('light');});
   await p.waitForTimeout(200); // Wait for the editor's theme transition before visual QA.
   check(protocol+': English catalog',await p.evaluate(()=>document.querySelector('#fxName').textContent===EFFECT_CATALOG.find(e=>e.id===FX.selected).en));
   check(protocol+': English controls',(await p.locator('#fxAdd').textContent())==='Add to timeline');
   await p.screenshot({path:path.join(out,protocol+'-light.png')});
   await p.evaluate(()=>setLang('zh'));
   await p.locator('#fxAdd').click();await p.waitForFunction(()=>A.overlays.length===1&&!document.querySelector('#fxDialog').open);
   check(protocol+': animated timeline import',await p.evaluate(()=>A.overlays[0]._gif.frames.length>1&&_gifBytes>0));
   check(protocol+': split wording',(await p.locator('#btnSplit').textContent()).includes('動畫效果切割'));
   const frame=await p.evaluate(()=>{const cv=document.createElement('canvas');cv.width=320;cv.height=180;window.fxFrame=t=>{renderFrame(cv.getContext('2d'),t,320,180);return cv.toDataURL()};return [fxFrame(.2),fxFrame(.6)]});
   check(protocol+': animation renders changing frames',frame[0]!==frame[1]);
   await p.evaluate(()=>undo());check(protocol+': undo addition',await p.evaluate(()=>A.overlays.length===0));
   // Re-add the cached File after undo: pushUndo must not close the GIF held only by redo.
   await p.locator('#btnAddOverlay').click();await p.locator('.fx-card').first().click();await p.waitForFunction(()=>FX.file);
   await p.locator('#fxAdd').click();await p.waitForFunction(()=>A.overlays.length===1&&!document.querySelector('#fxDialog').open);
   check(protocol+': cached GIF survives replacing redo',await p.evaluate(()=>!A.overlays[0]._gif.closed&&fxFrame(.2)===fxFrame(.2)&&_redo.length===0));
   await p.evaluate(()=>{seekTo(.5);splitAtPlayhead()});
   check(protocol+': split preserves animation phase',await p.evaluate(()=>A.overlays.length===2&&A.overlays[1].gifOffset===.5));
   await p.evaluate(()=>undo());await p.evaluate(()=>redo());
   check(protocol+': redo split',await p.evaluate(()=>A.overlays.length===2&&!A.overlays[0]._gif.closed));
   const project=await p.evaluate(async()=>{window.fxPacked=await buildProjBlob();window.fxExpected=fxFrame(1);return fxPacked.size});
   check(protocol+': GIF is embedded in saved project',project>await p.evaluate(()=>A.overlays[0].file.size));
   // Block all library requests: reopening must be self contained.
   await p.route('**/animation-effects/**',r=>r.abort());
   await p.evaluate(async()=>projImportFile(new File([fxPacked],'effects-roundtrip.nvproj')));
   check(protocol+': project reopens without library requests',await p.evaluate(()=>A.overlays.length===2&&fxFrame(1)===fxExpected));
   await p.unroute('**/animation-effects/**');
   await p.locator('#btnAddOverlay').click();
   const chooser=p.waitForEvent('filechooser');await p.locator('#fxImport').click();
   await (await chooser).setFiles(path.join(workspace,'logo/NiVedit_icon.png'));await p.waitForFunction(()=>A.overlays.length===3);
   check(protocol+': own image import retained',await p.evaluate(()=>A.overlays[2]._gif===null));
   await p.locator('#fileOverlay').setInputFiles(path.join(workspace,'assets/boy_smile_sway.gif'));await p.waitForFunction(()=>A.overlays.length===4);
   check(protocol+': own GIF import retained',await p.evaluate(()=>A.overlays[3]._gif.frames.length===40));
   await p.evaluate(()=>resetProject());
   check(protocol+': project reset releases decoded GIFs',await p.evaluate(()=>_gifBytes===0));
   await p.locator('#fileImage').setInputFiles(path.join(workspace,'logo/NiVedit_icon.png'));await p.waitForFunction(()=>A.clips.length===1);
   await p.locator('#btnAddOverlay').click();
   await p.evaluate(()=>{const e=EFFECT_CATALOG.find(e=>e.pack==='wild');window.fxOriginalStem=e.stem;e.stem='missing-test-effect';});
   await p.locator('#fxPack').selectOption('wild');await p.locator('.fx-card').first().click();await p.locator('#fxRetry').waitFor({state:'visible'});
   check(protocol+': failure leaves project unchanged and Add disabled',await p.evaluate(()=>A.overlays.length===0&&document.querySelector('#fxAdd').disabled));
   await p.evaluate(()=>{EFFECT_CATALOG.find(e=>e.pack==='wild').stem=fxOriginalStem;});await p.locator('#fxRetry').click();await p.waitForFunction(()=>FX.file);
   check(protocol+': retry succeeds',true);
   await p.keyboard.press('Escape');await p.waitForFunction(()=>!document.querySelector('#fxDialog').open&&FX.url===null);
   check(protocol+': close frees preview URL',await p.evaluate(()=>FX.url===null&&FX.file===null));
   await p.locator('#btnAddOverlay').click();await p.setViewportSize({width:700,height:800});
   check(protocol+': narrow dialog stays inside viewport',await p.locator('#fxDialog').evaluate(d=>{const r=d.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth}));
   await p.screenshot({path:path.join(out,protocol+'-narrow.png')});
   await p.close();
  }
  // Verify every served payload byte-for-byte and decode every GIF, not only representative packs.
  const p=await browser.newPage();p.on('pageerror',e=>errors.push(e.message));
  await p.goto(pathToFileURL(html).href);await p.waitForFunction(v=>document.querySelector('#verTag').textContent===v,VER);
  const catalog=await p.evaluate(()=>EFFECT_CATALOG);
  for(const entry of catalog){
   const info=await p.evaluate(async id=>{
     const entry=EFFECT_CATALOG.find(e=>e.id===id), file=await loadEffectFile(entry);
     const bytes=new Uint8Array(await file.arrayBuffer());
     const g=await getOverlayGif(file);
     const result={frames:g.frames.length,duration:g.duration,bytes:Array.from(bytes)};
     closeGifAsset(g);return result;
   },entry.id);
   assert.equal(crypto.createHash('sha256').update(Buffer.from(info.bytes)).digest('hex'),entry.sha256);
   assert.equal(info.frames,entry.frames,entry.id+' frame count');assert.equal(info.duration,entry.duration*1000,entry.id+' duration');
  }
  check('all 240 payloads: hash, frame count, duration, file:// loading',true);
  check('browsing cache bounded, all test decodes released',await p.evaluate(()=>_effectFiles.size<=4&&_gifBytes===0));
  await p.close();
  assert.deepEqual(errors,[]);check('no page errors',true);
  fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify({version:VER,browser:browser.version(),passed:results.length,results},null,2));
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});
