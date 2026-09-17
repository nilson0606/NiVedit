const { chromium } = require('playwright');
/* NiVedit 回歸測試 —— 用法見 tests/README.md
   node tests/<檔名>            結束碼 0 = 全過
   可用環境變數覆寫：NIVEDIT_HTML（要測的單檔 HTML）、
   NIVEDIT_CHROME（瀏覽器執行檔）、NIVEDIT_FIX（測試素材資料夾） */
const HTML   = process.env.NIVEDIT_HTML   || '/home/claude/NiVedit.html';
const CHROME = process.env.NIVEDIT_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const FIX    = process.env.NIVEDIT_FIX    || '/tmp/tv';

(async () => {
  const b = await chromium.launch({ executablePath: CHROME, args:['--no-sandbox','--autoplay-policy=no-user-gesture-required'] });
  const p = await (await b.newContext({viewport:{width:1500,height:950}})).newPage();
  const errs=[]; p.on('pageerror',e=>errs.push('ERR '+e.message));
  await p.goto(require('url').pathToFileURL(HTML).href);
  await p.waitForFunction(()=>typeof A!=='undefined'&&document.querySelector('#verTag').textContent!=='—');
  await p.setInputFiles('#fileAny',[FIX + '/t300.webm',FIX + '/t900.webm',FIX + '/m.mp3']);
  await p.waitForFunction(()=>A.clips.length===2&&A.musics.length===1,null,{timeout:60000});
  await p.evaluate(()=>{ setLang('zh'); A.sel={type:'clip',id:A.clips[1].id}; render(); refreshProp(); });
  await p.waitForTimeout(400);
  const zh0 = await p.evaluate(()=>document.querySelector('#app').innerText);
  await p.evaluate(()=>setLang('en')); await p.waitForTimeout(200);
  const en0 = await p.evaluate(()=>document.querySelector('#app').innerText);
  for(let i=0;i<5;i++){ await p.evaluate(()=>setLang('zh')); await p.waitForTimeout(120);
                        await p.evaluate(()=>setLang('en')); await p.waitForTimeout(120); }
  const en1 = await p.evaluate(()=>document.querySelector('#app').innerText);
  await p.evaluate(()=>setLang('zh')); await p.waitForTimeout(200);
  const zh1 = await p.evaluate(()=>document.querySelector('#app').innerText);
  console.log('切 10 次後 英文一致:', en0===en1);
  console.log('切 10 次後 中文一致:', zh0===zh1);
  if(zh0!==zh1){
    const a=zh0.split('\n'),c=zh1.split('\n');
    for(let i=0;i<Math.max(a.length,c.length);i++) if(a[i]!==c[i]) console.log('  行'+i+' 舊['+a[i]+'] 新['+c[i]+']');
  }
  // 效能：全頁掃描一次要多久
  const t = await p.evaluate(()=>{ const t0=performance.now(); for(let i=0;i<20;i++) i18nSweep(document.body); return (performance.now()-t0)/20; });
  console.log('整頁掃一次:', t.toFixed(2)+'ms');
  // 播放 2 秒看有沒有掉幀／爆錯
  await p.evaluate(()=>{ setLang('en'); seekTo(0); setPlaying(true); });
  await p.waitForTimeout(2500);
  const ph = await p.evaluate(()=>{ setPlaying(false); return A.playhead; });
  console.log('播放 2.5 秒後 playhead =', ph.toFixed(2));
  console.log('錯誤:', errs.length?errs.join('|'):'（無）');
  await b.close(); process.exit(0);
})();
