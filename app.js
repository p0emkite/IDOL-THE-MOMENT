import {mountAudioPanel} from './audio-manager.js?v=pack-studio-20261105';
import {createOpeningEffects} from './opening-effects.js';
import {renderITMCard} from './card-frame.js?v=ur-photo-window-20261105';
/* ITM — IDOL : THE MOMENT | Standalone, fan-made 3D prototype
   3D library is loaded from a pinned public ESM CDN; there is no build step.
   Offline demo cards are mock identities and stored only in localStorage.
   Once Supabase is configured, the server is the sole authority for pack results. */
const $ = (id) => document.getElementById(id);
const CONFIG = window.IDOL_CONFIG || {};
// Official ITM branding: assets are optional until both PNG files are uploaded.
const brandLogo = new Image();
const brandCardBack = new Image();
brandLogo.decoding = brandCardBack.decoding = 'async';
brandLogo.src = './assets/itm-logo.png';
brandCardBack.src = './assets/itm-card-back.png';
function loaded(img){return img.complete && img.naturalWidth > 0;}
brandLogo.addEventListener('load', () => {
  if (THREE && renderer && pack) {
    const old = packTexture;
    packTexture = texture(makePackTexture());
    pack.material[4].map = pack.material[5].map = packTexture;
    pack.material[4].needsUpdate = pack.material[5].needsUpdate = true;
    old?.dispose();
  }
});
brandCardBack.addEventListener('load', () => {
  if (THREE && renderer && backTexture) {
    const old = backTexture;
    backTexture = texture(brandCardBack);
    for (const mesh of cardMeshes) {
      mesh.material[5].map = backTexture;
      mesh.material[5].needsUpdate = true;
    }
    // The card briefly rising out of the opened pack must use this exact
    // official back asset too, even when the PNG loads after WebGL startup.
    if (openingCard) {
      for (const face of [4,5]) {
        openingCard.material[face].map = backTexture;
        openingCard.material[face].needsUpdate = true;
      }
    }
    old?.dispose();
  }
  if (!state.three && state.phase === 'reveal') renderFallbackCards();
});
const POOL = [
  ['itm-demo-n','ARIA','LUMINA','N','#b6d0e9',.14],
  ['itm-demo-r','MIU','NOVUS','R','#8cd9f5',.34],
  ['itm-demo-sr','NOVA','PRISM','SR','#c0a1fc',.62],
  ['itm-demo-ssr','LYRA','SOLAR','SSR','#f7d58f',.43],
  ['itm-demo-ur','VEGA','AURORA','UR','#ff9edc',.74],
].map(([id,name,group,rarity,tint,seed]) => ({id,name,group,rarity,tint,seed,edition:'DEBUT COLLECTION',image_url:null}));
const byId = new Map(POOL.map(c=>[c.id,c]));
const LIVE_POOL=[];
const AVAILABLE_PACKS=[];
let LIVE_READY=false;
const loadedArtwork=new Map();
const artworkPromises=new Map();
function readLiveInventory(){try{return JSON.parse(localStorage.getItem('itm-live-card-inventory-v1')||'{}')||{}}catch{return {}}}
function writeLiveInventory(){try{localStorage.setItem('itm-live-card-inventory-v1',JSON.stringify(state.liveInventory))}catch{}}
function assetUrl(path){return path?state.supabase.storage.from('itm-card-media').getPublicUrl(path).data.publicUrl:null}
function selectedPack(){return AVAILABLE_PACKS.find(p=>p.id===$('packPicker')?.value)||null}
function packCardAllowed(c,p){
  if(!p)return true;
  const groups=p.group_slugs||[],series=p.series_filters||[];
  return (!groups.length||groups.includes(c.group_slug))&&(!series.length||series.some(f=>f.group_slug===c.group_slug&&f.name===c.edition));
}
async function syncPackArtwork(){
  const id=$('packPicker')?.value,chosen=selectedPack();
  if(!pack||!renderer)return;
  try{
    const img=chosen?.image_path?await ensureImage(assetUrl(chosen.image_path)):makePackTexture();
    if($('packPicker')?.value!==id||!pack)return;
    const old=packTexture;packTexture=texture(img);
    for(const k of [4,5]){pack.material[k].map=packTexture;pack.material[k].needsUpdate=true}
    if(old!==packTexture)old?.dispose();
  }catch(err){console.warn('Pack image unavailable',err)}
}
async function ensureImage(url){
  if(!url)return null;
  if(loadedArtwork.has(url))return loadedArtwork.get(url);
  if(artworkPromises.has(url))return artworkPromises.get(url);
  const promise=new Promise((resolve,reject)=>{
    const img=new Image();img.decoding='async';img.crossOrigin='anonymous';
    img.onload=()=>{loadedArtwork.set(url,img);resolve(img)};
    img.onerror=()=>reject(new Error('이미지를 불러오지 못했습니다: '+url.split('/').pop()));
    img.src=url;
  });
  artworkPromises.set(url,promise);
  try{return await promise}finally{artworkPromises.delete(url)}
}
async function preloadCard(card){
  if(!card?.isLive)return;
  await Promise.all([ensureImage(card.image_url),ensureImage(card.group_logo_url)]);
}
function drawLiveLocal(count,packRule=null){
  const eligible=LIVE_POOL.filter(c=>packCardAllowed(c,packRule));
  if(!eligible.length)throw Error('선택한 팩에 공개된 카드가 없습니다.');
  const allowedTiers=TIERS.filter(t=>eligible.some(c=>c.rarity===t.key));
  const total=allowedTiers.reduce((sum,t)=>sum+t.chance,0);
  return Array.from({length:count},()=>{
    let roll=rand()*total,key=allowedTiers[0].key;
    for(const tier of allowedTiers){if(roll<tier.chance){key=tier.key;break}roll-=tier.chance}
    const matches=eligible.filter(c=>c.rarity===key);
    return matches[Math.floor(rand()*matches.length)];
  });
}
async function loadPublishedCatalog(){
  if(!state.supabase)return false;
  const [groupsResult,cardsResult,packsResult]=await Promise.all([
    state.supabase.from('itm_groups').select('slug,name,logo_path'),
    state.supabase.from('itm_catalog').select('id,group_slug,display_name,edition,rarity,photo_path,full_art_path,photo_scale,photo_x,photo_y,logo_scale,status').eq('status','published'),
    state.supabase.from('itm_packs').select('id,name,image_path,group_slugs,series_filters,active').eq('active',true).order('created_at')
  ]);
  if(groupsResult.error||cardsResult.error||packsResult.error)throw(groupsResult.error||cardsResult.error||packsResult.error);
  const previous=$('packPicker')?.value||'';
  AVAILABLE_PACKS.splice(0,AVAILABLE_PACKS.length,...(packsResult.data||[]));
  const picker=$('packPicker');
  picker.replaceChildren(new Option('기본 카드팩',''),...AVAILABLE_PACKS.map(p=>new Option(p.name,p.id)));
  picker.value=AVAILABLE_PACKS.some(p=>p.id===previous)?previous:'';
  $('packChoice').hidden=!AVAILABLE_PACKS.length;
  if(picker.value!==previous)void syncPackArtwork();
  const groupMap=new Map((groupsResult.data||[]).map(g=>[g.slug,g]));
  for(const card of LIVE_POOL)byId.delete(card.id);
  LIVE_POOL.length=0;
  for(const row of (cardsResult.data||[])){
    const group=groupMap.get(row.group_slug);
    const card={
      id:row.id,name:row.display_name,group:group?.name||row.group_slug,
      group_slug:row.group_slug,rarity:row.rarity,
      edition:row.edition,isLive:true,logo_scale:Number(row.logo_scale??1),
      image_url:assetUrl(row.photo_path),
      group_logo_url:assetUrl(group?.logo_path),
      full_art_url:assetUrl(row.full_art_path),
      photo_transform:{scale:Number(row.photo_scale),x:Number(row.photo_x),y:Number(row.photo_y)}
    };
    LIVE_POOL.push(card);byId.set(card.id,card);
  }
  LIVE_READY=TIERS.every(t=>LIVE_POOL.some(c=>c.rarity===t.key));
  if($('oddsDescription'))$('oddsDescription').textContent=LIVE_READY?
    '실제 카드 팩: 1회·5회 모두 매 카드 독립 추첨이며 아래 확률을 적용합니다. 등급별 공개 카드 중 무작위 선정됩니다.':
    '테스트 카드팩: 1회는 아래 확률, 5회는 각 등급 1장씩 확정 등장합니다.';
  if($('stageFooterNote')){
    $('stageFooterNote').textContent=LIVE_READY?
      '✦ THE MOMENT COLLECTION · 공개 카드가 팩과 도감에 실시간 반영됩니다.':
      '✦ FIRST SHOWCASE / TEST PACK · 실제 카드는 N~UR 각 등급 공개 후 팩에 등장합니다.';
  }
  return LIVE_READY;
}
// Shared grade palette: every tier has a gradient, with intense rainbow holography for UR.
// Odds are unchanged. The same palette powers Canvas, 3D card edges and CSS UI.
const TIERS = [
  {key:'N', label:'N · Normal',chance:55,color:'#929BA8',gradient:['#DDE3EA','#A9B3BF','#929BA8','#687585']},
  {key:'R', label:'R · Rare',chance:28,color:'#2588E8',gradient:['#82D2FF','#2588E8','#1655BE']},
  {key:'SR',label:'SR · Super Rare',chance:12,color:'#A35DDE',gradient:['#DBABFF','#A35DDE','#7039C1']},
  {key:'SSR',label:'SSR · Special Super Rare',chance:4,color:'#FFCE46',gradient:['#FFF2AB','#FFCE46','#D99212']},
  {key:'UR',label:'UR · Ultra Rare',chance:1,color:'#FF75D2',
   gradient:['#54ECFF','#4F9BFF','#9974FF','#F46BE6','#FF83A1','#FFE26A','#71FFC4','#54ECFF']},
];
const PACK_OPEN_DURATION = 4650;
function readDemoInventory(){try{return JSON.parse(localStorage.getItem('itm-test-pack-inventory-v1')||'{}')||{}}catch{return {}}}
function writeDemoInventory(){try{localStorage.setItem('itm-test-pack-inventory-v1',JSON.stringify(state.demoInventory))}catch{}}

const state = {phase:'ready',cards:[],revealed:new Set(),inventory:readLocal(),demoInventory:readDemoInventory(),remoteDemoInventory:{},liveInventory:readLiveInventory(),remoteLiveInventory:{},supabase:null,user:null,accountName:null,accountMode:'login',entryRequired:false,playerId:null,hasRecovery:false,authError:null,backendReady:false,accountBusy:false,issuedRecovery:null,three:false,audio:true,busy:false};
const ENTRY_KEY='itm-entry-choice-v1';
const ACCOUNT_PATTERN=/^[a-z][a-z0-9_]{3,19}$/;
const accountEmail=name=>'itm.'+name+'@accounts.itm.example';
const accountNameOf=user=>{const m=String(user?.email||'').match(/^itm\.([a-z][a-z0-9_]{3,19})@accounts\.itm\.example$/);return m?m[1]:null;};
const isNamedAccount=()=>!!(state.accountName&&state.playerId);
const visibleInventory=()=>isNamedAccount()?
  {...state.remoteDemoInventory,...state.remoteLiveInventory}:
  {...state.demoInventory,...state.liveInventory};
