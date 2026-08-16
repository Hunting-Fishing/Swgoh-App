create or replace function public.ingest_verified_user_guild_sync(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid;
  v_requester_player_id uuid;
  v_guild_id uuid;
  v_sync_run_id uuid;
  v_activity_snapshot_id bigint;
  v_captured_at timestamptz;
  v_guild jsonb;
  v_activity jsonb;
  v_member jsonb;
  v_unit jsonb;
  v_player_uuid uuid;
  v_existing_member record;
  v_member_ids uuid[] := '{}'::uuid[];
  v_unit_ids text[];
  v_members_count integer := 0;
  v_units_count integer := 0;
  v_character_power bigint := 0;
  v_ship_power bigint := 0;
  v_character_count integer;
  v_ship_count integer;
  v_g13_count integer;
  v_r5_count integer;
  v_r7_count integer;
  v_r9_count integer;
  v_seven_star_ship_count integer;
  v_member_char_power bigint;
  v_member_ship_power bigint;
  v_history_event text;
  v_fingerprint text;
  v_next_refresh timestamptz;
  v_raid_tickets_current integer;
  v_raid_tickets_lifetime bigint;
  v_error text;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Guild sync payload must be a JSON object.';
  end if;

  begin
    v_user_id := (p_payload->>'requesterUserId')::uuid;
  exception when others then
    raise exception 'Guild sync requester is invalid.';
  end;

  if coalesce(p_payload->'hydration'->>'complete', 'false')::boolean is not true then
    raise exception 'Guild roster hydration is incomplete.';
  end if;
  if coalesce(p_payload->'calculation'->>'complete', 'false')::boolean is not true then
    raise exception 'Guild roster GP/stat calculation is incomplete.';
  end if;
  if jsonb_typeof(p_payload->'members') <> 'array' or jsonb_array_length(p_payload->'members') < 1 then
    raise exception 'Guild sync contains no members.';
  end if;

  v_guild := coalesce(p_payload->'guild', '{}'::jsonb);
  select id into v_guild_id
  from public.guilds
  where swgoh_guild_id = nullif(v_guild->>'swgohGuildId', '')
  limit 1;
  if v_guild_id is null then
    raise exception 'Guild must be onboarded before permanent synchronization.';
  end if;

  select upl.player_id into v_requester_player_id
  from public.user_player_links upl
  join public.guild_user_memberships gum
    on gum.user_id = upl.user_id
   and gum.player_id = upl.player_id
   and gum.guild_id = v_guild_id
  where upl.user_id = v_user_id
    and upl.verification_status = 'verified'
    and gum.status = 'active'
  limit 1;
  if v_requester_player_id is null then
    raise exception 'Requester is not a verified active member of this Guild.';
  end if;

  if not exists (
    select 1
    from public.players p
    join jsonb_array_elements(p_payload->'members') m on true
    where p.id = v_requester_player_id
      and p.ally_code = m->>'allyCode'
      and p.swgoh_player_id = m->>'swgohPlayerId'
  ) then
    raise exception 'Verified requester is not present in the fresh live Guild roster.';
  end if;

  begin
    v_captured_at := coalesce(nullif(p_payload->>'capturedAt', '')::timestamptz, now());
  exception when others then
    v_captured_at := now();
  end;

  insert into public.guild_sync_runs (
    guild_id, lookup_ally_code, status, source, source_cache, started_at,
    expected_members, members_discovered, rosters_hydrated, rosters_failed,
    requested_by_user_id, request_origin, metadata
  ) values (
    v_guild_id,
    nullif(p_payload->>'lookupAllyCode', ''),
    'started',
    'comlink',
    nullif(p_payload->>'sourceCache', ''),
    v_captured_at,
    coalesce((p_payload->'hydration'->>'requested')::integer, jsonb_array_length(p_payload->'members')),
    jsonb_array_length(p_payload->'members'),
    coalesce((p_payload->'hydration'->>'hydrated')::integer, 0),
    coalesce((p_payload->'hydration'->>'failed')::integer, 0),
    v_user_id,
    'user',
    jsonb_build_object('rosterDetail', coalesce(p_payload->>'rosterDetail', 'rich'), 'calculation', coalesce(p_payload->'calculation', '{}'::jsonb))
  ) returning id into v_sync_run_id;

  begin
    for v_member in select value from jsonb_array_elements(p_payload->'members') loop
      if coalesce(v_member->>'allyCode', '') !~ '^[0-9]{9}$' then raise exception 'Guild member Ally Code is invalid.'; end if;
      if nullif(v_member->>'swgohPlayerId', '') is null then raise exception 'Guild member SWGOH player ID is missing.'; end if;
      if jsonb_typeof(v_member->'units') <> 'array' then raise exception 'Guild member roster units are missing.'; end if;

      select id into v_player_uuid from public.players
      where ally_code = v_member->>'allyCode' or swgoh_player_id = v_member->>'swgohPlayerId'
      order by case when ally_code = v_member->>'allyCode' then 0 else 1 end limit 1;

      if v_player_uuid is null then
        insert into public.players (
          ally_code, swgoh_player_id, name, level, galactic_power, character_power, ship_power,
          current_guild_id, first_seen_at, last_seen_at, last_synced_at, source, metadata, updated_at
        ) values (
          v_member->>'allyCode', v_member->>'swgohPlayerId', coalesce(nullif(v_member->>'name', ''), v_member->>'allyCode'),
          greatest(0, coalesce((v_member->>'level')::integer, 0)), greatest(0, coalesce((v_member->>'galacticPower')::bigint, 0)),
          greatest(0, coalesce((v_member->>'characterPower')::bigint, 0)), greatest(0, coalesce((v_member->>'shipPower')::bigint, 0)),
          v_guild_id, v_captured_at, v_captured_at, v_captured_at, 'comlink', coalesce(v_member->'playerMetadata', '{}'::jsonb), v_captured_at
        ) returning id into v_player_uuid;
      else
        if exists (select 1 from public.players where id = v_player_uuid and (ally_code <> v_member->>'allyCode' or (swgoh_player_id is not null and swgoh_player_id <> v_member->>'swgohPlayerId'))) then
          raise exception 'Canonical player identity mismatch for Ally Code %.', v_member->>'allyCode';
        end if;
        update public.players set
          swgoh_player_id = v_member->>'swgohPlayerId', name = coalesce(nullif(v_member->>'name', ''), name),
          level = greatest(0, coalesce((v_member->>'level')::integer, level, 0)),
          galactic_power = greatest(0, coalesce((v_member->>'galacticPower')::bigint, galactic_power, 0)),
          character_power = greatest(0, coalesce((v_member->>'characterPower')::bigint, character_power, 0)),
          ship_power = greatest(0, coalesce((v_member->>'shipPower')::bigint, ship_power, 0)),
          current_guild_id = v_guild_id, last_seen_at = v_captured_at, last_synced_at = v_captured_at,
          source = 'comlink', metadata = coalesce(metadata, '{}'::jsonb) || coalesce(v_member->'playerMetadata', '{}'::jsonb), updated_at = v_captured_at
        where id = v_player_uuid;
      end if;

      v_member_ids := array_append(v_member_ids, v_player_uuid);
      v_members_count := v_members_count + 1;
      v_member_char_power := greatest(0, coalesce((v_member->>'characterPower')::bigint, 0));
      v_member_ship_power := greatest(0, coalesce((v_member->>'shipPower')::bigint, 0));
      v_character_power := v_character_power + v_member_char_power;
      v_ship_power := v_ship_power + v_member_ship_power;

      select * into v_existing_member from public.guild_members_current where guild_id = v_guild_id and player_id = v_player_uuid;
      if not found then
        select case when exists (select 1 from public.guild_membership_history where guild_id = v_guild_id and player_id = v_player_uuid and event_type = 'left') then 'returned' else 'joined' end into v_history_event;
        insert into public.guild_membership_history (guild_id, player_id, event_type, occurred_at, new_value, metadata)
        values (v_guild_id, v_player_uuid, v_history_event, v_captured_at, coalesce(nullif(v_member->>'name', ''), v_member->>'allyCode'), jsonb_build_object('sourceSyncRunId', v_sync_run_id));
      elsif v_existing_member.member_name <> coalesce(nullif(v_member->>'name', ''), v_existing_member.member_name) then
        insert into public.guild_membership_history (guild_id, player_id, event_type, occurred_at, previous_value, new_value, metadata)
        values (v_guild_id, v_player_uuid, 'renamed', v_captured_at, v_existing_member.member_name, coalesce(nullif(v_member->>'name', ''), v_existing_member.member_name), jsonb_build_object('sourceSyncRunId', v_sync_run_id));
      end if;

      insert into public.guild_members_current (
        guild_id, player_id, member_name, member_galactic_power, member_character_power, member_ship_power,
        first_seen_in_guild_at, last_seen_in_guild_at, last_synced_at, metadata
      ) values (
        v_guild_id, v_player_uuid, coalesce(nullif(v_member->>'name', ''), v_member->>'allyCode'),
        greatest(0, coalesce((v_member->>'galacticPower')::bigint, 0)), v_member_char_power, v_member_ship_power,
        v_captured_at, v_captured_at, v_captured_at,
        jsonb_build_object('memberLevel', greatest(0, coalesce((v_member->>'memberLevel')::integer, 0)), 'guildXp', greatest(0, coalesce((v_member->>'guildXp')::bigint, 0)), 'squadPower', greatest(0, coalesce((v_member->>'squadPower')::bigint, 0)), 'lastActivityAt', v_member->>'lastActivityAt', 'guildJoinedAt', v_member->>'guildJoinedAt')
      ) on conflict (guild_id, player_id) do update set
        member_name = excluded.member_name, member_galactic_power = excluded.member_galactic_power,
        member_character_power = excluded.member_character_power, member_ship_power = excluded.member_ship_power,
        last_seen_in_guild_at = excluded.last_seen_in_guild_at, last_synced_at = excluded.last_synced_at, metadata = excluded.metadata;

      update public.guild_user_memberships gum set status = 'active', joined_at = coalesce(gum.joined_at, v_captured_at), left_at = null, updated_at = v_captured_at
      where gum.guild_id = v_guild_id and gum.player_id = v_player_uuid and gum.status in ('pending','left')
        and exists (select 1 from public.user_player_links upl where upl.user_id = gum.user_id and upl.player_id = gum.player_id and upl.verification_status = 'verified');

      v_unit_ids := '{}'::text[];
      for v_unit in select value from jsonb_array_elements(v_member->'units') loop
        if nullif(v_unit->>'baseId', '') is null then raise exception 'Roster unit is missing Base ID.'; end if;
        v_unit_ids := array_append(v_unit_ids, v_unit->>'baseId');
        v_units_count := v_units_count + 1;
        insert into public.player_units_current (
          player_id, base_id, unit_name, combat_type, rarity, level, gear_level, relic_tier,
          galactic_power, zeta_count, omicron_count, ultimate_unlocked, last_synced_at, metadata
        ) values (
          v_player_uuid, v_unit->>'baseId', coalesce(nullif(v_unit->>'name', ''), v_unit->>'baseId'),
          case lower(coalesce(v_unit->>'combatType', 'unknown')) when 'character' then 'character' when 'ship' then 'ship' else 'unknown' end,
          least(7, greatest(0, coalesce((v_unit->>'rarity')::integer, 0))), greatest(0, coalesce((v_unit->>'level')::integer, 0)),
          greatest(0, coalesce((v_unit->>'gearLevel')::integer, 0)), greatest(0, coalesce((v_unit->>'relicTier')::integer, 0)),
          greatest(0, coalesce((v_unit->>'galacticPower')::integer, 0)), greatest(0, coalesce((v_unit->>'zetaCount')::integer, 0)),
          greatest(0, coalesce((v_unit->>'omicronCount')::integer, 0)), case when v_unit ? 'ultimateUnlocked' then (v_unit->>'ultimateUnlocked')::boolean else null end,
          v_captured_at, coalesce(v_unit->'metadata', '{}'::jsonb)
        ) on conflict (player_id, base_id) do update set
          unit_name = excluded.unit_name, combat_type = excluded.combat_type, rarity = excluded.rarity, level = excluded.level,
          gear_level = excluded.gear_level, relic_tier = excluded.relic_tier, galactic_power = excluded.galactic_power,
          zeta_count = excluded.zeta_count, omicron_count = excluded.omicron_count, ultimate_unlocked = excluded.ultimate_unlocked,
          last_synced_at = excluded.last_synced_at, metadata = excluded.metadata;
      end loop;
      delete from public.player_units_current where player_id = v_player_uuid and not (base_id = any(v_unit_ids));

      select count(*) filter (where combat_type = 'character'), count(*) filter (where combat_type = 'ship'),
        count(*) filter (where combat_type = 'character' and gear_level >= 13), count(*) filter (where combat_type = 'character' and relic_tier >= 5),
        count(*) filter (where combat_type = 'character' and relic_tier >= 7), count(*) filter (where combat_type = 'character' and relic_tier >= 9),
        count(*) filter (where combat_type = 'ship' and rarity >= 7)
      into v_character_count, v_ship_count, v_g13_count, v_r5_count, v_r7_count, v_r9_count, v_seven_star_ship_count
      from public.player_units_current where player_id = v_player_uuid;

      insert into public.player_snapshots (
        player_id, guild_id, captured_at, galactic_power, character_power, ship_power, character_count, ship_count,
        gl_count, gear_13_count, relic_5_plus_count, relic_7_plus_count, relic_9_count, seven_star_ship_count, metrics, source_sync_run_id
      ) values (
        v_player_uuid, v_guild_id, v_captured_at, greatest(0, coalesce((v_member->>'galacticPower')::bigint, 0)), v_member_char_power, v_member_ship_power,
        coalesce(v_character_count, 0), coalesce(v_ship_count, 0), 0, coalesce(v_g13_count, 0), coalesce(v_r5_count, 0),
        coalesce(v_r7_count, 0), coalesce(v_r9_count, 0), coalesce(v_seven_star_ship_count, 0), jsonb_build_object('glCountPendingCatalog', true, 'source', 'rich-guild-sync'), v_sync_run_id
      ) on conflict (player_id, snapshot_date) do update set
        guild_id = excluded.guild_id, captured_at = excluded.captured_at, galactic_power = excluded.galactic_power,
        character_power = excluded.character_power, ship_power = excluded.ship_power, character_count = excluded.character_count,
        ship_count = excluded.ship_count, gear_13_count = excluded.gear_13_count, relic_5_plus_count = excluded.relic_5_plus_count,
        relic_7_plus_count = excluded.relic_7_plus_count, relic_9_count = excluded.relic_9_count,
        seven_star_ship_count = excluded.seven_star_ship_count, metrics = excluded.metrics, source_sync_run_id = excluded.source_sync_run_id;
    end loop;

    for v_existing_member in select gmc.player_id, gmc.member_name from public.guild_members_current gmc
      where gmc.guild_id = v_guild_id and not (gmc.player_id = any(v_member_ids))
    loop
      insert into public.guild_membership_history (guild_id, player_id, event_type, occurred_at, previous_value, metadata)
      values (v_guild_id, v_existing_member.player_id, 'left', v_captured_at, v_existing_member.member_name, jsonb_build_object('sourceSyncRunId', v_sync_run_id));
      update public.players set current_guild_id = null, updated_at = v_captured_at where id = v_existing_member.player_id and current_guild_id = v_guild_id;
      update public.guild_user_memberships set status = 'left', left_at = v_captured_at, updated_at = v_captured_at
        where guild_id = v_guild_id and player_id = v_existing_member.player_id and status = 'active';
    end loop;
    delete from public.guild_members_current where guild_id = v_guild_id and not (player_id = any(v_member_ids));

    update public.guilds set
      name = coalesce(nullif(v_guild->>'name', ''), name), member_count = v_members_count,
      galactic_power = greatest(0, coalesce((v_guild->>'galacticPower')::bigint, 0)), character_power = v_character_power, ship_power = v_ship_power,
      last_seen_at = v_captured_at, last_synced_at = v_captured_at, source = 'comlink',
      metadata = coalesce(metadata, '{}'::jsonb) || coalesce(v_guild->'metadata', '{}'::jsonb), updated_at = v_captured_at
    where id = v_guild_id;

    insert into public.guild_snapshots (
      guild_id, captured_at, member_count, hydrated_member_count, galactic_power, character_power, ship_power,
      gl_count, gear_13_count, relic_5_plus_count, relic_7_plus_count, relic_9_count, seven_star_ship_count, metrics, source_sync_run_id
    ) select
      v_guild_id, v_captured_at, v_members_count, v_members_count, greatest(0, coalesce((v_guild->>'galacticPower')::bigint, 0)),
      v_character_power, v_ship_power, 0, coalesce(sum(ps.gear_13_count), 0)::integer, coalesce(sum(ps.relic_5_plus_count), 0)::integer,
      coalesce(sum(ps.relic_7_plus_count), 0)::integer, coalesce(sum(ps.relic_9_count), 0)::integer, coalesce(sum(ps.seven_star_ship_count), 0)::integer,
      jsonb_build_object('glCountPendingCatalog', true, 'source', 'rich-guild-sync'), v_sync_run_id
    from public.player_snapshots ps where ps.player_id = any(v_member_ids) and ps.snapshot_date = (v_captured_at at time zone 'UTC')::date
    on conflict (guild_id, snapshot_date) do update set
      captured_at = excluded.captured_at, member_count = excluded.member_count, hydrated_member_count = excluded.hydrated_member_count,
      galactic_power = excluded.galactic_power, character_power = excluded.character_power, ship_power = excluded.ship_power,
      gear_13_count = excluded.gear_13_count, relic_5_plus_count = excluded.relic_5_plus_count, relic_7_plus_count = excluded.relic_7_plus_count,
      relic_9_count = excluded.relic_9_count, seven_star_ship_count = excluded.seven_star_ship_count, metrics = excluded.metrics, source_sync_run_id = excluded.source_sync_run_id;

    v_activity := coalesce(p_payload->'activity', '{}'::jsonb);
    v_fingerprint := nullif(p_payload->>'activityFingerprint', '');
    begin v_next_refresh := nullif(v_activity->>'nextChallengesRefresh', '')::timestamptz; exception when others then v_next_refresh := null; end;

    insert into public.guild_activity_snapshots (
      guild_id, captured_at, snapshot_kind, source_sync_run_id, next_challenges_refresh, raid_launch_config,
      guild_event_tracker, recent_raid_results, recent_tw_results, territory_battle_results, source_fingerprint, metadata
    ) values (
      v_guild_id, v_captured_at, coalesce(nullif(p_payload->>'snapshotKind', ''), 'user_sync'), v_sync_run_id, v_next_refresh,
      coalesce(v_activity->'raidLaunchConfig', '[]'::jsonb), coalesce(v_activity->'guildEventTracker', '[]'::jsonb),
      coalesce(v_activity->'recentRaidResult', '[]'::jsonb), coalesce(v_activity->'recentTerritoryWarResult', '[]'::jsonb),
      coalesce(v_activity->'territoryBattleResult', '[]'::jsonb), v_fingerprint, jsonb_build_object('source', 'comlink-rich-guild')
    ) on conflict (guild_id, source_fingerprint) where source_fingerprint is not null do nothing returning id into v_activity_snapshot_id;

    if v_activity_snapshot_id is null and v_fingerprint is not null then
      select id into v_activity_snapshot_id from public.guild_activity_snapshots
      where guild_id = v_guild_id and source_fingerprint = v_fingerprint order by captured_at desc limit 1;
    end if;

    if v_activity_snapshot_id is not null then
      for v_member in select value from jsonb_array_elements(p_payload->'members') loop
        select id into v_player_uuid from public.players where ally_code = v_member->>'allyCode' and swgoh_player_id = v_member->>'swgohPlayerId' limit 1;
        v_raid_tickets_current := case when v_member ? 'raidTicketsCurrent' and nullif(v_member->>'raidTicketsCurrent', '') is not null then greatest(0, (v_member->>'raidTicketsCurrent')::integer) else null end;
        v_raid_tickets_lifetime := case when v_member ? 'raidTicketsLifetime' and nullif(v_member->>'raidTicketsLifetime', '') is not null then greatest(0, (v_member->>'raidTicketsLifetime')::bigint) else null end;
        insert into public.guild_member_activity_snapshots (
          snapshot_id, guild_id, player_id, captured_at, member_level, guild_xp, galactic_power, squad_power,
          last_activity_at, guild_joined_at, lifetime_season_score, league_id, raid_tickets_current, raid_tickets_lifetime,
          member_contribution, season_status, metadata
        ) values (
          v_activity_snapshot_id, v_guild_id, v_player_uuid, v_captured_at,
          greatest(0, coalesce((v_member->>'memberLevel')::integer, 0)), greatest(0, coalesce((v_member->>'guildXp')::bigint, 0)),
          greatest(0, coalesce((v_member->>'galacticPower')::bigint, 0)), greatest(0, coalesce((v_member->>'squadPower')::bigint, 0)),
          case when nullif(v_member->>'lastActivityAt', '') is not null then (v_member->>'lastActivityAt')::timestamptz else null end,
          case when nullif(v_member->>'guildJoinedAt', '') is not null then (v_member->>'guildJoinedAt')::timestamptz else null end,
          greatest(0, coalesce((v_member->>'lifetimeSeasonScore')::bigint, 0)), nullif(v_member->>'leagueId', ''),
          v_raid_tickets_current, v_raid_tickets_lifetime, coalesce(v_member->'memberContribution', '[]'::jsonb),
          coalesce(v_member->'seasonStatus', '[]'::jsonb), coalesce(v_member->'activityMetadata', '{}'::jsonb)
        ) on conflict (snapshot_id, player_id) do nothing;
      end loop;
    end if;

    update public.guild_sync_runs set status = 'completed', completed_at = now(), members_discovered = v_members_count,
      rosters_hydrated = v_members_count, rosters_failed = 0, units_loaded = v_units_count,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('activitySnapshotId', v_activity_snapshot_id, 'activityFingerprint', v_fingerprint)
    where id = v_sync_run_id;

    return jsonb_build_object('ok', true, 'syncRunId', v_sync_run_id, 'guildId', v_guild_id, 'membersStored', v_members_count,
      'unitsStored', v_units_count, 'activitySnapshotId', v_activity_snapshot_id, 'capturedAt', v_captured_at);
  exception when others then
    get stacked diagnostics v_error = message_text;
    update public.guild_sync_runs set status = 'failed', completed_at = now(), error_message = left(v_error, 1000) where id = v_sync_run_id;
    return jsonb_build_object('ok', false, 'syncRunId', v_sync_run_id, 'guildId', v_guild_id, 'error', left(v_error, 1000));
  end;
end;
$$;

revoke all on function public.ingest_verified_user_guild_sync(jsonb) from public;
revoke all on function public.ingest_verified_user_guild_sync(jsonb) from anon;
revoke all on function public.ingest_verified_user_guild_sync(jsonb) from authenticated;
grant execute on function public.ingest_verified_user_guild_sync(jsonb) to service_role;

comment on function public.ingest_verified_user_guild_sync(jsonb) is
  'Service-role-only transactional Guild ingestion. Requires a verified player link and active membership in the exact live Guild before current roster/history is committed.';
