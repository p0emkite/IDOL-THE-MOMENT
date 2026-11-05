-- Reusable group rosters. Card titles remain individually editable.
create table public.itm_members (
  id uuid primary key default gen_random_uuid(),
  group_slug text not null references public.itm_groups(slug),
  name text not null check (length(btrim(name)) between 1 and 100),
  unique (group_slug, name),
  unique (group_slug, id)
);
alter table public.itm_members enable row level security;
revoke all on public.itm_members from public, anon, authenticated;
grant select, insert, update on public.itm_members to authenticated;
create policy itm_members_admin on public.itm_members for all to authenticated
using ((select private.itm_is_studio_admin()))
with check ((select private.itm_is_studio_admin()));

alter table public.itm_catalog add column member_id uuid,
  add foreign key (group_slug, member_id) references public.itm_members(group_slug, id);
create index itm_catalog_member_idx on public.itm_catalog(group_slug,member_id);
alter table public.itm_catalog drop constraint itm_catalog_status_check,
  add constraint itm_catalog_status_check check (status in ('draft','published','private'));
