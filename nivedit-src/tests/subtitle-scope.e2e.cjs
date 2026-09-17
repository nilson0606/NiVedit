const {chromium}=require('playwright'),fs=require('fs'),http=require('http'),path=require('path');
const HTML=process.env.NIVEDIT_HTML,OUT=path.dirname(HTML);
(async()=>{
const srv=http.createServer((q,r)=>{r.setHeader('Content-Type','text/html; charset=utf-8');fs.createReadStream(HTML).pipe(r)});
await new Promise(r=>srv.listen(0,'127.0.0.1',r));
const b=await chromium.launch({executablePath:process.env.NIVEDIT_CHROME}),p=await(await b.newContext({viewport:{width:1500,height:1050},acceptDownloads:true})).newPage();
let count=0;const bad=[],errors=[];const chk=(name,v)=>{count++;if(!v)bad.push(name)};p.on('pageerror',e=>errors.push(e.message));
try{
await p.goto('http://127.0.0.1:'+srv.address().port);await p.waitForFunction(()=>typeof openSubEditor==='function');
chk('version',await p.textContent('#verTag')==='v11.8');
await p.setInputFiles('#fileAny',process.env.NIVEDIT_FIX+'/t300.webm');await p.waitForFunction(()=>A.clips.length===1);
await p.evaluate(()=>{
setLang('zh');A.subs=[{id:'ai1',track:0,start:0,end:2,text:'AI字幕 电脑'},{id:'ai2',track:0,start:2,end:4,text:'AI第二句'}];
A.sel={type:'sub',id:'ai1'};A.playhead=1;render();refreshProp();
window.lowerOriginal=JSON.stringify(A.subs.filter(c=>subTrack(c)===0));openSubEditor();
});
chk('opening follows lower selected cue',await p.inputValue('#eTrack')==='0'&&await p.locator('.scue').count()===2);
await p.selectOption('#eTrack','1');
chk('empty upper shows no lower cues',await p.locator('.scue').count()===0&&await p.textContent('#eCount')==='0 句');
chk('empty upper gives add guidance',await p.locator('#eList').textContent().then(t=>t.includes('按「＋ 一句」')));
await p.click('#eClose');await p.click('#asrEdit');
chk('empty upper remains selected when reopened',await p.inputValue('#eTrack')==='1'&&await p.locator('.scue').count()===0);
await p.click('#eAdd');await p.keyboard.insertText('UPPER 电脑');
chk('add uses explicit upper target',await p.evaluate(()=>A.subs.filter(c=>c.track===1).length===1&&A.subs.find(c=>c.track===1).text==='UPPER 电脑'));
chk('new cue is focused and alone in editor',await p.evaluate(()=>document.activeElement.closest('.scue').dataset.id===A.subs.find(c=>c.track===1).id)&&await p.locator('.scue').count()===1);
chk('lower AI unchanged after upper add',await p.evaluate(()=>JSON.stringify(A.subs.filter(c=>subTrack(c)===0))===lowerOriginal));
await p.click('#eAdd');await p.keyboard.insertText('UPPER 第二句');
chk('repeated upper adds stay on upper',await p.evaluate(()=>A.subs.filter(c=>c.track===1).length===2)&&await p.locator('.scue').count()===2);
await p.fill('#eFind','UPPER');await p.fill('#eRepl','NEW');await p.click('#eRepl2');
chk('batch replace is scoped to upper',await p.evaluate(()=>A.subs.filter(c=>c.track===1).every(c=>c.text.startsWith('NEW'))&&JSON.stringify(A.subs.filter(c=>subTrack(c)===0))===lowerOriginal));
await p.click('#eTW');
chk('Traditional Chinese conversion does not touch lower AI',await p.evaluate(()=>A.subs.some(c=>c.track===1&&c.text.includes('電腦'))&&JSON.stringify(A.subs.filter(c=>subTrack(c)===0))===lowerOriginal));
await p.evaluate(async()=>{
window.ensureDir=async()=>null;window.savedSrt=null;window.srtOptions=null;
window.showSaveFilePicker=async options=>{srtOptions=options;const root=await navigator.storage.getDirectory(),fh=await root.getFileHandle(options.suggestedName,{create:true});savedSrt=fh;return fh};
});
await p.click('#eSrt');await p.waitForFunction(()=>savedSrt!==null);await p.waitForFunction(async()=>(await savedSrt.getFile()).size>0);
chk('native SRT contains only selected upper cues',await p.evaluate(async()=>{const s=await(await savedSrt.getFile()).text();return s.includes('NEW')&&!s.includes('AI')&&srtOptions.suggestedName.endsWith('_upper.srt')}));
await p.evaluate(()=>window.showSaveFilePicker=undefined);
const [dl]=await Promise.all([p.waitForEvent('download'),p.click('#eSrt')]);
const fallback=fs.readFileSync(await dl.path(),'utf8');
chk('fallback SRT also stays on upper',fallback.includes('NEW')&&!fallback.includes('AI')&&dl.suggestedFilename().endsWith('_upper.srt'));
for(const theme of ['dark','light']){
await p.evaluate(theme=>setTheme(theme),theme);
await p.locator('#emask .modal').screenshot({path:path.join(OUT,'upper-only-'+theme+'.png')});
}
await p.selectOption('#eTrack','0');
chk('switching lower shows only AI cues',await p.locator('.scue').count()===2&&await p.locator('#eList').textContent().then(t=>!t.includes('NEW')));
await p.evaluate(()=>window.upperBeforeLowerEdit=JSON.stringify(A.subs.filter(c=>c.track===1)));
await p.fill('#eFind','AI');await p.fill('#eRepl','LOW');await p.click('#eRepl2');
chk('lower batch edits preserve upper',await p.evaluate(()=>A.subs.filter(c=>subTrack(c)===0).every(c=>c.text.startsWith('LOW'))&&JSON.stringify(A.subs.filter(c=>c.track===1))===upperBeforeLowerEdit));
await p.evaluate(()=>{undo();renderSubEditor()});
chk('undo restores only edited lower text',await p.evaluate(()=>JSON.stringify(A.subs.filter(c=>subTrack(c)===0))===lowerOriginal));
await p.selectOption('#eTrack','1');
p.once('dialog',d=>d.dismiss());await p.click('#eClear');
chk('cancel clear leaves both tracks',await p.evaluate(()=>A.subs.length===4));
p.once('dialog',d=>d.accept());await p.click('#eClear');
chk('clear deletes only upper',await p.evaluate(()=>A.subs.length===2&&JSON.stringify(A.subs.filter(c=>subTrack(c)===0))===lowerOriginal)&&await p.locator('.scue').count()===0);
await p.evaluate(()=>{undo();renderSubEditor()});
chk('undo restores upper after scoped clear',await p.locator('.scue').count()===2&&await p.evaluate(()=>A.subs.length===4));
await p.locator('.scue .subTrackSelect').first().selectOption('0');
chk('moving a cue out removes it from visible upper list',await p.locator('.scue').count()===1&&await p.evaluate(()=>A.subs.filter(c=>c.track===1).length===1));
await p.click('#eAdd');await p.keyboard.insertText('STILL UPPER');
chk('add still uses upper after moving a cue to lower',await p.evaluate(()=>A.subs.find(c=>c.text==='STILL UPPER').track===1));
await p.click('#eClose');await p.locator('[data-sub-id="ai1"]').click();await p.click('#asrEdit');
chk('timeline lower selection opens lower editor',await p.inputValue('#eTrack')==='0');
await p.click('#eClose');
const upperId=await p.evaluate(()=>A.subs.find(c=>c.text==='STILL UPPER').id);
await p.locator('[data-sub-id="'+upperId+'"]').click();await p.click('#asrEdit');
chk('timeline upper selection opens upper editor',await p.inputValue('#eTrack')==='1');
await p.evaluate(()=>setLang('en'));await p.waitForTimeout(120);
chk('track selector and scope help translated',await p.locator('label[for=eTrack]').textContent()==='Editing track'&&await p.locator('#eTrack option[value="1"]').textContent()==='Top subtitles');
await p.click('#eClose');
chk('project roundtrip preserves both tracks',await p.evaluate(async()=>{
const before=A.subs.map(c=>({text:c.text,track:subTrack(c)}));const blob=await buildProjBlob();await projImportFile(new File([blob],'scoped.nvproj'));
return JSON.stringify(A.subs.map(c=>({text:c.text,track:subTrack(c)})))===JSON.stringify(before)
}));
chk('no page errors',errors.length===0);
fs.writeFileSync(path.join(OUT,'subtitle-scope-results.json'),JSON.stringify({count,bad,errors},null,2));
console.log('subtitle-scope: '+(count-bad.length)+' / '+count);if(bad.length){console.log(bad);process.exitCode=1}
}finally{await b.close();await new Promise(r=>srv.close(r))}
})().catch(e=>{console.error(e);process.exit(1)});
