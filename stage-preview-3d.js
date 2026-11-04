import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const $ = id => document.getElementById(id);
const root = $('experience'), canvas = $('stage3d'), intro = $('intro');
const mobile = matchMedia('(max-width:720px)').matches;
const reducedMotion = matchMedia('(prefers-reduced-motion:reduce)').matches;
const touch = matchMedia('(pointer:coarse)').matches;
const clamp = (x,a,b) => Math.max(a,Math.min(b,x));
const ease = v => 1-Math.pow(1-clamp(v,0,1),3);
const mix = (a,b,t) => a+(b-a)*t;
const lerpAngle = (a,b,v) => a+(b-a)*v;
const PALETTE = [
 {key:'N',name:'NORMAL',p:.55,colors:['#e3e8f1','#8e99ab','#667282']},
 {key:'R',name:'RARE',p:.28,colors:['#94e1ff','#328fe8','#1854c1']},
 {key:'SR',name:'SUPER RARE',p:.12,colors:['#e0acff','#a45bdf','#7139bd']},
 {key:'SSR',name:'SPECIAL SUPER RARE',p:.04,colors:['#fff6c0','#ffc94b','#d89511']},
 {key:'UR',name:'ULTRA RARE',p:.01,colors:['#56e9ff','#6399ff','#ad7bff','#ff79d9','#ffe586','#84ffd7']}
];
const clock = new THREE.Clock();
const V = (x,y,z)=>new THREE.Vector3(x,y,z);
const state = {
 mode:'loading',width:1,height:1,introStart:0,openStart:0,packCount:1,hasBurst:false,
 cards:[],focus:0,pointerStart:null,mouseX:0,mouseY:0,timers:[],frontTexture:null
};
let renderer,scene,camera,composer,bloom,room,environment;
let stageRig,packRig,foilFront,sealTop,cardRig,backTexture;
let dust,burst,spotRefs=[],ringLights=[],largeFlare;
const MASTER_R=2.72,MASTER_H=4.18;

