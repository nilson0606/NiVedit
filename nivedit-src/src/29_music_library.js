/* Built-in background music: file:// and Pages share the same lazy MP3 payloads.
   Auditioning never adds a track or allocates an AudioBuffer in the project. */
const _musicPending = new Map(), _musicFiles = new Map();
const _musicBase = new URL('background-music/', document.baseURI);
const MU = {page:0,size:10,selected:null,file:null,url:null,token:0,busy:false,epoch:0,focus:null};
const musicName = e => LANG==='en' ? e.en : e.name;
const musicInstruments = e => LANG==='en' ? e.instrumentsEn : e.instruments;
window.__nvMusicData = (id,encoded) => {
  const job=_musicPending.get(id); if(!job)return;
  try{
    const raw=atob(encoded);
    if(raw.length!==job.entry.bytes || !(raw.startsWith('ID3') || raw.charCodeAt(0)===255)) throw Error('Invalid music asset');
    const file=new File([Uint8Array.from(raw,c=>c.charCodeAt(0))],job.entry.filename,{type:'audio/mpeg',lastModified:0});
    _musicFiles.set(id,file);
    while(_musicFiles.size>3)_musicFiles.delete(_musicFiles.keys().next().value);
    job.finish(null,file);
  }catch(e){job.finish(e);}
};
function loadMusicFile(entry){
  if(_musicFiles.has(entry.id))return Promise.resolve(_musicFiles.get(entry.id));
  if(_musicPending.has(entry.id))return _musicPending.get(entry.id).promise;
  let resolve,reject;
  const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
  const script=document.createElement('script');
  const timer=setTimeout(()=>finish(Error('Music load timeout')),20000);
  function finish(error,file){
    if(!_musicPending.has(entry.id))return;
    clearTimeout(timer);script.remove();_musicPending.delete(entry.id);
    error?reject(error):resolve(file);
  }
  _musicPending.set(entry.id,{entry,promise,finish});
  script.src=new URL(entry.stem+'.js',_musicBase).href;
  script.onerror=()=>finish(Error('Music asset unavailable'));
  script.onload=()=>{if(_musicPending.has(entry.id))finish(Error('Empty music asset'));};
  document.head.append(script);
  return promise;
}
function releaseMusicPreview(){
  const audio=$('#muAudio');audio.pause();audio.removeAttribute('src');audio.load();
  if(MU.url)URL.revokeObjectURL(MU.url);
  MU.url=null;MU.file=null;
}
function clearMusicSelection(){
  ++MU.token;releaseMusicPreview();MU.selected=null;
  $('#muName').textContent='';$('#muInstruments').textContent='';
  $('#muAdd').disabled=true;$('#muRetry').hidden=true;
  $('#muStatus').textContent='選擇曲目後，按播放鍵試聽。';
}
function renderMusicLibrary(){
  const q=$('#muSearch').value.trim().toLowerCase(),category=$('#muCategory').value;
  const list=MUSIC_CATALOG.filter(e=>(!category||e.category===category)&&
    (!q||[e.name,e.en,e.instruments,e.instrumentsEn].join(' ').toLowerCase().includes(q)));
  const pages=Math.max(1,Math.ceil(list.length/MU.size));MU.page=clamp(MU.page,0,pages-1);
  const grid=$('#muGrid');grid.replaceChildren();
  for(const entry of list.slice(MU.page*MU.size,(MU.page+1)*MU.size)){
    const button=document.createElement('button');button.type='button';button.className='mu-card';
    button.dataset.id=entry.id;button.disabled=MU.busy;button.setAttribute('aria-pressed',String(MU.selected===entry.id));
    const title=document.createElement('strong');title.dataset.nt='';title.textContent=musicName(entry);
    const instruments=document.createElement('span');instruments.dataset.nt='';instruments.textContent=musicInstruments(entry);
    const detail=document.createElement('small');detail.dataset.nt='';detail.textContent='25 s · '+entry.bpm+' BPM';
    button.append(title,instruments,detail);button.onclick=()=>selectMusic(entry);grid.append(button);
  }
  if(!list.length){const p=document.createElement('p');p.textContent='沒有符合的音樂';grid.append(p);}
  $('#muCount').textContent=LANG==='en'?list.length+' tracks · '+(MU.page+1)+' / '+pages:list.length+' 首 · 第 '+(MU.page+1)+' / '+pages+' 頁';
  $('#muPrev').disabled=MU.busy||MU.page===0;$('#muNext').disabled=MU.busy||MU.page===pages-1;
  if(MU.selected){
    const e=MUSIC_CATALOG.find(e=>e.id===MU.selected);
    $('#muName').textContent=musicName(e);$('#muInstruments').textContent=musicInstruments(e);
  }
}
async function selectMusic(entry){
  if(MU.busy)return;
  clearMusicSelection();const token=MU.token;MU.selected=entry.id;renderMusicLibrary();
  $('#muStatus').textContent='載入音樂中…';
  try{
    const file=await loadMusicFile(entry);
    if(token!==MU.token||!$('#muDialog').open)return;
    MU.file=file;MU.url=URL.createObjectURL(file);$('#muAudio').src=MU.url;
    $('#muAudio').volume=.7;$('#muAdd').disabled=false;
    $('#muStatus').textContent='按播放鍵試聽；喜歡再按「加入音軌」。';
  }catch(e){
    if(token!==MU.token||!$('#muDialog').open)return;
    $('#muStatus').textContent='音樂載入失敗，請重試。本機使用時，請保留 HTML 旁的 background-music 資料夾。';
    $('#muRetry').hidden=false;
  }
}
function closeMusicLibrary(){if(!MU.busy)$('#muDialog').close();}
function openMusicLibrary(){
  setPlaying(false);MU.focus=document.activeElement;MU.epoch=_gifEpoch;
  clearMusicSelection();renderMusicLibrary();$('#muDialog').showModal();$('#muSearch').focus();
}
function setMusicBusy(busy){
  MU.busy=busy;
  for(const id of ['muSearch','muCategory','muClose','muImport','muRetry','muAdd'])$('#'+id).disabled=busy;
  renderMusicLibrary();
}
async function addSelectedMusic(){
  if(MU.busy||!MU.file)return;
  if(MU.epoch!==_gifEpoch){toast('專案已改變，請重新選擇音樂',true);closeMusicLibrary();return;}
  $('#muAudio').pause();setMusicBusy(true);$('#muStatus').textContent='加入音軌中…';
  let track;
  try{track=await addMusicFile(MU.file);}
  finally{setMusicBusy(false);}
  if(track)closeMusicLibrary();else $('#muStatus').textContent='音樂無法加入，請查看提示或選擇其他曲目。';
}
function initMusicLibrary(){
  for(const e of MUSIC_CATEGORIES){const o=document.createElement('option');o.value=e.id;o.textContent=e.name;$('#muCategory').append(o);}
  for(const id of ['muSearch','muCategory'])$('#'+id).addEventListener(id==='muSearch'?'input':'change',()=>{
    MU.page=0;clearMusicSelection();renderMusicLibrary();
  });
  $('#muPrev').onclick=()=>{--MU.page;renderMusicLibrary();};
  $('#muNext').onclick=()=>{++MU.page;renderMusicLibrary();};
  $('#muClose').onclick=closeMusicLibrary;
  $('#muRetry').onclick=()=>selectMusic(MUSIC_CATALOG.find(e=>e.id===MU.selected));
  $('#muAdd').onclick=addSelectedMusic;
  $('#muImport').onclick=()=>{closeMusicLibrary();$('#fileAudio').click();};
  $('#muPackDownload').href=new URL('NiVedit_Music_40_25s_v1.zip',_musicBase).href;
  $('#muDialog').addEventListener('cancel',e=>{if(MU.busy)e.preventDefault();});
  $('#muDialog').addEventListener('close',()=>{clearMusicSelection();MU.focus?.focus();});
}
