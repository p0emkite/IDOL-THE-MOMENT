import { chromium } from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const root='http://127.0.0.1:8765/';
await mkdir('qa',{recursive:true});
const report={when:new Date().toISOString(),checks:{},consoleErrors:[],screenshots:[]};
const browser=await chromium.launch({
  headless:true,
  args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist']
});
async function check(name,device){
  const context=await browser.newContext({viewport:device,deviceScaleFactor:1});
  const page=await context.newPage();
  page.on('pageerror',err=>report.consoleErrors.push(name+': '+err.message));
  page.on('console',msg=>{if(msg.type()==='error')report.consoleErrors.push(name+': '+msg.text())});
  await page.goto(root,{waitUntil:'domcontentloaded',timeout:30000});
  // Supabase session bootstrap can outlast DOMContentLoaded.
  // Never capture an authentication overlay as if it were the game lobby.
  const overlay=page.locator('#accountOverlay.active');
  await overlay.waitFor({state:'visible',timeout:35000});
  // The concert intro can keep the account panel animating in software WebGL.
  // Skip the cosmetic entrance before the actual guest-play interaction.
  await page.evaluate(()=>document.getElementById('concertIntroSkip')?.click());
  await page.locator('#guestPlay').click({force:true,timeout:15000});
  await overlay.waitFor({state:'hidden',timeout:15000});
  await page.waitForTimeout(4500);
  const stats=await page.evaluate(()=>{
    const scene=document.getElementById('threeCanvas'),fallback=document.getElementById('canvasFallback');
    const r=scene.getBoundingClientRect();
    return {webgl:scene.width>0&&fallback.hidden,canvas:[scene.width,scene.height],
      buttons:['drawOne','drawFive'].map(id=>{const b=document.getElementById(id);return {id,visible:b?.getBoundingClientRect().width>0,disabled:b?.disabled}}),
      soundPanel:!!document.getElementById('soundPanel'),
      soundDefault:{
        enabled:document.getElementById('soundMaster')?.checked,
        bgm:document.getElementById('bgmVolume')?.value,
        sfx:document.getElementById('sfxVolume')?.value,
        guestUploadHidden:document.getElementById('musicUploadLabel')?.hidden
      },
      viewport:[innerWidth,innerHeight],sceneRect:[Math.round(r.width),Math.round(r.height)]};
  });
  report.checks[name]=stats;
  const screenshot='qa/'+name+'-lobby.png';
  await page.screenshot({path:screenshot,fullPage:false});
  report.screenshots.push(screenshot);
  if(name==='desktop'){
    await page.locator('#audioToggle').click();
    const audioStats=await page.evaluate(()=>({
      visible:!document.getElementById('soundPanel').hidden,
      bgm:!!document.getElementById('bgmVolume'),sfx:!!document.getElementById('sfxVolume')
    }));
    report.checks.sound=audioStats;
    await page.locator('#audioToggle').click();
    await page.locator('#drawFive').click({timeout:12000});
    // Optional visual captures: software WebGL may take >30s to screenshot.
    // Functional result/reveal checks remain strict, but frames are diagnostic.
    const started=Date.now();
    for(const [at,path] of [[2250,'qa/desktop-foil-charge.png'],[3400,'qa/desktop-card-emerge.png']]){
      const remaining=at-(Date.now()-started);
      if(remaining>0)await page.waitForTimeout(remaining);
      if(Date.now()-started>4700)break;
      try{
        await page.screenshot({path,fullPage:false,timeout:6500,animations:'disabled'});
        report.screenshots.push(path);
      }catch(err){
        (report.captureWarnings??=[]).push(path+': '+String(err.message).split('\n')[0]);
      }
    }
    report.checks.afterPackClick=await page.evaluate(()=>({
      heading:document.getElementById('sceneHeading')?.textContent,
      buttonDisabled:document.getElementById('drawFive')?.disabled,
      cinematic:document.body.classList.contains('pack-cinematic'),
      overlay:document.getElementById('accountOverlay')?.className
    }));
    // Software WebGL runs much slower than native GPU hardware.
    // Poll on a timer rather than a requestAnimationFrame callback.
    try{
      await page.waitForFunction(()=>{
        const stage=document.getElementById('packRevealStage');
        return stage&&!stage.hidden&&document.querySelectorAll('#stageCardTrack .stage-card-button').length===5;
      },null,{timeout:40000,polling:300});
    }catch(error){
      report.checks.openTimeout=await page.evaluate(()=>({
        heading:document.getElementById('sceneHeading')?.textContent,
        bodyClasses:document.body.className,
        overlay:document.getElementById('accountOverlay')?.className,
        buttonDisabled:document.getElementById('drawFive')?.disabled,
        hint:document.getElementById('stageHint')?.textContent,
        count:document.querySelectorAll('#stageCardTrack .stage-card-button').length,
        toast:document.querySelector('[role="alert"]')?.textContent
      }));
      const stalled='qa/desktop-stalled.png';
      await page.screenshot({path:stalled,fullPage:false});
      report.screenshots.push(stalled);
      throw error;
    }
    report.checks.open=await page.evaluate(()=>({
      reveal:!document.getElementById('packRevealStage').hidden,
      actualCards:document.querySelectorAll('#stageCardTrack .stage-card-button').length
    }));
    const reveal='qa/desktop-reveal.png';
    await page.screenshot({path:reveal,fullPage:false});
    report.screenshots.push(reveal);
  }
  if(name==='landscape'){
    await page.locator('#drawFive').click({timeout:12000});
    await page.waitForFunction(()=>{
      const stage=document.getElementById('packRevealStage');
      return stage&&!stage.hidden&&document.querySelectorAll('#stageCardTrack .stage-card-button').length===5;
    },null,{timeout:40000,polling:300});
    const ur=page.locator('#stageCardTrack .stage-card-button.rarity-ur');
    await ur.scrollIntoViewIfNeeded();
    await ur.click({timeout:12000});
    await page.waitForFunction(()=>!document.getElementById('raritySplash').hidden,null,{timeout:13000});
    await page.waitForTimeout(1750);
    report.checks.landscapeUR=await page.evaluate(()=>{
      const splash=document.getElementById('raritySplash');
      const grade=document.getElementById('splashGrade');
      const name=document.getElementById('splashName');
      const box=el=>{const r=el.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height}};
      const g=box(grade),n=box(name);
      return {visible:!splash.hidden,grade:g,name:n,viewport:[innerWidth,innerHeight],
        gradeFullyVisible:g.left>=0&&g.top>=0&&g.bottom<=innerHeight&&g.right<=innerWidth,
        nameFullyVisible:n.left>=0&&n.top>=0&&n.bottom<=innerHeight&&n.right<=innerWidth};
    });
    const splashShot='qa/landscape-ur.png';
    await page.screenshot({path:splashShot,fullPage:false});
    report.screenshots.push(splashShot);
  }
  await context.close();
}

