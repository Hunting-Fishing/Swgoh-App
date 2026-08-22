-- A1: ROTE Operation Contribution Ledger foundation.
-- Separates current slot state, assignment history, and append-only actual contribution evidence.

create unique index if not exists guild_tb_events_id_guild_uidx
  on public.guild_tb_events(id, guild_id);

create table if not exists public.guild_tb_operation_slots (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  guild_id uuid not null,
  phase text not null,
  planet_id text not null,
  operation_id text not null,
  operation_name text not null default '',
  slot_id text not null,
  slot_index integer not null,
  required_base_id text not null,
  required_relic smallint,
  required_rarity smallint,
  source_kind text not null default 'canonical',
  source_ref text,
  source_fetched_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint guild_tb_operation_slots_event_guild_fk
    foreign key (event_id, guild_id)
    references public.guild_tb_events(id, guild_id)
    on delete cascade,
  constraint guild_tb_operation_slots_phase_check
    check (phase ~ '^P[1-6]$'),
  constraint guild_tb_operation_slots_planet_check
    check (planet_id ~ '^[a-z0-9-]{2,80}$'),
  constraint guild_tb_operation_slots_operation_check
    check (length(operation_id) between 1 and 160),
  constraint guild_tb_operation_slots_slot_check
    check (length(slot_id) between 1 and 160),
  constraint guild_tb_operation_slots_slot_index_check
    check (slot_index > 0),
  constraint guild_tb_operation_slots_base_id_check
    check (required_base_id ~ '^[A-Z0-9_:-]{2,100}$'),
  constraint guild_tb_operation_slots_relic_check
    check (required_relic is null or required_relic between 0 and 15),
  constraint guild_tb_operation_slots_rarity_check
    check (required_rarity is null or required_rarity between 1 and 7),
  constraint guild_tb_operation_slots_source_check
    check (source_kind in ('canonical','game','import','officer','system','unknown')),
  constraint guild_tb_operation_slots_metadata_check
    check (jsonb_typeof(metadata) = 'object'),
  unique(event_id, phase, operation_id, slot_id)
);

create unique index if not exists guild_tb_operation_slots_id_context_uidx
  on public.guild_tb_operation_slots(id, event_id, guild_id, phase);
create unique index if not exists guild_tb_operation_slots_id_base_uidx
  on public.guild_tb_operation_slots(id, required_base_id);
create index if not exists guild_tb_operation_slots_event_phase_idx
  on public.guild_tb_operation_slots(event_id, phase, planet_id, operation_id, slot_index);
create index if not exists guild_tb_operation_slots_guild_base_idx
  on public.guild_tb_operation_slots(guild_id, phase, required_base_id, event_id);

create table if not exists public.guild_tb_operation_assignments (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid not null,
  assignment_run_id uuid references public.guild_tb_assignment_runs(id) on delete set null,
  assigned_player_id uuid not null references public.players(id),
  assigned_ally_code text not null,
  assigned_base_id text not null,
  assignment_state text not null default 'assigned',
  assignment_source text not null default 'stage9',
  plan_hash text,
  input_fingerprint text,
  assigned_by_user_id uuid references public.profiles(id) on delete set null,
  assigned_at timestamptz not null default now(),
  superseded_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint guild_tb_operation_assignments_slot_unit_fk
    foreign key (slot_id, assigned_base_id)
    references public.guild_tb_operation_slots(id, required_base_id)
    on delete cascade,
  constraint guild_tb_operation_assignments_ally_check
    check (assigned_ally_code ~ '^[0-9]{9}$'),
  constraint guild_tb_operation_assignments_base_id_check
    check (assigned_base_id ~ '^[A-Z0-9_:-]{2,100}$'),
  constraint guild_tb_operation_assignments_state_check
    check (assignment_state in ('assigned','superseded','cancelled')),
  constraint guild_tb_operation_assignments_source_check
    check (assignment_source in ('stage9','officer','system','import')),
  constraint guild_tb_operation_assignments_plan_hash_check
    check (plan_hash is null or plan_hash ~ '^[0-9a-f]{64}$'),
  constraint guild_tb_operation_assignments_metadata_check
    check (jsonb_typeof(metadata) = 'object'),
  constraint guild_tb_operation_assignments_superseded_time_check
    check (superseded_at is null or superseded_at >= assigned_at)
);

