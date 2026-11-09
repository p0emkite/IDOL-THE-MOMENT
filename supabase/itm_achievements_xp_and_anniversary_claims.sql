-- ITM collection achievements, awarded profile frames, milestone XP and event inbox.
create or replace function private.itm_grant_collection_rewards(p_player uuid)
returns integer language plpgsql volatile security definer set search_path=''
as $body$
declare v_collection record;v_grade text;v_total integer;v_owned integer;
 v_reward integer;v_xp integer;v_added text;v_frame uuid;v_new_count integer:=0;
begin
 if p_player is null or not exists(select 1 from private.player_accounts where id=p_player)
 then raise exception 'Player not found';end if;
 insert into public.itm_wallets(player_id) values(p_player) on conflict do nothing;
 for v_collection in
 select distinct group_slug,edition from public.itm_catalog where status='published'
 loop
  foreach v_grade in array array['N','R','SR','SSR','UR','ALL'] loop
   select count(*), count(i.card_id) into v_total,v_owned
   from public.itm_catalog c
   left join public.itm_card_inventory i on i.card_id=c.id and i.player_id=p_player and i.quantity>0
   where c.status='published' and c.group_slug=v_collection.group_slug
      and c.edition=v_collection.edition and (v_grade='ALL' or c.rarity=v_grade);
   if v_total=0 or v_total<>v_owned then continue;end if;
   v_reward:=case v_grade when 'N' then 100 when 'R' then 300
     when 'SR' then 500 when 'SSR' then 1000 when 'UR' then 3000 else 0 end;
   v_xp:=case v_grade when 'N' then 50 when 'R' then 75
     when 'SR' then 125 when 'SSR' then 200 when 'UR' then 300 else 500 end;
   v_added:=null;
   insert into public.itm_achievement_claims(player_id,group_slug,edition,rarity,reward_m)
   values(p_player,v_collection.group_slug,v_collection.edition,v_grade,v_reward)
   on conflict do nothing returning rarity into v_added;
   if v_added is not null then
     v_new_count:=v_new_count+1;
     if v_reward>0 then
      update public.itm_wallets set balance=balance+v_reward,updated_at=now() where player_id=p_player;
     end if;
     perform private.itm_add_xp(p_player,v_xp);
   end if;
   -- A completed tier/collection permanently unlocks the appropriate frame.
   if v_grade in ('UR','ALL') then
     insert into public.itm_profile_frames(group_slug,edition,kind,title)
     values(v_collection.group_slug,v_collection.edition,
      case when v_grade='UR' then 'ur' else 'collection' end,
      v_collection.group_slug||' · '||v_collection.edition||case when v_grade='UR' then ' UR' else ' 100%' end)
     on conflict(group_slug,edition,kind) do nothing;
     select id into v_frame from public.itm_profile_frames
     where group_slug=v_collection.group_slug and edition=v_collection.edition
       and kind=case when v_grade='UR' then 'ur' else 'collection' end;
     if v_frame is not null then
      insert into public.itm_player_frames(player_id,frame_id) values(p_player,v_frame) on conflict do nothing;
     end if;
   end if;
  end loop;
 end loop;
 return v_new_count;
end;$body$;
revoke all on function private.itm_grant_collection_rewards(uuid) from public,anon,authenticated;

create or replace function public.itm_sync_collection_rewards()
returns jsonb language plpgsql volatile security definer set search_path=''
as $body$
declare v_player uuid;v_new integer;v_profile public.itm_profiles%rowtype;v_balance bigint;
begin
 if auth.uid() is null or (auth.jwt()->'app_metadata'->>'itm_named_account') is distinct from 'true'
 then raise exception 'Registered ITM account required' using errcode='28000';end if;
 v_player:=private.ensure_player();
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_player::text,927134));
 v_new:=private.itm_grant_collection_rewards(v_player);
 select * into v_profile from public.itm_profiles where player_id=v_player;
 select balance into v_balance from public.itm_wallets where player_id=v_player;
 return jsonb_build_object('new_count',v_new,'experience',v_profile.experience,
  'level',v_profile.level,'balance',v_balance);
end;$body$;
revoke all on function public.itm_sync_collection_rewards() from public,anon;
grant execute on function public.itm_sync_collection_rewards() to authenticated;

create or replace function public.itm_check_anniversaries()
returns jsonb language plpgsql volatile security definer set search_path=''
as $body$
declare v_player uuid;v_profile public.itm_profiles%rowtype;v_event public.itm_anniversaries%rowtype;
 v_year integer;v_month integer;v_day integer;v_new uuid;v_greetings jsonb:='[]'::jsonb;
begin
 if auth.uid() is null or (auth.jwt()->'app_metadata'->>'itm_named_account') is distinct from 'true'
 then raise exception 'Registered ITM account required' using errcode='28000';end if;
 v_player:=private.ensure_player();
 select * into v_profile from public.itm_profiles where player_id=v_player;
 v_year:=extract(year from now() at time zone 'Asia/Seoul')::integer;
 v_month:=extract(month from now() at time zone 'Asia/Seoul')::integer;
 v_day:=extract(day from now() at time zone 'Asia/Seoul')::integer;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_player::text,927139));
 for v_event in select * from public.itm_anniversaries where active=true
  and ((kind='global' and month=v_month and day=v_day) or
       (kind='birthday' and v_profile.birthday_month=v_month and v_profile.birthday_day=v_day))
  order by kind desc,title loop
   v_new:=null;
   insert into public.itm_anniversary_awards(player_id,event_id,year)
   values(v_player,v_event.id,v_year) on conflict do nothing returning event_id into v_new;
   if v_new is null then continue;end if;
   insert into public.itm_mailbox(player_id,subject,message,reward_m,source_key)
   values(v_player,v_event.title||' ✦',
    coalesce(v_event.message,'')||E'\n기념일을 축하합니다. 선물을 수령해 주세요.',
    v_event.reward_m,'event:'||v_event.id::text||':'||v_year)
   on conflict (player_id,source_key) where source_key is not null do nothing;
   v_greetings:=v_greetings||jsonb_build_array(jsonb_build_object(
     'id',v_event.id,'title',v_event.title,
     'greeting',replace(v_event.greeting,'{nickname}',v_profile.nickname),
     'message',v_event.message,'image_path',v_event.image_path,
     'reward_m',v_event.reward_m));
 end loop;
 return v_greetings;
end;$body$;
revoke all on function public.itm_check_anniversaries() from public,anon;
grant execute on function public.itm_check_anniversaries() to authenticated;

-- Existing managed draws now update XP (10/card + 40/new unique card) and milestone rewards in one transaction.
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
 if p_count not in (1,5,11) then raise exception 'Invalid pack size'; end if;
 select * into v_pack from public.itm_packs where id=p_pack_id and active=true;
 if not found then raise exception 'Pack is unavailable'; end if;
 v_player:=private.ensure_player();
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_player::text,927134));
 if exists(select 1 from public.itm_card_pack_rolls where player_id=v_player and created_at>now()-interval '3 seconds')
 then raise exception 'Pack opening cooldown'; end if;
 -- Charge in this same transaction as card grants; administrator bypass is server-authorized.
 v_price:=case p_count when 1 then 100 when 5 then 500 when 11 then 1000 end;
 if not private.itm_is_studio_admin() then
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
grant execute on function private.itm_draw_managed_pack(integer,uuid) to authenticated;
