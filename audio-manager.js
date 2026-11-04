/* ITM sound system — independent SFX/BGM gain, ordered 3-track playlist.
 * Uses same-origin MP3s when published; a local IndexedDB library is a
 * fallback for sessions before those files are published to GitHub Pages.
 * Audio playback starts only after an explicit user gesture.
 */
export function mountAudioPanel({onToggle,initialEnabled=false}) {
  const byId=id=>document.getElementById(id);
  const panel=byId('soundPanel'),button=byId('audioToggle');
  const volumeBgm=byId('bgmVolume'),volumeFx=byId('sfxVolume');
  const master=byId('soundMaster'),caption=byId('musicTrackInfo');
  const fileInput=byId('musicFiles'),fileHint=byId('musicFileHint');
  const trackNames=['Afterglow Arcade','Chrome Rush','Sugar Parade'];
  const urls=[
    './assets/audio/1_ITM_Afterglow_Arcade_Lobby_BGM.mp3',
    './assets/audio/2_ITM_Chrome_Rush_Track03_No_Lead.mp3',
    './assets/audio/3_ITM_Sugar_Parade_Track04_No_Lead.mp3'
  ];
  const read=(k,fallback)=>{try{return localStorage.getItem(k)??fallback}catch{return fallback}};
  const save=(k,v)=>{try{localStorage.setItem(k,String(v))}catch{}};
  let enabled=!!initialEnabled;
  let bgmGain=Math.max(0,Math.min(1,Number(read('itm-bgm-volume','0.32'))));
  let fxGain=Math.max(0,Math.min(1,Number(read('itm-sfx-volume','0.62'))));
  let index=0,playing=false,serial=0,failures=0,currentBlobURL=null;
  const player=new Audio();
  player.preload='none';player.loop=false;
  player.volume=enabled?bgmGain:0;
  let database=null;
  function openDB() {
    if(database)return database;
    if(!('indexedDB' in window))return Promise.resolve(null);
    database=new Promise(resolve=>{
      try{
        const req=indexedDB.open('itm-user-audio-v1',1);
        req.onupgradeneeded=()=>{
          if(!req.result.objectStoreNames.contains('tracks'))req.result.createObjectStore('tracks');
        };
        req.onsuccess=()=>resolve(req.result);
        req.onerror=()=>resolve(null);
      }catch{resolve(null)}
    });
    return database;
  }
  async function storedTrack(idx){
    const db=await openDB();if(!db)return null;
    return new Promise(resolve=>{
      try{
        const tx=db.transaction('tracks','readonly');
        const req=tx.objectStore('tracks').get(idx);
        req.onsuccess=()=>resolve(req.result||null);
        req.onerror=()=>resolve(null);
      }catch{resolve(null)}
    });
  }
  async function saveTrack(idx,file){
    const db=await openDB();if(!db)throw Error('브라우저에 음악을 저장할 수 없습니다.');
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('tracks','readwrite');
      tx.objectStore('tracks').put(file,idx);
      tx.oncomplete=resolve;
      tx.onerror=()=>reject(Error('브라우저에 음악을 저장하지 못했습니다.'));
    });
  }
  function status(message){
    if(caption)caption.textContent=message;
  }
  function volume(){
    player.volume=enabled?bgmGain:0;
    if(master)master.checked=enabled;
    if(volumeBgm)volumeBgm.value=String(Math.round(bgmGain*100));
    if(volumeFx)volumeFx.value=String(Math.round(fxGain*100));
    byId('bgmValue').textContent=Math.round(bgmGain*100)+'%';
    byId('sfxValue').textContent=Math.round(fxGain*100)+'%';
    button.setAttribute('aria-expanded',String(!panel.hidden));
  }
  async function loadCurrent(){
    const attempt=++serial;
    const oldBlobURL=currentBlobURL;currentBlobURL=null;
    player.pause();
    player.removeAttribute('src');
    if(oldBlobURL)URL.revokeObjectURL(oldBlobURL);
    const blob=await storedTrack(index);
    if(attempt!==serial)return false;
    if(blob instanceof Blob){
      currentBlobURL=URL.createObjectURL(blob);
      player.src=currentBlobURL;
      if(fileHint)fileHint.textContent='음악 파일이 이 브라우저에 저장돼 있습니다.';
    }else{
      player.src=urls[index];
    }
    player.load();
    status('♪ '+(index+1)+'/3 · '+trackNames[index]);
    return true;
  }
  async function playCurrent(){
    if(!enabled)return;
    const mySerial=serial;
    try{
      await player.play();
      if(mySerial!==serial)return;
      playing=true;failures=0;
    }catch(error){
      playing=false;
      if(error?.name==='NotAllowedError'){
        status('음악 재생 버튼을 눌러 주세요.');
      }else if(!error||error.name!=='AbortError'){
        status('음원 로딩 중 · 음악 파일을 연결해 주세요.');
      }
    }
  }
  async function next(manual=false){
    if(manual)failures=0;
    else failures++;
    if(failures>=3){
      player.pause();playing=false;
      status('BGM 3곡 파일이 없습니다 · 아래에서 파일을 연결해 주세요.');
      if(fileHint)fileHint.textContent='MP3 3곡을 한 번만 선택하면 이 브라우저에 보관됩니다.';
      return;
    }
    index=(index+1)%3;
    const loaded=await loadCurrent();
    if(loaded&&enabled)await playCurrent();
  }
  player.addEventListener('ended',()=>{failures=0;next(true)});
  player.addEventListener('error',()=>{
    if(enabled && player.error?.code!==1)next(false);
  });
  function setEnabled(on){
    enabled=!!on;volume();
    if(!enabled){player.pause();playing=false;status('BGM 일시정지');}
    else if(!player.getAttribute('src')){
      loadCurrent().then(()=>playCurrent());
    }else playCurrent();
  }
  async function initialPlay(){
    if(!enabled)return;
    if(!player.getAttribute('src'))await loadCurrent();
    await playCurrent();
  }
  button.addEventListener('click',event=>{
    event.stopPropagation();
    panel.hidden=!panel.hidden;
    volume();
  });
  panel.addEventListener('click',event=>event.stopPropagation());
  document.addEventListener('pointerdown',event=>{
    if(!panel.hidden && !panel.contains(event.target) && event.target!==button)panel.hidden=true;
  });
  master.addEventListener('change',()=>{
    onToggle(!!master.checked);
    initialPlay();
  });
  volumeBgm.addEventListener('input',event=>{
    bgmGain=Math.max(0,Math.min(1,Number(event.target.value)/100));
    save('itm-bgm-volume',bgmGain);
    volume();
  });
  volumeFx.addEventListener('input',event=>{
    fxGain=Math.max(0,Math.min(1,Number(event.target.value)/100));
    save('itm-sfx-volume',fxGain);
    volume();
  });
  byId('musicPrev').addEventListener('click',()=>{index=(index+1)%3;next(true)});
  byId('musicNext').addEventListener('click',()=>next(true));
  byId('musicPlay').addEventListener('click',()=>{
    onToggle(!enabled);
    if(!enabled)player.pause();
    else initialPlay();
  });
  fileInput.addEventListener('change',async event=>{
    const files=[...(event.target.files||[])];
    let imported=0;
    for(const file of files){
      const match=file.name.match(/^([123])[_\s.-]/);
      if(!match || !/\.mp3$/i.test(file.name))continue;
      try{await saveTrack(Number(match[1])-1,file);imported++}catch(err){status(err.message||'음악 저장 오류')}
    }
    if(imported){
      failures=0;index=0;
      status('MP3 '+imported+'곡 연결 완료 · 1번 곡부터 순서대로 재생');
      fileHint.textContent='선택한 음악은 이 브라우저에 저장되며 다른 기기와 동기화되지는 않습니다.';
      await loadCurrent();
      if(enabled)await playCurrent();
    }else if(files.length){
      status('MP3 이름은 1_, 2_, 3_ 으로 시작해야 합니다.');
    }
    fileInput.value='';
  });
  // Restore previous settings; browsers may require a click before playback.
  volume();
  status('♪ 1/3 · '+trackNames[0]);
  return {
    getSfxGain:()=>enabled?fxGain:0,
    setEnabled,
    initialPlay,
    next:()=>next(true),
    trackNames,
    isEnabled:()=>enabled
  };
}
