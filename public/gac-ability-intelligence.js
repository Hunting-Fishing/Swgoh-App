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

export {
  abilityGapSummary,
  abilityGaps,
  abilityTier,
  abilityTierDelta,
  abilityTierTotal,
};