function timeout(fn,ms){
 const id=setTimeout(fn,ms);
 state.timers.push(id);return id;
}
function clearTimers(){for(const id of state.timers)clearTimeout(id);state.timers=[]}
function lightMaterial(color,intensity=1){
 return new THREE.MeshBasicMaterial({color,transparent:true,opacity:intensity,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,toneMapped:false});
}
function mesh(parent,geometry,material,position,rotation){
 const item=new THREE.Mesh(geometry,material);
 if(position)item.position.copy(position);
 if(rotation)item.rotation.set(rotation.x,rotation.y,rotation.z);
 parent.add(item);return item;
}
function makeLineRing(radius,tube,color,y,alpha=1){
 const ring=mesh(stageRig,new THREE.TorusGeometry(radius,tube,8,144),lightMaterial(color,alpha),V(0,y,0),V(-Math.PI/2,0,0));
 ring.userData.baseAlpha=alpha;ringLights.push(ring);
 return ring;
}
function addLightCone(source,target,radius,color,opacity){
 const displacement=target.clone().sub(source);
 const height=displacement.length();
 const conical=new THREE.ConeGeometry(radius,height,64,1,true);
 const mat=lightMaterial(color,opacity);
 mat.depthTest=false;
 const cone=mesh(scene,conical,mat,source.clone().add(target).multiplyScalar(.5));
 cone.quaternion.setFromUnitVectors(V(0,-1,0),displacement.clone().normalize());
 cone.renderOrder=2;
 return cone;
}
function makeSpot(position,target,color,intensity,angle,shadow=false){
 const spot=new THREE.SpotLight(color,intensity,50,angle,.58,1.3);
 spot.position.copy(position);
 spot.target.position.copy(target);
 spot.castShadow=shadow&&!mobile;
 if(spot.castShadow){
  spot.shadow.mapSize.set(1024,1024);
  spot.shadow.bias=-.00012;
  spot.shadow.normalBias=.02;
 }
 scene.add(spot,spot.target);
 const beam=addLightCone(position,target,5.1,color,angle<.42?.06:.041);
 const bulb=mesh(scene,new THREE.SphereGeometry(.13,16,12),lightMaterial(color,.92),position);
 return {spot,beam,bulb,base:position.clone(),target:target.clone()};
}
function canvasTexture(canvas,w,h){
 const tex=new THREE.CanvasTexture(canvas);
 tex.colorSpace=THREE.SRGBColorSpace;
 tex.anisotropy=Math.min(renderer.capabilities.getMaxAnisotropy(),8);
 tex.wrapS=THREE.ClampToEdgeWrapping;
 tex.wrapT=THREE.ClampToEdgeWrapping;
 return tex;
}
function gradientText(ctx,text,x,y,size,width,colors){
 ctx.save();
 let g=ctx.createLinearGradient(x-width/2,y,x+width/2,y);
 colors.forEach((col,i)=>g.addColorStop(i/(colors.length-1),col));
 ctx.fillStyle=g;ctx.font='italic 900 '+size+'px Georgia,serif';
 ctx.textAlign='center';ctx.shadowBlur=29;ctx.shadowColor='#ffccff7c';
 ctx.fillText(text,x,y,width);ctx.restore();
}
function makeFoilTexture(logo){
 const c=document.createElement('canvas');c.width=1536;c.height=2368;
 const g=c.getContext('2d',{alpha:false}),w=c.width,h=c.height;
 let bg=g.createLinearGradient(0,0,w,h);
 [['#311052',0],['#ad57bc',.16],['#461f8a',.3],['#150b39',.46],['#813b9c',.66],['#db8ad0',.79],['#48217c',1]].forEach(([col,p])=>bg.addColorStop(p,col));
 g.fillStyle=bg;g.fillRect(0,0,w,h);
 // Pearl-foil diffraction: layered diagonal fibers, microdots and swept spectral color.
 g.save();g.globalCompositeOperation='screen';
 for(let i=-48;i<65;i++){
  const grad=g.createLinearGradient(i*55,0,i*55+700,h);
  grad.addColorStop(0,'#ffffff00');grad.addColorStop(.5,i%5===0?'#e8b9ff26':'#ffffff0c');grad.addColorStop(1,'#ffffff00');
  g.strokeStyle=grad;g.lineWidth=i%4===0?16:4;
  g.beginPath();g.moveTo(i*65,-50);g.lineTo(i*65+750,h+50);g.stroke();
 }
 const prism=g.createLinearGradient(0,200,w,h-200);
 ['#69d8ff00','#d2a4ff4a','#fd92ce00','#ffebc73a','#5bf2ff00'].forEach((a,i)=>prism.addColorStop(i/4,a));
 g.fillStyle=prism;g.fillRect(0,0,w,h);
 for(let i=0;i<160;i++){
  const x=((i*197+51)%1470)+26,y=((i*359+101)%2260)+55,r=i%13===0?9:i%7===0?5:2;
  g.globalAlpha=i%11===0?.85:.38;
  g.strokeStyle=i%2?'#fff2ff':'#f3ccff';g.lineWidth=1.8;
  g.beginPath();g.moveTo(x-r,y);g.lineTo(x+r,y);g.moveTo(x,y-r);g.lineTo(x,y+r);g.stroke();
 }
 g.restore();
 // Printed embossing and gold-metallic trim.
 const foil=g.createLinearGradient(0,0,w,0);
 foil.addColorStop(0,'#ffdcff');foil.addColorStop(.25,'#b978f2');foil.addColorStop(.55,'#fff4ff');foil.addColorStop(.82,'#a26ade');foil.addColorStop(1,'#ffe6fa');
 g.strokeStyle=foil;g.lineWidth=18;g.strokeRect(63,80,w-126,h-160);
 g.lineWidth=3;g.globalAlpha=.82;g.strokeRect(88,106,w-176,h-212);g.globalAlpha=1;
 g.save();g.translate(w/2,1000);
 for(let i=0;i<9;i++){
  g.rotate(Math.PI/9);g.strokeStyle=i%2?'#ffddff22':'#f3ddff35';g.lineWidth=5;
  g.beginPath();g.ellipse(0,0,340,610,0,0,2*Math.PI);g.stroke();
 }
 g.restore();
 // Premium centered emblem, using existing high-resolution ITM artwork where available.
 const aura=g.createRadialGradient(w/2,1090,20,w/2,1090,710);
 aura.addColorStop(0,'#fff7ff9c');aura.addColorStop(.35,'#eca3ff6b');aura.addColorStop(1,'#ffffff00');
 g.fillStyle=aura;g.fillRect(0,280,w,h-570);
 if(logo&&logo.complete&&logo.naturalWidth>0){
  const scale=Math.min(1010/logo.naturalWidth,790/logo.naturalHeight);
  const iw=logo.naturalWidth*scale,ih=logo.naturalHeight*scale;
  g.save();g.shadowBlur=55;g.shadowColor='#ffccffcf';
  g.drawImage(logo,(w-iw)/2,1095-ih/2,iw,ih);g.restore();
 }else{
  gradientText(g,'ITM',w/2,1140,390,1200,['#fff','#f9d4ff','#e8a2ff']);
 }
 // A restrained set of legible marks, no platform emoji glyphs.
 g.textAlign='center';g.fillStyle='#fff4ff';g.shadowColor='#a95fff';g.shadowBlur=12;
 g.font='900 32px Arial,sans-serif';g.letterSpacing='7px';g.fillText('T H E   F I R S T   S H O W C A S E',w/2,305);
 g.font='900 45px Arial,sans-serif';g.letterSpacing='12px';g.fillText('IDOL : THE MOMENT',w/2,1720);
 g.fillStyle='#ffe8ff';g.font='700 30px Arial,sans-serif';g.letterSpacing='9px';g.fillText('DEBUT COLLECTION',w/2,2020);
 g.letterSpacing='0px';g.shadowBlur=0;
 for(const y of [440,1910]){
  let line=g.createLinearGradient(280,y,w-280,y);line.addColorStop(0,'#ffffff00');line.addColorStop(.5,'#ffffffc8');line.addColorStop(1,'#ffffff00');
  g.fillStyle=line;g.fillRect(270,y,w-540,3);
 }
 return canvasTexture(c,w,h);
}
function makeCrimpTexture(){
 const c=document.createElement('canvas');c.width=1024;c.height=128;
 const g=c.getContext('2d');
 let fill=g.createLinearGradient(0,0,0,128);
 fill.addColorStop(0,'#faf1ff');fill.addColorStop(.21,'#d883d7');fill.addColorStop(.5,'#48136f');fill.addColorStop(.76,'#ffafe2');fill.addColorStop(1,'#713ca6');
 g.fillStyle=fill;g.fillRect(0,0,1024,128);
 for(let i=0;i<1024;i+=19){
  g.fillStyle=i%38===0?'#fff9f5ac':'#2a0c4f88';g.fillRect(i,0,5,128);
  g.fillStyle='#fff7ff32';g.fillRect(i+9,0,2,128);
 }
 return canvasTexture(c,1024,128);
}
function makeFoilPlane(w,h,seed=0){
 const geom=new THREE.PlaneGeometry(w,h,38,58);
 const a=geom.attributes.position;
 for(let i=0;i<a.count;i++){
  const x=a.getX(i),y=a.getY(i);
  const edge=Math.abs(x)/(w/2);
  const wave=Math.sin(x*17+seed)*Math.sin(y*13+seed)*.009 + Math.sin(x*6+y*9)*.013;
  a.setZ(i,wave+Math.pow(edge,3)*.024);
 }
 a.needsUpdate=true;geom.computeVertexNormals();
 return geom;
}
function createPack(){
 packRig=new THREE.Group();
 packRig.position.set(0,2.57,.15);
 scene.add(packRig);
 const foil=makeFoilTexture(null);
 const backMat=new THREE.MeshPhysicalMaterial({color:0x341450,metalness:.66,roughness:.28,clearcoat:1,clearcoatRoughness:.13,envMapIntensity:1.2});
 const sideMat=new THREE.MeshPhysicalMaterial({color:0xba76c5,metalness:.88,roughness:.23,clearcoat:1,envMapIntensity:1.5});
 mesh(packRig,new THREE.BoxGeometry(MASTER_R-.09,MASTER_H-.27,.22,16,16,2),[sideMat,sideMat,sideMat,sideMat,backMat,backMat]);
 const mat=new THREE.MeshPhysicalMaterial({map:foil,metalness:.27,roughness:.3,clearcoat:1,clearcoatRoughness:.18,envMapIntensity:1.5,side:THREE.DoubleSide});
 foilFront=mesh(packRig,makeFoilPlane(MASTER_R,MASTER_H-.4,0),mat,V(0,0,.125));
 mesh(packRig,makeFoilPlane(MASTER_R,MASTER_H-.4,1.3),new THREE.MeshPhysicalMaterial({color:0x582d83,metalness:.57,roughness:.29,side:THREE.DoubleSide}),V(0,0,-.125),V(0,Math.PI,0));
 const crimp=new THREE.MeshPhysicalMaterial({map:makeCrimpTexture(),metalness:.47,roughness:.28,clearcoat:.9,envMapIntensity:1.3,side:THREE.DoubleSide});
 const crimpGeo=new THREE.BoxGeometry(MASTER_R+.11,.37,.26,35,1,1);
 sealTop=new THREE.Group();sealTop.position.y=MASTER_H/2-.09;
 const top=mesh(sealTop,crimpGeo,crimp,V(0,.04,0));
 const topEdge=mesh(sealTop,new THREE.BoxGeometry(MASTER_R+.13,.035,.31),lightMaterial('#ffe8ff',.52),V(0,-.15,0));
 packRig.add(sealTop);
 const bottom=mesh(packRig,crimpGeo,crimp,V(0,-MASTER_H/2+.08,0));
 for(const sign of [-1,1]){
  const seamMat=new THREE.MeshPhysicalMaterial({color:0xf4c5fa,metalness:.84,roughness:.18,emissive:0x7c316e,emissiveIntensity:.14});
  mesh(packRig,new THREE.BoxGeometry(.036,MASTER_H-.62,.28),seamMat,V(sign*(MASTER_R/2-.025),0,.01));
 }
 mesh(packRig,new THREE.BoxGeometry(MASTER_R+.05,.017,.27),lightMaterial(0xffd8fb,.43),V(0,-MASTER_H/2+.34,.02));
 const scratches=lightMaterial(0xc9a2ff,.18);
 for(let i=0;i<6;i++){
  mesh(packRig,new THREE.BoxGeometry(.015,MASTER_H*.75,.007),scratches,V(-1.1+i*.41,.06,.151),V(0,0,(i-3)*.009));
 }
 // Subtle white-pink edge aura, rendered separately so the foil never looks matte.
 const glowMat=lightMaterial(0xd798ff,.12);
 mesh(packRig,new THREE.BoxGeometry(MASTER_R+.095,MASTER_H+.11,.26),new THREE.MeshBasicMaterial({color:0xbf72f1,transparent:true,opacity:.038,wireframe:true,depthWrite:false}),V(0,0,0));
 const crown=mesh(packRig,new THREE.TorusGeometry(.21,.011,5,56),glowMat,V(.96,1.54,.154));
 crown.scale.y=.65;
 const logo=new Image();
 logo.onload=()=>{
  if(!foilFront||!foilFront.material)return;
  const old=foilFront.material.map;
  foilFront.material.map=makeFoilTexture(logo);
  foilFront.material.needsUpdate=true;
  if(old)old.dispose();
 };
 logo.onerror=()=>{};
 logo.src='./assets/itm-logo.png';
}
function createStage(){
 stageRig=new THREE.Group();scene.add(stageRig);
 const brushed=new THREE.MeshPhysicalMaterial({color:0x1b1226,metalness:.86,roughness:.23,envMapIntensity:1.25});
 const obsidian=new THREE.MeshPhysicalMaterial({color:0x090810,metalness:.92,roughness:.17,envMapIntensity:1.4});
 const metal=new THREE.MeshPhysicalMaterial({color:0x745579,metalness:.9,roughness:.19,envMapIntensity:1.3});
 const gold=new THREE.MeshPhysicalMaterial({color:0xd0a6e3,metalness:.92,roughness:.2,emissive:0x7e4b91,emissiveIntensity:.08,envMapIntensity:1.5});
 const floor=mesh(scene,new THREE.PlaneGeometry(200,200),obsidian,V(0,-.28,0),V(-Math.PI/2,0,0));
 floor.receiveShadow=!mobile;
 // Six individually machined rings of a raised performance pedestal.
 mesh(stageRig,new THREE.CylinderGeometry(3.6,3.85,.28,96),obsidian,V(0,-.08,0));
 mesh(stageRig,new THREE.CylinderGeometry(3.34,3.47,.12,96),metal,V(0,.13,0));
 mesh(stageRig,new THREE.CylinderGeometry(3.21,3.28,.25,96),brushed,V(0,.3,0));
 mesh(stageRig,new THREE.CylinderGeometry(3.06,3.13,.058,96),gold,V(0,.45,0));
 mesh(stageRig,new THREE.CylinderGeometry(2.99,3.02,.025,96),brushed,V(0,.496,0));
 for(const [r,y,col,op] of [[3.47,.08,0xe1baff,.48],[3.23,.28,0xd39fff,.64],[3.07,.47,0xffe6fc,.59],[2.79,.51,0xaf8fff,.16],[2.15,.513,0xf2c7ff,.14]]){
  makeLineRing(r,.022,col,y,op);
 }
 // Jewel-like floor disks and floating arc-shaped trusses.
 const disk=mesh(stageRig,new THREE.CircleGeometry(2.25,96),lightMaterial(0xb981ec,.11),V(0,.515,0),V(-Math.PI/2,0,0));
 for(let i=0;i<6;i++){
  const radius=7.1-i*.84;
  const ring=mesh(scene,new THREE.TorusGeometry(radius,.024,8,96,Math.PI*1.18),lightMaterial(i%2?0xd185ff:0xffbae7,.075),V(0,4.5,-8.9-i*.14));
  ring.scale.set(1.15,1,1);
  ring.rotation.z=Math.PI*.91;
 }
 for(let i=-7;i<=7;i++){
  const x=i*1.4;
  const panel=mesh(scene,new THREE.BoxGeometry(.07,9,.18),new THREE.MeshPhysicalMaterial({color:i%2?0x321c3f:0x24142b,metalness:.77,roughness:.25}),V(x,3.8,-11));
  mesh(scene,new THREE.BoxGeometry(.025,6,.035),lightMaterial(i%2?0x8059c4:0xdd89ee,.14),V(x+.04,3.8,-10.85));
 }
 const curtainMaterial=new THREE.MeshStandardMaterial({color:0x1e102d,metalness:.07,roughness:.94,side:THREE.DoubleSide});
 for(const sign of [-1,1]){
  const geometry=new THREE.PlaneGeometry(6.4,10,48,34);
  const p=geometry.attributes.position;
  for(let i=0;i<p.count;i++){
   const x=p.getX(i),y=p.getY(i);
   p.setZ(i,Math.sin(x*5.2+sign*.8)*.28+Math.sin(x*11)*.075);
  }
  geometry.computeVertexNormals();
  mesh(scene,geometry,curtainMaterial,V(sign*8.9,3.8,-7),V(0,sign*.13,0));
 }
 // Real spotlight illumination plus transparent volumetric beams.
 const target=V(0,.44,0);
 spotRefs.push(makeSpot(V(0,10,2.1),target,0xffebd5,280,.42,true));
 spotRefs.push(makeSpot(V(-8.3,8.2,2.6),target,0xeaa5ff,175,.47,false));
 spotRefs.push(makeSpot(V(8.5,7.5,1.7),target,0x97bbff,155,.46,false));
 spotRefs.push(makeSpot(V(-5.1,5.7,-7.4),V(0,3,0),0xf4a0da,68,.64,false));
 const ambient=new THREE.HemisphereLight(0xd6bdff,0x160b20,2.3);scene.add(ambient);
 const fill= new THREE.DirectionalLight(0xffdaef,1.35);fill.position.set(1,7,9);scene.add(fill);
 const led=mesh(scene,new THREE.TorusGeometry(3.52,.08,12,128),lightMaterial(0x9d5dff,.14),V(0,.15,0),V(-Math.PI/2,0,0));
}
function createDust(){
 const count=mobile?280:620, positions=new Float32Array(count*3),colors=new Float32Array(count*3);
 for(let i=0;i<count;i++){
  const radius=3+Math.random()*15,theta=Math.random()*Math.PI*2;
  positions[i*3]=Math.cos(theta)*radius;
  positions[i*3+1]=.7+Math.random()*10;
  positions[i*3+2]=Math.sin(theta)*radius-2;
  const c=new THREE.Color(i%4===0?0xffe0d9:i%3===0?0xd79fff:0xb8b4ff);
  colors[i*3]=c.r;colors[i*3+1]=c.g;colors[i*3+2]=c.b;
 }
 const geo=new THREE.BufferGeometry();
 geo.setAttribute('position',new THREE.BufferAttribute(positions,3));
 geo.setAttribute('color',new THREE.BufferAttribute(colors,3));
 dust=new THREE.Points(geo,new THREE.PointsMaterial({size:mobile?.06:.052,vertexColors:true,transparent:true,opacity:.72,depthWrite:false,blending:THREE.AdditiveBlending,sizeAttenuation:true}));
 scene.add(dust);
 // One burst system rather than hundreds of individual meshes (mobile friendly).
 const n=270;
 const burstGeo=new THREE.BufferGeometry();
 const p=new Float32Array(n*3),colorsBurst=new Float32Array(n*3),velocity=new Float32Array(n*3);
 for(let i=0;i<n;i++){
  const theta=Math.random()*Math.PI*2,phi=Math.acos(2*Math.random()-1),speed=2+Math.random()*6;
  p.set([0,2.6,0],i*3);
  velocity[i*3]=Math.cos(theta)*Math.sin(phi)*speed;
  velocity[i*3+1]=Math.cos(phi)*speed*.75;
  velocity[i*3+2]=Math.sin(theta)*Math.sin(phi)*speed;
  const color=new THREE.Color([0xffd8fb,0xffe1b2,0xc09dff,0x9be8ff][i%4]);
  colorsBurst.set([color.r,color.g,color.b],i*3);
 }
 burstGeo.setAttribute('position',new THREE.BufferAttribute(p,3));
 burstGeo.setAttribute('color',new THREE.BufferAttribute(colorsBurst,3));
 burst=new THREE.Points(burstGeo,new THREE.PointsMaterial({size:.09,vertexColors:true,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false}));
 burst.userData.vel=velocity;burst.visible=false;scene.add(burst);
}
function prepareCardBack(){
 const loader=new THREE.TextureLoader();
 backTexture=loader.load('./assets/itm-card-back.png',()=>{backTexture.colorSpace=THREE.SRGBColorSpace;backTexture.anisotropy=renderer.capabilities.getMaxAnisotropy();},undefined,()=>{backTexture=makeFallbackBack()});
 backTexture.colorSpace=THREE.SRGBColorSpace;
}
function makeFallbackBack(){
 const canvas=document.createElement('canvas');canvas.width=750;canvas.height=1050;
 const c=canvas.getContext('2d');
 const g=c.createLinearGradient(0,0,750,1050);
 g.addColorStop(0,'#65349b');g.addColorStop(.4,'#25144b');g.addColorStop(1,'#a65dc2');
 c.fillStyle=g;c.fillRect(0,0,750,1050);
 c.strokeStyle='#e4b6fa';c.lineWidth=18;c.strokeRect(35,35,680,980);
 gradientText(c,'ITM',375,570,220,600,['#fff','#f2b8fb']);
 return canvasTexture(canvas,750,1050);
}
function cardFrontTexture(tier){
 const w=900,h=1280,canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
 const g=canvas.getContext('2d');
 const grad=g.createLinearGradient(0,0,w,h);
 tier.colors.forEach((color,i)=>grad.addColorStop(i/(tier.colors.length-1),color));
 g.fillStyle=grad;g.fillRect(0,0,w,h);
 let shade=g.createLinearGradient(0,0,0,h);
 shade.addColorStop(0,'#09081c48');shade.addColorStop(.35,'#160d303b');shade.addColorStop(1,'#080610a4');
 g.fillStyle=shade;g.fillRect(0,0,w,h);
 g.save();g.translate(w/2,540);g.globalAlpha=.25;
 for(let i=0;i<15;i++){g.rotate(Math.PI/15);g.strokeStyle='#ffffff';g.lineWidth=3;g.beginPath();g.ellipse(0,0,290,410,0,0,Math.PI*2);g.stroke()}
 g.restore();
 const gleam=g.createRadialGradient(w/2,525,0,w/2,525,500);
 gleam.addColorStop(0,'#ffffffbd');gleam.addColorStop(.4,'#ffffff35');gleam.addColorStop(1,'#ffffff00');
 g.fillStyle=gleam;g.fillRect(0,0,w,h);
 g.strokeStyle='#ffffffd9';g.lineWidth=12;g.strokeRect(26,26,w-52,h-52);
 g.strokeStyle='#ffffff7f';g.lineWidth=3;g.strokeRect(49,49,w-98,h-98);
 gradientText(g,'ITM',w/2,610,246,690,['#fff','#fceeff','#f4bdff']);
 g.textAlign='left';g.shadowBlur=12;g.shadowColor='#0008';
 g.fillStyle='#fff';g.font='900 38px Arial';g.fillText('IDOL : THE MOMENT',74,122);
 g.font='900 150px Arial';g.fillText(tier.key,70,1090);
 g.font='700 31px Arial';g.fillText(tier.name,78,1155);
 g.shadowBlur=0;
 return canvasTexture(canvas,w,h);
}
function removeOldCards(){
 if(!cardRig)return;
 scene.remove(cardRig);
 cardRig.traverse(o=>{
  if(o.isMesh){
   o.geometry.dispose();
   const materials=Array.isArray(o.material)?o.material:[o.material];
   materials.forEach(m=>{if(m.map&&m.map!==backTexture)m.map.dispose();m.dispose()});
  }
 });
 cardRig=null;
 state.cards=[];
}
function makeCards(count){
 removeOldCards();
 cardRig=new THREE.Group();cardRig.position.set(0,2.5,1.1);scene.add(cardRig);
 const tiers=count===5? [...PALETTE].sort(()=>Math.random()-.5):[rollTier()];
 state.focus=count===5?2:0;
 state.cards=tiers.map((tier,i)=>{
  const group=new THREE.Group();
  const front=cardFrontTexture(tier);
  const side=new THREE.MeshPhysicalMaterial({color:new THREE.Color(tier.colors[1]),metalness:.85,roughness:.17,clearcoat:1});
  const mats=[side,side,side,side,new THREE.MeshBasicMaterial({map:front}),new THREE.MeshBasicMaterial({map:backTexture})];
  const body=new THREE.Mesh(new THREE.BoxGeometry(1.65,2.43,.058),mats);
  body.castShadow=true;body.userData.index=i;
  group.add(body);
  const rim=mesh(group,new THREE.BoxGeometry(1.69,2.47,.052),new THREE.MeshBasicMaterial({color:tier.colors[0],transparent:true,opacity:.1,wireframe:true,depthWrite:false}),V(0,0,0));
  group.rotation.y=Math.PI;
  group.position.set((i-(tiers.length-1)/2)*1.95,-5,-.15*Math.abs(i-(tiers.length-1)/2));
  group.userData.targetX=(i-(tiers.length-1)/2)*1.95;
  group.userData.targetY=(i%2===0?.05:-.02);
  cardRig.add(group);
  return {group,body,tier,index:i,flipped:false,enterAt:clock.getElapsedTime()+i*.12};
 });
 $('progress').textContent='0 / '+count;
 $('resultHint').textContent= count===5?'카드를 터치해 공개하세요 · 좌우로 밀어 카드 이동':'카드를 터치해 등급을 공개하세요';
 $('result-ui').hidden=false;root.classList.add('revealing');root.classList.remove('ready');
 packRig.visible=false;
 state.mode='reveal';
}
function rollTier(){
 let r=crypto.getRandomValues(new Uint32Array(1))[0]/4294967296;
 for(const tier of PALETTE){r-=tier.p;if(r<0)return tier}
 return PALETTE[0];
}
function flipCard(index){
 const item=state.cards[index];
 if(!item||item.flipped)return;
 item.flipped=true;
 const n=state.cards.filter(c=>c.flipped).length;
 $('progress').textContent=n+' / '+state.cards.length;
 $('resultHint').textContent=n===state.cards.length?'모든 카드가 공개되었습니다.':item.tier.key+' · '+item.tier.name;
 if(item.tier.key==='UR'||item.tier.key==='SSR'){
  flash(item.tier.key==='UR');
  bloom.strength=mobile?.84:1.08;
 }
}
function updateDeckFocus(){
 if(!cardRig||state.cards.length<2)return;
 state.focus=clamp(state.focus,0,state.cards.length-1);
}
function flash(gold){
 $('glint').classList.remove('active','gold');
 void $('glint').offsetWidth;
 if(gold)$('glint').classList.add('gold');
 $('glint').classList.add('active');
}
function openPack(count){
 if(state.mode!=='idle')return;
 state.packCount=count;
 state.mode='opening';state.openStart=clock.getElapsedTime();state.hasBurst=false;
 root.classList.remove('ready');
 $('drawOne').disabled=$('drawFive').disabled=true;
 foilFront.material.transparent=true;foilFront.material.opacity=1;
 sealTop.position.y=MASTER_H/2-.09;
 if(count===5){bloom.strength=mobile?.9:1.18}
}
function backToStage(){
 if(state.mode!=='reveal')return;
 removeOldCards();
 packRig.visible=true;packRig.scale.setScalar(1);
 packRig.rotation.set(0,0,0);
 foilFront.material.opacity=1;foilFront.material.transparent=false;
 sealTop.position.y=MASTER_H/2-.09;sealTop.rotation.z=0;
 $('result-ui').hidden=true;
 root.classList.remove('revealing');
 root.classList.add('ready');
 state.mode='idle';
 bloom.strength=mobile?.6:.72;
 $('drawOne').disabled=$('drawFive').disabled=false;
}
function revealAll(){state.cards.forEach((_,i)=>flipCard(i))}
function startIntro(){
 if(state.mode==='opening')return;
 if(state.mode==='reveal')backToStage();
 clearTimers();
 state.mode='intro';state.introStart=clock.getElapsedTime();
 root.classList.remove('ready','revealing');
 intro.hidden=false;intro.className='';
 void intro.offsetWidth;intro.classList.add('playing');
 const ms=reducedMotion?200:1700;
 timeout(()=>intro.classList.add('leaving'),ms);
 timeout(()=>finishIntro(),ms+(reducedMotion?100:1350));
}
function finishIntro(){
 clearTimers();
 intro.hidden=true;
 intro.classList.remove('playing','leaving');
 state.mode='idle';root.classList.add('ready');
 $('drawOne').disabled=$('drawFive').disabled=false;
}
function attachEvents(){
 $('drawOne').onclick=()=>openPack(1);
 $('drawFive').onclick=()=>openPack(5);
 $('replay').onclick=()=>startIntro();
 $('skip').onclick=()=>finishIntro();
 $('backToStage').onclick=()=>backToStage();
 $('revealAll').onclick=()=>revealAll();
 window.addEventListener('keydown',e=>{
  if(e.key==='Escape'){if(state.mode==='reveal')backToStage();else if(state.mode==='intro')finishIntro()}
  if(state.mode==='reveal'&&(e.key==='ArrowLeft'||e.key==='ArrowRight')){
   state.focus=clamp(state.focus+(e.key==='ArrowRight'?1:-1),0,state.cards.length-1);
  }
  if(state.mode==='reveal'&&(e.key==='Enter'||e.key===' '))flipCard(state.focus);
 });
 canvas.addEventListener('pointerdown',e=>{
  if(state.mode==='reveal')state.pointerStart={x:e.clientX,y:e.clientY};
 });
 canvas.addEventListener('pointerup',e=>{
  if(state.mode!=='reveal'||!state.pointerStart)return;
  const dx=e.clientX-state.pointerStart.x,dy=e.clientY-state.pointerStart.y;
  state.pointerStart=null;
  if(Math.abs(dx)>28&&Math.abs(dx)>Math.abs(dy)){
   state.focus=clamp(state.focus+(dx<0?1:-1),0,state.cards.length-1);
   return;
  }
  if(Math.abs(dx)>10||Math.abs(dy)>10)return;
  const ray=new THREE.Raycaster(),pointer=new THREE.Vector2();
  const rect=canvas.getBoundingClientRect();
  pointer.set((e.clientX-rect.left)/rect.width*2-1,-((e.clientY-rect.top)/rect.height*2-1));
  ray.setFromCamera(pointer,camera);
  const hits=ray.intersectObjects(state.cards.map(c=>c.body),false);
  if(hits.length)flipCard(hits[0].object.userData.index);
 });
 if(!touch){
  window.addEventListener('pointermove',e=>{
   state.mouseX=(e.clientX/window.innerWidth-.5)*2;
   state.mouseY=(e.clientY/window.innerHeight-.5)*2;
  },{passive:true});
 }
 window.addEventListener('resize',resize,{passive:true});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)clock.stop();else clock.start()});
}
function resize(){
 const w=Math.max(1,window.innerWidth),h=Math.max(1,window.innerHeight);
 state.width=w;state.height=h;
 const pixelRatio=Math.min(window.devicePixelRatio||1,mobile?1.35:1.7);
 renderer.setPixelRatio(pixelRatio);
 renderer.setSize(w,h,false);
 camera.aspect=w/h;camera.fov=mobile?43:39;camera.updateProjectionMatrix();
 composer.setPixelRatio(pixelRatio);
 composer.setSize(w,h);
 bloom.resolution.set(Math.round(w*pixelRatio),Math.round(h*pixelRatio));
}
function renderFrame(){
 const dt=Math.min(.08,clock.getDelta()||.016),t=clock.elapsedTime;
 if(state.mode==='loading')return;
 const isIntro=state.mode==='intro',isOpen=state.mode==='opening',isReveal=state.mode==='reveal';
 const targetZ=mobile?12.9:10.8;
 const introT=isIntro?ease((t-state.introStart)/3.0):1;
 const openT=isOpen?t-state.openStart:0;
 const camX=(1-introT)*(mobile?4.7:6.4)+state.mouseX*.11;
 const camY=mix(mobile?4.5:5.3,mobile?3.15:3.35,introT)-state.mouseY*.06;
 const camZ=mix(mobile?19.0:18.0,targetZ,introT)+(isReveal?.7:0);
 camera.position.set(camX,camY,camZ);
 camera.lookAt(0,isReveal?2.45:2.18,0);
 if(packRig&&packRig.visible){
  const bob=isOpen?0:Math.sin(t*1.12)*.045;
  packRig.position.set(state.mouseX*.048,2.57+bob,.15);
  packRig.rotation.y=(isOpen?Math.sin(openT*31)*.05:-.09)+Math.sin(t*.54)*.055+state.mouseX*.034;
  packRig.rotation.z=isOpen?Math.sin(openT*42)*.05:Math.sin(t*.61)*.008;
  if(isOpen){
   const energy=ease(openT/1.8);
   packRig.scale.setScalar(1+energy*.37);
   sealTop.position.y=MASTER_H/2-.09+ease((openT-.58)/.8)*2.4;
   sealTop.rotation.z=-ease((openT-.58)/.8)*.44;
   if(openT>.78&&!state.hasBurst){
    state.hasBurst=true;flash(state.packCount===5);
    burst.visible=true;burst.userData.start=t;
   }
   foilFront.material.opacity=clamp(1-ease((openT-1.2)/.65),0,1);
   if(openT>2.05){
    foilFront.material.opacity=0;
    burst.visible=false;
    bloom.strength=mobile?.62:.76;
    makeCards(state.packCount);
   }
  }
 }
 for(let i=0;i<spotRefs.length;i++){
  const o=spotRefs[i],s=Math.sin(t*.32+i*2);
  o.spot.position.x=o.base.x+Math.sin(t*.35+i*1.9)*(i===0?.45:.72);
  o.spot.position.z=o.base.z+Math.cos(t*.23+i*2)*.18;
  o.spot.intensity=(i===0?280:i===1?175:i===2?155:68)*(isOpen?1.4:1)*(1+s*.06);
  const axis=o.target.clone().sub(o.spot.position);
  o.beam.position.copy(o.target).add(o.spot.position).multiplyScalar(.5);
  o.beam.quaternion.setFromUnitVectors(V(0,-1,0),axis.normalize());
  o.bulb.position.copy(o.spot.position);
  o.beam.material.opacity=(i===0?.074:.038)*(isOpen?1.42:1);
 }
 if(dust){dust.rotation.y+=dt*.005;dust.material.opacity=.65+.14*Math.sin(t*.85)}
 ringLights.forEach((ring,i)=>ring.material.opacity=ring.userData.baseAlpha*(.82+.18*Math.sin(t*1.4+i)));
 if(burst&&burst.visible){
  const age=t-burst.userData.start;
  const pos=burst.geometry.attributes.position,vel=burst.userData.vel;
  for(let i=0;i<pos.count;i++){
   pos.setXYZ(i,vel[i*3]*age,2.6+vel[i*3+1]*age-.5*age*age*6,vel[i*3+2]*age);
  }
  pos.needsUpdate=true;
  burst.material.opacity=clamp((1-age/1.5)*.95,0,1);
  if(age>1.5)burst.visible=false;
 }
 if(cardRig&&isReveal){
  const count=state.cards.length;
  const move=count===1?0:-(state.focus-(count-1)/2)*1.95;
  const isNarrow=state.width<760;
  cardRig.position.x=mix(cardRig.position.x,isNarrow?move:0,clamp(dt*8,0,1));
  state.cards.forEach((card,i)=>{
   const p=card.group.position;
   const elapsed=t-card.enterAt;
   const settle=ease(elapsed/.85);
   const targetY=card.group.userData.targetY;
   p.y=mix(-4.5,targetY+Math.sin(t*1.1+i)*.045,settle);
   p.x=card.group.userData.targetX;
   const wanted=card.flipped?0:Math.PI;
   card.group.rotation.y=lerpAngle(card.group.rotation.y,wanted,clamp(dt*6,0,1));
   card.group.rotation.z=Math.sin(t*.68+i)*.012;
   const scale=isNarrow&&i===state.focus?1.02:.97;
   card.group.scale.setScalar(scale);
  });
 }
 composer.render();
}
async function setup(){
 try{
  renderer=new THREE.WebGLRenderer({canvas,alpha:false,antialias:!mobile,powerPreference:'high-performance'});
  renderer.setClearColor(0x07050d);
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.53;
  renderer.shadowMap.enabled=!mobile;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  scene=new THREE.Scene();scene.background=new THREE.Color(0x0b0615);scene.fog=new THREE.FogExp2(0x0b0615,.027);
  camera=new THREE.PerspectiveCamera(39,1,.1,120);
  room=new RoomEnvironment();
  const pmrem=new THREE.PMREMGenerator(renderer);
  environment=pmrem.fromScene(room);
  scene.environment=environment.texture;
  pmrem.dispose();room.dispose();
  composer=new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene,camera));
  bloom=new UnrealBloomPass(new THREE.Vector2(1,1),mobile?.6:.74,.43,.88);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  createStage();createPack();createDust();prepareCardBack();
  resize();attachEvents();
  state.mode='intro';
  renderer.setAnimationLoop(renderFrame);
  $('loading').classList.add('hidden');
  timeout(()=>$('loading').hidden=true,500);
  startIntro();
 }catch(error){
  console.error('ITM 3D stage preview failed:',error);
  $('loading').hidden=true;$('intro').hidden=true;
  $('fallback').hidden=false;
 }
}
setup();
