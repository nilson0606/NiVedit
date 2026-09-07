/* ==========================================================================
   NiVedit — 連續解碼（Stage 2 · 匯出加速）

   舊做法：每一幀都 video.currentTime = t 然後等 seeked，一次來回數十毫秒。
   新做法：用 mp4box.js 把 MP4/MOV 拆成原始編碼封包，餵給 VideoDecoder
           一路往前解，輸出時間也是一路往前，兩邊都不用回頭。

   任何一步失敗（容器不支援、編碼器不支援、檔案有問題）都回傳 null，
   匯出流程會自動退回原本的逐幀 seek，不會讓使用者匯不出來。
   ========================================================================== */
'use strict';

/* 不受背景分頁節流影響的讓出方式 */
/* 預取幾幀。實機量出來的結果：
     1 幀 → 取幀 80.8ms（每格都在等 GPU 來回）
     4 幀 → 60.4ms
    10 幀 → 70.9ms（反而變慢：解碼器輸出池裝不下，它停住不吐，我們白等）
   最佳值取決於那台機器的解碼器輸出池有多大，猜不準 ——
   所以改成自己找：從 4 開始，湊不滿就往下修，很順就往上加一點。 */
const PREFETCH_START = 4, PREFETCH_MAX = 8;

const decYield = (() => {
  const ch = new MessageChannel();
  const q = [];
  ch.port1.onmessage = () => { const r = q.shift(); if (r) r(); };
  return () => new Promise(res => { q.push(res); ch.port2.postMessage(0); });
})();

/** 把整個檔案讀進來，交給 mp4box 拆解，取出影像軌與所有封包 */
function demuxMP4(file){
  return new Promise((res, rej) => {
    if (typeof MP4Box === 'undefined') return rej(new Error('沒有 mp4box'));
    const mp4 = MP4Box.createFile();
    let info = null;
    const samples = [];
    const to = setTimeout(() => rej(new Error('拆解逾時')), 25000);

    mp4.onError = e => { clearTimeout(to); rej(new Error('拆解失敗：' + e)); };
    mp4.onReady = i => {
      info = i;
      const vt = i.videoTracks && i.videoTracks[0];
      if (!vt){ clearTimeout(to); return rej(new Error('沒有影像軌')); }
      mp4.setExtractionOptions(vt.id, null, { nbSamples: 1e9 });
      mp4.start();
    };
    mp4.onSamples = (id, user, list) => { for (const s of list) samples.push(s); };

    file.arrayBuffer().then(buf => {
      buf.fileStart = 0;
      mp4.appendBuffer(buf);
      mp4.flush();
      clearTimeout(to);
      const vt = info && info.videoTracks && info.videoTracks[0];
      if (!vt || !samples.length) return rej(new Error('沒有取到封包'));
      // 取出解碼器需要的 avcC / hvcC / vpcC 設定資料
      const trak = mp4.getTrackById(vt.id);
      let desc = null;
      for (const e of trak.mdia.minf.stbl.stsd.entries){
        const box = e.avcC || e.hvcC || e.vpcC || e.av1C;
        if (box){
          // mp4box.all.js 把 DataStream 掛在全域，不是掛在 MP4Box 下面
          const DS = (typeof DataStream !== 'undefined') ? DataStream : (MP4Box && MP4Box.DataStream);
          if (!DS) break;
          const st = new DS(undefined, 0, DS.BIG_ENDIAN);
          box.write(st);
          desc = new Uint8Array(st.buffer, 8);       // 去掉 box header
          break;
        }
      }
      // tkhd 的變換矩陣（iPhone 直立拍會寫「轉 90 度」在這裡）。
      // <video> 元素會自動套用它，但我們自己解出來的原始幀不會 —— 要自己轉。
      let matrix = vt.matrix;
      if (!matrix){ try { matrix = trak.tkhd.matrix; } catch(e){} }
      res({ track: vt, samples, description: desc, timescale: vt.timescale, matrix });
    }).catch(e => { clearTimeout(to); rej(e); });
  });
}

