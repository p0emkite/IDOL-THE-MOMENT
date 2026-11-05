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
    for(const light of [charge,seam,heart,stageFlare])light.material.color.copy(col);
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
    // The interior illuminates as the top tears off.
    const inner=bump(elapsed,2.56,3.14,4.10,4.64);
    heart.material.opacity=inner*(tier==='N'?.25:.43);
    heart.scale.set(2.4+inner*1.1,1.8+inner*1.55,1);
    stageFlare.material.opacity=bump(elapsed,3.00,3.27,3.75,4.34)*(tier==='UR'?.31:.19);
    stageFlare.scale.set(4.3+inner*1.9,2.2+inner*1.0,1);
    for(let i=0;i<rings.length;i++){
      const when=i===0?2.59:3.32;
      const age=elapsed-when,ratio=clamp(age/.85);
      const r=rings[i];
      r.material.opacity=age>=0&&age<.85?(1-smooth(ratio))*(tier==='N'?.38:.66):0;
      r.scale.setScalar(.12+ratio*2.75);
      r.rotation.z=elapsed*.18;
    }
    const spokesAmt=bump(elapsed,3.07,3.30,3.62,4.06);
    for(let i=0;i<spokes.length;i++){
      const ray=spokes[i],angle=Math.PI*2*i/spokes.length;
      ray.material.opacity=spokesAmt*(tier==='UR'?.29:.18);
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
      positions[3*i]=v.x*motion*.62;
      positions[3*i+1]=(second?.45:.96)+v.y*motion*.76-1.30*motion*motion;
      positions[3*i+2]=.45+v.z*motion;
    }
    geom.attributes.position.needsUpdate=true;
    sparkMat.opacity=peak*(tier==='UR'?.88:tier==='SSR'?.77:.59);
  }
  reset();
  return {setTier,update,reset};
}
