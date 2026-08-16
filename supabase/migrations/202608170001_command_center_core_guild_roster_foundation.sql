create extension if not exists pgcrypto;

create table public.guilds (
  id uuid primary key default gen_random_uuid(),
  swgoh_guild_id text unique,
  name text not null,
  member_count integer not null default 0 check (member_count >= 0),
  galactic_power bigint not null default 0 check (galactic_power >= 0),
  character_power bigint not null default 0 check (character_power >= 0),
  ship_power bigint not null default 0 check (ship_power >= 0),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_synced_at timestamptz,
  source text not null default 'comlink',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.players (
  id uuid primary key default gen_random_uuid(),
  ally_code text not null unique check (ally_code ~ '^[0-9]{9}$'),
  swgoh_player_id text unique,
  name text not null,
  level integer check (level is null or level >= 0),
  galactic_power bigint not null default 0 check (galactic_power >= 0),
  character_power bigint not null default 0 check (character_power >= 0),
  ship_power bigint not null default 0 check (ship_power >= 0),
  current_guild_id uuid references public.guilds(id) on delete set null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_synced_at timestamptz,
  source text not null default 'comlink',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.game_units (
  base_id text primary key,
  name text not null,
  combat_type text not null check (combat_type in ('character','ship','unknown')),
  alignment text,
  categories text[] not null default '{}',
  image_url text,
  metadata jsonb not null default '{}'::jsonb,
  catalog_version text,
  updated_at timestamptz not null default now()
);

create table public.guild_members_current (
  guild_id uuid not null references public.guilds(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  member_name text not null,
  member_galactic_power bigint not null default 0 check (member_galactic_power >= 0),
  member_character_power bigint not null default 0 check (member_character_power >= 0),
  member_ship_power bigint not null default 0 check (member_ship_power >= 0),
  first_seen_in_guild_at timestamptz not null default now(),
  last_seen_in_guild_at timestamptz not null default now(),
  last_synced_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  primary key (guild_id, player_id)
);

create table public.guild_membership_history (
  id bigint generated always as identity primary key,
  guild_id uuid not null references public.guilds(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  event_type text not null check (event_type in ('joined','left','renamed','returned')),
  occurred_at timestamptz not null default now(),
  previous_value text,
  new_value text,
  metadata jsonb not null default '{}'::jsonb
);

create table public.player_units_current (
  player_id uuid not null references public.players(id) on delete cascade,
  base_id text not null,
  unit_name text not null,
  combat_type text not null check (combat_type in ('character','ship','unknown')),
  rarity smallint not null default 0 check (rarity between 0 and 7),
  level smallint not null default 0 check (level >= 0),
  gear_level smallint not null default 0 check (gear_level >= 0),
  relic_tier smallint not null default 0 check (relic_tier >= 0),
  galactic_power integer not null default 0 check (galactic_power >= 0),
  zeta_count smallint not null default 0 check (zeta_count >= 0),
  omicron_count smallint not null default 0 check (omicron_count >= 0),
  ultimate_unlocked boolean,
  last_synced_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  primary key (player_id, base_id)
);

create table public.guild_sync_runs (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid references public.guilds(id) on delete set null,
  lookup_ally_code text check (lookup_ally_code is null or lookup_ally_code ~ '^[0-9]{9}$'),
  status text not null check (status in ('started','completed','partial','failed')),
  source text not null default 'comlink',
  source_cache text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  expected_members integer,
  members_discovered integer,
  rosters_hydrated integer,
  rosters_failed integer,
  units_loaded integer,
  error_message text,
  metadata jsonb not null default '{}'::jsonb
);

create table public.guild_snapshots (
  id bigint generated always as identity primary key,
  guild_id uuid not null references public.guilds(id) on delete cascade,
  captured_at timestamptz not null default now(),
  snapshot_date date generated always as ((captured_at at time zone 'UTC')::date) stored,
  member_count integer not null default 0,
  hydrated_member_count integer not null default 0,
  galactic_power bigint not null default 0,
  character_power bigint not null default 0,
  ship_power bigint not null default 0,
  gl_count integer not null default 0,
  gear_13_count integer not null default 0,
  relic_5_plus_count integer not null default 0,
  relic_7_plus_count integer not null default 0,
  relic_9_count integer not null default 0,
  seven_star_ship_count integer not null default 0,
  metrics jsonb not null default '{}'::jsonb,
  source_sync_run_id uuid references public.guild_sync_runs(id) on delete set null
);

create table public.player_snapshots (
  id bigint generated always as identity primary key,
  player_id uuid not null references public.players(id) on delete cascade,
  guild_id uuid references public.guilds(id) on delete set null,
  captured_at timestamptz not null default now(),
  snapshot_date date generated always as ((captured_at at time zone 'UTC')::date) stored,
  galactic_power bigint not null default 0,
  character_power bigint not null default 0,
  ship_power bigint not null default 0,
  character_count integer not null default 0,
  ship_count integer not null default 0,
  gl_count integer not null default 0,
  gear_13_count integer not null default 0,
  relic_5_plus_count integer not null default 0,
  relic_7_plus_count integer not null default 0,
  relic_9_count integer not null default 0,
  seven_star_ship_count integer not null default 0,
  metrics jsonb not null default '{}'::jsonb,
  source_sync_run_id uuid references public.guild_sync_runs(id) on delete set null
);

create unique index guild_snapshots_one_per_guild_day on public.guild_snapshots (guild_id, snapshot_date);
create unique index player_snapshots_one_per_player_day on public.player_snapshots (player_id, snapshot_date);
create index players_current_guild_idx on public.players(current_guild_id);
create index guild_members_current_player_idx on public.guild_members_current(player_id);
create index guild_membership_history_guild_time_idx on public.guild_membership_history(guild_id, occurred_at desc);
create index guild_membership_history_player_time_idx on public.guild_membership_history(player_id, occurred_at desc);
create index player_units_current_base_id_idx on public.player_units_current(base_id);
create index player_units_current_power_idx on public.player_units_current(galactic_power desc);
create index player_units_current_relic_idx on public.player_units_current(relic_tier desc);
create index guild_sync_runs_guild_started_idx on public.guild_sync_runs(guild_id, started_at desc);
create index guild_snapshots_guild_time_idx on public.guild_snapshots(guild_id, captured_at desc);
create index player_snapshots_player_time_idx on public.player_snapshots(player_id, captured_at desc);

alter table public.guilds enable row level security;
alter table public.players enable row level security;
alter table public.game_units enable row level security;
alter table public.guild_members_current enable row level security;
alter table public.guild_membership_history enable row level security;
alter table public.player_units_current enable row level security;
alter table public.guild_sync_runs enable row level security;
alter table public.guild_snapshots enable row level security;
alter table public.player_snapshots enable row level security;

comment on table public.guilds is 'Current normalized SWGOH guild identity and aggregate state.';
comment on table public.players is 'Current normalized SWGOH player identity and aggregate state.';
comment on table public.game_units is 'Shared static/versioned SWGOH unit catalog metadata.';
comment on table public.guild_members_current is 'Current guild membership projection for fast Guild Command Center reads.';
comment on table public.guild_membership_history is 'Join/leave/rename membership events retained for historical analytics.';
comment on table public.player_units_current is 'Latest known roster unit state per player; one row per owned character or ship.';
comment on table public.guild_sync_runs is 'Integrity/audit record for every Guild roster ingestion attempt.';
comment on table public.guild_snapshots is 'Daily Guild analytics snapshot, deduplicated to one row per guild per UTC day.';
comment on table public.player_snapshots is 'Daily player analytics snapshot, deduplicated to one row per player per UTC day.';
