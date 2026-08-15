function integer(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.trunc(numeric) : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function tierNumber(value) {
  return clamp(integer(value, 0), 0, 13);
}

export function gearRelicPlan(liveUnit = {}, staticUnit = {}, target = {}) {
  const unitType = String(staticUnit?.unitType || liveUnit?.unitType || "Character");
  if (unitType === "Ship") {
    return {
      supported: false,
      reason: "Ships do not use character gear/relic progression.",
      currentGear: 0,
      currentRelic: 0,
      targetGear: 0,
      targetRelic: 0,
      gearTiersRemaining: 0,
      relicLevelsRemaining: 0,
      tierRows: [],
      knownFuturePieces: 0,
      complete: true,
    };
  }

  const currentGear = clamp(integer(liveUnit?.gear ?? liveUnit?.gearTier ?? liveUnit?.gearLevel ?? liveUnit?.tier, 1), 1, 13);
  const currentRelic = clamp(integer(liveUnit?.relic ?? liveUnit?.relicTier ?? liveUnit?.relicLevel, 0), 0, 15);
  const requestedRelic = clamp(integer(target?.relic, 0), 0, 15);
  const requestedGear = clamp(integer(target?.gear, 13), 1, 13);
  const targetGear = requestedRelic > 0 ? 13 : requestedGear;
  const targetRelic = requestedRelic;

  const tierRows = asArray(staticUnit?.gearTiers)
    .map((tier) => ({
      tier: tierNumber(tier?.tier),
      equipment: asArray(tier?.equipment).map(String).filter(Boolean),
    }))
    .filter((tier) => tier.tier >= currentGear && tier.tier < targetGear)
    .sort((a, b) => a.tier - b.tier)
    .map((tier) => ({
      ...tier,
      currentTier: tier.tier === currentGear,
      pieceCount: tier.equipment.length,
      exactPieceCount: tier.tier !== currentGear,
    }));

  const knownFuturePieces = tierRows
    .filter((tier) => !tier.currentTier)
    .reduce((sum, tier) => sum + tier.pieceCount, 0);

  const gearTiersRemaining = Math.max(0, targetGear - currentGear);
  const relicLevelsRemaining = Math.max(0, targetRelic - currentRelic);
  const complete = currentGear >= targetGear && currentRelic >= targetRelic;

  return {
    supported: true,
    currentGear,
    currentRelic,
    targetGear,
    targetRelic,
    gearTiersRemaining,
    relicLevelsRemaining,
    tierRows,
    knownFuturePieces,
    currentTierSlotsKnown: false,
    relicLockedByGear: targetRelic > 0 && currentGear < 13,
    complete,
  };
}

export function gearRelicStatus(plan = {}) {
  if (plan.supported === false) return plan.reason || "Unsupported unit type";
  if (plan.complete) return "Target complete";
  const parts = [];
  if (Number(plan.gearTiersRemaining) > 0) parts.push(`${plan.gearTiersRemaining} gear tier${plan.gearTiersRemaining === 1 ? "" : "s"}`);
  if (Number(plan.relicLevelsRemaining) > 0) parts.push(`${plan.relicLevelsRemaining} relic level${plan.relicLevelsRemaining === 1 ? "" : "s"}`);
  return parts.length ? `${parts.join(" + ")} remaining` : "Target complete";
}
