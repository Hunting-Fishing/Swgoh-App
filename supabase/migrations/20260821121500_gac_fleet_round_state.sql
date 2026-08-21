-- Canonical GAC fleet round state.
-- Fleet observations and operational attack plans are kept separate from character squads
-- so capital ship, starter and reinforcement identities remain explicit and auditable.

create table if not exists public.gac_round_fleets (
  id bigint generated always as identity primary key,
  round_id uuid not null references public.gac_rounds(id) on delete cascade,
  owner text not null check (owner in ('player','opponent')),
  side text not null check (side in ('offense','defense')),
  zone text,
  fleet_slot integer check (fleet_slot is null or fleet_slot >= 0),
  capital_ship_base_id text not null,
  starters jsonb not null default '[]'::jsonb,
  reinforcements jsonb not null default '[]'::jsonb,
  members jsonb not null default '[]'::jsonb,
  banners integer check (banners is null or banners >= 0),
  successful boolean,
  battle_attempt integer check (battle_attempt is null or battle_attempt >= 0),
  source text not null,
  source_ref text,
  confidence numeric(5,4) not null default 1.0 check (confidence between 0 and 1),
  observed_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  check (jsonb_typeof(starters) = 'array' and jsonb_array_length(starters) = 3),
  check (jsonb_typeof(reinforcements) = 'array' and jsonb_array_length(reinforcements) <= 4),
  check (jsonb_typeof(members) = 'array' and jsonb_array_length(members) between 4 and 8),
  unique(round_id, owner, side, zone, fleet_slot, source)
);

create table if not exists public.gac_fleet_attack_plan_assignments (
  id bigint generated always as identity primary key,
  round_id uuid not null references public.gac_rounds(id) on delete cascade,
  defense_fleet_id bigint not null references public.gac_round_fleets(id) on delete cascade,
  attacker_capital_ship_base_id text not null,
  attacker_starters jsonb not null default '[]'::jsonb,
  attacker_reinforcements jsonb not null default '[]'::jsonb,
  attacker_members jsonb not null default '[]'::jsonb,
  status text not null default 'planned' check (status in ('planned','attempted','win','loss','abandoned')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  attempt_log jsonb not null default '[]'::jsonb,
  banners integer check (banners is null or banners >= 0),
  source text not null default 'verified-owner-fleet-war-room',
  source_ref text,
  planned_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  check (jsonb_typeof(attacker_starters) = 'array' and jsonb_array_length(attacker_starters) = 3),
  check (jsonb_typeof(attacker_reinforcements) = 'array' and jsonb_array_length(attacker_reinforcements) <= 4),
  check (jsonb_typeof(attacker_members) = 'array' and jsonb_array_length(attacker_members) between 4 and 8),
  check (jsonb_typeof(attempt_log) = 'array'),
  unique(round_id, defense_fleet_id)
);

create index if not exists gac_round_fleets_round_idx
  on public.gac_round_fleets(round_id, owner, side, zone, fleet_slot);
create index if not exists gac_round_fleets_capital_idx
  on public.gac_round_fleets(capital_ship_base_id, observed_at desc);
create index if not exists gac_fleet_attack_plan_round_idx
  on public.gac_fleet_attack_plan_assignments(round_id, status, updated_at desc);
create index if not exists gac_fleet_attack_plan_defense_idx
  on public.gac_fleet_attack_plan_assignments(defense_fleet_id);

alter table public.gac_round_fleets enable row level security;
alter table public.gac_fleet_attack_plan_assignments enable row level security;
revoke all on public.gac_round_fleets, public.gac_fleet_attack_plan_assignments from anon, authenticated;

comment on table public.gac_round_fleets is
  'Verified current-round fleet observations. Capital ship, starting three and optional reinforcements are persisted separately from character squads.';
comment on table public.gac_fleet_attack_plan_assignments is
  'Verified-owner operational Fleet War Room state: one locked attack fleet per verified enemy fleet defense, with append-only attempt snapshots.';
comment on column public.gac_fleet_attack_plan_assignments.attempt_log is
  'Operational fleet attempt snapshots only. A completed Win/Loss becomes historical evidence only after explicit verified-owner archival into gac_battles.';
