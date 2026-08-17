alter table public.guild_sync_stage_members
  add column if not exists sync_run_id uuid references public.guild_sync_runs(id) on delete set null,
  add column if not exists player_id uuid references public.players(id) on delete set null,
  add column if not exists units_count integer not null default 0,
  add column if not exists processed_at timestamptz;

create index if not exists guild_sync_stage_members_pending_idx
  on public.guild_sync_stage_members(job_id, member_index)
  where processed_at is null;
create index if not exists guild_sync_stage_members_sync_run_idx
  on public.guild_sync_stage_members(sync_run_id);
create index if not exists guild_sync_stage_members_player_idx
  on public.guild_sync_stage_members(player_id);

create or replace function public.prepare_bounded_guild_sync(
  p_job_id uuid,
  p_header jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_job public.guild_sync_jobs%rowtype;
  v_run public.guild_sync_runs%rowtype;
  v_guild public.guilds%rowtype;
  v_expected integer := 0;
  v_staged integer := 0;
  v_captured_at timestamptz;
  v_activity jsonb := '{}'::jsonb;
  v_activity_snapshot_id bigint;
  v_fingerprint text;
begin
  if p_job_id is null or p_header is null or jsonb_typeof(p_header) <> 'object' then
    raise exception 'A Guild sync job and header payload are required.';
  end if;

  select * into v_job
  from public.guild_sync_jobs
  where id = p_job_id
  for update;
  if not found then raise exception 'Guild sync job was not found.'; end if;
  if v_job.status <> 'running' then
    raise exception 'Guild sync job must be running before bounded prepare (status=%).', v_job.status;
  end if;
  if v_job.requested_by_user_id is null
     or coalesce(p_header->>'requesterUserId', '') <> v_job.requested_by_user_id::text then
    raise exception 'Bounded Guild sync requester does not match the queued job.';
  end if;

  select * into v_guild from public.guilds where id = v_job.guild_id;
  if not found then raise exception 'Bounded Guild sync tenant was not found.'; end if;
  if coalesce(p_header->'guild'->>'swgohGuildId', '') <> coalesce(v_guild.swgoh_guild_id, '') then
    raise exception 'Bounded Guild sync header does not match the queued Guild tenant.';
  end if;
  if coalesce(p_header->'hydration'->>'complete', 'false')::boolean is not true then
    raise exception 'Bounded Guild sync hydration is incomplete.';
  end if;

  v_expected := greatest(0, coalesce((p_header->'hydration'->>'requested')::integer, 0));
  if v_expected <= 0 then raise exception 'Bounded Guild sync has no expected member count.'; end if;

  select count(*)::integer into v_staged
  from public.guild_sync_stage_members s
  where s.job_id = p_job_id
    and s.guild_id = v_job.guild_id
    and s.requester_user_id = v_job.requested_by_user_id;
  if v_staged <> v_expected then
    raise exception 'Bounded Guild sync stage count mismatch (%/%).', v_staged, v_expected;
  end if;
  if exists (
    select 1 from public.guild_sync_stage_members s
    where s.job_id = p_job_id
      and (s.guild_id <> v_job.guild_id or s.requester_user_id <> v_job.requested_by_user_id)
  ) then
    raise exception 'Bounded Guild sync contains cross-tenant staging rows.';
  end if;

  if v_job.requested_by_player_id is null or not exists (
    select 1
    from public.players p
    join public.guild_sync_stage_members s
      on s.job_id = p_job_id
     and s.ally_code = p.ally_code
     and s.swgoh_player_id = p.swgoh_player_id
    where p.id = v_job.requested_by_player_id
  ) then
    raise exception 'Verified requester is not present in the fully staged Guild roster.';
  end if;

  begin
    v_captured_at := coalesce(nullif(p_header->>'capturedAt', '')::timestamptz, now());
  exception when others then
    v_captured_at := now();
  end;

  if v_job.sync_run_id is not null then
    select * into v_run
    from public.guild_sync_runs
    where id = v_job.sync_run_id
      and guild_id = v_job.guild_id
      and requested_by_user_id = v_job.requested_by_user_id
      and status = 'started';
  end if;

  if v_run.id is null then
    insert into public.guild_sync_runs (
      guild_id, lookup_ally_code, status, source, source_cache, started_at,
      expected_members, members_discovered, rosters_hydrated, rosters_failed,
      requested_by_user_id, request_origin, metadata
    ) values (
      v_job.guild_id,
      nullif(p_header->>'lookupAllyCode', ''),
      'started',
      'comlink',
      coalesce(nullif(p_header->>'sourceCache', ''), 'bounded-live-pages'),
      v_captured_at,
      v_expected,
      v_expected,
      v_expected,
      0,
      v_job.requested_by_user_id,
      'user',
      jsonb_build_object(
        'rosterDetail', coalesce(p_header->>'rosterDetail', 'durable-baseline'),
        'calculation', coalesce(p_header->'calculation', '{}'::jsonb),
        'boundedTransport', true,
        'canonicalIngest', 'bounded-member-rpc-v1'
      )
    ) returning * into v_run;
  else
    update public.guild_sync_runs
    set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
          'calculation', coalesce(p_header->'calculation', '{}'::jsonb),
          'boundedTransport', true,
          'canonicalIngest', 'bounded-member-rpc-v1'
        ),
        expected_members = v_expected,
        members_discovered = v_expected,
        rosters_hydrated = v_expected,
        rosters_failed = 0,
        error_message = null
    where id = v_run.id
    returning * into v_run;
  end if;

  v_activity := coalesce(p_header->'activity', '{}'::jsonb);
  v_fingerprint := nullif(p_header->>'activityFingerprint', '');

  if nullif(v_run.metadata->>'activitySnapshotId', '') is not null then
    begin
      v_activity_snapshot_id := (v_run.metadata->>'activitySnapshotId')::bigint;
    exception when others then
      v_activity_snapshot_id := null;
    end;
  end if;

  if v_activity_snapshot_id is null then
    insert into public.guild_activity_snapshots (
      guild_id, captured_at, snapshot_kind, source_sync_run_id, next_challenges_refresh,
      raid_launch_config, guild_event_tracker, recent_raid_results, recent_tw_results,
      territory_battle_results, source_fingerprint, metadata
    ) values (
      v_job.guild_id,
      v_captured_at,
      coalesce(nullif(p_header->>'snapshotKind', ''), 'user_sync'),
      v_run.id,
      case when nullif(v_activity->>'nextChallengesRefresh', '') is not null
        then (v_activity->>'nextChallengesRefresh')::timestamptz else null end,
      coalesce(v_activity->'raidLaunchConfig', '[]'::jsonb),
      coalesce(v_activity->'guildEventTracker', '[]'::jsonb),
      coalesce(v_activity->'recentRaidResult', '[]'::jsonb),
      coalesce(v_activity->'recentTerritoryWarResult', '[]'::jsonb),
      coalesce(v_activity->'territoryBattleResult', '[]'::jsonb),
      v_fingerprint,
      jsonb_build_object('source', 'comlink-bounded-guild')
    ) on conflict (guild_id, source_fingerprint) where source_fingerprint is not null
      do nothing
    returning id into v_activity_snapshot_id;

    if v_activity_snapshot_id is null and v_fingerprint is not null then
      select id into v_activity_snapshot_id
      from public.guild_activity_snapshots
      where guild_id = v_job.guild_id and source_fingerprint = v_fingerprint
      order by captured_at desc
      limit 1;
    end if;
  end if;

  update public.guild_sync_runs
  set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'activitySnapshotId', v_activity_snapshot_id,
        'activityFingerprint', v_fingerprint,
        'boundedTransport', true,
        'canonicalIngest', 'bounded-member-rpc-v1'
      )
  where id = v_run.id;

  update public.guild_sync_stage_members
  set sync_run_id = v_run.id
  where job_id = p_job_id;

  update public.guild_sync_jobs
  set sync_run_id = v_run.id,
      updated_at = now()
  where id = p_job_id;

  return jsonb_build_object(
    'ok', true,
    'syncRunId', v_run.id,
    'activitySnapshotId', v_activity_snapshot_id,
    'capturedAt', v_captured_at,
    'expectedMembers', v_expected,
    'stagedMembers', v_staged,
    'boundedTransport', true
  );
