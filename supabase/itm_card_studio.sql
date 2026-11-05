-- ITM CARD STUDIO v1 — additive migration, ITM Supabase project ONLY.
-- Separate from demo inventory; no existing cards/accounts are deleted.
create table if not exists private.itm_studio_admins(
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table private.itm_studio_admins enable row level security;
revoke all on private.itm_studio_admins from public,anon,authenticated;

create or replace function private.itm_is_studio_admin()
returns boolean language sql stable security definer set search_path=''
as $$
 select auth.uid() is not null
   and exists(select 1 from private.itm_studio_admins a where a.user_id=auth.uid())
   and coalesce(auth.jwt()->'app_metadata'->>'itm_named_account','')='true';
$$;
revoke all on function private.itm_is_studio_admin() from public,anon;
grant execute on function private.itm_is_studio_admin() to authenticated;

create or replace function public.itm_studio_is_admin()
returns boolean language sql stable security invoker set search_path=''
as $$ select private.itm_is_studio_admin(); $$;
revoke all on function public.itm_studio_is_admin() from public,anon;
grant execute on function public.itm_studio_is_admin() to authenticated;

create table if not exists public.itm_groups(
  slug text primary key check(slug ~ '^[a-z0-9][a-z0-9_-]{1,39}$'),
  name text not null check(length(btrim(name)) between 1 and 70),
  logo_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.itm_catalog(
  id uuid primary key default gen_random_uuid(),
  group_slug text not null references public.itm_groups(slug),
  display_name text not null check(length(btrim(display_name)) between 1 and 100),
  edition text not null default 'DEBUT COLLECTION' check(length(edition) between 1 and 100),
  rarity text not null check(rarity in ('N','R','SR','SSR','UR')),
  photo_path text not null default '',
  full_art_path text,
  photo_scale numeric(5,2) not null default 1 check(photo_scale between 1 and 4),
  photo_x numeric(5,3) not null default 0 check(photo_x between -1 and 1),
  photo_y numeric(5,3) not null default 0 check(photo_y between -1 and 1),
  status text not null default 'draft' check(status in ('draft','published')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(status<>'published' or photo_path<>'')
);
create index if not exists itm_catalog_status_rarity_idx on public.itm_catalog(status,rarity);
create index if not exists itm_catalog_group_idx on public.itm_catalog(group_slug);

create table if not exists public.itm_card_inventory(
 player_id uuid not null references private.player_accounts(id) on delete cascade,
 card_id uuid not null references public.itm_catalog(id),
 quantity int not null default 1 check(quantity between 1 and 1000000),
 updated_at timestamptz not null default now(),
 primary key(player_id,card_id)
);
create table if not exists public.itm_card_pack_rolls(
 id uuid primary key default gen_random_uuid(),
 player_id uuid not null references private.player_accounts(id) on delete cascade,
 pack_size int not null check(pack_size in (1,5)),
 result jsonb not null,
 created_at timestamptz not null default now()
);
create index if not exists itm_card_pack_rolls_player_idx
on public.itm_card_pack_rolls(player_id,created_at desc);

alter table public.itm_groups enable row level security;
alter table public.itm_catalog enable row level security;
alter table public.itm_card_inventory enable row level security;
alter table public.itm_card_pack_rolls enable row level security;
revoke all on public.itm_groups,public.itm_catalog,public.itm_card_inventory,
 public.itm_card_pack_rolls from public,anon,authenticated;
grant select on public.itm_groups,public.itm_catalog to anon,authenticated;
grant insert,update,delete on public.itm_groups,public.itm_catalog to authenticated;
grant select on public.itm_card_inventory,public.itm_card_pack_rolls to authenticated;

create policy itm_groups_read on public.itm_groups
 for select to anon,authenticated using(true);
create policy itm_groups_admin_insert on public.itm_groups
 for insert to authenticated with check((select private.itm_is_studio_admin()));
create policy itm_groups_admin_update on public.itm_groups
 for update to authenticated using((select private.itm_is_studio_admin()))
 with check((select private.itm_is_studio_admin()));
create policy itm_groups_admin_delete on public.itm_groups
 for delete to authenticated using((select private.itm_is_studio_admin()));
create policy itm_catalog_read on public.itm_catalog
 for select to anon,authenticated
 using(status='published' or (select private.itm_is_studio_admin()));
create policy itm_catalog_admin_insert on public.itm_catalog
 for insert to authenticated with check((select private.itm_is_studio_admin()));
create policy itm_catalog_admin_update on public.itm_catalog
 for update to authenticated using((select private.itm_is_studio_admin()))
 with check((select private.itm_is_studio_admin()));
create policy itm_catalog_admin_delete on public.itm_catalog
 for delete to authenticated using((select private.itm_is_studio_admin()));
create policy itm_card_inventory_owner_read on public.itm_card_inventory
 for select to authenticated using(player_id=(select private.current_player_id()));
create policy itm_card_rolls_owner_read on public.itm_card_pack_rolls
 for select to authenticated using(player_id=(select private.current_player_id()));

-- Public artwork is intended for released fan cards. Write operations
-- remain restricted to whitelisted, named ITM administrators.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('itm-card-media','itm-card-media',true,12582912,
 array['image/png','image/jpeg','image/webp'])
on conflict(id) do nothing;
create policy itm_media_admin_insert on storage.objects
 for insert to authenticated
 with check(bucket_id='itm-card-media' and (select private.itm_is_studio_admin()));
create policy itm_media_admin_update on storage.objects
 for update to authenticated
 using(bucket_id='itm-card-media' and (select private.itm_is_studio_admin()))
 with check(bucket_id='itm-card-media' and (select private.itm_is_studio_admin()));
create policy itm_media_admin_delete on storage.objects
 for delete to authenticated
 using(bucket_id='itm-card-media' and (select private.itm_is_studio_admin()));
create policy itm_media_admin_read on storage.objects
 for select to authenticated
 using(bucket_id='itm-card-media' and (select private.itm_is_studio_admin()));

create or replace function public.itm_catalog_ready()
returns boolean language sql stable security invoker set search_path=''
as $$
 select count(distinct rarity)=5
 from public.itm_catalog where status='published';
$$;
revoke all on function public.itm_catalog_ready() from public;
grant execute on function public.itm_catalog_ready() to anon,authenticated;

create or replace function private.itm_draw_cards(p_count integer)
returns jsonb language plpgsql volatile security definer set search_path=''
as $$
declare
 v_player uuid; v_rarity text; v_roll double precision;
 v_card public.itm_catalog%rowtype;
 v_result jsonb:='[]'::jsonb; i int;
begin
 if auth.uid() is null
    or coalesce(auth.jwt()->'app_metadata'->>'itm_named_account','')<>'true'
 then raise exception 'ITM named account required' using errcode='28000'; end if;
 if p_count not in (1,5) then raise exception 'Invalid pack size' using errcode='22023'; end if;
 if (select count(distinct rarity) from public.itm_catalog where status='published')<>5
 then raise exception 'Card catalog is not ready' using errcode='22023'; end if;
 v_player:=private.ensure_player();
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_player::text,927134));
 if exists(select 1 from public.itm_card_pack_rolls where player_id=v_player
    and created_at>now()-interval '3 seconds')
 then raise exception 'Pack opening cooldown' using errcode='22023'; end if;
 for i in 1..p_count loop
  v_roll:=random()*100;
  v_rarity:=case when v_roll<1 then 'UR' when v_roll<5 then 'SSR'
                 when v_roll<17 then 'SR' when v_roll<45 then 'R' else 'N' end;
  select * into v_card from public.itm_catalog
    where status='published' and rarity=v_rarity
    order by random() limit 1;
  if not found then raise exception 'Missing published cards for rarity %',v_rarity; end if;
  insert into public.itm_card_inventory(player_id,card_id,quantity)
    values(v_player,v_card.id,1)
    on conflict(player_id,card_id) do update
    set quantity=least(1000000,public.itm_card_inventory.quantity+1),updated_at=now();
  v_result:=v_result||pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object('id',v_card.id::text));
 end loop;
 insert into public.itm_card_pack_rolls(player_id,pack_size,result)
   values(v_player,p_count,v_result);
 return v_result;
end;
$$;
revoke all on function private.itm_draw_cards(integer) from public,anon;
grant execute on function private.itm_draw_cards(integer) to authenticated;
create or replace function public.itm_open_card_pack(p_count integer)
returns jsonb language sql security invoker set search_path=''
as $$ select private.itm_draw_cards(p_count); $$;
revoke all on function public.itm_open_card_pack(integer) from public,anon;
grant execute on function public.itm_open_card_pack(integer) to authenticated;

-- Owner bootstrap after an ITM account is identified (never assign everyone):
-- insert into private.itm_studio_admins(user_id)
-- select id from auth.users where email='itm.<YOUR_ID>@accounts.itm.example'
-- on conflict do nothing;
