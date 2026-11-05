/* Shared ITM front. Foil samples are isolated from the five supplied concept cards.
 * Photos, translucent ribbons and group logos are composed at export resolution.
 */
export const ITM_CARD_WIDTH=512;
export const ITM_CARD_HEIGHT=746;

const finishes={
  N:   {index:0,width:280,edge:'#c7c5d2',shade:'#3e394c',light:'#fffaff'},
  R:   {index:1,width:277,edge:'#71a5ff',shade:'#192c71',light:'#e7faff'},
  SR:  {index:2,width:276,edge:'#bc7bff',shade:'#512472',light:'#fae9ff'},
  SSR: {index:3,width:277,edge:'#ffc477',shade:'#6c4220',light:'#fff4d8'},
  UR:  {index:4,width:290,edge:'#ddacff',shade:'#48346e',light:'#ffffef'}
};
const foil=new Image();
foil.src=new URL('./assets/frames/concept-foil.webp',import.meta.url).href;
await foil.decode().catch(()=>{});

function clamp(n,a,b=1){return Math.min(b,Math.max(a,n))}
function drawCover(ctx,img,x,y,w,h,transform={}){
  const iw=img?.naturalWidth||img?.videoWidth||img?.width||0;
  const ih=img?.naturalHeight||img?.videoHeight||img?.height||0;
  if(!iw||!ih)return false;
  const magnification=clamp(Number(transform.scale)||1,1,4);
  const ratio=Math.max(w/iw,h/ih)*magnification;
  const dw=iw*ratio,dh=ih*ratio;
  // Offset is normalised against the maximum image overscan. This ensures
  // the crop never leaves blank edges, on mobile or desktop.
  const dx=(w-dw)/2+clamp(Number(transform.x)||0,-1,1)*Math.max(0,(dw-w)/2);
  const dy=(h-dh)/2+clamp(Number(transform.y)||0,-1,1)*Math.max(0,(dh-h)/2);
  ctx.drawImage(img,x+dx,y+dy,dw,dh);
  return true;
}

function stroke(ctx,path,color,width,glow=0){
  ctx.save();
  ctx.strokeStyle=color;
  ctx.lineWidth=width;
  ctx.shadowBlur=glow;
  ctx.shadowColor=color;
  ctx.stroke(path);
  ctx.restore();
}

