/* Video compatibility: actual decoded dimensions, local software conversion, no uploads.
   @ffmpeg/core is isolated in a disposable Worker. The editor never executes native tools. */
'use strict';
const COMPAT = {target:null,file:null,result:null,url:null,busy:false,job:0,worker:null,cancel:null,focus:null};
const _compatWatched = new WeakSet(), _compatSince = new WeakMap();
let _compatTick=0, _compatNoticeKey='', _compatAssetPromise=null;
function videoProblem(c){
  const v=c.video;
  if (!v) return '';
  if (v.error) return 'decode';
  if (v.readyState>=1 && (!v.videoWidth || !v.videoHeight)) return 'no-video';
  if (v.readyState<2){
    if (!_compatSince.has(v)) _compatSince.set(v,performance.now());
    if (performance.now()-_compatSince.get(v)>15000) return 'waiting';
  } else _compatSince.delete(v);
  return '';
}
function watchVideoMedia(v){
  if (!v || _compatWatched.has(v)) return;
  _compatWatched.add(v); _compatSince.set(v,performance.now());
  for (const name of ['loadedmetadata','loadeddata','seeked','error','emptied']){
    v.addEventListener(name,()=>{
      if(name==='emptied') _compatSince.set(v,performance.now());
      if (typeof markDirty==='function') markDirty(100);
      _compatTick=0;
    });
  }
}
function updateVideoHealth(now){
  if(now<_compatTick)return; _compatTick=now+500;
  const bad=A.clips.filter(c=>{watchVideoMedia(c.video);return !!videoProblem(c)});
  const key=LANG+'|'+bad.map(c=>c.id+':'+videoProblem(c)).join('|');
  if(key===_compatNoticeKey)return; _compatNoticeKey=key;
  const box=$('#compatNotice'); box.hidden=!bad.length;
  if(!bad.length)return;
  $('#compatWarning').textContent=L('影片無法顯示或仍在等待影像：')+' '+bad.map(c=>'「'+c.name+'」').join('、');
  $('#compatFix').onclick=()=>openCompatibilityTool(bad[0]);
}
function videoCompatibilityError(c){
  return new Error(L('無法取得影片影像：')+'「'+c.name+'」。'+
    L('請先使用「轉成相容格式」，或開啟瀏覽器硬體加速後重新啟動。原素材與剪輯資料會保留。'));
}
function loadCompatAssets(){
  if (_compatAssetPromise) return _compatAssetPromise;
  _compatAssetPromise=new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    let done=false;
    const finish=(err,value)=>{
      if(done)return;done=true;clearTimeout(timer);script.remove();delete window.__nvCompatAsset;
      if(err){_compatAssetPromise=null;reject(err)}else resolve(value);
    };
    const timer=setTimeout(()=>finish(new Error(L('轉碼工具載入逾時，請重試。'))),90000);
    window.__nvCompatAsset=async(core,chunks)=>{
      try{
        const bytes=new Uint8Array(32232419);let at=0;
        for(const part of chunks){
          const s=atob(part);
          for(let i=0;i<s.length;i++)bytes[at++]=s.charCodeAt(i);
        }
        if(at!==bytes.length)throw new Error('Invalid converter size');
        const hex=b=>Array.from(new Uint8Array(b),v=>v.toString(16).padStart(2,'0')).join('');
        if(hex(await crypto.subtle.digest('SHA-256',bytes))!=='9f57947a5bd530d8f00c5b3f2cb2a3492faa7e5d823315342d6a8656d0a6b7b7' ||
           hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(core)))!=='b266ab5b952555881dd6310663986994a182acb2b7ff25cf10a25f7a37ac2b21')
          throw new Error('Invalid converter checksum');
        finish(null,{core,bytes});
      }catch(e){finish(e)}
    };
    script.src=new URL('video-compat/ffmpeg-0.12.10.js',document.baseURI).href;
    script.onerror=()=>finish(new Error(L('找不到轉碼工具。請確認 video-compat 資料夾與 HTML 放在一起，網站版請檢查連線後重試。')));
    document.head.append(script);
  });
  return _compatAssetPromise;
}
/* Serialized into the Worker together with the unmodified upstream core. */
function compatibilityWorker(){
  self.onmessage=async e=>{
    let ff;const logs=[];
    try{
      ff=await createFFmpegCore({wasmBinary:e.data.wasm});
      ff.setLogger(o=>{logs.push(o.message);if(logs.length>12)logs.shift()});
      ff.FS.mkdir('/input');
      ff.FS.mount(ff.FS.filesystems.WORKERFS,{files:[new File([e.data.file],'source.bin')]},'/input');
      const rc=ff.ffprobe('-v','error','-show_streams','-show_format','-of','json','/input/source.bin','-o','/info.json');
      // Core 0.12.10 ffprobe leaves ret=-1 on successful JSON output; validate the output itself.
      if(rc>0)throw new Error('Cannot read video');
      const info=JSON.parse(ff.FS.readFile('/info.json',{encoding:'utf8'}));
      const v=info.streams.find(s=>s.codec_type==='video');
      if(!v || !v.width || !v.height)throw new Error('No video stream');
      if(v.width*v.height>4096*4096)throw new Error('Resolution exceeds conversion limit');
      const seconds=Number(v.duration)||Number(info.format.duration);
      const hdr=['smpte2084','arib-std-b67'].includes(v.color_transfer);
      const filters=[];
      if(hdr) filters.push('zscale=t=linear:npl=100','format=gbrpf32le','tonemap=tonemap=hable:desat=0','zscale=p=bt709:t=bt709:m=bt709:r=limited');
      if(e.data.size==='1080')filters.push("scale=w='if(gte(iw,ih),min(1920,iw),min(1080,iw))':h='if(gte(iw,ih),min(1080,ih),min(1920,ih))':force_original_aspect_ratio=decrease:force_divisible_by=2");
      else filters.push('scale=ceil(iw/2)*2:ceil(ih/2)*2');
      filters.push('format=yuv420p');
      const args=['-i','/input/source.bin','-map','0:v:0','-map','0:a:0?','-c:v','libx264','-preset','ultrafast','-crf','20',
        '-threads','1','-vf',filters.join(','),'-pix_fmt','yuv420p','-fps_mode','passthrough',
        '-c:a','aac','-b:a','192k','-movflags','+faststart','-map_metadata','-1'];
      if(hdr)args.push('-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709','-color_range','tv');
      args.push('/output.mp4');
      self.postMessage({type:'info',seconds,hdr,width:v.width,height:v.height});
      ff.reset();
      ff.setProgress(o=>self.postMessage({type:'progress',seconds:o.time/1000000,total:seconds}));
      const result=ff.exec(...args);
      if(result!==0)throw new Error('Conversion failed ('+result+')');
      const bytes=ff.FS.readFile('/output.mp4');
      self.postMessage({type:'done',bytes,hdr},[bytes.buffer]);
    }catch(err){self.postMessage({type:'error',message:String(err.message||err),log:logs.join('\n')})}
  };
}
function releaseCompatResult(){
  if(COMPAT.url)URL.revokeObjectURL(COMPAT.url);
  COMPAT.url=null;COMPAT.result=null;
  $('#compatDownload').hidden=true;$('#compatApply').hidden=true;
}
function compatibilityStatus(s){$('#compatStatus').textContent=s}
function selectCompatSource(c,file){
  releaseCompatResult();COMPAT.target=c||null;COMPAT.file=file||(c&&c.file)||null;
  $('#compatName').textContent=COMPAT.file?COMPAT.file.name:'';
  $('#compatRun').disabled=!COMPAT.file;
  $('#compatProgress').value=0;
  compatibilityStatus('選好影片後按「開始轉換」。完成後可下載副本，或套用到選取片段。');
}
function openCompatibilityTool(c,file){
  if(A.exporting)return;
  if(COMPAT.busy)return;
  setPlaying(false);COMPAT.focus=document.activeElement;
  const sel=$('#compatClip');sel.replaceChildren();
  const empty=document.createElement('option');empty.value='';empty.textContent=L('選擇專案中的影片');sel.append(empty);
  for(const clip of A.clips.filter(x=>x.video)){
    const o=document.createElement('option');o.value=clip.id;o.textContent=clip.name;sel.append(o);
  }
  c=file?null:(c||(A.sel.type==='clip'?A.clips.find(x=>x.id===A.sel.id&&x.video):null));
  sel.value=c?c.id:'';
  selectCompatSource(c,file);
  if(!$('#compatDialog').open)$('#compatDialog').showModal();
}
function stopCompatibility(){
  ++COMPAT.job;
  if(COMPAT.cancel)COMPAT.cancel();
  if(COMPAT.worker)COMPAT.worker.terminate();
  COMPAT.worker=null;COMPAT.cancel=null;setCompatBusy(false);
  compatibilityStatus('已取消轉換，原素材與剪輯資料未變。');
}
function setCompatBusy(busy){
  COMPAT.busy=busy;
  for(const id of ['compatClip','compatChoose','compatSize','compatRun'])$('#'+id).disabled=busy|| (id==='compatRun'&&!COMPAT.file);
  $('#compatCancel').hidden=!busy;
  $('#compatClose').disabled=busy;
}
function waitCompatVideo(file){
  return new Promise((resolve,reject)=>{
    const url=URL.createObjectURL(file),v=document.createElement('video');
    v.preload='auto';v.muted=true;v.playsInline=true;
    let ended=false;
    const finish=err=>{
      if(ended)return;ended=true;clearTimeout(timer);v.onloadeddata=null;v.onerror=null;
      if(err){v.removeAttribute('src');v.load();URL.revokeObjectURL(url);reject(err)}
      else resolve({v,url});
    };
    const timer=setTimeout(()=>finish(new Error(L('轉換結果尚無法顯示，請重試。'))),20000);
    v.onerror=()=>finish(new Error(L('轉換結果尚無法顯示，請重試。')));
    v.onloadeddata=()=>{
      if(v.videoWidth>0&&v.videoHeight>0&&isFinite(v.duration)&&v.duration>0)finish();
      else finish(new Error(L('轉換結果尚無法顯示，請重試。')));
    };
    v.src=url;
  });
}
async function runCompatibility(){
  const file=COMPAT.file;if(!file||COMPAT.busy)return;
  if(file.size>512*1024*1024){compatibilityStatus('此轉碼工具單檔上限為 512 MB。請先在電腦上轉成 H.264，或縮短原影片。');return}
  releaseCompatResult();setCompatBusy(true);const job=++COMPAT.job;
  $('#compatProgress').value=0;
  compatibilityStatus('正在載入轉碼工具（首次約 43 MB）…');
  let workerURL=null;
  try{
    const asset=await loadCompatAssets();if(job!==COMPAT.job)return;
    const source=asset.core+'\n('+compatibilityWorker.toString()+')();';
    workerURL=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
    const w=new Worker(workerURL);COMPAT.worker=w;
    const bytes=asset.bytes.slice();
    const output=await new Promise((resolve,reject)=>{
      COMPAT.cancel=()=>reject(new Error('__cancel__'));
      w.onerror=e=>reject(new Error(e.message||'Worker failed'));
      w.onmessage=e=>{
        if(job!==COMPAT.job)return;
        const m=e.data;
        if(m.type==='info')compatibilityStatus('正在轉成 H.264／AAC，相容副本不會覆蓋原檔。');
        if(m.type==='progress'){
          const pct=m.total>0?Math.min(99,Math.max(0,m.seconds/m.total*100)):0;
          $('#compatProgress').value=pct;
          compatibilityStatus(L('正在轉換：')+Math.round(pct)+'%');
        }
        if(m.type==='done')resolve(m);
        if(m.type==='error'){console.warn('[compat]',m.log);reject(new Error(m.message))}
      };
      w.postMessage({wasm:bytes,file,size:$('#compatSize').value},[bytes.buffer]);
    });
    if(job!==COMPAT.job)return;
    const result=new File([output.bytes],file.name.replace(/\.[^.]*$/,'')+'_H264.mp4',{type:'video/mp4'});
    compatibilityStatus('正在驗證轉換結果…');
    const check=await waitCompatVideo(result);
    check.v.removeAttribute('src');check.v.load();URL.revokeObjectURL(check.url);
    if(job!==COMPAT.job)return;
    COMPAT.result=result;COMPAT.url=URL.createObjectURL(result);
    $('#compatProgress').value=100;
    $('#compatDownload').hidden=false;
    $('#compatApply').hidden=!COMPAT.target;
    compatibilityStatus(output.hdr?'轉換完成。HDR 已轉為 SDR；可下載副本或套用到片段。':'轉換完成。可下載副本或套用到片段，原素材檔案保持不變。');
  }catch(e){
    if(job===COMPAT.job && e.message!=='__cancel__'){
      compatibilityStatus(L('轉換失敗，原素材與剪輯資料未變。可重試或選 1080p 以減少記憶體需求。')+' '+e.message);
      console.warn('[compat]',e);
    }
  }finally{
    if(workerURL)URL.revokeObjectURL(workerURL);
    if(job===COMPAT.job){if(COMPAT.worker)COMPAT.worker.terminate();COMPAT.worker=null;COMPAT.cancel=null;setCompatBusy(false)}
  }
}
async function applyCompatibility(){
  const c=COMPAT.target,file=COMPAT.result;
  if(!c||!file||COMPAT.busy)return;
  if(!A.clips.includes(c)){compatibilityStatus('原片段已變更，請重新選擇。轉換副本仍可下載。');return}
  setCompatBusy(true);
  let loaded;
  try{
    loaded=await waitCompatVideo(file);
    const v=loaded.v;
    if(v.duration+0.1<c.outP)throw new Error(L('轉換結果長度不足，未替換原片段。'));
    if(!A.clips.includes(c))throw new Error(L('原片段已變更，請重新選擇。轉換副本仍可下載。'));
    const nc={...c,id:uid(),name:file.name,file,url:loaded.url,video:v,el:v,
      w:v.videoWidth,h:v.videoHeight,audioBuf:null,audioTried:false,_ab:null,exportSrc:null};
    nc.thumb=await grabThumb(v);
    if(!A.clips.includes(c))throw new Error(L('原片段已變更，請重新選擇。轉換副本仍可下載。'));
    pushUndo();c.video.pause();
    $('#videoPool').append(v);
    A.clips[A.clips.indexOf(c)]=nc;regMedia(nc);
    A.sel={type:'clip',id:nc.id};COMPAT.target=null;
    $('#compatApply').hidden=true;
    render();refreshProp();markDirty(700);_compatTick=0;
    compatibilityStatus('已套用到片段，剪輯設定保持不變；可按「復原」回到原素材。請儲存或另存專案。');
    loaded=null;
  }catch(e){compatibilityStatus(e.message)}
  finally{
    if(loaded){loaded.v.removeAttribute('src');loaded.v.load();URL.revokeObjectURL(loaded.url)}
    setCompatBusy(false);
  }
}
$('#btnCompat').onclick=()=>openCompatibilityTool();
$('#compatClip').onchange=e=>selectCompatSource(A.clips.find(c=>c.id===e.target.value));
$('#compatChoose').onclick=()=>$('#compatFile').click();
$('#compatFile').onchange=e=>{const f=e.target.files[0];e.target.value='';if(f){$('#compatClip').value='';selectCompatSource(null,f)}};
$('#compatRun').onclick=runCompatibility;
$('#compatCancel').onclick=stopCompatibility;
$('#compatApply').onclick=applyCompatibility;
$('#compatDownload').onclick=()=>{
  if(!COMPAT.result||!COMPAT.url)return;
  const a=document.createElement('a');a.href=COMPAT.url;a.download=COMPAT.result.name;a.click();
};
$('#compatClose').onclick=()=>$('#compatDialog').close();
$('#compatDialog').addEventListener('cancel',e=>{if(COMPAT.busy)e.preventDefault()});
$('#compatDialog').addEventListener('close',()=>{releaseCompatResult();COMPAT.target=null;COMPAT.file=null;if(COMPAT.focus&&COMPAT.focus.isConnected)COMPAT.focus.focus()});

document.addEventListener('click',e=>{if(e.target.closest('#cCompat'))openCompatibilityTool()});

$('#compatDialog').addEventListener('keydown',e=>e.stopPropagation());
