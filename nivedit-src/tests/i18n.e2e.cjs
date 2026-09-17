const { chromium } = require('playwright');
const { VER } = require('./_ver.cjs');
/* NiVedit 回歸測試 —— 用法見 tests/README.md
   node tests/<檔名>            結束碼 0 = 全過
   可用環境變數覆寫：NIVEDIT_HTML（要測的單檔 HTML）、
   NIVEDIT_CHROME（瀏覽器執行檔）、NIVEDIT_FIX（測試素材資料夾） */
const HTML   = process.env.NIVEDIT_HTML   || '/home/claude/NiVedit.html';
const CHROME = process.env.NIVEDIT_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const FIX    = process.env.NIVEDIT_FIX    || '/tmp/tv';

const http = require('http'), fs = require('fs');
(async () => {
  const srv = http.createServer((q, r) => {
    r.setHeader('Content-Type', 'text/html; charset=utf-8'); r.writeHead(200);
    fs.createReadStream(HTML).pipe(r);
  });
  await new Promise(r => srv.listen(8920, r));
  const b = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const p = await (await b.newContext({ viewport: { width: 1500, height: 950 } })).newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERR ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/google|WebGPU|favicon/.test(m.text())) errs.push('CONSOLE ' + m.text().slice(0, 160)); });
  await p.goto('http://localhost:8920/NiVedit.html');
  await p.waitForFunction(() => typeof A !== 'undefined' && document.querySelector('#verTag').textContent !== '—');
  const ok = [], bad = [];
  const chk = (n, c) => (c ? ok : bad).push(n);

  // 1. 預設英文
  chk('版本', await p.textContent('#verTag') === VER);
  chk('語言鈕顯示 EN', (await p.textContent('#langBtn')).trim() === 'EN');
  chk('匯出鈕英文', (await p.textContent('#btnExport')).trim() === 'Export Video');
  chk('專案標頭英文', (await p.textContent('#projName')).includes('Untitled'));
  chk('drop 區英文', (await p.textContent('#drop')).includes('Drop video'));
  chk('分割鈕英文', (await p.textContent('#btnSplit')).trim() === '✂ Split clip');
  chk('title 屬性英文', (await p.getAttribute('#btnSplit', 'title')).includes('Split the selected clip at the playhead'));
  chk('文件標題英文', (await p.title()).includes('Web Video Editor'));
  chk('空狀態英文', (await p.textContent('#empty')).includes('Nothing here yet'));
  chk('屬性面板英文', (await p.textContent('#prop')).includes('Select a clip on the left'));
  chk('主題鈕英文', (await p.textContent('#themeBtn')).trim() === '☾ Night mode');
  chk('主題鈕 title 英文', (await p.getAttribute('#themeBtn','title')) === 'Switch to day mode');
  chk('預設夜間模式', await p.evaluate(() => document.documentElement.dataset.theme !== 'light'));
  const hdr = await p.textContent('header');
  chk('header 無中文', !/[一-鿿]/.test(hdr.replace('繁中', '')));

  // 2. 載入素材後
  await p.setInputFiles('#fileVideo', [FIX + '/t300.webm', FIX + '/t900.webm']);
  await p.waitForFunction(() => A.clips.length === 2, null, { timeout: 60000 });
  await p.click('.ci');
  await p.waitForTimeout(300);
  const prop = await p.textContent('#prop');
  chk('片段面板英文（Trim）', prop.includes('Trim'));
  chk('片段面板英文（Video framing）', prop.includes('Video framing'));
  chk('片段面板英文（Orientation）', prop.includes('Orientation'));
  chk('片段面板英文（Look）', prop.includes('Look'));
  const clipName = await p.textContent('.ci .t');
  chk('片段檔名沒被翻', clipName.includes('t300.webm'));

  // 第二段：轉場區
  await p.evaluate(() => { const n = document.querySelectorAll('.ci')[1]; n.click(); });
  await p.waitForTimeout(300);
  const prop2 = await p.textContent('#prop');
  chk('轉場（進入）英文', prop2.includes('Transition (into this clip)'));
  chk('轉場（離開）英文', prop2.includes('Transition (out of this clip)'));
  chk('內扣/外加英文', prop2.includes('Inside (use moving source frames)'));
  const opts = await p.$$eval('#cTrans option', ns => ns.map(n => n.textContent));
  chk('轉場選單英文', opts.includes('Cross dissolve') && opts.includes('Venetian blinds'));
  chk('轉場選單值不變', await p.$eval('#cTrans', n => n.value) === 'dissolve');

  // 3. toast（夾變數的訊息）
  await p.evaluate(() => toast('已匯入 12 句字幕（，另有 3 句時間碼格式有問題讀不進來'));
  await p.waitForTimeout(200);
  const t1 = await p.textContent('#toast');
  chk('組合訊息有翻到：' + t1.slice(0, 60), /Imported 12 subtitles/.test(t1));

  // 檔名保護
  await p.evaluate(() => toast('「開心輕快_40秒.mp3」載入失敗：瀏覽器無法解碼這個檔案'));
  await p.waitForTimeout(200);
  const t2 = await p.textContent('#toast');
  chk('「」內檔名不動：' + t2, t2.includes('開心輕快_40秒.mp3') && t2.includes('failed to load'));

  // 4. 時間碼不會被舊字蓋掉
  await p.evaluate(() => seekTo(1.5));
  await p.waitForTimeout(300);
  const ct = await p.textContent('#curTime');
  chk('時間碼正常 ' + ct, /^00:0?1\.\d$/.test(ct.trim()));

  // 5. 切回繁中
  await p.click('#langBtn');
  await p.waitForTimeout(400);
  chk('切繁中後按鈕=繁中', (await p.textContent('#langBtn')).trim() === '繁中');
  chk('切繁中後匯出鈕', (await p.textContent('#btnExport')).trim() === '匯出影片');
  chk('切繁中後 title', (await p.getAttribute('#btnSplit', 'title')) === '在播放頭切開目前選取的影片（快捷鍵 S）');
  chk('切繁中後面板', (await p.textContent('#prop')).includes('轉場（進入這一段）'));
  chk('切繁中後文件標題', (await p.title()).includes('網頁版影音編輯器'));
  chk('切繁中後主題鈕', (await p.textContent('#themeBtn')).trim() === '☾ 夜間模式');
  await p.click('#themeBtn'); await p.waitForTimeout(200);
  chk('切到白天模式（繁中）', (await p.textContent('#themeBtn')).trim() === '☀ 白天模式');
  await p.click('#langBtn'); await p.waitForTimeout(300);
  chk('白天模式下切英文', (await p.textContent('#themeBtn')).trim() === '☀ Day mode');
  await p.click('#themeBtn'); await p.waitForTimeout(200);
  await p.click('#langBtn'); await p.waitForTimeout(300);

  // 6. 切回英文
  await p.click('#langBtn');
  await p.waitForTimeout(400);
  chk('切回英文', (await p.textContent('#btnExport')).trim() === 'Export Video');
  chk('切回英文面板', (await p.textContent('#prop')).includes('Transition (into this clip)'));

  // 7. 記住選擇
  await p.click('#langBtn');   // -> zh
  await p.waitForTimeout(200);
  await p.reload();
  await p.waitForFunction(() => typeof A !== 'undefined' && document.querySelector('#verTag').textContent !== '—');
  chk('重新整理後記得繁中', (await p.textContent('#btnExport')).trim() === '匯出影片');
  await p.click('#langBtn');
  await p.waitForTimeout(200);
  await p.reload();
  await p.waitForFunction(() => typeof A !== 'undefined' && document.querySelector('#verTag').textContent !== '—');
  chk('重新整理後記得英文', (await p.textContent('#btnExport')).trim() === 'Export Video');

  // 8. 對話框
  await p.click('#btnProj');
  await p.waitForTimeout(600);
  const pm = await p.textContent('#pmask');
  chk('專案對話框英文', pm.includes('Export project file') && pm.includes('Clean up media'));


  // 9. 掃描沒有把 select 的 value 弄壞
  chk('無 JS 錯誤 ' + errs.slice(0, 2).join(' | '), errs.length === 0);

  console.log('通過 ' + ok.length + ' / ' + (ok.length + bad.length));
  if (bad.length) console.log('失敗:\n  ' + bad.join('\n  '));
  await b.close(); srv.close(); process.exit(bad.length ? 1 : 0);
})();
