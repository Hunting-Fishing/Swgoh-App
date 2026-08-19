-- Stage 9: immutable ROTE assignment versions + exact-hash approvals.
-- Existing rows remain readable; new Stage 9 versions populate the added metadata.

alter table public.guild_tb_assignment_runs
  add column if not exists rote_phase text,
  add column if not exists version_number bigint,
  add column if not exists plan_hash text,
  add column if not exists supersedes_run_id uuid references public.guild_tb_assignment_runs(id) on delete set null,
  add column if not exists superseded_by_run_id uuid references public.guild_tb_assignment_runs(id) on delete set null,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by_user_id uuid;

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

create unique index if not exists guild_tb_assignment_runs_version_scope_uidx
  on public.guild_tb_assignment_runs(
    guild_id,
    coalesce(plan_id, '00000000-0000-0000-0000-000000000000'::uuid),
    rote_phase,
    version_number
  )
  where rote_phase is not null and version_number is not null;

create index if not exists guild_tb_assignment_runs_superseded_idx
  on public.guild_tb_assignment_runs(guild_id,rote_phase,superseded_by_run_id,created_at desc);

create table if not exists public.guild_tb_assignment_run_approvals (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.guilds(id) on delete cascade,
  run_id uuid not null references public.guild_tb_assignment_runs(id) on delete cascade,
  plan_hash text not null check (plan_hash ~ '^[0-9a-f]{64}$'),
  decision text not null check (decision in ('approved','revoked')),
  actor_user_id uuid,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists guild_tb_assignment_run_approvals_run_time_idx
  on public.guild_tb_assignment_run_approvals(run_id,created_at desc,id desc);

create index if not exists guild_tb_assignment_run_approvals_guild_time_idx
  on public.guild_tb_assignment_run_approvals(guild_id,created_at desc);

alter table public.guild_tb_assignment_run_approvals enable row level security;
revoke all on table public.guild_tb_assignment_run_approvals from anon,authenticated;
grant all on table public.guild_tb_assignment_run_approvals to service_role;

-- Assignment payloads are immutable after insert. Stage 9 lifecycle metadata may
-- change, but a changed plan must always be inserted as a new version.
create or replace function public.guard_immutable_tb_assignment_run_payload()
returns trigger
language plpgsql
security definer
set search_path = public
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
     or new.created_by_user_id is distinct from old.created_by_user_id
     or new.created_at is distinct from old.created_at
     or new.supersedes_run_id is distinct from old.supersedes_run_id then
    raise exception 'immutable TB assignment version payload cannot be changed in place'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists guild_tb_assignment_runs_immutable_payload on public.guild_tb_assignment_runs;
create trigger guild_tb_assignment_runs_immutable_payload
before update on public.guild_tb_assignment_runs
for each row execute function public.guard_immutable_tb_assignment_run_payload();

-- Approval history is append-only. Revocation is represented by a new decision
-- row so officer approval history cannot be rewritten after the fact.
create or replace function public.guard_append_only_tb_assignment_approval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'TB assignment approval history is append-only'
    using errcode = '23514';
end;
$$;

drop trigger if exists guild_tb_assignment_run_approvals_append_only on public.guild_tb_assignment_run_approvals;
create trigger guild_tb_assignment_run_approvals_append_only
before update or delete on public.guild_tb_assignment_run_approvals
for each row execute function public.guard_append_only_tb_assignment_approval();
