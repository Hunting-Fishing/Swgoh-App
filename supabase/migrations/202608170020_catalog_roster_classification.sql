create or replace function private.normalize_player_unit_catalog_combat_type()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_catalog_type text;
begin
  if new.combat_type is null or new.combat_type not in ('character','ship') then
    select gu.combat_type into v_catalog_type
    from public.game_units gu
    where gu.base_id = new.base_id
    limit 1;
    if v_catalog_type in ('character','ship') then
      new.combat_type := v_catalog_type;
    else
      new.combat_type := 'unknown';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists player_units_catalog_combat_type on public.player_units_current;
create trigger player_units_catalog_combat_type
before insert or update of base_id, combat_type on public.player_units_current
for each row execute function private.normalize_player_unit_catalog_combat_type();

create or replace function private.derive_player_snapshot_catalog_metrics()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_character_power bigint := 0;
  v_ship_power bigint := 0;
  v_character_count integer := 0;
  v_ship_count integer := 0;
  v_gl_count integer := 0;
  v_g13_count integer := 0;
  v_r5_count integer := 0;
  v_r7_count integer := 0;
  v_r9_count integer := 0;
  v_seven_star_ship_count integer := 0;
  v_catalog_version text;
  v_derived_breakdown boolean := false;
begin
  select
    coalesce(sum(puc.galactic_power) filter (where gu.combat_type = 'character'), 0)::bigint,
    coalesce(sum(puc.galactic_power) filter (where gu.combat_type = 'ship'), 0)::bigint,
    count(*) filter (where gu.combat_type = 'character')::integer,
    count(*) filter (where gu.combat_type = 'ship')::integer,
    count(*) filter (where 'galactic_legend' = any(gu.categories))::integer,
    count(*) filter (where gu.combat_type = 'character' and puc.gear_level >= 13)::integer,
    count(*) filter (where gu.combat_type = 'character' and puc.relic_tier >= 5)::integer,
    count(*) filter (where gu.combat_type = 'character' and puc.relic_tier >= 7)::integer,
    count(*) filter (where gu.combat_type = 'character' and puc.relic_tier >= 9)::integer,
    count(*) filter (where gu.combat_type = 'ship' and puc.rarity >= 7)::integer
  into
    v_character_power, v_ship_power, v_character_count, v_ship_count, v_gl_count,
    v_g13_count, v_r5_count, v_r7_count, v_r9_count, v_seven_star_ship_count
  from public.player_units_current puc
  left join public.game_units gu on gu.base_id = puc.base_id
  where puc.player_id = new.player_id;

  select max(gu.catalog_version) into v_catalog_version
  from public.game_units gu
  where gu.catalog_version is not null;

  new.character_count := coalesce(v_character_count, 0);
  new.ship_count := coalesce(v_ship_count, 0);
  new.gl_count := coalesce(v_gl_count, 0);
  new.gear_13_count := coalesce(v_g13_count, 0);
  new.relic_5_plus_count := coalesce(v_r5_count, 0);
  new.relic_7_plus_count := coalesce(v_r7_count, 0);
  new.relic_9_count := coalesce(v_r9_count, 0);
  new.seven_star_ship_count := coalesce(v_seven_star_ship_count, 0);

  if coalesce(new.character_power, 0) = 0 and v_character_power > 0 then
    new.character_power := v_character_power;
    v_derived_breakdown := true;
  end if;
  if coalesce(new.ship_power, 0) = 0 and v_ship_power > 0 then
    new.ship_power := v_ship_power;
    v_derived_breakdown := true;
  end if;

  new.metrics := (coalesce(new.metrics, '{}'::jsonb) - 'glCountPendingCatalog')
    || jsonb_build_object(
      'glCountSource', 'game_units.categories:galactic_legend',
      'glCountCatalogVersion', v_catalog_version,
      'rosterMetricSource', 'player_units_current+game_units',
      'rosterMetricCatalogVersion', v_catalog_version,
      'powerBreakdownSource', case when v_derived_breakdown then 'unit-gp-sum-by-game-catalog' else 'live-player-breakdown' end,
      'powerBreakdownDelta', coalesce(new.galactic_power, 0) - (coalesce(new.character_power, 0) + coalesce(new.ship_power, 0))
    );

  if v_derived_breakdown then
    update public.players
    set character_power = new.character_power,
        ship_power = new.ship_power,
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
          'powerBreakdownSource', 'unit-gp-sum-by-game-catalog',
          'powerBreakdownCatalogVersion', v_catalog_version,
          'powerBreakdownDelta', coalesce(new.galactic_power, 0) - (coalesce(new.character_power, 0) + coalesce(new.ship_power, 0))
        )
    where id = new.player_id;

    if new.guild_id is not null then
      update public.guild_members_current
      set member_character_power = new.character_power,
          member_ship_power = new.ship_power,
          metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
            'powerBreakdownSource', 'unit-gp-sum-by-game-catalog',
            'powerBreakdownCatalogVersion', v_catalog_version,
            'powerBreakdownDelta', coalesce(new.galactic_power, 0) - (coalesce(new.character_power, 0) + coalesce(new.ship_power, 0))
          )
      where guild_id = new.guild_id and player_id = new.player_id;
    end if;
  end if;

  return new;
