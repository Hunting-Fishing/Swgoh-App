import { eventProgress, requirementProgress } from "./journey-progress.js";
import { RELIC_MATERIALS, gearGap, relicMaterialsBetween } from "./relic-material-guide.js";

const REQUIREMENT_STRENGTH = Object.freeze({ STAR: 1, GEAR: 2, RELIC: 3 });
const MATERIAL_ORDER = ["Credits", "FSD", "ISD", "FLSD", "CSD", "CCB", "BW", "CT", "AH", "EC", "ZC", "ID", "AM", "GK", "DB", "CS"];

function normalizeRequirement(requirement) {
  return {
    baseId: String(requirement?.baseId || ""),
    type: String(requirement?.type || "STAR").toUpperCase(),
    tier: Math.max(0, Number(requirement?.tier || 0)),
  };
}

export function strongerRequirement(left, right) {
  if (!left) return normalizeRequirement(right);
  if (!right) return normalizeRequirement(left);
  const a = normalizeRequirement(left);
  const b = normalizeRequirement(right);
  const aStrength = REQUIREMENT_STRENGTH[a.type] || 0;
  const bStrength = REQUIREMENT_STRENGTH[b.type] || 0;
  if (aStrength !== bStrength) return aStrength > bStrength ? a : b;
  return a.tier >= b.tier ? a : b;
}

function materialRows(totals) {
  return MATERIAL_ORDER
    .filter((id) => Number(totals[id] || 0) > 0)
    .map((id) => ({
      id,
      quantity: Number(totals[id] || 0),
      ...(RELIC_MATERIALS[id] || { name: id, category: "other", source: "Source not mapped", route: "" }),
    }));
}

function targetLabel(requirement) {
  if (requirement.type === "RELIC") return `R${requirement.tier}`;
  if (requirement.type === "GEAR") return `G${requirement.tier}`;
  return `${requirement.tier}★`;
}

function currentLabel(progress) {
  if (Number(progress.relic || 0) > 0) return `${progress.stars}★ · G${progress.gear} · R${progress.relic}`;
  if (Number(progress.gear || 0) > 0) return `${progress.stars}★ · G${progress.gear}`;
  return `${progress.stars}★`;
}

export function buildMasterFarmPlan(events = [], liveUnits = []) {
  const liveMap = liveUnits instanceof Map
    ? liveUnits
    : new Map((Array.isArray(liveUnits) ? liveUnits : []).map((unit) => [String(unit?.baseId || ""), unit]));

  const targetMap = new Map();
  const farmSummaries = [];

  for (const event of Array.isArray(events) ? events : []) {
    const requirements = Array.isArray(event?.requirements) ? event.requirements : [];
    const progress = eventProgress(requirements, liveMap);
    farmSummaries.push({
      id: String(event?.id || ""),
      name: String(event?.shortName || event?.name || event?.id || "Farm"),
      percent: progress.percent,
      complete: progress.complete,
      completeCount: progress.completeCount,
      total: progress.total,
    });

    for (const rawRequirement of requirements) {
      const requirement = normalizeRequirement(rawRequirement);
      if (!requirement.baseId) continue;
      const existing = targetMap.get(requirement.baseId) || {
        baseId: requirement.baseId,
        requirement: null,
        farmIds: new Set(),
        farmNames: new Set(),
      };
      existing.requirement = strongerRequirement(existing.requirement, requirement);
      existing.farmIds.add(String(event?.id || ""));
      existing.farmNames.add(String(event?.shortName || event?.name || event?.id || "Farm"));
      targetMap.set(requirement.baseId, existing);
    }
  }

  const materialTotals = {};
  const targets = [];
  let totalRelicLevelsRemaining = 0;
  let totalGearTiersRemaining = 0;
  let totalStarsRemaining = 0;

  for (const entry of targetMap.values()) {
    const unit = liveMap.get(entry.baseId) || null;
    const requirement = entry.requirement;
    const progress = requirementProgress(unit, requirement);
    const owned = Boolean(unit?.baseId);
    const requiredGear = requirement.type === "RELIC" ? 13 : requirement.type === "GEAR" ? requirement.tier : 0;
    const gearPlan = requiredGear ? gearGap(progress.gear, requiredGear) : gearGap(0, 0);
    const relicPlan = requirement.type === "RELIC"
      ? relicMaterialsBetween(progress.relic, requirement.tier)
      : relicMaterialsBetween(0, 0);
    const starsRemaining = Math.max(0, Number(progress.requiredStars || 0) - Number(progress.stars || 0));

    if (!progress.complete) {
      totalGearTiersRemaining += gearPlan.tiersRemaining;
      totalRelicLevelsRemaining += relicPlan.levelsRemaining;
      totalStarsRemaining += starsRemaining;
      for (const [materialId, quantity] of Object.entries(relicPlan.totals || {})) {
        materialTotals[materialId] = (materialTotals[materialId] || 0) + Number(quantity || 0);
      }
    }

    targets.push({
      baseId: entry.baseId,
      requirement,
      owned,
      unit,
      progress,
      complete: progress.complete,
      currentLabel: currentLabel(progress),
      targetLabel: targetLabel(requirement),
      farmIds: [...entry.farmIds],
      farmNames: [...entry.farmNames],
      impactCount: entry.farmIds.size,
      shared: entry.farmIds.size > 1,
      gearPlan,
      relicPlan,
      starsRemaining,
    });
  }

  const queue = targets
    .filter((target) => !target.complete)
    .sort((a, b) => (
      b.impactCount - a.impactCount
      || Number(b.owned) - Number(a.owned)
      || b.progress.percent - a.progress.percent
      || a.starsRemaining - b.starsRemaining
      || a.baseId.localeCompare(b.baseId)
    ));

  farmSummaries.sort((a, b) => Number(a.complete) - Number(b.complete) || b.percent - a.percent || a.name.localeCompare(b.name));

  return {
    farmCount: farmSummaries.length,
    farmSummaries,
    uniqueTargetCount: targets.length,
    incompleteTargetCount: queue.length,
    sharedTargetCount: targets.filter((target) => target.shared && !target.complete).length,
    completeTargetCount: targets.filter((target) => target.complete).length,
    totalRelicLevelsRemaining,
    totalGearTiersRemaining,
    totalStarsRemaining,
    materialTotals,
    materials: materialRows(materialTotals),
    targets,
    queue,
  };
}
