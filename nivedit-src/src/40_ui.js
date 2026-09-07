/* ==========================================================================
   NiVedit — 介面：素材列表、時間軸、屬性面板、播放控制
   ========================================================================== */
'use strict';

const pcv  = $('#preview');
const pctx = pcv.getContext('2d');
const ROW  = 42;                    // 時間軸每一列的高度
let _last = performance.now();

/* ── 預覽解析度 ────────────────────────────────────────────────
   預覽畫布本來是照專案解析度開（1920×1080），可是它在畫面上其實只有
   八百多像素寬。調色與特效是逐像素的，全解析度算完再縮小給人看，
   等於白算了四五倍的量 —— 一加風格預覽就從 60fps 掉到 13fps。
   改成照「實際顯示大小」開，畫質看起來一樣，匯出仍然是全解析度。
   ─────────────────────────────────────────────────────── */
let _lastPvW = 0, _lastPvH = 0;
function sizePreview(){
  const st = $('#stage');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const availW = Math.max(160, (st ? st.clientWidth : 640) - 32);
  const availH = Math.max(90,  (st ? st.clientHeight : 360) - 32);
  const ar = A.proj.w / A.proj.h;
  let w = availW, h = w / ar;
  if (h > availH){ h = availH; w = h * ar; }
  w = Math.min(A.proj.w, Math.round(w * dpr));          // 不超過專案本身的解析度
  h = Math.min(A.proj.h, Math.round(w / ar));
  w = Math.max(64, w - (w & 1)); h = Math.max(36, h - (h & 1));
  if (w !== _lastPvW || h !== _lastPvH){
    pcv.width = w; pcv.height = h;
    _lastPvW = w; _lastPvH = h;
    markDirty();
  }
}

/* 有調色的時候一格要算好幾十毫秒。停著不動還一直重畫，
   整個介面都會跟著鈍，所以沒事就不畫。 */
let _dirty = true, _dirtyUntil = 0;
function markDirty(ms){
  _dirty = true;
  if (ms) _dirtyUntil = Math.max(_dirtyUntil, performance.now() + ms);
}

/* ── 預覽播放 ──────────────────────────────────────────────── */
function setPlaying(on){
  A.playing = on;
  markDirty(700);
  $('#playBtn').textContent = on ? '❚❚' : '▶';
  if (!on) A.clips.forEach(c => { if (c.video) c.video.pause(); });
  if (!on) A.musics.forEach(m => m.el.pause());
}

/** 音量一定要是 0～1 的有限數。
    clamp 碰到 NaN 會原封不動回傳 NaN，而 `el.volume = NaN` 會直接丟例外 ——
    在每一幀都跑的 syncMedia 裡丟例外，整個預覽迴圈就死了，聲音畫面全停。 */
function safeVol(x){
  const v = +x;
  return Number.isFinite(v) ? (v < 0 ? 0 : v > 1 ? 1 : v) : 1;
}

function syncMedia(){
  const need = new Map();
  for (const act of activeTracksAt(A.playhead)){
    need.set(act.a.clip.id, act.a);
    if (act.b) need.set(act.b.clip.id, act.b);
  }
  // 結尾轉場：畫面轉到黑，聲音要用同一條曲線一起收掉（預覽跟匯出要一樣）
  const L = layout();
  const og = new Map();
  for (let i = 0; i < A.clips.length; i++){
    const g = clipMixGain(i, A.playhead, L);
    if (g < 1) og.set(A.clips[i].id, g);
  }
  for (const c of A.clips){
    const n = need.get(c.id), v = c.video;
    if (!v) continue;                       // 圖片片段沒有播放器，跳過
    // 沒在播的片段也把音量算好，不然它上次留下來的舊音量會一直掛在那
    // n.hold＝外加轉場的定格：畫面停住，兩邊的聲音都不出（不然又混在一起了）
    const oq = og.has(c.id) ? og.get(c.id) : 1;
    if (!n || n.hold){
      v.volume = safeVol(n ? 0 : c.vol * oq);
      if (!v.paused) v.pause();
      if (n && Math.abs(v.currentTime - n.t) > 0.04){ try { v.currentTime = n.t; } catch(e){} }
      continue;
    }
    v.muted  = c.muted || !A.playing;
    v.volume = safeVol(c.vol * oq);
    if (A.playing){
      if (Math.abs(v.currentTime - n.t) > 0.3) v.currentTime = n.t;
      if (v.paused) v.play().catch(()=>{});
    } else {
      if (!v.paused) v.pause();
      if (Math.abs(v.currentTime - n.t) > 0.04) v.currentTime = n.t;
    }
  }
  for (const m of A.musics){
    const el = m.el, seg = musicSeg(m);
    const p = A.playhead - m.startAt, span = Math.max(0.2, m.len);
    let want = null;
    if (p >= 0 && p < span){
      if (m.loop) want = m.offset + (p % Math.max(0.2, seg - m.xfade));
      else if (p < seg) want = m.offset + p;
    }
    let g = clamp(m.vol, 0, 1) * musicGainAt(m, A.playhead);   // 音量曲線，跟匯出同一條公式
    if (m.fadeIn  > 0 && p >= 0 && p < m.fadeIn) g *= p / m.fadeIn;
    if (m.fadeOut > 0 && p > span - m.fadeOut)   g *= Math.max(0, (span - p) / m.fadeOut);
    el.volume = safeVol(g);
    if (A.playing && want !== null && want < el.duration){
      if (Math.abs(el.currentTime - want) > 0.35) el.currentTime = want;
      if (el.paused) el.play().catch(()=>{});
    } else if (!el.paused) el.pause();
  }
}

let _loopErr = 0;
function loop(){
  try { loopBody(); }
  catch(e){
    // 以前這裡沒有防護：syncMedia 或 renderFrame 丟一次例外，
    // 迴圈尾端的 requestAnimationFrame 就跑不到，預覽從此不動、聲音也不再更新。
    // 現在改成吞掉並繼續，只在第一次提示，這樣至少看得到是哪裡出問題。
    if (_loopErr++ === 0){
      console.error('預覽迴圈出錯（已跳過這一幀繼續跑）:', e);
      try { toast('預覽有一格畫不出來，已跳過繼續：' + e.message, true); } catch(_){}
    }
  }
  requestAnimationFrame(loop);
}

function loopBody(){
  const now = performance.now();
  if (A.playing && !A.exporting){
    A.playhead += (now - _last) / 1000;
    const tot = totalDur();
    if (A.playhead >= tot){ A.playhead = tot; setPlaying(false); }
  }
  _last = now;
  if (!A.exporting){
    // 播放中一定要畫；停著的時候只有真的有變動才畫。
    // seek 之後影片要一點時間才解得出新的一格，所以會多畫幾格（_dirtyUntil）
    const need = A.playing || _dirty || now < _dirtyUntil;
    if (need){
      syncMedia();
      renderFrame(pctx, A.playhead, pcv.width, pcv.height);
      _dirty = false;
    }
    $('#curTime').textContent = fmt(A.playhead);
    $('#head').style.left = (A.playhead * A.pps) + 'px';
    const tot = totalDur(), sb = $('#seekBar');
    if (sb && !sb._dragging) sb.value = tot > 0 ? Math.round(A.playhead / tot * 1000) : 0;
    if (A.playing) followPlayhead();
  }
}

function seekTo(t){
  A.playhead = clamp(t, 0, totalDur());
  $('#curTime').textContent = fmt(A.playhead);
  markDirty(700);                       // 影片解碼要一點時間，多畫幾格才等得到新畫面
  followPlayhead(true);
}

/** 讓整支影片剛好塞進時間軸可視寬度 */
function fitZoom(){
  const w = $('#tlwrap').clientWidth - 72, tot = totalDur();   // 72 = 時間軸右側留白 + 捲軸
  if (tot > 0.2 && w > 60){
    A.pps = clamp(w / tot, 2, 400);
    $('#zoom').value = A.pps;
    renderTimeline();
    $('#tlwrap').scrollLeft = 0;
  }
}

/** 播放時自動捲動，讓播放頭一直看得到 */
function followPlayhead(force){
  const wrap = $('#tlwrap');
  if (!wrap) return;
  const x = A.playhead * A.pps, vw = wrap.clientWidth;
  if (x < wrap.scrollLeft + 30 || x > wrap.scrollLeft + vw - 50){
    if (force || A.playing) wrap.scrollLeft = Math.max(0, x - vw * 0.35);
  }
}

// 每段獨立切換。共用標題／疊圖／配樂固定在時間軸；綁定字幕跟著自己的片段。
function setClipMode(c,mode){
  if(!VIDEO_MODES.some(q=>q[0]===mode)||clipMode(c)===mode)return;
  pushUndo();pinFreeClips();
  c.transMode=mode;
  render();refreshProp();seekTo(Math.min(A.playhead,totalDur()));
  toast('已更新這一段的轉場方式');
}

/* ── 主要重繪 ──────────────────────────────────────────────── */
function render(){
  markDirty(400);
  pinFreeClips();
  syncAutoLens();
  syncSubsToClips();          // 片段搬動／裁切／換轉場接法，字幕自動跟著對齊
  const tot = totalDur();
  $('#totalDur').textContent = fmt(tot);
  $('#endTime').textContent  = fmt(tot);
  $('#clipCount').textContent = A.clips.length ? A.clips.length + ' 段' : '0';
  $('#empty').classList.toggle('hide', A.clips.length > 0);
  sizePreview();
  // 讓按鈕直接說出等一下會切到誰，不用猜
  const what = A.sel.type === 'music' ? '音軌' : A.sel.type === 'title' ? '標題'
             : A.sel.type === 'overlay' ? '疊圖' : A.sel.type === 'sub' ? '字幕' : '影片';
  const sb = $('#btnSplit');
  if (sb){
    sb.textContent = `✂ 分割${what}`;
    sb.title = `在播放頭切開目前選取的${what}（快捷鍵 S）`;
  }
  const db = $('#btnDel');
  if (db) db.textContent = A.sel.type === 'proj' ? '刪除' : `刪除${what}`;
  renderClipList();
  renderTimeline();
}

function renderClipList(){
  const box = $('#clipList');
  box.innerHTML = '';
  A.clips.forEach((c, i) => {
    const peers=A.clips.filter(x=>clipTrack(x)===clipTrack(c)), pi=peers.indexOf(c);
    const d = document.createElement('div');
    d.className = 'ci' + (A.sel.type === 'clip' && A.sel.id === c.id ? ' sel' : '');
    d.draggable = true; d.dataset.i = i;
    d.innerHTML =
      `<img src="${c.thumb || ''}" alt="">
       <div class="meta"><div class="t" data-nt title="${esc(c.name)}">${i+1}. ${esc(c.name)}</div>
       <div class="s">${fmt(clipDur(c))}　${c.w}×${c.h}${c.muted ? '　🔇' : ''}</div></div>
       <div class="ops">
         <button class="x mvL" title="往前移一段"${pi === 0 ? ' disabled' : ''}>◀</button>
         <button class="x mvR" title="往後移一段"${pi === peers.length-1 ? ' disabled' : ''}>▶</button>
         <button class="x" title="刪除">✕</button>
       </div>`;
    d.onclick = e => {
      if (e.target.classList.contains('mvL') || e.target.classList.contains('mvR')){
        const peer=peers[pi+(e.target.classList.contains('mvL')?-1:1)];
        if (!peer) return;
        pushUndo();
        const to=A.clips.indexOf(peer);
        [A.clips[i],A.clips[to]]=[A.clips[to],A.clips[i]];
        const first=A.clips[Math.min(i,to)],second=A.clips[Math.max(i,to)];
        const start=Math.min(c.at,peer.at);first.at=start;second.at=start+clipEdges(first).span;
        A.sel = { type:'clip', id:c.id };
        render(); refreshProp(); return;
      }
      if (e.target.classList.contains('x')){
        A.sel = { type:'clip', id:c.id }; delSelected(); return;
      }
      A.sel = { type:'clip', id:c.id };
      const L = layout(); seekTo(L[i].start + 0.05);
      render(); refreshProp();
    };
    d.ondragstart = e => { e.dataTransfer.setData('text/plain', i); d.classList.add('drag'); };
    d.ondragend   = () => { d.classList.remove('drag'); $$('.ci').forEach(x => x.classList.remove('over')); };
    d.ondragover  = e => { e.preventDefault(); d.classList.add('over'); };
    d.ondragleave = () => d.classList.remove('over');
    d.ondrop = e => {
      e.preventDefault(); d.classList.remove('over');
      const from = +e.dataTransfer.getData('text/plain');
      if (from === i || isNaN(from)) return;
      pushUndo();
      const m=A.clips[from];
      if (!m) return;
      placeClip(m,clipTrack(c),layout()[i].start);
      render(); refreshProp();
    };
    box.appendChild(d);
  });
  if (typeof asrPanel === 'function') asrPanel();     // 「範圍」下拉要跟著片段一起變
}

/** 在陣列裡把某個項目往前後搬一格（標題／疊圖＝圖層上下，音軌＝排序） */
function moveLayer(arr, item, dir){
  const i = arr.indexOf(item), to = i + dir;
  if (i < 0 || to < 0 || to >= arr.length){ toast('已經在最外面了'); return; }
  pushUndo();
  arr.splice(i, 1); arr.splice(to, 0, item);
  render(); refreshProp();
}

