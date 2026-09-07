/* ==========================================================================
   NiVedit — 匯出：逐幀合成 → WebCodecs 編碼 → mp4-muxer 封裝
   影像：seek 原片 → canvas 合成（轉場／標題／淡入淡出）→ VideoEncoder
   音訊：OfflineAudioContext 離線混音（原聲／靜音／配樂／交叉淡化）→ AudioEncoder
   ========================================================================== */
'use strict';

let cancelExport = false;

const sleep = ms => new Promise(r => setTimeout(r, ms));

/* Chrome 會把背景分頁的 setTimeout 最短間隔壓到 1 秒，用 setTimeout 讓出控制權的話，
   切走分頁匯出就會慢十倍以上。MessageChannel 不受這個節流影響。 */
const yieldNow = (() => {
  const ch = new MessageChannel();
  const q = [];
  ch.port1.onmessage = () => { const r = q.shift(); if (r) r(); };
  return () => new Promise(res => { q.push(res); ch.port2.postMessage(0); });
})();

/** 等編碼器把佇列消化掉。優先用 dequeue 事件，沒有就退回不被節流的 yield 迴圈 */
function drain(enc, max){
  if (enc.encodeQueueSize <= max) return Promise.resolve();
  if (typeof enc.addEventListener === 'function'){
    return new Promise(res => {
      const h = () => {
        if (enc.encodeQueueSize <= max){ enc.removeEventListener('dequeue', h); res(); }
      };
      enc.addEventListener('dequeue', h);
      h();
    });
  }
  return (async () => { while (enc.encodeQueueSize > max) await yieldNow(); })();
}

function mShow(title, sub){
  $('#mask').classList.add('on');
  $('#mTitle').textContent = title;
  $('#mSub').textContent = sub || '';
  $('#mBar').style.width = '0%';
  $('#mLog').textContent = '準備中…';
  $('#mCancel').classList.remove('hide');
  $('#mClose').classList.add('hide');
}
function mProg(pct, log){
  $('#mBar').style.width = clamp(pct, 0, 100).toFixed(1) + '%';
  if (log) $('#mLog').textContent = log;
}
function mDone(title, sub, log){
  $('#mTitle').textContent = title;
  $('#mSub').textContent = sub;
  $('#mLog').innerHTML = log;
  $('#mBar').style.width = '100%';
  $('#mCancel').classList.add('hide');
  $('#mClose').classList.remove('hide');
}

/* ── 編碼器能力偵測 ────────────────────────────────────────── */
async function probe(){
  const { w, h, fps, bitrate } = A.proj;
  const br = Math.round(bitrate * 1e6);
  const out = { video:null, audio:null, container:null, note:'' };

  const avcCands = ['avc1.640034','avc1.640028','avc1.4D4028','avc1.42E028','avc1.4D401F','avc1.42E01E'];
  // 先把所有 profile 都用「要硬體」問過一輪，再退而求其次問軟體。
  // 原本是外層跑 profile、內層跑硬體/軟體，結果會變成
  // 「寧可用軟體跑 High 5.2，也不用硬體跑 Main」—— 那會慢非常多。
  for (const acc of ['prefer-hardware','no-preference']){
    for (const codec of avcCands){
      const cfg = { codec, width:w, height:h, bitrate:br, framerate:fps,
                    hardwareAcceleration:acc, avc:{ format:'avc' } };
      try {
        if ((await VideoEncoder.isConfigSupported(cfg)).supported){
          out.video = cfg; out.hw = (acc === 'prefer-hardware'); break;
        }
      } catch(e){}
    }
    if (out.video) break;
  }
  const aacCfg = { codec:'mp4a.40.2', sampleRate:48000, numberOfChannels:2, bitrate:192000 };
  let aacOk = false;
  try { aacOk = (await AudioEncoder.isConfigSupported(aacCfg)).supported; } catch(e){}

  if (out.video && aacOk){
    out.audio = aacCfg; out.container = 'mp4';
    return out;
  }

  // 退路：VP9 + Opus → WebM
  const vp9 = { codec:'vp09.00.10.08', width:w, height:h, bitrate:br, framerate:fps,
                hardwareAcceleration:'prefer-hardware' };
  const opus = { codec:'opus', sampleRate:48000, numberOfChannels:2, bitrate:128000 };
  let vp9Ok = false, opusOk = false;
  try { vp9Ok  = (await VideoEncoder.isConfigSupported(vp9)).supported; } catch(e){}
  if (!vp9Ok){                                   // 沒有硬體 VP9 就退回軟體
    delete vp9.hardwareAcceleration;
    try { vp9Ok = (await VideoEncoder.isConfigSupported(vp9)).supported; } catch(e){}
    out.hw = false;
  } else out.hw = true;
  try { opusOk = (await AudioEncoder.isConfigSupported(opus)).supported; } catch(e){}
  if (vp9Ok && opusOk){
    out.video = vp9; out.audio = opus; out.container = 'webm';
    out.note = 'H.264/AAC 在這台電腦上不可用，已改用 WebM（VP9 + Opus）。YouTube 可以接受，但 Instagram Reels 通常不吃 WebM。';
    return out;
  }
  if (out.video){
    out.audio = null; out.container = 'mp4';
    out.note = 'AAC 編碼器不可用，這次匯出「沒有聲音軌」。部分平台（尤其 Instagram）可能拒收無音軌的影片。';
    return out;
  }
  return null;
}

