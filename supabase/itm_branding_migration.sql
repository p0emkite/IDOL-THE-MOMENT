-- ITM brand / recovery-code prefix migration — use ONLY on the ITM Supabase project.
-- No data deleted or modified. Legacy EN codes remain accepted for existing users.
-- This migration has already been applied to the linked ENCORE-IDOL-CARDS project.

create or replace function private.issue_recovery_code()
returns text language plpgsql security definer set search_path = ''
as $$
declare
  v_player uuid := private.ensure_player();
  v_hex text := upper(encode(extensions.gen_random_bytes(16),'hex'));
  v_normalized text := 'IT' || v_hex;
begin
  insert into private.recovery_codes(player_id,code_hash,issued_at)
  values (v_player,extensions.digest(v_normalized,'sha256'),now())
  on conflict (player_id) do update
  set code_hash=excluded.code_hash,issued_at=now();
  -- 128-bit cryptographic secret, shown only once. Only its SHA-256 hash is stored.
  return 'IT-' || substring(v_hex,1,4) || '-' || substring(v_hex,5,4)
    || '-' || substring(v_hex,9,4) || '-' || substring(v_hex,13,4)
    || '-' || substring(v_hex,17,4) || '-' || substring(v_hex,21,4)
    || '-' || substring(v_hex,25,4) || '-' || substring(v_hex,29,4);
end;
$$;

create or replace function private.recover_player(p_code text, p_allow_switch boolean default false)
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
  if v_normalized !~ '^(EN|IT)[0-9A-F]{32}$' then
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