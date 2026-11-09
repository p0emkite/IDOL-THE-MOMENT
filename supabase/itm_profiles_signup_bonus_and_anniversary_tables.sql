-- ITM account profile, welcoming inbox, account XP, collections and festival calendar.
alter table public.itm_mailbox add column if not exists source_key text;
create unique index if not exists itm_mail_unique_source on public.itm_mailbox(player_id,source_key) where source_key is not null;

create table if not exists public.itm_profiles (
 player_id uuid primary key references private.player_accounts(id) on delete cascade,
 nickname text not null check (nickname ~ '^[가-힣A-Za-z0-9_]{2,16}$'),
 nickname_key text generated always as (lower(btrim(nickname))) stored,
 nickname_changes integer not null default 0 check(nickname_changes>=0),
 avatar_card_id uuid references public.itm_catalog(id) on delete set null,
 selected_frame_id uuid,
 birthday_month smallint check(birthday_month between 1 and 12),
 birthday_day smallint check(birthday_day between 1 and 31),
 experience bigint not null default 0 check(experience>=0),
 level integer not null default 1 check(level>=1),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint birthday_both check ((birthday_month is null)=(birthday_day is null))
);
create unique index if not exists itm_nickname_unique on public.itm_profiles(nickname_key);
create table if not exists public.itm_profile_frames (
 id uuid primary key default gen_random_uuid(),
 group_slug text not null,
 edition text not null,
 kind text not null check(kind in ('ur','collection')),
 title text not null check(length(btrim(title)) between 1 and 100),
 image_path text,
 created_at timestamptz not null default now(),
 unique(group_slug,edition,kind)
);
create table if not exists public.itm_player_frames(
 player_id uuid not null references private.player_accounts(id) on delete cascade,
 frame_id uuid not null references public.itm_profile_frames(id) on delete cascade,
 earned_at timestamptz not null default now(),
 primary key(player_id,frame_id)
);
alter table public.itm_profiles add constraint itm_selected_frame_fk
 foreign key (player_id,selected_frame_id) references public.itm_player_frames(player_id,frame_id) on delete set null (selected_frame_id);
create table if not exists public.itm_achievement_claims(
 player_id uuid not null references private.player_accounts(id) on delete cascade,
 group_slug text not null,
 edition text not null,
 rarity text not null check(rarity in ('N','R','SR','SSR','UR','ALL')),
 reward_m integer not null default 0,
 claimed_at timestamptz not null default now(),
 primary key(player_id,group_slug,edition,rarity)
);
create table if not exists public.itm_anniversaries(
 id uuid primary key default gen_random_uuid(),
 kind text not null default 'global' check(kind in ('global','birthday')),
 title text not null check(length(btrim(title)) between 1 and 120),
 greeting text not null default 'HAPPY ANNIVERSARY, {nickname}!' check(length(greeting) between 1 and 250),
 message text not null default '',
 month smallint check(month between 1 and 12),
 day smallint check(day between 1 and 31),
 reward_m integer not null default 1000 check(reward_m between 0 and 100000000),
 image_path text,
 active boolean not null default true,
 updated_at timestamptz not null default now(),
 constraint itm_anniv_date check ((kind='birthday' and month is null and day is null)
       or (kind='global' and month is not null and day is not null))
);
create unique index if not exists itm_one_birthday_event on public.itm_anniversaries(kind) where kind='birthday';
create table if not exists public.itm_anniversary_awards(
 player_id uuid not null references private.player_accounts(id) on delete cascade,
 event_id uuid not null references public.itm_anniversaries(id) on delete cascade,
 year integer not null,
 awarded_at timestamptz not null default now(),
 primary key(player_id,event_id,year)
);
insert into public.itm_anniversaries(kind,title,greeting,message,reward_m)
values('birthday','생일 축하','HAPPY BIRTHDAY, {nickname}!','특별한 하루를 축하합니다! ✦',1000)
on conflict do nothing;

