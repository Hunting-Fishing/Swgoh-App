create or replace function private.derive_guild_snapshot_ability_totals()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,private
as $$
declare
  v_date date:=(new.captured_at at time zone 'UTC')::date;
  v_players integer;
  v_zeta_unknown integer;
  v_omicron_unknown integer;
  v_ultimate_unknown integer;
  v_omega_unknown integer;
begin
  select count(*)::integer,
    count(*) filter(where zeta_count is null)::integer,
    count(*) filter(where omicron_count is null)::integer,
    count(*) filter(where ultimate_count is null)::integer,
    count(*) filter(where omega_upgrade_count is null)::integer,
    coalesce(sum(character_power),0)::bigint,
    coalesce(sum(ship_power),0)::bigint,
    coalesce(sum(gl_count),0)::integer,
    coalesce(sum(gear_13_count),0)::integer,
    coalesce(sum(relic_5_plus_count),0)::integer,
    coalesce(sum(relic_7_plus_count),0)::integer,
    coalesce(sum(relic_9_count),0)::integer,
    coalesce(sum(seven_star_ship_count),0)::integer,
    coalesce(sum(zeta_count),0)::integer,
    coalesce(sum(omicron_count),0)::integer,
    coalesce(sum(ultimate_count),0)::integer,
    coalesce(sum(omega_upgrade_count),0)::integer
  into v_players,v_zeta_unknown,v_omicron_unknown,v_ultimate_unknown,v_omega_unknown,
    new.character_power,new.ship_power,new.gl_count,new.gear_13_count,
    new.relic_5_plus_count,new.relic_7_plus_count,new.relic_9_count,
    new.seven_star_ship_count,new.zeta_count,new.omicron_count,
    new.ultimate_count,new.omega_upgrade_count
  from public.player_snapshots
  where guild_id=new.guild_id and snapshot_date=v_date;

  if v_players=0 or v_zeta_unknown>0 then new.zeta_count:=null; end if;
  if v_players=0 or v_omicron_unknown>0 then new.omicron_count:=null; end if;
  if v_players=0 or v_ultimate_unknown>0 then new.ultimate_count:=null; end if;
  if v_players=0 or v_omega_unknown>0 then new.omega_upgrade_count:=null; end if;

  new.metrics:=coalesce(new.metrics,'{}'::jsonb)||jsonb_build_object(
    'rosterMetricSource','player_snapshots','abilityTotalsSource','player_snapshots',
    'abilitySnapshotPlayers',v_players,'rawSkillTierOffset',2,
    'powerBreakdownSource','player_snapshots',
    'powerBreakdownDelta',coalesce(new.galactic_power,0)-(coalesce(new.character_power,0)+coalesce(new.ship_power,0)),
    'zetaClassificationComplete',v_players>0 and v_zeta_unknown=0,
    'omicronClassificationComplete',v_players>0 and v_omicron_unknown=0,
    'omegaClassificationComplete',v_players>0 and v_omega_unknown=0
  );
  return new;
end;
$$;

create or replace function private.sync_guild_current_from_snapshot()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,private
as $$
begin
  update public.guilds
  set character_power=new.character_power,
      ship_power=new.ship_power,
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'powerBreakdownSource','guild_snapshot.player_snapshots',
        'powerBreakdownDelta',coalesce(new.galactic_power,0)-(coalesce(new.character_power,0)+coalesce(new.ship_power,0)))
  where id=new.guild_id;
  return new;
end;
$$;

drop trigger if exists guild_snapshots_sync_guild_current on public.guild_snapshots;
create trigger guild_snapshots_sync_guild_current
after insert or update of captured_at,source_sync_run_id,character_power,ship_power
on public.guild_snapshots
for each row execute function private.sync_guild_current_from_snapshot();

comment on function private.derive_guild_snapshot_ability_totals() is
  'Derives Guild power, progression and ability totals from canonical daily player snapshots.';