/* ── 影片 seek ─────────────────────────────────────────────── */
function seekVideo(v, t){
  return new Promise(res => {
    const target = clamp(t, 0, Math.max(0, (v.duration || 0) - 0.03));
    if (!v.seeking && v.readyState >= 2 && Math.abs(v.currentTime - target) < 0.0015) return res();
    let done = false;
    const ok = () => { if (done) return; done = true; v.removeEventListener('seeked', ok); res(); };
    v.addEventListener('seeked', ok, { once:true });
    try { v.currentTime = target; } catch(e){ return ok(); }
    setTimeout(ok, 800);
  });
}

let _healLog = [];

/* ── 畫布汙染防治 ──────────────────────────────────────────
   NiVedit 的素材一律來自 URL.createObjectURL(File)，blob 網址本來就同源，
   不需要 CORS。但 file:// 開的頁面沒有正常來源，這時候多設一個
   crossOrigin='anonymous' 反而會讓 CORS 檢查過不了 —— 畫面照放，
   畫布卻被標記成「被跨來源資料汙染」，之後 new VideoFrame(canvas) 永遠失敗。

   不同瀏覽器／開啟方式的行為不一樣，與其賭一邊，不如實際驗：
   畫到 4×4 小畫布上再讀回來，讀得到才算乾淨。髒的就兩種設法都重建試一次。
   ─────────────────────────────────────────────────────────── */

/** 等到真的有畫面可以驗（readyState<2 時 drawImage 什麼都不畫，驗不出髒不髒） */
function elReady(el){
  if (!el) return Promise.resolve();
  if (el.tagName === 'IMG') return el.complete ? Promise.resolve()
    : new Promise(r => { el.addEventListener('load', r, { once:true });
                         el.addEventListener('error', r, { once:true }); setTimeout(r, 4000); });
  if (el.readyState >= 2) return Promise.resolve();
  return new Promise(r => { const ok = () => { el.removeEventListener('loadeddata', ok); r(); };
                            el.addEventListener('loadeddata', ok); setTimeout(r, 5000); });
}
/** 這個元素畫上去會不會弄髒畫布？ */
function isTainting(el){
  if (!el) return false;
  try {
    const cv = document.createElement('canvas'); cv.width = 4; cv.height = 4;
    const g = cv.getContext('2d', { willReadFrequently:true });
    g.drawImage(el, 0, 0, 4, 4);
    g.getImageData(0, 0, 1, 1);
    return false;
  } catch(e){ return true; }
}
/** 建一個素材元素。co=true 就設 crossOrigin。 */
function mkEl(kind, url, co){
  return new Promise((res, rej) => {
    if (kind === 'image'){
      const im = new Image();
      if (co) im.crossOrigin = 'anonymous';
      const clr = () => { im.onload = null; im.onerror = null; };
      im.onload = () => { clr(); res(im); };
      im.onerror = () => { clr(); rej(new Error('圖片載入失敗')); };
      im.src = url;
      return;
    }
    const v = document.createElement('video');
    if (co) v.crossOrigin = 'anonymous';
    v.src = url; v.preload = 'auto'; v.playsInline = true; v.muted = true;
    const clr = () => { v.onloadedmetadata = null; v.onerror = null; };
    v.onloadedmetadata = () => { clr(); res(v); };
    v.onerror = () => { clr(); rej(new Error('影片載入失敗')); };
    $('#videoPool').appendChild(v);
    setTimeout(() => rej(new Error('載入逾時')), 15000);
  });
}

