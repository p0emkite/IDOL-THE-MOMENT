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
    old.dispose();
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
const TIERS = [
  {key:'N',label:'N · Normal',chance:55,color:'#cdd2e1'},
  {key:'R',label:'R · Rare',chance:28,color:'#59d0ff'},
  {key:'SR',label:'SR · Super Rare',chance:12,color:'#ae8aff'},
  {key:'SSR',label:'SSR · Special Super Rare',chance:4,color:'#ffce6e'},
  {key:'UR',label:'UR · Ultra Rare',chance:1,color:'#ff82d8'},
];
const PACK_OPEN_DURATION = 2650;
function readDemoInventory(){try{return JSON.parse(localStorage.getItem('itm-test-pack-inventory-v1')||'{}')||{}}catch{return {}}}
function writeDemoInventory(){try{localStorage.setItem('itm-test-pack-inventory-v1',JSON.stringify(state.demoInventory))}catch{}}

const state = {phase:'ready',cards:[],revealed:new Set(),inventory:readLocal(),demoInventory:readDemoInventory(),supabase:null,user:null,playerId:null,hasRecovery:false,authError:null,backendReady:false,accountBusy:false,issuedRecovery:null,three:false,audio:false,busy:false};
let scene,renderer,camera,pack,packRim,packParts,packTop,packBottom,packSeam,cardMeshes=[],dust,halos,stageLights=[],THREE,clock,lastTime=0,openingAt=0,audioContext=null;
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
function tone(rarity){return TIERS.find(t=>t.key===rarity)?.color||'#fff'}
function flash(rarity){const f=$('flash');f.style.background=`radial-gradient(ellipse at center,#fff 0%,${tone(rarity)}b9 13%,#b76aff53 34%,transparent 68%)`;f.classList.add('active');setTimeout(()=>f.classList.remove('active'),rarity==='UR'?650:270)}
let toastTimer;
function toast(msg){const t=$('toast');t.textContent=msg;t.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('visible'),2900)}
function chime(freq=523,intensity=.13){if(!state.audio)return;try{audioContext ||= new(window.AudioContext||window.webkitAudioContext)();audioContext.resume();const now=audioContext.currentTime;[1,1.498,2].forEach((factor,i)=>{const o=audioContext.createOscillator(),g=audioContext.createGain();o.type=i===0?'sine':'triangle';o.frequency.value=freq*factor;g.gain.setValueAtTime(0,now+i*.07);g.gain.linearRampToValueAtTime(intensity/(i+1),now+i*.07+.02);g.gain.exponentialRampToValueAtTime(.0001,now+i*.07+.48);o.connect(g).connect(audioContext.destination);o.start(now+i*.07);o.stop(now+i*.07+.5)})}catch{}}
function toggleAudio(){state.audio=!state.audio;$('audioToggle').textContent=state.audio?'♫ SOUND ON':'♪ SOUND OFF';$('audioToggle').setAttribute('aria-pressed',String(state.audio));if(state.audio)chime()}
// All cards use generated fictional/sample illustration. Real artist pictures can replace this asset layer.
const artCache=new Map();
function makeCardArt(card){
  if(artCache.has(card.id))return artCache.get(card.id);
  const c=document.createElement('canvas');c.width=1024;c.height=1492;const g=c.getContext('2d');g.scale(2,2);
  const tier=tone(card.rarity),hue=card.tint;
  let bg=g.createLinearGradient(0,0,512,746);bg.addColorStop(0,'#161525');bg.addColorStop(.4,hue);bg.addColorStop(.7,'#332343');bg.addColorStop(1,'#090b19');g.fillStyle=bg;g.fillRect(0,0,512,746);
  // soft stage light
  let beam=g.createRadialGradient(246,258,10,260,280,340);beam.addColorStop(0,'#ffffff9d');beam.addColorStop(.35,tier+'66');beam.addColorStop(1,'#1a163000');g.fillStyle=beam;g.fillRect(0,0,512,690);
  // decorative spotlight strokes
  g.save();g.globalAlpha=.2;g.strokeStyle='#fff';for(let i=0;i<15;i++){g.beginPath();g.moveTo(256,40);g.lineTo(i*44-70,600);g.stroke()}g.restore();
  // original stylized person silhouette, not a photograph or portrayal of a real idol
  const x=255+(card.seed-.5)*36;
  g.save();g.shadowColor='#170f31';g.shadowBlur=36;
  const hair=g.createLinearGradient(80,0,390,520);hair.addColorStop(0,'#2d2541');hair.addColorStop(.5,'#120d23');hair.addColorStop(1,'#66517d');g.fillStyle=hair;
  g.beginPath();g.ellipse(x,295,133,168,-.06,0,Math.PI*2);g.fill();
  g.beginPath();g.moveTo(115,665);g.bezierCurveTo(100,525,135,459,x-65,442);g.lineTo(x+68,438);g.bezierCurveTo(380,490,428,525,413,665);g.closePath();g.fill();
  const skin=g.createLinearGradient(x-70,190,x+100,470);skin.addColorStop(0,'#f7dfd8');skin.addColorStop(.54,'#d6a6a6');skin.addColorStop(1,'#b47b91');g.fillStyle=skin;
  g.beginPath();g.ellipse(x,314,83,117,.02,0,Math.PI*2);g.fill();
  g.fillStyle=hair;g.beginPath();g.moveTo(x-112,276);g.quadraticCurveTo(x-135,130,x-14,140);g.quadraticCurveTo(x+100,118,x+102,259);g.quadraticCurveTo(x+50,217,x+9,221);g.quadraticCurveTo(x-52,270,x-112,276);g.fill();
  g.strokeStyle='#4a344a';g.lineWidth=4;g.beginPath();g.moveTo(x-52,321);g.quadraticCurveTo(x-31,311,x-17,320);g.moveTo(x+18,320);g.quadraticCurveTo(x+40,312,x+53,322);g.stroke();
  g.strokeStyle='#9b627b';g.lineWidth=3;g.beginPath();g.arc(x,365,13,.1,Math.PI-.1);g.stroke();
  const outfit=g.createLinearGradient(80,450,425,746);outfit.addColorStop(0,'#1e193d');outfit.addColorStop(.5,tier);outfit.addColorStop(1,'#120b2e');g.fillStyle=outfit;g.beginPath();g.moveTo(112,640);g.quadraticCurveTo(96,515,204,479);g.lineTo(256,520);g.lineTo(310,478);g.quadraticCurveTo(414,512,423,640);g.lineTo(420,746);g.lineTo(110,746);g.closePath();g.fill();
  g.restore();
  let lower=g.createLinearGradient(0,470,0,746);lower.addColorStop(0,'#0c0a1a00');lower.addColorStop(.65,'#0907168c');lower.addColorStop(1,'#050610');g.fillStyle=lower;g.fillRect(0,450,512,296);
  if(card.rarity==='SSR'||card.rarity==='UR'){
    g.save();for(let i=0;i<28;i++){g.globalAlpha=.12+(i%4)*.08;g.fillStyle=i%2?'#fff':tier;g.beginPath();let xx=((i*137)%490)+8,yy=((i*197)%590)+50;g.arc(xx,yy,i%5===0?4:2,0,Math.PI*2);g.fill()}g.restore();
  }
  g.strokeStyle=tier;g.lineWidth=7;g.strokeRect(14,14,484,718);g.strokeStyle='#ffffff9a';g.lineWidth=1.5;g.strokeRect(25,25,462,696);
  g.fillStyle='#f9f0ff';g.textAlign='left';g.font='bold 24px system-ui';g.fillText('✳  ITM',47,68);
  g.textAlign='right';g.font='bold 15px system-ui';g.fillText('STAGE 001',466,65);
  g.textAlign='left';g.font='700 14px system-ui';g.fillStyle=tier;g.fillText(card.group+' • '+card.edition,47,598);
  g.font='900 62px Arial, sans-serif';g.fillStyle='#fff';g.shadowColor='#000a';g.shadowBlur=20;g.fillText(card.name,44,660);g.shadowBlur=0;
  g.font='700 17px system-ui';g.fillStyle=tier;g.fillText(card.rarity,47,695);
  g.textAlign='right';g.font='11px monospace';g.fillStyle='#f7e9fc';g.fillText('DEMO ART / #'+card.id.split('-').slice(-1).join(''),465,697);
  artCache.set(card.id,c);return c;
}
function makeBackTexture(){const c=document.createElement('canvas');c.width=512;c.height=746;const g=c.getContext('2d');const b=g.createLinearGradient(0,0,512,746);b.addColorStop(0,'#300d51');b.addColorStop(.5,'#100d2c');b.addColorStop(1,'#68307b');g.fillStyle=b;g.fillRect(0,0,512,746);g.strokeStyle='#e7a3f7';g.lineWidth=8;g.strokeRect(18,18,476,710);g.strokeStyle='#ffffff70';g.lineWidth=1.4;g.strokeRect(34,34,444,678);for(let i=0;i<7;i++){g.save();g.translate(256,360);g.rotate(i*Math.PI/7);g.strokeStyle='#e99cea44';g.beginPath();g.ellipse(0,0,160,250,0,0,Math.PI*2);g.stroke();g.restore()}g.textAlign='center';g.fillStyle='#ffaedc';g.font='120px serif';g.fillText('✳',256,382);g.fillStyle='#fff';g.font='900 43px system-ui';g.fillText('ITM',256,457);g.font='bold 15px system-ui';g.fillStyle='#e9badb';g.fillText('IDOL : THE MOMENT',256,493);return c}
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
function makePackTexture(){const c=document.createElement('canvas');c.width=1024;c.height=1580;const g=c.getContext('2d');g.scale(2,2);const b=g.createLinearGradient(0,0,512,790);b.addColorStop(0,'#251146');b.addColorStop(.2,'#d663bd');b.addColorStop(.42,'#6a4bc2');b.addColorStop(.62,'#140e35');b.addColorStop(.79,'#b973c2');b.addColorStop(1,'#4b1b72');g.fillStyle=b;g.fillRect(0,0,512,790);for(let i=-12;i<24;i++){g.strokeStyle=`rgba(255,255,255,${.035+(i%4)*.015})`;g.lineWidth=8;g.beginPath();g.moveTo(i*38,0);g.lineTo(i*38+250,790);g.stroke()}g.strokeStyle='#fff6';g.lineWidth=3;g.strokeRect(22,20,468,750);g.strokeStyle='#f8d2fb';g.lineWidth=1;g.strokeRect(31,30,450,732);let bloom=g.createRadialGradient(256,335,0,256,360,240);bloom.addColorStop(0,'#fff9');bloom.addColorStop(.35,'#fc93f77a');bloom.addColorStop(1,'#dd88fe00');g.fillStyle=bloom;g.fillRect(0,100,512,500);g.textAlign='center';g.fillStyle='#fff';g.font='bold 17px system-ui';g.fillText('✦   THE FIRST SHOWCASE   ✦',256,93);g.font='130px Georgia';g.fillText('✳',256,384);g.font='900 72px system-ui';g.fillText('ITM',256,492);g.font='bold 18px system-ui';g.fillText('IDOL : THE MOMENT',256,535);g.font='bold 19px system-ui';g.fillText('DEBUT COLLECTION',256,654);g.font='11px monospace';g.fillText('ONE UNFORGETTABLE MOMENT AWAITS',256,702);if(loaded(brandLogo)){const logo=logoForPack();g.save();g.shadowColor='#ff8bdf';g.shadowBlur=20;g.drawImage(logo,116,260,280,280);g.restore()}return c}
function texture(c){const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=Math.min(renderer.capabilities.getMaxAnisotropy(),8);return t}
let backTexture,packTexture;
function makePackPartGeometry(height,uvStart,uvSize){
  const geometry=new THREE.BoxGeometry(2.55,height,.23),uv=geometry.attributes.uv;
  for(let i=0;i<uv.count;i++)uv.setY(i,uv.getY(i)*uvSize+uvStart);
  return geometry;
}
function initScene(){
  const canvas=$('threeCanvas');renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.7));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.55;
  scene=new THREE.Scene();scene.fog=new THREE.FogExp2(0x0d061a,.045);camera=new THREE.PerspectiveCamera(42,1,.1,100);camera.position.set(0,.2,10.7);
  scene.add(new THREE.AmbientLight(0xb5a0e8,1.7));
  const p1=new THREE.PointLight(0xff78c3,55,13);p1.position.set(-4,4,4);scene.add(p1);const p2=new THREE.PointLight(0x9470ff,50,13);p2.position.set(4,2,2);scene.add(p2);
  const p3=new THREE.PointLight(0xf9f2ff,21,15);p3.position.set(0,4,8);scene.add(p3);
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(32,22),new THREE.MeshPhongMaterial({color:0x18102a,transparent:true,opacity:.27,shininess:95,side:THREE.DoubleSide}));floor.rotation.x=-Math.PI/2;floor.position.y=-3.8;scene.add(floor);
  for(let i=0;i<4;i++){let ring=new THREE.Mesh(new THREE.TorusGeometry(2+i*.53,.008,5,128),new THREE.MeshBasicMaterial({color:i%2?0xc283f9:0xec81ba,transparent:true,opacity:.22-i*.035,depthWrite:false}));ring.rotation.x=-Math.PI/2;ring.position.y=-3.69+i*.002;scene.add(ring)}
  for(let i=0;i<4;i++){let cone=new THREE.Mesh(new THREE.ConeGeometry(2,10,32,1,true),new THREE.MeshBasicMaterial({color:i%2?0xd576ff:0xff86bf,transparent:true,opacity:.04,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending}));cone.position.set(-4+i*2.65,3.4,-4);cone.rotation.z=.1+(i-2)*.14;cone.rotation.x=Math.PI;scene.add(cone);stageLights.push(cone)}
  const points=1200,positions=new Float32Array(points*3),colors=new Float32Array(points*3);for(let i=0;i<points;i++){positions[i*3]=(rand()-.5)*27;positions[i*3+1]=(rand()-.5)*19;positions[i*3+2]=(rand()-.5)*21-5;const p=new THREE.Color().setHSL(.78+rand()*.17,.65,.55+rand()*.4);colors.set([p.r,p.g,p.b],i*3)}const geom=new THREE.BufferGeometry();geom.setAttribute('position',new THREE.BufferAttribute(positions,3));geom.setAttribute('color',new THREE.BufferAttribute(colors,3));dust=new THREE.Points(geom,new THREE.PointsMaterial({size:.036,vertexColors:true,transparent:true,opacity:.75,depthWrite:false,blending:THREE.AdditiveBlending}));scene.add(dust);
  backTexture=texture(loaded(brandCardBack)?brandCardBack:makeBackTexture());packTexture=texture(makePackTexture());
  const face=new THREE.MeshPhysicalMaterial({map:packTexture,metalness:.3,roughness:.28,clearcoat:1,clearcoatRoughness:.13,side:THREE.DoubleSide});const side=new THREE.MeshPhysicalMaterial({color:0xe9a0e0,metalness:.78,roughness:.24,clearcoat:1});
  pack=new THREE.Mesh(new THREE.BoxGeometry(2.55,3.83,.23),[side,side,side,side,face,face]);pack.rotation.y=-.32;scene.add(pack);
  // Split the foil using top and bottom meshes with independently cropped UVs.
  packParts=new THREE.Group();
  const cutHeight=.95,bottomHeight=3.83-cutHeight,bottomUv=bottomHeight/3.83;
  packTop=new THREE.Mesh(makePackPartGeometry(cutHeight,bottomUv,cutHeight/3.83),[side,side,side,side,face,face]);
  packBottom=new THREE.Mesh(makePackPartGeometry(bottomHeight,0,bottomUv),[side,side,side,side,face,face]);
  packTop.position.y=bottomHeight/2;packBottom.position.y=-cutHeight/2;
  packSeam=new THREE.Mesh(new THREE.PlaneGeometry(2.64,.07),new THREE.MeshBasicMaterial({color:0xffe6ff,transparent:true,opacity:.9,depthWrite:false,blending:THREE.AdditiveBlending}));
  packSeam.position.set(0,3.83/2-cutHeight,.15);
  packParts.add(packTop,packBottom,packSeam);packParts.visible=false;scene.add(packParts);
  packRim=new THREE.Mesh(new THREE.BoxGeometry(2.62,3.9,.2),new THREE.MeshBasicMaterial({color:0xcc73ff,transparent:true,opacity:.16,wireframe:true,depthWrite:false}));scene.add(packRim);
  window.addEventListener('resize',resizeScene,{passive:true});resizeScene();
  const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();canvas.addEventListener('pointerdown',(e)=>{if(state.phase!=='reveal')return;const b=canvas.getBoundingClientRect();pointer.x=((e.clientX-b.left)/b.width)*2-1;pointer.y=-((e.clientY-b.top)/b.height)*2+1;raycaster.setFromCamera(pointer,camera);const hit=raycaster.intersectObjects(cardMeshes);if(hit.length)revealIndex(hit[0].object.userData.index)});
  renderer.setAnimationLoop(frame);state.three=true;
}
function resizeScene(){if(!renderer)return;const r=$('sceneWrap').getBoundingClientRect(),full=document.body.classList.contains('pack-cinematic');const w=Math.max(250,r.width*(full?1:1.36)),h=Math.max(260,r.height*(full?1:1.3));renderer.setSize(w,h,false);camera.aspect=w/h;camera.position.z=window.innerWidth<780?12.8:10.7;camera.updateProjectionMatrix()}
function frame(now){
  const t=now*.001,delta=Math.min(.05,t-lastTime||.016);lastTime=t;
  const ready=state.phase==='ready',opening=state.phase==='opening';
  if(pack){
    const elapsed=opening?Math.max(0,t-openingAt):0,progress=opening?clamp(elapsed/(PACK_OPEN_DURATION/1000),0,1):0;
    const tear=opening?clamp((elapsed-1.3)/1.2,0,1):0,split=EASE(tear);
    pack.position.y=Math.sin(t*1.2)*.14+(opening?Math.min(1,elapsed/1.1)*.45:0);
    pack.rotation.y=-.28+Math.sin(t*.7)*.24+(opening?Math.sin(t*36)*.14:0);
    pack.rotation.z=opening?Math.sin(t*(18+progress*38))*(.025+progress*.15):Math.sin(t*.5)*.025;
    pack.scale.setScalar(opening?1+EASE(progress)*.65:1);
    pack.visible=(ready||opening)&&tear<=.001;
    packRim.visible=pack.visible;
    packRim.position.copy(pack.position);packRim.rotation.copy(pack.rotation);packRim.scale.copy(pack.scale);
    packParts.visible=opening&&tear>.001;
    if(packParts.visible){
      packParts.position.copy(pack.position);packParts.rotation.copy(pack.rotation);packParts.scale.copy(pack.scale);
      packTop.position.y=(3.83-.95)/2+split*1.25;
      packTop.rotation.z=split*-.21;packTop.rotation.x=split*.12;
      packBottom.position.y=-.95/2-split*.48;packBottom.rotation.z=split*.07;
      packSeam.material.opacity=(1-tear)*.95;
    }
  }
  
if(dust){dust.rotation.y+=delta*.015;dust.rotation.z+=delta*.01}stageLights.forEach((cone,i)=>cone.rotation.z=Math.sin(t*.4+i)*.23);
  const n=cardMeshes.length;cardMeshes.forEach((mesh,i)=>{const revealed=state.revealed.has(i);const mobile=window.innerWidth<780;const spread=n===1?0:(mobile?1.18:1.47);const targetX=(i-(n-1)/2)*spread;const targetY=.14+Math.sin(t*1.3+i)*.055;mesh.position.x+=(targetX-mesh.position.x)*Math.min(1,delta*4.2);mesh.position.y+=(targetY-mesh.position.y)*Math.min(1,delta*4.2);mesh.position.z+=(0-mesh.position.z)*Math.min(1,delta*3);const targetR=revealed?Math.PI*2:Math.PI;mesh.rotation.y+=(targetR-mesh.rotation.y)*Math.min(1,delta*(revealed?3.2:4.8));mesh.rotation.z=((i-(n-1)/2)*(mobile?-.035:-.043))+Math.sin(t*.7+i)*.012;const targetScale=(revealed&&['SSR','UR'].includes(state.cards[i].rarity))?1.07:1;mesh.scale.lerp(new THREE.Vector3(targetScale,targetScale,targetScale),Math.min(1,delta*3))});
  renderer.render(scene,camera)}
