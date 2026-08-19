import {
  mandatoryRosterStatus,
  missionRosterEntrySummary,
  recommendationRosterFit,
} from "./tb-mission-intelligence.js";
import { mergeAbilityProgression } from "./progression-policy.js";

export const TB_READINESS_EVIDENCE = Object.freeze({
  PASS: "PASS",
  FAIL: "FAIL",
  UNKNOWN: "UNKNOWN",
  NOT_APPLICABLE: "NOT_APPLICABLE",
  ADVISORY: "ADVISORY",
});

export const TB_TACTICAL_READINESS = Object.freeze({
  BLOCKED_ENTRY: "BLOCKED — ENTRY",
  NEEDS_TEAM: "NEEDS TEAM COMPOSITION",
  NEEDS_ABILITIES: "NEEDS ABILITIES",
  NEEDS_ZETA: "NEEDS ZETA",
  NEEDS_TB_OMICRON: "NEEDS TB OMICRON",
  NEEDS_MODS: "NEEDS MODS",
  NEEDS_STATS: "NEEDS STATS",
  ENTRY_READY_BATTLE_UNKNOWN: "ENTRY READY / BATTLE DATA UNKNOWN",
  MINIMUM_READY: "MINIMUM READY",
  SAFER_TARGET_READY: "SAFER TARGET READY",
});

export const TB_OMICRON_MODES = Object.freeze({
  STRIKE: 5,
  COVERT: 6,
  BOTH: 7,
});

const array = (value) => Array.isArray(value) ? value : [];
const text = (value) => String(value ?? "").trim();
const lower = (value) => text(value).toLowerCase();
const finiteOrNull = (value) => Number.isFinite(Number(value)) ? Number(value) : null;

