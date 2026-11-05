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

  // The crest's large center star sits visibly across the leading arch,
  // with its upper point rising above the outer border like the approved art.
  const crestY=46,starY=32,starRadius=31;
  arcLine(ctx,g=>{
    g.moveTo(33,81);
    g.bezierCurveTo(105,37,184,42,256,crestY);
    g.bezierCurveTo(328,42,407,37,479,81);
  },across,3.2,.98);
  arcLine(ctx,g=>{
    g.moveTo(43,94);
    g.bezierCurveTo(119,56,188,57,256,crestY+14);
    g.bezierCurveTo(324,57,393,56,469,94);
  },'#ffffff',1.35,.42);
  // The star intentionally straddles the arch: its core is ABOVE the crest.
  // UR keeps the same soft, desaturated spectrum in all three foil locations.
  const crownGradient=gradient(ctx,r.stops,225,2,292,70);
  ctx.save();
  ctx.shadowColor=prism?'#e7d8ff':r.glow;
  ctx.shadowBlur=prism?27:rarity==='N'?13:20;
  starPath(ctx,256,starY,starRadius,.22);
  ctx.fillStyle=crownGradient;ctx.fill();
  ctx.shadowBlur=0;
  ctx.lineWidth=1.75;ctx.strokeStyle='#fffdf6ed';ctx.stroke();
  ctx.restore();
  arcLine(ctx,g=>{
    g.moveTo(242,starY);g.lineTo(213,starY);
    g.moveTo(270,starY);g.lineTo(299,starY);
  },r.light,1.2,.58);

  // Bottom: an ascending pointed SWOOSH, not a dome/arch.
  // A sharp right-side tip and thick left-to-center foil ribbon define the
  // silhouette. All rarities use exactly this outline and the same logo slot.
  const swoosh=()=>{
    ctx.beginPath();
    ctx.moveTo(29,707);
    ctx.bezierCurveTo(155,699,344,627,482,590);
    ctx.bezierCurveTo(377,668,192,720,29,727);
    ctx.closePath();
  };
  const metal=ctx.createLinearGradient(37,708,487,606);
  metal.addColorStop(0,r.dark);
  metal.addColorStop(.23,r.mid);
  metal.addColorStop(.57,r.light);
  metal.addColorStop(.76,r.mid);
  metal.addColorStop(1,prism?'#d4e8ff':r.light);
  ctx.save();
  ctx.shadowColor=r.glow;ctx.shadowBlur=prism?26:17;
  ctx.globalAlpha=.96;
  swoosh();ctx.fillStyle=metal;ctx.fill();
  ctx.restore();

  // Tonal color backing makes the lower panel read like an enamel/foil insert
  // instead of an empty transparent opening.
  ctx.save();swoosh();ctx.clip();
  const tinted=ctx.createLinearGradient(0,598,0,742);
  tinted.addColorStop(0,'#ffffff92');
  tinted.addColorStop(.32,'#ffffff35');
  tinted.addColorStop(.70,r.dark+'64');
  tinted.addColorStop(1,'#140d29d2');
  ctx.fillStyle=tinted;ctx.fillRect(27,585,459,150);
  const specular=ctx.createLinearGradient(27,710,480,598);
  specular.addColorStop(0,'#ffffff00');
  specular.addColorStop(.35,'#ffffff32');
  specular.addColorStop(.57,'#ffffff85');
  specular.addColorStop(.70,'#ffffff12');
  specular.addColorStop(1,'#ffffff9b');
  ctx.globalAlpha=.7;
  ctx.fillStyle=specular;ctx.fillRect(27,586,459,150);
  ctx.restore();

  // High-key sweep across the rising edge, plus tapering filament trails.
  ctx.save();ctx.shadowColor=r.glow;ctx.shadowBlur=prism?25:18;
  arcLine(ctx,g=>{
    g.moveTo(29,707);
    g.bezierCurveTo(155,699,344,627,482,590);
  },foil,4.7,1);
  ctx.restore();
  arcLine(ctx,g=>{
    g.moveTo(35,712);g.bezierCurveTo(163,703,343,647,468,605);
  },'#ffffff',2.2,.84);
  arcLine(ctx,g=>{
    g.moveTo(33,722);g.bezierCurveTo(182,705,336,667,451,621);
  },r.light,2.2,.76);
  arcLine(ctx,g=>{
    g.moveTo(45,727);g.bezierCurveTo(174,713,323,682,431,648);
  },r.mid,1.25,.62);
  // Jewel-like highlights travel along the directional ribbon, not around
  // a static semi-circle. Never place branding or star badges on the card face.
  ctx.save();
  const flare=ctx.createRadialGradient(425,608,1,425,608,53);
  flare.addColorStop(0,'#ffffffbb');
  flare.addColorStop(.17,r.light+'8e');
  flare.addColorStop(.7,r.glow+'1a');
  flare.addColorStop(1,'#ffffff00');
  ctx.globalAlpha=.61;ctx.fillStyle=flare;
  ctx.fillRect(375,560,108,110);
  ctx.restore();

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