/** 匯出前跑一次：把會弄髒畫布的素材換成乾淨的。回傳做了什麼，方便回報。 */
async function healSources(){
  const report = [];
  const items = A.clips.map(c => ({ o:c, kind: c.video ? 'video' : (c.img ? 'image' : null) }))
    .concat(A.overlays.map(o => ({ o, kind:'image' })));

  for (const { o, kind } of items){
    if (!kind) continue;
    const cur = kind === 'video' ? o.video : o.img;
    if (!cur) continue;
    await elReady(cur);
    if (!isTainting(cur)){ report.push(`${o.name}：本來就乾淨`); continue; }
    if (!o.file){ report.push(`${o.name}：髒，但沒有原始檔案可以重建`); continue; }

    let done = false;
    // blob 網址同源，正常情況「不設 crossOrigin」才對；設了反而過不了 CORS。
    // 但有些環境相反，所以兩種都試，哪個驗得過用哪個。
    for (const co of [false, true]){
      let nel = null;
      try {
        const url = URL.createObjectURL(o.file);
        nel = await mkEl(kind, url, co);
        await elReady(nel);
        if (isTainting(nel)){ try { nel.remove(); } catch(e){} continue; }
        if (kind === 'video'){
          try { cur.pause(); cur.remove(); } catch(e){}
          o.video = nel;
          nel.muted = cur.muted; nel.volume = cur.volume;
        } else o.img = nel;
        o.el = nel; o.url = url;
        o.audioBuf = null; o.audioTried = false; o._ab = null;   // 換了來源，聲音要重新解
        const m = MEDIA.get(o.id);
        if (m){ m.el = nel; m.url = url; if (kind === 'video') m.video = nel; else m.img = nel; }
        report.push(`${o.name}：重建成功（${co ? '有設' : '不設'} crossOrigin）`);
        done = true;
        break;
      } catch(e){ try { if (nel) nel.remove(); } catch(_){} }
    }
    if (!done) report.push(`${o.name}：兩種設法都還是髒的`);
  }
  return report;
}

/** 出事之後才跑：把真正弄髒畫布的素材名字找出來 */
function dirtyNames(){
  const out = [];
  for (const c of A.clips) if (isTainting(c.video || c.img)) out.push(c.name);
  for (const o of A.overlays) if (isTainting(o.img)) out.push(o.name);
  return out;
}

/* ── 旋轉校正 ──────────────────────────────────────────────
   影片檔可以把「顯示時要轉幾度」寫在容器的變換矩陣裡。<video> 元素會自動套用，
   但我們自己解出來的原始幀不會 —— 所以連續解碼那條路要自己補轉。

   問題是「該轉幾度」有好幾種寫法與慣例，光看矩陣猜，猜錯就是整段橫躺，
   而且要匯出完才看得到。與其猜，不如量：
   <video> 畫出來的是標準答案（瀏覽器一定套對了），拿解碼幀的四種轉法去比，
   哪一種最像就用哪一種。四張 64×64 的比對，成本可以忽略。
   ─────────────────────────────────────────────────────────── */
const _MINI = 64;
function miniOf(src, rot){
  const cv = document.createElement('canvas');
  cv.width = _MINI; cv.height = _MINI;
  const g = cv.getContext('2d', { alpha:false, willReadFrequently:true });
  g.fillStyle = '#000'; g.fillRect(0, 0, _MINI, _MINI);
  const w = src.videoWidth || src.displayWidth || src.width || src.codedWidth;
  const h = src.videoHeight || src.displayHeight || src.height || src.codedHeight;
  if (!w || !h) return null;
  const r = ((rot || 0) % 360 + 360) % 360;
  g.translate(_MINI / 2, _MINI / 2);
  if (r) g.rotate(r * Math.PI / 180);
  // 一律拉滿整格：只比「內容的方向」，不比長寬比
  const dw = (r % 180) ? _MINI : _MINI, dh = _MINI;
  try { g.drawImage(src, -dw / 2, -dh / 2, dw, dh); } catch(e){ return null; }
  g.setTransform(1, 0, 0, 1, 0, 0);
  try { return g.getImageData(0, 0, _MINI, _MINI).data; } catch(e){ return null; }
}
function mae(a, b){
  if (!a || !b) return Infinity;
  let s = 0, n = 0;
  for (let i = 0; i < a.length; i += 4){ s += Math.abs(a[i] - b[i]) + Math.abs(a[i+1] - b[i+1]) + Math.abs(a[i+2] - b[i+2]); n += 3; }
  return s / n;
}

/** 拿「已經解出來的那一幀」跟 <video> 在同一時間點的畫面比，量出該轉幾度。
    刻意不自己去解幀 —— 解碼器不能倒帶，多解一次就要整個重建，風險比較大。
    回傳 { rot, errs } 或 null（比不出來）。 */