function saveEntryChoice(value){try{localStorage.setItem(ENTRY_KEY,value)}catch{}}
function guestChosen(){try{return localStorage.getItem(ENTRY_KEY)==='guest'}catch{return false}}
function syncCanvasPointerEvents(){const canvas=$('threeCanvas');if(canvas)canvas.classList.toggle('itm-canvas-interactive',state.phase==='reveal');}
let scene,renderer,camera,pack,packRim,packParts,packTop,packBottom,packSeam,tornSide,tornFace,openingCard,cardMeshes=[],dust,halos,stageLights=[],openingFx=null,THREE,clock,lastTime=0,openingAt=0,audioContext=null;

let soundManager=null;
let concertStage=null,hoverChimeAt=0,splashTimer=null,urCoverTimer=null,audioPreferenceSet=false,introTimers=[],introCameraActive=false,introCameraStart=0;
const RARITY_CLASSES=['rarity-n','rarity-r','rarity-sr','rarity-ssr','rarity-ur'];
function setSound(on){
  state.audio=on;
  soundManager?.setEnabled(on);
  $('audioToggle').innerHTML=(on?'♫ SOUND ON':'♪ SOUND OFF')+' <span aria-hidden="true">▾</span>';
  $('audioToggle').setAttribute('aria-pressed',String(on));
}
function firstPackSound(){
  if(!audioPreferenceSet&&!state.audio){setSound(true);chime(440,.035)}
}
function fillConcertCrowd(){
  const colors=['#f7a9eb','#cba2ff','#ffe5a5','#a1d4ff','#aaf8d3'];
  for(const hostId of ['concertCrowd','arenaForeground']){
    const parent=$(hostId);if(!parent||parent.childElementCount)continue;
    const fragment=document.createDocumentFragment();
    for(let i=0;i<92;i++){
      const stick=document.createElement('span');
      const distance=((i*53+13)%295)/10;
      const x=i%2===0?distance:100-distance;
      stick.style.setProperty('--x',x.toFixed(1)+'%');
      stick.style.setProperty('--bottom',(i*7%26)+'px');
      stick.style.setProperty('--width',(i%3===0?5:4)+'px');
      stick.style.setProperty('--height',(17+i%8*4)+'px');
      stick.style.setProperty('--color',colors[i%colors.length]);
      stick.style.setProperty('--angle',((i%13)-6)*8+'deg');
      stick.style.setProperty('--speed',(1.8+i%9*.21)+'s');
      fragment.append(stick);
    }
    parent.append(fragment);
  }
}
function closeConcertIntro(){
  introTimers.forEach(clearTimeout);introTimers=[];
  introCameraActive=false;
  document.body.classList.remove('itm-intro-pending','itm-intro-active');
  const el=$('concertIntro');
  if(el){el.hidden=true;el.classList.remove('opening')}
  if(camera){
    camera.fov=42;
    camera.position.set(0,window.innerWidth<780?-.58:-.70,window.innerWidth<780?12.8:10.4);
    camera.lookAt(0,.27,0);camera.updateProjectionMatrix();
  }
}
function showConcertIntro(){
  // Skip may have already dismissed the entry screen while assets were loading.
  if(!document.body.classList.contains('itm-intro-pending'))return;
  const el=$('concertIntro');
  document.body.classList.remove('itm-intro-pending');
  const reduced=matchMedia('(prefers-reduced-motion:reduce)').matches;
  if(reduced){closeConcertIntro();return}
  introCameraActive=!!concertStage;
  if(state.audio)soundManager?.initialPlay();
  document.body.classList.add('itm-intro-active');
  introCameraStart=performance.now();
  void el.offsetWidth;
  // Short, elegant straight-on approach: no audience fly-around or orbit.
  introTimers.push(setTimeout(()=>el.classList.add('opening'),180));
  introTimers.push(setTimeout(()=>{el.hidden=true},1300));
  introTimers.push(setTimeout(closeConcertIntro,2860));
}
function setConcertRarity(rarity){
  const stage=$('packRevealStage');
  stage.classList.remove(...RARITY_CLASSES);
  if(rarity&&rarity!=='DEFAULT')stage.classList.add('rarity-'+rarity.toLowerCase());
  concertStage?.setRarity(rarity||'DEFAULT');
}
function hoverRaritySound(card){
  if(!card||!['SR','SSR','UR'].includes(card.rarity)||!state.audio)return;
  const now=performance.now();
  if(now-hoverChimeAt<440)return;
  hoverChimeAt=now;
  chime({SR:784,SSR:988,UR:1175}[card.rarity],.053);
}
function closeRaritySplash(){
  clearTimeout(splashTimer);clearTimeout(urCoverTimer);
  splashTimer=null;urCoverTimer=null;
  $('raritySplash').hidden=true;
  const cover=$('urScreenTransition');
  if(cover){cover.hidden=true;cover.classList.remove('playing')}
}
function showRaritySplash(card){
  if(!card||card.rarity!=='UR')return;
  const splash=$('raritySplash');
  splash.className='rarity-splash rarity-'+card.rarity.toLowerCase();
  splash.hidden=false;
  $('splashGrade').textContent=card.rarity;
  $('splashSeries').textContent=card.group+' · '+card.edition;
  $('splashName').textContent=card.name;
  $('splashCaption').textContent='A LEGENDARY MOMENT';
  const source=card.full_art_url||card.image_url||'./assets/itm-ur-performance.svg';
  $('splashArt').src=source;
  $('splashArt').onerror=()=>{$('splashArt').onerror=null;$('splashArt').src=makeCardArt(card).toDataURL('image/png')};
  $('splashArt').alt=card.rarity+' '+card.name+' 전체 화면 아트';
  $('splashBlur').style.backgroundImage='url("'+source+'")';
  const fireworks=$('splashFireworks'),fragment=document.createDocumentFragment();
  fireworks.replaceChildren();
  const palette=card.rarity==='UR'?['#8beaff','#b991ff','#ffd289','#ff96d8']:['#ffe1a0','#ffb75a','#ffdbe9'];
  for(let i=0;i<27;i++){
    const p=document.createElement('i');
    p.style.setProperty('--sx',((i*67+13)%99)+'%');
    p.style.setProperty('--sy',((i*41+9)%83)+'%');
    p.style.setProperty('--fs',(i%4===0?7:4)+'px');
    p.style.setProperty('--fc',palette[i%palette.length]);
    p.style.setProperty('--fd',((i%8)*.11).toFixed(2)+'s');
    fragment.append(p);
  }
  fireworks.append(fragment);
  $('splashClose').focus({preventScroll:true});
}
function queueRaritySplash(card){
  if(!card||card.rarity!=='UR')return;
  clearTimeout(splashTimer);clearTimeout(urCoverTimer);
  const cover=$('urScreenTransition');
  if(!cover){showRaritySplash(card);return}
  cover.hidden=false;cover.classList.remove('playing');
  void cover.offsetWidth;cover.classList.add('playing');
  // At the exact-black frame, introduce the full-bleed art behind the cover.
  splashTimer=setTimeout(()=>{
    if(state.phase==='reveal')showRaritySplash(card);
  },780);
  urCoverTimer=setTimeout(()=>{
    cover.hidden=true;cover.classList.remove('playing');
  },2150);
}
const EASE = t => 1-Math.pow(1-Math.min(1,Math.max(0,t)),3);
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function readLocal(){try{return JSON.parse(localStorage.getItem('itm-inventory-v1')||localStorage.getItem('encore-inventory-v1'))||{}}catch{return {}}}
function writeLocal(){try{localStorage.setItem('itm-inventory-v1',JSON.stringify(state.inventory))}catch{}}
function rand(){if(window.crypto?.getRandomValues){const n=new Uint32Array(1);crypto.getRandomValues(n);return n[0]/4294967296}return Math.random()}
function drawDemo(count){
  // Five-card test packs include one of every tier (shuffled), rather than production odds.
  if(count===5){const a=POOL.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(rand()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
  return Array.from({length:count},()=>{let n=rand()*100;for(const tier of TIERS){if(n<tier.chance)return POOL.find(c=>c.rarity===tier.key);n-=tier.chance}return POOL[POOL.length-1]});
}
function tierMeta(rarity){return TIERS.find(t=>t.key===rarity)||TIERS[0]}
function tone(rarity){return tierMeta(rarity).color}
function tierCssGradient(rarity){
  const colors=tierMeta(rarity).gradient;
  return 'linear-gradient(135deg,'+colors.map((color,i)=>color+' '+(i*100/(colors.length-1)).toFixed(2)+'%').join(',')+')';
}
function paintTierGradient(ctx,rarity,x0,y0,x1,y1){
  const colors=tierMeta(rarity).gradient;
  const gradient=ctx.createLinearGradient(x0,y0,x1,y1);
  colors.forEach((color,i)=>gradient.addColorStop(i/(colors.length-1),color));
  return gradient;
}
function makeTierEdgeTexture(rarity){
  const c=document.createElement('canvas');c.width=256;c.height=32;
  const g=c.getContext('2d');
  const softPrism=['#c3f0ec','#accbf1','#bdafe7','#f0c2e1','#ffe0c4','#cfebda','#c3f0ec'];
  const foil=rarity==='UR'
    ?(()=>{const grad=g.createLinearGradient(0,0,256,32);softPrism.forEach((hex,i)=>grad.addColorStop(i/(softPrism.length-1),hex));return grad})()
    :paintTierGradient(g,rarity,0,0,256,32);
  g.fillStyle=foil;g.fillRect(0,0,256,32);
  g.fillStyle='rgba(255,255,255,.22)';g.fillRect(0,0,256,3);
  return c;
}
function flash(rarity){const f=$('flash');f.style.background=`radial-gradient(ellipse at center,#fff 0%,${tone(rarity)}b9 13%,#b76aff53 34%,transparent 68%)`;f.classList.add('active');setTimeout(()=>f.classList.remove('active'),rarity==='UR'?650:270)}
let toastTimer;
function toast(msg){const t=$('toast');t.textContent=msg;t.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('visible'),2900)}
function chime(freq=523,intensity=.13){if(!state.audio)return;intensity*=(soundManager?.getSfxGain()??.62);if(intensity<.0005)return;try{audioContext ||= new(window.AudioContext||window.webkitAudioContext)();audioContext.resume();const now=audioContext.currentTime;[1,1.498,2].forEach((factor,i)=>{const o=audioContext.createOscillator(),g=audioContext.createGain();o.type=i===0?'sine':'triangle';o.frequency.value=freq*factor;g.gain.setValueAtTime(0,now+i*.07);g.gain.linearRampToValueAtTime(intensity/(i+1),now+i*.07+.02);g.gain.exponentialRampToValueAtTime(.0001,now+i*.07+.48);o.connect(g).connect(audioContext.destination);o.start(now+i*.07);o.stop(now+i*.07+.5)})}catch{}}

// Low-volume synthesized foil, charge and impact sounds.
// Respect the independent SFX volume and keep existing BGM playback intact.
function playOpeningCeremonySound(tier){
  if(!state.audio)return;
  const gainLevel=soundManager?.getSfxGain()??.62;
  if(gainLevel<.015)return;
  try{
    audioContext ||= new(window.AudioContext||window.webkitAudioContext)();
    audioContext.resume();
    const ctx=audioContext,t=ctx.currentTime;
    const master=ctx.createGain();
    master.gain.value=Math.min(.15,.20*gainLevel);
    master.connect(ctx.destination);
    const note=(at,f0,f1,len,amp,kind='sine')=>{
      const osc=ctx.createOscillator(),vol=ctx.createGain();
      osc.type=kind;
      osc.frequency.setValueAtTime(f0,t+at);
      osc.frequency.exponentialRampToValueAtTime(f1,t+at+len);
      vol.gain.setValueAtTime(.0001,t+at);
      vol.gain.linearRampToValueAtTime(amp,t+at+.025);
      vol.gain.exponentialRampToValueAtTime(.0001,t+at+len);
      osc.connect(vol).connect(master);
      osc.start(t+at);osc.stop(t+at+len+.02);
    };
    const rip=()=>{
      const len=.31,b=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*len),ctx.sampleRate);
      const ch=b.getChannelData(0);
      for(let i=0;i<ch.length;i++)ch[i]=(Math.random()*2-1)*(.9-.6*i/ch.length);
      const source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),vol=ctx.createGain();
      source.buffer=b;filter.type='highpass';filter.frequency.value=1700;
      vol.gain.setValueAtTime(.001,t+2.51);
      vol.gain.linearRampToValueAtTime(.39,t+2.56);
      vol.gain.exponentialRampToValueAtTime(.001,t+2.82);
      source.connect(filter).connect(vol).connect(master);
      source.start(t+2.51);source.stop(t+2.82);
    };
    note(.05,142,202,.22,.12,'triangle');
    note(.57,190,260,.29,.12);
    note(1.20,206,tier==='UR'?440:320,.44,.17,'sawtooth');
    note(2.08,430,850,.31,.20);
    rip();
    note(2.63,350,tier==='UR'?1090:810,.41,.27);
    note(3.15,340,970,.44,.28,'triangle');
    const final=tier==='UR'?784:tier==='SSR'?659:tier==='SR'?587:440;
    note(3.60,final,final*1.5,.60,tier==='UR'?.37:.27);
    note(3.65,final*1.25,final*2,.52,.15,'triangle');
    // Large but volume-limited concert pyrotechnics. Low thump + bright crack
    // precisely accompany the 3D fireworks; existing SFX slider controls both.
    const boom=(delay,strength)=>{
      const start=t+delay,length=.54;
      const bass=ctx.createOscillator(),envelope=ctx.createGain();
      bass.type='sine';
      bass.frequency.setValueAtTime(155,start);
      bass.frequency.exponentialRampToValueAtTime(48,start+.26);
      envelope.gain.setValueAtTime(.0001,start);
      envelope.gain.linearRampToValueAtTime(strength*.55,start+.014);
      envelope.gain.exponentialRampToValueAtTime(.0001,start+.48);
      bass.connect(envelope).connect(master);
      bass.start(start);bass.stop(start+.52);
      const noise=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*length),ctx.sampleRate);
      const samples=noise.getChannelData(0);
      for(let i=0;i<samples.length;i++)samples[i]=(Math.random()*2-1)*(1-i/samples.length);
      const source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain();
      source.buffer=noise;filter.type='bandpass';filter.frequency.value=810;filter.Q.value=.55;
      gain.gain.setValueAtTime(.0001,start);
      gain.gain.linearRampToValueAtTime(strength*.46,start+.018);
      gain.gain.exponentialRampToValueAtTime(.0001,start+.42);
      source.connect(filter).connect(gain).connect(master);
      source.start(start);source.stop(start+length);
    };
    if(tier==='UR'){
      boom(2.65,.83);boom(2.81,.68);boom(3.00,.80);
      boom(3.20,.57);boom(3.37,.74);
    }else if(tier==='SSR'){
      boom(2.65,.67);boom(2.81,.51);boom(3.00,.55);
    }else if(tier==='SR'){
      boom(2.65,.43);boom(2.81,.35);
    }
  }catch{/* Disabled/autoplay-restricted devices skip only this supplementary SFX. */}
}

