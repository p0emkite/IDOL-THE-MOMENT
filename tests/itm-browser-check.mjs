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
    report.checks.sound=await page.evaluate(()=>({
      visible:!document.getElementById('soundPanel').hidden,
      bgm:!!document.getElementById('bgmVolume'),
      sfx:!!document.getElementById('sfxVolume')
    }));
    await page.locator('#audioToggle').click();
  }
  // Paid-draw release: guest visual QA must verify access denial, not spend or
  // require a funded account. Authenticated cinematic QA needs a seeded fixture.
  if(name==='desktop'||name==='landscape'){
    await page.locator('#mailOpen').click();
    const inbox=await page.evaluate(()=>({
      visible:document.getElementById('mailOverlay').classList.contains('active'),
      guestNotice:document.getElementById('mailList').textContent.includes('ITM ID'),
      adminHidden:document.getElementById('mailAdminPanel').hidden
    }));
    await page.locator('#mailClose').click();
    await page.locator('#drawFive').click({timeout:12000});
    const draw=await page.evaluate(()=>({
      toast:document.getElementById('toast').textContent,
      revealing:!document.getElementById('packRevealStage').hidden,
      wallet:document.getElementById('walletBalance').textContent,
      prices:['drawOne','drawFive','drawEleven'].map(id=>document.getElementById(id).textContent)
    }));
    report.checks[name+'MomentAccess']={inbox,draw};
    if(!inbox.visible||!inbox.guestNotice||!inbox.adminHidden||
       !draw.toast.includes('ITM ID')||draw.revealing||
       !draw.prices[0].includes('100 M')||!draw.prices[1].includes('500 M')||!draw.prices[2].includes('1,000 M'))
      throw new Error('Guest M pricing/mailbox access regression');
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
  // Regression: checkbox is compact, while the series title has a real text column.
  await page.locator('.pack-section summary').click();
  await page.locator('#packGroups .choice-item').first().waitFor({state:'visible',timeout:15000});
  report.checks.packLayout=await page.evaluate(()=>{
    const rows=[...document.querySelectorAll('.pack-section .choice-item,.pack-section .check-row')];
    const series=document.querySelector('#packSeries'),groups=document.querySelector('#packGroups');
    return {
      choices:rows.length,
      maxCheckboxWidth:Math.max(...rows.map(x=>x.querySelector('input')?.getBoundingClientRect().width||0)),
      maxCheckboxHeight:Math.max(...rows.map(x=>x.querySelector('input')?.getBoundingClientRect().height||0)),
      minTextWidth:Math.min(...rows.filter(x=>x.querySelector('span')).map(x=>x.querySelector('span').getBoundingClientRect().width)),
      horizontalOverflow:[groups,series].some(el=>el.scrollWidth>el.clientWidth+2),
      seriesColumns:getComputedStyle(series).gridTemplateColumns
    };
  });
  const packShot='qa/desktop-pack-manager.png';
  await page.locator('.pack-section').screenshot({path:packShot,timeout:15000});
  report.screenshots.push(packShot);
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
  // Regression capture: bright source photos expose corner-mask smears that
  // cannot be seen against the dark empty-card preview.
  await preview.evaluate(async()=>{
    const {renderITMCard}=await import('./card-frame.js?v=ur-photo-window-20261105');
    const photo=document.createElement('canvas');
    photo.width=720;photo.height=1020;
    const p=photo.getContext('2d');
    const backdrop=p.createLinearGradient(0,0,720,1020);
    backdrop.addColorStop(0,'#fffafa');
    backdrop.addColorStop(.65,'#f3edf9');
    backdrop.addColorStop(1,'#f6deec');
    p.fillStyle=backdrop;p.fillRect(0,0,720,1020);
    for(const figure of document.querySelectorAll('#gallery figure')){
      const rarity=figure.querySelector('figcaption strong')?.textContent?.trim();
      const img=figure.querySelector('img');
      if(img&&rarity)img.src=renderITMCard({rarity,name:'QA'}, {photo}).toDataURL('image/png');
    }
  });
  await preview.waitForFunction(()=>[...document.querySelectorAll('#gallery figure img')]
    .every(img=>img.complete&&img.naturalWidth===1024),null,{timeout:10000});
  const brightShot='qa/desktop-frame-bright-photo.png';
  await preview.screenshot({path:brightShot,fullPage:false,timeout:15000});
  report.screenshots.push(brightShot);
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
if(report.checks.packLayout?.maxCheckboxWidth>24||
 report.checks.packLayout?.maxCheckboxHeight>24||
 report.checks.packLayout?.minTextWidth<70||
 report.checks.packLayout?.horizontalOverflow)process.exitCode=1;
if(report.checks.studio?.grade!=='UR'||!report.checks.studio?.saveLocked||
 !report.checks.studio?.packManagerCollapsed||!report.checks.studio?.packSaveLocked||!report.checks.studio?.packControls||
 report.checks.studio?.groupsApi?.status!==200||report.checks.studio?.catalogApi?.status!==200)process.exitCode=1;
if(report.checks.desktop?.soundDefault?.enabled!==true||
 report.checks.desktop?.soundDefault?.bgm!=='50'||
 report.checks.desktop?.soundDefault?.sfx!=='50'||
 report.checks.desktop?.soundDefault?.guestUploadHidden!==true)process.exitCode=1;
if(!report.checks.desktopMomentAccess?.inbox?.visible||
   report.checks.desktopMomentAccess?.draw?.revealing)process.exitCode=1;
if(!report.checks.landscapeMomentAccess?.inbox?.visible||
   report.checks.landscapeMomentAccess?.draw?.revealing)process.exitCode=1;
