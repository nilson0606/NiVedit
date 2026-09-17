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
  await new Promise(r => srv.listen(8925, r));
  const b = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const p = await (await b.newContext({ viewport: { width: 1500, height: 980 } })).newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERR ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/google|WebGPU|favicon/.test(m.text())) errs.push('CONSOLE ' + m.text().slice(0, 140)); });
  await p.goto('http://localhost:8925/NiVedit.html');
  await p.waitForFunction(() => typeof A !== 'undefined' && document.querySelector('#verTag').textContent !== '—');

  const ok = [], bad = [];
  const chk = (n, c) => (c ? ok : bad).push(n);
  const domOrder = () => p.evaluate(() => [...document.querySelectorAll('#tlinner .trk')].map(e => e.dataset.tk).join(','));
  const stateOrder = () => p.evaluate(() => A.proj.tracks.join(','));

  chk('版本', await p.textContent('#verTag') === 'v11.8');

  // 放點東西進去，讓每一軌都有高度
  fs.writeFileSync(FIX + '/tk.srt', '1\n00:00:01,000 --> 00:00:03,000\nhello\n');
  await p.setInputFiles('#fileAny', [FIX + '/t300.webm', FIX + '/t900.webm', FIX + '/m.mp3', FIX + '/tk.srt']);
  await p.waitForFunction(() => A.clips.length === 2 && A.musics.length === 1 && A.subs.length === 1, null, { timeout: 60000 });
  await p.evaluate(() => addTitle());
  await p.waitForTimeout(500);

  // 拖放區只收影片與聲音：丟圖片進來不該多出片段，而且要明說該用哪個按鈕。
  // 圖片仍然要先被挑出來，不然 .png 會落進「影片」那一堆去解碼，
  // 使用者看到的會是「瀏覽器無法解碼這個檔案」這種看不懂的錯。
  {
    const n = await p.evaluate(() => A.clips.length);
    await p.setInputFiles('#fileAny', FIX + '/pic1.png');
    await p.waitForFunction(() => /\+ Image/.test(document.querySelector('#toast').textContent),
                            null, { timeout: 8000 }).catch(() => {});
    chk('拖放圖片不會變成片段', await p.evaluate(() => A.clips.length) === n);
    chk('拖放圖片會提示改用按鈕', /\+ Image/.test(await p.textContent('#toast')));
    chk('拖放區不再收圖片', !(await p.$eval('#fileAny', el => el.accept)).includes('image/'));
    chk('拖放區文案只剩影片與聲音',
        /Drop video \/ audio/.test(await p.textContent('#drop')));
  }

  const names = await p.$$eval('#tlinner .tkname', ns => ns.map(n => n.textContent.trim()));
  chk('每一軌都有把手 ' + names.join('/'), names.length === 5);   // v11.8 多了圖片軌
  chk('把手名稱是英文', names.includes('Video') && names.includes('Audio'));
  chk('把手 tooltip 英文', (await p.$eval('#tlinner .tkname', n => n.title)) === 'Drag to reorder tracks');
  chk('把手吃得到滑鼠', await p.$eval('#tlinner .tkname', n => getComputedStyle(n).pointerEvents === 'auto'));
  chk('標籤本身仍不擋方塊', await p.$eval('#tlinner .trklb', n => getComputedStyle(n).pointerEvents === 'none'));

  const before = await stateOrder();
  chk('預設順序 ' + before, before === 'video,img,over,title,music');

  // ── 拖曳：把「音軌」（最下面）拉到最上面 ──
  const grab = async tk => {
    const h = await p.evaluateHandle(t => {
      const el = document.querySelector(`.trk[data-tk="${t}"] .tkname`);
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, tk);
    return await h.jsonValue();
  };
  const videoTop = await p.evaluate(() => document.querySelector('.trk[data-tk="video"]').getBoundingClientRect().top);
  let g = await grab('music');
  await p.mouse.move(g.x, g.y);
  await p.mouse.down();
  await p.mouse.move(g.x, g.y - 60, { steps: 6 });
  const midDrag = await domOrder();
  chk('拖曳中 DOM 已經即時讓位（' + midDrag + '）', midDrag !== 'video,over,title,music');
  chk('拖曳中資料還沒動（復原才吃得到舊值）', (await stateOrder()) === before);
  await p.mouse.move(g.x, videoTop + 4, { steps: 8 });
  await p.mouse.up();
  await p.waitForTimeout(300);

  const after = await stateOrder();
  // v11.8：影片軌固定 L1／L2，釘死在第一條；音軌最多只能排到第二。
  chk('放開後音軌排到影片下面 ' + after, after === 'video,music,img,over,title');
  chk('DOM 與資料一致', (await domOrder()) === after);
  const t1 = (await p.textContent('#toast')).trim();
  chk('有提示訊息且是英文：' + t1, /moved to position 1/.test(t1));

  // ── 復原 ──
  await p.keyboard.press('Control+z');
  await p.waitForTimeout(300);
  chk('Ctrl+Z 回到原順序', (await stateOrder()) === before && (await domOrder()) === before);

  // ── 只是輕點名稱（沒超過門檻）不該有動作 ──
  g = await grab('over');
  await p.mouse.move(g.x, g.y);
  await p.mouse.down();
  await p.mouse.move(g.x, g.y + 2);
  await p.mouse.up();
  await p.waitForTimeout(200);
  chk('輕點不算拖曳', (await stateOrder()) === before && (await domOrder()) === before);

  // ── ▲▼ 按鈕還能用 ──
  await p.evaluate(() => document.querySelector('.trk[data-tk="music"] .ord[data-mv="up"]').click());
  await p.waitForTimeout(300);
  chk('▲ 按鈕仍可用', (await stateOrder()) === 'video,img,over,music,title');
  await p.keyboard.press('Control+z');
  await p.waitForTimeout(300);

  // ── 拖曳沒有弄壞片段選取 ──
  await p.click('.trk[data-tk="video"] .blk');
  await p.waitForTimeout(300);
  chk('片段還是點得到', await p.evaluate(() => A.sel.type === 'clip'));

  // ── 存讀之後順序留著 ──
  // 舊專案沒有 img，而且可能把 video 排在別的位置：讀進來要把影片釘回第一、
  // 並且把圖片軌補在它「該在的位置」（影片之後），不能一律塞到最後變成 L5。
  await p.evaluate(() => { A.proj.tracks = ['music','video','over','sub','title']; applyTrackOrder(true); renderTimeline(); });
  await p.waitForTimeout(200);
  const kept = await p.evaluate(() => { const j = snapshot(); return JSON.parse(j).proj.tracks.join(','); });
  chk('舊專案順序遷移 ' + kept, kept === 'video,img,music,over,title');
  chk('舊專案的圖片軌補在影片之後而不是最後',
      await p.evaluate(() => layerOfTrack('img') === 3 && layerOfTrack('over') === 4 && layerOfTrack('title') === 5));

  /* ── 縮放滑桿要錨點縮放，不能每次都把捲軸拉到播放頭（v11.8）────
     以前是每次 input 都 followPlayhead(true)，往左拖（縮小）時播放頭的 x
     一直在變，捲軸就一直被重設 —— 使用者說「畫面抖動嚴重，尤其是拖到左邊」。
     驗法：把播放頭放在畫面中央，一路縮小，只要捲軸還沒到底，
     播放頭在視窗裡的 x 就不該移動。 */
  {
    /* v11.8 起縮放走 requestAnimationFrame 節流，所以每改一次值都要等一個畫格
       再讀 —— 不等的話 A.pps 根本還沒變，斷言會「因為什麼都沒發生」而通過。 */
    const frame = () => p.evaluate(() => new Promise(r =>
      requestAnimationFrame(() => requestAnimationFrame(r))));
    await p.evaluate(() => {
      const wrap = $('#tlwrap');
      A.pps = 300; $('#zoom').value = 300; renderTimeline();
      seekTo(6); wrap.scrollLeft = 6 * 300 - wrap.clientWidth / 2;
      window.phx = () => Math.round(A.playhead * A.pps - $('#tlwrap').scrollLeft);
    });
    const z = [await p.evaluate(() => phx())];
    for (const v of [260, 220, 180, 140]){
      await p.evaluate(v => { $('#zoom').value = v; $('#zoom').dispatchEvent(new Event('input')); }, v);
      await frame();
      z.push(await p.evaluate(() => $('#tlwrap').scrollLeft > 0 ? phx() : null));
    }
    const held = z.filter(x => x !== null);
    chk('縮放真的有生效（pps 跟著滑桿走）', await p.evaluate(() => A.pps) === 140);
    chk('縮放時播放頭釘在原位（' + z.join(',') + '）',
        held.length >= 3 && held.every(x => Math.abs(x - held[0]) <= 2));

    /* 拖曳時要節流：一連串事件在一個畫格裡只重畫一次。
       以前每個 input 都做一整套（重畫全部方塊＋逼預覽重繪＋兩次強制重排），
       大專案下拉桿卡成一格一格 —— 使用者說「拉伸 bar 自己都在跳動」。 */
    const thr = await p.evaluate(async () => {
      let n = 0; const orig = window.renderTimeline;
      window.renderTimeline = (...a) => { n++; return orig(...a); };
      const zz = $('#zoom');
      zz.dispatchEvent(new PointerEvent('pointerdown', { bubbles:true }));
      const t0 = performance.now();
      for (let v = 300; v >= 20; v -= 4){ zz.value = v; zz.dispatchEvent(new Event('input')); }
      const sync = performance.now() - t0;
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      zz.dispatchEvent(new PointerEvent('pointerup', { bubbles:true }));
      window.renderTimeline = orig;
      return { renders:n, sync };
    });
    chk('拖曳 70 次只重畫一兩次（實際 ' + thr.renders + '）', thr.renders <= 3);
    chk('拖曳期間不卡（同步耗時 ' + thr.sync.toFixed(1) + 'ms）', thr.sync < 50);

    /* 使用者的原話：「應該只要軌道縮放」。
       縮放不該碰到時間軸以外的任何東西 —— 預覽的大小與位置、時間軸區塊的高度、
       播放頭，全部都要原封不動。v11.8 以前 renderTimeline 會順手 markDirty
       （逼預覽重繪）並做高度貼合，於是上面的預覽也跟著閃。 */
    const still = await p.evaluate(async () => {
      const frame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      /* 三欄的寬度也要量。
         #center 以前是 flex-basis:auto，基準寬度＝內容寬度，而時間軸內容
         在 pps=400 時有兩萬多像素 —— 右側屬性欄會被壓到它的下限 210px。
         使用者的原話：「你右側藍會跳」「上左右都不要變才對，時間軸左右縮放就好」。 */
      const W = id => Math.round($(id).getBoundingClientRect().width);
      const snap = () => { const c = $('#preview').getBoundingClientRect(), t = $('#tl').getBoundingClientRect();
        return [Math.round(c.width), Math.round(c.height), Math.round(c.top),
                Math.round(t.height), +A.playhead.toFixed(3),
                W('#left'), W('#center'), W('#right')].join('/'); };
      seekTo(6); await frame();
      const first = snap(), seen = [first];
      const zz = $('#zoom');
      zz.dispatchEvent(new PointerEvent('pointerdown', { bubbles:true }));
      for (const v of [400, 200, 120, 60, 30, 12, 4]){   // 含最大倍率：內容寬度遠大於視窗
        zz.value = v; zz.dispatchEvent(new Event('input')); await frame(); seen.push(snap());
      }
      zz.dispatchEvent(new PointerEvent('pointerup', { bubbles:true })); await frame();
      seen.push(snap());
      return { same: seen.every(x => x === first), first, seen };
    });
    chk('縮放只動軌道：三欄寬度、預覽、時間軸高度、播放頭都不動', still.same);
    chk('縮放真的把內容撐得比視窗寬（不然上一條驗不到東西）',
        await p.evaluate(() => { $('#zoom').value = 400; $('#zoom').dispatchEvent(new Event('input'));
          return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(
            () => r($('#tlinner').scrollWidth > $('#tlwrap').clientWidth * 2)))); }));
  }

  chk('無 JS 錯誤 ' + errs.slice(0, 2).join(' | '), errs.length === 0);

  console.log('通過 ' + ok.length + ' / ' + (ok.length + bad.length));
  if (bad.length) console.log('失敗:\n  ' + bad.join('\n  '));
  await b.close(); srv.close(); process.exit(bad.length ? 1 : 0);
})();
