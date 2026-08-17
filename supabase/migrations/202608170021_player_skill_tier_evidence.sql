create table if not exists public.player_unit_skill_tiers_current (
  player_id uuid not null,
  base_id text not null,
  skill_id text not null,
  current_tier integer not null default 0 check (current_tier >= 0),
  max_tier integer check (max_tier is null or max_tier >= 0),
  zeta_upgrade_tier integer,
  omicron_upgrade_tier integer,
  omega_upgrade_tier integer,
  zeta_applied boolean,
  omicron_applied boolean,
  omega_applied boolean,
  omicron_mode integer,
  classification_source text not null default 'unclassified',
  classification_version text,
  last_synced_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  primary key (player_id, base_id, skill_id),
  foreign key (player_id, base_id)
    references public.player_units_current(player_id, base_id) on delete cascade
);

create index if not exists player_unit_skill_tiers_player_idx on public.player_unit_skill_tiers_current(player_id);
create index if not exists player_unit_skill_tiers_skill_idx on public.player_unit_skill_tiers_current(skill_id);
create index if not exists player_unit_skill_tiers_zeta_idx on public.player_unit_skill_tiers_current(player_id, base_id) where zeta_applied is true;
create index if not exists player_unit_skill_tiers_omicron_idx on public.player_unit_skill_tiers_current(player_id, base_id) where omicron_applied is true;

alter table public.player_unit_skill_tiers_current enable row level security;
drop policy if exists player_unit_skill_tiers_select_authorized on public.player_unit_skill_tiers_current;
create policy player_unit_skill_tiers_select_authorized on public.player_unit_skill_tiers_current
  for select to authenticated using (private.user_has_player_access(player_id));