/** QuickTime/MP4 的 tkhd 變換矩陣 → 顯示時要順時針轉幾度。
    矩陣把來源座標映到顯示座標：x' = a·x + c·y，y' = b·x + d·y（16.16 定點數）。
      a=1  b=0  → 0 度        a=0  b=1  → 90 度（iPhone 直立拍就是這個）
      a=-1 b=0  → 180 度      a=0  b=-1 → 270 度 */
function rotFromMatrix(m){
  if (!m || m.length < 5) return 0;
  const a = m[0] / 65536, b = m[1] / 65536;
  if (Math.abs(a) > 0.9) return a > 0 ? 0 : 180;
  if (Math.abs(b) > 0.9) return b > 0 ? 90 : 270;
  return 0;
}

/** 一段影片的「往前吐幀」來源。frameAt(t) 只能越叫越晚，不能回頭。 */
class FrameSource {
  constructor(){ this.ok = false; }

  static async create(clip){
    const fs = new FrameSource();
    try {
      const d = await demuxMP4(clip.file);
      fs.samples = d.samples;
      fs.timescale = d.timescale;
      fs.rot = rotFromMatrix(d.matrix);
      // 保險：<video> 報的是「轉好之後」的尺寸。如果它跟編碼尺寸是對調的，
      // 卻算不出旋轉（矩陣讀不到），那就當作 90 度，至少方向會對一邊。
      const cw = d.track.video.width, chh = d.track.video.height;
      if (!fs.rot && clip.w && clip.h && clip.w === chh && clip.h === cw) fs.rot = 90;
      const codec = d.track.codec;
      const cfg = {
        codec,
        codedWidth: d.track.video.width,
        codedHeight: d.track.video.height,
        description: d.description || undefined,
        hardwareAcceleration: 'prefer-hardware'
      };
      let sup = false;
      try { sup = (await VideoDecoder.isConfigSupported(cfg)).supported; } catch(e){}
      if (!sup){
        delete cfg.hardwareAcceleration;
        try { sup = (await VideoDecoder.isConfigSupported(cfg)).supported; } catch(e){}
      }
      if (!sup) return null;

      fs.queue = [];
      fs.err = null;
      fs.dec = new VideoDecoder({
        output: f => fs.queue.push(f),
        error: e => { fs.err = e; }
      });
      fs.cfg = cfg;
      fs.dec.configure(cfg);
      fs.next = 0;                    // 下一個要送進解碼器的封包
      fs.cur = null;                  // 目前保留著的那一幀
      fs.want = PREFETCH_START;       // 預取幾幀，跑起來會自己校準
      fs.started = false;             // 第一次取幀時才決定從哪個關鍵幀開始
      fs.flushed = false;
      fs.ok = true;
      return fs;
    } catch(e){ return null; }
  }

  /** 找出時間點 t（秒，相對原片）之前最後一個關鍵幀的封包索引 */
  _keyBefore(t){
    let k = 0;
    for (let i = 0; i < this.samples.length; i++){
      const st = this.samples[i].cts / this.samples[i].timescale;
      if (st > t + 1e-6) break;
      if (this.samples[i].is_sync) k = i;
    }
    return k;
  }

  _drop(){ for (const f of this.queue) f.close(); this.queue.length = 0; }

  /** 讓解碼器保持有工作可做，然後等它吐幀。
      不要每批都 flush —— flush 會把整條管線排乾，解碼就變成一次一幀的序列動作。 */
  /** 只把封包餵進解碼器，不等結果（同步） */
  _feed(){
    while (this.next < this.samples.length && this.dec.decodeQueueSize < 40){
      const s = this.samples[this.next++];
      try {
        this.dec.decode(new EncodedVideoChunk({
          type: s.is_sync ? 'key' : 'delta',
          timestamp: s.cts / s.timescale * 1e6,
          duration: (s.duration || 0) / s.timescale * 1e6,
          data: s.data
        }));
      } catch(e){ this.err = e; return; }
    }
  }

