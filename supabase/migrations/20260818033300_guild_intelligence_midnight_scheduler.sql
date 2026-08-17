create extension if not exists pg_cron;

create or replace function public.run_guild_intelligence_scheduler(p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_setting record;
  v_user_id uuid;
  v_player_id uuid;
  v_job_id uuid;
  v_report_date date;
  v_daily jsonb;
  v_job record;
  v_queued int := 0;
  v_attached int := 0;
  v_captured int := 0;
  v_errors int := 0;
begin
  for v_setting in
    select s.*,
      (p_now at time zone s.report_timezone)::date as local_date,
      (p_now at time zone s.report_timezone)::time as local_time
    from public.guild_intelligence_settings s
    where s.enabled
      and (p_now at time zone s.report_timezone)::time >= s.report_local_time
      and s.last_enqueued_report_date is distinct from (p_now at time zone s.report_timezone)::date
      and not exists (
        select 1 from public.guild_intelligence_daily_reports r
        where r.guild_id=s.guild_id and r.report_date=(p_now at time zone s.report_timezone)::date
      )
  loop
    v_user_id := null;
    v_player_id := null;
    v_job_id := null;
    v_report_date := v_setting.local_date;

    select gum.user_id, gum.player_id
      into v_user_id, v_player_id
    from public.guild_user_memberships gum
    join public.user_player_links upl
      on upl.user_id=gum.user_id
     and upl.player_id=gum.player_id
     and upl.verification_status='verified'
    where gum.guild_id=v_setting.guild_id
      and gum.status='active'
    order by case lower(gum.role) when 'owner' then 0 when 'officer' then 1 else 2 end,
             gum.updated_at desc
    limit 1;

    if v_user_id is null then
      update public.guild_intelligence_settings
      set last_error='Midnight report could not enqueue: no active verified Command Center user is linked to this Guild.',
          updated_at=now()
      where guild_id=v_setting.guild_id;
      v_errors := v_errors + 1;
      continue;
    end if;

    v_daily := jsonb_build_object(
      'reportDate', v_report_date::text,
      'timezone', v_setting.report_timezone,
      'scheduledLocalTime', v_setting.report_local_time::text,
      'requestedAt', p_now
    );

    select id into v_job_id
    from public.guild_sync_jobs
    where guild_id=v_setting.guild_id
      and status in ('queued','running')
    order by created_at asc
    limit 1;

    if v_job_id is not null then
      update public.guild_sync_jobs
      set metadata=coalesce(metadata,'{}'::jsonb) || jsonb_build_object('guildIntelligenceDaily',v_daily),
          updated_at=now()
      where id=v_job_id;
      v_attached := v_attached + 1;
    else
      insert into public.guild_sync_jobs(
        guild_id,requested_by_user_id,requested_by_player_id,trigger_kind,priority,status,
        include_activity,force_refresh,max_attempts,run_after,metadata,created_at,updated_at
      ) values (
        v_setting.guild_id,v_user_id,v_player_id,'scheduled',90,'queued',true,true,3,p_now,
        jsonb_build_object('guildIntelligenceDaily',v_daily,'scheduler','guild-intelligence-midnight-v1'),now(),now()
      ) returning id into v_job_id;
      v_queued := v_queued + 1;
    end if;

    update public.guild_intelligence_settings
    set last_enqueued_report_date=v_report_date,
        last_enqueued_at=p_now,
        last_error=null,
        updated_at=now()
    where guild_id=v_setting.guild_id;
  end loop;

  for v_job in
    select j.id,j.guild_id,j.metadata
    from public.guild_sync_jobs j
    where j.status='completed'
      and j.metadata ? 'guildIntelligenceDaily'
      and nullif(j.metadata->'guildIntelligenceDaily'->>'reportDate','') is not null
      and not exists (
        select 1 from public.guild_intelligence_daily_reports r
        where r.guild_id=j.guild_id
          and r.report_date=(j.metadata->'guildIntelligenceDaily'->>'reportDate')::date
      )
    order by j.completed_at asc
    limit 20
  loop
    begin
      perform public.capture_guild_intelligence_daily_report(
        v_job.guild_id,
        (v_job.metadata->'guildIntelligenceDaily'->>'reportDate')::date,
        v_job.id
      );
      v_captured := v_captured + 1;
    exception when others then
      update public.guild_intelligence_settings
      set last_error=left('Daily report capture failed: '||sqlerrm,1000),updated_at=now()
      where guild_id=v_job.guild_id;
      v_errors := v_errors + 1;
    end;
  end loop;

  return jsonb_build_object(
    'at',p_now,
    'queued',v_queued,
    'attachedToActiveSync',v_attached,
    'captured',v_captured,
    'errors',v_errors
  );
end
$$;

revoke all on function public.run_guild_intelligence_scheduler(timestamptz) from public,anon,authenticated;
grant execute on function public.run_guild_intelligence_scheduler(timestamptz) to service_role;

-- pg_cron runs in UTC every minute; the function itself resolves each Guild's configured
-- IANA timezone and only queues the report once the Guild-local clock reaches 00:00.
do $$
declare v_jobid bigint;
begin
  for v_jobid in select jobid from cron.job where jobname='swgoh-guild-intelligence-midnight' loop
    perform cron.unschedule(v_jobid);
  end loop;
end
$$;

select cron.schedule(
  'swgoh-guild-intelligence-midnight',
  '* * * * *',
  $cron$select public.run_guild_intelligence_scheduler();$cron$
);