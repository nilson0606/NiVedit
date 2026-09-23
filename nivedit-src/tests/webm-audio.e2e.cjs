const {chromium}=require('playwright'),fs=require('fs'),path=require('path');const {pathToFileURL}=require('url');
const ROOT=process.env.NIVEDIT_ROOT||'D:/NiVedit',OUT=process.env.NIVEDIT_WEBM_OUT||ROOT+'/qa-webm-audio-V13.2',HTML=process.env.NIVEDIT_HTML||ROOT+'/NiVedit.html',BASE=process.env.NIVEDIT_BASELINE==='1';
(async()=>{const b=await chromium.launch({executablePath:process.env.NIVEDIT_CHROME||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'}),c=await b.newContext({viewport:{width:1500,height:1000},acceptDownloads:true}),p=await c.newPage();const checks=[],errors=[];p.on('pageerror',e=>errors.push(e.message));const check=(name,ok,detail)=>checks.push({name,ok:!!ok,detail});const raw=name=>fs.readFileSync(path.join(OUT,'fixtures',name));const payload=(name,type)=>({name,mimeType:type,buffer:raw(name)});const fresh=async()=>{await p.goto(pathToFileURL(HTML).href);await p.waitForFunction(()=>typeof A!=='undefined');await p.evaluate(()=>{setLang('zh');window.showSaveFilePicker=undefined;});};
const add=async(name,type,rename=name)=>p.evaluate(async({b64,name,type})=>{await addAnyFiles([new File([Uint8Array.from(atob(b64),c=>c.charCodeAt(0))],name,{type})]);return{audio:A.musics.length,video:A.clips.length,duration:A.musics[0]?.dur};},{b64:raw(name).toString('base64'),name:rename,type});
try{
 await fresh();check('音檔選擇器明確接受 WebM',(await p.locator('#fileAudio').getAttribute('accept')).split(',').includes('.webm'));
 for(const type of ['video/webm','','application/octet-stream','audio/webm']){
  await fresh();const state=await add('audio-opus.webm',type);check('Opus WebM 分流至音軌：'+(type||'空 MIME'),state.audio===1&&state.video===0&&state.duration>1.9,state);
 }
 if(!BASE){
 await fresh();let state=await add('audio-vorbis.webm','video/webm');check('Vorbis WebM 分流至音軌',state.audio===1&&state.video===0);
 await fresh();state=await add('audio-no-duration.webm','video/webm');check('缺少時長欄位的音訊 WebM',state.audio===1&&state.video===0&&state.duration>1.9,state);
 await fresh();state=await add('audio-unknown-size.webm','video/webm');check('未知 Segment 長度也能辨識純音訊',state.audio===1&&state.video===0);
 await fresh();state=await add('audio-opus.webm','video/webm','大寫音檔.WEBM');check('大寫副檔名和中文檔名',state.audio===1&&state.video===0);
 for(const type of ['video/webm','','audio/webm']){await fresh();state=await add('video.webm',type);check('WebM 有畫面保留影片軌：'+(type||'空 MIME'),state.video===1&&state.audio===0,state);}
 await fresh();await p.locator('#fileAny').setInputFiles(payload('audio-opus.webm','video/webm'));await p.waitForFunction(()=>A.musics.length+A.clips.length>0);check('左側選檔入口正確',await p.evaluate(()=>A.musics.length===1&&A.clips.length===0));
 await fresh();await p.evaluate(({b64})=>{const dt=new DataTransfer();dt.items.add(new File([Uint8Array.from(atob(b64),x=>x.charCodeAt(0))],'drop.webm',{type:'video/webm'}));document.dispatchEvent(new DragEvent('drop',{dataTransfer:dt,bubbles:true,cancelable:true}));},{b64:raw('audio-opus.webm').toString('base64')});await p.waitForFunction(()=>A.musics.length+A.clips.length>0);check('拖曳入口正確',await p.evaluate(()=>A.musics.length===1&&A.clips.length===0));
 await fresh();await p.click('#btnAddMusic');const chooser=p.waitForEvent('filechooser');await p.click('#muImport');await(await chooser).setFiles(payload('audio-no-duration.webm','video/webm'));await p.waitForFunction(()=>A.musics.length===1);check('＋音軌 → 匯入電腦音檔',await p.evaluate(()=>A.clips.length===0&&A.musics[0].dur>1.9));
 check('音訊可解碼且有聲音',await p.evaluate(async()=>{const a=new AudioContext();try{const d=await a.decodeAudioData(await A.musics[0].file.arrayBuffer());return d.duration>1.9&&Math.max(...d.getChannelData(0).subarray(0,48000))>.05;}finally{await a.close();}}));
 await p.evaluate(()=>undo());check('匯入可復原',await p.evaluate(()=>A.musics.length===0));await p.evaluate(()=>redo());check('匯入可重做',await p.evaluate(()=>A.musics.length===1&&Number.isFinite(A.musics[0].dur)&&A.musics[0].dur>1.9));
 check('nvproj 存檔重開保留 WebM 音軌',await p.evaluate(async()=>{const blob=await buildProjBlob();await projImportFile(new File([blob],'webm-audio.nvproj'));return A.clips.length===0&&A.musics.length===1&&A.musics[0].name.endsWith('.webm')&&Number.isFinite(A.musics[0].dur)&&A.musics[0].dur>1.9;}));
 await p.evaluate(async()=>{Object.assign(A.proj,{w:320,h:180,fps:20,bitrate:3});const canvas=document.createElement('canvas');canvas.width=320;canvas.height=180;canvas.getContext('2d').fillRect(0,0,320,180);await addImageFiles([new File([await new Promise(r=>canvas.toBlob(r))],'background.png',{type:'image/png'})]);A.clips[0].outP=2;Object.assign(A.musics[0],{len:2,autoLen:false,vol:1,fadeIn:0,fadeOut:0,loop:false});A.playhead=.5;render();refreshProp();});
 await p.screenshot({path:OUT+'/audio-dark.png'});await p.evaluate(()=>setTheme('light'));await p.screenshot({path:OUT+'/audio-light.png'});
 const download=p.waitForEvent('download',{timeout:120000});await p.click('#btnExport');const d=await download;const file=OUT+'/webm-audio-export.mp4';await d.saveAs(file);
 const audioResult=await p.evaluate(async b64=>{const ac=new AudioContext();try{const buf=await ac.decodeAudioData(Uint8Array.from(atob(b64),c=>c.charCodeAt(0)).buffer),data=buf.getChannelData(0);let sum=0;for(const v of data)sum+=v*v;return{duration:buf.duration,rms:Math.sqrt(sum/data.length)};}finally{await ac.close();}},fs.readFileSync(file).toString('base64'));
 check('實際 MP4 匯出含可解碼聲音',audioResult.duration>1.8&&audioResult.rms>.02,audioResult);
 await fresh();state=await add('legacy.mp3','audio/mpeg');check('既有 MP3 匯入保留',state.audio===1&&state.video===0);
 check('截斷／假標頭不誤判成音檔',await p.evaluate(async()=>{return await webmMediaKind(new File([new Uint8Array([0x1A,0x45,0xDF,0xA3])],'truncated.webm'))===null&&await webmMediaKind(new File(['not a webm'],'fake.webm'))===null;}));
 check('不能解碼的影片軌仍辨識為影片',await p.evaluate(async b64=>{const bytes=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));for(let i=0;i<bytes.length-5;i++)if(String.fromCharCode(...bytes.slice(i,i+5))==='V_VP9'){bytes.set([86,95,66,65,68],i);break;}return await webmMediaKind(new File([bytes],'unsupported.webm',{type:'video/webm'}))==='video';},raw('video.webm').toString('base64')));
 }
 check('無頁面錯誤',errors.length===0,errors);
}catch(e){check('測試執行',false,e.stack)}finally{await b.close()}
const report={passed:checks.filter(c=>c.ok).length,total:checks.length,checks,errors};fs.writeFileSync(OUT+'/'+(BASE?'baseline.json':'results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,total:report.total,failures:checks.filter(c=>!c.ok)},null,2));process.exitCode=checks.some(c=>!c.ok)?1:0;
})();
