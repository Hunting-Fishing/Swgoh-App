create or replace function public.read_guild_intelligence_status(p_ally_code text)
returns jsonb
language plpgsql
stable security definer
set search_path to 'pg_catalog','public'
as $$
declare
  v_code text:=regexp_replace(coalesce(p_ally_code,''),'[^0-9]','','g');
  v_guild_id uuid;
  v_report_id uuid;
  v_result jsonb;
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
        select coalesce(p2.ally_code,mh.metadata->>'allyCode',mh.player_id::text) ally_code,mh.occurred_at
        from public.guild_membership_history mh
        left join public.players p2 on p2.id=mh.player_id
        where mh.guild_id=v_guild_id and mh.event_type='returned'
        union
        select he.ally_code,he.occurred_at
        from public.guild_membership_historical_events he
        where he.guild_id=v_guild_id and he.event_type='returned' and he.confidence='confirmed'
      ) returned_events
    ),
    'historicalCoverage',coalesce((
      select jsonb_build_object(
        'snapshotCount',sum(hi.snapshot_count),
        'firstObservedAt',min(hi.first_observed_at),
        'lastObservedAt',max(hi.last_observed_at),
        'distinctAllyCodes',max(hi.distinct_ally_codes),
        'membershipPeriods',sum(hi.membership_period_count),
        'confirmedReturnEvents',sum(hi.confirmed_return_events),
        'sources',jsonb_agg(jsonb_build_object('source',hi.source,'sourceRef',hi.source_ref,'sha256',hi.source_sha256))
      ) from public.guild_history_imports hi where hi.guild_id=v_guild_id
    ),'{}'::jsonb),
    'pages',coalesce((
      select jsonb_agg(jsonb_build_object(
        'pageKey',reg.page_key,'workbookSheet',reg.workbook_sheet,'title',reg.title,'category',reg.category,
        'sourceKind',reg.source_kind,'implementationStatus',reg.implementation_status,'phase',reg.phase,
        'dailyCapture',reg.daily_capture,'userFacing',reg.user_facing,'sortOrder',reg.sort_order,
        'description',reg.description,'expectedSources',to_jsonb(reg.expected_sources),
        'captureStatus',dp.capture_status,'capturedAt',dp.captured_at,'metrics',coalesce(dp.metrics,'{}'::jsonb),'error',dp.error_message
      ) order by reg.sort_order)
      from public.guild_intelligence_page_registry reg
      left join public.guild_intelligence_daily_pages dp on dp.report_id=v_report_id and dp.page_key=reg.page_key
    ),'[]'::jsonb)
  ) into v_result from public.guilds g where g.id=v_guild_id;
  return v_result;
end
$$;
