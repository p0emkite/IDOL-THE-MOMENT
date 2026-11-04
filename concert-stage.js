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
  const glows=[],bars=[],batons=[],spots=[];
  const ledCanvas=document.createElement('canvas');ledCanvas.width=1000;ledCanvas.height=490;
  const ctx=ledCanvas.getContext('2d',{alpha:false});
  const ledTexture=new THREE.CanvasTexture(ledCanvas);
  ledTexture.colorSpace=THREE.SRGBColorSpace;
  ledTexture.anisotropy=Math.min(renderer.capabilities.getMaxAnisotropy(),4);
  const ledMaterial=new THREE.MeshBasicMaterial({map:ledTexture,side:THREE.DoubleSide,toneMapped:false});
  const ledGeom=new THREE.PlaneGeometry(24,12,96,22);
  // Gently wrap the LED panels around the performance area.
  const ledPositions=ledGeom.attributes.position;
  for(let i=0;i<ledPositions.count;i++){
    const x=ledPositions.getX(i);
    ledPositions.setZ(i,Math.pow(Math.abs(x)/12,2)*1.2);
  }
  ledGeom.computeVertexNormals();
  const led=new THREE.Mesh(ledGeom,ledMaterial);
  led.position.set(0,.45,-8.4);group.add(led);

  function material(color,opacity=1){return new THREE.MeshBasicMaterial({color,transparent:opacity<1,opacity,side:THREE.DoubleSide,depthWrite:opacity>=1,toneMapped:false})}
  function phys(color,metalness=.65,roughness=.32){return new THREE.MeshStandardMaterial({color,metalness,roughness})}
  function box(x,y,z,w,h,d,mat){
    const a=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);
    a.position.set(x,y,z);group.add(a);return a;
  }
  // Backstage steel truss and lighting bars, like an arena concert rig (no curtains).
  const truss=phys(0x484158,.8,.36);
  const trussLight=material(0xe9a3ff,.66);
  const trussBar=(x1,y1,x2,y2,z,width=.045)=>{
    const start=new THREE.Vector3(x1,y1,z),end=new THREE.Vector3(x2,y2,z);
    const length=start.distanceTo(end),mid=start.clone().add(end).multiplyScalar(.5);
    const rod=new THREE.Mesh(new THREE.CylinderGeometry(width,width,length,6),truss);
    rod.position.copy(mid);rod.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),end.clone().sub(start).normalize());group.add(rod);
  };
  for(const y of [4.55,4.98]){
    trussBar(-11.3,y,11.3,y,-5.7,.08);
  }
  for(let i=0;i<23;i++){
    const x=-11+i;
    trussBar(x,4.55,x,4.98,-5.7,.025);
    if(i<22)trussBar(x,4.55,x+1,4.98,-5.7,.024);
  }
  for(const sign of [-1,1]){
    for(let j=0;j<3;j++){
      trussBar(sign*11.1,-3.5+j*2.6,sign*11.1,-.9+j*2.6,-5.65,.055);
      trussBar(sign*10.76,-3.5+j*2.6,sign*11.4,-.9+j*2.6,-5.65,.018);
    }
  }
  // Curved overhead arena rig, stage-facing fixtures and spot beams.
  for(let j=0;j<30;j++){
    const a=(Math.PI*.07)+(Math.PI*.86)*(j/29);
    const x=Math.cos(a)*10.9,y=5.8+Math.sin(a)*.6,z=-3.9;
    if(j>0){
      const p=(Math.PI*.07)+(Math.PI*.86)*((j-1)/29);
      trussBar(Math.cos(p)*10.9,5.8+Math.sin(p)*.6,x,y,z,.065);
    }
    if(j%3===0){
      const fixture=box(x,y-.20,z+.16,.52,.23,.43,phys(0x231426,.6,.36));
      box(x,y-.37,z+.4,.34,.04,.06,material(0xffb9e7,.63));
    }
  }
  // Stage LED light fixtures; restrained emissive strips.
  for(let i=0;i<13;i++){
    const x=(i-6)*1.45;
    const panel=box(x,4.72,-5.25,.64,.115,.27,material(0x81528c,.82));
    const light=box(x,4.62,-5.06,.49,.065,.03,material(0xe1aaff,.56));
    glows.push(light);
  }
  // Modern glossy ring stage, sized beneath the existing sealed 3D pack.
  const discMaterial=phys(0x34223b,.82,.25);
  const rimMaterial=phys(0x9b639e,.85,.22);
  const disc=new THREE.Mesh(new THREE.CylinderGeometry(3.5,3.73,.18,88),discMaterial);
  disc.position.set(0,-2.42,.08);group.add(disc);
  const top=new THREE.Mesh(new THREE.CylinderGeometry(3.22,3.25,.095,88),rimMaterial);
  top.position.set(0,-2.29,.08);group.add(top);
  const inner=new THREE.Mesh(new THREE.CylinderGeometry(2.94,3.0,.04,88),discMaterial);
  inner.position.set(0,-2.224,.08);group.add(inner);
  for(const [radius,height,col,opacity] of [[3.56,-2.35,0xe2b3fb,.66],[3.18,-2.23,0xffc4ec,.53],[2.83,-2.19,0x9178e0,.33]]){
    const ring=new THREE.Mesh(new THREE.TorusGeometry(radius,.022,6,140),material(col,opacity));
    ring.rotation.x=-Math.PI/2;ring.position.set(0,height,.08);group.add(ring);glows.push(ring);
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
  const beamMaterial=new THREE.MeshBasicMaterial({color:0xf5bcec,transparent:true,opacity:.012,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false});
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
    const rainbow=rank==='UR';
    const grad=ctx.createLinearGradient(0,0,w,h);
    if(rainbow){
      ['#2b2059','#6e438d','#2d9dbb','#c16aab','#efc477','#40326e'].forEach((s,i)=>grad.addColorStop(i/5,s));
    }else{
      grad.addColorStop(0,palette[0]);grad.addColorStop(.45,palette[1]);grad.addColorStop(1,palette[0]);
    }
    ctx.fillStyle=grad;ctx.fillRect(0,0,w,h);
    const shade=ctx.createRadialGradient(w*.54,h*.4,0,w*.54,h*.5,w*.67);
    shade.addColorStop(0,'#ffffff2e');shade.addColorStop(.7,'#0000001c');shade.addColorStop(1,'#00000085');
    ctx.fillStyle=shade;ctx.fillRect(0,0,w,h);
    ctx.save();ctx.globalAlpha=.38;
    for(let y=8;y<h;y+=12)for(let x=8;x<w;x+=12){
      const alpha=.24+.24*Math.sin((x*.017+y*.014)+t*.7);
      ctx.fillStyle='rgba(255,218,250,'+alpha.toFixed(3)+')';
      ctx.beginPath();ctx.arc(x,y,3.15,0,Math.PI*2);ctx.fill();
    }
    ctx.restore();
    // Sweeping orbit motifs feel like an idol concert screen, not a theatre backdrop.
    ctx.strokeStyle=rainbow?'#ffdbff73':'#ffceee5e';ctx.lineWidth=5;
    ctx.beginPath();ctx.ellipse(w*.53,h*.48,w*.41,h*.28,-.37,Math.PI*.1,Math.PI*1.67);ctx.stroke();
    ctx.strokeStyle='#ffffff28';ctx.lineWidth=1.5;
    ctx.beginPath();ctx.ellipse(w*.55,h*.49,w*.47,h*.36,-.45,.4,Math.PI*1.89);ctx.stroke();
    ctx.textAlign='center';ctx.fillStyle='#ffffff36';
    ctx.shadowColor='#ffbfff';ctx.shadowBlur=14;
    ctx.font='italic 900 125px Georgia,serif';ctx.fillText('ITM',w/2,h*.59);
    ctx.font='700 20px Arial,sans-serif';ctx.fillText('I D O L   ·   T H E   M O M E N T',w/2,h*.68);
    ctx.shadowBlur=0;
    ledTexture.needsUpdate=true;
  }
  drawLED(0);
  function setRarity(tier){
    rank=COLOURS[tier]?tier:'DEFAULT';
    const p=COLOURS[rank];
    accentTarget.set(rank==='SSR'?'#e5b652':rank==='UR'?'#d296ed':p[1]);
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
    if(lastLed===-100 || t-lastLed>(mobile()?.22:.14)){drawLED(t);lastLed=t}
    for(let i=0;i<spots.length;i++){
      spots[i].intensity=([4.2,4.0,5.5][i])*(1+.035*Math.sin(t*.85+i));
      spots[i].color.lerp(i===2?new THREE.Color('#ffe7e6'):accent,.015);
    }
    glows.forEach((o,i)=>{if(o.material&&o.material.opacity<.95)o.material.opacity=.23+.1*Math.sin(t*.8+i)});
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
    // Entrance -> audience left -> packed audience right -> turning back to stage.
    const v=Math.max(0,Math.min(1,progress));
    const route=[
      {at:0,pos:[0,2.7,32],look:[0,-1,2],fov:51},
      {at:.24,pos:[0,2.7,24],look:[-13,-1.8,22],fov:53},
      {at:.47,pos:[-1.2,2.8,21],look:[13,-1.5,26],fov:53},
      {at:.70,pos:[0,2.6,17],look:[0,-.8,0],fov:48},
      {at:1,pos:[0,.65,mobile()?12.8:10.7],look:[0,-.32,0],fov:42}
    ];
    let i=0;while(i<route.length-2&&v>route[i+1].at)i++;
    const left=route[i],right=route[i+1];
    const raw=(v-left.at)/(right.at-left.at);
    const ease=Math.max(0,Math.min(1,raw));
    const k=ease*ease*(3-2*ease);
    const lerp=(a,b)=>a+(b-a)*k;
    return {
      pos:new THREE.Vector3(lerp(left.pos[0],right.pos[0]),lerp(left.pos[1],right.pos[1]),lerp(left.pos[2],right.pos[2])),
      look:new THREE.Vector3(lerp(left.look[0],right.look[0]),lerp(left.look[1],right.look[1]),lerp(left.look[2],right.look[2])),
      fov:lerp(left.fov,right.fov)
    };
  }
  function reset(){setRarity('DEFAULT');fireStart=-1;fire.visible=false}
  return {setRarity,reset,update,burst,introPose};
}
