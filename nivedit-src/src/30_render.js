/* ==========================================================================
   NiVedit — 畫面合成：片段繪製、轉場、標題動畫
   預覽與匯出共用同一套繪製程式碼，所見即所得。
   ========================================================================== */
'use strict';

/* 離屏畫布池。預覽、匯出、轉場預覽縮圖各用一組，互不干擾。 */
const _pools = {};
function bufs(key, n, W, H){
  let b = _pools[key] || (_pools[key] = []);
  while (b.length < n){ const c = document.createElement('canvas'); b.push({ c, x: c.getContext('2d') }); }
  for (let i = 0; i < n; i++){
    const o = b[i];
    if (o.c.width !== W || o.c.height !== H){ o.c.width = W; o.c.height = H; }
  }
  return b;
}

/** 把所有離屏畫布丟掉重開。
    canvas 一旦被「汙染」（畫過跨來源的影片或圖片）就永遠回不去，
    而這些畫布是整頁共用的 —— 只要汙染過一次，之後每次匯出都會失敗，
    只有重新整理才會好。匯出前先全部換新的，就不會被上一輪的髒東西卡住。 */
function resetBuffers(){
  for (const k of Object.keys(_pools)) delete _pools[k];
  if (typeof _pix !== 'undefined'){ _pix.width = 1; _pix.height = 1; }
}

const TAU = Math.PI * 2;
/** 固定亂數：同樣的 (i, seed) 永遠得到同一個 0~1，
    這樣預覽跟匯出的「隨機」特效才會長得一模一樣。 */
function rnd1(i, seed){
  const x = Math.sin(i * 127.1 + seed * 311.7 + 13.7) * 43758.5453;
  return x - Math.floor(x);
}

/* ── 字體視覺大小校正 ──────────────────────────────────────────
   同樣是 84px，標楷體的字縮在 em 框裡、Impact 幾乎撐滿，看起來差很多。
   這裡實際量測每個字體的字高，換算成相對於預設黑體的倍率，
   讓「大小」這個數字在所有字體下看起來一致。
   ─────────────────────────────────────────────────────────── */
const _meas = document.createElement('canvas').getContext('2d');
const _inkCache = new Map();
const INK_K = 0.72;        // 「大小」這個數字換算成實際字高的比例

/** 這一串字用這個字體畫出來，實際墨水高度是字級的幾倍？
    直接量使用者輸入的字，所以就算字體缺中文被瀏覽器換掉，量到的也是真正畫出來的東西。 */
/** 空字串或壞掉的字體字串會讓 ctx.font 整行失效，一律換回預設字體 */
function safeFont(f){
  return (typeof f === 'string' && f.trim() && f.indexOf('undefined') < 0) ? f : FONTS[0].id;
}

function inkRatio(family, bold, text){
  family = safeFont(family);
  const key = family + '|' + (bold ? 1 : 0) + '|' + text;
  if (_inkCache.has(key)) return _inkCache.get(key);
  let r = INK_K;
  try {
    _meas.font = `${bold ? '700 ' : '400 '}100px ${family}`;
    const m = _meas.measureText((text || '') + 'H');     // 補一個 H 當基準，純小寫也不會爆大
    const h = (m.actualBoundingBoxAscent || 0) + (m.actualBoundingBoxDescent || 0);
    // 只接受合理範圍。字體不存在時瀏覽器會用最後備援字體，量出來的數字可能離譜到 3 倍，
    // 以前沒擋，結果字級被壓扁成四分之一。
    if (h >= 55 && h <= 115) r = h / 100;
  } catch(e){}
  if (_inkCache.size > 400) _inkCache.clear();
  _inkCache.set(key, r);
  return r;
}

/** 校正倍率＝這個字體相對於「預設字體」該放大縮小多少。
    預設字體永遠是 1.0，其他字體最多調整 ±25%，再怪的量測也不會把字弄不見。 */
function sizeCorrection(family, bold, text){
  const base = inkRatio(FONTS[0].id, bold, text);
  const cur  = inkRatio(family, bold, text);
  return clamp(base / cur, 0.8, 1.25);
}

