/* ITM player profile, collections, missions and celebrations.
 * All monetary/account mutations run through server-authorized Supabase RPCs. */
export function createPlayerSystems({state,$,toast,refreshWallet,refreshMailbox,visibleInventory,byId,makeCardArt,assetUrl}){
  const RATINGS=['N','R','SR','SSR','UR'];
  const REWARDS={N:100,R:300,SR:500,SSR:1000,UR:3000,ALL:0};
  const names={N:'NORMAL',R:'RARE',SR:'SUPER RARE',SSR:'SPECIAL SUPER RARE',UR:'ULTRA RARE',ALL:'100% 완성'};
  let frames=[],ownedFrames=new Set(),claims=new Set(),events=[],loaded=false;
  let celebrations=[],celebrating=false,introClosed=false,profileBusy=false,activeTab='daily',pendingMailReward=false;
  const money=value=>Number(value||0).toLocaleString('ko-KR')+' M';
  const client=()=>state.supabase;
  const ownedCards=()=>[...byId.values()].filter(c=>Number(visibleInventory()[c.id]||0)>0&&c.isLive);
  const imageFor=card=>{
    if(!card)return './assets/itm-card-back.png';
    if(card.image_url)return card.image_url;
    try{return makeCardArt(card).toDataURL('image/png')}catch{return './assets/itm-card-back.png'}
  };
  async function updateProfile(){
    if(!state.playerId||!client())return;
    const {data,error}=await client().rpc('itm_get_profile');
    if(error)throw error;
    state.profile=data;
    renderProfile();
  }
  async function updateAchievements(){
    if(!state.playerId||!client())return;
    const results=await Promise.all([
      client().from('itm_achievement_claims').select('group_slug,edition,rarity,reward_m'),
      client().from('itm_profile_frames').select('id,group_slug,edition,kind,title,image_path').order('created_at'),
      client().from('itm_player_frames').select('frame_id')
    ]);
    const err=results.find(r=>r.error)?.error;if(err)throw err;
    claims=new Set((results[0].data||[]).map(c=>c.group_slug+'::'+c.edition+'::'+c.rarity));
    frames=results[1].data||[];
    ownedFrames=new Set((results[2].data||[]).map(f=>f.frame_id));
    renderProfile();renderTasks();
  }
  function drawLevel(avatarEl,levelEl,progressEl){
    const profile=state.profile;
    const xp=Number(profile?.experience||0),lv=Number(profile?.level||1);
    const floor=100*(lv-1)*(lv-1),ceiling=100*lv*lv;
    const pct=Math.max(0,Math.min(100,Math.round(100*(xp-floor)/Math.max(1,ceiling-floor))));
    avatarEl.style.setProperty('--xp-progress',pct+'%');
    levelEl.textContent='LV. '+lv;
    progressEl.style.width=pct+'%';
    $('profileExperience').textContent=xp.toLocaleString('ko-KR')+' XP · 다음 레벨까지 '+Math.max(0,ceiling-xp).toLocaleString('ko-KR')+' XP';
  }
  function decorateAvatar(){
    const profile=state.profile;
    const card=byId.get(String(profile?.avatar_card_id||''));
    const portrait=$('profileAvatarPhoto');
    portrait.src=imageFor(card);portrait.alt=card?card.name+' 프로필 사진':'기본 ITM 프로필';
    const frame=frames.find(f=>f.id===profile?.selected_frame_id&&ownedFrames.has(f.id));
    $('profileAvatar').classList.toggle('itm-profile-framed',!!frame);
    $('profileAvatarFrame').hidden=!frame?.image_path;
    if(frame?.image_path)$('profileAvatarFrame').src=assetUrl(frame.image_path);
    $('profileAvatar').classList.toggle('itm-profile-ur',frame?.kind==='ur');
    drawLevel($('profileAvatar'),$('profileLevelBadge'),$('profileXpBar'));
  }
  function renderProfile(){
    const signed=!!state.accountName&&!!state.playerId,profile=state.profile;
    $('profileHub').hidden=!signed;
    $('profileDisplayName').textContent=profile?.nickname||state.accountName||'ITM PLAYER';
    $('profileAccountId').textContent='ITM ID · @'+(state.accountName||'');
    $('accountStatus').textContent=signed?'✦ '+(profile?.nickname||state.accountName):'계정 연결 필요';
    $('loginButton').textContent=signed?'✦ '+(profile?.nickname||state.accountName):'✦ ITM ID';
    if(!signed||!profile)return;
    $('nicknameInput').value=profile.nickname;
    $('nicknameCost').textContent=Number(profile.next_rename_cost)===0?
      '다음 닉네임 변경 무료 (최초 1회)':'다음 닉네임 변경 비용 · '+money(profile.next_rename_cost);
    $('nicknameSave').textContent=Number(profile.next_rename_cost)===0?'무료로 닉네임 변경':'닉네임 변경 · '+money(profile.next_rename_cost);
    $('birthdayEditor').hidden=!!profile.birthday_month;
    $('birthdayStored').hidden=!profile.birthday_month;
    $('birthdayStored').textContent=profile.birthday_month?
      '등록된 생일: '+String(profile.birthday_month).padStart(2,'0')+'.'+String(profile.birthday_day).padStart(2,'0')+' (변경 불가)':'';
    decorateAvatar();
    renderAvatarChoices();renderFrameChoices();
  }
  function renderAvatarChoices(){
    const list=$('profileCardChoices');list.replaceChildren();
    const cards=ownedCards();
    if(!cards.length){const p=document.createElement('p');p.textContent='아직 수집한 카드가 없습니다.';p.className='itm-muted';list.append(p)}
    const makeButton=(card)=>{
      const btn=document.createElement('button');btn.type='button';btn.className='itm-profile-card-option';
      btn.classList.toggle('selected',String(state.profile?.avatar_card_id||'')===String(card?.id||''));
      const img=document.createElement('img');img.src=imageFor(card);img.alt=card?card.name:'기본 프로필';
      const label=document.createElement('span');label.textContent=card?card.group+' '+card.name+' · '+card.rarity:'기본';
      btn.append(img,label);btn.onclick=()=>selectAvatar(card?.id||null);return btn;
    };
    list.append(makeButton(null),...cards.map(makeButton));
  }
  function renderFrameChoices(){
    const list=$('profileFrameChoices');list.replaceChildren();
    const choice=(frame)=>{
      const btn=document.createElement('button');btn.type='button';btn.className='itm-profile-frame-option';
      btn.classList.toggle('selected',String(state.profile?.selected_frame_id||'')===String(frame?.id||''));
      const circ=document.createElement('div');circ.className='itm-mini-frame'+(frame?.kind==='ur'?' ur':'');
      if(frame?.image_path){const img=document.createElement('img');img.src=assetUrl(frame.image_path);img.alt='프레임';circ.append(img)}
      const text=document.createElement('span');text.textContent=frame?.title||'기본 프레임';
      btn.append(circ,text);btn.onclick=()=>selectFrame(frame?.id||null);return btn;
    };
    list.append(choice(null),...frames.filter(f=>ownedFrames.has(f.id)).map(choice));
  }
  async function selectAvatar(cardId){
    if(profileBusy)return;
    profileBusy=true;
    try{
      const {data,error}=await client().rpc('itm_set_profile_avatar',{p_card_id:cardId});
      if(error)throw error;
      state.profile=data;renderProfile();toast('프로필 사진을 변경했습니다.');
    }catch(err){toast('프로필 사진 변경 실패: '+err.message)}
    finally{profileBusy=false}
  }
  async function selectFrame(id){
    if(profileBusy)return;profileBusy=true;
    try{
      const {data,error}=await client().rpc('itm_select_profile_frame',{p_frame_id:id});
      if(error)throw error;state.profile=data;renderProfile();toast('프로필 프레임을 변경했습니다.');
    }catch(err){toast('프레임 변경 실패: '+err.message)}
    finally{profileBusy=false}
  }
  async function changeNickname(e){
    e.preventDefault();if(profileBusy)return;
    const nickname=$('nicknameInput').value.trim();
    if(!/^[가-힣A-Za-z0-9_]{2,16}$/.test(nickname))return toast('닉네임은 한글·영문·숫자·밑줄 2~16자로 입력해 주세요.');
    const cost=Number(state.profile?.next_rename_cost||0);
    if(nickname===state.profile?.nickname)return toast('현재 닉네임과 같습니다.');
    if(cost>0&&!confirm('닉네임 변경에 '+money(cost)+'가 사용됩니다. 계속하시겠습니까?'))return;
    profileBusy=true;$('nicknameSave').disabled=true;
    try{
      const {data,error}=await client().rpc('itm_change_nickname',{p_nickname:nickname});
      if(error)throw error;state.profile=data;
      await refreshWallet();renderProfile();toast('닉네임을 변경했습니다!');
    }catch(err){toast(err.message.includes('INSUFFICIENT_M')?'M이 부족합니다.':('닉네임 변경 실패: '+err.message))}
    finally{profileBusy=false;$('nicknameSave').disabled=false}
  }
  async function saveBirthday(e){
    e.preventDefault();if(profileBusy)return;
    const m=Number($('birthdayMonth').value),d=Number($('birthdayDay').value);
    const valid=m>=1&&m<=12&&d>=1&&d<=new Date(2024,m,0).getDate();
    if(!valid)return toast('월과 일을 확인해 주세요.');
    if(!confirm('생일은 최초 1회만 등록할 수 있습니다. '+m+'월 '+d+'일이 맞습니까?'))return;
    profileBusy=true;
    try{
      const {data,error}=await client().rpc('itm_set_profile_birthday',{p_month:m,p_day:d});
      if(error)throw error;state.profile=data;renderProfile();
      toast('생일을 등록했습니다. 기념일에는 우편함으로 선물이 도착합니다.');
      await checkAnniversaries();
    }catch(err){toast('생일 등록 실패: '+err.message)}
    finally{profileBusy=false}
  }
  function collectionGroups(){
    const groups=new Map();
    for(const c of byId.values()){
      if(!c.isLive)continue;
      const key=c.group_slug+'::'+c.edition;
      if(!groups.has(key))groups.set(key,{key,group_slug:c.group_slug,group:c.group,edition:c.edition,cards:[]});
      groups.get(key).cards.push(c);
    }
    return [...groups.values()].sort((a,b)=>(a.group+' '+a.edition).localeCompare(b.group+' '+b.edition,'ko'));
  }
  function renderTasks(){
    $('taskTabDaily').classList.toggle('selected',activeTab==='daily');
    $('taskTabWeekly').classList.toggle('selected',activeTab==='weekly');
    $('taskTabAchievements').classList.toggle('selected',activeTab==='achievements');
    const content=$('taskContent');content.replaceChildren();
    if(activeTab!=='achievements'){
      const empty=document.createElement('div');empty.className='itm-mission-empty';
      const heading=document.createElement('h3');heading.textContent=activeTab==='daily'?'DAILY MISSIONS':'WEEKLY MISSIONS';
      const p=document.createElement('p');p.textContent='미션 콘텐츠 준비 중 · 추후 아이돌 미니게임과 연동됩니다.';
      const badge=document.createElement('small');badge.textContent='보상 및 진행 조건은 아직 설정되지 않았습니다.';
      empty.append(heading,p,badge);content.append(empty);return;
    }
    if(!state.playerId){content.textContent='업적은 ITM ID 로그인 후 확인할 수 있습니다.';return}
    const groups=collectionGroups();
    if(!groups.length){content.textContent='공개된 컬렉션이 없습니다.';return}
    for(const group of groups){
      const details=document.createElement('details');details.className='itm-achievement-collection';
      const summary=document.createElement('summary');
      const own=group.cards.filter(c=>Number(visibleInventory()[c.id]||0)>0).length;
      summary.textContent=group.group+' · '+group.edition+'  '+own+'/'+group.cards.length+'종';
      details.append(summary);
      for(const grade of [...RATINGS,'ALL']){
        const pool=grade==='ALL'?group.cards:group.cards.filter(c=>c.rarity===grade);
        if(!pool.length)continue;
        const have=pool.filter(c=>Number(visibleInventory()[c.id]||0)>0).length;
        const key=group.key+'::'+grade,claimed=claims.has(key);
        const item=document.createElement('div');item.className='itm-achievement-row'+(claimed?' completed':'');
        const title=document.createElement('span');title.textContent=(grade==='ALL'?'컬렉션 전체':grade+' 등급 전체')+' 수집 · '+have+'/'+pool.length;
        const reward=document.createElement('strong');
        reward.textContent=(grade==='ALL'?'프로필 프레임':money(REWARDS[grade])+(grade==='UR'?' + UR 프레임':''));
        const status=document.createElement('small');status.textContent=claimed?'✓ 달성 완료':have===pool.length?'보상 반영 중':'미달성';
        item.append(title,reward,status);details.append(item);
      }
      content.append(details);
    }
  }
  async function checkAnniversaries(){
    if(!state.playerId||!client())return;
    const {data,error}=await client().rpc('itm_check_anniversaries');
    if(error)throw error;
    if(Array.isArray(data)&&data.length){celebrations.push(...data);await refreshMailbox();showNextCelebration()}
  }
  function showNextCelebration(){
    if(celebrating||!introClosed||!celebrations.length||$('accountOverlay').classList.contains('active'))return;
    const event=celebrations.shift();celebrating=true;
    if(Number(event.reward_m)>0)pendingMailReward=true;
    $('anniversaryTitle').textContent=event.greeting||event.title;
    $('anniversaryMessage').textContent=event.message||'빛나는 순간을 축하합니다!';
    $('anniversaryReward').textContent=money(event.reward_m)+' · 우편함에서 수령';
    const img=$('anniversaryImage');img.hidden=!event.image_path;
    if(event.image_path)img.src=assetUrl(event.image_path);
    $('anniversaryOverlay').hidden=false;
    document.body.classList.add('itm-anniversary-active');
    if(!matchMedia('(prefers-reduced-motion:reduce)').matches){
      $('anniversaryOverlay').classList.remove('itm-party-animate');void $('anniversaryOverlay').offsetWidth;
      $('anniversaryOverlay').classList.add('itm-party-animate');
    }
  }
  function closeCelebration(){
    $('anniversaryOverlay').hidden=true;document.body.classList.remove('itm-anniversary-active');
    celebrating=false;showNextCelebration();
    if(!celebrating&&pendingMailReward){pendingMailReward=false;$('mailOpen').click()}
  }
  async function afterLogin(){
    if(!state.playerId)return;
    try{
      await updateProfile();
      const {error}=await client().rpc('itm_sync_collection_rewards');
      if(error)throw error;
      await Promise.all([updateProfile(),updateAchievements(),refreshWallet()]);
      await checkAnniversaries();loaded=true;
    }catch(err){console.warn('ITM profile/rewards sync',err);toast('프로필 동기화 오류: '+err.message)}
  }
  async function afterDraw(){
    if(!state.playerId)return;
    try{await Promise.all([updateProfile(),updateAchievements(),refreshWallet()])}
    catch(err){console.warn('Profile XP refresh',err)}
  }
  function afterLogout(){
    state.profile=null;frames=[];ownedFrames=new Set();claims=new Set();celebrations=[];loaded=false;pendingMailReward=false;
    renderProfile();renderTasks();
  }
  function bind(){
    $('nicknameForm').onsubmit=changeNickname;
    $('birthdayForm').onsubmit=saveBirthday;
    $('taskOpen').onclick=()=>{activeTab='daily';renderTasks();$('taskOverlay').classList.add('active');$('taskOverlay').setAttribute('aria-hidden','false')};
    $('taskClose').onclick=()=>{$('taskOverlay').classList.remove('active');$('taskOverlay').setAttribute('aria-hidden','true')};
    $('taskOverlay').addEventListener('click',e=>{if(e.target===$('taskOverlay'))$('taskClose').click()});
    for(const [key,id] of [['daily','taskTabDaily'],['weekly','taskTabWeekly'],['achievements','taskTabAchievements']]){
      $(id).onclick=()=>{activeTab=key;renderTasks()};
    }
    $('anniversaryClose').onclick=closeCelebration;
    $('anniversaryOverlay').addEventListener('click',e=>{if(e.target===$('anniversaryOverlay'))closeCelebration()});
    document.addEventListener('keydown',e=>{if(e.key==='Escape'){
      if(!$('anniversaryOverlay').hidden){closeCelebration();return}
      if($('taskOverlay').classList.contains('active'))$('taskClose').click();
    }});
    renderTasks();
  }
  bind();
  return {afterLogin,afterDraw,afterLogout,renderProfile,renderTasks,onIntroClosed(){introClosed=true;showNextCelebration()},onAccountClose:showNextCelebration};
}
