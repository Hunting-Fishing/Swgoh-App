-- PostgREST upserts use ON CONFLICT(observation_key). A full unique index is
-- required for conflict-target inference; PostgreSQL unique indexes already
-- allow multiple NULL values, so the previous partial predicate is unnecessary.

drop index if exists public.gac_counter_observations_key_uidx;

create unique index if not exists gac_counter_observations_key_uidx
  on public.gac_counter_observations(observation_key);

comment on column public.gac_counter_observations.observation_key is
  'Deterministic source/event/player/defense/counter identity used for idempotent PostgREST upserts.';
