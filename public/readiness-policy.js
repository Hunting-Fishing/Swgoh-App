function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function ratio(value, maximum) {
  const max = number(maximum);
  if (max <= 0) return null;
  return Math.max(0, Math.min(1, number(value) / max));
}

function average(values) {
  const usable = values.filter((value) => Number.isFinite(value));
  if (!usable.length) return null;
  return usable.reduce((sum, value) => sum + value, 0) / usable.length;
}

function abilityCompletion(unit = {}) {
  const abilities = Array.isArray(unit.abilities) ? unit.abilities : [];
  const tracks = abilities
    .map((ability) => ratio(ability?.tier ?? ability?.displayTier, ability?.maxTier))
    .filter((value) => value !== null);
  return average(tracks);
}

function intrinsicUpgradeScore(unit = {}) {
  const maxRarity = number(unit.maxRarity) || 7;
  const maxLevel = number(unit.maxLevel) || 85;
  const stars = ratio(unit.stars, maxRarity);
  const level = ratio(unit.level, maxLevel);
  const abilities = abilityCompletion(unit);

  if (unit.unitType === "Ship") {
    // Ship completion is intrinsic to the ship. Pilot/crew development, speed
    // and fleet strategy are separate analyses and cannot lower a maxed ship.
    const score = average([stars, level, abilities]);
    return {
      score: score === null ? 0 : Math.round(score * 100),
      tracks: { stars, level, abilities },
      crewless: !Array.isArray(unit.crew) || unit.crew.length === 0,
    };
  }

  const gear = number(unit.gear);
  const relic = number(unit.relic);
  const maxRelic = Math.max(1, number(unit.maxRelic) || 9);
  const gearRelic = gear < 13
    ? Math.max(0, Math.min(1, gear / 13)) * 0.5
    : 0.5 + Math.max(0, Math.min(1, relic / maxRelic)) * 0.5;
  const score = average([stars, level, gearRelic, abilities]);

  return {
    score: score === null ? 0 : Math.round(score * 100),
    tracks: { stars, level, gearRelic, abilities },
    crewless: false,
  };
}

export function readinessBand(unit = {}) {
  const { score } = intrinsicUpgradeScore(unit);
  if (score >= 100) return "MAXED";
  if (score >= 85) return "UPGRADE";
  if (score >= 60) return "UPGRADE";
  return "INCOMPLETE";
}

export function requirementGaps(unit = {}) {
  const gaps = [];
  const maxRarity = number(unit.maxRarity) || 7;
  const maxLevel = number(unit.maxLevel) || 85;
  const stars = number(unit.stars);
  const level = number(unit.level);
  const gear = number(unit.gear);
  const relic = number(unit.relic);
  const type = unit.unitType || "Character";

  if (stars < maxRarity) {
    const remaining = Math.max(0, maxRarity - stars);
    gaps.push({ key: "stars", label: `${remaining} more star${remaining === 1 ? "" : "s"}`, severity: "high" });
  }
  if (level < maxLevel) {
    gaps.push({ key: "level", label: `${maxLevel - level} levels to ${maxLevel}`, severity: level < 80 ? "high" : "medium" });
  }

  const abilities = Array.isArray(unit.abilities) ? unit.abilities : [];
  const incompleteAbilities = abilities.filter((ability) => {
    const maxTier = number(ability?.maxTier);
    return maxTier > 0 && number(ability?.tier ?? ability?.displayTier) < maxTier;
  });
  if (incompleteAbilities.length) {
    gaps.push({
      key: "abilities",
      label: `${incompleteAbilities.length} abilit${incompleteAbilities.length === 1 ? "y" : "ies"} below maximum`,
      severity: "high",
    });
  }

  if (type === "Character") {
    if (gear < 13 && relic <= 0) {
      gaps.push({ key: "gear", label: `Gear ${Math.max(1, gear)} → Gear 13`, severity: gear < 12 ? "high" : "medium" });
    } else {
      const maxRelic = Math.max(1, number(unit.maxRelic) || 9);
      if (relic < maxRelic) {
        gaps.push({ key: "relic", label: `Relic ${relic} → R${maxRelic}`, severity: "medium" });
      }
    }
  }

  return gaps;
}

export function readinessAnalysis(unit = {}) {
  const intrinsic = intrinsicUpgradeScore(unit);
  const gaps = requirementGaps(unit);

  // Compatibility with the current card renderer: replace the gateway's old
  // speed/power readiness heuristic with intrinsic upgrade completion.
  unit.readiness = intrinsic.score;

  return {
    band: readinessBand(unit),
    score: intrinsic.score,
    tracks: intrinsic.tracks,
    crewless: intrinsic.crewless,
    gaps,
    gapCount: gaps.length,
    criticalGapCount: gaps.filter((gap) => gap.severity === "high").length,
  };
}

export { abilityCompletion, intrinsicUpgradeScore };
