/* Built-in GIF library. Payload scripts work over both file:// and HTTPS.
   Browsing uses static posters and one ordinary GIF <img>; ImageDecoder memory
   is allocated only by the existing import path when the user presses Add. */
const _effectPending = new Map(), _effectFiles = new Map();
const _effectBase = new URL('animation-effects/', document.baseURI);
function effectAsset(entry, ext){ return new URL(entry.stem + ext, _effectBase).href; }

window.__nvEffectData = (id, encoded) => {
  const job = _effectPending.get(id);
  if (!job) return;
  try {
    const raw = atob(encoded);
    if (raw.length !== job.entry.bytes || !/^GIF8[79]a/.test(raw)) throw new Error('Invalid GIF asset');
    const bytes = Uint8Array.from(raw, c => c.charCodeAt(0));
    const file = new File([bytes], job.entry.filename, {type:'image/gif', lastModified:0});
    _effectFiles.set(id, file);
    while (_effectFiles.size > 4) _effectFiles.delete(_effectFiles.keys().next().value);
    job.finish(null, file);
  } catch(e){ job.finish(e); }
};
function loadEffectFile(entry){
  if (_effectFiles.has(entry.id)) return Promise.resolve(_effectFiles.get(entry.id));
  if (_effectPending.has(entry.id)) return _effectPending.get(entry.id).promise;
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve=yes; reject=no; });
  const script = document.createElement('script');
  const timer = setTimeout(() => finish(new Error('Effect load timeout')), 20000);
  function finish(error, file){
    if (!_effectPending.has(entry.id)) return;
    clearTimeout(timer); script.remove(); _effectPending.delete(entry.id);
    if (error) reject(error); else resolve(file);
  }
  _effectPending.set(entry.id, {entry, promise, finish});
  script.src = effectAsset(entry, '.js');
  script.onerror = () => finish(new Error('Effect asset unavailable'));
  script.onload = () => { if (_effectPending.has(entry.id)) finish(new Error('Empty effect asset')); };
  document.head.append(script);
  return promise;
}

