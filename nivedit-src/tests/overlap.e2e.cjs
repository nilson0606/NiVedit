const {chromium}=require('playwright');
const fs=require('fs'),path=require('path');
const {pathToFileURL}=require('url');
const HTML=process.env.NIVEDIT_HTML||'D:/NiVedit/NiVedit.html';
const OUT=process.env.NIVEDIT_OVERLAP_OUT||'D:/NiVedit/qa-overlap-v12.13';
const BASE=process.env.NIVEDIT_BASELINE==='1';
(async()=>{
fs.mkdirSync(OUT,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.NIVEDIT_CHROME||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const page=await browser.newPage({viewport:{width:1500,height:1000},acceptDownloads:true});
const checks=[],errors=[];const check=(name,ok,detail)=>checks.push({name,ok:!!ok,detail});
page.on('pageerror',e=>errors.push(e.message));
try{
await page.addInitScript(()=>{window.showSaveFilePicker=undefined;});
await page.goto(pathToFileURL(HTML).href);
await page.waitForFunction(()=>typeof A!=='undefined');
await page.evaluate(async()=>{
 setLang('zh');
 Object.assign(A.proj,{w:320,h:180,fps:20,bitrate:3});
 window.makePNG=async(color,name)=>{
  const c=document.createElement('canvas');c.width=320;c.height=180;
  const x=c.getContext('2d');x.fillStyle=color;x.fillRect(0,0,320,180);
  return new File([await new Promise(r=>c.toBlob(r))],name,{type:'image/png'});
 };
 await addImageFiles([await makePNG('#ff0000','red.png'),await makePNG('#00ff00','green.png')]);
 window.ids=A.clips.map(c=>c.id);
 window.setup=()=>{
  const a=A.clips.find(c=>c.id===ids[0]),b=A.clips.find(c=>c.id===ids[1]);
  A.clips=[a,b];A.overlays=[];A.titles=[];A.subs=[];
  for(const c of A.clips)Object.assign(c,{inP:0,outP:4,at:0,scale:1,x:.5,y:.5,opacity:1,kf:null,kfT:null,fadeIn:0,fadeOut:0,cropShape:'none',cropKeep:'inside',transMode:'overlap',trans:{type:'none',dur:.5},transOut:{type:'none',dur:.5}});
  b.at=1;b.outP=2;A.playhead=1.5;A.pps=100;render();
 };
 window.pixels=T=>{const c=document.createElement('canvas');c.width=320;c.height=180;const x=c.getContext('2d');renderFrame(x,T,320,180);return Array.from(x.getImageData(0,0,320,180).data);};
 window.center=T=>{const d=pixels(T),i=(90*320+160)*4;return d.slice(i,i+3);};
 setup();
});
check('圖片時間可重疊',await page.evaluate(()=>layout()[1].startAt===1));
check('後開始圖片在前',await page.evaluate(()=>center(1.5)[1]>250));
check('後開始圖片結束後露出前圖',await page.evaluate(()=>center(3.5)[0]>250));
check('未出現前僅畫前圖',await page.evaluate(()=>center(.5)[0]>250));
check('同片頭以原資料順序穩定疊放',await page.evaluate(()=>{A.clips[1].at=0;const ok=center(1)[1]>250;setup();return ok;}));
check('總長包含最晚結束的圖片',await page.evaluate(()=>totalDur()===4));
check('新圖片預設接在最晚結束之後',await page.evaluate(()=>{A.clips.push({...A.clips[1],id:'append-probe',at:null,outP:1});const ok=layout()[2].startAt===4;A.clips.pop();return ok;}));
check('完全透明圖片不遮住同軌後圖',await page.evaluate(()=>{A.clips[1].opacity=0;const ok=center(1.5)[0]>250;setup();return ok;}));

check('圖片依片頭排序而非陣列順序',await page.evaluate(()=>{A.clips.reverse();const ok=center(1.5)[1]>250;setup();return ok;}));
check('圖片半透明露出同軌前圖',await page.evaluate(()=>{A.clips[1].opacity=.5;const d=center(1.5);A.clips[1].opacity=1;return d[0]>120&&d[1]>120&&d[2]<5;}));
check('圖片框外裁切洞露出同軌前圖',await page.evaluate(()=>{Object.assign(A.clips[1],{cropShape:'circle',cropKeep:'outside',cropSize:.5});const d=center(1.5);setup();return d[0]>250&&d[1]<5;}));
check('圖片各自進場轉場不清掉前圖',await page.evaluate(()=>{A.clips[1].trans={type:'dissolve',dur:1};const d=center(1.5);setup();return d[0]>90&&d[1]>90&&d[2]<5;}));
check('圖片各自淡入露出同軌前圖',await page.evaluate(()=>{A.clips[1].fadeIn=1;const d=center(1.5);setup();return d[0]>90&&d[1]>90;}));
check('外加轉場依方塊片頭排序',await page.evaluate(()=>{Object.assign(A.clips[1],{transMode:'add',trans:{type:'dissolve',dur:1}});const d=center(1.5),ok=layout()[1].startAt===1&&d[0]>90&&d[1]>90;setup();return ok;}));
check('時間軸重疊圖片分列且同為L3',await page.evaluate(()=>{const b=[...document.querySelectorAll('#trkImg .blk')];return b.length===2&&b[0].style.top!==b[1].style.top&&b.every(x=>x.querySelector('.lz').textContent==='L3');}));
// 真實鼠標把綠圖移進紅圖內，改到 .5 秒。
await page.evaluate(()=>{A.clips[1].at=4;render();});
let box=await page.locator('#trkImg .blk').nth(1).boundingBox();
await page.mouse.move(box.x+35,box.y+12);await page.mouse.down();await page.mouse.move(box.x+35-350,box.y+12,{steps:12});await page.mouse.up();
check('真實拖曳可放到另一圖片範圍',await page.evaluate(()=>Math.abs(layout()[A.clips.findIndex(c=>c.id===ids[1])].startAt-.5)<.02));
await page.evaluate(()=>setup());
// 圖片右緣可跨過下一張片頭。
box=await page.locator('#trkImg .blk').first().boundingBox();
await page.mouse.move(box.x+box.width-3,box.y+12);await page.mouse.down();await page.mouse.move(box.x+box.width+97,box.y+12,{steps:8});await page.mouse.up();
check('真實右緣延長不受同軌圖片擋住',await page.evaluate(()=>A.clips.find(c=>c.id===ids[0]).outP>4.9));
await page.evaluate(()=>{setup();A.sel={type:'clip',id:ids[0]};refreshProp();});
await page.locator('#cOut').fill('6');await page.locator('#cOut').dispatchEvent('input');
check('停留長度欄位可跨過同軌圖片',await page.evaluate(()=>A.clips[0].outP===6));
await page.evaluate(()=>{setup();A.sel={type:'clip',id:ids[1]};refreshProp();});
await page.locator('#cAt').fill('0.5');await page.locator('#cAt').dispatchEvent('change');
check('時間軸起點欄位保留重疊位置',await page.evaluate(()=>Math.abs(layout()[1].startAt-.5)<.001));
check('移動圖片復原與重做',await page.evaluate(()=>{setup();pushUndo();placeClip(A.clips[1],2,.5);undo();const a=layout()[1].startAt;redo();const b=layout()[1].startAt;setup();return a===1&&b===.5;}));
check('圖片分割保留重疊与時間',await page.evaluate(()=>{setup();A.sel={type:'clip',id:ids[1]};A.playhead=2;splitAtPlayhead();const qs=layout().filter(q=>q.track===2).map(q=>[q.startAt,q.end]);const ok=qs.length===3&&qs.some(q=>q[0]===1&&q[1]===2)&&qs.some(q=>q[0]===2&&q[1]===3)&&center(2.5)[1]>250;setup();return ok;}));
// 動畫效果（PNG 與真正 GIF）以及標題：逆序陣列仍依片頭疊放。
await page.evaluate(async()=>{
 setup();await addOverlayFiles([await makePNG('#0000ff','blue.png'),await makePNG('#ffff00','yellow.png')]);
 for(const o of A.overlays)Object.assign(o,{start:0,end:4,scale:.4,x:.25,y:.25,opacity:1,fadeIn:0,fadeOut:0});
 A.overlays[1].start=1;A.overlays[1].end=3;A.overlays.reverse();render();
});
check('動畫效果同軌依片頭排序且可重疊',await page.evaluate(()=>{const d=pixels(1.5),i=(45*320+80)*4;return d[i]>250&&d[i+1]>250&&d[i+2]<5;}));
check('改動動畫效果片頭會更新覆蓋順序',await page.evaluate(()=>{A.overlays[1].start=2;const d=pixels(2.5),i=(45*320+80)*4;A.overlays[1].start=0;return d[i]<5&&d[i+1]<5&&d[i+2]>250;}));
check('動畫效果半透明露出前效果',await page.evaluate(()=>{A.overlays[0].opacity=.5;const d=pixels(1.5),i=(45*320+80)*4;A.overlays[0].opacity=1;return d[i]>120&&d[i+1]>120&&d[i+2]>120;}));
await page.evaluate(()=>{
 addTitle(0);addTitle(1);
 for(const t of A.titles)Object.assign(t,{text:'TEST',end:4,x:.7,y:.72,size:200,color:'#ff00ff',strokeW:0,shadow:false,opacity:1,animIn:'none',animOut:'none'});
 A.titles[1].color='#00ffff';A.titles[1].end=3;A.titles.reverse();render();
});
check('標題同軌依片頭排序',await page.evaluate(()=>{
 const d=pixels(1.5);let cyan=0,magenta=0;
 for(let y=100;y<165;y++)for(let x=160;x<310;x++){const i=(y*320+x)*4;if(d[i]<30&&d[i+1]>220&&d[i+2]>220)cyan++;if(d[i]>220&&d[i+1]<30&&d[i+2]>220)magenta++;}
 return cyan>30&&magenta===0;
}));
check('改動標題片頭會更新覆蓋順序',await page.evaluate(()=>{A.titles[1].start=2;const d=pixels(2.5);A.titles[1].start=0;let mag=0;for(let y=100;y<165;y++)for(let x=160;x<310;x++){const i=(y*320+x)*4;if(d[i]>220&&d[i+1]<30&&d[i+2]>220)mag++;}return mag>30;}));
check('標題結束後露出前標題',await page.evaluate(()=>{const d=pixels(3.5);let mag=0;for(let y=100;y<165;y++)for(let x=160;x<310;x++){const i=(y*320+x)*4;if(d[i]>220&&d[i+1]<30&&d[i+2]>220)mag++;}return mag>30;}));
check('跨軌層級仍以L號優先',await page.evaluate(()=>{const l=layerLabels();return l.item[A.overlays[0].id]===4&&l.item[A.titles[0].id]===5&&l.clip[ids[0]]===3;}));
check('真實nvproj重開保留三軌重疊與畫面',await page.evaluate(async()=>{
 const before=pixels(1.5),blob=await buildProjBlob();await projImportFile(new File([blob],'overlap.nvproj'));const after=pixels(1.5);return before.every((v,i)=>v===after[i])&&layout()[1].startAt===1;
}));
await page.evaluate(()=>{A.playhead=1.5;render();refreshProp();setTheme('dark');});
await page.screenshot({path:path.join(OUT,'overlap-dark.png')});
await page.evaluate(()=>setTheme('light'));await page.screenshot({path:path.join(OUT,'overlap-light.png')});
if(!BASE){
 const preview=await page.evaluate(()=>pixels(1.5));
 const [download]=await Promise.all([page.waitForEvent('download',{timeout:120000}),page.click('#btnExport')]);
 const file=path.join(OUT,'overlap-'+download.suggestedFilename());await download.saveAs(file);
 const decoded=await page.evaluate(async b64=>{
  const v=document.createElement('video'),url=URL.createObjectURL(new Blob([Uint8Array.from(atob(b64),c=>c.charCodeAt(0))]));v.muted=true;
  await new Promise((r,j)=>{v.onloadeddata=r;v.onerror=()=>j(new Error('decode failed'));v.src=url;});
  await new Promise(r=>{v.onseeked=r;v.currentTime=1.5;});
  const c=document.createElement('canvas');c.width=320;c.height=180;const x=c.getContext('2d');x.drawImage(v,0,0);const d=Array.from(x.getImageData(0,0,320,180).data);URL.revokeObjectURL(url);return d;
 },fs.readFileSync(file).toString('base64'));
 let error=0,n=0;for(let i=0;i<preview.length;i++)if(i%4!==3){error+=Math.abs(preview[i]-decoded[i]);n++;}
 check('實際匯出解碼與三軌重疊預覽一致',error/n<8,{meanAbsoluteError:error/n,file});
}
check('無頁面錯誤',errors.length===0,errors);
}catch(e){check('test execution',false,e.stack);}
finally{await browser.close();}
const result={passed:checks.filter(x=>x.ok).length,total:checks.length,checks,errors};
fs.writeFileSync(path.join(OUT,BASE?'baseline.json':'results.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify({passed:result.passed,total:result.total,failures:checks.filter(x=>!x.ok)},null,2));
process.exitCode=checks.some(x=>!x.ok)?1:0;
})();
