-- Only the registration Edge Function's existing service role may call this RPC.
-- Execute as caller; no access to the private schema is required.
create or replace function public.itm_signup_attempt(p_client_hash text)
returns boolean language plpgsql security invoker set search_path=''
as $$
declare v_attempts integer;
begin
 if p_client_hash is null or p_client_hash !~ '^[a-f0-9]{64}$' then return false; end if;
 insert into public.itm_signup_limits as t(client_hash,attempts,window_started_at)
 values (p_client_hash,1,now())
 on conflict (client_hash) do update set
 attempts=case when t.window_started_at < now()-interval '1 hour' then 1 else t.attempts+1 end,
 window_started_at=case when t.window_started_at < now()-interval '1 hour' then now() else t.window_started_at end
 returning attempts into v_attempts;
 return v_attempts<=8;
end;
$$;
revoke all on function public.itm_signup_attempt(text) from public,anon,authenticated;
grant execute on function public.itm_signup_attempt(text) to service_role;