function toggleAudio(){if(!soundManager){audioPreferenceSet=true;setSound(!state.audio);if(state.audio)chime()}}
// Shared ITM frame-only card face. Photos/group logos remain intentionally
// empty until the upcoming card-add tool supplies them as independent layers.
const artCache=new Map();
function makeCardArt(card){
  const cacheKey=JSON.stringify([card.id,card.rarity,card.image_url,card.group_logo_url,card.photo_transform,card.logo_scale,card.name]);
  if(artCache.has(cacheKey))return artCache.get(cacheKey);
  const photo=card.image_url?loadedArtwork.get(card.image_url):null;
  const groupLogo=card.group_logo_url?loadedArtwork.get(card.group_logo_url):null;
  // In production the same renderer composites separately stored media with
  // the single, approved N–UR frame. The output is never pre-flattened.
  const canvas=renderITMCard(card,{photo,groupLogo,photoTransform:card.photo_transform});
  if(!card.isLive||(photo&&(!card.group_logo_url||groupLogo))){
    // Small LRU: large photo textures should not accumulate without limit
    // as groups and season card pools grow.
    if(artCache.has(cacheKey))artCache.delete(cacheKey);
    artCache.set(cacheKey,canvas);
    while(artCache.size>14)artCache.delete(artCache.keys().next().value);
  }
  return canvas;
}
function makeBackTexture(){const c=document.createElement('canvas');c.width=512;c.height=746;const g=c.getContext('2d');const b=g.createLinearGradient(0,0,512,746);b.addColorStop(0,'#300d51');b.addColorStop(.5,'#100d2c');b.addColorStop(1,'#68307b');g.fillStyle=b;g.fillRect(0,0,512,746);g.strokeStyle='#e7a3f7';g.lineWidth=8;g.strokeRect(18,18,476,710);g.strokeStyle='#ffffff70';g.lineWidth=1.4;g.strokeRect(34,34,444,678);for(let i=0;i<7;i++){g.save();g.translate(256,360);g.rotate(i*Math.PI/7);g.strokeStyle='#e99cea44';g.beginPath();g.ellipse(0,0,160,250,0,0,Math.PI*2);g.stroke();g.restore()}g.textAlign='center';g.fillStyle='#ffaedc';g.font='120px serif';g.fillStyle='#fff';g.font='900 43px system-ui';g.fillText('ITM',256,457);g.font='bold 15px system-ui';g.fillStyle='#e9badb';g.fillText('IDOL : THE MOMENT',256,493);return c}
// Remove only the edge-connected dark matte from the supplied branding image.
// Keep the original source asset untouched for the header and other uses.
function logoForPack(){
  if(!loaded(brandLogo))return null;
  const w=brandLogo.naturalWidth,h=brandLogo.naturalHeight;
  const c=document.createElement('canvas');c.width=w;c.height=h;
  const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(brandLogo,0,0);
  const im=ctx.getImageData(0,0,w,h),p=im.data,seen=new Uint8Array(w*h),queue=new Int32Array(w*h);
  let head=0,tail=0;
  const matte=(i)=>{const k=i*4;return p[k+3]<16||(Math.max(p[k],p[k+1],p[k+2])<80&&Math.max(p[k],p[k+1],p[k+2])-Math.min(p[k],p[k+1],p[k+2])<55)};
  const add=i=>{if(!seen[i]&&matte(i)){seen[i]=1;queue[tail++]=i}};
  for(let x=0;x<w;x++){add(x);add((h-1)*w+x)}
  for(let y=0;y<h;y++){add(y*w);add(y*w+w-1)}
  while(head<tail){const i=queue[head++],x=i%w,y=(i/w)|0,k=i*4;p[k+3]=0;if(x>0)add(i-1);if(x<w-1)add(i+1);if(y>0)add(i-w);if(y<h-1)add(i+w)}
  ctx.putImageData(im,0,0);return c;
}
function makePackTexture(){
  // Foil pouch, not a cardboard box: holographic metallized film, heat-sealed ribs,
  // specular ribbons and soft printed ITM branding.
  const c=document.createElement('canvas');c.width=1024;c.height=1580;
  const g=c.getContext('2d'),w=c.width,h=c.height;
  const bg=g.createLinearGradient(0,0,w,h);
  const stops=[[0,'#531879'],[.11,'#ed8fcd'],[.21,'#954fbd'],[.35,'#48206d'],[.5,'#dc75c0'],[.65,'#59227b'],[.81,'#efa4d5'],[1,'#773497']];
  stops.forEach(([t,v])=>bg.addColorStop(t,v));
  g.fillStyle=bg;g.fillRect(0,0,w,h);
  g.save();g.globalCompositeOperation='screen';
  const prismatic=g.createLinearGradient(90,170,890,1430);
  [['#ffffff00',0],['#b9f7ff66',.24],['#eac4ff12',.42],['#ffc9e36b',.67],['#ffffff00',1]].forEach(([v,t])=>prismatic.addColorStop(t,v));
  g.fillStyle=prismatic;g.fillRect(0,0,w,h);
  for(let i=-5;i<15;i++){
    const gradient=g.createLinearGradient(i*45,0,i*45+360,h);
    gradient.addColorStop(0,'#ffffff00');
    gradient.addColorStop(.38,i%4===0?'#ffdcff19':'#ffffff06');
    gradient.addColorStop(.7,i%4===0?'#ffbcff14':'#ffffff03');
    gradient.addColorStop(1,'#ffffff00');
    g.strokeStyle=gradient;g.lineWidth=i%5===0?13:3;
    g.beginPath();g.moveTo(i*59,-30);g.lineTo(i*59+460,h+40);g.stroke();
  }
  // High-angle reflective folds that follow the flexible plastic pouch.
  for(let i=0;i<7;i++){
    const t=i/6,x=80+t*880;
    g.strokeStyle=i%3===0?'#ffffff16':'#edb9f10a';
    g.lineWidth=1+(i%3);
    g.beginPath();g.moveTo(x,-20);
    g.bezierCurveTo(x-9,350,x+15,890,x-5,1600);g.stroke();
  }
  g.lineWidth=60;g.shadowBlur=22;g.shadowColor='#ffe5ff58';
  for(const [x1,y1,c1,c2] of [
    [30,350,'#fff9ff9c','#ffafdd00'],
    [880,170,'#e5faff70','#ffffff00'],
    [150,1180,'#f7eaff52','#ffffff00']]){
    const shine=g.createLinearGradient(x1-260,y1-320,x1+260,y1+320);
    shine.addColorStop(0,'#ffffff00');shine.addColorStop(.48,c1);shine.addColorStop(1,c2);
    g.strokeStyle=shine;
    g.beginPath();g.moveTo(x1-280,y1-320);g.bezierCurveTo(x1+30,y1,x1-60,y1+250,x1+300,y1+360);g.stroke();
  }
  g.shadowBlur=0;g.restore();
  // Heat-sealed crimp bands with alternating metallic corrugation.
  for(const [start,top] of [[0,true],[1446,false]]){
    const y=start;
    const foil=g.createLinearGradient(0,y,0,y+135);
    foil.addColorStop(0,'#e1a0e7');foil.addColorStop(.18,'#ffe0fc');
    foil.addColorStop(.45,'#b65bb9');foil.addColorStop(.65,'#6b287d');
    foil.addColorStop(.81,'#ffc6eb');foil.addColorStop(1,'#a657ad');
    g.fillStyle=foil;g.fillRect(0,y,w,135);
    for(let x=0;x<w;x+=18){
      g.fillStyle=(x/18)%2?'#ffffff42':'#4010485a';
      g.fillRect(x,y,5,135);
      g.fillStyle='#fff5ff45';g.fillRect(x+9,y,2,135);
    }
    const horizontal=g.createLinearGradient(0,y+48,0,y+94);
    horizontal.addColorStop(0,'#ffffff54');horizontal.addColorStop(.48,'#37124a50');horizontal.addColorStop(1,'#ffffff54');
    g.fillStyle=horizontal;g.fillRect(0,y+48,w,46);
  }
  g.fillStyle='#ffe4f8ce';g.fillRect(0,136,w,8);g.fillRect(0,1437,w,9);
  // Holographic encapsulated border.
  g.save();g.strokeStyle='#ffe5ffbb';g.lineWidth=12;g.strokeRect(54,175,w-108,1220);
  g.strokeStyle='#dcb3ffc7';g.lineWidth=3;g.strokeRect(82,204,w-164,1166);g.restore();
  const halo=g.createRadialGradient(w/2,722,4,w/2,725,415);
  halo.addColorStop(0,'#fff7ffd2');halo.addColorStop(.23,'#fdd1f867');halo.addColorStop(.55,'#de8de541');halo.addColorStop(1,'#ffffff00');
  g.fillStyle=halo;g.fillRect(65,310,900,810);
  const gl=logoForPack();
  if(gl){
    const size=565;
    g.save();g.shadowColor='#ffdcffcc';g.shadowBlur=28;
    g.drawImage(gl,(w-size)/2,510,size,size);g.restore();
  }else{
    g.save();g.textAlign='center';g.fillStyle='#fff8ff';g.shadowColor='#e0acff';g.shadowBlur=18;
    g.font='italic 900 238px Georgia,serif';g.fillText('ITM',w/2,845);g.restore();
  }
  g.textAlign='center';g.fillStyle='#fff1ff';
  g.shadowColor='#c175f7';g.shadowBlur=15;
  g.font='900 34px Arial,sans-serif';g.fillText('IDOL : THE MOMENT',w/2,1105);
  g.lineWidth=3;g.strokeStyle='#ffe2ffbd';g.beginPath();g.roundRect(w/2-178,1167,356,59,30);g.stroke();
  g.font='800 25px Arial,sans-serif';g.fillText('LIVE CARD PACK',w/2,1207);
  g.font='700 26px Arial,sans-serif';g.fillText('DEBUT COLLECTION',w/2,1332);
  g.shadowBlur=0;
  // Printed foil sparkle detail. No color glyphs or emoji are used in the texture.
  g.save();g.globalCompositeOperation='screen';
  for(let i=0;i<23;i++){
    const x=((i*191)%860)+84,y=((i*277)%1195)+172;
    const rad=i%11===0?11:i%5===0?5:2;
    g.strokeStyle=i%3===0?'#fffdff':'#ffe1ff';
    g.globalAlpha=i%9===0?.55:.16;
    g.lineWidth=1.4;
    g.beginPath();g.moveTo(x-rad,y);g.lineTo(x+rad,y);g.moveTo(x,y-rad);g.lineTo(x,y+rad);g.stroke();
  }
  g.restore();
  return c;
}
function texture(c){const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=Math.min(renderer.capabilities.getMaxAnisotropy(),8);return t}
let backTexture,packTexture,packSheen;
function sculptFoilGeometry(geometry,uvStart=0,uvSize=1){
  // Convex, sealed metallized film with a smoothly rounded pillow profile.
  // Both the unopened pouch and the torn sections share the same world-space curvature.
  const p=geometry.attributes.position,uv=geometry.attributes.uv;
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
    const fullY=(uvStart+uv.getY(i)*uvSize)*3.83-1.915;
    const cross=Math.max(0,1-Math.pow(x/1.275,2));
    const long=Math.max(0,1-Math.pow(fullY/1.915,4));
    const bow=.115*cross*long;
    if(Math.abs(z)>.12){
      p.setZ(i,z+(z>0?bow:-bow*.64));
    }
    uv.setY(i,uvStart+uv.getY(i)*uvSize);
  }
  p.needsUpdate=true;uv.needsUpdate=true;geometry.computeVertexNormals();
  return geometry;
}
function makePackPartGeometry(height,uvStart,uvSize){
  const vertical=Math.max(8,Math.round(height/3.83*44));
  return sculptFoilGeometry(new THREE.BoxGeometry(2.55,height,.33,30,vertical,2),uvStart,uvSize);
}
function makeSculptedFoilGeometry(){
  return sculptFoilGeometry(new THREE.BoxGeometry(2.55,3.83,.33,30,44,2));
}

