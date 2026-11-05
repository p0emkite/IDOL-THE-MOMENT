-- ITM: additive card customisation / studio packs / cloud playlist.
-- Applied to ITM Supabase (isyrthdznnbxjyoliwgf) on 2026-11-05.
-- Do not run against RKBO.
begin;
alter table public.itm_catalog drop constraint if exists itm_catalog_photo_scale_check;
alter table public.itm_catalog add constraint itm_catalog_photo_scale_check check(photo_scale between 0 and 4);
alter table public.itm_catalog add column if not exists logo_scale numeric(5,2) not null default 1;
alter table public.itm_catalog drop constraint if exists itm_catalog_logo_scale_check;
alter table public.itm_catalog add constraint itm_catalog_logo_scale_check check(logo_scale between 0 and 3);

create table if not exists public.itm_series (
 id uuid primary key default gen_random_uuid(),
 group_slug text not null references public.itm_groups(slug) on delete cascade,
 name text not null check(length(btrim(name)) between 1 and 100),
 created_at timestamptz not null default now(),
 unique(group_slug,name)
);
alter table public.itm_series enable row level security;
revoke all on public.itm_series from public,anon,authenticated;
grant select on public.itm_series to anon,authenticated;
grant insert,update,delete on public.itm_series to authenticated;
drop policy if exists itm_series_read on public.itm_series;
create policy itm_series_read on public.itm_series for select to anon,authenticated using(true);
drop policy if exists itm_series_admin_insert on public.itm_series;
create policy itm_series_admin_insert on public.itm_series for insert to authenticated with check ((select private.itm_is_studio_admin()));
drop policy if exists itm_series_admin_update on public.itm_series;
create policy itm_series_admin_update on public.itm_series for update to authenticated using((select private.itm_is_studio_admin())) with check((select private.itm_is_studio_admin()));
drop policy if exists itm_series_admin_delete on public.itm_series;
create policy itm_series_admin_delete on public.itm_series for delete to authenticated using((select private.itm_is_studio_admin()));
insert into public.itm_series(group_slug,name)
 select distinct group_slug,edition from public.itm_catalog
 where length(btrim(edition))>0 on conflict(group_slug,name) do nothing;

create table if not exists public.itm_packs (
 id uuid primary key default gen_random_uuid(),
 name text not null check(length(btrim(name)) between 1 and 100),
 image_path text,
 group_slugs text[] not null default array[]::text[],
 series_filters jsonb not null default '[]'::jsonb check(jsonb_typeof(series_filters)='array'),
 active boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.itm_packs enable row level security;
revoke all on public.itm_packs from public,anon,authenticated;
grant select on public.itm_packs to anon,authenticated;
grant insert,update,delete on public.itm_packs to authenticated;
drop policy if exists itm_packs_public_read on public.itm_packs;
create policy itm_packs_public_read on public.itm_packs for select to anon,authenticated using(active);
drop policy if exists itm_packs_admin_read on public.itm_packs;
create policy itm_packs_admin_read on public.itm_packs for select to authenticated using((select private.itm_is_studio_admin()));
drop policy if exists itm_packs_admin_insert on public.itm_packs;
create policy itm_packs_admin_insert on public.itm_packs for insert to authenticated with check((select private.itm_is_studio_admin()));
drop policy if exists itm_packs_admin_update on public.itm_packs;
create policy itm_packs_admin_update on public.itm_packs for update to authenticated using((select private.itm_is_studio_admin())) with check((select private.itm_is_studio_admin()));
drop policy if exists itm_packs_admin_delete on public.itm_packs;
create policy itm_packs_admin_delete on public.itm_packs for delete to authenticated using((select private.itm_is_studio_admin()));

create table if not exists public.itm_bgm_tracks (
 id uuid primary key default gen_random_uuid(),
 title text not null check(length(btrim(title)) between 1 and 120),
 file_path text not null unique,
 sort_order int not null default 100,
 created_at timestamptz not null default now()
);
alter table public.itm_bgm_tracks enable row level security;
revoke all on public.itm_bgm_tracks from public,anon,authenticated;
grant select on public.itm_bgm_tracks to anon,authenticated;
grant insert,update,delete on public.itm_bgm_tracks to authenticated;
drop policy if exists itm_bgm_read on public.itm_bgm_tracks;
create policy itm_bgm_read on public.itm_bgm_tracks for select to anon,authenticated using(true);
drop policy if exists itm_bgm_admin_insert on public.itm_bgm_tracks;
create policy itm_bgm_admin_insert on public.itm_bgm_tracks for insert to authenticated with check((select private.itm_is_studio_admin()));
drop policy if exists itm_bgm_admin_update on public.itm_bgm_tracks;
create policy itm_bgm_admin_update on public.itm_bgm_tracks for update to authenticated using((select private.itm_is_studio_admin())) with check((select private.itm_is_studio_admin()));
drop policy if exists itm_bgm_admin_delete on public.itm_bgm_tracks;
create policy itm_bgm_admin_delete on public.itm_bgm_tracks for delete to authenticated using((select private.itm_is_studio_admin()));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('itm-bgm','itm-bgm',true,15728640,array['audio/mpeg','audio/mp3'])
 on conflict(id) do update set public=true,file_size_limit=15728640,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists itm_bgm_storage_admin_insert on storage.objects;
create policy itm_bgm_storage_admin_insert on storage.objects for insert to authenticated
 with check(bucket_id='itm-bgm' and (select private.itm_is_studio_admin()));
drop policy if exists itm_bgm_storage_admin_update on storage.objects;
create policy itm_bgm_storage_admin_update on storage.objects for update to authenticated
 using(bucket_id='itm-bgm' and (select private.itm_is_studio_admin()))
 with check(bucket_id='itm-bgm' and (select private.itm_is_studio_admin()));
drop policy if exists itm_bgm_storage_admin_delete on storage.objects;
create policy itm_bgm_storage_admin_delete on storage.objects for delete to authenticated
 using(bucket_id='itm-bgm' and (select private.itm_is_studio_admin()));
drop policy if exists itm_bgm_storage_admin_select on storage.objects;
create policy itm_bgm_storage_admin_select on storage.objects for select to authenticated
 using(bucket_id='itm-bgm' and (select private.itm_is_studio_admin()));

alter table public.itm_card_pack_rolls
 add column if not exists pack_id uuid references public.itm_packs(id) on delete set null;
commit;
