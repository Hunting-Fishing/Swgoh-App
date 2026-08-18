function n(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function abilityId(ability) {
  return String(ability?.id || ability?.abilityId || ability?.name || ability?.type || "").trim();
}

function abilityName(ability) {
  return String(ability?.name || ability?.displayName || ability?.type || abilityId(ability) || "Ability").trim();
}

function abilityTier(ability) {
  return Math.max(0, n(ability?.displayTier || ability?.tier || ability?.level));
}

function abilityTierTotal(unit) {
  return (unit?.abilities || []).reduce((sum, ability) => sum + abilityTier(ability), 0);
}

function abilityMap(unit) {
  return new Map((unit?.abilities || []).map((ability) => [abilityId(ability), ability]).filter(([id]) => id));
}

function abilityGaps(mine, theirs) {
  const mineMap = abilityMap(mine);
  const theirsMap = abilityMap(theirs);
  const ids = new Set([...mineMap.keys(), ...theirsMap.keys()]);
  return [...ids].map((id) => {
    const own = mineMap.get(id) || null;
    const enemy = theirsMap.get(id) || null;
    const ownTier = abilityTier(own);
    const enemyTier = abilityTier(enemy);
    return {
      id,
      name: abilityName(enemy || own),
      mine: ownTier,
      theirs: enemyTier,
      delta: ownTier - enemyTier,
      zetaMine: Boolean(own?.zeta),
      zetaTheirs: Boolean(enemy?.zeta),
      omicronMine: Boolean(own?.omicron),
      omicronTheirs: Boolean(enemy?.omicron),
      omegaMine: Boolean(own?.omega),
      omegaTheirs: Boolean(enemy?.omega),
    };
  }).sort((a, b) => a.delta - b.delta || a.name.localeCompare(b.name));
}

function abilityGapSummary(mine, theirs, limit = 3) {
  const gaps = abilityGaps(mine, theirs).filter((gap) => gap.delta !== 0);
  if (!gaps.length) return "Tier parity";
  const enemyAhead = gaps.filter((gap) => gap.delta < 0);
  const mineAhead = gaps.filter((gap) => gap.delta > 0);
  const focus = enemyAhead.length ? enemyAhead : mineAhead;
  const labels = focus.slice(0, limit).map((gap) => `${gap.name} ${gap.delta > 0 ? "+" : ""}${gap.delta}`);
  const remaining = Math.max(0, focus.length - limit);
  return `${labels.join(" · ")}${remaining ? ` · +${remaining} more` : ""}`;
}

function abilityTierDelta(mine, theirs) {
  return abilityTierTotal(mine) - abilityTierTotal(theirs);
}

// This is deliberately a readiness heuristic, not a claim that a specific
// counter requires a particular zeta/omicron. The live roster tells us which
// ability tiers/upgrades are purchased, but not an authoritative per-counter
// minimum requirement. Tier 8 is used only as a normalization ceiling.
function unitAbilityReadiness(unit) {
  const abilities = Array.isArray(unit?.abilities) ? unit.abilities : [];
  if (!abilities.length) {
    return Object.freeze({
      known: false,
      score: null,
      averageTier: null,
      lowTierAbilities: 0,
      zetas: n(unit?.zetas),
      omegas: n(unit?.omegas),
      omicrons: n(unit?.omicrons),
      abilityCount: 0,
    });
  }

  const tiers = abilities.map(abilityTier);
  const averageTier = tiers.reduce((sum, tier) => sum + tier, 0) / tiers.length;
  const lowTierAbilities = tiers.filter((tier) => tier > 0 && tier < 6).length;
  const normalizedTier = tiers.reduce((sum, tier) => sum + Math.min(8, tier) / 8, 0) / tiers.length;
  const premiumCoverage = abilities.reduce((sum, ability) => {
    return sum + (ability?.zeta ? 1.5 : 0) + (ability?.omicron ? 2 : 0) + (ability?.omega ? 0.35 : 0);
  }, 0);
  const score = Math.max(0, Math.min(100, Math.round(normalizedTier * 88 + Math.min(12, premiumCoverage))));

  return Object.freeze({
    known: true,
    score,
    averageTier: Math.round(averageTier * 10) / 10,
    lowTierAbilities,
    zetas: abilities.filter((ability) => ability?.zeta).length,
    omegas: abilities.filter((ability) => ability?.omega).length,
    omicrons: abilities.filter((ability) => ability?.omicron).length,
    abilityCount: abilities.length,
  });
}

function squadAbilityReadiness(squad) {
  const profiles = (Array.isArray(squad) ? squad : []).map(unitAbilityReadiness);
  const known = profiles.filter((profile) => profile.known);
  if (!known.length) {
    return Object.freeze({
      known: false,
      score: null,
      coverage: 0,
      lowTierAbilities: 0,
      zetas: 0,
      omegas: 0,
      omicrons: 0,
      unitsKnown: 0,
      units: profiles.length,
    });
  }

  const score = known.reduce((sum, profile) => sum + n(profile.score), 0) / known.length;
  return Object.freeze({
    known: true,
    score: Math.round(score),
    coverage: profiles.length ? known.length / profiles.length : 0,
    lowTierAbilities: known.reduce((sum, profile) => sum + profile.lowTierAbilities, 0),
    zetas: known.reduce((sum, profile) => sum + profile.zetas, 0),
    omegas: known.reduce((sum, profile) => sum + profile.omegas, 0),
    omicrons: known.reduce((sum, profile) => sum + profile.omicrons, 0),
    unitsKnown: known.length,
    units: profiles.length,
  });
}

export {
  abilityGapSummary,
  abilityGaps,
  abilityTier,
  abilityTierDelta,
  abilityTierTotal,
  squadAbilityReadiness,
  unitAbilityReadiness,
};
