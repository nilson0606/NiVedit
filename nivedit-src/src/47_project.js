/* ==========================================================================
   NiVedit — 專案管理（新建／開啟／儲存／刪除）

   存在瀏覽器的 IndexedDB，分兩個庫：
     projects — 編輯資料（片段時間、標題、字幕、樣式…），很小
     media    — 影片／圖片／音檔本體，用「檔名+大小+修改時間」當 key，
                同一個檔案跨專案只存一份，重存不會再搬一次

   這樣「開啟專案」可以直接還原，不用每次重新挑檔案。
   ========================================================================== */
'use strict';

const DB_NAME = 'nivedit', DB_VER = 2;
let _curProj = null;              // { id, name }  ← 存在瀏覽器裡的專案（退路用）
let _dir = null;                  // 本機專案資料夾 handle
let _fh  = null;                  // 目前開著的專案檔 handle
const hasFS = typeof window.showDirectoryPicker === 'function';

function idb(){
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, DB_VER);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath:'id' });
      if (!db.objectStoreNames.contains('media'))    db.createObjectStore('media',    { keyPath:'key' });
      if (!db.objectStoreNames.contains('handles'))  db.createObjectStore('handles',  { keyPath:'id' });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error || new Error('無法開啟資料庫'));
  });
}
function tx(db, store, mode){ return db.transaction(store, mode).objectStore(store); }
function req(r){ return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }

const mediaKey = f => `${f.name}|${f.size}|${f.lastModified || 0}`;

/* ── 序列化 ────────────────────────────────────────────────── */
const pick = (o, keys) => { const r = {}; for (const k of keys) if (o[k] !== undefined) r[k] = o[k]; return r; };

function serialize(){
  const files = new Map();                       // key → File
  // 順手把 key 蓋回物件上：素材參照失效要重綁時，靠這個對得回來
  // （不能臨時用 mediaKey(o.file) 重算 —— 檔案物件換過就對不上了）
  const reg = (f, o) => {
    if (!f) return null;
    const k = mediaKey(f);
    files.set(k, f);
    if (o) o.mediaKey = k;
    return k;
  };
  const st = {
    ver: VER,
    clips: A.clips.map(c => Object.assign(
      pick(c, ['id','kind','name','dur','w','h','inP','outP','muted','vol','rot',
               'transMode','fadeIn','fadeOut','fadeAudio','track','at','x','y','scale','opacity','motionRot',
               'cropShape','cropX','cropY','cropW','cropH','cropSize','kf','kfT','trans','transOut','thumb','grade']),
      { mediaKey: reg(c.file, c) })),
    musics: A.musics.map(m => Object.assign(
      pick(m, ['id','name','dur','offset','startAt','len','autoLen','vol','fadeIn','fadeOut','loop','xfade','vk']),
      { mediaKey: reg(m.file, m) })),
    overlays: A.overlays.map(o => Object.assign(
      pick(o, ['id','name','w','h','start','end','x','y','scale','opacity','rot','fadeIn','fadeOut','thumb','gifOffset','kf','kfT']),
      { mediaKey: reg(o.file, o) })),
    titles: A.titles.map(t => ({ ...t })),
    subs: A.subs.map(c => ({ ...c })),
    subStyle: { ...A.subStyle },
    subStyleUpper:A.subStyleUpper ? {...A.subStyleUpper} : null,
    proj: { ...A.proj },
    playhead: A.playhead, pps: A.pps
  };
  return { st, files };
}

function elFor(kind, url){
  return new Promise((res, rej) => {
    if (kind === 'image'){
      const im = new Image();                  // blob 網址同源，不設 crossOrigin（見 20_core.js addVideo 的說明）
      const clr = () => { im.onload = null; im.onerror = null; };   // 一次性，用完就拆
      im.onload = () => { clr(); res(im); };
      im.onerror = () => { clr(); rej(new Error('圖片載入失敗')); };
      im.src = url; return;
    }
    const el = document.createElement(kind === 'audio' ? 'audio' : 'video');
    el.src = url; el.preload = 'auto';
    if (kind !== 'audio'){ el.playsInline = true; el.muted = true; }
    const clr = () => { el.onloadedmetadata = null; el.onerror = null; };
    el.onloadedmetadata = () => { clr(); res(el); };
    el.onerror = () => { clr(); rej(new Error('媒體載入失敗')); };
    $('#videoPool').appendChild(el);
  });
}

