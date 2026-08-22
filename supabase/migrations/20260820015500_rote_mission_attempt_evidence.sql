-- ROTE mission-attempt evidence foundation.
-- Rows are descriptive Guild/player observations only; they are never a predicted win probability.

create unique index if not exists guild_tb_events_id_guild_uidx
  on public.guild_tb_events(id, guild_id);

create table if not exists public.guild_tb_mission_attempts (
  id uuid primary key default gen_random_uuid(),
  attempt_key text not null unique,
  evidence_fingerprint text not null,
  event_id uuid not null,
  guild_id uuid not null,
  phase text not null,
  planet_id text not null,
  mission_id text not null,
  player_id uuid not null references public.players(id) on delete cascade,
  ally_code text not null,
  squad_signature text not null default '',
  team_snapshot jsonb not null default '[]'::jsonb,
  outcome text not null,
  waves_completed smallint,
  waves_total smallint,
  strategic_ability_snapshot jsonb,
  operation_state_snapshot jsonb,
  report_source text not null default 'member_web',
  source_ref text,
  reported_by_user_id uuid references public.profiles(id) on delete set null,
  reported_at timestamptz not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint guild_tb_mission_attempts_event_guild_fk
    foreign key (event_id, guild_id)
    references public.guild_tb_events(id, guild_id)
    on delete cascade,
  constraint guild_tb_mission_attempts_attempt_key_check
    check (attempt_key ~ '^[0-9a-f]{64}$'),
  constraint guild_tb_mission_attempts_fingerprint_check
    check (evidence_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint guild_tb_mission_attempts_phase_check
    check (phase ~ '^P[1-6]$'),
  constraint guild_tb_mission_attempts_planet_check
    check (planet_id ~ '^[a-z0-9-]{2,80}$'),
  constraint guild_tb_mission_attempts_mission_check
    check (length(mission_id) between 2 and 160),
  constraint guild_tb_mission_attempts_ally_check
    check (ally_code ~ '^[0-9]{9}$'),
  constraint guild_tb_mission_attempts_team_check
    check (jsonb_typeof(team_snapshot) = 'array'),
  constraint guild_tb_mission_attempts_outcome_check
    check (outcome in ('complete','partial','failed','skipped','unknown')),
  constraint guild_tb_mission_attempts_waves_check
    check (
      (waves_completed is null or waves_completed >= 0)
      and (waves_total is null or waves_total > 0)
      and (waves_completed is null or waves_total is null or waves_completed <= waves_total)
    ),
  constraint guild_tb_mission_attempts_source_check
    check (report_source in ('member_web','officer_web','discord','import','system','unknown')),
  constraint guild_tb_mission_attempts_metadata_check
    check (jsonb_typeof(metadata) = 'object'),
  constraint guild_tb_mission_attempts_strategic_check
    check (strategic_ability_snapshot is null or jsonb_typeof(strategic_ability_snapshot) = 'object'),
  constraint guild_tb_mission_attempts_operations_check
    check (operation_state_snapshot is null or jsonb_typeof(operation_state_snapshot) = 'object')
);

create index if not exists guild_tb_mission_attempts_event_mission_idx
  on public.guild_tb_mission_attempts(event_id, phase, planet_id, mission_id, reported_at desc);
create index if not exists guild_tb_mission_attempts_guild_mission_idx
  on public.guild_tb_mission_attempts(guild_id, phase, mission_id, reported_at desc);
create index if not exists guild_tb_mission_attempts_player_idx
  on public.guild_tb_mission_attempts(player_id, reported_at desc);
create index if not exists guild_tb_mission_attempts_squad_idx
  on public.guild_tb_mission_attempts(mission_id, squad_signature, reported_at desc)
  where squad_signature <> '';
create index if not exists guild_tb_mission_attempts_outcome_idx
  on public.guild_tb_mission_attempts(event_id, mission_id, outcome, reported_at desc);

alter table public.guild_tb_mission_attempts enable row level security;
revoke all on table public.guild_tb_mission_attempts from anon, authenticated;
grant select, insert on table public.guild_tb_mission_attempts to service_role;
revoke update, delete, truncate on table public.guild_tb_mission_attempts from service_role;

create or replace function public.reject_guild_tb_mission_attempt_mutation()
returns trigger
language plpgsql
set search_path=pg_catalog,public
as $$
begin
  raise exception using
    errcode = '55000',
    message = 'TB_MISSION_ATTEMPT_EVIDENCE_APPEND_ONLY';
end
$$;

drop trigger if exists reject_guild_tb_mission_attempt_update_delete on public.guild_tb_mission_attempts;
create trigger reject_guild_tb_mission_attempt_update_delete
before update or delete on public.guild_tb_mission_attempts
for each row execute function public.reject_guild_tb_mission_attempt_mutation();

drop trigger if exists reject_guild_tb_mission_attempt_truncate on public.guild_tb_mission_attempts;
create trigger reject_guild_tb_mission_attempt_truncate
before truncate on public.guild_tb_mission_attempts
for each statement execute function public.reject_guild_tb_mission_attempt_mutation();

revoke all on function public.reject_guild_tb_mission_attempt_mutation() from public, anon, authenticated;

comment on table public.guild_tb_mission_attempts is
  'Append-only ROTE mission attempt evidence. Observed completion statistics are descriptive Guild evidence, never predicted win probability.';
comment on column public.guild_tb_mission_attempts.attempt_key is
  'Deterministic logical-attempt identity used to make retries idempotent without rewriting evidence.';
comment on column public.guild_tb_mission_attempts.evidence_fingerprint is
  'Hash of the material evidence payload. A changed payload for the same attempt_key must fail closed rather than overwrite history.';
comment on column public.guild_tb_mission_attempts.team_snapshot is
  'Per-unit progression snapshot captured at attempt time, including Level/Stars/Gear/Relic/abilities/Zetas/Omicrons and known mod-derived stats.';