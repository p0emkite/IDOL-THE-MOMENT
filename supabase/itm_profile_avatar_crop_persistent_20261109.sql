-- Preserve per-player avatar crop across devices; only owned cards can be equipped.
alter table public.itm_profiles
 add column if not exists avatar_zoom numeric(5,3) not null default 1 check(avatar_zoom between 0.5 and 5),
 add column if not exists avatar_x numeric(5,3) not null default 0 check(avatar_x between -1.5 and 1.5),
 add column if not exists avatar_y numeric(5,3) not null default 0 check(avatar_y between -1.5 and 1.5);

create or replace function public.itm_set_profile_avatar_crop(
 p_card_id uuid,p_zoom numeric,p_x numeric,p_y numeric)
returns jsonb language plpgsql volatile security definer set search_path=''
as $body$
declare v_player uuid;
begin
 if auth.uid() is null or (auth.jwt()->'app_metadata'->>'itm_named_account') is distinct from 'true'
 then raise exception 'Registered ITM account required' using errcode='28000';end if;
 if p_zoom is null or p_zoom not between 0.5 and 5
  or p_x is null or p_x not between -1.5 and 1.5
  or p_y is null or p_y not between -1.5 and 1.5
 then raise exception 'Invalid crop values' using errcode='22023';end if;
 v_player:=private.ensure_player();
 if p_card_id is not null and not exists(
  select 1 from public.itm_card_inventory
  where player_id=v_player and card_id=p_card_id and quantity>0)
 then raise exception 'Only collected cards can be used as a profile picture';end if;
 update public.itm_profiles
 set avatar_card_id=p_card_id,avatar_zoom=p_zoom,avatar_x=p_x,avatar_y=p_y,updated_at=now()
 where player_id=v_player;
 return public.itm_get_profile();
end;
$body$;
revoke all on function public.itm_set_profile_avatar_crop(uuid,numeric,numeric,numeric) from public,anon;
grant execute on function public.itm_set_profile_avatar_crop(uuid,numeric,numeric,numeric) to authenticated;