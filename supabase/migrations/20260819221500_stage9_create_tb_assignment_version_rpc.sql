-- Stage 9: atomically allocate and persist one immutable ROTE assignment version.

create or replace function public.create_guild_tb_assignment_version(
  p_guild_id uuid,
  p_plan_id uuid,
  p_rote_phase text,
  p_version_number integer,
  p_plan_hash text,
  p_input_fingerprint text,
  p_assignments jsonb default '[]'::jsonb,
  p_unfilled jsonb default '[]'::jsonb,
  p_diagnostics jsonb default '{}'::jsonb,
  p_delivery jsonb default '{}'::jsonb,
  p_actor_user_id uuid default null
)
returns jsonb
language plpgsql
set search_path=pg_catalog,public
as $$
declare
  v_next_version integer;
  v_prior_id uuid;
  v_prior_hash text;
  v_run_id uuid;
begin
  if p_plan_id is null then
    raise exception 'TB_ASSIGNMENT_PLAN_REQUIRED' using errcode = '22023';
  end if;
  if p_rote_phase is null or upper(p_rote_phase) !~ '^P[1-6]$' then
    raise exception 'TB_ASSIGNMENT_INVALID_PHASE' using errcode = '22023';
  end if;
  if p_version_number is null or p_version_number < 1 then
    raise exception 'TB_ASSIGNMENT_INVALID_VERSION' using errcode = '22023';
  end if;
  if p_plan_hash is null or lower(p_plan_hash) !~ '^[0-9a-f]{64}$' then
    raise exception 'TB_ASSIGNMENT_INVALID_HASH' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_input_fingerprint,'')), '') is null then
    raise exception 'TB_ASSIGNMENT_INPUT_FINGERPRINT_REQUIRED' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_assignments,'[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_unfilled,'[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_diagnostics,'{}'::jsonb)) <> 'object'
     or jsonb_typeof(coalesce(p_delivery,'{}'::jsonb)) <> 'object' then
    raise exception 'TB_ASSIGNMENT_INVALID_PAYLOAD_SHAPE' using errcode = '22023';
  end if;

  -- Locking the plan row serializes version allocation for this plan without a
  -- long-lived application transaction.
  perform 1
  from public.guild_tb_plans
  where id = p_plan_id
    and guild_id = p_guild_id
    and tb_key = 'rote'
  for update;

  if not found then
    raise exception 'TB_ASSIGNMENT_PLAN_NOT_FOUND' using errcode = 'P0002';
  end if;

  select coalesce(max(version_number), 0) + 1
  into v_next_version
  from public.guild_tb_assignment_runs
  where guild_id = p_guild_id
    and plan_id = p_plan_id
    and rote_phase = upper(p_rote_phase)
    and version_number is not null;

  if p_version_number <> v_next_version then
    raise exception 'TB_ASSIGNMENT_VERSION_CONFLICT expected=% supplied=%', v_next_version, p_version_number
      using errcode = '40001';
  end if;

  select id, plan_hash
  into v_prior_id, v_prior_hash
  from public.guild_tb_assignment_runs
  where guild_id = p_guild_id
    and plan_id = p_plan_id
    and rote_phase = upper(p_rote_phase)
    and version_number is not null
    and superseded_by_run_id is null
  order by version_number desc
  limit 1;

  insert into public.guild_tb_assignment_runs (
    guild_id,
    plan_id,
    status,
    input_fingerprint,
    assignments,
    unfilled,
    diagnostics,
    delivery,
    created_by_user_id,
    rote_phase,
    version_number,
    plan_hash,
    supersedes_run_id
  ) values (
    p_guild_id,
    p_plan_id,
    'preview',
    btrim(p_input_fingerprint),
    coalesce(p_assignments,'[]'::jsonb),
    coalesce(p_unfilled,'[]'::jsonb),
    coalesce(p_diagnostics,'{}'::jsonb),
    coalesce(p_delivery,'{}'::jsonb),
    p_actor_user_id,
    upper(p_rote_phase),
    p_version_number,
    lower(p_plan_hash),
    v_prior_id
  )
  returning id into v_run_id;

  if v_prior_id is not null then
    update public.guild_tb_assignment_runs
    set superseded_by_run_id = v_run_id
    where id = v_prior_id;

    insert into public.guild_tb_assignment_decisions (
      guild_id, run_id, decision, actor_user_id, plan_hash, reason, metadata
    ) values (
      p_guild_id,
      v_prior_id,
      'superseded',
      p_actor_user_id,
      v_prior_hash,
      'A newer immutable assignment version was created.',
      jsonb_build_object('supersededByRunId', v_run_id, 'newVersionNumber', p_version_number)
    );
  end if;

  insert into public.guild_tb_assignment_decisions (
    guild_id, run_id, decision, actor_user_id, plan_hash, metadata
  ) values (
    p_guild_id,
    v_run_id,
    'created',
    p_actor_user_id,
    lower(p_plan_hash),
    jsonb_build_object('phase', upper(p_rote_phase), 'versionNumber', p_version_number, 'supersedesRunId', v_prior_id)
  );

  return jsonb_build_object(
    'runId', v_run_id,
    'phase', upper(p_rote_phase),
    'versionNumber', p_version_number,
    'planHash', lower(p_plan_hash),
    'supersedesRunId', v_prior_id
  );
end
$$;

revoke all on function public.create_guild_tb_assignment_version(uuid,uuid,text,integer,text,text,jsonb,jsonb,jsonb,jsonb,uuid)
  from public,anon,authenticated;
grant execute on function public.create_guild_tb_assignment_version(uuid,uuid,text,integer,text,text,jsonb,jsonb,jsonb,jsonb,uuid)
  to service_role;
