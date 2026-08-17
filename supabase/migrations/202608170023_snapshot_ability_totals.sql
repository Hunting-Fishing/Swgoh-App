alter table public.player_snapshots
  add column if not exists zeta_count integer,
  add column if not exists omicron_count integer,
  add column if not exists ultimate_count integer,
  add column if not exists omega_upgrade_count integer;

alter table public.guild_snapshots
  add column if not exists zeta_count integer,
  add column if not exists omicron_count integer,
  add column if not exists ultimate_count integer,
  add column if not exists omega_upgrade_count integer;

create or replace function private.recalculate_player_unit_ability_totals(p_player_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  with expected as (
    select
      puc.player_id,
      puc.base_id,
      count(*) filter (where gua.has_zeta)::integer as expected_zeta,
      count(*) filter (where gua.has_omicron)::integer as expected_omicron,
      count(*) filter (where gua.has_omega)::integer as expected_omega
    from public.player_units_current puc
    left join public.game_unit_abilities gua on gua.base_id = puc.base_id
    where puc.player_id = p_player_id
    group by puc.player_id, puc.base_id
  ), observed as (
    select
      puc.player_id,
      puc.base_id,
      count(st.*)::integer as evidence_count,
      count(st.*) filter (where st.classification_source <> 'unclassified')::integer as classified_count,
      count(st.*) filter (where gua.has_zeta)::integer as observed_zeta,
      count(st.*) filter (where gua.has_omicron)::integer as observed_omicron,
      count(st.*) filter (where gua.has_omega)::integer as observed_omega,
      count(st.*) filter (where st.zeta_applied is true)::integer as applied_zeta,
      count(st.*) filter (where st.omicron_applied is true)::integer as applied_omicron,
      count(st.*) filter (where st.omega_applied is true)::integer as applied_omega
    from public.player_units_current puc
    left join public.player_unit_skill_tiers_current st
      on st.player_id = puc.player_id and st.base_id = puc.base_id
    left join public.game_unit_abilities gua
      on gua.base_id = st.base_id and gua.ability_id = st.skill_id
    where puc.player_id = p_player_id
    group by puc.player_id, puc.base_id
  ), ultimate as (
    select
      puc.player_id,
      puc.base_id,
      exists (
        select 1
        from jsonb_array_elements_text(
          case when jsonb_typeof(puc.metadata->'purchasedAbilityIds') = 'array'
            then puc.metadata->'purchasedAbilityIds' else '[]'::jsonb end
        ) p(ability_id)
        where lower(p.ability_id) like 'ultimateability_%'
      ) as ultimate_unlocked
    from public.player_units_current puc
    where puc.player_id = p_player_id
  )
  update public.player_units_current puc
  set zeta_count = case when observed.observed_zeta = expected.expected_zeta then observed.applied_zeta else null end,
      omicron_count = case when observed.observed_omicron = expected.expected_omicron then observed.applied_omicron else null end,
      ultimate_unlocked = ultimate.ultimate_unlocked,
      metadata = coalesce(puc.metadata, '{}'::jsonb) || jsonb_build_object(
        'rawSkillTierOffset', 2,
        'skillTierEvidenceCount', observed.evidence_count,
        'skillTierClassifiedCount', observed.classified_count,
        'skillTierCatalogCoverageComplete', observed.evidence_count = observed.classified_count,
        'expectedZetaAbilities', expected.expected_zeta,
        'observedZetaAbilities', observed.observed_zeta,
        'zetaClassificationComplete', observed.observed_zeta = expected.expected_zeta,
        'expectedOmicronAbilities', expected.expected_omicron,
        'observedOmicronAbilities', observed.observed_omicron,
        'omicronClassificationComplete', observed.observed_omicron = expected.expected_omicron,
        'expectedOmegaAbilities', expected.expected_omega,
        'observedOmegaAbilities', observed.observed_omega,
        'omegaClassificationComplete', observed.observed_omega = expected.expected_omega,
        'verifiedOmegaUpgradeCount', case when observed.observed_omega = expected.expected_omega then observed.applied_omega else null end,
        'abilityClassificationPendingCatalog', not (
          observed.observed_zeta = expected.expected_zeta
          and observed.observed_omicron = expected.expected_omicron
        ),
        'abilityClassificationSource', 'game_unit_abilities.upgradeTiers+comlink-raw-tier+2'
      )
  from expected
  join observed using (player_id, base_id)
  join ultimate using (player_id, base_id)
  where puc.player_id = expected.player_id and puc.base_id = expected.base_id;
end;
$$;

create or replace function private.refresh_player_skill_tiers_after_snapshot()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_zeta integer;
  v_omicron integer;
  v_ultimate integer;
  v_omega integer;
  v_zeta_unknown integer;
  v_omicron_unknown integer;
  v_omega_unknown integer;
begin
  perform private.refresh_player_unit_skill_tiers(new.player_id, new.captured_at);
  perform private.recalculate_player_unit_ability_totals(new.player_id);

  select
    coalesce(sum(zeta_count), 0)::integer,
    coalesce(sum(omicron_count), 0)::integer,
    count(*) filter (where ultimate_unlocked is true)::integer,
    coalesce(sum(case when nullif(metadata->>'verifiedOmegaUpgradeCount', '') is not null then (metadata->>'verifiedOmegaUpgradeCount')::integer else 0 end), 0)::integer,
    count(*) filter (where zeta_count is null)::integer,
    count(*) filter (where omicron_count is null)::integer,
    count(*) filter (where metadata->>'verifiedOmegaUpgradeCount' is null)::integer
  into v_zeta, v_omicron, v_ultimate, v_omega, v_zeta_unknown, v_omicron_unknown, v_omega_unknown
  from public.player_units_current
  where player_id = new.player_id;

  update public.player_snapshots
  set zeta_count = case when v_zeta_unknown = 0 then v_zeta else null end,
      omicron_count = case when v_omicron_unknown = 0 then v_omicron else null end,
      ultimate_count = v_ultimate,
      omega_upgrade_count = case when v_omega_unknown = 0 then v_omega else null end,
      metrics = coalesce(metrics, '{}'::jsonb) || jsonb_build_object(
        'abilityTotalsSource', 'player_unit_skill_tiers_current+game_unit_abilities.upgradeTiers',
        'rawSkillTierOffset', 2,
        'zetaClassificationComplete', v_zeta_unknown = 0,
        'omicronClassificationComplete', v_omicron_unknown = 0,
        'omegaClassificationComplete', v_omega_unknown = 0
      )
  where id = new.id;

  return new;
end;
$$;

create or replace function private.derive_guild_snapshot_ability_totals()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_date date := (new.captured_at at time zone 'UTC')::date;
  v_players integer;
  v_zeta_unknown integer;
  v_omicron_unknown integer;
  v_ultimate_unknown integer;
  v_omega_unknown integer;
begin
  select
    count(*)::integer,
    count(*) filter (where zeta_count is null)::integer,
    count(*) filter (where omicron_count is null)::integer,
    count(*) filter (where ultimate_count is null)::integer,
    count(*) filter (where omega_upgrade_count is null)::integer,
    coalesce(sum(zeta_count), 0)::integer,
    coalesce(sum(omicron_count), 0)::integer,
    coalesce(sum(ultimate_count), 0)::integer,
    coalesce(sum(omega_upgrade_count), 0)::integer
  into
    v_players, v_zeta_unknown, v_omicron_unknown, v_ultimate_unknown, v_omega_unknown,
    new.zeta_count, new.omicron_count, new.ultimate_count, new.omega_upgrade_count
  from public.player_snapshots
  where guild_id = new.guild_id and snapshot_date = v_date;

  if v_players = 0 or v_zeta_unknown > 0 then new.zeta_count := null; end if;
  if v_players = 0 or v_omicron_unknown > 0 then new.omicron_count := null; end if;
  if v_players = 0 or v_ultimate_unknown > 0 then new.ultimate_count := null; end if;
  if v_players = 0 or v_omega_unknown > 0 then new.omega_upgrade_count := null; end if;

  new.metrics := coalesce(new.metrics, '{}'::jsonb) || jsonb_build_object(
    'abilityTotalsSource', 'player_snapshots',
    'abilitySnapshotPlayers', v_players,
    'rawSkillTierOffset', 2,
    'zetaClassificationComplete', v_players > 0 and v_zeta_unknown = 0,
    'omicronClassificationComplete', v_players > 0 and v_omicron_unknown = 0,
    'omegaClassificationComplete', v_players > 0 and v_omega_unknown = 0
  );
  return new;
end;
$$;

drop trigger if exists guild_snapshots_derive_ability_totals on public.guild_snapshots;
create trigger guild_snapshots_derive_ability_totals
before insert or update of captured_at, source_sync_run_id
on public.guild_snapshots
for each row execute function private.derive_guild_snapshot_ability_totals();

-- Backfill the current daily snapshots from canonical unit state.
with player_totals as (
  select
    puc.player_id,
    case when count(*) filter (where puc.zeta_count is null) = 0 then coalesce(sum(puc.zeta_count), 0)::integer else null end as zeta_count,
    case when count(*) filter (where puc.omicron_count is null) = 0 then coalesce(sum(puc.omicron_count), 0)::integer else null end as omicron_count,
    count(*) filter (where puc.ultimate_unlocked is true)::integer as ultimate_count,
    case
      when count(*) filter (where puc.metadata->>'verifiedOmegaUpgradeCount' is null) = 0
      then coalesce(sum((puc.metadata->>'verifiedOmegaUpgradeCount')::integer), 0)::integer
      else null
    end as omega_upgrade_count
  from public.player_units_current puc
  group by puc.player_id
)
update public.player_snapshots ps
set zeta_count = pt.zeta_count,
    omicron_count = pt.omicron_count,
    ultimate_count = pt.ultimate_count,
    omega_upgrade_count = pt.omega_upgrade_count,
    metrics = coalesce(ps.metrics, '{}'::jsonb) || jsonb_build_object(
      'abilityTotalsSource', 'player_unit_skill_tiers_current+game_unit_abilities.upgradeTiers',
      'rawSkillTierOffset', 2,
      'zetaClassificationComplete', pt.zeta_count is not null,
      'omicronClassificationComplete', pt.omicron_count is not null,
      'omegaClassificationComplete', pt.omega_upgrade_count is not null
    )
from player_totals pt
where ps.player_id = pt.player_id
  and ps.snapshot_date = (now() at time zone 'UTC')::date;

-- Fire the Guild ability aggregate trigger for the current daily snapshot.
update public.guild_snapshots
set source_sync_run_id = source_sync_run_id
where snapshot_date = (now() at time zone 'UTC')::date;

comment on column public.player_snapshots.zeta_count is 'Verified applied zeta count from raw player skill tiers joined to exact catalog upgrade tiers.';
comment on column public.player_snapshots.omicron_count is 'Verified applied omicron count from raw player skill tiers joined to exact catalog upgrade tiers.';
comment on column public.player_snapshots.ultimate_count is 'Count of current units with explicit purchased Galactic Legend ultimate evidence.';
comment on column public.player_snapshots.omega_upgrade_count is 'Verified catalog omega-tier upgrades when catalog coverage is complete; NULL when incomplete.';
