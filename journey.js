/* ITM Journey — seven-day attendance, missions and collectible milestones.
 * Registered accounts use the authoritative Supabase RPCs; guests use browser-only saves. */
const TIERS=[1,3,5,11];
const WEEKLY_REWARDS=[900,700,500,900,700,500,100];
const WEEKLY_TICKETS=[1,3,5,1,3,5,11];
const RULES=[
 ['day_visit','daily','daily','오늘의 방문','당일 첫 접속',1,60,0,10],
 ['day_archive','daily','daily','추억 보관함','MY COLLECTION 1회 열기',1,40,0,20],
 ['day_draw','daily','daily','오늘의 한 장','카드 1장 이상 획득',1,50,0,30],
 ['day_view','daily','daily','소중한 순간','보유 카드 확대해서 감상하기',1,20,0,40],
 ['day_clear','daily','daily','DAILY ALL CLEAR','일일 미션 4개 완료',4,30,0,50],
 ['week_visit3','weekly','weekly','꾸준한 방문자','일주일 중 3일 방문',3,150,0,10],
 ['week_draw10','weekly','weekly','순간의 수집가','일주일에 카드 10장 획득',10,200,0,20],
 ['week_archive3','weekly','weekly','도감 탐험가','서로 다른 3일에 도감 방문',3,100,0,30],
 ['week_daily12','weekly','weekly','미션 전문가','일일 기본 미션 12개 완료',12,100,0,40],
 ['week_clear','weekly','weekly','WEEKLY ALL CLEAR','주간 미션 4개 완료',4,250,0,50],
 ['pulls_1','achievement','journey','첫 번째 순간','카드 1장 보유',1,20,20,10],
 ['pulls_10','achievement','journey','모으기 시작','누적 보유 카드 10장',10,80,50,20],
 ['pulls_50','achievement','journey','빛나는 서랍','누적 보유 카드 50장',50,200,100,30],
 ['pulls_200','achievement','journey','추억의 수호자','누적 보유 카드 200장',200,500,250,40],
 ['pulls_1000','achievement','journey','천 개의 순간','누적 보유 카드 1,000장',1000,1000,600,50],
 ['unique_5','achievement','archive','도감의 시작','서로 다른 카드 5종 수집',5,50,30,10],
 ['unique_15','achievement','archive','색다른 순간들','서로 다른 카드 15종 수집',15,150,75,20],
 ['unique_30','achievement','archive','컬렉션 탐험가','서로 다른 카드 30종 수집',30,300,150,30],
 ['unique_50','achievement','archive','도감의 달인','서로 다른 카드 50종 수집',50,500,250,40],
 ['first_sr','achievement','special','첫 번째 SR','SR 카드 1종 수집',1,50,50,10],
 ['first_ssr','achievement','special','첫 번째 SSR','SSR 카드 1종 수집',1,100,75,20],
 ['first_ur','achievement','special','첫 번째 UR','UR 카드 1종 수집',1,200,125,30],
 ['visits_7','achievement','special','일곱 번의 만남','서로 다른 7일 접속',7,120,70,40],
 ['visits_30','achievement','special','함께한 한 달','서로 다른 30일 접속',30,500,200,50],
 ['tasks_10','achievement','special','미션 도전자','기본 미션 10개 완료',10,100,60,60],
 ['tasks_50','achievement','special','꾸준한 수집가','기본 미션 50개 완료',50,400,180,70],
 ['tasks_200','achievement','special','THE MOMENT MASTER','기본 미션 200개 완료',200,1000,500,80]
].map(([key,cadence,category,title,description,target,reward_m,reward_xp,sort_order])=>({
 key,cadence,category,title,description,target,reward_m,reward_xp,sort_order
}));
const DAY_KEYS=['day_visit','day_archive','day_draw','day_view'];
const WEEK_KEYS=['week_visit3','week_draw10','week_archive3','week_daily12'];
const cash=n=>Number(n||0).toLocaleString('ko-KR')+' M';
const node=(tag,cls,text)=>{
 const el=document.createElement(tag);
 if(cls)el.className=cls;
 if(text!==undefined)el.textContent=text;
 return el;
};
const dateKST=()=>{
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Seoul',
   year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const p=k=>parts.find(x=>x.type===k).value;
 return p('year')+'-'+p('month')+'-'+p('day');
};
const weekOf=day=>{
 const d=new Date(day+'T12:00:00Z');
 d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));
 return d.toISOString().slice(0,10);
};
const clamp=(v,max)=>Math.min(Math.max(0,v),max);
const isInWeek=(day,week)=>day>=week && day<new Date(Date.parse(week+'T00:00:00Z')+604800000).toISOString().slice(0,10);
const shortPack=size=>size===11?'10+1회':size+'회';
const baseJourney=()=>({checkins:[],events:[],claims:[],achievements:[],tickets:{1:0,3:0,5:0,11:0}});
const safeJourney=data=>{
 if(!data.journey||typeof data.journey!=='object')data.journey=baseJourney();
 const j=data.journey;
 for(const k of ['checkins','events','claims','achievements'])if(!Array.isArray(j[k]))j[k]=[];
 if(!j.tickets||typeof j.tickets!=='object')j.tickets={1:0,3:0,5:0,11:0};
 for(const size of TIERS)j.tickets[size]=Math.max(0,Number(j.tickets[size])||0);
 return j;
};
export function createJourney({state,toast,visibleInventory,byId,refreshWallet,saveGuest,getPacks,onFreeDraw,onRefreshProfile}){
 let snapshot=null,updating=false,ready=false,mode=null,packSelection='';
 const guest=()=>!!state.guestMode;
 const account=()=>!!state.playerId&&!guest();
 function guestProgress(key,today,week){
   const j=safeJourney(state.guestData),events=j.events;
   const countEvents=(kind,from,to)=>events.filter(e=>e.kind===kind&&e.day>=from&&e.day<to)
     .reduce((sum,e)=>sum+Number(e.amount||1),0);
   const tomorrow=new Date(Date.parse(today+'T00:00:00Z')+86400000).toISOString().slice(0,10);
   const nextWeek=new Date(Date.parse(week+'T00:00:00Z')+604800000).toISOString().slice(0,10);
   const dailyClaims=k=>j.claims.filter(x=>x.period===today&&k.includes(x.key)).length;
   const weeklyClaims=k=>j.claims.filter(x=>x.period===week&&k.includes(x.key)).length;
   if(key==='day_visit')return j.checkins.includes(today)?1:0;
   if(key==='day_archive')return countEvents('archive',today,tomorrow);
   if(key==='day_draw')return countEvents('draw',today,tomorrow);
   if(key==='day_view')return countEvents('view',today,tomorrow);
   if(key==='day_clear')return dailyClaims(DAY_KEYS);
   if(key==='week_visit3')return j.checkins.filter(d=>isInWeek(d,week)).length;
   if(key==='week_draw10')return countEvents('draw',week,nextWeek);
   if(key==='week_archive3')return new Set(events.filter(e=>e.kind==='archive'&&isInWeek(e.day,week)).map(e=>e.day)).size;
   if(key==='week_daily12')return j.claims.filter(x=>isInWeek(x.period,week)&&DAY_KEYS.includes(x.key)).length;
   if(key==='week_clear')return weeklyClaims(WEEK_KEYS);
   const inventory=visibleInventory();
   const present=[...byId.values()].filter(card=>Number(inventory[card.id]||0)>0);
   if(key.startsWith('pulls_'))return Object.values(inventory).reduce((total,x)=>total+Math.max(0,Number(x)||0),0);
   if(key.startsWith('unique_'))return present.length;
   if(key.startsWith('first_'))return present.filter(card=>card.rarity===key.slice(6).toUpperCase()).length;
   if(key.startsWith('visits_'))return j.checkins.length;
   if(key.startsWith('tasks_'))return j.claims.filter(x=>!['day_clear','week_clear'].includes(x.key)).length;
   return 0;
 }
 function grantGuest(){
   if(!guest()||!state.guestData)return;
   const j=safeJourney(state.guestData),today=dateKST(),week=weekOf(today);
   for(const rule of RULES){
     if(guestProgress(rule.key,today,week)<rule.target)continue;
     if(rule.cadence==='achievement'){
       if(j.achievements.includes(rule.key))continue;
       j.achievements.push(rule.key);
     }else{
       const period=rule.cadence==='daily'?today:week;
       if(j.claims.some(x=>x.key===rule.key&&x.period===period))continue;
       j.claims.push({key:rule.key,period});
     }
     state.guestData.balance+=rule.reward_m;
     const profile=state.guestData.profile;
     profile.experience=Math.min(1000000000,Number(profile.experience||0)+rule.reward_xp);
     profile.level=1+Math.floor(Math.sqrt(profile.experience/100));
   }
   saveGuest();
 }
 function guestSnapshot(){
   const today=dateKST(),week=weekOf(today),j=safeJourney(state.guestData);
   const byCadence=cadence=>RULES.filter(x=>x.cadence===cadence).map(rule=>{
     const claimed=rule.cadence==='achievement'?j.achievements.includes(rule.key):
       j.claims.some(x=>x.key===rule.key&&x.period===(cadence==='daily'?today:week));
     return {...rule,claimed,progress:clamp(guestProgress(rule.key,today,week),rule.target)};
   });
   const visits=j.checkins.length,checked=j.checkins.includes(today);
   return {day:today,week,day_total:visits,today_claimed:checked,
     cycle_day:checked?((visits-1)%7)+1:(visits%7)+1,
     next_cycle_day:(visits%7)+1,
     tickets:{...j.tickets},daily:byCadence('daily'),weekly:byCadence('weekly'),
     achievements:byCadence('achievement')};
 }
 function guestCheckin(){
   const j=safeJourney(state.guestData),today=dateKST();
   if(j.checkins.includes(today))return null;
   const day=(j.checkins.length%7)+1,amount=WEEKLY_REWARDS[day-1],size=WEEKLY_TICKETS[day-1];
   j.checkins.push(today);
   state.guestData.balance+=amount;
   j.tickets[size]+=1;
   grantGuest();
   saveGuest();
   return {claimed:true,cycle_day:day,reward_m:amount,ticket_size:size};
 }
 async function refresh({checkin=false}={}){
   if(updating)return;
   if(!account()&&!guest()){snapshot=null;ready=false;return}
   updating=true;
   try{
     if(guest()){
       if(checkin){const gift=guestCheckin();if(gift)toast('출석 '+gift.cycle_day+'일차 ✦ '+cash(gift.reward_m)+' + 무료 '+shortPack(gift.ticket_size)+' 개봉권!');}
       grantGuest();
       snapshot=guestSnapshot();
     }else{
       if(checkin){
         const {data,error}=await state.supabase.rpc('itm_journey_checkin');
         if(error)throw error;
         if(data?.claimed)toast('출석 '+data.cycle_day+'일차 ✦ '+cash(data.reward_m)+' + 무료 '+shortPack(data.ticket_size)+' 개봉권!');
       }
       const {data,error}=await state.supabase.rpc('itm_journey_snapshot');
       if(error)throw error;
       snapshot=data;
     }
     ready=true;
     await refreshWallet();
     onRefreshProfile?.();
   }catch(err){console.warn('Journey refresh failed',err);toast('미션 정보를 불러오지 못했습니다: '+(err?.message||err));}
   finally{updating=false;}
 }
 async function init(){
   if(!account()&&!guest())return;
   mode=guest()?'guest':'account';
   await refresh({checkin:true});
 }
 function reset(){snapshot=null;ready=false;mode=null;}
 function guestEvent(kind,amount=1){
   const j=safeJourney(state.guestData),today=dateKST();
   if(kind!=='draw'&&j.events.some(e=>e.kind===kind&&e.day===today))return false;
   j.events.push({kind,day:today,amount});
   if(j.events.length>7000)j.events.splice(0,j.events.length-7000);
   grantGuest();saveGuest();snapshot=guestSnapshot();
   return true;
 }
 async function interaction(kind){
   if(!['archive','view'].includes(kind)||(!guest()&&!account()))return;
   if(guest()){
     if(guestEvent(kind)){await refreshWallet();onRefreshProfile?.();}
   }else if(state.supabase){
     try{
       const {error}=await state.supabase.rpc('itm_journey_interaction',{p_kind:kind});
       if(error)throw error;
       await refresh();
     }catch(err){console.warn('Journey interaction failed',err);}
   }
 }
 async function afterDraw(cards){
   if(guest()){
     guestEvent('draw',cards?.length||1);
     await refreshWallet();onRefreshProfile?.();
   }else await refresh();
 }
 function guestTicketAvailable(size){return Math.max(0,Number(safeJourney(state.guestData).tickets[size])||0)>0;}
 function consumeGuestTicket(size){
   if(!guest()||!guestTicketAvailable(size))return false;
   const j=safeJourney(state.guestData);
   j.tickets[size]--;
   saveGuest();
   snapshot=guestSnapshot();
   return true;
 }
 function renderMissionRow(item){
   const row=node('div','itm-journey-mission'+(item.claimed?' done':'')),
     main=node('div','itm-journey-mission-main'),title=node('strong','',item.title),
     desc=node('small','',item.description);
   main.append(title,desc);
   const reward=node('div','itm-journey-mission-reward');
   reward.append(node('strong','',cash(item.reward_m)+(item.reward_xp?' · '+item.reward_xp+' XP':'')),
     node('small','',item.claimed?'✓ 완료':item.progress+' / '+item.target));
   row.append(main,reward);
   const track=node('div','itm-journey-track');
   const fill=node('div','itm-journey-track-fill');
   fill.style.width=clamp((Number(item.progress)||0)/item.target*100,100)+'%';
   track.append(fill);row.append(track);
   return row;
 }
 function renderAttendance(container){
   const s=snapshot,head=node('div','itm-journey-section-head');
   head.append(node('h3','','7일 순환 접속 보상'),node('small','',s.today_claimed?'오늘 출석 보상 지급 완료':'오늘 출석 보상 확인 중'));
   container.append(head);
   const days=node('div','itm-journey-days');
   for(let i=0;i<7;i++){
     const day=node('div','itm-journey-day'+(i+1===s.cycle_day?' is-current':'')),
       lbl=node('strong','',(i+1)+'일차'),ticket=node('span','',shortPack(WEEKLY_TICKETS[i])),
       m=node('small','',cash(WEEKLY_REWARDS[i]));
     day.append(lbl,ticket,m);
     days.append(day);
   }
   container.append(days);
   const note=node('p','itm-journey-note','매일 00:00(KST) 갱신 · 접속하지 않은 날은 차수가 초기화되지 않습니다. 무료 개봉권은 만료되지 않고 누적됩니다.');
   container.append(note);
 }
 function renderTickets(container){
   const section=node('section','itm-journey-tickets');
   section.append(node('h3','','🎁 무료 개봉권 보관함'));
   const options=getPacks().filter(p=>p&&p.id);
   const label=node('label','itm-journey-pack-label','개봉할 카드팩 선택');
   const sel=node('select','itm-journey-pack');
   for(const pack of options){
     const option=new Option(pack.name,pack.id);sel.append(option);
   }
   if(packSelection&&options.some(p=>p.id===packSelection))sel.value=packSelection;
   if(sel.value)packSelection=sel.value;
   sel.onchange=()=>{packSelection=sel.value;};
   label.append(sel);section.append(label);
   const grid=node('div','itm-journey-ticket-grid');
   for(const size of TIERS){
     const count=Number(snapshot.tickets?.[size]||0);
     const item=node('div','itm-journey-ticket');
     item.append(node('b','',shortPack(size)),node('small','',count+'장 보유'));
     const button=node('button','','무료 개봉');
     button.type='button';button.disabled=count<1||!options.length;
     button.onclick=async()=>{
       if(!sel.value)return toast('먼저 개봉할 카드팩을 선택해 주세요.');
       button.disabled=true;
       try{await onFreeDraw(size,sel.value);}finally{button.disabled=false;}
     };
     item.append(button);grid.append(item);
   }
   section.append(grid);container.append(section);
 }
 function renderMissions(content,cadence){
   if(!snapshot){content.append(node('p','itm-mission-empty',ready?'미션 데이터를 불러올 수 없습니다.':'미션 정보를 불러오는 중입니다.'));return;}
   if(cadence==='daily'){renderAttendance(content);renderTickets(content);}
   const items=snapshot[cadence]||[];
   const base=items.filter(x=>!x.key.endsWith('_clear'));
   const complete=base.filter(x=>x.claimed).length;
   const bar=node('div','itm-journey-progress-header');
   bar.append(node('h3','',cadence==='daily'?'오늘의 미션':'이번 주 미션'),
     node('span','',complete+' / '+base.length+' 완료'));
   content.append(bar);
   const track=node('div','itm-journey-overall');
   const fill=node('div','');fill.style.width=(base.length?complete/base.length*100:0)+'%';
   track.append(fill);content.append(track);
   content.append(node('p','itm-journey-note',cadence==='daily'?'매일 00:00 초기화 · 달성 즉시 자동 지급':'매주 월요일 00:00 초기화 · 연속 출석을 요구하지 않습니다.'));
   for(const item of items)content.append(renderMissionRow(item));
 }
 function renderAchievements(content){
   if(!snapshot){content.append(node('p','itm-mission-empty','업적 정보를 불러오는 중입니다.'));return;}
   const categories=[
     {key:'journey',title:'수집 여정',desc:'보유 카드 수량에 따른 장기 업적'},
     {key:'archive',title:'도감 업적',desc:'서로 다른 카드 종류 수집'},
     {key:'special',title:'특별 업적',desc:'희귀 카드·출석·미션 도전'}
   ];
   const achievements=snapshot.achievements||[];
   for(const category of categories){
     const list=achievements.filter(x=>x.category===category.key);
     const details=node('details','itm-journey-achievement-group');
     const summary=node('summary','');
     summary.append(node('strong','',category.title),node('small','',list.filter(x=>x.claimed).length+' / '+list.length+' 달성'));
     details.append(summary,node('p','itm-journey-note',category.desc));
     for(const item of list)details.append(renderMissionRow(item));
     content.append(details);
   }
 }
 return {
   init,reset,refresh,interaction,afterDraw,consumeGuestTicket,renderMissions,renderAchievements,
   currentSnapshot:()=>snapshot,
   isReady:()=>ready
 };
}
