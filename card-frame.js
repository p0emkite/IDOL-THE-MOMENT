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
  const foil=gradient(ctx,r.stops,0,44,512,675);
  const across=gradient(ctx,r.stops,40,42,472,42);
  const prism=rarity==='UR';
  ctx.save();

  // The star is centered ON the upper border, not below an interior arch.
  // Raise the card shoulders to y=43 to give the 36px crown room to project
  // above the card without getting cut by the 1024×1492 canvas.
  const borderTop=43,crownX=256,crownY=borderTop,crownRadius=36;
  ctx.save();
  ctx.shadowColor=r.glow;
  ctx.shadowBlur=prism?20:rarity==='SSR'?16:10;
  ctx.strokeStyle=foil;ctx.lineWidth=9;
  roundRect(ctx,14,borderTop,484,732-borderTop,25);ctx.stroke();
  ctx.restore();
  ctx.strokeStyle='#fff9';ctx.lineWidth=1.6;
  roundRect(ctx,19,borderTop+5,474,727-(borderTop+5),21);ctx.stroke();
  ctx.globalAlpha=.67;ctx.strokeStyle=r.dark;ctx.lineWidth=2.45;
  roundRect(ctx,27,borderTop+13,458,719-(borderTop+13),17);ctx.stroke();
  ctx.globalAlpha=1;

  // Make ——✦—— literally one continuous central axis: the luminous left
  // and right rails end at the star's lateral tips (x ± crownRadius).
  // The original approved example has the star protruding ABOVE this rail.
  ctx.save();ctx.shadowColor=r.glow;ctx.shadowBlur=prism?18:12;
  arcLine(ctx,g=>{
    g.moveTo(42,crownY);g.lineTo(crownX-crownRadius,crownY);
    g.moveTo(crownX+crownRadius,crownY);g.lineTo(470,crownY);
  },across,3.6,.97);
  ctx.restore();
  // Delicate lower arch enhances depth, but does not relocate the star.
  arcLine(ctx,g=>{
    g.moveTo(34,108);g.bezierCurveTo(93,78,165,75,219,76);
  },r.light,2.0,.71);
  arcLine(ctx,g=>{
    g.moveTo(43,123);g.bezierCurveTo(108,94,169,94,218,96);
  },'#ffffff',1.0,.31);
  arcLine(ctx,g=>{
    g.moveTo(293,76);g.bezierCurveTo(345,75,415,78,479,108);
  },r.light,1.8,.55);
  ctx.save();
  const crownGradient=gradient(ctx,r.stops,221,7,291,79);
  ctx.shadowColor=prism?'#e8d8ff':r.glow;ctx.shadowBlur=prism?25:19;
  starPath(ctx,crownX,crownY,crownRadius,.21);
  ctx.fillStyle=crownGradient;ctx.fill();
  ctx.shadowBlur=0;ctx.strokeStyle='#fffdf5ed';ctx.lineWidth=1.8;ctx.stroke();
  ctx.restore();

  // Filled enamel plate BELOW the swoosh: complete coverage until the
  // bottom edge, including the future band-logo position on the right.
  // The overall silhouette swoops up on the right instead of forming a dome.
  const upperEdge=g=>{
    g.moveTo(28,676);
    g.bezierCurveTo(128,681,316,592,484,540);
  };
  const panel=()=>{
    ctx.beginPath();upperEdge(ctx);
    ctx.lineTo(484,714);ctx.quadraticCurveTo(484,719,478,719);
    ctx.lineTo(34,719);ctx.quadraticCurveTo(28,719,28,713);
    ctx.closePath();
  };
  ctx.save();panel();ctx.clip();
  // A substantial enamel area, not thin hairline strokes.
  const enamel=ctx.createLinearGradient(30,716,487,540);
  enamel.addColorStop(0,r.dark);
  enamel.addColorStop(.22,r.mid);
  enamel.addColorStop(.50,r.light);
  enamel.addColorStop(.75,r.mid);
  enamel.addColorStop(1,r.dark);
  ctx.fillStyle=enamel;ctx.fillRect(25,525,463,199);
  // A broad smooth lit-metal reflection adds materiality.
  const reflection=ctx.createLinearGradient(45,728,475,572);
  reflection.addColorStop(0,'#ffffff00');
  reflection.addColorStop(.29,'#ffffff18');
  reflection.addColorStop(.48,'#ffffff72');
  reflection.addColorStop(.61,'#ffffff1c');
  reflection.addColorStop(.88,'#ffffff00');
  reflection.addColorStop(1,'#ffffff20');
  ctx.globalAlpha=.72;ctx.fillStyle=reflection;ctx.fillRect(27,532,460,190);
  // Right-hand logo area remains colored but a shade more even, so uploaded
  // transparent logos will be distinguishable and not swallowed by glare.
  const logoBase=ctx.createLinearGradient(319,620,485,680);
  logoBase.addColorStop(0,'#ffffff00');
  logoBase.addColorStop(.62,r.dark+'0e');
  logoBase.addColorStop(1,r.dark+'40');
  ctx.globalAlpha=.68;ctx.fillStyle=logoBase;
  ctx.fillRect(318,594,168,121);
  ctx.restore();

  // One full, wide luminous satin swoosh. This deliberately replaces the old
  // stack of wispy parallel lines with a single polished band that tapers.
  const swooshBand=()=>{
    ctx.beginPath();upperEdge(ctx);
    ctx.bezierCurveTo(330,637,152,706,30,703);
    ctx.quadraticCurveTo(25,695,28,676);
    ctx.closePath();
  };
  const bandMetal=ctx.createLinearGradient(35,687,484,546);
  bandMetal.addColorStop(0,r.light);
  bandMetal.addColorStop(.15,'#ffffff');
  bandMetal.addColorStop(.34,r.mid);
  bandMetal.addColorStop(.53,r.light);
  bandMetal.addColorStop(.76,r.mid);
  bandMetal.addColorStop(1,'#fffaf9');
  ctx.save();ctx.shadowColor=r.glow;ctx.shadowBlur=prism?24:18;
  swooshBand();ctx.fillStyle=bandMetal;ctx.fill();
  ctx.restore();
  // Beveled top lip and *one* fine specular highlight, not drawn hair.
  ctx.save();ctx.shadowColor=r.glow;ctx.shadowBlur=prism?22:14;
  arcLine(ctx,upperEdge,'#fff9f2',4.0,.94);
  ctx.restore();
  arcLine(ctx,g=>{
    g.moveTo(29,686);g.bezierCurveTo(136,689,319,603,483,551);
  },r.light,2.0,.79);
  // Subtle broad orbital ribbon over the photo, behind the eventual logo:
  // the smooth grand curve from the reference, not parallel scratching.
  ctx.save();ctx.globalAlpha=.52;
  arcLine(ctx,g=>{
    g.moveTo(33,625);
    g.bezierCurveTo(56,723,172,718,285,650);
    g.bezierCurveTo(365,601,423,555,482,533);
  },r.light,2.5,.72);
  ctx.restore();

  // A sparkling flare near the rising tip, confined to the swipe edge.
  const tipGlow=ctx.createRadialGradient(464,545,1,464,545,48);
  tipGlow.addColorStop(0,'#ffffffc8');
  tipGlow.addColorStop(.22,r.light+'a5');
  tipGlow.addColorStop(.65,r.glow+'25');
  tipGlow.addColorStop(1,'#ffffff00');
  ctx.globalAlpha=.57;ctx.fillStyle=tipGlow;ctx.fillRect(418,495,94,106);
  ctx.globalAlpha=1;
  ctx.restore();
}
function drawGradeTab(ctx,rarity){
  const r=FINISH[rarity]||FINISH.N;
  const prism=rarity==='UR';
  ctx.save();
  // Badge follows the raised upper card rail; never overlaps the crown.
  ctx.translate(0,28);
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