function normalizedName(value) {
  return text(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function requiredGuidance(item) {
  if (!item || typeof item !== "object") return false;
  if (item.required === true || item.mandatory === true) return true;
  return ["required", "mandatory"].includes(lower(item.priority));
}

function evidence(state, details = {}) {
  return Object.freeze({ state, ...details });
}

function catalogMap(catalog = {}) {
  return new Map(array(catalog?.units).map((unit) => [text(unit?.baseId), unit]).filter(([baseId]) => baseId));
}

function liveAbilityMap(unit = {}) {
  return new Map(array(unit?.abilities).map((ability) => [text(ability?.id), ability]).filter(([id]) => id));
}

function mergedAbilities(unit, staticUnit) {
  const live = array(unit?.abilities);
  const staticAbilities = array(staticUnit?.abilities);
  if (!staticAbilities.length) return live.map((ability) => mergeAbilityProgression({}, ability));
  const liveById = liveAbilityMap(unit);
  return staticAbilities.map((ability, index) => mergeAbilityProgression(
    ability,
    liveById.get(text(ability?.id)) || live[index] || {},
  ));
}

function abilityIdentityMatches(ability, item = {}) {
  const wantedId = text(item.abilityId || item.id);
  if (wantedId && text(ability?.id) === wantedId) return true;
  const wantedName = normalizedName(item.abilityName || item.ability || item.name);
  return Boolean(wantedName && normalizedName(ability?.name) === wantedName);
}

function rowMatchesGuidance(row, item = {}) {
  const wantedBaseId = text(item.baseId || item.unitBaseId);
  if (wantedBaseId) return text(row?.unit?.baseId || row?.baseId) === wantedBaseId;
  const wantedUnitName = normalizedName(item.unitName || item.character || item.unit);
  if (wantedUnitName) return normalizedName(row?.unit?.name || row?.name) === wantedUnitName;
  return true;
}

function guidanceRows(fit, item = {}) {
  return array(fit?.rows).filter((row) => rowMatchesGuidance(row, item));
}

function findAbilityEvidence(fit, item, staticById) {
  const candidates = guidanceRows(fit, item);
  let sawOwnedUnit = false;
  for (const row of candidates) {
    if (!row?.unit) continue;
    sawOwnedUnit = true;
    const staticUnit = staticById.get(text(row.unit.baseId || row.baseId)) || null;
    const abilities = mergedAbilities(row.unit, staticUnit);
    const ability = abilities.find((candidate) => abilityIdentityMatches(candidate, item));
    if (ability) return { row, ability, abilities };
  }
  return { row: candidates.find((row) => row?.unit) || null, ability: null, abilities: [], sawOwnedUnit };
}

export function omicronActiveForTbMission(mode, missionType) {
  const value = Number(mode || 0);
  const type = lower(missionType || "combat");
  if (value === TB_OMICRON_MODES.BOTH) return type === "combat" || type === "special";
  if (type === "special") return value === TB_OMICRON_MODES.COVERT;
  if (type === "combat") return value === TB_OMICRON_MODES.STRIKE;
  return false;
}

function evaluateAbilityGuidance(fit, recommendation, staticById) {
  return array(recommendation?.abilities).map((item, index) => {
    if (typeof item === "string") return evidence(TB_READINESS_EVIDENCE.ADVISORY, { index, name: item, required: false });
    const required = requiredGuidance(item);
    const found = findAbilityEvidence(fit, item, staticById);
    if (!found.row || !found.sawOwnedUnit) return evidence(required ? TB_READINESS_EVIDENCE.UNKNOWN : TB_READINESS_EVIDENCE.ADVISORY, { index, name: text(item?.name || item?.ability || item?.abilityId || "Ability"), required, reason: "unit evidence unavailable" });
    if (!found.ability) return evidence(required ? TB_READINESS_EVIDENCE.UNKNOWN : TB_READINESS_EVIDENCE.ADVISORY, { index, name: text(item?.name || item?.ability || item?.abilityId || "Ability"), required, baseId: text(found.row?.unit?.baseId), reason: "ability evidence unavailable" });
    const target = finiteOrNull(item.minTier ?? item.tier ?? item.displayTier);
    if (target == null) return evidence(TB_READINESS_EVIDENCE.ADVISORY, { index, name: text(found.ability.name), required, baseId: text(found.row?.unit?.baseId), currentTier: finiteOrNull(found.ability.tier) });
    const current = finiteOrNull(found.ability.tier);
    if (current == null) return evidence(TB_READINESS_EVIDENCE.UNKNOWN, { index, name: text(found.ability.name), required, baseId: text(found.row?.unit?.baseId), targetTier: target, reason: "ability tier unavailable" });
    return evidence(current >= target ? TB_READINESS_EVIDENCE.PASS : TB_READINESS_EVIDENCE.FAIL, { index, name: text(found.ability.name), required, baseId: text(found.row?.unit?.baseId), currentTier: current, targetTier: target, gap: Math.max(0, target - current) });
  });
}

function evaluateZetaGuidance(fit, recommendation, staticById) {
  return array(recommendation?.zetas).map((item, index) => {
    if (typeof item === "string") return evidence(TB_READINESS_EVIDENCE.ADVISORY, { index, name: item, required: false });
    const required = requiredGuidance(item);
    const found = findAbilityEvidence(fit, item, staticById);
    if (!found.row || !found.sawOwnedUnit) return evidence(required ? TB_READINESS_EVIDENCE.UNKNOWN : TB_READINESS_EVIDENCE.ADVISORY, { index, name: text(item?.name || item?.ability || item?.abilityId || "Zeta"), required, reason: "unit evidence unavailable" });
    if (!found.ability) return evidence(required ? TB_READINESS_EVIDENCE.UNKNOWN : TB_READINESS_EVIDENCE.ADVISORY, { index, name: text(item?.name || item?.ability || item?.abilityId || "Zeta"), required, baseId: text(found.row?.unit?.baseId), reason: "exact Zeta ability evidence unavailable" });
    return evidence(found.ability.hasZeta === true ? TB_READINESS_EVIDENCE.PASS : TB_READINESS_EVIDENCE.FAIL, { index, name: text(found.ability.name), required, baseId: text(found.row?.unit?.baseId), installed: found.ability.hasZeta === true });
  });
}

function evaluateOmicronGuidance(fit, mission, recommendation, staticById) {
  return array(recommendation?.omicrons).map((item, index) => {
    if (typeof item === "string") return evidence(TB_READINESS_EVIDENCE.ADVISORY, { index, name: item, required: false });
    const required = requiredGuidance(item);
    const found = findAbilityEvidence(fit, item, staticById);
    if (!found.row || !found.sawOwnedUnit) return evidence(required ? TB_READINESS_EVIDENCE.UNKNOWN : TB_READINESS_EVIDENCE.ADVISORY, { index, name: text(item?.name || item?.ability || item?.abilityId || "Omicron"), required, reason: "unit evidence unavailable" });
    if (!found.ability) return evidence(required ? TB_READINESS_EVIDENCE.UNKNOWN : TB_READINESS_EVIDENCE.ADVISORY, { index, name: text(item?.name || item?.ability || item?.abilityId || "Omicron"), required, baseId: text(found.row?.unit?.baseId), reason: "exact Omicron ability evidence unavailable" });
    const activeHere = omicronActiveForTbMission(found.ability.omicronMode, mission?.missionType);
    if (!activeHere) return evidence(TB_READINESS_EVIDENCE.NOT_APPLICABLE, { index, name: text(found.ability.name), required: false, baseId: text(found.row?.unit?.baseId), installed: found.ability.hasOmicron === true, activeHere: false, omicronMode: Number(found.ability.omicronMode || 0), reason: "Omicron is not active for this TB mission type" });
    return evidence(found.ability.hasOmicron === true ? TB_READINESS_EVIDENCE.PASS : TB_READINESS_EVIDENCE.FAIL, { index, name: text(found.ability.name), required, baseId: text(found.row?.unit?.baseId), installed: found.ability.hasOmicron === true, activeHere: true, omicronMode: Number(found.ability.omicronMode || 0) });
  });
}

const STAT_ALIASES = Object.freeze({
  speed: ["speed"],
  health: ["health", "maxHealth"],
  protection: ["protection", "maxProtection"],
  offense: ["offense"],
  physicaldamage: ["physicalDamage", "physicalOffense"],
  specialdamage: ["specialDamage", "specialOffense"],
  potency: ["potency"],
  tenacity: ["tenacity"],
  criticalchance: ["criticalChance", "critChance"],
  criticaldamage: ["criticalDamage", "critDamage"],
  defense: ["defense"],
  armor: ["armor"],
  resistance: ["resistance"],
  accuracy: ["accuracy"],
  criticalavoidance: ["criticalAvoidance", "critAvoidance"],
});

function normalizedStatKey(value) {
  return lower(value).replace(/[^a-z0-9]+/g, "");
}

function statValue(unit = {}, requestedStat) {
  const key = normalizedStatKey(requestedStat);
  const aliases = STAT_ALIASES[key] || [text(requestedStat)];
  const containers = [unit, unit?.stats, unit?.modStats, unit?.calculatedStats];
  for (const container of containers) {
    if (!container || typeof container !== "object") continue;
    for (const alias of aliases) {
      const direct = finiteOrNull(container?.[alias]);
      if (direct != null) return direct;
      const matchKey = Object.keys(container).find((candidate) => normalizedStatKey(candidate) === normalizedStatKey(alias));
      if (matchKey) {
        const matched = finiteOrNull(container[matchKey]);
        if (matched != null) return matched;
      }
    }
  }
  return null;
}

function statTargetItem(item, index) {
  if (typeof item === "string") return { index, advisory: true, name: item };
  return {
    index,
    advisory: false,
    required: requiredGuidance(item),
    baseId: text(item?.baseId || item?.unitBaseId),
    unitName: text(item?.unitName || item?.character || item?.unit),
    stat: text(item?.stat || item?.key || item?.metric || item?.name),
    minimum: finiteOrNull(item?.min ?? item?.minimum ?? item?.target ?? item?.value),
    maximum: finiteOrNull(item?.max ?? item?.maximum),
    notes: text(item?.notes),
  };
}

function evaluateStatTarget(fit, target) {
  if (target.advisory) return evidence(TB_READINESS_EVIDENCE.ADVISORY, { index: target.index, name: target.name, required: false });
  const candidates = guidanceRows(fit, target);
  if (!candidates.length) return evidence(target.required ? TB_READINESS_EVIDENCE.UNKNOWN : TB_READINESS_EVIDENCE.ADVISORY, { ...target, reason: "team member not resolved" });
  const row = candidates.find((candidate) => candidate?.unit) || candidates[0];
  if (!row?.unit) return evidence(target.required ? TB_READINESS_EVIDENCE.UNKNOWN : TB_READINESS_EVIDENCE.ADVISORY, { ...target, reason: "unit stat evidence unavailable" });
  if (!target.stat || (target.minimum == null && target.maximum == null)) return evidence(TB_READINESS_EVIDENCE.ADVISORY, { ...target, baseId: text(row.unit.baseId) });
  const current = statValue(row.unit, target.stat);
  if (current == null) return evidence(TB_READINESS_EVIDENCE.UNKNOWN, { ...target, baseId: text(row.unit.baseId), reason: `${target.stat} evidence unavailable` });
  const meetsMin = target.minimum == null || current >= target.minimum;
  const meetsMax = target.maximum == null || current <= target.maximum;
  return evidence(meetsMin && meetsMax ? TB_READINESS_EVIDENCE.PASS : TB_READINESS_EVIDENCE.FAIL, {
    ...target,
    baseId: text(row.unit.baseId),
    current,
    gap: target.minimum != null ? Math.max(0, target.minimum - current) : target.maximum != null ? Math.max(0, current - target.maximum) : 0,
  });
}

function evaluateMinimumSpeed(fit, recommendation) {
  const target = finiteOrNull(recommendation?.minimum?.speed);
  if (target == null) return [];
  return array(fit?.rows).filter((row) => row?.unit && lower(row.unit?.unitType || "character") !== "ship").map((row, index) => {
    const current = statValue(row.unit, "speed");
    if (current == null) return evidence(TB_READINESS_EVIDENCE.UNKNOWN, { index, baseId: text(row.unit.baseId), name: text(row.unit.name || row.name), stat: "speed", minimum: target, required: true, reason: "speed evidence unavailable", source: "recommendation.minimum.speed" });
    return evidence(current >= target ? TB_READINESS_EVIDENCE.PASS : TB_READINESS_EVIDENCE.FAIL, { index, baseId: text(row.unit.baseId), name: text(row.unit.name || row.name), stat: "speed", current, minimum: target, gap: Math.max(0, target - current), required: true, source: "recommendation.minimum.speed" });
  });
}

function evaluateStats(fit, recommendation) {
  const explicit = array(recommendation?.modTargets).map(statTargetItem).map((target) => evaluateStatTarget(fit, target));
  return [...evaluateMinimumSpeed(fit, recommendation), ...explicit];
}

function progressionTargetForRow(row, mission, recommendation) {
  const isShip = lower(row?.unit?.unitType || "character") === "ship";
  const entryRelic = finiteOrNull(mission?.entry?.relicMin);
  const entryGear = finiteOrNull(mission?.entry?.gearMin);
  const minimumRelic = finiteOrNull(recommendation?.minimum?.relic);
  const minimumGear = finiteOrNull(recommendation?.minimum?.gear);
  const explicitLevel = finiteOrNull(recommendation?.minimum?.level ?? mission?.entry?.levelMin);
  const impliedLevel = !isShip && ((entryRelic != null && entryRelic > 0) || (entryGear != null && entryGear >= 13)) ? 85 : null;
  return {
    level: explicitLevel ?? impliedLevel,
    stars: finiteOrNull(mission?.entry?.starsMin),
    gear: isShip ? null : (minimumGear ?? entryGear ?? (entryRelic != null && entryRelic > 0 ? 13 : null)),
    relic: isShip ? null : (minimumRelic ?? entryRelic),
  };
}

function track(currentValue, targetValue, label) {
  const target = finiteOrNull(targetValue);
  if (target == null) return evidence(TB_READINESS_EVIDENCE.NOT_APPLICABLE, { label, current: finiteOrNull(currentValue), target: null, gap: 0 });
  const current = finiteOrNull(currentValue);
  if (current == null) return evidence(TB_READINESS_EVIDENCE.UNKNOWN, { label, current: null, target, gap: null });
  return evidence(current >= target ? TB_READINESS_EVIDENCE.PASS : TB_READINESS_EVIDENCE.FAIL, { label, current, target, gap: Math.max(0, target - current) });
}

function evaluateProgression(fit, mission, recommendation) {
  return array(fit?.rows).map((row) => {
    const target = progressionTargetForRow(row, mission, recommendation);
    if (!row?.unit) return Object.freeze({ baseId: text(row?.baseId), name: text(row?.name || row?.baseId || "Unknown"), owned: false, level: evidence(TB_READINESS_EVIDENCE.UNKNOWN, { label: "Level", target: target.level }), stars: evidence(TB_READINESS_EVIDENCE.UNKNOWN, { label: "Stars", target: target.stars }), gear: evidence(TB_READINESS_EVIDENCE.UNKNOWN, { label: "Gear", target: target.gear }), relic: evidence(TB_READINESS_EVIDENCE.UNKNOWN, { label: "Relic", target: target.relic }) });
    return Object.freeze({
      baseId: text(row.unit.baseId || row.baseId),
      name: text(row.unit.name || row.name || row.baseId || "Unknown"),
      owned: true,
      level: track(row.unit.level, target.level, "Level"),
      stars: track(row.unit.stars, target.stars, "Stars"),
      gear: track(row.unit.gear, target.gear, "Gear"),
      relic: track(row.unit.relic, target.relic, "Relic"),
    });
  });
}

function evaluateSaferTargets(fit, recommendation) {
  const target = recommendation?.saferTarget || {};
  const fieldsDefined = [target?.level, target?.gear, target?.relic, target?.speed].some((value) => finiteOrNull(value) != null);
  if (!fieldsDefined) return { defined: false, ready: false, rows: [] };
  const rows = array(fit?.rows).filter((row) => row?.unit).map((row) => {
    const checks = [
      track(row.unit.level, target.level, "Level"),
      track(row.unit.gear, target.gear, "Gear"),
      track(row.unit.relic, target.relic, "Relic"),
      track(statValue(row.unit, "speed"), target.speed, "Speed"),
    ];
    return { baseId: text(row.unit.baseId), name: text(row.unit.name || row.name), checks };
  });
  const relevant = rows.flatMap((row) => row.checks).filter((check) => check.state !== TB_READINESS_EVIDENCE.NOT_APPLICABLE);
  return { defined: true, ready: relevant.length > 0 && relevant.every((check) => check.state === TB_READINESS_EVIDENCE.PASS), rows };
}

function requiredFailures(rows) {
  return array(rows).filter((row) => row?.required === true && row.state === TB_READINESS_EVIDENCE.FAIL);
}

function requiredUnknown(rows) {
  return array(rows).filter((row) => row?.required === true && row.state === TB_READINESS_EVIDENCE.UNKNOWN);
}

function progressionFailures(rows) {
  return array(rows).flatMap((row) => [row.level, row.stars, row.gear, row.relic]).filter((item) => item?.state === TB_READINESS_EVIDENCE.FAIL);
}

function progressionUnknown(rows) {
  return array(rows).flatMap((row) => [row.level, row.stars, row.gear, row.relic]).filter((item) => item?.state === TB_READINESS_EVIDENCE.UNKNOWN);
}

function minimumTargetDefined(recommendation) {
  return [recommendation?.minimum?.level, recommendation?.minimum?.gear, recommendation?.minimum?.relic, recommendation?.minimum?.speed].some((value) => finiteOrNull(value) != null)
    || array(recommendation?.abilities).some(requiredGuidance)
    || array(recommendation?.zetas).some(requiredGuidance)
    || array(recommendation?.omicrons).some(requiredGuidance)
    || array(recommendation?.modTargets).some(requiredGuidance);
}

function verdict({ entry, fit, progression, abilities, zetas, omicrons, stats, safer, recommendation }) {
  if (entry?.verified !== true || entry?.ready !== true) return TB_TACTICAL_READINESS.BLOCKED_ENTRY;
  if (array(recommendation?.members).length && fit?.complete !== true) return TB_TACTICAL_READINESS.NEEDS_TEAM;
  if (progressionFailures(progression).length) return TB_TACTICAL_READINESS.BLOCKED_ENTRY;
  if (requiredFailures(abilities).length) return TB_TACTICAL_READINESS.NEEDS_ABILITIES;
  if (requiredFailures(zetas).length) return TB_TACTICAL_READINESS.NEEDS_ZETA;
  if (requiredFailures(omicrons).length) return TB_TACTICAL_READINESS.NEEDS_TB_OMICRON;
  const failedStats = requiredFailures(stats);
  if (failedStats.some((row) => normalizedStatKey(row.stat) === "speed")) return TB_TACTICAL_READINESS.NEEDS_MODS;
  if (failedStats.length) return TB_TACTICAL_READINESS.NEEDS_STATS;
  const unknown = [
    ...progressionUnknown(progression),
    ...requiredUnknown(abilities),
    ...requiredUnknown(zetas),
    ...requiredUnknown(omicrons),
    ...requiredUnknown(stats),
  ];
  if (unknown.length) return TB_TACTICAL_READINESS.ENTRY_READY_BATTLE_UNKNOWN;
  if (safer?.defined && safer?.ready) return TB_TACTICAL_READINESS.SAFER_TARGET_READY;
  if (minimumTargetDefined(recommendation)) return TB_TACTICAL_READINESS.MINIMUM_READY;
  return TB_TACTICAL_READINESS.ENTRY_READY_BATTLE_UNKNOWN;
}

export function evaluateTbMissionReadinessV2(body = {}, mission = {}, recommendation = null, catalog = {}) {
  const selected = recommendation || array(mission?.recommendations)[0] || null;
  const entry = missionRosterEntrySummary(body, mission);
  const mandatory = mandatoryRosterStatus(body, mission);
  if (!selected) {
    return Object.freeze({
      missionId: text(mission?.id),
      recommendationId: "",
      verdict: entry?.verified && entry?.ready ? TB_TACTICAL_READINESS.ENTRY_READY_BATTLE_UNKNOWN : TB_TACTICAL_READINESS.BLOCKED_ENTRY,
      entry,
      mandatory,
      team: { complete: false, owned: 0, legal: 0, rows: [] },
      progression: [],
      abilities: [],
      zetas: [],
      omicrons: [],
      stats: [],
      saferTarget: { defined: false, ready: false, rows: [] },
      evidenceBoundary: "Official entry legality is known independently from battle-preparation evidence. No selected team recommendation is available.",
    });
  }

  const fit = recommendationRosterFit(body, mission, selected);
  const staticById = catalogMap(catalog);
  const progression = evaluateProgression(fit, mission, selected);
  const abilities = evaluateAbilityGuidance(fit, selected, staticById);
  const zetas = evaluateZetaGuidance(fit, selected, staticById);
  const omicrons = evaluateOmicronGuidance(fit, mission, selected, staticById);
  const stats = evaluateStats(fit, selected);
  const saferTarget = evaluateSaferTargets(fit, selected);
  const readinessVerdict = verdict({ entry, fit, progression, abilities, zetas, omicrons, stats, safer: saferTarget, recommendation: selected });

  return Object.freeze({
    missionId: text(mission?.id),
    recommendationId: text(selected?.id),
    verdict: readinessVerdict,
    entry,
    mandatory,
    team: fit,
    progression,
    abilities,
    zetas,
    omicrons,
    stats,
    saferTarget,
    evidenceBoundary: "ENTRY legality uses verified mission restrictions. Ability, Zeta, Omicron and mod/stat requirements affect battle readiness only when explicitly sourced. UNKNOWN evidence never becomes a fake zero, failure or pass.",
  });
}