create index if not exists guild_tb_operation_assignments_slot_time_idx
  on public.guild_tb_operation_assignments(slot_id, assigned_at desc, id desc);
create index if not exists guild_tb_operation_assignments_run_idx
  on public.guild_tb_operation_assignments(assignment_run_id, assigned_at desc)
  where assignment_run_id is not null;
create index if not exists guild_tb_operation_assignments_player_unit_idx
  on public.guild_tb_operation_assignments(assigned_player_id, assigned_base_id, assigned_at desc);
create unique index if not exists guild_tb_operation_assignments_one_active_idx
  on public.guild_tb_operation_assignments(slot_id)
  where assignment_state = 'assigned' and superseded_at is null;

create table if not exists public.guild_tb_operation_contributions (
  id uuid primary key default gen_random_uuid(),
  contribution_key text not null unique,
  evidence_fingerprint text not null,
  slot_id uuid not null,
  event_id uuid not null,
  guild_id uuid not null,
  phase text not null,
  contributor_player_id uuid references public.players(id),
  contributor_ally_code text,
  contributed_base_id text not null,
  contributed_relic smallint,
  contributed_rarity smallint,
  status text not null,
  evidence_class text not null,
  source_kind text not null,
  source_ref text,
  observed_at timestamptz not null,
  reported_by_user_id uuid references public.profiles(id) on delete set null,
  unit_snapshot jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint guild_tb_operation_contributions_slot_context_fk
    foreign key (slot_id, event_id, guild_id, phase)
    references public.guild_tb_operation_slots(id, event_id, guild_id, phase)
    on delete cascade,
  constraint guild_tb_operation_contributions_key_check
    check (contribution_key ~ '^[0-9a-f]{64}$'),
  constraint guild_tb_operation_contributions_fingerprint_check
    check (evidence_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint guild_tb_operation_contributions_phase_check
    check (phase ~ '^P[1-6]$'),
  constraint guild_tb_operation_contributions_ally_check
    check (contributor_ally_code is null or contributor_ally_code ~ '^[0-9]{9}$'),
  constraint guild_tb_operation_contributions_base_id_check
    check (contributed_base_id ~ '^[A-Z0-9_:-]{2,100}$'),
  constraint guild_tb_operation_contributions_relic_check
    check (contributed_relic is null or contributed_relic between 0 and 15),
  constraint guild_tb_operation_contributions_rarity_check
    check (contributed_rarity is null or contributed_rarity between 1 and 7),
  constraint guild_tb_operation_contributions_status_check
    check (status in ('filled','verified','mismatch','unknown')),
  constraint guild_tb_operation_contributions_evidence_class_check
    check (evidence_class in ('GAME_DATA','GUILD_DATA')),
  constraint guild_tb_operation_contributions_source_check
    check (source_kind in ('canonical','game_gateway','officer_web','member_web','discord','import','system','unknown')),
  constraint guild_tb_operation_contributions_snapshot_check
    check (jsonb_typeof(unit_snapshot) = 'object'),
  constraint guild_tb_operation_contributions_metadata_check
    check (jsonb_typeof(metadata) = 'object')
);

create index if not exists guild_tb_operation_contributions_event_slot_idx
  on public.guild_tb_operation_contributions(event_id, phase, slot_id, observed_at desc, id desc);
create index if not exists guild_tb_operation_contributions_guild_unit_idx
  on public.guild_tb_operation_contributions(guild_id, phase, contributed_base_id, observed_at desc);
create index if not exists guild_tb_operation_contributions_player_idx
  on public.guild_tb_operation_contributions(contributor_player_id, observed_at desc)
  where contributor_player_id is not null;
create index if not exists guild_tb_operation_contributions_status_idx
  on public.guild_tb_operation_contributions(event_id, phase, status, observed_at desc);

alter table public.guild_tb_operation_slots enable row level security;
alter table public.guild_tb_operation_assignments enable row level security;
alter table public.guild_tb_operation_contributions enable row level security;

revoke all on table public.guild_tb_operation_slots from anon, authenticated;
revoke all on table public.guild_tb_operation_assignments from anon, authenticated;
revoke all on table public.guild_tb_operation_contributions from anon, authenticated;

grant select, insert, update on table public.guild_tb_operation_slots to service_role;
revoke delete, truncate on table public.guild_tb_operation_slots from service_role;
grant select, insert, update on table public.guild_tb_operation_assignments to service_role;
revoke delete, truncate on table public.guild_tb_operation_assignments from service_role;
grant select, insert on table public.guild_tb_operation_contributions to service_role;
revoke update, delete, truncate on table public.guild_tb_operation_contributions from service_role;

create or replace function public.reject_guild_tb_operation_assignment_history_delete()
returns trigger
language plpgsql
set search_path=pg_catalog,public
as $$
begin
  raise exception using
    errcode = '55000',
    message = 'TB_OPERATION_ASSIGNMENT_HISTORY_PRESERVED';
end
$$;

drop trigger if exists reject_guild_tb_operation_assignment_delete on public.guild_tb_operation_assignments;
create trigger reject_guild_tb_operation_assignment_delete
before delete on public.guild_tb_operation_assignments
for each row execute function public.reject_guild_tb_operation_assignment_history_delete();

drop trigger if exists reject_guild_tb_operation_assignment_truncate on public.guild_tb_operation_assignments;
create trigger reject_guild_tb_operation_assignment_truncate
before truncate on public.guild_tb_operation_assignments
for each statement execute function public.reject_guild_tb_operation_assignment_history_delete();

create or replace function public.reject_guild_tb_operation_assignment_payload_mutation()
returns trigger
language plpgsql
set search_path=pg_catalog,public
as $$
begin
  if new.slot_id is distinct from old.slot_id
     or new.assignment_run_id is distinct from old.assignment_run_id
     or new.assigned_player_id is distinct from old.assigned_player_id
     or new.assigned_ally_code is distinct from old.assigned_ally_code
     or new.assigned_base_id is distinct from old.assigned_base_id
     or new.assignment_source is distinct from old.assignment_source
     or new.plan_hash is distinct from old.plan_hash
     or new.input_fingerprint is distinct from old.input_fingerprint
     or new.assigned_by_user_id is distinct from old.assigned_by_user_id
     or new.assigned_at is distinct from old.assigned_at
     or new.created_at is distinct from old.created_at then
    raise exception using
      errcode = '55000',
      message = 'TB_OPERATION_ASSIGNMENT_PAYLOAD_IMMUTABLE';
  end if;
  return new;
end
$$;

drop trigger if exists reject_guild_tb_operation_assignment_payload_update on public.guild_tb_operation_assignments;
create trigger reject_guild_tb_operation_assignment_payload_update
before update on public.guild_tb_operation_assignments
for each row execute function public.reject_guild_tb_operation_assignment_payload_mutation();

create or replace function public.reject_guild_tb_operation_contribution_mutation()
returns trigger
language plpgsql
set search_path=pg_catalog,public
as $$
begin
  raise exception using
    errcode = '55000',
    message = 'TB_OPERATION_CONTRIBUTION_EVIDENCE_APPEND_ONLY';
end
$$;

drop trigger if exists reject_guild_tb_operation_contribution_update_delete on public.guild_tb_operation_contributions;
create trigger reject_guild_tb_operation_contribution_update_delete
before update or delete on public.guild_tb_operation_contributions
for each row execute function public.reject_guild_tb_operation_contribution_mutation();

drop trigger if exists reject_guild_tb_operation_contribution_truncate on public.guild_tb_operation_contributions;
create trigger reject_guild_tb_operation_contribution_truncate
before truncate on public.guild_tb_operation_contributions
for each statement execute function public.reject_guild_tb_operation_contribution_mutation();

revoke all on function public.reject_guild_tb_operation_assignment_history_delete() from public, anon, authenticated;
revoke all on function public.reject_guild_tb_operation_assignment_payload_mutation() from public, anon, authenticated;
revoke all on function public.reject_guild_tb_operation_contribution_mutation() from public, anon, authenticated;

comment on table public.guild_tb_operation_slots is
  'Current durable Operation slot state for one TB event. Assignment and contribution history are stored separately.';
comment on table public.guild_tb_operation_assignments is
  'Auditable Operation assignment history. Identity/payload fields are immutable; lifecycle state may be superseded without deleting history.';
comment on table public.guild_tb_operation_contributions is
  'Append-only evidence of actual Operation contributions. Assignment is never treated as proof of contribution.';
comment on column public.guild_tb_operation_contributions.contribution_key is
  'Deterministic logical contribution identity for idempotent retries.';
comment on column public.guild_tb_operation_contributions.evidence_fingerprint is
  'Hash of material contribution evidence; conflicting evidence for one logical contribution must not overwrite history.';