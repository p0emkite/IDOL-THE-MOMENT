/* ITM rarity separation: SSR center showcase, SR subtle twinkles.
 * Cosmetic overlays only. The original pack cards remain the source of truth.
 */
export function createRarityRevealAccents(){
  const stage=document.getElementById('packRevealStage');
  const reduced=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let ssrLayer=null,srLayer=null;
  const timers=new Set();
  const later=(fn,ms)=>{const id=setTimeout(()=>{timers.delete(id);fn()},ms);timers.add(id)};
  function clearTimers(){for(const id of timers)clearTimeout(id);timers.clear()}
  function cancel(){
    clearTimers();
    ssrLayer?.remove();srLayer?.remove();
    ssrLayer=srLayer=null;
  }
  function startSSR(button,{onPrepare,onReveal}={}){
    cancel();
    if(!stage||!button){onPrepare?.();onReveal?.();return}
    const back=button.querySelector('.stage-card-back img');
    const front=button.querySelector('.stage-card-front img');
    if(!back||!front){onPrepare?.();onReveal?.();return}
    const layer=document.createElement('div');
    layer.className='itm-ssr-showcase';
    layer.setAttribute('aria-hidden','true');
    const shade=document.createElement('div');shade.className='itm-ssr-shade';
    const rays=document.createElement('div');rays.className='itm-ssr-rays';
    const card=document.createElement('div');card.className='itm-ssr-card';
    const backImg=document.createElement('img');backImg.className='itm-ssr-card-back';
    const frontImg=document.createElement('img');frontImg.className='itm-ssr-card-front';
    backImg.src=back.currentSrc||back.src;
    frontImg.src=front.currentSrc||front.src;
    backImg.alt=frontImg.alt='';
    const flash=document.createElement('div');flash.className='itm-ssr-flash';
    const caption=document.createElement('div');caption.className='itm-ssr-caption';
    caption.textContent='✦ SPECIAL SUPER RARE ✦';
    card.append(backImg,frontImg);layer.append(shade,rays,card,flash,caption);
    stage.append(layer);ssrLayer=layer;
    void layer.offsetWidth;layer.classList.add('playing');
    if(reduced()){
      onPrepare?.();onReveal?.();
      later(()=>{if(ssrLayer===layer){layer.remove();ssrLayer=null}},250);
      return;
    }
    later(()=>{if(ssrLayer===layer)onPrepare?.()},650);
    later(()=>{
      if(ssrLayer!==layer)return;
      layer.classList.add('impact');
      onReveal?.();
    },950);
    later(()=>{if(ssrLayer===layer)layer.classList.add('leaving')},1640);
    later(()=>{if(ssrLayer===layer){layer.remove();ssrLayer=null}},2000);
  }
  function sparkleSR(button){
    if(!stage||!button||reduced())return;
    srLayer?.remove();
    const rect=button.getBoundingClientRect();
    const layer=document.createElement('div');
    layer.className='itm-sr-twinkles';
    layer.setAttribute('aria-hidden','true');
    layer.style.setProperty('--sr-x',(rect.left+rect.width/2)+'px');
    layer.style.setProperty('--sr-y',(rect.top+rect.height/2)+'px');
    layer.style.setProperty('--sr-w',rect.width+'px');
    layer.style.setProperty('--sr-h',rect.height+'px');
    const halo=document.createElement('i');halo.className='itm-sr-soft-halo';layer.append(halo);
    for(let i=0;i<24;i++){
      const star=document.createElement('i');star.className='itm-sr-star';
      star.style.left=(rect.left+rect.width*((i*47+17)%114-7)/100)+'px';
      star.style.top=(rect.top+rect.height*((i*61+11)%114-7)/100)+'px';
      star.style.setProperty('--delay',((i*83)%590)+'ms');
      star.style.setProperty('--scale',(i%4===0?'1.2':i%3===0?'.8':'.55'));
      layer.append(star);
    }
    stage.append(layer);srLayer=layer;
    later(()=>{if(srLayer===layer){layer.remove();srLayer=null}},2050);
  }
  return {startSSR,sparkleSR,cancel};
}