-- Pre-existing linked ITM users retain their inventory while gaining a profile.
insert into public.itm_profiles(player_id,nickname)
select distinct on(d.player_id) d.player_id,
 substring(u.email from '^itm\.([a-z][a-z0-9_]{3,19})@accounts\.itm\.example$')
from private.player_devices d join auth.users u on u.id=d.user_id
where u.raw_app_meta_data->>'itm_named_account'='true'
 and u.email ~ '^itm\.[a-z][a-z0-9_]{3,19}@accounts\.itm\.example$'
order by d.player_id,d.linked_at
on conflict do nothing;
insert into public.itm_mailbox(player_id,subject,message,reward_m,source_key)
select d.player_id,'ITM에 오신 것을 환영합니다! ✦',
'가입을 축하드립니다! 첫 50회 뽑기를 즐겨 보세요.',5000,'welcome_v1'
from private.player_devices d join auth.users u on u.id=d.user_id
where u.raw_app_meta_data->>'itm_named_account'='true'
on conflict (player_id,source_key) where source_key is not null do nothing;

-- Enroll new account atomically (edge function sets app_metadata, never client metadata).
create or replace function private.itm_enroll_registered_user()
returns trigger language plpgsql security definer set search_path=''
as $body$
declare v_player uuid;v_nick text;
begin
 if new.raw_app_meta_data->>'itm_named_account' is distinct from 'true' then return new;end if;
 v_nick:=coalesce(new.raw_app_meta_data->>'itm_initial_nickname',
      substring(new.email from '^itm\.([a-z][a-z0-9_]{3,19})@accounts\.itm\.example$'));
 if v_nick is null or v_nick !~ '^[가-힣A-Za-z0-9_]{2,16}$' then
   raise exception 'Invalid ITM nickname' using errcode='22023';end if;
 insert into private.player_accounts default values returning id into v_player;
 insert into private.player_devices(user_id,player_id) values(new.id,v_player);
 insert into public.itm_profiles(player_id,nickname) values(v_player,v_nick);
 insert into public.itm_wallets(player_id,balance) values(v_player,0);
 insert into public.itm_mailbox(player_id,subject,message,reward_m,source_key)
 values(v_player,'ITM에 오신 것을 환영합니다! ✦','가입을 축하드립니다! 첫 50회 뽑기를 즐겨 보세요.',5000,'welcome_v1');
 return new;
end;$body$;
drop trigger if exists itm_register_user_profile on auth.users;
create trigger itm_register_user_profile after insert on auth.users
for each row execute function private.itm_enroll_registered_user();

-- Read-only Data API tables, strictly scoped to the signed-in player.
alter table public.itm_profiles enable row level security;
alter table public.itm_profile_frames enable row level security;
alter table public.itm_player_frames enable row level security;
alter table public.itm_achievement_claims enable row level security;
alter table public.itm_anniversaries enable row level security;
alter table public.itm_anniversary_awards enable row level security;
revoke all on public.itm_profiles,public.itm_player_frames,public.itm_achievement_claims,
 public.itm_profile_frames,public.itm_anniversaries,public.itm_anniversary_awards from public,anon,authenticated;
grant select on public.itm_profiles,public.itm_player_frames,public.itm_achievement_claims to authenticated;
grant select on public.itm_profile_frames,public.itm_anniversaries to anon,authenticated;
grant select on public.itm_anniversary_awards to authenticated;
grant insert,update,delete on public.itm_profile_frames,public.itm_anniversaries to authenticated;
create policy itm_profiles_owner_read on public.itm_profiles for select to authenticated
 using(player_id=(select private.current_player_id()));
create policy itm_player_frames_owner_read on public.itm_player_frames for select to authenticated
 using(player_id=(select private.current_player_id()));
create policy itm_achievements_owner_read on public.itm_achievement_claims for select to authenticated
 using(player_id=(select private.current_player_id()));
create policy itm_anniversary_awards_owner_read on public.itm_anniversary_awards for select to authenticated
 using(player_id=(select private.current_player_id()));
