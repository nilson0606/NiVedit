const {chromium}=require('playwright'),fs=require('fs'),path=require('path');
(async()=>{
 const b=await chromium.launch({executablePath:process.env.NIVEDIT_CHROME,args:['--disable-gpu','--disable-accelerated-video-decode']});
 const p=await b.newPage({viewport:{width:1450,height:1050},acceptDownloads:true});
 const errors=[],failures=[];let count=0;const check=(n,v)=>{count++;if(!v)failures.push(n)};
 p.on('pageerror',e=>errors.push(e.message));
 try{
 await p.addInitScript(()=>localStorage.setItem('nv.lang','zh'));
 await p.goto('file:///'+process.env.NIVEDIT_HTML.replace(/\\/g,'/'));
 await p.click('#btnCompat');
 await p.setInputFiles('#compatFile',path.join(__dirname,'fixtures/compat-hdr.mp4'));
 await p.selectOption('#compatSize','1080');await p.click('#compatRun');
 await p.waitForFunction(()=>!COMPAT.busy,null,{timeout:90000});
 check('silent portrait HDR converted',await p.evaluate(()=>!!COMPAT.result));
 check('HDR disclosure',(await p.textContent('#compatStatus')).includes('HDR 已轉為 SDR'));
 check('external file has no apply button',await p.locator('#compatApply').isHidden());
 const [dl]=await Promise.all([p.waitForEvent('download'),p.click('#compatDownload')]);
 await dl.saveAs(path.join(process.env.NIVEDIT_COMPAT_OUT,'hdr-sdr.mp4'));
 // Large input guard: a Blob composed of repeated chunks requires little test memory.
 await p.evaluate(()=>{selectCompatSource(null,new File(Array(513).fill(new Uint8Array(1024*1024)),'large.mp4',{type:'video/mp4'}))});
 await p.click('#compatRun');
 check('large input actionable limit',(await p.textContent('#compatStatus')).includes('512 MB'));
 check('large input starts no worker',await p.evaluate(()=>!COMPAT.busy&&!COMPAT.worker));
 await p.click('#compatClose');
 // Manual opens a separate page, does not replace editor.
 const appURL=p.url();
 const popup=p.waitForEvent('popup');await p.click('#btnManual');const manual=await popup;await manual.waitForLoadState();
 manual.on('pageerror',e=>errors.push(e.message));
 check('manual in new tab',p.url()===appURL&&manual.url().endsWith('manual.html'));
 check('manual no opener',await manual.evaluate(()=>!window.opener));
 check('16 left chapters',await manual.locator('aside .chapter-link').count()===16);
 check('home visible on entry',await manual.locator('#home').isVisible());
 await manual.click('aside a[href="#compatibility"]');
 await manual.waitForFunction(()=>!document.querySelector('#compatibility').hidden);
 check('only chosen chapter visible',await manual.locator('.chapter:visible').count()===1&&await manual.locator('#home').isHidden());
 check('chapter hash',manual.url().endsWith('#compatibility'));
 check('chapter header near top',await manual.locator('#compatibility h2').evaluate(e=>{const y=e.getBoundingClientRect().top;return y>=0&&y<350}));
 check('left TOC remains',await manual.locator('aside').isVisible());
 await manual.click('aside a[href="#home"]');
 await manual.locator('#home').waitFor({state:'visible'});
 check('home returns',await manual.locator('#home').isVisible());
 await manual.locator('#search').fill('相容');
 check('chapter search narrows list',await manual.locator('aside .chapter-link:visible').count()<16);
 await manual.locator('#clearSearch').click();
 await manual.click('aside a[href="#compatibility"]');
 await manual.screenshot({path:path.join(process.env.NIVEDIT_COMPAT_OUT,'manual-dark.png')});
 await manual.click('#theme');await manual.waitForTimeout(200);
 await manual.screenshot({path:path.join(process.env.NIVEDIT_COMPAT_OUT,'manual-light.png')});
 await manual.emulateMedia({media:'print'});
 check('print includes all chapters',await manual.locator('.chapter:visible').count()===16);
 await manual.close();
 check('editor still usable',await p.locator('#btnCompat').isVisible()&&await p.evaluate(()=>!A.exporting));
 check('no JS errors',errors.length===0);
 }finally{await b.close();const r={count,passed:count-failures.length,failures,errors};fs.writeFileSync(path.join(process.env.NIVEDIT_COMPAT_OUT,'extras-results.json'),JSON.stringify(r,null,2));console.log(JSON.stringify(r,null,2));if(failures.length)process.exitCode=1}
})().catch(e=>{console.error(e);process.exit(1)});
