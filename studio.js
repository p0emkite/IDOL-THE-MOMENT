import {renderITMCard} from './card-frame.js?v=crisp-corners-20261105';
const $=id=>document.getElementById(id);
const CONFIG=window.IDOL_CONFIG||{};
const BUCKET='itm-card-media';
const VALID_MIME=['image/jpeg','image/png','image/webp'];
const RARITIES=['N','R','SR','SSR','UR'];
const state={
  client:null,admin:false,logged:false,groups:[],members:[],cards:[],series:[],packs:[],editingId:null,
  photoFile:null,fullArtFile:null,groupLogoFile:null,packFile:null,packImagePath:null,
  photoImage:null,groupImage:null,groupEditorImage:null,
  imagePath:null,fullArtPath:null,
  currentGroup:null,renderQueued:false,saving:false,previewCanvas:null,
  pictureCache:new Map()
};
let toastTimer=null;
function toast(message){
  $('studioMessage').textContent=message;
  $('studioMessage').classList.add('show');
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>$('studioMessage').classList.remove('show'),4500);
}
function setAuthState(text){$('accessState').textContent=text}
function accessControls(){
  const allowed=state.admin&&!state.saving;
  document.querySelector('.tools').inert=state.saving;
  document.querySelector('.library').inert=state.saving;
  $('saveCard').disabled=!allowed;
  $('saveGroup').disabled=!allowed;
  $('saveMember').disabled=!allowed||!$('groupPicker').value;
  $('savePack').disabled=!allowed;
  $('deletePack').disabled=!allowed||!$('packPicker').value;
  $('studioLogout').hidden=!state.logged;
  $('studioLogin').hidden=state.logged;
  if(state.admin){
    $('authHeadline').textContent='관리자 모드 활성화 ✦';
    $('authNotice').textContent='서버 카드·그룹 등록 및 공개 권한이 활성화되었습니다. 업로드 이미지와 모든 카드 정보는 별도로 저장됩니다.';
    setAuthState('관리자 접속');
  }else if(state.logged){
    $('authHeadline').textContent='관리자 권한이 필요한 계정입니다';
    $('authNotice').textContent='프레임 미리보기와 이미지 조정은 가능합니다. 서버 저장·공개는 지정된 관리자 계정에서만 가능합니다.';
    setAuthState('미리보기 모드');
  }else{
    $('authHeadline').textContent='카드 제작 체험 · 관리자 로그인';
    $('authNotice').textContent='사진과 프레임을 미리 편집할 수 있습니다. 저장·공개는 ITM 관리자 계정이 필요합니다.';
    setAuthState('편집 미리보기');
  }
}
function fileCheck(file){
  if(!file)return;
  if(!VALID_MIME.includes(file.type))throw new Error('PNG, JPG 또는 WebP 이미지만 업로드할 수 있습니다.');
  if(file.size>12*1024*1024)throw new Error('이미지는 12MB 이하로 준비해 주세요.');
}
function publicUrl(path){
  if(!path)return null;
  return state.client.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}
