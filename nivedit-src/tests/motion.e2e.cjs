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
  await new Promise(r => srv.listen(8928, r));
  const b = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await b.newContext({ viewport: { width: 1500, height: 980 }, acceptDownloads: true });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERR ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/google|WebGPU|favicon/.test(m.text())) errs.push('CONSOLE ' + m.text().slice(0, 140)); });
  await p.addInitScript(() => { window.showSaveFilePicker = undefined; }); // Test browser-download fallback; native save is covered separately.
  await p.goto('http://localhost:8928/NiVedit.html');
  await p.waitForFunction(() => typeof A !== 'undefined' && document.querySelector('#verTag').textContent !== '—');

  const ok = [], bad = [];
  const chk = (n, c) => (c ? ok : bad).push(n);
  chk('版本', await p.textContent('#verTag') === 'v11.8');

  await p.setInputFiles('#fileAny', [FIX + '/t300.webm']);
  await p.waitForFunction(() => A.clips.length === 1, null, { timeout: 60000 });
  await p.setInputFiles('#fileOverlay', [FIX + '/pic1.png']);
  await p.waitForFunction(() => A.overlays.length === 1, null, { timeout: 60000 });
  await p.evaluate(() => addTitle());
  await p.waitForTimeout(500);

  // ── 1. 沒有關鍵幀時完全不影響 ──
  chk('沒有 kf 時 kfAt 回傳原值', await p.evaluate(() => {
    const o = A.overlays[0];
    return [o.start, (o.start + o.end) / 2, o.end].every(t =>
      kfAt(o, 'x', o.x, t) === o.x && kfAt(o, 'scale', o.scale, t) === o.scale);
  }));

  // ── 2. 插值：t 是比例，緩動吃得到 ──
  const iv = await p.evaluate(() => {
    const o = A.overlays[0];
    o.start = 0; o.end = 4; o.x = 0.2;
    o.kf = { x: [{ t: 1, v: 0.8, e: 'linear' }] };
    const lin = [0, 1, 2, 3, 4].map(t => +kfAt(o, 'x', o.x, t).toFixed(4));
    o.kf.x[0].e = 'inout';
    const io = [0, 2, 4].map(t => +kfAt(o, 'x', o.x, t).toFixed(4));
    return { lin, io };
  });
  chk('等速內插 ' + JSON.stringify(iv.lin),
      JSON.stringify(iv.lin) === JSON.stringify([0.2, 0.35, 0.5, 0.65, 0.8]));
  chk('慢進慢出：中點一樣、兩端一樣 ' + JSON.stringify(iv.io),
      Math.abs(iv.io[0] - 0.2) < 1e-6 && Math.abs(iv.io[1] - 0.5) < 1e-6 && Math.abs(iv.io[2] - 0.8) < 1e-6);

  // ── 3. t 是比例 → 裁切方塊，動態自動跟著縮放 ──
  const rel = await p.evaluate(() => {
    const o = A.overlays[0];
    o.start = 0; o.end = 4; o.kf = { x: [{ t: 1, v: 0.8, e: 'linear' }] };
    const a = +kfAt(o, 'x', o.x, 2).toFixed(4);       // 一半 → 0.5
    o.end = 2;                                        // 縮短一半
    const c = +kfAt(o, 'x', o.x, 1).toFixed(4);       // 新的一半 → 還是 0.5
    const d = +kfAt(o, 'x', o.x, 2).toFixed(4);       // 新的結尾 → 0.8
    return { a, c, d };
  });
  chk('裁切後動態自動縮放 ' + JSON.stringify(rel), rel.a === 0.5 && rel.c === 0.5 && rel.d === 0.8);

  // ── 4. 實際畫出來的畫面真的有動（跟「沒有疊圖」的畫面相減，才不會被影片底色干擾） ──
  const px = await p.evaluate(() => {
    const o = A.overlays[0];
    o.start = 0; o.end = 4; o.x = 0.15; o.y = 0.5; o.scale = 0.2; o.opacity = 1;
    o.fadeIn = 0; o.fadeOut = 0; o.rot = 0;
    o.kf = { x: [{ t: 1, v: 0.85, e: 'linear' }] };
    const W = 320, H = 180;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const c2 = cv.getContext('2d');
    const shot = T => { renderFrame(c2, T, W, H); return c2.getImageData(0, 0, W, H).data.slice(); };
    const ts = [0, 2, 3.98];
    const keep = A.overlays; A.overlays = [];
    const bg = ts.map(shot);
    A.overlays = keep;
    const fg = ts.map(shot);
    return ts.map((_, k) => {
      let sx = 0, n = 0;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++){
        const i = (y * W + x) * 4;
        const d = Math.abs(fg[k][i] - bg[k][i]) + Math.abs(fg[k][i+1] - bg[k][i+1]) + Math.abs(fg[k][i+2] - bg[k][i+2]);
        if (d > 40){ sx += x; n++; }
      }
      return n > 20 ? +(sx / n / W).toFixed(3) : null;
    });
  });
  const moved = px[0] != null && px[2] != null && px[2] - px[0] > 0.4
             && Math.abs(px[1] - (px[0] + px[2]) / 2) < 0.08;
  chk('畫面上疊圖真的從左移到右 ' + JSON.stringify(px), moved);

  // ── 5. 動畫效果照樣疊在上面（標題） ──
  const withAnim = await p.evaluate(() => {
    const t = A.titles[0];
    t.start = 0; t.end = 4; t.x = 0.2; t.y = 0.5; t.animIn = 'fade'; t.animDur = 1; t.animOut = 'none';
    t.kf = { x: [{ t: 1, v: 0.8, e: 'linear' }] };
    return { mid: +kfAt(t, 'x', t.x, 2).toFixed(3), end: +kfAt(t, 'x', t.x, 4).toFixed(3) };
  });
  chk('標題基準值有跟著關鍵幀走 ' + JSON.stringify(withAnim), withAnim.mid === 0.5 && withAnim.end === 0.8);

  const animAlive = await p.evaluate(() => {
    const W = 320, H = 180;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const c2 = cv.getContext('2d');
    const shot = T => { renderFrame(c2, T, W, H); return c2.getImageData(0, 0, W, H).data.slice(); };
    const ts = [0.03, 1.5];
    const keep = A.titles; A.titles = [];
    const bg = ts.map(shot);
    A.titles = keep;
    const fg = ts.map(shot);
    return ts.map((_, k) => {
      let n = 0;
      for (let i = 0; i < bg[k].length; i += 4){
        const d = Math.abs(fg[k][i] - bg[k][i]) + Math.abs(fg[k][i+1] - bg[k][i+1]) + Math.abs(fg[k][i+2] - bg[k][i+2]);
        if (d > 40) n++;
      }
      return n;
    });
  });
  chk('進場淡入還在作用（動畫沒被關鍵幀蓋掉）' + JSON.stringify(animAlive),
      animAlive[1] > 50 && animAlive[0] < animAlive[1] * 0.5);

  // ── 6. UI ──
  await p.evaluate(() => { A.sel = { type:'overlay', id:A.overlays[0].id }; A.overlays[0].kf = null; render(); refreshProp(); });
  await p.waitForTimeout(300);
  let prop = await p.textContent('#prop');
  chk('疊圖開關為英文指定名稱且移除舊說明', prop.includes('Keyframes on/off') && !prop.includes('Ken Burns'));
  chk('沒啟用時不顯示終點滑桿', !(await p.$('#oKx')));
  await p.click('#oKf');
  await p.waitForTimeout(400);
  prop = await p.textContent('#prop');
  chk('啟用後出現五個終點滑桿', !!(await p.$('#oKx')) && !!(await p.$('#oKy')) && !!(await p.$('#oKscale')) && !!(await p.$('#oKopacity')) && !!(await p.$('#oKrot')));
  chk('緩動選單是英文', (await p.$$eval('#oKe option', ns => ns.map(n => n.textContent))).includes('Ease in and out'));
  chk('啟用時終點=起點（不會突然亂跑）', await p.evaluate(() => {
    const o = A.overlays[0];
    return Math.abs(kfEnd(o,'x').v - o.x) < 1e-9 && Math.abs(kfEnd(o,'scale').v - o.scale) < 1e-9;
  }));
  await p.evaluate(() => { const el = document.querySelector('#oKscale'); el.value = 0.9; el.dispatchEvent(new Event('input', {bubbles:true})); });
  await p.waitForTimeout(300);
  chk('拉終點滑桿有寫進關鍵幀', Math.abs((await p.evaluate(() => kfEnd(A.overlays[0],'scale').v)) - 0.9) < 1e-6);
  chk('起點沒被動到', await p.evaluate(() => Math.abs(A.overlays[0].scale - 0.2) < 1e-9));

  // 存讀 / 復原
  chk('kf 有進 snapshot', await p.evaluate(() => !!JSON.parse(snapshot()).overlays[0].kf.scale));
  await p.click('#oKf');
  await p.waitForTimeout(400);
  chk('取消勾選就清掉', await p.evaluate(() => !kfOn(A.overlays[0])));
  await p.keyboard.press('Control+z');
  await p.waitForTimeout(400);
  chk('Ctrl+Z 把動態救回來', await p.evaluate(() => kfOn(A.overlays[0])));

  // 標題面板
  await p.evaluate(() => { A.sel = { type:'title', id:A.titles[0].id }; A.titles[0].kf = null; render(); refreshProp(); });
  await p.waitForTimeout(300);
  prop = await p.textContent('#prop');
  chk('標題面板使用共用關鍵偵開關名稱', prop.includes('Keyframes on/off'));
  await p.click('#tKf');
  await p.waitForTimeout(400);
  chk('啟用後上面那組改標成起點', (await p.textContent('#prop')).includes('Title framing (start)'));
  chk('開啟後仍使用指定關鍵偵開關標題', (await p.textContent('#prop')).includes('Keyframes on/off'));
  chk('標題有五個終點滑桿（含旋轉）',
      !!(await p.$('#tKx')) && !!(await p.$('#tKsize')) && !!(await p.$('#tKopacity')) && !!(await p.$('#tKy')) && !!(await p.$('#tKrot')));


  // Title start and end controls must expose the same four keyed properties.
  chk('標題起終點五項皆有控制及底色', await p.evaluate(()=>
    ['tX','tY','tSize','tOpa','tRot','tKx','tKy','tKsize','tKopacity','tKrot'].every(id=>$('#'+id)?.closest('.row').classList.contains('kf-row'))));
  await p.evaluate(()=>{
    window.titleBeforeOpacity=JSON.parse(JSON.stringify(A.titles[0]));
    Object.assign(A.titles[0],{start:0,end:4,text:'TEST',font:'Arial',size:120,opacity:1,kf:null,kfT:null,
      shadow:false,strokeW:0,animIn:'none',animOut:'none'});
    refreshProp();A.playhead=1.5;
    window.titleAlpha=()=>{const cv=document.createElement('canvas');cv.width=320;cv.height=180;
      drawTitle(cv.getContext('2d'),A.titles[0],1.5,320,180);const d=cv.getContext('2d').getImageData(0,0,320,180).data;
      let sum=0;for(let i=3;i<d.length;i+=4)sum+=d[i];return sum};
    window.titleFullAlpha=titleAlpha();
  });
  await p.locator('#tOpa').fill('0.24');await p.locator('#tOpa').dispatchEvent('input');
  chk('標題起點透明度真的影響畫面',await p.evaluate(()=>Math.abs(titleAlpha()/titleFullAlpha-.24)<.02));
  await p.click('#tKf');
  chk('啟用沿用剛設定的標題透明度',await p.evaluate(()=>A.titles[0].opacity===.24&&kfEnd(A.titles[0],'opacity').v===.24));
  await p.locator('#tKopacity').fill('0.8');await p.locator('#tKopacity').dispatchEvent('input');
  chk('標題透明度由起點內插至終點',await p.evaluate(()=>Math.abs(kfAt(A.titles[0],'opacity',A.titles[0].opacity,2)-.52)<.001));
  const savedOpacity=await p.evaluate(async()=>{
    const blob=await buildProjBlob();await projImportFile(new File([blob],'title-opacity.nvproj'));
    return A.titles[0].opacity===.24&&kfEnd(A.titles[0],'opacity').v===.8;
  });
  chk('標題透明度起終點存檔重開保留',savedOpacity);
  await p.evaluate(()=>{A.sel={type:'title',id:A.titles[0].id};refreshProp()});
  await p.click('#tKf');chk('關閉關鍵偵仍保留起點透明度',await p.evaluate(()=>A.titles[0].opacity===.24&&!kfOn(A.titles[0])));
  await p.click('#btnUndo');chk('復原恢復標題透明度終點',await p.evaluate(()=>A.titles[0].opacity===.24&&kfEnd(A.titles[0],'opacity').v===.8));
  await p.evaluate(()=>{A.titles[0]=titleBeforeOpacity;delete A.titles[0].opacity;A.sel={type:'title',id:A.titles[0].id};refreshProp()});
  chk('舊標題沒有透明度時預設一',await p.evaluate(()=>A.titles[0].opacity===1));

  // ── 6a. 影片片段也有同一套兩點式動態 ──
  await p.evaluate(() => {
    const c = A.clips[0];
    Object.assign(c, { x:0.5, y:0.5, scale:1, opacity:1, motionRot:0, kf:null, kfT:null });
    A.sel = { type:'clip', id:c.id }; A.playhead = 0.5; render(); refreshProp();
  });
  await p.waitForTimeout(300);
  prop = await p.textContent('#prop');
  chk('影片面板有英文構圖與指定關鍵偵開關', prop.includes('Video framing') && prop.includes('Keyframes on/off'));
  chk('影片起點有位置／大小／透明／旋轉控制',
      !!(await p.$('#cX')) && !!(await p.$('#cY')) && !!(await p.$('#cScale'))
      && !!(await p.$('#cOpa')) && !!(await p.$('#cMotionRot')));
  await p.click('#cKf');
  await p.waitForTimeout(350);
  chk('影片啟用後有五個終點滑桿',
      !!(await p.$('#cKx')) && !!(await p.$('#cKy')) && !!(await p.$('#cKscale'))
      && !!(await p.$('#cKopacity')) && !!(await p.$('#cKmotionRot')));
  chk('影片動態啟用時終點等於起點', await p.evaluate(() => {
    const c=A.clips[0];
    return Math.abs(kfEnd(c,'x').v-c.x)<1e-9 && Math.abs(kfEnd(c,'scale').v-c.scale)<1e-9
        && Math.abs(kfEnd(c,'opacity').v-c.opacity)<1e-9 && Math.abs(kfEnd(c,'motionRot').v-c.motionRot)<1e-9;
  }));

  const vpx = await p.evaluate(() => {
    const c=A.clips[0], W=320, H=180, cv=document.createElement('canvas');
    cv.width=W; cv.height=H; const c2=cv.getContext('2d');
    Object.assign(c,{x:0.5,y:0.5,scale:0.3,opacity:1,motionRot:0,kfT:null});
    const metric = T => {
      renderFrame(c2,T,W,H); const d=c2.getImageData(0,0,W,H).data;
      let sx=0,sy=0,n=0,sum=0,minX=W,maxX=-1,minY=H,maxY=-1;
      for(let y=0;y<H;y++) for(let x=0;x<W;x++){
        const i=(y*W+x)*4;
        if(d[i+2]>18 && d[i+2]>d[i]+12 && d[i+2]>d[i+1]+12){
          sx+=x; sy+=y; n++; sum+=d[i+2]; minX=Math.min(minX,x); maxX=Math.max(maxX,x);
          minY=Math.min(minY,y); maxY=Math.max(maxY,y);
        }
      }
      return {cx:n?sx/n/W:0,cy:n?sy/n/H:0,n,avg:n?sum/n:0,
              ar:n?(maxX-minX+1)/(maxY-minY+1):0};
    };
    c.kf={x:[{t:1,v:0.82,e:'linear'}]}; c.x=0.18;
    const pos=[metric(0),metric(5)];
    c.kf={scale:[{t:1,v:0.55,e:'linear'}]}; c.x=0.5; c.scale=0.2;
    const size=[metric(0),metric(5)];
    c.kf={opacity:[{t:1,v:0.28,e:'linear'}]}; c.scale=0.35; c.opacity=1;
    const opa=[metric(0),metric(5)];
    c.kf={motionRot:[{t:1,v:90,e:'linear'}]}; c.opacity=1; c.motionRot=0; c.scale=0.35;
    const rot=[metric(0),metric(5)];
    return {pos,size,opa,rot};
  });
  chk('影片畫面真的由左移到右 ' + JSON.stringify(vpx.pos),
      vpx.pos[0].cx < 0.25 && vpx.pos[1].cx > 0.75);
  chk('影片畫面真的由小放大 ' + JSON.stringify(vpx.size),
      vpx.size[1].n > vpx.size[0].n * 4);
  chk('影片透明度真的降低 ' + JSON.stringify(vpx.opa),
      vpx.opa[1].avg < vpx.opa[0].avg * 0.45);
  chk('影片真的旋轉 90 度 ' + JSON.stringify(vpx.rot),
      vpx.rot[0].ar > 1.5 && vpx.rot[1].ar < 0.75);

  await p.evaluate(() => {
    const c=A.clips[0];
    Object.assign(c,{x:0.2,y:0.5,scale:0.3,opacity:1,motionRot:0,kfT:null});
    c.kf={x:[{t:1,v:0.85,e:'linear'}],scale:[{t:1,v:0.55,e:'linear'}],
          opacity:[{t:1,v:0.7,e:'linear'}],motionRot:[{t:1,v:25,e:'linear'}]};
    A.playhead=4.5; A.sel={type:'clip',id:c.id}; render(); refreshProp();
  });
  await p.waitForTimeout(300);
  chk('影片方塊上有兩個動態時間標記', (await p.$$('.blk .kfm')).length === 2);
  chk('影片動態有存進專案資料', await p.evaluate(() => {
    const c=serialize().st.clips[0];
    return c.x===0.2 && c.scale===0.3 && c.opacity===1 && c.motionRot===0
        && !!c.kf.x && !!c.kf.scale && !!c.kf.opacity && !!c.kf.motionRot;
  }));

  await p.evaluate(() => {
    const c=A.clips[0], q=layout()[0]; A.sel={type:'clip',id:c.id};
    A.playhead=q.start+q.dur/2; splitClip();
  });
  await p.waitForTimeout(350);
  const vsp = await p.evaluate(() => {
    const L=layout(), a=A.clips[0], b=A.clips[1], seam=L[1].start;
    return {n:A.clips.length, shared:a.kf===b.kf || a.kf.x===b.kf.x,
      left:kfAt(a,'x',a.x,seam-0.001), right:kfAt(b,'x',b.x,seam+0.001),
      end:kfAt(b,'x',b.x,L[1].start+L[1].dur)};
  });
  chk('影片分割後兩半不共用動態資料', vsp.n===2 && !vsp.shared);
  chk('影片分割後動態接縫不跳 ' + JSON.stringify(vsp), Math.abs(vsp.left-vsp.right)<0.01);
  chk('影片分割後右半仍走到原終點', Math.abs(vsp.end-0.85)<0.01);
  await p.keyboard.press('Control+z');
  await p.waitForTimeout(300);
  chk('影片分割可以一次復原', await p.evaluate(() => A.clips.length===1 && kfOn(A.clips[0])));

  // ── 6b. 動態時間視窗 ──
  await p.evaluate(() => {
    const o = A.overlays[0];
    o.start = 0; o.end = 4; o.x = 0.2; o.fadeIn = 0; o.fadeOut = 0;
    o.kf = { x: [{ t: 1, v: 0.8, e: 'linear' }] }; o.kfT = null;
    A.sel = { type:'overlay', id:o.id }; render(); refreshProp();
  });
  await p.waitForTimeout(300);
  chk('預設視窗＝整段', await p.evaluate(() => JSON.stringify(kfWin(A.overlays[0])) === '[0,1]'));
  const win = await p.evaluate(() => {
    const o = A.overlays[0];
    o.kfT = [0.25, 0.75];        // 只在第 1～3 秒動
    return [0, 0.5, 1, 2, 3, 3.5, 4].map(t => +kfAt(o, 'x', o.x, t).toFixed(3));
  });
  chk('起點前不變、終點後不變 ' + JSON.stringify(win),
      JSON.stringify(win) === JSON.stringify([0.2, 0.2, 0.2, 0.5, 0.8, 0.8, 0.8]));

  await p.evaluate(() => { render(); refreshProp(); });
  await p.waitForTimeout(300);
  chk('方塊上有兩個菱形標記', (await p.$$('.oblk .kfm')).length === 2);
  chk('標記吃得到滑鼠', await p.$eval('.oblk .kfm', n => getComputedStyle(n).pointerEvents === 'auto'));
  chk('面板有動態開始／結束兩列（英文）',
      (await p.textContent('#prop')).includes('Motion starts') && (await p.textContent('#prop')).includes('Motion ends'));

  // 預設位置（剛好在方塊兩端）的標記也要抓得到，不能抓成裁切把手
  await p.evaluate(() => { const o = A.overlays[0]; o.kfT = null; render(); refreshProp(); });
  await p.waitForTimeout(300);
  const ob0 = await p.$eval('.oblk', n => { const r = n.getBoundingClientRect(); return { x:r.left, y:r.top, w:r.width, h:r.height }; });
  const s0 = await p.evaluate(() => ({ st: A.overlays[0].start, en: A.overlays[0].end }));
  const m0 = await p.$$eval('.oblk .kfm', ns => { const r = ns[0].getBoundingClientRect(); return { x:r.left+r.width/2, y:r.top+r.height/2 }; });
  await p.mouse.move(m0.x, m0.y);
  await p.mouse.down();
  await p.mouse.move(ob0.x + ob0.w * 0.4, m0.y, { steps: 6 });
  await p.mouse.up();
  await p.waitForTimeout(300);
  const s1 = await p.evaluate(() => ({ st: A.overlays[0].start, en: A.overlays[0].end, w: kfWin(A.overlays[0]) }));
  chk('抓預設位置的起點標記不會裁到方塊 ' + JSON.stringify(s1),
      Math.abs(s1.st - s0.st) < 1e-6 && Math.abs(s1.en - s0.en) < 1e-6 && s1.w[0] > 0.25);
  const mr = await p.$$eval('.oblk .kfm', ns => { const r = ns[1].getBoundingClientRect(); return { x:r.left+r.width/2, y:r.top+r.height/2 }; });
  await p.mouse.move(mr.x, mr.y);
  await p.mouse.down();
  await p.mouse.move(ob0.x + ob0.w * 0.6, mr.y, { steps: 6 });
  await p.mouse.up();
  await p.waitForTimeout(300);
  const s2 = await p.evaluate(() => ({ st: A.overlays[0].start, en: A.overlays[0].end, w: kfWin(A.overlays[0]) }));
  chk('抓預設位置的終點標記也不會裁到方塊 ' + JSON.stringify(s2),
      Math.abs(s2.st - s0.st) < 1e-6 && Math.abs(s2.en - s0.en) < 1e-6 && s2.w[1] < 0.75);
  await p.evaluate(() => { const o = A.overlays[0]; o.kfT = [0.25, 0.75]; render(); refreshProp(); });
  await p.waitForTimeout(300);

  // 拖第二個標記
  const ob = await p.$eval('.oblk', n => { const r = n.getBoundingClientRect(); return { x:r.left, y:r.top, w:r.width, h:r.height }; });
  const m2 = await p.$$eval('.oblk .kfm', ns => { const r = ns[1].getBoundingClientRect(); return { x:r.left+r.width/2, y:r.top+r.height/2 }; });
  await p.mouse.move(m2.x, m2.y);
  await p.mouse.down();
  await p.mouse.move(ob.x + ob.w * 0.95, m2.y, { steps: 6 });
  await p.mouse.up();
  await p.waitForTimeout(300);
  chk('拖標記改了終點時間 ' + JSON.stringify(await p.evaluate(() => kfWin(A.overlays[0]))),
      await p.evaluate(() => kfWin(A.overlays[0])[1] > 0.85));
  chk('拖標記沒有把方塊移走', await p.evaluate(() => Math.abs(A.overlays[0].start) < 1e-6));

  // 連點兩下把最近的搬過來
  await p.mouse.dblclick(ob.x + ob.w * 0.1, ob.y + ob.h * 0.7);
  await p.waitForTimeout(400);
  chk('連點兩下把起點搬過來 ' + JSON.stringify(await p.evaluate(() => kfWin(A.overlays[0]))),
      await p.evaluate(() => Math.abs(kfWin(A.overlays[0])[0] - 0.1) < 0.05));
  chk('提示是英文', /Motion start moved here/.test((await p.textContent('#toast')).trim()));
  await p.keyboard.press('Control+z');
  await p.waitForTimeout(300);
  chk('Ctrl+Z 還原標記', await p.evaluate(() => kfWin(A.overlays[0])[0] < 0.05 || Math.abs(kfWin(A.overlays[0])[0] - 0.25) < 0.02));

  // 方塊本身照樣拖得動
  await p.mouse.move(ob.x + ob.w / 2, ob.y + ob.h * 0.7);
  await p.mouse.down();
  await p.mouse.move(ob.x + ob.w / 2 + 50, ob.y + ob.h * 0.7, { steps: 5 });
  await p.mouse.up();
  await p.waitForTimeout(300);
  chk('疊圖方塊照樣拖得動', await p.evaluate(() => A.overlays[0].start > 0.2));
  await p.keyboard.press('Control+z');
  await p.waitForTimeout(300);
  chk('拖方塊之後 Ctrl+Z 一次就回到原位', await p.evaluate(() => Math.abs(A.overlays[0].start) < 1e-6));

  // ── 6b. 分割：動態要切開、不能共用同一份 kf ──
  const sp = await p.evaluate(() => {
    const o = A.overlays[0];
    o.start = 0; o.end = 4; o.x = 0.2; o.scale = 0.2; o.fadeIn = 0; o.fadeOut = 0;
    o.kf = { x: [{ t: 1, v: 0.8, e: 'linear' }] }; o.kfT = null;
    A.sel = { type:'overlay', id:o.id }; A.playhead = 2; splitOverlay();
    const [l, r] = A.overlays;
    return {
      n: A.overlays.length,
      shared: l.kf === r.kf || l.kf.x === r.kf.x,
      seamL: +kfAt(l, 'x', l.x, 1.999).toFixed(3),
      seamR: +kfAt(r, 'x', r.x, 2.001).toFixed(3),
      endR:  +kfAt(r, 'x', r.x, 4).toFixed(3),
    };
  });
  chk('分割後兩半不共用 kf ' + JSON.stringify(sp), sp.n === 2 && !sp.shared);
  chk('分割後接縫不跳', Math.abs(sp.seamL - sp.seamR) < 0.01 && Math.abs(sp.seamL - 0.5) < 0.01);
  chk('分割後右半仍走到原本的終點', Math.abs(sp.endR - 0.8) < 0.01);
  await p.evaluate(() => { A.overlays.length = 1; A.overlays[0].end = 4; A.overlays[0].kf = null; A.overlays[0].kfT = null; render(); });

  // ── 6c. 九宮格快速對位：不管有沒有動態，畫面都要立刻反映 ──
  const cenNow = () => p.evaluate(() => {
    const W = 320, H = 180, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const c2 = cv.getContext('2d');
    const shot = T => { renderFrame(c2, T, W, H); return c2.getImageData(0, 0, W, H).data.slice(); };
    const T = A.playhead;
    const keep = A.overlays; A.overlays = []; const bg = shot(T); A.overlays = keep; const fg = shot(T);
    let sx = 0, n = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++){
      const i = (y * W + x) * 4;
      const d = Math.abs(fg[i]-bg[i]) + Math.abs(fg[i+1]-bg[i+1]) + Math.abs(fg[i+2]-bg[i+2]);
      if (d > 40){ sx += x; n++; }
    }
    return n > 20 ? +(sx / n / W).toFixed(3) : null;
  });
  await p.evaluate(() => { const o = A.overlays[0];
    o.start = 0; o.end = 4; o.kf = null; o.kfT = null; o.fadeIn = 0; o.fadeOut = 0; o.scale = 0.2;
    A.sel = { type:'overlay', id:o.id }; A.playhead = 2; render(); refreshProp(); });
  await p.waitForTimeout(300);
  await p.evaluate(() => document.querySelector('#onine button[data-p="0.12,0.5"]').click());
  await p.waitForTimeout(300);
  const cL = await cenNow();
  await p.evaluate(() => document.querySelector('#onine button[data-p="0.5,0.5"]').click());
  await p.waitForTimeout(300);
  const cC = await cenNow();
  chk('沒動態時九宮格立刻反映 ' + cL + ' → ' + cC, cL < 0.2 && Math.abs(cC - 0.5) < 0.03);

  await p.evaluate(() => { const o = A.overlays[0];
    o.x = 0.2; o.kf = { x: [{ t: 1, v: 0.85, e: 'linear' }] }; o.kfT = [0, 0.5];
    A.playhead = 3.5; render(); refreshProp(); });
  await p.waitForTimeout(300);
  const bBefore = await cenNow();
  await p.evaluate(() => document.querySelector('#onine button[data-p="0.5,0.5"]').click());
  await p.waitForTimeout(400);
  const bAfter = await cenNow();
  chk('有動態、播放頭在終點之後，九宮格也立刻反映 ' + bBefore + ' → ' + bAfter,
      bBefore > 0.7 && Math.abs(bAfter - 0.5) < 0.03);
  chk('整條路徑一起平移（不是只改起點）',
      await p.evaluate(() => Math.abs(kfEnd(A.overlays[0],'x').v - 0.5) < 0.02));
  await p.keyboard.press('Control+z');
  await p.waitForTimeout(300);
  chk('九宮格可以復原', await p.evaluate(() => Math.abs(kfEnd(A.overlays[0],'x').v - 0.85) < 0.02));
  await p.evaluate(() => { const o = A.overlays[0]; o.kf = null; o.kfT = null; o.x = 0.2; render(); });

  // ── 7. 匯出不會爆 ──
  await p.evaluate(() => {
    const o = A.overlays[0];
    o.start = 0; o.end = 3; o.kf = { x: [{t:1,v:0.85,e:'inout'}], scale: [{t:1,v:0.5,e:'inout'}] };
    A.titles[0].kf = { size: [{t:1,v:120,e:'out'}] };
    render();
  });
  const dl = p.waitForEvent('download', { timeout: 180000 });
  await p.click('#btnExport');
  const d = await dl;
  chk('匯出成功 ' + fs.statSync(await d.path()).size + ' bytes', fs.statSync(await d.path()).size > 1000);
  chk('無 JS 錯誤 ' + errs.slice(0, 2).join(' | '), errs.length === 0);

  console.log('通過 ' + ok.length + ' / ' + (ok.length + bad.length));
  if (bad.length) console.log('失敗:\n  ' + bad.join('\n  '));
  await b.close(); srv.close(); process.exit(bad.length ? 1 : 0);
})();