function initScene(){
  const canvas=$('threeCanvas');renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,window.innerWidth<760?1.45:2));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;
  scene=new THREE.Scene();scene.fog=new THREE.FogExp2(0x0d061a,.017);camera=new THREE.PerspectiveCamera(42,1,.1,100);camera.position.set(0,-.70,10.4);camera.lookAt(0,.27,0);
  scene.add(new THREE.AmbientLight(0xb5a0e8,1.37));
   scene.add(new THREE.HemisphereLight(0xffc8eb,0x2b0b31,1.3));
   const stageKeyLight=new THREE.DirectionalLight(0xffd9ed,.9);
   stageKeyLight.position.set(-1,8,5);scene.add(stageKeyLight);
  const p1=new THREE.PointLight(0xff78c3,27,13);p1.position.set(-4,4,4);scene.add(p1);const p2=new THREE.PointLight(0x9470ff,25,13);p2.position.set(4,2,2);scene.add(p2);
  const p3=new THREE.PointLight(0xf9f2ff,12,15);p3.position.set(0,4,8);scene.add(p3);
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(32,22),new THREE.MeshPhongMaterial({color:0x18102a,transparent:true,opacity:.27,shininess:95,side:THREE.DoubleSide}));floor.rotation.x=-Math.PI/2;floor.position.y=-3.8;scene.add(floor);
  for(let i=0;i<4;i++){let ring=new THREE.Mesh(new THREE.TorusGeometry(2+i*.53,.008,5,128),new THREE.MeshBasicMaterial({color:i%2?0xc283f9:0xec81ba,transparent:true,opacity:.22-i*.035,depthWrite:false}));ring.rotation.x=-Math.PI/2;ring.position.y=-3.69+i*.002;scene.add(ring)}
  for(let i=0;i<4;i++){let cone=new THREE.Mesh(new THREE.ConeGeometry(2,10,32,1,true),new THREE.MeshBasicMaterial({color:i%2?0xd576ff:0xff86bf,transparent:true,opacity:.04,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending}));cone.position.set(-4+i*2.65,3.4,-4);cone.rotation.z=.1+(i-2)*.14;cone.rotation.x=Math.PI;scene.add(cone);stageLights.push(cone)}
  const points=1200,positions=new Float32Array(points*3),colors=new Float32Array(points*3);for(let i=0;i<points;i++){positions[i*3]=(rand()-.5)*27;positions[i*3+1]=(rand()-.5)*19;positions[i*3+2]=(rand()-.5)*21-5;const p=new THREE.Color().setHSL(.78+rand()*.17,.65,.55+rand()*.4);colors.set([p.r,p.g,p.b],i*3)}const geom=new THREE.BufferGeometry();geom.setAttribute('position',new THREE.BufferAttribute(positions,3));geom.setAttribute('color',new THREE.BufferAttribute(colors,3));dust=new THREE.Points(geom,new THREE.PointsMaterial({size:.036,vertexColors:true,transparent:true,opacity:.75,depthWrite:false,blending:THREE.AdditiveBlending}));scene.add(dust);
  backTexture=texture(loaded(brandCardBack)?brandCardBack:makeBackTexture());packTexture=texture(makePackTexture());
  const face=new THREE.MeshPhysicalMaterial({map:packTexture,metalness:.43,roughness:.21,clearcoat:1,clearcoatRoughness:.1,envMapIntensity:1.65,side:THREE.DoubleSide});const side=new THREE.MeshPhysicalMaterial({color:0xf7a8dc,metalness:.86,roughness:.22,clearcoat:1,envMapIntensity:1.8});
  pack=new THREE.Mesh(makeSculptedFoilGeometry(),[side,side,side,side,face,face]);pack.rotation.y=-.32;scene.add(pack);
  // Thin metallic rolled seams physically wrap the pouch instead of being printed.
  const edgeMaterial=new THREE.MeshPhysicalMaterial({
    color:0xffc8f4,metalness:.79,roughness:.16,clearcoat:1,envMapIntensity:2
  });
  for(const x of [-1.246,1.246]){
    const rail=new THREE.Mesh(new THREE.CylinderGeometry(.022,.022,3.73,8),edgeMaterial);
    rail.position.set(x,0,.17);pack.add(rail);
  }
  for(const y of [-1.826,1.826]){
    const seam=new THREE.Mesh(new THREE.CylinderGeometry(.018,.018,2.46,8),edgeMaterial);
    seam.rotation.z=Math.PI/2;seam.position.set(0,y,.19);pack.add(seam);
  }
  // A real curved transparent specular layer catches light as the pack floats.
  const sheenCanvas=document.createElement('canvas');sheenCanvas.width=512;sheenCanvas.height=1024;
  const sg=sheenCanvas.getContext('2d');
  const stripe=sg.createLinearGradient(0,0,512,1024);
  stripe.addColorStop(0,'#ffffff00');
  stripe.addColorStop(.28,'#ffffff00');
  stripe.addColorStop(.43,'#fff8ff25');
  stripe.addColorStop(.49,'#ffffff8c');
  stripe.addColorStop(.54,'#e3eeff30');
  stripe.addColorStop(.64,'#ffffff00');
  stripe.addColorStop(1,'#ffffff00');
  sg.fillStyle=stripe;sg.fillRect(0,0,512,1024);
  const sheenTexture=new THREE.CanvasTexture(sheenCanvas);
  sheenTexture.colorSpace=THREE.SRGBColorSpace;
  const sheenGeo=new THREE.PlaneGeometry(2.48,3.68,30,44);
  const sheenPos=sheenGeo.attributes.position;
  for(let i=0;i<sheenPos.count;i++){
    const x=sheenPos.getX(i),y=sheenPos.getY(i);
    const bulge=.115*Math.max(0,1-(x/1.275)**2)*Math.max(0,1-(y/1.915)**4);
    sheenPos.setZ(i,.174+bulge);
  }
  sheenGeo.computeVertexNormals();
  packSheen=new THREE.Mesh(sheenGeo,new THREE.MeshBasicMaterial({
    map:sheenTexture,transparent:true,opacity:.25,side:THREE.DoubleSide,
    depthWrite:false,blending:THREE.AdditiveBlending
  }));
  pack.add(packSheen);
  // Split the foil using top and bottom meshes with independently cropped UVs.
  packParts=new THREE.Group();
  const cutHeight=.95,bottomHeight=3.83-cutHeight,bottomUv=bottomHeight/3.83;
  // Dedicated translucent materials: fade the torn foil, not the main pouch.
  tornSide=side.clone();tornFace=face.clone();
  tornSide.transparent=true;tornFace.transparent=true;
  tornSide.depthWrite=false;tornFace.depthWrite=false;
  packTop=new THREE.Mesh(makePackPartGeometry(cutHeight,bottomUv,cutHeight/3.83),
    [tornSide,tornSide,tornSide,tornSide,tornFace,tornFace]);
  packBottom=new THREE.Mesh(makePackPartGeometry(bottomHeight,0,bottomUv),[side,side,side,side,face,face]);
  packTop.position.y=bottomHeight/2;packBottom.position.y=-cutHeight/2;
  packSeam=new THREE.Mesh(new THREE.PlaneGeometry(2.64,.07),new THREE.MeshBasicMaterial({color:0xffe6ff,transparent:true,opacity:.9,depthWrite:false,blending:THREE.AdditiveBlending}));
  packSeam.position.set(0,3.83/2-cutHeight,.15);
  packParts.add(packTop,packBottom,packSeam);packParts.visible=false;scene.add(packParts);
  openingCard=new THREE.Mesh(
    new THREE.BoxGeometry(1.76,2.52,.055),
    [new THREE.MeshPhysicalMaterial({color:0xe0c6fc,metalness:.68,roughness:.2}),new THREE.MeshPhysicalMaterial({color:0xe0c6fc,metalness:.68,roughness:.2}),
     new THREE.MeshPhysicalMaterial({color:0xe0c6fc,metalness:.68,roughness:.2}),new THREE.MeshPhysicalMaterial({color:0xe0c6fc,metalness:.68,roughness:.2}),
     new THREE.MeshBasicMaterial({map:backTexture}),new THREE.MeshBasicMaterial({map:backTexture})]
  );
  openingCard.visible=false;openingCard.position.set(0,-.65,.30);scene.add(openingCard);
  packRim=new THREE.Mesh(new THREE.BoxGeometry(2.62,3.9,.2),new THREE.MeshBasicMaterial({color:0xcc73ff,transparent:true,opacity:.16,wireframe:true,depthWrite:false}));scene.add(packRim);
  openingFx=createOpeningEffects({THREE,scene});
  window.addEventListener('resize',resizeScene,{passive:true});resizeScene();
  const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();canvas.addEventListener('pointerdown',(e)=>{if(state.phase!=='reveal')return;const b=canvas.getBoundingClientRect();pointer.x=((e.clientX-b.left)/b.width)*2-1;pointer.y=-((e.clientY-b.top)/b.height)*2+1;raycaster.setFromCamera(pointer,camera);const hit=raycaster.intersectObjects(cardMeshes);if(hit.length)revealIndex(hit[0].object.userData.index)});
  renderer.setAnimationLoop(frame);state.three=true;
}
function resizeScene(){if(!renderer)return;const r=$('sceneWrap').getBoundingClientRect();const w=Math.max(250,Math.round(r.width)),h=Math.max(260,Math.round(r.height));renderer.setSize(w,h,false);camera.aspect=w/h;if(!introCameraActive){camera.position.set(0,window.innerWidth<780?-.58:-.70,window.innerWidth<780?12.8:10.4);camera.lookAt(0,.27,0)}camera.updateProjectionMatrix()}
function frame(now){
  const t=now*.001,delta=Math.min(.05,t-lastTime||.016);lastTime=t;
  const ready=state.phase==='ready',opening=state.phase==='opening';
  if(pack){
    const elapsed=opening?Math.max(0,t-openingAt):0;
    const progress=opening?clamp(elapsed/(PACK_OPEN_DURATION/1000),0,1):0;
    const tear=opening?clamp((elapsed-2.52)/1.30,0,1):0;
    const split=EASE(tear);
    // Two to three graceful diagonal shifts, damping to a full stop.
    // Keyframed ease-in-out replaces the previous high-frequency tremor.
    const swayKeys=[[0,0],[.18,-1],[.40,.86],[.62,-.48],[.81,.22],[1,0]];
    const swayProgress=clamp((elapsed-.24)/1.16,0,1);
    let diagonal=0;
    if(opening&&swayProgress>0&&swayProgress<1){
      for(let i=0;i<swayKeys.length-1;i++){
        const [from,amplitude]=swayKeys[i],[to,nextAmplitude]=swayKeys[i+1];
        if(swayProgress<=to){
          diagonal=amplitude+(nextAmplitude-amplitude)*EASE(clamp((swayProgress-from)/(to-from),0,1));
          break;
        }
      }
    }
    const floatX=Math.sin(t*.53)*.095+Math.sin(t*.22)*.06;
    pack.position.set(floatX+diagonal*.115,
      Math.sin(t*1.06)*.12-diagonal*.075+(opening?EASE(clamp(elapsed/2.7,0,1))*.11:0),
      Math.cos(t*.37)*.032);
    pack.rotation.y=-.16+Math.sin(t*.54)*(opening?.055:.16)+diagonal*.009;
    pack.rotation.x=Math.sin(t*.66)*.025;
    pack.rotation.z=Math.sin(t*.48)*.02+diagonal*.027;
    pack.scale.setScalar(opening?1+EASE(clamp(elapsed/2.7,0,1))*.085:1);
    if(packSheen)packSheen.material.opacity=.21+.17*(.5+.5*Math.sin(t*.72+pack.rotation.y*3));
    pack.visible=(ready||opening)&&tear<=.004;
    packRim.visible=pack.visible;
    packRim.position.copy(pack.position);packRim.rotation.copy(pack.rotation);packRim.scale.copy(pack.scale);
    packParts.visible=opening&&tear>.004;
    if(!opening){
      packTop.visible=true;
      tornSide.opacity=tornFace.opacity=1;
      packTop.rotation.set(0,0,0);
    }
    if(packParts.visible){
      packParts.position.copy(pack.position);packParts.rotation.copy(pack.rotation);
      packParts.scale.copy(pack.scale);
      // The seal peels away, then the detached foil falls with gravity.
      // At fallStart it is exactly continuous with the existing tear pose.
      const fallStart=3.18,fallDuration=.90;
      const topTear=EASE(clamp((Math.min(elapsed,fallStart)-2.52)/1.30,0,1));
      const topKick=Math.sin(topTear*Math.PI)*.28;
      const fall=elapsed>=fallStart?clamp((elapsed-fallStart)/fallDuration,0,1):0;
      const gravity=fall*fall;
      packTop.position.set(
        topTear*.43+fall*.27+gravity*.16,
        (3.83-.95)/2+topTear*1.07+topKick+fall*.12-gravity*2.48,
        topTear*.21+fall*.26);
      packTop.rotation.set(topTear*.23+fall*.22,fall*.35,-topTear*.43-fall*.63);
      const fade=1-EASE(clamp((fall-.27)/.73,0,1));
      tornSide.opacity=tornFace.opacity=fade;
      packTop.visible=fall<1;
      packBottom.position.y=-.95/2-split*.59;
      packBottom.rotation.z=split*.052;
      packSeam.material.opacity=(1-tear)*.92;
      packSeam.scale.x=1;
    }
    if(openingCard){
      const emerge=clamp((elapsed-2.94)/1.16,0,1);
      openingCard.visible=opening&&elapsed>2.94&&elapsed<4.6;
      if(openingCard.visible){
        const rise=EASE(emerge);
        const bounce=Math.sin(Math.PI*clamp((emerge-.65)/.35,0,1))*.115;
        openingCard.position.set(pack.position.x,pack.position.y-.83+rise*2.3+bounce,.30+rise*.36);
        openingCard.rotation.y=-.46*(1-rise)+Math.sin(t*.7)*.035;
        openingCard.rotation.x=.14*(1-rise);
        openingCard.rotation.z=-.13*(1-rise)+Math.sin(t*.85)*.015;
        openingCard.scale.setScalar(.76+rise*.32+bounce*.42);
      }
    }
    if(opening)openingFx?.update(elapsed,pack);
    else openingFx?.reset();
  }
  
if(dust){dust.rotation.y+=delta*.015;dust.rotation.z+=delta*.01}stageLights.forEach((cone,i)=>cone.rotation.z=Math.sin(t*.4+i)*.23);concertStage?.update(t,delta);
  const n=cardMeshes.length;cardMeshes.forEach((mesh,i)=>{const revealed=state.revealed.has(i);const mobile=window.innerWidth<780;const spread=n===1?0:(mobile?1.18:1.47);const targetX=(i-(n-1)/2)*spread;const targetY=.14+Math.sin(t*1.3+i)*.055;mesh.position.x+=(targetX-mesh.position.x)*Math.min(1,delta*4.2);mesh.position.y+=(targetY-mesh.position.y)*Math.min(1,delta*4.2);mesh.position.z+=(0-mesh.position.z)*Math.min(1,delta*3);const targetR=revealed?Math.PI*2:Math.PI;mesh.rotation.y+=(targetR-mesh.rotation.y)*Math.min(1,delta*(revealed?3.2:4.8));mesh.rotation.z=((i-(n-1)/2)*(mobile?-.035:-.043))+Math.sin(t*.7+i)*.012;const targetScale=(revealed&&['SSR','UR'].includes(state.cards[i].rarity))?1.07:1;mesh.scale.lerp(new THREE.Vector3(targetScale,targetScale,targetScale),Math.min(1,delta*3))});
  if(introCameraActive&&concertStage?.introPose){
    const progress=clamp((performance.now()-introCameraStart)/2750,0,1);
    const pose=concertStage.introPose(progress);
    camera.position.copy(pose.pos);
    camera.lookAt(pose.look);
    if(Math.abs(camera.fov-pose.fov)>.02){camera.fov=pose.fov;camera.updateProjectionMatrix()}
  }else{
    const mobile=window.innerWidth<780,baseZ=mobile?12.8:10.4,baseY=mobile?-.58:-.70;
    let zoom=0;
    if(opening&&['SR','SSR','UR'].includes(state.pullHighlight)){
      const elapsed=Math.max(0,t-openingAt),tier=state.pullHighlight;
      const start=tier==='SR'?1.0:tier==='SSR'?1.30:1.45;
      const attack=EASE(clamp((elapsed-start)/.72,0,1));
      const release=1-EASE(clamp((elapsed-3.04)/1.35,0,1));
      zoom=attack*release*(tier==='UR'?2.0:tier==='SSR'?1.25:.83);
    }
    camera.position.set(0,baseY+.09*zoom,baseZ-zoom*(mobile?.74:1));
    camera.lookAt(0,.27+.13*zoom,0);
    camera.fov=42-.4*zoom;
    camera.updateProjectionMatrix();
  }
  renderer.render(scene,camera)}
