export function currentGear(unit) {
  return Number(unit?.gear ?? unit?.gearTier ?? unit?.gearLevel ?? unit?.tier ?? 0);
}

export function currentRelic(unit) {
  return Number(unit?.relic ?? unit?.relicTier ?? unit?.relicLevel ?? 0);
}

export function currentStars(unit) {
  return Number(unit?.stars ?? unit?.rarity ?? 0);
}

export function currentLevel(unit) {
  return Number(unit?.level ?? 0);
}

function ratio(current, required) {
  if (!required) return 1;
  return Math.max(0, Math.min(1, Number(current || 0) / Number(required)));
}

export function requirementTargets(requirement) {
  return {
    requiredStars: requirement?.type === "STAR" ? Number(requirement.tier || 0) : 7,
    requiredLevel: requirement?.type === "STAR" ? 0 : 85,
    requiredGear: requirement?.type === "GEAR" ? Number(requirement.tier || 0) : requirement?.type === "RELIC" ? 13 : 0,
    requiredRelic: requirement?.type === "RELIC" ? Number(requirement.tier || 0) : 0,
  };
}

export function requirementProgress(unit, requirement) {
  const targets = requirementTargets(requirement);
  if (!unit?.baseId) {
    return { percent: 0, complete: false, stars: 0, level: 0, gear: 0, relic: 0, ...targets };
  }

  const stars = currentStars(unit);
  const level = currentLevel(unit);
  const gear = currentGear(unit);
  const relic = currentRelic(unit);
  const { requiredStars, requiredLevel, requiredGear, requiredRelic } = targets;
  const components = [ratio(stars, requiredStars)];
  if (requiredLevel) components.push(ratio(level, requiredLevel));
  if (requiredGear) components.push(ratio(gear, requiredGear));
  if (requiredRelic) components.push(ratio(relic, requiredRelic));

  const percent = Math.round((components.reduce((sum, value) => sum + value, 0) / components.length) * 100);
  const complete = stars >= requiredStars
    && (!requiredLevel || level >= requiredLevel)
    && (!requiredGear || gear >= requiredGear)
    && (!requiredRelic || relic >= requiredRelic);

  return { percent, complete, stars, level, gear, relic, ...targets };
}

export function eventProgress(requirements, liveMap) {
  const rows = (requirements || []).map((requirement) => requirementProgress(liveMap?.get?.(requirement.baseId), requirement));
  if (!rows.length) return { percent: 0, complete: false, completeCount: 0, total: 0 };
  const completeCount = rows.filter((row) => row.complete).length;
  return {
    percent: Math.round(rows.reduce((sum, row) => sum + row.percent, 0) / rows.length),
    complete: completeCount === rows.length,
    completeCount,
    total: rows.length,
  };
}
