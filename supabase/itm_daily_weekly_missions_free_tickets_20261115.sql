
-- ITM: renewable daily / weekly missions, permanent achievements and 7-day check-in tickets.
-- All credits are transactional. RLS blocks browser writes; server RPC validates identity.
create table if not exists public.itm_journey_rules(
 key text primary key, cadence text not null check(cadence in ('daily','weekly','achievement')),
 category text not null, title text not null, description text not null,
 target integer not null check(target>0), reward_m integer not null default 0 check(reward_m between 0 and 100000),
 reward_xp integer not null default 0 check(reward_xp between 0 and 100000),
 sort_order integer not null default 0, active boolean not null default true
);
insert into public.itm_journey_rules(key,cadence,category,title,description,target,reward_m,reward_xp,sort_order)
values
('day_visit','daily','daily','오늘의 방문','당일 첫 접속',1,60,0,10),
('day_archive','daily','daily','추억 보관함','MY COLLECTION 1회 열기',1,40,0,20),
('day_draw','daily','daily','오늘의 한 장','카드 1장 이상 획득',1,50,0,30),
('day_view','daily','daily','소중한 순간','보유 카드 확대해서 감상하기',1,20,0,40),
('day_clear','daily','daily','DAILY ALL CLEAR','일일 미션 4개 완료',4,30,0,50),
('week_visit3','weekly','weekly','꾸준한 방문자','일주일 중 3일 방문',3,150,0,10),
('week_draw10','weekly','weekly','순간의 수집가','일주일에 카드 10장 획득',10,200,0,20),
('week_archive3','weekly','weekly','도감 탐험가','서로 다른 3일에 도감 방문',3,100,0,30),
('week_daily12','weekly','weekly','미션 전문가','일일 기본 미션 12개 완료',12,100,0,40),
('week_clear','weekly','weekly','WEEKLY ALL CLEAR','주간 미션 4개 완료',4,250,0,50),
('pulls_1','achievement','journey','첫 번째 순간','카드 1장 보유',1,20,20,10),
('pulls_10','achievement','journey','모으기 시작','누적 보유 카드 10장',10,80,50,20),
('pulls_50','achievement','journey','빛나는 서랍','누적 보유 카드 50장',50,200,100,30),
('pulls_200','achievement','journey','추억의 수호자','누적 보유 카드 200장',200,500,250,40),
('pulls_1000','achievement','journey','천 개의 순간','누적 보유 카드 1,000장',1000,1000,600,50),
('unique_5','achievement','archive','도감의 시작','서로 다른 카드 5종 수집',5,50,30,10),
('unique_15','achievement','archive','색다른 순간들','서로 다른 카드 15종 수집',15,150,75,20),
('unique_30','achievement','archive','컬렉션 탐험가','서로 다른 카드 30종 수집',30,300,150,30),
('unique_50','achievement','archive','도감의 달인','서로 다른 카드 50종 수집',50,500,250,40),
('first_sr','achievement','special','첫 번째 SR','SR 카드 1종 수집',1,50,50,10),
('first_ssr','achievement','special','첫 번째 SSR','SSR 카드 1종 수집',1,100,75,20),
('first_ur','achievement','special','첫 번째 UR','UR 카드 1종 수집',1,200,125,30),
('visits_7','achievement','special','일곱 번의 만남','서로 다른 7일 접속',7,120,70,40),
('visits_30','achievement','special','함께한 한 달','서로 다른 30일 접속',30,500,200,50),
('tasks_10','achievement','special','미션 도전자','기본 미션 10개 완료',10,100,60,60),
('tasks_50','achievement','special','꾸준한 수집가','기본 미션 50개 완료',50,400,180,70),
('tasks_200','achievement','special','THE MOMENT MASTER','기본 미션 200개 완료',200,1000,500,80)
on conflict(key) do nothing;