async function asImage(input){
  if(!input)return null;
  if(typeof input==='string'&&state.pictureCache.has(input))return state.pictureCache.get(input);
  const source=typeof input==='string'?publicUrl(input):URL.createObjectURL(input);
  if(!source)return null;
  try{
    const img=new Image();
    img.decoding='async';
    if(typeof input==='string')img.crossOrigin='anonymous';
    const loaded=new Promise((resolve,reject)=>{
      img.onload=()=>resolve(img);
      img.onerror=()=>reject(new Error('이미지 파일을 불러오지 못했습니다.'));
    });
    img.src=source;
    const result=await loaded;
    if(typeof input==='string')state.pictureCache.set(input,result);
    return result;
  }finally{if(typeof input!=='string')URL.revokeObjectURL(source)}
}
function groupLogoPath(slug){return state.groups.find(g=>g.slug===slug)?.logo_path||null}
function currentTransform(){return {
  scale:Math.min(4,Math.max(0,Number($('photoZoom').value)/100)),
  x:Number($('photoX').value)/100,
  y:Number($('photoY').value)/100
}}
function setTransform(v={}){
  const rawScale=Number(v.scale);
  $('photoZoom').value=Math.round(Math.max(0,Math.min(4,Number.isFinite(rawScale)?rawScale:1))*100);
  $('photoX').value=Math.round((Number(v.x)||0)*100);
  $('photoY').value=Math.round((Number(v.y)||0)*100);
  updateCropLabels();queuePreview();
}
function updateCropLabels(){
  $('zoomLabel').textContent=$('photoZoom').value+'%';
  $('xLabel').textContent=$('photoX').value;
  $('yLabel').textContent=$('photoY').value;
  $('logoZoomLabel').textContent=$('logoZoom').value+'%';
}
function previewData(){
  const card={
    rarity:$('cardRarity').value,
    group:$('cardGroup').value,
    name:$('cardName').value,
    edition:$('cardEdition').value,
    photo_transform:currentTransform(),logo_scale:Number($('logoZoom').value)/100
  };
  return card;
}
function paintPreview(){
  state.renderQueued=false;
  const card=previewData();
  const result=renderITMCard(card,{photo:state.photoImage,groupLogo:state.groupImage,photoTransform:card.photo_transform});
  const ctx=state.previewCanvas.getContext('2d');
  ctx.clearRect(0,0,1024,1492);
  ctx.drawImage(result,0,0,1024,1492);
  [...document.querySelectorAll('[data-rarity]')].forEach(btn=>{
    btn.classList.toggle('selected',btn.dataset.rarity===card.rarity);
  });
}
function queuePreview(){
  if(state.renderQueued)return;
  state.renderQueued=true;
  requestAnimationFrame(paintPreview);
}
async function syncLogo(){
  const slug=$('cardGroup').value;
  const path=groupLogoPath(slug);
  state.groupImage=null;queuePreview();
  if(!path)return;
  try{const img=await asImage(path);
    if($('cardGroup').value===slug){state.groupImage=img;queuePreview()}
  }catch(err){toast('그룹 로고 불러오기 실패: '+err.message)}
}
function newGroup(){
  $('groupPicker').value='';$('groupSlug').value='';$('groupSlug').readOnly=false;
  $('groupName').value='';$('groupLogo').value='';
  state.groupLogoFile=null;state.groupEditorImage=null;
  refreshMembers();
  $('groupLogoPreview').hidden=true;$('groupLogoEmpty').hidden=false;
}
async function selectGroup(){
  const slug=$('groupPicker').value;
  if(!slug){newGroup();return}
  const group=state.groups.find(x=>x.slug===slug);
  if(!group)return;
  $('groupSlug').value=group.slug;$('groupSlug').readOnly=true;
  $('groupName').value=group.name;$('groupLogo').value='';state.groupLogoFile=null;
  refreshMembers();
  const path=group.logo_path;
  $('groupLogoPreview').hidden=true;$('groupLogoEmpty').hidden=true;
  if(path){$('groupLogoPreview').src=publicUrl(path);$('groupLogoPreview').hidden=false}
  else $('groupLogoEmpty').hidden=false;
}
function memberOptions(slug){
  return state.members.filter(m=>m.group_slug===slug).map(m=>new Option(m.name,m.id));
}
function refreshCardMembers(selected=$('cardMember').value){
  const picker=$('cardMember');
  picker.replaceChildren(new Option('직접 입력',''),...memberOptions($('cardGroup').value));
  picker.value=selected||'';
  if(picker.selectedIndex<0)picker.selectedIndex=0;
}
function refreshMembers(id=''){
  const group=$('groupPicker').value;
  const picker=$('memberPicker');
  picker.replaceChildren(new Option('새 멤버 등록',''),...memberOptions(group));
  picker.value=id;
  $('memberName').value=state.members.find(m=>m.id===id)?.name||'';
  $('saveMember').disabled=!state.admin||state.saving||!group;
}
async function saveMember(event){
  event.preventDefault();
  const group_slug=$('groupPicker').value, name=$('memberName').value.trim();
  if(!state.admin||state.saving||!group_slug||!name)return;
  const id=$('memberPicker').value;
  state.saving=true;accessControls();
  try{
    const table=state.client.from('itm_members');
    const req=id?table.update({name}).eq('id',id).eq('group_slug',group_slug):table.insert({group_slug,name});
    const {data,error}=await req.select('id').single();
    if(error)throw error;
    await loadCatalog();
    refreshMembers(data.id);toast('멤버를 저장했습니다.');
  }catch(err){toast(err.code==='23505'?'이 그룹에 같은 이름의 멤버가 있습니다.':'멤버 저장 실패: '+err.message)}
  finally{state.saving=false;accessControls()}
}
function refreshSelectors(){
  const groupOptions=state.groups.map(g=>{
    const option=document.createElement('option');
    option.value=g.slug;option.textContent=g.name+' ('+g.slug+')';return option;
  });
  const previous=$('cardGroup').value;
  $('cardGroup').replaceChildren(new Option('그룹을 선택하세요',''),...groupOptions);
  $('cardGroup').value=state.groups.some(x=>x.slug===previous)?previous:'';
  const existing=$('groupPicker').value;
  $('groupPicker').replaceChildren(new Option('새 그룹 만들기',''),...state.groups.map(g=>new Option(g.name+' ('+g.slug+')',g.slug)));
  $('groupPicker').value=state.groups.some(x=>x.slug===existing)?existing:'';
}

