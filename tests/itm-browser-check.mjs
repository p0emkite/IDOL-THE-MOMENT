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
        guestUploadHidden:!document.getElementById('musicUploadLabel')||document.getElementById('musicUploadLabel').hidden
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
  // Guest mode now has a fully local wallet, mailbox, profile and achievements.
  if(name==='desktop'||name==='landscape'){
    await page.locator('#mailOpen').click();
    const inbox=await page.evaluate(()=>({
      visible:document.getElementById('mailOverlay').classList.contains('active'),
      welcome:document.getElementById('mailList').textContent.includes('환영합니다'),
      adminHidden:document.getElementById('mailAdminPanel').hidden
    }));
    const welcomeBefore=await page.evaluate(()=>JSON.parse(localStorage.getItem('itm-guest-save-v2')).balance);
    await page.locator('#mailList summary').first().click();
    await page.locator('#mailList .itm-mail-claim').first().click();
    // Attendance + daily mission credits precede the historical 5,000 M welcome mail.
    await page.waitForFunction(before=>JSON.parse(localStorage.getItem('itm-guest-save-v2')).balance>=before+5000,
      welcomeBefore,{timeout:20000,polling:250});
    await page.locator('#mailClose').click();
    report.checks[name+'GuestInbox']={...inbox,balance:await page.locator('#walletBalance').textContent()};
    if(!inbox.visible||!inbox.welcome||!inbox.adminHidden)
      throw Error('Guest mailbox regression');
  }
  if(name==='desktop'){
    await page.locator('#taskOpen').click();
    await page.locator('#taskContent .itm-journey-day').first().waitFor({state:'attached',timeout:20000});
    const daily=await page.locator('#taskContent').textContent();
    const dayTickets=await page.evaluate(()=>{
      const save=JSON.parse(localStorage.getItem('itm-guest-save-v2'));
      return {checkins:save.journey?.checkins?.length||0,freeOne:Number(save.journey?.tickets?.['1']||0)};
    });
    const open=await page.locator('#taskOverlay').evaluate(el=>el.classList.contains('active'));
    await page.locator('#taskTabWeekly').click();
    const weekly=await page.locator('#taskContent').textContent();
    await page.locator('#taskTabAchievements').click();
    const achievements=await page.locator('#taskContent').textContent();
    await page.locator('#taskClose').click();
    await page.locator('#loginButton').click();
    await page.waitForFunction(()=>!document.getElementById('profileHub').hidden,null,{timeout:20000});
    const guestProfile=await page.evaluate(()=>({
      profileVisible:!document.getElementById('accountProfile').hidden,
      nicknameHidden:document.getElementById('nicknameForm').hidden,
      switchAllowed:!document.getElementById('guestSignIn').hidden,
      circular:getComputedStyle(document.getElementById('profileAvatar')).borderRadius==='50%',
      cropExists:!!document.getElementById('avatarCropViewport'),
      levelUpExists:!!document.getElementById('levelUpOverlay'),
      titlePickerExists:!!document.getElementById('profileJourneyTitleSelect')
    }));
    await page.locator('details:has(#profileCardChoices) > summary').click();
    await page.locator('#profileCardChoices button').first().click();
    const cropVisible=await page.locator('#avatarCropOverlay').evaluate(el=>!el.hidden);
    await page.evaluate(()=>{const el=document.getElementById('avatarCropZoom');el.value='1.35';el.dispatchEvent(new Event('input',{bubbles:true}))});
    const cropZoom=await page.locator('#avatarCropZoomLabel').textContent();
    await page.locator('#avatarCropCancel').click();
    await page.locator('#guestSignIn').click();
    await page.locator('#accountTabSignup').click();
    const signup=await page.evaluate(()=>({
      nicknameVisible:!document.getElementById('accountNickname').hidden,
      nicknameRequired:document.getElementById('accountNickname').required,
      accountIdSeparate:document.getElementById('accountUsername')!==document.getElementById('accountNickname')
    }));
    await page.locator('#accountClose').click();
    report.checks.desktopProfileMissionUI={open,dailyActive:daily.includes('오늘의 방문'),
      weeklyActive:weekly.includes('꾸준한 방문자'),
      achievementActive:achievements.includes('수집 여정')&&achievements.includes('기존 컬렉션 완성 업적'),
      dayTickets,guestProfile,cropVisible,cropZoom,signup};
    if(!open||!report.checks.desktopProfileMissionUI.dailyActive||
       !report.checks.desktopProfileMissionUI.weeklyActive||
       !report.checks.desktopProfileMissionUI.achievementActive||
       dayTickets.checkins!==1||dayTickets.freeOne!==1||
       !guestProfile.profileVisible||!guestProfile.nicknameHidden||!guestProfile.switchAllowed||
       !guestProfile.circular||!guestProfile.cropExists||!guestProfile.levelUpExists||
       !guestProfile.titlePickerExists||!cropVisible||cropZoom!=='135%'||
       !signup.nicknameVisible||!signup.nicknameRequired||!signup.accountIdSeparate)
      throw Error('Guest missions/free tickets/profile regression');

    // Progressive archive: group only at first; series and members appear on demand.
    await page.locator('#collectionOpen').click();
    const groupRow=page.locator('#collectionGrid > details.collection-accordion.level-group').first();
    await groupRow.waitFor({state:'attached',timeout:25000});
    const collapsed=await page.locator('#collectionGrid').evaluate(el=>({
      groupCount:el.querySelectorAll(':scope > details.level-group').length,
      rootSeries:el.querySelectorAll(':scope > details.level-series').length,
      rootMembers:el.querySelectorAll(':scope > details.level-member').length
    }));
    await groupRow.locator(':scope > summary').click();
    const seriesRow=groupRow.locator('.collection-accordion-children > details.level-series').first();
    await seriesRow.waitFor({state:'attached',timeout:12000});
    await seriesRow.locator(':scope > summary').click();
    const memberRow=seriesRow.locator('.collection-accordion-children > details.level-member').first();
    await memberRow.waitFor({state:'attached',timeout:12000});
    await memberRow.locator(':scope > summary').click();
    const cardShelf=memberRow.locator('.collection-card-shelf');
    await cardShelf.waitFor({state:'attached',timeout:12000});
    report.checks.nestedArchive={...collapsed,seriesCount:await groupRow.locator('details.level-series').count(),
      memberCount:await seriesRow.locator('details.level-member').count(),
      cardCount:await cardShelf.locator('button, img').count()};
    await page.locator('#collectionClose').click();
    if(collapsed.groupCount<1||collapsed.rootSeries||collapsed.rootMembers||
       report.checks.nestedArchive.seriesCount<1||report.checks.nestedArchive.memberCount<1)
       throw Error('Collection archive must progressively reveal group → collection → members');

    report.checks.pullButtonFit=await page.evaluate(()=>['drawOne','drawFive','drawEleven'].map(id=>{
      const button=document.getElementById(id),name=button.querySelector('.itm-draw-name'),
        price=button.querySelector('.itm-draw-price');
      const outer=button.getBoundingClientRect(),upper=name.getBoundingClientRect(),
        lower=price.getBoundingClientRect();
      return {id,fit:upper.left>=outer.left-2&&upper.right<=outer.right+2&&
        lower.left>=outer.left-2&&lower.right<=outer.right+2&&upper.bottom<=lower.top+1};
    }));
    if(report.checks.pullButtonFit.some(b=>!b.fit))throw Error('Draw button labels overflow');

    // Paid guest pack: a real inventory increment, mission progress and XP,
    // without assuming old fixed wallet balances after attendance and rewards.
    const beforeDraw=await page.evaluate(()=>{
      const save=JSON.parse(localStorage.getItem('itm-guest-save-v2'));
      const inventory=JSON.parse(localStorage.getItem('itm-live-card-inventory-v1')||'{}');
      return {balance:save.balance,cardCount:Object.values(inventory).reduce((n,v)=>n+Number(v||0),0)};
    });
    await page.locator('#drawOne').click({timeout:12000});
    await page.waitForFunction(before=>{
      const raw=localStorage.getItem('itm-guest-save-v2');
      const inventory=JSON.parse(localStorage.getItem('itm-live-card-inventory-v1')||'{}');
      const count=Object.values(inventory).reduce((n,v)=>n+Number(v||0),0);
      return raw&&count>before;
    },beforeDraw.cardCount,{timeout:30000,polling:250});
    report.checks.guestDraw=await page.evaluate(()=>{
      const save=JSON.parse(localStorage.getItem('itm-guest-save-v2'));
      const cards=JSON.parse(localStorage.getItem('itm-live-card-inventory-v1')||'{}');
      return {balance:save.balance,experience:save.profile.experience,
        ownedCount:Object.values(cards).reduce((n,v)=>n+Number(v||0),0),
        drawTracked:save.journey?.events?.some(x=>x.kind==='draw'),
        prices:['drawOne','drawFive','drawEleven'].map(id=>document.getElementById(id).textContent),
        twoLines:document.getElementById('drawOne').children.length===2};
    });
    if(beforeDraw.balance<100||report.checks.guestDraw.ownedCount<=beforeDraw.cardCount||
       !report.checks.guestDraw.experience||!report.checks.guestDraw.drawTracked||
       !report.checks.guestDraw.twoLines)
      throw Error('Guest paid pack / inventory / XP regression');

  }
  if(name==='mobile'){
    await page.locator('#taskOpen').click();
    await page.locator('#taskContent .itm-journey-ticket').first().waitFor({state:'attached',timeout:15000});
    report.checks.mobileJourney=await page.evaluate(()=>{
      const dialog=document.querySelector('#taskOverlay .itm-progress-modal');
      const ticket=document.querySelector('.itm-journey-ticket-grid');
      const inner=document.getElementById('taskContent');
      return {dialogFits:dialog.getBoundingClientRect().right<=innerWidth+2,
        contentFits:inner.scrollWidth<=inner.clientWidth+3,
        ticketVisible:!!ticket&&ticket.getBoundingClientRect().width>0};
    });
    await page.screenshot({path:'qa/mobile-missions.png',fullPage:false});
    report.screenshots.push('qa/mobile-missions.png');
    if(!report.checks.mobileJourney.dialogFits||!report.checks.mobileJourney.contentFits||
      !report.checks.mobileJourney.ticketVisible)throw Error('Mobile mission layout overflow');
    await page.locator('#taskClose').click();
  }
  await context.close();
}