create table if not exists public.itm_journey_checkins(
 player_id uuid not null references private.player_accounts(id) on delete cascade,
 day_kst date not null, cycle_day integer not null check(cycle_day between 1 and 7),
 reward_m integer not null, ticket_size integer not null check(ticket_size in (1,3,5,11)),
 awarded_at timestamptz not null default now(), primary key(player_id,day_kst)
);
create table if not exists public.itm_journey_tickets(
 player_id uuid not null references private.player_accounts(id) on delete cascade,
 bundle_size integer not null check(bundle_size in (1,3,5,11)),
 quantity integer not null default 0 check(quantity between 0 and 100000),
 primary key(player_id,bundle_size)
);
create table if not exists public.itm_journey_events(
 id uuid primary key default gen_random_uuid(),
 player_id uuid not null references private.player_accounts(id) on delete cascade,
 kind text not null check(kind in ('draw','archive','view')),
 amount integer not null check(amount between 1 and 11),
 day_kst date not null, source_key text not null, created_at timestamptz not null default now(),
 unique(player_id,source_key)
);
create index if not exists itm_journey_events_period on public.itm_journey_events(player_id,day_kst,kind);
create table if not exists public.itm_journey_mission_claims(
 player_id uuid not null references private.player_accounts(id) on delete cascade,
 mission_key text not null references public.itm_journey_rules(key),
 period_start date not null, reward_m integer not null, claimed_at timestamptz not null default now(),
 primary key(player_id,mission_key,period_start)
);
create index if not exists itm_journey_mission_period on public.itm_journey_mission_claims(player_id,period_start,mission_key);
create table if not exists public.itm_journey_achievement_claims(
 player_id uuid not null references private.player_accounts(id) on delete cascade,
 achievement_key text not null references public.itm_journey_rules(key),
 reward_m integer not null, reward_xp integer not null,
 claimed_at timestamptz not null default now(), primary key(player_id,achievement_key)
);
do $block$
declare v_table text;
begin
 foreach v_table in array array['itm_journey_rules','itm_journey_checkins','itm_journey_tickets',
 'itm_journey_events','itm_journey_mission_claims','itm_journey_achievement_claims'] loop
  execute format('alter table public.%I enable row level security',v_table);
  execute format('revoke all on public.%I from public,anon,authenticated',v_table);
 end loop;
end $block$;
grant select on public.itm_journey_rules to anon,authenticated;
create policy itm_journey_rules_read on public.itm_journey_rules for select to anon,authenticated using(true);

-- The only client entry points are narrowly scoped RPCs. Never expose internal helpers.
create or replace function private.itm_journey_progress(p_player uuid,p_key text,p_day date,p_week date)
returns integer language plpgsql stable security definer set search_path=''
as $body$
declare v_value integer:=0;
begin
 case p_key
 when 'day_visit' then
   select count(*) into v_value from public.itm_journey_checkins where player_id=p_player and day_kst=p_day;
 when 'day_archive','day_draw','day_view' then
   select coalesce(sum(amount),0)::integer into v_value from public.itm_journey_events
   where player_id=p_player and day_kst=p_day
     and kind=case p_key when 'day_archive' then 'archive' when 'day_draw' then 'draw' else 'view' end;
 when 'day_clear' then
   select count(*) into v_value from public.itm_journey_mission_claims where player_id=p_player
   and period_start=p_day and mission_key in('day_visit','day_archive','day_draw','day_view');
 when 'week_visit3' then
   select count(*) into v_value from public.itm_journey_checkins where player_id=p_player
   and day_kst>=p_week and day_kst<p_week+7;
 when 'week_draw10' then
   select coalesce(sum(amount),0)::integer into v_value from public.itm_journey_events where player_id=p_player
   and kind='draw' and day_kst>=p_week and day_kst<p_week+7;
 when 'week_archive3' then
   select count(distinct day_kst) into v_value from public.itm_journey_events where player_id=p_player
   and kind='archive' and day_kst>=p_week and day_kst<p_week+7;
 when 'week_daily12' then
   select count(*) into v_value from public.itm_journey_mission_claims where player_id=p_player
   and period_start>=p_week and period_start<p_week+7
   and mission_key in('day_visit','day_archive','day_draw','day_view');
 when 'week_clear' then
   select count(*) into v_value from public.itm_journey_mission_claims where player_id=p_player
   and period_start=p_week and mission_key in('week_visit3','week_draw10','week_archive3','week_daily12');
 when 'pulls_1','pulls_10','pulls_50','pulls_200','pulls_1000' then
   select coalesce(sum(quantity),0)::integer into v_value from public.itm_card_inventory where player_id=p_player;
 when 'unique_5','unique_15','unique_30','unique_50' then
   select count(*) into v_value from public.itm_card_inventory where player_id=p_player and quantity>0;
 when 'first_sr','first_ssr','first_ur' then
   select count(*) into v_value from public.itm_card_inventory i join public.itm_catalog c on c.id=i.card_id
   where i.player_id=p_player and i.quantity>0 and c.rarity=upper(replace(p_key,'first_',''));
 when 'visits_7','visits_30' then
   select count(*) into v_value from public.itm_journey_checkins where player_id=p_player;
 when 'tasks_10','tasks_50','tasks_200' then
   select count(*) into v_value from public.itm_journey_mission_claims where player_id=p_player
   and mission_key not in('day_clear','week_clear');
 else v_value:=0;
 end case;
 return coalesce(v_value,0);
