const { chromium } = require('playwright');
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
  await new Promise(r => srv.listen(8926, r));
  const b = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await b.newContext({ viewport: { width: 1500, height: 980 }, acceptDownloads: true });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERR ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/google|WebGPU|favicon/.test(m.text())) errs.push('CONSOLE ' + m.text().slice(0, 140)); });
  await p.addInitScript(() => { window.showSaveFilePicker = undefined; }); // Test browser-download fallback; native save is covered separately.
  await p.goto('http://localhost:8926/NiVedit.html');
  await p.waitForFunction(() => typeof A !== 'undefined' && document.querySelector('#verTag').textContent !== '—');

  const ok = [], bad = [];
  const chk = (n, c) => (c ? ok : bad).push(n);
  chk('版本', await p.textContent('#verTag') === 'v11.8');

  await p.setInputFiles('#fileAny', [FIX + '/t300.webm', FIX + '/t900.webm', FIX + '/tone440.wav']);
  await p.waitForFunction(() => A.clips.length === 2 && A.musics.length === 1, null, { timeout: 60000 });
  await p.waitForTimeout(600);

  // 影片靜音，只留配樂；音軌鋪滿、不淡入淡出、不循環
  await p.evaluate(() => {
    A.clips.forEach(c => c.muted = true);
    const m = A.musics[0];
    m.startAt = 0; m.len = 9; m.autoLen = false; m.offset = 0;
    m.vol = 1; m.fadeIn = 0; m.fadeOut = 0; m.loop = false; m.xfade = 0;
    m.vk = [];
    render(); refreshProp();
  });
  await p.waitForTimeout(300);

  // ── 1. 沒有曲線時完全不影響 ──
  chk('沒有點時倍率恆為 1', await p.evaluate(() =>
    [0, 1, 3.5, 8].every(t => Math.abs(musicGainAt(A.musics[0], t) - 1) < 1e-9)));

  // ── 2. 插值公式 ──
  await p.evaluate(() => {
    A.musics[0].vk = [{t:1,v:1},{t:2,v:0.2},{t:4,v:0.2},{t:5,v:1}];
    render(); refreshProp();
  });
  const g = await p.evaluate(() => {
    const m = A.musics[0];
    return [0, 1, 1.5, 2, 3, 4, 4.5, 5, 8].map(t => +musicGainAt(m, t).toFixed(4));
  });
  chk('插值正確 ' + JSON.stringify(g),
      JSON.stringify(g) === JSON.stringify([1, 1, 0.6, 0.2, 0.2, 0.2, 0.6, 1, 1]));

  // ── 3. 預覽的 el.volume 跟公式一致 ──
  const pv = await p.evaluate(async () => {
    const m = A.musics[0], out = [];
    for (const t of [0.5, 1.5, 3, 4.5, 6]){
      A.playhead = t; syncMedia();
      out.push([t, +m.el.volume.toFixed(4), +(m.vol * musicGainAt(m, t)).toFixed(4)]);
    }
    return out;
  });
  chk('預覽音量吃到曲線 ' + JSON.stringify(pv), pv.every(r => Math.abs(r[1] - r[2]) < 0.002));

  // ── 4. 匯出路徑：實際算出來的音訊包絡要符合曲線 ──
  const env = await p.evaluate(async () => {
    const buf = await buildAudio(9);
    const sr = buf.sampleRate, ch = buf.getChannelData(0);
    const rms = t => {
      const a = Math.max(0, Math.round((t - 0.15) * sr)), z = Math.min(ch.length, Math.round((t + 0.15) * sr));
      let s = 0; for (let i = a; i < z; i++) s += ch[i] * ch[i];
      return Math.sqrt(s / Math.max(1, z - a));
    };
    const m = A.musics[0];
    const base = rms(1.5);                       // 這裡曲線 = 0.6，拿來當比例基準
    return [0.5, 1.5, 3, 4.5, 6].map(t =>
      [t, +(rms(t) / base * 0.6).toFixed(3), +musicGainAt(m, t).toFixed(3)]);
  });
  const envOK = env.every(r => Math.abs(r[1] - r[2]) < 0.06);
  chk('匯出音訊包絡符合曲線 ' + JSON.stringify(env), envOK);

  // ── 5. 存讀：曲線要進 .nvproj ──
  const kept = await p.evaluate(() => JSON.parse(snapshot()).musics[0].vk);
  chk('曲線有進 snapshot', JSON.stringify(kept) === JSON.stringify([{t:1,v:1},{t:2,v:0.2},{t:4,v:0.2},{t:5,v:1}]));

  // ── 6. 分割：兩半在接縫的音量要接得上 ──
  const sp = await p.evaluate(() => {
    A.sel = { type:'music', id:A.musics[0].id };
    A.playhead = 3; splitMusic();
    const [l, r] = A.musics;
    return { n: A.musics.length, left: +musicGainAt(l, 2.999).toFixed(3), right: +musicGainAt(r, 3.001).toFixed(3) };
  });
  chk('分割後接縫不跳 ' + JSON.stringify(sp), sp.n === 2 && Math.abs(sp.left - sp.right) < 0.01 && Math.abs(sp.left - 0.2) < 0.01);
  await p.keyboard.press('Control+z');
  await p.waitForTimeout(300);

  // ── 7. UI：雙擊加點、拖點、右鍵刪點 ──
  await p.evaluate(() => { A.musics[0].vk = []; A.sel = {type:'music',id:A.musics[0].id}; render(); refreshProp(); });
  await p.waitForTimeout(300);
  chk('沒有點時線是虛線', await p.$eval('.mblk .vkline', n => n.classList.contains('flat')));
  chk('曲線層不擋滑鼠', await p.$eval('.mblk .vkline', n => getComputedStyle(n).pointerEvents === 'none'));

  const box = await p.$eval('.mblk', n => { const r = n.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  await p.mouse.dblclick(box.x + box.w * 0.4, box.y + box.h / 2);
  await p.waitForTimeout(400);
  chk('雙擊加了一個點', await p.evaluate(() => A.musics[0].vk.length === 1));
  chk('加點提示是英文', /Point added/.test((await p.textContent('#toast')).trim()));

  const before = await p.evaluate(() => ({ ...A.musics[0].vk[0] }));
  const dot = await p.$eval('.mblk .vkd', n => { const r = n.getBoundingClientRect(); return { x: r.left + r.width/2, y: r.top + r.height/2 }; });
  await p.mouse.move(dot.x, dot.y);
  await p.mouse.down();
  await p.mouse.move(dot.x, dot.y + 20, { steps: 5 });
  await p.mouse.up();
  await p.waitForTimeout(300);
  const after = await p.evaluate(() => ({ ...A.musics[0].vk[0] }));
  chk('拖圓點把音量拉低了 ' + before.v.toFixed(2) + ' → ' + after.v.toFixed(2), after.v < before.v - 0.2);
  chk('拖圓點沒有把方塊移走', await p.evaluate(() => Math.abs(A.musics[0].startAt) < 1e-6));

  await p.keyboard.press('Control+z');
  await p.waitForTimeout(300);
  chk('Ctrl+Z 還原拖曳', Math.abs((await p.evaluate(() => A.musics[0].vk[0].v)) - before.v) < 0.01);

  const dot2 = await p.$eval('.mblk .vkd', n => { const r = n.getBoundingClientRect(); return { x: r.left + r.width/2, y: r.top + r.height/2 }; });
  await p.mouse.click(dot2.x, dot2.y, { button: 'right' });
  await p.waitForTimeout(400);
  chk('右鍵刪掉了點', await p.evaluate(() => A.musics[0].vk.length === 0));

  // 一般拖曳沒被破壞
  await p.mouse.move(box.x + box.w / 2, box.y + box.h / 2);
  await p.mouse.down();
  await p.mouse.move(box.x + box.w / 2 + 60, box.y + box.h / 2, { steps: 5 });
  await p.mouse.up();
  await p.waitForTimeout(300);
  chk('方塊照樣拖得動', await p.evaluate(() => A.musics[0].startAt > 0.2));
  await p.keyboard.press('Control+z');
  await p.waitForTimeout(300);
  chk('拖方塊之後 Ctrl+Z 一次就回到原位', await p.evaluate(() => Math.abs(A.musics[0].startAt) < 1e-6));
  // 只是點一下不該留下復原點
  const uN = await p.evaluate(() => _undo.length);
  await p.mouse.click(box.x + box.w / 2, box.y + box.h / 2);
  await p.waitForTimeout(250);
  chk('點一下不會亂存復原點', await p.evaluate(() => _undo.length) === uN);

  // ── 8. 真的匯出一次不會爆 ──
  await p.evaluate(() => {
    const m = A.musics[0];
    m.startAt = 0; m.len = 5; m.vk = [{t:0,v:1},{t:2,v:0.2},{t:4,v:1}];
    render();
  });
  const dl = p.waitForEvent('download', { timeout: 180000 });
  await p.click('#btnExport');
  const d = await dl;
  const size = fs.statSync(await d.path()).size;
  chk('匯出成功 ' + size + ' bytes', size > 1000);
  chk('無 JS 錯誤 ' + errs.slice(0, 2).join(' | '), errs.length === 0);

  console.log('通過 ' + ok.length + ' / ' + (ok.length + bad.length));
  if (bad.length) console.log('失敗:\n  ' + bad.join('\n  '));
  await b.close(); srv.close(); process.exit(bad.length ? 1 : 0);
})();
