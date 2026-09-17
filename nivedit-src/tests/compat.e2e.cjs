/* CPU-only compatibility regression. Uses synthetic, redistributable HEVC media. */
const {chromium}=require('playwright'),fs=require('fs'),path=require('path'),http=require('http');
const {VER}=require('./_ver.cjs');
const HTML=process.env.NIVEDIT_HTML,ROOT=path.dirname(HTML),FIX=path.join(__dirname,'fixtures/compat-hevc.mp4');
const OUT=process.env.NIVEDIT_COMPAT_OUT||ROOT;
fs.mkdirSync(OUT,{recursive:true});
(async()=>{
let count=0;const failures=[],errors=[],facts={};
function check(n,v){count++;if(!v)failures.push(n)}
const server=http.createServer((q,r)=>{
 const f=path.resolve(ROOT,'.'+decodeURIComponent(new URL(q.url,'http://localhost').pathname.replace(/^\/NiVedit/,'')));
 if(!f.startsWith(ROOT+path.sep)){r.writeHead(403);r.end();return}
 fs.stat(f,(err,st)=>{
  if(err||!st.isFile()){r.writeHead(404);r.end();return}
  r.setHeader('Content-Type',f.endsWith('.html')?'text/html; charset=utf-8':f.endsWith('.js')?'text/javascript':'application/octet-stream');
  fs.createReadStream(f).pipe(r);
 });
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const b=await chromium.launch({executablePath:process.env.NIVEDIT_CHROME,args:['--disable-gpu','--disable-accelerated-video-decode']});
async function boot(url){
 const p=await b.newPage({viewport:{width:1400,height:1050},acceptDownloads:true});
 p.on('pageerror',e=>errors.push(e.message));
 await p.addInitScript(()=>localStorage.setItem('nv.lang','zh'));
 await p.goto(url);await p.waitForFunction(()=>typeof A!=='undefined');
 check('version '+url,await p.textContent('#verTag')===VER);
 return p;
}
async function finish(p){
 await p.waitForFunction(()=>!COMPAT.busy,null,{timeout:90000});
 if(!await p.evaluate(()=>!!COMPAT.result))throw new Error(await p.textContent('#compatStatus'));
}
try{
 for(const [mode,url] of [['file','file:///'+HTML.replace(/\\/g,'/')],['http','http://127.0.0.1:'+server.address().port+'/NiVedit/'+path.basename(HTML)]]){
 const p=await boot(url);
 check(mode+' lazy engine',await p.evaluate(()=>!_compatAssetPromise));
 await p.setInputFiles('#fileVideo',FIX);
 await p.waitForFunction(()=>A.clips.length===1);
 await p.waitForSelector('#compatNotice:not([hidden])');
 check(mode+' no decoded video',await p.evaluate(()=>A.clips[0].video.videoWidth===0));
 check(mode+' named warning',(await p.textContent('#compatWarning')).includes('compat-hevc.mp4'));
 await p.evaluate(()=>{A.clips[0].kf={x:[{t:1,v:0.8,e:'linear'}],motionRot:[{t:1,v:45,e:'linear'}]};A.clips[0].kfT=[0.1,0.9];A.clips[0].cropShape='circle';A.clips[0].cropSize=0.8;window.savedOriginal=serialize().st;window.originalFile=A.clips[0].file;});
 await p.evaluate(()=>startExport());
 check(mode+' export blocked',(await p.textContent('#mLog')).includes('compat-hevc.mp4'));
 check(mode+' export finishes failure state',await p.evaluate(()=>!A.exporting));
 await p.evaluate(()=>$('#mask').classList.remove('on'));
 await p.click('#compatFix');
 check(mode+' selected failed clip',await p.evaluate(()=>COMPAT.target===A.clips[0]));
 // Escape/Space must not operate the underlying editor.
 await p.keyboard.press('Space');
 check(mode+' modal blocks playback',await p.evaluate(()=>!A.playing));
 if(mode==='http'){
  await p.route('**/video-compat/ffmpeg-0.12.10.js',r=>r.abort());
  await p.click('#compatRun');await p.waitForFunction(()=>!COMPAT.busy);
  check('load failure actionable',(await p.textContent('#compatStatus')).includes('video-compat'));
  check('load failure preserves project',await p.evaluate(()=>JSON.stringify(serialize().st)===JSON.stringify(window.savedOriginal)));
  await p.unroute('**/video-compat/ffmpeg-0.12.10.js');
 }
 await p.click('#compatRun');
 if(mode==='file'){
  await p.waitForFunction(()=>!!COMPAT.worker,null,{timeout:60000});
  await p.click('#compatCancel');
  check('cancel stops worker',await p.evaluate(()=>!COMPAT.busy&&!COMPAT.worker));
  check('cancel preserves source',await p.evaluate(()=>A.clips[0].file===window.originalFile));
  await p.click('#compatRun');
 }
 await finish(p);
 check(mode+' real conversion output',await p.evaluate(()=>COMPAT.result.type==='video/mp4'&&COMPAT.result.size>1000));
 const [download]=await Promise.all([p.waitForEvent('download'),p.click('#compatDownload')]);
 await download.saveAs(path.join(OUT,mode+'-converted.mp4'));
 await p.click('#compatApply');await p.waitForFunction(()=>!COMPAT.busy);
 check(mode+' apply replaces source',await p.evaluate(()=>A.clips[0].file!==window.originalFile&&A.clips[0].video.videoWidth===320));
 const stable=await p.evaluate(()=>{
  const a={...window.savedOriginal.clips[0]},c={...serialize().st.clips[0]};
  for(const k of ['id','name','mediaKey','thumb','w','h']){delete a[k];delete c[k]}
  return JSON.stringify(a)===JSON.stringify(c);
 });
 check(mode+' editing settings retained',stable);
 check(mode+' marks unsaved',await p.evaluate(()=>_unsaved));
 await p.evaluate(()=>undo());
 check(mode+' undo restores exact original',await p.evaluate(()=>A.clips[0].file===window.originalFile));
 await p.evaluate(()=>redo());
 check(mode+' redo restores compatible video',await p.evaluate(()=>A.clips[0].video.videoWidth===320));
 await p.click('#compatClose');
 await p.waitForFunction(()=>$('#compatNotice').hidden);
 check(mode+' warning clears',await p.locator('#compatNotice').isHidden());
 // Full real serialization round-trip, including embedded video bytes.
 const round=await p.evaluate(async()=>{
  const original=serialize().st;
  const blob=await buildProjBlob();
  await projImportFile(new File([blob],'compatible-test.nvproj'));
  await onceReady(A.clips[0].video,5000,true);
  const restored=serialize().st;
  for(const state of [original,restored])for(const key of ['clips','musics','overlays'])for(const item of state[key])delete item.mediaKey;
  const normal=o=>Array.isArray(o)?o.map(normal):(o&&typeof o==='object'?Object.fromEntries(Object.keys(o).sort().map(k=>[k,normal(o[k])])):o);
  return{stateSame:JSON.stringify(normal(restored))===JSON.stringify(normal(original)),width:A.clips[0].video.videoWidth,clipDiff:[...new Set([...Object.keys(original.clips[0]),...Object.keys(restored.clips[0])])].filter(k=>JSON.stringify(original.clips[0][k])!==JSON.stringify(restored.clips[0][k])).map(k=>[k,original.clips[0][k],restored.clips[0][k]]),diffs:Object.keys(original).filter(k=>JSON.stringify(original[k])!==JSON.stringify(restored[k]))};
 });
 if(!round.stateSame)console.log('ROUNDTRIP_DIFF',round);
 check(mode+' save/reopen same edits',round.stateSame);check(mode+' save/reopen image decodes',round.width===320);
 await p.evaluate(async()=>{
  setLang('en');openCompatibilityTool(A.clips[0]);
 });
 check(mode+' English heading',await p.textContent('#compatHeading')==='Convert to compatible format');
 check(mode+' English help',!(await p.locator('#compatDialog').innerText()).match(/[㐀-鿿]/));
 await p.evaluate(()=>{document.documentElement.dataset.theme='light'});
 await p.waitForTimeout(200);await p.screenshot({path:path.join(OUT,mode+'-light.png')});
 await p.evaluate(()=>{document.documentElement.dataset.theme='dark'});
 await p.waitForTimeout(200);await p.screenshot({path:path.join(OUT,mode+'-dark.png')});
 await p.click('#compatClose');
 check(mode+' nearby seeks advance to the requested time',await p.evaluate(async()=>{
 const v=A.clips[0].video;A.exporting=true;
 try{await seekVideo(v,0.2);await seekVideo(v,0.23);return Math.abs(v.currentTime-0.23)<0.002}finally{A.exporting=false}
 }));
 // Actual export of the converted clip.
 await p.evaluate(()=>{setLang('zh');A.proj.w=320;A.proj.h=180;A.proj.fps=12;A.proj.bitrate=1;A.clips[0].outP=1;window.showSaveFilePicker=undefined});
 const exporting=p.waitForEvent('download',{timeout:90000});
 await p.evaluate(()=>startExport());
 // Export offers a download button rather than forcing it.
 const a=p.locator('#mDetail a[download], #mBtns a[download], #mask a[download]').first();
 if(await a.count())await a.click();
 else {
  const btn=p.getByText('下載影片',{exact:true});if(await btn.count())await btn.click();
 }
 const exp=await exporting;await exp.saveAs(path.join(OUT,mode+'-export.'+(exp.suggestedFilename().split('.').pop())));
 check(mode+' actual export downloaded',true);
 facts[mode]={download:download.suggestedFilename(),export:exp.suggestedFilename()};
 await p.close();
 }
 // Failure preservation: a stored clip is retained even if media emits error before metadata.
 const p=await boot('file:///'+HTML.replace(/\\/g,'/'));
 const kept=await p.evaluate(async()=>{
  const f=new File(['not a movie'],'broken.mp4',{type:'video/mp4'});
  const st={clips:[{id:'broken',name:f.name,kind:'video',mediaKey:'bad',dur:2,inP:0,outP:2,at:0,track:0,w:320,h:180}],musics:[],overlays:[],titles:[],subs:[],proj:{...A.proj}};
  await deserialize(st,new Map([['bad',f]]));
  return{count:A.clips.length,same:A.clips[0].file===f,problem:videoProblem(A.clips[0])};
 });
 check('failed project clip retained',kept.count===1&&kept.same&&kept.problem==='decode');
 // Invalid conversion leaves all edits intact and can retry.
 await p.evaluate(()=>{openCompatibilityTool(A.clips[0]);window.beforeInvalid=snapshot()});
 await p.click('#compatRun');await p.waitForFunction(()=>!COMPAT.busy,null,{timeout:60000});
 check('invalid file reports failure',(await p.textContent('#compatStatus')).includes('轉換失敗'));
 check('failure preserves edits',await p.evaluate(()=>snapshot()===window.beforeInvalid));
 await p.click('#compatClose');
 // Fresh imports which fail completely are offered to the standalone tool.
 await p.setInputFiles('#fileVideo',{name:'bad-input.mp4',mimeType:'video/mp4',buffer:Buffer.from('not a movie')});
 await p.waitForFunction(()=>$('#compatDialog').open);
 check('failed import offers original file',await p.evaluate(()=>COMPAT.file.name==='bad-input.mp4'&&!COMPAT.target));
 await p.close();
 check('no uncaught JavaScript errors',errors.length===0);
}finally{
 await b.close();await new Promise(r=>server.close(r));
 const result={count,passed:count-failures.length,failures,errors,facts};
 fs.writeFileSync(path.join(OUT,'compat-results.json'),JSON.stringify(result,null,2));
 console.log(JSON.stringify(result,null,2));if(failures.length)process.exitCode=1;
}
})().catch(e=>{console.error(e);process.exit(1)});
