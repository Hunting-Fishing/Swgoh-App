-- Stage 9: immutable ROTE assignment-plan versions.
-- The authoritative publishable artifact remains guild_tb_assignment_runs.

alter table public.guild_tb_assignment_runs
  add column if not exists rote_phase text,
  add column if not exists version_number integer,
  add column if not exists plan_hash text,
  add column if not exists supersedes_run_id uuid references public.guild_tb_assignment_runs(id) on delete set null,
  add column if not exists superseded_by_run_id uuid references public.guild_tb_assignment_runs(id) on delete set null,
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by_user_id uuid,
  add column if not exists approved_plan_hash text,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by_user_id uuid,
  add column if not exists cancellation_reason text;

alter table public.guild_tb_assignment_runs
  drop constraint if exists guild_tb_assignment_runs_rote_phase_check;
alter table public.guild_tb_assignment_runs
  add constraint guild_tb_assignment_runs_rote_phase_check
  check (rote_phase is null or rote_phase in ('P1','P2','P3','P4','P5','P6'));

alter table public.guild_tb_assignment_runs
  drop constraint if exists guild_tb_assignment_runs_version_number_check;
alter table public.guild_tb_assignment_runs
  add constraint guild_tb_assignment_runs_version_number_check
  check (version_number is null or version_number > 0);

alter table public.guild_tb_assignment_runs
  drop constraint if exists guild_tb_assignment_runs_plan_hash_check;
alter table public.guild_tb_assignment_runs
  add constraint guild_tb_assignment_runs_plan_hash_check
  check (plan_hash is null or plan_hash ~ '^[0-9a-f]{64}$');

create unique index if not exists guild_tb_assignment_runs_plan_phase_version_uidx
  on public.guild_tb_assignment_runs(plan_id,rote_phase,version_number)
  where plan_id is not null and rote_phase is not null and version_number is not null;

create index if not exists guild_tb_assignment_runs_plan_phase_created_idx
  on public.guild_tb_assignment_runs(plan_id,rote_phase,created_at desc);

create table if not exists public.guild_tb_assignment_decisions (
  id bigint generated always as identity primary key,
  guild_id uuid not null references public.guilds(id) on delete cascade,
  run_id uuid not null references public.guild_tb_assignment_runs(id) on delete cascade,
  decision text not null check (decision in ('created','approved','cancelled','superseded','publishability_rejected')),
  actor_user_id uuid,
  plan_hash text,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists guild_tb_assignment_decisions_run_time_idx
  on public.guild_tb_assignment_decisions(run_id,occurred_at,id);
create index if not exists guild_tb_assignment_decisions_guild_time_idx
  on public.guild_tb_assignment_decisions(guild_id,occurred_at desc,id desc);

alter table public.guild_tb_assignment_decisions enable row level security;
revoke all on table public.guild_tb_assignment_decisions from anon,authenticated;
grant all on table public.guild_tb_assignment_decisions to service_role;
grant usage,select on sequence public.guild_tb_assignment_decisions_id_seq to service_role;

-- Assignment payload columns are immutable after insert. Lifecycle columns such as
-- approval/cancellation/supersede pointers remain intentionally mutable so Stage 9
-- can record officer decisions without rewriting the approved artifact itself.
create or replace function public.reject_tb_assignment_payload_mutation()
returns trigger
language plpgsql
set search_path=pg_catalog,public
as $$
begin
  if new.guild_id is distinct from old.guild_id
     or new.plan_id is distinct from old.plan_id
     or new.rote_phase is distinct from old.rote_phase
     or new.version_number is distinct from old.version_number
     or new.plan_hash is distinct from old.plan_hash
     or new.input_fingerprint is distinct from old.input_fingerprint
     or new.assignments is distinct from old.assignments
     or new.unfilled is distinct from old.unfilled
     or new.diagnostics is distinct from old.diagnostics
     or new.source_guild_synced_at is distinct from old.source_guild_synced_at
     or new.created_by_user_id is distinct from old.created_by_user_id
     or new.created_at is distinct from old.created_at then
    raise exception 'immutable TB assignment payload cannot be modified; create a new version instead'
      using errcode = '55000';
  end if;
  return new;
end
$$;

drop trigger if exists reject_tb_assignment_payload_mutation on public.guild_tb_assignment_runs;
create trigger reject_tb_assignment_payload_mutation
before update on public.guild_tb_assignment_runs
for each row execute function public.reject_tb_assignment_payload_mutation();

revoke all on function public.reject_tb_assignment_payload_mutation() from public,anon,authenticated;
