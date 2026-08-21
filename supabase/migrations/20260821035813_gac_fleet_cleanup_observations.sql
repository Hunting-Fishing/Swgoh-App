-- Canonical post-loss Fleet War Room observations.
-- These rows capture only user-observed post-battle enemy state. They never infer hidden
-- survivors, health, protection, turn meter, cooldowns, or cleanup win probability.

create table if not exists public.gac_fleet_cleanup_observations (
  id bigint generated always as identity primary key,
  round_id uuid not null references public.gac_rounds(id) on delete cascade,
  defense_fleet_id bigint not null references public.gac_round_fleets(id) on delete restrict,
  assignment_id bigint not null references public.gac_fleet_attack_plan_assignments(id) on delete restrict,
  attempt_index integer not null check (attempt_index >= 0),
  revision integer not null check (revision >= 1),
  observed_units jsonb not null default '[]'::jsonb,
  notes text,
  source text not null default 'verified-owner-post-loss-fleet-observation',
  source_ref text,
  observed_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  check (jsonb_typeof(observed_units) = 'array'),
  unique(assignment_id, attempt_index, revision)
);

create index if not exists gac_fleet_cleanup_round_idx
  on public.gac_fleet_cleanup_observations(round_id, observed_at desc);
create index if not exists gac_fleet_cleanup_defense_idx
  on public.gac_fleet_cleanup_observations(defense_fleet_id, observed_at desc);
create index if not exists gac_fleet_cleanup_assignment_idx
  on public.gac_fleet_cleanup_observations(assignment_id, attempt_index, revision desc);

alter table public.gac_fleet_cleanup_observations enable row level security;
revoke all on public.gac_fleet_cleanup_observations from anon, authenticated;

comment on table public.gac_fleet_cleanup_observations is
  'Append-only verified-owner observations of the enemy fleet state after a recorded Fleet War Room loss. Unknown state remains unknown.';
comment on column public.gac_fleet_cleanup_observations.observed_units is
  'Validated JSON array of original-defense fleet units with explicit alive/destroyed/unknown status and optional manually observed telemetry.';
comment on column public.gac_fleet_cleanup_observations.revision is
  'Append-only revision number for the same assignment/attempt; the latest revision is the current user-confirmed cleanup view without deleting prior observations.';
