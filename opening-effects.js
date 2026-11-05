/* ITM PACK OPENING 2.0 — lightweight Three.js effects synchronized to the
   existing 4.65s opening sequence and the stage's rarity lighting/zoom.
   Decorative only; no changes to rarity odds, account state or collection.
 */
export function createOpeningEffects({THREE,scene}){
  const clamp=(v,min=0,max=1)=>Math.max(min,Math.min(max,v));
  const smooth=t=>{t=clamp(t);return t*t*(3-2*t)};
  const fade=(x,start,end)=>smooth((x-start)/(end-start));
  const bump=(x,a,b,c,d)=>fade(x,a,b)*(1-fade(x,c,d));
  const mobile=window.innerWidth<780;
  const group=new THREE.Group();group.visible=false;scene.add(group);
  const blend=THREE.AdditiveBlending;
  const palette={
    N:['#f7e8ff','#ffccf1'],R:['#8bdcff','#b5a2ff'],
    SR:['#c690ff','#f5b1ff'],SSR:['#ffe29d','#ff9cc8'],
    UR:['#ffaff0','#8eeeff']
  };
  const radial=document.createElement('canvas');radial.width=128;radial.height=128;
  const ctx=radial.getContext('2d');
  const grad=ctx.createRadialGradient(64,64,1,64,64,64);
  grad.addColorStop(0,'#ffffff');
  grad.addColorStop(.12,'#ffffffdf');
  grad.addColorStop(.36,'#ffe6ff72');
  grad.addColorStop(.7,'#ffc1ff16');
  grad.addColorStop(1,'#ffffff00');
  ctx.fillStyle=grad;ctx.fillRect(0,0,128,128);
  const glowTex=new THREE.CanvasTexture(radial);
  glowTex.colorSpace=THREE.SRGBColorSpace;
  const createGlow=(size,x,y,z)=>{
    const mat=new THREE.SpriteMaterial({map:glowTex,color:0xffffff,
      transparent:true,opacity:0,depthWrite:false,depthTest:false,blending:blend});
    const sprite=new THREE.Sprite(mat);
    sprite.scale.set(size,size,1);sprite.position.set(x,y,z);
    group.add(sprite);return sprite;
  };
  // Charged, visible seal — a beam sweeps along the foil before it tears.
  const charge=createGlow(3.55,0,.96,.58);
  const seam=createGlow(1.5,-1.4,.96,.72);
  const heart=createGlow(2.3,0,.25,.59);
  const stageFlare=createGlow(5.1,0,.45,.42);
  // Layered light escapes from the *inside* of the unsealed pouch.
  // A narrow core and rising plume make the actual opening the brightest beat.
  const innerCore=createGlow(2.1,0,.94,.80);
  const lightPlume=createGlow(3.1,0,1.53,.74);
  const plumeHalo=createGlow(4.2,0,1.38,.58);
  const breakFlash=createGlow(3.0,0,.98,.87);
  // Real lighting on the foil/card, in addition to the screen-space glow.
  const interiorLight=new THREE.PointLight(0xffcdf4,0,4.8,2);
  interiorLight.position.set(0,.98,.72);
  group.add(interiorLight);
  const slitCanvas=document.createElement('canvas');slitCanvas.width=512;slitCanvas.height=32;
  const pen=slitCanvas.getContext('2d');
  const slitGrad=pen.createLinearGradient(0,0,512,0);
  slitGrad.addColorStop(0,'#ffffff00');
  slitGrad.addColorStop(.13,'#ffc6ec9e');
  slitGrad.addColorStop(.48,'#ffffffff');
  slitGrad.addColorStop(.84,'#ffc9fbbf');
  slitGrad.addColorStop(1,'#ffffff00');
  pen.fillStyle=slitGrad;pen.fillRect(0,0,512,32);
  const strip=new THREE.Mesh(new THREE.PlaneGeometry(2.78,.087),
    new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(slitCanvas),
      color:0xffd8fa,transparent:true,opacity:0,depthWrite:false,
      depthTest:false,blending:blend,side:THREE.DoubleSide}));
  strip.position.set(0,.96,.71);group.add(strip);
  // Two radial shock rings echo the foil breaking and the card's arrival.
  const rings=[0,1].map(i=>{
    const m=new THREE.Mesh(new THREE.TorusGeometry(.85,.014,6,80),
      new THREE.MeshBasicMaterial({color:0xffd8fc,transparent:true,opacity:0,
        depthWrite:false,depthTest:false,blending:blend}));
    m.position.set(0,i===0?.97:.55,.62);m.scale.setScalar(.05);
    group.add(m);return m;
  });
  const spokes=Array.from({length:13},(_,i)=>{
    const geom=new THREE.PlaneGeometry(.045,i%3===0?1.08:.7);
    const m=new THREE.Mesh(geom,new THREE.MeshBasicMaterial({
      color:0xffffff,transparent:true,opacity:0,depthWrite:false,
      depthTest:false,side:THREE.DoubleSide,blending:blend}));
    const angle=Math.PI*2*i/13;
    m.rotation.z=-angle-Math.PI/2;
    m.position.set(Math.cos(angle)*.47,.60+Math.sin(angle)*.47,.65);
    group.add(m);return m;
  });
  // A small number of individually colored, real 3D sparks, not a flat overlay.
  const count=mobile?85:155;
  const positions=new Float32Array(count*3);
  const colors=new Float32Array(count*3);
  const geom=new THREE.BufferGeometry();
  geom.setAttribute('position',new THREE.BufferAttribute(positions,3));
  geom.setAttribute('color',new THREE.BufferAttribute(colors,3));
  const sparkMat=new THREE.PointsMaterial({size:mobile?.043:.055,transparent:true,
    opacity:0,vertexColors:true,depthWrite:false,blending:blend});
  const sparks=new THREE.Points(geom,sparkMat);
  sparks.frustumCulled=false;group.add(sparks);
  const rnd=n=>{const v=Math.sin(n*71.139+8.13)*31758.53;return v-Math.floor(v)};
  const velocities=Array.from({length:count},(_,i)=>{
    const theta=rnd(i+5)*Math.PI*2;
    const power=.86+rnd(i*3+2)*1.43;
    return {x:Math.cos(theta)*power,y:Math.sin(theta)*power+.23,
      z:rnd(i*7+4)*.7+.07,phase:rnd(i*13+8)*.11};
  });
  let tier='N';
  function setTier(next){
    tier=palette[next]?next:'N';
    const [primary,secondary]=palette[tier];
    const col=new THREE.Color(primary);
    for(const light of [charge,seam,heart,stageFlare,innerCore,lightPlume,plumeHalo,breakFlash]){
      light.material.color.copy(col);
    }
    // The core remains almost white; colored outer light expresses the rarity.
    innerCore.material.color.set(tier==='UR'?'#fefaff':'#fff4fe');
    breakFlash.material.color.set(tier==='UR'?'#ffffff':'#fff7ff');
    interiorLight.color.set(tier==='UR'?'#e6e0ff':primary);
    strip.material.color.copy(col);
    rings.forEach(r=>r.material.color.copy(col));
    spokes.forEach((sp,i)=>sp.material.color.set(i%4===0?secondary:primary));
    for(let i=0;i<count;i++){
      const color=new THREE.Color(i%3===0?secondary:primary);
      if(tier==='UR')color.setHSL((i%11)/11,.86,.76);
      colors.set([color.r,color.g,color.b],i*3);
    }
    geom.attributes.color.needsUpdate=true;
  }
  function reset(){
    group.visible=false;charge.material.opacity=0;seam.material.opacity=0;
    heart.material.opacity=0;stageFlare.material.opacity=0;strip.material.opacity=0;
    innerCore.material.opacity=0;lightPlume.material.opacity=0;
    plumeHalo.material.opacity=0;breakFlash.material.opacity=0;
    interiorLight.intensity=0;
    rings.forEach(r=>r.material.opacity=0);
    sparks.material.opacity=0;
  }
  function update(elapsed,pack){
    if(!pack||elapsed<0){reset();return}
    group.visible=true;
    group.position.copy(pack.position);
    group.rotation.copy(pack.rotation);
    group.scale.copy(pack.scale);
    // 0-2s: subtle electrical build-up; low enough not to hide the pouch art.
    const precharge=bump(elapsed,.15,.86,1.93,2.38);
    charge.material.opacity=precharge*.11*(.72+.28*Math.sin(elapsed*23));
    charge.scale.set(2.9+precharge*.65,.8+precharge*.8,1);
    // 2.1-2.7s: the cut moves left-to-right across the sealed edge.
    const tracing=fade(elapsed,2.06,2.49);
    const cleave=bump(elapsed,2.01,2.20,2.52,2.86);
    strip.material.opacity=cleave*.93;
    strip.scale.x=.21+tracing*.79;
    seam.position.x=-1.34+2.68*tracing;
    seam.material.opacity=cleave*.77;
    seam.scale.set(.69+cleave*.30,.42+cleave*.19,1);
    // The interior *erupts* when the seal separates (light becomes the action,
    // not extra violent pack shaking). The source swells in three distinct beats.
    const tierPower=tier==='UR'?1.29:tier==='SSR'?1.19:tier==='SR'?1.10:1;
    const openingPulse=bump(elapsed,2.48,2.78,3.47,4.22);
    const inner=bump(elapsed,2.54,2.91,3.93,4.57);
    const launch=bump(elapsed,3.02,3.23,3.69,4.25);
    const snapFlash=bump(elapsed,2.50,2.59,2.72,2.92);
    const flicker=1+.095*Math.sin(elapsed*17)+.045*Math.sin(elapsed*31);
    heart.material.opacity=Math.min(.94,inner*(tier==='N'?.57:.78)*flicker);
    heart.scale.set(2.2+inner*1.5,1.7+inner*1.7,1);
    innerCore.material.opacity=Math.min(.94,openingPulse*.82*tierPower);
    innerCore.scale.set(1.17+openingPulse*.87,1.18+openingPulse*1.38,1);
    lightPlume.material.opacity=Math.min(.85,inner*.58*tierPower);
    lightPlume.position.y=1.23+inner*.61;
    lightPlume.scale.set(1.28+inner*.42,2.35+inner*2.0,1);
    plumeHalo.material.opacity=Math.min(.65,inner*.37*tierPower);
    plumeHalo.position.y=1.28+inner*.32;
    plumeHalo.scale.set(2.32+inner*.9,2.0+inner*1.43,1);
    breakFlash.material.opacity=Math.min(.93,snapFlash*.9*tierPower);
    breakFlash.scale.set(2.18+snapFlash*.9,.64+snapFlash*.52,1);
    interiorLight.intensity=inner*(tier==='UR'?9.0:tier==='SSR'?7.8:tier==='SR'?6.7:5.1)
      *(1+.08*Math.sin(elapsed*14));
    stageFlare.material.opacity=Math.min(.72,launch*(tier==='UR'?.63:.41)*tierPower);
    stageFlare.scale.set(3.6+launch*2.4,1.5+launch*2.2,1);
    for(let i=0;i<rings.length;i++){
      const when=i===0?2.59:3.32;
      const age=elapsed-when,ratio=clamp(age/.85);
      const r=rings[i];
      r.material.opacity=age>=0&&age<.85?(1-smooth(ratio))*(tier==='N'?.55:.80):0;
      r.scale.setScalar(.1+ratio*(i===0?2.95:3.35));
      r.rotation.z=elapsed*.18;
    }
    const spokesAmt=bump(elapsed,3.01,3.22,3.67,4.17);
    for(let i=0;i<spokes.length;i++){
      const ray=spokes[i],angle=Math.PI*2*i/spokes.length;
      ray.material.opacity=spokesAmt*(tier==='UR'?.40:.27);
      ray.position.set(Math.cos(angle)*(.36+spokesAmt*.45),
        .61+Math.sin(angle)*(.36+spokesAmt*.45),.65);
      ray.scale.y=.55+spokesAmt*1.5;
    }
    let peak=0;
    for(let i=0;i<count;i++){
      const second=i>=count*.42;
      const age=elapsed-(second?3.22:2.65)-velocities[i].phase;
      const motion=clamp(age);
      const level=age>0&&age<1.50?Math.min(1,age/.17)*(1-smooth((age-.20)/1.30)):0;
      peak=Math.max(peak,level);
      const v=velocities[i];
      positions[3*i]=v.x*motion*.71;
      positions[3*i+1]=(second?.45:.96)+v.y*motion*.94-1.36*motion*motion;
      positions[3*i+2]=.48+v.z*motion;
    }
    geom.attributes.position.needsUpdate=true;
    sparkMat.opacity=peak*(tier==='UR'?.94:tier==='SSR'?.85:.73);
  }
  reset();
  return {setTier,update,reset};
}
