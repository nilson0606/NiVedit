/* GIF 疊圖：先解出完整透明畫格，再用時間軸時間選幀。
   不依賴 <img> 的牆鐘動畫，預覽／seek／匯出使用同一份畫格。
   ImageDecoder 處理 GIF 的局部畫格、透明度與 disposal 合成。 */
let _gifCache = new WeakMap();
const _gifAssets = new Set();
let _gifBytes = 0, _gifEpoch = 0;
const GIF_MEMORY_LIMIT = 256 * 1024 * 1024;
const GIF_ASSET_LIMIT = 128 * 1024 * 1024;

function closeGifAsset(g){
  if (!g || g.closed) return;
  g.closed = true;
  for (const f of g.frames) f.close();
  g.frames.length = 0;
  _gifAssets.delete(g);
  _gifBytes = Math.max(0, _gifBytes - g.bytes);
}

// 目前專案及復原／重做仍用到的畫格保留，其餘釋放。
function pruneGifMedia(){
  const keep = new Set(A.overlays.map(o => o._gif).filter(Boolean));
  for (const json of [..._undo, ..._redo]){
    for (const o of JSON.parse(json).overlays || []){
      const m = MEDIA.get(o.id);
      if (m && m._gif) keep.add(m._gif);
    }
  }
  for (const g of _gifAssets) if (!g.pending && !keep.has(g)) closeGifAsset(g);
  for (const m of MEDIA.values()) if (m._gif && m._gif.closed) delete m._gif;
}

function clearGifMedia(){
  ++_gifEpoch;                         // 取消舊專案尚在解碼的 GIF
  for (const g of _gifAssets) closeGifAsset(g);
  _gifCache = new WeakMap();
  _gifBytes = 0;
  for (const m of MEDIA.values()) delete m._gif;
}

async function decodeOverlayGif(file, epoch = _gifEpoch){
  // 看檔頭，不只看副檔名：專案重新綁定後 MIME 可能是空的。
  const sig = new Uint8Array(await file.slice(0, 10).arrayBuffer());
  const magic = String.fromCharCode(...sig.subarray(0, 6));
  if (magic !== 'GIF87a' && magic !== 'GIF89a') return null;
  if (typeof ImageDecoder === 'undefined' || !await ImageDecoder.isTypeSupported('image/gif'))
    throw new Error(L('此瀏覽器不支援 GIF 動畫解碼，請更新 Edge 後重試。'));
  const w = sig[6] | (sig[7] << 8), h = sig[8] | (sig[9] << 8);
  if (!w || !h || w * h * 4 > GIF_ASSET_LIMIT)
    throw new Error(L('GIF 動畫太大，請縮小尺寸或縮短動畫後再匯入。'));
  const frames = [], ends = [];
  let decoder = null, bytes = 0, reserved = false, duration = 0;
  const check = () => { if (epoch !== _gifEpoch) throw new Error(L('專案已切換，GIF 載入已取消。')); };
  try {
    const data = await file.arrayBuffer();
    check();
    decoder = new ImageDecoder({ data, type:'image/gif', preferAnimation:true });
    await Promise.all([decoder.tracks.ready, decoder.completed]);
    check();
    const track = decoder.tracks.selectedTrack;
    if (!track || !track.frameCount) throw new Error(L('GIF 沒有可讀取的畫格。'));
    bytes = w * h * 4 * track.frameCount;
    if (!Number.isSafeInteger(bytes) || bytes > GIF_ASSET_LIMIT)
      throw new Error(L('GIF 動畫太大，請縮小尺寸或縮短動畫後再匯入。'));
    if (_gifBytes + bytes > GIF_MEMORY_LIMIT)
      throw new Error(L('GIF 動畫記憶體不足，請縮小素材或另開專案後再試。'));
    _gifBytes += bytes; reserved = true;
    for (let i = 0; i < track.frameCount; ++i){
      check();
      const { image } = await decoder.decode({ frameIndex:i, completeFramesOnly:true });
      try {
        // 使用完整合成畫格；立刻關閉 VideoFrame，避免耗盡解碼器資源。
        const bitmap = await createImageBitmap(image);
        frames.push(bitmap);
        duration += Number.isFinite(image.duration) && image.duration > 0 ? image.duration : 100000;
        ends.push(duration);
      } finally { image.close(); }
    }
    check();
    const g = { frames, ends, duration, bytes, closed:false, pending:true };
    _gifAssets.add(g);
    return g;
  } catch(e){
    for (const f of frames) f.close();
    if (reserved && epoch === _gifEpoch) _gifBytes = Math.max(0, _gifBytes - bytes);
    throw e;
  } finally { if (decoder) decoder.close(); }
}

async function getOverlayGif(file){
  const cache = _gifCache, epoch = _gifEpoch;
  const old = cache.get(file);
  if (old){
    const g = await old;
    if (epoch !== _gifEpoch) throw new Error(L('專案已切換，GIF 載入已取消。'));
    if (!g || !g.closed) return g;
  }
  const pending = decodeOverlayGif(file, epoch);
  cache.set(file, pending);
  try { return await pending; }
  catch(e){ cache.delete(file); throw e; }
}

async function loadOverlayImage(file){
  const epoch = _gifEpoch;
  const loaded = await loadImage(file);
  try {
    if (epoch !== _gifEpoch) throw new Error(L('專案已切換，GIF 載入已取消。'));
    const gif = await getOverlayGif(file);
    if (epoch !== _gifEpoch) throw new Error(L('專案已切換，GIF 載入已取消。'));
    return { ...loaded, gif };
  }
  catch(e){ URL.revokeObjectURL(loaded.url); throw e; }
}

function overlaySourceAt(o, T){
  const g = o._gif;
  if (!g || g.closed) return o.img;
  // 疊圖存活期間循環；左右裁切與分割用 gifOffset 保留原動畫相位。
  const us = Math.round((T - o.start + (o.gifOffset || 0)) * 1e6);
  const t = ((us % g.duration) + g.duration) % g.duration;
  let lo = 0, hi = g.ends.length - 1;
  while (lo < hi){
    const mid = (lo + hi) >> 1;
    if (t < g.ends[mid]) hi = mid; else lo = mid + 1;
  }
  return g.frames[lo];
}