end;$body$;
revoke all on function private.itm_journey_progress(uuid,text,date,date) from public,anon,authenticated;

create or replace function private.itm_award_journey(p_player uuid)
returns void language plpgsql volatile security definer set search_path=''
as $body$
declare v_today date:=(now() at time zone 'Asia/Seoul')::date;
 v_week date:=date_trunc('week',now() at time zone 'Asia/Seoul')::date;
 v_rule record;v_inserted text;v_period date;
begin
 insert into public.itm_wallets(player_id,balance) values(p_player,0) on conflict do nothing;
 for v_rule in
 select * from public.itm_journey_rules where active=true
 order by case cadence when 'daily' then 1 when 'weekly' then 2 else 3 end,sort_order
 loop
   if private.itm_journey_progress(p_player,v_rule.key,v_today,v_week)<v_rule.target then continue;end if;
   v_inserted:=null;
   if v_rule.cadence='achievement' then
     insert into public.itm_journey_achievement_claims(player_id,achievement_key,reward_m,reward_xp)
     values(p_player,v_rule.key,v_rule.reward_m,v_rule.reward_xp)
     on conflict do nothing returning achievement_key into v_inserted;
   else
     v_period:=case v_rule.cadence when 'daily' then v_today else v_week end;
     insert into public.itm_journey_mission_claims(player_id,mission_key,period_start,reward_m)
     values(p_player,v_rule.key,v_period,v_rule.reward_m)
     on conflict do nothing returning mission_key into v_inserted;
   end if;
   if v_inserted is not null then
     if v_rule.reward_m>0 then
       update public.itm_wallets set balance=least(1000000000,balance+v_rule.reward_m),updated_at=now()
       where player_id=p_player;
     end if;
     if v_rule.reward_xp>0 then perform private.itm_add_xp(p_player,v_rule.reward_xp);end if;
   end if;
 end loop;
end;$body$;
revoke all on function private.itm_award_journey(uuid) from public,anon,authenticated;

-- Existing paid draws also count automatically; admin free tests cannot farm rewards.
create or replace function private.itm_track_managed_roll()
returns trigger language plpgsql security definer set search_path=''
as $body$
begin
 if private.itm_is_studio_admin() then return new;end if;
 insert into public.itm_journey_events(player_id,kind,amount,day_kst,source_key)
 values(new.player_id,'draw',pg_catalog.jsonb_array_length(new.result),
       (now() at time zone 'Asia/Seoul')::date,'roll:'||new.id::text)
 on conflict(player_id,source_key) do nothing;
 perform private.itm_award_journey(new.player_id);
 return new;
end;$body$;
revoke all on function private.itm_track_managed_roll() from public,anon,authenticated;
drop trigger if exists itm_track_journey_on_roll on public.itm_card_pack_rolls;
create trigger itm_track_journey_on_roll after insert on public.itm_card_pack_rolls
for each row execute function private.itm_track_managed_roll();

create or replace function public.itm_journey_interaction(p_kind text)
returns void language plpgsql volatile security definer set search_path=''
as $body$
declare v_player uuid;v_day date:=(now() at time zone 'Asia/Seoul')::date;
begin
 if auth.uid() is null or (auth.jwt()->'app_metadata'->>'itm_named_account') is distinct from 'true'
 then raise exception 'Registered ITM account required' using errcode='28000';end if;
 if p_kind not in('archive','view') then raise exception 'Invalid activity';end if;
 v_player:=private.ensure_player();
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_player::text,927134));
 insert into public.itm_journey_events(player_id,kind,amount,day_kst,source_key)
 values(v_player,p_kind,1,v_day,p_kind||':'||v_day::text)
 on conflict(player_id,source_key) do nothing;
 perform private.itm_award_journey(v_player);
