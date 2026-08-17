create or replace function public.guild_intelligence_historical_page_coverage(p_guild_id uuid,p_page_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog,public
as $$
declare v jsonb; v_archive jsonb; v_ref public.platoon_reference_archives%rowtype;
begin
  select payload into v_archive from public.guild_history_archives where guild_id=p_guild_id order by payload_version desc,updated_at desc limit 1;
  if p_page_key='gr_dashboard' then
    return case when v_archive is null then '{}'::jsonb else jsonb_build_object('source','lv-unit-tracker-workbook','sourceRef','Member Data_Backup_20260605_195','detailLevel','guild-snapshots','recordCount',coalesce((v_archive->'meta'->'counts'->>'guildSnapshots')::int,0),'firstDate',v_archive->'meta'->'coverage'->>0,'lastDate',v_archive->'meta'->'coverage'->>1) end;
  elsif p_page_key in ('member_data','member_data_backup','scorecards') then
    return case when v_archive is null then '{}'::jsonb else jsonb_build_object('source','lv-unit-tracker-workbook','sourceRef','Member Data_Backup_20260605_195','detailLevel','player-development-monthly','recordCount',coalesce((v_archive->'meta'->'counts'->>'playerMonthly')::int,0),'membershipPeriods',coalesce((v_archive->'meta'->'counts'->>'membershipPeriods')::int,0),'firstDate',v_archive->'meta'->'coverage'->>0,'lastDate',v_archive->'meta'->'coverage'->>1) end;
  elsif p_page_key in ('gl_report','inquisitor_dashboard') then
    return case when v_archive is null then '{}'::jsonb else jsonb_build_object('source','lv-unit-tracker-workbook','sourceRef','Member Data_Backup_20260605_195','detailLevel','tracked-unit-milestones','recordCount',coalesce((v_archive->'meta'->'counts'->>'trackedUnitMilestones')::int,0),'trackedUnits',jsonb_array_length(coalesce(v_archive->'dict'->'bases','[]'::jsonb)),'relicNormalization',v_archive->'meta'->>'relicNormalization','firstDate',v_archive->'meta'->'coverage'->>0,'lastDate',v_archive->'meta'->'coverage'->>1) end;
  elsif p_page_key in ('ticket_dashboard','tickets') then
    select jsonb_build_object('source','lv-unit-tracker-workbook','sourceRef','Raid Ticket Data','detailLevel','guild-summary','recordCount',count(*),'firstDate',min(ticket_date),'lastDate',max(ticket_date),'latest',coalesce((select jsonb_build_object('date',t.ticket_date,'guildTotal',t.guild_total,'memberCount',t.member_count,'below600',t.below_600_count,'zeroTickets',t.zero_count) from public.guild_ticket_history_snapshots t where t.guild_id=p_guild_id order by t.ticket_date desc limit 1),'{}'::jsonb)) into v from public.guild_ticket_history_snapshots where guild_id=p_guild_id;
  elsif p_page_key in ('raid_performance','raid_progress','raid_history','raid_data') then
    select jsonb_build_object('source','lv-unit-tracker-workbook','sourceRef','Endor Performance Data','detailLevel','guild-summary','recordCount',count(*),'sourceEventCount',coalesce((v_archive->'meta'->'counts'->>'raidEvents')::int,count(*)),'firstDate',min(raid_date),'lastDate',max(raid_date),'raidTypes',coalesce(jsonb_agg(distinct raid_name),'[]'::jsonb),'latest',coalesce((select jsonb_build_object('date',r.raid_date,'raid',r.raid_name,'guildScore',r.guild_score,'participants',r.participant_count) from public.guild_raid_history_events r where r.guild_id=p_guild_id order by r.raid_date desc limit 1),'{}'::jsonb)) into v from public.guild_raid_history_events where guild_id=p_guild_id;
  elsif p_page_key in ('zeffo','m_dashboard','m_player_performance','rote_data','rote_perf','rote_summary') then
    select jsonb_build_object('source','lv-unit-tracker-workbook','sourceRef','ROTE Data','detailLevel','guild-summary','recordCount',count(*),'firstDate',min(start_at),'lastDate',max(start_at),'totalZeffoWins',coalesce(sum(zeffo_wins),0),'latest',coalesce((select jsonb_build_object('startAt',r.start_at,'memberCount',r.member_count,'missionTp',r.total_mission_tp,'deployedTp',r.total_deployed_tp,'missedPhases',r.missed_phases,'missedDeployments',r.missed_deployments,'zeffoWins',r.zeffo_wins,'mandaloreWins',r.mandalore_wins,'revaWins',r.reva_wins) from public.guild_rote_history_events r where r.guild_id=p_guild_id order by r.start_at desc limit 1),'{}'::jsonb)) into v from public.guild_rote_history_events where guild_id=p_guild_id;
  elsif p_page_key='rote_reva' then
    select jsonb_build_object('source','lv-unit-tracker-workbook','sourceRef','ROTE Reva Shards','detailLevel','guild-summary','recordCount',count(*),'firstDate',min(rote_start_date),'lastDate',max(rote_start_date),'totalShards',coalesce(sum(shard_count),0),'latest',coalesce((select jsonb_build_object('date',r.rote_start_date,'shards',r.shard_count,'inGuildCount',coalesce((r.metadata->>'inGuildCount')::int,0)) from public.guild_reva_history_events r where r.guild_id=p_guild_id order by r.rote_start_date desc limit 1),'{}'::jsonb)) into v from public.guild_reva_history_events where guild_id=p_guild_id;
  elsif p_page_key in ('rote_platoons','echobase_platoons') then
    select * into v_ref from public.platoon_reference_archives where reference_key=case when p_page_key='rote_platoons' then 'rote-platoons-lv-v1' else 'echobase-platoons-lv-v1' end;
    return case when v_ref.id is null then '{}'::jsonb else jsonb_build_object('source',v_ref.source,'sourceRef',v_ref.source_ref,'detailLevel',v_ref.metadata->>'detailLevel','recordCount',v_ref.record_count,'resolvedBaseIds',v_ref.resolved_base_ids,'sourceSha256',v_ref.source_sha256,'payloadSha256',v_ref.payload_sha256,'coverage',v_ref.coverage,'liveEventState',false) end;
  else
    v:='{}'::jsonb;
  end if;
  return coalesce(v,'{}'::jsonb);
end $$;

revoke all on function public.guild_intelligence_historical_page_coverage(uuid,text) from public,anon,authenticated;
grant execute on function public.guild_intelligence_historical_page_coverage(uuid,text) to service_role;
