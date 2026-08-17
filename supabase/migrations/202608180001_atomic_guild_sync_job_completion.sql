create or replace function public.acknowledge_completed_guild_sync_job()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_bounded_transport boolean := false;
  v_activity_snapshot_id jsonb := 'null'::jsonb;
  v_canonical_ingest text;
begin
  if new.status <> 'completed' then
    return new;
  end if;

  v_bounded_transport := coalesce(new.metadata->>'boundedTransport', 'false') = 'true';
  v_activity_snapshot_id := coalesce(new.metadata->'activitySnapshotId', 'null'::jsonb);
  v_canonical_ingest := coalesce(nullif(new.metadata->>'canonicalIngest', ''), 'sync-run');

  update public.guild_sync_jobs j
  set status = 'completed',
      completed_at = coalesce(new.completed_at, now()),
      sync_run_id = new.id,
      last_error = null,
      claimed_at = null,
      claimed_by = null,
      updated_at = coalesce(new.completed_at, now()),
      metadata = coalesce(j.metadata, '{}'::jsonb) || jsonb_build_object(
        'boundedTransport', v_bounded_transport,
        'canonicalIngest', v_canonical_ingest,
        'completedAtomically', true,
        'completedBy', 'guild-sync-run-trigger-v1',
        'workerResult', jsonb_build_object(
          'membersStored', greatest(0, coalesce(new.members_discovered, 0)),
          'unitsStored', greatest(0, coalesce(new.units_loaded, 0)),
          'activitySnapshotId', v_activity_snapshot_id,
          'capturedAt', new.started_at,
          'boundedTransport', v_bounded_transport
        )
      )
  where j.sync_run_id = new.id
    and j.guild_id = new.guild_id
    and j.status = 'running';

  return new;
end;
$$;

revoke all on function public.acknowledge_completed_guild_sync_job() from public, anon, authenticated;

drop trigger if exists guild_sync_run_complete_job_ack on public.guild_sync_runs;
create trigger guild_sync_run_complete_job_ack
after update of status on public.guild_sync_runs
for each row
when (new.status = 'completed')
execute function public.acknowledge_completed_guild_sync_job();

-- Reconcile any committed run whose worker lost the HTTP acknowledgement before
-- this trigger existed. Future completions are handled inside the run transaction.
update public.guild_sync_jobs j
set status = 'completed',
    completed_at = coalesce(r.completed_at, now()),
    sync_run_id = r.id,
    last_error = null,
    claimed_at = null,
    claimed_by = null,
    updated_at = coalesce(r.completed_at, now()),
    metadata = coalesce(j.metadata, '{}'::jsonb) || jsonb_build_object(
      'boundedTransport', coalesce(r.metadata->>'boundedTransport', 'false') = 'true',
      'canonicalIngest', coalesce(nullif(r.metadata->>'canonicalIngest', ''), 'sync-run'),
      'completedAtomically', true,
      'completedBy', 'atomic-guild-sync-job-completion-backfill-v1',
      'workerResult', jsonb_build_object(
        'membersStored', greatest(0, coalesce(r.members_discovered, 0)),
        'unitsStored', greatest(0, coalesce(r.units_loaded, 0)),
        'activitySnapshotId', coalesce(r.metadata->'activitySnapshotId', 'null'::jsonb),
        'capturedAt', r.started_at,
        'boundedTransport', coalesce(r.metadata->>'boundedTransport', 'false') = 'true'
      )
    )
from public.guild_sync_runs r
where j.sync_run_id = r.id
  and j.guild_id = r.guild_id
  and j.status = 'running'
  and r.status = 'completed';

comment on function public.acknowledge_completed_guild_sync_job() is
  'Atomically marks the matching durable Guild sync job completed whenever its canonical Guild sync run commits. This prevents a lost HTTP acknowledgement from requeueing an already-persisted 50-member Guild sync.';