end;$body$;
revoke all on function public.itm_journey_interaction(text) from public,anon;
grant execute on function public.itm_journey_interaction(text) to authenticated;

create or replace function public.itm_journey_checkin()
returns jsonb language plpgsql volatile security definer set search_path=''
as $body$
declare v_player uuid;v_today date:=(now() at time zone 'Asia/Seoul')::date;
 v_cycle integer;v_m integer;v_size integer;v_existing public.itm_journey_checkins%rowtype;
begin
 if auth.uid() is null or (auth.jwt()->'app_metadata'->>'itm_named_account') is distinct from 'true'
 then raise exception 'Registered ITM account required' using errcode='28000';end if;
 v_player:=private.ensure_player();
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_player::text,927134));
 select * into v_existing from public.itm_journey_checkins
 where player_id=v_player and day_kst=v_today;
 if found then
  perform private.itm_award_journey(v_player);
  return jsonb_build_object('claimed',false,'cycle_day',v_existing.cycle_day,
  'reward_m',v_existing.reward_m,'ticket_size',v_existing.ticket_size);
 end if;
 select (count(*)%7)+1 into v_cycle from public.itm_journey_checkins where player_id=v_player;
 v_m:=case v_cycle when 1 then 900 when 2 then 700 when 3 then 500
       when 4 then 900 when 5 then 700 when 6 then 500 else 100 end;
 v_size:=case v_cycle when 1 then 1 when 2 then 3 when 3 then 5
       when 4 then 1 when 5 then 3 when 6 then 5 else 11 end;
 insert into public.itm_journey_checkins(player_id,day_kst,cycle_day,reward_m,ticket_size)
 values(v_player,v_today,v_cycle,v_m,v_size);
 insert into public.itm_wallets(player_id,balance) values(v_player,v_m)
 on conflict(player_id) do update set balance=least(1000000000,public.itm_wallets.balance+excluded.balance),updated_at=now();
 insert into public.itm_journey_tickets(player_id,bundle_size,quantity) values(v_player,v_size,1)
 on conflict(player_id,bundle_size) do update set quantity=least(100000,public.itm_journey_tickets.quantity+1);
 perform private.itm_award_journey(v_player);
 return jsonb_build_object('claimed',true,'cycle_day',v_cycle,'reward_m',v_m,'ticket_size',v_size);
end;$body$;
revoke all on function public.itm_journey_checkin() from public,anon;
grant execute on function public.itm_journey_checkin() to authenticated;

create or replace function public.itm_journey_snapshot()
returns jsonb language plpgsql volatile security definer set search_path=''
as $body$
declare v_player uuid;v_today date:=(now() at time zone 'Asia/Seoul')::date;
 v_week date:=date_trunc('week',now() at time zone 'Asia/Seoul')::date;
 v_checkin public.itm_journey_checkins%rowtype;v_visits integer;
 v_rule record;v_progress integer;v_claimed boolean;v_item jsonb;
 v_daily jsonb:='[]'::jsonb;v_weekly jsonb:='[]'::jsonb;v_achievements jsonb:='[]'::jsonb;
 v_tickets jsonb:='{}'::jsonb;v_size integer;
