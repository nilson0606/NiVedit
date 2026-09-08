/* ══════════════════════════════════════════════════════════════
   AI 字幕產生器
   在瀏覽器裡跑 Whisper（transformers.js + onnxruntime-web），
   影片一樣不上傳，聲音也不上傳 —— 只有第一次要從 CDN 抓模型檔，
   抓完存在 IndexedDB，之後斷網也能用。

   為什麼要開 Worker：辨識是純算力，跑在主執行緒畫面會整個卡住。
   file:// 開的網頁不能用 module worker（瀏覽器擋掉），
   但「classic worker + 動態 import()」可以 —— 這條路是實測出來的。
   ══════════════════════════════════════════════════════════════ */

/* 語音辨識模型。都是 transformers.js 能直接讀的 ONNX 版本。 */
const ASR_MODELS = [
  { id:'onnx-community/whisper-base',            name:'快速（base，約 80MB）' },
  { id:'onnx-community/whisper-small',           name:'平衡（small，約 250MB）— 推薦' },
  { id:'onnx-community/whisper-large-v3-turbo',  name:'最準（large-v3-turbo，約 800MB，要 WebGPU）' },
  { id:'Xenova/whisper-small',                   name:'平衡（small）— 備用來源' },
  { id:'Xenova/whisper-base',                    name:'快速（base）— 備用來源' },
  { id:'Xenova/whisper-tiny',                    name:'極速（tiny，約 40MB，中文常聽錯）' },
];

/* transformers.js 主程式。第一個抓不到就換下一個。
   一定要用 dist/transformers.min.js —— 這一版把 onnxruntime 打包進去了，
   沒有裸模組名要解析，動態 import 才不會失敗。 */
const ASR_LIBS = [
  'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.6/dist/transformers.min.js',
  'https://unpkg.com/@huggingface/transformers@3.7.6/dist/transformers.min.js',
  'https://fastly.jsdelivr.net/npm/@huggingface/transformers@3.7.6/dist/transformers.min.js',
];

const ASR = {
  model: 'onnx-community/whisper-small',
  lang: 'zh',          // zh = 中文為主（可混英文）、en = 英文、auto = 自動
  tw: true,            // 轉成台灣正體
  split: true,         // 自動斷句
  scope: 'all',        // all = 整條時間軸，或某個 clip 的 id
  device: 'auto',      // auto / webgpu / wasm
  busy: false,
  worker: null,
  cancel: false,
};

/* ── Worker 原始碼 ──────────────────────────────────────────
   注意：這一整段是字串，跑在另一個執行緒，看不到外面任何變數。 */