async function checkStudio(){
  // Test guest preview without any elevated session: no storage mutation.
  const context=await browser.newContext({viewport:{width:1360,height:900}});
  const page=await context.newPage();
  page.on('pageerror',err=>report.consoleErrors.push('studio: '+err.message));
  await page.goto(root+'studio.html',{waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForFunction(()=>{
    const canvas=document.querySelector('#previewCanvas');
    const ctx=canvas?.getContext('2d');
    return !!ctx&&ctx.getImageData(500,800,1,1).data[3]>0;
  },null,{timeout:15000});
  await page.locator('#cardName').fill('테스트 포토카드');
  await page.locator('#cardRarity').selectOption('UR');
  await page.evaluate(()=>{const el=document.querySelector('#photoZoom');el.value='135';el.dispatchEvent(new Event('input',{bubbles:true}))});
  report.checks.studio=await page.evaluate(async()=>{
    const canvas=document.querySelector('#previewCanvas');
    const client=window.IDOL_CONFIG;
    const configOk=!!client?.supabaseUrl&&!!client?.supabasePublishableKey;
    const api=async path=>{
      if(!configOk)return null;
      const r=await fetch(client.supabaseUrl+'/rest/v1/'+path,{
        headers:{apikey:client.supabasePublishableKey}
      });
      return {status:r.status,body:(await r.text()).slice(0,200)};
    };
    return {
      canvas:[canvas.width,canvas.height],
      grade:document.querySelector('#cardRarity').value,
      zoom:document.querySelector('#zoomLabel').textContent,
      saveLocked:document.querySelector('#saveCard').disabled,
      groupSaveLocked:document.querySelector('#saveGroup').disabled,
      packManagerCollapsed:!document.querySelector('.pack-section')?.open,
      packSaveLocked:document.getElementById('savePack')?.disabled,
      packControls:['packGroups','packSeries','packImage','packActive'].every(id=>!!document.getElementById(id)),
      groupsApi:await api('itm_groups?select=slug'),
      catalogApi:await api('itm_catalog?select=id')
    };
  });
  const shot='qa/desktop-card-studio.png';
  await page.screenshot({path:shot,fullPage:false,timeout:15000});
  report.screenshots.push(shot);
  await context.close();
}

async function checkFrameTemplates(){
  // Frame preview FIRST, before software WebGL consumes the Chromium render thread.
  const context=await browser.newContext({viewport:{width:1680,height:940}});
  const preview=await context.newPage();
  preview.on('pageerror',err=>report.consoleErrors.push('frame-preview: '+err.message));
  await preview.goto(root+'frame-preview.html',{waitUntil:'domcontentloaded',timeout:30000});
  await preview.waitForFunction(()=>document.querySelectorAll('#gallery figure img').length===5&&
    [...document.querySelectorAll('#gallery figure img')].every(x=>x.complete&&x.naturalWidth===1024),
    null,{timeout:15000});
  report.checks.frameTemplates=await preview.evaluate(()=>({
    count:document.querySelectorAll('#gallery figure').length,
    sizes:[...document.querySelectorAll('#gallery figure img')].map(x=>[x.naturalWidth,x.naturalHeight]),
    tiers:[...document.querySelectorAll('#gallery figcaption strong')].map(x=>x.textContent)
  }));
  const previewShot='qa/desktop-frame-templates.png';
  await preview.screenshot({path:previewShot,fullPage:false,timeout:15000});
  report.screenshots.push(previewShot);
  await context.close();
}

try{
 await checkStudio();
 await checkFrameTemplates();
 await check('desktop',{width:1680,height:940});
 await check('mobile',{width:390,height:844});
 await check('landscape',{width:844,height:390});
}finally{
 await browser.close();
 await writeFile('qa/visual-qa-result.json',JSON.stringify(report,null,2),'utf8');
 console.log('ITM_BROWSER_REPORT='+JSON.stringify(report));
}
if(report.consoleErrors.some(x=>/Uncaught|TypeError|ReferenceError|Failed to resolve module/i.test(x)))process.exitCode=1;
if(!report.checks.desktop?.webgl||!report.checks.mobile?.webgl)process.exitCode=1;
if(report.checks.frameTemplates?.count!==5||!report.checks.frameTemplates?.sizes.every(([w,h])=>w===1024&&h===1492))process.exitCode=1;
if(report.checks.studio?.grade!=='UR'||!report.checks.studio?.saveLocked||
 !report.checks.studio?.packManagerCollapsed||!report.checks.studio?.packSaveLocked||!report.checks.studio?.packControls||
 report.checks.studio?.groupsApi?.status!==200||report.checks.studio?.catalogApi?.status!==200)process.exitCode=1;
if(report.checks.desktop?.soundDefault?.enabled!==true||
 report.checks.desktop?.soundDefault?.bgm!=='50'||
 report.checks.desktop?.soundDefault?.sfx!=='50'||
 report.checks.desktop?.soundDefault?.guestUploadHidden!==true)process.exitCode=1;
if(!report.checks.open?.reveal||report.checks.open?.actualCards!==5)process.exitCode=1;
if(!report.checks.landscapeUR?.gradeFullyVisible||!report.checks.landscapeUR?.nameFullyVisible)process.exitCode=1;
