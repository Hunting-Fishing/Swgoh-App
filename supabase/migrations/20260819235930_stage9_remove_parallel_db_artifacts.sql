-- Retire superseded parallel Stage 9 objects that were applied before the
-- authoritative main-branch immutable assignment implementation landed.
-- This migration deliberately leaves additive legacy columns in place; only
-- duplicate execution paths / guards and the empty unused approval table go.

-- Fail closed if the legacy approval table unexpectedly acquired data. Main
-- uses guild_tb_assignment_decisions as the authoritative append-only ledger.
do $$
begin
  if to_regclass('public.guild_tb_assignment_run_approvals') is not null
     and exists (select 1 from public.guild_tb_assignment_run_approvals limit 1) then
    raise exception 'legacy guild_tb_assignment_run_approvals contains data; manual reconciliation required before cleanup'
      using errcode = '55000';
  end if;
end
$$;

-- Remove the duplicate immutable-payload trigger. The authoritative guard is
-- reject_tb_assignment_payload_mutation -> reject_tb_assignment_payload_mutation().
drop trigger if exists guild_tb_assignment_runs_immutable_payload
  on public.guild_tb_assignment_runs;
drop function if exists public.guard_immutable_tb_assignment_run_payload();

-- Remove the unused parallel approval ledger + its helper after the zero-row
-- fail-closed check above.
drop table if exists public.guild_tb_assignment_run_approvals;
drop function if exists public.guard_append_only_tb_assignment_approval();

-- Remove only the obsolete overloaded creation RPC. Keep the authoritative
-- main signature with integer version_number and delivery payload.
drop function if exists public.create_guild_tb_assignment_version(
  uuid, uuid, text, text, text, jsonb, jsonb, jsonb, uuid, text
);

-- The parallel unique index is redundant with the authoritative plan/phase
-- version uniqueness boundary and created extra write overhead.
drop index if exists public.guild_tb_assignment_runs_version_scope_uidx;

-- Verify cleanup did not remove authoritative Stage 9 boundaries.
do $$
begin
  if to_regclass('public.guild_tb_assignment_decisions') is null then
    raise exception 'authoritative guild_tb_assignment_decisions table is missing after Stage 9 cleanup'
      using errcode = '55000';
  end if;
  if to_regprocedure('public.create_guild_tb_assignment_version(uuid,uuid,text,integer,text,text,jsonb,jsonb,jsonb,jsonb,uuid)') is null then
    raise exception 'authoritative create_guild_tb_assignment_version RPC is missing after Stage 9 cleanup'
      using errcode = '55000';
  end if;
  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.guild_tb_assignment_runs'::regclass
      and tgname = 'reject_tb_assignment_payload_mutation'
      and not tgisinternal
  ) then
    raise exception 'authoritative immutable assignment payload trigger is missing after Stage 9 cleanup'
      using errcode = '55000';
  end if;
end
$$;