function addCards(){cardMeshes.forEach(mesh=>{scene.remove(mesh);mesh.geometry.dispose();mesh.material.forEach(m=>{if(m.map && m.map!==backTexture)m.map.dispose();m.dispose()})});cardMeshes=[];
  const n=state.cards.length;state.cards.forEach((c,i)=>{const front=texture(makeCardArt(c));const edge=new THREE.MeshPhysicalMaterial({color:new THREE.Color(tone(c.rarity)),metalness:.65,roughness:.2});const card=new THREE.Mesh(new THREE.BoxGeometry(1.56,2.3,.04),[edge,edge,edge,edge,new THREE.MeshBasicMaterial({map:front}),new THREE.MeshBasicMaterial({map:backTexture})]);card.position.set((i-(n-1)/2)*.25,-4,-i*.07);card.rotation.y=Math.PI;card.userData.index=i;cardMeshes.push(card);scene.add(card)})}
function clearCards(){cardMeshes.forEach(mesh=>{scene.remove(mesh);mesh.geometry.dispose();mesh.material.forEach(m=>{if(m.map&&m.map!==backTexture)m.map.dispose();m.dispose()})});cardMeshes=[]}
function showControls(which){['drawOne','drawFive','revealNext','revealAll','nextPack'].forEach(id=>$(id).hidden=!which.includes(id))}
function updateCounts(){let total=Object.values(state.demoInventory).reduce((a,n)=>a+Number(n||0),0);$('collectionCount').textContent=total}
// Immersive reveal UI: real interactive, keyboard-accessible flip cards.
function renderRevealStage(){
  const stage=$('packRevealStage'),rail=$('stageCardRail');
  rail.replaceChildren();rail.classList.toggle('one-card',state.cards.length===1);
  state.cards.forEach((card,i)=>{
    const button=document.createElement('button');
    button.type='button';button.className='stage-card-button rarity-'+card.rarity.toLowerCase();
    button.style.setProperty('--arrive-delay',i*125+'ms');
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
    rail.append(button);
  });
  stage.hidden=false;stage.setAttribute('aria-hidden','false');document.body.classList.add('pack-revealing');
  $('stageHint').textContent='카드를 눌러 어떤 등급이 나왔는지 확인해 보세요.';
  updateStageProgress();
  $('stageRevealNext').focus({preventScroll:true});
}
function updateStageProgress(){
  const total=state.cards.length,done=state.revealed.size;
  $('stageProgress').textContent=done+' / '+total+' REVEALED';
  $('stageRevealNext').hidden=done===total;
  $('stageRevealAll').hidden=done===total;
  $('stageFinish').hidden=done!==total;
}
function stageBurst(card){
  if(!card||card.rarity==='N')return;
  const klass='rarity-'+card.rarity.toLowerCase(),fx=$('stageBurst'),banner=$('stageRarityBanner');
  fx.className='stage-burst';banner.className='stage-rarity-banner';
  void fx.offsetWidth; // replay CSS animation for each newly revealed card
  fx.className='stage-burst '+klass+' active';
  banner.textContent=card.rarity==='UR'?'ULTRA RARE':card.rarity==='SSR'?'SPECIAL SUPER RARE':card.rarity==='SR'?'SUPER RARE':'RARE';
  banner.className='stage-rarity-banner '+klass+' active';
}
function openPack(count){
  if(state.busy||state.phase!=='ready')return;
  // Deliberate isolated QA mode. Never call the legacy Supabase pack RPC:
  // the old server card pool does not yet have the new N/R/SR/SSR/UR catalog.
  state.busy=true;$('drawOne').disabled=$('drawFive').disabled=true;
  const rolled=drawDemo(count);
  if(!rolled.length){state.busy=false;toast('테스트 카드풀이 비어 있어.');return}
  state.cards=rolled;state.revealed=new Set();
  for(const card of rolled)state.demoInventory[card.id]=(state.demoInventory[card.id]||0)+1;
  writeDemoInventory();updateCounts();
  state.phase='opening';openingAt=performance.now()*.001;
  document.body.classList.add('pack-cinematic');requestAnimationFrame(resizeScene);
  showControls([]);$('controlHeading').textContent='봉인을 해제하고 있어요…';
  $('sceneHeading').textContent='02 — BREAK THE SEAL';
  $('centerHint').innerHTML='<span>✦</span> UNSEALING YOUR MOMENT';
  chime(329,.2);
  setTimeout(()=>{
    if(state.phase!=='opening')return;
    document.body.classList.remove('pack-cinematic');requestAnimationFrame(resizeScene);
    state.phase='reveal';state.busy=false;
    if(state.three)addCards();else renderFallbackCards();
    $('controlHeading').textContent='한 장씩 뒤집어 카드의 등급을 확인해 봐.';
    $('sceneHeading').textContent='03 — YOUR CARDS AWAIT';
    $('centerHint').innerHTML='<span>✧</span> TAP A CARD TO REVEAL';
    showControls(['revealNext','revealAll']);
    $('revealCounter').textContent='0 / '+state.cards.length;
    $('drawOne').disabled=$('drawFive').disabled=false;
    renderRevealStage();
  },PACK_OPEN_DURATION);
}
function revealIndex(i,silent=false){
  if(state.phase!=='reveal'||state.revealed.has(i)||i<0||i>=state.cards.length)return;
  state.revealed.add(i);
  const card=state.cards[i],button=$('stageCardRail').children[i],tier=TIERS.find(t=>t.key===card.rarity);
  if(button){
    button.classList.add('is-revealed');
    button.setAttribute('aria-label',card.rarity+' '+card.name+' 공개됨');
    button.setAttribute('aria-pressed','true');
    if(!silent)button.scrollIntoView({behavior:'smooth',block:'nearest',inline:'center'});
  }
  if(!silent){
    const freq={N:440,R:523,SR:659,SSR:784,UR:1047}[card.rarity]||523;
    chime(freq,card.rarity==='UR'?.26:card.rarity==='SSR'?.19:.09);
    stageBurst(card);
  }
  $('stageHint').textContent=(tier?.label||card.rarity)+' · '+card.group+' '+card.name+' 발견!';
  $('revealCounter').textContent=state.revealed.size+' / '+state.cards.length;
  updateStageProgress();
  if(!state.three)renderFallbackCards();
  if(state.revealed.size===state.cards.length){
    $('controlHeading').textContent='모든 카드를 확인했어! 테스트 도감에 기록됐어.';
    $('sceneHeading').textContent='04 — A MOMENT TO REMEMBER';
    $('centerHint').innerHTML='<span>✦</span> COLLECTION UPDATED';
    $('stageHint').textContent='모든 카드가 공개됐어! ✦ 테스트 도감에서 다시 볼 수 있어.';
    showControls(['nextPack']);
  }
}
function revealNext(){const i=state.cards.findIndex((_,j)=>!state.revealed.has(j));if(i>=0)revealIndex(i)}
function revealAll(){
  const hidden=state.cards.filter((_,i)=>!state.revealed.has(i));
  if(!hidden.length)return;
  state.cards.forEach((_,i)=>{if(!state.revealed.has(i))revealIndex(i,true)});
  const rank={N:0,R:1,SR:2,SSR:3,UR:4};
  const highest=hidden.reduce((a,b)=>(!a||rank[b.rarity]>rank[a.rarity])?b:a,null);
  if(highest){chime(highest.rarity==='UR'?1047:784,.2);stageBurst(highest)}
}
function reset(){
  document.body.classList.remove('pack-cinematic','pack-revealing');
  const stage=$('packRevealStage');stage.hidden=true;stage.setAttribute('aria-hidden','true');
  $('stageBurst').className='stage-burst';$('stageRarityBanner').className='stage-rarity-banner';
  requestAnimationFrame(resizeScene);
  state.phase='ready';state.cards=[];state.revealed.clear();state.busy=false;
  clearCards();if(!state.three)resetFallback();
  showControls(['drawOne','drawFive']);$('drawOne').disabled=$('drawFive').disabled=false;
  $('controlHeading').textContent='어떤 순간을 열어볼까?';
  $('sceneHeading').textContent='01 — THE SEALED MOMENT';
  $('centerHint').innerHTML='<span>✧</span> THE SHOW IS ABOUT TO BEGIN';
}