async function deserialize(st, blobs){
  clearGifMedia();
  const url = k => { const b = blobs.get(k); return b ? URL.createObjectURL(b) : null; };
  const missing = [];

  A.clips = [];
  for (const c of st.clips){
    const u = url(c.mediaKey);
    if (!u){ missing.push(c.name); continue; }
    const isImage = c.kind === 'image';
    let el;
    try { el = await elFor(isImage ? 'image' : 'video', u); }
    catch(e){ missing.push(c.name); continue; }
    const nc = Object.assign({
      x: 0.5, y: 0.5, scale: 1, opacity: 1, motionRot: 0,
      track: 0, at: null,
      cropShape: 'none', cropX: 0.5, cropY: 0.5, cropW: 1, cropH: 1, cropSize: 1, kf: null, kfT: null
    }, c, {
      file: blobs.get(c.mediaKey), url: u,
      video: isImage ? null : el, el, img: isImage ? el : undefined,
      audioBuf: null, audioTried: isImage,
      grade: Object.assign({}, GRADE0, c.grade || {})     // 舊專案沒有這個欄位
    });
    A.clips.push(nc); regMedia(nc);
  }

  A.musics = [];
  for (const m of st.musics){
    const u = url(m.mediaKey);
    if (!u){ missing.push(m.name); continue; }
    let el;
    try { el = await elFor('audio', u); } catch(e){ missing.push(m.name); continue; }
    const nm = Object.assign({}, m, { file: blobs.get(m.mediaKey), url: u, el, buf: null });
    A.musics.push(nm); regMedia(nm);
  }

  A.overlays = [];
  for (const o of st.overlays){
    const u = url(o.mediaKey);
    if (!u){ missing.push(o.name); continue; }
    let im, gif;
    try {
      im = await elFor('image', u);
      gif = await getOverlayGif(blobs.get(o.mediaKey));
    } catch(e){ URL.revokeObjectURL(u); missing.push(o.name + ' (' + (e.message || e) + ')'); continue; }
    const no = Object.assign({}, o, { file: blobs.get(o.mediaKey), url: u, img: im, _gif: gif });
    A.overlays.push(no); regMedia(no);
  }

  A.titles = (st.titles || []).map(t => ({ ...t }));
  A.subs   = (st.subs   || []).map(c => ({track:0, ...c }));
  A.subStyleUpper=st.subStyleUpper ? {...st.subStyleUpper} : null;
  if (st.subStyle) Object.assign(A.subStyle, st.subStyle);
  Object.assign(A.proj, st.proj || {});
  upgradeClipSettings(st.proj || {});
  A.pps = st.pps || A.pps;
  A.playhead = clamp(st.playhead || 0, 0, totalDur());
  A.sel = { type:'proj', id:null };
  return missing;
}

/* ── 存 / 讀 / 刪 ──────────────────────────────────────────── */
async function projSave(asNew){
  const name = (asNew || !_curProj)
    ? (prompt('專案名稱', _curProj ? _curProj.name + ' 複本' : '未命名專案') || '').trim()
    : _curProj.name;
  if (!name) return;
  if (!A.clips.length && !confirm('目前沒有任何素材，還是要存？')) return;

  const { st, files } = serialize();
  mShow('儲存專案', name);
  $('#mCancel').classList.add('hide');      // 存檔中途取消會留下半套資料，不給取消
  try {
    const db = await idb();
    // 素材本體：已經存過的就跳過
    let i = 0, saved = 0, bytes = 0;
    for (const [key, f] of files){
      i++;
      mProg(i / files.size * 85, `檢查素材 ${i} / ${files.size}　${f.name}`);
      const has = await req(tx(db, 'media', 'readonly').get(key));
      if (!has){
        await req(tx(db, 'media', 'readwrite').put({ key, blob: f, name: f.name, size: f.size, type: f.type }));
        saved++; bytes += f.size;
      }
    }
    mProg(92, '寫入專案…');
    const id = (asNew || !_curProj) ? uid() + Date.now().toString(36) : _curProj.id;
    const rec = { id, name, updated: Date.now(), ver: VER, state: st, keys: [...files.keys()] };
    await req(tx(db, 'projects', 'readwrite').put(rec));
    _curProj = { id, name };
    updateProjBar();
    mDone('已儲存', name,
      `素材 ${files.size} 個（新增 ${saved} 個，${(bytes/1048576).toFixed(1)} MB）<br>` +
      `<span style="color:var(--fg3)">同一個檔案跨專案只會存一份，下次儲存會更快。</span>`);
  } catch(e){
    mDone('儲存失敗', '', `<span style="color:var(--danger)">${esc(e.message || e)}</span>` +
      `<br><br><span style="color:var(--fg3)">瀏覽器儲存空間可能不足。可以先刪掉用不到的專案再試。</span>`);
  }
}

