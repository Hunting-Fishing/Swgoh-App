function nonNegative(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function appliedTierCount(staticAbility, displayTier, kind) {
  return (staticAbility?.upgradeTiers || [])
    .filter((tier) => Number(tier?.tier || 0) <= displayTier)
    .filter((tier) => tier?.[kind] === true)
    .length;
}

export function mergeAbilityProgression(staticAbility = {}, liveAbility = {}) {
  const rawTier = Number(liveAbility?.tier);
  const hasLiveTier = Number.isFinite(rawTier);
  const liveDisplayTier = Number(liveAbility?.displayTier);
  const displayTier = Number.isFinite(liveDisplayTier) && liveDisplayTier > 0
    ? liveDisplayTier
    : hasLiveTier
      ? rawTier + 2
      : 1;

  const staticZetas = appliedTierCount(staticAbility, displayTier, "zeta");
  const staticOmegas = appliedTierCount(staticAbility, displayTier, "omega");
  const staticOmicrons = appliedTierCount(staticAbility, displayTier, "omicron");

  // The live gateway has already interpreted the current player's skill tier.
  // A positive live flag must never be erased just because a static recipe
  // classifier is temporarily stale or a CG recipe shape changes again.
  const liveZetas = liveAbility?.zeta === true || liveAbility?.hasZeta === true ? 1 : 0;
  const liveOmegas = liveAbility?.omega === true || liveAbility?.hasOmega === true ? 1 : 0;
  const liveOmicrons = liveAbility?.omicron === true || liveAbility?.hasOmicron === true ? 1 : 0;

  const zetaCount = Math.max(staticZetas, liveZetas);
  const omegaCount = Math.max(staticOmegas, liveOmegas);
  const omicronCount = Math.max(staticOmicrons, liveOmicrons);

  return {
    ...staticAbility,
    ...liveAbility,
    id: staticAbility?.id || liveAbility?.id || "",
    name: liveAbility?.name || staticAbility?.name || "Ability",
    note: liveAbility?.note || staticAbility?.description || "",
    description: staticAbility?.description || liveAbility?.note || "",
    tier: displayTier,
    rawTier: hasLiveTier ? rawTier : null,
    zetaCount,
    omegaCount,
    omicronCount,
    hasZeta: zetaCount > 0,
    hasOmega: omegaCount > 0,
    hasOmicron: omicronCount > 0,
  };
}

export function progressionCounts(liveUnit = {}, mergedAbilities = []) {
  const derived = mergedAbilities.reduce((counts, ability) => {
    counts.zetas += nonNegative(ability?.zetaCount);
    counts.omegas += nonNegative(ability?.omegaCount);
    counts.omicrons += nonNegative(ability?.omicronCount);
    return counts;
  }, { zetas: 0, omegas: 0, omicrons: 0 });

  return {
    zetas: Math.max(nonNegative(liveUnit?.zetas), derived.zetas),
    omegas: Math.max(nonNegative(liveUnit?.omegas), derived.omegas),
    omicrons: Math.max(nonNegative(liveUnit?.omicrons), derived.omicrons),
  };
}