function drawGlass(ctx,finish){
  const shoulder=new Path2D('M 7 76 C 13 53 32 37 60 36');
  stroke(ctx,shoulder,finish.light,.9);
  const arch=new Path2D('M 7 116 C 20 66 73 39 139 45 C 159 45 179 48 199 56');
  stroke(ctx,arch,finish.edge,2.3,6);
  stroke(ctx,arch,finish.light,1);

  // Both lips turn upwards at the right rail. The portrait remains visible
  // through the thin ribbon; the darker lower corner carries the group mark.
  const upper='M 7 412 C 8 442 41 449 91 436 C 164 419 258 375 273 298';
  const lower='M 19 466 C 75 483 241 411 273 334';
  const plate=new Path2D(upper+' L 278 477 L 3 477 Z');
  const tint=ctx.createLinearGradient(70,463,244,305);
  tint.addColorStop(0,finish.shade+'64');
  tint.addColorStop(.47,finish.edge+'32');
  tint.addColorStop(1,finish.shade+'89');
  ctx.fillStyle=tint;ctx.fill(plate);
  const ribbon=new Path2D(upper+' L 273 334 C 241 411 75 483 19 466 L 7 460 Z');
  const sheen=ctx.createLinearGradient(27,466,270,350);
  const colors=finish.index===4?
    ['#939cff5a','#abfcf866','#ffaeea5c','#c4bcff42','#8cddff68','#ffeacc60']:
    [finish.edge+'50',finish.light+'39',finish.edge+'48',finish.shade+'2c',finish.light+'65'];
  colors.forEach((c,i)=>sheen.addColorStop(i/(colors.length-1),c));
  ctx.fillStyle=sheen;ctx.fill(ribbon);

  // A soft reflection follows the sweep. Feather its ends so it reads as
  // light across glass rather than another outlined stripe.
  ctx.save();ctx.clip(ribbon);
  const reflection=ctx.createLinearGradient(23,461,269,355);
  reflection.addColorStop(0,'#ffffff00');
  reflection.addColorStop(.28,finish.light+'63');
  reflection.addColorStop(.50,'#ffffff08');
  reflection.addColorStop(.78,finish.light+'81');
  reflection.addColorStop(1,'#ffffff00');
  const facet=new Path2D('M 9 457 C 54 486 244 406 273 312 C 252 394 75 484 9 462 Z');
  ctx.fillStyle=reflection;ctx.fill(facet);ctx.restore();

  for(const curve of [upper,lower]){
    const path=new Path2D(curve);
    stroke(ctx,path,finish.edge,2.5,8);
    stroke(ctx,path,finish.light,1.05);
  }
  // An elongated bloom and a narrow white core at the two light catches.
  // Work in local coordinates to keep the reflections aligned at every size.
  ctx.save();ctx.clip(plate);
  const glints=[[76,463,-.20,39,8],[263,348,-1.14,25,5]];
  for(const [x,y,angle,length,height] of glints){
    ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.scale(length,height);
    const bloom=ctx.createRadialGradient(0,0,0,0,0,1);
    bloom.addColorStop(0,'#fffffff2');
    bloom.addColorStop(.16,finish.light+'d0');
    bloom.addColorStop(.48,finish.edge+'72');
    bloom.addColorStop(1,finish.edge+'00');
    ctx.fillStyle=bloom;ctx.fillRect(-1,-1,2,2);
    ctx.scale(.63,.16);ctx.fillStyle=bloom;ctx.fillRect(-1,-1,2,2);
    ctx.restore();
  }
  ctx.restore();
}

export function renderITMCard(card,{photo=null,groupLogo=null,photoTransform=null}={}){
  const finish=Object.hasOwn(finishes,card?.rarity)?finishes[card.rarity]:finishes.N;
  const canvas=document.createElement('canvas');
  canvas.width=2*ITM_CARD_WIDTH;canvas.height=2*ITM_CARD_HEIGHT;
  const ctx=canvas.getContext('2d');
  // Keep the tall silhouette of the artwork within ITM's existing export size.
  const scale=canvas.height/478;
  ctx.translate((canvas.width-finish.width*scale)/2,0);
  ctx.scale(scale*finish.width/280,scale);
  ctx.imageSmoothingQuality='high';
  const body=new Path2D();body.roundRect(4,34,272,438,25);
  ctx.save();ctx.clip(body);
  ctx.fillStyle='#30283e';ctx.fill(body);
  drawCover(ctx,photo,4,34,272,438,photoTransform||card?.photo_transform||
    {scale:card?.photo_scale,x:card?.photo_x,y:card?.photo_y});
  drawGlass(ctx,finish);
  ctx.restore();
  if(foil.naturalWidth){
    ctx.save();
    ctx.shadowColor=finish.edge+'96';ctx.shadowBlur=finish.index===4?13:7;
    ctx.drawImage(foil,finish.index*290,0,finish.width,478,0,0,280,478);
    ctx.restore();
  }else{
    stroke(ctx,body,finish.edge,5);
    ctx.fillStyle=finish.light;ctx.textAlign='right';ctx.font='bold italic 26px Georgia';
    ctx.fillText(card?.rarity||'N',264,87);
  }
  if(groupLogo){
    const w=groupLogo.naturalWidth||groupLogo.width,h=groupLogo.naturalHeight||groupLogo.height;
    if(w&&h){
      const fit=Math.min(48/w,51/h);
      ctx.drawImage(groupLogo,238-w*fit/2,434-h*fit/2,w*fit,h*fit);
    }
  }
  return canvas;
}