end;
$$;

update public.player_units_current puc
set combat_type = gu.combat_type
from public.game_units gu
where gu.base_id = puc.base_id
  and puc.combat_type = 'unknown'
  and gu.combat_type in ('character','ship');

update public.player_snapshots
set metrics = metrics
where snapshot_date = (now() at time zone 'UTC')::date;

with totals as (
  select
    guild_id,
    coalesce(sum(member_character_power), 0)::bigint as character_power,
    coalesce(sum(member_ship_power), 0)::bigint as ship_power
  from public.guild_members_current
  group by guild_id
)
update public.guilds g
set character_power = totals.character_power,
    ship_power = totals.ship_power,
    metadata = coalesce(g.metadata, '{}'::jsonb) || jsonb_build_object(
      'powerBreakdownSource', 'member-unit-gp-sum-by-game-catalog'
    )
from totals
where g.id = totals.guild_id;

with daily as (
  select
    ps.guild_id,
    ps.snapshot_date,
    coalesce(sum(ps.character_power), 0)::bigint as character_power,
    coalesce(sum(ps.ship_power), 0)::bigint as ship_power,
    coalesce(sum(ps.gl_count), 0)::integer as gl_count,
    coalesce(sum(ps.gear_13_count), 0)::integer as gear_13_count,
    coalesce(sum(ps.relic_5_plus_count), 0)::integer as relic_5_plus_count,
    coalesce(sum(ps.relic_7_plus_count), 0)::integer as relic_7_plus_count,
    coalesce(sum(ps.relic_9_count), 0)::integer as relic_9_count,
    coalesce(sum(ps.seven_star_ship_count), 0)::integer as seven_star_ship_count
  from public.player_snapshots ps
  where ps.guild_id is not null
    and ps.snapshot_date = (now() at time zone 'UTC')::date
  group by ps.guild_id, ps.snapshot_date
)
update public.guild_snapshots gs
set character_power = daily.character_power,
    ship_power = daily.ship_power,
    gl_count = daily.gl_count,
    gear_13_count = daily.gear_13_count,
    relic_5_plus_count = daily.relic_5_plus_count,
    relic_7_plus_count = daily.relic_7_plus_count,
    relic_9_count = daily.relic_9_count,
    seven_star_ship_count = daily.seven_star_ship_count,
    metrics = coalesce(gs.metrics, '{}'::jsonb) || jsonb_build_object(
      'rosterMetricSource', 'player_snapshots+game_units',
      'powerBreakdownSource', 'member-unit-gp-sum-by-game-catalog',
      'powerBreakdownDelta', gs.galactic_power - (daily.character_power + daily.ship_power)
    )
from daily
where gs.guild_id = daily.guild_id and gs.snapshot_date = daily.snapshot_date;

comment on function private.normalize_player_unit_catalog_combat_type() is
  'Uses the current static game catalog to classify roster units when live Comlink/Stats combat type encoding is absent or unknown.';
comment on function private.derive_player_snapshot_catalog_metrics() is
  'Derives catalog-backed roster counts and fills missing character/ship GP splits from current unit GP without replacing authoritative total player GP.';
