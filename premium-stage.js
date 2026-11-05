/* ITM Premium Arena v4.
 * An actual 3D venue: no screenshot as a backdrop. Retains old gameplay APIs.
 * Geometry, LED, stage lighting, audience, entrance camera all inhabit one scene.
 */
export function createConcertStage({THREE,scene,renderer,oldBeams=[]}) {
  const venue=new THREE.Group();scene.add(venue);

  // Pastel Aurora Dome: a real inner-facing 3D environment behind the concert
  // structures, not a flat fullscreen illustration. Kept separate from the
  // physical wall and floor so parallax remains coherent during 360° entry.
  const skyCanvas=document.createElement('canvas');
  const skyW=window.innerWidth<760?1024:2048,skyH=skyW/2;
  skyCanvas.width=skyW;skyCanvas.height=skyH;
  const skyCtx=skyCanvas.getContext('2d');
  function makeAtmosphere(){
    const ctx=skyCtx,w=skyW,h=skyH;
    const base=ctx.createLinearGradient(0,0,w*.14,h);
    base.addColorStop(0,'#261545');
    base.addColorStop(.23,'#634078');
    base.addColorStop(.47,'#ab6da1');
    base.addColorStop(.72,'#6663a6');
    base.addColorStop(1,'#283a6b');
    ctx.fillStyle=base;ctx.fillRect(0,0,w,h);
    // Different-colored glowing pools make the world feel like a lively
    // outdoor festival while leaving the stage center as the brightest point.
    const pools=[
      [.14,.39,.43,.56,'#ffa3dc',.76],
      [.41,.31,.36,.52,'#c2a4ff',.69],
      [.69,.43,.47,.59,'#83daee',.69],
      [.92,.32,.38,.56,'#f8a4dc',.58],
      [.49,.83,.66,.39,'#ffafd0',.34]
    ];
    for(const [px,py,rx,ry,color,alpha] of pools){
      ctx.save();ctx.translate(px*w,py*h);ctx.scale(rx*w,ry*h);
      const fill=ctx.createRadialGradient(0,0,.012,0,0,1);
      const hex=color.replace('#','');
      const colorRGB=parseInt(hex.slice(0,2),16)+','+parseInt(hex.slice(2,4),16)+','+parseInt(hex.slice(4,6),16);
      fill.addColorStop(0,'rgba('+colorRGB+','+alpha+')');
      fill.addColorStop(.38,'rgba('+colorRGB+','+(alpha*.39)+')');
      fill.addColorStop(1,'rgba('+colorRGB+',0)');
      ctx.fillStyle=fill;ctx.beginPath();ctx.arc(0,0,1,0,Math.PI*2);ctx.fill();
      ctx.restore();
    }
    // Silk-like translucent aurora ribbons curve across the spherical sky.
    ctx.save();ctx.globalCompositeOperation='screen';
    for(let band=0;band<6;band++){
      const top=.16+band*.095;
      const path=ctx.createLinearGradient(0,h*(top+.06),w,h*(top+.02));
      path.addColorStop(0,'#fa9afc00');
      path.addColorStop(.26,band%2?'#ffcaea40':'#95efff55');
      path.addColorStop(.61,'#e4b4ff48');
      path.addColorStop(1,'#fac6e300');
      ctx.beginPath();
      ctx.moveTo(-w*.09,h*(top+.08));
      ctx.bezierCurveTo(w*.25,h*(top-.18),w*.46,h*(top+.34),w*.77,h*(top+.045));
      ctx.bezierCurveTo(w*.91,h*(top-.08),w*1.02,h*(top+.09),w*1.1,h*(top+.01));
      ctx.lineWidth=h*(.065+band*.007);
      ctx.strokeStyle=path;ctx.shadowColor=band%2?'#dda5ff':'#84e9fa';
      ctx.shadowBlur=h*.085;ctx.stroke();
    }
    ctx.restore();
    // Tiny light flecks and distant concert bokeh; deterministic distribution.
    for(let i=0;i<(skyW>1200?590:320);i++){
      const x=((i*929+Math.sin(i*7.07)*311)%w+w)%w;
      const y=((i*457+Math.cos(i*3.21)*223)%Math.round(h*.86)+h)%h;
      const r=i%41===0?2.7:i%7===0?1.32:.58;
      const a=.13+((i*37)%11)/70;
      ctx.fillStyle='rgba(255,248,255,'+a.toFixed(2)+')';
      ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
    }
    // Soft corner shading supplies depth without returning to a black void.
    const shade=ctx.createLinearGradient(0,h*.40,0,h);
    shade.addColorStop(0,'#120c2900');
    shade.addColorStop(1,'#21133d79');
    ctx.fillStyle=shade;ctx.fillRect(0,0,w,h);
  }
  makeAtmosphere();
  const skyTexture=new THREE.CanvasTexture(skyCanvas);
  skyTexture.colorSpace=THREE.SRGBColorSpace;
  skyTexture.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());
  const skyMaterial=new THREE.MeshBasicMaterial({
    map:skyTexture,side:THREE.BackSide,toneMapped:false,fog:false,
    transparent:true,opacity:1,depthWrite:false
  });
  const skyDome=new THREE.Mesh(new THREE.SphereGeometry(70,64,32),skyMaterial);
  skyDome.renderOrder=-1000;
  scene.add(skyDome);
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
  const wallGeo=new THREE.PlaneGeometry(22.4,6.55,96,24);
  const attr=wallGeo.attributes.position;
  const wallZ=x=>-8.05+1.53*Math.pow(x/11.2,2);
  for(let i=0;i<attr.count;i++){
    const x=attr.getX(i);attr.setZ(i,1.53*Math.pow(x/11.2,2));
  }
  wallGeo.computeVertexNormals();
  const wall=mesh(wallGeo,new THREE.MeshBasicMaterial({map:screenTexture,side:THREE.DoubleSide,toneMapped:false}),[0,.72,-8.05]);
  const rig=metal(0x55465a,.37,.53);
  const rigDark=metal(0x2b202f,.42,.5);
  const rigRose=mat(0xf4a3cf,.83);
  const ledTrim=mat(0xffacd9,.60,{blending:THREE.AdditiveBlending,depthWrite:false});
  const upper=[],lower=[],archInner=[],archOuter=[];
  for(let i=0;i<=32;i++){
    const x=-11.15+i*(22.3/32),z=wallZ(x);
    upper.push([x,4.04,z+.12]);lower.push([x,-2.60,z+.12]);
    archInner.push([x,4.59+.34*Math.cos(x/11.15*Math.PI/2),-4.84+.38*(x/11.15)**2]);
    archOuter.push([x,5.13+.39*Math.cos(x/11.15*Math.PI/2),-5.04+.38*(x/11.15)**2]);
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
    for(let y=-2.62;y<4.05;y+=.74){
      rod([x,y,z+.08],[x,y+.74,z+.08],.067,rig);
      rod([x-sign*.33,y,z+.12],[x+sign*.3,y+.74,z+.12],.027,rig);
    }
    rod([x,-2.62,z],[x,5.1,z],.11,rig);
    rod([x-sign*.24,-2.62,z+.1],[x-sign*.24,5.1,z+.1],.034,rig);
    panel(x,-.1,z+.25,.13,5.7,.12,mat(0xf593c5,.38));
  }
  // Real illuminated fixture faces with soft sprites: not black rectangular bars.
  const haloCanvas=document.createElement('canvas');haloCanvas.width=128;haloCanvas.height=128;
  const haloCtx=haloCanvas.getContext('2d');
  const haloGrad=haloCtx.createRadialGradient(64,64,3,64,64,63);
  haloGrad.addColorStop(0,'#ffffffff');
  haloGrad.addColorStop(.13,'#fff5fffa');
  haloGrad.addColorStop(.32,'#fff1fa98');
  haloGrad.addColorStop(.61,'#fba4e92a');
  haloGrad.addColorStop(1,'#ff98f500');
  haloCtx.fillStyle=haloGrad;haloCtx.fillRect(0,0,128,128);
  const haloTexture=new THREE.CanvasTexture(haloCanvas);
  haloTexture.colorSpace=THREE.SRGBColorSpace;
  function glowSprite(x,y,z,color,sx=1,sy=1){
    const flare=new THREE.Sprite(new THREE.SpriteMaterial({
      map:haloTexture,color,transparent:true,opacity:.62,
      depthWrite:false,blending:THREE.AdditiveBlending
    }));
    flare.position.set(x,y,z);flare.scale.set(sx,sy,1);
    venue.add(flare);glowMeshes.push(flare);
    return flare;
  }
  // High-resolution row of independently lit lamps along the upper truss.
  for(let i=0;i<13;i++){
    const x=(i-6)*1.44;
    panel(x,4.92,-4.58,.68,.24,.45,rig);
    panel(x,4.75,-4.21,.65,.12,.13,metal(0xd29ebc,.28,.44));
    const lens=panel(x,4.71,-4.11,.48,.105,.075,mat(i%4===0?0xffffff:0xffcbe9,.92));
    glowMeshes.push(lens);
    glowSprite(x,4.69,-3.96,i%4===0?0xffe1f3:0xffa5de,1.06,.56);
    panel(x,-2.58,wallZ(x)+.31,.56,.11,.15,mat(i%3===0?0xffd1ea:0xffa2d5,.7));
  }
  // Side stage lighting towers are now lattice trusses in real perspective.
  for(const sign of [-1,1]){
    const x=sign*10.65;
    const z=-4.38;
    for(const offset of [-.2,.2]){
      rod([x+offset,-3.53,z+offset],[x+offset,5.4,z+offset],.074,rig);
    }
    for(let j=0;j<10;j++){
      const y=-2.94+j*.78;
      rod([x-.2,y,z-.2],[x+.2,y+.78,z+.2],.035,rig);
      rod([x+.2,y,z-.2],[x-.2,y+.78,z+.2],.029,rig);
    }
    for(let k=0;k<4;k++){
      const y=-2.18+k*1.56;
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

  // A restrained, diffuse view of the stage video wall reflected on the floor.
  // Because it shares the live texture, every grade change also colors the reflection.
  const reflectedScreen=mesh(new THREE.PlaneGeometry(18,10),
    new THREE.MeshBasicMaterial({map:screenTexture,transparent:true,opacity:.15,depthWrite:false,
      side:THREE.DoubleSide,blending:THREE.AdditiveBlending}),[0,-3.515,-2.8]);
  reflectedScreen.rotation.x=-Math.PI/2;
  reflectedScreen.scale.y=1.05;
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
    panel(x,y+.19,z,.54,.29,.49,rig);
    panel(x,y-.11,z+.24,.48,.13,.10,metal(0xf1c8e3,.24,.57));
    const bulb=mesh(new THREE.SphereGeometry(.16,16,10),new THREE.MeshBasicMaterial({
      color:0xffe9f9,toneMapped:false
    }),[x,y-.12,z+.34]);
    bulb.scale.set(1.22,.65,.41);
    const flare=glowSprite(x,y-.12,z+.49,color,1.27,1.13);
    spots.push({spot,targetX,phase:i*1.7,bulb,flare});
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
  const total=isMobile()?1050:2250;
  // Nine distinctive fan lightstick heads (each batched by InstancedMesh).
  // A common grip stays in each fan's hand; the glowing head conveys the group.
  const glowMaterial=new THREE.MeshBasicMaterial({
    color:0xffffff,toneMapped:false,transparent:true,opacity:.39,
    depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide
  });
  const handleMaterial=new THREE.MeshStandardMaterial({
    color:0x7d587f,metalness:.6,roughness:.32
  });
  const sticks=new THREE.InstancedMesh(
    new THREE.CylinderGeometry(.018,.023,.32,6),handleMaterial,total
  );
  sticks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const shapePrism=(points)=>{
    const path=new THREE.Shape();
    points.forEach(([x,y],i)=>i===0?path.moveTo(x,y):path.lineTo(x,y));
    path.closePath();
    return new THREE.ExtrudeGeometry(path,{
      depth:.055,steps:1,bevelEnabled:true,bevelThickness:.016,
      bevelSize:.012,bevelSegments:1,curveSegments:4
    });
  };
  const starPoints=[];
  for(let i=0;i<10;i++){
    const angle=-Math.PI/2+i*Math.PI/5,r=i%2?.086:.21;
    starPoints.push([Math.cos(angle)*r,Math.sin(angle)*r]);
  }
  const heart=new THREE.Shape();
  heart.moveTo(0,-.16);
  heart.bezierCurveTo(-.36,.035,-.26,.25,0,.135);
  heart.bezierCurveTo(.26,.25,.36,.035,0,-.16);
  const rabbit=new THREE.Shape();
  rabbit.moveTo(-.15,-.14);
  rabbit.quadraticCurveTo(-.24,-.02,-.165,.105);
  rabbit.lineTo(-.17,.31);
  rabbit.quadraticCurveTo(-.14,.39,-.083,.30);
  rabbit.lineTo(-.045,.142);
  rabbit.quadraticCurveTo(0,.175,.045,.142);
  rabbit.lineTo(.083,.30);
  rabbit.quadraticCurveTo(.14,.39,.17,.31);
  rabbit.lineTo(.165,.105);
  rabbit.quadraticCurveTo(.24,-.02,.15,-.14);
  rabbit.quadraticCurveTo(0,-.23,-.15,-.14);
  const litGeometry=[
    new THREE.CylinderGeometry(.045,.05,.47,8), // glow wand
    new THREE.SphereGeometry(.19,12,9), // orb
    shapePrism(starPoints), // star
    new THREE.BoxGeometry(.29,.29,.075), // square
    new THREE.ExtrudeGeometry(heart,{depth:.06,steps:1,bevelEnabled:true,bevelThickness:.015,bevelSize:.012,bevelSegments:1}), // heart
    shapePrism([[0,.22],[-.23,-.18],[.23,-.18]]), // triangle
    shapePrism([[-.23,-.17],[-.23,.18],[-.10,.04],[0,.26],[.11,.04],[.23,.18],[.23,-.17]]), // crown
    new THREE.ExtrudeGeometry(rabbit,{depth:.06,steps:1,bevelEnabled:true,bevelThickness:.015,bevelSize:.012,bevelSegments:1}), // bunny
    shapePrism([[0,.27],[-.18,0],[0,-.26],[.18,0]]) // diamond
  ];
  const litHeads=litGeometry.map((geometry,type)=>{
    const count=Math.ceil((total-type)/9);
    const instanced=new THREE.InstancedMesh(geometry,glowMaterial.clone(),count);
    instanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    instanced.frustumCulled=false;
    venue.add(instanced);return instanced;
  });
  const bodyGeometry=new THREE.SphereGeometry(.29,9,7);
  const bodyMaterial=new THREE.MeshStandardMaterial({color:0x120d1a,metalness:.03,roughness:.91});
  const headGeometry=new THREE.SphereGeometry(.22,9,7);
  const headMaterial=new THREE.MeshStandardMaterial({color:0x17111e,roughness:.98});
  const heads=new THREE.InstancedMesh(headGeometry,headMaterial,total);
  const bodies=new THREE.InstancedMesh(bodyGeometry,bodyMaterial,total);
  sticks.frustumCulled=heads.frustumCulled=bodies.frustumCulled=false;
  venue.add(sticks,heads,bodies);
  const dummy=new THREE.Object3D();
  const palette=['#f876c3','#a67ce8','#f4cc91','#7faee8','#85d5b6','#df80c1'];
  for(let i=0;i<total;i++){
    const side=(i&1)?1:-1;
    const back=i>=total*.56;
    const near=i<total*.235;
    const z=back?11.0+prng(i*9+11)*35:
      near?4.0+prng(i*6+15)*2.7:2.4+prng(i*6+15)*4.9;
    const x=back?side*(2.9+prng(i*9+7)*17.5):
      near?side*(1.06+(10.8-z)*.31+prng(i*11+8)*4.0):
      side*(2.02+(z-2.4)*.30+prng(i*11+8)*5.4);
    const y=back?-2.40+Math.min(3.1,(z-11)*.115)+prng(i*3)*.3:
      near?-3.02+(z-4.0)*.22+prng(i*4+5)*.32:
      -2.95+(z-2.4)*.18+prng(i*4+5)*.40;
    const k=back?.62+prng(i*5)*.35:near?1.09+prng(i*5)*.48:.80+prng(i*5)*.48;
    batons.push({x,y,z,k,phase:prng(i*2+1)*Math.PI*2,side});
    dummy.position.set(x,y-.52*k,z);dummy.scale.set(.96*k,.75*k,.66*k);
    dummy.rotation.set(0,0,0);dummy.updateMatrix();bodies.setMatrixAt(i,dummy.matrix);
    dummy.position.set(x,y-.18*k,z);dummy.scale.set(k,k,k);
    dummy.updateMatrix();heads.setMatrixAt(i,dummy.matrix);
    const type=i%9,slot=Math.floor(i/9);
    const hColor=new THREE.Color(palette[(Math.floor(i/9)+type*2)%palette.length]);
    litHeads[type].setColorAt(slot,hColor);
    const angle=Math.sin(batons[i].phase)*.22;
    dummy.position.set(x,y+.68*k,z);
    dummy.scale.set(k*.60,k*.60,k*.60);
    dummy.rotation.set(angle,.06,side*.14);dummy.updateMatrix();
    litHeads[type].setMatrixAt(slot,dummy.matrix);
    dummy.position.set(x,y+.42*k,z);
    dummy.scale.set(k,k,k);dummy.updateMatrix();
    sticks.setMatrixAt(i,dummy.matrix);
  }
  for(const group of litHeads){
    if(group.instanceColor)group.instanceColor.needsUpdate=true;
    group.instanceMatrix.needsUpdate=true;
  }
  sticks.instanceMatrix.needsUpdate=true;
  heads.instanceMatrix.needsUpdate=bodies.instanceMatrix.needsUpdate=true;
  const crowdGlow=mat(0xf4baf0,.11,{blending:THREE.AdditiveBlending,depthWrite:false});
  // A faint haze near the lower audience unifies sticks and stage in depth.
  const haze=mesh(new THREE.PlaneGeometry(27,5),crowdGlow,[0,-3.5,5.8]);haze.rotation.x=-.16;

  // ITM grand-pyro show: multiple staggered spherical fireworks, not a short
  // particle puff near the floor. All effects are actual world-space WebGL
  // geometry so the existing high-tier camera dolly and stage lighting remain.
  const fireBurstSpecs=[
    {x:-3.78,y:1.98,z:1.05,delay:0,scale:1.0},
    {x: 3.78,y:2.10,z:1.05,delay:.16,scale:1.08},
    {x: 0.00,y:3.58,z:-.9,delay:.35,scale:1.18},
    {x:-2.20,y:3.07,z:-.25,delay:.55,scale:.9},
    {x: 2.24,y:3.22,z:-.25,delay:.72,scale:1.0}
  ];
  const fireMaxBursts=fireBurstSpecs.length;
  const sparkPerBurst=isMobile()?83:153;
  const fireCount=sparkPerBurst*fireMaxBursts;
  const fireGeom=new THREE.BufferGeometry();
  const fireCoords=new Float32Array(fireCount*3);
  const fireColors=new Float32Array(fireCount*3);
  const trailCoords=new Float32Array(fireCount*6);
  const trailColors=new Float32Array(fireCount*6);
  const fireDirections=[];
  // Deterministic, near-spherical radial trajectories with different speeds.
  for(let burst=0;burst<fireMaxBursts;burst++){
    for(let i=0;i<sparkPerBurst;i++){
      const id=burst*sparkPerBurst+i;
      const theta=2*Math.PI*prng(id*5+13);
      const u=2*prng(id*7+9)-1;
      const thetaR=Math.sqrt(1-u*u);
      const speed=(2.65+prng(id*11+21)*2.18)*fireBurstSpecs[burst].scale;
      fireDirections.push({
        x:Math.cos(theta)*thetaR*speed,
        y:u*speed,
        z:Math.sin(theta)*thetaR*speed*.58,
        delay:prng(id*13+5)*.095,
        afterglow:i%6===0
      });
      fireCoords.set([0,-1000,0],id*3);
      trailCoords.set([0,-1000,0,0,-1000,0],id*6);
      const color=new THREE.Color(i%9===0?'#fffce8':palette[(id+burst*3)%palette.length]);
      fireColors.set([color.r,color.g,color.b],id*3);
      trailColors.set([color.r,color.g,color.b,color.r,color.g,color.b],id*6);
    }
  }
  fireGeom.setAttribute('position',new THREE.BufferAttribute(fireCoords,3).setUsage(THREE.DynamicDrawUsage));
  fireGeom.setAttribute('color',new THREE.BufferAttribute(fireColors,3));
  const fireMaterial=new THREE.PointsMaterial({
    map:haloTexture,size:isMobile()?.17:.23,vertexColors:true,
    transparent:true,opacity:0,sizeAttenuation:true,depthWrite:false,
    blending:THREE.AdditiveBlending
  });
  const particles=new THREE.Points(fireGeom,fireMaterial);
  particles.visible=false;particles.frustumCulled=false;
  venue.add(particles);

  const trailGeom=new THREE.BufferGeometry();
  trailGeom.setAttribute('position',new THREE.BufferAttribute(trailCoords,3).setUsage(THREE.DynamicDrawUsage));
  trailGeom.setAttribute('color',new THREE.BufferAttribute(trailColors,3));
  const fireTrails=new THREE.LineSegments(trailGeom,new THREE.LineBasicMaterial({
    vertexColors:true,transparent:true,opacity:0,depthWrite:false,
    blending:THREE.AdditiveBlending
  }));
  fireTrails.frustumCulled=false;fireTrails.visible=false;venue.add(fireTrails);
  const fireBursts=fireBurstSpecs.map((spec,i)=>{
    const hub=new THREE.Sprite(new THREE.SpriteMaterial({
      map:haloTexture,color:0xffe7fa,opacity:0,transparent:true,depthWrite:false,
      blending:THREE.AdditiveBlending
    }));
    hub.position.set(spec.x,spec.y,spec.z+.23);
    hub.scale.set(.2,.2,1);venue.add(hub);
    const shock=new THREE.Mesh(new THREE.RingGeometry(.94,1,80),
      new THREE.MeshBasicMaterial({
        color:0xffd4f8,transparent:true,opacity:0,side:THREE.DoubleSide,
        depthWrite:false,blending:THREE.AdditiveBlending
      }));
    shock.position.set(spec.x,spec.y,spec.z+.16);
    shock.scale.setScalar(.025);venue.add(shock);
    const light=new THREE.PointLight(0xffb1ed,0,10,2);
    light.position.set(spec.x,spec.y,spec.z+1);
    venue.add(light);
    return {hub,shock,light};
  });
  let boomAt=-1,activeFireBursts=0;
  const firePalette={
    SR:['#ddb0ff','#f6cfff','#ffffff'],
    SSR:['#ffdb80','#fff2be','#ffa3d8'],
    UR:['#ff9edc','#a7e6ff','#f8ce82','#c9abff','#ffffff']
  };
  function configureFireworks(rarity){
    const choices=firePalette[rarity]||firePalette.UR;
    for(let i=0;i<fireCount;i++){
      const burst=Math.floor(i/sparkPerBurst);
      const c=new THREE.Color(choices[(i+burst*2)%choices.length]);
      fireColors.set([c.r,c.g,c.b],i*3);
      trailColors.set([c.r,c.g,c.b,c.r,c.g,c.b],i*6);
    }
    fireGeom.attributes.color.needsUpdate=true;
    trailGeom.attributes.color.needsUpdate=true;
    fireBursts.forEach(({hub,shock,light},i)=>{
      const color=new THREE.Color(choices[i%choices.length]);
      hub.material.color.copy(color);
      shock.material.color.copy(color);
      light.color.copy(color);
    });
  }
  function stopFireworks(){
    boomAt=-1;
    particles.visible=false;fireTrails.visible=false;
    fireMaterial.opacity=0;fireTrails.material.opacity=0;
    for(const {hub,shock,light} of fireBursts){
      hub.material.opacity=0;shock.material.opacity=0;light.intensity=0;
    }
  }

  function ledWave(style,x,y,t){
    const r=Math.hypot(x-.51,(y-.51)*1.35);
    switch(style){
      case 0: return .5+.5*Math.sin(x*17-t*1.36+Math.sin(y*10+t*.3)*1.5); // left -> right
      case 1: return .5+.5*Math.sin(x*18+t*1.26+Math.cos(y*9-t*.3)*1.5); // reverse
      case 2: return .5+.5*Math.sin(r*30-t*1.5); // expanding ring
      case 3: return .5+.5*Math.sin(r*29+t*1.46); // gathering inward
      case 4: return .5+.5*Math.sin(y*16-t*.62+x*6)*Math.sin(t*.42+x*5); // soft pulse
      default: return .5+.5*Math.sin((x+y*.72)*23-t*1.03); // diagonal drift
    }
  }
  function drawOrbitMotif(t,w,h){
    // The Saturn-like luminous ring and four-point star from the concept stage.
    // Paint them into the emissive LED texture, always behind the physical pack.
    g.save();g.globalCompositeOperation='screen';
    for(let line=0;line<3;line++){
      const drift=Math.sin(t*.21+line)*7;
      const grd=g.createLinearGradient(w*.18,h*.65,w*.82,h*.22);
      grd.addColorStop(0,'#ff86d50a');
      grd.addColorStop(.32,line===1?'#ffbbf879':'#fcb0f43b');
      grd.addColorStop(.67,line===1?'#ffe4ff9e':'#fbadf978');
      grd.addColorStop(1,'#ffffff13');
      g.strokeStyle=grd;
      g.lineWidth=line===1?2.8:line===0?8:1.3;
      g.shadowColor='#ff95e9';g.shadowBlur=line===1?23:9;
      g.beginPath();
      g.moveTo(-w*.035,h*(.73+line*.035));
      g.bezierCurveTo(w*.17,h*.82+drift,w*.41,h*.08+drift,w*.67,h*.37+line*7);
      g.bezierCurveTo(w*.88,h*.56,w*.91,h*.22,w*1.05,h*.25);
      g.stroke();
    }
    // One elliptical orbit appears to pass around the glowing LED centerpiece.
    g.lineWidth=1.3;g.shadowBlur=17;g.strokeStyle='#ffcaf88b';
    g.beginPath();
    g.ellipse(w*.53,h*.49,w*.36,h*.26,-.24,Math.PI*.13,Math.PI*1.93);
    g.stroke();
    const starX=w*.77,starY=h*.335+Math.sin(t*.53)*3;
    const radius=27+Math.sin(t*1.2)*2.5;
    const rg=g.createRadialGradient(starX,starY,1,starX,starY,radius*2.6);
    rg.addColorStop(0,'#ffffffed');rg.addColorStop(.15,'#ffe5ffb8');
    rg.addColorStop(.42,'#f7b0f758');rg.addColorStop(1,'#ff80df00');
    g.fillStyle=rg;g.fillRect(starX-radius*3,starY-radius*3,radius*6,radius*6);
    g.fillStyle='#fff9ff';g.shadowColor='#ffd0ff';g.shadowBlur=19;
    g.beginPath();
    g.moveTo(starX,starY-radius*1.52);
    g.quadraticCurveTo(starX+radius*.18,starY-radius*.17,starX+radius*1.52,starY);
    g.quadraticCurveTo(starX+radius*.18,starY+radius*.16,starX,starY+radius*1.52);
    g.quadraticCurveTo(starX-radius*.18,starY+radius*.16,starX-radius*1.52,starY);
    g.quadraticCurveTo(starX-radius*.18,starY-radius*.18,starX,starY-radius*1.52);
    g.fill();g.restore();
  }
  function drawLED(t){
    const w=screenCanvas.width,h=screenCanvas.height;
    const p=C[grade]||C.DEFAULT;
    const base=g.createLinearGradient(0,0,w,h*.3);
    if(blackout){
      base.addColorStop(0,'#03030a');base.addColorStop(1,'#08040e');
    }else if(grade==='UR'){
      ['#4b1b78','#914c9b','#a84576','#548ca5','#b46b8e','#6c2b8b'].forEach((v,i)=>base.addColorStop(i/5,v));
    }else{
      base.addColorStop(0,p[0]);base.addColorStop(.39,p[1]);base.addColorStop(.75,p[2]);base.addColorStop(1,p[0]);
    }
    g.fillStyle=base;g.fillRect(0,0,w,h);
    const vignette=g.createRadialGradient(w*.51,h*.45,10,w*.51,h*.45,w*.65);
    vignette.addColorStop(0,'#ffffff10');vignette.addColorStop(.6,'#00000000');vignette.addColorStop(1,'#05010d8d');
    g.fillStyle=vignette;g.fillRect(0,0,w,h);
    // Change waveform every ~5 seconds with a crossfade, not a visible jump.
    const cycle=t/5.2,pattern=Math.floor(cycle)%6;
    const transition=smooth(clamp((cycle%1-.77)/.23));
    const step=isMobile()?9:7;
    for(let y=step/2;y<h;y+=step){
      for(let x=step/2;x<w;x+=step){
        const nx=x/w,ny=y/h;
        const waveA=ledWave(pattern,nx,ny,t);
        const waveB=ledWave((pattern+1)%6,nx,ny,t);
        const wave=mix(waveA,waveB,transition);
        const ridge=Math.pow(Math.max(0,Math.sin(nx*8.1+ny*5.6+t*.37)),4);
        const breathing=.87+.13*Math.sin(t*.76);
        const opacity=blackout?.045:Math.min(.93,(.16+wave*.55+ridge*.16)*breathing);
        let color;
        if(grade==='UR'){
          const hue=(nx*.65+t*.052+ny*.15)%1;
          color='hsla('+(hue*360).toFixed(0)+',98%,88%,'+opacity.toFixed(2)+')';
        }else if(grade==='SSR')color='rgba(255,225,166,'+opacity.toFixed(2)+')';
        else if(grade==='SR')color='rgba(231,170,255,'+opacity.toFixed(2)+')';
        else if(grade==='WHITE')color='rgba(255,253,255,'+opacity.toFixed(2)+')';
        else color='rgba(255,184,229,'+opacity.toFixed(2)+')';
        g.fillStyle=color;g.beginPath();g.arc(x,y,step*.27,0,Math.PI*2);g.fill();
      }
    }
    if(!blackout){
      drawOrbitMotif(t,w,h);
      g.fillStyle='#fff9ff19';g.textAlign='center';
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
    stopFireworks();
  }
  function endOpening(){opening=null;blackout=false;}
  function burst(rarity=opening||'UR'){
    if(!firePalette[rarity])return;
    configureFireworks(rarity);
    activeFireBursts=rarity==='UR'?5:rarity==='SSR'?3:2;
    boomAt=performance.now()*.001;
    particles.visible=true;fireTrails.visible=true;
  }
  function update(t,dt){
    // Gentle continuous aurora movement; automatic blackout preservation for UR.
    skyDome.rotation.y=Math.sin(t*.055)*.055+t*.0009;
    skyDome.rotation.z=Math.sin(t*.043)*.012;
    skyMaterial.opacity+=( (blackout?.11:opening?.84:1)-skyMaterial.opacity)*Math.min(1,dt*2.1);
    if(opening){
      const d=performance.now()*.001-openAt;
      let next='WHITE',dark=false;
      if(opening==='UR'){
        dark=d>=.73&&d<1.58;
        if(d>=1.58)next='UR';
      }else if(opening==='SSR')next=d>=1.58?'SSR':d>=.79?'SR':'WHITE';
      else if(opening==='SR')next=d>=1.19?'SR':'WHITE';
      // Start the pyro exactly as the seal breaks, not a second earlier.
      if(d>=2.65&&!fireStarted){
        fireStarted=true;
        if(['SR','SSR','UR'].includes(opening))burst(opening);
      }
      if(grade!==next||blackout!==dark){
        grade=next;blackout=dark;lastDraw=-1;
        tint.set(dark?'#0a0612':grade==='SSR'?'#fce1a9':grade==='SR'?'#cf9cef':'#ffc2e9');
      }
    }
    if(lastDraw<0||t-lastDraw>(isMobile()?.18:.13)){drawLED(t);lastDraw=t}
    for(const {spot,targetX,phase,bulb,flare} of spots){
      spot.intensity=blackout?.08:5.9+.58*Math.sin(t*.35+phase);
      spot.target.position.x=targetX+Math.sin(t*.32+phase)*.9;
      spot.target.updateMatrixWorld();
      spot.color.lerp(tint,.026);
      if(bulb)bulb.material.color.lerp(blackout?new THREE.Color('#201422'):tint,.055);
      if(flare){
        flare.material.color.lerp(tint,.04);
        flare.material.opacity=blackout?.03:.66+.10*Math.sin(t*.9+phase);
      }
    }
    for(const {beam,from,targetX,phase} of rays){
      const dest=new THREE.Vector3(targetX+Math.sin(t*.32+phase)*.9,-2.0,-.5);
      const dir=dest.clone().sub(from);
      beam.position.copy(from).add(dest).multiplyScalar(.5);
      beam.quaternion.setFromUnitVectors(new THREE.Vector3(0,-1,0),dir.normalize());
      beam.material.uniforms.uStrength.value=blackout?.003:.13+.017*Math.sin(t*.66+phase);
    }
    for(let i=0;i<glowMeshes.length;i++){
      const glow=glowMeshes[i];
      if(glow.isSprite)continue;
      glow.material.opacity=.72+.13*Math.sin(t*.61+i*.44);
    }
    for(let i=0;i<batons.length;i++){
      const b=batons[i],wave=Math.sin(t*1.58+b.phase)*.25;
      const px=b.x+Math.sin(t*.42+b.phase)*.055;
      const py=b.y+Math.sin(t*1.41+b.phase)*.07;
      dummy.position.set(px,py+.41*b.k,b.z);
      dummy.scale.set(b.k,b.k,b.k);
      dummy.rotation.set(Math.sin(t*.8+b.phase)*.18,0,b.side*.16+wave);
      dummy.updateMatrix();sticks.setMatrixAt(i,dummy.matrix);
      dummy.position.set(px+Math.sin(t*.75+b.phase)*.025,py+.69*b.k,b.z+.02);
      dummy.scale.set(b.k*.60,b.k*.60,b.k*.60);
      dummy.rotation.set(Math.sin(t*.8+b.phase)*.16,.06,b.side*.16+wave);
      dummy.updateMatrix();litHeads[i%9].setMatrixAt(Math.floor(i/9),dummy.matrix);
    }
    sticks.instanceMatrix.needsUpdate=true;
    for(const group of litHeads)group.instanceMatrix.needsUpdate=true;
    if(boomAt>=0){
      const age=Math.max(0,performance.now()*.001-boomAt);
      const totalDuration=2.36;
      let hasLiveBurst=false;
      for(let burst=0;burst<fireMaxBursts;burst++){
        const spec=fireBurstSpecs[burst],local=age-spec.delay;
        const {hub,shock,light}=fireBursts[burst];
        const active=burst<activeFireBursts&&local>=0&&local<1.72;
        if(active)hasLiveBurst=true;
        const power=active?1-smooth(clamp((local-.25)/1.47)):0;
        const flash=active?(1-smooth(clamp(local/.24))):0;
        hub.material.opacity=Math.min(.96,flash*.9);
        hub.scale.set(1.25+local*7,1.25+local*7,1);
        shock.material.opacity=active?(1-smooth(clamp(local/.68)))*.93:0;
        shock.scale.setScalar(.16+Math.max(0,local)*2.95);
        light.intensity=active?flash*(opening==='UR'?13:9):0;
        for(let i=0;i<sparkPerBurst;i++){
          const id=burst*sparkPerBurst+i,j=id*3,k=id*6;
          const v=fireDirections[id],particleAge=local-v.delay;
          if(!active||particleAge<0){
            fireCoords[j]=0;fireCoords[j+1]=-1000;fireCoords[j+2]=0;
            trailCoords[k]=trailCoords[k+3]=0;
            trailCoords[k+1]=trailCoords[k+4]=-1000;
            trailCoords[k+2]=trailCoords[k+5]=0;
            continue;
          }
          // Explosive velocity with drag, slight droop, and trailing afterimages.
          const elapsed=Math.min(particleAge,1.72);
          const travelled=(1-Math.exp(-elapsed*1.65))*1.18;
          const x=spec.x+v.x*travelled;
          const y=spec.y+v.y*travelled-.72*elapsed*elapsed;
          const z=spec.z+v.z*travelled;
          const past=Math.max(0,elapsed-.092);
          const oldTravel=(1-Math.exp(-past*1.65))*1.18;
          fireCoords[j]=x;fireCoords[j+1]=y;fireCoords[j+2]=z;
          trailCoords[k]=x;trailCoords[k+1]=y;trailCoords[k+2]=z;
          trailCoords[k+3]=spec.x+v.x*oldTravel;
          trailCoords[k+4]=spec.y+v.y*oldTravel-.72*past*past;
          trailCoords[k+5]=spec.z+v.z*oldTravel;
        }
      }
      fireGeom.attributes.position.needsUpdate=true;
      trailGeom.attributes.position.needsUpdate=true;
      const fade=1-smooth(clamp((age-.88)/1.57));
      fireMaterial.opacity=fade*.96;
      fireTrails.material.opacity=fade*.78;
      if((!hasLiveBurst&&age>1.3)||age>=totalDuration)stopFireworks();
    }
  }
  function introPose(progress){
    // A single uninterrupted front-to-stage dolly: no spin, no camera cuts.
    // Final view matches closeConcertIntro() exactly, avoiding a visible snap.
    const approach=smooth(progress);
    const mobile=window.innerWidth<780;
    const finalY=mobile?-.58:-.70;
    const finalZ=mobile?12.8:10.4;
    const eye=new THREE.Vector3(
      0,
      mix(.20,finalY,approach),
      mix(mobile?22.0:19.1,finalZ,approach)
    );
    const look=new THREE.Vector3(0,.27,0);
    return {pos:eye,look,fov:mix(mobile?52:51,42,approach)};
  }
  function reset(){opening=null;blackout=false;stopFireworks();setRarity('DEFAULT');}
  drawLED(0);
  return {setRarity,beginOpening,endOpening,burst,introPose,reset,update};
}
