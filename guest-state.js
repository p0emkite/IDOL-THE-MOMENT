/* Browser-only guest progression. Never trusted for account-based balances.
 * Existing guest card inventory remains in itm-live-card-inventory-v1. */
const SAVE_KEY='itm-guest-save-v2';
export const GUEST_ACHIEVEMENT_REWARDS=Object.freeze({N:100,R:300,SR:500,SSR:1000,UR:3000,ALL:0});
export const GUEST_ACHIEVEMENT_XP=Object.freeze({N:50,R:75,SR:125,SSR:200,UR:300,ALL:500});
export const guestFrameKey=(group,edition,kind)=>[group,edition,kind].join('::');
export const guestLevel=xp=>1+Math.floor(Math.sqrt(Math.max(0,Number(xp)||0)/100));
export function freshGuestSave(){
  return {
    version:2,balance:0,
    mail:[{
      id:'guest-welcome-v1',subject:'ITM에 오신 것을 환영합니다! ✦',
      message:'게스트 플레이를 시작하셨습니다. 브라우저에만 보관되는 50회 뽑기 선물입니다.',
      reward_m:5000,created_at:new Date().toISOString(),read_at:null,claimed_at:null
    }],
    profile:{nickname:'GUEST',avatar_card_id:null,avatar_zoom:1,avatar_x:0,avatar_y:0,
      selected_frame_id:null,birthday_month:null,birthday_day:null,experience:0,level:1},
    claims:[],unlockedFrames:[],awards:[]
  };
}
export function readGuestSave(){
  try{
    const text=localStorage.getItem(SAVE_KEY);
    if(!text)return freshGuestSave();
    const input=JSON.parse(text);
    if(!input||input.version!==2||!Array.isArray(input.mail))return freshGuestSave();
    return {
      version:2,balance:Math.max(0,Number(input.balance)||0),
      mail:input.mail.filter(v=>v&&typeof v.id==='string').slice(0,500),
      profile:{...freshGuestSave().profile,...(input.profile&&typeof input.profile==='object'?input.profile:{})},
      claims:Array.isArray(input.claims)?input.claims.filter(v=>typeof v==='string'):[],
      unlockedFrames:Array.isArray(input.unlockedFrames)?input.unlockedFrames.filter(v=>typeof v==='string'):[],
      awards:Array.isArray(input.awards)?input.awards.filter(v=>typeof v==='string'):[]
    };
  }catch(err){console.warn('Guest save could not be read',err);return freshGuestSave()}
}
export function writeGuestSave(data){
  try{localStorage.setItem(SAVE_KEY,JSON.stringify(data));return true}
  catch(err){console.warn('Guest save could not be written',err);return false}
}
export function grantGuestMail(save,mailId){
  const mail=save.mail.find(m=>m.id===mailId);
  if(!mail||mail.claimed_at)return false;
  mail.claimed_at=new Date().toISOString();
  mail.read_at ||=mail.claimed_at;
  save.balance+=Math.max(0,Number(mail.reward_m)||0);
  return true;
}
export function grantGuestDraw(save,count,cards,before,after,catalog){
  const price=count===11?1000:count*100;
  if(save.balance<price)throw Error('INSUFFICIENT_M');
  save.balance-=price;
  const known=new Set(Object.entries(before).filter(([,v])=>Number(v)>0).map(([id])=>id));
  let xp=0;
  for(const card of cards){
    xp+=10;
    if(!known.has(String(card.id))){xp+=40;known.add(String(card.id))}
  }
  save.profile.experience=Math.min(1000000000,(Number(save.profile.experience)||0)+xp);
  save.profile.level=guestLevel(save.profile.experience);
  const rewards=syncGuestAchievements(save,after,catalog);
  return {xp,rewards};
}
export function syncGuestAchievements(save,inventory,catalog){
  const seen=new Set(save.claims);
  const frameSet=new Set(save.unlockedFrames);
  const collections=new Map();
  for(const card of catalog){
    if(!card?.isLive)continue;
    const key=card.group_slug+'::'+card.edition;
    if(!collections.has(key))collections.set(key,[]);
    collections.get(key).push(card);
  }
  const earned=[];
  for(const [key,cards] of collections){
    const sep=key.indexOf('::'),group=key.slice(0,sep),edition=key.slice(sep+2);
    for(const grade of ['N','R','SR','SSR','UR','ALL']){
      const target=grade==='ALL'?cards:cards.filter(c=>c.rarity===grade);
      if(!target.length||target.some(c=>!(Number(inventory[c.id])>0)))continue;
      const claim=key+'::'+grade;
      if(!seen.has(claim)){
        seen.add(claim);save.claims.push(claim);
        save.balance+=GUEST_ACHIEVEMENT_REWARDS[grade]||0;
        save.profile.experience=Math.min(1000000000,save.profile.experience+GUEST_ACHIEVEMENT_XP[grade]);
        earned.push(claim);
      }
      if(grade==='UR'||grade==='ALL'){
        const frame=guestFrameKey(group,edition,grade==='UR'?'ur':'collection');
        if(!frameSet.has(frame)){frameSet.add(frame);save.unlockedFrames.push(frame)}
      }
    }
  }
  save.profile.level=guestLevel(save.profile.experience);
  return earned;
}
function seoulCalendarParts(now){
  const values=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Seoul',
    year:'numeric',month:'numeric',day:'numeric'}).formatToParts(now);
  const part=type=>Number(values.find(p=>p.type===type)?.value)||0;
  return {year:part('year'),month:part('month'),day:part('day')};
}
export function awardGuestAnniversaries(save,events,now=new Date()){
  const today=seoulCalendarParts(now);
  const issued=new Set(save.awards);
  const celebrations=[];
  for(const event of events){
    if(!event.active)continue;
    const target=event.kind==='birthday'
      ?Number(save.profile.birthday_month)===today.month&&Number(save.profile.birthday_day)===today.day
      :Number(event.month)===today.month&&Number(event.day)===today.day;
    if(!target)continue;
    const key=event.id+':'+today.year;
    if(issued.has(key))continue;
    issued.add(key);save.awards.push(key);
    save.mail.unshift({
      id:'guest-event:'+key,subject:event.title+' ✦',
      message:(event.message||'')+'\n기념일을 축하합니다. 선물을 수령해 주세요.',
      reward_m:Math.max(0,Number(event.reward_m)||0),
      created_at:now.toISOString(),read_at:null,claimed_at:null
    });
    celebrations.push({
      ...event,greeting:String(event.greeting||'HAPPY ANNIVERSARY, {nickname}!')
        .replaceAll('{nickname}','GUEST')
    });
  }
  return celebrations;
}