const ASR_WORKER_SRC = String.raw`
let T = null, pipe = null, curKey = '', LIB_BASE = '';
const post = (t, o) => self.postMessage(Object.assign({ t }, o || {}));

/* ══ 檔案快取 ══════════════════════════════════════════════
   模型與程式庫都存成「資料夾裡的真實檔案」（D:\NiVedit\asr\），
   跟專案檔一樣的作風：看得到、備份得了、換電腦拷貝過去就能用，
   也不會被瀏覽器當成快取回收掉。
   資料夾 handle 可以直接 postMessage 給 worker，所以讀寫都在這裡做。
   沒有選資料夾時退回 IndexedDB，功能還是能用，只是東西藏在瀏覽器裡。 */
let DIR = null;                          // asr 資料夾的 handle（主執行緒傳進來）

const DB = 'nivedit-asr', STORE = 'files';
const idb = () => new Promise((res, rej) => {
  const q = indexedDB.open(DB, 1);
  q.onupgradeneeded = () => q.result.createObjectStore(STORE);
  q.onsuccess = () => res(q.result);
  q.onerror = () => rej(q.error);
});
const idbGet = k => idb().then(db => new Promise((res, rej) => {
  const r = db.transaction(STORE).objectStore(STORE).get(k);
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
}));
const idbPut = (k, v) => idb().then(db => new Promise((res, rej) => {
  const tx = db.transaction(STORE, 'readwrite');
  tx.objectStore(STORE).put(v, k);
  tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error);
}));

/** 網址 → 資料夾裡的相對路徑。刻意保留原本的目錄結構，人看得懂。
    https://huggingface.co/Xenova/whisper-small/resolve/main/onnx/x.onnx
      → models/Xenova/whisper-small/onnx/x.onnx
    https://cdn.jsdelivr.net/.../dist/transformers.min.js
      → lib/transformers.min.js                                        */
function urlToPath(url){
  const u = String(url);
  let m = u.match(/huggingface\.co\/([^?#]+)/);
  if (m){
    const parts = m[1].split('/').filter(Boolean);
    const i = parts.indexOf('resolve');
    const repo = (i > 0 ? parts.slice(0, i) : parts.slice(0, 2));
    const file = (i > 0 ? parts.slice(i + 2) : parts.slice(2));
    return ['models'].concat(repo, file.length ? file : ['file']);
  }
  const name = u.split('?')[0].split('/').pop() || 'file';
  return ['lib', name];
}
const safeSeg = x => String(x).replace(/[\\/:*?"<>|]/g, '_');

async function dirFor(parts, create){
  let d = DIR;
  for (let i = 0; i < parts.length - 1; i++){
    if (!d) return null;
    try { d = await d.getDirectoryHandle(safeSeg(parts[i]), { create: !!create }); }
    catch(e){ return null; }
  }
  return d;
}
/** 從資料夾讀。讀不到（或沒選資料夾）回 null。 */
async function fileGet(url){
  const parts = urlToPath(url);
  if (DIR){
    const d = await dirFor(parts, false);
    if (d){
      try {
        const fh = await d.getFileHandle(safeSeg(parts[parts.length-1]));
        const f = await fh.getFile();
        if (f.size > 0) return f;
      } catch(e){}
    }
  }
  try { const v = await idbGet(url); if (v && v.blob && v.blob.size > 0) return v.blob; } catch(e){}
  return null;
}
/** 寫進資料夾；沒有資料夾就退回 IndexedDB。回傳存到哪裡（給訊息用）。 */
async function filePut(url, blob){
  const parts = urlToPath(url);
  if (DIR){
    const d = await dirFor(parts, true);
    if (d){
      try {
        const fh = await d.getFileHandle(safeSeg(parts[parts.length-1]), { create:true });
        const w = await fh.createWritable();
        await w.write(blob); await w.close();
        return 'asr/' + parts.join('/');
      } catch(e){ post('warn', { msg: '寫進資料夾失敗（改存瀏覽器）：' + e.message }); }
    }
  }
  try { await idbPut(url, { blob, type: blob.type, at: Date.now() }); return '瀏覽器'; }
  catch(e){ post('warn', { msg: '存不下來，下次還要再抓一次：' + e.message }); return null; }
}

/* transformers.js 的模型檔快取介面（要有 match / put，跟 Cache API 同樣的形狀） */
const modelCache = {
  async match(key){
    try {
      const f = await fileGet(key);
      if (!f) return undefined;
      return new Response(f, { headers: {
        'Content-Type': f.type || 'application/octet-stream',
        'Content-Length': String(f.size) } });
    } catch(e){ return undefined; }
  },
  async put(key, response){
    try { await filePut(key, await response.blob()); }
    catch(e){ post('warn', { msg: '模型存檔失敗（下次要重新下載）：' + e.message }); }
  }
};

/** 抓一個檔案，順便存成資料夾裡的真實檔案。抓過一次之後就完全不用網路。 */
async function cachedFetch(url, label){
  const hit = await fileGet(url);
  if (hit){ post('status', { s: label + '（本機檔案）' }); return hit; }
  post('status', { s: label + '…' });
  let r;
  try { r = await fetch(url); }
  catch(e){ throw new Error(label + '失敗：連不到 ' + url.replace(/^https?:\/\//,'').split('/')[0] + '（' + e.message + '）'); }
  if (!r.ok) throw new Error(label + '失敗：' + url + ' 回應 ' + r.status);
  // 一邊收一邊回報進度，大檔（wasm 引擎 21MB）才不會看起來像當掉
  const total = +(r.headers.get('content-length') || 0);
  let blob;
  if (total > 2e6 && r.body){
    const rd = r.body.getReader(); const parts = []; let got = 0;
    for (;;){
      const { done, value } = await rd.read();
      if (done) break;
      parts.push(value); got += value.length;
      post('dl', { status:'progress', file: label, loaded: got, total });
    }
    blob = new Blob(parts, { type: r.headers.get('content-type') || '' });
  } else blob = await r.blob();
  const where = await filePut(url, blob);
  if (where) post('status', { s: label + ' 已存到 ' + where });
  return blob;
}

/** 把 onnxruntime 的 wasm 引擎也存進快取，並直接餵給它 —— 這樣整套就離線可用。
    失敗就退回「每次跟 CDN 拿」，不會讓功能整個掛掉。 */
async function primeWasm(base){
  const w = T.env && T.env.backends && T.env.backends.onnx && T.env.backends.onnx.wasm;
  if (!w) return;
  w.numThreads = 1;          // file:// 沒有 SharedArrayBuffer，多執行緒起不來
  w.proxy = false;
  w.wasmPaths = base;        // 先給預設，下面成功了再換成本機的
  try {
    const mjs = await cachedFetch(base + 'ort-wasm-simd-threaded.jsep.mjs',  '取得 wasm 載入器');
    const bin = await cachedFetch(base + 'ort-wasm-simd-threaded.jsep.wasm', '取得 wasm 引擎（21MB）');
    // 兩個都用 blob 網址交給 ORT。
    // ※ 不要再設 wasmBinary —— 實測「blob 版載入器 ＋ wasmBinary」會直接卡死不回來
    //   （blob 網址單獨用沒問題，加上 wasmBinary 就掛）。
    w.wasmPaths = {
      mjs:  URL.createObjectURL(new Blob([await mjs.text()],        { type:'text/javascript' })),
      wasm: URL.createObjectURL(new Blob([await bin.arrayBuffer()], { type:'application/wasm' }))
    };
    w.wasmBinary = undefined;
    post('status', { s: 'wasm 引擎就緒（本機）' });
  } catch(e){
    w.wasmPaths = base;
    post('warn', { msg: 'wasm 引擎沒能存到本機，改成每次跟 CDN 拿：' + e.message });
  }
}

async function loadLib(urls){
  if (T) return;
  let last = null;
  for (const u of urls){
    try {
      // 先存進 IndexedDB 再從 blob 載入，之後斷網也開得起來
      const blob = await cachedFetch(u, '取得語音辨識程式庫');
      const src  = await blob.text();
      // 擋掉「CDN 回了一頁 HTML 錯誤頁」這種情形：ESM 一定有 export
      if (src.length < 500 || src.indexOf('export') < 0)
        throw new Error('抓到的不是程式庫（' + src.length + ' 個字元，開頭是「'
                        + src.slice(0, 40).replace(/\s+/g, ' ') + '」）');
      T = await import(URL.createObjectURL(new Blob([src], { type:'text/javascript' })));
      LIB_BASE = u.slice(0, u.lastIndexOf('/') + 1);
      post('status', { s: '程式庫就緒' });
      break;
    }
    catch(e){ last = e; post('status', { s: '換一個來源再試…' }); }
  }
  if (!T) throw new Error('載入語音辨識程式庫失敗：' + (last ? last.message : '未知原因')
                          + '。第一次使用需要連得上網路（cdn.jsdelivr.net）。');
  T.env.allowLocalModels = false;
  T.env.useBrowserCache = false;
  T.env.useCustomCache  = true;
  T.env.customCache     = modelCache;
  await primeWasm(LIB_BASE);
}

/** navigator.gpu 存在不代表真的要得到顯示卡。
    （把瀏覽器的硬體加速關掉時就是這樣：物件在，requestAdapter() 回 null。）
    所以一定要真的問一次。 */
async function gpuUsable(){
  try {
    if (!navigator.gpu) return false;
    const a = await navigator.gpu.requestAdapter();
    return !!a;
  } catch(e){ return false; }
}

async function getPipe(model, device){
  if (device === 'webgpu' && !(await gpuUsable())){
    device = 'wasm';
    post('warn', { msg: '這個瀏覽器要不到顯示卡（多半是硬體加速被關掉），改用 CPU 跑' });
    post('nogpu', {});
  }
  const key = model + '|' + device;
  if (pipe && curKey === key) return pipe;
  if (pipe){ try { await pipe.dispose(); } catch(e){} pipe = null; }

  // 各家模型倉庫收的檔案不一樣：Xenova/* 通常只有原尺寸與 _quantized，
  // onnx-community/* 才有 _q4、_fp16。所以排一串組合依序試，
  // 哪一個真的有檔案就用哪一個 —— 不要因為猜錯檔名就整個失敗。
  const plans = [];
  if (device === 'webgpu'){
    plans.push({ device:'webgpu', dtype:{ encoder_model:'fp32', decoder_model_merged:'q4' } });
    plans.push({ device:'webgpu', dtype:{ encoder_model:'fp32', decoder_model_merged:'fp32' } });
    plans.push({ device:'webgpu', dtype:'fp32' });
  }
  plans.push({ device:'wasm', dtype:'q8' });
  plans.push({ device:'wasm', dtype:'fp32' });

  const name = pl => pl.device + ' / ' + (typeof pl.dtype === 'string' ? pl.dtype
                : Object.keys(pl.dtype).map(k => k.split('_')[0] + '=' + pl.dtype[k]).join(' '));
  const fails = [];
  for (const pl of plans){
    try {
      post('status', { s: '嘗試 ' + name(pl) + '…' });
      pipe = await T.pipeline('automatic-speech-recognition', model,
        { device: pl.device, dtype: pl.dtype, progress_callback: p => post('dl', p) });
      curKey = model + '|' + pl.device;
      post('plan', { name: name(pl), device: pl.device });
      return pipe;
    } catch(e){
      const msg = String((e && e.message) || e).replace(/\s+/g, ' ').slice(0, 220);
      fails.push(name(pl) + ' → ' + msg);
      post('warn', { msg: name(pl) + ' 不行：' + msg });
    }
  }
  // 每一組都列出來，不要只留最後一個 —— 只看最後一個會誤判成 GPU 的問題
  throw new Error('這個模型的所有檔案組合都載不起來：\n' + fails.map(x => '· ' + x).join('\n'));
}

async function walk(d, prefix, out){
  for await (const [name, h] of d.entries()){
    const pth = prefix ? prefix + '/' + name : name;
    if (h.kind === 'directory') await walk(h, pth, out);
    else { try { const f = await h.getFile(); out.push({ path: pth, size: f.size }); } catch(e){} }
  }
}
async function rmTree(d, name){
  try { await d.removeEntry(name, { recursive:true }); return true; } catch(e){ return false; }
}

self.onmessage = async e => {
  const m = e.data;
  if (m.dir !== undefined) DIR = m.dir || null;

  if (m.cmd === 'cache'){                       // 列出已經存下來的東西
    const out = [];
    let where = '瀏覽器（沒有選資料夾）';
    if (DIR){
      where = 'asr 資料夾';
      try { await walk(DIR, '', out); } catch(err){ where = '資料夾讀取失敗：' + err.message; }
    } else {
      try {
        const db = await idb();
        const keys = await new Promise((res, rej) => { const r = db.transaction(STORE).objectStore(STORE).getAllKeys(); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
        const vals = await new Promise((res, rej) => { const r = db.transaction(STORE).objectStore(STORE).getAll(); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
        keys.forEach((k, i) => out.push({ path: urlToPath(k).join('/'), size: (vals[i] && vals[i].blob) ? vals[i].blob.size : 0 }));
      } catch(err){}
    }
    post('cache', { files: out, where });
    return;
  }
  if (m.cmd === 'clear'){
    try {
      if (DIR && m.path){
        // path 形如 models/Xenova/whisper-small 或 lib
        const parts = m.path.split('/').filter(Boolean);
        let d = DIR;
        for (let i = 0; i < parts.length - 1; i++) d = await d.getDirectoryHandle(parts[i]);
        await rmTree(d, parts[parts.length - 1]);
      } else if (!DIR){
        const db = await idb();
        const tx = db.transaction(STORE, 'readwrite');
        const st = tx.objectStore(STORE);
        const r = st.getAllKeys();
        r.onsuccess = () => { for (const k of r.result)
          if (!m.path || urlToPath(k).join('/').indexOf(m.path) === 0) st.delete(k); };
        await new Promise(res => { tx.oncomplete = res; tx.onerror = res; });
      }
      post('cleared', {});
    } catch(err){ post('cleared', { err: err.message }); }
    return;
  }
  if (m.cmd === 'prime'){                       // 先把程式庫與 wasm 抓下來存好（離線準備）
    try { await loadLib(m.libs); post('primed', {}); }
    catch(err){ post('primed', { err: err.message }); }
    return;
  }
  if (m.cmd !== 'run') return;
  let stage = '載入程式庫';
  try {
    await loadLib(m.libs);
    stage = '下載模型';
    post('status', { s: '準備模型…' });
    let p;
    try { p = await getPipe(m.model, m.device); }
    catch(e){
      // 有可能是本機快取的 wasm 引擎餵不進去。退回「跟 CDN 拿」再試一次，
      // 不要因為一個最佳化就讓整個功能不能用。
      const w = T.env.backends && T.env.backends.onnx && T.env.backends.onnx.wasm;
      if (w && typeof w.wasmPaths === 'object'){
        post('warn', { msg: '本機 wasm 引擎啟動失敗，改用 CDN 再試一次：' + e.message });
        w.wasmPaths = LIB_BASE; w.wasmBinary = undefined;
        p = await getPipe(m.model, m.device);
      } else throw e;
    }
    stage = '辨識';

    // 自己包一層 generate，才知道跑到第幾段（函式庫沒有給進度回呼）
    const SR = 16000, WIN = SR * 30, JUMP = SR * 20;
    const total = Math.max(1, Math.ceil(Math.max(0, m.audio.length - WIN) / JUMP) + 1);
    let done = 0;
    const model = p.model;
    if (!model.__nvWrapped){
      const orig = model.generate.bind(model);
      model.generate = async (...a) => { const r = await orig(...a); post('step', { done: ++done, total }); return r; };
      model.__nvWrapped = true;
    } else { done = 0; }
    post('status', { s: '開始辨識…' });
    post('step', { done: 0, total });

    const opt = { chunk_length_s: 30, stride_length_s: 5, return_timestamps: true };
    if (m.lang !== 'auto'){ opt.language = m.lang; opt.task = 'transcribe'; }
    const out = await p(m.audio, opt);
    post('done', { text: out.text || '', chunks: out.chunks || [] });
  } catch(err){
    post('error', { stage, msg: '[' + stage + '] ' + ((err && err.message) || String(err)) });
  }
};
`;

