const {chromium}=require('playwright'),fs=require('fs'),http=require('http'),path=require('path');
const { VER } = require('./_ver.cjs');
const HTML=process.env.NIVEDIT_HTML,OUT=path.dirname(HTML);
(async()=>{
const srv=http.createServer((q,r)=>{r.setHeader('Content-Type','text/html; charset=utf-8');fs.createReadStream(HTML).pipe(r)});
await new Promise(r=>srv.listen(0,'127.0.0.1',r));
const b=await chromium.launch({executablePath:process.env.NIVEDIT_CHROME}),p=await(await b.newContext({viewport:{width:1500,height:1050},acceptDownloads:true})).newPage();
let count=0;const bad=[],errors=[];const chk=(name,v)=>{count++;if(!v)bad.push(name)};p.on('pageerror',e=>errors.push(e.message));
try{
await p.goto('http://127.0.0.1:'+srv.address().port);await p.waitForFunction(()=>typeof openSubEditor==='function');
chk('version',await p.textContent('#verTag')===VER);
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
/* ── 「＋ 字幕」兩選一（v11.9）────────────────────────────────
   以前這顆按鈕直接開檔案選取視窗，手打一句的唯一入口是「在字幕軌空白處連點兩下」，
   而那句話只寫在 tooltip 裡。現在按下去先問「新增一句」還是「匯入 SRT 檔」。 */
await p.evaluate(()=>{setLang('zh');A.subs=[];A.sel={type:'proj'};seekTo(1.4);render();refreshProp();});
await p.waitForTimeout(150);
const subs0=await p.evaluate(()=>A.subs.length);
await p.click('#btnAddSub');
await p.waitForSelector('#qmask.on',{timeout:3000});
const dlg=await p.evaluate(()=>({
  title:$('#qTitle').textContent.trim(),
  btns:[...$('#qBtns').querySelectorAll('button')].map(b=>b.textContent.trim()),
  pri:($('#qBtns').querySelector('button.pri')||{}).textContent,
  focused:document.activeElement&&document.activeElement.textContent
}));
chk('＋字幕：跳出兩選一，不是直接開檔案視窗',/新增字幕/.test(dlg.title)&&dlg.btns.length===3);
chk('＋字幕：兩條路都在選單上',dlg.btns.includes('新增一句')&&dlg.btns.includes('匯入 SRT 檔'));
chk('＋字幕：主要按鈕是「新增一句」且拿到焦點（Enter 直接選它）',
    (dlg.pri||'').trim()==='新增一句'&&(dlg.focused||'').trim()==='新增一句');

await p.keyboard.press('Enter');
await p.waitForFunction(n=>A.subs.length===n+1,subs0,{timeout:3000});
const made=await p.evaluate(()=>{const c=A.subs[A.subs.length-1];
  return {text:c.text,start:+c.start.toFixed(2),sel:A.sel.type==='sub'&&A.sel.id===c.id,
          blocks:document.querySelectorAll('.sblk').length,
          masked:$('#qmask').classList.contains('on'),undo:_undo.length>0};});
chk('＋字幕：Enter 就新增一句，視窗關掉',made.masked===false);
chk('＋字幕：生在播放頭位置',Math.abs(made.start-1.4)<0.05);
chk('＋字幕：預設文字是可以直接改的提示字',made.text==='在這裡輸入字幕');
chk('＋字幕：時間軸上真的出現方塊',made.blocks>0);
chk('＋字幕：自動選取，右側面板可以馬上打字',made.sel&&await p.locator('#sText').count()===1);
chk('＋字幕：吃得到復原',made.undo);
await p.evaluate(()=>undo());await p.waitForTimeout(200);
chk('＋字幕：復原後那一句不見了',await p.evaluate(()=>A.subs.length)===subs0);

/* Esc 取消：什麼都不該發生 —— 連檔案選取視窗都不可以被叫出來。 */
await p.click('#btnAddSub');
await p.waitForSelector('#qmask.on',{timeout:3000});
await p.keyboard.press('Escape');
await p.waitForTimeout(200);
chk('＋字幕：Esc 取消時不新增也不開檔案視窗',
    await p.evaluate(()=>A.subs.length)===subs0&&await p.evaluate(()=>!$('#qmask').classList.contains('on')));

await p.evaluate(()=>setLang('en'));await p.waitForTimeout(120);
await p.click('#btnAddSub');
await p.waitForSelector('#qmask.on',{timeout:3000});
const dlgEn=await p.evaluate(()=>[...$('#qBtns').querySelectorAll('button')].map(b=>b.textContent.trim()));
chk('＋字幕：英文介面下選項也翻譯了',dlgEn.includes('Type one')&&dlgEn.includes('Import an SRT file'));
await p.keyboard.press('Escape');await p.waitForTimeout(150);
await p.evaluate(()=>setLang('zh'));await p.waitForTimeout(120);

/* ── AI 字幕的「範圍」可以選音軌（v12.0）──────────────────────
   拖進來的 mp3／wav 是 A.musics，不在 A.clips 裡，以前完全辨識不到。
   模型下載要連外網，容器裡不跑；這裡驗的是【辨識以外】的每一段：
   下拉有沒有那個選項、抽音訊抽對範圍沒、字幕落在哪一軌、刪掉之後會不會亂指。 */
await p.setInputFiles('#fileAny',process.env.NIVEDIT_FIX+'/tone440.wav');
await p.waitForFunction(()=>A.musics.length===1,null,{timeout:30000});
await p.waitForTimeout(250);
const scope=await p.evaluate(()=>{
  const sel=$('#asrScope');
  return {opts:[...sel.querySelectorAll('option')].map(o=>o.textContent.trim()),
          groups:[...sel.querySelectorAll('optgroup')].map(g=>g.label),
          val:'music:'+A.musics[0].id};
});
chk('AI 字幕：範圍下拉多出音軌選項',scope.opts.some(t=>/^音軌 1 —/.test(t)));
chk('AI 字幕：音軌獨立成一個群組',scope.groups.includes('音軌'));

await p.selectOption('#asrScope',scope.val);
await p.waitForTimeout(200);
chk('AI 字幕：選了音軌之後 ASR.scope 跟著變',await p.evaluate(()=>ASR.scope)===scope.val);
chk('AI 字幕：選了音軌會出現那段說明',
    await p.evaluate(()=>/聽得到的那一段/.test($('#asrbox').textContent)));

/* 抽音訊：範圍要等於「時間軸上聽得到的那一段」，offset 要等於音軌的起點。 */
const ex=await p.evaluate(async()=>{
  const m=A.musics[0];
  m.startAt=1.5; m.autoLen=false; m.len=2; m.offset=0.5; m.loop=true; render();
  const r=await asrExtract16k('music:'+m.id,()=>{});
  return {offset:+r.offset.toFixed(3),dur:+r.dur.toFixed(3),
          secs:+(r.pcm.length/16000).toFixed(2),
          seg:+Math.min(m.len,musicSeg(m)).toFixed(3)};
});
chk('AI 字幕：音軌抽音訊的長度＝聽得到的那一段',Math.abs(ex.dur-ex.seg)<0.02&&Math.abs(ex.secs-ex.dur)<0.05);
chk('AI 字幕：循環的音軌只抽第一輪，不是整條時間軸',ex.dur<=2.001);
chk('AI 字幕：字幕時間以音軌的起點為基準',Math.abs(ex.offset-1.5)<0.01);

const bad1=await p.evaluate(async()=>{try{await asrExtract16k('music:nope',()=>{});return ''}catch(e){return e.message}});
chk('AI 字幕：音軌不見時錯誤訊息講的是音軌，不是「找不到那一段影片」',/找不到那一條音軌/.test(bad1));

await p.evaluate(()=>setLang('en'));await p.waitForTimeout(150);
const en=await p.evaluate(()=>({
  group:[...$('#asrScope').querySelectorAll('optgroup')].map(g=>g.label),
  hint:$('#asrbox').textContent}));
chk('AI 字幕：音軌群組名有翻譯',en.group.includes('Audio'));
chk('AI 字幕：音軌說明有翻譯',/bottom subtitle track/i.test(en.hint)&&!/聽得到的那一段/.test(en.hint));
await p.evaluate(()=>setLang('zh'));await p.waitForTimeout(150);

/* 選好的音軌被刪掉：範圍要自己落回「整支影片」，不能還指著不存在的東西。 */
await p.evaluate(()=>{A.musics=[];render();});
await p.waitForTimeout(250);
chk('AI 字幕：音軌被刪掉後範圍落回整支影片',await p.evaluate(()=>ASR.scope)==='all');
chk('AI 字幕：音軌沒了就不再有音軌群組',
    await p.evaluate(()=>$('#asrScope').querySelectorAll('optgroup').length)===0);

chk('no page errors',errors.length===0);
fs.writeFileSync(path.join(OUT,'subtitle-scope-results.json'),JSON.stringify({count,bad,errors},null,2));
console.log('subtitle-scope: '+(count-bad.length)+' / '+count);if(bad.length){console.log(bad);process.exitCode=1}
}finally{await b.close();await new Promise(r=>srv.close(r))}
})().catch(e=>{console.error(e);process.exit(1)});
