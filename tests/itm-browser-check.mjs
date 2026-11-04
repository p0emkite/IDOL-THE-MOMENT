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
  await page.locator('#guestPlay').click({timeout:15000});
  await overlay.waitFor({state:'hidden',timeout:15000});
  await page.waitForTimeout(4500);
  const stats=await page.evaluate(()=>{
    const scene=document.getElementById('threeCanvas'),fallback=document.getElementById('canvasFallback');
    const r=scene.getBoundingClientRect();
    return {webgl:scene.width>0&&fallback.hidden,canvas:[scene.width,scene.height],
      buttons:['drawOne','drawFive'].map(id=>{const b=document.getElementById(id);return {id,visible:b?.getBoundingClientRect().width>0,disabled:b?.disabled}}),
      soundPanel:!!document.getElementById('soundPanel'),
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
    // A GPU-heavy arena can delay rendering slightly; verify the actual result,
    // not whether it had appeared at an arbitrary 5.8 second mark.
    await page.waitForFunction(()=>{
      const stage=document.getElementById('packRevealStage');
      return stage&&!stage.hidden&&document.querySelectorAll('#stageCardTrack .stage-card-button').length===5;
    },null,{timeout:22000});
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
    },null,{timeout:22000});
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
try{
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
if(!report.checks.open?.reveal||report.checks.open?.actualCards!==5)process.exitCode=1;
if(!report.checks.landscapeUR?.gradeFullyVisible||!report.checks.landscapeUR?.nameFullyVisible)process.exitCode=1;