async function projList(){
  const db = await idb();
  const all = await req(tx(db, 'projects', 'readonly').getAll());
  return all.sort((a, b) => b.updated - a.updated);
}

async function projOpen(id){
  const db = await idb();
  const rec = await req(tx(db, 'projects', 'readonly').get(id));
  if (!rec){ toast('找不到這個專案', true); return; }
  mShow('開啟專案', rec.name);
  $('#mCancel').classList.add('hide');
  try {
    const blobs = new Map();
    let i = 0;
    for (const k of rec.keys){
      i++;
      mProg(i / Math.max(1, rec.keys.length) * 70, `載入素材 ${i} / ${rec.keys.length}`);
      const m = await req(tx(db, 'media', 'readonly').get(k));
      if (m) blobs.set(k, m.blob);
    }
    mProg(80, '重建時間軸…');
    const missing = await deserialize(rec.state, blobs);
    _curProj = { id: rec.id, name: rec.name };
    _undo.length = 0; _redo.length = 0; updateUndoBtns();
    updateProjBar();
    render(); refreshProp();
    if (missing.length){
      mDone('開啟完成（有缺素材）', rec.name,
        `<span style="color:var(--warn)">這些素材找不到，已略過：${esc(missing.join('、'))}</span>`);
    } else {
      $('#mask').classList.remove('on');
      toast(`已開啟「${rec.name}」`);
    }
  } catch(e){
    mDone('開啟失敗', '', `<span style="color:var(--danger)">${esc(e.message || e)}</span>`);
  }
}

async function projDelete(id, name){
  if (!confirm(`確定刪除專案「${name}」？\n（素材本體會保留給其他專案使用）`)) return;
  const db = await idb();
  await req(tx(db, 'projects', 'readwrite').delete(id));
  if (_curProj && _curProj.id === id){ _curProj = null; updateProjBar(); }
  toast('已刪除');
  showProjDialog();
}

/** 沒有任何專案在用的素材就清掉，把空間還回去 */
async function projGC(){
  const db = await idb();
  const all = await req(tx(db, 'projects', 'readonly').getAll());
  const used = new Set();
  all.forEach(p => (p.keys || []).forEach(k => used.add(k)));
  const media = await req(tx(db, 'media', 'readonly').getAll());
  let n = 0, bytes = 0;
  for (const m of media){
    if (!used.has(m.key)){
      await req(tx(db, 'media', 'readwrite').delete(m.key));
      n++; bytes += m.size || 0;
    }
  }
  toast(n ? `清掉 ${n} 個沒人用的素材，釋放 ${(bytes/1048576).toFixed(1)} MB` : '沒有可以清的素材');
  showProjDialog();
}

/** 清空目前內容（不問名稱，給建立流程內部用） */
function resetProject(){
  clearGifMedia();
  _fh = null;
  A.clips.forEach(c => { if (c.video) c.video.pause(); });
  A.musics.forEach(m => m.el.pause());
  A.clips = []; A.titles = []; A.musics = []; A.overlays = []; A.subs = [];
  A.sel = { type:'proj', id:null };
  A.playhead = 0; setPlaying(false);
  _curProj = null;
  _undo.length = 0; _redo.length = 0; updateUndoBtns();
  updateProjBar();
  render(); refreshProp();
}

