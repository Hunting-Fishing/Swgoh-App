alter role service_role reset statement_timeout;

create or replace function public.finalize_staged_guild_sync(p_job_id uuid, p_header jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
set statement_timeout = '0'
as $$
declare
  v_job public.guild_sync_jobs%rowtype;
  v_stage_count integer := 0;
  v_expected integer := 0;
  v_payload jsonb;
  v_result jsonb;
  v_sync_run_id uuid;
  v_activity_snapshot_id bigint;
begin
  if p_job_id is null or p_header is null then
    raise exception 'A Guild sync job and header payload are required.';
  end if;

  select * into v_job
  from public.guild_sync_jobs
  where id = p_job_id
  for update;

  if not found then
    raise exception 'Guild sync job was not found.';
  end if;

  if v_job.status = 'completed' and v_job.sync_run_id is not null then
    select coalesce((r.metadata->>'activitySnapshotId')::bigint, null)
      into v_activity_snapshot_id
    from public.guild_sync_runs r
    where r.id = v_job.sync_run_id;

    return jsonb_build_object(
      'ok', true,
      'syncRunId', v_job.sync_run_id,
      'guildId', v_job.guild_id,
      'membersStored', coalesce((select r.members_discovered from public.guild_sync_runs r where r.id = v_job.sync_run_id), 0),
      'unitsStored', coalesce((select r.units_loaded from public.guild_sync_runs r where r.id = v_job.sync_run_id), 0),
      'activitySnapshotId', v_activity_snapshot_id,
      'boundedTransport', true,
      'alreadyFinalized', true
    );
  end if;

  if v_job.status <> 'running' then
    raise exception 'Guild sync job must be running before staged finalize (status=%).', v_job.status;
  end if;

  if coalesce(p_header->>'requesterUserId', '') <> v_job.requested_by_user_id::text then
    raise exception 'Staged Guild sync requester does not match the queued job.';
  end if;

  v_expected := greatest(0, coalesce((p_header->'hydration'->>'requested')::integer, 0));
  if v_expected <= 0 then
    raise exception 'Staged Guild sync header has no expected member count.';
  end if;

  select count(*)::integer into v_stage_count
  from public.guild_sync_stage_members s
  where s.job_id = p_job_id
    and s.guild_id = v_job.guild_id
    and s.requester_user_id = v_job.requested_by_user_id;

  if v_stage_count <> v_expected then
    raise exception 'Staged Guild sync member count mismatch (%/%).', v_stage_count, v_expected;
  end if;

  if exists (
    select 1
    from public.guild_sync_stage_members s
    where s.job_id = p_job_id
      and (s.guild_id <> v_job.guild_id or s.requester_user_id <> v_job.requested_by_user_id)
  ) then
    raise exception 'Staged Guild sync contains cross-tenant rows.';
  end if;

  select (p_header - 'members') || jsonb_build_object(
    'members', coalesce(jsonb_agg(s.payload order by s.member_index), '[]'::jsonb)
  ) into v_payload
  from public.guild_sync_stage_members s
  where s.job_id = p_job_id;

  if jsonb_array_length(coalesce(v_payload->'members', '[]'::jsonb)) <> v_expected then
    raise exception 'Staged Guild sync aggregate is incomplete.';
  end if;

  v_result := public.ingest_verified_user_guild_sync(v_payload);

  if coalesce((v_result->>'ok')::boolean, false) is true then
    begin
      v_sync_run_id := nullif(v_result->>'syncRunId', '')::uuid;
    exception when others then
      v_sync_run_id := null;
    end;

    if v_sync_run_id is null then
      raise exception 'Successful Guild finalize did not return a sync run ID.';
    end if;

    update public.guild_sync_runs
    set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'syncJobId', p_job_id,
      'boundedTransport', true,
      'stagedMembers', v_stage_count
    )
    where id = v_sync_run_id;

    update public.guild_sync_jobs
    set status = 'completed',
        completed_at = now(),
        sync_run_id = v_sync_run_id,
        last_error = null,
        claimed_at = null,
        claimed_by = null,
        updated_at = now(),
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
          'boundedTransport', true,
          'stagedMembers', v_stage_count,
          'completedAtomically', true
        )
    where id = p_job_id
      and status = 'running';

    delete from public.guild_sync_stage_members
    where job_id = p_job_id;

    return coalesce(v_result, '{}'::jsonb) || jsonb_build_object(
      'stagedMembers', v_stage_count,
      'boundedTransport', true,
      'jobCompletedAtomically', true
    );
  end if;

  return coalesce(v_result, '{}'::jsonb) || jsonb_build_object(
    'stagedMembers', v_stage_count,
    'boundedTransport', true,
    'jobCompletedAtomically', false
  );
end;
$$;

revoke all on function public.finalize_staged_guild_sync(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.finalize_staged_guild_sync(uuid, jsonb) to service_role;

comment on function public.finalize_staged_guild_sync(uuid, jsonb) is
  'Idempotent verified staged Guild finalizer. Successful persistence and queue completion occur in the same database transaction so a lost HTTP acknowledgement cannot cause duplicate retries.';