async function calibrateRot(c, fs, t){
  const raw = fs.cur;                   // frameAt 會把「還沒轉」的原始幀留在這裡
  if (!raw) return null;
  try { await seekVideo(c.video, t); } catch(e){}
  const ref = miniOf(c.video, 0);       // <video> 已經是轉好的，這就是標準答案
  if (!ref) return null;
  const errs = {};
  let best = 0, bestE = Infinity;
  for (const r of [0, 90, 180, 270]){
    const e = mae(ref, miniOf(raw, r));
    errs[r] = Math.round(e * 10) / 10;
    if (e < bestE){ bestE = e; best = r; }
  }
  return { rot: best, errs, err: bestE };
}

/** 一鍵診斷：把每一段實際走哪條路、判到幾度、有沒有汙染全部列出來。
    出問題時複製貼過來就不用再猜。 */
async function diagReport(){
  const L = layout();
  const out = [];
  const say = x => out.push(x);
  say(`NiVedit ${VER}`);
  say(`瀏覽器 ${navigator.userAgent}`);
  say(`來源 ${location.protocol}  WebCodecs=${typeof VideoEncoder !== 'undefined'}`);
  say(`專案 ${A.proj.w}x${A.proj.h} ${A.proj.fps}fps fit=${A.proj.fit} ` +
      `轉場=${A.clips.map(c=>clipMode(c)).join('/')} 總長=${totalDur().toFixed(2)}s ` +
      `片段=${A.clips.length} 標題=${A.titles.length} 字幕=${A.subs.length} 疊圖=${A.overlays.length}`);
  for (let i = 0; i < A.clips.length; i++){
    const c = A.clips[i];
    const el = c.video || c.img;
    say(`── 片段 ${i+1}：${c.name}`);
    try { await elReady(el); } catch(e){}
    say(`   元素 ${el ? el.tagName : '無'} ` +
        `${el && el.videoWidth ? el.videoWidth + 'x' + el.videoHeight : ''} ` +
        `readyState=${el ? el.readyState : '-'} crossOrigin=${el ? String(el.crossOrigin) : '-'} ` +
        `汙染=${isTainting(el) ? '是' : '否'}`);
    say(`   片段 w/h=${c.w}x${c.h} 自訂旋轉=${c.rot || 0}° 裁切=${(+c.inP).toFixed(2)}~${(+c.outP).toFixed(2)} ` +
        `靜音=${!!c.muted} 音量=${c.vol} 轉場=${c.trans ? c.trans.type : '-'}`);
    say(`   檔案 ${c.file ? c.file.size + ' bytes ' + (c.file.type || '未知型別') : '無'}`);
    if (c.video){
      let fs = null, err = '';
      try { fs = await FrameSource.create(c); } catch(e){ err = String(e && e.message || e); }
      if (!fs){ say(`   取幀 逐幀 seek（連續解碼不可用${err ? '：' + err : ''}）`); }
      else {
        let f = null, e2 = '';
        try { f = await fs.frameAt(c.inP + 0.1); } catch(e){ e2 = String(e && e.message || e); }
        const fw = f ? (f.width || f.displayWidth) : 0, fh = f ? (f.height || f.displayHeight) : 0;
        say(`   取幀 連續解碼　自動轉正=${fs.rot}°　封包=${fs.samples.length}`);
        say(`   第一幀 ${f ? f.constructor.name : '取不到'} ${f ? fw + 'x' + fh : ''}${e2 ? ' ' + e2 : ''}`);
        try { fs.close(); } catch(e){}
      }
    }
  }
  return out.join('\n');
}

/* ── 音訊：解碼素材 ────────────────────────────────────────── */
/* 依取樣率分開快取。
   AI 字幕是用 16kHz 的 OfflineAudioContext 解的，匯出是 48kHz；
   共用同一格快取的話，產過字幕之後匯出就會拿到 16kHz 的版本，聲音會悶掉。 */
async function getClipAudio(c, ac){
  const sr = ac.sampleRate | 0;
  if (!c._ab) c._ab = {};
  if (sr in c._ab) return c._ab[sr];
  let buf = null;
  try { buf = await ac.decodeAudioData(await c.file.arrayBuffer()); }
  catch(e){
    // 讀不到多半是素材參照失效了，接回來再試一次 —— 這就是以前「聲音不見」的地方
    console.warn('[音訊] 「' + c.name + '」第一次解碼失敗：' + (e && e.message));
    try {
      if (typeof revalidateMedia === 'function') await revalidateMedia();
      buf = await ac.decodeAudioData(await c.file.arrayBuffer());
      console.info('[音訊] 「' + c.name + '」重新接上素材後解碼成功');
    } catch(e2){ console.warn('[音訊] 「' + c.name + '」還是解不出來：' + (e2 && e2.message)); }
  }
  // 上面重新接素材時會把 _ab 清掉，所以這裡要再確認一次才寫得進去
  if (!c._ab) c._ab = {};
  c._ab[sr] = buf;
  if (sr === 48000){ c.audioBuf = buf; c.audioTried = true; }   // 舊欄位維持相容
  return buf;
}
async function getMusicAudio(ac, m){
  if (!m) return null;
  if (m.buf) return m.buf;
  try { m.buf = await ac.decodeAudioData(await m.file.arrayBuffer()); }
  catch(e){ m.buf = null; }
  return m.buf;
}