function addCards(){cardMeshes.forEach(mesh=>{scene.remove(mesh);mesh.geometry.dispose();mesh.material.forEach(m=>{if(m.map && m.map!==backTexture)m.map.dispose();m.dispose()})});cardMeshes=[];
  const n=state.cards.length;state.cards.forEach((c,i)=>{const front=texture(makeCardArt(c));const edge=new THREE.MeshPhysicalMaterial({map:texture(makeTierEdgeTexture(c.rarity)),metalness:.5,roughness:.24,clearcoat:.9});const card=new THREE.Mesh(new THREE.BoxGeometry(1.56,2.3,.04),[edge,edge,edge,edge,new THREE.MeshBasicMaterial({map:front}),new THREE.MeshBasicMaterial({map:backTexture})]);card.position.set((i-(n-1)/2)*.25,-4,-i*.07);card.rotation.y=Math.PI;card.userData.index=i;cardMeshes.push(card);scene.add(card)})}
function clearCards(){cardMeshes.forEach(mesh=>{scene.remove(mesh);mesh.geometry.dispose();mesh.material.forEach(m=>{if(m.map&&m.map!==backTexture)m.map.dispose();m.dispose()})});cardMeshes=[]}
function showControls(which){['drawOne','drawFive'].forEach(id=>$(id).hidden=!which.includes(id))}
function updateCounts(){let total=Object.values(visibleInventory()).reduce((a,n)=>a+Number(n||0),0);$('collectionCount').textContent=total}
// Immersive reveal UI: real interactive, keyboard-accessible flip cards.
function renderRevealStage(){
  const stage=$('packRevealStage'),rail=$('stageCardRail');
  rail.replaceChildren();
  rail.classList.toggle('one-card',state.cards.length===1);
  const track=document.createElement('div');
  track.id='stageCardTrack';track.className='stage-card-track';
  rail.appendChild(track);
  $('stagePackLabel').textContent=state.cards.length+'회 뽑기';
  state.cards.forEach((card,i)=>{
    const button=document.createElement('button');
    button.type='button';button.className='stage-card-button rarity-'+card.rarity.toLowerCase();
    button.style.setProperty('--arrive-delay',i*125+'ms');
    button.style.setProperty('--tier-color',tone(card.rarity));
    button.style.setProperty('--tier-gradient',tierCssGradient(card.rarity));
    button.setAttribute('aria-label',(i+1)+'번째 카드를 공개하기');
    const inner=document.createElement('span');inner.className='stage-card-inner';
    const back=document.createElement('span');back.className='stage-card-face stage-card-back';
    const backImg=document.createElement('img');backImg.src='./assets/itm-card-back.png';backImg.alt='ITM 공식 카드 뒷면';
    backImg.onerror=()=>{backImg.style.display='none';back.textContent='✦ ITM ✦'};
    back.append(backImg);
    const front=document.createElement('span');front.className='stage-card-face stage-card-front';
    const frontImg=document.createElement('img');frontImg.src=makeCardArt(card).toDataURL('image/png');
    frontImg.alt=card.rarity+' '+card.group+' '+card.name+' 포토카드';
    front.append(frontImg);inner.append(back,front);
    const badge=document.createElement('span');badge.className='stage-card-badge';badge.textContent=TIERS.find(t=>t.key===card.rarity)?.label||card.rarity;
    button.append(inner,badge);
    button.addEventListener('click',()=>revealIndex(i));
    button.addEventListener('pointerenter',()=>{if(state.revealed.has(i))hoverRaritySound(card)});
    button.addEventListener('focus',()=>{if(state.revealed.has(i))hoverRaritySound(card)});
    track.append(button);
  });
  fillConcertCrowd();
  setConcertRarity(state.pullHighlight||'DEFAULT');
  stage.hidden=false;stage.setAttribute('aria-hidden','false');document.body.classList.add('pack-revealing');
  $('stageHint').textContent='카드를 터치해서 한 장씩 확인하세요.';
  updateStageProgress();
  track.firstElementChild?.focus({preventScroll:true});
}
function updateStageProgress(){
  const total=state.cards.length,done=state.revealed.size;
  $('stageProgress').textContent=done+' / '+total+' REVEALED';
  $('stageRevealAll').hidden=done===total;
  $('stageFinish').hidden=done!==total;
}
function stageBurst(card){
  if(!card||card.rarity==='N'||card.rarity==='UR')return;
  // SR and SSR only get understated card-level rarity accents.
  const klass='rarity-'+card.rarity.toLowerCase(),fx=$('stageBurst'),banner=$('stageRarityBanner');
  fx.className='stage-burst';banner.className='stage-rarity-banner';
  void banner.offsetWidth;
  banner.textContent=card.rarity==='SSR'?'SPECIAL SUPER RARE':card.rarity==='SR'?'SUPER RARE':'RARE';
  banner.className='stage-rarity-banner '+klass+' active';
}
async function openPack(count){
  // Guest draws are local: never block the pack while Supabase initialises.
  // Cloud inventory draws still require the authenticated backend to be ready.
  if(state.busy||state.phase!=='ready'||state.entryRequired||(isNamedAccount()&&!state.backendReady))return;
  state.busy=true;$('drawOne').disabled=$('drawFive').disabled=true;
  let rolled=[];
  try{
    if(state.supabase)await loadPublishedCatalog().catch(err=>console.warn('카드 목록 갱신 실패',err));
    if(isNamedAccount()){
      // Managed packs can be opened with any eligible published cards;
      // the default pack alone requires every rarity to be populated.
      const rule=selectedPack();
      const rpc=rule?'itm_open_managed_pack':LIVE_READY?'itm_open_card_pack':'itm_open_demo_pack';
      const args=rule?{p_count:count,p_pack_id:rule.id}:{p_count:count};
      const {data,error}=await state.supabase.rpc(rpc,args);
      if(error)throw error;
      rolled=(data||[]).map(x=>byId.get(String(x.id))).filter(Boolean);
      if(rolled.length!==count)throw Error('서버 카드 결과를 확인할 수 없습니다.');
      await syncRemote();
    }else if(LIVE_READY||selectedPack()){
      rolled=drawLiveLocal(count,selectedPack());
      for(const card of rolled)state.liveInventory[card.id]=(state.liveInventory[card.id]||0)+1;
      writeLiveInventory();updateCounts();
    }else{
      rolled=drawDemo(count);
      for(const card of rolled)state.demoInventory[card.id]=(state.demoInventory[card.id]||0)+1;
      writeDemoInventory();updateCounts();
    }
    await Promise.all(rolled.map(async card=>{
      try{await preloadCard(card)}
      catch(err){console.warn('Card art unavailable; reveal still continues',err)}
    }));
  }catch(err){
    state.busy=false;$('drawOne').disabled=$('drawFive').disabled=false;
    toast('카드팩 개봉 실패: '+(err?.message||String(err)));return;
  }
  state.cards=rolled;state.revealed=new Set();
  // Reveal the pull's strongest rarity through the LED wall during the foil opening.
  const tierOrder={N:0,R:1,SR:2,SSR:3,UR:4};
  state.pullHighlight=rolled.reduce((best,c)=>tierOrder[c.rarity]>tierOrder[best]?c.rarity:best,'N');
  firstPackSound();
  setConcertRarity('DEFAULT');
  state.phase='opening';syncCanvasPointerEvents();openingAt=performance.now()*.001;
  concertStage?.beginOpening(state.pullHighlight);
  openingFx?.setTier(state.pullHighlight);
  playOpeningCeremonySound(state.pullHighlight);
  document.body.classList.add('pack-cinematic');requestAnimationFrame(resizeScene);
  showControls([]);$('controlHeading').textContent='봉인을 해제하고 있어요…';
  $('sceneHeading').textContent='02 — BREAK THE SEAL';
  $('centerHint').innerHTML='<span>✦</span> UNSEALING YOUR MOMENT';
  chime(329,.2);
  setTimeout(()=>{
    if(state.phase!=='opening')return;
    concertStage?.endOpening();
    document.body.classList.remove('pack-cinematic');requestAnimationFrame(resizeScene);
    state.phase='reveal';syncCanvasPointerEvents();state.busy=false;
    if(state.three&&!document.body.classList.contains('itm-concert'))addCards();
    else if(!state.three)renderFallbackCards();
    $('controlHeading').textContent='카드를 한 장씩 뒤집어 등급을 확인해 보세요.';
    $('sceneHeading').textContent='03 — YOUR CARDS AWAIT';
    $('centerHint').innerHTML='<span>✧</span> TAP A CARD TO REVEAL';
    showControls([]);
      $('drawOne').disabled=$('drawFive').disabled=false;
    renderRevealStage();
  },PACK_OPEN_DURATION);
}
function revealIndex(i,silent=false){
  if(state.phase!=='reveal'||state.revealed.has(i)||i<0||i>=state.cards.length)return;
  state.revealed.add(i);
  const card=state.cards[i],button=$('stageCardTrack')?.children[i],tier=TIERS.find(t=>t.key===card.rarity);
  if(button){
    button.classList.add('is-revealed');
    button.setAttribute('aria-label',card.rarity+' '+card.name+' 공개됨');
    button.setAttribute('aria-pressed','true');
    if(!silent){
      // Scroll only the horizontal card rail; scrollIntoView also moves the iOS page.
      const rail=$('stageCardRail');
      const railRect=rail.getBoundingClientRect(),buttonRect=button.getBoundingClientRect();
      const desired=rail.scrollLeft+(buttonRect.left-railRect.left)-(railRect.width-buttonRect.width)/2;
      rail.scrollTo({left:Math.max(0,desired),behavior:'smooth'});
    }
  }
  if(!silent){
    const freq={N:440,R:523,SR:659,SSR:784,UR:1047}[card.rarity]||523;
    chime(freq,card.rarity==='UR'?.18:card.rarity==='SSR'?.14:.075);
    setConcertRarity(card.rarity);
    stageBurst(card);
    queueRaritySplash(card);
  }
  $('stageHint').textContent=(tier?.label||card.rarity)+' · '+card.group+' '+card.name+' 발견!';
  updateStageProgress();
  if(!state.three)renderFallbackCards();
  if(state.revealed.size===state.cards.length){
    $('controlHeading').textContent='모든 카드를 확인하셨습니다. 획득한 카드는 도감에 기록되었습니다.';
    $('sceneHeading').textContent='04 — A MOMENT TO REMEMBER';
    $('centerHint').innerHTML='<span>✦</span> COLLECTION UPDATED';
    $('stageHint').textContent='모든 카드가 공개되었습니다! ✦ 획득한 카드는 도감에서 다시 볼 수 있습니다.';
    showControls([]);
  }
}
function revealNext(){const i=state.cards.findIndex((_,j)=>!state.revealed.has(j));if(i>=0)revealIndex(i)}
function revealAll(){
  const hidden=state.cards.filter((_,i)=>!state.revealed.has(i));
  if(!hidden.length)return;
  state.cards.forEach((_,i)=>{if(!state.revealed.has(i))revealIndex(i,true)});
  const rank={N:0,R:1,SR:2,SSR:3,UR:4};
  const highest=hidden.reduce((a,b)=>(!a||rank[b.rarity]>rank[a.rarity])?b:a,null);
  if(highest){
    chime(highest.rarity==='UR'?1047:784,.16);
    setConcertRarity(highest.rarity);
    stageBurst(highest);
    queueRaritySplash(highest);
  }
}
function reset(){
  closeRaritySplash();concertStage?.endOpening();openingFx?.reset();setConcertRarity('DEFAULT');
  document.body.classList.remove('pack-cinematic','pack-revealing');
  const stage=$('packRevealStage');stage.hidden=true;stage.setAttribute('aria-hidden','true');
  $('stageBurst').className='stage-burst';$('stageRarityBanner').className='stage-rarity-banner';
  requestAnimationFrame(resizeScene);
  state.phase='ready';syncCanvasPointerEvents();state.cards=[];state.revealed.clear();state.busy=false;
  clearCards();if(!state.three)resetFallback();
  showControls(['drawOne','drawFive']);$('drawOne').disabled=$('drawFive').disabled=false;
  $('controlHeading').textContent='어떤 순간을 열어 볼까요?';
  $('sceneHeading').textContent='01 — THE SEALED MOMENT';
  $('centerHint').innerHTML='<span>✧</span> THE SHOW IS ABOUT TO BEGIN';
}