const esc = s => String(s).replace(/[&<>"]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));

/* ── 時間軸 ────────────────────────────────────────────────── */
/** 把時間軸內容寬度釘死。
    播放頭 #head 是絕對定位、left 每一格都在變，只要它超出內容寬度，
    scrollWidth 就會跟著變 —— 橫向捲軸每一格出現又消失，整排版面跟著抖。
    （headless Chrome 用不占空間的浮動捲軸，所以測不出來；Windows 的傳統捲軸會占版面。） */
function fixInnerWidth(){
  const wrap = $('#tlwrap'), inner = $('#tlinner');
  if (!wrap || !inner) return;
  const need = Math.ceil(totalDur() * A.pps) + 60;      // 60 = 尾端留白，播放頭到底也不會頂出去
  inner.style.width = Math.max(wrap.clientWidth, need) + 'px';
}

/* ── 軌道上下順序 ──────────────────────────────────────────────
   順序存在 A.proj.tracks，所以會跟著專案存檔，也吃得到復原。
   ─────────────────────────────────────────────────────── */
const TRACK_DEF = [
  { k:'video', id:'trkVideo', name:'影片' },
  { k:'over',  id:'trkOver',  name:'疊圖' },
  { k:'title', id:'trkTitle', name:'標題' },
  { k:'music', id:'trkMusic', name:'音軌' }
];
const DEF_ORDER = TRACK_DEF.map(t => t.k);

/** 補齊／清掉不合法的值，永遠回傳一份完整的四組順序 */
function trackOrder(){
  const cur = Array.isArray(A.proj.tracks) ? A.proj.tracks.filter(k => DEF_ORDER.includes(k)) : [];
  const out = [...new Set(cur)];
  for (const k of DEF_ORDER) if (!out.includes(k)) out.push(k);
  A.proj.tracks = out;
  return out;
}

/** 照目前的順序把軌道的 DOM 重排，並重畫每一軌的標籤與上下箭頭 */
let _trkSig = '';
function applyTrackOrder(force){
  if (_tkDrag && _tkDrag.moved && !force) return;   // 拖曳中不要把 DOM 搶回去
  const order = trackOrder();
  const sig = order.join(',');
  if (!force && sig === _trkSig) return;      // 沒換順序就不用重建，拖曳時每一格都重建太浪費
  _trkSig = sig;
  const inner = $('#tlinner'), head = $('#head');
  order.forEach(k => {
    const def = TRACK_DEF.find(t => t.k === k);
    const el = $('#' + def.id);
    if (!el) return;
    inner.insertBefore(el, head);              // 依序往 #head 前面搬，就排好了
    let lb = el.querySelector('.trklb');
    if (!lb){ lb = document.createElement('div'); lb.className = 'trklb'; el.appendChild(lb); }
    const i = order.indexOf(k);
    lb.innerHTML =
      `<button class="ord" data-mv="up" data-tk="${k}" title="這一軌往上移（只改時間軸排列）"${i === 0 ? ' disabled' : ''}>▲</button>` +
      `<button class="ord" data-mv="dn" data-tk="${k}" title="這一軌往下移（只改時間軸排列）"${i === order.length - 1 ? ' disabled' : ''}>▼</button>` +
      `<span class="tkname" title="拖曳可以上下換軌道順序">${def.name}</span>`;
    lb.querySelectorAll('.ord').forEach(btn => btn.onclick = e => {
      e.stopPropagation(); e.preventDefault();
      moveTrack(btn.dataset.tk, btn.dataset.mv === 'up' ? -1 : 1);
    });
    const nm = lb.querySelector('.tkname');
    if (nm){
      nm.onpointerdown = e => startTrackDrag(e, k);
      // 字幕／標題軌雙擊空白處會新增一句，別讓點名稱也觸發
      nm.ondblclick = e => { e.stopPropagation(); e.preventDefault(); };
    }
  });
}

/* ── 拖曳軌道名稱換上下順序 ────────────────────────────────────
   只有名稱那幾個字吃得到滑鼠（.trklb 本身是 pointer-events:none，
   不然標籤會擋住底下的方塊）。▲▼ 按鈕保留，鍵盤與小螢幕還是用得上。

   拖曳期間只搬 DOM，A.proj.tracks 不動 —— 這樣放開時 pushUndo()
   拿到的才是「拖曳前」的順序，復原才會回到原位。 */
let _tkDrag = null;

function trackEl(k){
  const def = TRACK_DEF.find(t => t.k === k);
  return def ? $('#' + def.id) : null;
}

function startTrackDrag(e, k){
  if (e.button) return;                       // 只吃左鍵
  const el = trackEl(k);
  if (!el || A.exporting) return;
  e.preventDefault(); e.stopPropagation();
  const y0 = e.clientY;
  _tkDrag = { k, el, order: trackOrder().slice(), moved: false };
  const move = ev => {
    if (!_tkDrag) return;
    if (!_tkDrag.moved){
      if (Math.abs(ev.clientY - y0) < 3) return;   // 手抖不算拖曳
      _tkDrag.moved = true;
      el.classList.add('tkdrag');
      document.body.classList.add('tkdragging');
    }
    dragTrackTo(ev.clientY);
  };
  const up = () => {
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', up);
    document.removeEventListener('pointercancel', up);
    const d = _tkDrag; _tkDrag = null;
    if (!d) return;
    d.el.classList.remove('tkdrag');
    document.body.classList.remove('tkdragging');
    finishTrackDrag(d);
  };
  document.addEventListener('pointermove', move);
  document.addEventListener('pointerup', up);
  document.addEventListener('pointercancel', up);
}

/** 游標在哪一格 → 立刻把 DOM 排成那樣，其他軌就會即時讓位 */
function dragTrackTo(y){
  const d = _tkDrag;
  if (!d) return;
  const others = d.order.filter(k => k !== d.k);
  let j = 0;
  for (const k of others){
    const el = trackEl(k);
    if (!el) continue;
    const r = el.getBoundingClientRect();
    if (y > r.top + r.height / 2) j++;         // 越過這一軌的中線就往下排一格
  }
  const next = others.slice();
  next.splice(j, 0, d.k);
  if (next.join(',') === d.order.join(',')) return;
  d.order = next;
  const inner = $('#tlinner'), head = $('#head');
  next.forEach(k => { const el = trackEl(k); if (el) inner.insertBefore(el, head); });
}

function finishTrackDrag(d){
  if (!d.moved) return;
  // 沒真的換位置：DOM 可能被搬過，用 force 排回去（_trkSig 沒變，不 force 會被略過）
  if (d.order.join(',') === trackOrder().join(',')) return applyTrackOrder(true);
  pushUndo();                                  // A.proj.tracks 還是舊的，正好存下拖曳前的順序
  A.proj.tracks = d.order;
  applyTrackOrder(true); renderTimeline();
  const nm = (TRACK_DEF.find(t => t.k === d.k) || {}).name || '';
  toast(`${nm}軌移到第 ${d.order.indexOf(d.k) + 1} 條（只是時間軸排列，不影響畫面上的疊放順序）`);
}

function moveTrack(k, dir){
  const order = trackOrder();
  const i = order.indexOf(k), j = i + dir;
  if (i < 0 || j < 0 || j >= order.length) return;
  pushUndo();
  order[i] = order[j]; order[j] = k;
  A.proj.tracks = order;
  applyTrackOrder(true); renderTimeline();
  const nm = (TRACK_DEF.find(t => t.k === k) || {}).name || '';
  // 講清楚：這只是時間軸的排版，畫面上誰蓋在誰上面是另一回事
  toast(`${nm}軌移到第 ${j + 1} 條（只是時間軸排列，不影響畫面上的疊放順序）`);
}

function renderTimeline(){
  markDirty(250);                    // 時間軸有動 → 畫面通常也要跟著變
  applyTrackOrder();                 // 復原／開專案換了順序時也會跟著對回來
  fixInnerWidth();
  const tot = totalDur(), pps = A.pps;
  const inner = $('#tlinner');
  inner.style.width = Math.max(tot * pps + 60, $('#tlwrap').clientWidth) + 'px';

  // 刻度
  const ruler = $('#ruler'); ruler.innerHTML = '';
  const step = pps < 30 ? 10 : pps < 70 ? 5 : pps < 160 ? 2 : 1;
  for (let t = 0; t <= tot + step; t += step){
    const d = document.createElement('div');
    d.className = 'tick'; d.style.left = (t * pps) + 'px'; d.textContent = fmt(t).slice(0, 5);
    ruler.appendChild(d);
  }

  // 影片軌
  const videoGroup = $('#trkVideo');
  videoGroup.style.height='116px';
  if (!$('#videoUpper')){
    for (const [id,track,top] of [['videoUpper',1,18],['videoLower',0,64]]){
      const row=document.createElement('div');row.id=id;row.className='videoLane';
      row.dataset.track=track;
      row.style.cssText='position:absolute;left:0;right:0;height:46px;top:'+top+'px;border-top:1px solid var(--line)';
      const label=document.createElement('span');label.className='videoLaneLabel';
      label.style.cssText='position:absolute;left:8px;top:0;font-size:11px;pointer-events:none;color:var(--fg3)';
      label.textContent=track ? '影片上軌（優先顯示）' : '影片下軌';
      row.appendChild(label);videoGroup.appendChild(row);
    }
  }
  videoGroup.querySelectorAll('.blk,.trx').forEach(n => n.remove());
  const L = layout();
  A.clips.forEach((c, i) => {
    const tv = clipTrack(c) ? $('#videoUpper') : $('#videoLower');
    const b = document.createElement('div');
    b.dataset.clipId=c.id;
    b.style.top='16px';
    b.className = 'blk' + (A.sel.type === 'clip' && A.sel.id === c.id ? ' sel' : '');
    b.style.left = (L[i].startAt * pps) + 'px';
    b.style.width = Math.max(14, L[i].span * pps) + 'px';
    b.innerHTML = (isImg(c) ? '' : `<div class="hd l" title="拖曳裁切開頭"></div>`) +
                  `${c.thumb ? `<img class="tn" src="${c.thumb}">` : ''}<div class="nm" data-nt>${esc(c.name)}</div>` +
                  (c.muted ? '<div class="mu">🔇</div>' : '') +
                  kfMarks(c, Math.max(14, L[i].span * pps)) +
                  `<div class="hd r" title="拖曳裁切結尾"></div>`;
    b.onmousedown = e => {
      if (kfBlockMouse(e, c, b)) return;
      startClipTrim(e, c, i);
    };
    tv.appendChild(b);
    const ow = outWindow(i, L);
    if (ow){
      const y = document.createElement('div');
      y.className = 'trx out'; y.style.top='16px';
      y.style.left = (ow.start * pps) + 'px';
      y.style.width = (ow.dur * pps) + 'px';
      const nm2 = (TRANSITIONS.find(t => t.id === ow.type) || {}).name || '';
      if (ow.dur * pps > 46) y.innerHTML = `<span class="tname">收尾 ${nm2}</span>`;
      tv.appendChild(y);
    }
    if (L[i].tr > 0){
      const x = document.createElement('div');
      x.className = 'trx'; x.style.top='16px';
      x.style.left = (L[i].trAt * pps) + 'px';
      x.style.width = (L[i].tr * pps) + 'px';
      const nm = (TRANSITIONS.find(t => t.id === c.trans.type) || {}).name || '';
      if (L[i].tr * pps > 46) x.innerHTML = `<span class="tname">${nm}</span>`;
      tv.appendChild(x);
    }
  });

  // 疊圖軌
  const to = $('#trkOver');
  to.querySelectorAll('.oblk,.trkhint').forEach(n => n.remove());
  if (!A.overlays.length){
    const hint = document.createElement('div');
    hint.className = 'trkhint';
    hint.textContent = '這一軌的圖片會疊在影片上方 —— 按上面「＋ 疊圖」';
    to.appendChild(hint);
  }
  const olanes = [];
  [...A.overlays].sort((a, b) => a.start - b.start).forEach(o => {
    let ln = olanes.findIndex(end => o.start >= end - 1e-6);
    if (ln < 0){ olanes.push(0); ln = olanes.length - 1; }
    olanes[ln] = o.end;
    const b = document.createElement('div');
    b.className = 'oblk' + (A.sel.type === 'overlay' && A.sel.id === o.id ? ' sel' : '');
    b.style.left = (o.start * pps) + 'px';
    b.style.width = Math.max(28, (o.end - o.start) * pps) + 'px';
    b.style.top = (ln * ROW + 5) + 'px';
    b.innerHTML = `<div class="hd l"></div>` +
      `${o.thumb ? `<img class="tn" src="${o.thumb}">` : ''}<div class="nm" data-nt>${esc(o.name)}</div>` +
      kfMarks(o, Math.max(28, (o.end - o.start) * pps)) +
      `<div class="hd r"></div>`;
    b.onmousedown = e => startOverlayDrag(e, o);
    to.appendChild(b);
  });
  to.style.height = Math.max(ROW, olanes.length * ROW + 2) + 'px';

  // 固定上下字幕軌；同軌重疊仍分列，便於選取。
  const ts=$('#trkSub');ts.style.display='none';ts.classList.remove('trk');
  videoGroup.querySelectorAll('.subtitleLane').forEach(n=>n.remove());
  let subTop=64;
  for(const track of [1,0]){
    const lane=document.createElement('div');lane.className='subtitleLane';
    lane.id=track?'subUpper':'subLower';lane.dataset.track=track;
    lane.style.cssText='position:absolute;left:0;right:0;top:'+subTop+'px;border-top:1px solid var(--line)';
    const label=document.createElement('span');label.className='subtitleLaneLabel';
    label.style.cssText='position:absolute;left:8px;top:0;font-size:11px;pointer-events:none;color:var(--fg3)';
    label.textContent=track?'字幕上軌':'字幕下軌';lane.appendChild(label);
    const ends=[];
    [...A.subs].filter(c=>subTrack(c)===track).sort((a,b)=>a.start-b.start).forEach(c=>{
      let ln=ends.findIndex(end=>c.start>=end-1e-6);
      if(ln<0){ln=ends.length;ends.push(0);}ends[ln]=c.end;
      const b=document.createElement('div');b.dataset.subId=c.id;
      b.className='sblk'+(A.sel.type==='sub'&&A.sel.id===c.id?' sel':'');
      b.style.left=(c.start*pps)+'px';b.style.width=Math.max(22,(c.end-c.start)*pps)+'px';
      b.style.top=(16+ln*30)+'px';b.style.height='26px';
      b.innerHTML=`<div class="hd l"></div><div class="nm" data-nt>${esc(String(c.text).split('\n')[0].slice(0,18))}</div><div class="hd r"></div>`;
      b.onmousedown=e=>startSubDrag(e,c);lane.appendChild(b);
    });
    const h=18+Math.max(1,ends.length)*30;lane.style.height=h+'px';subTop+=h;videoGroup.appendChild(lane);
    if(track===1){$('#videoLower').style.top=subTop+'px';subTop+=46;}
  }
  videoGroup.style.height=subTop+'px';
  for(const id of ['videoUpper','subUpper','videoLower','subLower'])videoGroup.appendChild($('#'+id));

  // 標題軌：重疊的標題自動排到不同列，等於自動長出更多軌道
  const tt = $('#trkTitle');
  tt.querySelectorAll('.tblk,.trkhint').forEach(n => n.remove());
  if (!A.titles.length){
    const hint = document.createElement('div');
    hint.className = 'trkhint';
    hint.textContent = '這一軌放標題 —— 按上面「＋ 標題」，或在這裡雙擊空白處新增';
    tt.appendChild(hint);
  }
  const lanes = [];                                   // 每一列目前排到哪個時間
  const sorted = [...A.titles].sort((a, b) => a.start - b.start);
  for (const t of sorted){
    let ln = lanes.findIndex(end => t.start >= end - 1e-6);
    if (ln < 0){ lanes.push(0); ln = lanes.length - 1; }
    lanes[ln] = t.end;
    const b = document.createElement('div');
    b.className = 'tblk' + (A.sel.type === 'title' && A.sel.id === t.id ? ' sel' : '');
    b.style.left = (t.start * pps) + 'px';
    b.style.width = Math.max(28, (t.end - t.start) * pps) + 'px';
    b.style.top = (ln * ROW + 5) + 'px';
    b.innerHTML = `<div class="hd l"></div><div class="nm" data-nt>T ${esc(t.text.split('\n')[0].slice(0,14))}</div>`
                + kfMarks(t, Math.max(28, (t.end - t.start) * pps)) + `<div class="hd r"></div>`;
    b.onmousedown = e => startTitleDrag(e, t, b);
    tt.appendChild(b);
  }
  tt.style.height = Math.max(ROW, lanes.length * ROW + 2) + 'px';

  // 配樂軌：一條音軌一列，可以疊很多條
  const tm = $('#trkMusic');
  tm.querySelectorAll('.mblk,.trkhint').forEach(n => n.remove());
  if (!A.musics.length){
    const hint = document.createElement('div');
    hint.className = 'trkhint';
    hint.textContent = '這一軌放聲音 —— 按「＋ 音軌」，或直接把音檔拖進視窗（可以放很多條）';
    tm.appendChild(hint);
  }
  const mlanes = [];                                  // 不重疊的音軌塊會排在同一列
  [...A.musics].sort((a, b) => a.startAt - b.startAt).forEach(m => {
    const seg = musicSeg(m), len = m.len;
    let ln = mlanes.findIndex(end => m.startAt >= end - 1e-6);
    if (ln < 0){ mlanes.push(0); ln = mlanes.length - 1; }
    mlanes[ln] = m.startAt + len;
    const b = document.createElement('div');
    b.className = 'mblk' + (A.sel.type === 'music' && A.sel.id === m.id ? ' sel' : '');
    b.style.left = (m.startAt * pps) + 'px';
    b.style.width = Math.max(28, len * pps) + 'px';
    b.style.top = (ln * ROW + 5) + 'px';
    const step = Math.max(0.2, seg - m.xfade);
    const reps = m.loop ? Math.max(1, Math.ceil((len - m.xfade) / step)) : 1;
    let marks = '';
    if (m.loop && reps > 1) for (let r = 1; r < reps; r++) marks += `<i class="rep" style="left:${r*step*pps}px"></i>`;
    if (!m.loop && len > seg + 0.2) marks += `<i class="empty" style="left:${seg*pps}px;width:${(len-seg)*pps}px"></i>`;
    b.innerHTML = `<div class="hd l"></div>` + marks +
      `<div class="nm"><span data-nt>♪ ${esc(m.name)}</span>${m.loop && reps > 1 ? `（循環 ${reps} 輪）` : ''}</div>` +
      vkSvg(m, Math.max(28, len * pps)) +
      `<div class="hd r"></div>`;
    b.dataset.mid = m.id;
    b.onmousedown = e => startMusicDrag(e, m);
    tm.appendChild(b);
  });
  tm.style.height = Math.max(ROW, mlanes.length * ROW + 2) + 'px';
}

/** 在時間軸上直接拖曳片段兩端做裁切 */
function startClipTrim(e, c, i){
  A.sel = { type:'clip', id:c.id };
  const h = e.target.closest('.hd');
  render(); refreshProp();
  if (!h) return startClipReorder(e, c);            // 抓中間＝拖曳換順序
  e.preventDefault();
  pushUndo();
  const mode = h.classList.contains('l') ? 'L' : 'R';
  if (isImg(c) && mode === 'L'){ toast('圖片請拖右緣調整停留長度'); return; }
  const x0 = e.clientX, in0 = c.inP, out0 = c.outP, at0=c.at;
  const L0=layout(),q0=L0[i],floor=q0.prev<0?0:L0[q0.prev].end;
  const mv = ev => {
    const d = (ev.clientX - x0) / A.pps;
    if (mode === 'L'){
      c.inP=clamp(in0+d,Math.max(0,in0+floor-at0),c.outP-0.1);
      if (Number.isFinite(at0)) c.at=Math.max(0,at0+c.inP-in0);
    }
    else              trimClip(c,c.inP,out0+d);   // 上限＝原始長度
    render();
    const ii = $('#cIn'), oo = $('#cOut');
    if (ii) ii.value = c.inP.toFixed(2);
    if (oo) oo.value = c.outP.toFixed(2);
  };
  const up = () => {
    document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up);
    refreshProp();
    if (!isImg(c) && Math.abs(c.outP - c.dur) < 0.02 && mode === 'R') toast('已經拉到這支影片的原始結尾了');
  };
  document.addEventListener('mousemove', mv);
  document.addEventListener('mouseup', up);
}

/** 在時間軸上把片段（影片或圖片都一樣）拖到別的位置換順序 */
function startClipReorder(e, c){
  if (e.button) return;
  e.preventDefault();
  const x0=e.clientX,y0=e.clientY, start=layout()[A.clips.indexOf(c)].startAt;
  let moved=false;
  const mv=ev=>{
    if (!moved && Math.hypot(ev.clientX-x0,ev.clientY-y0)<5) return;
    if (!moved){pushUndo();moved=true;}
    let track=clipTrack(c);
    for (const el of $$('.videoLane')){
      const r=el.getBoundingClientRect();
      if (ev.clientY>=r.top && ev.clientY<=r.bottom) track=+el.dataset.track;
    }
    placeClip(c,track,Math.max(0,start+(ev.clientX-x0)/A.pps));
    render();
  };
  const up=()=>{
    document.removeEventListener('mousemove',mv);document.removeEventListener('mouseup',up);
    if (moved){refreshProp();markDirty(300);toast('影片位置已更新');}
  };
  document.addEventListener('mousemove',mv);document.addEventListener('mouseup',up);
}

/** 字幕方塊：中間拖曳＝移動，兩端拖曳＝改顯示長度 */
function startSubDrag(e, c){
  A.sel = { type:'sub', id:c.id };
  const h = e.target.closest('.hd');
  render(); refreshProp();
  e.preventDefault(); pushUndo();
  const mode = h ? (h.classList.contains('l') ? 'L' : 'R') : 'M';
  const x0 = e.clientX, s0 = c.start, e0 = c.end;
  const mv = ev => {
    const d = (ev.clientX - x0) / A.pps;
    if (mode === 'M'){
      const len=e0-s0;c.start=Math.max(0,s0+d);c.end=c.start+len;
      for(const lane of $$('.subtitleLane')){
        const r=lane.getBoundingClientRect();
        if(ev.clientY>=r.top&&ev.clientY<r.bottom){c.track=+lane.dataset.track;break;}
      }
    }
    else if (mode === 'L') c.start = clamp(s0 + d, 0, e0 - 0.2);
    else c.end = Math.max(c.start + 0.2, e0 + d);
    renderTimeline();
    const a = $('#sStart'), b = $('#sEnd');
    if (a) a.value = c.start.toFixed(2);
    if (b) b.value = c.end.toFixed(2);
  };
  const up = () => { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); refreshProp(); };
  document.addEventListener('mousemove', mv);
  document.addEventListener('mouseup', up);
}