begin
 if auth.uid() is null or (auth.jwt()->'app_metadata'->>'itm_named_account') is distinct from 'true'
 then raise exception 'Registered ITM account required' using errcode='28000';end if;
 v_player:=private.ensure_player();
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_player::text,927134));
 perform private.itm_award_journey(v_player);
 select count(*) into v_visits from public.itm_journey_checkins where player_id=v_player;
 select * into v_checkin from public.itm_journey_checkins where player_id=v_player and day_kst=v_today;
 foreach v_size in array array[1,3,5,11] loop
   v_tickets:=v_tickets||jsonb_build_object(v_size::text,coalesce((select quantity from public.itm_journey_tickets
     where player_id=v_player and bundle_size=v_size),0));
 end loop;
 for v_rule in select * from public.itm_journey_rules where active=true
  order by case cadence when 'daily' then 1 when 'weekly' then 2 else 3 end,category,sort_order loop
   v_progress:=private.itm_journey_progress(v_player,v_rule.key,v_today,v_week);
   if v_rule.cadence='achievement' then
    select exists(select 1 from public.itm_journey_achievement_claims
       where player_id=v_player and achievement_key=v_rule.key) into v_claimed;
   else
    select exists(select 1 from public.itm_journey_mission_claims
       where player_id=v_player and mission_key=v_rule.key
         and period_start=case when v_rule.cadence='daily' then v_today else v_week end)
       into v_claimed;
   end if;
   v_item:=jsonb_build_object('key',v_rule.key,'title',v_rule.title,'description',v_rule.description,
     'category',v_rule.category,'target',v_rule.target,'progress',least(v_progress,v_rule.target),
     'reward_m',v_rule.reward_m,'reward_xp',v_rule.reward_xp,'claimed',v_claimed,
     'sort_order',v_rule.sort_order);
   case v_rule.cadence when 'daily' then v_daily:=v_daily||jsonb_build_array(v_item);
      when 'weekly' then v_weekly:=v_weekly||jsonb_build_array(v_item);
      else v_achievements:=v_achievements||jsonb_build_array(v_item);
   end case;
 end loop;
 return jsonb_build_object('day',v_today,'week',v_week,'day_total',v_visits,
  'today_claimed',v_checkin.player_id is not null,
  'cycle_day',coalesce(v_checkin.cycle_day,(v_visits%7)+1),
  'next_cycle_day',(v_visits%7)+1,
  'tickets',v_tickets,'daily',v_daily,'weekly',v_weekly,'achievements',v_achievements);
end;$body$;
revoke all on function public.itm_journey_snapshot() from public,anon;
grant execute on function public.itm_journey_snapshot() to authenticated;

-- Preserve the existing paid draw body and RNG. A transaction-scoped ticket marker
-- unlocks size 3 and skips the wallet debit only from the authenticated free-ticket RPC.
create or replace function private.itm_draw_managed_pack(p_count integer,p_pack_id uuid)
returns jsonb language plpgsql volatile security definer set search_path=''
as $body$
declare
 v_player uuid; v_pack public.itm_packs%rowtype; v_rarity text;
 v_card public.itm_catalog%rowtype; v_result jsonb:='[]'::jsonb;
 v_total numeric; v_roll numeric; v_candidate record; i integer; v_price bigint; v_xp integer:=0;v_new_card boolean;
