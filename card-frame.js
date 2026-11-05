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
const lowerFoil=new Image();
lowerFoil.src=new URL('./assets/frames/concept-lower.webp',import.meta.url).href;
await Promise.allSettled([foil.decode(),lowerFoil.decode()]);

function clamp(n,a,b=1){return Math.min(b,Math.max(a,n))}
function drawCover(ctx,img,x,y,w,h,transform={}){
  const iw=img?.naturalWidth||img?.videoWidth||img?.width||0;
  const ih=img?.naturalHeight||img?.videoHeight||img?.height||0;
  if(!iw||!ih)return false;
  const requestedScale=Number(transform.scale);
  const magnification=Number.isFinite(requestedScale)?clamp(requestedScale,0,4):1;
  const ratio=Math.max(w/iw,h/ih)*magnification;
  if(ratio<=0)return false;
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

  // Each strip carries the original three curves, local reflections and
  // translucent enamel. Its alpha mask exposes the live photo above the lip.
  if(lowerFoil.naturalWidth){
    ctx.drawImage(lowerFoil,finish.index*280,0,280,185,0,293,280,185);
  }else{
    const lip=new Path2D('M 7 413 C 20 483 242 409 274 326');
    stroke(ctx,lip,finish.edge,2);
  }
}

// Reflections sit on top of the foil so its opaque rails do not mask the light.
function foilLight(ctx,x,y,length,height,angle,color,strength){
  ctx.save();
  ctx.translate(x,y);ctx.rotate(angle);ctx.scale(length,height);
  ctx.globalAlpha=strength;
  const light=ctx.createRadialGradient(0,0,0,0,0,1);
  light.addColorStop(0,'#fffdf9');
  light.addColorStop(.09,'#ffffffe0');
  light.addColorStop(.25,color+'bc');
  light.addColorStop(.58,color+'48');
  light.addColorStop(1,color+'00');
  ctx.fillStyle=light;ctx.fillRect(-1,-1,2,2);
  ctx.restore();
}

function polishFoil(ctx,finish){
  const color=finish.edge;
  const strength=[.58,.76,.84,.95,1][finish.index];
  const spectral=finish.index===4;
  ctx.save();
  ctx.globalCompositeOperation='screen';
  // A broad halo around a sharp bevel makes the star read as cut crystal.
  foilLight(ctx,138,34,43,21,0,color,strength*.76);
  foilLight(ctx,138,34,23,1.6,0,finish.light,strength);
  foilLight(ctx,138,33,1.4,12,0,finish.light,strength*.85);
  // The arc, badge and vertical rails catch different parts of the same light.
  foilLight(ctx,14,49,22,6,-.91,color,strength*.85);
  foilLight(ctx,224,43,40,10,-.02,spectral?'#ffbded':color,strength);
  foilLight(ctx,224,43,19,1.1,-.02,finish.light,strength);
  foilLight(ctx,5,182,48,8,Math.PI/2,spectral?'#a6f3ff':color,strength*.78);
  foilLight(ctx,275,310,48,10,Math.PI/2,color,strength*.85);
  ctx.restore();
}

