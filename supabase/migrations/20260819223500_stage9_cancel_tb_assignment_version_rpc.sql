-- Stage 9: cancel an immutable assignment version without rewriting its payload.

create or replace function public.cancel_guild_tb_assignment_version(
  p_guild_id uuid,
  p_run_id uuid,
  p_reason text,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
set search_path=pg_catalog,public
as $$
declare
  v_run public.guild_tb_assignment_runs%rowtype;
  v_now timestamptz := now();
  v_reason text := nullif(left(btrim(coalesce(p_reason,'')), 500), '');
begin
  if p_run_id is null then
    raise exception 'TB_ASSIGNMENT_VERSION_REQUIRED' using errcode = '22023';
  end if;
  if p_actor_user_id is null then
    raise exception 'TB_ASSIGNMENT_CANCELLER_REQUIRED' using errcode = '22023';
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

  if v_run.cancelled_at is not null or v_run.status = 'cancelled' then
    return jsonb_build_object(
      'runId', v_run.id,
      'cancelledAt', v_run.cancelled_at,
      'cancelledByUserId', v_run.cancelled_by_user_id,
      'reason', v_run.cancellation_reason,
      'alreadyCancelled', true
    );
  end if;

  update public.guild_tb_assignment_runs
  set status = 'cancelled',
      cancelled_at = v_now,
      cancelled_by_user_id = p_actor_user_id,
      cancellation_reason = v_reason
  where id = v_run.id;

  insert into public.guild_tb_assignment_decisions (
    guild_id, run_id, decision, actor_user_id, plan_hash, reason, metadata
  ) values (
    p_guild_id,
    v_run.id,
    'cancelled',
    p_actor_user_id,
    v_run.plan_hash,
    v_reason,
    jsonb_build_object('phase', v_run.rote_phase, 'versionNumber', v_run.version_number, 'wasApproved', v_run.approved_at is not null)
  );

  return jsonb_build_object(
    'runId', v_run.id,
    'cancelledAt', v_now,
    'cancelledByUserId', p_actor_user_id,
    'reason', v_reason,
    'alreadyCancelled', false
  );
end
$$;

revoke all on function public.cancel_guild_tb_assignment_version(uuid,uuid,text,uuid)
  from public,anon,authenticated;
grant execute on function public.cancel_guild_tb_assignment_version(uuid,uuid,text,uuid)
  to service_role;
