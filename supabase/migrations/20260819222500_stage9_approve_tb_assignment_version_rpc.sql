-- Stage 9: approve one exact immutable assignment version/hash.

create or replace function public.approve_guild_tb_assignment_version(
  p_guild_id uuid,
  p_run_id uuid,
  p_plan_hash text,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
set search_path=pg_catalog,public
as $$
declare
  v_run public.guild_tb_assignment_runs%rowtype;
  v_now timestamptz := now();
begin
  if p_run_id is null then
    raise exception 'TB_ASSIGNMENT_VERSION_REQUIRED' using errcode = '22023';
  end if;
  if p_actor_user_id is null then
    raise exception 'TB_ASSIGNMENT_APPROVER_REQUIRED' using errcode = '22023';
  end if;
  if p_plan_hash is null or lower(p_plan_hash) !~ '^[0-9a-f]{64}$' then
    raise exception 'TB_ASSIGNMENT_INVALID_HASH' using errcode = '22023';
  end if;

  select *
  into v_run
  from public.guild_tb_assignment_runs
  where id = p_run_id
    and guild_id = p_guild_id
  for update;

  if not found then
    raise exception 'TB_ASSIGNMENT_VERSION_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_run.plan_hash is null or v_run.plan_hash <> lower(p_plan_hash) then
    raise exception 'TB_ASSIGNMENT_APPROVAL_HASH_MISMATCH' using errcode = '22000';
  end if;
  if v_run.cancelled_at is not null or v_run.status = 'cancelled' then
    raise exception 'TB_ASSIGNMENT_VERSION_CANCELLED' using errcode = '55000';
  end if;
  if v_run.superseded_by_run_id is not null then
    raise exception 'TB_ASSIGNMENT_VERSION_SUPERSEDED' using errcode = '55000';
  end if;

  if v_run.approved_at is not null then
    if v_run.approved_plan_hash <> lower(p_plan_hash) then
      raise exception 'TB_ASSIGNMENT_EXISTING_APPROVAL_HASH_MISMATCH' using errcode = '55000';
    end if;
    return jsonb_build_object(
      'runId', v_run.id,
      'planHash', v_run.plan_hash,
      'approvedAt', v_run.approved_at,
      'approvedByUserId', v_run.approved_by_user_id,
      'alreadyApproved', true
    );
  end if;

  update public.guild_tb_assignment_runs
  set approved_at = v_now,
      approved_by_user_id = p_actor_user_id,
      approved_plan_hash = lower(p_plan_hash)
  where id = v_run.id;

  insert into public.guild_tb_assignment_decisions (
    guild_id, run_id, decision, actor_user_id, plan_hash, metadata
  ) values (
    p_guild_id,
    v_run.id,
    'approved',
    p_actor_user_id,
    lower(p_plan_hash),
    jsonb_build_object('phase', v_run.rote_phase, 'versionNumber', v_run.version_number)
  );

  return jsonb_build_object(
    'runId', v_run.id,
    'planHash', lower(p_plan_hash),
    'approvedAt', v_now,
    'approvedByUserId', p_actor_user_id,
    'alreadyApproved', false
  );
end
$$;

revoke all on function public.approve_guild_tb_assignment_version(uuid,uuid,text,uuid)
  from public,anon,authenticated;
grant execute on function public.approve_guild_tb_assignment_version(uuid,uuid,text,uuid)
  to service_role;
