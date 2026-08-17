create or replace function public.read_persisted_guild_roster(p_ally_code text)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
with target_player as (
  select p.id, p.current_guild_id
  from public.players p
  where p.ally_code = regexp_replace(coalesce(p_ally_code, ''), '[^0-9]', '', 'g')
    and length(regexp_replace(coalesce(p_ally_code, ''), '[^0-9]', '', 'g')) = 9
  limit 1
),
target_guild as (
  select g.*
  from target_player tp
  join public.guilds g on g.id = tp.current_guild_id
  where exists (
    select 1
    from public.guild_members_current gmc
    where gmc.guild_id = g.id
      and gmc.player_id = tp.id
  )
),
member_rows as (
  select
    gmc.guild_id,
    gmc.player_id as canonical_player_id,
    coalesce(nullif(p.swgoh_player_id, ''), p.id::text) as player_id,
    p.ally_code,
    coalesce(nullif(gmc.member_name, ''), nullif(p.name, ''), p.ally_code) as member_name,
    greatest(0, coalesce(gmc.member_galactic_power, p.galactic_power, 0)) as galactic_power,
    greatest(0, coalesce(gmc.member_character_power, p.character_power, 0)) as character_power,
    greatest(0, coalesce(gmc.member_ship_power, p.ship_power, 0)) as ship_power,
    gmc.last_synced_at,
    exists (
      select 1 from public.player_units_current owned where owned.player_id = gmc.player_id
    ) as roster_available,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'baseId', owned.base_id,
          'name', coalesce(nullif(owned.unit_name, ''), nullif(catalog.name, ''), owned.base_id),
          'unitType', case when lower(coalesce(owned.combat_type, catalog.combat_type, '')) = 'ship' then 'Ship' else 'Character' end,
          'combatType', coalesce(nullif(owned.combat_type, ''), nullif(catalog.combat_type, ''), 'character'),
          'stars', greatest(0, coalesce(owned.rarity, 0)),
          'rarity', greatest(0, coalesce(owned.rarity, 0)),
          'level', greatest(0, coalesce(owned.level, 0)),
          'gear', greatest(0, coalesce(owned.gear_level, 0)),
          'relic', greatest(0, coalesce(owned.relic_tier, 0)),
          'power', greatest(0, coalesce(owned.galactic_power, 0)),
          'zetaCount', greatest(0, coalesce(owned.zeta_count, 0)),
          'omicronCount', greatest(0, coalesce(owned.omicron_count, 0)),
          'ultimateUnlocked', coalesce(owned.ultimate_unlocked, false),
          'speed', greatest(0, coalesce((owned.metadata->>'speed')::integer, 0)),
          'categories', coalesce(to_jsonb(catalog.categories), '[]'::jsonb),
          'imageUrl', coalesce(catalog.image_url, ''),
          'lastSyncedAt', owned.last_synced_at
        )
        order by owned.galactic_power desc nulls last, owned.base_id
      )
      from public.player_units_current owned
      left join public.game_units catalog on catalog.base_id = owned.base_id
      where owned.player_id = gmc.player_id
    ), '[]'::jsonb) as units
  from public.guild_members_current gmc
  join public.players p on p.id = gmc.player_id
  join target_guild g on g.id = gmc.guild_id
),
member_payload as (
  select
    count(*)::integer as requested,
    count(*) filter (where roster_available)::integer as hydrated,
    coalesce(jsonb_agg(
      jsonb_build_object(
        'playerId', player_id,
        'allyCode', ally_code,
        'name', member_name,
        'galacticPower', galactic_power,
        'characterGalacticPower', character_power,
        'shipGalacticPower', ship_power,
        'rosterAvailable', roster_available,
        'lastSyncedAt', last_synced_at,
        'units', units
      )
      order by galactic_power desc, member_name
    ), '[]'::jsonb) as members
  from member_rows
),
history_payload as (
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'eventType', event_type,
      'occurredAt', occurred_at,
      'playerId', player_id,
      'allyCode', ally_code,
      'name', player_name,
      'previousValue', previous_value,
      'newValue', new_value
    ) order by occurred_at desc, history_id desc
  ), '[]'::jsonb) as events
  from (
    select
      h.id as history_id,
      h.event_type,
      h.occurred_at,
      coalesce(nullif(p.swgoh_player_id, ''), p.id::text) as player_id,
      p.ally_code,
      coalesce(nullif(p.name, ''), p.ally_code) as player_name,
      h.previous_value,
      h.new_value
    from public.guild_membership_history h
    join target_guild g on g.id = h.guild_id
    left join public.players p on p.id = h.player_id
    order by h.occurred_at desc, h.id desc
    limit 100
  ) recent_history
)
select jsonb_build_object(
  'source', 'persisted',
  'fetchedAt', g.last_synced_at,
  'guild', jsonb_build_object(
    'id', g.swgoh_guild_id,
    'name', g.name,
    'galacticPower', greatest(0, coalesce(g.galactic_power, 0)),
    'characterGalacticPower', greatest(0, coalesce(g.character_power, 0)),
    'shipGalacticPower', greatest(0, coalesce(g.ship_power, 0)),
    'memberCount', mp.requested
  ),
  'hydration', jsonb_build_object(
    'requested', mp.requested,
    'hydrated', mp.hydrated,
    'failed', greatest(0, mp.requested - mp.hydrated),
    'complete', mp.requested > 0 and mp.requested = mp.hydrated
  ),
  'members', mp.members,
  'membershipHistory', hp.events,
  'persistence', jsonb_build_object(
    'mode', 'supabase-canonical-current',
    'guildId', g.id,
    'lastSyncedAt', g.last_synced_at,
    'ageSeconds', case
      when g.last_synced_at is null then null
      else greatest(0, floor(extract(epoch from (now() - g.last_synced_at))))::bigint
    end,
    'sharedHistory', true
  )
)
from target_guild g
cross join member_payload mp
cross join history_payload hp;
$$;

revoke all on function public.read_persisted_guild_roster(text) from public, anon, authenticated;
grant execute on function public.read_persisted_guild_roster(text) to service_role;

comment on function public.read_persisted_guild_roster(text) is
  'Returns the canonical persisted Guild roster in the live-roster compatibility shape used by Command Center web planners. Includes compact owned units and shared membership history; service-role only.';
