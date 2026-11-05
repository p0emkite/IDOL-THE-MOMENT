/* Shared ITM photocard renderer.
 *
 * The five frames in concept-foil.webp and the five lower ornaments in
 * concept-lower.webp are the source of truth. Never erase, mirror, repaint,
 * resize a grade plaque, or simulate reflections over the supplied foil.
 * The owner can replace either WebP directly, keeping its five-strip layout.
 */
export const ITM_CARD_WIDTH=512;
export const ITM_CARD_HEIGHT=746;

const FRAME_WIDTH=280;
const FRAME_HEIGHT=478;
const FOIL_STRIP_PITCH=290;
const OUTPUT_INSET=8;

// Each strip starts at index*290 in the artwork. Some strips have a slightly
// narrower visible frame; use their actual width rather than stretching it.
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
  const inputScale=Number(transform.scale);
  const magnification=Number.isFinite(inputScale)?clamp(inputScale,0,4):1;
  const ratio=Math.max(w/iw,h/ih)*magnification;
  if(ratio<=0)return false;
  const dw=iw*ratio,dh=ih*ratio;
  const dx=(w-dw)/2+clamp(Number(transform.x)||0,-1,1)*Math.max(0,(dw-w)/2);
  const dy=(h-dh)/2+clamp(Number(transform.y)||0,-1,1)*Math.max(0,(dh-h)/2);
  ctx.drawImage(img,x+dx,y+dy,dw,dh);
  return true;
}

function drawLowerFoil(ctx,finish){
  // Preserve the existing solid rarity-coloured panel underneath the ORIGINAL
  // translucent lower swoosh. Do not redraw the swoosh highlights.
  const panel=new Path2D();
  panel.moveTo(7,413);
  panel.bezierCurveTo(20,483,242,409,274,326);
  panel.lineTo(274,478);panel.lineTo(7,478);panel.closePath();
  const tone=ctx.createLinearGradient(40,374,245,480);
  tone.addColorStop(0,finish.edge);
  tone.addColorStop(1,finish.shade);
  ctx.fillStyle=tone;
  ctx.fill(panel);

  if(lowerFoil.naturalWidth){
    // Five fixed-width 280-pixel strips, one per rarity. If the asset is
    // upscaled uniformly later, drawImage still retains the source ratio.
    const sourceScale=lowerFoil.naturalHeight/185;
    const stripWidth=lowerFoil.naturalWidth/5;
    const width=Math.min(stripWidth,FRAME_WIDTH*sourceScale);
    ctx.drawImage(lowerFoil,finish.index*stripWidth,0,width,lowerFoil.naturalHeight,
      0,293,FRAME_WIDTH,185);
  }else{
    // Minimal fallback, only while the original lower WebP is unavailable.
    const lip=new Path2D('M 7 413 C 20 483 242 409 274 326');
    ctx.strokeStyle=finish.light;ctx.lineWidth=1.7;ctx.stroke(lip);
  }
}

function drawOriginalFoil(ctx,finish){
  if(!foil.naturalWidth)return false;
  const stripWidth=foil.naturalWidth/5;
  const sourceScale=foil.naturalHeight/FRAME_HEIGHT;
  const sourceWidth=Math.min(finish.width*sourceScale,stripWidth);
  const destWidth=sourceWidth/sourceScale;
  // One direct draw from the original WebP, with NO intermediate bitmap,
  // masked badges, mirroring, CSS-like glows, or nonuniform scaling.
  ctx.drawImage(foil,finish.index*stripWidth,0,sourceWidth,foil.naturalHeight,
    (FRAME_WIDTH-destWidth)/2,0,destWidth,FRAME_HEIGHT);
  return true;
}

export function renderITMCard(card,{photo=null,groupLogo=null,photoTransform=null}={}){
  const finish=Object.hasOwn(finishes,card?.rarity)?finishes[card.rarity]:finishes.N;
  const canvas=document.createElement('canvas');
  canvas.width=ITM_CARD_WIDTH*2;
  canvas.height=ITM_CARD_HEIGHT*2;
  const ctx=canvas.getContext('2d');
  ctx.imageSmoothingEnabled=true;
  ctx.imageSmoothingQuality='high';

  // The exported card remains 1024 x 1492 for the game and Studio. The
  // artwork uses ONE common scale in X and Y, so the original outer frame
  // (including the central star and corner bevels) is never stretched.
  const uniformScale=Math.min(
    (ITM_CARD_WIDTH-OUTPUT_INSET*2)/FOIL_STRIP_PITCH,
    (ITM_CARD_HEIGHT-OUTPUT_INSET*2)/FRAME_HEIGHT
  );
  const left=(ITM_CARD_WIDTH-FRAME_WIDTH*uniformScale)/2;
  const top=(ITM_CARD_HEIGHT-FRAME_HEIGHT*uniformScale)/2;
  ctx.setTransform(2*uniformScale,0,0,2*uniformScale,2*left,2*top);

  const body=new Path2D();
  body.roundRect(4,34,272,438,25);
  ctx.save();
  ctx.clip(body);
  ctx.fillStyle='#30283e';
  ctx.fill(body);
  drawCover(ctx,photo,4,34,272,438,photoTransform||card?.photo_transform||{
    scale:card?.photo_scale,x:card?.photo_x,y:card?.photo_y
  });
  drawLowerFoil(ctx,finish);
  ctx.restore();

  if(!drawOriginalFoil(ctx,finish)){
    ctx.save();
    ctx.strokeStyle=finish.edge;
    ctx.lineWidth=5;
    ctx.stroke(body);
    ctx.fillStyle=finish.light;
    ctx.font='bold italic 26px Georgia';
    ctx.textAlign='right';
    ctx.fillText(card?.rarity||'N',264,87);
    ctx.restore();
  }

  // These are user-controlled overlays, not modifications of the WebP frame.
  if(card?.name||card?.display_name){
    const caption=String(card.name||card.display_name).trim();
    ctx.save();
    ctx.font='800 17px Pretendard, "Noto Sans KR", Arial, sans-serif';
    ctx.textBaseline='middle';
    ctx.textAlign='left';
    ctx.lineJoin='round';
    ctx.strokeStyle='#180d30c9';
    ctx.lineWidth=3;
    ctx.strokeText(caption,22,452,148);
    ctx.fillStyle='#fffdfd';
    ctx.fillText(caption,22,452,148);
    ctx.restore();
  }
  if(groupLogo){
    const w=groupLogo.naturalWidth||groupLogo.width;
    const h=groupLogo.naturalHeight||groupLogo.height;
    if(w&&h){
      const size=Number(card?.logo_scale);
      const logoScale=Number.isFinite(size)?clamp(size,0,3):1;
      const fit=Math.min(48/w,51/h)*logoScale;
      if(fit>0)ctx.drawImage(groupLogo,238-w*fit/2,434-h*fit/2,w*fit,h*fit);
    }
  }
  return canvas;
}
