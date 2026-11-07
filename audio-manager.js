/* ITM audio: defaults ON at 50/50; browser gesture policies still apply.
 * Live BGM additions are persisted in Supabase and shared across devices.
 * A scheduled GitHub workflow mirrors the same files to the repository.
 */
export function mountAudioPanel({onToggle,initialEnabled=true}){
  const byId=id=>document.getElementById(id);
  const panel=byId('soundPanel'),button=byId('audioToggle'),master=byId('soundMaster');
  const volumeBgm=byId('bgmVolume'),volumeFx=byId('sfxVolume'),caption=byId('musicTrackInfo');
  const base=[
    {title:'Afterglow Arcade',url:'./assets/audio/1_ITM_Afterglow_Arcade_Lobby_BGM.mp3'},
    {title:'Chrome Rush',url:'./assets/audio/2_ITM_Chrome_Rush_Track03_No_Lead.mp3'},
    {title:'Sugar Parade',url:'./assets/audio/3_ITM_Sugar_Parade_Track04_No_Lead.mp3'}
  ];
  let tracks=base.slice(),index=0,enabled=!!initialEnabled,bgmGain=.5,fxGain=.5;
  let playerReady=false,playing=false,manualPaused=false,serial=0,failures=0,backend=null;
  let cinematicDuck=1;
  const player=new Audio();
  player.preload='auto';player.loop=false;player.volume=bgmGain;
  const status=msg=>{caption.textContent=msg};
  const describe=()=>status(tracks[index]?'♪ '+(index+1)+'/'+tracks.length+' · '+tracks[index].title:'등록된 BGM이 없습니다.');
  function controls(){
    player.volume=enabled?bgmGain*cinematicDuck:0;
    master.checked=enabled;
    volumeBgm.value=String(Math.round(bgmGain*100));volumeFx.value=String(Math.round(fxGain*100));
    byId('bgmValue').textContent=Math.round(bgmGain*100)+'%';
    byId('sfxValue').textContent=Math.round(fxGain*100)+'%';
    button.setAttribute('aria-expanded',String(!panel.hidden));
  }
  function loadCurrent(){
    if(!tracks.length){player.pause();playing=false;playerReady=false;player.removeAttribute('src');describe();return;}
    serial++;
    player.pause();playing=false;
    player.src=tracks[index].url;
    player.load();playerReady=true;
    describe();
  }
  async function playCurrent(){
    if(!enabled||manualPaused)return;
    if(!playerReady)loadCurrent();
    const snapshot=serial;
    try{
      await player.play();
      if(snapshot===serial){playing=true;failures=0;describe()}
    }catch(error){
      playing=false;
      if(error?.name==='NotAllowedError')status('재생 준비됨 · 화면을 누르면 BGM이 시작됩니다.');
      else if(error?.name!=='AbortError')status('BGM 파일 로딩 실패 · 다음 트랙을 확인해 주세요.');
    }
  }
  function initialPlay(){
    if(!enabled)return;
    if(!playerReady)loadCurrent();
    void playCurrent();
  }
  function setEnabled(on){
    enabled=!!on;
    controls();
    if(enabled){manualPaused=false;initialPlay()}
    else{player.pause();playing=false;status('BGM 일시정지')}
  }
  // Temporary ducking for UR reveal; leaves the user's BGM slider untouched.
  function setBgmDucking(level=1){
    cinematicDuck=Math.max(0,Math.min(1,Number(level)||0));
    player.volume=enabled?bgmGain*cinematicDuck:0;
  }
  function next(step=1){
    if(!tracks.length)return;
    index=(index+step+tracks.length)%tracks.length;
    loadCurrent();if(enabled)void playCurrent();
  }
  player.addEventListener('ended',()=>{failures=0;next()});
  player.addEventListener('error',()=>{
    if(!enabled||!playerReady)return;
    failures++;
    if(failures>=tracks.length){player.pause();playing=false;status('재생 가능한 BGM을 찾지 못했습니다.');return}
    next();
  });
  // Autoplay may be rejected by the browser. Retry from a genuine user gesture
  // without requiring the user to open the sound menu.
  function unlockPlayback(){
    if(enabled&&!playing&&!manualPaused){
      if(!playerReady)loadCurrent();
      void player.play().then(()=>{playing=true;failures=0;describe()}).catch(()=>{});
    }
  }
  document.addEventListener('pointerdown',unlockPlayback,{capture:true});
  document.addEventListener('keydown',unlockPlayback,{capture:true});
  button.addEventListener('click',event=>{
    event.stopPropagation();panel.hidden=!panel.hidden;controls();
  });
  panel.addEventListener('click',event=>event.stopPropagation());
  document.addEventListener('pointerdown',event=>{
    if(!panel.hidden&&!panel.contains(event.target)&&event.target!==button)panel.hidden=true;
  });
  master.addEventListener('change',()=>onToggle(master.checked));
  volumeBgm.addEventListener('input',()=>{
    bgmGain=Math.max(0,Math.min(1,Number(volumeBgm.value)/100));controls();
  });
  volumeFx.addEventListener('input',()=>{
    fxGain=Math.max(0,Math.min(1,Number(volumeFx.value)/100));controls();
  });
  byId('musicPrev').addEventListener('click',()=>next(-1));
  byId('musicNext').addEventListener('click',()=>next(1));
  byId('musicPlay').addEventListener('click',()=>{
    if(!enabled){onToggle(true);return}
    if(playing){manualPaused=true;player.pause();playing=false;status('BGM 일시정지')}
    else{manualPaused=false;initialPlay()}
  });
  async function reloadTracks(){
    if(!backend)return;
    const {data,error}=await backend.from('itm_bgm_tracks').select('title,file_path,sort_order').order('sort_order').order('created_at');
    if(error){console.warn('BGM catalogue read failed',error.message);return}
    const serverTracks=(data||[]).map(row=>({
      title:row.title,
      url:row.file_path.startsWith('builtin:')?
        './assets/audio/'+row.file_path.slice('builtin:'.length):
        backend.storage.from('itm-bgm').getPublicUrl(row.file_path).data.publicUrl
    }));
    const oldUrl=tracks[index]?.url;
    tracks=serverTracks;
    const oldIndex=tracks.findIndex(track=>track.url===oldUrl);
    index=oldIndex>=0?oldIndex:0;
    if(oldIndex<0||!playing){loadCurrent();if(enabled&&tracks.length)void playCurrent()}
    else describe();
  }
  async function setBackend(client,admin=false){
    backend=client||null;controls();
    if(client)await reloadTracks();
  }
  controls();loadCurrent();void playCurrent();
  return {getSfxGain:()=>enabled?fxGain:0,setEnabled,setBgmDucking,initialPlay,next:()=>next(1),
    get trackNames(){return tracks.map(t=>t.title)},isEnabled:()=>enabled,setBackend};
}
