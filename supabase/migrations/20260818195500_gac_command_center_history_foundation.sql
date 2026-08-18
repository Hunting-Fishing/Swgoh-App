-- GAC Command Center: persistent event, bracket, round, squad and counter-evidence history.
-- Public Comlink bracket data, SWGOH.GG history, user-confirmed board observations and
-- future authenticated matchStatus data are deliberately tagged with provenance/confidence
-- so the UI never presents inferred history as live board truth.

create table if not exists public.gac_events (
  id uuid primary key default gen_random_uuid(),
  event_instance_id text not null unique,
  season_id text not null,
  instance_id text,
  format text check (format is null or format in ('3v3','5v5')),
  status text,
  starts_at timestamptz,
  ends_at timestamptz,
  source text not null default 'comlink',
  source_ref text,
  captured_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.gac_brackets (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.gac_events(id) on delete cascade,
  league text not null check (league in ('KYBER','AURODIUM','CHROMIUM','BRONZIUM','CARBONITE')),
  bracket_index integer not null check (bracket_index >= 0),
  group_id text not null,
  captured_at timestamptz not null default now(),
  source text not null default 'comlink',
  metadata jsonb not null default '{}'::jsonb,
  unique(event_id, league, bracket_index),
  unique(group_id)
);

create table if not exists public.gac_bracket_players (
  bracket_id uuid not null references public.gac_brackets(id) on delete cascade,
  player_id uuid references public.players(id) on delete set null,
  swgoh_player_id text not null,
  ally_code text check (ally_code is null or ally_code ~ '^[0-9]{9}$'),
  player_name text not null,
  skill_rating integer,
  bracket_score integer,
  bracket_rank integer,
  guild_name text,
  captured_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  primary key (bracket_id, swgoh_player_id)
);

create table if not exists public.gac_rounds (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.gac_events(id) on delete cascade,
  round_number smallint not null check (round_number between 1 and 3),
  player_id uuid not null references public.players(id) on delete cascade,
  opponent_player_id uuid references public.players(id) on delete set null,
  opponent_swgoh_player_id text,
  opponent_ally_code text check (opponent_ally_code is null or opponent_ally_code ~ '^[0-9]{9}$'),
  opponent_name text,
  result text check (result is null or result in ('win','loss','draw','unknown')),
  player_banners integer,
  opponent_banners integer,
  attack_started_at timestamptz,
  attack_ended_at timestamptz,
  source text not null,
  source_ref text,
  confidence numeric(5,4) not null default 1.0 check (confidence between 0 and 1),
  verified boolean not null default false,
  recorded_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique(event_id, round_number, player_id, source)
);

create table if not exists public.gac_round_squads (
  id bigint generated always as identity primary key,
  round_id uuid not null references public.gac_rounds(id) on delete cascade,
  owner text not null check (owner in ('player','opponent')),
  side text not null check (side in ('offense','defense')),
  zone text,
  squad_slot integer,
  leader_base_id text,
  members jsonb not null,
  datacron jsonb,
  banners integer,
  successful boolean,
  battle_attempt integer,
  source text not null,
  source_ref text,
  confidence numeric(5,4) not null default 1.0 check (confidence between 0 and 1),
  observed_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.gac_counter_observations (
  id bigint generated always as identity primary key,
  format text not null check (format in ('3v3','5v5')),
  enemy_leader_base_id text not null,
  enemy_members jsonb not null,
  counter_leader_base_id text not null,
  counter_members jsonb not null,
  battles integer not null default 0 check (battles >= 0),
  wins integer not null default 0 check (wins >= 0 and wins <= battles),
  holds integer not null default 0 check (holds >= 0),
  average_banners numeric(8,3),
  league text,
  season_id text,
  source text not null,
  source_ref text,
  source_updated_at timestamptz,
  confidence numeric(5,4) not null default 1.0 check (confidence between 0 and 1),
  metadata jsonb not null default '{}'::jsonb,
  observed_at timestamptz not null default now()
);

create index if not exists gac_events_season_idx on public.gac_events(season_id, captured_at desc);
create index if not exists gac_brackets_event_league_idx on public.gac_brackets(event_id, league, bracket_index);
create index if not exists gac_bracket_players_player_idx on public.gac_bracket_players(swgoh_player_id, captured_at desc);
create index if not exists gac_bracket_players_ally_idx on public.gac_bracket_players(ally_code) where ally_code is not null;
create index if not exists gac_rounds_player_idx on public.gac_rounds(player_id, recorded_at desc);
create index if not exists gac_rounds_opponent_idx on public.gac_rounds(opponent_player_id, recorded_at desc) where opponent_player_id is not null;
create index if not exists gac_round_squads_round_idx on public.gac_round_squads(round_id, owner, side, zone);
create index if not exists gac_round_squads_leader_idx on public.gac_round_squads(leader_base_id, observed_at desc);
create index if not exists gac_counter_enemy_idx on public.gac_counter_observations(format, enemy_leader_base_id, battles desc);
create index if not exists gac_counter_counter_idx on public.gac_counter_observations(format, counter_leader_base_id, battles desc);

alter table public.gac_events enable row level security;
alter table public.gac_brackets enable row level security;
alter table public.gac_bracket_players enable row level security;
alter table public.gac_rounds enable row level security;
alter table public.gac_round_squads enable row level security;
alter table public.gac_counter_observations enable row level security;

revoke all on public.gac_events, public.gac_brackets, public.gac_bracket_players,
  public.gac_rounds, public.gac_round_squads, public.gac_counter_observations
  from anon, authenticated;

comment on table public.gac_events is 'Canonical GAC season/event identity and timing metadata.';
comment on table public.gac_brackets is 'Transient eight-player public GAC brackets captured from Comlink for reuse instead of per-user rescans.';
comment on table public.gac_bracket_players is 'Bracket membership index used to resolve a player to their active GAC bracket.';
comment on table public.gac_rounds is 'Per-player GAC round history with explicit provenance and confidence.';
comment on table public.gac_round_squads is 'Observed offense/defense squads for a GAC round; source distinguishes live-confirmed, user-confirmed and historical data.';
comment on table public.gac_counter_observations is 'Mode-specific counter evidence such as sample size, wins and banners from sourced historical datasets.';