/** 疊圖方塊：中間拖曳＝移動，兩端拖曳＝改長度（等於這張圖多插幾幀） */
function startOverlayDrag(e, o){
  const blk = e.target.closest('.oblk');
  if (blk && kfBlockMouse(e, o, blk)) return;
  A.sel = { type:'overlay', id:o.id };
  const h = e.target.closest('.hd');
  render(); refreshProp();
  e.preventDefault();
  const mode = h ? (h.classList.contains('l') ? 'L' : 'R') : 'M';
  const x0 = e.clientX, s0 = o.start, e0 = o.end, g0 = o.gifOffset || 0;
  let dirty = false;
  const mv = ev => {
    if (!dirty){ dirty = true; pushUndo(); }      // 真的動了才記復原點
    const d = (ev.clientX - x0) / A.pps;
    if (mode === 'M'){ const len = e0 - s0; o.start = Math.max(0, s0 + d); o.end = o.start + len; }
    else if (mode === 'L'){
      o.start = clamp(s0 + d, 0, e0 - 0.2);
      if (o._gif) o.gifOffset = g0 + o.start - s0;
    }
    else o.end = Math.max(o.start + 0.2, e0 + d);
    renderTimeline();
    const a = $('#oStart'), b = $('#oEnd');
    if (a) a.value = o.start.toFixed(2);
    if (b) b.value = o.end.toFixed(2);
  };
  const up = () => { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); refreshProp(); };
  document.addEventListener('mousemove', mv);
  document.addEventListener('mouseup', up);
}

/** 音軌方塊：中間拖曳＝移動，兩端拖曳＝裁切長度 */
/* ── 音量曲線：畫在配樂方塊上 ─────────────────────────────────
   SVG 疊在方塊裡，整片 pointer-events:none，只有圓點吃得到滑鼠 ——
   跟 v7.4 軌道名稱同一個作法：拖方塊、拉兩端裁切的手感完全不變。
   雙擊空白處加點、拖圓點改高低與時間、右鍵刪點。 */
const VK_H = 34, VK_PAD = 4;                 // 方塊內高與上下留白
const vkY = v => (1 - clamp(v, 0, 1)) * (VK_H - VK_PAD * 2) + VK_PAD;

function vkSvg(m, wpx){
  const k = m.vk || [], w = Math.max(2, wpx);
  const X = t => clamp(t / Math.max(0.001, m.len), 0, 1) * w;
  const pts = k.length
    ? [`0,${vkY(k[0].v)}`].concat(k.map(p => `${X(p.t)},${vkY(p.v)}`))
                          .concat([`${w},${vkY(k[k.length - 1].v)}`]).join(' ')
    : `0,${vkY(1)} ${w},${vkY(1)}`;
  const dots = k.map((p, i) =>
    `<circle class="vkd" data-i="${i}" cx="${X(p.t)}" cy="${vkY(p.v)}" r="4"></circle>`).join('');
  return `<svg class="vkline${k.length ? '' : ' flat'}" width="${w}" height="${VK_H}" `
       + `viewBox="0 0 ${w} ${VK_H}"><polyline points="${pts}"></polyline>${dots}</svg>`;
}

/** 拖圓點。renderTimeline 會重建 DOM，所以事前把方塊的矩形記下來，靠索引找點 */
function startVkDrag(e, m, i){
  e.preventDefault(); e.stopPropagation();
  A.sel = { type:'music', id:m.id };
  pushUndo();
  const box = e.target.closest('.mblk');
  const r = box.getBoundingClientRect();
  const mv = ev => {
    const p = m.vk && m.vk[i];
    if (!p) return;
    p.t = clamp((ev.clientX - r.left) / A.pps, 0, m.len);
    p.v = clamp(1 - (ev.clientY - r.top - VK_PAD) / (VK_H - VK_PAD * 2), 0, 1);
    renderTimeline(); markDirty(200);
  };
  const up = () => {
    document.removeEventListener('mousemove', mv);
    document.removeEventListener('mouseup', up);
    vkTidy(m); renderTimeline(); refreshProp();
  };
  document.addEventListener('mousemove', mv);
  document.addEventListener('mouseup', up);
}

/** 雙擊方塊空白處 → 在曲線上加一個點（值取當下曲線高度，加了不會突然跳） */
function vkAddAtEvent(e, m){
  const cls = e.target.classList;
  if (cls && (cls.contains('vkd') || cls.contains('hd'))) return;
  e.preventDefault(); e.stopPropagation();
  const box = e.target.closest('.mblk');
  if (!box) return;
  const t = clamp((e.clientX - box.getBoundingClientRect().left) / A.pps, 0, m.len);
  pushUndo();
  vkAdd(m, t, musicGainAt(m, m.startAt + t));
  A.sel = { type:'music', id:m.id };
  render(); refreshProp(); markDirty(300);
  toast('已加一個音量點：往下拖就是壓低，右鍵可以刪掉');
}

function vkDelAtEvent(e, m){
  const cls = e.target.classList;
  if (!cls || !cls.contains('vkd')) return;
  e.preventDefault();
  pushUndo();
  (m.vk || []).splice(+e.target.dataset.i, 1);
  render(); refreshProp(); markDirty(300);
  toast('已刪除這個音量點');
}

let _mClick = null;


/** 快速對位：把「播放頭當下看到的位置」搬到指定的格子。
    沒有動態時就等於直接設 x/y（跟以前一樣）；有動態時整條路徑一起平移，
    不然按了置中畫面卻不動 —— 因為改到的是起點，而你正在看的是終點。 */
function kfAlign(obj, prop, target){
  const cur = kfAt(obj, prop, kfBase(obj, prop), A.playhead);
  const d = target - cur;
  obj[prop] = clamp(kfBase(obj, prop) + d, 0, 1);
  const k = kfEnd(obj, prop);
  if (k) k.v = clamp(k.v + d, 0, 1);
}

/* ── 動態的兩個時間標記，畫在疊圖／標題方塊上 ─────────────────
   起點之前維持起點的樣子、終點之後維持終點的樣子，中間才走。
   標記可以拖；在方塊上連點兩下會把「比較近的那一個」移過來。
   跟音量曲線同樣的道理：只有標記吃得到滑鼠，方塊本身照樣拖得動。 */
function kfBlockSpan(obj,w){
  const i=A.clips.indexOf(obj),q=i>=0?layout()[i]:null;
  return q ? {left:(q.start-q.startAt)/q.span*w,width:q.dur/q.span*w} : {left:0,width:w};
}
function kfMarks(obj, wpx){
  if (!kfOn(obj)) return '';
  const [a, b] = kfWin(obj), w = Math.max(28, wpx);
  // 菱形往內縮一點點：預設位置剛好在方塊兩端，跟裁切用的 .hd 疊在一起，
  // 不縮的話一抓就抓到裁切把手，方塊會跟著被拉長縮短。
  const part=kfBlockSpan(obj,w);
  const px = f => clamp(part.left+f*part.width,5,w-5).toFixed(1);
  return `<i class="kfbar" style="left:${px(a)}px;width:${Math.max(1, +px(b) - +px(a)).toFixed(1)}px"></i>`
       + `<i class="kfm" data-m="0" style="left:${px(a)}px" title="動態起點（拖曳可移動）"></i>`
       + `<i class="kfm" data-m="1" style="left:${px(b)}px" title="動態終點（拖曳可移動）"></i>`;
}

function kfSetWinAt(obj, i, f){
  const w = kfWin(obj).slice();
  w[i] = i === 0 ? Math.min(f, w[1]) : Math.max(f, w[0]);   // 兩個標記不互相穿過去
  obj.kfT = w;
}

function startKfMarkDrag(e, obj, i, blk){
  e.preventDefault(); e.stopPropagation();
  const r = blk.getBoundingClientRect(),part=kfBlockSpan(obj,r.width);
  pushUndo();
  const mv = ev => {
    kfSetWinAt(obj, i, clamp((ev.clientX-r.left-part.left)/Math.max(1,part.width),0,1));
    renderTimeline(); markDirty(200);
  };
  const up = () => {
    document.removeEventListener('mousemove', mv);
    document.removeEventListener('mouseup', up);
    refreshProp();
  };
  document.addEventListener('mousemove', mv);
  document.addEventListener('mouseup', up);
}

/* 連點兩下：把比較近的那個標記搬過來。
   不能用瀏覽器的 dblclick —— 第一次 mousedown 就 render() 了，方塊是新節點。 */
let _blkClick = null;
function kfBlockMouse(e, obj, blk){
  if (e.button) return true;                                  // 右鍵不做事
  if (e.target.classList && e.target.classList.contains('kfm')){
    startKfMarkDrag(e, obj, +e.target.dataset.m, blk); return true;
  }
  const now = performance.now();
  const dbl = _blkClick && _blkClick.id === obj.id && now - _blkClick.t < 400
           && Math.abs(e.clientX - _blkClick.x) < 6 && Math.abs(e.clientY - _blkClick.y) < 6;
  _blkClick = { id: obj.id, t: now, x: e.clientX, y: e.clientY };
  if (!dbl || !kfOn(obj) || (e.target.classList && e.target.classList.contains('hd'))) return false;
  _blkClick = null;
  e.preventDefault(); e.stopPropagation();
  const r = blk.getBoundingClientRect();
  const part=kfBlockSpan(obj,r.width);
  const f=clamp((e.clientX-r.left-part.left)/Math.max(1,part.width),0,1);
  const w = kfWin(obj);
  const i = Math.abs(f - w[0]) <= Math.abs(f - w[1]) ? 0 : 1;
  pushUndo();
  kfSetWinAt(obj, i, f);
  render(); refreshProp(); markDirty(300);
  toast(i === 0 ? '動態起點移到這裡' : '動態終點移到這裡');
  return true;
}

/* 動態（起點 → 終點）：面板上只編「終點」那一個關鍵幀，
   起點永遠是上面原本那組滑桿。詳見 20_core.js 的 kfAt 註解。 */