const FX = {page:0, size:24, selected:null, file:null, url:null, token:0, busy:false, epoch:0, focus:null};
const effectName = entry => LANG === 'en' ? entry.en : entry.name;
function effectMessage(text){ $('#fxStatus').textContent = text; }
function releaseEffectPreview(){
  $('#fxPreview').removeAttribute('src');
  if (FX.url) URL.revokeObjectURL(FX.url);
  FX.url = null; FX.file = null;
}
function clearEffectSelection(){
  ++FX.token; releaseEffectPreview(); FX.selected=null;
  $('#fxName').textContent=''; $('#fxAdd').disabled=true;
  $('#fxRetry').hidden=true;
  effectMessage('選一個效果，預覽後加入時間軸。');
}
function renderEffectGrid(){
  const q = $('#fxSearch').value.trim().toLowerCase();
  const pack = $('#fxPack').value, category = $('#fxCategory').value;
  const entries = EFFECT_CATALOG.filter(e => (!pack || e.pack===pack) && (!category || e.category===category)
    && (!q || [e.name,e.en,e.category,e.filename].join(' ').toLowerCase().includes(q)));
  const pages = Math.max(1, Math.ceil(entries.length/FX.size));
  FX.page = clamp(FX.page,0,pages-1);
  const grid = $('#fxGrid'); grid.replaceChildren();
  for (const entry of entries.slice(FX.page*FX.size,(FX.page+1)*FX.size)){
    const button=document.createElement('button'); button.type='button'; button.className='fx-card';
    button.dataset.id=entry.id; button.disabled=FX.busy;
    button.setAttribute('aria-pressed',String(FX.selected===entry.id));
    const img=document.createElement('img'); img.src=effectAsset(entry,'.webp');
    img.alt=''; img.loading='lazy'; img.width=112; img.height=96;
    const name=document.createElement('span'); name.dataset.nt=''; name.textContent=effectName(entry);
    button.append(img,name); button.onclick=()=>selectEffect(entry); grid.append(button);
  }
  if (!entries.length){ const empty=document.createElement('p'); empty.textContent='沒有符合的動畫效果'; grid.append(empty); }
  $('#fxCount').textContent=LANG==='en' ? `${entries.length} effects · Page ${FX.page+1} / ${pages}` : `${entries.length} 組 · 第 ${FX.page+1} / ${pages} 頁`;
  $('#fxPrev').disabled=FX.busy || FX.page===0;
  $('#fxNext').disabled=FX.busy || FX.page===pages-1;
  if (FX.selected) $('#fxName').textContent=effectName(EFFECT_CATALOG.find(e=>e.id===FX.selected));
}
async function selectEffect(entry){
  if (FX.busy) return;
  clearEffectSelection(); const token=FX.token;
  FX.selected=entry.id; renderEffectGrid();
  effectMessage('載入動畫預覽中…');
  try {
    const file=await loadEffectFile(entry);
    if (token!==FX.token || !$('#fxDialog').open) return;
    FX.file=file; FX.url=URL.createObjectURL(file); $('#fxPreview').src=FX.url;
    $('#fxAdd').disabled=false;
    effectMessage('預覽會循環播放。加入後可調整位置、大小、旋轉、透明度與關鍵偵。');
  } catch(e){
    if (token!==FX.token || !$('#fxDialog').open) return;
    effectMessage('素材載入失敗。請重試；本機使用時請把 animation-effects 資料夾放在 HTML 旁邊。');
    $('#fxRetry').hidden=false;
  }
}
function closeEffectLibrary(){
  if (FX.busy) return;
  $('#fxDialog').close();
}
function openEffectLibrary(){
  if (!A.clips.length) return toast('先加入影片或圖片，再放動畫效果',true);
  setPlaying(false); FX.focus=document.activeElement; FX.epoch=_gifEpoch;
  clearEffectSelection(); renderEffectGrid(); $('#fxDialog').showModal(); $('#fxSearch').focus();
}
function setEffectBusy(busy){
  FX.busy=busy;
  for (const id of ['fxSearch','fxPack','fxCategory','fxClose','fxImport','fxAdd','fxRetry']) $('#'+id).disabled=busy;
  renderEffectGrid();
}
async function addSelectedEffect(){
  if (FX.busy || !FX.file) return;
  if (FX.epoch!==_gifEpoch || !A.clips.length){
    toast('專案已改變，請重新選擇動畫效果',true); closeEffectLibrary(); return;
  }
  setEffectBusy(true); effectMessage('加入動畫效果中…');
  let added=0;
  try { added=await addOverlayFiles([FX.file]); }
  finally { setEffectBusy(false); }
  if (added) closeEffectLibrary();
  else effectMessage('動畫無法加入，請查看提示或選擇其他效果。');
}
function initEffectLibrary(){
  const pack=$('#fxPack');
  for (const entry of EFFECT_PACKS){const o=document.createElement('option');o.value=entry.id;o.textContent=entry.name;pack.append(o);}
  const category=$('#fxCategory');
  for (const name of [...new Set(EFFECT_CATALOG.map(e=>e.category))]){
    const o=document.createElement('option');o.value=name;o.textContent=name;category.append(o);
  }
  for (const id of ['fxSearch','fxPack','fxCategory']) $('#'+id).addEventListener(id==='fxSearch'?'input':'change',()=>{
    FX.page=0;clearEffectSelection();renderEffectGrid();
  });
  $('#fxPrev').onclick=()=>{--FX.page;renderEffectGrid();};
  $('#fxNext').onclick=()=>{++FX.page;renderEffectGrid();};
  $('#fxClose').onclick=closeEffectLibrary;
  $('#fxRetry').onclick=()=>selectEffect(EFFECT_CATALOG.find(e=>e.id===FX.selected));
  $('#fxAdd').onclick=addSelectedEffect;
  $('#fxImport').onclick=()=>{closeEffectLibrary();$('#fileOverlay').click();};
  $('#fxDialog').addEventListener('cancel',e=>{if(FX.busy)e.preventDefault();});
  $('#fxDialog').addEventListener('close',()=>{clearEffectSelection();FX.focus?.focus();});
}
