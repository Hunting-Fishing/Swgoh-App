alter table public.player_unit_skill_tiers_current
  add column if not exists effective_tier integer
  generated always as (current_tier + 2) stored;

create or replace function private.normalize_player_skill_tier_evidence()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  new.zeta_applied := case
    when new.classification_source = 'unclassified' then null
    when new.zeta_upgrade_tier is null then false
    else (new.current_tier + 2) >= new.zeta_upgrade_tier
  end;
  new.omicron_applied := case
    when new.classification_source = 'unclassified' then null
    when new.omicron_upgrade_tier is null then false
    else (new.current_tier + 2) >= new.omicron_upgrade_tier
  end;
  new.omega_applied := case
    when new.classification_source = 'unclassified' then null
    when new.omega_upgrade_tier is null then false
    else (new.current_tier + 2) >= new.omega_upgrade_tier
  end;
  new.metadata := coalesce(new.metadata, '{}'::jsonb) || jsonb_build_object(
    'rawTier', new.current_tier,
    'rawTierOffset', 2,
    'effectiveTier', new.current_tier + 2,
    'effectiveTierSource', 'comlink-raw-tier+2'
  );
  return new;
end;
$$;

drop trigger if exists player_skill_tiers_normalize_raw_tier on public.player_unit_skill_tiers_current;
create trigger player_skill_tiers_normalize_raw_tier
before insert or update of current_tier, zeta_upgrade_tier, omicron_upgrade_tier, omega_upgrade_tier, classification_source
on public.player_unit_skill_tiers_current
for each row execute function private.normalize_player_skill_tier_evidence();

-- Re-run the normalizer for evidence already captured before the offset rule was installed.
update public.player_unit_skill_tiers_current
set current_tier = current_tier;

with expected as (
  select
    puc.player_id,
    puc.base_id,
    count(*) filter (where gua.has_zeta)::integer as expected_zeta,
    count(*) filter (where gua.has_omicron)::integer as expected_omicron,
    count(*) filter (where gua.has_omega)::integer as expected_omega
  from public.player_units_current puc
  left join public.game_unit_abilities gua on gua.base_id = puc.base_id
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
)
update public.player_units_current puc
set zeta_count = case
      when observed.observed_zeta = expected.expected_zeta then observed.applied_zeta
      else null end,
    omicron_count = case
      when observed.observed_omicron = expected.expected_omicron then observed.applied_omicron
      else null end,
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
      'verifiedOmegaUpgradeCount', case
        when observed.observed_omega = expected.expected_omega then observed.applied_omega
        else null end,
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

comment on column public.player_unit_skill_tiers_current.current_tier is
  'Raw Comlink game skill tier. Preserve without offset for auditability.';
comment on column public.player_unit_skill_tiers_current.effective_tier is
  'Catalog/stat-calculator ability tier derived as raw Comlink current_tier + 2.';
comment on function private.normalize_player_skill_tier_evidence() is
  'Normalizes raw Comlink skill tiers with the verified +2 offset before comparing against exact game catalog material upgrade tiers.';