begin
 if auth.uid() is null or coalesce(auth.jwt()->'app_metadata'->>'itm_named_account','')<>'true'
 then raise exception 'ITM named account required' using errcode='28000'; end if;
 if p_count not in (1,5,11) and not (p_count=3 and pg_catalog.current_setting('itm.free_ticket_mode',true)='on') then raise exception 'Invalid pack size'; end if;
 select * into v_pack from public.itm_packs where id=p_pack_id and active=true;
 if not found then raise exception 'Pack is unavailable'; end if;
 v_player:=private.ensure_player();
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_player::text,927134));
 if exists(select 1 from public.itm_card_pack_rolls where player_id=v_player and created_at>now()-interval '3 seconds')
 then raise exception 'Pack opening cooldown'; end if;
 -- Charge in this same transaction as card grants; administrator bypass is server-authorized.
 v_price:=case p_count when 1 then 100 when 3 then 300 when 5 then 500 when 11 then 1000 end;
 if not private.itm_is_studio_admin() and pg_catalog.current_setting('itm.free_ticket_mode',true) is distinct from 'on' then
   insert into public.itm_wallets(player_id,balance) values(v_player,0)
   on conflict (player_id) do nothing;
   update public.itm_wallets set balance=balance-v_price,updated_at=now()
   where player_id=v_player and balance>=v_price;
   if not found then raise exception 'INSUFFICIENT_M: % M required',v_price using errcode='P0001'; end if;
 end if;
 for i in 1..p_count loop
  with eligible_rarities as (
   select distinct c.rarity from public.itm_catalog c where c.status='published'
    and (cardinality(v_pack.group_slugs)=0 or c.group_slug=any(v_pack.group_slugs))
    and (v_pack.series_filters='[]'::jsonb or exists(
     select 1 from jsonb_array_elements(v_pack.series_filters) f
     where f->>'group_slug'=c.group_slug and f->>'name'=c.edition))
  ), weighted as (
   select e.rarity,coalesce((v_pack.rarity_odds->>e.rarity)::numeric,0) as weight
   from eligible_rarities e
  )
  select coalesce(sum(weight),0) into v_total from weighted;
  if v_total<=0 then raise exception 'No published cards match this pack'; end if;
  v_roll:=random()*v_total;
  for v_candidate in
   select e.rarity,coalesce((v_pack.rarity_odds->>e.rarity)::numeric,0) as weight
   from (select distinct c.rarity from public.itm_catalog c where c.status='published'
     and (cardinality(v_pack.group_slugs)=0 or c.group_slug=any(v_pack.group_slugs))
     and (v_pack.series_filters='[]'::jsonb or exists(
       select 1 from jsonb_array_elements(v_pack.series_filters) f
       where f->>'group_slug'=c.group_slug and f->>'name'=c.edition))) e
   order by case e.rarity when 'N' then 0 when 'R' then 1 when 'SR' then 2
     when 'SSR' then 3 else 4 end
  loop
   v_roll:=v_roll-v_candidate.weight;
   if v_roll<0 then v_rarity:=v_candidate.rarity;exit;end if;
  end loop;
  select * into v_card from public.itm_catalog c where c.status='published'
   and c.rarity=v_rarity
   and (cardinality(v_pack.group_slugs)=0 or c.group_slug=any(v_pack.group_slugs))
   and (v_pack.series_filters='[]'::jsonb or exists(
      select 1 from jsonb_array_elements(v_pack.series_filters) f
      where f->>'group_slug'=c.group_slug and f->>'name'=c.edition))
   order by random() limit 1;
  if not found then raise exception 'Missing card for selected rarity'; end if;
  select not exists(select 1 from public.itm_card_inventory where player_id=v_player and card_id=v_card.id and quantity>0) into v_new_card;
  v_xp:=v_xp+10+case when v_new_card then 40 else 0 end;
  insert into public.itm_card_inventory(player_id,card_id,quantity)
    values(v_player,v_card.id,1)
    on conflict(player_id,card_id) do update
    set quantity=least(1000000,public.itm_card_inventory.quantity+1),updated_at=now();
  v_result:=v_result||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('id',v_card.id::text));
 end loop;
 perform private.itm_add_xp(v_player,v_xp);
 perform private.itm_grant_collection_rewards(v_player);
 insert into public.itm_card_pack_rolls(player_id,pack_size,pack_id,result)
  values(v_player,p_count,p_pack_id,v_result);
 return v_result;
end;
$body$;

revoke all on function private.itm_draw_managed_pack(integer,uuid) from public,anon;

create or replace function public.itm_open_ticket_pack(p_count integer,p_pack_id uuid)
returns jsonb language plpgsql volatile security definer set search_path=''
as $body$
declare v_player uuid;v_result jsonb;
begin
 if auth.uid() is null or (auth.jwt()->'app_metadata'->>'itm_named_account') is distinct from 'true'
 then raise exception 'Registered ITM account required' using errcode='28000';end if;
 if p_count not in (1,3,5,11) then raise exception 'Invalid free ticket size';end if;
 v_player:=private.ensure_player();
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_player::text,927134));
 update public.itm_journey_tickets set quantity=quantity-1
 where player_id=v_player and bundle_size=p_count and quantity>0;
 if not found then raise exception 'FREE_TICKET_MISSING: No free ticket remains';end if;
 perform pg_catalog.set_config('itm.free_ticket_mode','on',true);
 v_result:=private.itm_draw_managed_pack(p_count,p_pack_id);
 perform pg_catalog.set_config('itm.free_ticket_mode','off',true);
 return v_result;
end;$body$;
revoke all on function public.itm_open_ticket_pack(integer,uuid) from public,anon;
grant execute on function public.itm_open_ticket_pack(integer,uuid) to authenticated;