function kfGroup(o, id, props, hintOn){
  const on = kfOn(o);
  const [from, to] = kfBounds(o);
  const e0 = (props.map(q => kfEnd(o, q[0])).find(Boolean) || {}).e || 'inout';
  const end = (prop, base) => { const k = kfEnd(o, prop); return k ? k.v : base; };
  return `<div class="grp"><h4 class="keyframe-heading">關鍵偵開啟/關閉</h4>
    <div class="row keyframe-toggle"><label for="${id}Kf">開啟/關閉</label><div class="f">
      <input type="checkbox" id="${id}Kf"${on ? ' checked' : ''}>
      </div></div>
    ${on ? rowNum(id + 'Kt0', '動態開始', +(from + kfWin(o)[0] * (to - from)).toFixed(2), 0.1,
                  `<button class="gh" id="${id}Kt0Now" style="padding:5px 8px">現在</button>`)
           + rowNum(id + 'Kt1', '動態結束', +(from + kfWin(o)[1] * (to - from)).toFixed(2), 0.1,
                  `<button class="gh" id="${id}Kt1Now" style="padding:5px 8px">現在</button>`)
           + `<div class="hint">起點之前維持起點的樣子，終點之後維持終點的樣子。
              兩個菱形標記也可以直接在時間軸的方塊上拖，或在方塊上連點兩下把最近的搬過來。</div>`
           + '<div class="hint">有底色與 ◆ 的項目已設關鍵幀；藍色是起點，紫色是終點。</div>'
           + props.map(q => rowRange(id + 'K' + q[0], q[1], q[2], q[3], q[4], end(q[0], q[5]), q[6])).join('')
           + rowSel(id + 'Ke', '緩動', EASES, e0)
           + `<div class="hint">${hintOn}</div>`
         : ''}</div>`;
}
// 依實際關鍵幀標記起點／終點；只加樣式，不改資料及控制項。
function kfMarkRows(o,id,props){
  const suffix={x:'X',y:'Y',scale:'Scale',size:'Size',opacity:'Opa',rot:'Rot',motionRot:'MotionRot'};
  for(const [key] of props){
    const active=!!kfEnd(o,key),base=key.startsWith('crop')?'Crop'+key:suffix[key];
    for(const [control,role] of [[base&&id+base,'start'],[id+'K'+key,'end']]){
      const row=control&&$('#'+control)?.closest('.row');if(!row)continue;
      row.classList.toggle('kf-row',active);
      if(active)row.dataset.kfRole=role;else delete row.dataset.kfRole;
    }
  }
}
function kfBind(o, id, props, after){
  kfMarkRows(o,id,props);
  bind(id + 'Kf', 'change', (_, el) => {
    pushUndo();
    if (el.checked) props.forEach(q => kfSetEnd(o, q[0], Number.isFinite(o[q[0]]) ? o[q[0]] : q[5]));
    else kfClear(o);
    if (after) after();
    render(); refreshProp();
  });
  props.forEach(q => bind(id + 'K' + q[0], 'input', v => {
    kfSetEnd(o, q[0], +v);
    kfMarkRows(o,id,props);
    setVal(id + 'K' + q[0], (+v).toFixed(q[4] >= 1 ? 0 : 2) + q[6]);
    if (after) after();
    markDirty(400);
  }));
  bind(id + 'Ke', 'change', v => {
    props.forEach(q => { const k = kfEnd(o, q[0]); if (k) k.e = v; });
    markDirty(400);
  });
  const frac = sec => {
    const [from, to] = kfBounds(o);
    return clamp((sec - from) / Math.max(0.05, to - from), 0, 1);
  };
  [0, 1].forEach(i => {
    bind(id + 'Kt' + i, 'input', v => { kfSetWinAt(o, i, frac(+v)); renderTimeline(); markDirty(300); });
    on(id + 'Kt' + i + 'Now', () => { kfSetWinAt(o, i, frac(A.playhead)); render(); refreshProp(); markDirty(300); });
  });
}

function startMusicDrag(e, m){
  if (e.button) return;                                   // 右鍵留給刪點
  if (e.target.classList && e.target.classList.contains('vkd'))
    return startVkDrag(e, m, +e.target.dataset.i);
  /* 自己判連點兩下 —— 不能靠瀏覽器的 dblclick：
     第一次 mousedown 就會 render()，方塊整個被換掉，
     兩次點擊落在不同節點上，Chrome 根本不會發 dblclick（實測過）。 */
  const now = performance.now();
  const dbl = _mClick && _mClick.id === m.id && now - _mClick.t < 400
           && Math.abs(e.clientX - _mClick.x) < 6 && Math.abs(e.clientY - _mClick.y) < 6;
  _mClick = { id: m.id, t: now, x: e.clientX, y: e.clientY };
  if (dbl){ _mClick = null; return vkAddAtEvent(e, m); }

  A.sel = { type:'music', id:m.id };
  const h = e.target.closest('.hd');
  render(); refreshProp();
  e.preventDefault();
  const mode = h ? (h.classList.contains('l') ? 'L' : 'R') : 'M';
  const x0 = e.clientX, s0 = m.startAt, l0 = m.len;
  const tot = () => Math.max(0.5, totalDur());
  let dirty = false;
  const mv = ev => {
    // 真的動了才記復原點：以前每點一下方塊就存一筆，復原按半天沒反應
    if (!dirty){ dirty = true; pushUndo(); }
    const d = (ev.clientX - x0) / A.pps;
    if (mode === 'M'){
      m.startAt = clamp(s0 + d, 0, Math.max(0, tot() - 0.3));
      m.len = Math.min(l0, tot() - m.startAt);
    } else if (mode === 'L'){
      const ns = clamp(s0 + d, 0, s0 + l0 - 0.3);
      m.len = l0 - (ns - s0);
      m.startAt = ns;
      m.autoLen = false;
    } else {
      m.len = clamp(l0 + d, 0.3, tot() - m.startAt);
      m.autoLen = false;
    }
    renderTimeline();
    const a = $('#mStart'), b = $('#mLen');
    if (a) a.value = m.startAt.toFixed(2);
    if (b) b.value = m.len.toFixed(2);
  };
  const up = () => { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); refreshProp(); };
  document.addEventListener('mousemove', mv);
  document.addEventListener('mouseup', up);
}

function startTitleDrag(e, t, box){
  if (box && kfBlockMouse(e, t, box)) return;
  e.preventDefault();
  A.sel = { type:'title', id:t.id }; render(); refreshProp();
  const mode = e.target.classList.contains('hd')
    ? (e.target.classList.contains('l') ? 'L' : 'R') : 'M';
  const x0 = e.clientX, s0 = t.start, e0 = t.end;
  let dirty = false;
  const mv = ev => {
    if (!dirty){ dirty = true; pushUndo(); }      // 真的動了才記復原點
    const d = (ev.clientX - x0) / A.pps;
    if (mode === 'M'){ const len = e0 - s0; t.start = Math.max(0, s0 + d); t.end = t.start + len; }
    if (mode === 'L') t.start = clamp(s0 + d, 0, e0 - 0.3);
    if (mode === 'R') t.end   = Math.max(t.start + 0.3, e0 + d);
    renderTimeline();
    const si = $('#tStart'), ei = $('#tEnd');
    if (si) si.value = t.start.toFixed(2);
    if (ei) ei.value = t.end.toFixed(2);
  };
  const up = () => { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); };
  document.addEventListener('mousemove', mv);
  document.addEventListener('mouseup', up);
}

/* ── 屬性面板 ──────────────────────────────────────────────── */
const rowRange = (id, label, min, max, stepv, val, unit) =>
  `<div class="row"><label>${label}</label><div class="f">
     <input type="range" id="${id}" min="${min}" max="${max}" step="${stepv}" value="${val}">
     <span class="val" id="${id}_v">${val}${unit||''}</span></div></div>`;
// 注意：value 一定要跳脫。字體字串本身含雙引號，不跳脫的話屬性會提前結束，
// value 變成空字串，ctx.font 就整行失效退回 10px 預設字 —— 這是 v2.1 以前字會縮小的元兇。
const rowSel = (id, label, opts, cur) =>
  `<div class="row"><label>${label}</label><div class="f"><select id="${id}">` +
  opts.map(o => `<option value="${esc(o[0])}"${o[0] == cur ? ' selected' : ''}>${esc(o[1])}</option>`).join('') +
  `</select></div></div>`;
// 有分類的下拉選單（轉場、標題動畫），用 optgroup 分組
const rowSelG = (id, label, items, cur) => {
  const gs = [];
  items.forEach(o => {
    let g = gs.find(x => x[0] === (o.g || ''));
    if (!g){ g = [o.g || '', []]; gs.push(g); }
    g[1].push(o);
  });
  const body = gs.map(([g, list]) =>
    (g ? `<optgroup label="${esc(g)}">` : '') +
    list.map(o => `<option value="${esc(o.id)}"${o.id == cur ? ' selected' : ''}>${esc(o.name)}</option>`).join('') +
    (g ? '</optgroup>' : '')).join('');
  return `<div class="row"><label>${label}</label><div class="f"><select id="${id}">${body}</select></div></div>`;
};
const rowBtn = (id, text) =>
  `<div class="row"><div class="f"><button class="gh" id="${id}" style="flex:1">${text}</button></div></div>`;
const rowNum = (id, label, val, stepv, extra) =>
  `<div class="row"><label>${label}</label><div class="f">
     <input type="number" id="${id}" step="${stepv}" value="${(+val).toFixed(2)}">${extra||''}</div></div>`;

function clipCropProps(c){
  const center = [['cropX','裁切中心水平',0,1,0.01,c.cropX,''],
                  ['cropY','裁切中心垂直',0,1,0.01,c.cropY,'']];
  if (c.cropShape === 'rect') return center.concat([
    ['cropW','裁切寬度',0.01,1,0.01,c.cropW,''],
    ['cropH','裁切高度',0.01,1,0.01,c.cropH,'']]);
  if (c.cropShape === 'circle') return center.concat([
    ['cropSize','裁切直徑',0,1,0.01,c.cropSize,'']]);
  return [];
}