end;
$$;

create or replace function public.ingest_bounded_guild_sync_members(
  p_job_id uuid,
  p_limit integer default 1
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_job public.guild_sync_jobs%rowtype;
  v_run public.guild_sync_runs%rowtype;
  v_stage record;
  v_member jsonb;
  v_player_uuid uuid;
  v_existing_member public.guild_members_current%rowtype;
  v_history_event text;
  v_captured_at timestamptz;
  v_activity_snapshot_id bigint;
  v_member_char_power bigint;
  v_member_ship_power bigint;
  v_member_gp bigint;
  v_character_count integer;
  v_ship_count integer;
  v_g13_count integer;
  v_r5_count integer;
  v_r7_count integer;
  v_r9_count integer;
  v_seven_star_ship_count integer;
  v_unit_count integer;
  v_processed integer := 0;
  v_units_processed integer := 0;
  v_remaining integer := 0;
  v_limit integer := least(5, greatest(1, coalesce(p_limit, 1)));
begin
  select * into v_job
  from public.guild_sync_jobs
  where id = p_job_id
  for update;
  if not found then raise exception 'Guild sync job was not found.'; end if;
  if v_job.status <> 'running' then
    raise exception 'Guild sync job must be running during bounded member ingest (status=%).', v_job.status;
  end if;
  if v_job.sync_run_id is null then raise exception 'Bounded Guild sync has not been prepared.'; end if;

  select * into v_run
  from public.guild_sync_runs
  where id = v_job.sync_run_id
    and guild_id = v_job.guild_id
    and status = 'started';
  if not found then raise exception 'Prepared Guild sync run was not found.'; end if;

  v_captured_at := v_run.started_at;
  if nullif(v_run.metadata->>'activitySnapshotId', '') is not null then
    begin
      v_activity_snapshot_id := (v_run.metadata->>'activitySnapshotId')::bigint;
    exception when others then
      v_activity_snapshot_id := null;
    end;
  end if;

  for v_stage in
    select s.*
    from public.guild_sync_stage_members s
    where s.job_id = p_job_id
      and s.sync_run_id = v_run.id
      and s.processed_at is null
    order by s.member_index
    limit v_limit
    for update
  loop
    v_member := v_stage.payload;
    if jsonb_typeof(v_member) <> 'object'
       or coalesce(v_member->>'allyCode', '') !~ '^[0-9]{9}$'
       or nullif(v_member->>'swgohPlayerId', '') is null
       or jsonb_typeof(v_member->'units') <> 'array' then
      raise exception 'Staged Guild member % is incomplete.', v_stage.member_index;
    end if;

    select id into v_player_uuid
    from public.players
    where ally_code = v_member->>'allyCode'
       or swgoh_player_id = v_member->>'swgohPlayerId'
    order by case when ally_code = v_member->>'allyCode' then 0 else 1 end
    limit 1;

    v_member_char_power := greatest(0, coalesce((v_member->>'characterPower')::bigint, 0));
    v_member_ship_power := greatest(0, coalesce((v_member->>'shipPower')::bigint, 0));
    v_member_gp := greatest(0, coalesce((v_member->>'galacticPower')::bigint, 0));
    if v_member_gp = 0 and (v_member_char_power + v_member_ship_power) > 0 then
      v_member_gp := v_member_char_power + v_member_ship_power;
    end if;

    if v_player_uuid is null then
      insert into public.players (
        ally_code, swgoh_player_id, name, level, galactic_power, character_power, ship_power,
        current_guild_id, first_seen_at, last_seen_at, last_synced_at, source, metadata, updated_at
      ) values (
        v_member->>'allyCode',
        v_member->>'swgohPlayerId',
        coalesce(nullif(v_member->>'name', ''), v_member->>'allyCode'),
        greatest(0, coalesce((v_member->>'level')::integer, 0)),
        v_member_gp,
        v_member_char_power,
        v_member_ship_power,
        v_job.guild_id,
        v_captured_at,
        v_captured_at,
        v_captured_at,
        'comlink',
        coalesce(v_member->'playerMetadata', '{}'::jsonb),
        v_captured_at
      ) returning id into v_player_uuid;
    else
      if exists (
        select 1 from public.players
        where id = v_player_uuid
          and (
            ally_code <> v_member->>'allyCode'
            or (swgoh_player_id is not null and swgoh_player_id <> v_member->>'swgohPlayerId')
          )
      ) then
        raise exception 'Canonical player identity mismatch for Ally Code %.', v_member->>'allyCode';
      end if;

      update public.players
      set swgoh_player_id = v_member->>'swgohPlayerId',
          name = coalesce(nullif(v_member->>'name', ''), name),
          level = greatest(0, coalesce((v_member->>'level')::integer, level, 0)),
          galactic_power = v_member_gp,
          character_power = v_member_char_power,
          ship_power = v_member_ship_power,
          current_guild_id = v_job.guild_id,
          last_seen_at = v_captured_at,
          last_synced_at = v_captured_at,
          source = 'comlink',
          metadata = coalesce(metadata, '{}'::jsonb) || coalesce(v_member->'playerMetadata', '{}'::jsonb),
          updated_at = v_captured_at
      where id = v_player_uuid;
    end if;

    select * into v_existing_member
    from public.guild_members_current
    where guild_id = v_job.guild_id and player_id = v_player_uuid;

    if not found then
      select case when exists (
        select 1 from public.guild_membership_history
        where guild_id = v_job.guild_id
          and player_id = v_player_uuid
          and event_type = 'left'
      ) then 'returned' else 'joined' end into v_history_event;

      insert into public.guild_membership_history (
        guild_id, player_id, event_type, occurred_at, new_value, metadata
      ) values (
        v_job.guild_id, v_player_uuid, v_history_event, v_captured_at,
        coalesce(nullif(v_member->>'name', ''), v_member->>'allyCode'),
        jsonb_build_object('sourceSyncRunId', v_run.id, 'boundedTransport', true)
      );
    elsif v_existing_member.member_name is distinct from coalesce(nullif(v_member->>'name', ''), v_existing_member.member_name) then
      insert into public.guild_membership_history (
        guild_id, player_id, event_type, occurred_at, previous_value, new_value, metadata
      ) values (
        v_job.guild_id, v_player_uuid, 'renamed', v_captured_at,
        v_existing_member.member_name,
        coalesce(nullif(v_member->>'name', ''), v_existing_member.member_name),
        jsonb_build_object('sourceSyncRunId', v_run.id, 'boundedTransport', true)
      );
    end if;

    insert into public.guild_members_current (
      guild_id, player_id, member_name, member_galactic_power, member_character_power,
      member_ship_power, first_seen_in_guild_at, last_seen_in_guild_at, last_synced_at, metadata
    ) values (
      v_job.guild_id,
      v_player_uuid,
      coalesce(nullif(v_member->>'name', ''), v_member->>'allyCode'),
      v_member_gp,
      v_member_char_power,
      v_member_ship_power,
      v_captured_at,
      v_captured_at,
      v_captured_at,
      jsonb_build_object(
        'memberLevel', greatest(0, coalesce((v_member->>'memberLevel')::integer, 0)),
        'guildXp', greatest(0, coalesce((v_member->>'guildXp')::bigint, 0)),
        'squadPower', greatest(0, coalesce((v_member->>'squadPower')::bigint, 0)),
        'lastActivityAt', v_member->>'lastActivityAt',
        'guildJoinedAt', v_member->>'guildJoinedAt'
      )
    ) on conflict (guild_id, player_id) do update set
      member_name = excluded.member_name,
      member_galactic_power = excluded.member_galactic_power,
      member_character_power = excluded.member_character_power,
      member_ship_power = excluded.member_ship_power,
      last_seen_in_guild_at = excluded.last_seen_in_guild_at,
      last_synced_at = excluded.last_synced_at,
      metadata = excluded.metadata;

    update public.guild_user_memberships gum
    set status = 'active',
        joined_at = coalesce(gum.joined_at, v_captured_at),
        left_at = null,
        updated_at = v_captured_at
    where gum.guild_id = v_job.guild_id
      and gum.player_id = v_player_uuid
      and gum.status in ('pending','left')
      and exists (
        select 1 from public.user_player_links upl
        where upl.user_id = gum.user_id
          and upl.player_id = gum.player_id
          and upl.verification_status = 'verified'
      );

    select jsonb_array_length(v_member->'units') into v_unit_count;

    insert into public.player_units_current (
      player_id, base_id, unit_name, combat_type, rarity, level, gear_level, relic_tier,
      galactic_power, zeta_count, omicron_count, ultimate_unlocked, last_synced_at, metadata
    )
    select
      v_player_uuid,
      u.base_id,
      coalesce(gu.name, nullif(u.unit_name, ''), u.base_id),
      case lower(coalesce(u.combat_type, 'unknown'))
        when 'character' then 'character'
        when 'ship' then 'ship'
        else 'unknown'
      end,
      least(7, greatest(0, coalesce(u.rarity, 0))),
      greatest(0, coalesce(u.level, 0)),
      greatest(0, coalesce(u.gear_level, 0)),
      greatest(0, coalesce(u.relic_tier, 0)),
      greatest(0, coalesce(u.galactic_power, 0)),
      case when u.zeta_count is null then null else greatest(0, u.zeta_count) end,
      case when u.omicron_count is null then null else greatest(0, u.omicron_count) end,
      u.ultimate_unlocked,
      v_captured_at,
      coalesce(u.metadata, '{}'::jsonb)
    from (
      select
        x.value->>'baseId' as base_id,
        x.value->>'name' as unit_name,
        x.value->>'combatType' as combat_type,
        case when nullif(x.value->>'rarity', '') is not null then (x.value->>'rarity')::integer else 0 end as rarity,
        case when nullif(x.value->>'level', '') is not null then (x.value->>'level')::integer else 0 end as level,
        case when nullif(x.value->>'gearLevel', '') is not null then (x.value->>'gearLevel')::integer else 0 end as gear_level,
        case when nullif(x.value->>'relicTier', '') is not null then (x.value->>'relicTier')::integer else 0 end as relic_tier,
        case when nullif(x.value->>'galacticPower', '') is not null then (x.value->>'galacticPower')::integer else 0 end as galactic_power,
        case when jsonb_typeof(x.value->'zetaCount') = 'number' then (x.value->>'zetaCount')::integer else null end as zeta_count,
        case when jsonb_typeof(x.value->'omicronCount') = 'number' then (x.value->>'omicronCount')::integer else null end as omicron_count,
        case when jsonb_typeof(x.value->'ultimateUnlocked') = 'boolean' then (x.value->>'ultimateUnlocked')::boolean else null end as ultimate_unlocked,
        coalesce(x.value->'metadata', '{}'::jsonb) as metadata
      from jsonb_array_elements(v_member->'units') x(value)
      where nullif(x.value->>'baseId', '') is not null
    ) u
    left join public.game_units gu on gu.base_id = u.base_id
    on conflict (player_id, base_id) do update set
      unit_name = excluded.unit_name,
      combat_type = excluded.combat_type,
      rarity = excluded.rarity,
      level = excluded.level,
      gear_level = excluded.gear_level,
      relic_tier = excluded.relic_tier,
      galactic_power = excluded.galactic_power,
      zeta_count = excluded.zeta_count,
      omicron_count = excluded.omicron_count,
      ultimate_unlocked = excluded.ultimate_unlocked,
      last_synced_at = excluded.last_synced_at,
      metadata = excluded.metadata;

    delete from public.player_units_current puc
    where puc.player_id = v_player_uuid
      and not exists (
        select 1
        from jsonb_array_elements(v_member->'units') x(value)
        where x.value->>'baseId' = puc.base_id
      );

    select
      count(*) filter (where combat_type = 'character'),
      count(*) filter (where combat_type = 'ship'),
      count(*) filter (where combat_type = 'character' and gear_level >= 13),
      count(*) filter (where combat_type = 'character' and relic_tier >= 5),
      count(*) filter (where combat_type = 'character' and relic_tier >= 7),
      count(*) filter (where combat_type = 'character' and relic_tier >= 9),
      count(*) filter (where combat_type = 'ship' and rarity >= 7)
    into v_character_count, v_ship_count, v_g13_count, v_r5_count, v_r7_count, v_r9_count, v_seven_star_ship_count
    from public.player_units_current
    where player_id = v_player_uuid;

    insert into public.player_snapshots (
      player_id, guild_id, captured_at, galactic_power, character_power, ship_power,
      character_count, ship_count, gl_count, gear_13_count, relic_5_plus_count,
      relic_7_plus_count, relic_9_count, seven_star_ship_count, metrics, source_sync_run_id
    ) values (
      v_player_uuid,
      v_job.guild_id,
      v_captured_at,
      v_member_gp,
      v_member_char_power,
      v_member_ship_power,
      coalesce(v_character_count, 0),
      coalesce(v_ship_count, 0),
      0,
      coalesce(v_g13_count, 0),
      coalesce(v_r5_count, 0),
      coalesce(v_r7_count, 0),
      coalesce(v_r9_count, 0),
      coalesce(v_seven_star_ship_count, 0),
      jsonb_build_object('source', 'bounded-guild-sync'),
      v_run.id
    ) on conflict (player_id, snapshot_date) do update set
      guild_id = excluded.guild_id,
      captured_at = excluded.captured_at,
      galactic_power = excluded.galactic_power,
      character_power = excluded.character_power,
      ship_power = excluded.ship_power,
      character_count = excluded.character_count,
      ship_count = excluded.ship_count,
      gl_count = excluded.gl_count,
      gear_13_count = excluded.gear_13_count,
      relic_5_plus_count = excluded.relic_5_plus_count,
      relic_7_plus_count = excluded.relic_7_plus_count,
      relic_9_count = excluded.relic_9_count,
      seven_star_ship_count = excluded.seven_star_ship_count,
      metrics = excluded.metrics,
      source_sync_run_id = excluded.source_sync_run_id;

    if v_activity_snapshot_id is not null then
      insert into public.guild_member_activity_snapshots (
        snapshot_id, guild_id, player_id, captured_at, member_level, guild_xp,
        galactic_power, squad_power, last_activity_at, guild_joined_at,
        lifetime_season_score, league_id, raid_tickets_current, raid_tickets_lifetime,
        member_contribution, season_status, metadata
      ) values (
        v_activity_snapshot_id,
        v_job.guild_id,
        v_player_uuid,
        v_captured_at,
        greatest(0, coalesce((v_member->>'memberLevel')::integer, 0)),
        greatest(0, coalesce((v_member->>'guildXp')::bigint, 0)),
        v_member_gp,
        greatest(0, coalesce((v_member->>'squadPower')::bigint, 0)),
        case when nullif(v_member->>'lastActivityAt', '') is not null then (v_member->>'lastActivityAt')::timestamptz else null end,
        case when nullif(v_member->>'guildJoinedAt', '') is not null then (v_member->>'guildJoinedAt')::timestamptz else null end,
        greatest(0, coalesce((v_member->>'lifetimeSeasonScore')::bigint, 0)),
        nullif(v_member->>'leagueId', ''),
        case when nullif(v_member->>'raidTicketsCurrent', '') is not null then greatest(0, (v_member->>'raidTicketsCurrent')::integer) else null end,
        case when nullif(v_member->>'raidTicketsLifetime', '') is not null then greatest(0, (v_member->>'raidTicketsLifetime')::bigint) else null end,
        coalesce(v_member->'memberContribution', '[]'::jsonb),
        coalesce(v_member->'seasonStatus', '[]'::jsonb),
        coalesce(v_member->'activityMetadata', '{}'::jsonb)
      ) on conflict (snapshot_id, player_id) do update set
        captured_at = excluded.captured_at,
        member_level = excluded.member_level,
        guild_xp = excluded.guild_xp,
        galactic_power = excluded.galactic_power,
        squad_power = excluded.squad_power,
        last_activity_at = excluded.last_activity_at,
        guild_joined_at = excluded.guild_joined_at,
        lifetime_season_score = excluded.lifetime_season_score,
        league_id = excluded.league_id,
        raid_tickets_current = excluded.raid_tickets_current,
        raid_tickets_lifetime = excluded.raid_tickets_lifetime,
        member_contribution = excluded.member_contribution,
        season_status = excluded.season_status,
        metadata = excluded.metadata;
    end if;

    update public.guild_sync_stage_members
    set player_id = v_player_uuid,
        units_count = v_unit_count,
        processed_at = now()
    where job_id = p_job_id and member_index = v_stage.member_index;

    v_processed := v_processed + 1;
    v_units_processed := v_units_processed + coalesce(v_unit_count, 0);
  end loop;

  select count(*)::integer into v_remaining
  from public.guild_sync_stage_members
  where job_id = p_job_id and processed_at is null;

  update public.guild_sync_runs
  set units_loaded = coalesce((
        select sum(units_count)::integer from public.guild_sync_stage_members
        where job_id = p_job_id and processed_at is not null
      ), 0),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'processedMembers', (select count(*) from public.guild_sync_stage_members where job_id = p_job_id and processed_at is not null),
        'remainingMembers', v_remaining
      )
  where id = v_run.id;

  return jsonb_build_object(
    'ok', true,
    'syncRunId', v_run.id,
    'processedMembers', v_processed,
    'unitsProcessed', v_units_processed,
    'remainingMembers', v_remaining,
    'complete', v_remaining = 0
  );
