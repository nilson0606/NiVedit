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
  await new Promise(r => srv.listen(8921, r));
  const b = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const p = await (await b.newContext({ viewport: { width: 1500, height: 950 } })).newPage();
  p.on('pageerror', e => console.log('PAGEERR', e.message));
  await p.goto('http://localhost:8921/NiVedit.html');
  await p.waitForFunction(() => typeof A !== 'undefined' && document.querySelector('#verTag').textContent !== '—');
  // 拖放只收影片與聲音，圖片改走「＋ 圖片」的 input（掃描要的是畫面上有東西，來源不拘）
  await p.setInputFiles('#fileAny', [FIX + '/t300.webm', FIX + '/t900.webm', FIX + '/m.mp3']);
  await p.waitForFunction(() => A.clips.length >= 2 && A.musics.length >= 1, null, { timeout: 60000 });
  await p.setInputFiles('#fileImage', FIX + '/pic1.png');
  await p.waitForFunction(() => A.clips.length >= 3, null, { timeout: 60000 });
  await p.evaluate(() => { addTitle(); });
  await p.waitForTimeout(400);

  const scan = {};
  const mk = `
    const HAN = /[\u3400-\u9FFF]/;
    const grab = (el) => {
      if (!el) return [];
      const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
        acceptNode(n){
          if (n.nodeType === 1) return (n.hasAttribute('data-nt') || n.tagName === 'SCRIPT' || n.tagName === 'STYLE')
            ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
          return NodeFilter.FILTER_ACCEPT;
        }
      });
      const hits = new Set(); let n;
      while ((n = w.nextNode())){
        if (n.nodeType === 3){ const t = n.nodeValue.trim(); if (t && HAN.test(t)) hits.add(t.slice(0,70)); }
        else for (const a of ['title','placeholder']){
          const v = n.getAttribute && n.getAttribute(a);
          if (v && HAN.test(v)) hits.add('@'+a+': '+v.slice(0,70));
        }
      }
      return [...hits];
    };`;
  const look = async (label, setup, sel2) => {
    if (setup) { await p.evaluate(setup); await p.waitForTimeout(250); }
    const hits = await p.evaluate(mk + '\n' + 'grab(document.querySelector(' + JSON.stringify(sel2) + '))');
    if (hits.length) scan[label] = hits;
  };
  await look('外框', null, '#app');
  await look('片段面板', "() => { A.sel = { type:'clip', id:A.clips[1].id }; refreshProp(); }", '#prop');
  await look('圖片面板', "() => { A.sel = { type:'clip', id:A.clips[2].id }; refreshProp(); }", '#prop');
  await look('標題面板', "() => { A.sel = { type:'title', id:A.titles[0].id }; refreshProp(); }", '#prop');
  await look('音軌面板', "() => { A.sel = { type:'music', id:A.musics[0].id }; refreshProp(); }", '#prop');
  await look('專案設定面板', "() => { A.sel = { type:'proj', id:null }; refreshProp(); }", '#prop');
  await look('AI 字幕面板', null, '#asrbox');
  await look('轉場選單', "() => openPicker('trans','dissolve',()=>{},A.clips[1])", '#gmask');
  await look('風格選單', "() => { document.querySelector('#gmask').classList.remove('on'); openPicker('grade','none',()=>{},A.clips[1]); }", '#gmask');
  await look('動畫選單', "() => { document.querySelector('#gmask').classList.remove('on'); openPicker('anim','fade',()=>{},null); }", '#gmask');
  await look('字幕編輯器', "() => { document.querySelector('#gmask').classList.remove('on'); openSubEditor(); }", '#emask');
  await look('匯出對話框', "() => { document.querySelector('#emask').classList.remove('on'); mShow('匯出中','正在合成影格…'); }", '#mask');

  const _unused = async () => await p.evaluate(async () => {
    const HAN = /[㐀-鿿]/;
    const out = {};
    const grab = (label, el) => {
      if (!el) return;
      const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
        acceptNode(n){
          if (n.nodeType === 1) return n.hasAttribute('data-nt') || n.tagName === 'SCRIPT' || n.tagName === 'STYLE'
            ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
          return NodeFilter.FILTER_ACCEPT;
        }
      });
      const hits = new Set();
      let n;
      while ((n = w.nextNode())){
        if (n.nodeType === 3){ const t = n.nodeValue.trim(); if (t && HAN.test(t)) hits.add(t.slice(0, 70)); }
        else for (const a of ['title','placeholder']){
          const v = n.getAttribute && n.getAttribute(a);
          if (v && HAN.test(v)) hits.add('@' + a + ': ' + v.slice(0, 70));
        }
      }
      if (hits.size) out[label] = [...hits];
    };
    grab('外框', document.querySelector('#app'));
    // 每一種屬性面板
    const P = document.querySelector('#prop');
    const sel = (t, id) => { A.sel = { type: t, id }; refreshProp(); };
    sel('clip', A.clips[1].id);   grab('片段面板', P);
    sel('clip', A.clips[2].id);   grab('圖片面板', P);
    sel('title', A.titles[0].id); grab('標題面板', P);
    sel('music', A.musics[0].id); grab('音軌面板', P);
    if (A.subs.length){ sel('sub', A.subs[0].id); grab('字幕面板', P); }
    A.sel = { type: 'proj', id: null }; refreshProp(); grab('專案設定面板', P);
    grab('AI 字幕面板', document.querySelector('#asrbox'));
    return out;
  });

  /* 舊流程略過
  await p.evaluate(() => openPicker('trans', 'dissolve', () => {}, A.clips[1]));
  await p.waitForTimeout(500);
  const g1 = await p.evaluate(() => {
    const HAN = /[㐀-鿿]/; const hits = new Set();
    document.querySelectorAll('#gmask *').forEach(n => {
      [...n.childNodes].forEach(c => { if (c.nodeType === 3 && HAN.test(c.nodeValue)) hits.add(c.nodeValue.trim().slice(0,60)); });
    });
    return [...hits];
  });
  if (g1.length) scan['轉場選單'] = g1;

  await p.evaluate(() => { document.querySelector('#gmask').classList.remove('on'); openPicker('grade', 'none', () => {}, A.clips[1]); });
  await p.waitForTimeout(500);
  const g2 = await p.evaluate(() => {
    const HAN = /[㐀-鿿]/; const hits = new Set();
    document.querySelectorAll('#gmask *').forEach(n => {
      [...n.childNodes].forEach(c => { if (c.nodeType === 3 && HAN.test(c.nodeValue)) hits.add(c.nodeValue.trim().slice(0,60)); });
    });
    return [...hits];
  });
  if (g2.length) scan['風格選單'] = g2;

  await p.evaluate(() => { document.querySelector('#gmask').classList.remove('on'); openSubEditor(); });
  await p.waitForTimeout(500);
  const e1 = await p.evaluate(() => {
    const HAN = /[㐀-鿿]/; const hits = new Set();
    document.querySelectorAll('#emask *').forEach(n => {
      [...n.childNodes].forEach(c => { if (c.nodeType === 3 && HAN.test(c.nodeValue)) hits.add(c.nodeValue.trim().slice(0,60)); });
      for (const a of ['title','placeholder']){ const v = n.getAttribute && n.getAttribute(a); if (v && HAN.test(v)) hits.add('@'+a+': '+v.slice(0,60)); }
    });
    return [...hits];
  });
  */
  const keys = Object.keys(scan);
  if (!keys.length) console.log('英文模式下沒有殘留中文 ✓');
  else for (const k of keys) console.log('── ' + k + '\n  ' + scan[k].join('\n  '));
  await b.close(); srv.close(); process.exit(0);
})();