function refreshProp(){
  const p = $('#prop'), s = A.sel;
  if (s.type === 'clip'){
    const c = A.clips.find(x => x.id === s.id);
    if (!c){ A.sel = { type:'proj' }; return refreshProp(); }
    const i = A.clips.indexOf(c);
    c.x = Number.isFinite(c.x) ? c.x : 0.5;
    c.y = Number.isFinite(c.y) ? c.y : 0.5;
    c.scale = Number.isFinite(c.scale) ? c.scale : 1;
    c.opacity = Number.isFinite(c.opacity) ? c.opacity : 1;
    c.motionRot = Number.isFinite(c.motionRot) ? c.motionRot : 0;
    if (!['none','rect','circle'].includes(c.cropShape)) c.cropShape = 'none';
    for (const [key, base] of Object.entries({cropX:0.5,cropY:0.5,cropW:1,cropH:1,cropSize:1}))
      c[key] = Number.isFinite(c[key]) ? c[key] : base;
    const motionProps = [
      ['x','水平',0,1,0.01,c.x,''], ['y','垂直',0,1,0.01,c.y,''],
      ['scale','大小',0.05,3,0.01,c.scale,''], ['opacity','不透明度',0,1,0.02,c.opacity,''],
      ['motionRot','旋轉',-180,180,1,c.motionRot,'°'], ...clipCropProps(c)];

    $('#propTitle').textContent = `片段 ${i+1}`;
    p.innerHTML =
      `<div class="grp"><h4>影片軌道</h4>
        ${rowSel('cTrack','放在哪一軌',[['1','上軌（優先顯示）'],['0','下軌']],String(clipTrack(c)))}
        ${rowNum('cAt','時間軸起點',layout()[i].startAt,0.1,'<button class="gh" id="cAtNow">現在</button>')}
        ${rowBtn('cAtAuto','接在同軌上一段後面')}
        <div class="hint">上軌蓋住下軌，裁切外與透明區域會露出下軌。可把影片方塊拖到另一軌，或左右移動安排時間。</div>
        <div class="hint">兩軌都可以拖開留白；內扣與外加只決定開頭、結尾轉場如何取畫面。</div>
        <div class="hint">兩軌原聲一起混音；只要一軌的聲音時，將另一段原聲靜音。</div></div>
       <div class="grp"><h4 data-nt>${esc(c.name)}</h4>
        <div class="hint">${isImg(c) ? `圖片　${c.w}×${c.h}　長度可任意調整`
                                     : `原始長度 ${fmt(c.dur)}　解析度 ${c.w}×${c.h}`
                                       + (c.rot ? `　→ 轉 ${c.rot}° 後 ${clipSize(c).w}×${clipSize(c).h}` : '')}</div></div>` +
      (isImg(c)
       ? `<div class="grp"><h4>停留長度</h4>
            ${rowNum('cOut','秒數', c.outP, 0.5, '')}
            <div class="hint">也可以拖時間軸上這一段的右緣。加長就是這張圖多插幾幀。</div></div>`
       : `<div class="grp"><h4>裁切</h4>
            ${rowNum('cIn','起點', c.inP, 0.05, '<button class="gh" id="cInNow" style="padding:5px 8px">現在</button>')}
            ${rowNum('cOut','終點', c.outP, 0.05, '<button class="gh" id="cOutNow" style="padding:5px 8px">現在</button>')}
            <div class="hint">使用後長度 ${fmt(clipDur(c))}</div></div>
          <div class="grp"><h4>聲音</h4>
            <div class="row"><label>原聲靜音</label><div class="f">
              <input type="checkbox" id="cMute"${c.muted ? ' checked' : ''}>
              <span class="hint">勾選後靜音</span></div></div>
            ${rowRange('cVol','音量',0,1.5,0.05,c.vol,'')}</div>`) +
      `
       <div class="grp"><h4>${kfOn(c) ? '影片構圖（起點）' : '影片構圖'}</h4>
        <div class="row"><label>快速對位</label><div class="f"><div class="nine" id="cnine">
          <button data-p="0.12,0.15">↖</button><button data-p="0.5,0.15">↑</button><button data-p="0.88,0.15">↗</button>
          <button data-p="0.12,0.5">←</button><button data-p="0.5,0.5">●</button><button data-p="0.88,0.5">→</button>
          <button data-p="0.12,0.85">↙</button><button data-p="0.5,0.85">↓</button><button data-p="0.88,0.85">↘</button>
        </div></div></div>
        ${rowRange('cX','水平',0,1,0.01,c.x,'')}
        ${rowRange('cY','垂直',0,1,0.01,c.y,'')}
        ${rowRange('cScale','大小',0.05,3,0.01,c.scale,'')}
        ${rowRange('cOpa','不透明度',0,1,0.02,c.opacity,'')}
        ${rowRange('cMotionRot','旋轉',-180,180,1,c.motionRot,'°')}
        <div class="hint">大小 1.00 代表目前專案的顯示大小；畫面方向仍在下一組設定。</div></div>
       <div class="grp"><h4>${kfOn(c) ? '畫面裁切（起點）' : '畫面裁切'}</h4>
        ${rowSel('cCropShape','裁切形狀',[['none','不裁切'],['rect','矩形'],['circle','圓形']],c.cropShape)}
        ${clipCropProps(c).map(q => rowRange('cCrop'+q[0],q[1],q[2],q[3],q[4],q[5],q[6])).join('')}
        <div class="hint">裁切保留框內畫面；寬高 1.00 為整個可見畫面，圓形直徑 1.00 為短邊。裁切後仍可縮放、移動、淡化與旋轉。</div>
        <div class="hint">啟用下方動態後，可設定裁切大小與中心的終點；形狀整段固定。</div></div>
       ${kfGroup(c, 'c', motionProps,
         '從起點平滑走到終點；轉場、調色、預覽與匯出會一起套用。')}
       <div class="grp"><h4>畫面方向</h4>
        <div class="row"><label>旋轉</label><div class="f">
          ${[0,90,180,270].map(r =>
            `<button class="gh rotb${(c.rot||0)===r?' on':''}" data-rot="${r}" style="flex:1;padding:5px 2px">${r}°</button>`).join('')}
        </div></div>
        <div class="hint">預覽跟匯出用的是同一套繪製，這裡轉幾度，出來就是幾度。<br>
        直立手機拍的影片本來就會自動轉正；只有轉錯或想自己換方向時才要動這裡。</div></div>
       <div class="grp"><h4 class="transition-heading">這一段的轉場</h4>
        ${rowSel('cVideoMode','內扣／外加',VIDEO_MODES,clipMode(c))}
        <div class="hint">內扣：使用片段原有時間，轉場期間原畫面繼續播放。</div>
        <div class="hint">外加：開頭重複第一幀、結尾重複最後一幀，額外增加轉場時間；定格區間沒有原聲。</div>
        <div class="hint">外加或延長轉場若碰到同軌下一段，會將下一段向後排開；另一軌不動。</div></div>
       <div class="grp"><h4>這一段淡入淡出</h4>
        ${rowRange('cFi','開場淡入',0,5,0.1,c.fadeIn||0,' 秒')}
        ${rowRange('cFo','結尾淡出',0,5,0.1,c.fadeOut||0,' 秒')}
        ${isImg(c)?'':`<div class="row"><label>聲音一起</label><div class="f">
          <input type="checkbox" id="cFaudio"${c.fadeAudio===false?'':' checked'}>
          <span class="hint">這段原聲跟著畫面一起淡</span></div></div>`}
        <div class="hint">淡化時間從片段方塊的頭尾計算，包含外加定格；只影響這段畫面與原聲，配樂另設。</div>
        <div class="hint">取消「聲音一起」只取消這組原聲淡化；轉場原有的聲音效果仍保留。</div></div>
       <div class="grp"><h4 class="transition-heading">轉場（進入這一段）</h4>
        ${rowSelG('cTrans','類型',TRANSITIONS,c.trans.type) +
            rowBtn('cTransPick','▦ 看預覽挑轉場（30 種）') +
            rowRange('cTransD','時長',0.2,5,0.05,c.trans.dur,' 秒')}

       </div>
       <div class="grp"><h4 class="transition-heading">轉場（離開這一段）</h4>
        ${rowSelG('cTrOut','類型', TRANSITIONS, (c.transOut && c.transOut.type) || 'none')}
        ${rowBtn('cTrOutPick','▦ 看預覽挑收尾轉場')}
        ${rowRange('cTrOutD','長度',0,5,0.05,(c.transOut && c.transOut.dur) || 0,' 秒')}
        <div class="hint">收尾轉場使用這一段的內扣或外加方式。內扣時原聲同步淡出；外加定格區間沒有原聲。</div>
       </div>` + gradePanel(c);
    const reposition=(track,at)=>{
      placeClip(c,track,at);render();refreshProp();markDirty(400);
    };
    bind('cTrack','change',v=>reposition(+v,layout()[A.clips.indexOf(c)].startAt));
    bind('cAt','change',v=>reposition(clipTrack(c),Math.max(0,+v||0)));
    on('cAtNow',()=>reposition(clipTrack(c),A.playhead));
    on('cAtAuto',()=>{
      const L=layout(),q=L[A.clips.indexOf(c)];
      placeClip(c,clipTrack(c),q.prev<0?0:L[q.prev].end);render();refreshProp();
    });
    bind('cIn','input', v => { trimClip(c,+v,c.outP); render(); });
    bind('cOut','input', v => { trimClip(c,c.inP,+v); render(); });
    on('cInNow', () => { const L = layout(); trimClip(c,c.inP+(A.playhead-L[i].start),c.outP); render(); refreshProp(); });
    on('cOutNow',() => { const L = layout(); trimClip(c,c.inP,c.inP+(A.playhead-L[i].start)); render(); refreshProp(); });
    bind('cMute','change', (_, el) => { c.muted = el.checked; render(); });
    bind('cVol','input', v => { c.vol = +v; setVal('cVol', (+v).toFixed(2)); });
    const showClip = () => {
      const q = layout()[i];
      if (q && (A.playhead < q.start || A.playhead > q.start + q.dur))
        seekTo(q.start + Math.min(0.4, q.dur / 2));
      else markDirty(300);
    };
    bind('cX','input', v => { c.x = +v; setVal('cX', (+v).toFixed(2)); showClip(); });
    bind('cY','input', v => { c.y = +v; setVal('cY', (+v).toFixed(2)); showClip(); });
    bind('cScale','input', v => { c.scale = +v; setVal('cScale', (+v).toFixed(2)); showClip(); });
    bind('cOpa','input', v => { c.opacity = +v; setVal('cOpa', (+v).toFixed(2)); showClip(); });
    bind('cMotionRot','input', v => { c.motionRot = +v; setVal('cMotionRot', v + '°'); showClip(); });
    bind('cCropShape','change', v => {
      c.cropShape = v;
      if (kfOn(c)){
        const ease = (Object.values(c.kf).find(k => k && k.length) || [{}])[0].e || 'inout';
        clipCropProps(c).forEach(q => { if (!kfEnd(c,q[0])) kfSetEnd(c,q[0],q[5],ease); });
      }
      showClip(); renderTimeline(); refreshProp();
    });
    clipCropProps(c).forEach(q => bind('cCrop'+q[0],'input', v => {
      c[q[0]] = +v; setVal('cCrop'+q[0],(+v).toFixed(2)); showClip();
    }));
    kfBind(c, 'c', motionProps, showClip);
    $$('#cnine button').forEach(b => b.onclick = () => {
      const [x, y] = b.dataset.p.split(',').map(Number);
      pushUndo();
      kfAlign(c, 'x', x); kfAlign(c, 'y', y);
      showClip(); markDirty(); refreshProp();
    });
    bind('cTrans','change', v => {
      c.trans.type = v; render();
      const L = layout();                      // 跳到接縫中間，馬上看得到換成什麼樣子
      if (L[i]) seekTo(L[i].trAt + (L[i].tr || 0) / 2);
    });
    on('cTransPick', () => openPicker('trans', c.trans.type, id => {
      c.trans.type = id;
      const sel = $('#cTrans'); if (sel) sel.value = id;
      const L = layout();                       // 跳到接縫中間，關掉選單就看得到結果
      if (L[i]) seekTo(L[i].trAt + (L[i].tr || 0) / 2);
      render();
    }));
    bind('cTransD','input', v => { c.trans.dur = +v; setVal('cTransD', (+v).toFixed(2) + ' 秒'); render(); });
    bind('cVideoMode','change',v=>setClipMode(c,v));
    for(const [id,key] of [['cFi','fadeIn'],['cFo','fadeOut']])bind(id,'input',v=>{
      c[key]=Math.max(0,+v||0);setVal(id,c[key].toFixed(1)+' 秒');markDirty();syncMedia();
    });
    bind('cFaudio','change',(_,el)=>{c.fadeAudio=el.checked;markDirty();syncMedia();});
    const outOf = () => (c.transOut || (c.transOut = { type:'none', dur:0.6 }));
    const seekOut = () => {
      const w = outWindow(i);                 // 跳到收尾中間，馬上看得到
      if (w) seekTo(w.start + w.dur / 2);
    };
    bind('cTrOut','change', v => {
      pushUndo();
      const o = outOf(); o.type = v;
      if (v !== 'none' && !(o.dur > 0)) o.dur = 0.6;   // 從「無」切過去時給個預設長度
      render(); refreshProp(); seekOut();
    });
    on('cTrOutPick', () => openPicker('trans', outOf().type, id => {
      pushUndo();
      const o = outOf(); o.type = id;
      if (id !== 'none' && !(o.dur > 0)) o.dur = 0.6;
      const sel = $('#cTrOut'); if (sel) sel.value = id;
      render(); seekOut();
    }));
    bind('cTrOutD','input', v => {
      const o = outOf(); o.dur = +v;
      setVal('cTrOutD', (+v).toFixed(2) + ' 秒');
      render();
    });
    $$('#prop .rotb').forEach(btn => btn.onclick = () => {
      const r = +btn.dataset.rot;
      if ((c.rot || 0) === r) return;
      pushUndo();
      c.rot = r;
      render(); refreshProp();
      toast(r ? `這一段轉 ${r}°` : '這一段回到原始方向');
    });
    bindGrade(c);

  } else if (s.type === 'title'){
    const t = A.titles.find(x => x.id === s.id);
    if (!t){ A.sel = { type:'proj' }; return refreshProp(); }
    t.font = safeFont(t.font);              // 修好舊版留下的空字體
    t.opacity = Number.isFinite(t.opacity) ? clamp(t.opacity,0,1) : 1;
    t.rot = Number.isFinite(t.rot) ? t.rot : 0;
    const titleMotionProps = [
      ['x','水平',0,1,0.01,t.x,''],['y','垂直',0,1,0.01,t.y,''],
      ['size','大小',16,240,2,t.size,' px'],['opacity','不透明度',0,1,0.02,t.opacity,''],
      ['rot','旋轉',-180,180,1,t.rot,'°']
    ];
    $('#propTitle').textContent = '標題';
    p.innerHTML =
      `<div class="grp"><h4>內容</h4>
        <textarea id="tText" rows="3">${esc(t.text)}</textarea>
        <div class="hint" style="margin-top:5px">按 Enter 可換行</div></div>
       <div class="grp"><h4>字型</h4>
        ${rowSel('tFont','字體', FONTS.map(f => [f.id, f.name]), t.font)}
        <div class="row"><label>文字顏色</label><div class="f">
          <input type="color" id="tColor" value="${t.color}"></div></div>
        <div class="row"><label>描邊</label><div class="f">
          <input type="color" id="tStroke" value="${t.stroke}" style="max-width:60px">
          <input type="range" id="tStrokeW" min="0" max="12" step="1" value="${t.strokeW}">
          <span class="val" id="tStrokeW_v">${t.strokeW}</span></div></div>
        <div class="row"><label>樣式</label><div class="f">
          <label class="hint"><input type="checkbox" id="tBold"${t.bold ? ' checked' : ''}> 粗體</label>
          <label class="hint"><input type="checkbox" id="tShadow"${t.shadow ? ' checked' : ''}> 陰影</label></div></div></div>
       <div class="grp"><h4>${kfOn(t) ? '標題構圖（起點）' : '標題構圖'}</h4>
        <div class="row"><label>快速對位</label><div class="f"><div class="nine" id="nine">
          <button data-p="0.1,0.15">↖</button><button data-p="0.5,0.15">↑</button><button data-p="0.9,0.15">↗</button>
          <button data-p="0.1,0.5">←</button><button data-p="0.5,0.5">●</button><button data-p="0.9,0.5">→</button>
          <button data-p="0.1,0.85">↙</button><button data-p="0.5,0.85">↓</button><button data-p="0.9,0.85">↘</button>
        </div></div></div>
        ${rowRange('tX','水平',0,1,0.01,t.x,'')}
        ${rowRange('tY','垂直',0,1,0.01,t.y,'')}
        ${rowRange('tSize','大小',16,240,2,t.size,' px')}
        ${rowRange('tOpa','不透明度',0,1,0.02,t.opacity,'')}
        ${rowRange('tRot','旋轉',-180,180,1,t.rot,'°')}
        ${rowSel('tAlign','對齊',[['left','靠左'],['center','置中'],['right','靠右']],t.align)}</div>
       <div class="grp"><h4>時間</h4>
        ${rowNum('tStart','出現', t.start, 0.1, '<button class="gh" id="tStartNow" style="padding:5px 8px">現在</button>')}
        ${rowNum('tEnd','消失', t.end, 0.1, '<button class="gh" id="tEndNow" style="padding:5px 8px">現在</button>')}
        <div class="hint">也可以直接在時間軸上拖曳。</div></div>
       <div class="grp"><h4>樣式預設</h4>
        <div class="chips" id="titlePresets">
          ${TITLE_PRESETS.map(x => `<div class="chip${x.id === t.preset ? ' on' : ''}" data-p="${esc(x.id)}">${esc(x.name)}</div>`).join('')}
        </div>
        <div class="hint" style="margin-top:6px">套用後字體顏色大小都還可以自己再改。</div></div>
       <div class="grp"><h4 class="animation-heading">進場動畫（30 種）</h4>
        ${rowSelG('tAnim','類型', ANIMS, t.animIn)}
        ${rowBtn('tAnimPick','▦ 看預覽挑動畫')}
        ${rowRange('tAnimD','時長',0.1,5,0.05,t.animDur,' 秒')}</div>
       <div class="grp"><h4 class="animation-heading">退場動畫</h4>
        ${rowSel('tAnimO','類型', ANIMS_OUT.map(a => [a.id, a.name]), t.animOut == null ? 'fade' : t.animOut)}
        ${rowRange('tAnimOD','時長',0.1,5,0.05, t.animOutDur == null ? 0.4 : t.animOutDur,' 秒')}</div>
       ${kfGroup(t, 't', titleMotionProps,
         '這一段時間內從上面的起點平滑走到這裡的終點。進場與退場動畫照樣疊在上面，不衝突。')}
       <div class="grp"><h4>圖層順序（誰蓋在誰上面）</h4>
        <div class="row"><div class="f" style="gap:6px">
          <button id="tUp" style="flex:1">往上一層</button>
          <button id="tDn" style="flex:1">往下一層</button></div></div>
        <div class="hint">目前第 ${A.titles.indexOf(t)+1} / ${A.titles.length} 層，數字越大越前面。</div></div>`;
    // 改任何外觀設定時，如果播放頭不在這個標題的時間內就自動跳進去，
    // 不然使用者會以為「改了沒反應」
    // 改設定時跳到「進場動畫已經跑完」的時間點，才看得到最終樣子
    const show = () => {
      const done = t.start + Math.min(t.animDur + 0.15, (t.end - t.start) * 0.9);
      if (A.playhead < done || A.playhead > t.end) seekTo(done);
    };
    bind('tText','input', v => { t.text = v; show(); renderTimeline(); });
    bind('tFont','change', v => { t.font = safeFont(v); show(); refreshProp(); });
    bind('tSize','input', v => { t.size = +v; setVal('tSize', v + ' px'); show(); });
    bind('tColor','input', v => { t.color = v; show(); });
    bind('tStroke','input', v => { t.stroke = v; show(); });
    bind('tStrokeW','input', v => { t.strokeW = +v; setVal('tStrokeW', v); show(); });
    bind('tBold','change', (_, el) => { t.bold = el.checked; show(); });
    bind('tShadow','change', (_, el) => { t.shadow = el.checked; show(); });
    bind('tX','input', v => { t.x = +v; setVal('tX', (+v).toFixed(2)); show(); });
    bind('tY','input', v => { t.y = +v; setVal('tY', (+v).toFixed(2)); show(); });
    bind('tOpa','input', v => { t.opacity = +v; setVal('tOpa', (+v).toFixed(2)); show(); });
    bind('tRot','input', v => { t.rot = +v; setVal('tRot', v + '°'); show(); });
    bind('tAlign','change', v => { t.align = v; show(); });
    bind('tStart','input', v => { t.start = Math.max(0, +v); renderTimeline(); });
    bind('tEnd','input', v => { t.end = Math.max(t.start + 0.3, +v); renderTimeline(); });
    on('tStartNow', () => { const len = t.end - t.start; t.start = A.playhead; t.end = t.start + len; render(); refreshProp(); });
    on('tEndNow',   () => { t.end = Math.max(t.start + 0.3, A.playhead); render(); refreshProp(); });
    on('tUp', () => moveLayer(A.titles, t, +1));
    on('tDn', () => moveLayer(A.titles, t, -1));
    bind('tAnim','change', v => { t.animIn = v; seekTo(t.start); });
    bind('tAnimD','input', v => { t.animDur = +v; setVal('tAnimD', (+v).toFixed(2) + ' 秒'); seekTo(t.start); });
    on('tAnimPick', () => openPicker('anim', t.animIn, id => {
      t.animIn = id;
      const sel = $('#tAnim'); if (sel) sel.value = id;
      seekTo(t.start);
    }));
    bind('tAnimO','change',  v => { t.animOut = v; seekTo(Math.max(t.start, t.end - (t.animOutDur == null ? 0.4 : t.animOutDur) * 0.5)); });
    bind('tAnimOD','input',  v => { t.animOutDur = +v; setVal('tAnimOD', (+v).toFixed(2) + ' 秒'); seekTo(Math.max(t.start, t.end - (+v) * 0.5)); });
    kfBind(t, 't', titleMotionProps, show);
    $$('#titlePresets .chip').forEach(el => el.onclick = () => {
      applyTitlePreset(t, el.dataset.p);
      show(); refreshProp();
      toast('已套用樣式：' + el.textContent);
    });
    $$('#nine button').forEach(b => b.onclick = () => {
      const [x, y] = b.dataset.p.split(',').map(Number);
      pushUndo();
      kfAlign(t, 'x', x); kfAlign(t, 'y', y);
      t.align = x < .3 ? 'left' : x > .7 ? 'right' : 'center';
      show(); markDirty(); refreshProp();
    });

  } else if (s.type === 'sub'){
    const c = A.subs.find(x => x.id === s.id);
    if (!c){ A.sel = { type:'proj' }; return refreshProp(); }
    const st = subStyleFor(subTrack(c));
    const idx = [...A.subs].filter(x=>subTrack(x)===subTrack(c)).sort((a,b)=>a.start-b.start).findIndex(x => x.id === c.id);
    $('#propTitle').textContent = `字幕 ${idx + 1} / ${A.subs.length}`;
    const show = () => { if (A.playhead < c.start || A.playhead > c.end) seekTo(c.start + Math.min(0.3, (c.end-c.start)/2)); };
    p.innerHTML =
      `<div class="grp"><h4>這一句</h4>
        ${rowSel('sTrack','字幕軌道',[['1','字幕上軌'],['0','字幕下軌']],String(subTrack(c)))}
        <div class="hint">兩軌字幕可同時顯示，樣式與位置各自設定；也可拖曳字幕方塊換軌。</div>
        <textarea id="sText" rows="3">${esc(c.text)}</textarea>
        <div class="hint" style="margin-top:5px">太長會自動換行；按 Enter 可強制換行。</div></div>
       <div class="grp"><h4>時間</h4>
        ${rowNum('sStart','出現', c.start, 0.1, '<button class="gh" id="sStartNow" style="padding:5px 8px">現在</button>')}
        ${rowNum('sEnd','消失', c.end, 0.1, '<button class="gh" id="sEndNow" style="padding:5px 8px">現在</button>')}
        <div class="row"><div class="f" style="gap:6px">
          <button id="sPrev" style="flex:1">← 上一句</button>
          <button id="sNext" style="flex:1">下一句 →</button></div></div></div>
       <div class="grp"><h4>樣式（套用到這一軌字幕）</h4>
        <div class="chips" id="subPresets">
          ${SUB_PRESETS.map(x => `<div class="chip${x.id === st.preset ? ' on' : ''}" data-p="${x.id}">${x.name}</div>`).join('')}
        </div></div>
       <div class="grp"><h4>微調</h4>
        ${rowSel('sFont','字體', FONTS.map(f => [f.id, f.name]), st.font)}
        ${rowRange('sSize','大小',20,140,2,st.size,' px')}
        <div class="row"><label>文字顏色</label><div class="f"><input type="color" id="sColor" value="${st.color}"></div></div>
        <div class="row"><label>描邊</label><div class="f">
          <input type="color" id="sStroke" value="${st.stroke}" style="max-width:60px">
          <input type="range" id="sStrokeW" min="0" max="14" step="1" value="${st.strokeW}">
          <span class="val" id="sStrokeW_v">${st.strokeW}</span></div></div>
        <div class="row"><label>樣式</label><div class="f">
          <label class="hint"><input type="checkbox" id="sBold"${st.bold ? ' checked' : ''}> 粗體</label>
          <label class="hint"><input type="checkbox" id="sShadow"${st.shadow ? ' checked' : ''}> 陰影</label>
          <label class="hint"><input type="checkbox" id="sBox"${st.box ? ' checked' : ''}> 底色條</label></div></div>
        ${st.box ? `<div class="row"><label>底色</label><div class="f">
          <input type="color" id="sBoxColor" value="${st.boxColor}" style="max-width:60px">
          <input type="range" id="sBoxOpa" min="0" max="1" step="0.02" value="${st.boxOpacity}">
          <span class="val" id="sBoxOpa_v">${(+st.boxOpacity).toFixed(2)}</span></div></div>` : ''}
        ${rowSel('sPos','位置', [['bottom','畫面下方'],['top','畫面上方']], st.pos)}
        ${rowRange('sMargin','邊距',0.02,0.3,0.005,st.marginY,'')}
        ${rowRange('sMaxW','單行寬度',0.4,0.98,0.02,st.maxW,'')}</div>
       <div class="grp"><h4>整批處理</h4>
        <div class="row"><div class="f" style="gap:6px">
          <button id="sShiftM" style="flex:1">−0.5 秒</button>
          <button id="sShiftP" style="flex:1">+0.5 秒</button></div></div>
        <div class="row"><div class="f" style="gap:6px">
          <button id="sImport" style="flex:1">匯入 SRT</button>
          <button id="sExport" style="flex:1">匯出 SRT</button></div></div>
        <button id="sClear" style="width:100%;margin-top:6px">清空全部字幕</button></div>
       <button id="sDel" style="width:100%">刪除這一句</button>`;
    bind('sTrack','change',v=>{pushUndo();c.track=+v;render();refreshProp();markDirty(400);});
    bind('sText','input', v => { c.text = v; renderTimeline(); show(); });
    bind('sStart','input', v => { c.start = clamp(+v, 0, c.end - 0.2); renderTimeline(); });
    bind('sEnd','input',   v => { c.end = Math.max(c.start + 0.2, +v); renderTimeline(); });
    on('sStartNow', () => { const len = c.end - c.start; c.start = A.playhead; c.end = c.start + len; render(); refreshProp(); });
    on('sEndNow',   () => { c.end = Math.max(c.start + 0.2, A.playhead); render(); refreshProp(); });
    const sorted = [...A.subs].filter(x=>subTrack(x)===subTrack(c)).sort((a,b)=>a.start-b.start);
    on('sPrev', () => { const n = sorted[idx-1]; if (!n) return toast('已經是第一句'); A.sel={type:'sub',id:n.id}; seekTo(n.start+0.1); render(); refreshProp(); });
    on('sNext', () => { const n = sorted[idx+1]; if (!n) return toast('已經是最後一句'); A.sel={type:'sub',id:n.id}; seekTo(n.start+0.1); render(); refreshProp(); });
    $$('#subPresets .chip').forEach(ch => ch.onclick = () => { applySubPreset(ch.dataset.p); show(); });
    const styleChanged = () => { st.preset = 'custom'; show(); render(); };
    bind('sFont','change', v => { st.font = safeFont(v); styleChanged(); });
    bind('sSize','input', v => { st.size = +v; setVal('sSize', v + ' px'); show(); });
    bind('sColor','input', v => { st.color = v; show(); });
    bind('sStroke','input', v => { st.stroke = v; show(); });
    bind('sStrokeW','input', v => { st.strokeW = +v; setVal('sStrokeW', v); show(); });
    bind('sBold','change', (_, el) => { st.bold = el.checked; show(); });
    bind('sShadow','change', (_, el) => { st.shadow = el.checked; show(); });
    bind('sBox','change', (_, el) => { st.box = el.checked; styleChanged(); refreshProp(); });
    bind('sBoxColor','input', v => { st.boxColor = v; show(); });
    bind('sBoxOpa','input', v => { st.boxOpacity = +v; setVal('sBoxOpa', (+v).toFixed(2)); show(); });
    bind('sPos','change', v => { st.pos = v; show(); });
    bind('sMargin','input', v => { st.marginY = +v; setVal('sMargin', (+v).toFixed(3)); show(); });
    bind('sMaxW','input', v => { st.maxW = +v; setVal('sMaxW', (+v).toFixed(2)); show(); });
    on('sShiftM', () => shiftSubs(-0.5));
    on('sShiftP', () => shiftSubs(+0.5));
    on('sImport', () => $('#fileSub').click());
    on('sExport', exportSRT);
    on('sClear', () => { if (confirm(`確定要刪掉全部 ${A.subs.length} 句字幕？`)){ pushUndo(); A.subs = []; A.sel = {type:'proj'}; render(); refreshProp(); } });
    on('sDel', () => { A.sel = { type:'sub', id:c.id }; delSelected(); });

  } else if (s.type === 'overlay'){
    const o = A.overlays.find(x => x.id === s.id);
    if (!o){ A.sel = { type:'proj' }; return refreshProp(); }
    $('#propTitle').textContent = '疊圖';
    const shownW = Math.round(o.scale * A.proj.w);
    p.innerHTML =
      `<div class="grp"><h4 data-nt>${esc(o.name)}</h4>
        <div class="hint">原始尺寸 ${o.w}×${o.h}　畫面上約 ${shownW}px 寬</div>
        ${o._gif ? '<div class="hint">GIF 動畫會循環播放至疊圖結束，預覽與匯出同步。</div>' : ''}</div>
       <div class="grp"><h4>時間</h4>
        ${rowNum('oStart','出現', o.start, 0.1, '<button class="gh" id="oStartNow" style="padding:5px 8px">現在</button>')}
        ${rowNum('oEnd','消失', o.end, 0.1, '<button class="gh" id="oEndNow" style="padding:5px 8px">現在</button>')}
        <div class="hint">方塊也可以直接在「疊圖」軌上拖，兩端拉長縮短。</div></div>
       <div class="grp"><h4>${kfOn(o) ? '位置與大小（起點）' : '位置與大小'}</h4>
        <div class="row"><label>快速對位</label><div class="f"><div class="nine" id="onine">
          <button data-p="0.12,0.15">↖</button><button data-p="0.5,0.15">↑</button><button data-p="0.88,0.15">↗</button>
          <button data-p="0.12,0.5">←</button><button data-p="0.5,0.5">●</button><button data-p="0.88,0.5">→</button>
          <button data-p="0.12,0.85">↙</button><button data-p="0.5,0.85">↓</button><button data-p="0.88,0.85">↘</button>
        </div></div></div>
        ${rowRange('oX','水平',0,1,0.01,o.x,'')}
        ${rowRange('oY','垂直',0,1,0.01,o.y,'')}
        ${rowRange('oScale','大小',0.02,1.5,0.01,o.scale,'')}
        ${rowRange('oRot','旋轉',-180,180,1,o.rot,'°')}</div>
       <div class="grp"><h4>${kfOn(o) ? '透明與淡入淡出（起點）' : '透明與淡入淡出'}</h4>
        ${rowRange('oOpa','不透明度',0,1,0.02,o.opacity,'')}
        ${rowRange('oFi','淡入',0,5,0.1,o.fadeIn,' 秒')}
        ${rowRange('oFo','淡出',0,5,0.1,o.fadeOut,' 秒')}</div>
       ${kfGroup(o, 'o', [
          ['x','水平',0,1,0.01,o.x,''],
          ['y','垂直',0,1,0.01,o.y,''],
          ['scale','大小',0.02,1.5,0.01,o.scale,''],
          ['opacity','不透明度',0,1,0.02,o.opacity,''],
          ['rot','旋轉',-180,180,1,o.rot||0,'°'],
         ],
         '這一段時間內從上面的起點平滑走到這裡的終點。淡入淡出與圖層順序照舊。')}
       <button id="oDel" style="width:100%">移除這張疊圖</button>`;
    const show = () => { if (A.playhead < o.start || A.playhead > o.end) seekTo(o.start + Math.min(0.4, (o.end-o.start)/2)); };
    bind('oStart','input', v => {
      const ns = clamp(+v, 0, o.end - 0.2);
      if (o._gif) o.gifOffset = (o.gifOffset || 0) + ns - o.start;
      o.start = ns; renderTimeline();
    });
    bind('oEnd','input',   v => { o.end = Math.max(o.start + 0.2, +v); renderTimeline(); });
    on('oStartNow', () => { const len = o.end - o.start; o.start = A.playhead; o.end = o.start + len; render(); refreshProp(); });
    on('oEndNow',   () => { o.end = Math.max(o.start + 0.2, A.playhead); render(); refreshProp(); });
    bind('oX','input', v => { o.x = +v; setVal('oX', (+v).toFixed(2)); show(); });
    bind('oY','input', v => { o.y = +v; setVal('oY', (+v).toFixed(2)); show(); });
    bind('oScale','input', v => { o.scale = +v; setVal('oScale', (+v).toFixed(2)); show(); });
    bind('oRot','input', v => { o.rot = +v; setVal('oRot', v + '°'); show(); });
    bind('oOpa','input', v => { o.opacity = +v; setVal('oOpa', (+v).toFixed(2)); show(); });
    bind('oFi','input', v => { o.fadeIn = +v;  setVal('oFi', (+v).toFixed(1) + ' 秒'); });
    bind('oFo','input', v => { o.fadeOut = +v; setVal('oFo', (+v).toFixed(1) + ' 秒'); });
    kfBind(o, 'o', [['x','',0,1,0.01,o.x,''],['y','',0,1,0.01,o.y,''],
                    ['scale','',0.02,1.5,0.01,o.scale,''],['opacity','',0,1,0.02,o.opacity,''],
                    ['rot','',-180,180,1,o.rot||0,'°']], show);
    $$('#onine button').forEach(b => b.onclick = () => {
      const [x, y] = b.dataset.p.split(',').map(Number);
      pushUndo();
      kfAlign(o, 'x', x); kfAlign(o, 'y', y);
      show(); markDirty(); refreshProp();
    });
    p.insertAdjacentHTML('beforeend',
      `<div class="grp" style="margin-top:12px"><h4>圖層順序（誰蓋在誰上面）</h4>
        <div class="row"><div class="f" style="gap:6px">
          <button id="oUp" style="flex:1">往上一層</button>
          <button id="oDn" style="flex:1">往下一層</button></div></div>
        <div class="hint">目前第 ${A.overlays.indexOf(o)+1} / ${A.overlays.length} 層，數字越大越前面。疊圖永遠在影片之上、標題之下。</div></div>`);
    on('oUp', () => moveLayer(A.overlays, o, +1));
    on('oDn', () => moveLayer(A.overlays, o, -1));
    on('oDel', () => { A.sel = { type:'overlay', id:o.id }; delSelected(); });

  } else if (s.type === 'music'){
    const m = A.musics.find(x => x.id === s.id);
    if (!m){ A.sel = { type:'proj' }; return refreshProp(); }
    const mi = A.musics.indexOf(m);
    $('#propTitle').textContent = `音軌 ${mi + 1}`;
    const seg = musicSeg(m);
    const reps = m.loop ? Math.max(1, Math.ceil((m.len - m.xfade) / Math.max(0.2, seg - m.xfade))) : 1;
    p.innerHTML =
      `<div class="grp"><h4 data-nt>${esc(m.name)}</h4>
        <div class="hint">音檔長度 ${fmt(m.dur)}　影片長度 ${fmt(totalDur())}</div></div>
       <div class="grp"><h4>位置與長度</h4>
        ${rowNum('mStart','從第幾秒進來', m.startAt, 0.5,
                 '<button class="gh" id="mStartNow" style="padding:5px 8px">現在</button>')}
        ${rowNum('mLen','播多久', m.len, 0.5,
                 '<button class="gh" id="mLenEnd" style="padding:5px 8px">到底</button>')}
        ${rowNum('mOff','從音檔第幾秒取用', m.offset, 0.5, '')}
        <div class="hint">方塊在時間軸上：中間拖曳＝移動，兩端拖曳＝裁切長度。</div></div>
       <div class="grp"><h4>不夠長的時候</h4>
        <div class="row"><label>循環填滿</label><div class="f">
          <input type="checkbox" id="mLoop"${m.loop ? ' checked' : ''}>
          <span class="hint">不夠長就自動重播</span></div></div>
        ${rowRange('mXf','接縫淡化',0,3,0.1,m.xfade,' 秒')}
        <div class="hint">${m.loop
            ? (reps > 1 ? `目前循環 ${reps} 輪蓋滿 ${fmt(m.len)}` : '音檔夠長，播一輪就好')
            : (m.len > seg + 0.3 ? `⚠ 音檔只有 ${fmt(seg)}，後面 ${fmt(m.len - seg)} 沒有聲音` : '長度足夠')}
        </div></div>
       <div class="grp"><h4>音量</h4>
        ${rowRange('mVol','音量',0,1.5,0.05,m.vol,'')}
        ${rowRange('mFi','淡入',0,10,0.1,m.fadeIn,' 秒')}
        ${rowRange('mFo','淡出',0,10,0.1,m.fadeOut,' 秒')}
        <div class="hint">想讓某段只剩配樂，把那段影片設成「原聲靜音」。多條音軌會直接疊加。</div></div>
       <div class="grp"><h4>音量曲線</h4>
        <div class="row"><div class="f" style="gap:6px">
          <button class="gh" id="mVkAdd" style="flex:1">在播放頭加一點</button>
          <button class="gh" id="mVkClr"${(m.vk && m.vk.length) ? '' : ' disabled'}>清除曲線</button>
        </div></div>
        ${(m.vk && m.vk.length)
          ? `<div class="hint">目前 ${m.vk.length} 個音量點。直接在時間軸的音軌方塊上拖圓點改高低，
             右鍵刪點，雙擊空白處加點。</div>`
          : '<div class="hint">還沒有音量點 —— 在時間軸的音軌方塊上雙擊就會加一個。</div>'}
        <div class="hint">曲線是「倍率」，最後乘在上面的音量上。講話的地方壓低、講完拉回來，
         就是一般說的 ducking。預覽與匯出用的是同一條曲線。</div></div>
       <div class="grp"><h4>排序</h4>
        <div class="row"><div class="f" style="gap:6px">
          <button id="mUp" style="flex:1">往前一條</button>
          <button id="mDn" style="flex:1">往後一條</button></div></div>
        <div class="hint">音軌是直接疊加混音，順序不影響聲音，只是列表上的編號。</div></div>
       <button id="mDel" style="width:100%">移除這條音軌</button>`;
    bind('mLoop','change', (_, el) => { m.loop = el.checked; render(); refreshProp(); });
    bind('mXf','input', v => { m.xfade = +v; setVal('mXf', (+v).toFixed(1) + ' 秒'); renderTimeline(); });
    bind('mStart','input', v => { m.startAt = clamp(+v, 0, Math.max(0, totalDur() - 0.3)); render(); });
    bind('mLen','input', v => { m.len = clamp(+v, 0.3, Math.max(0.3, totalDur() - m.startAt)); m.autoLen = false; render(); });
    on('mStartNow', () => { m.startAt = clamp(A.playhead, 0, Math.max(0, totalDur() - 0.3)); render(); refreshProp(); });
    on('mLenEnd', () => { m.len = Math.max(0.3, totalDur() - m.startAt); m.autoLen = true; render(); refreshProp(); });
    bind('mOff','input', v => { m.offset = clamp(+v, 0, Math.max(0, m.dur - 0.5)); render(); refreshProp(); });
    bind('mVol','input', v => { m.vol = +v; setVal('mVol', (+v).toFixed(2)); });
    on('mVkAdd', () => {
      const t = A.playhead - m.startAt;
      if (t < -0.01 || t > m.len + 0.01) return toast('播放頭不在這條音軌上', true);
      pushUndo();
      vkAdd(m, clamp(t, 0, m.len), musicGainAt(m, A.playhead));
      render(); refreshProp(); markDirty(300);
    });
    on('mVkClr', () => { pushUndo(); m.vk = []; render(); refreshProp(); markDirty(300);
                         toast('音量曲線已清除'); });
    bind('mFi','input',  v => { m.fadeIn = +v;  setVal('mFi', (+v).toFixed(1) + ' 秒'); });
    bind('mFo','input',  v => { m.fadeOut = +v; setVal('mFo', (+v).toFixed(1) + ' 秒'); });
    on('mUp', () => moveLayer(A.musics, m, -1));
    on('mDn', () => moveLayer(A.musics, m, +1));
    on('mDel', () => { A.sel = { type:'music', id:m.id }; delSelected(); });

  } else {
    $('#propTitle').textContent = '專案設定';
    const res = ASPECTS[A.proj.aspect];
    p.innerHTML =
      `<div class="grp"><h4>畫面比例</h4>
        <div class="chips" id="aspChips">
          ${Object.keys(ASPECTS).map(a => `<div class="chip${a === A.proj.aspect ? ' on' : ''}" data-a="${a}">${a}</div>`).join('')}
        </div></div>
       <div class="grp"><h4>輸出</h4>
        ${rowSel('pRes','解析度', res.map(r => [r[0] + 'x' + r[1], `${r[2]}（${r[0]}×${r[1]}）`]), A.proj.w + 'x' + A.proj.h)}
        ${rowSel('pFps','影格率', [[24,'24 fps'],[25,'25 fps'],[30,'30 fps'],[60,'60 fps']], A.proj.fps)}
        ${rowRange('pBr','位元率',2,40,1,A.proj.bitrate,' Mbps')}
        ${rowSel('pFit','畫面填滿', [['contain','完整顯示（留黑邊）'],['cover','裁切填滿']], A.proj.fit)}</div>
       <div class="grp"><h4>診斷</h4>
        ${rowBtn('pDiag','📋 複製診斷資訊')}
        <div class="hint">匯出或畫面有問題時按這個，會把每一段實際走哪條路、
        判到幾度、有沒有問題整理成文字複製起來。</div></div>
       <div class="grp"><h4>說明</h4>
        <div class="hint">選取左邊的片段、時間軸上的標題或配樂，這裡就會切換成對應的設定。<br><br>
        快捷鍵：空白鍵播放／暫停、Delete 刪除選取、← → 移動一格、Home / End 跳頭尾。</div></div>`;
    $$('#aspChips .chip').forEach(ch => ch.onclick = () => {
      A.proj.aspect = ch.dataset.a;
      const r = ASPECTS[A.proj.aspect][0];
      A.proj.w = r[0]; A.proj.h = r[1];
      render(); refreshProp();
    });
    bind('pRes','change', v => { const [w,h] = v.split('x').map(Number); A.proj.w = w; A.proj.h = h; render(); });
    bind('pFps','change', v => A.proj.fps = +v);
    bind('pBr','input', v => { A.proj.bitrate = +v; setVal('pBr', v + ' Mbps'); });
    bind('pFit','change', v => { A.proj.fit = v; });
    on('pDiag', async () => {
      const btn = $('#pDiag'); if (btn){ btn.disabled = true; btn.textContent = '檢查中…'; }
      let txt = '';
      try { txt = await diagReport(); } catch(e){ txt = '診斷失敗：' + (e && e.message || e); }
      if (btn){ btn.disabled = false; btn.textContent = '📋 複製診斷資訊'; }
      try { await navigator.clipboard.writeText(txt); toast('已複製，可以直接貼上'); }
      catch(e){
        // 沒有剪貼簿權限就顯示出來讓使用者自己選取
        await asrAsk('診斷資訊', `<pre style="white-space:pre-wrap;font-size:11px;max-height:50vh;
          overflow:auto;user-select:text;margin:0">${esc(txt)}</pre>`, [{ k:'ok', label:'關閉', pri:true }]);
      }
      console.log(txt);
    });
  }
}
function bind(id, ev, fn){ const el = $('#' + id); if (el) el.addEventListener(ev, e => fn(el.value, el)); }
function on(id, fn){ const el = $('#' + id); if (el) el.addEventListener('click', fn); }
function setVal(id, v){ const el = $('#' + id + '_v'); if (el) el.textContent = v; }

