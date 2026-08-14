function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function readinessBand(unit = {}) {
  const score = number(unit.readiness);
  if (score >= 85) return "Ready";
  if (score >= 65) return "Developing";
  return "Needs Work";
}

export function requirementGaps(unit = {}) {
  const gaps = [];
  const stars = number(unit.stars);
  const level = number(unit.level);
  const gear = number(unit.gear);
  const relic = number(unit.relic);
  const speed = number(unit.speed);
  const type = unit.unitType || "Character";

  if (stars < 7) gaps.push({ key: "stars", label: `${7 - stars} more star${7 - stars === 1 ? "" : "s"}`, severity: "high" });
  if (level < 85) gaps.push({ key: "level", label: `${85 - level} levels to 85`, severity: level < 80 ? "high" : "medium" });

  if (type === "Character") {
    if (gear < 13 && relic <= 0) gaps.push({ key: "gear", label: `Gear ${Math.max(1, gear)} → Gear 13`, severity: gear < 12 ? "high" : "medium" });
    if (gear >= 13 && relic < 3) gaps.push({ key: "relic", label: `Relic ${relic} → R3 baseline`, severity: "medium" });
    if (level >= 85 && speed > 0 && speed < 200) gaps.push({ key: "speed", label: "Speed below 200; review mods", severity: "low" });
  }

  if (number(unit.equippedMods) < 6 && type === "Character" && level >= 50) {
    gaps.push({ key: "mods", label: `${6 - number(unit.equippedMods)} mod slot${6 - number(unit.equippedMods) === 1 ? "" : "s"} open`, severity: "medium" });
  }

  return gaps;
}

export function readinessAnalysis(unit = {}) {
  const gaps = requirementGaps(unit);
  return {
    band: readinessBand(unit),
    score: Math.max(0, Math.min(100, Math.round(number(unit.readiness)))),
    gaps,
    gapCount: gaps.length,
    criticalGapCount: gaps.filter((gap) => gap.severity === "high").length,
  };
}
