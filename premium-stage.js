/* ITM Premium Arena v4.
 * An actual 3D venue: no screenshot as a backdrop. Retains old gameplay APIs.
 * Geometry, LED, stage lighting, audience, entrance camera all inhabit one scene.
 */
export function createConcertStage({THREE,scene,renderer,oldBeams=[]}) {
  const venue=new THREE.Group();scene.add(venue);
  const isMobile=()=>window.innerWidth<760;
  const prng=n=>{const t=Math.sin(n*127.173+9.13)*43758.5453;return t-Math.floor(t)};
  const mix=(a,b,t)=>a+(b-a)*t, clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
  const smooth=t=>{t=clamp(t);return t*t*(3-2*t)};
  const C={
    DEFAULT:['#190b29','#84346e','#d977b2'],
    WHITE:['#24212f','#776780','#d4bcd7'],
    N:['#292431','#8c8593','#b7b6c4'],
    R:['#0e244a','#2863bd','#7cd9fb'],
    SR:['#23113f','#7e35b7','#e4a3ff'],
    SSR:['#3c230e','#d19137','#ffe6a7'],
    UR:['#431e71','#a94daa','#92dbff']
  };
  let grade='DEFAULT',opening=null,openAt=0,lastDraw=-10,blackout=false,fireStarted=false;
  const tint=new THREE.Color('#f09ddb'),spots=[],rays=[],glowMeshes=[],batons=[];
  const mat=(color,opacity=1,opts={})=>new THREE.MeshBasicMaterial({
    color,transparent:true,opacity,depthWrite:opacity>=1,
    side:THREE.DoubleSide,toneMapped:false,...opts
  });
  const metal=(color,rough=.29,metalness=.7)=>new THREE.MeshPhysicalMaterial({
    color,metalness,roughness:rough,clearcoat:.74,clearcoatRoughness:.18,
    envMapIntensity:1.18
  });
  function mesh(geometry,material,pos=[0,0,0],parent=venue){
    const m=new THREE.Mesh(geometry,material);
    m.position.set(...pos);parent.add(m);return m;
  }
  function panel(x,y,z,w,h,d,material){
    return mesh(new THREE.BoxGeometry(w,h,d),material,[x,y,z]);
  }
  function rod(a,b,radius,material,sides=8){
    const from=new THREE.Vector3(...a),to=new THREE.Vector3(...b);
    const m=mesh(new THREE.CylinderGeometry(radius,radius,from.distanceTo(to),sides),material);
    m.position.copy(from).add(to).multiplyScalar(.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),to.sub(from).normalize());
    return m;
  }
  function ribbon(points,r,material){
    const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));
    return mesh(new THREE.TubeGeometry(curve,Math.max(30,points.length*3),r,6,false),material);
  }

  // A generated softbox environment gives glossy foil/metal reflections
  // without requiring image downloads or a huge HDR texture.
  const envCanvas=document.createElement('canvas');envCanvas.width=1024;envCanvas.height=512;
  const e=envCanvas.getContext('2d'),env=e.createLinearGradient(0,0,0,512);
  env.addColorStop(0,'#24192b');env.addColorStop(.35,'#5f4168');
  env.addColorStop(.52,'#9b6392');env.addColorStop(1,'#130d20');
  e.fillStyle=env;e.fillRect(0,0,1024,512);
  for(const [x,y,w,h,light] of [[60,65,160,90,'#ffe9fa'],[315,25,220,80,'#f7ceff'],[700,40,170,120,'#f3e5ff'],[850,260,95,100,'#ffb4dd']]){
    const g=e.createRadialGradient(x+w/2,y+h/2,8,x+w/2,y+h/2,w);
    g.addColorStop(0,light);g.addColorStop(1,'#d687ae00');
    e.fillStyle=g;e.fillRect(x-w,y-h,w*3,h*3);
  }
  const environment=new THREE.CanvasTexture(envCanvas);
  environment.mapping=THREE.EquirectangularReflectionMapping;
  environment.colorSpace=THREE.SRGBColorSpace;
  scene.environment=environment;

  // Gigantic concave video wall with true physical curvature, not a billboard.
  const screenCanvas=document.createElement('canvas');screenCanvas.width=isMobile()?1024:1536;
  screenCanvas.height=isMobile()?448:640;
  const g=screenCanvas.getContext('2d',{alpha:false});
  const screenTexture=new THREE.CanvasTexture(screenCanvas);
  screenTexture.colorSpace=THREE.SRGBColorSpace;
  screenTexture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
  const wallGeo=new THREE.PlaneGeometry(22.4,7.65,96,24);
  const attr=wallGeo.attributes.position;
  const wallZ=x=>-8.05+1.53*Math.pow(x/11.2,2);
  for(let i=0;i<attr.count;i++){
    const x=attr.getX(i);attr.setZ(i,1.53*Math.pow(x/11.2,2));
  }
  wallGeo.computeVertexNormals();
  const wall=mesh(wallGeo,new THREE.MeshBasicMaterial({map:screenTexture,side:THREE.DoubleSide,toneMapped:false}),[0,.74,-8.05]);
  const rig=metal(0x55465a,.37,.53);
  const rigDark=metal(0x2b202f,.42,.5);
  const rigRose=mat(0xf4a3cf,.83);
  const ledTrim=mat(0xffacd9,.60,{blending:THREE.AdditiveBlending,depthWrite:false});
  const upper=[],lower=[],archInner=[],archOuter=[];
  for(let i=0;i<=32;i++){
    const x=-11.15+i*(22.3/32),z=wallZ(x);
    upper.push([x,4.65,z+.12]);lower.push([x,-3.18,z+.12]);
    archInner.push([x,5.35+.36*Math.cos(x/11.15*Math.PI/2),-4.84+.38*(x/11.15)**2]);
    archOuter.push([x,5.88+.42*Math.cos(x/11.15*Math.PI/2),-5.04+.38*(x/11.15)**2]);
  }
  ribbon(upper,.08,rig);
  ribbon(lower,.07,rig);
  ribbon(upper.map(([x,y,z])=>[x,y-.17,z+.08]),.024,ledTrim);
  ribbon(archInner,.065,rig);
  ribbon(archOuter,.075,rig);
  for(let i=0;i<32;i++){
    const a=archInner[i],b=archOuter[i],c=archInner[i+1],d=archOuter[i+1];
    rod(a,b,.028,rigDark);
    if(i%2===0)rod(a,d,.028,rig);
    else rod(b,c,.025,rig);
  }
  for(const sign of [-1,1]){
    const x=sign*11.17,z=wallZ(x);
    for(let y=-3.2;y<4.6;y+=.77){
      rod([x,y,z+.08],[x,y+.77,z+.08],.067,rig);
      rod([x-sign*.33,y,z+.12],[x+sign*.3,y+.77,z+.12],.027,rig);
    }
    rod([x,-3.2,z],[x,5.1,z],.11,rig);
    rod([x-sign*.24,-3.2,z+.1],[x-sign*.24,5.1,z+.1],.034,rig);
    panel(x,-.1,z+.25,.13,5.7,.12,mat(0xf593c5,.38));
  }
  // Visible stage monitor footlights, rigged LED battens and glossy lenses.
  for(let i=0;i<13;i++){
    const x=(i-6)*1.44;
    panel(x,5.47,-4.55,.73,.19,.47,rigDark);
    const lens=panel(x,5.30,-4.18,.57,.09,.09,mat(i%4===0?0xffe5ef:0xffb3e2,.75));
    glowMeshes.push(lens);
    panel(x,-3.17,wallZ(x)+.31,.56,.11,.15,mat(i%3===0?0xffd1ea:0xffa2d5,.7));
  }
  // Side stage lighting towers are now lattice trusses in real perspective.
  for(const sign of [-1,1]){
    const x=sign*10.65;
    const z=-4.38;
    for(const offset of [-.2,.2]){
      rod([x+offset,-3.53,z+offset],[x+offset,5.4,z+offset],.074,rig);
    }
    for(let j=0;j<10;j++){
      const y=-3.45+j*.87;
      rod([x-.2,y,z-.2],[x+.2,y+.87,z+.2],.035,rig);
      rod([x+.2,y,z-.2],[x-.2,y+.87,z+.2],.029,rig);
    }
    for(let k=0;k<4;k++){
      const y=-2.48+k*1.86;
      panel(x,y,z+.35,.34,1.03,.18,rigDark);
      panel(x,y,z+.48,.14,.91,.055,mat(k%2?0xea98ec:0xffb7e3,.64));
    }
  }

  // Concert stage with physically shaded polished disks and multiple neon insets.
  const darkChrome=metal(0x21172f,.21,.68);
  const chrome=metal(0x865277,.20,.58);
  const platform=mesh(new THREE.CylinderGeometry(3.63,3.8,.24,128),darkChrome,[0,-2.53,.1]);
  mesh(new THREE.CylinderGeometry(3.40,3.46,.09,128),chrome,[0,-2.36,.1]);
  mesh(new THREE.CylinderGeometry(3.12,3.12,.06,128),darkChrome,[0,-2.30,.1]);
  for(const [rad,y,opacity] of [[3.72,-2.43,.8],[3.36,-2.32,.62],[3.10,-2.263,.36]]){
    const ring=mesh(new THREE.TorusGeometry(rad,.022,6,156),
      mat(0xff9edb,opacity,{blending:THREE.AdditiveBlending,depthWrite:false}),[0,y,.1]);
    ring.rotation.x=-Math.PI/2;
  }
  // True horizontal concert floor, plus localised reflection pools that
  // fade toward the edge rather than looking like a separate painted plate.
  const floorMaterial=metal(0x301d35,.18,.35);
  floorMaterial.clearcoat=1;floorMaterial.envMapIntensity=.86;
  const floor=mesh(new THREE.PlaneGeometry(80,66),floorMaterial,[0,-3.54,-3.5]);
  floor.rotation.x=-Math.PI/2;
  const overlayCanvas=document.createElement('canvas');overlayCanvas.width=1024;overlayCanvas.height=1024;
  const cg=overlayCanvas.getContext('2d');
  const floorGrad=cg.createRadialGradient(512,445,25,512,445,520);
  floorGrad.addColorStop(0,'#f49be27c');floorGrad.addColorStop(.30,'#f4b4fa33');
  floorGrad.addColorStop(.72,'#622d6a15');floorGrad.addColorStop(1,'#00000000');
  cg.fillStyle=floorGrad;cg.fillRect(0,0,1024,1024);
  const floorTex=new THREE.CanvasTexture(overlayCanvas);
  floorTex.colorSpace=THREE.SRGBColorSpace;
  const reflection=mesh(new THREE.PlaneGeometry(20,17),
    new THREE.MeshBasicMaterial({map:floorTex,transparent:true,opacity:.8,depthWrite:false,blending:THREE.AdditiveBlending}),[0,-3.522,-1.8]);
  reflection.rotation.x=-Math.PI/2;

  // Motion-timed light sources, balanced with a subtle volumetric falloff.
  const beamMat=(hex)=>new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,
    uniforms:{uColor:{value:new THREE.Color(hex)},uStrength:{value:.12}},
    vertexShader:'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:'uniform vec3 uColor; uniform float uStrength; varying vec2 vUv; void main(){float y=vUv.y;float a=pow(clamp(y,0.,1.),.88)*pow(clamp(1.-y,0.,1.),.65);a*=smoothstep(0.,.1,vUv.x)*smoothstep(1.,.9,vUv.x);gl_FragColor=vec4(uColor,a*uStrength);}'
  });
  const lampPositions=[
    [-6.9,5.35,-3.6,0xf7acdb,-2.7],
    [-3.1,5.83,-4.3,0xb8a7fa,-.6],
    [3.1,5.83,-4.3,0xffc1e4,.6],
    [6.9,5.35,-3.6,0xe3a3fc,2.7],
    [0,6.0,-3.9,0xffe8ee,0]
  ];
  for(let i=0;i<lampPositions.length;i++){
    const [x,y,z,color,targetX]=lampPositions[i];
    const spot=new THREE.SpotLight(color,i===4?6.5:4.2,21,.48,.78,1.7);
    spot.position.set(x,y,z);
    spot.target.position.set(targetX,-1.68,-.5);
    venue.add(spot,spot.target);
    spots.push({spot,targetX,phase:i*1.7});
    panel(x,y+.15,z,.51,.3,.42,rigDark);
    panel(x,y-.1,z+.2,.41,.09,.08,mat(color,.79));
    const dest=new THREE.Vector3(targetX,-2.0,-.5);
    const from=new THREE.Vector3(x,y,z),dir=dest.clone().sub(from);
    const beam=mesh(new THREE.ConeGeometry(2.1,dir.length(),48,1,true),beamMat(color));
    beam.position.copy(from).add(dest).multiplyScalar(.5);
    beam.quaternion.setFromUnitVectors(new THREE.Vector3(0,-1,0),dir.normalize());
    rays.push({beam,from,phase:i*1.7,targetX});
  }
  for(const old of oldBeams){if(old.material)old.material.opacity=.003;}

  // Physically placed fan bodies and glowsticks form diagonal V-shaped stands
  // around the stage, leaving the centre aisle clear throughout the flythrough.
  const total=isMobile()?310:850;
  const glowGeometry=new THREE.CylinderGeometry(.045,.052,.49,7);
  const glowMaterial=new THREE.MeshBasicMaterial({color:0xffffff,toneMapped:false,transparent:true,opacity:.95,
    depthWrite:false,blending:THREE.AdditiveBlending});
  const bodyGeometry=new THREE.SphereGeometry(.29,9,7);
  const bodyMaterial=new THREE.MeshStandardMaterial({color:0x120d1a,metalness:.03,roughness:.91});
  const headGeometry=new THREE.SphereGeometry(.22,9,7);
  const headMaterial=new THREE.MeshStandardMaterial({color:0x17111e,roughness:.98});
  const sticks=new THREE.InstancedMesh(glowGeometry,glowMaterial,total);
  const heads=new THREE.InstancedMesh(headGeometry,headMaterial,total);
  const bodies=new THREE.InstancedMesh(bodyGeometry,bodyMaterial,total);
  sticks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  sticks.frustumCulled=heads.frustumCulled=bodies.frustumCulled=false;
  venue.add(sticks,heads,bodies);
  const dummy=new THREE.Object3D();
  const palette=['#ff83d4','#be8aff','#fce1a6','#91d4ff','#c7f9ef','#f5a4ef'];
  for(let i=0;i<total;i++){
    const side=(i&1)?1:-1,r=prng(i+4),s=prng(i*7+3);
    const back=i>=total*.70;
    const z=back?12.1+prng(i*9+11)*18:2.5+prng(i*6+15)*6.9;
    const x=back?side*(3.5+prng(i*9+7)*13.8):
      side*(2.15+(z-2.5)*.28+prng(i*11+8)*5.4);
    const y=back?-3.36+Math.min(2.35,(z-11)*.095)+prng(i*3)*.23:
      -3.64+prng(i*4+5)*.55;
    const k=back?.62+prng(i*5)*.23:.80+prng(i*5)*.48;
    batons.push({x,y,z,k,phase:prng(i*2+1)*Math.PI*2,side});
    dummy.position.set(x,y-.52*k,z);dummy.scale.set(.96*k,.75*k,.66*k);
    dummy.rotation.set(0,0,0);dummy.updateMatrix();bodies.setMatrixAt(i,dummy.matrix);
    dummy.position.set(x,y-.18*k,z);dummy.scale.set(k,k,k);
    dummy.updateMatrix();heads.setMatrixAt(i,dummy.matrix);
    sticks.setColorAt(i,new THREE.Color(palette[i%palette.length]));
  }
  sticks.instanceColor.needsUpdate=true;
  heads.instanceMatrix.needsUpdate=bodies.instanceMatrix.needsUpdate=true;
  const crowdGlow=mat(0xf4baf0,.11,{blending:THREE.AdditiveBlending,depthWrite:false});
  // A faint haze near the lower audience unifies sticks and stage in depth.
  const haze=mesh(new THREE.PlaneGeometry(27,5),crowdGlow,[0,-3.5,5.8]);haze.rotation.x=-.16;

  // Premium grade fireworks are physical particles in the same 3D space.
  const count=180,fireGeom=new THREE.BufferGeometry(),coords=new Float32Array(count*3);
  const colors=new Float32Array(count*3);
  const speeds=[];
  for(let i=0;i<count;i++){
    const a=prng(i*2+6)*Math.PI*2,v=1.6+prng(i*11+5)*3.9;
    speeds.push({x:Math.cos(a)*v,y:2+prng(i*4+8)*3.4,z:(prng(i*3+1)-.5)*2.5});
    const c=new THREE.Color(palette[i%palette.length]);
    colors.set([c.r,c.g,c.b],i*3);
  }
  fireGeom.setAttribute('position',new THREE.BufferAttribute(coords,3));
  fireGeom.setAttribute('color',new THREE.BufferAttribute(colors,3));
  const fireMaterial=new THREE.PointsMaterial({size:.07,transparent:true,opacity:0,depthWrite:false,
    blending:THREE.AdditiveBlending,vertexColors:true});
  const particles=new THREE.Points(fireGeom,fireMaterial);particles.visible=false;particles.frustumCulled=false;venue.add(particles);
  let boomAt=-1;

  function drawLED(t){
    const w=screenCanvas.width,h=screenCanvas.height;
    const p=C[grade]||C.DEFAULT;
    const base=g.createLinearGradient(0,0,w,h*.3);
    if(blackout){base.addColorStop(0,'#03030a');base.addColorStop(1,'#08040e');}
    else if(grade==='UR'){
      ['#4b1b78','#914c9b','#a84576','#548ca5','#b46b8e','#6c2b8b'].forEach((v,i)=>base.addColorStop(i/5,v));
    }else{
      base.addColorStop(0,p[0]);base.addColorStop(.39,p[1]);base.addColorStop(.75,p[2]);base.addColorStop(1,p[0]);
    }
    g.fillStyle=base;g.fillRect(0,0,w,h);
    const vignette=g.createRadialGradient(w*.51,h*.45,10,w*.51,h*.45,w*.65);
    vignette.addColorStop(0,'#ffffff10');vignette.addColorStop(.6,'#00000000');vignette.addColorStop(1,'#05010d8d');
    g.fillStyle=vignette;g.fillRect(0,0,w,h);
    const sx=w/150,sy=h/65;
    const step=isMobile()?12:11;
    for(let y=step/2;y<h;y+=step){
      for(let x=step/2;x<w;x+=step){
        const wave=Math.sin(x*.015-t*.9+Math.sin(y*.023+t*.39)*2.4)*.5+.5;
        const focus=Math.pow(Math.max(0,Math.sin(x*.004+y*.006+t*.33)),4);
        const pulse=Math.min(1,.14+wave*.38+focus*.42);
        const opacity=blackout?.07:pulse;
        let color;
        if(grade==='UR'){
          const hue=(x/w*.65+t*.05+y/h*.15)%1;
          color='hsla('+(hue*360).toFixed(0)+',98%,87%,'+opacity.toFixed(2)+')';
        }else if(grade==='SSR')color='rgba(255,225,166,'+opacity.toFixed(2)+')';
        else if(grade==='SR')color='rgba(231,170,255,'+opacity.toFixed(2)+')';
        else if(grade==='WHITE')color='rgba(255,253,255,'+opacity.toFixed(2)+')';
        else color='rgba(255,176,226,'+opacity.toFixed(2)+')';
        g.fillStyle=color;g.beginPath();g.arc(x,y,(step*.27),0,Math.PI*2);g.fill();
      }
    }
    if(!blackout){
      // Soft glowing light ribbon, animated rather than an enormous white wash.
      g.save();g.globalCompositeOperation='screen';
      g.lineWidth=isMobile()?2.6:3.5;
      g.strokeStyle=grade==='UR'?'#e4ffff6b':'#ffcaee79';
      g.shadowColor=grade==='SSR'?'#ffe6a5':'#f0a0e6';g.shadowBlur=13;
      g.beginPath();g.moveTo(-w*.07,h*.68);
      g.bezierCurveTo(w*.1,h*.60+Math.sin(t*.42)*30,w*.39,h*.10,w*.59,h*.42);
      g.bezierCurveTo(w*.78,h*.70,w*.90,h*.20,w*1.07,h*.29);g.stroke();g.restore();
      g.fillStyle='#ffffff1a';g.textAlign='center';
      g.font='italic 900 '+Math.round(h*.19)+'px Georgia,serif';
      g.fillText('ITM',w*.5,h*.59);
    }
    screenTexture.needsUpdate=true;
  }
  function setRarity(tier){
    opening=null;blackout=false;
    grade=(tier==='WHITE'||C[tier])?tier:'DEFAULT';lastDraw=-1;
    tint.set(grade==='SSR'?'#ffc87c':grade==='UR'?'#e9aeff':grade==='SR'?'#bb8ced':'#ed9cd1');
  }
  function beginOpening(tier){
    opening=tier||'N';openAt=performance.now()*.001;
    grade='WHITE';blackout=false;fireStarted=false;lastDraw=-1;
  }
  function endOpening(){opening=null;blackout=false;}
  function burst(){
    boomAt=performance.now()*.001;
    particles.visible=true;
  }
  function update(t,dt){
    if(opening){
      const d=performance.now()*.001-openAt;
      let next='WHITE',dark=false;
      if(opening==='UR'){
        dark=d>=.73&&d<1.58;
        if(d>=1.58)next='UR';
        if(d>=1.9&&!fireStarted){fireStarted=true;burst();}
      }else if(opening==='SSR')next=d>=1.58?'SSR':d>=.79?'SR':'WHITE';
      else if(opening==='SR')next=d>=1.19?'SR':'WHITE';
      if(grade!==next||blackout!==dark){
        grade=next;blackout=dark;lastDraw=-1;
        tint.set(dark?'#0a0612':grade==='SSR'?'#fce1a9':grade==='SR'?'#cf9cef':'#ffc2e9');
      }
    }
    if(lastDraw<0||t-lastDraw>(isMobile()?.18:.13)){drawLED(t);lastDraw=t}
    for(const {spot,targetX,phase} of spots){
      spot.intensity=blackout?.18:5.9+.58*Math.sin(t*.35+phase);
      spot.target.position.x=targetX+Math.sin(t*.32+phase)*.9;
      spot.target.updateMatrixWorld();
      spot.color.lerp(tint,.015);
    }
    for(const {beam,from,targetX,phase} of rays){
      const dest=new THREE.Vector3(targetX+Math.sin(t*.32+phase)*.9,-2.0,-.5);
      const dir=dest.clone().sub(from);
      beam.position.copy(from).add(dest).multiplyScalar(.5);
      beam.quaternion.setFromUnitVectors(new THREE.Vector3(0,-1,0),dir.normalize());
      beam.material.uniforms.uStrength.value=blackout?.003:.13+.017*Math.sin(t*.66+phase);
    }
    for(let i=0;i<glowMeshes.length;i++)
      glowMeshes[i].material.opacity=.54+.13*Math.sin(t*.61+i*.44);
    for(let i=0;i<batons.length;i++){
      const b=batons[i];
      dummy.position.set(b.x+Math.sin(t*.42+b.phase)*.05,b.y+.56*b.k+Math.sin(t*1.41+b.phase)*.095,b.z);
      dummy.scale.set(b.k,b.k,b.k);
      dummy.rotation.set(Math.sin(t*.8+b.phase)*.24,0,b.side*.16+Math.sin(t*1.58+b.phase)*.31);
      dummy.updateMatrix();sticks.setMatrixAt(i,dummy.matrix);
    }
    sticks.instanceMatrix.needsUpdate=true;
    if(boomAt>=0){
      const age=performance.now()*.001-boomAt;
      fireMaterial.opacity=Math.max(0,.8*(1-age/2.1));
      for(let i=0;i<count;i++){
        const v=speeds[i],from=i%2?-3:3;
        fireGeom.attributes.position.setXYZ(i,from+v.x*age,-1.55+v.y*age-3.7*age*age,v.z*age);
      }
      fireGeom.attributes.position.needsUpdate=true;
      if(age>=2.1){boomAt=-1;particles.visible=false;}
    }
  }
  function introPose(progress){
    const t=clamp(progress);
    // One continuous camera rotation with no left/right/centre discontinuities.
    const angle=2*Math.PI*(t-.09*Math.sin(2*Math.PI*t)/(2*Math.PI));
    const advance=smooth(clamp((t-.56)/.44));
    const eye=new THREE.Vector3(
      .38*Math.sin(t*Math.PI)* (1-advance),
      mix(2.02,.65,advance),
      mix(17.5,10.7,advance)
    );
    const dir=new THREE.Vector3(Math.sin(angle),mix(-.055,-.11,advance),-Math.cos(angle)).normalize();
    return {pos:eye,look:eye.clone().addScaledVector(dir,25),fov:mix(51,42,advance)};
  }
  function reset(){opening=null;blackout=false;boomAt=-1;particles.visible=false;setRarity('DEFAULT');}
  drawLED(0);
  return {setRarity,beginOpening,endOpening,burst,introPose,reset,update};
}