function resetFallback(){const f=$('canvasFallback');f.style.flexDirection='column';f.style.flexWrap='nowrap';f.innerHTML='<div class="fallback-pack"><div class="fallback-pack-inner"><img src="./assets/itm-logo.png" alt="ITM" onerror="this.hidden=true" /><b hidden>ITM</b><small>DEBUT COLLECTION</small></div></div><p>3D 라이브러리가 연결되지 않아 가벼운 2D 미리보기를 표시합니다.</p>'}
function renderFallbackCards(){const f=$('canvasFallback');f.innerHTML='';f.style.flexDirection='row';f.style.flexWrap='wrap';state.cards.forEach((c,i)=>{const el=document.createElement('img');el.src=state.revealed.has(i)?makeCardArt(c).toDataURL():(loaded(brandCardBack)?brandCardBack.src:makeBackTexture().toDataURL());el.alt=state.revealed.has(i)?c.name:'뒷면';el.style.cssText='width:clamp(70px,15%,130px);aspect-ratio:1/1.48;object-fit:cover;box-shadow:0 4px 25px #000a;cursor:pointer';el.onclick=()=>revealIndex(i);f.appendChild(el)})}
function openModal(id){$(id).classList.add('active');$(id).setAttribute('aria-hidden','false')}
function closeModal(id){$(id).classList.remove('active');$(id).setAttribute('aria-hidden','true')}
function renderCollection(){
  const ids=Object.entries(visibleInventory()).filter(([id,q])=>Number(q)>0&&byId.has(id));
  const unique=ids.length,total=POOL.length+LIVE_POOL.length;
  $('collectionSummary').textContent=`DISCOVERED ${unique} / ${total}   •   OWNED ${ids.reduce((sum,[,q])=>sum+Number(q),0)} CARDS`;
  const grid=$('collectionGrid');grid.replaceChildren();
  if(!ids.length&&!LIVE_POOL.length){const p=document.createElement('p');p.className='collection-empty';p.textContent='아직 수집한 카드가 없습니다. 첫 번째 팩을 열어 보세요 ✦';grid.append(p)}
  const ordered=[...POOL,...LIVE_POOL];
  ids.sort((a,b)=>ordered.findIndex(c=>c.id===a[0])-ordered.findIndex(c=>c.id===b[0]));
  const ownedIds=new Set(ids.map(([id])=>id));
  const missing=LIVE_POOL.filter(c=>!ownedIds.has(c.id)).map(c=>[c.id,0]);
  [...ids,...missing].forEach(([id,qty])=>{
    const card=byId.get(id),box=document.createElement('div');
    box.className='col-item rarity-'+card.rarity.toLowerCase();
    box.style.setProperty('--tier-color',tone(card.rarity));
    box.style.setProperty('--tier-gradient',tierCssGradient(card.rarity));
    const img=document.createElement('img');img.alt=`${card.group} ${card.name}`;
    img.src=qty?makeCardArt(card).toDataURL():'./assets/itm-card-back.png';
    if(qty&&card.isLive)void preloadCard(card).then(()=>{
      if(img.isConnected)img.src=makeCardArt(card).toDataURL('image/png');
    }).catch(err=>console.warn('Artwork preview unavailable',err));
    const q=document.createElement('span');q.className='qty';q.textContent=qty?'×'+qty:'미수집';
    const title=document.createElement('strong');title.textContent=card.group+' · '+card.name;
    const sub=document.createElement('small');sub.style.color=tone(card.rarity);sub.textContent=card.rarity;
    box.append(img,q,title,sub);grid.append(box);
  });
}