/** 新建專案：當下就問名稱與存放位置，建立好檔案，之後儲存直接覆蓋 */
async function showNewDialog(){
  if (A.clips.length && !confirm('要開新專案嗎？目前沒存的修改會不見。')) return;
  const box = $('#pbody');
  $('#pquota').textContent = '';
  $('#pfoot').classList.add('hide');
  $('#pmask').classList.add('on');
  const draw = () => {
    box.innerHTML =
      `<div class="row"><label>專案名稱</label><div class="f">
         <input id="npName" value="未命名專案" spellcheck="false"></div></div>` +
      (hasFS
        ? `<div class="row"><label>存放資料夾</label><div class="f">
             <span class="hint" id="npDir" style="flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
               ${_dir ? esc(_dir.name) : '尚未選擇'}</span>
             <button id="npPick">${_dir ? '換資料夾' : '選擇資料夾'}</button></div></div>
           <div class="hint">建立後會在資料夾裡產生一個 .nvproj 檔案，之後按「儲存」直接覆蓋，不會再問你。</div>`
        : `<div class="hint">這個瀏覽器不支援直接存到資料夾，專案會存在瀏覽器裡。</div>`) +
      `<div style="display:flex;gap:6px;justify-content:flex-end;margin-top:14px">
         <button id="npSkip">先不指定，直接開始</button>
         <button class="pri" id="npCreate">建立</button></div>`;
    $('#npPick').onclick = async () => { if (await ensureDir(true)) draw(); };
    $('#npSkip').onclick = () => { $('#pmask').classList.remove('on'); $('#pfoot').classList.remove('hide');
                                   resetProject(); toast('已建立新專案（尚未指定存放位置）'); };
    $('#npCreate').onclick = async () => {
      const name = ($('#npName').value || '').trim();
      if (!name){ toast('請輸入專案名稱', true); return; }
      if (hasFS){
        const d = await ensureDir(true);
        if (!d){ toast('沒有選資料夾', true); return; }
        const fn = name.replace(/[\\/:*?"<>|]/g,'_') + '.nvproj';
        try {
          // 檔名已存在就先問過
          let exists = false;
          try { await d.getFileHandle(fn); exists = true; } catch(e){}
          if (exists && !confirm(`資料夾裡已經有「${fn}」，要覆蓋嗎？`)) return;
          const fh = await d.getFileHandle(fn, { create:true });
          resetProject();
          _curProj = { id:null, name };
          _fh = fh;
          const w = await fh.createWritable();
          await w.write(await buildProjBlob());
          await w.close();
          updateProjBar();
          $('#pmask').classList.remove('on'); $('#pfoot').classList.remove('hide');
          toast(`已建立「${name}」，存放於 ${d.name}`);
        } catch(e){ toast('建立失敗：' + e.message, true); }
      } else {
        resetProject();
        _curProj = { id: uid() + Date.now().toString(36), name };
        updateProjBar();
        $('#pmask').classList.remove('on'); $('#pfoot').classList.remove('hide');
        toast(`已建立「${name}」`);
      }
    };
  };
  draw();
}

/** 存完之後，把素材重新綁到剛寫出去的那個檔案上。

    為什麼一定要做：開專案時每段素材是「從 .nvproj 切出來的 Blob」，
    瀏覽器記的是「這個檔案的第幾個 byte 起、多長、修改時間是多少」。
    存檔一蓋回同一個檔，修改時間就變了，那些切片全部失效 ——
    第一次存還讀得到（寫入前就讀完了），第二次存就會噴
    「The requested file could not be read…」。
    重綁之後指向的是新檔案，存幾次都沒問題。 */
/** 等元素載到「真的有畫面可用」為止（readyState>=2），不只是有檔頭。
    只等到檔頭的話，畫布上畫出來會是空的。 */
function onceReady(el, ms, force){
  return new Promise(res => {
    if (!el) return res();
    const ev = (el.tagName === 'IMG') ? 'load' : 'loadeddata';
    // force：剛剛才重設 src，readyState 還沒歸零，這時候查是查到舊值，一定要等事件
    if (!force && (el.tagName === 'IMG' ? el.complete : el.readyState >= 2)) return res();
    const ok = () => { el.removeEventListener(ev, ok); el.removeEventListener('error', ok); res(); };
    el.addEventListener(ev, ok); el.addEventListener('error', ok);
    setTimeout(ok, ms || 8000);
  });
}

/** 把一個素材重新接到新的檔案上：新的 blob 網址 ＋ 讓元素重新載入。

    只換 o.file 是不夠的 —— <video> 的 src 還指著舊的 blob 網址，
    那個網址背後的檔案已經被改掉了。小檔案因為整個都在記憶體裡還能播，
    大檔案播到一半要回去讀就死掉，readyState 掉回 1：沒畫面、沒聲音。 */
async function reattach(o, nf){
  const el = o.video || o.img || o.el;
  o.file = nf;
  o.audioBuf = null; o.audioTried = false; o._ab = null; o.buf = null;
  const old = o.url;
  const url = URL.createObjectURL(nf);
  o.url = url;
  if (el){
    const at = (o.video && isFinite(o.video.currentTime)) ? o.video.currentTime : 0;
    try {
      el.src = url;
      if (el.load) el.load();
      await onceReady(el, 12000, true);
      if (o.video){ try { o.video.currentTime = at; } catch(e){} }
    } catch(e){}
  }
  const m = MEDIA.get(o.id);
  if (m){ m.file = nf; m.url = url; if ('audioBuf' in m) m.audioBuf = null; }
  // 舊網址晚一點再收，免得還有讀到一半的動作
  if (old && old !== url) setTimeout(() => { try { URL.revokeObjectURL(old); } catch(e){} }, 5000);
}

async function rebindMedia(fh, base, index){
  if (!fh || !index || !index.length) return;
  let f;
  try { f = await fh.getFile(); } catch(e){ return; }
  const byKey = new Map();
  for (const it of index){
    const part = f.slice(base + it.off, base + it.off + it.len);
    byKey.set(it.key, new File([part], it.name, { type: it.type || '' }));
  }
  let n = 0;
  for (const arr of [A.clips, A.musics, A.overlays]){
    for (const o of arr){
      if (!o.file) continue;
      const nf = byKey.get(o.mediaKey) || byKey.get(mediaKey(o.file));
      if (!nf) continue;
      await reattach(o, nf);            // 檔案物件、blob 網址、元素三個一起換
      n++;
    }
  }
  return n;
}

/** 這個素材現在還讀得到嗎？（讀 1 個 byte 就知道） */
async function fileAlive(f){
  if (!f) return false;
  try { await f.slice(0, 1).arrayBuffer(); return true; } catch(e){ return false; }
}

/** 檢查所有素材還讀不讀得到；有失效的就從目前的專案檔重新切一次。

    為什麼會失效：開專案時素材是「.nvproj 檔案的切片」，瀏覽器記的是
    「哪個檔、第幾個 byte、修改時間多少」。那個檔一被動到（自己存檔、改名、
    搬位置、雲端同步回寫）全部切片同時失效，而且不會有任何提示 ——
    症狀就是聲音不見、存檔失敗、匯出失敗。
    所以在「要用到素材之前」先驗一次，壞了就自己接回去。 */
async function revalidateMedia(){
  const all = [].concat(A.clips, A.musics, A.overlays).filter(o => o.file);
  const bad = [];
  for (const o of all) if (!await fileAlive(o.file)) bad.push(o);
  if (!bad.length) return { ok:true, fixed:0, lost:[] };
  if (!_fh) return { ok:false, fixed:0, lost: bad.map(o => o.name) };
  try {
    const f = await _fh.getFile();
    const ml = NV_MAGIC.length;
    const h0 = await f.slice(0, ml + 4).arrayBuffer();
    if (new TextDecoder().decode(h0.slice(0, ml)) !== NV_MAGIC) throw new Error('不是專案檔');
    const hlen = new DataView(h0).getUint32(ml, true);
    const head = JSON.parse(new TextDecoder().decode(await f.slice(ml + 4, ml + 4 + hlen).arrayBuffer()));
    await rebindMedia(_fh, ml + 4 + hlen, head.index);
  } catch(e){ return { ok:false, fixed:0, lost: bad.map(o => o.name), err: e.message }; }
  const lost = [];
  for (const o of bad) if (!await fileAlive(o.file)) lost.push(o.name);
  return { ok: lost.length === 0, fixed: bad.length - lost.length, lost };
}

/* ── 本機資料夾（File System Access API）────────────────────────
   跟尤書日誌一樣：選一次資料夾，之後專案就是那個資料夾裡的真實檔案，
   不依賴瀏覽器儲存，換電腦拷貝資料夾就好。
   ─────────────────────────────────────────────────────────── */
async function saveDirHandle(h){
  try { const db = await idb(); await req(tx(db,'handles','readwrite').put({ id:'projDir', h })); } catch(e){}
}
async function loadDirHandle(){
  try { const db = await idb(); const r = await req(tx(db,'handles','readonly').get('projDir'));
        return r ? r.h : null; } catch(e){ return null; }
}
/** 拿到可讀寫的資料夾。沒有就請使用者選一個（必須由點擊觸發） */
async function ensureDir(ask){
  if (_dir){
    let st = 'denied';
    try { st = await _dir.queryPermission({ mode:'readwrite' }); } catch(e){}
    if (st === 'granted') return _dir;
    if (ask){
      try { st = await _dir.requestPermission({ mode:'readwrite' }); } catch(e){}
      if (st === 'granted') return _dir;
    }
  }
  if (!ask) return null;
  try {
    _dir = await window.showDirectoryPicker({ mode:'readwrite', id:'nivedit-projects' });
    await saveDirHandle(_dir);
    return _dir;
  } catch(e){ return null; }          // 使用者取消
}

/** 列出資料夾裡的專案檔 */
async function dirList(){
  const d = await ensureDir(false);
  if (!d) return null;
  const out = [];
  try {
    for await (const [name, h] of d.entries()){
      if (h.kind !== 'file' || !/\.nvproj$/i.test(name)) continue;
      let f = null;
      try { f = await h.getFile(); } catch(e){}
      out.push({ name, handle: h, size: f ? f.size : 0, updated: f ? f.lastModified : 0 });
    }
  } catch(e){ return null; }
  return out.sort((a, b) => b.updated - a.updated);
}

/** 把目前專案寫進資料夾。asNew=true 會問新檔名 */
const hasSavePicker = typeof window.showSaveFilePicker === 'function';

async function dirSave(asNew){
  let fh = (!asNew && _fh) ? _fh : null;
  if (!fh){
    const base = (_curProj ? _curProj.name : '未命名專案').replace(/[\\/:*?"<>|]/g,'_');
    if (hasSavePicker){
      // 用瀏覽器原生的「另存新檔」：資料夾跟檔名一次選好。
      // 之前是先拿記住的資料夾、再用 prompt 問檔名，等於另存永遠只能存回同一個資料夾。
      try {
        fh = await window.showSaveFilePicker({
          suggestedName: base + '.nvproj',
          id: 'nivedit-projects',
          types: [{ description:'NiVedit 專案', accept:{ 'application/octet-stream':['.nvproj'] } }]
        });
      } catch(e){ return false; }                    // 使用者取消
      _curProj = { id:null, name: fh.name.replace(/\.nvproj$/i, '') };
    } else {
      const d = await ensureDir(true);
      if (!d){ toast('沒有選資料夾', true); return false; }
      const name = (prompt('專案檔名（會存進你選的資料夾）', base) || '').trim();
      if (!name) return false;
      try { fh = await d.getFileHandle(name.replace(/[\\/:*?"<>|]/g,'_') + '.nvproj', { create:true }); }
      catch(e){ toast('建立檔案失敗：' + e.message, true); return false; }
      _curProj = { id:null, name };
    }
  }
  mShow('儲存到資料夾', _curProj ? _curProj.name : '');
  $('#mCancel').classList.add('hide');
  try {
    // 素材如果已經失效（檔案被搬走、被別的程式改過），先想辦法接回來再存，
    // 不然存出去的專案檔會缺素材
    const rv = await revalidateMedia();
    if (rv.fixed) toast(`重新接上 ${rv.fixed} 個素材`);
    if (!rv.ok && rv.lost.length)
      throw new Error('這些素材已經讀不到了：' + rv.lost.join('、') +
        '。請把它們重新拖進來（或重新開啟專案）再存，否則存出去的檔案會缺素材。');
    const info = {};
    const blob = await buildProjBlob(info);
    mProg(80, '寫入檔案…');
    const w = await fh.createWritable();
    await w.write(blob);
    await w.close();
    _fh = fh;
    // 素材要改指向剛寫出去的這個檔，不然下一次存會讀不到（見 rebindMedia）
    await rebindMedia(fh, info.base, info.index);
    updateProjBar();
    mDone('已儲存到電腦', fh.name,
      `${(blob.size/1048576).toFixed(1)} MB<br><span style="color:var(--fg3)">真實檔案，跟瀏覽器儲存無關。` +
      `<br>「開啟」列表讀的是你在專案視窗選的資料夾；如果剛才存到別的地方，用「換一個資料夾」指過去就看得到。</span>`);
    return true;
  } catch(e){
    const msg = String(e && e.message || e);
    const stale = /could not be read|NotReadableError|not be read/i.test(msg);
    mDone('儲存失敗', '', `<span style="color:var(--danger)">${esc(msg)}</span>` +
      (stale ? `<br><br><span style="color:var(--fg3)">素材的檔案參照失效了 ——
        多半是素材檔在外面被移動、改名或改過內容。<br>
        重新開啟這個專案（或把素材重新拖進來）就會好。</span>` : ''));
    return false;
  }
}

async function dirOpen(entry){
  try {
    const f = await entry.handle.getFile();
    await projImportFile(f, entry.handle);
  } catch(e){ toast('開啟失敗：' + e.message, true); }
}
async function dirDelete(entry){
  if (!confirm(`確定刪除「${entry.name}」？\n這會刪掉電腦上的檔案。`)) return;
  const d = await ensureDir(true);
  if (!d) return;
  try {
    await d.removeEntry(entry.name);
    if (_fh && _fh.name === entry.name){ _fh = null; _curProj = null; updateProjBar(); }
    toast('已刪除');
    showProjDialog();
  } catch(e){ toast('刪除失敗：' + e.message, true); }
}

/* ── 匯出／匯入專案檔 ──────────────────────────────────────────
   瀏覽器儲存是「可回收」等級，磁碟吃緊或清除瀏覽資料就會不見。
   這裡把整個專案（編輯資料＋所有素材）打包成一個檔案，放哪都行。

   格式：NVPROJ1 magic ‖ 4 bytes JSON 長度 ‖ JSON ‖ 素材依序接在後面
   匯入時用 File.slice 取素材，不會把整個檔案讀進記憶體。
   ─────────────────────────────────────────────────────────── */
const NV_MAGIC = 'NVPROJ1';

/** 把整個專案打包成一個 Blob（資料夾儲存與檔案匯出共用） */
/** 建出專案檔的內容。
    out 給進來的話，會回填 { base, index } —— 存完之後要用它把素材
    重新綁到「剛剛寫出去的那個檔案」上，見 rebindMedia()。 */
async function buildProjBlob(out){
  const { st, files } = serialize();
  const index = [], parts = [];
  let off = 0;
  for (const [key, f] of files){
    index.push({ key, name: f.name, type: f.type, size: f.size, off, len: f.size });
    parts.push(f); off += f.size;
  }
  const head = JSON.stringify({ magic: NV_MAGIC, ver: VER,
    name: _curProj ? _curProj.name : '未命名專案', state: st, index });
  const headBytes = new TextEncoder().encode(head);
  const lenBuf = new Uint8Array(4);
  new DataView(lenBuf.buffer).setUint32(0, headBytes.length, true);
  if (out){ out.base = NV_MAGIC.length + 4 + headBytes.length; out.index = index; }
  return new Blob([new TextEncoder().encode(NV_MAGIC), lenBuf, headBytes, ...parts],
                  { type: 'application/octet-stream' });
}

async function projExportFile(){
  if (!A.clips.length){ toast('沒有東西可以匯出', true); return; }
  mShow('匯出專案檔', _curProj ? _curProj.name : '未命名專案');
  $('#mCancel').classList.add('hide');
  try {
    const blob = await buildProjBlob();
    mProg(90, '寫出檔案…');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    // file:// 開啟時瀏覽器可能把非 ASCII 檔名整個丟掉，加前綴保住副檔名
    const safe = (_curProj ? _curProj.name : 'project').replace(/[\\/:*?"<>|]/g, '_');
    const stamp = new Date().toISOString().slice(0,10).replace(/-/g,'');
    a.download = `NiVedit_${safe}_${stamp}.nvproj`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    mDone('已匯出', a.download,
      `共 ${(blob.size/1048576).toFixed(1)} MB<br>` +
      `<span style="color:var(--fg3)">這個檔案跟瀏覽器無關，換電腦、備份到雲端都可以。</span>`);
  } catch(e){
    mDone('匯出失敗', '', `<span style="color:var(--danger)">${esc(e.message || e)}</span>`);
  }
}

async function projImportFile(file, handle){
  mShow('匯入專案檔', file.name);
  $('#mCancel').classList.add('hide');
  try {
    const magicLen = NV_MAGIC.length;
    const head0 = await file.slice(0, magicLen + 4).arrayBuffer();
    const magic = new TextDecoder().decode(head0.slice(0, magicLen));
    if (magic !== NV_MAGIC) throw new Error('這不是 NiVedit 專案檔');
    const hlen = new DataView(head0).getUint32(magicLen, true);
    const headBytes = await file.slice(magicLen + 4, magicLen + 4 + hlen).arrayBuffer();
    const head = JSON.parse(new TextDecoder().decode(headBytes));
    const base = magicLen + 4 + hlen;

    const blobs = new Map();
    head.index.forEach(m => blobs.set(m.key,
      new File([file.slice(base + m.off, base + m.off + m.len)], m.name, { type: m.type })));

    mProg(60, '重建時間軸…');
    const missing = await deserialize(head.state, blobs);
    _fh = handle || null;
    _curProj = { id:null, name: (head.name || file.name).replace(/\.nvproj$/i, '') };
    _undo.length = 0; _redo.length = 0; updateUndoBtns();
    updateProjBar();
    render(); refreshProp();
    if (missing.length){
      mDone('已開啟（有缺素材）', head.name || file.name,
        `<span style="color:var(--warn)">缺少素材：${esc(missing.join('、'))}</span>`);
    } else {
      $('#mask').classList.remove('on');
      toast(`已開啟「${_curProj.name}」`);
    }
  } catch(e){
    mDone('匯入失敗', '', `<span style="color:var(--danger)">${esc(e.message || e)}</span>`);
  }
}

/* ── 介面 ──────────────────────────────────────────────────── */
function updateProjBar(){
  const el = $('#projName');
  if (el){
    el.textContent = _curProj ? _curProj.name : L('未命名（尚未儲存）');
    el.title = _fh ? `本機檔案：${_fh.name}` : (hasFS ? '尚未存成本機檔案' : '');
  }
  const s = $('#btnProjSave');
  if (s) s.textContent = _fh ? '儲存' : '儲存…';
}

let _dirEntries = [];

async function showProjDialog(){
  const box = $('#pbody');
  $('#pfoot').classList.remove('hide');
  $('#pmask').classList.add('on');
  box.innerHTML = '<div class="hint" style="padding:12px 4px">讀取中…</div>';

  if (!hasFS){
    $('#pquota').innerHTML = '<span style="color:var(--warn)">這個瀏覽器不支援直接存到資料夾，只能用瀏覽器儲存或匯出檔案。</span>';
    return renderIdbList(box);
  }

  _dirEntries = await dirList();
  if (_dirEntries === null){
    $('#pquota').textContent = '';
    box.innerHTML =
      `<div class="hint" style="padding:6px 4px 12px">
         專案會存成你電腦上的真實檔案（.nvproj）。選一個資料夾放它們，之後開啟和儲存都直接讀寫那裡。</div>
       <button class="pri" id="pPickDir" style="width:100%">選擇專案資料夾</button>
       <div class="hint" style="margin-top:14px;border-top:1px solid var(--line);padding-top:10px">
         也可以用下面的「匯入專案檔」直接開啟單一 .nvproj 檔案。</div>`;
    $('#pPickDir').onclick = async () => { if (await ensureDir(true)) showProjDialog(); };
    return;
  }

  $('#pquota').innerHTML = `資料夾：<b data-nt>${esc(_dir.name)}</b>　${_dirEntries.length} 個專案`;
  box.innerHTML = (_dirEntries.length
    ? _dirEntries.map((p, i) => `
        <div class="prow${_fh && _fh.name === p.name ? ' cur' : ''}">
          <div class="pmeta"><b data-nt>${esc(p.name.replace(/\.nvproj$/i,''))}</b>
            <span>${p.updated ? new Date(p.updated).toLocaleString(LANG === 'en' ? 'en-US' : 'zh-TW') : ''}　${(p.size/1048576).toFixed(1)} MB</span></div>
          <button class="pri" data-open="${i}">開啟</button>
          <button data-del="${i}">刪除</button>
        </div>`).join('')
    : '<div class="hint" style="padding:12px 4px">這個資料夾裡還沒有專案檔。</div>')
    + `<div style="display:flex;gap:6px;margin-top:10px">
         <button id="pChangeDir" style="flex:1">換一個資料夾</button></div>`;
  box.querySelectorAll('[data-open]').forEach(b => b.onclick = () => {
    $('#pmask').classList.remove('on'); dirOpen(_dirEntries[+b.dataset.open]); });
  box.querySelectorAll('[data-del]').forEach(b => b.onclick = () => dirDelete(_dirEntries[+b.dataset.del]));
  $('#pChangeDir').onclick = async () => { _dir = null; if (await ensureDir(true)) showProjDialog(); else showProjDialog(); };
}

/** 退路：瀏覽器儲存的專案清單 */
async function renderIdbList(box){
  const list = await projList().catch(() => []);
  box.innerHTML = list.length
    ? list.map(p => `
        <div class="prow${_curProj && _curProj.id === p.id ? ' cur' : ''}">
          <div class="pmeta"><b data-nt>${esc(p.name)}</b>
            <span>${new Date(p.updated).toLocaleString(LANG === 'en' ? 'en-US' : 'zh-TW')}　${p.state.clips.length} 段</span></div>
          <button class="pri" data-open="${p.id}">開啟</button>
          <button data-del="${p.id}" data-name="${esc(p.name)}">刪除</button>
        </div>`).join('')
    : '<div class="hint" style="padding:12px 4px">還沒有存過任何專案。</div>';
  box.querySelectorAll('[data-open]').forEach(b => b.onclick = () => { $('#pmask').classList.remove('on'); projOpen(b.dataset.open); });
  box.querySelectorAll('[data-del]').forEach(b => b.onclick = () => projDelete(b.dataset.del, b.dataset.name));
}

async function initProject(){
  if (hasFS){ _dir = await loadDirHandle(); }        // 記住上次選的資料夾
  $('#btnProjNew').onclick = showNewDialog;
  $('#btnProjOpen').onclick = showProjDialog;
  $('#btnProjSave').onclick   = () => hasFS ? dirSave(false) : projSave(false);
  $('#btnProjSaveAs').onclick = () => hasFS ? dirSave(true)  : projSave(true);
  $('#pClose').onclick = () => { $('#pmask').classList.remove('on'); $('#pfoot').classList.remove('hide'); };
  $('#pGC').onclick = projGC;
  $('#pExport').onclick = () => { $('#pmask').classList.remove('on'); projExportFile(); };
  $('#pImport').onclick = () => $('#fileProj').click();
  $('#fileProj').onchange = e => {
    const f = e.target.files[0]; e.target.value = '';
    if (f){ $('#pmask').classList.remove('on'); projImportFile(f); }
  };
  updateProjBar();
}