/** 拿到 <專案資料夾>/asr。ask=true 時沒選過會請使用者選一次。
    模型與程式庫都存成那裡的真實檔案 —— 看得到、備份得了、換電腦拷貝就能用。 */
async function asrDir(ask){
  try {
    if (typeof ensureDir !== 'function') return null;
    const d = await ensureDir(!!ask);
    if (!d) return null;
    return await d.getDirectoryHandle('asr', { create:true });
  } catch(e){ return null; }
}

function asrWorker(){
  if (ASR.worker) return ASR.worker;
  const url = URL.createObjectURL(new Blob([ASR_WORKER_SRC], { type: 'text/javascript' }));
  ASR.worker = new Worker(url);          // 一定要 classic worker，module worker 在 file:// 起不來
  ASR.worker.onerror = () => {};
  return ASR.worker;
}
function asrKillWorker(){
  if (ASR.worker){ try { ASR.worker.terminate(); } catch(e){} ASR.worker = null; }
}

/* ── 把時間軸的聲音抽成 16kHz 單聲道 ────────────────────────
   Whisper 只吃 16kHz mono。這裡刻意「不管靜音、不管音量、不管淡入淡出」：
   那些是給觀眾聽的設定，辨識要聽的是原始講話。
   位置用 layout()，所以字幕時間跟剪完的影片對得上。 */