export function renderITMCard(card,{photo=null,groupLogo=null,photoTransform=null}={}){
  const finish=Object.hasOwn(finishes,card?.rarity)?finishes[card.rarity]:finishes.N;
  const canvas=document.createElement('canvas');
  canvas.width=2*ITM_CARD_WIDTH;canvas.height=2*ITM_CARD_HEIGHT;
  const ctx=canvas.getContext('2d');
  // Map the reference artwork to the original frame bounds in the 512 × 746 layout.
  // The five strips have different source widths but share one displayed card size.
  const scaleX=493/278;
  const scaleY=729.5/472;
  ctx.scale(canvas.width/ITM_CARD_WIDTH,canvas.height/ITM_CARD_HEIGHT);
  ctx.translate(9.5-scaleX,7-2*scaleY);
  ctx.scale(scaleX,scaleY);
  const aspectCorrection=scaleY/scaleX;
  ctx.imageSmoothingQuality='high';
  const body=new Path2D();body.roundRect(4,34,272,438,25);
  ctx.save();ctx.clip(body);
  ctx.fillStyle='#30283e';ctx.fill(body);
  ctx.save();ctx.scale(aspectCorrection,1);
  drawCover(ctx,photo,4/aspectCorrection,34,272/aspectCorrection,438,photoTransform||card?.photo_transform||
    {scale:card?.photo_scale,x:card?.photo_x,y:card?.photo_y});
  ctx.restore();
  // Solid rarity-tinted lower swoosh: never show the photo through this panel.
  const lowerFill=new Path2D();
  lowerFill.moveTo(7,413);
  lowerFill.bezierCurveTo(20,483,242,409,274,326);
  lowerFill.lineTo(274,478);lowerFill.lineTo(7,478);lowerFill.closePath();
  const lowerTone=ctx.createLinearGradient(40,374,245,480);
  lowerTone.addColorStop(0,finish.edge);
  lowerTone.addColorStop(1,finish.shade);
  ctx.fillStyle=lowerTone;ctx.fill(lowerFill);
  drawGlass(ctx,finish);
  ctx.restore();
  if(foil.naturalWidth){
    ctx.save();
    ctx.shadowColor=finish.edge+'96';ctx.shadowBlur=finish.index===4?13:7;
    // Isolate the original foil to erase the oversized grade plate WITHOUT
    // leaving a square matte or damaging the artwork/photo underneath.
    const foilLayer=document.createElement('canvas');
    foilLayer.width=280;foilLayer.height=478;
    const foilCtx=foilLayer.getContext('2d');
    foilCtx.drawImage(foil,finish.index*290,0,finish.width,478,0,0,280,478);
    foilCtx.save();
    foilCtx.globalCompositeOperation='destination-out';
    foilCtx.translate(229,90);foilCtx.scale(1.0,.91);
    const plateErase=foilCtx.createRadialGradient(0,0,35,0,0,78);
    plateErase.addColorStop(0,'rgba(255,255,255,1)');
    plateErase.addColorStop(.64,'rgba(255,255,255,.99)');
    plateErase.addColorStop(1,'rgba(255,255,255,0)');
    foilCtx.fillStyle=plateErase;foilCtx.fillRect(-79,-79,158,158);
    foilCtx.restore();
    const sourceRatio=finish.width/280;
    // Keep the right-hand rail continuous where the soft mask touched it.
    foilCtx.drawImage(foil,finish.index*290+272*sourceRatio,37,
      8*sourceRatio,124,272,37,8,124);
    ctx.drawImage(foilLayer,0,0);
    ctx.restore();
    // Show the supplied grade plaque at exactly 50% of its original size.
    const badge={x:185,y:35,w:89,h:62};
    ctx.save();
    ctx.shadowColor=finish.edge+'75';ctx.shadowBlur=4;
    ctx.drawImage(foil,finish.index*290+badge.x*sourceRatio,badge.y,
      badge.w*sourceRatio,badge.h,badge.x+badge.w/2,badge.y,badge.w/2,badge.h/2);
    ctx.restore();
  }else{
    stroke(ctx,body,finish.edge,5);
    ctx.fillStyle=finish.light;ctx.textAlign='right';ctx.font='bold italic 26px Georgia';
    ctx.fillText(card?.rarity||'N',264,87);
  }
  polishFoil(ctx,finish);
  // Member name belongs inside the lower-left field, not outside the frame.
  if(card?.name||card?.display_name){
    const caption=String(card.name||card.display_name).trim();
    ctx.save();
    ctx.font='800 17px Pretendard, "Noto Sans KR", Arial, sans-serif';
    ctx.textBaseline='middle';
    ctx.textAlign='left';
    ctx.lineJoin='round';
    ctx.strokeStyle='#180d30c9';ctx.lineWidth=3;
    ctx.shadowColor=finish.light;ctx.shadowBlur=3;
    ctx.strokeText(caption,22,452,148);
    ctx.fillStyle='#fffdfd';ctx.fillText(caption,22,452,148);
    ctx.restore();
  }
  if(groupLogo){
    const w=groupLogo.naturalWidth||groupLogo.width,h=groupLogo.naturalHeight||groupLogo.height;
    if(w&&h){
      ctx.save();
      ctx.scale(aspectCorrection,1);
      const requestedLogoScale=Number(card?.logo_scale);
      const logoScale=Number.isFinite(requestedLogoScale)?clamp(requestedLogoScale,0,3):1;
      const fit=Math.min(48/aspectCorrection/w,51/h)*logoScale;
      if(fit>0)ctx.drawImage(groupLogo,238/aspectCorrection-w*fit/2,434-h*fit/2,w*fit,h*fit);
      ctx.restore();
    }
  }
  return canvas;
}
