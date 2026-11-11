/* V15 免重壓匯出（影像直通）專項
   node tests/passthrough.e2e.cjs　　結束碼 0 = 全過
   環境變數：NIVEDIT_HTML（要測的單檔 HTML）、NIVEDIT_CHROME（瀏覽器）、
   NIVEDIT_PT_FIX（素材資料夾，缺的會用 ffmpeg 自動產生）、NIVEDIT_PT_OUT（輸出）。
   需要 ffmpeg／ffprobe。headless Chromium 沒有 AAC 編碼器時聲音會走 Opus，這也是要驗的路徑之一。
   驗證方式：ffmpeg framemd5 逐一比對影像封包雜湊，確認真的沒有重新編碼。 */
const path=require('path');
const {chromium}=require('playwright');
const fs=require('fs'),{execSync}=require('child_process');
const HTMLFILE=process.env.NIVEDIT_HTML||'/home/claude/NiVedit.html', HTML=path.dirname(HTMLFILE), PAGE=path.basename(HTMLFILE);
const FX=process.env.NIVEDIT_PT_FIX||'/tmp/pt-fx', OUT=process.env.NIVEDIT_PT_OUT||'/tmp/pt-out';
const CHROME=process.env.NIVEDIT_CHROME||'/opt/pw-browsers/chromium-1243/chrome-linux64/chrome';
fs.mkdirSync(OUT,{recursive:true});fs.mkdirSync(FX,{recursive:true});
const mk=(f,cmd)=>{if(!fs.existsSync(path.join(FX,f)))execSync(`cd "${FX}" && ffmpeg -v error -y ${cmd}`);};
mk('h264b.mp4','-f lavfi -i testsrc2=size=640x360:rate=30 -f lavfi -i sine=f=440:sample_rate=48000 -t 6 -c:v libx264 -g 30 -bf 2 -pix_fmt yuv420p -c:a aac h264b.mp4');
mk('h264.mp4','-f lavfi -i testsrc2=size=640x360:rate=30 -t 6 -c:v libx264 -g 30 -bf 0 -pix_fmt yuv420p -an h264.mp4');
mk('vp9.mp4','-f lavfi -i testsrc2=size=640x360:rate=30 -t 6 -c:v libvpx-vp9 -g 30 -b:v 1M -pix_fmt yuv420p vp9.mp4');
mk('m.mp3','-f lavfi -i sine=f=660:sample_rate=48000 -t 8 -c:a libmp3lame m.mp3');
mk('rot90.mp4','-display_rotation 90 -i h264.mp4 -c copy rot90.mp4');
const http=require('http');
const serve=(dir,port)=>new Promise(r=>{const s=http.createServer((q,res)=>{const f=path.join(dir,decodeURIComponent(q.url.split('?')[0]).replace(/^\/+/,''));if(!fs.existsSync(f)){res.writeHead(404);return res.end();}res.writeHead(200,{'Content-Type':f.endsWith('.html')?'text/html; charset=utf-8':'application/octet-stream'});fs.createReadStream(f).pipe(res);});s.listen(port,()=>r(s));});
let pass=0,fail=0;const ok=(c,m)=>{if(c){pass++;console.log('PASS',m)}else{fail++;console.log('FAIL',m)}};
const sh=c=>execSync(c,{encoding:'utf8'});
const onset=sil=>{const en=sil.match(/silence_end: ([\d.]+)/);return en?+en[1]:NaN;};
const vmd5=(f,extra='')=>sh(`ffmpeg -v error -i ${f} -map 0:v ${extra} -c copy -f framemd5 - | grep -v '^#' | awk -F, '{print $NF}'`).trim().split('\n').map(x=>x.trim());
(async()=>{
  const srv=await serve(HTML,8932);
  const b=await chromium.launch({executablePath:CHROME,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
  const fresh=async(files)=>{
    const p=await (await b.newContext({viewport:{width:1500,height:950}})).newPage();
    p.on('pageerror',e=>console.log('PAGEERR',e.message));
    await p.goto('http://localhost:8932/'+encodeURIComponent(PAGE));
    await p.waitForFunction(()=>typeof A!=='undefined'&&document.querySelector('#verTag').textContent!=='—');
    await p.evaluate(()=>{window.offerExportSave=(blob,name)=>{window.__blob=blob;window.__name=name;};});
    await p.setInputFiles('#fileAny',files.map(f=>FX+'/'+f));
    await p.waitForFunction(n=>A.clips.length+A.musics.length>=n,files.length,{timeout:60000});
    await p.waitForTimeout(500);
    return p;
  };
  const grab=async(p,name)=>{
    await p.waitForFunction(()=>window.__blob||/匯出失敗|Export failed/.test(document.querySelector('#mTitle').textContent),null,{timeout:120000});
    const b64=await p.evaluate(async()=>{if(!window.__blob)return null;const u=new Uint8Array(await window.__blob.arrayBuffer());let s='';for(let i=0;i<u.length;i+=0x8000)s+=String.fromCharCode.apply(null,u.subarray(i,i+0x8000));return btoa(s);});
    const log=await p.evaluate(()=>document.querySelector('#mLog').innerText);
    if(!b64){console.log('LOG',log);return {f:null,log};}
    const f=OUT+'/'+name;fs.writeFileSync(f,Buffer.from(b64,'base64'));return {f,log};
  };
  const exportAsk=async(p,choice)=>{
    await p.click('#btnExport');
    await p.waitForFunction(()=>document.querySelector('#qmask').classList.contains('on'),null,{timeout:60000});
    const info=await p.evaluate(()=>({t:document.querySelector('#qTitle').textContent,m:document.querySelector('#qMsg').innerText,b:[...document.querySelectorAll('#qBtns button')].map(x=>x.textContent)}));
    const btns=await p.$$('#qBtns button');
    await btns[{cancel:0,encode:1,pass:2}[choice]].click();
    return info;
  };
  await p0();
  async function p0(){
  // 版本
  let p=await fresh(['h264b.mp4','m.mp3']);
  ok(await p.evaluate(()=>document.querySelector('#verTag').textContent)==='V15','版本 V15');
  await p.evaluate(()=>{LANG='zh';});
  // A：單段 H.264（含 B 幀），原聲靜音＋配樂 → 免重壓，封包逐一相同
  await p.evaluate(()=>{A.clips[0].muted=true;A.musics[0].fadeIn=0;A.musics[0].fadeOut=0;A.musics[0].startAt=0.5;});
  ok(await p.evaluate(()=>ptQuickReason())==='','A 初步符合');
  let info=await exportAsk(p,'pass');
  ok(/免重壓/.test(info.t)||/re-encod/i.test(info.t),'A 出現免重壓詢問：'+info.t);
  ok(info.b.length===3,'A 三個選項：'+info.b.join('/'));
  ok(/640×360/.test(info.m),'A 顯示原片尺寸');
  ok(/1920×1080/.test(info.m),'A 提示與專案尺寸不同');
  let r=await grab(p,'A.mp4');
  ok(r.f&&/免重壓|No re-encoding/.test(r.log),'A 完成視窗寫明免重壓');
  if(r.f){
    const src=vmd5(FX+'/h264b.mp4'),out=vmd5(r.f);
    ok(src.length===out.length&&src.every((x,i)=>x===out[i]),`A 影像封包逐一相同 ${out.length}/${src.length}`);
    const pr=JSON.parse(sh(`ffprobe -v error -show_entries stream=codec_type,codec_name,width,height,start_time,duration -of json ${r.f}`)).streams;
    const v=pr.find(s=>s.codec_type==='video'),a=pr.find(s=>s.codec_type==='audio');
    ok(v&&v.codec_name==='h264'&&v.width===640&&v.height===360,'A 影像 H.264 640x360');
    ok(!!a,'A 有聲音軌 '+(a&&a.codec_name));
    const sil=sh(`ffmpeg -v info -i ${r.f} -map 0:a -af silencedetect=n=-40dB:d=0.01 -f null - 2>&1 | grep silence || true`);
    const on=onset(sil);
    global.__onB=on; global.__vB=+v.start_time;
    const ad=sh(`ffprobe -v error -select_streams a -show_entries packet=duration -of csv=p=0 ${r.f}`).trim().split('\n').map(Number);
    ok(Math.max(...ad.slice(0,-1))<=1024,'A 聲音封包長度正常（沒有被撐大補位）最大 '+Math.max(...ad.slice(0,-1)));
    ok(Math.abs(+v.duration-6)<0.1,'A 影像長度 6 秒 '+v.duration);
    const pts=sh(`ffprobe -v error -select_streams v -show_entries packet=pts_time -of csv=p=0 ${r.f}`).trim().split('\n').map(Number).sort((x,y)=>x-y);
    const pts0=sh(`ffprobe -v error -select_streams v -show_entries packet=pts_time -of csv=p=0 ${FX}/h264b.mp4`).trim().split('\n').map(Number).sort((x,y)=>x-y);
    ok(pts.every((t,i)=>Math.abs((t-pts[0])-(pts0[i]-pts0[0]))<1e-3),'A 每格顯示時間間隔與原片相同');
    // 聲音真的是配樂（660Hz）不是原聲（440Hz）
    const vol=sh(`ffmpeg -v error -i ${r.f} -map 0:a -af "bandpass=f=660:width_type=h:w=40,volumedetect" -f null - 2>&1 | grep mean_volume || true`)+sh(`ffmpeg -v info -i ${r.f} -map 0:a -af "bandpass=f=660:width_type=h:w=40,volumedetect" -f null - 2>&1 | grep mean_volume || true`);
    const v440=sh(`ffmpeg -v info -i ${r.f} -map 0:a -af "bandpass=f=440:width_type=h:w=40,volumedetect" -f null - 2>&1 | grep mean_volume || true`);
    const m660=+(vol.match(/mean_volume: (-?[\d.]+)/)||[0,-99])[1],m440=+(v440.match(/mean_volume: (-?[\d.]+)/)||[0,-99])[1];
    ok(m660>m440+15,`A 聲音是配樂 660Hz=${m660}dB 440Hz=${m440}dB`);
  }
  // A2：取消
  await p.evaluate(()=>{window.__blob=null;$('#mask').classList.remove('on');});
  info=await exportAsk(p,'cancel');
  await p.waitForTimeout(400);
  ok(await p.evaluate(()=>!A.exporting&&!document.querySelector('#mask').classList.contains('on')&&!window.__blob),'A2 取消不匯出');
  // B：選「依專案設定重壓」→ 走舊流程，完成視窗寫原因
  info=await exportAsk(p,'encode');
  r=await grab(p,'B.bin');
  ok(/影像有重新編碼|Video was re-encoded/.test(r.log)&&/依專案設定重壓|re-encode with project/.test(r.log),'B 選重壓走舊流程並寫原因');
  // C：剪頭不在關鍵幀（1.5 秒）→ 問對齊；對齊到 1.0 秒；封包＝原片第 30 個起
  await p.evaluate(()=>{window.__blob=null;$('#mask').classList.remove('on');A.clips[0].inP=1.5;render();});
  info=await exportAsk(p,'pass');
  ok(/1\.50/.test(info.m)&&/1\.00/.test(info.m),'C 提示剪頭 1.50 對齊到 1.00');
  ok(/對齊/.test(info.b[2])||/Align/.test(info.b[2]),'C 按鈕寫對齊');
  r=await grab(p,'C.mp4');
  ok(await p.evaluate(()=>Math.abs(A.clips[0].inP-1)<1e-6),'C 時間軸剪頭已改成 1.00');
  if(r.f){const src=vmd5(FX+'/h264b.mp4').slice(30),out=vmd5(r.f);ok(src.length===out.length&&src.every((x,i)=>x===out[i]),`C 封包＝原片 1 秒起 ${out.length}/${src.length}`);}
  ok(await p.evaluate(()=>{undo();return Math.abs(A.clips[0].inP-1.5)<1e-6}),'C 可以復原');
  // D：在 3.0 秒（關鍵幀）分割成兩段 → 接起來仍與原片相同
  await p.evaluate(()=>{window.__blob=null;$('#mask').classList.remove('on');A.clips[0].inP=0;render();A.sel={type:'clip',id:A.clips[0].id};A.playhead=3.0;splitClip();});
  ok(await p.evaluate(()=>A.clips.length===2),'D 分割成兩段');
  info=await exportAsk(p,'pass');
  r=await grab(p,'D.mp4');
  if(r.f){const src=vmd5(FX+'/h264b.mp4'),out=vmd5(r.f);ok(src.length===out.length&&src.every((x,i)=>x===out[i]),`D 兩段接回與原片相同 ${out.length}/${src.length}`);} else ok(false,'D 匯出 '+r.log);
  // D2：在非關鍵幀 2.5 秒分割 → 後段剪頭要問對齊
  await p.evaluate(()=>{window.__blob=null;$('#mask').classList.remove('on');undo();A.sel={type:'clip',id:A.clips[0].id};A.playhead=2.5;splitClip();});
  info=await exportAsk(p,'cancel');
  ok(/2\.50/.test(info.m)&&/2\.00/.test(info.m),'D2 非關鍵幀分割提示對齊 2.50→2.00');
  // E：有標題 → 不問，直接重壓並寫原因
  await p.evaluate(()=>{undo();addTitle(0);window.__blob=null;$('#mask').classList.remove('on');});
  ok(await p.evaluate(()=>ptQuickReason())==='有標題','E 原因：有標題');
  await p.click('#btnExport');
  await p.waitForTimeout(800);
  ok(await p.evaluate(()=>!document.querySelector('#qmask').classList.contains('on')),'E 沒跳詢問');
  r=await grab(p,'E.bin');
  ok(/有標題|there are titles/.test(r.log),'E 完成視窗寫原因');
  // F：縮放 → 原因
  await p.evaluate(()=>{A.titles.length=0;A.clips[0].scale=1.2;});
  ok(await p.evaluate(()=>ptQuickReason())==='有位置、縮放、透明度或旋轉動態','F 縮放原因');
  await p.evaluate(()=>{A.clips[0].scale=1;A.clips[0].grade.bri=10;});
  ok(await p.evaluate(()=>ptQuickReason())==='有調色或濾鏡','F 調色原因');
  await p.evaluate(()=>{A.clips[0].grade.bri=0;A.clips[0].fadeIn=0.5;});
  ok(await p.evaluate(()=>ptQuickReason())==='有影像淡入淡出','F 淡入原因');
  await p.close();
  // G：VP9（MP4）
  p=await fresh(['vp9.mp4']);
  info=await exportAsk(p,'pass');
  r=await grab(p,'G.mp4');
  if(r.f){const src=vmd5(FX+'/vp9.mp4'),out=vmd5(r.f);ok(src.length===out.length&&src.every((x,i)=>x===out[i]),`G VP9 封包相同 ${out.length}/${src.length}`);} else ok(false,'G '+r.log);
  await p.close();
  // H：轉 90 度的原片 → 轉向保留
  p=await fresh(['rot90.mp4']);
  info=await exportAsk(p,'pass');
  ok(/360×640/.test(info.m),'H 直立尺寸 360×640');
  r=await grab(p,'H.mp4');
  if(r.f){const rot=sh(`ffprobe -v error -select_streams v -show_entries stream_side_data=rotation -of csv=p=0 ${r.f}`).trim();ok(/90/.test(rot),'H 轉向保留 '+rot);
    const src=vmd5(FX+'/rot90.mp4'),out=vmd5(r.f);ok(src.every((x,i)=>x===out[i])&&src.length===out.length,'H 封包相同');}
  // H2：使用者再轉 90 → 合計 180
  await p.evaluate(()=>{window.__blob=null;$('#mask').classList.remove('on');A.clips[0].rot=180;});
  info=await exportAsk(p,'pass');
  r=await grab(p,'H2.mp4');
  if(r.f){const rot=sh(`ffprobe -v error -select_streams v -show_entries stream_side_data=rotation -of csv=p=0 ${r.f}`).trim();ok(rot==='-90','H2 原片逆轉 90＋自訂順轉 180＝順轉 90：'+rot);}
  // J：沒有 B 幀的原片當基準：聲音起點與影像第一格的相對關係要跟 A 一樣（A 的影像晚 2 格，聲音也要晚 2 格）
  p=await fresh(['h264.mp4','m.mp3']);
  console.log('J state',await p.evaluate(()=>JSON.stringify({c:A.clips.map(c=>[c.name,c.inP,c.outP,c.muted]),m:A.musics.map(m=>[m.name,m.startAt,m.len,m.vol,m.offset,m.dur])})));
  await p.evaluate(()=>{A.musics[0].fadeIn=0;A.musics[0].fadeOut=0;A.musics[0].startAt=0.5;});
  info=await exportAsk(p,'pass');
  r=await grab(p,'J.mp4');
  if(r.f){
    const v0=+JSON.parse(sh(`ffprobe -v error -select_streams v -show_entries stream=start_time -of json ${r.f}`)).streams[0].start_time;
    const sil=sh(`ffmpeg -v info -i ${r.f} -map 0:a -af silencedetect=n=-40dB:d=0.01 -f null - 2>&1 | grep silence || true`);
    const on0=onset(sil);
    ok(Math.abs((global.__onB-global.__vB)-(on0-v0))<0.003,`J 影音相對位置一致：B幀片 聲音-影像=${(global.__onB-global.__vB).toFixed(4)}　無B幀片=${(on0-v0).toFixed(4)}`);
  } else ok(false,'J '+r.log);
  await p.close();
  p=await fresh(['h264b.mp4']);
  // I：英文介面詢問視窗有翻譯
  await p.evaluate(()=>{window.__blob=null;$('#mask').classList.remove('on');A.clips[0].rot=0;});
  await p.evaluate(()=>{localStorage.setItem('nv.lang','en');});
  await p.close();
  p=await fresh(['h264b.mp4']);
  info=await exportAsk(p,'cancel');
  const han=/[㐀-鿿]/;
  ok(!han.test(info.t)&&!han.test(info.m)&&!info.b.some(x=>han.test(x)),'I 英文詢問視窗無中文：'+JSON.stringify(info));
  info=await exportAsk(p,'pass');
  r=await grab(p,'I.mp4');
  const ttl=await p.evaluate(()=>document.querySelector('#mTitle').textContent);
  ok(!han.test(r.log)&&!han.test(ttl),'I 英文完成視窗無中文：'+ttl+' | '+r.log.replace(/\n/g,' / '));
  await p.evaluate(()=>{window.__blob=null;$('#mask').classList.remove('on');addTitle(0);});
  await p.click('#btnExport');
  r=await grab(p,'I2.bin');
  const line=r.log.split('\n').find(x=>/re-encoded/.test(x))||'';
  ok(/re-encoded because: there are titles/.test(r.log)&&!han.test(line),'I 英文重壓原因：'+line);
  await p.close();
  }
  await b.close();srv.close();
  console.log(`\n${pass}/${pass+fail}`);process.exit(fail?1:0);
})();