async function asrExtract16k(scopeId, onProg){
  const SR = 16000;
  const L = layout();
  let t0 = 0, t1 = totalDur();
  let list = A.clips.map((c, i) => ({ c, i }));
  if (scopeId && scopeId !== 'all'){
    const i = A.clips.findIndex(c => c.id === scopeId);
    if (i < 0) throw new Error('找不到那一段影片');
    list = [{ c: A.clips[i], i }];
    t0 = L[i].start; t1 = t0 + L[i].dur;
  }
  const dur = Math.max(0.1, t1 - t0);
  if (dur > 3 * 3600) throw new Error('超過 3 小時，記憶體會爆，請分段處理');

  const oc = new OfflineAudioContext(1, Math.ceil(dur * SR), SR);
  let got = 0;
  for (const { c, i } of list){
    if (onProg) onProg(`解碼「${c.name}」…`);
    const buf = await getClipAudio(c, oc);
    if (!buf) continue;
    const d = Math.min(L[i].dur, Math.max(0, buf.duration - c.inP));
    if (d <= 0.01) continue;
    const src = oc.createBufferSource();
    src.buffer = buf;
    src.connect(oc.destination);
    src.start(Math.max(0, L[i].start - t0), c.inP, d);
    got++;
  }
  if (!got) throw new Error('這些片段裡沒有可以辨識的聲音（可能是純畫面或圖片）');
  if (onProg) onProg('混音中…');
  const out = await oc.startRendering();
  return { pcm: out.getChannelData(0), offset: t0, dur };
}

/* ── 辨識結果 → 字幕 ────────────────────────────────────── */

/* Whisper 在沒人講話的地方很愛「幻聽」出這幾句固定的話，直接濾掉。
   規則刻意寫得很窄：只擋整句都是招呼語的樣子。
   像「記得訂閱」這種人真的會講的話，不能因為有「訂閱」兩個字就被吃掉。 */
const ASR_JUNK = [
  /字幕(由|組|志[願愿]者)/, /Amara\.?org/i, /MING\s*PAO/i,
  /[点點][贊赞].*[订訂][阅閱]|[订訂][阅閱].*[转轉][发發]/,      // 「請不吝點贊 訂閱 轉發…」
  /明[镜鏡][与與]?[点點][点點]|[点點][点點][栏欄]目/,
  /^\s*(thanks?\s+for\s+watching|thank you|you|bye|please subscribe[^]*?)[\s.!?…]*$/i,
  /^\s*[.。,，、!！?？~～\-—…\s]*$/,                            // 只有標點
];
const asrIsJunk = s => ASR_JUNK.some(re => re.test(s));

/** 一句太長就在標點處切開，時間照字數分配 */
function asrSplitCue(cue, maxLen){
  const t = cue.text;
  if (Array.from(t).length <= maxLen) return [cue];
  const parts = t.split(/(?<=[。！？!?，,、;；:：])/).filter(s => s.trim());
  if (parts.length < 2) return [cue];
  // 相鄰的短塊先黏起來，避免切出一堆兩個字的字幕
  const merged = [];
  for (const p of parts){
    const last = merged[merged.length - 1];
    if (last && Array.from(last + p).length <= maxLen) merged[merged.length - 1] = last + p;
    else merged.push(p);
  }
  if (merged.length < 2) return [cue];
  const totalCh = merged.reduce((s, p) => s + Array.from(p).length, 0) || 1;
  const span = cue.end - cue.start;
  const out = []; let acc = 0;
  for (const p of merged){
    const n = Array.from(p).length;
    const st = cue.start + span * (acc / totalCh);
    acc += n;
    const en = cue.start + span * (acc / totalCh);
    const txt = p.replace(/[，,、;；]\s*$/, '').trim();
    if (txt) out.push({ id: uid(), start: st, end: Math.max(st + 0.25, en), text: txt });
  }
  return out.length ? out : [cue];
}

/** 把 Whisper 的 chunks 整理成字幕 */
function asrToCues(chunks, offset, dur, opt){
  const raw = [];
  for (const ch of (chunks || [])){
    const ts = ch.timestamp || [];
    let s = +ts[0], e = +ts[1];
    if (!Number.isFinite(s)) continue;
    if (!Number.isFinite(e) || e <= s) e = Math.min(dur, s + 3);
    let text = String(ch.text || '').trim();
    if (!text || asrIsJunk(text)) continue;
    raw.push({ start: offset + Math.max(0, s), end: offset + Math.min(dur, e), text });
  }
  raw.sort((a, b) => a.start - b.start);

  const out = [];
  for (const c of raw){
    const prev = out[out.length - 1];
    if (prev && prev.text === c.text && c.start - prev.end < 0.6) continue;   // 重複的整句丟掉
    if (prev && c.start < prev.end) c.start = prev.end;                        // 不重疊
    if (c.end <= c.start + 0.15) c.end = c.start + 0.5;
    out.push(c);
  }
  let cues = out.map(c => ({ id: uid(), start: c.start, end: c.end,
                             text: opt.tw ? toTW(c.text) : c.text }));
  if (opt.split){
    const flat = [];
    for (const c of cues) flat.push(...asrSplitCue(c, 20));
    cues = flat;
  }
  // 這裡只清空句子。幻聽在上面轉繁體之前就擋過了，
  // 不能再擋一次 —— 否則「記得訂閱」這種真的講出來的話會被誤殺。
  return cues.filter(c => c.text.trim());
}

/** 小小的三選一對話框。回傳被按下的那個 key（點外面或 Esc ＝ cancel）。 */
function asrAsk(title, msg, choices){
  return new Promise(res => {
    const mask = $('#qmask');
    $('#qTitle').textContent = title;
    $('#qMsg').innerHTML = msg;
    const box = $('#qBtns');
    box.innerHTML = '';
    const done = k => { mask.classList.remove('on'); mask.onmousedown = null;
                        document.removeEventListener('keydown', esc, true); res(k); };
    const esc = e => { if (e.key === 'Escape'){ e.stopPropagation(); done('cancel'); } };
    for (const c of choices){
      const b = document.createElement('button');
      b.textContent = c.label;
      if (c.pri) b.className = 'pri';
      if (c.title) b.title = c.title;
      b.onclick = () => done(c.k);
      box.appendChild(b);
    }
    mask.onmousedown = e => { if (e.target === mask) done('cancel'); };
    document.addEventListener('keydown', esc, true);
    mask.classList.add('on');
  });
}

