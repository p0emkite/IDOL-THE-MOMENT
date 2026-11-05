/* Shared ITM photocard renderer.
 *
 * concept-foil.webp contains ALL five complete frames, including their lower
 * swooshes, in five consecutive 290px-wide strips. It is the only decorative
 * image source. Paint the user's photo first, then overlay each source strip
 * ONCE. Do not split/mask/repaint the source artwork or resize it nonuniformly.
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
  N:   {index:0,edge:'#c7c5d2',light:'#fffaff'},
  R:   {index:1,edge:'#71a5ff',light:'#e7faff'},
  SR:  {index:2,edge:'#bc7bff',light:'#fae9ff'},
  SSR: {index:3,edge:'#ffc477',light:'#fff4d8'},
  UR:  {index:4,edge:'#ddacff',light:'#ffffef'}
};

const foil=new Image();
foil.src=new URL('./assets/frames/concept-foil.webp?v=single-foil-20261105',import.meta.url).href;
await Promise.allSettled([foil.decode()]);

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

function drawOriginalFoil(ctx,finish){
  if(!foil.naturalWidth||!foil.naturalHeight)return false;
  // Keep every source pixel in this tier's complete 1/5th of the WebP.
  // In particular, the lower swoosh, top badge and corner rails must be
  // rendered together: no separate lower image, mask, or width correction.
  const stripWidth=foil.naturalWidth/5;
  const scale=FRAME_HEIGHT/foil.naturalHeight;
  ctx.drawImage(foil,finish.index*stripWidth,0,stripWidth,foil.naturalHeight,
    0,0,stripWidth*scale,FRAME_HEIGHT);
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

  // The export stays at 1024 x 1492 for the game and Studio. Draw every
  // strip with a single uniform X/Y scale, preserving its original shape.
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
