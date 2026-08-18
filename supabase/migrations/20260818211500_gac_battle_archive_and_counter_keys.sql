-- GAC battle-level archive for imported public history sources such as C-3PO GAHistory.
-- This table does not claim to be the current live board; it stores completed/observed battle evidence.

alter table public.gac_counter_observations
  add column if not exists observation_key text,
  add column if not exists draws integer not null default 0;

alter table public.gac_counter_observations
  drop constraint if exists gac_counter_observations_draws_check;

alter table public.gac_counter_observations
  add constraint gac_counter_observations_draws_check
  check (draws >= 0 and draws <= battles);

create unique index if not exists gac_counter_observations_key_uidx
  on public.gac_counter_observations(observation_key)
  where observation_key is not null;

create table if not exists public.gac_battles (
  id bigint generated always as identity primary key,
  battle_key text not null unique,
  player_id uuid references public.players(id) on delete set null,
  swgoh_player_id text not null,
  ally_code text check (ally_code is null or ally_code ~ '^[0-9]{9}$'),
  event_instance_id text,
  season_id text,
  format text not null check (format in ('3v3','5v5')),
  match_index integer not null check (match_index >= 0),
  attack_group_index integer not null check (attack_group_index >= 0),
  duel_index integer not null check (duel_index >= 0),
  round_number smallint check (round_number is null or round_number between 1 and 3),
  match_id text,
  opponent_swgoh_player_id text,
  opponent_ally_code text check (opponent_ally_code is null or opponent_ally_code ~ '^[0-9]{9}$'),
  opponent_name text,
  attacker_leader_base_id text,
  attacker_members jsonb not null,
  defender_leader_base_id text,
  defender_members jsonb not null,
  battle_outcome text not null check (battle_outcome in ('win','loss','draw','unknown')),
  source text not null,
  source_ref text,
  source_updated_at timestamptz,
  imported_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists gac_battles_player_idx
  on public.gac_battles(player_id, imported_at desc)
  where player_id is not null;
create index if not exists gac_battles_ally_idx
  on public.gac_battles(ally_code, imported_at desc)
  where ally_code is not null;
create index if not exists gac_battles_event_idx
  on public.gac_battles(event_instance_id, format, match_index, attack_group_index, duel_index);
create index if not exists gac_battles_defense_leader_idx
  on public.gac_battles(format, defender_leader_base_id, imported_at desc);
create index if not exists gac_battles_attack_leader_idx
  on public.gac_battles(format, attacker_leader_base_id, imported_at desc);

alter table public.gac_battles enable row level security;
revoke all on public.gac_battles from anon, authenticated;

comment on table public.gac_battles is 'Completed or observed GAC battle evidence normalized from sourced history; never interpreted as a hidden/current live deployment.';
comment on column public.gac_battles.battle_key is 'Deterministic source/event/player/match/duel identity used for idempotent imports.';
comment on column public.gac_counter_observations.observation_key is 'Deterministic mode/season/defense/counter identity used for idempotent aggregate counter imports.';