async function syncRemote(){
  if(!state.supabase||!state.playerId)return false;
  const [demo,live]=await Promise.all([
    state.supabase.from('itm_demo_inventory').select('card_id,quantity'),
    state.supabase.from('itm_card_inventory').select('card_id,quantity')
  ]);
  if(demo.error||live.error){toast('도감 동기화 오류: '+(demo.error||live.error).message);return false}
  state.remoteDemoInventory=Object.fromEntries((demo.data||[]).map(r=>[r.card_id,r.quantity]));
  state.remoteLiveInventory=Object.fromEntries((live.data||[]).map(r=>[r.card_id,r.quantity]));
  updateCounts();
  if($('collectionOverlay').classList.contains('active'))renderCollection();
  return true;
}
function updateLogin(){
  const signed=isNamedAccount();
  $('loginButton').textContent=signed?'✦ '+state.accountName.toUpperCase():'✦ ITM ID';
  $('accountEntry').hidden=signed;
  $('accountProfile').hidden=!signed;
  $('accountClose').hidden=state.entryRequired&&!signed;
  $('accountStatus').textContent=signed?'로그인됨 · '+state.accountName:'계정 연결 필요';
  $('accountPlayerId').textContent=signed?'ITM PLAYER · '+state.playerId.slice(0,8).toUpperCase():'';
  $('accountRetry').hidden=true;
  $('issueRecoveryCode').disabled=!signed||state.accountBusy;
  $('restoreRecoveryCode').disabled=!signed||state.accountBusy;
  $('accountSubmit').disabled=state.accountBusy;
  $('accountSubmit').textContent=state.accountBusy?'확인 중…':state.accountMode==='signup'?'ITM ID 만들기 →':'내 도감 불러오기 →';
  $('collectionFooter').textContent=signed?'계정에 저장된 도감입니다. 같은 ITM ID로 어디서나 불러올 수 있습니다.':'게스트 도감은 이 브라우저에만 저장됩니다. 브라우저 데이터를 삭제하거나 시크릿 모드를 종료하면 수집 기록이 사라질 수 있습니다.';
}
function setAccountMessage(message){$('accountMessage').textContent=message}
function setAccountMode(mode){
  state.accountMode=mode==='signup'?'signup':'login';
  const signup=state.accountMode==='signup';
  $('accountTabLogin').classList.toggle('selected',!signup);
  $('accountTabSignup').classList.toggle('selected',signup);
  $('accountTabLogin').setAttribute('aria-pressed',String(!signup));
  $('accountTabSignup').setAttribute('aria-pressed',String(signup));
  $('accountPassword').autocomplete=signup?'new-password':'current-password';
  $('accountPasswordNote').hidden=!signup;
  updateLogin();
}
function accountOpen(required=false){
  state.entryRequired=!!required;
  setAccountMode('login');updateLogin();
  if(required)setAccountMessage('');
  openModal('accountOverlay');
}
function chooseGuest(){
  state.entryRequired=false;saveEntryChoice('guest');
  closeModal('accountOverlay');
  updateCounts();updateLogin();
  toast('게스트 모드 · 수집 기록은 이 브라우저에만 저장됩니다.');
}
async function activateNamedUser(user){
  if(!user||!accountNameOf(user))throw Error('ITM 계정 정보를 확인할 수 없습니다.');
  state.user=user;state.accountName=accountNameOf(user);state.playerId=null;
  const {data:playerId,error}=await state.supabase.rpc('ensure_guest_player');
  if(error)throw error;
  state.playerId=playerId;
  const {data:backup,error:backupError}=await state.supabase.rpc('has_recovery_code');
  state.hasRecovery=!backupError&&!!backup;
  await syncRemote();updateLogin();
  try{
    const {data:isAdmin}=await state.supabase.rpc('itm_studio_is_admin');
    $('studioOpen').hidden=!isAdmin;
    await soundManager?.setBackend(state.supabase,!!isAdmin);
  }catch(err){console.warn('Administrator lookup failed',err)}
}
async function initBackend(){
  if(!CONFIG.supabaseUrl||!CONFIG.supabasePublishableKey){
    state.authError='Supabase 설정을 확인해 주세요.';state.backendReady=true;
    updateLogin();if(!guestChosen())accountOpen(true);return;
  }
  try{
    if(!state.supabase){
      const mod=await import('https://esm.sh/@supabase/supabase-js@2.57.0');
      state.supabase=mod.createClient(CONFIG.supabaseUrl,CONFIG.supabasePublishableKey);
    }
    void soundManager?.setBackend(state.supabase,false);
    try{await loadPublishedCatalog()}catch(e){console.warn('Card catalog unavailable; demo remains active',e)}
    const {data,error}=await state.supabase.auth.getSession();
    if(error)throw error;
    const user=data?.session?.user;
    if(user&&accountNameOf(user)&&!user.is_anonymous){
      await activateNamedUser(user);
      saveEntryChoice('account');
    }else{
      state.accountName=null;state.playerId=null;state.user=null;
      updateCounts();updateLogin();
      if(!guestChosen())accountOpen(true);
    }
  }catch(err){
    state.authError=err?.message||String(err);
    state.accountName=null;state.playerId=null;state.user=null;
    updateCounts();updateLogin();
    if(!guestChosen())accountOpen(true);
    setAccountMessage('서버에 연결하지 못했습니다. 게스트로는 플레이할 수 있습니다. '+state.authError);
  }finally{state.backendReady=true}
}
async function submitAccount(event){
  event?.preventDefault();
  if(state.accountBusy)return;
  if(!state.supabase)return setAccountMessage('서버 연결을 확인한 뒤 다시 시도해 주세요.');
  const name=$('accountUsername').value.trim().toLowerCase(),password=$('accountPassword').value;
  if(!ACCOUNT_PATTERN.test(name))return setAccountMessage('아이디는 영문 소문자로 시작해야 합니다. 영문 소문자, 숫자, 밑줄을 사용해 4~20자로 입력해 주세요.');
  if(!password)return setAccountMessage('비밀번호를 입력해 주세요.');
  const signup=state.accountMode==='signup';
  if(signup&&(password.length<10||password.length>72||!/[A-Za-z]/.test(password)||!/[0-9]/.test(password)))
    return setAccountMessage('비밀번호는 영문과 숫자를 포함해 10~72자로 입력해 주세요.');
  state.accountBusy=true;updateLogin();
  try{
    if(signup){
      const res=await fetch(CONFIG.supabaseUrl+'/functions/v1/itm-register',{
        method:'POST',headers:{'content-type':'application/json','apikey':CONFIG.supabasePublishableKey},
        body:JSON.stringify({username:name,password})
      });
      const payload=await res.json().catch(()=>({}));
      if(!res.ok)throw Error(payload.error||'계정 생성에 실패했습니다.');
    }
    const {data,error}=await state.supabase.auth.signInWithPassword({email:accountEmail(name),password});
    if(error)throw error;
    if(!data?.user)throw Error('로그인 응답을 확인할 수 없습니다.');
    await activateNamedUser(data.user);
    let imported=false;
    if(signup&&Object.keys(state.demoInventory).length){
      const {data:ok,error:importError}=await state.supabase.rpc('itm_import_guest_demo',{p_items:state.demoInventory});
      if(importError)setAccountMessage('계정은 생성되었으나 게스트 카드를 이전하지 못했습니다. 게스트 기록은 이 브라우저에 남아 있습니다.');
      else{imported=!!ok;await syncRemote();}
    }
    $('accountPassword').value='';
    state.entryRequired=false;saveEntryChoice('account');updateLogin();
    closeModal('accountOverlay');
    toast(signup?(imported?'회원가입 완료! 게스트 도감도 이전했습니다.':'ITM 계정 생성 완료!'):'로그인 성공! 클라우드 도감을 불러왔습니다.');
  }catch(err){
    setAccountMessage('계정 처리 실패: '+(err?.message||String(err)));
    console.warn('ITM account flow failed',err?.message||String(err));
  }finally{state.accountBusy=false;updateLogin()}
}
async function logoutAccount(){
  if(state.accountBusy)return;
  state.accountBusy=true;
  try{if(state.supabase){const {error}=await state.supabase.auth.signOut();if(error)throw error}}
  catch(err){state.accountBusy=false;return setAccountMessage('로그아웃 실패: '+(err?.message||String(err)))}
  state.accountBusy=false;state.user=null;state.accountName=null;state.playerId=null;
  state.remoteDemoInventory={};state.remoteLiveInventory={};
  $('studioOpen').hidden=true;
  void soundManager?.setBackend(state.supabase,false);
  state.hasRecovery=false;state.issuedRecovery=null;
  try{localStorage.removeItem(ENTRY_KEY)}catch{}
  updateCounts();accountOpen(true);
  toast('로그아웃했습니다. 계정 도감은 서버에 보관됩니다.');
}
async function issueRecovery(){
  if(state.accountBusy)return;
  if(!state.supabase||!state.playerId)return toast('서버 계정 연결 후 사용할 수 있습니다.');
  if(state.hasRecovery&&!window.confirm('새 코드를 발급하면 기존 복구 코드는 사용할 수 없습니다. 새 코드를 발급하시겠습니까?'))return;
  state.accountBusy=true;updateLogin();
  try{
    const {data,error}=await state.supabase.rpc('issue_recovery_code');
    if(error)throw error;
    state.issuedRecovery=String(data);state.hasRecovery=true;
    $('issuedCode').textContent=state.issuedRecovery;
    $('issuedCodeBox').hidden=false;
    setAccountMessage('복구 코드가 발급되었습니다. 이 화면을 닫기 전에 코드를 복사해 안전한 곳에 보관해 주세요. 서버에는 원본 코드를 저장하지 않습니다.');
    toast('복구 코드가 발급되었습니다. 안전한 곳에 보관해 주세요.');
  }catch(err){setAccountMessage('발급 실패: '+(err?.message||String(err)))}
  finally{state.accountBusy=false;updateLogin()}
}
async function copyRecovery(){
  if(!state.issuedRecovery)return;
  try{await navigator.clipboard.writeText(state.issuedRecovery);toast('복구 코드를 복사했습니다.')}
  catch{window.prompt('복구 코드를 복사해 보관해 주세요.',state.issuedRecovery)}
}
async function restoreRecovery(){
  if(state.accountBusy)return;
  if(!state.supabase||!state.playerId)return toast('서버 계정 연결 후 사용할 수 있습니다.');
  const code=$('recoveryCodeInput').value.trim();
  if(!code)return setAccountMessage('다른 기기에서 발급받은 복구 코드를 입력해 주세요.');
  state.accountBusy=true;updateLogin();
  try{
    let {data,error}=await state.supabase.rpc('recover_player',{p_code:code,p_allow_switch:false});
    if(error)throw error;
    if(data?.reason==='confirm_switch'){
      const proceed=window.confirm('이 기기에서 수집한 카드 '+data.existing_cards+'장은 현재 도감에 별도로 보관됩니다. 기존 도감으로 전환하시겠습니까?');
      if(!proceed){setAccountMessage('도감 전환을 취소했습니다. 현재 수집 기록은 그대로 유지됩니다.');return}
      ({data,error}=await state.supabase.rpc('recover_player',{p_code:code,p_allow_switch:true}));
      if(error)throw error;
    }
    if(!data?.ok){
      const msg=data?.reason==='rate_limited'?'입력 횟수 제한을 초과했습니다. 약 15분 뒤 다시 시도해 주세요.':'복구 코드가 일치하지 않습니다. 입력한 코드를 확인해 주세요.';
      return setAccountMessage(msg);
    }
    const {data:playerId,error:playerError}=await state.supabase.rpc('ensure_guest_player');
    if(playerError)throw playerError;
    state.playerId=playerId;
    state.hasRecovery=true;
    state.issuedRecovery=null;
    $('issuedCodeBox').hidden=true;
    $('recoveryCodeInput').value='';
    await syncRemote();
    setAccountMessage('도감 불러오기 성공! 이 기기에서도 같은 카드와 수집 수량을 사용할 수 있습니다.');
    toast('✦ 다른 기기의 도감을 불러왔습니다!');
  }catch(err){setAccountMessage('불러오기 실패: '+(err?.message||String(err)))}
  finally{state.accountBusy=false;updateLogin()}
}
async function init3D(){
  try{
    THREE=await import('https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js');
    initScene();$('canvasFallback').hidden=true;syncCanvasPointerEvents();
    try{
      const mod=await import('./premium-stage.js');
      concertStage=mod.createConcertStage({THREE,scene,renderer,oldBeams:stageLights});
      concertStage.reset();
    }catch(err){console.warn('Concert stage enhancement unavailable',err)}
    resizeScene();
    if(state.phase==='reveal'&&state.cards.length&&!document.body.classList.contains('itm-concert'))addCards();
  }catch(err){
    console.warn('3D unavailable: ',err);
    $('threeCanvas').style.display='none';$('canvasFallback').hidden=false;resetFallback();
  }
}
function accountClose(){
  if(state.entryRequired&&!isNamedAccount())return;
  closeModal('accountOverlay');state.issuedRecovery=null;
  $('issuedCode').textContent='';$('issuedCodeBox').hidden=true;
}
function bind(){
  soundManager=mountAudioPanel({
    initialEnabled:state.audio,
    onToggle:(enabled)=>{audioPreferenceSet=true;setSound(enabled);}
  });
  $('drawOne').onclick=()=>openPack(1);$('drawFive').onclick=()=>openPack(5);
  $('packPicker').onchange=()=>void syncPackArtwork();
  $('stageRevealAll').onclick=revealAll;
  $('stageFinish').onclick=reset;$('stageClose').onclick=reset;
  $('splashClose').onclick=(event)=>{event.stopPropagation();closeRaritySplash()};
  $('raritySplash').addEventListener('click',()=>{if(!$('raritySplash').hidden)closeRaritySplash()});
  $('concertIntroSkip').onclick=closeConcertIntro;
  $('collectionOpen').onclick=async()=>{
    if(state.supabase)await loadPublishedCatalog().catch(err=>console.warn('카드 목록 갱신 실패',err));
    if(isNamedAccount())await syncRemote();
    renderCollection();openModal('collectionOverlay');
  };
  $('collectionClose').onclick=()=>closeModal('collectionOverlay');
  $('oddsOpen').onclick=()=>openModal('oddsOverlay');$('oddsClose').onclick=()=>closeModal('oddsOverlay');
  $('loginButton').onclick=()=>accountOpen(false);$('accountClose').onclick=accountClose;
  $('accountTabLogin').onclick=()=>setAccountMode('login');
  $('accountTabSignup').onclick=()=>setAccountMode('signup');
  $('accountForm').onsubmit=submitAccount;
  $('guestPlay').onclick=chooseGuest;
  $('accountLogout').onclick=logoutAccount;
  $('issueRecoveryCode').onclick=issueRecovery;$('copyRecoveryCode').onclick=copyRecovery;
  $('restoreRecoveryCode').onclick=restoreRecovery;$('accountRetry').onclick=initBackend;
  ['collectionOverlay','oddsOverlay','accountOverlay'].forEach(id=>$(id).addEventListener('click',e=>{
    if(e.target===$(id)){if(id==='accountOverlay')accountClose();else closeModal(id)}
  }));
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'){
      if(!$('concertIntro').hidden){closeConcertIntro();return}
      if(!$('raritySplash').hidden){closeRaritySplash();return}
      if(!$('packRevealStage').hidden){reset();return}
      closeModal('collectionOverlay');closeModal('oddsOverlay');accountClose();
    }
    if(e.key==='Enter'&&document.activeElement===$('recoveryCodeInput'))restoreRecovery();
  });
  $('oddsRows').innerHTML=TIERS.map(t=>`<div class="odds-row"><div class="odds-tier"><span class="odds-chip ${t.key==='UR'?'holo':''}" style="background:${tierCssGradient(t.key)}">${t.key}</span><strong>${t.label}</strong></div><span>${t.chance}%</span></div>`).join('');
  fillConcertCrowd();showControls(['drawOne','drawFive']);updateCounts();updateLogin();syncCanvasPointerEvents();
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='visible'&&state.supabase){
      void loadPublishedCatalog().then(()=>{
        if($('collectionOverlay').classList.contains('active'))renderCollection();
      }).catch(e=>console.warn('Catalog refresh skipped',e));
    }
  });
}
bind();
const stageReady=init3D();
initBackend();

async function enterConcert(){
  const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const logo=$('concertIntro').querySelector('img');
  await Promise.race([logo.decode().catch(()=>{}),delay(3000)]);
  // Give the static brand a painted frame even on a fully cached visit.
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  await Promise.all([delay(450),Promise.race([stageReady,delay(8000)])]);
  showConcertIntro();
}
enterConcert();
