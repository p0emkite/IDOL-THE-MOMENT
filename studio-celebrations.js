/* Studio-only authoring of anniversary celebrations and collectible portrait frames. */
export function createStudioCelebrations({state,$,toast,publicUrl,fileCheck,uploadFile}){
 let events=[],frames=[],eventId='',frameId='',eventImagePath=null,frameImagePath=null,busy=false;
 const client=()=>state.client;
 const canEdit=()=>state.admin&&!busy;
 function permission(){
   for(const id of ['eventSave','eventDelete','eventNew','eventImage','eventClearImage',
     'frameSave','frameDelete','frameNew','frameImage','frameClearImage']){
     $(id).disabled=!canEdit();
   }
   $('eventDelete').disabled=!canEdit()||!eventId;
   $('frameDelete').disabled=!canEdit()||!frameId;
 }
 function changedKind(){
   const birthday=$('eventKind').value==='birthday';
   $('eventDateFields').hidden=birthday;
   $('eventMonth').required=!birthday;
   $('eventDay').required=!birthday;
 }
 function preview(id,path,emptyId){
   $(id).hidden=!path;$(emptyId).hidden=!!path;
   if(path)$(id).src=publicUrl(path);
 }
 function showEvent(id=''){
   eventId=id;
   const ev=events.find(e=>e.id===id);
   $('eventPicker').value=id;
   $('eventKind').value=ev?.kind||'global';
   $('eventKind').disabled=!!ev&&ev.kind==='birthday'; // birthday is the single global template
   $('eventTitle').value=ev?.title||'';
   $('eventGreeting').value=ev?.greeting||'HAPPY ANNIVERSARY, {nickname}!';
   $('eventMessage').value=ev?.message||'';
   $('eventMonth').value=ev?.month||'';
   $('eventDay').value=ev?.day||'';
   $('eventReward').value=String(ev?.reward_m??1000);
   $('eventActive').checked=ev?.active??true;
   eventImagePath=ev?.image_path||null;
   $('eventImage').value='';$('eventClearImage').checked=false;
   preview('eventImagePreview',eventImagePath,'eventImageEmpty');
   changedKind();permission();
 }
 function frameSources(){
   const series=new Map();
   for(const card of state.cards){
     const group=state.groups.find(g=>g.slug===card.group_slug)?.name||card.group_slug;
     const key=card.group_slug+'::'+card.edition;
     if(!series.has(key))series.set(key,{group_slug:card.group_slug,edition:card.edition,title:group+' · '+card.edition});
   }
   for(const s of state.series){
     const key=s.group_slug+'::'+s.name;
     const group=state.groups.find(g=>g.slug===s.group_slug)?.name||s.group_slug;
     if(!series.has(key))series.set(key,{group_slug:s.group_slug,edition:s.name,title:group+' · '+s.name});
   }
   return [...series.entries()].sort((a,b)=>a[1].title.localeCompare(b[1].title,'ko'));
 }
 function showFrame(id=''){
   frameId=id;
   const f=frames.find(v=>v.id===id);
   $('framePicker').value=id;
   $('frameCollection').value=f?f.group_slug+'::'+f.edition:'';
   $('frameKind').value=f?.kind||'collection';
   $('frameTitle').value=f?.title||'';
   frameImagePath=f?.image_path||null;
   $('frameImage').value='';$('frameClearImage').checked=false;
   preview('frameImagePreview',frameImagePath,'frameImageEmpty');permission();
 }
 async function load(){
   if(!client())return;
   const [ev,fr]=await Promise.all([
     client().from('itm_anniversaries').select('*').order('kind').order('title'),
     client().from('itm_profile_frames').select('*').order('group_slug').order('edition')
   ]);
   if(ev.error||fr.error){toast('기념일/프레임 목록 오류: '+(ev.error||fr.error).message);return}
   events=ev.data||[];frames=fr.data||[];
   $('eventPicker').replaceChildren(new Option('＋ 신규 기념일 만들기',''),...events.map(e=>
     new Option((e.kind==='birthday'?'[생일] ':'')+(e.active?'':'[비공개] ')+e.title,e.id)));
   $('framePicker').replaceChildren(new Option('＋ 새 프레임 등록',''),...frames.map(f=>
     new Option((f.kind==='ur'?'[UR] ':'[100%] ')+f.title,f.id)));
   $('frameCollection').replaceChildren(new Option('컬렉션을 선택해 주세요',''),
     ...frameSources().map(([k,v])=>new Option(v.title,k)));
   showEvent(events.some(e=>e.id===eventId)?eventId:'');
   showFrame(frames.some(f=>f.id===frameId)?frameId:'');
   $('eventCount').textContent='등록된 기념일 '+events.length+'건';
   $('frameCount').textContent='등록된 프로필 프레임 '+frames.length+'개';
   permission();
 }
 async function saveEvent(e){
   e.preventDefault();if(!canEdit())return toast('관리자만 기념일을 저장할 수 있습니다.');
   const kind=$('eventKind').value,month=kind==='birthday'?null:Number($('eventMonth').value);
   const day=kind==='birthday'?null:Number($('eventDay').value);
   if(kind==='global'&&!(month>=1&&month<=12&&day>=1&&day<=new Date(2024,month,0).getDate()))
     return toast('유효한 기념일 날짜를 입력해 주세요.');
   const reward=Number($('eventReward').value);
   if(!Number.isSafeInteger(reward)||reward<0||reward>100000000)return toast('M 보상은 0~1억 사이 정수로 입력해 주세요.');
   busy=true;permission();
   try{
     const file=$('eventImage').files?.[0];if(file)fileCheck(file);
     const image_path=$('eventClearImage').checked?null:file?await uploadFile(file,'anniversaries'):eventImagePath;
     const record={kind,title:$('eventTitle').value.trim(),greeting:$('eventGreeting').value.trim(),
       message:$('eventMessage').value,month,day,reward_m:reward,image_path,
       active:$('eventActive').checked,updated_at:new Date().toISOString()};
     if(!record.title||!record.greeting)throw Error('제목과 축하 문구를 입력해 주세요.');
     const result=eventId?
       client().from('itm_anniversaries').update(record).eq('id',eventId).select('id').single():
       client().from('itm_anniversaries').insert(record).select('id').single();
     const {data,error}=await result;if(error)throw error;
     eventId=data.id;await load();toast('기념일 설정을 저장했습니다.');
   }catch(err){toast('저장 실패: '+(err?.message||err))}
   finally{busy=false;permission()}
 }
 async function deleteEvent(){
   if(!canEdit()||!eventId)return;
   if(!confirm('해당 기념일을 삭제하시겠습니까? 이미 지급된 우편은 유지됩니다.'))return;
   busy=true;permission();
   try{
     const {error}=await client().from('itm_anniversaries').delete().eq('id',eventId);
     if(error)throw error;eventId='';await load();toast('기념일을 삭제했습니다.');
   }catch(err){toast('삭제 실패: '+err.message)}
   finally{busy=false;permission()}
 }
 async function saveFrame(e){
   e.preventDefault();if(!canEdit())return toast('관리자만 프레임을 저장할 수 있습니다.');
   const parts=$('frameCollection').value.split('::');
   if(parts.length!==2||!parts[0]||!parts[1])return toast('컬렉션을 선택해 주세요.');
   busy=true;permission();
   try{
     const file=$('frameImage').files?.[0];if(file)fileCheck(file);
     const image_path=$('frameClearImage').checked?null:file?await uploadFile(file,'profile-frames'):frameImagePath;
     const record={group_slug:parts[0],edition:parts[1],kind:$('frameKind').value,
       title:$('frameTitle').value.trim()||parts[0]+' · '+parts[1],image_path};
     const result=frameId?
       client().from('itm_profile_frames').update(record).eq('id',frameId).select('id').single():
       client().from('itm_profile_frames').insert(record).select('id').single();
     const {data,error}=await result;if(error)throw error;
     frameId=data.id;await load();toast('프로필 프레임을 저장했습니다.');
   }catch(err){toast('프레임 저장 실패: '+(err?.message||err))}
   finally{busy=false;permission()}
 }
 async function deleteFrame(){
   if(!canEdit()||!frameId)return;
   if(!confirm('프레임을 삭제하면 보유자의 해당 장착 프레임이 해제됩니다. 삭제하시겠습니까?'))return;
   busy=true;permission();
   try{
     const {error}=await client().from('itm_profile_frames').delete().eq('id',frameId);
     if(error)throw error;frameId='';await load();toast('프레임을 삭제했습니다.');
   }catch(err){toast('프레임 삭제 실패: '+err.message)}
   finally{busy=false;permission()}
 }
 function bind(){
   $('eventForm').onsubmit=saveEvent;$('eventPicker').onchange=()=>showEvent($('eventPicker').value);
   $('eventNew').onclick=()=>showEvent('');$('eventDelete').onclick=deleteEvent;
   $('eventKind').onchange=changedKind;
   $('frameForm').onsubmit=saveFrame;$('framePicker').onchange=()=>showFrame($('framePicker').value);
   $('frameNew').onclick=()=>showFrame('');$('frameDelete').onclick=deleteFrame;
   $('studioExtrasRefresh').onclick=load;
   $('eventImage').onchange=async e=>{
     const file=e.target.files?.[0];if(!file)return;
     try{fileCheck(file);const u=URL.createObjectURL(file);$('eventImagePreview').onload=()=>URL.revokeObjectURL(u);$('eventImagePreview').src=u;$('eventImagePreview').hidden=false;$('eventImageEmpty').hidden=true}
     catch(err){toast(err.message);e.target.value=''}
   };
   $('frameImage').onchange=async e=>{
     const file=e.target.files?.[0];if(!file)return;
     try{fileCheck(file);const u=URL.createObjectURL(file);$('frameImagePreview').onload=()=>URL.revokeObjectURL(u);$('frameImagePreview').src=u;$('frameImagePreview').hidden=false;$('frameImageEmpty').hidden=true}
     catch(err){toast(err.message);e.target.value=''}
   };
   permission();
 }
 return {bind,load,permission};
}
