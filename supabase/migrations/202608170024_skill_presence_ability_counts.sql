create or replace function private.recalculate_player_unit_ability_totals(p_player_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  with observed as (
    select
      puc.player_id,
      puc.base_id,
      gu.combat_type,
      count(st.*)::integer as evidence_count,
      count(st.*) filter (where st.classification_source = 'unclassified')::integer as unclassified_count,
      count(st.*) filter (where st.zeta_applied is true)::integer as applied_zeta,
      count(st.*) filter (where st.omicron_applied is true)::integer as applied_omicron,
      count(st.*) filter (where st.omega_applied is true)::integer as applied_omega
    from public.player_units_current puc
    left join public.game_units gu on gu.base_id = puc.base_id
    left join public.player_unit_skill_tiers_current st
      on st.player_id = puc.player_id and st.base_id = puc.base_id
    where puc.player_id = p_player_id
    group by puc.player_id, puc.base_id, gu.combat_type
  ), ultimate as (
    select
      puc.player_id,
      puc.base_id,
      exists (
        select 1
        from jsonb_array_elements_text(case when jsonb_typeof(puc.metadata->'purchasedAbilityIds')='array' then puc.metadata->'purchasedAbilityIds' else '[]'::jsonb end) p(ability_id)
        where lower(p.ability_id) like 'ultimateability_%'
      ) as ultimate_unlocked
    from public.player_units_current puc
    where puc.player_id = p_player_id
  )
  update public.player_units_current puc
  set zeta_count = case when observed.combat_type='character' and observed.unclassified_count>0 then null else observed.applied_zeta end,
      omicron_count = case when observed.combat_type='character' and observed.unclassified_count>0 then null else observed.applied_omicron end,
      ultimate_unlocked = ultimate.ultimate_unlocked,
      metadata = coalesce(puc.metadata,'{}'::jsonb) || jsonb_build_object(
        'rawSkillTierOffset',2,
        'skillTierEvidenceCount',observed.evidence_count,
        'unclassifiedRawSkillCount',observed.unclassified_count,
        'missingRosterSkillMeansBaseUnupgraded',true,
        'zetaClassificationComplete',not(observed.combat_type='character' and observed.unclassified_count>0),
        'omicronClassificationComplete',not(observed.combat_type='character' and observed.unclassified_count>0),
        'omegaClassificationComplete',observed.unclassified_count=0,
        'verifiedOmegaUpgradeCount',case when observed.unclassified_count=0 then observed.applied_omega else null end,
        'abilityClassificationPendingCatalog',observed.combat_type='character' and observed.unclassified_count>0,
        'abilityClassificationSource','rosterUnit.skill-presence+game_unit_abilities.upgradeTiers+raw-tier+2'
      )
  from observed join ultimate using(player_id,base_id)
  where puc.player_id=observed.player_id and puc.base_id=observed.base_id;
end;
$$;

-- Current canonical backfill. Missing rosterUnit.skill entries mean the skill is still at its base/unupgraded state.
with observed as (
  select
    puc.player_id,
    puc.base_id,
    gu.combat_type,
    count(st.*)::integer as evidence_count,
    count(st.*) filter (where st.classification_source='unclassified')::integer as unclassified_count,
    count(st.*) filter (where st.zeta_applied is true)::integer as applied_zeta,
    count(st.*) filter (where st.omicron_applied is true)::integer as applied_omicron,
    count(st.*) filter (where st.omega_applied is true)::integer as applied_omega
  from public.player_units_current puc
  left join public.game_units gu on gu.base_id=puc.base_id
  left join public.player_unit_skill_tiers_current st on st.player_id=puc.player_id and st.base_id=puc.base_id
  group by puc.player_id,puc.base_id,gu.combat_type
), ultimate as (
  select puc.player_id,puc.base_id,exists(
    select 1 from jsonb_array_elements_text(case when jsonb_typeof(puc.metadata->'purchasedAbilityIds')='array' then puc.metadata->'purchasedAbilityIds' else '[]'::jsonb end) p(ability_id)
    where lower(p.ability_id) like 'ultimateability_%'
  ) as ultimate_unlocked
  from public.player_units_current puc
)
update public.player_units_current puc
set zeta_count=case when observed.combat_type='character' and observed.unclassified_count>0 then null else observed.applied_zeta end,
    omicron_count=case when observed.combat_type='character' and observed.unclassified_count>0 then null else observed.applied_omicron end,
    ultimate_unlocked=ultimate.ultimate_unlocked,
    metadata=coalesce(puc.metadata,'{}'::jsonb)||jsonb_build_object(
      'rawSkillTierOffset',2,
      'skillTierEvidenceCount',observed.evidence_count,
      'unclassifiedRawSkillCount',observed.unclassified_count,
      'missingRosterSkillMeansBaseUnupgraded',true,
      'zetaClassificationComplete',not(observed.combat_type='character' and observed.unclassified_count>0),
      'omicronClassificationComplete',not(observed.combat_type='character' and observed.unclassified_count>0),
      'omegaClassificationComplete',observed.unclassified_count=0,
      'verifiedOmegaUpgradeCount',case when observed.unclassified_count=0 then observed.applied_omega else null end,
      'abilityClassificationPendingCatalog',observed.combat_type='character' and observed.unclassified_count>0,
      'abilityClassificationSource','rosterUnit.skill-presence+game_unit_abilities.upgradeTiers+raw-tier+2'
    )
from observed join ultimate using(player_id,base_id)
where puc.player_id=observed.player_id and puc.base_id=observed.base_id;

comment on function private.recalculate_player_unit_ability_totals(uuid) is
  'Applied material counts use upgraded skills present in rosterUnit.skill. Missing skills are base/unupgraded; present unclassified character skills remain uncertain.';
