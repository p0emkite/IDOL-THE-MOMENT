-- Managed pack draw. The default itm_open_card_pack(integer) remains unchanged.
-- Requires ITM named account and published cards satisfying the selected pack filters.
alter table public.itm_card_pack_rolls
 add column if not exists pack_id uuid references public.itm_packs(id) on delete set null;
create or replace function private.itm_draw_managed_pack(p_count integer,p_pack_id uuid)
returns jsonb language plpgsql volatile security definer set search_path=''
as $body$
declare
 v_player uuid; v_pack public.itm_packs%rowtype; v_rarity text;
 v_card public.itm_catalog%rowtype; v_result jsonb:='[]'::jsonb;
 v_total numeric; v_roll numeric; v_candidate record; i integer;
begin
 if auth.uid() is null or coalesce(auth.jwt()->'app_metadata'->>'itm_named_account','')<>'true'
 then raise exception 'ITM named account required' using errcode='28000'; end if;
 if p_count not in (1,5) then raise exception 'Invalid pack size'; end if;
 select * into v_pack from public.itm_packs where id=p_pack_id and active=true;
 if not found then raise exception 'Pack is unavailable'; end if;
 v_player:=private.ensure_player();
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_player::text,927134));
 if exists(select 1 from public.itm_card_pack_rolls where player_id=v_player and created_at>now()-interval '3 seconds')
 then raise exception 'Pack opening cooldown'; end if;
 for i in 1..p_count loop
  with eligible_rarities as (
   select distinct c.rarity from public.itm_catalog c where c.status='published'
    and (cardinality(v_pack.group_slugs)=0 or c.group_slug=any(v_pack.group_slugs))
    and (v_pack.series_filters='[]'::jsonb or exists(
     select 1 from jsonb_array_elements(v_pack.series_filters) f
     where f->>'group_slug'=c.group_slug and f->>'name'=c.edition))
  ), weighted as (
   select e.rarity,case e.rarity when 'N' then 55 when 'R' then 28
     when 'SR' then 12 when 'SSR' then 4 else 1 end as weight
   from eligible_rarities e
  )
  select coalesce(sum(weight),0) into v_total from weighted;
  if v_total<=0 then raise exception 'No published cards match this pack'; end if;
  v_roll:=random()*v_total;
  for v_candidate in
   select e.rarity,case e.rarity when 'N' then 55 when 'R' then 28
      when 'SR' then 12 when 'SSR' then 4 else 1 end as weight
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
  insert into public.itm_card_inventory(player_id,card_id,quantity)
    values(v_player,v_card.id,1)
    on conflict(player_id,card_id) do update
    set quantity=least(1000000,public.itm_card_inventory.quantity+1),updated_at=now();
  v_result:=v_result||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('id',v_card.id::text));
 end loop;
 insert into public.itm_card_pack_rolls(player_id,pack_size,pack_id,result)
  values(v_player,p_count,p_pack_id,v_result);
 return v_result;
end;
$body$;
revoke all on function private.itm_draw_managed_pack(integer,uuid) from public,anon;
grant execute on function private.itm_draw_managed_pack(integer,uuid) to authenticated;
create or replace function public.itm_open_managed_pack(p_count integer,p_pack_id uuid)
returns jsonb language sql volatile security invoker set search_path=''
as $body$ select private.itm_draw_managed_pack(p_count,p_pack_id) $body$;
revoke all on function public.itm_open_managed_pack(integer,uuid) from public,anon;
grant execute on function public.itm_open_managed_pack(integer,uuid) to authenticated;