/* ── 事件綁定 ──────────────────────────────────────────────── */
function initUI(){
  $('#drop').onclick = () => $('#fileAny').click();
  $('#fileAny').onchange = e => { addAnyFiles(e.target.files); e.target.value = ''; };
  $('#fileVideo').onchange = e => { addVideoFiles(e.target.files); e.target.value = ''; };
  $('#fileAudio').onchange = async e => {
    for (const f of [...e.target.files]) await addMusicFile(f);
    e.target.value = '';
  };

  // 時間軸區塊可以上下拉高，放得下更多軌道
  $('#tlgrip').addEventListener('mousedown', e => {
    e.preventDefault();
    const y0 = e.clientY, h0 = $('#tl').offsetHeight;
    const mv = ev => {
      $('#tl').style.height = clamp(h0 - (ev.clientY - y0), 140, window.innerHeight - 260) + 'px';
      renderTimeline(); sizePreview();          // 預覽區高度變了，畫布也要重配
    };
    const up = () => { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); };
    document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
  });
  $('#btnAddMusic').onclick = () => $('#fileAudio').click();
  $('#btnAddImage').onclick = () => { if (!A.clips.length && !confirm('目前還沒有影片，要直接用圖片開始嗎？')) return; $('#fileImage').click(); };
  $('#btnAddOverlay').onclick = () => { if (!A.clips.length) return toast('先加入影片或圖片，再放疊圖', true); $('#fileOverlay').click(); };
  $('#fileImage').onchange = e => { addImageFiles(e.target.files); e.target.value = ''; };
  $('#fileOverlay').onchange = e => { addOverlayFiles(e.target.files); e.target.value = ''; };
  $('#btnAddSub').onclick = () => { if (!A.clips.length) return toast('先加入影片再放字幕', true); $('#fileSub').click(); };
  $('#fileSub').onchange = async e => { for (const f of [...e.target.files]) await importSRT(f); e.target.value = ''; };
  /* 右鍵刪點綁在「軌道」上，方塊每次重畫都是新節點，綁方塊會掉。
     連點兩下加點則由 startMusicDrag 自己判，原因見那邊的註解。 */
  $('#trkMusic').addEventListener('contextmenu', e => {
    const box = e.target.closest && e.target.closest('.mblk');
    if (!box) return;
    const m = A.musics.find(x => x.id === box.dataset.mid);
    if (m) vkDelAtEvent(e, m);
  });
  $('#trkVideo').addEventListener('dblclick', e => {
    if (!e.target.closest('.subtitleLane') || e.target.closest('.sblk')) return;
    if (!A.clips.length) return toast('先加入影片再放字幕', true);
    const r = $('#tlinner').getBoundingClientRect();
    addSub((e.clientX - r.left) / A.pps,+(e.target.closest('.subtitleLane')?.dataset.track||0));
  });
  $('#btnAddTitle').onclick = () => { if (!A.clips.length) return toast('先加入影片再放標題', true); addTitle(); };
  $('#btnProj').onclick = () => { A.sel = { type:'proj', id:null }; render(); refreshProp(); };
  $('#btnDel').onclick = delSelected;
  $('#btnSplit').onclick = splitAtPlayhead;
  $('#playBtn').onclick = () => { if (!A.clips.length) return; setPlaying(!A.playing); };
  $('#btnStart').onclick = () => seekTo(0);
  $('#btnEnd').onclick = () => seekTo(totalDur());
  $('#btnExport').onclick = () => startExport();
  $('#btnFit').onclick = fitZoom;
  // 「完成」以前只在匯出流程裡綁，專案儲存完就關不掉了
  $('#mClose').onclick = () => $('#mask').classList.remove('on');
  $('#btnUndo').onclick = undo;
  $('#btnRedo').onclick = redo;
  // 屬性面板上任何一次「開始操作」都先記一個復原點（內容沒變就不會重複記）
  $('#prop').addEventListener('pointerdown', pushUndo, true);
  $('#prop').addEventListener('keydown', e => { if (!e.ctrlKey && !e.metaKey) pushUndo(); }, true);
  // 屬性面板上任何一個控制項動了都重畫，免得漏掉某個沒呼叫 render() 的路徑
  $('#prop').addEventListener('input',  () => markDirty(300), true);
  $('#prop').addEventListener('change', () => markDirty(300), true);
  $('#zoom').oninput = e => { A.pps = +e.target.value; renderTimeline(); followPlayhead(true); };

  // 預覽下方的總進度條：不管時間軸縮放多少，都能直接跳到結尾
  const sb = $('#seekBar');
  sb.addEventListener('pointerdown', () => sb._dragging = true);
  sb.addEventListener('pointerup',   () => sb._dragging = false);
  sb.addEventListener('input', () => { const tot = totalDur(); if (tot > 0) seekTo(+sb.value / 1000 * tot); });

  // 時間軸：滾輪左右捲動、Ctrl＋滾輪縮放
  $('#tlwrap').addEventListener('wheel', e => {
    const wrap = $('#tlwrap');
    if (e.ctrlKey || e.metaKey){
      e.preventDefault();
      const r = $('#tlinner').getBoundingClientRect();
      const tAt = (e.clientX - r.left) / A.pps;
      A.pps = clamp(A.pps * (e.deltaY < 0 ? 1.18 : 1 / 1.18), 2, 400);
      $('#zoom').value = A.pps;
      renderTimeline();
      wrap.scrollLeft = Math.max(0, tAt * A.pps - (e.clientX - wrap.getBoundingClientRect().left));
    } else {
      const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (d){ e.preventDefault(); wrap.scrollLeft += d; }
    }
  }, { passive:false });

  ['dragenter','dragover'].forEach(ev => document.addEventListener(ev, e => {
    e.preventDefault(); if (e.dataTransfer.types.includes('Files')) $('#drop').classList.add('on');
  }));
  ['dragleave','drop'].forEach(ev => document.addEventListener(ev, e => {
    e.preventDefault(); $('#drop').classList.remove('on');
  }));
  document.addEventListener('drop', async e => {
    await addAnyFiles(e.dataTransfer.files);        // 跟左側點擊走同一條路
  });

  // 時間軸空白處按下即可拖曳播放頭（不只刻度尺那一條）
  const scrub = e => {
    const r = $('#tlinner').getBoundingClientRect();
    seekTo((e.clientX - r.left) / A.pps);
  };
  // 在標題軌雙擊空白處 = 在那個時間點新增標題
  $('#trkTitle').addEventListener('dblclick', e => {
    if (e.target.closest('.tblk')) return;
    if (!A.clips.length) return toast('先加入影片再放標題', true);
    const r = $('#tlinner').getBoundingClientRect();
    addTitle((e.clientX - r.left) / A.pps);
  });

  $('#tlinner').addEventListener('mousedown', e => {
    if (e.target.closest('.blk,.tblk,.mblk')) return;
    scrub(e);
    const mv = ev => scrub(ev);
    const up = () => { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); };
    document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
  });

  document.addEventListener('keydown', e => {
    if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
    if (A.exporting) return;
    if ($('#gmask').classList.contains('on')){        // 預覽選單開著時，鍵盤先給它
      if (e.key === 'Escape') closePicker();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')){
      e.preventDefault(); return e.shiftKey ? redo() : undo();
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')){ e.preventDefault(); return redo(); }
    if (e.ctrlKey || e.metaKey) return;
    if (e.code === 'Space'){ e.preventDefault(); if (A.clips.length) setPlaying(!A.playing); }
    if (e.key === 'Delete' || e.key === 'Backspace'){ e.preventDefault(); delSelected(); }
    if (e.key === 's' || e.key === 'S'){ e.preventDefault(); splitAtPlayhead(); }
    if (e.key === 'ArrowLeft')  seekTo(A.playhead - 1 / A.proj.fps);
    if (e.key === 'ArrowRight') seekTo(A.playhead + 1 / A.proj.fps);
    if (e.key === 'Home') seekTo(0);
    if (e.key === 'End')  seekTo(totalDur());
  });

  window.addEventListener('resize', () => { renderTimeline(); sizePreview(); fixInnerWidth(); });
  window.addEventListener('beforeunload', e => {
    if (A.exporting){ e.preventDefault(); e.returnValue = ''; }
  });
  checkSupport(); updateUndoBtns(); initProject(); sizePreview(); applyTrackOrder(true);
  if (typeof initASR === 'function') initASR();
  if (typeof i18nInit === 'function') i18nInit();
  if (typeof themeInit === 'function') themeInit();
  render(); refreshProp(); requestAnimationFrame(loop);
}

