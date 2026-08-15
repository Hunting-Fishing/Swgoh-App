import { mergeAbilityProgression } from "./progression-policy.js";
import { recommendationRosterFit } from "./tb-mission-intelligence.js";
import { analyzeMissionMechanicCoverage } from "./mission-mechanic-intelligence.js";
import { teamInteractionProfileFromCatalog } from "./interaction-graph.js";
import { evaluateBattleStrategy } from "./tb-battle-strategy.js";

export const TB_OMICRON_MODES = Object.freeze({
  STRIKE: 5,
  COVERT: 6,
  BOTH: 7,
});

let catalogPromise = null;
let enemyKnowledgePromise = null;

export async function loadCombatCatalog() {
  if (window.__swgohStaticCatalog?.units?.length) return window.__swgohStaticCatalog;
  catalogPromise ||= fetch("/data/catalog.json", { cache: "force-cache" })
    .then(async (response) => {
      if (!response.ok) throw new Error(`Static catalog returned HTTP ${response.status}`);
      const body = await response.json();
      if (!Array.isArray(body?.units)) throw new Error("Static catalog has no unit list");
      window.__swgohStaticCatalog = body;
      return body;
    })
    .catch((error) => {
      catalogPromise = null;
      throw error;
    });
  return catalogPromise;
}

