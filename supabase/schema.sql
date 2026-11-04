-- ENCORE 001 — fresh, completely separate Supabase project ONLY.
-- Do NOT execute in RKBO-ONLINE.
-- Demo odds: Common 55%, Rare 30%, Epic 12%, Legendary 2.5%, Mythic 0.5%.
-- Assumes default Supabase Auth has been configured with Google sign-in.

create table public.idol_cards (
  id text primary key,
  display_name text not null,
  group_name text not null,
  edition text not null default 'DEBUT COLLECTION',
  rarity text not null check (rarity in ('COMMON','RARE','EPIC','LEGENDARY','MYTHIC')),
  image_url text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.user_inventory (
  user_id uuid not null references auth.users(id) on delete cascade,
  card_id text not null references public.idol_cards(id),
  quantity integer not null default 1 check (quantity > 0),
  updated_at timestamptz not null default now(),
  primary key (user_id,card_id)
);

create table public.pack_rolls (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pack_size integer not null check (pack_size in (1,5)),
  result jsonb not null,
  created_at timestamptz not null default now()
);

create index pack_rolls_user_created_idx on public.pack_rolls (user_id, created_at desc);

alter table public.idol_cards enable row level security;
alter table public.user_inventory enable row level security;
alter table public.pack_rolls enable row level security;

create policy idol_cards_public_read on public.idol_cards
  for select to anon, authenticated using (active);
create policy inventory_owner_read on public.user_inventory
  for select to authenticated using ((select auth.uid()) = user_id);
create policy pack_rolls_owner_read on public.pack_rolls
  for select to authenticated using ((select auth.uid()) = user_id);

revoke all on public.idol_cards from anon, authenticated;
revoke all on public.user_inventory from anon, authenticated;
revoke all on public.pack_rolls from anon, authenticated;
grant select on public.idol_cards to anon, authenticated;
grant select on public.user_inventory to authenticated;
grant select on public.pack_rolls to authenticated;

-- These IDs match the 3D demo illustrations; replace with licensed art/cards later.
insert into public.idol_cards (id,display_name,group_name,edition,rarity) values
('lumina-lyra','LYRA','LUMINA','DEBUT COLLECTION','COMMON'),
('lumina-miu','MIU','LUMINA','DEBUT COLLECTION','COMMON'),
('lumina-sol','SOLI','LUMINA','DEBUT COLLECTION','COMMON'),
('novus-nix','NIX','NOVUS','DEBUT COLLECTION','COMMON'),
('novus-via','VIA','NOVUS','DEBUT COLLECTION','COMMON'),
('lumina-lyra-rare','LYRA','LUMINA','DEBUT COLLECTION','RARE'),
('novus-nix-rare','NIX','NOVUS','DEBUT COLLECTION','RARE'),
('novus-via-rare','VIA','NOVUS','DEBUT COLLECTION','RARE'),
('lumina-miu-rare','MIU','LUMINA','DEBUT COLLECTION','RARE'),
('lumina-sol-epic','SOLI','LUMINA','DEBUT COLLECTION','EPIC'),
('novus-via-epic','VIA','NOVUS','DEBUT COLLECTION','EPIC'),
('lumina-lyra-epic','LYRA','LUMINA','DEBUT COLLECTION','EPIC'),
('lumina-miu-legendary','MIU','LUMINA','DEBUT COLLECTION','LEGENDARY'),
('novus-nix-legendary','NIX','NOVUS','DEBUT COLLECTION','LEGENDARY'),
('lumina-lyra-mythic','LYRA','LUMINA','DEBUT COLLECTION','MYTHIC'),
('novus-via-mythic','VIA','NOVUS','DEBUT COLLECTION','MYTHIC');

-- Internal elevated function. No free-form parameters for rarity, card ID or user ID.
-- The public API cannot directly INSERT inventory or fake card results.
create or replace function public.open_idol_pack(p_count integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_roll double precision;
  v_rarity text;
  v_card public.idol_cards%rowtype;
  v_result jsonb := '[]'::jsonb;
  i integer;
begin
  if v_user is null then
    raise exception 'Sign-in required' using errcode='28000';
  end if;
  if p_count is null or p_count not in (1,5) then
    raise exception 'Pack size must be 1 or 5' using errcode='22023';
  end if;
  -- Serialize simultaneous openings by the same account.
  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 29031));
  if exists (
    select 1 from public.pack_rolls r
    where r.user_id=v_user and r.created_at>now()-interval '2 seconds'
  ) then
    raise exception 'Please wait before opening another pack' using errcode='22023';
  end if;

  for i in 1..p_count loop
    v_roll := random()*100;
    v_rarity := case
      when v_roll < 0.5 then 'MYTHIC'
      when v_roll < 3 then 'LEGENDARY'
      when v_roll < 15 then 'EPIC'
      when v_roll < 45 then 'RARE'
      else 'COMMON' end;
    select * into v_card
    from public.idol_cards c
    where c.active and c.rarity=v_rarity
    order by random() limit 1;
    if not found then
      raise exception 'No active cards in rarity %',v_rarity using errcode='22023';
    end if;
    insert into public.user_inventory (user_id,card_id,quantity,updated_at)
    values (v_user,v_card.id,1,now())
    on conflict (user_id,card_id) do update
      set quantity=public.user_inventory.quantity+1,updated_at=now();
    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'id',v_card.id,'name',v_card.display_name,'group',v_card.group_name,
      'rarity',v_card.rarity,'edition',v_card.edition,'image_url',v_card.image_url
    ));
  end loop;
  insert into public.pack_rolls(user_id,pack_size,result)
  values (v_user,p_count,v_result);
  return v_result;
end;
$$;

revoke all on function public.open_idol_pack(integer) from public, anon;
grant execute on function public.open_idol_pack(integer) to authenticated;


-- Security hardening: keep elevated mutation logic outside the exposed public schema.
-- The published RPC is a SECURITY INVOKER wrapper; the private function checks auth.uid().
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
alter function public.open_idol_pack(integer) set schema private;
revoke all on function private.open_idol_pack(integer) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.open_idol_pack(integer) to authenticated;
create function public.open_idol_pack(p_count integer)
returns jsonb language sql security invoker set search_path=''
as $$ select private.open_idol_pack(p_count); $$;
revoke all on function public.open_idol_pack(integer) from public, anon;
grant execute on function public.open_idol_pack(integer) to authenticated;

-- Basic verification after running on the new Supabase project:
-- select rarity,count(*) from public.idol_cards group by rarity order by rarity;
-- select relname,relrowsecurity from pg_class where relname in ('idol_cards','user_inventory','pack_rolls');
-- select has_function_privilege('anon','public.open_idol_pack(integer)','execute');  -- must be false