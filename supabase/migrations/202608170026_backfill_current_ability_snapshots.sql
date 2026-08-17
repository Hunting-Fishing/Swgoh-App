with totals as (
  select player_id,
    case when count(*) filter(where zeta_count is null)=0 then coalesce(sum(zeta_count),0)::integer else null end as zeta_count,
    case when count(*) filter(where omicron_count is null)=0 then coalesce(sum(omicron_count),0)::integer else null end as omicron_count,
    count(*) filter(where ultimate_unlocked is true)::integer as ultimate_count,
    case when count(*) filter(where metadata->>'verifiedOmegaUpgradeCount' is null)=0
      then coalesce(sum((metadata->>'verifiedOmegaUpgradeCount')::integer),0)::integer else null end as omega_upgrade_count
  from public.player_units_current
  group by player_id
)
update public.player_snapshots ps
set zeta_count=totals.zeta_count,
    omicron_count=totals.omicron_count,
    ultimate_count=totals.ultimate_count,
    omega_upgrade_count=totals.omega_upgrade_count,
    metrics=coalesce(ps.metrics,'{}'::jsonb)||jsonb_build_object(
      'abilityTotalsSource','rosterUnit.skill-presence+game_unit_abilities.upgradeTiers',
      'rawSkillTierOffset',2,
      'zetaClassificationComplete',totals.zeta_count is not null,
      'omicronClassificationComplete',totals.omicron_count is not null,
      'omegaClassificationComplete',totals.omega_upgrade_count is not null)
from totals
where ps.player_id=totals.player_id
  and ps.snapshot_date=(now() at time zone 'UTC')::date;

update public.guild_snapshots
set source_sync_run_id=source_sync_run_id
where snapshot_date=(now() at time zone 'UTC')::date;
