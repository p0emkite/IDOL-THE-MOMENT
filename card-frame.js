/* ITM — MOMENT FRAME / Unified rarity photocard template
 * Frame-only first release: photograph and group logo are intentionally empty.
 * Future card management supplies \`photo\` and \`groupLogo\` as separate
 * HTMLImageElement/ImageBitmap inputs. The drawing geometry stays unchanged.
 * Every grade shares the same composition; ONLY the finish changes.
 */
export const ITM_CARD_WIDTH=512;
export const ITM_CARD_HEIGHT=746;

const FINISH={
  N:{dark:'#555c72',mid:'#9aa3b9',light:'#ecedf5',glow:'#d5dbed',
     stops:['#e6e9f1','#aab2c2','#818ba5','#e9eaf2']},
  R:{dark:'#345e9f',mid:'#6faafa',light:'#e2f4ff',glow:'#8ac8ff',
     stops:['#d8f1ff','#77baff','#4e79cf','#bbdfff']},
  SR:{dark:'#6949a2',mid:'#b181e3',light:'#f4deff',glow:'#d2a4ff',
     stops:['#f6dfff','#c99ef4','#9261ca','#e3b5ff']},
  SSR:{dark:'#97683b',mid:'#e3b56f',light:'#fff1ce',glow:'#ffe2a4',
     stops:['#fff8dc','#eac784','#b88a4c','#fbe5b5']},
  UR:{dark:'#9a8bc3',mid:'#c0b0de',light:'#fbf4ff',glow:'#e5c6ff',
     stops:['#c3f0ec','#accbf1','#bdafe7','#f0c2e1','#ffe0c4','#cfebda','#c3f0ec']}
};

