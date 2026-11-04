-- ITM named accounts: applied on 2026-11-04 to the ITM-only Supabase project.
-- DO NOT run on RTM (RKBO-ONLINE). Safe to review/replay on ITM; no collections are deleted.
-- This is the combined, current definition of the two database migrations
-- itm_named_accounts_demo_inventory and itm_named_accounts_only_demo_access.
create table if not exists public.itm_demo_inventory(
 player_id uuid not null references private.player_accounts(id) on delete cascade,
 card_id text not null check(card_id in('itm-demo-n','itm-demo-r','itm-demo-sr','itm-demo-ssr','itm-demo-ur')),
 quantity integer not null default 1 check(quantity between 1 and 1000000),
 updated_at timestamptz not null default now(),
 primary key(player_id,card_id)
);
alter table public.itm_demo_inventory enable row level security;
revoke all on public.itm_demo_inventory from public,anon,authenticated;
grant select on public.itm_demo_inventory to authenticated;
drop policy if exists itm_demo_inventory_owner_read on public.itm_demo_inventory;
create policy itm_demo_inventory_owner_read on public.itm_demo_inventory
for select to authenticated using(
 player_id=(select private.current_player_id())
 and (select auth.jwt()->'app_metadata'->>'itm_named_account')='true'
);
create table if not exists private.itm_demo_imported(
 player_id uuid primary key references private.player_accounts(id) on delete cascade,
 imported_at timestamptz not null default now()
);
alter table private.itm_demo_imported enable row level security;
revoke all on private.itm_demo_imported from public,anon,authenticated;
create table if not exists public.itm_signup_limits(
 client_hash text primary key,
 attempts integer not null default 0,
 window_started_at timestamptz not null default now()
);
alter table public.itm_signup_limits enable row level security;
revoke all on public.itm_signup_limits from public,anon,authenticated;
grant select,insert,update on public.itm_signup_limits to service_role;

create or replace function private.itm_demo_draw(p_count integer)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
 v_player uuid := private.ensure_player();
 v_ids text[];
 v_id text;
 v_roll double precision;
 v_result jsonb := '[]'::jsonb;
begin
 if auth.uid() is null then raise exception 'Sign-in required'; end if;
 if p_count not in(1,5) then raise exception 'Only 1 or 5 cards'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_player::text,783219));
 if p_count=5 then
   select array_agg(x.id order by random()) into v_ids
   from unnest(array['itm-demo-n','itm-demo-r','itm-demo-sr','itm-demo-ssr','itm-demo-ur']) as x(id);
 else
   v_roll:=random()*100;
   v_ids:=array[case when v_roll<55 then 'itm-demo-n'
   when v_roll<83 then 'itm-demo-r'
   when v_roll<95 then 'itm-demo-sr'
   when v_roll<99 then 'itm-demo-ssr'
   else 'itm-demo-ur' end];
 end if;
 foreach v_id in array v_ids loop
   insert into public.itm_demo_inventory(player_id,card_id,quantity,updated_at)
   values(v_player,v_id,1,now())
   on conflict(player_id,card_id) do update
   set quantity=public.itm_demo_inventory.quantity+1,updated_at=now();
   v_result:=v_result||jsonb_build_array(jsonb_build_object('id',v_id));
 end loop;
 return v_result;
end;
$$;
create or replace function private.itm_demo_import_guest(p_items jsonb)
returns boolean language plpgsql security definer set search_path=''
as $$
declare
 v_player uuid := private.ensure_player();
 v_claim uuid;
 v_key text;
 v_value text;
 v_qty integer;
begin
 if auth.uid() is null then raise exception 'Sign-in required'; end if;
 if jsonb_typeof(p_items) is distinct from 'object' then raise exception 'Invalid inventory'; end if;
 if octet_length(p_items::text)>3000 then raise exception 'Inventory too large'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_player::text,783220));
 insert into private.itm_demo_imported(player_id) values(v_player)
 on conflict do nothing returning player_id into v_claim;
 if v_claim is null then return false; end if;
 for v_key,v_value in select key,value from jsonb_each_text(p_items) loop
   if v_key in('itm-demo-n','itm-demo-r','itm-demo-sr','itm-demo-ssr','itm-demo-ur')
   and v_value ~ '^[0-9]{1,6}$' then
     v_qty:=least(v_value::integer,10000);
     if v_qty>0 then
       insert into public.itm_demo_inventory(player_id,card_id,quantity,updated_at)
       values(v_player,v_key,v_qty,now())
       on conflict(player_id,card_id) do update
       set quantity=least(1000000,public.itm_demo_inventory.quantity+excluded.quantity),
       updated_at=now();
     end if;
   end if;
 end loop;
 return true;
end;
$$;
create or replace function private.itm_allow_signup(p_client_hash text)
returns boolean language plpgsql security definer set search_path=''
as $$
declare v_attempts integer;
begin
 if coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role'
 then raise exception 'Service role only' using errcode='28000'; end if;
 if length(p_client_hash)<>64 or p_client_hash !~ '^[a-f0-9]+$' then return false; end if;
 insert into public.itm_signup_limits as t(client_hash,attempts,window_started_at)
 values(p_client_hash,1,now())
 on conflict(client_hash) do update set
 attempts=case when t.window_started_at<now()-interval '1 hour' then 1 else t.attempts+1 end,
 window_started_at=case when t.window_started_at<now()-interval '1 hour' then now() else t.window_started_at end
 returning attempts into v_attempts;
 return v_attempts<=8;
end;
$$;
create or replace function public.itm_open_demo_pack(p_count integer)
returns jsonb language plpgsql security invoker set search_path=''
as $$
begin
 if (auth.jwt()->'app_metadata'->>'itm_named_account') is distinct from 'true'
 then raise exception 'Registered ITM account required' using errcode='28000'; end if;
 return private.itm_demo_draw(p_count);
end;
$$;
create or replace function public.itm_import_guest_demo(p_items jsonb)
returns boolean language plpgsql security invoker set search_path=''
as $$
begin
 if (auth.jwt()->'app_metadata'->>'itm_named_account') is distinct from 'true'
 then raise exception 'Registered ITM account required' using errcode='28000'; end if;
 return private.itm_demo_import_guest(p_items);
end;
$$;
create or replace function public.itm_signup_attempt(p_client_hash text)
returns boolean language sql security invoker set search_path=''
as $$select private.itm_allow_signup(p_client_hash);$$;

revoke all on function private.itm_demo_draw(integer) from public,anon,authenticated;
revoke all on function private.itm_demo_import_guest(jsonb) from public,anon,authenticated;
revoke all on function private.itm_allow_signup(text) from public,anon,authenticated;
grant execute on function private.itm_demo_draw(integer) to authenticated;
grant execute on function private.itm_demo_import_guest(jsonb) to authenticated;
grant execute on function private.itm_allow_signup(text) to service_role;
revoke all on function public.itm_open_demo_pack(integer) from public,anon;
revoke all on function public.itm_import_guest_demo(jsonb) from public,anon;
revoke all on function public.itm_signup_attempt(text) from public,anon,authenticated;
grant execute on function public.itm_open_demo_pack(integer) to authenticated;
grant execute on function public.itm_import_guest_demo(jsonb) to authenticated;
grant execute on function public.itm_signup_attempt(text) to service_role;