/* ── 音訊：離線混音 ────────────────────────────────────────── */
async function buildAudio(total){
  const sr = 48000;
  const oc = new OfflineAudioContext(2, Math.max(sr / 10, Math.ceil(total * sr)), sr);
  const master = oc.createGain();
  master.gain.value = 1;
  master.connect(oc.destination);

  const L = layout();
  for (let i = 0; i < A.clips.length; i++){
    const c = A.clips[i];
    if (c.muted || c.vol <= 0) continue;
    const buf = await getClipAudio(c, oc);
    if (!buf) continue;
    const st = L[i].start, d = Math.min(L[i].dur, Math.max(0, buf.duration - c.inP));
    if (d <= 0.01) continue;
    const g = oc.createGain();
    // 這一段有沒有設「離開時的轉場」。有的話尾巴用它的曲線收掉，
    // 就不要再套接縫的交叉淡化了，兩條曲線疊在一起會互相打架。
    const ow = (typeof outWindow === 'function') ? outWindow(i, L) : null;
    if(L[i].add){
      const e=Math.min(.04,d/4);
      g.gain.setValueAtTime(0.0001,st);g.gain.linearRampToValueAtTime(c.vol,st+e);
      g.gain.setValueAtTime(c.vol,st+d-e);g.gain.linearRampToValueAtTime(0.0001,st+d);
    }else{
      const head=L[i].inDur;
      g.gain.setValueAtTime(head>0?0.0001:c.vol,st);
      if(head>0)g.gain.linearRampToValueAtTime(c.vol,st+head);
      if(ow){g.gain.setValueAtTime(c.vol,Math.max(st+head,ow.start));g.gain.linearRampToValueAtTime(0.0001,ow.end);}
    }
    const src = oc.createBufferSource();
    src.buffer = buf;
    const fade=oc.createGain(),q=L[i];
    const [fi,fo]=c.fadeAudio===false?[0,0]:clipFadeLens(c,q.span);
    fade.gain.setValueAtTime(fi>0?0:1,q.startAt);
    if(fi>0)fade.gain.linearRampToValueAtTime(1,q.startAt+fi);
    if(fo>0){
      fade.gain.setValueAtTime(1,q.end-fo);
      fade.gain.linearRampToValueAtTime(0,q.end);
    }
    src.connect(g);g.connect(fade);fade.connect(master);
    src.start(st, c.inP, d);
  }

  for (const m of A.musics){
    if (m.vol <= 0) continue;
    const mb = await getMusicAudio(oc, m);
    if (mb){
      const off  = clamp(m.offset, 0, Math.max(0, mb.duration - 0.05));
      const seg  = Math.max(0.5, mb.duration - off);        // 一輪可用長度
      const st0  = clamp(m.startAt, 0, Math.max(0, total - 0.05));
      const span = Math.min(m.len, total - st0);
      const xf   = m.loop ? clamp(m.xfade, 0, Math.min(3, seg / 3)) : 0;
      const step = Math.max(0.2, seg - xf);
      const reps = m.loop ? Math.max(1, Math.ceil((span - xf) / step)) : 1;

      // 配樂總音量與淡入淡出（相對於配樂自己的起訖）
      const mg = oc.createGain();
      // 音量曲線獨立一顆 gain，才不會跟上面的淡入淡出自動化打架。
      // 這裡畫的線必須跟預覽的 musicGainAt 完全一樣：段前段後保持水平，
      // 點與點之間直線內插。
      const vk = m.vk || [];
      if (vk.length){
        const vg = oc.createGain();
        mg.connect(vg); vg.connect(master);
        let at = clamp(st0, 0, total);
        vg.gain.setValueAtTime(clamp(vk[0].v, 0, 1), at);
        for (const q of vk){
          const t = Math.max(at, clamp(st0 + q.t, 0, total));
          vg.gain.linearRampToValueAtTime(clamp(q.v, 0, 1), t);
          at = t;
        }
        const endT = Math.max(at + 1e-3, Math.min(total, st0 + span));
        vg.gain.linearRampToValueAtTime(clamp(vk[vk.length - 1].v, 0, 1), endT);
      } else {
        mg.connect(master);
      }
      const v = m.vol, mfi = Math.min(m.fadeIn, span / 2), mfo = Math.min(m.fadeOut, span / 2);
      mg.gain.setValueAtTime(mfi > 0 ? 0.0001 : v, st0);
      if (mfi > 0) mg.gain.linearRampToValueAtTime(v, st0 + mfi);
      if (mfo > 0){
        mg.gain.setValueAtTime(v, st0 + span - mfo);
        mg.gain.linearRampToValueAtTime(0.0001, st0 + span);
      }

      for (let r = 0; r < reps; r++){
        const at = st0 + r * step;
        if (at >= st0 + span - 0.02) break;
        const d = Math.min(seg, st0 + span - at);
        if (d <= 0.05) break;
        const g = oc.createGain();
        g.gain.setValueAtTime(r > 0 && xf > 0 ? 0.0001 : 1, at);      // 循環接縫交叉淡化
        if (r > 0 && xf > 0) g.gain.linearRampToValueAtTime(1, at + xf);
        if (xf > 0 && r < reps - 1 && d > xf){
          g.gain.setValueAtTime(1, at + d - xf);
          g.gain.linearRampToValueAtTime(0.0001, at + d);
        }
        const src = oc.createBufferSource();
        src.buffer = mb;
        src.connect(g); g.connect(mg);
        src.start(at, off, d);
      }
    }
  }
  return oc.startRendering();
}