function checkSupport(){
  const b = $('#envBadge');
  $('#verTag').textContent = VER;
  if (typeof VideoEncoder === 'undefined'){
    b.textContent = '⚠ 此瀏覽器不支援 WebCodecs，無法匯出（請用 Chrome / Edge）';
    b.style.color = 'var(--error-text)'; b.style.borderColor = 'var(--danger)';
    $('#btnExport').disabled = true;
  } else {
    b.textContent = 'WebCodecs 就緒 · 影片不會離開這台電腦';
    b.style.color = 'var(--ok)'; b.style.borderColor = 'var(--ok-line)';
  }
}

/* ══════════════════════════════════════════════════════════════
   預覽選單：轉場與標題動畫都用這個，格子裡是會動的縮圖
   ══════════════════════════════════════════════════════════════ */
let _gRaf = null, _gCells = [], _gKind = 'trans', _gClip = null;

/** 縮圖用的示意畫面：A 冷色、B 暖色，加斜紋才看得出位移方向 */
function demoPaint(ctx, ref, W, H){
  const g = ctx.createLinearGradient(0, 0, W, H);
  if (ref === 0){ g.addColorStop(0, '#4a7fbf'); g.addColorStop(1, '#122238'); }
  else          { g.addColorStop(0, '#e8a33d'); g.addColorStop(1, '#4a2410'); }
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.globalAlpha = 0.22; ctx.fillStyle = '#fff';
  for (let i = -H; i < W; i += Math.max(8, W / 9))
    { ctx.beginPath(); ctx.moveTo(i, H); ctx.lineTo(i + H * 0.5, 0);
      ctx.lineTo(i + H * 0.5 + W / 26, 0); ctx.lineTo(i + W / 26, H); ctx.closePath(); ctx.fill(); }
  ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,.95)';
  ctx.font = `700 ${Math.round(H * 0.46)}px Arial,sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(ref === 0 ? 'A' : 'B', W / 2, H / 2);
}

const _demoTitle = {
  text: '標題ABC', font: FONTS[0].id, size: 200, color: '#ffffff',
  stroke: '#000000', strokeW: 0, bold: true, shadow: true,
  x: 0.5, y: 0.5, align: 'center', start: 0, end: 4,
  animIn: 'fade', animDur: 0.85, animOut: 'none', animOutDur: 0.3
};

function openPicker(kind, cur, onPick, clip){
  _gKind = kind;
  _gClip = clip || null;
  const items = kind === 'trans' ? TRANSITIONS : kind === 'grade' ? GRADE_PRESETS : ANIMS;
  $('#gTitle').textContent =
    kind === 'trans' ? `轉場（共 ${TRANSITIONS.length - 1} 種）` :
    kind === 'grade' ? `畫面風格（共 ${GRADE_PRESETS.length - 1} 組，用你目前這一格畫面預覽）` :
                       `標題進場動畫（共 ${ANIMS.length - 1} 種）`;
  const groups = [];
  items.forEach(o => { if (groups.indexOf(o.g) < 0) groups.push(o.g); });

  let filter = '__all';
  const tabs = $('#gTabs');
  const grid = $('#gGrid');

  const paintTabs = () => {
    tabs.innerHTML = [['__all', '全部']].concat(groups.map(g => [g, g]))
      .map(([id, nm]) => `<div class="chip${id === filter ? ' on' : ''}" data-g="${esc(id)}">${esc(nm)}</div>`).join('');
    tabs.querySelectorAll('.chip').forEach(c => c.onclick = () => { filter = c.dataset.g; paintTabs(); build(); });
  };

  const build = () => {
    _gCells = [];
    const list = items.filter(o => filter === '__all' || o.g === filter);
    grid.innerHTML = list.map(o =>
      `<div class="gcell${o.id === cur ? ' on' : ''}" data-id="${esc(o.id)}">
         <canvas width="176" height="99"></canvas><div class="gn">${esc(o.name)}</div></div>`).join('');
    grid.querySelectorAll('.gcell').forEach(el => {
      _gCells.push({ id: el.dataset.id, ctx: el.querySelector('canvas').getContext('2d') });
      el.onclick = () => {
        grid.querySelectorAll('.gcell').forEach(x => x.classList.remove('on'));
        el.classList.add('on');
        cur = el.dataset.id;
        onPick(el.dataset.id);
      };
    });
    if (_gKind === 'grade') paintGradeCells();
  };

  paintTabs(); build();
  $('#gmask').classList.add('on');
  if (kind === 'grade') paintGradeCells();
  $('#gClose').onclick = closePicker;
  $('#gmask').onclick = e => { if (e.target.id === 'gmask') closePicker(); };
  if (!_gRaf) _gRaf = requestAnimationFrame(gTick);
}

function closePicker(){
  $('#gmask').classList.remove('on');
  _gCells = [];
  if (_gRaf){ cancelAnimationFrame(_gRaf); _gRaf = null; }
}

function gTick(){
  _gRaf = requestAnimationFrame(gTick);
  if (!_gCells.length) return;
  const CYC = 1900;                                  // 一輪 1.9 秒：跑完停一下再重來
  const u = (performance.now() % CYC) / CYC;
  if (_gKind === 'grade') return;              // 風格縮圖是靜態的，不用每幀重畫
  for (const c of _gCells){
    const ctx = c.ctx, W = ctx.canvas.width, H = ctx.canvas.height;
    if (_gKind === 'trans'){
      const p = clamp(u / 0.62, 0, 1);
      drawTransition(ctx, c.id, p, 0, 1, W, H, { paint: demoPaint, key: 'thumb' });
    } else {
      ctx.fillStyle = '#14181f'; ctx.fillRect(0, 0, W, H);
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#232b38'); g.addColorStop(1, '#10141b');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      _demoTitle.animIn = c.id;
      drawTitle(ctx, _demoTitle, u * 1.5, W, H);     // 動畫 0.85 秒＋停 0.65 秒，大半時間都在動
    }
  }
}

/* ══════════════════════════════════════════════════════════════
   畫面調整面板（Stage 2 · E）
   每一段影片／圖片各自獨立；改完馬上在預覽看到。
   ══════════════════════════════════════════════════════════════ */
const gradeRow = (id, label, val, left, right) =>
  `<div class="row"><label>${label}</label><div class="f">
     <input type="range" id="${id}" min="-100" max="100" step="1" value="${val|0}">
     <span class="val" id="${id}_v">${val > 0 ? '+' + (val|0) : (val|0)}</span></div>
   </div><div class="hint" style="margin:-4px 0 8px 82px;font-size:10px">${left} ←→ ${right}</div>`;

function gradePanel(c){
  const g = Object.assign({}, GRADE0, c.grade || {});
  return `<div class="grp"><h4>畫面風格（這一段）</h4>
     ${rowSelG('gPreset','風格', GRADE_PRESETS, g.preset || 'none')}
     ${rowBtn('gPick','▦ 看預覽挑風格（' + (GRADE_PRESETS.length - 1) + ' 組）')}
     <div class="hint">套用預設之後，下面每一項都還可以自己再調。</div>
    </div>
    <div class="grp">
     ${gradeRow('gBri','亮度',  g.bri,  '暗', '亮')}
     ${gradeRow('gCon','對比',  g.con,  '平', '硬')}
     ${gradeRow('gSat','飽和',  g.sat,  '黑白', '鮮豔')}
     ${gradeRow('gTemp','色溫', g.temp, '冷（藍）', '暖（橘）')}
     ${gradeRow('gTint','色調', g.tint, '綠', '洋紅')}
     ${gradeRow('gShp','銳利',  g.sharp,'柔化', '銳利')}
     <div class="row"><label>質感</label><div class="f">
       <button class="gh" id="gMore" style="flex:1">${A._gradeMore ? '收起' : '褪色 · 暗角 · 顆粒 · 光暈'}</button></div></div>
     ${A._gradeMore ? `
       <div class="row"><label>褪色</label><div class="f">
         <input type="range" id="gFade" min="0" max="100" step="1" value="${g.fade|0}">
         <span class="val" id="gFade_v">${g.fade|0}</span></div></div>
       <div class="hint" style="margin:-4px 0 8px 82px;font-size:10px">黑色不再是全黑，底片那種霧面感</div>
       <div class="row"><label>暗角</label><div class="f">
         <input type="range" id="gVig" min="0" max="100" step="1" value="${g.vig|0}">
         <span class="val" id="gVig_v">${g.vig|0}</span></div></div>
       <div class="row"><label>顆粒</label><div class="f">
         <input type="range" id="gGrain" min="0" max="100" step="1" value="${g.grain|0}">
         <span class="val" id="gGrain_v">${g.grain|0}</span></div></div>
       <div class="row"><label>光暈</label><div class="f">
         <input type="range" id="gBloom" min="0" max="100" step="1" value="${g.bloom|0}">
         <span class="val" id="gBloom_v">${g.bloom|0}</span></div></div>
       <div class="row"><label>復古黃</label><div class="f">
         <input type="range" id="gSepia" min="0" max="100" step="1" value="${g.sepia|0}">
         <span class="val" id="gSepia_v">${g.sepia|0}</span></div></div>` : ''}
     ${(g.sharp > 0 || g.bloom > 0)
        ? `<div class="hint" style="margin:-2px 0 8px">⚠ ${[g.sharp > 0 ? '銳利' : '', g.bloom > 0 ? '光暈' : ''].filter(Boolean).join('、')}
           要額外多跑一輪模糊，1080p 匯出會明顯變慢。其他項目幾乎不影響速度。</div>` : ''}
     <div class="row"><div class="f" style="gap:6px">
       <button class="gh" id="gAll" style="flex:1" title="把這一段的設定複製到其他每一段">套用到全部</button>
       <button class="gh" id="gReset" style="flex:1">重設</button>
     </div></div>
     <div class="row"><div class="f">
       <button class="gh" id="gBypass" style="flex:1">${A.gradeBypass ? '● 正在看原始畫面（點一下切回）' : '按一下比對原始畫面'}</button>
     </div></div>
    </div>`;
}

function bindGrade(c){
  if (!c.grade) c.grade = { ...GRADE0 };
  const g = c.grade;
  const upd = (k, id, v) => {
    g[k] = +v; g.preset = null;
    setVal(id, +v > 0 ? '+' + Math.round(v) : String(Math.round(v)));
    render();
  };
  bind('gBri','input',  v => upd('bri','gBri',v));
  bind('gCon','input',  v => upd('con','gCon',v));
  bind('gSat','input',  v => upd('sat','gSat',v));
  bind('gTemp','input', v => upd('temp','gTemp',v));
  bind('gTint','input', v => upd('tint','gTint',v));
  bind('gShp','input',  v => upd('sharp','gShp',v));
  bind('gFade','input', v => upd('fade','gFade',v));
  bind('gVig','input',  v => upd('vig','gVig',v));
  bind('gGrain','input',v => upd('grain','gGrain',v));
  bind('gBloom','input',v => upd('bloom','gBloom',v));
  bind('gSepia','input',v => upd('sepia','gSepia',v));
  // 拉滑桿是連續事件，undo 只在按下去時記一次，不然一拉就吃掉幾十步歷史
  ['gBri','gCon','gSat','gTemp','gTint','gShp','gFade','gVig','gGrain','gBloom','gSepia'].forEach(id => {
    const el = $('#' + id);
    if (el) el.addEventListener('pointerdown', () => pushUndo());
  });
  on('gMore', () => { A._gradeMore = !A._gradeMore; refreshProp(); });
  bind('gPreset','change', v => { applyGradePreset(c, v); render(); refreshProp(); });
  on('gPick', () => openPicker('grade', c.grade.preset || 'none', id => {
    applyGradePreset(c, id);
    const sel = $('#gPreset'); if (sel) sel.value = id;
    render();
  }, c));
  on('gAll', () => {
    if (A.clips.length < 2){ toast('只有一段，不用複製', true); return; }
    copyGradeToAll(c);
    render();
    toast(`已把這一段的畫面調整套到全部 ${A.clips.length} 段`);
  });
  on('gReset', () => { pushUndo(); c.grade = { ...GRADE0 }; render(); refreshProp(); });
  on('gBypass', () => { A.gradeBypass = !A.gradeBypass; render(); refreshProp(); });
}

/** 風格縮圖：直接用目前這一格畫面去套每一組預設，看到的就是套上去的樣子 */
function paintGradeCells(){
  const clip = _gClip;
  if (!clip || !_gCells.length) return;
  const saved = clip.grade;
  const bypass = A.gradeBypass;
  A.gradeBypass = false;
  try {
    for (const cell of _gCells){
      const pre = GRADE_PRESETS.find(x => x.id === cell.id);
      clip.grade = Object.assign({}, GRADE0, pre ? pre.s : {});
      paintClip(cell.ctx, { clip }, cell.ctx.canvas.width, cell.ctx.canvas.height);
    }
  } finally {
    clip.grade = saved;
    A.gradeBypass = bypass;
  }
}