end;
$$;

create or replace function public.complete_bounded_guild_sync(
  p_job_id uuid,
  p_header jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_job public.guild_sync_jobs%rowtype;
  v_run public.guild_sync_runs%rowtype;
  v_guild jsonb := '{}'::jsonb;
  v_expected integer := 0;
  v_staged integer := 0;
  v_processed integer := 0;
  v_units integer := 0;
  v_member_ids uuid[] := '{}'::uuid[];
  v_character_power bigint := 0;
  v_ship_power bigint := 0;
  v_member_gp bigint := 0;
  v_guild_gp bigint := 0;
  v_activity_snapshot_id bigint;
  v_existing_member record;
begin
  select * into v_job
  from public.guild_sync_jobs
  where id = p_job_id
  for update;
  if not found then raise exception 'Guild sync job was not found.'; end if;
  if v_job.status <> 'running' then
    raise exception 'Guild sync job must be running during bounded completion (status=%).', v_job.status;
  end if;
  if v_job.sync_run_id is null then raise exception 'Bounded Guild sync has not been prepared.'; end if;

  select * into v_run
  from public.guild_sync_runs
  where id = v_job.sync_run_id
    and guild_id = v_job.guild_id
    and status = 'started';
  if not found then raise exception 'Prepared Guild sync run was not found.'; end if;

  v_expected := greatest(0, coalesce((p_header->'hydration'->>'requested')::integer, 0));
  if v_expected <= 0 then raise exception 'Bounded Guild completion has no expected member count.'; end if;

  select
    count(*)::integer,
    count(*) filter (where processed_at is not null)::integer,
    coalesce(sum(units_count), 0)::integer,
    coalesce(array_agg(player_id order by member_index) filter (where player_id is not null), '{}'::uuid[]),
    coalesce(sum(greatest(0, coalesce((payload->>'characterPower')::bigint, 0))), 0)::bigint,
    coalesce(sum(greatest(0, coalesce((payload->>'shipPower')::bigint, 0))), 0)::bigint,
    coalesce(sum(greatest(0, coalesce((payload->>'galacticPower')::bigint, 0))), 0)::bigint
  into v_staged, v_processed, v_units, v_member_ids, v_character_power, v_ship_power, v_member_gp
  from public.guild_sync_stage_members
  where job_id = p_job_id
    and guild_id = v_job.guild_id
    and requester_user_id = v_job.requested_by_user_id;

  if v_staged <> v_expected or v_processed <> v_expected or cardinality(v_member_ids) <> v_expected then
    raise exception 'Bounded Guild canonical ingest is incomplete (staged %, processed %, expected %).', v_staged, v_processed, v_expected;
  end if;

  if exists (
    select 1 from public.guild_sync_stage_members
    where job_id = p_job_id
      and (sync_run_id is distinct from v_run.id or player_id is null)
  ) then
    raise exception 'Bounded Guild staging contains uncommitted canonical rows.';
  end if;

  for v_existing_member in
    select gmc.player_id, gmc.member_name
    from public.guild_members_current gmc
    where gmc.guild_id = v_job.guild_id
      and not (gmc.player_id = any(v_member_ids))
  loop
    insert into public.guild_membership_history (
      guild_id, player_id, event_type, occurred_at, previous_value, metadata
    ) values (
      v_job.guild_id, v_existing_member.player_id, 'left', v_run.started_at,
      v_existing_member.member_name,
      jsonb_build_object('sourceSyncRunId', v_run.id, 'boundedTransport', true)
    );

    update public.players
    set current_guild_id = null, updated_at = v_run.started_at
    where id = v_existing_member.player_id and current_guild_id = v_job.guild_id;

    update public.guild_user_memberships
    set status = 'left', left_at = v_run.started_at, updated_at = v_run.started_at
    where guild_id = v_job.guild_id
      and player_id = v_existing_member.player_id
      and status = 'active';
  end loop;

  delete from public.guild_members_current
  where guild_id = v_job.guild_id
    and not (player_id = any(v_member_ids));

  v_guild := coalesce(p_header->'guild', '{}'::jsonb);
  v_guild_gp := greatest(0, coalesce((v_guild->>'galacticPower')::bigint, 0));
  if v_guild_gp = 0 and v_member_gp > 0 then v_guild_gp := v_member_gp; end if;

  update public.guilds
  set name = coalesce(nullif(v_guild->>'name', ''), name),
      member_count = v_expected,
      galactic_power = v_guild_gp,
      character_power = v_character_power,
      ship_power = v_ship_power,
      last_seen_at = v_run.started_at,
      last_synced_at = v_run.started_at,
      source = 'comlink',
      metadata = coalesce(metadata, '{}'::jsonb) || coalesce(v_guild->'metadata', '{}'::jsonb),
      updated_at = v_run.started_at
  where id = v_job.guild_id;

  insert into public.guild_snapshots (
    guild_id, captured_at, member_count, hydrated_member_count, galactic_power,
    character_power, ship_power, gl_count, gear_13_count, relic_5_plus_count,
    relic_7_plus_count, relic_9_count, seven_star_ship_count, metrics, source_sync_run_id
  )
  select
    v_job.guild_id,
    v_run.started_at,
    v_expected,
    v_expected,
    v_guild_gp,
    v_character_power,
    v_ship_power,
    coalesce(sum(ps.gl_count), 0)::integer,
    coalesce(sum(ps.gear_13_count), 0)::integer,
    coalesce(sum(ps.relic_5_plus_count), 0)::integer,
    coalesce(sum(ps.relic_7_plus_count), 0)::integer,
    coalesce(sum(ps.relic_9_count), 0)::integer,
    coalesce(sum(ps.seven_star_ship_count), 0)::integer,
    jsonb_build_object('source', 'bounded-guild-sync', 'boundedTransport', true),
    v_run.id
  from public.player_snapshots ps
  where ps.player_id = any(v_member_ids)
    and ps.snapshot_date = (v_run.started_at at time zone 'UTC')::date
  on conflict (guild_id, snapshot_date) do update set
    captured_at = excluded.captured_at,
    member_count = excluded.member_count,
    hydrated_member_count = excluded.hydrated_member_count,
    galactic_power = excluded.galactic_power,
    character_power = excluded.character_power,
    ship_power = excluded.ship_power,
    gl_count = excluded.gl_count,
    gear_13_count = excluded.gear_13_count,
    relic_5_plus_count = excluded.relic_5_plus_count,
    relic_7_plus_count = excluded.relic_7_plus_count,
    relic_9_count = excluded.relic_9_count,
    seven_star_ship_count = excluded.seven_star_ship_count,
    metrics = excluded.metrics,
    source_sync_run_id = excluded.source_sync_run_id;

  if nullif(v_run.metadata->>'activitySnapshotId', '') is not null then
    begin
      v_activity_snapshot_id := (v_run.metadata->>'activitySnapshotId')::bigint;
    exception when others then
      v_activity_snapshot_id := null;
    end;
  end if;

  update public.guild_sync_runs
  set status = 'completed',
      completed_at = now(),
      members_discovered = v_expected,
      rosters_hydrated = v_expected,
      rosters_failed = 0,
      units_loaded = v_units,
      error_message = null,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'activitySnapshotId', v_activity_snapshot_id,
        'boundedTransport', true,
        'canonicalIngest', 'bounded-member-rpc-v1',
        'processedMembers', v_processed
      )
  where id = v_run.id;

  delete from public.guild_sync_stage_members where job_id = p_job_id;

  return jsonb_build_object(
    'ok', true,
    'syncRunId', v_run.id,
    'guildId', v_job.guild_id,
    'membersStored', v_expected,
    'unitsStored', v_units,
    'activitySnapshotId', v_activity_snapshot_id,
    'capturedAt', v_run.started_at,
    'boundedTransport', true,
    'canonicalIngest', 'bounded-member-rpc-v1'
  );
end;
$$;

revoke all on function public.prepare_bounded_guild_sync(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.ingest_bounded_guild_sync_members(uuid, integer) from public, anon, authenticated;
revoke all on function public.complete_bounded_guild_sync(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.prepare_bounded_guild_sync(uuid, jsonb) to service_role;
grant execute on function public.ingest_bounded_guild_sync_members(uuid, integer) to service_role;
grant execute on function public.complete_bounded_guild_sync(uuid, jsonb) to service_role;

comment on function public.prepare_bounded_guild_sync(uuid, jsonb) is
  'Prepares one fully staged verified Guild sync, creates/reuses its audit run and activity snapshot, and binds staging rows to that run.';
comment on function public.ingest_bounded_guild_sync_members(uuid, integer) is
  'Service-role bounded canonical ingest. Processes a small number of staged Guild members per RPC so large rosters remain below PostgREST statement limits.';
comment on function public.complete_bounded_guild_sync(uuid, jsonb) is
  'Completes a bounded Guild sync only after every staged member has canonical player, roster, snapshot and activity rows. Then reconciles departures and publishes the Guild snapshot.';
