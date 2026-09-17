const {chromium}=require('playwright');
const assert=require('assert/strict'),fs=require('fs'),path=require('path'),http=require('http');
const {pathToFileURL}=require('url');
const {VER}=require('./_ver.cjs');
(async()=>{
 const ws=process.env.NIVEDIT_WORKSPACE||path.resolve(__dirname,'../..'),html=process.env.NIVEDIT_HTML||path.join(ws,'NiVedit.html');
 const out=path.join(path.dirname(html),'music-example-qa');fs.mkdirSync(out,{recursive:true});
 const results=[],errors=[];const check=(n,c)=>{assert.ok(c,n);results.push(n);console.log('PASS',n)};
 const server=http.createServer((req,res)=>{const rel=decodeURIComponent(req.url.split('?')[0]).replace(/^\/NiVedit\/?/,'');const f=rel?path.join(path.dirname(html),rel):html;
 if(!f.startsWith(path.dirname(html))||!fs.existsSync(f)){res.writeHead(404);return res.end();}
 res.setHeader('Content-Type',f.endsWith('.js')?'application/javascript':f.endsWith('.zip')?'application/zip':'text/html; charset=utf-8');res.end(fs.readFileSync(f));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const b=await chromium.launch({executablePath:process.env.NIVEDIT_CHROME,headless:true,args:['--autoplay-policy=no-user-gesture-required']});
 try{
 for(const [protocol,url] of [['file',pathToFileURL(html).href],['http','http://127.0.0.1:'+server.address().port+'/NiVedit/']]){
 const p=await b.newPage({viewport:{width:1440,height:1000}});p.on('pageerror',e=>errors.push(e.message));
 const requests=[];p.on('request',r=>{if(/(background-music|example-project)\/.*\.js/.test(r.url()))requests.push(r.url())});
 await p.goto(url);await p.waitForFunction(v=>document.querySelector('#verTag').textContent===v,VER);
 await p.evaluate(()=>setLang('zh'));
 await p.locator('#fileImage').setInputFiles(path.join(ws,'logo/NiVedit_icon.png'));await p.waitForFunction(()=>A.clips.length===1);
 await p.evaluate(()=>openMusicLibrary());
 check(protocol+': no asset downloaded before selection',requests.length===0);
 check(protocol+': 40 tracks, 4 equal categories',await p.evaluate(()=>MUSIC_CATALOG.length===40&&MUSIC_CATEGORIES.length===4&&MUSIC_CATEGORIES.every(c=>MUSIC_CATALOG.filter(e=>e.category===c.id).length===10)));
 check(protocol+': new pack and download selected',await p.evaluate(()=>MUSIC_PACK.version==='v2'&&MUSIC_CATALOG.every(x=>x.id.startsWith('v2-')&&x.duration===40)&&document.querySelector('#muPackDownload').download==='NiVedit_Music_40_40s_v2.zip'));
 check(protocol+': ten cards per page',await p.locator('.mu-card').count()===10);
 await p.locator('#muNext').click();check(protocol+': next page',await p.evaluate(()=>MU.page===1));
 await p.locator('#muCategory').selectOption('cinematic');check(protocol+': category filter',await p.evaluate(()=>MU.page===0&&[...document.querySelectorAll('.mu-card')].every(c=>c.dataset.id.endsWith('cinematic'))));
 await p.locator('#muCategory').selectOption('');await p.locator('#muSearch').fill('pop');check(protocol+': style search',await p.locator('.mu-card').count()>0);
 await p.locator('#muSearch').fill('今天好心情');check(protocol+': Chinese title search',await p.locator('.mu-card').count()===1);
 await p.locator('#muSearch').fill('nothingmatches123');check(protocol+': empty results',await p.locator('.mu-card').count()===0);
 await p.locator('#muSearch').fill('');
 const undo=await p.evaluate(()=>_undo.length);
 await p.locator('.mu-card').first().click();await p.waitForFunction(()=>MU.file&&document.querySelector('#muAudio').readyState>=1);
 check(protocol+': preview does not add or change undo',await p.evaluate(n=>A.musics.length===0&&_undo.length===n,undo));
 await p.evaluate(()=>document.querySelector('#muAudio').play());check(protocol+': audition plays',await p.locator('#muAudio').evaluate(a=>!a.paused));
 await p.locator('#muAdd').focus();await p.keyboard.press('Delete');await p.keyboard.press('s');await p.keyboard.press('Control+z');
 check(protocol+': timeline shortcuts blocked',await p.evaluate(n=>A.clips.length===1&&A.musics.length===0&&_undo.length===n,undo));
 await p.screenshot({path:path.join(out,protocol+'-music-dark.png')});
 await p.evaluate(()=>{setLang('en');setTheme('light')});await p.waitForTimeout(200);
 check(protocol+': English title',await p.evaluate(()=>document.querySelector('#muName').textContent===MUSIC_CATALOG[0].en));
 await p.screenshot({path:path.join(out,protocol+'-music-light.png')});
 await p.locator('#muAdd').click();await p.waitForFunction(()=>A.musics.length===1&&!document.querySelector('#muDialog').open);
 check(protocol+': import retains duration/defaults, releases audition',await p.evaluate(()=>Math.abs(A.musics[0].el.duration-40)<.1&&A.musics[0].vol===.5&&A.musics[0].loop&&MU.url===null&&document.querySelector('#muAudio').paused));
 await p.evaluate(()=>undo());check(protocol+': undo track',await p.evaluate(()=>A.musics.length===0));
 await p.evaluate(()=>redo());check(protocol+': redo track',await p.evaluate(()=>A.musics.length===1));
 await p.evaluate(async()=>{window.musicPacked=await buildProjBlob();await projImportFile(new File([musicPacked],'music-roundtrip.nvproj'));});
 check(protocol+': music embedded and reopened',await p.evaluate(()=>A.musics.length===1&&A.musics[0].file.size===MUSIC_CATALOG[0].bytes));
 await p.evaluate(()=>openMusicLibrary());const chooser=p.waitForEvent('filechooser');await p.locator('#muImport').click();
 await (await chooser).setFiles(path.join(process.env.NIVEDIT_FIX,'tone440.wav'));await p.waitForFunction(()=>A.musics.length===2);
 check(protocol+': local audio chooser retained',true);
 await p.evaluate(()=>openMusicLibrary());await p.evaluate(()=>{window.savedStem=MUSIC_CATALOG[39].stem;MUSIC_CATALOG[39].stem='missing-test-music';});
 await p.locator('#muSearch').fill('Until next time');await p.locator('.mu-card').click();await p.locator('#muRetry').waitFor({state:'visible'});
 check(protocol+': failure does not add track',await p.evaluate(()=>A.musics.length===2&&document.querySelector('#muAdd').disabled));
 await p.evaluate(()=>MUSIC_CATALOG[39].stem=savedStem);await p.locator('#muRetry').click();await p.waitForFunction(()=>MU.file);
 check(protocol+': retry works',true);
 await p.keyboard.press('Escape');await p.waitForFunction(()=>!document.querySelector('#muDialog').open&&MU.url===null);
 await p.evaluate(()=>setLang('zh'));const before=await p.evaluate(()=>JSON.stringify(serialize().st));
 const demoRequests=()=>requests.filter(x=>x.includes('example-project')).length;
 await p.locator('#btnExample').click();
 check(protocol+': reminder says 720p and 4K and independent save',await p.locator('#demoDialog').evaluate(d=>/720p/.test(d.textContent)&&/4K/.test(d.textContent)&&/內建範例不會被修改/.test(d.textContent)));
 check(protocol+': opening reminder does not download example',demoRequests()===0);
 await p.screenshot({path:path.join(out,protocol+'-example-notice.png')});
 await p.locator('#demoCancel').click();check(protocol+': cancel retains timeline',await p.evaluate(s=>JSON.stringify(serialize().st)===s,before));
 await p.locator('#btnExample').click();await p.locator('#demoStart').click();
 await p.waitForFunction(()=>!DEMO.busy&&DEMO.file&&!document.querySelector('#mask').classList.contains('on'),null,{timeout:60000});
 check(protocol+': example contains all five types and 720p video',await p.evaluate(()=>A.clips.length===1&&A.titles.length===1&&A.subs.length===2&&A.overlays.length===1&&A.musics.length===1&&A.clips[0].video.videoWidth===1280&&A.clips[0].video.videoHeight===720));
 check(protocol+': example has no writable file handle',await p.evaluate(()=>_fh===null&&_curProj.name==='NiVedit_範例練習'));
 // Mock only native picker/handle, run real serialization, writer, rebind and subsequent save.
 await p.evaluate(()=>{
  window.savedFiles=[];window.pickerCalls=0;
  window.showSaveFilePicker=async opts=>{
   ++pickerCalls;window.lastSuggested=opts.suggestedName;
   const rec={name:'my-example-'+pickerCalls+'.nvproj',blob:null,writes:0};
   const h={name:rec.name,kind:'file',getFile:async()=>new File([rec.blob],rec.name),
    createWritable:async()=>({write:async blob=>{rec.blob=new Blob([await blob.arrayBuffer()]);rec.writes++},close:async()=>{}})};
   savedFiles.push({rec,h});return h;
  };
  window.originalTitle=A.titles[0].text;pushUndo();A.titles[0].text='MY EDITED EXAMPLE';
 });
 await p.locator('#btnProjSave').click();await p.waitForFunction(()=>savedFiles.length===1&&savedFiles[0].rec.writes===1&&_fh===savedFiles[0].h);
 check(protocol+': first Save chooses a new file',await p.evaluate(()=>pickerCalls===1&&lastSuggested==='NiVedit_範例練習.nvproj'&&_curProj.name==='my-example-1'));
 await p.evaluate(()=>document.querySelector('#mask').classList.remove('on'));
 await p.evaluate(async()=>{pushUndo();A.titles[0].text='SECOND EDIT';await dirSave(false)});
 check(protocol+': next Save updates only user file',await p.evaluate(()=>pickerCalls===1&&savedFiles[0].rec.writes===2));
 await p.evaluate(()=>document.querySelector('#mask').classList.remove('on'));
 await p.locator('#btnProjSaveAs').click();await p.waitForFunction(()=>savedFiles.length===2&&savedFiles[1].rec.writes===1);
 check(protocol+': Save As creates another user file',await p.evaluate(()=>pickerCalls===2&&_fh===savedFiles[1].h));
 await p.evaluate(()=>document.querySelector('#mask').classList.remove('on'));
 await p.locator('#btnExample').click();check(protocol+': reminder shown again for cached example',await p.locator('#demoDialog').evaluate(d=>d.open));
 await p.locator('#demoStart').click();await p.waitForFunction(()=>!DEMO.busy&&_fh===null);
 check(protocol+': original example survives edit/save/save-as',await p.evaluate(async()=>{
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await DEMO.file.arrayBuffer())),x=>x.toString(16).padStart(2,'0')).join('');
 return A.titles[0].text===originalTitle&&digest===EXAMPLE_PROJECT.sha256;
 }));
 await p.evaluate(async()=>projImportFile(await savedFiles[0].h.getFile(),savedFiles[0].h));
 check(protocol+': user saved file reopens with changes and all media',await p.evaluate(()=>A.titles[0].text==='SECOND EDIT'&&A.overlays[0]._gif.frames.length>1&&A.clips[0].video.videoWidth===1280&&A.musics[0].el.duration>0));
 await p.close();
 }
 const p=await b.newPage();await p.goto(pathToFileURL(html).href);await p.waitForFunction(()=>typeof MUSIC_CATALOG!=='undefined');
 const decoded=await p.evaluate(async()=>{
 const ctx=new AudioContext(),out=[];
 for(const e of MUSIC_CATALOG){const f=await loadMusicFile(e),bytes=await f.arrayBuffer();
 const sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
 const a=await ctx.decodeAudioData(bytes),x=a.getChannelData(0);let sum=0,peak=0;for(const s of x){sum+=s*s;peak=Math.max(peak,Math.abs(s))}
 out.push({id:e.id,sha,duration:a.duration,channels:a.numberOfChannels,rms:Math.sqrt(sum/x.length),peak,valid:sha===e.sha256});}
 await ctx.close();return out;
 });
 check('all 40 files decode, have unique hashes, stereo 40 seconds and non-silent unclipped audio',decoded.length===40&&new Set(decoded.map(x=>x.sha)).size===40&&decoded.every(x=>x.valid&&Math.abs(x.duration-40)<.002&&x.channels===2&&x.rms>.02&&x.peak<.96));
 fs.writeFileSync(path.join(out,'decoded-music.json'),JSON.stringify(decoded,null,2));
 check('no browser JavaScript errors',errors.length===0);
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({version:VER,passed:results.length,results,errors},null,2));
 console.log('TOTAL',results.length);
 }finally{await b.close();await new Promise(r=>server.close(r))}
})().catch(e=>{console.error(e);process.exitCode=1});