async function checkFreeTicket(){
  // Independent guest session: verify daily ticket and a real no-M-charge pack.
  const context=await browser.newContext({viewport:{width:1280,height:800},deviceScaleFactor:1});
  const page=await context.newPage();
  page.on('pageerror',err=>report.consoleErrors.push('free-ticket: '+err.message));
  await page.goto(root,{waitUntil:'domcontentloaded',timeout:30000});
  await page.locator('#accountOverlay.active').waitFor({state:'visible',timeout:35000});
  await page.evaluate(()=>document.getElementById('concertIntroSkip')?.click());
  await page.locator('#guestPlay').click({force:true,timeout:15000});
  await page.locator('#accountOverlay.active').waitFor({state:'hidden',timeout:15000});
  await page.locator('#taskOpen').click();
  const ticket=page.locator('.itm-journey-ticket').first();
  await ticket.waitFor({state:'visible',timeout:25000});
  const before=await page.evaluate(()=>{
    const save=JSON.parse(localStorage.getItem('itm-guest-save-v2'));
    const cards=JSON.parse(localStorage.getItem('itm-live-card-inventory-v1')||'{}');
    return {balance:save.balance,tickets:Number(save.journey?.tickets?.['1']||0),
      count:Object.values(cards).reduce((n,v)=>n+Number(v||0),0)};
  });
  await page.screenshot({path:'qa/desktop-free-ticket.png',fullPage:false});
  report.screenshots.push('qa/desktop-free-ticket.png');
  if(before.tickets!==1)throw Error('Initial free single-card ticket was not awarded');
  await ticket.locator('button').click();
  await page.waitForFunction(count=>{
    const cards=JSON.parse(localStorage.getItem('itm-live-card-inventory-v1')||'{}');
    return Object.values(cards).reduce((n,v)=>n+Number(v||0),0)>count;
  },before.count,{timeout:30000,polling:250});
  const after=await page.evaluate(()=>{
    const save=JSON.parse(localStorage.getItem('itm-guest-save-v2'));
    const cards=JSON.parse(localStorage.getItem('itm-live-card-inventory-v1')||'{}');
    return {balance:save.balance,tickets:Number(save.journey?.tickets?.['1']||0),
      count:Object.values(cards).reduce((n,v)=>n+Number(v||0),0),
      drawTracked:save.journey?.events?.some(x=>x.kind==='draw')};
  });
  report.checks.freeTicket={before,after};
  if(after.tickets!==0||after.count!==before.count+1||
     after.balance<before.balance||!after.drawTracked)
    throw Error('Free ticket pack did not grant a card without spending M');
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
      celebrations:{
        exists:['eventForm','eventPicker','eventGreeting','eventReward','eventImage','frameForm','frameCollection','frameImage'].every(id=>!!document.getElementById(id)),
        eventSaveLocked:document.getElementById('eventSave')?.disabled,
        frameSaveLocked:document.getElementById('frameSave')?.disabled,
        defaultGift:document.getElementById('eventReward')?.value
      },
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
 await checkFreeTicket();
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
if(!report.checks.studio?.celebrations?.exists||
 !report.checks.studio?.celebrations?.eventSaveLocked||
 !report.checks.studio?.celebrations?.frameSaveLocked||
 report.checks.studio?.celebrations?.defaultGift!=='1000')process.exitCode=1;
if(!report.checks.desktopProfileMissionUI?.signup?.nicknameVisible)process.exitCode=1;
if(report.checks.desktop?.soundDefault?.enabled!==true||
 report.checks.desktop?.soundDefault?.bgm!=='50'||
 report.checks.desktop?.soundDefault?.sfx!=='50'||
 report.checks.desktop?.soundDefault?.guestUploadHidden!==true)process.exitCode=1;
if(!report.checks.desktopGuestInbox?.visible||!report.checks.landscapeGuestInbox?.visible)process.exitCode=1;
if(!report.checks.guestDraw?.ownedCount||!report.checks.desktopProfileMissionUI?.cropVisible)process.exitCode=1;
if(report.checks.freeTicket?.after?.tickets!==0||!report.checks.freeTicket?.after?.drawTracked)process.exitCode=1;