create policy itm_frames_public_read on public.itm_profile_frames for select to anon,authenticated using(true);
create policy itm_anniversary_public_read on public.itm_anniversaries for select to anon,authenticated
 using(active or (select private.itm_is_studio_admin()));
create policy itm_frames_admin_insert on public.itm_profile_frames for insert to authenticated
 with check ((select private.itm_is_studio_admin()));
create policy itm_frames_admin_update on public.itm_profile_frames for update to authenticated
 using((select private.itm_is_studio_admin())) with check((select private.itm_is_studio_admin()));
create policy itm_frames_admin_delete on public.itm_profile_frames for delete to authenticated
 using((select private.itm_is_studio_admin()));
create policy itm_events_admin_insert on public.itm_anniversaries for insert to authenticated
 with check ((select private.itm_is_studio_admin()));
create policy itm_events_admin_update on public.itm_anniversaries for update to authenticated
 using((select private.itm_is_studio_admin())) with check((select private.itm_is_studio_admin()));
create policy itm_events_admin_delete on public.itm_anniversaries for delete to authenticated
 using((select private.itm_is_studio_admin()));

create or replace function private.itm_add_xp(p_player uuid,p_xp integer)
returns void language plpgsql security definer set search_path=''
as $body$
begin
 if p_xp<0 or p_xp>100000 then raise exception 'Invalid XP';end if;
 update public.itm_profiles set experience=least(1000000000,experience+p_xp),
  level=1+floor(sqrt(least(1000000000,experience+p_xp)/100.0))::integer,updated_at=now()
 where player_id=p_player;
end;$body$;
revoke all on function private.itm_add_xp(uuid,integer) from public,anon,authenticated;

create or replace function public.itm_get_profile()
returns jsonb language plpgsql volatile security definer set search_path=''
as $body$
declare v_player uuid;v_profile public.itm_profiles%rowtype;v_email text;
begin
 if auth.uid() is null or (auth.jwt()->'app_metadata'->>'itm_named_account') is distinct from 'true'
 then raise exception 'Registered ITM account required' using errcode='28000';end if;
 v_player:=private.ensure_player();
 select email into v_email from auth.users where id=auth.uid();
 insert into public.itm_profiles(player_id,nickname)
 values(v_player,substring(v_email from '^itm\.([a-z][a-z0-9_]{3,19})@accounts\.itm\.example$'))
 on conflict(player_id) do nothing;
 select * into v_profile from public.itm_profiles where player_id=v_player;
 return to_jsonb(v_profile)||jsonb_build_object('next_rename_cost',
  least(3000,v_profile.nickname_changes*1000));
end;$body$;
revoke all on function public.itm_get_profile() from public,anon;
grant execute on function public.itm_get_profile() to authenticated;

create or replace function public.itm_nickname_available(p_nickname text)
returns boolean language sql stable security definer set search_path=''
as $body$
 select p_nickname is not null and p_nickname ~ '^[가-힣A-Za-z0-9_]{2,16}$'
   and not exists(select 1 from public.itm_profiles where nickname_key=lower(btrim(p_nickname)));
$body$;
revoke all on function public.itm_nickname_available(text) from public;
grant execute on function public.itm_nickname_available(text) to anon,authenticated;