/* Editions are scoped to their own group, and newly entered album names
   are registered when the first card of that series is saved. */
function refreshSeriesOptions(){
  const slug=$('cardGroup').value;
  $('groupSeriesList').replaceChildren(...state.series.filter(x=>x.group_slug===slug).map(x=>new Option(x.name,x.name)));
}
function renderChoiceGrid(target,items,selected,formatter){
  const box=$(target);box.replaceChildren();
  if(!items.length){box.textContent='아직 등록된 항목이 없습니다.';return}
  for(const item of items){
    const label=document.createElement('label');label.className='choice-item';
    const input=document.createElement('input');input.type='checkbox';input.value=item.key;
    input.checked=selected.has(item.key);
    const title=document.createElement('span');title.textContent=formatter(item);
    label.append(input,title);box.append(label);
  }
}
function refreshPackEditor(){
  const old=$('packPicker').value;
  $('packPicker').replaceChildren(new Option('새 팩 만들기',''),...state.packs.map(p=>new Option((p.active?'':'[비공개] ')+p.name,p.id)));
  if(state.packs.some(p=>p.id===old))$('packPicker').value=old;
  selectPack($('packPicker').value);
}
function selectPack(id){
  $('packPicker').value=id||'';
  const pack=state.packs.find(p=>p.id===id);
  state.packFile=null;state.packImagePath=pack?.image_path||null;
  $('packImage').value='';$('packName').value=pack?.name||'';
  $('packActive').checked=pack?.active??true;
  $('packImagePreview').hidden=!pack?.image_path;
  $('packImageEmpty').hidden=!!pack?.image_path;
  if(pack?.image_path)$('packImagePreview').src=publicUrl(pack.image_path);
  const groups=new Set(pack?.group_slugs||[]);
  const selectedSeries=new Set((pack?.series_filters||[]).map(f=>f.group_slug+'::'+f.name));
  renderChoiceGrid('packGroups',state.groups.map(g=>({key:g.slug,label:g.name})),groups,i=>i.label);
  renderChoiceGrid('packSeries',state.series.map(x=>({key:x.group_slug+'::'+x.name,name:x.name,group:x.group_slug})),selectedSeries,i=>i.group+' / '+i.name);
  $('deletePack').disabled=!state.admin||!id;
  accessControls();
}
function chosenInputs(id){return [...$(id).querySelectorAll('input:checked')].map(x=>x.value)}
async function savePack(event){
  event.preventDefault();
  if(!state.admin||state.saving)return toast('팩 저장은 관리자만 가능합니다.');
  const name=$('packName').value.trim(),id=$('packPicker').value;
  if(!name)return toast('팩 이름을 입력해 주세요.');
  state.saving=true;accessControls();
  try{
    const image_path=state.packFile?await uploadFile(state.packFile,'packs'):state.packImagePath;
    const groups=chosenInputs('packGroups');
    const series=chosenInputs('packSeries').map(v=>{
      const i=v.indexOf('::');return {group_slug:v.slice(0,i),name:v.slice(i+2)};
    });
    const record={name,image_path,group_slugs:groups,series_filters:series,active:$('packActive').checked,updated_at:new Date().toISOString()};
    const req=id?state.client.from('itm_packs').update(record).eq('id',id):state.client.from('itm_packs').insert(record);
    const {data,error}=await req.select('id').single();
    if(error)throw error;
    state.packFile=null;
    await loadCatalog();
    $('packPicker').value=data.id;selectPack(data.id);
    toast('팩 종류와 등장 그룹·시리즈를 저장했습니다.');
  }catch(err){toast('팩 저장 실패: '+(err?.message||err))}
  finally{state.saving=false;accessControls()}
}
async function deletePack(){
  const id=$('packPicker').value;
  if(!state.admin||!id||state.saving)return;
  if(!confirm('이 팩을 삭제하시겠습니까? 기존 카드와 도감은 유지됩니다.'))return;
  state.saving=true;accessControls();
  try{
    const {error}=await state.client.from('itm_packs').delete().eq('id',id);
    if(error)throw error;
    await loadCatalog();selectPack('');toast('팩을 삭제했습니다.');
  }catch(err){toast('팩 삭제 실패: '+(err?.message||err))}
  finally{state.saving=false;accessControls()}
}