function resetFallback(){const f=$('canvasFallback');f.style.flexDirection='column';f.style.flexWrap='nowrap';f.innerHTML='<div class="fallback-pack"><div class="fallback-pack-inner"><img src="./assets/itm-logo.png" alt="ITM" onerror="this.hidden=true" /><b hidden>ITM</b><small>DEBUT COLLECTION</small></div></div><p>3D 라이브러리가 연결되지 않아 가벼운 2D 미리보기를 표시합니다.</p>'}
function renderFallbackCards(){const f=$('canvasFallback');f.innerHTML='';f.style.flexDirection='row';f.style.flexWrap='wrap';state.cards.forEach((c,i)=>{const el=document.createElement('img');el.src=state.revealed.has(i)?makeCardArt(c).toDataURL():(loaded(brandCardBack)?brandCardBack.src:makeBackTexture().toDataURL());el.alt=state.revealed.has(i)?c.name:'뒷면';el.style.cssText='width:clamp(70px,15%,130px);aspect-ratio:1/1.48;object-fit:cover;box-shadow:0 4px 25px #000a;cursor:pointer';el.onclick=()=>revealIndex(i);f.appendChild(el)})}
function openModal(id){$(id).classList.add('active');$(id).setAttribute('aria-hidden','false')}
function closeModal(id){$(id).classList.remove('active');$(id).setAttribute('aria-hidden','true')}
function renderCollection(){const ids=Object.entries(state.demoInventory).filter(([id,q])=>Number(q)>0&&byId.has(id));const unique=ids.length;$('collectionSummary').textContent=`DISCOVERED ${unique} / ${POOL.length}   •   OWNED ${ids.reduce((sum,[,q])=>sum+Number(q),0)} CARDS`;const grid=$('collectionGrid');grid.replaceChildren();if(!ids.length){const p=document.createElement('p');p.className='collection-empty';p.textContent='아직 수집한 카드가 없어. 첫 번째 팩을 열어봐 ✦';grid.append(p)}ids.sort((a,b)=>POOL.findIndex(c=>c.id===a[0])-POOL.findIndex(c=>c.id===b[0])).forEach(([id,qty])=>{let card=byId.get(id),box=document.createElement('div');box.className='col-item';let img=document.createElement('img');img.src=makeCardArt(card).toDataURL();img.alt=`${card.group} ${card.name}`;let q=document.createElement('span');q.className='qty';q.textContent='×'+qty;let title=document.createElement('strong');title.textContent=card.group+' · '+card.name;let sub=document.createElement('small');sub.style.color=tone(card.rarity);sub.textContent=card.rarity;box.append(img,q,title,sub);grid.append(box)})}
async function syncRemote(){
  if(!state.supabase||!state.playerId)return false;
  const {data,error}=await state.supabase.from('user_inventory').select('card_id,quantity');
  if(error){toast('도감 동기화 오류: '+error.message);return false}
  state.inventory=Object.fromEntries((data||[]).map(r=>[r.card_id,r.quantity]));
  updateCounts();
  if($('collectionOverlay').classList.contains('active'))renderCollection();
  return true;
}
function updateLogin(){
  const btn=$('loginButton');
  btn.textContent=state.playerId?'✦ ITM ID':state.supabase?'◌ 연결 확인':'◌ DEMO MODE';
  btn.title=state.playerId?'복구 코드와 다른 기기 연결':'ITM ID 연결 상태';
  $('accountStatus').textContent=state.playerId?'게스트 도감이 서버에 연결되었어!':state.authError?'서버 계정 연결이 필요해':'서버 연결 중…';
  $('accountPlayerId').textContent=state.playerId?'PLAYER ID · '+state.playerId.slice(0,8).toUpperCase()+(state.hasRecovery?' · 복구 코드 발급됨':' · 복구 코드 미발급'):
    (state.authError||'계정 상태를 확인하고 있어요.');
  $('accountRetry').hidden=!!state.playerId;
  $('issueRecoveryCode').disabled=!state.playerId||state.accountBusy;
  $('restoreRecoveryCode').disabled=!state.playerId||state.accountBusy;
  $('collectionFooter').textContent=state.playerId?'클라우드에 저장된 도감이야. 다른 기기에서는 ITM ID 복구 코드로 연결할 수 있어.':'이 화면의 도감은 로컬 데모일 수 있어. ITM ID 연결 후 서버에 저장돼.';
  const bar=$('accountStatus').closest('.identity-bar');
  bar.dataset.connected=String(!!state.playerId);
}
function setAccountMessage(message){$('accountMessage').textContent=message;}
function accountOpen(){updateLogin();openModal('accountOverlay')}
async function connectGuest(){
  if(!state.supabase||state.connecting)return;
  state.connecting=true;
  state.authError=null;updateLogin();
  try{
    const {data:sessionData,error:sessionError}=await state.supabase.auth.getSession();
    if(sessionError)throw sessionError;
    let user=sessionData?.session?.user;
    if(!user){
      const {data,error}=await state.supabase.auth.signInAnonymously();
      if(error)throw error;
      user=data.user;
    }
    if(!user)throw new Error('게스트 계정 생성에 실패했어.');
    state.user=user;
    const {data:playerId,error:playerError}=await state.supabase.rpc('ensure_guest_player');
    if(playerError)throw playerError;
    state.playerId=playerId;
    await syncRemote();
    const {data:backup,error:backupError}=await state.supabase.rpc('has_recovery_code');
    if(!backupError)state.hasRecovery=!!backup;
    state.authError=null;
    updateLogin();
    setAccountMessage('게스트 도감 연결 완료! 복구 코드를 발급해 두면 새 휴대폰·PC에서도 같은 도감을 사용할 수 있어.');
  }catch(err){
    state.authError=(err?.message||String(err));
    state.playerId=null;
    updateLogin();
    setAccountMessage('계정 연결 실패: '+state.authError+' · Supabase에서 Anonymous Sign-Ins가 켜져 있는지도 확인해 줘.');
    console.warn('Anonymous authentication failed',err);
  }finally{state.connecting=false;}
}
async function initBackend(){
  if(!CONFIG.supabaseUrl||!CONFIG.supabasePublishableKey){state.authError='Supabase 설정이 필요해.';state.backendReady=true;updateLogin();return}
  try{
    if(!state.supabase){
      const mod=await import('https://esm.sh/@supabase/supabase-js@2.57.0');
      state.supabase=mod.createClient(CONFIG.supabaseUrl,CONFIG.supabasePublishableKey);
    }
    await connectGuest();
    state.backendReady=true;
  }catch(err){
    state.authError='Supabase 스크립트 연결 실패: '+(err?.message||String(err));
    state.backendReady=true;updateLogin();console.error(err);
  }
}
async function issueRecovery(){
  if(state.accountBusy)return;
  if(!state.supabase||!state.playerId)return toast('서버 계정 연결 후 사용할 수 있어.');
  if(state.hasRecovery&&!window.confirm('새 코드를 발급하면 기존 복구 코드는 더 이상 작동하지 않아. 계속할까?'))return;
  state.accountBusy=true;updateLogin();
  try{
    const {data,error}=await state.supabase.rpc('issue_recovery_code');
    if(error)throw error;
    state.issuedRecovery=String(data);state.hasRecovery=true;
    $('issuedCode').textContent=state.issuedRecovery;
    $('issuedCodeBox').hidden=false;
    setAccountMessage('복구 코드가 발급됐어! 이 화면을 닫기 전에 코드를 복사해서 안전한 곳에 보관해 줘. 서버에는 원본 코드를 저장하지 않아.');
    toast('복구 코드가 발급됐어. 반드시 보관해 줘!');
  }catch(err){setAccountMessage('발급 실패: '+(err?.message||String(err)))}
  finally{state.accountBusy=false;updateLogin()}
}
async function copyRecovery(){
  if(!state.issuedRecovery)return;
  try{await navigator.clipboard.writeText(state.issuedRecovery);toast('복구 코드를 복사했어!')}
  catch{window.prompt('복구 코드를 복사해 보관해 줘.',state.issuedRecovery)}
}
async function restoreRecovery(){
  if(state.accountBusy)return;
  if(!state.supabase||!state.playerId)return toast('서버 계정 연결 후 사용할 수 있어.');
  const code=$('recoveryCodeInput').value.trim();
  if(!code)return setAccountMessage('다른 기기에서 발급받은 복구 코드를 입력해 줘.');
  state.accountBusy=true;updateLogin();
  try{
    let {data,error}=await state.supabase.rpc('recover_player',{p_code:code,p_allow_switch:false});
    if(error)throw error;
    if(data?.reason==='confirm_switch'){
      const proceed=window.confirm('이 기기의 '+data.existing_cards+'장 카드 도감은 합쳐지지 않고 별도로 남아. 기존 도감으로 전환할까?');
      if(!proceed){setAccountMessage('도감 전환을 취소했어. 현재 카드 기록은 그대로 유지돼.');return}
      ({data,error}=await state.supabase.rpc('recover_player',{p_code:code,p_allow_switch:true}));
      if(error)throw error;
    }
    if(!data?.ok){
      const msg=data?.reason==='rate_limited'?'입력 횟수가 초과됐어. 약 15분 뒤 다시 시도해 줘.':'복구 코드가 일치하지 않아. 입력한 코드를 확인해 줘.';
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
    setAccountMessage('도감 불러오기 성공! 이 기기에서도 같은 카드와 수집 수량을 사용할 수 있어.');
    toast('✦ 다른 기기의 도감을 불러왔어!');
  }catch(err){setAccountMessage('불러오기 실패: '+(err?.message||String(err)))}
  finally{state.accountBusy=false;updateLogin()}
}
async function init3D(){try{THREE=await import('https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js');initScene();$('canvasFallback').hidden=true;if(state.phase==='reveal'&&state.cards.length)addCards()}catch(err){console.warn('3D unavailable: ',err);$('threeCanvas').style.display='none';$('canvasFallback').hidden=false;resetFallback()}}
function accountClose(){closeModal('accountOverlay');state.issuedRecovery=null;$('issuedCode').textContent='';$('issuedCodeBox').hidden=true;}
function bind(){
  $('audioToggle').onclick=toggleAudio;
  $('drawOne').onclick=()=>openPack(1);$('drawFive').onclick=()=>openPack(5);
  $('revealNext').onclick=revealNext;$('revealAll').onclick=revealAll;$('nextPack').onclick=reset;
  $('stageRevealNext').onclick=revealNext;$('stageRevealAll').onclick=revealAll;
  $('stageFinish').onclick=reset;$('stageClose').onclick=reset;
  $('collectionOpen').onclick=()=>{renderCollection();openModal('collectionOverlay')};
  $('collectionClose').onclick=()=>closeModal('collectionOverlay');
  $('oddsOpen').onclick=()=>openModal('oddsOverlay');$('oddsClose').onclick=()=>closeModal('oddsOverlay');
  $('loginButton').onclick=accountOpen;$('accountClose').onclick=accountClose;
  $('issueRecoveryCode').onclick=issueRecovery;$('copyRecoveryCode').onclick=copyRecovery;
  $('restoreRecoveryCode').onclick=restoreRecovery;$('accountRetry').onclick=initBackend;
  ['collectionOverlay','oddsOverlay','accountOverlay'].forEach(id=>$(id).addEventListener('click',e=>{
    if(e.target===$(id)){if(id==='accountOverlay')accountClose();else closeModal(id)}
  }));
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'){if(!$('packRevealStage').hidden){reset();return}closeModal('collectionOverlay');closeModal('oddsOverlay');accountClose()}
    if(e.key==='Enter'&&document.activeElement===$('recoveryCodeInput'))restoreRecovery();
  });
  $('oddsRows').innerHTML=TIERS.map(t=>`<div class="odds-row"><strong style="color:${t.color}">${t.label}</strong><span>${t.chance}%</span></div>`).join('');
  showControls(['drawOne','drawFive']);updateCounts();updateLogin();
}
bind();init3D();initBackend();