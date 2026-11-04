-- ENCORE 002 | Anonymous guest identities with device-independent recovery codes.
-- Apply ONLY to Supabase project ENCORE-IDOL-CARDS (NOT RKBO-ONLINE).
-- The initial demo inventory/roll tables are empty. This migration replaces those tables.
-- Anonymous sign-ins must be enabled in Supabase Dashboard > Auth > Providers.

-- Previous demonstration identity-based tables and functions are not needed.
drop function if exists public.open_idol_pack(integer);
drop function if exists private.open_idol_pack(integer);
drop table if exists public.user_inventory;
drop table if exists public.pack_rolls;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

-- Private ownership mapping separates a player's collection from a particular device login.
create table private.player_accounts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);
create table private.player_devices (
  user_id uuid primary key references auth.users(id) on delete cascade,
  player_id uuid not null references private.player_accounts(id) on delete cascade,
  linked_at timestamptz not null default now()
);
create index player_devices_player_idx on private.player_devices(player_id);
create table private.recovery_codes (
  player_id uuid primary key references private.player_accounts(id) on delete cascade,
  code_hash bytea not null unique,
  issued_at timestamptz not null default now()
);
create table private.recovery_attempts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  attempts integer not null default 0,
  window_started_at timestamptz not null default now()
);

alter table private.player_accounts enable row level security;
alter table private.player_devices enable row level security;
alter table private.recovery_codes enable row level security;
alter table private.recovery_attempts enable row level security;
revoke all on all tables in schema private from public, anon, authenticated;

-- SECURITY DEFINER functions are kept in non-exposed private schema. Functions
-- are scoped to the JWT's auth.uid(), not user-controlled IDs.
create function private.current_player_id()
returns uuid language sql stable security definer set search_path = ''
as $$
  select d.player_id from private.player_devices d
  where d.user_id = (select auth.uid());
$$;

create function private.ensure_player()
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_player uuid;
begin
  if v_user is null then
    raise exception 'Guest sign-in required' using errcode='28000';
  end if;
  select d.player_id into v_player from private.player_devices d where d.user_id = v_user;
  if v_player is not null then return v_player; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user::text, 9031));
  select d.player_id into v_player from private.player_devices d where d.user_id = v_user;
  if v_player is null then
    insert into private.player_accounts default values returning id into v_player;
    insert into private.player_devices(user_id, player_id) values (v_user, v_player);
  end if;
  return v_player;
end;
$$;

create function private.issue_recovery_code()
returns text language plpgsql security definer set search_path = ''
as $$
declare
  v_player uuid := private.ensure_player();
  v_hex text := upper(encode(extensions.gen_random_bytes(16),'hex'));
  v_normalized text := 'EN' || v_hex;
begin
  insert into private.recovery_codes(player_id,code_hash,issued_at)
  values (v_player,extensions.digest(v_normalized,'sha256'),now())
  on conflict (player_id) do update
  set code_hash=excluded.code_hash,issued_at=now();
  -- 128-bit cryptographic secret, shown only once. Only its SHA-256 hash is stored.
  return 'EN-' || substring(v_hex,1,4) || '-' || substring(v_hex,5,4)
    || '-' || substring(v_hex,9,4) || '-' || substring(v_hex,13,4)
    || '-' || substring(v_hex,17,4) || '-' || substring(v_hex,21,4)
    || '-' || substring(v_hex,25,4) || '-' || substring(v_hex,29,4);
end;
$$;

create function private.has_recovery_code()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from private.recovery_codes c
    where c.player_id=(select private.current_player_id())
  );
$$;

-- Failed recoveries return a JSON result (instead of an exception) so attempts
-- are committed, making the per-identity rate limit effective.
create function private.recover_player(p_code text, p_allow_switch boolean default false)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_normalized text;
  v_attempts integer;
  v_target uuid;
  v_current uuid;
  v_existing_count bigint;
begin
  if v_user is null then
    raise exception 'Guest sign-in required' using errcode='28000';
  end if;
  -- The advisory lock serializes recovery requests from this device user.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user::text, 14051));
  insert into private.recovery_attempts as a(user_id,attempts,window_started_at)
  values (v_user,1,now())
  on conflict (user_id) do update
  set attempts = case
    when a.window_started_at < now()-interval '15 minutes' then 1
    else a.attempts+1 end,
  window_started_at = case
    when a.window_started_at < now()-interval '15 minutes' then now()
    else a.window_started_at end
  returning attempts into v_attempts;
  if v_attempts > 5 then
    return jsonb_build_object('ok',false,'reason','rate_limited');
  end if;
  v_normalized := regexp_replace(upper(coalesce(p_code,'')), '[^0-9A-Z]', '', 'g');
  if v_normalized !~ '^EN[0-9A-F]{32}$' then
    return jsonb_build_object('ok',false,'reason','invalid_code');
  end if;
  select c.player_id into v_target
  from private.recovery_codes c
  where c.code_hash=extensions.digest(v_normalized,'sha256');
  if v_target is null then
    return jsonb_build_object('ok',false,'reason','invalid_code');
  end if;
  v_current := private.ensure_player();
  if v_target=v_current then
    return jsonb_build_object('ok',true,'already_linked',true);
  end if;
  select coalesce(sum(i.quantity),0) into v_existing_count
  from public.user_inventory i where i.player_id=v_current;
  if v_existing_count > 0 and not p_allow_switch then
    return jsonb_build_object('ok',false,'reason','confirm_switch','existing_cards',v_existing_count);
  end if;
  -- Do not merge or delete any existing collection: previous devices keep access.
  update private.player_devices
  set player_id=v_target,linked_at=now() where user_id=v_user;
  return jsonb_build_object('ok',true,'already_linked',false);