function clearCard(){
  state.editingId=null;state.photoFile=null;state.fullArtFile=null;
  state.photoImage=null;state.imagePath=null;state.fullArtPath=null;
  $('cardName').value='';$('cardEdition').value='DEBUT COLLECTION';$('cardRarity').value='N';
  $('logoZoom').value='100';
  $('cardStatus').value='draft';$('cardPhoto').value='';$('cardFullArt').value='';
  refreshCardMembers('');
  $('cardId').value='';
  setTransform({scale:1,x:0,y:0});
  queuePreview();
}
async function loadCard(card){
  if(!card)return;
  state.editingId=card.id;state.photoFile=null;state.fullArtFile=null;
  state.imagePath=card.photo_path||null;state.fullArtPath=card.full_art_path||null;
  $('cardGroup').value=card.group_slug;refreshCardMembers(card.member_id);refreshSeriesOptions();
  $('cardName').value=card.display_name;
  $('cardEdition').value=card.edition;
  $('cardRarity').value=card.rarity;
  $('cardStatus').value=card.status;
  $('cardId').value=card.id;
  $('cardPhoto').value='';$('cardFullArt').value='';
  $('logoZoom').value=String(Math.round((card.logo_scale??1)*100));
  setTransform({scale:card.photo_scale,x:card.photo_x,y:card.photo_y});
  state.photoImage=null;queuePreview();
  await syncLogo();
  if(card.photo_path){
    try{
      const photo=await asImage(card.photo_path);
      if(state.editingId===card.id&&!state.photoFile){state.photoImage=photo;queuePreview()}
    }catch(err){toast('기존 카드 이미지 불러오기 실패: '+err.message)}
  }
  window.scrollTo({top:document.querySelector('.card-section').getBoundingClientRect().top+window.scrollY-20,behavior:'smooth'});
}
async function loadCatalog(){
  if(!state.client)return;
  const [{data:groups,error:groupError},{data:cards,error:cardError},members,series,packs]=await Promise.all([
    state.client.from('itm_groups').select('slug,name,logo_path').order('name'),
    state.client.from('itm_catalog').select('*').order('created_at',{ascending:false}),
    state.admin?state.client.from('itm_members').select('id,group_slug,name').order('name'):Promise.resolve({data:[]}),
    state.client.from('itm_series').select('id,group_slug,name').order('name'),
    state.client.from('itm_packs').select('*').order('created_at',{ascending:false})
  ]);
  if(groupError)throw groupError;
  if(cardError)throw cardError;
  if(members.error)throw members.error;
  if(series.error||packs.error)throw (series.error||packs.error);
  state.members=members.data||[];state.groups=groups||[];state.cards=cards||[];
  state.series=series.data||[];state.packs=packs.data||[];
  refreshSelectors();refreshCardMembers();refreshMembers($('memberPicker').value);
  refreshSeriesOptions();refreshPackEditor();renderLibrary();await syncLogo();
}
function renderLibrary(){
  const list=$('cardLibrary');
  const query=$('libraryQuery').value.trim().toLocaleLowerCase();
  const status=$('libraryStatus').value;
  const cards=state.cards.filter(c=>{
    const group=state.groups.find(g=>g.slug===c.group_slug);
    const member=state.members.find(m=>m.id===c.member_id);
    return (!status||c.status===status)&&[c.display_name,group?.name,c.group_slug,member?.name,c.edition].join(' ').toLocaleLowerCase().includes(query);
  });
  list.replaceChildren();$('cardCount').textContent=String(cards.length);
  if(!cards.length){
    const empty=document.createElement('p');empty.className='empty';
    empty.textContent=state.cards.length?'검색 결과가 없습니다.':'아직 등록된 카드가 없습니다. 왼쪽에서 첫 카드를 제작해 보세요.';
    list.append(empty);return;
  }
  for(const card of cards){
    const tile=document.createElement('div');tile.className='record';
    const img=document.createElement('img');
    img.alt=card.display_name+' 이미지';
    if(card.photo_path)img.src=publicUrl(card.photo_path);
    else img.src=renderITMCard({rarity:card.rarity}).toDataURL('image/png');
    img.loading='lazy';
    const info=document.createElement('div');info.className='record-info';
    const title=document.createElement('strong');title.textContent=card.display_name;
    const small=document.createElement('small');
    const group=state.groups.find(g=>g.slug===card.group_slug)?.name||card.group_slug;
    small.textContent=group+' · '+card.rarity+' · '+card.edition;
    const status=document.createElement('span');status.className='record-status '+card.status;
    status.textContent=card.status==='published'?'● 공개 중':card.status==='private'?'● 비공개':'● 임시 저장';
    const edit=document.createElement('button');edit.className='soft-btn';edit.type='button';
    edit.textContent='편집하기';edit.disabled=!state.admin;edit.onclick=()=>loadCard(card);
    info.append(title,small,status,edit);tile.append(img,info);list.append(tile);
  }
}
async function uploadFile(file,prefix){
  fileCheck(file);
  const ext=file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg';
  const path=prefix+'/'+crypto.randomUUID()+'.'+ext;
  const {error}=await state.client.storage.from(BUCKET).upload(path,file,{
    contentType:file.type,cacheControl:'31536000',upsert:false
  });
  if(error)throw error;
  return path;
}
async function saveGroup(event){
  event.preventDefault();
  if(!state.admin)return toast('관리자만 그룹을 저장할 수 있습니다.');
  const slug=$('groupSlug').value.toLowerCase().trim();
  const name=$('groupName').value.trim();
  if(!/^[a-z0-9][a-z0-9_-]{1,39}$/.test(slug)||!name)return toast('그룹 코드와 이름을 확인해 주세요.');
  if(state.saving)return;
  state.saving=true;accessControls();
  try{
    const old=state.groups.find(x=>x.slug===slug);
    const logo_path=state.groupLogoFile?await uploadFile(state.groupLogoFile,'logos'):old?.logo_path||null;
    const {error}=await state.client.from('itm_groups')
      .upsert({slug,name,logo_path,updated_at:new Date().toISOString()},{onConflict:'slug'});
    if(error)throw error;
    await loadCatalog();
    $('groupPicker').value=slug;
    $('cardGroup').value=slug;
    refreshCardMembers();await selectGroup();await syncLogo();
    toast('그룹 저장 완료! 이후 이 그룹의 카드에는 등록된 로고가 자동 적용됩니다.');
  }catch(err){toast('그룹 저장 실패: '+(err?.message||err))}
  finally{state.saving=false;accessControls()}
}
async function saveCard(event){
  event.preventDefault();
  if(!state.admin)return toast('관리자 권한이 필요합니다.');
  if(state.saving)return;
  const group_slug=$('cardGroup').value;
  const display_name=$('cardName').value.trim();
  const edition=$('cardEdition').value.trim()||'DEBUT COLLECTION';
  const status=$('cardStatus').value;
  if(!state.groups.some(g=>g.slug===group_slug)||!display_name)return toast('그룹과 카드명을 입력해 주세요.');
  if(status==='published'&&!state.photoFile&&!state.imagePath)return toast('공개 전 카드 사진을 등록해 주세요.');
  state.saving=true;accessControls();
  try{
    const {error:seriesError}=await state.client.from('itm_series').upsert({group_slug,name:edition},{onConflict:'group_slug,name'});
    if(seriesError)throw seriesError;
    const photo_path=state.photoFile?await uploadFile(state.photoFile,'photos'):state.imagePath||'';
    const full_art_path=state.fullArtFile?await uploadFile(state.fullArtFile,'special'):state.fullArtPath||null;
    const transform=currentTransform();
    const row={
      member_id:$('cardMember').value||null,group_slug,display_name,edition,rarity:$('cardRarity').value,status,
      photo_path,full_art_path,photo_scale:transform.scale,photo_x:transform.x,photo_y:transform.y,
      logo_scale:Number($('logoZoom').value)/100,
      updated_at:new Date().toISOString()
    };
    const req=state.editingId?state.client.from('itm_catalog').update(row).eq('id',state.editingId):
      state.client.from('itm_catalog').insert(row);
    const {data,error}=await req.select('id').single();
    if(error)throw error;
    state.editingId=data.id;state.photoFile=null;state.fullArtFile=null;
    state.imagePath=photo_path;state.fullArtPath=full_art_path;
    $('cardId').value=data.id;$('cardPhoto').value='';$('cardFullArt').value='';
    await loadCatalog();
    $('cardGroup').value=group_slug;refreshSeriesOptions();await syncLogo();
    toast(status==='published'?'카드 공개 완료! 등급별 준비 상태에 따라 팩·도감에 반영됩니다.':status==='private'?'비공개로 저장했습니다.':'임시 저장했습니다.');
  }catch(err){toast('카드 저장 실패: '+(err?.message||err))}
  finally{state.saving=false;accessControls()}
}
function exportPreview(){
  const a=document.createElement('a');
  const rarity=$('cardRarity').value;
  const name=($('cardName').value||'preview').replace(/[^a-zA-Z0-9가-힣_-]/g,'_').slice(0,40);
  a.download='ITM_'+rarity+'_'+name+'.png';
  a.href=state.previewCanvas.toDataURL('image/png');
  a.click();
}
function bindImageInput(input,field,fn){
  input.addEventListener('change',async()=>{
    const file=input.files?.[0];
    if(!file)return;
    try{fileCheck(file);const img=await asImage(file);if(input.files?.[0]!==file)return;fn(img,file);queuePreview()}
    catch(err){input.value='';toast(err.message)}
  });
}
function bindDrag(){
  const holder=document.querySelector('.preview-holder');
  let current=null;
  holder.addEventListener('pointerdown',e=>{
    if(!state.photoImage)return;
    current={id:e.pointerId,x:e.clientX,y:e.clientY,fromX:Number($('photoX').value),fromY:Number($('photoY').value)};
    holder.setPointerCapture(e.pointerId);
  });
  holder.addEventListener('pointermove',e=>{
    if(!current||e.pointerId!==current.id)return;
    const bounds=state.previewCanvas.getBoundingClientRect();
    const photo=state.photoImage;
    if(!photo)return;
    const scale=Math.max(bounds.width/photo.naturalWidth,bounds.height/photo.naturalHeight)*currentTransform().scale;
    const extraX=(photo.naturalWidth*scale-bounds.width)/2;
    const extraY=(photo.naturalHeight*scale-bounds.height)/2;
    const x=Math.max(-100,Math.min(100,current.fromX+(extraX>0.01?(e.clientX-current.x)/extraX*100:0)));
    const y=Math.max(-100,Math.min(100,current.fromY+(extraY>0.01?(e.clientY-current.y)/extraY*100:0)));
    $('photoX').value=Math.round(x);$('photoY').value=Math.round(y);
    updateCropLabels();queuePreview();
  });
  for(const name of ['pointerup','pointercancel'])holder.addEventListener(name,()=>{current=null});
  holder.addEventListener('wheel',event=>{
    if(!event.altKey||!state.photoImage)return;
    event.preventDefault();const target=$('photoZoom');
    target.value=String(Math.min(400,Math.max(0,Number(target.value)+(event.deltaY<0?10:-10))));
    updateCropLabels();queuePreview();
  },{passive:false});
}
async function refreshAccess(){
  try{
    const {data,error}=await state.client.auth.getSession();
    if(error)throw error;
    const user=data?.session?.user;
    state.logged=!!user&&!user.is_anonymous&&/^itm\.[a-z][a-z0-9_]{3,19}@accounts\.itm\.example$/.test(user.email||'');
    state.admin=false;
    if(state.logged){
      const permission=await state.client.rpc('itm_studio_is_admin');
      if(permission.error)throw permission.error;
      state.admin=!!permission.data;
    }
    accessControls();await loadCatalog();
  }catch(err){setAuthState('오류');toast('스튜디오 연결 오류: '+(err?.message||err))}
}
async function signIn(event){
  event.preventDefault();
  if(!state.client)return toast('서버 연결 중입니다.');
  const name=$('studioUsername').value.trim().toLowerCase();
  const password=$('studioPassword').value;
  if(!/^[a-z][a-z0-9_]{3,19}$/.test(name)||!password)return toast('유효한 ITM ID와 비밀번호를 입력해 주세요.');
  const {error}=await state.client.auth.signInWithPassword({email:'itm.'+name+'@accounts.itm.example',password});
  if(error)return toast('로그인 실패: '+error.message);
  $('studioPassword').value='';
  await refreshAccess();
}
async function signOut(){
  const {error}=await state.client.auth.signOut();
  if(error)return toast(error.message);
  await refreshAccess();
}
function bind(){
  state.previewCanvas=$('previewCanvas');
  $('studioLogin').onsubmit=signIn;
  $('studioLogout').onclick=signOut;
  $('groupForm').onsubmit=saveGroup;
  $('cardForm').onsubmit=saveCard;
  $('groupPicker').onchange=selectGroup;
  $('newGroup').onclick=newGroup;
  $('newCard').onclick=()=>{clearCard();syncLogo()};
  $('memberForm').onsubmit=saveMember;
  $('memberPicker').onchange=()=>refreshMembers($('memberPicker').value);
  $('cardGroup').onchange=()=>{refreshCardMembers('');refreshSeriesOptions();syncLogo()};
  $('cardMember').onchange=()=>{
    const member=state.members.find(m=>m.id===$('cardMember').value);
    if(member)$('cardName').value=member.name;
    queuePreview();
  };
  $('libraryStatus').onchange=renderLibrary;
  $('libraryQuery').oninput=renderLibrary;
  $('cardRarity').onchange=queuePreview;
  $('cardName').oninput=queuePreview;
  $('cardEdition').oninput=queuePreview;
  $('resetCrop').onclick=()=>setTransform({scale:1,x:0,y:0});
  ['photoZoom','photoX','photoY','logoZoom'].forEach(id=>$(id).oninput=()=>{updateCropLabels();queuePreview()});
  for(const btn of document.querySelectorAll('[data-rarity]')){
    btn.onclick=()=>{$('cardRarity').value=btn.dataset.rarity;queuePreview()};
  }
  $('exportPreview').onclick=exportPreview;
  $('refreshCards').onclick=()=>loadCatalog().then(()=>toast('목록 새로고침 완료')).catch(err=>toast(err.message));
  bindImageInput($('cardPhoto'),'photo',(img,file)=>{state.photoImage=img;state.photoFile=file});
  bindImageInput($('cardFullArt'),'full',(img,file)=>{state.fullArtFile=file});
  bindImageInput($('groupLogo'),'logo',(img,file)=>{
    state.groupLogoFile=file;state.groupEditorImage=img;
    $('groupLogoPreview').replaceWith(img);img.id='groupLogoPreview';img.alt='그룹 로고';$('groupLogoPreview').hidden=false;$('groupLogoEmpty').hidden=true;
    if($('groupSlug').value===$('cardGroup').value){state.groupImage=img;queuePreview()}
  });
  $('packForm').onsubmit=savePack;
  $('newPack').onclick=()=>selectPack('');
  $('packPicker').onchange=()=>selectPack($('packPicker').value);
  $('deletePack').onclick=deletePack;
  $('packImage').onchange=async e=>{
    const file=e.target.files?.[0];if(!file)return;
    try{
      fileCheck(file);state.packFile=file;
      // Use a fresh URL for this preview; asImage() revokes its temporary URL.
      const previewURL=URL.createObjectURL(file);
      const preview=$('packImagePreview');
      preview.onload=()=>URL.revokeObjectURL(previewURL);
      preview.onerror=()=>{URL.revokeObjectURL(previewURL);toast('팩 이미지 미리보기를 불러오지 못했습니다.')};
      preview.src=previewURL;preview.hidden=false;$('packImageEmpty').hidden=true;
    }catch(err){toast(err.message);e.target.value=''}
  };
  bindDrag();
  setTransform();queuePreview();
}
async function main(){
  bind();
  if(!CONFIG.supabaseUrl||!CONFIG.supabasePublishableKey){
    toast('ITM Supabase 설정을 확인해 주세요. 로컬 디자인 미리보기만 가능합니다.');
    setAuthState('오프라인 미리보기');return;
  }
  try{
    const mod=await import('https://esm.sh/@supabase/supabase-js@2.57.0');
    state.client=mod.createClient(CONFIG.supabaseUrl,CONFIG.supabasePublishableKey);
    await refreshAccess();
    state.client.auth.onAuthStateChange(()=>{setTimeout(refreshAccess,10)});
  }catch(err){toast('서버 연결 실패: '+err.message);setAuthState('연결 실패')}
}
main();
