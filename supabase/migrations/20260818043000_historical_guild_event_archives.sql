-- Normalized historical event mirrors for fast Guild Intelligence trend queries.
-- The versioned guild_history_archives JSON index remains the provenance-backed source index;
-- these tables intentionally store query-friendly event summaries and can later receive
-- member-detail payloads without changing the archive contract.

create table if not exists public.guild_ticket_history_snapshots (
  id bigint generated always as identity primary key,
  guild_id uuid not null references public.guilds(id) on delete cascade,
  ticket_date date not null,
  captured_at timestamptz not null,
  player_tickets jsonb not null,
  member_count integer not null,
  guild_total integer not null,
  below_600_count integer not null,
  zero_count integer not null,
  source text not null,
  source_ref text not null,
  metadata jsonb not null default '{}'::jsonb,
  unique(guild_id,ticket_date,source,source_ref)
);

create table if not exists public.guild_raid_history_events (
  id bigint generated always as identity primary key,
  guild_id uuid not null references public.guilds(id) on delete cascade,
  raid_date date not null,
  raid_name text not null,
  member_scores jsonb not null,
  participant_count integer not null,
  guild_score bigint not null,
  source text not null,
  source_ref text not null,
  metadata jsonb not null default '{}'::jsonb,
  unique(guild_id,raid_date,raid_name,source)
);

create table if not exists public.guild_rote_history_events (
  id bigint generated always as identity primary key,
  guild_id uuid not null references public.guilds(id) on delete cascade,
  start_at timestamptz not null,
  performance_summary jsonb not null,
  member_count integer not null,
  total_mission_tp bigint not null,
  total_deployed_tp bigint not null,
  missed_phases integer not null,
  missed_deployments bigint not null,
  zeffo_wins integer not null,
  mandalore_wins integer not null,
  reva_wins integer not null,
  source text not null,
  source_ref text not null,
  metadata jsonb not null default '{}'::jsonb,
  unique(guild_id,start_at,source)
);

create table if not exists public.guild_reva_history_events (
  id bigint generated always as identity primary key,
  guild_id uuid not null references public.guilds(id) on delete cascade,
  rote_start_date date not null,
  earned jsonb not null,
  in_guild jsonb not null default '[]'::jsonb,
  shard_count integer not null,
  source text not null,
  source_ref text not null,
  metadata jsonb not null default '{}'::jsonb,
  unique(guild_id,rote_start_date,source)
);

alter table public.guild_ticket_history_snapshots enable row level security;
alter table public.guild_raid_history_events enable row level security;
alter table public.guild_rote_history_events enable row level security;
alter table public.guild_reva_history_events enable row level security;

create index if not exists guild_ticket_history_snapshots_guild_date_idx on public.guild_ticket_history_snapshots(guild_id,ticket_date desc);
create index if not exists guild_raid_history_events_guild_date_idx on public.guild_raid_history_events(guild_id,raid_date desc);
create index if not exists guild_rote_history_events_guild_date_idx on public.guild_rote_history_events(guild_id,start_at desc);
create index if not exists guild_reva_history_events_guild_date_idx on public.guild_reva_history_events(guild_id,rote_start_date desc);

revoke all on public.guild_ticket_history_snapshots, public.guild_raid_history_events, public.guild_rote_history_events, public.guild_reva_history_events from anon, authenticated;