/* ── 主流程 ───────────────────────────────────────────────── */
async function asrRun(){
  if (ASR.busy){ toast('已經在辨識了', true); return; }
  if (!A.clips.length){ toast('先加影片再產生字幕', true); return; }

  // 時間軸上已經有字幕的話先問清楚 —— 不問就直接疊上去，會變成兩套字幕
  let replace = false;
  if (A.subs.length){
    const a = await asrAsk('時間軸上已經有字幕',
      `目前有 <b>${A.subs.length}</b> 句字幕。新產生的要怎麼處理？`,
      [{ k:'cancel', label:'取消' },
       { k:'append', label:'加上去', title:'保留舊的，新的疊上去（時間可能會撞在一起）' },
       { k:'replace', label:'取代（清掉舊的）', pri:true }]);
    if (a === 'cancel') return;
    replace = (a === 'replace');
  }

  ASR.busy = true; ASR.cancel = false;
  const t0 = performance.now();
  mShow('AI 字幕產生中', '影片沒有離開你的電腦，只有模型檔會從網路下載');
  $('#mCancel').classList.remove('hide');
  $('#mCancel').onclick = () => { ASR.cancel = true; asrKillWorker(); ASR.busy = false; mDone('已取消', '', '—'); };
  try {
    mProg(2, '抽出聲音…');
    const { pcm, offset, dur } = await asrExtract16k(ASR.scope, s => mProg(4, s));
    if (ASR.cancel) return;
    mProg(8, `聲音長度 ${fmt(dur)}，交給辨識引擎…`);

    const device = ASR.device === 'auto' ? (navigator.gpu ? 'webgpu' : 'wasm') : ASR.device;
    // 重新整理之後資料夾權限會回到「待授權」，要在點擊當下重新要一次（只是一個「允許」按鈕）。
    // 沒有記住任何資料夾時就不要跳「選資料夾」視窗打擾人，改存瀏覽器。
    const dir = await asrDir(!!asrDirName());

    const trace = [];
    ASR.trace = trace;               // 失敗時也要看得到，所以先掛上去
    const note = x => { trace.push(x); if (trace.length > 40) trace.shift(); };
    const chunks = await new Promise((res, rej) => {
      const w = asrWorker();
      let lastFile = '', dlPct = 0, settled = false;
      // 結束之後一定要拔掉 handler：worker 還有其他訊息在路上，
      // 不拔會把失敗原因用「XXX 就緒」這種進度訊息蓋掉（v5.4 踩過）
      let wd = null;
      const fin = (fn, v) => { if (settled) return; settled = true; w.onmessage = null; clearTimeout(wd); fn(v); };
      const kick = () => { clearTimeout(wd); wd = setTimeout(() => {
        asrKillWorker();
        fin(rej, new Error('五分鐘沒有任何進展，已中止。可能是模型檔卡在下載，或這台機器跑不動這個模型。'));
      }, 300000); };
      kick();
      w.onmessage = ev => {
        const m = ev.data;
        if (settled) return;
        kick();
        if (m.t === 'status'){ note(m.s); mProg(Math.max(8, dlPct), m.s); }
        else if (m.t === 'warn'){ note('⚠ ' + m.msg); console.warn(m.msg); }
        else if (m.t === 'plan'){ note('採用 ' + m.name); ASR.plan = m.name; ASR.usedDevice = m.device; }
        else if (m.t === 'nogpu'){ ASR.noGpu = true; note('這台瀏覽器要不到顯示卡，改用 CPU'); }
        else if (m.t === 'dl'){
          if (m.status === 'progress' && m.total){
            dlPct = 8 + Math.round((m.loaded / m.total) * 30);
            if (m.file !== lastFile){ lastFile = m.file; note('下載 ' + m.file); }
            mProg(dlPct, `下載模型 ${m.file}　${(m.loaded/1048576).toFixed(1)} / ${(m.total/1048576).toFixed(1)} MB`);
          } else if (m.status === 'done' && m.file){
            mProg(Math.max(dlPct, 38), `模型檔 ${m.file} 就緒`);
          }
        }
        else if (m.t === 'step'){
          const p = 40 + Math.round((m.done / Math.max(1, m.total)) * 55);
          const el = (performance.now() - t0) / 1000;
          const eta = m.done > 0 ? el / m.done * (m.total - m.done) : 0;
          mProg(p, `辨識中　${m.done} / ${m.total} 段` + (m.done > 0 ? `　剩下大約 ${fmt(eta)}` : ''));
        }
        else if (m.t === 'done') fin(res, m.chunks);
        else if (m.t === 'error'){ note('✗ ' + m.msg); fin(rej, new Error(m.msg)); }
      };
      w.postMessage({ cmd:'run', libs: ASR_LIBS, model: ASR.model, dir,
                      device, lang: ASR.lang, audio: pcm }, [pcm.buffer]);
    });
    if (ASR.cancel) return;

    mProg(96, '整理字幕…');
    const cues = asrToCues(chunks, offset, dur, { tw: ASR.tw, split: ASR.split });
    cues.forEach(c=>c.track=clipTrack(A.clips.find(x=>x.id===ASR.scope)));
    if (!cues.length){ mDone('沒有聽到內容', '', '這段聲音裡沒有辨識出任何句子。可以換大一點的模型再試。'); return; }

    pushUndo();
    if (replace) A.subs = [];
    A.subs.push(...cues);
    A.subs.sort((a, b) => a.start - b.start);
    A.sel = { type:'sub', id: cues[0].id };
    render(); refreshProp(); asrUpdateState();

    const secs = (performance.now() - t0) / 1000;
    const saved = await srtSaveBeside(cues);
    mDone('字幕產生完成', `${cues.length} 句　花了 ${fmt(secs)}` + (replace ? '（已取代舊字幕）' : ''),
      (saved ? `已存成 <b>${esc(saved)}</b><br>`
             : `<span style="color:var(--warn-soft)">還沒指定資料夾，SRT 沒有存檔。</span><br>`) +
      `<span style="color:var(--fg3)">按「完成」會直接開字幕編輯器，可以逐句校對，改完按「存成 SRT」。</span>`);
    $('#mClose').onclick = () => { $('#mask').classList.remove('on'); openSubEditor(); };
  } catch(e){
    if (!ASR.cancel){
      const tr = (ASR.trace || []).slice(-14);
      mDone('字幕產生失敗', '', `<span style="color:var(--danger)">${esc(e.message || e)}</span><br><br>
        <span style="color:var(--fg3)">程式庫、wasm 引擎、模型檔第一次都要從 cdn.jsdelivr.net 與
        huggingface.co 下載，抓過一次就變成 asr 資料夾裡的檔案，之後不用網路。</span>
        ${tr.length ? `<details style="margin-top:8px"><summary style="cursor:pointer;color:var(--fg2)">
          過程紀錄（點開，可整段複製給我看）</summary>
          <pre id="asrTrace" style="white-space:pre-wrap;font-size:11px;color:var(--fg2);
            max-height:180px;overflow:auto;margin:6px 0 0">${esc(tr.join('\n'))}</pre>
          <button class="gh" id="asrCopyErr" style="margin-top:6px">複製</button></details>` : ''}`);
      const cp = $('#asrCopyErr');
      if (cp) cp.onclick = () => {
        const txt = (e.message || e) + '\n\n' + (ASR.trace || []).join('\n');
        navigator.clipboard.writeText(txt).then(() => toast('已複製'), () => toast('複製失敗', true));
      };
    }
  } finally {
    ASR.busy = false;
    $('#mCancel').onclick = null;
  }
}

