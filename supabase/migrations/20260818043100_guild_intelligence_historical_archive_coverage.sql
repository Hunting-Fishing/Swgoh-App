-- Promote workbook-backed historical lanes from source-pending to partial coverage.
-- Partial is deliberate: Guild-level history is durable, while full per-member event
-- detail remains available from the source archive for later officer drill-down materialization.

update public.guild_intelligence_page_registry
set implementation_status='partial',
    expected_sources=(select array_agg(distinct x order by x) from unnest(expected_sources || array['guild_rote_history_events']) x)
where page_key in ('m_dashboard','m_player_performance','rote_data','rote_perf','rote_summary');

update public.guild_intelligence_page_registry
set implementation_status='partial',
    expected_sources=(select array_agg(distinct x order by x) from unnest(expected_sources || array['guild_raid_history_events']) x)
where page_key in ('raid_performance','raid_progress','raid_history','raid_data');

update public.guild_intelligence_page_registry
set implementation_status='partial',
    expected_sources=(select array_agg(distinct x order by x) from unnest(expected_sources || array['guild_reva_history_events']) x)
where page_key='rote_reva';

update public.guild_intelligence_page_registry
set expected_sources=(select array_agg(distinct x order by x) from unnest(expected_sources || array['guild_ticket_history_snapshots']) x)
where page_key in ('ticket_dashboard','tickets');

