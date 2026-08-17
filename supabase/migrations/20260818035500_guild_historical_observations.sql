create table if not exists public.guild_roster_history_snapshots (
  id bigint generated always as identity primary key,
  guild_id uuid not null references public.guilds(id) on delete cascade,
  observed_at timestamptz not null,
  source text not null,
  source_ref text not null,
  member_count integer not null check (member_count >= 0 and member_count <= 50),
  galactic_power bigint,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (guild_id,observed_at,source)
);
create index if not exists guild_roster_history_snapshots_guild_time_idx on public.guild_roster_history_snapshots(guild_id,observed_at desc);

create table if not exists public.guild_membership_observations (
  id bigint generated always as identity primary key,
  snapshot_id bigint not null references public.guild_roster_history_snapshots(id) on delete cascade,
  guild_id uuid not null references public.guilds(id) on delete cascade,
  ally_code text not null check (ally_code ~ '^[0-9]{9}$'),
  player_name text not null,
  guild_join_time timestamptz,
  galactic_power bigint,
  observed_at timestamptz not null,
  source text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(snapshot_id,ally_code)
);
create index if not exists guild_membership_observations_guild_ally_time_idx on public.guild_membership_observations(guild_id,ally_code,observed_at);
create index if not exists guild_membership_observations_join_time_idx on public.guild_membership_observations(guild_id,guild_join_time) where guild_join_time is not null;

alter table public.guild_roster_history_snapshots enable row level security;
alter table public.guild_membership_observations enable row level security;

comment on table public.guild_roster_history_snapshots is 'Provenance-aware historical Guild roster snapshots. Complete snapshots may bound absence windows but must not fabricate an exact leave timestamp.';
comment on table public.guild_membership_observations is 'Per-player historical Guild presence observations keyed by Ally Code and preserving source-reported guild_join_time.';