  /** 等到手上至少有 want 幀可用。
      原本每次只等「一幀」就回去，等於整條線變成
      解一幀 → 等 → 合成 → 編碼 → 再解一幀 → 再等…… 全部串起來排隊，
      解碼器有一半時間在空轉。一次多等幾幀存著，後面幾次取幀就直接命中不用等。
      絕對不能在串流中途 flush：flush 之後解碼器要求下一個必須是關鍵幀。 */
  async _pump(){
    const want = Math.max(1, this.want || PREFETCH_START);
    this._feed();
    const hitFree = this.queue.length >= want;   // 完全沒等就湊滿 → 還有餘裕
    let last = this.queue.length, idle = 0, gaveUp = false;
    for (let i = 0; i < 800 && this.queue.length < want && !this.err; i++){
      await decYield();
      this._feed();                       // 邊等邊補，解碼佇列不要空掉
      if (this.queue.length > last){ last = this.queue.length; idle = 0; }
      // 解碼器的輸出池有上限，湊不滿是正常的 —— 手上有幀就先用。
      // 這裡放棄得越快越好，空等就是純粹的浪費（v4.8 設 24 就是因此變慢）
      else if (++idle > 4 && this.queue.length){ gaveUp = true; break; }
      // 檔尾：剩下的封包湊不滿，有幾幀就用幾幀
      if (this.queue.length && this.next >= this.samples.length && this.dec.decodeQueueSize === 0) break;
    }
    // 自己校準：湊不滿就是要太多了，往下修；毫不費力就湊滿則慢慢往上加
    if (gaveUp) this.want = Math.max(1, Math.min(want, this.queue.length) - 1);
    else if (hitFree && want < PREFETCH_MAX) this.want = want + 1;
    else this.want = want;
    if (this.queue.length){ this.stall = 0; return; }
    if (!this.err && this.next < this.samples.length){
      this.stall = (this.stall || 0) + 1;
      if (this.stall > 3) this.err = new Error('解碼器沒有回應');   // 卡住就讓匯出退回逐幀
    }
  }

  /** 需要的話把幀轉正，回傳一張畫布；不需要就原樣回傳 VideoFrame。
      轉正之後尺寸就跟 <video> 報的一樣，預覽與匯出才會長得一模一樣。 */
  _upright(f){
    if (!f || !this.rot) return f;
    const dw = f.displayWidth || f.codedWidth, dh = f.displayHeight || f.codedHeight;
    if (!dw || !dh) return f;
    const oW = (this.rot % 180) ? dh : dw, oH = (this.rot % 180) ? dw : dh;
    if (!this.rcv){ this.rcv = document.createElement('canvas'); this.rctx = null; }
    if (this.rcv.width !== oW || this.rcv.height !== oH){
      this.rcv.width = oW; this.rcv.height = oH; this.rctx = null; this.rts = -1;
    }
    if (!this.rctx) this.rctx = this.rcv.getContext('2d', { alpha:false });
    if (this.rts === f.timestamp) return this.rcv;      // 同一幀不重畫
    this.rts = f.timestamp;
    const g = this.rctx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.translate(oW / 2, oH / 2);
    g.rotate(this.rot * Math.PI / 180);
    try { g.drawImage(f, -dw / 2, -dh / 2, dw, dh); } catch(e){}
    g.setTransform(1, 0, 0, 1, 0, 0);
    return this.rcv;
  }

  /** 取得涵蓋時間 t 的那一幀。往前解到夠為止。 */
  async frameAt(t){
    if (!this.ok || this.err) return null;
    if (!this.started){ this.next = this._keyBefore(t); this.started = true; }
    const tsOf = f => f.timestamp / 1e6;
    for (let guard = 0; guard < 6000; guard++){
      if (this.queue.length){
        const f = this.queue[0];
        if (this.cur && tsOf(f) > t + 1e-9) return this._upright(this.cur);   // 下一幀已經比要的還晚
        this.queue.shift();
        if (this.cur) this.cur.close();
        this.cur = f;
        continue;
      }
      if (this.next >= this.samples.length && this.dec.decodeQueueSize === 0){
        if (this.flushed) return this._upright(this.cur);     // 到檔尾了，維持最後一幀
        this.flushed = true;
        await this.dec.flush().catch(()=>{});
        continue;
      }
      await this._pump();
      if (this.err) return this._upright(this.cur);
    }
    return this._upright(this.cur);
  }

  close(){
    try { this._drop(); if (this.cur) this.cur.close(); } catch(e){}
    try { this.dec.close(); } catch(e){}
    this.ok = false;
  }
}