create or replace function public.itm_change_nickname(p_nickname text)
returns jsonb language plpgsql volatile security definer set search_path=''
as $body$
declare v_player uuid;v_old public.itm_profiles%rowtype;v_cost bigint;v_balance bigint;
begin
 if auth.uid() is null or (auth.jwt()->'app_metadata'->>'itm_named_account') is distinct from 'true'
 then raise exception 'Registered ITM account required' using errcode='28000';end if;
 if p_nickname is null or p_nickname !~ '^[가-힣A-Za-z0-9_]{2,16}$'
 then raise exception '닉네임은 한글·영문·숫자·밑줄 2~16자로 입력해 주세요.' using errcode='22023';end if;
 v_player:=private.ensure_player();
 select * into v_old from public.itm_profiles where player_id=v_player for update;
 if not found then raise exception 'Profile not found';end if;
 if v_old.nickname=p_nickname then return public.itm_get_profile();end if;
 v_cost:=least(3000,v_old.nickname_changes*1000);
 if exists(select 1 from public.itm_profiles p where p.nickname_key=lower(p_nickname) and p.player_id<>v_player)
 then raise exception '이미 사용 중인 닉네임입니다.' using errcode='23505';end if;
 if v_cost>0 then
  insert into public.itm_wallets(player_id) values(v_player) on conflict do nothing;
  update public.itm_wallets set balance=balance-v_cost,updated_at=now()
  where player_id=v_player and balance>=v_cost returning balance into v_balance;
  if not found then raise exception 'INSUFFICIENT_M: nickname change costs % M',v_cost;end if;
 end if;
 update public.itm_profiles set nickname=p_nickname,nickname_changes=nickname_changes+1,updated_at=now() where player_id=v_player;
 return public.itm_get_profile();
end;$body$;
revoke all on function public.itm_change_nickname(text) from public,anon;
grant execute on function public.itm_change_nickname(text) to authenticated;

create or replace function public.itm_set_profile_birthday(p_month integer,p_day integer)
returns jsonb language plpgsql volatile security definer set search_path=''
as $body$
declare v_player uuid;
begin
 if auth.uid() is null or (auth.jwt()->'app_metadata'->>'itm_named_account') is distinct from 'true'
 then raise exception 'Registered ITM account required' using errcode='28000';end if;
 if p_month is null or p_day is null or make_date(2024,p_month,p_day) is null
 then raise exception '유효하지 않은 생일입니다.';end if;
 v_player:=private.ensure_player();
 update public.itm_profiles set birthday_month=p_month,birthday_day=p_day,updated_at=now()
 where player_id=v_player and birthday_month is null;
 if not found then raise exception '생일은 최초 한 번만 등록할 수 있습니다.';end if;
 return public.itm_get_profile();
end;$body$;
revoke all on function public.itm_set_profile_birthday(integer,integer) from public,anon;
grant execute on function public.itm_set_profile_birthday(integer,integer) to authenticated;

create or replace function public.itm_set_profile_avatar(p_card_id uuid)
returns jsonb language plpgsql volatile security definer set search_path=''
as $body$
declare v_player uuid;
begin
 if auth.uid() is null or (auth.jwt()->'app_metadata'->>'itm_named_account') is distinct from 'true'
 then raise exception 'Registered ITM account required' using errcode='28000';end if;
 v_player:=private.ensure_player();
 if p_card_id is not null and not exists(
  select 1 from public.itm_card_inventory where player_id=v_player and card_id=p_card_id and quantity>0)
 then raise exception '수집한 카드만 프로필 사진으로 사용할 수 있습니다.';end if;
 update public.itm_profiles set avatar_card_id=p_card_id,updated_at=now() where player_id=v_player;
 return public.itm_get_profile();
end;$body$;
revoke all on function public.itm_set_profile_avatar(uuid) from public,anon;
grant execute on function public.itm_set_profile_avatar(uuid) to authenticated;

create or replace function public.itm_select_profile_frame(p_frame_id uuid)
returns jsonb language plpgsql volatile security definer set search_path=''
as $body$
declare v_player uuid;
begin
 if auth.uid() is null or (auth.jwt()->'app_metadata'->>'itm_named_account') is distinct from 'true'
 then raise exception 'Registered ITM account required' using errcode='28000';end if;
 v_player:=private.ensure_player();
 if p_frame_id is not null and not exists(
 select 1 from public.itm_player_frames where player_id=v_player and frame_id=p_frame_id)
 then raise exception '해금하지 않은 프로필 프레임입니다.';end if;
 update public.itm_profiles set selected_frame_id=p_frame_id,updated_at=now() where player_id=v_player;
 return public.itm_get_profile();
end;$body$;
revoke all on function public.itm_select_profile_frame(uuid) from public,anon;
grant execute on function public.itm_select_profile_frame(uuid) to authenticated;