/* ── 主流程 ────────────────────────────────────────────────── */
async function startExport(){
  if (A.exporting) return;
  if (!A.clips.length){ toast('先加入影片再匯出', true); return; }
  if (typeof VideoEncoder === 'undefined'){ toast('這個瀏覽器不支援 WebCodecs，請改用 Chrome 或 Edge', true); return; }

  const total = totalDur();
  if (total < 0.1){ toast('影片長度太短', true); return; }

  setPlaying(false);
  A.exporting = true; cancelExport = false;
  $('#mCancel').onclick = () => { cancelExport = true; $('#mLog').textContent = '取消中…'; };
  $('#mClose').onclick = () => { $('#mask').classList.remove('on'); };
  mShow('匯出中', '正在確認編碼器…');

  const { w, h, fps } = A.proj;
  const nFrames = Math.max(1, Math.round(total * fps));
  const t0 = performance.now();

  try {
    // 上一輪如果有畫布被汙染，這裡先全部換新的，才不會一路失敗到重新整理為止
    if (typeof resetBuffers === 'function') resetBuffers();
    // 先實測每個素材會不會弄髒畫布，髒的就當場換掉（見 healSources 的說明）
    mProg(1, '檢查素材…');
    // 素材參照有沒有失效（檔案被搬走／被存檔蓋掉）。壞了就接回來，接不回來要講清楚。
    if (typeof revalidateMedia === 'function'){
      const rv = await revalidateMedia();
      if (rv.fixed) _healLog.push(`重新接上 ${rv.fixed} 個失效的素材參照`);
      if (!rv.ok && rv.lost.length)
        throw new Error('這些素材已經讀不到了：' + rv.lost.join('、') +
          '。多半是檔案被搬走、改名，或專案檔被別的程式改過。' +
          '請重新開啟專案，或把素材重新拖進來。');
    }
    const heal = await healSources();
    _healLog = heal;
    console.info('[匯出] 素材檢查：\n  ' + heal.join('\n  '));
    let msDecode = 0, msRender = 0, msEncode = 0;   // 分段計時，才知道慢在哪一段
    const cap = await probe();
    if (!cap) throw new Error('這台電腦的瀏覽器找不到可用的影片編碼器（H.264 與 VP9 都不支援）');

    /* 1) 音訊先做，因為要在建立 muxer 前知道有沒有音軌 */
    let pcm = null;
    if (cap.audio){
      mProg(2, '混音中…');
      pcm = await buildAudio(total);
    }

    /* 2) 建立 muxer */
    const isMp4 = cap.container === 'mp4';
    const NS = isMp4 ? Mp4Muxer : WebMMuxer;
    const target = new NS.ArrayBufferTarget();
    const muxer = new NS.Muxer(Object.assign({
      target,
      video: isMp4
        ? { codec:'avc', width:w, height:h, frameRate:fps }
        : { codec:'V_VP9', width:w, height:h, frameRate:fps },
      audio: cap.audio
        ? (isMp4 ? { codec:'aac', numberOfChannels:2, sampleRate:48000 }
                 : { codec:'A_OPUS', numberOfChannels:2, sampleRate:48000 })
        : undefined,
      firstTimestampBehavior: 'offset'
    }, isMp4 ? { fastStart:'in-memory' } : {}));

    /* 3) 影像編碼 */
    let encErr = null;
    const vEnc = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error: e => { encErr = e; }
    });
    vEnc.configure(cap.video);

    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d', { alpha:false });

    A.clips.forEach(c => { if (c.video){ c.video.pause(); c.video.muted = true; } c.exportSrc = null; });

    /* 連續解碼：能拆解的片段走快路，拆不開的自動退回逐幀 seek */
    mProg(4, '準備解碼器…');
    const srcs = new Map();
    let vidN = 0;
    for (const c of A.clips){
      if (!c.video) continue;
      vidN++;
      if (cancelExport) break;
      const fsrc = await FrameSource.create(c);
      if (fsrc) srcs.set(c.id, fsrc);
      else _healLog.push(`${c.name}：拆解不開，用逐幀 seek`);
    }
    const fastN = srcs.size;
    const pickFrame = async ref => {
      const c = ref.clip;
      const fsrc = srcs.get(c.id);
      if (fsrc){
        const f = await fsrc.frameAt(ref.t);
        if (f){
          // 第一次拿到畫面時，跟 <video>（瀏覽器已經轉好的）比一次，
          // 確認「該轉幾度」真的算對了。算錯就當場改，不用等匯完才發現。
          if (!fsrc.calDone){
            fsrc.calDone = true;
            const cal = await calibrateRot(c, fsrc, ref.t);
            if (!cal) _healLog.push(`${c.name}：轉正角度比對不出來，沿用 ${fsrc.rot}°`);
            else if (cal.rot !== fsrc.rot){
              _healLog.push(`${c.name}：矩陣說 ${fsrc.rot}°，實測 ${cal.rot}°，以實測為準 ${JSON.stringify(cal.errs)}`);
              fsrc.rot = cal.rot; fsrc.rts = -1;
              c.exportSrc = fsrc._upright(fsrc.cur);       // 用修正後的角度重畫這一幀
              return;
            } else _healLog.push(`${c.name}：轉正 ${cal.rot}° 已實測確認`);
          }
          c.exportSrc = f; return;
        }
        srcs.delete(c.id); fsrc.close();      // 取不到幀就退回 seek
        _healLog.push(`${c.name}：連續解碼取不到畫面，改用逐幀 seek（會比較慢）`);
      }
      c.exportSrc = null;
      if (c.video) await seekVideo(c.video, ref.t);
    };
    A.musics.forEach(m => m.el.pause());

    const gop = Math.max(1, Math.round(fps * 2));
    for (let f = 0; f < nFrames; f++){
      if (cancelExport) throw new Error('__cancel__');
      if (encErr) throw encErr;
      const T = f / fps;

      let _t = performance.now();
      for (const act of activeTracksAt(T)){                                   // 圖片片段不用取幀，直接畫
        if (act.a.clip.video) await pickFrame(act.a);
        if (act.b && act.b.clip.video) await pickFrame(act.b);
      }
      msDecode += performance.now() - _t;

      _t = performance.now();
      renderFrame(ctx, T, w, h);
      msRender += performance.now() - _t;
      _t = performance.now();

      let frame;
      try {
        frame = new VideoFrame(cv, {
          timestamp: Math.round(f * 1e6 / fps),
          duration: Math.round(1e6 / fps)
        });
      } catch(e){
        // 「tainted」＝畫布被跨來源素材汙染。多半是某個影片或圖片載進來時
        // 沒有走 CORS，畫上去之後這塊畫布就永遠不能再轉成影格。
        if (/tainted/i.test(e.message || '')){
          // 這時候素材都已經畫過了，可以直接一個一個驗，不用猜
          const names = dirtyNames();
          throw new Error('有素材讓畫面無法轉成影片影格'
            + (names.length ? `：${names.join('、')}` : '（查不出是哪一個）')
            + '。\n素材檢查結果：\n' + _healLog.map(x => '· ' + x).join('\n'));
        }
        throw e;
      }
      vEnc.encode(frame, { keyFrame: f % gop === 0 });
      frame.close();
      // 讓編碼器手上多排一點，編碼才能跟合成重疊；卡太緊會變成一格一格輪流等
      await drain(vEnc, 14);
      msEncode += performance.now() - _t;

      if (f % 3 === 0 || f === nFrames - 1){
        const pct = (f + 1) / nFrames * 90;
        const el = (performance.now() - t0) / 1000;
        const eta = f > 4 ? Math.round(el / (f + 1) * (nFrames - f - 1)) : null;
        mProg(pct, `影格 ${f+1} / ${nFrames}　已用 ${Math.round(el)} 秒` +
              (eta !== null ? `　預估剩 ${eta} 秒` : '') +
              `　${(f + 1) / Math.max(0.001, el) | 0} fps`);
        await yieldNow();          // 不要用 setTimeout，背景分頁會被節流到 1 秒
      }
    }
    await vEnc.flush();
    vEnc.close();

    /* 4) 音訊編碼 */
    if (cap.audio && pcm){
      mProg(93, '編碼音訊…');
      let aErr = null;
      const aEnc = new AudioEncoder({
        output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
        error: e => { aErr = e; }
      });
      aEnc.configure(cap.audio);
      const sr = pcm.sampleRate, len = pcm.length;
      const L0 = pcm.getChannelData(0);
      const R0 = pcm.numberOfChannels > 1 ? pcm.getChannelData(1) : L0;
      const CH = 1024;
      for (let off = 0; off < len; off += CH){
        if (cancelExport) throw new Error('__cancel__');
        if (aErr) throw aErr;
        const n = Math.min(CH, len - off);
        const data = new Float32Array(n * 2);
        data.set(L0.subarray(off, off + n), 0);
        data.set(R0.subarray(off, off + n), n);
        const ad = new AudioData({
          format:'f32-planar', sampleRate:sr, numberOfFrames:n, numberOfChannels:2,
          timestamp: Math.round(off / sr * 1e6), data
        });
        aEnc.encode(ad); ad.close();
        await drain(aEnc, 12);
      }
      await aEnc.flush();
      aEnc.close();
    }

    /* 5) 封裝下載 */
    mProg(98, '封裝檔案…');
    muxer.finalize();
    const ext = isMp4 ? 'mp4' : 'webm';
    const blob = new Blob([target.buffer], { type: isMp4 ? 'video/mp4' : 'video/webm' });
    const name = `NiVedit_${new Date().toISOString().slice(0,19).replace(/[:T-]/g,'').slice(0,14)}.${ext}`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);

    const mb = (blob.size / 1048576).toFixed(1);
    const secs = Math.round((performance.now() - t0) / 1000);
    const speed = fastN === vidN && vidN > 0 ? '連續解碼'
                : fastN > 0 ? `連續解碼 ${fastN}/${vidN} 段，其餘逐幀`
                : '逐幀模式';
    const codecName = isMp4
      ? `MP4（H.264${cap.audio ? ' + AAC' : '，無音軌'}）`
      : 'WebM（VP9 + Opus）';
    mDone('匯出完成',
      `${name}`,
      `${codecName}　${w}×${h}　${fps}fps　${mb} MB　耗時 ${secs} 秒` +
      `　${speed}　${cap.hw ? '硬體編碼' : '軟體編碼'}　平均 ${(nFrames/Math.max(1,secs))|0} fps` +
      `<br><span style="color:var(--fg3)">每格花費：取幀 ${(msDecode/nFrames).toFixed(1)} ms　`+
      `合成 ${(msRender/nFrames).toFixed(1)} ms　編碼 ${(msEncode/nFrames).toFixed(1)} ms　`+
      `（合計 ${((msDecode+msRender+msEncode)/nFrames).toFixed(1)} ms）</span>` +
      (cap.note ? `<br><br><span style="color:var(--warn)">⚠ ${cap.note}</span>` : '') +
      `<br><br><span style="color:var(--fg3)">檔案已下載到瀏覽器的下載資料夾。</span>`);
    toast('匯出完成');

  } catch(err){
    if (String(err.message) === '__cancel__'){
      $('#mask').classList.remove('on');
      toast('已取消匯出');
    } else {
      console.error(err);
      mDone('匯出失敗', '', `<span style="color:var(--danger)">${esc(err.message || err)}</span>`);
    }
  } finally {
    try { for (const fsrc of (typeof srcs !== 'undefined' ? srcs.values() : [])) fsrc.close(); } catch(e){}
    A.clips.forEach(c => { c.exportSrc = null; });
    A.exporting = false;
    if (typeof markDirty === 'function') markDirty(700);   // 匯出時預覽被借去用了，回來要重畫
    _last = performance.now();
  }
}

/* ── 啟動 ──────────────────────────────────────────────────── */
let _booted = false;
function boot(){ if (_booted) return; _booted = true; initUI(); }
window.addEventListener('DOMContentLoaded', boot);
if (document.readyState !== 'loading') boot();
