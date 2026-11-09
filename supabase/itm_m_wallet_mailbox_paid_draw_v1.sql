-- ITM Moment (M) wallet, in-app mailbox and paid pack draws.
-- No signup grants or daily rewards are created by this migration.
create table if not exists public.itm_wallets (
  player_id uuid primary key references private.player_accounts(id) on delete cascade,
  balance bigint not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);
create table if not exists public.itm_mailbox (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references private.player_accounts(id) on delete cascade,
  subject text not null check (char_length(subject) between 1 and 120),
  message text not null default '',
  reward_m bigint not null default 0 check (reward_m between 0 and 1000000000),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  claimed_at timestamptz
);
create index if not exists itm_mailbox_player_created_idx on public.itm_mailbox(player_id,created_at desc);
alter table public.itm_wallets enable row level security;
alter table public.itm_mailbox enable row level security;
revoke all on public.itm_wallets from public,anon,authenticated;
revoke all on public.itm_mailbox from public,anon,authenticated;
grant select on public.itm_wallets,public.itm_mailbox to authenticated;
drop policy if exists itm_wallet_owner_read on public.itm_wallets;
create policy itm_wallet_owner_read on public.itm_wallets
  for select to authenticated using (player_id=(select private.current_player_id()));
drop policy if exists itm_mailbox_owner_read on public.itm_mailbox;
create policy itm_mailbox_owner_read on public.itm_mailbox
  for select to authenticated using (player_id=(select private.current_player_id()));

-- Wallet initialization: always zero until explicitly credited.
create or replace function public.itm_get_wallet()
returns bigint language plpgsql volatile security definer set search_path=''
as $body$
declare v_player uuid;v_balance bigint;
begin
 if auth.uid() is null or (auth.jwt()->'app_metadata'->>'itm_named_account') is distinct from 'true'
 then raise exception 'ITM named account required' using errcode='28000';end if;
 v_player:=private.ensure_player();
 insert into public.itm_wallets(player_id) values(v_player) on conflict do nothing;
 select balance into v_balance from public.itm_wallets where player_id=v_player;
 return v_balance;
end;
$body$;
revoke all on function public.itm_get_wallet() from public,anon;
grant execute on function public.itm_get_wallet() to authenticated;

-- Open a message (read receipt only).
create or replace function public.itm_read_mail(p_mail_id uuid)
returns boolean language plpgsql volatile security definer set search_path=''
as $body$
declare v_player uuid;
begin
 if auth.uid() is null or (auth.jwt()->'app_metadata'->>'itm_named_account') is distinct from 'true'
 then raise exception 'ITM named account required' using errcode='28000';end if;
 v_player:=private.ensure_player();
 update public.itm_mailbox set read_at=coalesce(read_at,now())
 where id=p_mail_id and player_id=v_player;
 return found;
end;
$body$;
revoke all on function public.itm_read_mail(uuid) from public,anon;
grant execute on function public.itm_read_mail(uuid) to authenticated;

-- Idempotent and atomic mail claiming.
create or replace function public.itm_claim_mail(p_mail_id uuid)
returns jsonb language plpgsql volatile security definer set search_path=''
as $body$
declare v_player uuid;v_mail public.itm_mailbox%rowtype;v_balance bigint;
begin
 if auth.uid() is null or (auth.jwt()->'app_metadata'->>'itm_named_account') is distinct from 'true'
 then raise exception 'ITM named account required' using errcode='28000';end if;
 v_player:=private.ensure_player();
 select * into v_mail from public.itm_mailbox where id=p_mail_id and player_id=v_player for update;
 if not found then raise exception 'Mail not found' using errcode='22023';end if;
 insert into public.itm_wallets(player_id) values(v_player) on conflict do nothing;
 if v_mail.claimed_at is null then
   update public.itm_wallets set balance=balance+v_mail.reward_m,updated_at=now()
   where player_id=v_player returning balance into v_balance;
   update public.itm_mailbox set read_at=coalesce(read_at,now()),claimed_at=now() where id=p_mail_id;
 else
   select balance into v_balance from public.itm_wallets where player_id=v_player;
 end if;
 return pg_catalog.jsonb_build_object('balance',v_balance,'claimed',v_mail.claimed_at is null);
end;
$body$;
revoke all on function public.itm_claim_mail(uuid) from public,anon;
grant execute on function public.itm_claim_mail(uuid) to authenticated;

-- Manually send mail to a registered username (admin-only, checked in DB).
create or replace function public.itm_admin_send_mail(
 p_username text,p_subject text,p_message text,p_reward_m bigint default 0)
returns uuid language plpgsql volatile security definer set search_path=''
as $body$
declare v_player uuid;v_id uuid;
begin
 if not private.itm_is_studio_admin() then
   raise exception 'Admin required' using errcode='28000';end if;
 if p_username is null or p_username !~ '^[a-z][a-z0-9_]{3,19}$'
    or char_length(btrim(coalesce(p_subject,''))) not between 1 and 120
    or char_length(coalesce(p_message,'')) > 5000
    or p_reward_m is null or p_reward_m not between 0 and 1000000000
 then raise exception 'Invalid mail details' using errcode='22023';end if;
 select d.player_id into v_player
 from auth.users u join private.player_devices d on d.user_id=u.id
 where u.email='itm.'||p_username||'@accounts.itm.example'
   and u.raw_app_meta_data->>'itm_named_account'='true'
 limit 1;
 if v_player is null then raise exception 'Account not found (user must have logged in once)' using errcode='22023';end if;
 insert into public.itm_mailbox(player_id,subject,message,reward_m)
 values(v_player,btrim(p_subject),coalesce(p_message,''),p_reward_m)
 returning id into v_id;
 return v_id;
end;
$body$;
revoke all on function public.itm_admin_send_mail(text,text,text,bigint) from public,anon;
grant execute on function public.itm_admin_send_mail(text,text,text,bigint) to authenticated;

-- Replace the currently deployed per-pack-odds, 11-card draw implementation.
create or replace function private.itm_draw_managed_pack(p_count integer,p_pack_id uuid)
returns jsonb language plpgsql volatile security definer set search_path=''
as $body$
declare
 v_player uuid; v_pack public.itm_packs%rowtype; v_rarity text;
 v_card public.itm_catalog%rowtype; v_result jsonb:='[]'::jsonb;
 v_total numeric; v_roll numeric; v_candidate record; i integer; v_price bigint;
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
-- Close historical free-draw RPCs that otherwise bypass the M wallet.
revoke all on function public.itm_open_card_pack(integer) from public,anon,authenticated;
revoke all on function public.itm_open_demo_pack(integer) from public,anon,authenticated;
revoke all on function public.open_idol_pack(integer) from public,anon,authenticated;
revoke all on function private.itm_draw_cards(integer) from public,anon,authenticated;
revoke all on function private.itm_demo_draw(integer) from public,anon,authenticated;