/** 這台電腦有沒有裝這串字體裡的任何一個？（generic 關鍵字不算） */
function fontAvailable(family){
  const names = String(family).split(',')
    .map(s => s.replace(/["']/g, '').trim())
    .filter(s => !/^(sans-serif|serif|monospace|cursive|fantasy|system-ui)$/i.test(s));
  if (!names.length) return true;
  const probe = 'mmmwwwii國字測試';
  const w = fam => { _meas.font = `100px ${fam}`; return _meas.measureText(probe).width; };
  return names.some(n =>
    ['monospace', 'sans-serif', 'serif'].some(g => Math.abs(w(`"${n}",${g}`) - w(g)) > 0.5));
}

const ease = p => 1 - Math.pow(1 - p, 3);                     // easeOutCubic
const easeBack = p => { const s = 1.70158 + 1; return 1 + (s+1)*Math.pow(p-1,3) + s*Math.pow(p-1,2); };

/** 把影片畫進畫布，維持比例（contain 留黑邊 / cover 裁切填滿） */
function drawSource(ctx, v, W, H, fit, rot){
  if (!v) return;
  // 最後的 v.width/height 是給畫布用的（轉正過的幀會包成畫布回來）
  const sw0 = v.videoWidth || v.naturalWidth || v.displayWidth || v.codedWidth || v.width;
  const sh0 = v.videoHeight || v.naturalHeight || v.displayHeight || v.codedHeight || v.height;
  if (!sw0 || !sh0) return;
  const r = ((rot || 0) % 360 + 360) % 360;
  // 轉 90/270 度時，長寬要對調之後再去算怎麼塞進畫面
  const sw = (r % 180) ? sh0 : sw0, sh = (r % 180) ? sw0 : sh0;
  const sr = sw / sh, dr = W / H;
  let w, h;
  if ((fit === 'cover') ? (sr > dr) : (sr < dr)){ h = H; w = H * sr; }
  else { w = W; h = W / sr; }
  try {
    if (!r){ ctx.drawImage(v, (W - w) / 2, (H - h) / 2, w, h); return; }
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(r * Math.PI / 180);
    // 旋轉後的目標框是 w×h，那麼旋轉前要畫的框就是把它轉回來
    const dw = (r % 180) ? h : w, dh = (r % 180) ? w : h;
    ctx.drawImage(v, -dw / 2, -dh / 2, dw, dh);
    ctx.restore();
  } catch(e){ try { ctx.restore(); } catch(_){} }
}

/* ── 畫面調整（Stage 2 · E） ─────────────────────────────────
   亮度／對比／飽和／復古用 ctx.filter 一次做完（GPU，最便宜）。
   色溫用 multiply 疊一層色版（通道增益，跟白平衡同個道理）。
   銳利度用 high-pass + overlay 疊加，這是標準的 unsharp mask 做法。
   預覽跟匯出走的是同一段程式，所見即所得。
   ─────────────────────────────────────────────────────── */
function gradeFilter(g, W){
  const f = [];
  // 色溫是用 multiply 做的，一定會壓暗，這裡先補回來
  const tempLift = Math.abs(g.temp || 0) / 100 * 0.07;
  const bri = (g.bri || 0) / 100 + tempLift;
  if (bri)      f.push(`brightness(${(1 + bri).toFixed(3)})`);
  if (g.con)    f.push(`contrast(${Math.max(0, 1 + g.con / 100).toFixed(3)})`);
  if (g.sat)    f.push(`saturate(${Math.max(0, 1 + g.sat / 100).toFixed(3)})`);
  if (g.sepia)  f.push(`sepia(${clamp(g.sepia / 100, 0, 1).toFixed(3)})`);
  return f.join(' ');   // 銳利／柔化不走 filter，見下面 applySharpen / applySoften
}

/** 色溫：暖＝壓綠藍，冷＝壓紅。黑邊乘完還是黑的，不會被染色 */
function applyTemp(ctx, temp, W, H){
  const k = clamp(temp / 100, -1, 1);
  const c255 = x => Math.round(255 * x);
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = k > 0
    ? `rgb(255,${c255(1 - k * 0.07)},${c255(1 - k * 0.24)})`
    : `rgb(${c255(1 + k * 0.20)},${c255(1 + k * 0.06)},255)`;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

/** 色調：色溫的另一半（綠 ↔ 洋紅），調膚色偏綠或偏紅時用 */
function applyTint(ctx, tint, W, H){
  const k = clamp(tint / 100, -1, 1);
  const c255 = x => Math.round(255 * x);
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = k > 0
    ? `rgb(255,${c255(1 - k * 0.20)},255)`                       // 洋紅：壓綠
    : `rgb(${c255(1 + k * 0.16)},255,${c255(1 + k * 0.16)})`;     // 綠：壓紅藍
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

/** 褪色：把黑階抬起來。lighten 會讓比這個灰暗的地方統統變成這個灰，
    就是底片那種「黑不到底」的霧面感，電影調色的關鍵一味。 */
function applyFade(ctx, amt, W, H){
  const v = Math.round(clamp(amt / 100, 0, 1) * 58);
  ctx.save();
  ctx.globalCompositeOperation = 'lighten';
  ctx.fillStyle = `rgb(${v},${v},${Math.min(255, v + 6)})`;      // 藍一點點，比較像底片
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

/** 暗角：四角壓暗，視線會自動往中間集中 */
function applyVig(ctx, amt, W, H){
  const a = clamp(amt / 100, 0, 1);
  const g = ctx.createRadialGradient(W/2, H/2, Math.min(W,H) * 0.28,
                                     W/2, H/2, Math.hypot(W,H) * 0.58);
  g.addColorStop(0,   'rgba(0,0,0,0)');
  g.addColorStop(0.55,`rgba(0,0,0,${(a * 0.12).toFixed(3)})`);
  g.addColorStop(1,   `rgba(0,0,0,${(a * 0.85).toFixed(3)})`);
  ctx.save(); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.restore();
}

/* 顆粒用一張固定的雜訊圖平鋪。每次重畫都重算雜訊的話，
   顆粒會自己跳動變成「爬蟲」，而且很貴 —— 所以只做一次。 */
let _grainCv = null;
const _grainPats = new WeakMap();          // pattern 綁在建立它的 context 上，每個畫布各存一份
function grainPattern(ctx){
  const hit = _grainPats.get(ctx);
  if (hit) return hit;
  if (_grainCv){ const pt = ctx.createPattern(_grainCv, 'repeat'); _grainPats.set(ctx, pt); return pt; }
  const N = 256;
  const c = document.createElement('canvas'); c.width = N; c.height = N;
  const x = c.getContext('2d');
  const im = x.createImageData(N, N);
  for (let i = 0; i < N * N; i++){
    const v = 128 + Math.round((rnd1(i, 91) - 0.5) * 150);
    im.data[i*4] = im.data[i*4+1] = im.data[i*4+2] = v;
    im.data[i*4+3] = 255;
  }
  x.putImageData(im, 0, 0);
  _grainCv = c;
  const pt = ctx.createPattern(c, 'repeat');
  _grainPats.set(ctx, pt);
  return pt;
}

/** 顆粒：中灰的雜訊用 overlay 疊上去，亮的地方變亮、暗的地方變暗 */
function applyGrain(ctx, amt, W, H){
  const pat = grainPattern(ctx);
  if (!pat) return;
  // 顆粒要跟著解析度縮放，不然預覽（比較小）看到的顆粒會比匯出的粗
  if (pat.setTransform){
    const k = Math.max(0.25, W / 1920);
    try { pat.setTransform(new DOMMatrix([k, 0, 0, k, 0, 0])); } catch(e){}
  }
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = clamp(amt / 100, 0, 1) * 0.55;
  ctx.fillStyle = pat;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

/** 光暈：把亮部挑出來、糊掉、再用 lighter 加回去。夜景霓虹會很有感 */
function applyBloom(ctx, amt, W, H){
  // 光暈本來就是一團糊的東西，用一半解析度做再放大回去，
  // 看起來一樣但便宜非常多（全解析度那個大半徑模糊是整組調整裡最貴的一步）
  const hw = Math.max(4, W >> 1), hh = Math.max(4, H >> 1);
  const B = bufs('bloom', 1, hw, hh)[0], x = B.x;
  x.globalCompositeOperation = 'source-over';
  x.globalAlpha = 1;
  x.clearRect(0, 0, hw, hh);
  x.filter = `brightness(1.5) contrast(2.6) saturate(1.2) blur(${Math.max(2, hw / 150).toFixed(1)}px)`;
  x.drawImage(ctx.canvas, 0, 0, hw, hh);
  x.filter = 'none';
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = clamp(amt / 100, 0, 1) * 0.45;
  ctx.drawImage(B.c, 0, 0, W, H);
  ctx.restore();
}

/* 銳利與柔化都用「固定半徑模糊 + 可變混合量」。
   一開始是讓滑桿去改模糊半徑，結果 1px 以下 Chrome 直接當沒事，
   滑桿前面一大段拉了完全沒反應。改成半徑固定、用 alpha 控制強弱，
   0～100 才會是平順的一條線。 */
function _blurLayer(ctx, W, H, r){
  const B = bufs('grade', 1, W, H)[0], x = B.x;
  x.globalCompositeOperation = 'source-over';
  x.globalAlpha = 1; x.filter = 'none';
  x.clearRect(0, 0, W, H);
  x.drawImage(ctx.canvas, 0, 0);                   // 先鋪一層沒模糊的，邊緣才不會淡掉露黑底
  x.filter = `blur(${r.toFixed(2)}px)`;
  x.drawImage(ctx.canvas, 0, 0);
  x.filter = 'none';
  return B;
}

/** 銳利度：high-pass（0.5 +（原圖－模糊）/2）再用 overlay 疊回去，就是 unsharp mask */
function applySharpen(ctx, amt, W, H){
  const B = _blurLayer(ctx, W, H, Math.max(1.4, W / 1000));
  const x = B.x;
  x.globalCompositeOperation = 'difference';       // → 1 - 模糊
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, W, H);
  x.globalCompositeOperation = 'source-over';
  x.globalAlpha = 0.5;                             // → 0.5 +（原圖 - 模糊）/2
  x.drawImage(ctx.canvas, 0, 0);
  x.globalAlpha = 1;

  ctx.save();
  ctx.globalCompositeOperation = 'overlay';        // 中灰不動，亮的更亮暗的更暗＝邊緣變利
  ctx.globalAlpha = clamp(amt / 100, 0, 1);
  ctx.drawImage(B.c, 0, 0);
  ctx.restore();
}

/** 柔化：把模糊過的那層按比例蓋回去 */
function applySoften(ctx, amt, W, H){
  const B = _blurLayer(ctx, W, H, Math.max(1.4, W / 620));
  ctx.save();
  ctx.globalAlpha = clamp(amt / 100, 0, 1);
  ctx.drawImage(B.c, 0, 0);
  ctx.restore();
}

function paintClipRaw(ctx, ref, W, H){
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  if (!ref || !ref.clip) return;          // 沒有片段就是黑畫面（結尾轉場的另一邊）
  const c = ref.clip;
  const g = (!A.gradeBypass && c.grade && hasGrade(c.grade)) ? c.grade : null;
  if (g){
    const f = gradeFilter(g, W);
    if (f) ctx.filter = f;
  }
  drawSource(ctx, clipSource(c), W, H, A.proj.fit, c.rot);
  ctx.filter = 'none';
  if (!g) return;
  // 順序有差：先把顏色調對，再處理細節，最後才是疊在畫面上的東西
  if (g.temp)       applyTemp(ctx, g.temp, W, H);
  if (g.tint)       applyTint(ctx, g.tint, W, H);
  if (g.fade)       applyFade(ctx, g.fade, W, H);
  if (g.sharp > 0)  applySharpen(ctx, g.sharp, W, H);
  else if (g.sharp < 0) applySoften(ctx, -g.sharp, W, H);
  if (g.bloom)      applyBloom(ctx, g.bloom, W, H);
  if (g.grain)      applyGrain(ctx, g.grain, W, H);
  if (g.vig)        applyVig(ctx, g.vig, W, H);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

/** 影片片段的構圖動態。先完成方向校正與調色，再把整個結果做位移／縮放／
    透明度／旋轉；轉場拿到的也是這個結果，所以預覽與匯出完全同路徑。 */
function paintClip(ctx, ref, W, H){
  if (!ref || !ref.clip) return paintClipRaw(ctx, ref, W, H);
  const c = ref.clip, T = Number.isFinite(ref.T) ? ref.T : kfBounds(c)[0];
  const bx = Number.isFinite(c.x) ? c.x : 0.5;
  const by = Number.isFinite(c.y) ? c.y : 0.5;
  const bs = Number.isFinite(c.scale) ? c.scale : 1;
  const ba = Number.isFinite(c.opacity) ? c.opacity : 1;
  const br = Number.isFinite(c.motionRot) ? c.motionRot : 0;
  const x = kfAt(c, 'x', bx, T), y = kfAt(c, 'y', by, T);
  const sc = Math.max(0.01, kfAt(c, 'scale', bs, T));
  const a = clamp(kfAt(c, 'opacity', ba, T), 0, 1);
  const rr = kfAt(c, 'motionRot', br, T);
  const cropped = c.cropShape === 'rect' || c.cropShape === 'circle';
  const plain = !ref.transparent && !cropped && !kfOn(c) && Math.abs(x - 0.5) < 1e-9 && Math.abs(y - 0.5) < 1e-9
             && Math.abs(sc - 1) < 1e-9 && Math.abs(a - 1) < 1e-9 && Math.abs(rr) < 1e-9;
  if (plain) return paintClipRaw(ctx, ref, W, H);

  const B = bufs('clipMotion' + W + 'x' + H, 1, W, H)[0];
  paintClipRaw(B.x, ref, W, H);
  if (ref.transparent){
    // 調色照舊；以原素材 alpha 移除黑邊，保留素材裡真正的黑色。
    const mask = bufs('clipCoverage'+W+'x'+H,1,W,H)[0];
    mask.x.clearRect(0,0,W,H);
    drawSource(mask.x,clipSource(c),W,H,A.proj.fit,c.rot);
    B.x.save(); B.x.globalCompositeOperation='destination-in';
    B.x.drawImage(mask.c,0,0); B.x.restore();
    ctx.clearRect(0,0,W,H);
  } else { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); }
  if (a <= 0.003) return;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.translate(x * W, y * H);
  if (rr) ctx.rotate(rr * Math.PI / 180);
  ctx.scale(sc, sc);
  if (cropped){
    // 裁切以轉正後、目前 fit 的可見素材為基準，先裁切再整體變形。
    // 圓形用等長像素半徑，直立／橫式影片都不會變成橢圓。
    const src = clipSource(c);
    let sw = src && (src.videoWidth || src.naturalWidth || src.displayWidth || src.codedWidth || src.width);
    let sh = src && (src.videoHeight || src.naturalHeight || src.displayHeight || src.codedHeight || src.height);
    if (!sw || !sh){ sw = W; sh = H; }
    if (((c.rot || 0) % 180 + 180) % 180) [sw, sh] = [sh, sw];
    const fit = A.proj.fit === 'cover' ? Math.max(W / sw, H / sh) : Math.min(W / sw, H / sh);
    const vw = Math.min(W, sw * fit), vh = Math.min(H, sh * fit);
    const val = (key, base, min) => clamp(kfAt(c, key,
      Number.isFinite(c[key]) ? c[key] : base, T), min, 1);
    const d = Math.min(vw, vh) * val('cropSize', 1, 0);
    if(c.cropShape==='circle'&&d===0){ctx.restore();return;}
    const cw = c.cropShape === 'circle' ? d : vw * val('cropW', 1, 0.01);
    const ch = c.cropShape === 'circle' ? d : vh * val('cropH', 1, 0.01);
    const cx = clamp((val('cropX', 0.5, 0) - 0.5) * vw, -(vw-cw)/2, (vw-cw)/2);
    const cy = clamp((val('cropY', 0.5, 0) - 0.5) * vh, -(vh-ch)/2, (vh-ch)/2);
    ctx.beginPath();
    if (c.cropShape === 'circle') ctx.arc(cx, cy, d / 2, 0, TAU);
    else ctx.rect(cx - cw / 2, cy - ch / 2, cw, ch);
    ctx.clip();
  }
  ctx.drawImage(B.c, -W / 2, -H / 2);
  ctx.restore();
  ctx.globalAlpha = 1;
}

/* ── 疊圖層：浮在影片上方 ─────────────────────────────────── */
function drawOverlay(ctx, o, T, W, H){
  if (T < o.start - 1e-6 || T > o.end + 1e-6) return;
  if (!o.img || !o.img.naturalWidth) return;
  // 關鍵幀動的是基準值；淡入淡出照樣乘在上面
  let a = clamp(kfAt(o, 'opacity', o.opacity, T), 0, 1);
  const life = T - o.start, span = o.end - o.start;
  if (o.fadeIn  > 0 && life < o.fadeIn)          a *= life / o.fadeIn;
  if (o.fadeOut > 0 && life > span - o.fadeOut)  a *= Math.max(0, (span - life) / o.fadeOut);
  if (a <= 0.003) return;
  const w = Math.max(2, kfAt(o, 'scale', o.scale, T) * W);
  const h = w * (o.img.naturalHeight / o.img.naturalWidth);
  const rr = kfAt(o, 'rot', o.rot || 0, T);
  ctx.save();
  ctx.globalAlpha = a;
  ctx.translate(kfAt(o, 'x', o.x, T) * W, kfAt(o, 'y', o.y, T) * H);
  if (rr) ctx.rotate(rr * Math.PI / 180);
  try { ctx.drawImage(overlaySourceAt(o, T), -w / 2, -h / 2, w, h); } catch(e){}
  ctx.restore();
  ctx.globalAlpha = 1;
}

/* ── 轉場 ──────────────────────────────────────────────────────
   30 種。opt.paint 可以換掉「怎麼畫一段素材」，預覽縮圖就是靠它畫示意圖；
   opt.key 選用哪一組離屏畫布，縮圖跟主畫面才不會互相洗掉。
   ─────────────────────────────────────────────────────────── */
const _pix = document.createElement('canvas');
const _pctx = _pix.getContext('2d');

function drawTransition(ctx, type, p, a, b, W, H, opt){
  opt = opt || {};
  const paint = opt.paint || paintClip;
  const B = bufs(opt.key || 'main', 3, W, H);
  paint(B[0].x, a, W, H);
  paint(B[1].x, b, W, H);
  const CA = B[0].c, CB = B[1].c;
  const e = ease(p);                              // 位移類用，起步快收尾慢比較順
  const L = p;                                    // 擦除／幾何類用線性，p=0.5 看起來才真的是一半
  const k = 1 - Math.abs(p * 2 - 1);              // 0 →1→ 0，中間最強
  const S = W / 1920;                             // 尺寸縮放，讓效果強度跟解析度無關

  if (opt.transparent) ctx.clearRect(0,0,W,H);
  else { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); }
  const fillEffect = (x,y,w,h) => {
    ctx.save();
    if (opt.transparent) ctx.globalCompositeOperation = 'source-atop';
    ctx.fillRect(x,y,w,h); ctx.restore();
  };
  if (opt.transparent && (p <= 0 || p >= 1)){
    ctx.drawImage(p <= 0 ? CA : CB,0,0); return;
  }
  ctx.save();

  /** 先畫前段，再把後段裁進 pathFn 畫出來的形狀裡 */
  const reveal = pathFn => {
    ctx.drawImage(CA, 0, 0);
    ctx.save(); ctx.beginPath(); pathFn(); ctx.clip();
    if (opt.transparent) ctx.clearRect(0,0,W,H);
    ctx.drawImage(CB, 0, 0); ctx.restore();
  };

  const slide=(dx,dy)=>{
    ctx.drawImage(CA,0,0);
    if(opt.transparent) ctx.clearRect(dx,dy,W,H);
    ctx.drawImage(CB,dx,dy);
  };

  switch (type){

    /* ── 溶接 ─────────────────────────────────────── */
    case 'fade':                                   // 前段淡到黑，再從黑淡出後段
      if (p < 0.5){ ctx.globalAlpha = 1 - p * 2; ctx.drawImage(CA, 0, 0); }
      else { ctx.globalAlpha = p * 2 - 1; ctx.drawImage(CB, 0, 0); }
      break;
    case 'fadeW':
      ctx.drawImage(p < 0.5 ? CA : CB, 0, 0);
      ctx.fillStyle = `rgba(255,255,255,${(p < 0.5 ? p * 2 : 2 - p * 2).toFixed(3)})`;
      fillEffect(0, 0, W, H);
      break;
    case 'dissolve':
      if (opt.transparent){
        ctx.globalAlpha=1-p; ctx.drawImage(CA,0,0);
        ctx.globalCompositeOperation='lighter';
      } else ctx.drawImage(CA, 0, 0);
      ctx.globalAlpha = p; ctx.drawImage(CB, 0, 0);
      break;
    case 'blurDis': {
      const r = k * 26 * S;
      ctx.filter = r > 0.4 ? `blur(${r.toFixed(1)}px)` : 'none';
      const m = r * 1.6;                            // 稍微畫大一點，邊緣才不會被模糊吃掉
      if (opt.transparent) ctx.globalAlpha=1-p;
      ctx.drawImage(CA, -m, -m, W + m * 2, H + m * 2);
      if (opt.transparent) ctx.globalCompositeOperation='lighter';
      ctx.globalAlpha = p;
      ctx.drawImage(CB, -m, -m, W + m * 2, H + m * 2);
      ctx.filter = 'none';
      break;
    }
    case 'lighten':                                 // 中途整片發亮再收回來
      if (opt.transparent) ctx.globalAlpha=1-p*p;
      ctx.drawImage(CA, 0, 0);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = k * 0.9;
      ctx.drawImage(CB, 0, 0);
      ctx.restore();
      ctx.globalAlpha = p * p;
      ctx.drawImage(CB, 0, 0);
      break;
    case 'darken':                                  // 中途壓暗再亮回來
      if (opt.transparent) ctx.globalAlpha=1-p*p;
      ctx.drawImage(CA, 0, 0);
      ctx.save();
      ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = k * 0.85;
      ctx.drawImage(CB, 0, 0);
      ctx.restore();
      ctx.globalAlpha = p * p;
      ctx.drawImage(CB, 0, 0);
      break;
    case 'flash':
      if (opt.transparent) ctx.globalAlpha=1-p;
      ctx.drawImage(CA, 0, 0);
      if (opt.transparent) ctx.globalCompositeOperation='lighter';
      ctx.globalAlpha = p; ctx.drawImage(CB, 0, 0); ctx.globalAlpha = 1;
      ctx.globalCompositeOperation='source-over';
      ctx.fillStyle = `rgba(255,255,255,${(k * k * 0.88).toFixed(3)})`;
      fillEffect(0, 0, W, H);
      break;

    /* ── 位移：push 兩段一起走，slide 只有後段蓋上來 ── */
    case 'pushL': ctx.drawImage(CA, -W * e, 0); ctx.drawImage(CB,  W - W * e, 0); break;
    case 'pushR': ctx.drawImage(CA,  W * e, 0); ctx.drawImage(CB, -W + W * e, 0); break;
    case 'pushU': ctx.drawImage(CA, 0, -H * e); ctx.drawImage(CB, 0,  H - H * e); break;
    case 'pushD': ctx.drawImage(CA, 0,  H * e); ctx.drawImage(CB, 0, -H + H * e); break;
    case 'slideL': slide(W-W*e,0); break;
    case 'slideR': slide(-W+W*e,0); break;
    case 'slideU': slide(0,H-H*e); break;
    case 'slideD': slide(0,-H+H*e); break;

    /* 斜著推的話，兩張圖再怎麼擺都會有一角蓋不到，只好讓後段當底、
       前段從上面斜著滑走。看起來一樣是推，但不會露出黑角。 */
    case 'pushDL':
      ctx.drawImage(CB, 0, 0);
      ctx.drawImage(CA, -W * e, -H * e);
      break;
    case 'pushDR':
      ctx.drawImage(CB, 0, 0);
      ctx.drawImage(CA, W * e, -H * e);
      break;
    case 'elastic': {
      // easeBack 是「到站前衝過頭」，用在離場會在 p≈0.28 就整片跑光，後面四格全一樣。
      // 離場要的是相反的：先往回縮一下蓄力，再甩出去。
      const q = p * p * (2.4 * p - 1.4);
      ctx.drawImage(CB, 0, 0);
      ctx.drawImage(CA, -W * q, 0);
      break;
    }
    case 'zoomPush': {                               // 兩張都保持放大，才不會邊緣露底
      const za = 1 + 0.35 * e, zb = 1.35 - 0.35 * e;
      ctx.save();
      ctx.translate(W / 2 - W * e, H / 2); ctx.scale(za, za);
      ctx.drawImage(CA, -W / 2, -H / 2, W, H);
      ctx.restore();
      ctx.save();
      ctx.translate(W / 2 + W - W * e, H / 2); ctx.scale(zb, zb);
      ctx.drawImage(CB, -W / 2, -H / 2, W, H);
      ctx.restore();
      break;
    }

    /* ── 擦除 ─────────────────────────────────────── */
    case 'wipeL':
      reveal(() => ctx.rect(0, 0, W * L, H));
      ctx.fillStyle = 'rgba(255,255,255,.5)'; fillEffect(W * L - 2, 0, 3, H);
      break;
    case 'wipeR':
      reveal(() => ctx.rect(W - W * L, 0, W * L, H));
      ctx.fillStyle = 'rgba(255,255,255,.5)'; fillEffect(W - W * L - 1, 0, 3, H);
      break;
    case 'wipeU':
      reveal(() => ctx.rect(0, 0, W, H * L));
      ctx.fillStyle = 'rgba(255,255,255,.5)'; fillEffect(0, H * L - 2, W, 3);
      break;
    case 'wipeD':
      reveal(() => ctx.rect(0, H - H * L, W, H * L));
      ctx.fillStyle = 'rgba(255,255,255,.5)'; fillEffect(0, H - H * L - 1, W, 3);
      break;
    case 'wipeDiag': {
      const d = (W + H) * L * 1.02;
      reveal(() => { ctx.moveTo(0, 0); ctx.lineTo(d, 0); ctx.lineTo(0, d); ctx.closePath(); });
      break;
    }
    case 'clock':
      reveal(() => {
        ctx.moveTo(W / 2, H / 2);
        ctx.arc(W / 2, H / 2, Math.hypot(W, H), -Math.PI / 2, -Math.PI / 2 + TAU * p);
        ctx.closePath();
      });
      break;
    case 'blinds': {
      const n = 10, bh = H / n;
      reveal(() => { for (let i = 0; i < n; i++) ctx.rect(0, i * bh, W, bh * L + 0.5); });
      break;
    }

    case 'wipeCenterH':
      reveal(() => ctx.rect(W / 2 - W / 2 * L, 0, W * L, H));
      break;
    case 'wipeCenterV':
      reveal(() => ctx.rect(0, H / 2 - H / 2 * L, W, H * L));
      break;
    case 'blindsV': {
      const n = 12, bw = W / n;
      reveal(() => { for (let i = 0; i < n; i++) ctx.rect(i * bw, 0, bw * L + 0.5, H); });
      break;
    }
    case 'clockR':
      reveal(() => {
        ctx.moveTo(W / 2, H / 2);
        ctx.arc(W / 2, H / 2, Math.hypot(W, H), -Math.PI / 2, -Math.PI / 2 - TAU * L, true);
        ctx.closePath();
      });
      break;
    case 'cross':
      reveal(() => {
        ctx.rect(0, H / 2 - H / 2 * L, W, H * L);
        ctx.rect(W / 2 - W / 2 * L, 0, W * L, H);
      });
      break;
    case 'star': {
      const R = Math.hypot(W, H) / 2 * L * 1.35;
      reveal(() => {
        for (let i = 0; i < 10; i++){
          const ang = -Math.PI / 2 + i * Math.PI / 5;
          const rr = i % 2 ? R * 0.42 : R;
          const px = W / 2 + Math.cos(ang) * rr, py = H / 2 + Math.sin(ang) * rr;
          i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
        }
        ctx.closePath();
      });
      break;
    }

    /* ── 幾何 ─────────────────────────────────────── */
    case 'circle':
      reveal(() => ctx.arc(W / 2, H / 2, Math.hypot(W, H) / 2 * L, 0, TAU));
      break;
    case 'circleOut':
      ctx.drawImage(CB, 0, 0);
      ctx.save(); ctx.beginPath();
      ctx.arc(W / 2, H / 2, Math.hypot(W, H) / 2 * (1 - L), 0, TAU);
      ctx.clip(); ctx.drawImage(CA, 0, 0); ctx.restore();
      break;
    case 'diamond': {
      const R = (W + H) / 2 * L * 1.02;
      reveal(() => {
        ctx.moveTo(W / 2, H / 2 - R); ctx.lineTo(W / 2 + R, H / 2);
        ctx.lineTo(W / 2, H / 2 + R); ctx.lineTo(W / 2 - R, H / 2); ctx.closePath();
      });
      break;
    }
    case 'blocks': {
      const cx = 9, cy = Math.max(3, Math.round(9 * H / W));
      reveal(() => {
        for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++){
          // 每格有自己的出場時機，看起來像隨機翻牌，但每次都一樣
          if (rnd1(j * cx + i, 7) < L * 1.1)
            ctx.rect(i * W / cx, j * H / cy, W / cx + 1, H / cy + 1);
        }
      });
      break;
    }
    case 'split':                                   // 前段從中間裂開往兩邊退，露出後段
      ctx.drawImage(CB, 0, 0);
      ctx.save(); ctx.beginPath(); ctx.rect(-W / 2 * L, 0, W / 2, H); ctx.clip();
      ctx.drawImage(CA, -W / 2 * L, 0); ctx.restore();
      ctx.save(); ctx.beginPath(); ctx.rect(W / 2 + W / 2 * L, 0, W / 2, H); ctx.clip();
      ctx.drawImage(CA, W / 2 * L, 0); ctx.restore();
      break;

    case 'square': {
      const sw = W * L * 1.05, sh = H * L * 1.05;
      reveal(() => ctx.rect(W / 2 - sw / 2, H / 2 - sh / 2, sw, sh));
      break;
    }
    case 'checker': {                                // 先黑格再白格，兩批各半段
      const cx = 10, cy = Math.max(4, Math.round(10 * H / W));
      reveal(() => {
        for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++){
          const first = (i + j) % 2 === 0;
          const q = first ? clamp(L * 2, 0, 1) : clamp(L * 2 - 1, 0, 1);
          if (q <= 0) continue;
          const cw = W / cx * q, chh = H / cy * q;
          ctx.rect(i * W / cx + (W / cx - cw) / 2, j * H / cy + (H / cy - chh) / 2, cw + 0.5, chh + 0.5);
        }
      });
      break;
    }
    case 'brick': {                                  // 一列一列輪流從左右進來
      const rows = 9, rh = H / rows;
      reveal(() => {
        for (let j = 0; j < rows; j++){
          const d = j / rows * 0.35;
          const q = clamp((L - d) / (1 - 0.35), 0, 1);
          if (q <= 0) continue;
          if (j % 2) ctx.rect(W - W * q, j * rh, W * q, rh + 0.5);
          else       ctx.rect(0, j * rh, W * q, rh + 0.5);
        }
      });
      break;
    }
    case 'triangle': {
      const R = Math.hypot(W, H) * L * 1.1;
      reveal(() => {
        for (let i = 0; i < 3; i++){
          const ang = -Math.PI / 2 + i * TAU / 3;
          const px = W / 2 + Math.cos(ang) * R, py = H / 2 + Math.sin(ang) * R;
          i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
        }
        ctx.closePath();
      });
      break;
    }

    /* ── 風格化 ───────────────────────────────────── */
    case 'zoom': {
      const za = 1 + 0.25 * e, zb = 1.25 - 0.25 * e;
      ctx.globalAlpha = 1 - p;
      ctx.drawImage(CA, W/2 - W*za/2, H/2 - H*za/2, W*za, H*za);
      ctx.globalAlpha = p;
      ctx.drawImage(CB, W/2 - W*zb/2, H/2 - H*zb/2, W*zb, H*zb);
      break;
    }
    case 'spin': {
      const put = (C, rot, sc, al) => {
        ctx.save(); ctx.globalAlpha = al;
        ctx.translate(W / 2, H / 2); ctx.rotate(rot); ctx.scale(sc, sc);
        ctx.drawImage(C, -W / 2, -H / 2, W, H); ctx.restore();
      };
      put(CA, e * 0.55, 1 + e * 0.55, opt.transparent ? 1-p : 1);
      put(CB, -(1 - e) * 0.55, 1.55 - 0.55 * e, p);
      break;
    }
    case 'glitch': {
      const seed = Math.floor(p * 26), rows = 15;
      for (let i = 0; i < rows; i++){
        const y = Math.floor(i * H / rows), h = Math.ceil(H / rows) + 1;
        const src = rnd1(i, seed) < p ? CB : CA;
        const dx = (rnd1(i + 50, seed) - 0.5) * W * 0.24 * k;
        ctx.drawImage(src, 0, y, W, h, dx, y, W, h);
        if (dx !== 0){                                // 補住橫向位移露出的邊
          ctx.drawImage(src, 0, y, W, h, dx > 0 ? dx - W : dx + W, y, W, h);
        }
      }
      if (k > 0.45){
        ctx.fillStyle = `rgba(255,255,255,${((k - 0.45) * 0.3).toFixed(3)})`;
        fillEffect(0, 0, W, H);
      }
      break;
    }
    case 'pixel': {
      const src = p < 0.5 ? CA : CB;
      if (k < 0.03){ ctx.drawImage(src, 0, 0); break; }
      const n = Math.max(5, Math.round(300 * Math.pow(1 - k, 1.8)) + 5);
      _pix.width = n; _pix.height = Math.max(3, Math.round(n * H / W));
      _pctx.clearRect(0, 0, _pix.width, _pix.height);
      _pctx.drawImage(src, 0, 0, _pix.width, _pix.height);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(_pix, 0, 0, W, H);
      ctx.imageSmoothingEnabled = true;
      break;
    }
    case 'rgb': {                                    // 紅／青兩個色版錯開，中途換片
      const off = k * W * 0.035;
      const src = p < 0.5 ? CA : CB;
      const TC = B[2];
      const chan = color => {
        TC.x.globalCompositeOperation = 'source-over';
        TC.x.clearRect(0, 0, W, H);
        TC.x.drawImage(src, 0, 0);
        TC.x.globalCompositeOperation = 'multiply';
        TC.x.fillStyle = color; TC.x.fillRect(0, 0, W, H);
        if (opt.transparent){
          TC.x.globalCompositeOperation='destination-in'; TC.x.drawImage(src,0,0);
        }
        TC.x.globalCompositeOperation = 'source-over';
      };
      const z = 1 + 2 * off / W;                   // 放大一點，錯開後才不會露出單色邊條
      const zw = W * z, zh = H * z, zx = -(zw - W) / 2, zy = -(zh - H) / 2;
      chan('#ff0000');
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(TC.c, zx + off, zy, zw, zh);
      chan('#00ffff');
      ctx.drawImage(TC.c, zx - off, zy, zw, zh);
      ctx.globalCompositeOperation = 'source-over';
      break;
    }
    case 'shake': {
      const src = p < 0.5 ? CA : CB;
      const j = Math.floor(p * 44), z = 1.12;
      const dx = (rnd1(j, 1) - 0.5) * W * 0.05 * k;
      const dy = (rnd1(j, 2) - 0.5) * H * 0.05 * k;
      ctx.drawImage(src, -W * (z - 1) / 2 + dx, -H * (z - 1) / 2 + dy, W * z, H * z);
      break;
    }

    case 'ripple': {                                 // 邊緣會抖的圓，像水波推開
      const R = Math.hypot(W, H) / 2 * L * 1.08;
      const amp = W * 0.035 * (1 - L * 0.4);
      reveal(() => {
        for (let i = 0; i <= 100; i++){
          const th = i / 100 * TAU;
          const rr = R + Math.sin(th * 9 + p * 14) * amp;
          const px = W / 2 + Math.cos(th) * rr, py = H / 2 + Math.sin(th) * rr;
          i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
        }
        ctx.closePath();
      });
      break;
    }
    case 'radial': {                                 // 一層層放大疊出來的放射狀殘影
      const src = p < 0.5 ? CA : CB;
      const N = 7, spread = k * 0.16;
      ctx.globalAlpha = 1; ctx.drawImage(src, 0, 0);
      ctx.save();
      ctx.globalAlpha = 0.5;
      for (let i = 1; i <= N; i++){
        const z = 1 + spread * i / N;
        ctx.drawImage(src, W/2 - W*z/2, H/2 - H*z/2, W*z, H*z);
      }
      ctx.restore();
      break;
    }
    case 'melt': {                                   // 前段一柱一柱往下滑落，露出後段
      ctx.drawImage(CB, 0, 0);
      const n = 26, cw = W / n;
      for (let i = 0; i < n; i++){
        const d = rnd1(i, 17) * 0.35;
        const q = clamp((e - d) / (1 - d), 0, 1);
        const dy = q * q * H * 1.15;
        if (dy >= H) continue;
        ctx.drawImage(CA, i * cw, 0, cw + 1, H, i * cw, dy, cw + 1, H);
      }
      break;
    }
    case 'invert': {                                 // 中間閃一下負片
      ctx.drawImage(p < 0.5 ? CA : CB, 0, 0);
      if (opt.transparent && k > 0.35){
        ctx.clearRect(0,0,W,H);
        ctx.filter='invert('+((k-.35)/.65)+')';
        ctx.drawImage(p<.5 ? CA : CB,0,0);
        ctx.filter='none'; break;
      }
      if (k > 0.35){
        ctx.save();
        ctx.globalCompositeOperation = 'difference';
        ctx.globalAlpha = (k - 0.35) / 0.65;
        ctx.fillStyle = '#ffffff'; fillEffect(0, 0, W, H);
        ctx.restore();
      }
      break;
    }
    case 'zoomPunch': {                              // 前段猛地拉近，後段從遠處彈回來
      if (p < 0.5){
        const q = p * 2, z = 1 + q * q * 1.1;
        ctx.drawImage(CA, W/2 - W*z/2, H/2 - H*z/2, W*z, H*z);
      } else {
        const q = (p - 0.5) * 2, z = 2.1 - 1.1 * ease(q);
        ctx.drawImage(CB, W/2 - W*z/2, H/2 - H*z/2, W*z, H*z);
      }
      if (k > 0.6){ ctx.fillStyle = `rgba(255,255,255,${((k-0.6)*0.5).toFixed(3)})`; fillEffect(0,0,W,H); }
      break;
    }
    case 'noise': {                                  // 細格子亂數溶解，像老電視換台
      const cx = 64, cy = Math.max(12, Math.round(64 * H / W));
      const gw = W / cx, gh = H / cy;
      reveal(() => {
        for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++)
          if (rnd1(j * cx + i, 23) < L * 1.08) ctx.rect(i * gw, j * gh, gw + 0.6, gh + 0.6);
      });
      break;
    }

    default:
      ctx.drawImage(p < 0.5 ? CA : CB, 0, 0);
  }
  if (S.fx === 'rainbow'){
    /* 彩虹掃過：跟光暈掃過同一招，只是換成彩色漸層，底色先壓暗才看得出來 */
    const band = wmax * 0.75;
    const cx = xL - band + (wmax + band * 2) * S.fxP;
    const g = ctx.createLinearGradient(cx - band, 0, cx + band, 0);
    const cols = ['rgba(255,90,90,0)','#ff5a5a','#ffd93d','#4bd964','#38e1ff','#a06bff','rgba(160,107,255,0)'];
    cols.forEach((col, i) => g.addColorStop(i / (cols.length - 1), col));
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
    ctx.fillStyle = g;
    lines.forEach((ln, i) => ctx.fillText(ln, 0, y0 + i * lh));
    ctx.restore();
  }

  if (S.fx === 'scan'){
    /* 老電視開機：掃描線橫紋＋剛開機那道白光 */
    const q = S.fxP, boxH = lines.length * lh;
    ctx.save();
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
    ctx.globalAlpha = baseA * (1 - q) * 0.55;
    ctx.fillStyle = '#000000';
    for (let yy = y0 - lh; yy < y0 + boxH + lh; yy += Math.max(2, fs * 0.09))
      fillEffect(xL - fs * 0.5, yy, wmax + fs, Math.max(1, fs * 0.035));
    if (q < 0.3){
      ctx.globalAlpha = baseA * (1 - q / 0.3);
      ctx.fillStyle = '#ffffff';
      fillEffect(xL - fs * 0.6, -Math.max(1, fs * 0.05), wmax + fs * 1.2, Math.max(2, fs * 0.1));
    }
    ctx.restore();
  }

  if (S.fx === 'snow'){
    /* 雪花飄落：邊落邊左右晃，落到底就淡掉 */
    const q = S.fxP, boxH = lines.length * lh;
    ctx.save();
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 34; i++){
      const d = rnd1(i, 41) * 0.45;
      const qq = clamp((q - d) / (1 - d), 0, 1);
      if (qq <= 0) continue;
      const a = Math.sin(qq * Math.PI) * 0.9;
      if (a <= 0.02) continue;
      const px = (((i + rnd1(i, 42)) / 34) - 0.5) * (wmax * 1.7 + fs * 2);
      const py = -boxH - fs * 0.8 + qq * (boxH * 2.3 + fs * 2);
      const r = fs * (0.02 + rnd1(i, 43) * 0.035);
      ctx.globalAlpha = baseA * a;
      ctx.beginPath();
      ctx.arc(px + Math.sin(qq * 5 + i) * fs * 0.35, py, r, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  if (S.fx === 'spark'){
    /* 火花四射：從字的中線往外噴，帶一點重力 */
    const q = S.fxP, boxH = lines.length * lh;
    const COL = ['#fff3c4','#ffd93d','#ff9f43','#ff6b3d'];
    ctx.save();
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 40; i++){
      const a = Math.max(0, 1 - q * (0.8 + rnd1(i, 51) * 0.7));
      if (a <= 0.02) continue;
      const ang = rnd1(i, 52) * TAU;
      const sp = (0.35 + rnd1(i, 53)) * fs * 3.2;
      const px = (rnd1(i, 54) - 0.5) * wmax + Math.cos(ang) * sp * q;
      const py = (rnd1(i, 55) - 0.5) * boxH * 0.5 + Math.sin(ang) * sp * q + q * q * fs * 1.1;
      ctx.globalAlpha = baseA * a;
      ctx.fillStyle = COL[i % COL.length];
      ctx.beginPath();
      ctx.arc(px, py, fs * (0.02 + rnd1(i, 56) * 0.035), 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  if (S.fx === 'bubble'){
    /* 泡泡上升：只畫一圈邊，中間留一點高光 */
    const q = S.fxP, boxH = lines.length * lh;
    ctx.save();
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
    for (let i = 0; i < 26; i++){
      const d = rnd1(i, 61) * 0.4;
      const qq = clamp((q - d) / (1 - d), 0, 1);
      if (qq <= 0) continue;
      const a = Math.sin(qq * Math.PI) * 0.85;
      if (a <= 0.02) continue;
      const px = (((i + rnd1(i, 62)) / 26) - 0.5) * (wmax * 1.5 + fs * 1.6)
                 + Math.sin(qq * 4 + i) * fs * 0.3;
      const py = boxH * 0.9 + fs * 0.6 - qq * (boxH * 2.1 + fs * 1.6);
      const r = fs * (0.045 + rnd1(i, 63) * 0.075);
      ctx.globalAlpha = baseA * a;
      ctx.strokeStyle = 'rgba(255,255,255,.9)';
      ctx.lineWidth = Math.max(1, fs * 0.012);
      ctx.beginPath(); ctx.arc(px, py, r, 0, TAU); ctx.stroke();
      ctx.globalAlpha = baseA * a * 0.65;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(px - r * 0.32, py - r * 0.32, r * 0.22, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  ctx.restore();
  ctx.globalAlpha = 1;
  ctx.filter = 'none';
  ctx.globalCompositeOperation = 'source-over';
}

/* ── 標題 ──────────────────────────────────────────────────────
   進場 30 種 + 退場 13 種，兩邊可以分開選。
   一律用固定亂數，預覽跟匯出長得一模一樣。
   ─────────────────────────────────────────────────────────── */

/* 這幾種在進場跑完之後還要繼續動（波浪、游標閃爍、霓虹發光） */
const CONT_ANIMS = { wave:1, typeCursor:1, neon:1 };
const CHAR_ANIMS = { charFade:1, charBounce:1, charRise:1, wave:1,
                     charFlip:1, charSpin:1, charRandom:1, charDrop:1, charZoom:1 };

/** 把顏色調暗，光暈掃過時底色要先壓下來，掃過的地方才亮得出來 */
function shade(hex, k){
  const m = /^#?([0-9a-fA-F]{6})$/.exec(String(hex || ''));
  if (!m) return hex;
  const v = parseInt(m[1], 16);
  return `rgb(${Math.round(((v >> 16) & 255) * k)},${Math.round(((v >> 8) & 255) * k)},${Math.round((v & 255) * k)})`;
}

/** ctx.font 若被判定無效會保持原值（預設 10px），設完確認一次，不對就退回預設字體 */
function setFont(ctx, bold, fs, fam){
  ctx.font = `${bold ? '700 ' : '400 '}${fs}px ${fam}`;
  if (ctx.font.indexOf(`${fs}px`) < 0 && Math.abs(parseFloat(ctx.font) - fs) > 1)
    ctx.font = `${bold ? '700 ' : '400 '}${fs}px ${FONTS[0].id}`;
}

/** 進場動畫：把 p（0→1）換算成位移、透明度、縮放等等 */
function applyAnimIn(id, p, life, S, W, H, s){
  if (!id || id === 'none') return;
  if (p >= 1 && !CONT_ANIMS[id]) return;
  const e = ease(p);
  switch (id){
    /* 淡入 */
    case 'fade':     S.alpha *= e; break;
    case 'fadeUp':   S.alpha *= e; S.dy =  (1 - e) * H * 0.07; break;
    case 'fadeDown': S.alpha *= e; S.dy = -(1 - e) * H * 0.07; break;
    case 'blur':     S.alpha *= e; S.blur = (1 - e) * 18 * s; break;
    case 'fadeScale':  S.alpha *= e; S.sx = S.sy = 0.86 + 0.14 * e; break;
    case 'fadeBlurUp': S.alpha *= e; S.blur = (1 - e) * 14 * s; S.dy = (1 - e) * H * 0.05; break;
    /* 位移 */
    case 'slideR':   S.alpha *= e; S.dx = -(1 - e) * W * 0.28; break;
    case 'slideL':   S.alpha *= e; S.dx =  (1 - e) * W * 0.28; break;
    case 'slideU':   S.alpha *= e; S.dy =  (1 - e) * H * 0.18; break;
    case 'slideD':   S.alpha *= e; S.dy = -(1 - e) * H * 0.18; break;
    case 'springR':  S.alpha *= clamp(p * 3, 0, 1); S.dx = -(1 - easeBack(p)) * W * 0.28; break;
    case 'maskUp':   S.mask = 1; S.maskDy = (1 - e); break;
    case 'slideDL':  S.alpha *= e; S.dx = -(1 - e) * W * 0.20; S.dy = -(1 - e) * H * 0.16; break;
    case 'slideDR':  S.alpha *= e; S.dx =  (1 - e) * W * 0.20; S.dy = -(1 - e) * H * 0.16; break;
    case 'whip':                                     // 甩過來的殘影感：位移＋旋轉＋殘留模糊
      S.alpha *= clamp(p * 2.5, 0, 1);
      S.dx = -(1 - easeBack(p)) * W * 0.42;
      S.rot = (1 - e) * 0.22;
      S.blur = (1 - e) * (1 - e) * 26 * s;
      break;
    case 'glide': {                                  // 長距離滑進來，最後幾乎停住
      const q = 1 - Math.pow(1 - p, 5);
      S.alpha *= clamp(p * 2, 0, 1);
      S.dx = -(1 - q) * W * 0.55;
      break;
    }
    /* 縮放旋轉 */
    case 'pop':      S.alpha *= clamp(p * 2, 0, 1); S.sx = S.sy = 0.4 + 0.6 * easeBack(p); break;
    case 'zoomIn':   S.alpha *= clamp(p * 1.6, 0, 1); S.sx = S.sy = 2.4 - 1.4 * e; break;
    case 'rotate':   S.alpha *= e; S.rot = (1 - e) * -0.45; S.sx = S.sy = 0.7 + 0.3 * e; break;
    case 'flip':     S.alpha *= clamp(p * 2.5, 0, 1); S.sy = Math.max(0.02, Math.sin(p * Math.PI / 2)); break;
    case 'spring': {                                   // 阻尼彈簧，會來回幾下才停
      S.alpha *= clamp(p * 4, 0, 1);
      const w0 = 13, z = 0.32;
      S.sx = S.sy = Math.max(0.02,
        1 - Math.exp(-z * w0 * p) * Math.cos(w0 * Math.sqrt(1 - z * z) * p));
      break;
    }
    case 'swing':
      S.alpha *= clamp(p * 3, 0, 1);
      S.rot = Math.exp(-4 * p) * Math.sin(p * Math.PI * 4) * 0.5;
      break;
    case 'flipY':                                    // 沿垂直軸翻進來
      S.alpha *= clamp(p * 2.5, 0, 1);
      S.sx = Math.max(0.02, Math.sin(p * Math.PI / 2));
      break;
    case 'heartbeat': {                              // 咚、咚兩下
      S.alpha *= clamp(p * 3, 0, 1);
      const pulse = Math.exp(-3.2 * p) * (Math.sin(p * Math.PI * 5) * 0.5);
      S.sx = S.sy = Math.max(0.05, 0.7 + 0.3 * ease(p) + pulse);
      break;
    }
    case 'breathe':                                  // 慢慢撐開，最後輕輕收一下
      S.alpha *= ease(clamp(p * 1.3, 0, 1));
      S.sx = S.sy = 0.82 + 0.18 * e + Math.sin(p * Math.PI) * 0.06;
      break;
    case 'stamp': {                                  // 從很大砸下來，落地抖一下
      const q = clamp(p / 0.55, 0, 1);
      S.alpha *= clamp(p * 4, 0, 1);
      S.sx = S.sy = 2.6 - 1.6 * (1 - Math.pow(1 - q, 4));
      if (p > 0.55){
        const r = (p - 0.55) / 0.45, j = Math.exp(-7 * r) * Math.sin(r * Math.PI * 5);
        S.dx = j * W * 0.012; S.dy = j * H * 0.014;
      }
      break;
    }
    /* 逐字 */
    case 'type':
      S.text = S.text.slice(0, Math.max(0, Math.ceil(p * S.text.length)));
      break;
    case 'typeCursor': {
      const n = S.text.length;
      S.text = S.text.slice(0, Math.max(0, Math.ceil(p * n)));
      if (p < 1 || Math.floor(life * 3) % 2 === 0) S.text += '▌';
      break;
    }
    case 'charFade': case 'charBounce': case 'charRise': case 'wave':
    case 'charFlip': case 'charSpin': case 'charRandom': case 'charDrop': case 'charZoom':
      S.char = id; S.charP = p; S.charLife = life;
      break;
    /* 特效 */
    case 'sprinkle':
      S.fx = 'sprinkle'; S.fxP = p;
      S.alpha *= ease(clamp(p * 1.5, 0, 1));
      S.dy = (1 - e) * H * 0.03;
      break;
    case 'particle':
      S.fx = 'particle'; S.fxP = p;
      S.alpha *= ease(clamp((p - 0.1) / 0.9, 0, 1));
      break;
    case 'shine':
      S.fx = 'shine'; S.fxP = p;
      S.alpha *= ease(clamp(p * 2.2, 0, 1));
      S.dim = 0.45;                                    // 底色先壓暗，白字才看得到光帶掃過
      break;
    case 'draw':
      S.fx = 'draw'; S.fxP = p;
      break;
    case 'neon': {
      S.glow = 1;
      if (p < 1){
        const seq = [0, .95, .05, .6, 0, 1, .15, 1, .55, 1];
        S.alpha *= seq[Math.min(seq.length - 1, Math.floor(p * seq.length))];
      }
      break;
    }
    case 'glitchT': {
      S.fx = 'glitch'; S.fxP = p;
      S.alpha *= clamp(p * 2, 0, 1);
      S.dx = (rnd1(Math.floor(p * 18), 3) - 0.5) * W * 0.03 * (1 - p);
      break;
    }
    case 'shake': {
      S.alpha *= clamp(p * 4, 0, 1);
      const amp = (1 - p) * W * 0.014, j = Math.floor(life * 45);
      S.dx = (rnd1(j, 1) - 0.5) * 2 * amp;
      S.dy = (rnd1(j, 2) - 0.5) * 2 * amp;
      break;
    }
    case 'snow':
      S.fx = 'snow'; S.fxP = p;
      S.alpha *= ease(clamp(p * 1.5, 0, 1));
      break;
    case 'spark':
      S.fx = 'spark'; S.fxP = p;
      S.alpha *= ease(clamp(p * 2, 0, 1));
      S.sx = S.sy = 0.8 + 0.2 * e;
      break;
    case 'bubble':
      S.fx = 'bubble'; S.fxP = p;
      S.alpha *= ease(clamp(p * 1.4, 0, 1));
      S.dy = (1 - e) * H * 0.04;
      break;
    case 'scanline':                                 // 老電視開機：先一條線再展開
      S.fx = 'scan'; S.fxP = p;
      S.alpha *= clamp(p * 5, 0, 1);
      S.sy = Math.max(0.02, ease(clamp(p / 0.45, 0, 1)));
      S.sx = 0.3 + 0.7 * clamp(p / 0.25, 0, 1);
      break;
    case 'rainbow':
      S.fx = 'rainbow'; S.fxP = p;
      S.alpha *= ease(clamp(p * 2.2, 0, 1));
      S.dim = 0.55;
      break;
    case 'dropIn':
      if (p < 0.7){
        const q = p / 0.7;
        S.dy = -(1 - q * q) * H * 0.5;
        S.alpha *= clamp(q * 3, 0, 1);
      } else {
        const q = (p - 0.7) / 0.3;
        const b = Math.exp(-5 * q) * Math.sin(q * Math.PI * 3);
        S.sy = 1 - b * 0.25; S.sx = 1 + b * 0.25;
      }
      break;
  }
}

/** 退場動畫。po：1 = 還沒開始退，0 = 完全退掉 */
function applyAnimOut(id, po, S, W, H, s){
  if (!id || id === 'none' || po >= 1) return;
  const o = 1 - po, e = ease(o);
  switch (id){
    case 'fade':     S.alpha *= po; break;
    case 'fadeUp':   S.alpha *= po; S.dy -= e * H * 0.07; break;
    case 'fadeDown': S.alpha *= po; S.dy += e * H * 0.07; break;
    case 'slideL':   S.alpha *= clamp(po * 2, 0, 1); S.dx -= e * W * 0.35; break;
    case 'slideR':   S.alpha *= clamp(po * 2, 0, 1); S.dx += e * W * 0.35; break;
    case 'slideU':   S.alpha *= clamp(po * 2, 0, 1); S.dy -= e * H * 0.25; break;
    case 'slideD':   S.alpha *= clamp(po * 2, 0, 1); S.dy += e * H * 0.25; break;
    case 'zoomOut':  S.alpha *= po; S.sx *= (1 - e * 0.75); S.sy *= (1 - e * 0.75); break;
    case 'pop':      S.alpha *= po; S.sx *= (1 + e * 0.7);  S.sy *= (1 + e * 0.7); break;
    case 'blur':     S.alpha *= po; S.blur += e * 18 * s; break;
    case 'spin':     S.alpha *= po; S.rot += e * 0.9; S.sx *= (1 - e * 0.6); S.sy *= (1 - e * 0.6); break;
    case 'maskDown': S.mask = 1; S.maskDy = e; break;
    case 'shrinkUp': S.alpha *= po; S.sx *= (1 - e * 0.6); S.sy *= (1 - e * 0.6); S.dy -= e * H * 0.10; break;
    case 'whipOut':
      S.alpha *= clamp(po * 1.6, 0, 1);
      S.dx += e * e * W * 0.55; S.rot += e * 0.25; S.blur += e * e * 26 * s;
      break;
    case 'charOut':                                  // 逐字消失，退場自己接管逐字繪製
      S.char = 'charOutFade'; S.charP = po; S.charLife = 0;
      break;
    case 'glitchOut':
      S.fx = 'glitch'; S.fxP = po;
      S.alpha *= clamp(po * 1.5, 0, 1);
      S.dx += (rnd1(Math.floor(o * 18), 5) - 0.5) * W * 0.04 * e;
      break;
    case 'flipOut': S.alpha *= clamp(po * 2, 0, 1); S.sy *= Math.max(0.02, 1 - e); break;
  }
}

/** 逐字動畫：第 i 個字現在的狀態。dy 的單位是「字級的幾倍」 */
function charState(mode, i, n, p, life){
  // 每個字的起跑點錯開，最後一個字大約在 62% 的時候才開始動
  const stag = mode === 'charRandom' ? rnd1(i, 31) * 0.62 : (n <= 1 ? 0 : (i / n) * 0.62);
  const q = clamp((p - stag) / 0.38, 0, 1);
  const qe = ease(q);
  const R = { a: qe, dx: 0, dy: 0, sc: 1, sy: 1, rot: 0 };
  switch (mode){
    case 'charFade':   return R;
    case 'charRandom': return R;
    case 'charRise':   R.dy = (1 - qe) * 0.9; return R;
    case 'charBounce': R.a = clamp(q * 3, 0, 1); R.sc = Math.max(0.02, 0.3 + 0.7 * easeBack(q)); return R;
    case 'wave':       R.dy = Math.sin(life * 5 - i * 0.55) * 0.13; return R;
    case 'charFlip':   R.a = clamp(q * 2.5, 0, 1); R.sy = Math.max(0.02, Math.sin(q * Math.PI / 2)); return R;
    case 'charSpin':   R.rot = (1 - qe) * -1.1; R.sc = Math.max(0.02, 0.4 + 0.6 * qe); return R;
    case 'charZoom':   R.a = clamp(q * 2, 0, 1); R.sc = Math.max(0.02, 3.2 - 2.2 * qe); return R;
    case 'charDrop': { R.a = clamp(q * 4, 0, 1);
                       const b = q < 0.75 ? -(1 - Math.pow(q / 0.75, 2)) * 1.4
                                          : Math.exp(-9 * (q - 0.75)) * Math.sin((q - 0.75) * Math.PI * 4) * 0.18;
                       R.dy = b; return R; }
    case 'charOutFade': {                              // 退場：p 從 1 掉到 0，字一個一個不見
      const qq = clamp((p - (n <= 1 ? 0 : (i / n) * 0.5)) / 0.5, 0, 1);
      R.a = ease(qq); R.dy = (1 - qq) * -0.5; return R;
    }
  }
  return { a: 1, dx: 0, dy: 0, sc: 1, sy: 1, rot: 0 };
}

function drawTitle(ctx, t, T, W, H){
  if (T < t.start - 1e-6 || T > t.end + 1e-6) return;
  const s = H / 1080;
  const life = T - t.start;
  const span = Math.max(0.05, t.end - t.start);
  const inD  = Math.max(0.01, Math.min(t.animDur == null ? 0.6 : t.animDur, span * 0.95));
  const outId = t.animOut == null ? 'fade' : t.animOut;           // 舊專案沒有這個欄位 → 沿用原本的淡出
  const outD = Math.max(0.01, Math.min(t.animOutDur == null ? 0.4 : t.animOutDur, span * 0.95));
  const pi = clamp(life / inD, 0, 1);
  const po = clamp((span - life) / outD, 0, 1);

  const S = { text: String(t.text), alpha: 1, dx: 0, dy: 0, rot: 0, sx: 1, sy: 1,
              blur: 0, glow: 0, mask: 0, maskDy: 0, dim: 1, char: null, charP: 1, charLife: 0,
              fx: null, fxP: 1 };
  applyAnimIn(t.animIn, pi, life, S, W, H, s);
  applyAnimOut(outId, po, S, W, H, s);
  if (S.alpha <= 0.002) return;

  const lines = S.text.split('\n');
  // 「大小」＝這行字實際要畫多高（px），再回推該用多少字級，
  // 所以換任何字體、就算被替代字體接手，看起來都一樣大
  const fam = safeFont(t.font);
  const fs = clamp(kfAt(t, 'size', t.size, T) * s * sizeCorrection(fam, t.bold, String(t.text).replace(/\n/g, '')), 4, 4000);
  const lh = fs * 1.28;
  // 動畫給的是相對量（S.*），關鍵幀改的是基準值，兩者相乘／相加疊在一起
  const baseA = clamp(S.alpha, 0, 1) * clamp(kfAt(t, 'opacity', t.opacity == null ? 1 : t.opacity, T), 0, 1);
  if (baseA <= 0.002) return;

  ctx.save();
  ctx.globalAlpha = baseA;
  ctx.translate(kfAt(t, 'x', t.x, T) * W + S.dx, kfAt(t, 'y', t.y, T) * H + S.dy);
  const rotation = S.rot + kfAt(t, 'rot', Number.isFinite(t.rot) ? t.rot : 0, T) * Math.PI / 180;
  if (rotation) ctx.rotate(rotation);
  if (S.sx !== 1 || S.sy !== 1) ctx.scale(S.sx, S.sy);
  if (S.blur > 0.3) ctx.filter = `blur(${S.blur.toFixed(1)}px)`;
  setFont(ctx, t.bold, fs, fam);
  ctx.textAlign = t.align;
  ctx.textBaseline = 'middle';
  if (t.shadow){ ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = fs * 0.18; ctx.shadowOffsetY = fs * 0.05; }
  if (S.glow){ ctx.shadowColor = t.color; ctx.shadowBlur = fs * 0.6; ctx.shadowOffsetY = 0; }

  const y0 = -(lines.length - 1) * lh / 2;
  const wmax = Math.max(fs, ...lines.map(l => ctx.measureText(l).width));
  const xL = t.align === 'center' ? -wmax / 2 : t.align === 'right' ? -wmax : 0;

  const strokeLine = (ln, x, y) => {
    if (!(t.strokeW > 0)) return;
    ctx.lineWidth = t.strokeW * s * 2;
    ctx.strokeStyle = t.stroke;
    ctx.lineJoin = 'round';
    ctx.strokeText(ln, x, y);
  };
  const baseColor = S.dim < 1 ? shade(t.color, S.dim) : t.color;
  const drawLines = () => lines.forEach((ln, i) => {
    const y = y0 + i * lh;
    strokeLine(ln, 0, y);
    ctx.fillStyle = baseColor;
    ctx.fillText(ln, 0, y);
  });

  if (S.mask){
    /* 遮罩推移：只露出行框裡的部分，文字從框外滑進來 */
    ctx.save();
    ctx.beginPath();
    ctx.rect(xL - fs * 0.35, y0 - lh * 0.62, wmax + fs * 0.7, lines.length * lh + lh * 0.24);
    ctx.clip();
    ctx.translate(0, S.maskDy * (lines.length * lh + lh * 0.3));
    drawLines();
    ctx.restore();

  } else if (S.char){
    /* 逐字：每個字有自己的透明度、位移、縮放 */
    const total = lines.reduce((n, l) => n + [...l].length, 0) || 1;
    const prevAlign = ctx.textAlign;
    ctx.textAlign = 'center';
    let gi = 0;
    lines.forEach((ln, li) => {
      const chars = [...ln];
      const w = ctx.measureText(ln).width;
      let x = t.align === 'center' ? -w / 2 : t.align === 'right' ? -w : 0;
      const y = y0 + li * lh;
      for (const ch of chars){
        const cw = ctx.measureText(ch).width;
        const cs = charState(S.char, gi, total, S.charP, S.charLife);
        if (cs.a > 0.004 && ch !== ' '){
          ctx.save();
          ctx.globalAlpha = baseA * cs.a;
          ctx.translate(x + cw / 2 + (cs.dx || 0) * fs, y + cs.dy * fs);
          if (cs.rot) ctx.rotate(cs.rot);
          if (cs.sc !== 1 || cs.sy !== 1) ctx.scale(cs.sc, cs.sc * (cs.sy == null ? 1 : cs.sy));
          strokeLine(ch, 0, 0);
          ctx.fillStyle = t.color;
          ctx.fillText(ch, 0, 0);
          ctx.restore();
        }
        x += cw; gi++;
      }
    });
    ctx.textAlign = prevAlign;

  } else if (S.fx === 'draw'){
    /* 手寫描邊：先由左往右把外框畫出來，後半段才上色 */
    const q = S.fxP;
    ctx.save();
    ctx.beginPath();
    ctx.rect(xL - fs * 0.4, y0 - lh, (wmax + fs * 0.8) * clamp(q / 0.72, 0, 1), lines.length * lh + lh * 2);
    ctx.clip();
    ctx.lineWidth = Math.max(1.2, fs * 0.028);
    ctx.strokeStyle = t.color;
    ctx.lineJoin = 'round';
    lines.forEach((ln, i) => ctx.strokeText(ln, 0, y0 + i * lh));
    ctx.restore();
    const fa = clamp((q - 0.45) / 0.55, 0, 1);
    if (fa > 0.004){
      ctx.save();
      ctx.globalAlpha = baseA * fa;
      ctx.fillStyle = t.color;
      lines.forEach((ln, i) => ctx.fillText(ln, 0, y0 + i * lh));
      ctx.restore();
    }

  } else {
    drawLines();
  }

  /* ── 疊在文字上的額外特效 ─────────────────────── */
  if (S.fx === 'shine'){
    const band = wmax * 0.42;
    const cx = xL - band + (wmax + band * 2) * S.fxP;
    const g = ctx.createLinearGradient(cx - band, 0, cx + band, 0);
    g.addColorStop(0,   'rgba(255,255,255,0)');
    g.addColorStop(0.5, 'rgba(255,255,255,.92)');
    g.addColorStop(1,   'rgba(255,255,255,0)');
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
    ctx.fillStyle = g;
    lines.forEach((ln, i) => ctx.fillText(ln, 0, y0 + i * lh));
    lines.forEach((ln, i) => ctx.fillText(ln, 0, y0 + i * lh));
    ctx.restore();
  }

  if (S.fx === 'glitch'){
    const off = (1 - S.fxP) * fs * 0.13;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,40,40,.5)';
    lines.forEach((ln, i) => ctx.fillText(ln,  off, y0 + i * lh));
    ctx.fillStyle = 'rgba(40,220,255,.5)';
    lines.forEach((ln, i) => ctx.fillText(ln, -off, y0 + i * lh));
    ctx.restore();
  }

  if (S.fx === 'sprinkle'){
    /* 灑花：小花瓣從標題上方飄下來，位置固定亂數 */
    const q = S.fxP, boxH = lines.length * lh;
    const COL = ['#ffd1e8','#ffe6a7','#c9f0d8','#cfe3ff','#ffc9c9','#f3d1ff'];
    ctx.save();
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
    for (let i = 0; i < 30; i++){
      const d = rnd1(i, 1) * 0.42;
      const qq = clamp((q - d) / (1 - d), 0, 1);
      if (qq <= 0) continue;
      const a = Math.sin(qq * Math.PI) * 0.95;
      if (a <= 0.02) continue;
      const px = (((i + rnd1(i, 2)) / 30) - 0.5) * (wmax * 1.6 + fs * 2.4);
      const py = -boxH * 0.95 - fs * 0.7 + qq * (boxH * 2.2 + fs * 1.8);
      const r = fs * (0.075 + rnd1(i, 4) * 0.06);
      ctx.save();
      ctx.globalAlpha = baseA * a;
      ctx.translate(px + Math.sin(qq * 6 + i) * fs * 0.28, py);
      ctx.rotate(qq * 4 + rnd1(i, 3) * 6);
      ctx.fillStyle = COL[i % COL.length];
      for (let k = 0; k < 5; k++){
        ctx.beginPath();
        ctx.ellipse(Math.cos(k * TAU / 5) * r * 0.85, Math.sin(k * TAU / 5) * r * 0.85,
                    r * 0.62, r * 0.42, k * TAU / 5, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }
    ctx.restore();
  }

  if (S.fx === 'particle'){
    /* 粒子飄散：光點從四面八方收攏到字上 */
    const q = S.fxP, k = 1 - ease(q), boxH = lines.length * lh;
    const a0 = Math.sin(clamp(q * 1.25, 0, 1) * Math.PI) * 0.9;
    if (a0 > 0.02){
      ctx.save();
      ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
      ctx.fillStyle = t.color;
      for (let i = 0; i < 44; i++){
        const ang = rnd1(i, 5) * TAU;
        const dist = (0.35 + rnd1(i, 6)) * fs * 3.4 * k;
        ctx.globalAlpha = baseA * a0 * (0.5 + rnd1(i, 9) * 0.5);
        ctx.beginPath();
        ctx.arc((rnd1(i, 7) - 0.5) * wmax + Math.cos(ang) * dist,
                (rnd1(i, 8) - 0.5) * boxH + Math.sin(ang) * dist,
                fs * 0.075, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  ctx.restore();
  ctx.globalAlpha = 1;
  ctx.filter = 'none';
  ctx.globalCompositeOperation = 'source-over';
}

/* ── 字幕 ──────────────────────────────────────────────────────
   一整批共用同一個樣式；文字太長會自動換行（中文按字斷、英文按詞斷）。
   ─────────────────────────────────────────────────────────── */
function wrapText(ctx, text, maxW){
  const out = [];
  for (const para of String(text).split('\n')){
    if (ctx.measureText(para).width <= maxW){ out.push(para); continue; }
    let line = '';
    // 有空白就先按詞斷，沒有（中文）就按字斷
    const toks = /\s/.test(para) ? para.split(/(\s+)/) : [...para];
    for (const tk of toks){
      const test = line + tk;
      if (ctx.measureText(test).width > maxW && line.trim() !== ''){
        out.push(line.trim()); line = tk.replace(/^\s+/, '');
      } else line = test;
    }
    if (line.trim() !== '') out.push(line.trim());
  }
  return out.length ? out : [''];
}

function drawSubs(ctx, T, W, H){
  if (!A.subs.length) return;
  for(const track of [0,1]){
    const cue=A.subs.find(c=>subTrack(c)===track&&T>=c.start-1e-6&&T<c.end);
    if(cue&&String(cue.text).trim())drawSubCue(ctx,cue,subStyleFor(track),W,H);
  }
}
function drawSubCue(ctx,cue,st,W,H){
  const s=H/1080;

  const fam = safeFont(st.font);
  const fs = clamp(st.size * s * sizeCorrection(fam, st.bold, cue.text), 6, 4000);
  const lh = fs * 1.3, maxW = W * st.maxW;

  ctx.save();
  ctx.font = `${st.bold ? '700 ' : '400 '}${fs}px ${fam}`;
  const lines = wrapText(ctx, cue.text, maxW);
  const boxW = Math.min(maxW, Math.max(...lines.map(l => ctx.measureText(l).width))) + fs * 0.7;
  const boxH = lines.length * lh + fs * 0.36;
  const cx = W / 2;
  const top = st.pos === 'top' ? H * st.marginY : H - H * st.marginY - boxH;

  if (st.box){
    ctx.globalAlpha = clamp(st.boxOpacity, 0, 1);
    ctx.fillStyle = st.boxColor;
    const r = fs * 0.22;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(cx - boxW/2, top, boxW, boxH, r)
                  : ctx.rect(cx - boxW/2, top, boxW, boxH);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (st.shadow){ ctx.shadowColor = 'rgba(0,0,0,.72)'; ctx.shadowBlur = fs * 0.22; ctx.shadowOffsetY = fs * 0.06; }
  lines.forEach((ln, i) => {
    const y = top + fs * 0.18 + lh * (i + 0.5);
    if (st.strokeW > 0){
      ctx.lineWidth = st.strokeW * s * 2;
      ctx.strokeStyle = st.stroke;
      ctx.lineJoin = 'round';
      ctx.strokeText(ln, cx, y);
    }
    ctx.fillStyle = st.color;
    ctx.fillText(ln, cx, y);
  });
  ctx.restore();
}

/* ── 單張影格 ──────────────────────────────────────────────── */
function renderFrame(ctx, T, W, H){
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  for (const act of activeTracksAt(T)){
    const upper = act.track === 1;
    const layer = bufs('clipLayer'+act.track+W+'x'+H,1,W,H)[0];
    const target = layer.x;
    const paint = upper ? (x,ref,w,h) => {
      if (!ref){ x.clearRect(0,0,w,h); return; }
      paintClip(x,{...ref,transparent:true},w,h);
    } : paintClip;
    const opt = {key:'videoTrack'+act.track+W+'x'+H,paint,transparent:upper};
    if (act.intro) drawTransition(target,act.intro.type,act.intro.p,null,act.a,W,H,opt);
    else if (act.b) drawTransition(target,act.type,act.p,act.a,act.b,W,H,opt);
    else if (act.out) drawTransition(target,act.out.type,act.out.p,act.a,null,W,H,opt);
    else paint(target,act.a,W,H);
    ctx.save();ctx.globalAlpha=clipFadeGain(act.a.clip,T,layout()[act.idx]);
    ctx.drawImage(layer.c,0,0);ctx.restore();
  }
  for (const o of A.overlays) drawOverlay(ctx, o, T, W, H);   // 疊圖在影片之上
  drawSubs(ctx, T, W, H);                                      // 字幕
  for (const t of A.titles) drawTitle(ctx, t, T, W, H);       // 標題在最上面
}