end;
$$;

-- Public API functions run as invoker and delegate to restricted private helpers.
create function public.ensure_guest_player()
returns uuid language sql security invoker set search_path=''
as $$select private.ensure_player();$$;
create function public.issue_recovery_code()
returns text language sql security invoker set search_path=''
as $$select private.issue_recovery_code();$$;
create function public.has_recovery_code()
returns boolean language sql security invoker set search_path=''
as $$select private.has_recovery_code();$$;
create function public.recover_player(p_code text,p_allow_switch boolean default false)
returns jsonb language sql security invoker set search_path=''
as $$select private.recover_player(p_code,p_allow_switch);$$;

-- All draws and inventory writes are server-owned, including for anonymous Auth users.
create table public.user_inventory (
  player_id uuid not null references private.player_accounts(id) on delete cascade,
  card_id text not null references public.idol_cards(id),
  quantity integer not null default 1 check(quantity > 0),
  updated_at timestamptz not null default now(),
  primary key (player_id,card_id)
);
create table public.pack_rolls (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references private.player_accounts(id) on delete cascade,
  pack_size integer not null check(pack_size in (1,5)),
  result jsonb not null,
  created_at timestamptz not null default now()
);
create index pack_rolls_player_created_idx on public.pack_rolls(player_id,created_at desc);
alter table public.user_inventory enable row level security;
alter table public.pack_rolls enable row level security;
create policy inventory_guest_member_read on public.user_inventory
  for select to authenticated
  using (player_id = (select private.current_player_id()));
create policy pack_rolls_guest_member_read on public.pack_rolls
  for select to authenticated
  using (player_id = (select private.current_player_id()));
revoke all on public.user_inventory from public, anon, authenticated;
revoke all on public.pack_rolls from public, anon, authenticated;
grant select on public.user_inventory to authenticated;
grant select on public.pack_rolls to authenticated;

create function private.open_idol_pack(p_count integer)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  v_player uuid := private.ensure_player();
  v_roll double precision;
  v_rarity text;
  v_card public.idol_cards%rowtype;
  v_result jsonb := '[]'::jsonb;
  i integer;
begin
  if p_count is null or p_count not in (1,5) then
    raise exception 'Pack size must be 1 or 5' using errcode='22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_player::text, 29031));
  if exists(select 1 from public.pack_rolls r
    where r.player_id=v_player and r.created_at>now()-interval '2 seconds') then
    raise exception 'Please wait before opening another pack' using errcode='22023';
  end if;
  for i in 1..p_count loop
    v_roll := random()*100;
    v_rarity := case
      when v_roll < .5 then 'MYTHIC'
      when v_roll < 3 then 'LEGENDARY'
      when v_roll < 15 then 'EPIC'
      when v_roll < 45 then 'RARE'
      else 'COMMON' end;
    select * into v_card from public.idol_cards c
    where c.active and c.rarity=v_rarity
    order by random() limit 1;
    if not found then
      raise exception 'No cards available in tier %',v_rarity using errcode='22023';
    end if;
    insert into public.user_inventory(player_id,card_id,quantity,updated_at)
    values (v_player,v_card.id,1,now())
    on conflict(player_id,card_id) do update
      set quantity=public.user_inventory.quantity+1,updated_at=now();
    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'id',v_card.id,'name',v_card.display_name,'group',v_card.group_name,
      'rarity',v_card.rarity,'edition',v_card.edition,'image_url',v_card.image_url
    ));
  end loop;
  insert into public.pack_rolls(player_id,pack_size,result)
  values (v_player,p_count,v_result);
  return v_result;
end;
$$;
create function public.open_idol_pack(p_count integer)
returns jsonb language sql security invoker set search_path=''
as $$select private.open_idol_pack(p_count);$$;

-- Default functions are executable by PUBLIC: explicitly revoke all.
revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function private.current_player_id() to authenticated;
grant execute on function private.ensure_player() to authenticated;
grant execute on function private.issue_recovery_code() to authenticated;
grant execute on function private.has_recovery_code() to authenticated;
grant execute on function private.recover_player(text,boolean) to authenticated;
grant execute on function private.open_idol_pack(integer) to authenticated;
revoke all on function public.ensure_guest_player() from public,anon;
revoke all on function public.issue_recovery_code() from public,anon;
revoke all on function public.has_recovery_code() from public,anon;
revoke all on function public.recover_player(text,boolean) from public,anon;
revoke all on function public.open_idol_pack(integer) from public,anon;
grant execute on function public.ensure_guest_player() to authenticated;
grant execute on function public.issue_recovery_code() to authenticated;
grant execute on function public.has_recovery_code() to authenticated;
grant execute on function public.recover_player(text,boolean) to authenticated;
grant execute on function public.open_idol_pack(integer) to authenticated;