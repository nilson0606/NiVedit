const {chromium}=require('playwright'),fs=require('fs'),http=require('http'),path=require('path');
const { VER } = require('./_ver.cjs');
const HTML=process.env.NIVEDIT_HTML,OUT=path.dirname(HTML);
(async()=>{
const srv=http.createServer((q,r)=>{r.setHeader('Content-Type','text/html; charset=utf-8');fs.createReadStream(HTML).pipe(r)});
await new Promise(r=>srv.listen(0,'127.0.0.1',r));
const b=await chromium.launch({executablePath:process.env.NIVEDIT_CHROME}),p=await(await b.newContext({viewport:{width:1500,height:1050}})).newPage();
let count=0;const bad=[],errors=[];const chk=(name,v)=>{count++;if(!v)bad.push(name)};p.on('pageerror',e=>errors.push(e.message));
try{
await p.goto('http://127.0.0.1:'+srv.address().port);await p.waitForFunction(()=>typeof openSubEditor==='function');
chk('version',await p.textContent('#verTag')===VER);
await p.setInputFiles('#fileAny',process.env.NIVEDIT_FIX+'/t300.webm');await p.waitForFunction(()=>A.clips.length===1);
await p.evaluate(()=>{setLang('zh');A.subs=[{id:'old-ai',start:0,end:3,track:0,text:'原來的 AI 字幕'}];A.sel={type:'sub',id:'old-ai'};A.playhead=1;render();refreshProp();openSubEditor()});
await p.click('#eAdd');
const newId=await p.evaluate(()=>A.sel.id);
chk('new cue becomes editor selection',await p.evaluate(id=>_seSel===id&&$('#eList .scue.sel').dataset.id===id,newId));
chk('new textarea focused and placeholder selected',await p.evaluate(id=>document.activeElement.closest('.scue').dataset.id===id&&document.activeElement.selectionStart===0&&document.activeElement.selectionEnd===document.activeElement.value.length,newId));
await p.keyboard.insertText('手動新增的句子');
chk('typing edits only new cue',await p.evaluate(id=>A.subs.find(c=>c.id===id).text==='手動新增的句子'&&A.subs.find(c=>c.id==='old-ai').text==='原來的 AI 字幕',newId));
await p.click('#eClose');
chk('close syncs right textarea',await p.inputValue('#sText')==='手動新增的句子');
chk('same-track overlap explained',await p.locator('#subOverlapHint').count()===1);
await p.evaluate(()=>{seekTo(.1)});
await p.locator('[data-sub-id="'+newId+'"]').click();
chk('click retains correct id/text',await p.evaluate(id=>A.sel.id===id&&$('#sText').value==='手動新增的句子',newId));
chk('clicking cue does not also scrub playhead',await p.evaluate(()=>Math.abs(A.playhead-.1)<1e-8));
await p.click('#asrEdit');
chk('reopening follows timeline selection',await p.evaluate(id=>_seSel===id&&document.activeElement.closest('.scue').dataset.id===id,newId));
for(const theme of ['dark','light']){
await p.evaluate(theme=>setTheme(theme),theme);
await p.locator('#emask .modal').screenshot({path:path.join(OUT,'subtitle-edit-'+theme+'.png')});
}
await p.click('#eClose');
await p.selectOption('#sTrack','1');
chk('moving to other track clears overlap notice',await p.locator('#subOverlapHint').count()===0);
const visible=await p.evaluate(()=>{
const seen=[],orig=drawSubCue;drawSubCue=(cx,c)=>seen.push(c.text);drawSubs(document.createElement('canvas').getContext('2d'),1.5,320,180);drawSubCue=orig;return seen
});
chk('both tracks retain both texts',visible.includes('手動新增的句子')&&visible.includes('原來的 AI 字幕'));
await p.selectOption('#sTrack','0');
await p.locator('#sStart').fill('3.5');await p.locator('#sStart').dispatchEvent('input');await p.locator('#sStart').dispatchEvent('change');
// Keep cue valid through the normal end/start controls.
await p.locator('#sEnd').fill('6');await p.locator('#sEnd').dispatchEvent('input');await p.locator('#sEnd').dispatchEvent('change');
await p.locator('#sStart').fill('3.5');await p.locator('#sStart').dispatchEvent('input');await p.locator('#sStart').dispatchEvent('change');
chk('changing time updates overlap notice',await p.locator('#subOverlapHint').count()===0);
chk('project roundtrip keeps edited cue and AI original',await p.evaluate(async()=>{
const blob=await buildProjBlob();await projImportFile(new File([blob],'manual-sub.nvproj'));
return A.subs.some(c=>c.text==='手動新增的句子')&&A.subs.some(c=>c.text==='原來的 AI 字幕')
}));
// Opening/editor sorting must not reorder underlying cue priority; merging still uses chronological order.
const sortFacts=await p.evaluate(()=>{
A.subs=[{id:'late',track:0,start:1,end:3,text:'late'},{id:'early',track:0,start:0,end:2,text:'early'},{id:'other',track:1,start:.5,end:2,text:'other'}];
A.sel={type:'sub',id:'early'};render();refreshProp();openSubEditor();
return {data:A.subs.map(c=>c.id),rows:Array.from($('#eList').children).map(el=>el.dataset.id)}
});
chk('editor sorts only its view',sortFacts.data.join(',')==='late,early,other'&&sortFacts.rows.join(',')==='early,late');
await p.locator('.scue[data-id="early"] [data-a="merge"]').click();
chk('merge uses next chronological cue on same track',await p.evaluate(()=>A.subs.length===2&&A.subs.find(c=>c.id==='early').text==='early late'&&A.subs.some(c=>c.id==='other')));
await p.click('#eClose');
await p.evaluate(()=>{A.subs=[];A.sel={type:'clip',id:A.clips[0].id};A.playhead=0;render();refreshProp()});
await p.click('#asrEdit');await p.click('#eAdd');
chk('empty project subtitle list supports focused first cue',await p.evaluate(()=>A.subs.length===1&&document.activeElement.classList.contains('tx')&&_seSel===A.subs[0].id));
await p.keyboard.insertText('第一句');await p.click('#eAdd');await p.keyboard.insertText('第二句');
chk('repeated add focuses each new cue without changing earlier cue',await p.evaluate(()=>A.subs.length===2&&A.subs[0].text==='第一句'&&A.subs[1].text==='第二句'));
await p.click('#eClose');await p.evaluate(()=>setLang('en'));await p.waitForTimeout(150);
chk('overlap hint translated',await p.locator('#subOverlapHint').textContent().then(t=>t.startsWith('This cue overlaps')));
chk('user text not translated',await p.inputValue('#sText')==='第二句');
chk('no page errors',errors.length===0);
fs.writeFileSync(path.join(OUT,'subtitle-edit-results.json'),JSON.stringify({count,bad,errors},null,2));
console.log('subtitle-edit: '+(count-bad.length)+' / '+count);if(bad.length){console.log(bad);process.exitCode=1}
}finally{await b.close();await new Promise(r=>srv.close(r))}
})().catch(e=>{console.error(e);process.exit(1)});