/* ── 把 SRT 寫到專案資料夾 ─────────────────────────────────── */
function srtName(){
  const base = (typeof _curProj === 'object' && _curProj && _curProj.name)
    ? _curProj.name
    : (A.clips[0] ? A.clips[0].name.replace(/\.[^.]+$/, '') : 'NiVedit');
  return base.replace(/[\\/:*?"<>|]/g, '_') + '.srt';
}
/** 先試「記住的專案資料夾」，不行就開另存視窗，再不行就直接下載 */
async function srtSaveBeside(cuesForToast){
  const name = srtName();
  const text = toSRT(A.subs.length ? A.subs : cuesForToast);
  const blob = new Blob(['﻿' + text], { type:'text/plain;charset=utf-8' });
  try {
    const d = (typeof ensureDir === 'function') ? await ensureDir(false) : null;
    if (d){
      const fh = await d.getFileHandle(name, { create:true });
      const w = await fh.createWritable();
      await w.write(blob); await w.close();
      return d.name + ' / ' + name;
    }
  } catch(e){ /* 沒權限就走下面 */ }
  return null;
}
/** 使用者主動按「存成 SRT」時走這條：一定會問要存哪 */
async function srtSaveAs(){
  if (!A.subs.length){ toast('目前沒有字幕', true); return; }
  const name = srtName();
  const blob = new Blob(['﻿' + toSRT(A.subs)], { type:'text/plain;charset=utf-8' });
  try {
    const d = await ensureDir(false);
    if (d){
      const fh = await d.getFileHandle(name, { create:true });
      const w = await fh.createWritable(); await w.write(blob); await w.close();
      toast(`已存到「${d.name}」資料夾：${name}`);
      return;
    }
  } catch(e){}
  if (typeof window.showSaveFilePicker === 'function'){
    try {
      const fh = await window.showSaveFilePicker({ suggestedName: name, id:'nivedit-projects',
        types:[{ description:'SRT 字幕', accept:{ 'text/plain':['.srt'] } }] });
      const w = await fh.createWritable(); await w.write(blob); await w.close();
      toast('已存成 ' + fh.name);
      return;
    } catch(e){ if (e && e.name === 'AbortError') return; }
  }
  exportSRT();
}

/* ── 左側面板 ─────────────────────────────────────────────── */
/** 目前記住的資料夾名字（跟「專案」共用同一個）。沒有就回 null。 */
let _gpuOk = null;                       // null=還沒查、true/false=查過了
async function checkGpu(){
  if (_gpuOk !== null) return _gpuOk;
  try { _gpuOk = !!(navigator.gpu && await navigator.gpu.requestAdapter()); }
  catch(e){ _gpuOk = false; }
  return _gpuOk;
}

function asrDirName(){
  try { return (typeof _dir !== 'undefined' && _dir) ? _dir.name : null; } catch(e){ return null; }
}
function asrUpdateState(){
  const el = $('#asrState');
  if (el) el.textContent = A.subs.length ? A.subs.length + ' 句' : '—';
}
function asrPanel(){
  const box = $('#asrbox');
  if (!box) return;
  const clipOpts = ['<option value="all">整支影片（時間軸全部）</option>']
    .concat(A.clips.map((c, i) => `<option value="${c.id}"${ASR.scope === c.id ? ' selected':''}>第 ${i+1} 段：${esc(c.name)}</option>`)).join('');
  box.innerHTML = `
    <div class="row"><label>範圍</label><div class="f"><select id="asrScope" style="flex:1">${clipOpts}</select></div></div>
    <div class="row"><label>模型</label><div class="f"><select id="asrModel" style="flex:1">
      ${ASR_MODELS.map(m => `<option value="${m.id}"${ASR.model === m.id ? ' selected':''}>${esc(m.name)}</option>`).join('')}
    </select></div></div>
    <div class="row"><label>語言</label><div class="f"><select id="asrLang" style="flex:1">
      <option value="zh"${ASR.lang==='zh'?' selected':''}>中文為主（可混英文）</option>
      <option value="en"${ASR.lang==='en'?' selected':''}>英文</option>
      <option value="auto"${ASR.lang==='auto'?' selected':''}>自動判斷</option>
    </select></div></div>
    <label class="ckl"><input type="checkbox" id="asrTW"${ASR.tw?' checked':''}> 轉成台灣正體（軟體／影片／滑鼠）</label>
    <label class="ckl"><input type="checkbox" id="asrSplit"${ASR.split?' checked':''}> 太長的句子自動斷句</label>
    <button class="pri" id="asrRun" style="width:100%;margin-top:8px">產生字幕</button>
    <div class="hint" style="margin-top:7px">
      ${_gpuOk === null ? '正在檢查顯示卡…'
        : _gpuOk ? '顯示卡可用（WebGPU），會用 GPU 跑。'
        : '<span style="color:var(--warn-soft)">要不到顯示卡，只能用 CPU 跑，會慢很多。</span>'
          + '多半是瀏覽器的硬體加速被關掉了 —— 換 Edge 開，或把加速打開。CPU 的話建議選 base。'}<br>
      第一次要從網路抓程式庫與模型，抓完就是本機檔案，之後斷網也能用。<br>
      聲音只在你的電腦上處理，不會上傳。
    </div>
    <div class="row" style="margin-top:8px"><label>資料夾</label><div class="f">
      <span id="asrDir" class="hint" style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${
        asrDirName() ? esc(asrDirName()) : '尚未指定'}</span>
      <button class="gh" id="asrPickDir" style="flex:none;padding:3px 8px">選資料夾</button>
    </div></div>
    <div class="hint" style="margin-top:-2px">${asrDirName()
      ? 'SRT 存這裡，模型與程式庫存進 <code>asr\\</code> 子資料夾（真實檔案，可備份、可拷到別台電腦）。<br>'
        + '每次重新整理後第一次使用，瀏覽器會問一次「允許編輯」—— 按允許。'
      : '<span style="color:var(--warn-soft)">還沒選資料夾</span> —— 模型會暫存在瀏覽器裡，可能被系統清掉。建議指一個。'}</div>
    <div style="display:flex;gap:4px;margin-top:4px">
      <button class="gh" id="asrEdit" style="flex:1">字幕編輯器</button>
      <button class="gh" id="asrSrt" style="flex:1">存成 SRT</button>
    </div>
    <div style="display:flex;gap:4px;margin-top:4px">
      <button class="gh" id="asrPrime" style="flex:1" title="網路好的時候先把程式庫與引擎抓下來存好，之後斷網也能用">離線準備</button>
      <button class="gh" id="asrCache" style="flex:1">已下載的…</button>
    </div>`;

  bind('asrScope','change', v => { ASR.scope = v; });
  bind('asrModel','change', v => { ASR.model = v; });
  bind('asrLang','change',  v => { ASR.lang = v; });
  const ck = (id, k) => { const e = $('#'+id); if (e) e.onchange = () => { ASR[k] = e.checked; }; };
  ck('asrTW','tw'); ck('asrSplit','split');
  on('asrPickDir', async () => {
    // 選一次就記住（跟「專案」用的是同一個資料夾）
    try { await ensureDir(true); } catch(e){}
    asrPanel();
  });
  on('asrRun',  asrRun);
  on('asrEdit', openSubEditor);
  on('asrSrt',  srtSaveAs);
  on('asrCache', showModelCache);
  on('asrPrime', asrPrime);
  asrUpdateState();
}

/** 先把程式庫與 wasm 引擎抓下來存好。模型檔第一次辨識時才會抓（比較大，看選哪一個）。 */
async function asrPrime(){
  if (ASR.busy){ toast('正在辨識中', true); return; }
  const dir = await asrDir(true);          // 趁還有點擊授權，把資料夾問好
  if (!dir) toast('沒有選資料夾，會先存在瀏覽器裡', true);
  mShow('離線準備', dir ? '把程式庫與 wasm 引擎存進 asr 資料夾'
                        : '把程式庫與 wasm 引擎存進瀏覽器');
  $('#mCancel').classList.add('hide');
  mProg(5, '開始…');
  const t0 = performance.now();
  try {
    await new Promise((res, rej) => {
      const w = asrWorker();
      w.onmessage = ev => {
        const m = ev.data;
        if (m.t === 'status') mProg(Math.max(8, +($('#mBar').style.width || '8').replace('%','')), m.s);
        else if (m.t === 'dl' && m.status === 'progress' && m.total)
          mProg(8 + Math.round((m.loaded / m.total) * 88),
                `${m.file}　${(m.loaded/1048576).toFixed(1)} / ${(m.total/1048576).toFixed(1)} MB`);
        else if (m.t === 'warn') console.warn(m.msg);
        else if (m.t === 'primed'){ m.err ? rej(new Error(m.err)) : res(); }
      };
      w.postMessage({ cmd:'prime', libs: ASR_LIBS, dir });
    });
    mDone('離線準備完成', `花了 ${fmt((performance.now()-t0)/1000)}`,
      (dir ? `程式庫與 wasm 引擎已經存成 <b>${esc(asrDirName() || '')}\\asr\\lib\\</b> 裡的真實檔案。<br>`
           : '程式庫與 wasm 引擎已經存在瀏覽器裡。<br>') +
      `<span style="color:var(--fg3)">之後不用網路也開得起來。模型檔要等第一次按「產生字幕」才會抓
       （看你選哪一個，40MB～800MB），也會存進同一個地方。</span>`);
  } catch(e){
    mDone('離線準備失敗', '', `<span style="color:var(--danger)">${esc(e.message || e)}</span><br>
      <span style="color:var(--fg3)">現在連不到 CDN。等網路通了再按一次。</span>`);
  }
}

async function showModelCache(){
  const dir = await asrDir(false);
  const w = asrWorker();
  w.onmessage = ev => {
    const m = ev.data;
    if (m.t !== 'cache') return;
    // 依「第一層＋第二層」分組：lib、models/Xenova/whisper-small…
    const grp = {};
    for (const f of (m.files || [])){
      const p = f.path.split('/');
      const key = p[0] === 'models' ? p.slice(0, 3).join('/') : p[0];
      if (!grp[key]) grp[key] = { size:0, n:0 };
      grp[key].size += f.size; grp[key].n++;
    }
    const nice = k => k === 'lib' ? '語音辨識程式庫＋wasm 引擎'
                    : k.startsWith('models/') ? k.slice(7) : k;
    const rows = Object.keys(grp).sort();
    const html = rows.length
      ? rows.map(k => `<div class="prow"><div class="pmeta"><b>${esc(nice(k))}</b>
          <span>${(grp[k].size/1048576).toFixed(1)} MB　${grp[k].n} 個檔案　<code>${esc(k)}</code></span></div>
          <button class="gh" data-del="${esc(k)}">刪除</button></div>`).join('')
      : '<div class="hint">還沒有存下任何東西。網路好的時候按「離線準備」，或直接按「產生字幕」。</div>';
    $('#pquota').innerHTML = dir
      ? `存放位置：<b>${esc(asrDirName() || '')}\\asr\\</b>　—— 真實檔案，備份或換電腦直接拷貝這個資料夾就好`
      : `存放位置：<b>瀏覽器內部儲存</b>　—— <span style="color:var(--warn-soft)">建議按「離線準備」選一個資料夾，
         瀏覽器儲存可能被系統清掉，也帶不到別台電腦</span>`;
    $('#pbody').innerHTML = html;
    $('#pfoot').classList.add('hide');
    $$('#pbody [data-del]').forEach(btn => btn.onclick = () => {
      if (!confirm(`確定要刪掉「${nice(btn.dataset.del)}」？下次要用會重新下載。`)) return;
      w.postMessage({ cmd:'clear', dir, path: btn.dataset.del });
      btn.disabled = true; btn.textContent = '刪除中…';
      setTimeout(showModelCache, 700);
    });
    $('#pmask').classList.add('on');
    $('#pClose').onclick = () => { $('#pmask').classList.remove('on'); $('#pfoot').classList.remove('hide'); };
  };
  w.postMessage({ cmd:'cache', dir });
}

/* ── 字幕編輯器 ───────────────────────────────────────────── */
let _seSel = null;

function openSubEditor(){
  if (!A.subs.length && !confirm('目前沒有字幕，還是要開編輯器嗎？（可以手動一句一句加）')) return;
  if (A.sel.type === 'sub' && A.subs.some(c => c.id === A.sel.id)) _seSel = A.sel.id;
  $('#emask').classList.add('on');
  renderSubEditor();
  focusSubEditor(_seSel);
}
function closeSubEditor(){ $('#emask').classList.remove('on'); renderTimeline(); refreshProp(); markDirty(); }
function focusSubEditor(id, selectText=false){
  const row = Array.from($('#eList').querySelectorAll('.scue')).find(el => el.dataset.id === id);
  if (!row) return;
  row.scrollIntoView({block:'nearest'});
  const input = row.querySelector('.tx');
  input.focus({preventScroll:true});
  if (selectText) input.select();
}

function renderSubEditor(keepScroll){
  const box = $('#eList');
  if (!box) return;
  const top = keepScroll ? box.scrollTop : 0;
  const cues = [...A.subs].sort((a, b) => a.start - b.start);
  $('#eCount').textContent = A.subs.length + ' 句';
  box.innerHTML = cues.map((c, i) => `
    <div class="scue${_seSel === c.id ? ' sel' : ''}" data-id="${c.id}">
      <div class="n">${i + 1}<select class="subTrackSelect" title="字幕軌道"><option value="1"${subTrack(c)===1?' selected':''}>字幕上軌</option><option value="0"${subTrack(c)===0?' selected':''}>字幕下軌</option></select></div>
      <div class="tm">
        <input class="ts" data-k="start" value="${srtTime(c.start)}" title="開始時間">
        <input class="ts" data-k="end"   value="${srtTime(c.end)}"   title="結束時間">
        <div class="dur">${(c.end - c.start).toFixed(1)}s</div>
      </div>
      <textarea class="tx" rows="2" spellcheck="false">${esc(c.text)}</textarea>
      <div class="ops">
        <button class="x" data-a="go"    title="跳到這一句">▶</button>
        <button class="x" data-a="merge" title="跟下一句合併"${i === A.subs.length - 1 ? ' disabled' : ''}>⇊</button>
        <button class="x" data-a="del"   title="刪除這一句">✕</button>
      </div>
    </div>`).join('');

  box.querySelectorAll('.scue').forEach(el => {
    const id = el.dataset.id;
    const c = () => A.subs.find(x => x.id === id);
    el.querySelector('.subTrackSelect').onchange=e=>{pushUndo();c().track=+e.target.value;render();refreshProp();};
    el.querySelector('.tx').oninput = e => { const x = c(); if (x){ x.text = e.target.value; markDirty(); } };
    el.querySelector('.tx').onfocus = () => { _seSel = id; A.sel = { type:'sub', id }; box.querySelectorAll('.scue').forEach(n => n.classList.toggle('sel', n.dataset.id === id)); };
    el.querySelectorAll('.ts').forEach(inp => {
      inp.onchange = () => {
        const x = c(); if (!x) return;
        const t = parseSrtTime(inp.value);
        if (t === null){ inp.value = srtTime(x[inp.dataset.k]); toast('時間格式看不懂，要像 00:00:03,500', true); return; }
        pushUndo();
        x[inp.dataset.k] = t;
        if (x.end <= x.start + 0.1) x.end = x.start + 0.5;
        render(); renderSubEditor(true);
      };
    });
    el.querySelectorAll('[data-a]').forEach(b => b.onclick = () => {
      const x = c(); if (!x) return;
      const a = b.dataset.a;
      if (a === 'go'){ seekTo(x.start + 0.05); A.sel = { type:'sub', id }; _seSel = id; render(); refreshProp();
                       box.querySelectorAll('.scue').forEach(n => n.classList.toggle('sel', n.dataset.id === id)); return; }
      pushUndo();
      if (a === 'del') A.subs = A.subs.filter(y => y.id !== id);
      if (a === 'merge'){
        const i = cues.findIndex(c => c.id === id), nx = cues.slice(i+1).find(c=>subTrack(c)===subTrack(x));
        if (nx){ x.text = (x.text + ' ' + nx.text).trim(); x.end = nx.end; A.subs.splice(A.subs.indexOf(nx), 1); }
      }
      render(); refreshProp(); asrUpdateState(); renderSubEditor(true);
    });
  });
  box.scrollTop = top;
}

/** "00:00:03,500" → 3.5；看不懂回 null。也接受 "3.5" 這種純秒數 */
function parseSrtTime(s){
  s = String(s).trim();
  let m = s.match(/^(\d{1,3}):(\d{1,2}):(\d{1,2})[,.](\d{1,3})$/);
  if (m) return +m[1]*3600 + +m[2]*60 + +m[3] + +('0.' + m[4].padEnd(3,'0'));
  m = s.match(/^(\d{1,3}):(\d{1,2})[,.](\d{1,3})$/);
  if (m) return +m[1]*60 + +m[2] + +('0.' + m[3].padEnd(3,'0'));
  if (/^\d+(\.\d+)?$/.test(s)) return +s;
  return null;
}

/** 整批取代 —— 辨識常常固定認錯同一個詞，一次改完最省事 */
function subReplaceAll(){
  const from = $('#eFind').value;
  if (!from){ toast('先填要找什麼', true); return; }
  const to = $('#eRepl').value;
  let n = 0;
  pushUndo();
  for (const c of A.subs){
    if (c.text.indexOf(from) < 0) continue;
    c.text = c.text.split(from).join(to);
    n++;
  }
  render(); renderSubEditor(true);
  toast(n ? `改了 ${n} 句` : '沒有一句含有這個字', !n);
}
function subToTWAll(){
  pushUndo();
  let n = 0;
  for (const c of A.subs){ const t = toTW(c.text); if (t !== c.text){ c.text = t; n++; } }
  render(); renderSubEditor(true);
  toast(n ? `轉了 ${n} 句` : '本來就都是繁體了');
}
function subClearAll(){
  if (!A.subs.length) return;
  if (!confirm(`確定要刪掉全部 ${A.subs.length} 句字幕？`)) return;
  pushUndo();
  A.subs = [];
  render(); refreshProp(); asrUpdateState(); renderSubEditor();
}

function initASR(){
  asrPanel();
  checkGpu().then(() => asrPanel());     // 真的問一次顯示卡，問到再把面板換掉
  on('asrHead', () => {
    const L = $('#left'), off = L.classList.toggle('asrfold');
    $('#asrFold').textContent = off ? '▸' : '▾';
  });
  on('eClose', closeSubEditor);
  on('eAdd', () => {
    const cue = addSub(A.playhead);
    _seSel = cue.id;
    renderSubEditor(true); asrUpdateState();
    focusSubEditor(cue.id, true);
  });
  on('eRepl2', subReplaceAll);
  on('eTW',    subToTWAll);
  on('eClear', subClearAll);
  on('eSrt',   srtSaveAs);
  const em = $('#emask');
  if (em) em.addEventListener('mousedown', e => { if (e.target === em) closeSubEditor(); });
}
