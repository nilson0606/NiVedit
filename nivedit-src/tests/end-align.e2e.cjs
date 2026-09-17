const {chromium}=require('playwright'),fs=require('fs'),http=require('http'),path=require('path');
const HTML=process.env.NIVEDIT_HTML,CHROME=process.env.NIVEDIT_CHROME,FIX=process.env.NIVEDIT_FIX,OUT=path.dirname(HTML);
(async()=>{
const srv=http.createServer((q,r)=>{r.setHeader('Content-Type','text/html; charset=utf-8');fs.createReadStream(HTML).pipe(r)});
await new Promise(r=>srv.listen(0,'127.0.0.1',r));
const b=await chromium.launch({executablePath:CHROME}),p=await(await b.newContext({viewport:{width:1500,height:1050}})).newPage();
let count=0;const bad=[],errors=[],facts={};const chk=(name,v)=>{count++;if(!v)bad.push(name)};
p.on('pageerror',e=>errors.push(e.message));
try{
await p.goto('http://127.0.0.1:'+srv.address().port);
await p.waitForFunction(()=>typeof A!=='undefined');
chk('version',await p.textContent('#verTag')==='v11.8');
await p.setInputFiles('#fileAny',FIX+'/t300.webm');await p.waitForFunction(()=>A.clips.length===1&&A.clips[0].video.readyState>=2);
await p.setInputFiles('#fileImage',FIX+'/pic1.png');await p.waitForFunction(()=>A.clips.length===2);
await p.setInputFiles('#fileOverlay',FIX+'/pic1.png');await p.waitForFunction(()=>A.overlays.length===1);
await p.setInputFiles('#fileOverlay',path.resolve('assets/boy_smile_sway.gif'));await p.waitForFunction(()=>A.overlays.length===2);
await p.evaluate(()=>{setLang('zh');addTitle();window.target=(kind)=>kind==='video'?A.clips[0]:kind==='image'?A.clips[1]:kind==='png'?A.overlays[0]:kind==='gif'?A.overlays[1]:A.titles[0]});
for(const kind of ['video','image','png','gif','title']){
const id=['video','image'].includes(kind)?'c':kind==='title'?'t':'o';
await p.evaluate(kind=>{
const o=target(kind);o.kf=null;o.kfT=null;
A.sel={type:['video','image'].includes(kind)?'clip':kind==='title'?'title':'overlay',id:o.id};
const [a,z]=kfBounds(o);A.playhead=a+(z-a)*.8;render();refreshProp();
},kind);
chk(kind+' no end grid when disabled',await p.locator('#'+id+'Knine button').count()===0);
await p.click('#'+id+'Kf');
chk(kind+' nine end choices',await p.locator('#'+id+'Knine button').count()===9);
await p.evaluate(kind=>{
const o=target(kind);o.x=.32;o.y=.38;o.kfT=[.2,.7];
kfEnd(o,'x').e='linear';kfEnd(o,'y').e='out';
refreshProp();
window.beforeAlign=JSON.stringify({x:o.x,y:o.y,kfT:o.kfT,other:Object.fromEntries(Object.entries(o.kf).filter(([k])=>!['x','y'].includes(k)))});
},kind);
for(let n=0;n<9;n++){
await p.locator('#'+id+'Knine button').nth(n).click();
chk(kind+' end cell '+n,await p.evaluate(({kind,n,id})=>{
const o=target(kind),x=(kind==='title'?[.1,.5,.9]:[.12,.5,.88])[n%3],y=[.15,.5,.85][Math.floor(n/3)];
const [a,z]=kfBounds(o);
return kfEnd(o,'x').v===x&&kfEnd(o,'y').v===y&&+$('#'+id+'Kx').value===x&&+$('#'+id+'Ky').value===y
&& Math.abs(kfAt(o,'x',o.x,a+(z-a)*.8)-x)<1e-9 && Math.abs(kfAt(o,'y',o.y,a+(z-a)*.8)-y)<1e-9
&& kfEnd(o,'x').e==='linear'&&kfEnd(o,'y').e==='out'
&&beforeAlign===JSON.stringify({x:o.x,y:o.y,kfT:o.kfT,other:Object.fromEntries(Object.entries(o.kf).filter(([k])=>!['x','y'].includes(k)))});
},{kind,n,id}));
}
await p.click('#btnUndo');
chk(kind+' undo restores previous cell',await p.evaluate(kind=>kfEnd(target(kind),'x').v===.5,kind));
await p.click('#btnRedo');
chk(kind+' redo restores final cell',await p.evaluate(kind=>kfEnd(target(kind),'x').v===(kind==='title'?.9:.88),kind));
await p.locator('#'+id+'Knine button').nth(4).focus();await p.keyboard.press('Enter');
chk(kind+' keyboard center',await p.evaluate(kind=>kfEnd(target(kind),'x').v===.5&&kfEnd(target(kind),'y').v===.5,kind));
for(const theme of ['dark','light']){
await p.evaluate(theme=>setTheme(theme),theme);
chk(kind+' '+theme+' purple row',await p.evaluate(id=>{
const row=$('#'+id+'Knine').closest('.row'),end=$('#'+id+'Kx').closest('.row');
return row.dataset.kfRole==='end'&&getComputedStyle(row).backgroundColor===getComputedStyle(end).backgroundColor;
},id));
if(kind==='title'){await p.locator('#'+id+'Knine').scrollIntoViewIfNeeded();await p.locator('#right').screenshot({path:path.join(OUT,'end-align-'+theme+'.png')})}
}
await p.evaluate(()=>setLang('en'));await p.waitForTimeout(120);
chk(kind+' translated label',await p.locator('#'+id+'Knine').evaluate(el=>el.closest('.row').querySelector('label').textContent==='Quick align (end)'));
await p.evaluate(()=>setLang('zh'));
}
// Measure real pixels at the end of a shortened motion window, and paused preview repaint.
await p.evaluate(()=>{
A.titles=[];A.overlays=A.overlays.slice(0,1);const o=A.overlays[0];
Object.assign(o,{start:0,end:4,x:.2,y:.5,scale:.15,opacity:1,rot:0,fadeIn:0,fadeOut:0,kf:{},kfT:[.2,.7]});
kfSetEnd(o,'x',.2,'linear');kfSetEnd(o,'y',.5,'linear');
A.sel={type:'overlay',id:o.id};seekTo(3);render();refreshProp();
window.centroid=()=>{
const cv=document.createElement('canvas');cv.width=320;cv.height=180;const cx=cv.getContext('2d');
renderFrame(cx,3,320,180);const fg=cx.getImageData(0,0,320,180).data;
const keep=A.overlays;A.overlays=[];renderFrame(cx,3,320,180);const bg=cx.getImageData(0,0,320,180).data;A.overlays=keep;
let sx=0,sy=0,n=0;for(let y=0;y<180;y++)for(let x=0;x<320;x++){const i=(y*320+x)*4;if(Math.abs(fg[i]-bg[i])+Math.abs(fg[i+1]-bg[i+1])+Math.abs(fg[i+2]-bg[i+2])>40){sx+=x;sy+=y;n++}}
return {x:sx/n/320,y:sy/n/180,n}
};
});
await p.waitForTimeout(300);
const before=await p.evaluate(()=>({centroid:centroid(),preview:$('#preview').toDataURL(),time:A.playhead}));
await p.locator('#oKnine button').nth(5).click();await p.waitForTimeout(350);
const after=await p.evaluate(()=>({centroid:centroid(),preview:$('#preview').toDataURL(),time:A.playhead}));
facts.pixels={before:before.centroid,after:after.centroid};
chk('actual endpoint pixels move right',after.centroid.n>20&&after.centroid.x-before.centroid.x>.55&&Math.abs(after.centroid.y-.5)<.1);
chk('paused preview redraws without moving playhead',before.preview!==after.preview&&before.time===after.time);
const persisted=await p.evaluate(async()=>{
const old=JSON.stringify(A.overlays[0].kf),start=A.overlays[0].x,win=JSON.stringify(A.overlays[0].kfT);
const blob=await buildProjBlob();await projImportFile(new File([blob],'end-align.nvproj'));
return JSON.stringify(A.overlays[0].kf)===old&&A.overlays[0].x===start&&JSON.stringify(A.overlays[0].kfT)===win;
});
chk('nvproj keeps aligned endpoint and start/window',persisted);
chk('no page errors',errors.length===0);
fs.writeFileSync(path.join(OUT,'end-align-results.json'),JSON.stringify({count,bad,errors,facts},null,2));
console.log('end-align: '+(count-bad.length)+' / '+count);if(bad.length){console.log(bad);process.exitCode=1}
}finally{await b.close();await new Promise(r=>srv.close(r))}
})().catch(e=>{console.error(e);process.exit(1)});