create or replace function public.guild_intelligence_historical_page_coverage(p_guild_id uuid,p_page_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog,public
as $$
declare v jsonb; v_archive jsonb;
begin
  select payload into v_archive from public.guild_history_archives where guild_id=p_guild_id order by payload_version desc,updated_at desc limit 1;

  if p_page_key='gr_dashboard' then
    return case when v_archive is null then '{}'::jsonb else jsonb_build_object(
      'source','lv-unit-tracker-workbook','sourceRef','Member Data_Backup_20260605_195','detailLevel','guild-snapshots',
      'recordCount',coalesce((v_archive->'meta'->'counts'->>'guildSnapshots')::int,0),
      'firstDate',v_archive->'meta'->'coverage'->>0,'lastDate',v_archive->'meta'->'coverage'->>1) end;
  elsif p_page_key in ('member_data','member_data_backup','scorecards') then
    return case when v_archive is null then '{}'::jsonb else jsonb_build_object(
      'source','lv-unit-tracker-workbook','sourceRef','Member Data_Backup_20260605_195','detailLevel','player-development-monthly',
      'recordCount',coalesce((v_archive->'meta'->'counts'->>'playerMonthly')::int,0),
      'membershipPeriods',coalesce((v_archive->'meta'->'counts'->>'membershipPeriods')::int,0),
      'firstDate',v_archive->'meta'->'coverage'->>0,'lastDate',v_archive->'meta'->'coverage'->>1) end;
  elsif p_page_key in ('gl_report','inquisitor_dashboard') then
    return case when v_archive is null then '{}'::jsonb else jsonb_build_object(
      'source','lv-unit-tracker-workbook','sourceRef','Member Data_Backup_20260605_195','detailLevel','tracked-unit-milestones',
      'recordCount',coalesce((v_archive->'meta'->'counts'->>'trackedUnitMilestones')::int,0),
      'trackedUnits',jsonb_array_length(coalesce(v_archive->'dict'->'bases','[]'::jsonb)),
      'relicNormalization',v_archive->'meta'->>'relicNormalization',
      'firstDate',v_archive->'meta'->'coverage'->>0,'lastDate',v_archive->'meta'->'coverage'->>1) end;
  elsif p_page_key in ('ticket_dashboard','tickets') then
    select jsonb_build_object(
      'source','lv-unit-tracker-workbook','sourceRef','Raid Ticket Data','detailLevel','guild-summary',
      'recordCount',count(*),'firstDate',min(ticket_date),'lastDate',max(ticket_date),
      'latest',coalesce((select jsonb_build_object('date',t.ticket_date,'guildTotal',t.guild_total,'memberCount',t.member_count,'below600',t.below_600_count,'zeroTickets',t.zero_count)
        from public.guild_ticket_history_snapshots t where t.guild_id=p_guild_id order by t.ticket_date desc limit 1),'{}'::jsonb)
    ) into v from public.guild_ticket_history_snapshots where guild_id=p_guild_id;
  elsif p_page_key in ('raid_performance','raid_progress','raid_history','raid_data') then
    select jsonb_build_object(
      'source','lv-unit-tracker-workbook','sourceRef','Endor Performance Data','detailLevel','guild-summary',
      'recordCount',count(*),'sourceEventCount',coalesce((v_archive->'meta'->'counts'->>'raidEvents')::int,count(*)),
      'firstDate',min(raid_date),'lastDate',max(raid_date),'raidTypes',coalesce(jsonb_agg(distinct raid_name),'[]'::jsonb),
      'latest',coalesce((select jsonb_build_object('date',r.raid_date,'raid',r.raid_name,'guildScore',r.guild_score,'participants',r.participant_count)
        from public.guild_raid_history_events r where r.guild_id=p_guild_id order by r.raid_date desc limit 1),'{}'::jsonb)
    ) into v from public.guild_raid_history_events where guild_id=p_guild_id;
  elsif p_page_key in ('m_dashboard','m_player_performance','rote_data','rote_perf','rote_summary') then
    select jsonb_build_object(
      'source','lv-unit-tracker-workbook','sourceRef','ROTE Data','detailLevel','guild-summary',
      'recordCount',count(*),'firstDate',min(start_at),'lastDate',max(start_at),
      'latest',coalesce((select jsonb_build_object('startAt',r.start_at,'memberCount',r.member_count,'missionTp',r.total_mission_tp,'deployedTp',r.total_deployed_tp,'missedPhases',r.missed_phases,'missedDeployments',r.missed_deployments,'zeffoWins',r.zeffo_wins,'mandaloreWins',r.mandalore_wins,'revaWins',r.reva_wins)
        from public.guild_rote_history_events r where r.guild_id=p_guild_id order by r.start_at desc limit 1),'{}'::jsonb)
    ) into v from public.guild_rote_history_events where guild_id=p_guild_id;
  elsif p_page_key='rote_reva' then
    select jsonb_build_object(
      'source','lv-unit-tracker-workbook','sourceRef','ROTE Reva Shards','detailLevel','guild-summary',
      'recordCount',count(*),'firstDate',min(rote_start_date),'lastDate',max(rote_start_date),'totalShards',coalesce(sum(shard_count),0),
      'latest',coalesce((select jsonb_build_object('date',r.rote_start_date,'shards',r.shard_count,'inGuildCount',coalesce((r.metadata->>'inGuildCount')::int,0))
        from public.guild_reva_history_events r where r.guild_id=p_guild_id order by r.rote_start_date desc limit 1),'{}'::jsonb)
    ) into v from public.guild_reva_history_events where guild_id=p_guild_id;
  else
    v:='{}'::jsonb;
  end if;
  return coalesce(v,'{}'::jsonb);
end $$;

revoke all on function public.guild_intelligence_historical_page_coverage(uuid,text) from public,anon,authenticated;
grant execute on function public.guild_intelligence_historical_page_coverage(uuid,text) to service_role;

create or replace function public.read_guild_intelligence_status(p_ally_code text)
returns jsonb
language plpgsql
stable security definer
set search_path to pg_catalog,public
as $$
declare v_code text:=regexp_replace(coalesce(p_ally_code,''),'[^0-9]','','g'); v_guild_id uuid; v_report_id uuid; v_result jsonb;
begin
  if length(v_code)<>9 then return null; end if;
  select p.current_guild_id into v_guild_id from public.players p where p.ally_code=v_code limit 1;
  if v_guild_id is null then return null; end if;
  select id into v_report_id from public.guild_intelligence_daily_reports where guild_id=v_guild_id order by report_date desc,captured_at desc nulls last limit 1;

  select jsonb_build_object(
    'guild',jsonb_build_object('id',g.id,'name',g.name,'memberCount',g.member_count,'galacticPower',g.galactic_power,'lastSyncedAt',g.last_synced_at),
    'settings',coalesce((select to_jsonb(s)-'guild_id' from public.guild_intelligence_settings s where s.guild_id=v_guild_id),'{}'::jsonb),
    'latestReport',coalesce((select to_jsonb(r)-'guild_id' from public.guild_intelligence_daily_reports r where r.id=v_report_id),'null'::jsonb),
    'returnedTotal',(
      select count(*) from (
        select coalesce(p2.ally_code,mh.metadata->>'allyCode',mh.player_id::text) as ally_code,mh.occurred_at
        from public.guild_membership_history mh left join public.players p2 on p2.id=mh.player_id
        where mh.guild_id=v_guild_id and mh.event_type='returned'
        union
        select he.ally_code,he.occurred_at from public.guild_membership_historical_events he
        where he.guild_id=v_guild_id and he.event_type='returned' and he.confidence='confirmed'
      ) returned_events
    ),
    'historicalCoverage',coalesce((select jsonb_build_object(
      'snapshotCount',sum(hi.snapshot_count),'firstObservedAt',min(hi.first_observed_at),'lastObservedAt',max(hi.last_observed_at),
      'distinctAllyCodes',max(hi.distinct_ally_codes),'membershipPeriods',sum(hi.membership_period_count),
      'confirmedReturnEvents',sum(hi.confirmed_return_events),
      'sources',jsonb_agg(jsonb_build_object('source',hi.source,'sourceRef',hi.source_ref,'sha256',hi.source_sha256)))
      from public.guild_history_imports hi where hi.guild_id=v_guild_id),'{}'::jsonb),
    'historicalEventArchives',jsonb_build_object(
      'tickets',public.guild_intelligence_historical_page_coverage(v_guild_id,'tickets'),
      'raids',public.guild_intelligence_historical_page_coverage(v_guild_id,'raid_history'),
      'rote',public.guild_intelligence_historical_page_coverage(v_guild_id,'rote_summary'),
      'reva',public.guild_intelligence_historical_page_coverage(v_guild_id,'rote_reva')
    ),
    'pages',coalesce((select jsonb_agg(jsonb_build_object(
      'pageKey',reg.page_key,'workbookSheet',reg.workbook_sheet,'title',reg.title,'category',reg.category,'sourceKind',reg.source_kind,
      'implementationStatus',reg.implementation_status,'phase',reg.phase,'dailyCapture',reg.daily_capture,'userFacing',reg.user_facing,'sortOrder',reg.sort_order,
      'description',reg.description,'expectedSources',to_jsonb(reg.expected_sources),'captureStatus',dp.capture_status,'capturedAt',dp.captured_at,
      'metrics',coalesce(dp.metrics,'{}'::jsonb),'historicalCoverage',public.guild_intelligence_historical_page_coverage(v_guild_id,reg.page_key),'error',dp.error_message
    ) order by reg.sort_order) from public.guild_intelligence_page_registry reg left join public.guild_intelligence_daily_pages dp on dp.report_id=v_report_id and dp.page_key=reg.page_key),'[]'::jsonb)
  ) into v_result from public.guilds g where g.id=v_guild_id;
  return v_result;
end $$;

revoke all on function public.read_guild_intelligence_status(text) from public,anon,authenticated;
grant execute on function public.read_guild_intelligence_status(text) to service_role;
