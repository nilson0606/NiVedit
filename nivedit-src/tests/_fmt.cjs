// 依「這台瀏覽器實際有沒有 H.264 + AAC 編碼器」推出匯出應該是哪種容器。
//
// 為什麼需要這支：
//   開源 Chromium（Playwright 附的那顆）沒有 AAC 編碼器 —— AAC 是專利編碼，
//   而且不像 H.264 有 Cisco OpenH264 那種免權利金方案可以繞，所以任何沒付
//   授權的 Chromium 都不會有。50_export.js 的 probe() 要 H.264「而且」AAC
//   才輸出 MP4，否則退 VP9+Opus/WebM —— 這是正確行為。
//   於是寫死 `.endsWith('.mp4')` 的斷言在容器裡永遠紅，在 Edge 上永遠綠。
//
//   那種「預期會紅」的清單是有毒的：久了沒人分得出哪個紅是真的壞掉。
//   所以兩種環境都要能全綠 —— 有 AAC 就斷言 MP4，沒有就斷言「正確退成
//   WebM 且 WebM 是好的」。兩邊都是真斷言，紅就是真的壞了。
//
// 刻意不呼叫 App 自己的 probe()：這是獨立的判斷來源，
// 所以「App 把格式選錯」仍然會被抓到，不會變成自己驗自己。
async function expectedFormat(p, proj){
  return await p.evaluate(async (over) => {
    const P = over || ((typeof A !== 'undefined' && A.proj) ? A.proj : { w:1920, h:1080, fps:30, bitrate:8 });
    const br = Math.round(P.bitrate * 1e6);
    const cands = ['avc1.640034','avc1.640028','avc1.4D4028','avc1.42E028','avc1.4D401F','avc1.42E01E'];
    let h264 = false;
    for (const acc of ['prefer-hardware','no-preference']){
      for (const codec of cands){
        try {
          if ((await VideoEncoder.isConfigSupported({ codec, width:P.w, height:P.h, bitrate:br,
                framerate:P.fps, hardwareAcceleration:acc, avc:{ format:'avc' } })).supported){ h264 = true; break; }
        } catch(e){}
      }
      if (h264) break;
    }
    let aac = false;
    try {
      aac = (await AudioEncoder.isConfigSupported({ codec:'mp4a.40.2', sampleRate:48000,
              numberOfChannels:2, bitrate:192000 })).supported;
    } catch(e){}
    return (h264 && aac) ? 'mp4' : 'webm';
  }, proj || null);
}

module.exports = { expectedFormat };