create or replace function private.refresh_player_unit_skill_tiers(
  p_player_id uuid,
  p_synced_at timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if p_player_id is null then return; end if;

  delete from public.player_unit_skill_tiers_current where player_id = p_player_id;

  insert into public.player_unit_skill_tiers_current (
    player_id, base_id, skill_id, current_tier, max_tier,
    zeta_upgrade_tier, omicron_upgrade_tier, omega_upgrade_tier,
    zeta_applied, omicron_applied, omega_applied, omicron_mode,
    classification_source, classification_version, last_synced_at, metadata
  )
  select
    puc.player_id,
    puc.base_id,
    skill.skill_id,
    skill.current_tier,
    gua.max_tier,
    tiers.zeta_tier,
    tiers.omicron_tier,
    tiers.omega_tier,
    case when gua.ability_id is null then null when tiers.zeta_tier is null then false else skill.current_tier >= tiers.zeta_tier end,
    case when gua.ability_id is null then null when tiers.omicron_tier is null then false else skill.current_tier >= tiers.omicron_tier end,
    case when gua.ability_id is null then null when tiers.omega_tier is null then false else skill.current_tier >= tiers.omega_tier end,
    gua.omicron_mode,
    case when gua.ability_id is null then 'unclassified' else 'game_unit_abilities.upgradeTiers' end,
    gua.catalog_version,
    coalesce(p_synced_at, puc.last_synced_at, now()),
    jsonb_build_object(
      'source', 'comlink-player-skill-tier',
      'catalogMatched', gua.ability_id is not null,
      'hasZetaUpgrade', coalesce(gua.has_zeta, false),
      'hasOmicronUpgrade', coalesce(gua.has_omicron, false),
      'hasOmegaUpgrade', coalesce(gua.has_omega, false)
    )
  from public.player_units_current puc
  cross join lateral (
    select distinct on (coalesce(nullif(s.value->>'id', ''), nullif(s.value->>'skillId', ''), nullif(s.value->>'abilityId', ''), nullif(s.value->>'definitionId', '')))
      coalesce(nullif(s.value->>'id', ''), nullif(s.value->>'skillId', ''), nullif(s.value->>'abilityId', ''), nullif(s.value->>'definitionId', '')) as skill_id,
      greatest(0, coalesce(
        case when nullif(s.value->>'tier', '') is not null then (s.value->>'tier')::integer end,
        case when nullif(s.value->>'currentTier', '') is not null then (s.value->>'currentTier')::integer end,
        case when nullif(s.value->>'level', '') is not null then (s.value->>'level')::integer end,
        0
      )) as current_tier
    from jsonb_array_elements(case when jsonb_typeof(puc.metadata->'skills') = 'array' then puc.metadata->'skills' else '[]'::jsonb end) s(value)
    where coalesce(nullif(s.value->>'id', ''), nullif(s.value->>'skillId', ''), nullif(s.value->>'abilityId', ''), nullif(s.value->>'definitionId', '')) is not null
    order by coalesce(nullif(s.value->>'id', ''), nullif(s.value->>'skillId', ''), nullif(s.value->>'abilityId', ''), nullif(s.value->>'definitionId', '')), current_tier desc
  ) skill
  left join public.game_unit_abilities gua on gua.base_id = puc.base_id and gua.ability_id = skill.skill_id
  left join lateral (
    select
      min((t.value->>'tier')::integer) filter (where coalesce((t.value->>'zeta')::boolean, false)) as zeta_tier,
      min((t.value->>'tier')::integer) filter (where coalesce((t.value->>'omicron')::boolean, false)) as omicron_tier,
      min((t.value->>'tier')::integer) filter (where coalesce((t.value->>'omega')::boolean, false)) as omega_tier
    from jsonb_array_elements(case when jsonb_typeof(gua.metadata->'upgradeTiers') = 'array' then gua.metadata->'upgradeTiers' else '[]'::jsonb end) t(value)
  ) tiers on true
  where puc.player_id = p_player_id;

  with skill_summary as (
    select
      puc.player_id,
      puc.base_id,
      count(st.*)::integer as evidence_count,
      count(st.*) filter (where st.classification_source <> 'unclassified')::integer as classified_count,
      count(st.*) filter (where st.zeta_applied is true)::integer as zeta_count,
      count(st.*) filter (where st.omicron_applied is true)::integer as omicron_count,
      count(st.*) filter (where st.omega_applied is true)::integer as omega_count
    from public.player_units_current puc
    left join public.player_unit_skill_tiers_current st on st.player_id = puc.player_id and st.base_id = puc.base_id
    where puc.player_id = p_player_id
    group by puc.player_id, puc.base_id
  ), ultimate_summary as (
    select
      puc.player_id,
      puc.base_id,
      exists (
        select 1
        from jsonb_array_elements_text(case when jsonb_typeof(puc.metadata->'purchasedAbilityIds') = 'array' then puc.metadata->'purchasedAbilityIds' else '[]'::jsonb end) p(ability_id)
        where lower(p.ability_id) like 'ultimateability_%'
      ) as ultimate_unlocked
    from public.player_units_current puc
    where puc.player_id = p_player_id
  )
  update public.player_units_current puc
  set zeta_count = case when ss.evidence_count > 0 and ss.classified_count = ss.evidence_count then ss.zeta_count else null end,
      omicron_count = case when ss.evidence_count > 0 and ss.classified_count = ss.evidence_count then ss.omicron_count else null end,
      ultimate_unlocked = us.ultimate_unlocked,
      metadata = coalesce(puc.metadata, '{}'::jsonb) || jsonb_build_object(
        'skillTierEvidenceCount', ss.evidence_count,
        'skillTierClassifiedCount', ss.classified_count,
        'verifiedOmegaUpgradeCount', case when ss.evidence_count > 0 and ss.classified_count = ss.evidence_count then ss.omega_count else null end,
        'abilityClassificationPendingCatalog', not (ss.evidence_count > 0 and ss.classified_count = ss.evidence_count),
        'abilityClassificationSource', 'game_unit_abilities.upgradeTiers'
      )
  from skill_summary ss
  join ultimate_summary us on us.player_id = ss.player_id and us.base_id = ss.base_id
  where puc.player_id = ss.player_id and puc.base_id = ss.base_id;
end;
$$;

create or replace function private.refresh_player_skill_tiers_after_snapshot()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  perform private.refresh_player_unit_skill_tiers(new.player_id, new.captured_at);
  return new;
end;
$$;

drop trigger if exists player_snapshots_refresh_skill_tiers on public.player_snapshots;
create trigger player_snapshots_refresh_skill_tiers
after insert or update of captured_at, source_sync_run_id on public.player_snapshots
for each row execute function private.refresh_player_skill_tiers_after_snapshot();

comment on table public.player_unit_skill_tiers_current is
  'Current raw player skill-tier evidence joined to exact catalog upgrade tiers. Applied zeta/omicron/omega flags are evidence-derived, not max-tier guesses.';
comment on function private.refresh_player_unit_skill_tiers(uuid, timestamptz) is
  'Refreshes one player skill-tier evidence set after roster persistence and updates verified per-unit zeta/omicron counts plus ultimate evidence.';