async function optionalJson(path) {
  try {
    const response = await fetch(path, { cache: "force-cache" });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

export async function loadCombatKnowledge({ needEnemy = false } = {}) {
  if (!needEnemy) return { enemyKit: null };
  if (window.__swgohEnemyKitKnowledge) return { enemyKit: window.__swgohEnemyKitKnowledge };
  enemyKnowledgePromise ||= optionalJson("/data/enemy-kit-index.json").then((enemyKit) => {
    window.__swgohEnemyKitKnowledge = enemyKit;
    return enemyKit;
  });
  return { enemyKit: await enemyKnowledgePromise };
}

export function catalogUnitMap(catalog) {
  return new Map((catalog?.units || []).map((unit) => [String(unit.baseId || ""), unit]));
}

export function omicronModeLabel(mode) {
  const value = Number(mode || 0);
  if (value === TB_OMICRON_MODES.STRIKE) return "TB Combat Mission";
  if (value === TB_OMICRON_MODES.COVERT) return "TB Special Mission";
  if (value === TB_OMICRON_MODES.BOTH) return "All Territory Battles";
  return "Other game mode";
}

export function omicronActiveForMission(mode, missionType) {
  const value = Number(mode || 0);
  const type = String(missionType || "combat").toLowerCase();
  if (value === TB_OMICRON_MODES.BOTH) return type === "combat" || type === "special";
  if (type === "special") return value === TB_OMICRON_MODES.COVERT;
  if (type === "combat") return value === TB_OMICRON_MODES.STRIKE;
  return false;
}

function mergedAbilities(liveUnit, staticUnit) {
  const liveAbilities = Array.isArray(liveUnit?.abilities) ? liveUnit.abilities : [];
  const staticAbilities = Array.isArray(staticUnit?.abilities) ? staticUnit.abilities : [];
  const liveById = new Map(liveAbilities.filter((ability) => ability?.id).map((ability) => [String(ability.id), ability]));
  return staticAbilities.map((ability, index) => mergeAbilityProgression(
    ability,
    liveById.get(String(ability.id || "")) || liveAbilities[index] || {}
  ));
}

function targetGap(unit, target = {}) {
  if (!unit) return { owned: false, gear: null, relic: null, speed: null, ready: false };
  const isShip = String(unit.unitType || "Character") === "Ship";
  const gearTarget = Number.isFinite(Number(target?.gear)) ? Number(target.gear) : null;
  const relicTarget = Number.isFinite(Number(target?.relic)) ? Number(target.relic) : null;
  const speedTarget = Number.isFinite(Number(target?.speed)) ? Number(target.speed) : null;
  const gear = gearTarget == null || isShip ? 0 : Math.max(0, gearTarget - Number(unit.gear || 0));
  const relic = relicTarget == null || isShip ? 0 : Math.max(0, relicTarget - Number(unit.relic || 0));
  const speed = speedTarget == null || isShip ? 0 : Math.max(0, speedTarget - Number(unit.speed || 0));
  const hasAnyTarget = gearTarget != null || relicTarget != null || speedTarget != null;
  return { owned: true, gear, relic, speed, ready: hasAnyTarget ? gear === 0 && relic === 0 && speed === 0 : null };
}

function normalizeGuidanceItem(item, fallbackPriority = "HELPFUL") {
  if (typeof item === "string") return { name: item, priority: fallbackPriority, notes: "" };
  return {
    name: String(item?.name || item?.ability || item?.id || "Guidance"),
    priority: String(item?.priority || fallbackPriority).toUpperCase(),
    notes: String(item?.notes || ""),
  };
}

export function analyzeTeamCombatPreparation(body, mission, recommendation, catalog, knowledge = {}) {
  const fit = recommendationRosterFit(body || {}, mission, recommendation || {});
  const staticById = catalogUnitMap(catalog);
  const members = fit.rows.map((row) => {
    const staticUnit = staticById.get(String(row.unit?.baseId || row.baseId || "")) || null;
    const abilities = row.unit && staticUnit ? mergedAbilities(row.unit, staticUnit) : [];
    const zetas = abilities.filter((ability) => ability?.zeta === true);
    const omicrons = abilities.filter((ability) => ability?.omicron === true).map((ability) => ({
      id: String(ability.id || ""),
      name: String(ability.name || "Omicron ability"),
      mode: Number(ability.omicronMode || 0),
      modeLabel: omicronModeLabel(ability.omicronMode),
      activeHere: omicronActiveForMission(ability.omicronMode, mission?.missionType),
      installed: Boolean(ability.hasOmicron),
    }));
    const activeTbOmicrons = omicrons.filter((ability) => ability.activeHere);
    const semanticStaticUnit = staticUnit ? { ...staticUnit, abilities } : null;
    return {
      ...row,
      staticUnit: semanticStaticUnit,
      abilities,
      zetas: {
        available: zetas.length,
        installed: zetas.filter((ability) => ability.hasZeta).length,
        rows: zetas.map((ability) => ({ id: ability.id, name: ability.name, installed: Boolean(ability.hasZeta) })),
      },
      omicrons: {
        available: omicrons.length,
        activeHere: activeTbOmicrons.length,
        activeInstalled: activeTbOmicrons.filter((ability) => ability.installed).length,
        rows: omicrons,
      },
      minimumGap: targetGap(row.unit, recommendation?.minimum),
      saferGap: targetGap(row.unit, recommendation?.saferTarget),
      currentSpeed: row.unit ? Number(row.unit.speed || 0) : null,
    };
  });

  const activeOmicrons = members.flatMap((member) => member.omicrons.rows.filter((ability) => ability.activeHere).map((ability) => ({ ...ability, unitName: member.unit?.name || member.name })));
  const zetaAvailable = members.reduce((sum, member) => sum + member.zetas.available, 0);
  const zetaInstalled = members.reduce((sum, member) => sum + member.zetas.installed, 0);
  const minimumTargetsDefined = [recommendation?.minimum?.gear, recommendation?.minimum?.relic, recommendation?.minimum?.speed].some((value) => value != null);
  const saferTargetsDefined = [recommendation?.saferTarget?.gear, recommendation?.saferTarget?.relic, recommendation?.saferTarget?.speed].some((value) => value != null);
  const mechanicCoverage = analyzeMissionMechanicCoverage(mission, members, knowledge?.enemyKit || null);
  const selectedBaseIds = members.map((member) => member.unit?.baseId || member.baseId).filter(Boolean);
  const interactionProfile = teamInteractionProfileFromCatalog(selectedBaseIds, catalog);

  const result = {
    missionId: String(mission?.id || ""),
    recommendationId: String(recommendation?.id || ""),
    members,
    entryComplete: fit.complete,
    zetas: { available: zetaAvailable, installed: zetaInstalled },
    tbOmicrons: {
      active: activeOmicrons.length,
      installed: activeOmicrons.filter((ability) => ability.installed).length,
      rows: activeOmicrons,
    },
    targets: {
      minimumDefined: minimumTargetsDefined,
      saferDefined: saferTargetsDefined,
      minimum: { ...recommendation?.minimum },
      safer: { ...recommendation?.saferTarget },
    },
    guidance: {
      zetas: (recommendation?.zetas || []).map((item) => normalizeGuidanceItem(item, "HIGH")),
      omicrons: (recommendation?.omicrons || []).map((item) => normalizeGuidanceItem(item, "HELPFUL")),
      abilities: (recommendation?.abilities || []).map((item) => normalizeGuidanceItem(item, "HIGH")),
      mods: (recommendation?.modTargets || []).map((item) => normalizeGuidanceItem(item, "HELPFUL")),
      strategy: (recommendation?.strategy || []).map((item) => normalizeGuidanceItem(item, "HELPFUL")),
    },
    mechanicCoverage,
    interactionProfile,
    mechanics: Array.isArray(mission?.mechanics) ? [...mission.mechanics] : [],
    enemies: Array.isArray(mission?.enemies) ? [...mission.enemies] : [],
  };
  result.battleStrategy = evaluateBattleStrategy(result, mission);
  return result;
}

export function combatPreparationStatus(analysis) {
  if (!analysis) return { level: "unknown", label: "GUIDANCE PENDING" };
  if (!analysis.entryComplete) return { level: "blocked", label: "ENTRY BLOCKED" };
  const minimumMiss = analysis.members.some((member) => member.minimumGap?.ready === false);
  if (minimumMiss) return { level: "warning", label: "MINIMUM TARGET GAP" };
  if (analysis.mechanicCoverage?.missing?.length) return { level: "warning", label: "MECHANIC GAP" };
  if (analysis.battleStrategy?.available && analysis.battleStrategy.blockers?.length) return { level: "warning", label: "STRATEGY GAP" };
  if (analysis.targets.minimumDefined) return { level: "ready", label: "MINIMUM READY" };
  return { level: "ready", label: "ENTRY READY" };
}
