/* An explicitly opened sample project; never replaces work on page load. */
const DEMO={file:null,pending:null,busy:false,token:0,focus:null};
window.__nvExampleData=encoded=>{
  const job=DEMO.pending;if(!job)return;
  try{
    const raw=atob(encoded);
    if(raw.length!==EXAMPLE_PROJECT.bytes||raw.slice(0,7)!=='NVPROJ1')throw Error('Invalid example');
    job.finish(null,new File([Uint8Array.from(raw,c=>c.charCodeAt(0))],'NiVedit_範例練習.nvproj',{type:'application/octet-stream'}));
  }catch(e){job.finish(e);}
};
function loadExampleFile(){
  if(DEMO.file)return Promise.resolve(DEMO.file);
  let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
  const script=document.createElement('script');
  const timer=setTimeout(()=>finish(Error('Example load timeout')),45000);
  function finish(error,file){
    if(!DEMO.pending)return;
    clearTimeout(timer);script.remove();DEMO.pending=null;
    if(error)reject(error);else resolve(file);
  }
  DEMO.pending={finish};
  script.src=new URL('example-project/'+EXAMPLE_PROJECT.stem+'.js',document.baseURI).href;
  script.onerror=()=>finish(Error('Example asset unavailable'));
  script.onload=()=>{if(DEMO.pending)finish(Error('Empty example asset'));};
  document.head.append(script);return promise;
}
function showExampleProject(){
  if(DEMO.busy)return;
  DEMO.focus=document.activeElement;
  $('#demoStatus').textContent=_unsaved
    ? '目前有未儲存的修改。載入範例會取代目前時間軸，請先關閉此視窗並儲存，或按載入範例繼續。'
    : '載入後可自由調整時間軸，並另存為自己的練習專案。';
  $('#demoStart').hidden=false;$('#demoStart').disabled=false;$('#demoCancel').disabled=false;
  $('#demoDialog').showModal();$('#demoStart').focus();
}
async function openExampleProject(){
  if(DEMO.busy)return;
  setPlaying(false);DEMO.busy=true;const token=++DEMO.token,epoch=_gifEpoch;
  $('#btnExample').disabled=true;$('#demoCancel').disabled=false;$('#demoStart').disabled=true;
  $('#demoStatus').textContent='正在載入範例，請稍候…';
  try{
    const file=await loadExampleFile();
    if(token!==DEMO.token||!$('#demoDialog').open)return;
    const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer())),x=>x.toString(16).padStart(2,'0')).join('');
    if(digest!==EXAMPLE_PROJECT.sha256)throw Error('Example checksum mismatch');
    if(epoch!==_gifEpoch||token!==DEMO.token)return;
    DEMO.file=file;$('#demoCancel').disabled=true;$('#demoDialog').close();
    await projImportFile(file);
    if(!$('#mask').classList.contains('on')){
      seekTo(0); // Always open the built-in example at the beginning.
      markSaved();
    }
  }catch(e){
    if(token!==DEMO.token)return;
    $('#demoStatus').textContent='範例載入失敗。請關閉後重試；本機使用時，請保留 HTML 旁的 example-project 資料夾。';
  }finally{
    DEMO.busy=false;$('#btnExample').disabled=false;$('#demoStart').disabled=false;
  }
}
function initExampleProject(){
  $('#btnExample').onclick=showExampleProject;
  $('#demoStart').onclick=openExampleProject;
  const cancel=()=>{
    ++DEMO.token;
    if(DEMO.pending)DEMO.pending.finish(Error('Example cancelled'));
    $('#demoDialog').close();
  };
  $('#demoCancel').onclick=cancel;
  $('#demoDialog').addEventListener('cancel',e=>{
    e.preventDefault();if(!$('#demoCancel').disabled)cancel();
  });
  $('#demoDialog').addEventListener('close',()=>{DEMO.focus?.focus();});
}
