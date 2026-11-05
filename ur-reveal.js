/* ITM UR reveal payoff — visual-only DOM overlay + synthesized SFX.
 * Intentionally leaves card-frame.js, card textures, rarity odds and inventory unchanged.
 */
export function createURRevealPayoff({getSfxGain,getAudioContext,setBgmDucking}){
  const stage=document.getElementById('packRevealStage');
  let layer=null,primed=null,restoreTimer=0,visualTimer=0,impactTimer=0;
  const reduced=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const duck=amount=>setBgmDucking?.(amount);

  function ensureLayer(){
    if(layer||!stage)return layer;
    layer=document.createElement('div');
    layer.className='itm-ur-payoff';
    layer.setAttribute('aria-hidden','true');
    stage.append(layer);
    return layer;
  }
  function clearTimers(){
    clearTimeout(restoreTimer);clearTimeout(visualTimer);clearTimeout(impactTimer);
    restoreTimer=visualTimer=impactTimer=0;
  }
  function prepare(button){
    clearTimers();
    if(layer)layer.classList.remove('active');
    primed?.classList.remove('ur-primed');
    primed=button||null;
    primed?.classList.add('ur-primed');
    stage?.classList.add('ur-anticipating');
    stage?.classList.remove('ur-impact');
    // Silence the playing BGM for exactly the 300 ms lead-in.
    duck(0);
  }
  function sound(){
    const gain=Math.max(0,Math.min(1,getSfxGain?.()??0));
    if(gain<.001)return;
    try{
      const ctx=getAudioContext();
      if(!ctx)return;
      void ctx.resume();
      const t=ctx.currentTime+.006;
      const comp=ctx.createDynamicsCompressor();
      comp.threshold.value=-20;comp.knee.value=12;comp.ratio.value=6;
      const master=ctx.createGain();
      master.gain.value=gain*.30;
      comp.connect(master).connect(ctx.destination);
      const note=(at,freq,duration,power,type='triangle',bend=1)=>{
        const o=ctx.createOscillator(),g=ctx.createGain(),start=t+at;
        o.type=type;
        o.frequency.setValueAtTime(freq,start);
        if(bend!==1)o.frequency.exponentialRampToValueAtTime(Math.max(20,freq*bend),start+duration*.7);
        g.gain.setValueAtTime(.0001,start);
        g.gain.exponentialRampToValueAtTime(Math.max(.001,power),start+.018);
        g.gain.exponentialRampToValueAtTime(.0001,start+duration);
        o.connect(g).connect(comp);o.start(start);o.stop(start+duration+.015);
      };
      const noise=(at,duration,power,highpass)=>{
        const buffer=ctx.createBuffer(1,Math.ceil(duration*ctx.sampleRate),ctx.sampleRate);
        const samples=buffer.getChannelData(0);
        for(let i=0;i<samples.length;i++)samples[i]=(Math.random()*2-1)*(1-i/samples.length);
        const src=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),g=ctx.createGain(),start=t+at;
        src.buffer=buffer;filter.type='highpass';filter.frequency.value=highpass;
        g.gain.setValueAtTime(.0001,start);
        g.gain.exponentialRampToValueAtTime(Math.max(.001,power),start+.008);
        g.gain.exponentialRampToValueAtTime(.0001,start+duration);
        src.connect(filter).connect(g).connect(comp);src.start(start);src.stop(start+duration);
      };
      // First frame: deep, tactile impact and bright transient.
      note(0,130,.46,.92,'sine',.32);
      note(.012,210,.18,.37,'triangle',.42);
      noise(0,.27,.57,420);
      noise(.022,.12,.38,2600);
      // Then an original celebratory four-note fanfare, not a sampled song.
      const fanfare=[392,494,587,784];
      fanfare.forEach((hz,i)=>{
        const at=.16+i*.18;
        note(at,hz,.43,.22,'triangle');
        note(at,hz*2,.30,.075,'sine');
      });
      [1047,1319,1568,2093].forEach((hz,i)=>note(.62+i*.15,hz,.68,.095,'sine'));
      note(.91,392,1.0,.16,'triangle');
      note(.91,587,1.0,.13,'triangle');
      note(.91,784,1.1,.15,'sine');
      noise(.39,.24,.10,3300);
      noise(.76,.19,.12,3600);
    }catch(err){console.warn('UR SFX unavailable',err);}
  }
  function impact(button){
    stage?.classList.remove('ur-anticipating');
    primed?.classList.remove('ur-primed');
    primed=null;
    stage?.classList.add('ur-impact');
    // Keep BGM beneath the fanfare, then restore the user's unchanged setting.
    duck(.16);
    restoreTimer=setTimeout(()=>duck(1),1450);
    impactTimer=setTimeout(()=>stage?.classList.remove('ur-impact'),560);
    sound();
    if(reduced())return;
    const host=ensureLayer();
    if(!host)return;
    const r=button?.getBoundingClientRect();
    const x=r?(r.left+r.width/2)/innerWidth*100:50;
    const y=r?(r.top+r.height/2)/innerHeight*100:50;
    host.style.setProperty('--origin-x',x.toFixed(2)+'%');
    host.style.setProperty('--origin-y',y.toFixed(2)+'%');
    host.replaceChildren();
    for(let ring=0;ring<3;ring++){
      const el=document.createElement('i');
      el.className='itm-ur-shockwave';
      el.style.setProperty('--ring-delay',ring*100+'ms');
      host.append(el);
    }
    const flash=document.createElement('i');
    flash.className='itm-ur-hit-flash';
    host.append(flash);
    for(let i=0;i<66;i++){
      const p=document.createElement('i');
      const fountain=i%5;
      p.className=i%3===0?'itm-ur-spark star':'itm-ur-spark';
      p.style.setProperty('--spark-x',(fountain*19+12)+'%');
      p.style.setProperty('--spark-y',(i%4===0?86:78)+'%');
      p.style.setProperty('--spark-dx',((i*71%207)-103)+'px');
      p.style.setProperty('--spark-dy',(-85-(i*53%310))+'px');
      p.style.setProperty('--spark-delay',((i%8)*43)+'ms');
      p.style.setProperty('--spark-hue',String((i*67)%360));
      host.append(p);
    }
    void host.offsetWidth;host.classList.add('active');
    visualTimer=setTimeout(()=>host.classList.remove('active'),2050);
  }
  function cancel(){
    clearTimers();
    primed?.classList.remove('ur-primed');primed=null;
    stage?.classList.remove('ur-anticipating','ur-impact');
    layer?.classList.remove('active');
    duck(1);
  }
  return {prepare,impact,cancel};
}
