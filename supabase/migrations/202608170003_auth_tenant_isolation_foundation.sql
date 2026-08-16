create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  timezone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_player_links (
  user_id uuid not null references public.profiles(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  is_primary boolean not null default false,
  verification_status text not null default 'pending' check (verification_status in ('pending','verified','rejected')),
  verification_method text check (verification_method is null or verification_method in ('manual','discord','profile_code','admin')),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, player_id)
);

create unique index user_player_links_one_primary_per_user
  on public.user_player_links(user_id)
  where is_primary and verification_status <> 'rejected';

create unique index user_player_links_one_verified_owner_per_player
  on public.user_player_links(player_id)
  where verification_status = 'verified';

create table public.guild_user_memberships (
  guild_id uuid not null references public.guilds(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  player_id uuid references public.players(id) on delete set null,
  role text not null default 'member' check (role in ('owner','leader','officer','member','viewer')),
  status text not null default 'pending' check (status in ('pending','active','suspended','left')),
  granted_by_user_id uuid references public.profiles(id) on delete set null,
  joined_at timestamptz,
  left_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (guild_id, user_id)
);

create unique index guild_user_memberships_active_player_once
  on public.guild_user_memberships(guild_id, player_id)
  where status = 'active' and player_id is not null;

create index guild_user_memberships_user_status_idx
  on public.guild_user_memberships(user_id, status, guild_id);

create table public.user_guild_preferences (
  user_id uuid not null references public.profiles(id) on delete cascade,
  guild_id uuid not null references public.guilds(id) on delete cascade,
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, guild_id)
);

alter table public.guilds add column if not exists onboarded_by_user_id uuid references public.profiles(id) on delete set null;
alter table public.guilds add column if not exists onboarded_at timestamptz;
alter table public.guild_sync_runs add column if not exists requested_by_user_id uuid references public.profiles(id) on delete set null;
alter table public.guild_sync_runs add column if not exists request_origin text not null default 'system' check (request_origin in ('user','scheduled','discord','system'));

create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, nullif(coalesce(new.raw_user_meta_data ->> 'display_name', new.raw_user_meta_data ->> 'name', ''), ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function private.handle_new_auth_user() from public;

create trigger on_auth_user_created_command_center_profile
after insert on auth.users
for each row execute function private.handle_new_auth_user();

create or replace function private.user_has_guild_access(target_guild_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.guild_user_memberships membership
      where membership.user_id = (select auth.uid())
        and membership.guild_id = target_guild_id
        and membership.status = 'active'
    );
$$;

create or replace function private.user_has_player_access(target_player_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select (select auth.uid()) is not null
    and (
      exists (
        select 1
        from public.user_player_links link
        where link.user_id = (select auth.uid())
          and link.player_id = target_player_id
          and link.verification_status = 'verified'
      )
      or exists (
        select 1
        from public.guild_members_current current_member
        join public.guild_user_memberships membership
          on membership.guild_id = current_member.guild_id
        where membership.user_id = (select auth.uid())
          and membership.status = 'active'
          and current_member.player_id = target_player_id
      )
    );
$$;

revoke all on function private.user_has_guild_access(uuid) from public;
revoke all on function private.user_has_player_access(uuid) from public;
grant execute on function private.user_has_guild_access(uuid) to authenticated;
grant execute on function private.user_has_player_access(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.user_player_links enable row level security;
alter table public.guild_user_memberships enable row level security;
alter table public.user_guild_preferences enable row level security;

create policy profiles_select_self on public.profiles
for select to authenticated
using ((select auth.uid()) is not null and id = (select auth.uid()));

create policy profiles_update_self on public.profiles
for update to authenticated
using ((select auth.uid()) is not null and id = (select auth.uid()))
with check ((select auth.uid()) is not null and id = (select auth.uid()));

create policy user_player_links_select_self on public.user_player_links
for select to authenticated
using ((select auth.uid()) is not null and user_id = (select auth.uid()));

create policy guild_user_memberships_select_accessible on public.guild_user_memberships
for select to authenticated
using (private.user_has_guild_access(guild_id));

create policy user_guild_preferences_select_self on public.user_guild_preferences
for select to authenticated
using ((select auth.uid()) is not null and user_id = (select auth.uid()) and private.user_has_guild_access(guild_id));

create policy user_guild_preferences_insert_self on public.user_guild_preferences
for insert to authenticated
with check ((select auth.uid()) is not null and user_id = (select auth.uid()) and private.user_has_guild_access(guild_id));

create policy user_guild_preferences_update_self on public.user_guild_preferences
for update to authenticated
using ((select auth.uid()) is not null and user_id = (select auth.uid()) and private.user_has_guild_access(guild_id))
with check ((select auth.uid()) is not null and user_id = (select auth.uid()) and private.user_has_guild_access(guild_id));

create policy user_guild_preferences_delete_self on public.user_guild_preferences
for delete to authenticated
using ((select auth.uid()) is not null and user_id = (select auth.uid()) and private.user_has_guild_access(guild_id));

create policy guilds_select_authorized on public.guilds
for select to authenticated
using (private.user_has_guild_access(id));

create policy players_select_authorized on public.players
for select to authenticated
using (private.user_has_player_access(id));

create policy game_units_select_authenticated on public.game_units
for select to authenticated
using ((select auth.uid()) is not null);

create policy guild_members_current_select_authorized on public.guild_members_current
for select to authenticated
using (private.user_has_guild_access(guild_id));

create policy guild_membership_history_select_authorized on public.guild_membership_history
for select to authenticated
using (private.user_has_guild_access(guild_id));

create policy player_units_current_select_authorized on public.player_units_current
for select to authenticated
using (private.user_has_player_access(player_id));

create policy guild_sync_runs_select_authorized on public.guild_sync_runs
for select to authenticated
using (guild_id is not null and private.user_has_guild_access(guild_id));

create policy guild_snapshots_select_authorized on public.guild_snapshots
for select to authenticated
using (private.user_has_guild_access(guild_id));

create policy player_snapshots_select_authorized on public.player_snapshots
for select to authenticated
using (private.user_has_player_access(player_id) and (guild_id is null or private.user_has_guild_access(guild_id)));

grant select, update on public.profiles to authenticated;
grant select on public.user_player_links to authenticated;
grant select on public.guild_user_memberships to authenticated;
grant select, insert, update, delete on public.user_guild_preferences to authenticated;
grant select on public.guilds, public.players, public.game_units, public.guild_members_current, public.guild_membership_history, public.player_units_current, public.guild_sync_runs, public.guild_snapshots, public.player_snapshots to authenticated;

comment on table public.profiles is 'One private Command Center profile per Supabase Auth user.';
comment on table public.user_player_links is 'Server-verified mapping between a signed-up Command Center user and SWGOH player identities.';
comment on table public.guild_user_memberships is 'Tenant authorization boundary: which signed-up users may access which Guild workspace and at what role.';
comment on table public.user_guild_preferences is 'Per-user settings inside an authorized Guild workspace; never shared across users.';
comment on column public.guild_sync_runs.requested_by_user_id is 'Signed-up user that initiated this capture when request_origin=user; null only for authorized scheduled/Discord/system refreshes.';
