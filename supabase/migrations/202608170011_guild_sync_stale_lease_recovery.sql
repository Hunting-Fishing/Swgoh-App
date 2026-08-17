create or replace function public.recover_stale_guild_sync_jobs(
  p_stale_seconds integer default 90
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_threshold interval;
  v_recovered integer := 0;
begin
  v_threshold := make_interval(secs => least(3600, greatest(30, coalesce(p_stale_seconds, 90))));

  with stale as (
    select id, attempt_count, max_attempts
    from public.guild_sync_jobs
    where status = 'running'
      and updated_at < now() - v_threshold
    for update skip locked
  ), changed as (
    update public.guild_sync_jobs jobs
    set status = case when stale.attempt_count >= stale.max_attempts then 'failed' else 'queued' end,
        run_after = case when stale.attempt_count >= stale.max_attempts then jobs.run_after else now() end,
        claimed_at = null,
        claimed_by = null,
        completed_at = case when stale.attempt_count >= stale.max_attempts then now() else null end,
        last_error = case
          when coalesce(jobs.last_error, '') = '' then 'Recovered stale Guild sync worker lease.'
          else left(jobs.last_error || ' | Recovered stale Guild sync worker lease.', 1000)
        end,
        updated_at = now()
    from stale
    where jobs.id = stale.id
    returning jobs.id
  )
  select count(*) into v_recovered from changed;

  return v_recovered;
end;
$$;

revoke all on function public.recover_stale_guild_sync_jobs(integer) from public;
revoke all on function public.recover_stale_guild_sync_jobs(integer) from anon;
revoke all on function public.recover_stale_guild_sync_jobs(integer) from authenticated;
grant execute on function public.recover_stale_guild_sync_jobs(integer) to service_role;

comment on function public.recover_stale_guild_sync_jobs(integer) is
  'Service-role-only recovery for RUNNING Guild jobs whose worker heartbeat stopped. Requeues retryable jobs and fails jobs that exhausted max_attempts.';
