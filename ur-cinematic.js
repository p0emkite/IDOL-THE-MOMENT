/* ITM UR meteor reveal — presentation only; the source card and inventory stay authoritative. */
export function createURCinematic({getSfxGain,getAudioContext,setBgmDucking}){
  const timers=new Set();
  let layer=null,completed=false,flip=null,previousFocus=null;
  const reduced=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const later=(fn,ms)=>{const id=setTimeout(()=>{timers.delete(id);fn()},ms);timers.add(id)};
  function clearTimers(){for(const id of timers)clearTimeout(id);timers.clear()}
  function end({reveal=false}={}){
    if(reveal&&!completed){completed=true;flip?.()}
    clearTimers();
    layer?.remove();layer=null;flip=null;
    setBgmDucking?.(1);
    if(previousFocus?.isConnected)previousFocus.focus({preventScroll:true});
    previousFocus=null;
  }
  function tone(at,frequency,duration,volume,type='sine',to=1){
    const ctx=audio.ctx,osc=ctx.createOscillator(),amp=ctx.createGain(),start=audio.time+at;
    osc.type=type;
    osc.frequency.setValueAtTime(frequency,start);
    if(to!==1)osc.frequency.exponentialRampToValueAtTime(Math.max(25,frequency*to),start+duration*.9);
    amp.gain.setValueAtTime(.0001,start);
    amp.gain.exponentialRampToValueAtTime(Math.max(.0002,volume),start+.016);
    amp.gain.exponentialRampToValueAtTime(.0001,start+duration);
    osc.connect(amp).connect(audio.out);osc.start(start);osc.stop(start+duration+.02);
  }
  function noise(at,duration,volume,highpass=250){
    const ctx=audio.ctx,source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),amp=ctx.createGain();
    const buffer=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*duration),ctx.sampleRate);
    const samples=buffer.getChannelData(0);
    for(let i=0;i<samples.length;i++)samples[i]=(Math.random()*2-1)*Math.pow(1-i/samples.length,.65);
    source.buffer=buffer;filter.type='highpass';filter.frequency.value=highpass;
    const start=audio.time+at;
    amp.gain.setValueAtTime(.0001,start);
    amp.gain.exponentialRampToValueAtTime(Math.max(.0002,volume),start+.016);
    amp.gain.exponentialRampToValueAtTime(.0001,start+duration);
    source.connect(filter).connect(amp).connect(audio.out);
    source.start(start);source.stop(start+duration);
  }
  let audio=null;
  function sound(){
    const gain=Math.max(0,Math.min(1,getSfxGain?.()??0));
    if(gain<.001)return;
    try{
      const ctx=getAudioContext?.();if(!ctx)return;
      void ctx.resume();
      const compressor=ctx.createDynamicsCompressor();
      compressor.threshold.value=-24;compressor.knee.value=12;compressor.ratio.value=6;
      const master=ctx.createGain();master.gain.value=gain*.27;
      compressor.connect(master).connect(ctx.destination);
      audio={ctx,out:compressor,time:ctx.currentTime+.03};
      // Descending meteor: low rushing wind, glissando and a sparkling charge.
      noise(0,.95,.20,220);
      tone(.02,950,1.1,.28,'sawtooth',.13);
      tone(.12,1300,.82,.09,'triangle',.35);
      [900,1175,1568,2093].forEach((f,i)=>tone(.26+i*.11,f,.31,.07,'sine',1.2));
      // The exact card-turn impact, followed by an original victory motif.
      tone(1.58,135,.74,1,'sine',.24);
      tone(1.61,240,.34,.47,'triangle',.37);
      noise(1.58,.42,.75,180);
      noise(1.62,.23,.46,2100);
      [523,659,784,1047].forEach((f,i)=>{
        tone(1.75+i*.18,f,.55,.22,'triangle');
        tone(1.75+i*.18,f*2,.42,.08,'sine');
      });
      [1047,1319,1568].forEach((f,i)=>tone(2.38+i*.16,f,.86,.11,'sine'));
      tone(2.46,392,1.2,.18,'triangle');
      tone(2.46,587,1.2,.14,'triangle');
      tone(2.46,784,1.2,.16,'sine');
    }catch(err){console.warn('UR meteor SFX unavailable',err)}
    finally{audio=null}
  }
  function start({button,onReveal}={}){
    end();
    if(!button||typeof onReveal!=='function'){onReveal?.();return}
    const front=button.querySelector('.stage-card-front img');
    const back=button.querySelector('.stage-card-back img');
    if(!front){onReveal();return}
    previousFocus=document.activeElement;
    flip=onReveal;completed=false;
    const el=document.createElement('div');
    el.className='itm-ur-cinema';el.setAttribute('role','dialog');
    el.setAttribute('aria-modal','true');el.setAttribute('aria-label','UR 카드 등장 연출');
    el.innerHTML=\`<div class="itm-ur-cinema-backdrop"></div>
      <div class="itm-ur-cinema-sky" aria-hidden="true"></div>
      <div class="itm-ur-meteor-trail" aria-hidden="true"></div>
      <div class="itm-ur-cinema-aura" aria-hidden="true"></div>
      <div class="itm-ur-cinema-beams" aria-hidden="true"></div>
      <div class="itm-ur-cinema-impact" aria-hidden="true"></div>
      <div class="itm-ur-cinema-rings" aria-hidden="true"></div>
      <div class="itm-ur-cinema-particles" aria-hidden="true"></div>
      <div class="itm-ur-cinema-card" aria-hidden="true"><div class="itm-ur-cinema-inner">
        <div class="itm-ur-cinema-face back"><img alt="" /></div>
        <div class="itm-ur-cinema-face front"><img alt="" /><span class="itm-ur-cinema-foil"></span></div>
      </div></div>
      <div class="itm-ur-cinema-footer" aria-hidden="true"><strong>✦ U L T R A &nbsp; R A R E ✦</strong><small>THE MOMENT IS YOURS</small></div>
      <button type="button" class="itm-ur-cinema-skip" aria-label="UR 등장 연출 건너뛰기">건너뛰기 ✕</button>\`;
    el.querySelector('.itm-ur-cinema-face.front img').src=front.currentSrc||front.src;
    el.querySelector('.itm-ur-cinema-face.back img').src=back?.currentSrc||back?.src||'./assets/itm-card-back.png';
    const sky=el.querySelector('.itm-ur-cinema-sky'),particles=el.querySelector('.itm-ur-cinema-particles');
    const rings=el.querySelector('.itm-ur-cinema-rings');
    const count=window.innerWidth<680?42:82;
    const fragment=document.createDocumentFragment();
    for(let i=0;i<count;i++){
      const star=document.createElement('i');
      star.style.setProperty('--sx',((i*71+19)%100)+'%');
      star.style.setProperty('--sy',((i*43+11)%100)+'%');
      star.style.setProperty('--sd',((i*37)%700)+'ms');
      star.style.setProperty('--hue',String((i*67)%360));
      star.style.setProperty('--dx',((i*59)%360-180)+'px');
      star.style.setProperty('--dy',((i*97)%420-210)+'px');
      fragment.append(star);
    }
    particles.append(fragment);
    for(let i=0;i<4;i++){
      const ring=document.createElement('i');ring.style.setProperty('--delay',(i*115)+'ms');rings.append(ring);
    }
    for(let i=0;i<33;i++){
      const s=document.createElement('i');
      s.style.setProperty('--x',((i*47+13)%100)+'%');
      s.style.setProperty('--y',((i*31+7)%100)+'%');
      s.style.setProperty('--delay',(i%9*145)+'ms');
      sky.append(s);
    }
    el.querySelector('.itm-ur-cinema-skip').addEventListener('click',()=>end({reveal:true}));
    el.addEventListener('keydown',event=>{
      if(event.key==='Escape'){event.preventDefault();end({reveal:true})}
      if(event.key==='Tab'){event.preventDefault();el.querySelector('.itm-ur-cinema-skip')?.focus()}
    });
    document.body.append(el);layer=el;
    setBgmDucking?.(.12);
    sound();
    void el.offsetWidth;el.classList.add('playing');
    el.querySelector('.itm-ur-cinema-skip').focus({preventScroll:true});
    const quick=reduced();
    later(()=>{if(layer===el&&!completed){completed=true;flip?.()}},quick?80:1760);
    later(()=>{if(layer===el)el.classList.add('leaving')},quick?1000:3690);
    later(()=>{if(layer===el)end({reveal:true})},quick?1250:4080);
  }
  function cancel(){end()}
  return {start,cancel};
}
