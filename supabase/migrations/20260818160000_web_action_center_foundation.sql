create table if not exists public.web_action_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  guild_id uuid references public.guilds(id) on delete set null,
  action_key text not null,
  action_version text not null,
  status text not null default 'completed' check (status in ('completed','failed')),
  input jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  summary jsonb not null default '{}'::jsonb,
  source_data_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists web_action_runs_user_created_idx on public.web_action_runs(user_id,created_at desc);
create index if not exists web_action_runs_player_created_idx on public.web_action_runs(player_id,created_at desc);
create index if not exists web_action_runs_guild_created_idx on public.web_action_runs(guild_id,created_at desc) where guild_id is not null;
create index if not exists web_action_runs_action_created_idx on public.web_action_runs(action_key,created_at desc);

create table if not exists public.web_action_publications (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.web_action_runs(id) on delete cascade,
  publisher_user_id uuid not null references public.profiles(id) on delete cascade,
  target_kind text not null check (target_kind in ('player_page','guild_page','discord')),
  target_player_id uuid references public.players(id) on delete cascade,
  target_guild_id uuid references public.guilds(id) on delete cascade,
  discord_destination_id uuid references public.guild_discord_destinations(id) on delete set null,
  status text not null default 'published' check (status in ('published','failed','removed')),
  external_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  removed_at timestamptz,
  constraint web_action_publications_target_shape_check check (
    (target_kind = 'player_page' and target_player_id is not null and target_guild_id is null and discord_destination_id is null)
    or (target_kind = 'guild_page' and target_guild_id is not null and target_player_id is null and discord_destination_id is null)
    or (target_kind = 'discord' and target_guild_id is not null and target_player_id is null)
  )
);

create index if not exists web_action_publications_player_feed_idx on public.web_action_publications(target_player_id,created_at desc) where target_kind = 'player_page' and status = 'published';
create index if not exists web_action_publications_guild_feed_idx on public.web_action_publications(target_guild_id,created_at desc) where target_kind = 'guild_page' and status = 'published';
create index if not exists web_action_publications_run_idx on public.web_action_publications(run_id,created_at desc);

alter table public.web_action_runs enable row level security;
alter table public.web_action_publications enable row level security;

revoke all on table public.web_action_runs from anon,authenticated;
revoke all on table public.web_action_publications from anon,authenticated;
grant all on table public.web_action_runs to service_role;
grant all on table public.web_action_publications to service_role;

comment on table public.web_action_runs is 'Durable results from authenticated website-native Command Center actions. Discord is never required to execute these actions.';
comment on table public.web_action_publications is 'Optional publication targets for a saved web action result: player page, Guild page, or verified Discord destination. Discord destination references may become null after destination removal while the historical publication record remains.';
