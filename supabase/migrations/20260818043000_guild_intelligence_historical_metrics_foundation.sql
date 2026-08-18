-- Durable, provenance-backed historical Guild Intelligence storage.
-- These tables preserve historical workbook observations separately from current live state.

create table if not exists public.guild_member_historical_snapshots (
  id bigint generated always as identity primary key,
  guild_id uuid not null references public.guilds(id) on delete cascade,
  captured_at timestamptz not null,
  ally_code text not null check (ally_code ~ '^[0-9]{9}$'),
  player_name text not null,
  galactic_power bigint,
  character_power bigint,
  ship_power bigint,
  guild_contribution bigint,
  guild_exchange_donations bigint,
  gl_count integer not null default 0,
  gl_units jsonb not null default '[]'::jsonb,
  inquisitor_units jsonb not null default '{}'::jsonb,
  source text not null,
  source_ref text not null,
  metadata jsonb not null default '{}'::jsonb,
  unique (guild_id,captured_at,ally_code,source)
);
create index if not exists guild_member_hist_snapshots_lookup on public.guild_member_historical_snapshots(guild_id,ally_code,captured_at);
alter table public.guild_member_historical_snapshots enable row level security;

create table if not exists public.guild_raid_ticket_history (
  id bigint generated always as identity primary key,
  guild_id uuid not null references public.guilds(id) on delete cascade,
  captured_at timestamptz not null,
  ticket_date date not null,
  ally_code text not null check (ally_code ~ '^[0-9]{9}$'),
  player_name text not null,
  tickets integer not null,
  source text not null,
  source_ref text not null,
  metadata jsonb not null default '{}'::jsonb,
  unique (guild_id,captured_at,ally_code,source)
);
create index if not exists guild_raid_ticket_hist_lookup on public.guild_raid_ticket_history(guild_id,ticket_date,ally_code);
alter table public.guild_raid_ticket_history enable row level security;

create table if not exists public.guild_raid_member_results (
  id bigint generated always as identity primary key,
  guild_id uuid not null references public.guilds(id) on delete cascade,
  raid_date date not null,
  raid_name text not null,
  ally_code text check (ally_code is null or ally_code ~ '^[0-9]{9}$'),
  player_name text not null,
  score bigint not null default 0,
  rank integer,
  source text not null,
  source_ref text not null,
  metadata jsonb not null default '{}'::jsonb,
  unique (guild_id,raid_date,raid_name,player_name,source)
);
create index if not exists guild_raid_member_results_lookup on public.guild_raid_member_results(guild_id,raid_date,ally_code);
alter table public.guild_raid_member_results enable row level security;

create table if not exists public.guild_rote_member_performance (
  id bigint generated always as identity primary key,
  guild_id uuid not null references public.guilds(id) on delete cascade,
  start_date timestamptz not null,
  ally_code text check (ally_code is null or ally_code ~ '^[0-9]{9}$'),
  player_name text not null,
  missed_phases integer,
  missed_phase_one integer,
  mission_attempts integer,
  missed_deployments bigint,
  mission_tp bigint,
  deployed_tp bigint,
  total_gp bigint,
  zeffo integer,
  mandalore integer,
  reva integer,
  source text not null,
  source_ref text not null,
  metadata jsonb not null default '{}'::jsonb,
  unique (guild_id,start_date,player_name,source)
);
create index if not exists guild_rote_member_perf_lookup on public.guild_rote_member_performance(guild_id,start_date,ally_code);
alter table public.guild_rote_member_performance enable row level security;

create table if not exists public.guild_reva_shard_history (
  id bigint generated always as identity primary key,
  guild_id uuid not null references public.guilds(id) on delete cascade,
  rote_start_date date not null,
  ally_code text not null check (ally_code ~ '^[0-9]{9}$'),
  player_name text,
  earned boolean not null default false,
  in_guild boolean not null default true,
  source text not null,
  source_ref text not null,
  metadata jsonb not null default '{}'::jsonb,
  unique (guild_id,rote_start_date,ally_code,source)
);
create index if not exists guild_reva_shard_hist_lookup on public.guild_reva_shard_history(guild_id,rote_start_date,ally_code);
alter table public.guild_reva_shard_history enable row level security;
