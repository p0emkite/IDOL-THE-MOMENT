-- ITM journey titles, and studio-admin mission rule configuration.
create table if not exists public.itm_journey_titles(
 achievement_key text primary key references public.itm_journey_rules(key) on delete cascade,
 label text not null check(length(label) between 1 and 80),
 sort_order integer not null default 0
);
insert into public.itm_journey_titles(achievement_key,label,sort_order)
values
 ('first_ur','✦ FIRST UR',10),
 ('unique_30','✧ MOMENT COLLECTOR',20),
 ('pulls_200','✧ MEMORY KEEPER',30),
 ('unique_50','✦ ARCHIVE MASTER',40),
 ('visits_30','✦ LOYAL FAN',50),
 ('tasks_200','✦ THE MOMENT MASTER',60)
on conflict(achievement_key) do nothing;
alter table public.itm_journey_titles enable row level security;
revoke all on public.itm_journey_titles from public,anon,authenticated;
grant select on public.itm_journey_titles to anon,authenticated;
create policy itm_journey_titles_read on public.itm_journey_titles for select to anon,authenticated using(true);
alter table public.itm_profiles add column if not exists selected_title_key text
 references public.itm_journey_titles(achievement_key) on delete set null;

create or replace function public.itm_select_journey_title(p_key text default null)
returns jsonb language plpgsql volatile security definer set search_path=''
as $body$
declare v_player uuid;v_label text;
begin
 if auth.uid() is null or (auth.jwt()->'app_metadata'->>'itm_named_account') is distinct from 'true'
 then raise exception 'Registered ITM account required' using errcode='28000';end if;
 v_player:=private.ensure_player();
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_player::text,927134));
 if p_key is not null and p_key<>'' then
  select t.label into v_label from public.itm_journey_titles t
  where t.achievement_key=p_key and exists(
    select 1 from public.itm_journey_achievement_claims c
    where c.player_id=v_player and c.achievement_key=p_key);
  if v_label is null then raise exception 'Title not unlocked';end if;
 else p_key:=null;end if;
 update public.itm_profiles set selected_title_key=p_key,updated_at=now()
 where player_id=v_player;
 return jsonb_build_object('selected_title_key',p_key,'label',v_label);
end;$body$;
revoke all on function public.itm_select_journey_title(text) from public,anon;
grant execute on function public.itm_select_journey_title(text) to authenticated;

create or replace function public.itm_admin_update_journey_rule(
 p_key text,p_target integer,p_reward_m integer,p_reward_xp integer,p_active boolean)
returns jsonb language plpgsql volatile security definer set search_path=''
as $body$
declare v_result public.itm_journey_rules%rowtype;
begin
 if not private.itm_is_studio_admin() then raise exception 'Studio administrator required' using errcode='28000';end if;
 if p_target is null or p_target not between 1 and 10000
   or p_reward_m is null or p_reward_m not between 0 and 100000
   or p_reward_xp is null or p_reward_xp not between 0 and 100000
   or p_active is null
 then raise exception 'Invalid mission rule';end if;
 update public.itm_journey_rules set target=p_target,reward_m=p_reward_m,reward_xp=p_reward_xp,active=p_active
 where key=p_key returning * into v_result;
 if not found then raise exception 'Rule not found';end if;
 return to_jsonb(v_result);
end;$body$;
revoke all on function public.itm_admin_update_journey_rule(text,integer,integer,integer,boolean) from public,anon;
grant execute on function public.itm_admin_update_journey_rule(text,integer,integer,integer,boolean) to authenticated;