function clamp(n,a=0,b=1){return Math.min(b,Math.max(a,n))}
function roundRect(ctx,x,y,w,h,r){
  const radius=Math.max(0,Math.min(r,w/2,h/2));
  ctx.beginPath();ctx.moveTo(x+radius,y);
  ctx.lineTo(x+w-radius,y);ctx.quadraticCurveTo(x+w,y,x+w,y+radius);
  ctx.lineTo(x+w,y+h-radius);ctx.quadraticCurveTo(x+w,y+h,x+w-radius,y+h);
  ctx.lineTo(x+radius,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-radius);
  ctx.lineTo(x,y+radius);ctx.quadraticCurveTo(x,y,x+radius,y);ctx.closePath();
}
function gradient(ctx,colors,x=0,y=0,x2=512,y2=746){
  const g=ctx.createLinearGradient(x,y,x2,y2);
  colors.forEach((color,i)=>g.addColorStop(i/(colors.length-1),color));
  return g;
}
function arcLine(ctx,fn,stroke,width=1,alpha=1){
  ctx.save();ctx.globalAlpha=alpha;ctx.strokeStyle=stroke;ctx.lineWidth=width;
  ctx.beginPath();fn(ctx);ctx.stroke();ctx.restore();
}
function starPath(ctx,cx,cy,rOuter,rInner=.16){
  const r=Math.max(1,rOuter),q=r*rInner;
  ctx.beginPath();
  ctx.moveTo(cx,cy-r);
  ctx.bezierCurveTo(cx+q*.42,cy-q*.56,cx+q*.58,cy-q*.38,cx+r,cy);
  ctx.bezierCurveTo(cx+q*.58,cy+q*.38,cx+q*.42,cy+q*.56,cx,cy+r);
  ctx.bezierCurveTo(cx-q*.42,cy+q*.56,cx-q*.58,cy+q*.38,cx-r,cy);
  ctx.bezierCurveTo(cx-q*.58,cy-q*.38,cx-q*.42,cy-q*.56,cx,cy-r);
  ctx.closePath();
}
function drawCover(ctx,img,x,y,w,h){
  const iw=img?.naturalWidth||img?.videoWidth||img?.width||0;
  const ih=img?.naturalHeight||img?.videoHeight||img?.height||0;
  if(!iw||!ih)return false;
  const ratio=Math.max(w/iw,h/ih);
  const dw=iw*ratio,dh=ih*ratio;
  ctx.drawImage(img,x+(w-dw)/2,y+(h-dh)/2,dw,dh);
  return true;
}
function blankPhotoArea(ctx){
  // A quiet, neutral backing — intentionally NO sample idol/artwork. When an
  // uploaded photo is provided later, the full-size image replaces this layer.
  const backdrop=ctx.createLinearGradient(0,50,512,700);
  backdrop.addColorStop(0,'#242037');
  backdrop.addColorStop(.34,'#343047');
  backdrop.addColorStop(.72,'#282439');
  backdrop.addColorStop(1,'#171627');
  ctx.fillStyle=backdrop;ctx.fillRect(0,0,512,746);
  const soft=ctx.createRadialGradient(252,256,15,256,350,390);
  soft.addColorStop(0,'#9f95b029');soft.addColorStop(.6,'#79709511');
  soft.addColorStop(1,'#ffffff00');
  ctx.fillStyle=soft;ctx.fillRect(0,0,512,746);
}
function drawFrame(ctx,rarity){
  const r=FINISH[rarity]||FINISH.N;
  const foil=gradient(ctx,r.stops,0,34,512,682);
  const across=gradient(ctx,r.stops,0,0,512,0);
  const prism=rarity==='UR';
  ctx.save();
  // Outer rounded metal band with subtle sculpted bevel. Same width for ALL.
  ctx.shadowColor=r.glow;ctx.shadowBlur=prism?18:rarity==='SSR'?13:8;
  ctx.strokeStyle=foil;ctx.lineWidth=9;
  roundRect(ctx,14,14,484,718,25);ctx.stroke();
  ctx.shadowBlur=0;
  ctx.strokeStyle='#fff8';ctx.lineWidth=1.65;
  roundRect(ctx,19,19,474,708,21);ctx.stroke();
  ctx.strokeStyle=r.dark;ctx.globalAlpha=.67;ctx.lineWidth=2.6;
  roundRect(ctx,27,27,458,692,17);ctx.stroke();
  ctx.globalAlpha=1;

  // Top crown sits directly ON the sweeping crest instead of beneath it.
  // Its top point grazes the card edge, like the approved reference.
  const crownY=25;
  arcLine(ctx,g=>{
    g.moveTo(33,75);g.bezierCurveTo(99,33,175,31,256,crownY);
    g.bezierCurveTo(337,31,413,33,479,75);
  },across,3.1,.98);
  arcLine(ctx,g=>{
    g.moveTo(44,89);g.bezierCurveTo(118,50,191,45,256,crownY+13);
    g.bezierCurveTo(321,45,394,50,467,89);
  },'#ffffff',1.3,.46);
  // UR crown remains a soft pastel rainbow; no extra corner star cluster.
  const crownGradient=gradient(ctx,r.stops,230,0,285,51);
  ctx.save();ctx.shadowColor=prism?'#e6dbff':r.glow;
  ctx.shadowBlur=prism?21:rarity==='N'?9:15;
  starPath(ctx,256,crownY,22,.22);
  ctx.fillStyle=crownGradient;ctx.fill();
  ctx.shadowBlur=0;ctx.strokeStyle='#ffffffed';ctx.lineWidth=1.65;ctx.stroke();
  ctx.restore();

  // Color-filled lower panel, shaped along the orbital ribbons rather than a
  // rectangular overlay. The surface remains photo-forward and consistent
  // across all tiers, with softer rainbow iridescence on UR only.
  const panelPath=()=>{
    ctx.beginPath();
    ctx.moveTo(30,692);
    ctx.bezierCurveTo(140,676,254,602,361,604);
    ctx.bezierCurveTo(418,603,462,626,482,646);
    ctx.lineTo(482,715);ctx.lineTo(30,715);ctx.closePath();
  };
  ctx.save();
  panelPath();ctx.clip();
  const deepTone=ctx.createLinearGradient(0,602,0,716);
  deepTone.addColorStop(0,'#150e2904');
  deepTone.addColorStop(.35,r.dark+'86');
  deepTone.addColorStop(.72,r.dark+'c8');
  deepTone.addColorStop(1,'#1b132be8');
  ctx.fillStyle=deepTone;ctx.fillRect(29,595,457,125);
  // Foil wash adds unmistakable tier color to the filled area.
  ctx.globalAlpha=prism?.49:.39;
  ctx.fillStyle=gradient(ctx,r.stops,45,606,471,713);
  ctx.fillRect(29,598,457,122);
  ctx.globalAlpha=1;
  const sheen=ctx.createLinearGradient(55,628,435,720);
  sheen.addColorStop(0,'#ffffff09');
  sheen.addColorStop(.43,'#ffffff2e');
  sheen.addColorStop(.73,'#ffffff03');
  sheen.addColorStop(1,'#ffffff24');
  ctx.fillStyle=sheen;ctx.fillRect(29,598,457,122);
  ctx.restore();

  // Multiple luminous rails give the lower portion the same polished,
  // dimensional character as the approved concept, without a logo/name box.
  ctx.save();ctx.shadowColor=r.glow;ctx.shadowBlur=prism?16:11;
  arcLine(ctx,g=>{
    g.moveTo(29,692);g.bezierCurveTo(140,676,254,602,361,604);
    g.bezierCurveTo(418,603,462,626,482,646);
  },foil,4,.95);
  ctx.restore();
  arcLine(ctx,g=>{
    g.moveTo(31,703);g.bezierCurveTo(147,682,260,624,373,626);
    g.bezierCurveTo(423,626,458,641,480,663);
  },'#ffffff',1.75,.72);
  arcLine(ctx,g=>{
    g.moveTo(36,714);g.bezierCurveTo(159,687,270,646,389,650);
    g.bezierCurveTo(425,652,455,665,478,680);
  },r.light,2.0,.82);
  arcLine(ctx,g=>{
    g.moveTo(45,720);g.bezierCurveTo(157,700,266,663,392,668);
  },r.mid,1.35,.55);

  // Rightmost quarter deliberately left unobstructed for a group logo
  // supplied by the future "add card" tool. No brand/name placeholder.
  ctx.restore();
}
function drawGradeTab(ctx,rarity){
  const r=FINISH[rarity]||FINISH.N;
  const prism=rarity==='UR';
  ctx.save();
  // Consistent angled ribbon / pill silhouette at upper-RIGHT on all cards.
  // Interior colors match the frame, including the UR rainbow spectrum.
  const path=()=>{
    ctx.beginPath();
    ctx.moveTo(361,17);ctx.lineTo(471,17);
    ctx.quadraticCurveTo(495,17,495,41);
    ctx.lineTo(495,104);ctx.quadraticCurveTo(495,112,487,112);
    ctx.lineTo(366,112);ctx.quadraticCurveTo(360,112,351,104);
    ctx.lineTo(334,85);ctx.quadraticCurveTo(330,79,335,70);
    ctx.lineTo(353,30);ctx.quadraticCurveTo(356,19,361,17);
    ctx.closePath();
  };
  ctx.shadowColor=r.glow;ctx.shadowBlur=prism?13:8;
  path();ctx.fillStyle=gradient(ctx,r.stops,338,25,490,113);ctx.fill();
  ctx.shadowBlur=0;
  path();ctx.lineWidth=2.15;ctx.strokeStyle='#fffdf4e3';ctx.stroke();
  path();ctx.save();ctx.clip();
  const shine=ctx.createLinearGradient(340,20,495,105);
  shine.addColorStop(0,'#ffffff80');shine.addColorStop(.39,'#ffffff14');
  shine.addColorStop(1,'#19132a33');
  ctx.fillStyle=shine;ctx.fillRect(332,14,165,103);
  ctx.restore();
  ctx.fillStyle='#ffffff';
  ctx.font='italic 800 49px Georgia,Times New Roman,serif';
  ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.shadowColor=r.dark;ctx.shadowBlur=8;
  ctx.fillText(rarity,416,66,rarity==='SSR'?105:105);
  ctx.restore();
}
function drawLogoLayer(ctx,logo){
  if(!logo)return;
  // Future upload location: group logo should be transparent, uncropped and
  // contained INSIDE this area; never reused as the game's ITM brand mark.
  const iw=logo.naturalWidth||logo.width,ih=logo.naturalHeight||logo.height;
  if(!iw||!ih)return;
  const maxW=132,maxH=65,scale=Math.min(maxW/iw,maxH/ih);
  const w=iw*scale,h=ih*scale;
  ctx.save();ctx.shadowColor='#0d0922a8';ctx.shadowBlur=9;
  ctx.drawImage(logo,460-w,682-h,w,h);ctx.restore();
}
/** Render one complete card face from separate media and shared frame layers.
 * photo=null and groupLogo=null leave both regions intentionally empty.
 * Canvas output is compatible with existing 3D, reveal, collection and export.
 */
export function renderITMCard(card,{photo=null,groupLogo=null}={}){
  const canvas=document.createElement('canvas');
  canvas.width=1024;canvas.height=1492;
  const ctx=canvas.getContext('2d');
  ctx.scale(2,2);
  ctx.save();
  roundRect(ctx,9,9,494,728,26);ctx.clip();
  if(photo){
    if(!drawCover(ctx,photo,0,0,512,746))blankPhotoArea(ctx);
  }else blankPhotoArea(ctx);
  ctx.restore();
  drawFrame(ctx,card?.rarity||'N');
  drawGradeTab(ctx,card?.rarity||'N');
  drawLogoLayer(ctx,groupLogo);
  return canvas;
}
