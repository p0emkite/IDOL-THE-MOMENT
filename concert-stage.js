/*
  ITM Concert Stage — progressive visual enhancement of the existing Three.js scene.
  Only graphics are touched; account, rolls, collection, and Supabase are not modified.
*/
export function createConcertStage({THREE,scene,renderer,oldBeams=[]}){
  const group=new THREE.Group();scene.add(group);
  const mobile=()=>window.innerWidth<740;
  const COLOURS={
    DEFAULT:['#240d3b','#9b338e','#e46eaf'],
    N:['#242431','#8e9ba8','#d1d6e2'],
    R:['#102352','#2579df','#67caff'],
    SR:['#201044','#7f40c9','#d09aff'],
    SSR:['#392407','#c7861f','#ffe399'],
    UR:['#42315f','#f86bb6','#70d5ff']
  };
  let rank='DEFAULT',accent=new THREE.Color('#d277ed'),accentTarget=accent.clone();
  let lastLed=0,level=0,fireworks=[],fireworkElapsed=0;
  const glows=[],bars=[],batons=[],spots=[],lightBeams=[];
  let openingSequence=null,openingStart=0,openingDark=false,openingFire=false;
  const ledCanvas=document.createElement('canvas');ledCanvas.width=1100;ledCanvas.height=470;
  const ctx=ledCanvas.getContext('2d',{alpha:false});
  const ledTexture=new THREE.CanvasTexture(ledCanvas);
  ledTexture.colorSpace=THREE.SRGBColorSpace;
  ledTexture.anisotropy=Math.min(renderer.capabilities.getMaxAnisotropy(),4);
  const ledMaterial=new THREE.MeshBasicMaterial({map:ledTexture,side:THREE.DoubleSide,toneMapped:false});
  const ledGeom=new THREE.PlaneGeometry(24,7.25,96,22);
  // Gently wrap the LED panels around the performance area.
  const ledPositions=ledGeom.attributes.position;
  for(let i=0;i<ledPositions.count;i++){
    const x=ledPositions.getX(i);
    ledPositions.setZ(i,Math.pow(Math.abs(x)/12,2)*1.2);
  }
  ledGeom.computeVertexNormals();
  const led=new THREE.Mesh(ledGeom,ledMaterial);
  led.position.set(0,.65,-8.7);group.add(led);

  function material(color,opacity=1){return new THREE.MeshBasicMaterial({color,transparent:opacity<1,opacity,side:THREE.DoubleSide,depthWrite:opacity>=1,toneMapped:false})}
  function phys(color,metalness=.65,roughness=.32){return new THREE.MeshStandardMaterial({color,metalness,roughness})}
  function box(x,y,z,w,h,d,mat){
    const a=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);
    a.position.set(x,y,z);group.add(a);return a;
  }
  // Backstage steel truss and lighting bars, like an arena concert rig (no curtains).
  const truss=phys(0x797186,.35,.41);
  truss.emissive=new THREE.Color(0x211429);truss.emissiveIntensity=.32;
  const trussLight=material(0xe9a3ff,.66);
  const trussBar=(x1,y1,x2,y2,z,width=.045)=>{
    const start=new THREE.Vector3(x1,y1,z),end=new THREE.Vector3(x2,y2,z);
    const length=start.distanceTo(end),mid=start.clone().add(end).multiplyScalar(.5);
    const rod=new THREE.Mesh(new THREE.CylinderGeometry(width,width,length,6),truss);
    rod.position.copy(mid);rod.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),end.clone().sub(start).normalize());group.add(rod);
  };
  for(const y of [4.55,4.98]){
    trussBar(-9.7,y,9.7,y,-5.7,.08);
  }
  for(let i=0;i<23;i++){
    const x=-9.4+i*.85;
    trussBar(x,4.55,x,4.98,-5.7,.025);
    if(i<22)trussBar(x,4.55,x+.85,4.98,-5.7,.024);
  }
  for(const sign of [-1,1]){
    for(let j=0;j<3;j++){
      trussBar(sign*9.55,-3.5+j*2.6,sign*9.55,-.9+j*2.6,-5.65,.068);
      trussBar(sign*9.25,-3.5+j*2.6,sign*9.87,-.9+j*2.6,-5.65,.029);
    }
  }
  // Curved overhead arena rig, stage-facing fixtures and spot beams.
  for(let j=0;j<30;j++){
    const a=(Math.PI*.07)+(Math.PI*.86)*(j/29);
    const x=Math.cos(a)*9.25,y=4.8+Math.sin(a)*.78,z=-3.9;
    if(j>0){
      const p=(Math.PI*.07)+(Math.PI*.86)*((j-1)/29);
      trussBar(Math.cos(p)*9.25,4.8+Math.sin(p)*.78,x,y,z,.07);
    }
    if(j%3===0){
      const fixture=box(x,y-.20,z+.16,.52,.23,.43,phys(0x231426,.6,.36));
      box(x,y-.37,z+.4,.34,.04,.06,material(0xffb9e7,.63));
    }
  }
  // Stage LED light fixtures; restrained emissive strips.
  for(let i=0;i<13;i++){
    const x=(i-6)*1.35;
    box(x,4.72,-5.25,.64,.16,.37,phys(0x261728,.48,.3));
    const light=box(x,4.60,-5.02,.44,.09,.055,material(i%4===0?0xffd4ed:0xf3a2e4,.83));
    glows.push(light);
    const halo=box(x,4.56,-4.97,.68,.17,.014,material(i%4===0?0xffe1f1:0xe9b2f9,.14));
    glows.push(halo);
  }
  // Modern glossy ring stage, sized beneath the existing sealed 3D pack.
  const discMaterial=phys(0x6d3b68,.55,.26);discMaterial.emissive=new THREE.Color(0x532348);discMaterial.emissiveIntensity=.35;
  const rimMaterial=phys(0xd698d2,.6,.2);rimMaterial.emissive=new THREE.Color(0xa45a87);rimMaterial.emissiveIntensity=.3;
  const disc=new THREE.Mesh(new THREE.CylinderGeometry(3.5,3.73,.18,88),discMaterial);
  disc.position.set(0,-2.42,.08);group.add(disc);
  const top=new THREE.Mesh(new THREE.CylinderGeometry(3.22,3.25,.095,88),rimMaterial);
  top.position.set(0,-2.29,.08);group.add(top);
  const inner=new THREE.Mesh(new THREE.CylinderGeometry(2.94,3.0,.04,88),discMaterial);
  inner.position.set(0,-2.224,.08);group.add(inner);
  for(const [radius,height,col,opacity] of [[3.56,-2.35,0xe2b3fb,.66],[3.18,-2.23,0xffc4ec,.53],[2.83,-2.19,0x9178e0,.33]]){
    const ring=new THREE.Mesh(new THREE.TorusGeometry(radius,.045,8,140),material(col,Math.min(1,opacity*1.35)));
    ring.rotation.x=-Math.PI/2;ring.position.set(0,height,.08);group.add(ring);glows.push(ring);
  }
  // Pink-polished arena floor with deliberately restrained faux reflections.
  const floorCanvas=document.createElement('canvas');
  floorCanvas.width=1024;floorCanvas.height=1024;
  const fg=floorCanvas.getContext('2d',{alpha:false});
  const floorGrad=fg.createLinearGradient(0,0,1024,1024);
  floorGrad.addColorStop(0,'#130d23');floorGrad.addColorStop(.18,'#3c2348');
  floorGrad.addColorStop(.42,'#68345f');floorGrad.addColorStop(.71,'#27132d');
  floorGrad.addColorStop(1,'#090711');
  fg.fillStyle=floorGrad;fg.fillRect(0,0,1024,1024);
  for(let i=0;i<26;i++){
    const x=32+i*43;
    const g=fg.createLinearGradient(x-36,0,x+60,1024);
    g.addColorStop(0,'#ffffff00');g.addColorStop(.48,i%4===0?'#ffacfa2b':'#e2b9fc0b');g.addColorStop(1,'#ffffff00');
    fg.fillStyle=g;fg.fillRect(x,0,24+i%3*7,1024);
  }
  const reflection=fg.createRadialGradient(512,240,8,512,380,540);
  reflection.addColorStop(0,'#ffb3e9b2');reflection.addColorStop(.42,'#e48bd54c');reflection.addColorStop(1,'#e578cf00');
  fg.fillStyle=reflection;fg.fillRect(0,0,1024,1024);
  const floorTexture=new THREE.CanvasTexture(floorCanvas);
  floorTexture.colorSpace=THREE.SRGBColorSpace;
  const floorOverlay=new THREE.Mesh(new THREE.PlaneGeometry(60,60),new THREE.MeshBasicMaterial({map:floorTexture,transparent:true,opacity:.83,side:THREE.DoubleSide,depthWrite:false}));
  floorOverlay.rotation.x=-Math.PI/2;floorOverlay.position.set(0,-3.68,-3.2);group.add(floorOverlay);
  // Additional light pools align with the overhead concert rig and shimmer on the floor.
  const poolGeo=new THREE.CircleGeometry(2.6,64);
  for(const [x,z,c,o] of [[-6,-5,0xff8fc6,.10],[6,-5,0xeb9aff,.11],[-3,-1,0xff9be8,.065],[3,-1,0xffd2dd,.065]]){
    const p=new THREE.Mesh(poolGeo,material(c,o));
    p.rotation.x=-Math.PI/2;p.position.set(x,-3.658,z);group.add(p);
  }
  // Square-frame strip lights on the massive curved display wings.
  for(const sign of [-1,1]){
    const x=sign*9.65;
    for(let j=0;j<4;j++){
      const fixture=box(x,3.45-j*1.8,-5.46,.12,1.32,.2,material(0x301327,.95));
      const lens=box(x,3.45-j*1.8,-5.19,.07,.97,.07,material(j%2?0xe58dff:0xffabd7,.67));
      glows.push(lens);
    }
  }
  // Upper-focused lights use physically bounded intensity rather than giant white cones.
  for(const [x,y,z,col,intensity] of [[-4.6,5.35,2.5,0xe8a7fa,4.2],[4.6,5.35,2.5,0xc1b8fa,4.0],[0,6.6,1,0xffeddd,5.5]]){
    const spot=new THREE.SpotLight(col,intensity,24,.47,.77,1.8);
    spot.position.set(x,y,z);
    spot.target.position.set(0,-.85,0);
    group.add(spot,spot.target);
    spots.push(spot);
  }
  for(const beam of oldBeams){if(beam?.material)beam.material.opacity=Math.min(beam.material.opacity,.009)}
  const beamMaterial=new THREE.MeshBasicMaterial({color:0xf5bcec,transparent:true,opacity:.033,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false});
  for(const [sx,sy,sz,tx,ty,tz,color] of [
    [-6.0,5.7,-2.0,-.7,-1.1,0,0xffa8d3],
    [6.0,5.7,-2.0,.7,-1.1,0,0xbbb3ff],
    [0,6.8,-1.7,0,-1.5,0,0xffe4c9]]){
      const from=new THREE.Vector3(sx,sy,sz),to=new THREE.Vector3(tx,ty,tz);
      const displacement=to.clone().sub(from);
      const cone=new THREE.Mesh(new THREE.ConeGeometry(2.2,displacement.length(),52,1,true),beamMaterial.clone());
      cone.material.color.set(color);
      cone.position.copy(from).add(to).multiplyScalar(.5);
      cone.quaternion.setFromUnitVectors(new THREE.Vector3(0,-1,0),displacement.normalize());
      group.add(cone);
      lightBeams.push({cone,from,to:to.clone()});
  }
  // Concert audience silhouettes along left/right sides, glowsticks wave subtly.
  const crowdColor=new THREE.MeshBasicMaterial({color:0x0a0812,transparent:true,opacity:.84,depthWrite:false});
  const glowMat=new THREE.MeshBasicMaterial({color:0xffffff,toneMapped:false,transparent:true,opacity:.9,blending:THREE.AdditiveBlending,depthWrite:false});
  const glowGeo=new THREE.CylinderGeometry(.028,.034,.41,5);
  const dummy=new THREE.Object3D();
  const count=mobile()?650:1450;
  const sticks=new THREE.InstancedMesh(glowGeo,glowMat,count);
  sticks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  sticks.frustumCulled=false;
  const stickColors=[0xec92fc,0xe2cbff,0xf4c988,0x9cc5ff,0xe876ae,0xa7e6d2];
  const random=(n)=>{const x=Math.sin(n*127.1+4.33)*43758.545;return x-Math.floor(x)};
  for(let i=0;i<count;i++){
    const side=i%2===0?-1:1;
    const front=i<count*.21;
    const depth=front ? 4.9+random(i*4+13)*5 : 10.5+random(i*4+13)*25;
    // Dense, gently stepped audience bowl; keep the central entry aisle clear.
    const lateral=front ? (2.9+random(i*9+7)*8.6) : (2.1+random(i*9+7)*15);
    const x=side*lateral;
    const y=-3.95+(front?random(i*8+3)*.76:Math.min(2.9,(depth-9)*.083)+random(i*8+3)*.4);
    const z=depth;
    const tint=new THREE.Color(stickColors[i%stickColors.length]);
    sticks.setColorAt(i,tint);
    batons.push({x,y,z,a:random(i*6+2)*6.28,seed:random(i*17+7)});
    dummy.position.set(x,y,z);
    dummy.rotation.set((random(i*3)-.5)*.6,0,(random(i*2)-.5)*.85);
    dummy.updateMatrix();sticks.setMatrixAt(i,dummy.matrix);
  }
  group.add(sticks);
  const audience=new THREE.InstancedMesh(new THREE.SphereGeometry(.22,7,6),crowdColor,count);
  audience.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  audience.frustumCulled=false;
  batons.forEach((b,i)=>{
    dummy.position.set(b.x,b.y-.36,b.z);
    dummy.scale.set(1.05,1.13,1);
    dummy.rotation.set(0,0,0);dummy.updateMatrix();audience.setMatrixAt(i,dummy.matrix);
    dummy.scale.set(1,1,1);
  });
  group.add(audience);
  // Firing gold, pink, and rainbow sparks for top-tier results.
  const fireGeom=new THREE.BufferGeometry(),n=240;
  const firePositions=new Float32Array(n*3),fireColors=new Float32Array(n*3);
  const velocity=[];
  for(let i=0;i<n;i++){
    const theta=random(i*2+19)*Math.PI*2,speed=.8+random(i*7+3)*4;
    velocity.push({x:Math.cos(theta)*speed,y:2.1+random(i*13+2)*4,z:(random(i*9+8)-.5)*3});
    const c=new THREE.Color(['#ed9eff','#ffe49d','#9ee4ff','#f5a2c3'][i%4]);
    fireColors.set([c.r,c.g,c.b],i*3);
  }
  fireGeom.setAttribute('position',new THREE.BufferAttribute(firePositions,3));
  fireGeom.setAttribute('color',new THREE.BufferAttribute(fireColors,3));
  const fireMat=new THREE.PointsMaterial({size:.075,transparent:true,opacity:0,vertexColors:true,blending:THREE.AdditiveBlending,depthWrite:false});
  const fire=new THREE.Points(fireGeom,fireMat);
  fire.frustumCulled=false;group.add(fire);
  let fireStart=-1,fireTier=null;

  function drawLED(t){
    const w=ledCanvas.width,h=ledCanvas.height;
    const palette=COLOURS[rank]||COLOURS.DEFAULT;
    const dark=openingDark;
    const base=ctx.createLinearGradient(0,0,w,0);
    if(dark){
      base.addColorStop(0,'#07050c');base.addColorStop(.5,'#100a17');base.addColorStop(1,'#07050c');
    }else if(rank==='UR'){
      ['#6e3177','#bc6393','#8762b9','#5094c6','#8a68a9','#e49a72','#863b8b'].forEach((c,i)=>base.addColorStop(i/6,c));
    }else if(rank==='WHITE'){
      base.addColorStop(0,'#323242');base.addColorStop(.45,'#9485aa');base.addColorStop(1,'#312539');
    }else{
      base.addColorStop(0,palette[0]);base.addColorStop(.25,palette[1]);base.addColorStop(.62,palette[2]);base.addColorStop(1,palette[0]);
    }
    ctx.fillStyle=base;ctx.fillRect(0,0,w,h);
    if(dark){
      ctx.fillStyle='#05030c99';ctx.fillRect(0,0,w,h);
    }else{
      const orb=ctx.createRadialGradient(w*.55,h*.36,1,w*.55,h*.36,w*.62);
      orb.addColorStop(0,rank==='SSR'?'#ffe19d80':rank==='SR'?'#f0c1ff70':'#ffcef36e');
      orb.addColorStop(.6,'#ffffff06');orb.addColorStop(1,'#00000070');
      ctx.fillStyle=orb;ctx.fillRect(0,0,w,h);
      const stripe=ctx.createLinearGradient(0,0,w,h);
      stripe.addColorStop(0,'#ffffff00');
      stripe.addColorStop(.32,'#ffd3f018');
      stripe.addColorStop(.45,'#eaa8e037');
      stripe.addColorStop(.55,'#ffffff08');
      stripe.addColorStop(.72,'#ffacff2e');
      stripe.addColorStop(1,'#ffffff00');
      ctx.fillStyle=stripe;ctx.fillRect(0,0,w,h);
    }
    // A real matrix of emissive LED dots with slow fluid waves in brightness and hue.
    for(let y=5,iy=0;y<h;y+=11,iy++){
      for(let x=6,ix=0;x<w;x+=11,ix++){
        const ridge=Math.sin(ix*.16-t*1.1+Math.sin(iy*.22+t*.31)*2.3);
        const wave=Math.sin(ix*.055+iy*.115+t*.56)*.5+.5;
        const pulse=Math.max(0,(ridge+1)*.5);
        const sweep=Math.pow(Math.max(0,Math.sin(ix*.028+iy*.018-t*.8)),8);
        const strength=dark?.06:Math.min(.96,.22+pulse*.38+wave*.14+sweep*.3);
        const radius=dark?1.5:3.25+(pulse*.35);
        let color;
        if(rank==='UR'){
          const hue=(ix*.0065+Math.sin(iy*.12+t*.43)*.12+t*.045)%1;
          color='hsla('+Math.round(hue*360)+',100%,85%,'+strength.toFixed(2)+')';
        }else if(rank==='SSR'){
          color='rgba(255,232,175,'+strength.toFixed(2)+')';
        }else if(rank==='SR'){
          color='rgba(238,181,255,'+strength.toFixed(2)+')';
        }else{
          color='rgba(255,199,235,'+strength.toFixed(2)+')';
        }
        ctx.fillStyle=color;
        ctx.beginPath();ctx.arc(x,y,radius,0,Math.PI*2);ctx.fill();
      }
    }
    if(!dark){
      // Slender flowing ribbon on the video wall; distinct from the physical spotlight beams.
      ctx.save();
      const k=(t*.11)%1;
      ctx.lineWidth=3.5;ctx.strokeStyle=rank==='UR'?'#e8faff8c':'#ffd0f285';
      ctx.shadowBlur=11;ctx.shadowColor=rank==='SSR'?'#ffd88b':'#ff9de9';
      ctx.beginPath();
      ctx.moveTo(-90,h*.72);
      ctx.bezierCurveTo(w*.12,h*.54+40*Math.sin(t*.46),w*.38,h*.13,w*.64,h*.40);
      ctx.bezierCurveTo(w*.82,h*.63,w*.91,h*.1,w+90,h*.19);
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle='#fff9ff26';ctx.textAlign='center';
      ctx.font='italic 900 138px Georgia,serif';ctx.fillText('ITM',w*.5,h*.59);
    }
    ledTexture.needsUpdate=true;
  }
  drawLED(0);
  function setRarity(tier){
    rank=(tier==='WHITE'||COLOURS[tier])?tier:'DEFAULT';
    const p=COLOURS[rank]||COLOURS.DEFAULT;
    accentTarget.set(rank==='SSR'?'#e5b652':rank==='UR'?'#d296ed':rank==='WHITE'?'#eee4ff':p[1]);
    lastLed=-100;
    // Flash and fireworks are reserved for an actual UR reveal, not an unopened pack.
  }
  function burst(tier){
    fireTier=tier;fireStart=performance.now()*.001;
    for(let i=0;i<n;i++){
      const c=new THREE.Color(tier==='UR'?['#7de9ff','#c989ff','#ffd07c','#ff87d0','#9affce'][i%5]:['#ffeaba','#ffbf64','#ff87a0'][i%3]);
      fireColors.set([c.r,c.g,c.b],i*3);
    }
    fireGeom.attributes.color.needsUpdate=true;
    fire.visible=true;
  }
  function update(t,dt){
    const motion=Math.min(dt,.06);
    accent.lerp(accentTarget,Math.min(1,motion*3));
    if(openingSequence){
      const elapsed=performance.now()*.001-openingStart;
      const tier=openingSequence;
      let next='WHITE',dark=false;
      if(tier==='UR'){
        dark=elapsed>=.70&&elapsed<1.58;
        next=elapsed>=1.58?'UR':'WHITE';
        if(elapsed>=1.82&&!openingFire){openingFire=true;burst('UR')}
      }else if(tier==='SSR'){
        next=elapsed>=1.52?'SSR':elapsed>=.81?'SR':'WHITE';
      }else if(tier==='SR'){
        next=elapsed>=1.25?'SR':'WHITE';
      }
      if(next!==rank||dark!==openingDark){
        rank=next;openingDark=dark;
        accentTarget.set(dark?'#07030b':next==='SSR'?'#ffe0a0':next==='SR'?'#cba2ff':next==='UR'?'#f19ede':'#fff6ff');
        lastLed=-100;
      }
    }
    if(lastLed===-100 || t-lastLed>(mobile()?.22:.14)){drawLED(t);lastLed=t}
    for(let i=0;i<spots.length;i++){
      spots[i].intensity=(openingDark?.15:[7.3,7.2,8.3][i])*(1+.08*Math.sin(t*.57+i));
      spots[i].color.lerp(i===2?new THREE.Color('#ffe7e6'):accent,.03);
      spots[i].target.position.x=Math.sin(t*.31+i*2.2)*1.4;
      spots[i].target.updateMatrixWorld();
    }
    for(let i=0;i<lightBeams.length;i++){
      const entry=lightBeams[i];
      const dest=entry.to.clone();dest.x+=Math.sin(t*.29+i*2.4)*1.1;
      const axis=dest.sub(entry.from);
      entry.cone.position.copy(entry.from).addScaledVector(axis,.5);
      entry.cone.quaternion.setFromUnitVectors(new THREE.Vector3(0,-1,0),axis.normalize());
      entry.cone.material.opacity=openingDark?.001:.033+.006*Math.sin(t*.8+i*1.7);
    }
    glows.forEach((o,i)=>{if(o.material&&o.material.opacity<.95)o.material.opacity=.42+.08*Math.sin(t*.82+i*.61)});
    const maxMove=mobile()?.22:.28;
    for(let i=0;i<count;i++){
      const b=batons[i];
      dummy.position.set(b.x,b.y+.04*Math.sin(t*1.1+b.a),b.z);
      dummy.rotation.set(.3*Math.sin(t*.7+b.a),0,maxMove*Math.sin(t*1.5+b.seed*8));
      dummy.scale.set(1,1,1);dummy.updateMatrix();sticks.setMatrixAt(i,dummy.matrix);
    }
    sticks.instanceMatrix.needsUpdate=true;
    if(fireStart>=0){
      const age=performance.now()*.001-fireStart,arr=fireGeom.attributes.position;
      fireMat.opacity=Math.max(0,.78*(1-age/1.8));
      for(let i=0;i<n;i++){
        const v=velocity[i],xbase=i%2===0?-2.8:2.8;
        arr.setXYZ(i,xbase+v.x*age,-1.65+v.y*age-3.9*age*age,v.z*age);
      }
      arr.needsUpdate=true;
      if(age>=1.8){fireStart=-1;fire.visible=false;fireMat.opacity=0}
    }
  }

  function introPose(progress){
    // One uninterrupted 360° camera sweep. Yaw never jumps between look-at targets.
    const v=Math.max(0,Math.min(1,progress)),orbitEnd=.77;
    const approach=Math.max(0,Math.min(1,(v-orbitEnd)/(1-orbitEnd)));
    const smooth=x=>x*x*(3-2*x);
    const orbit=smooth(Math.min(1,v/orbitEnd)),final=smooth(approach);
    const yaw=orbit*Math.PI*2;
    const mobileCamera=mobile();
    const zOrbit=26.5-(orbit*11.2);
    const xOrbit=Math.sin(orbit*Math.PI)*1.25;
    const eye=new THREE.Vector3(
      xOrbit*(1-final),
      2.45+(Math.sin(orbit*Math.PI*2)*.16)*(1-final)-final*1.8,
      zOrbit*(1-final)+(mobileCamera?12.8:10.7)*final
    );
    // During the sweep, show the stadium grandstands, then settle to the cardpack.
    const pitch=-.08*(1-final)-final*.09;
    const direction=new THREE.Vector3(Math.sin(yaw)*(1-final),pitch,-Math.cos(yaw)*(1-final)-final);
    direction.normalize();
    const look=eye.clone().addScaledVector(direction,17);
    return {pos:eye,look,fov:50-orbit*2-final*6};
  }
  function beginOpening(tier){
    openingSequence=tier||'N';
    openingStart=performance.now()*.001;
    openingDark=false;openingFire=false;
    rank='WHITE';accentTarget.set('#fff0fa');lastLed=-100;
  }
  function endOpening(){
    openingSequence=null;openingDark=false;
    if(rank==='WHITE')setRarity('DEFAULT');
  }
  function reset(){setRarity('DEFAULT');fireStart=-1;fire.visible=false}
  return {setRarity,reset,update,burst,introPose,beginOpening,endOpening};
}
