import { buildTeamCapabilityIndex } from "./mission-mechanic-intelligence.js";
import { battleStrategyForMission, battleStrategySources } from "./tb-battle-strategy-data.js";
import { watBattleStrategyForMission } from "./tb-battle-strategy-wat-data.js";
import { dsGeoBattleStrategyForMission } from "./tb-battle-strategy-dsgeo-data.js";
import { dsGeoFleetBattleStrategyForMission } from "./tb-battle-strategy-dsgeo-fleet-data.js";
import { lsGeoBattleStrategyForMission } from "./tb-battle-strategy-lsgeo-data.js";
import { lsGeoFleetBattleStrategyForMission } from "./tb-battle-strategy-lsgeo-fleet-data.js";
import { hothDsBattleStrategyForMission } from "./tb-battle-strategy-hoth-ds-data.js";
import { hothDsFleetBattleStrategyForMission } from "./tb-battle-strategy-hoth-ds-fleet-data.js";
import { rotePhaseOneBattleStrategyForMission } from "./tb-battle-strategy-rote-p1-data.js";
import { mandaloreBattleStrategyForMission } from "./tb-battle-strategy-mandalore-data.js";
import { rotePriorityBattleStrategyForMission } from "./tb-battle-strategy-rote-priority-data.js";
import { roteFactionBattleStrategyForMission } from "./tb-battle-strategy-rote-factions-data.js";
import { roteRewardBattleStrategyForMission } from "./tb-battle-strategy-rote-rewards-data.js";
import { roteCombatExpansionStrategyForMission } from "./tb-battle-strategy-rote-combat-expansion-data.js";
import { roteDeathStarStrategyForMission } from "./tb-battle-strategy-rote-deathstar-data.js";
import { roteJabbaJkckStrategyForMission } from "./tb-battle-strategy-rote-jabba-jkck-data.js";
import { roteNamedCombatStrategyForMission } from "./tb-battle-strategy-rote-named-combat-data.js";
import { roteFleetBattleStrategyForMission } from "./tb-battle-strategy-rote-fleet-resolver.js";
import { roteGenericBattleStrategyForMission } from "./tb-battle-strategy-rote-generic-data.js";

const normalized = (value) => String(value || "").trim().toLowerCase();

function memberBaseId(member) {
  return String(member?.unit?.baseId || member?.baseId || member?.staticUnit?.baseId || "");
}

function memberName(member) {
  return String(member?.unit?.name || member?.name || member?.staticUnit?.name || memberBaseId(member) || "Unknown");
}

function memberSpeed(member) {
  const raw = member?.currentSpeed ?? member?.unit?.speed ?? member?.staticUnit?.speed;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function abilityRows(member) {
  return Array.isArray(member?.abilities)
    ? member.abilities
    : Array.isArray(member?.staticUnit?.abilities)
      ? member.staticUnit.abilities
      : [];
}

function capabilitySources(check, capabilities) {
  if (check?.evidenceType === "mechanic") return capabilities.mechanics.get(check.evidenceKey) || [];
  if (check?.evidenceType === "buff") return capabilities.buffs.get(check.evidenceKey) || [];
  if (check?.evidenceType === "debuff") return capabilities.debuffs.get(check.evidenceKey) || [];
  return [];
}

function abilityMatch(member, check) {
  const wanted = normalized(check?.abilityName);
  if (!wanted) return null;
  return abilityRows(member).find((ability) => normalized(ability?.name) === wanted || normalized(ability?.id) === wanted) || null;
}

function abilityRequirementState(ability, check = {}) {
  const hasAbility = Boolean(ability);
  const minimumTier = Number.isFinite(Number(check.minimumTier)) ? Number(check.minimumTier) : null;
  const tierReady = minimumTier == null || Number(ability?.tier || 0) >= minimumTier;
  const zetaReady = check.requiresZeta !== true || ability?.hasZeta === true;
  const omicronReady = check.requiresOmicron !== true || ability?.hasOmicron === true;
  return {
    hasAbility,
    tierReady,
    zetaReady,
    omicronReady,
    ready: hasAbility && tierReady && zetaReady && omicronReady,
    minimumTier,
    requiresZeta: check.requiresZeta === true,
    requiresOmicron: check.requiresOmicron === true,
  };
}

function priorityRank(value) {
  const order = { critical: 0, high: 1, setup: 2, helpful: 3, info: 4 };
  return order[normalized(value)] ?? 5;
}

function resolvedStrategy(missionId, mission = null, analysis = null) {
  const tbId = String(mission?.tbId || analysis?.tbId || "");
  const allowDsGeoLegacyIds = !tbId || tbId === "geo-separatist";
  const allowLsGeoLegacyIds = !tbId || tbId === "geo-republic";
  const allowHothDsLegacyIds = !tbId || tbId === "hoth-imperial";

  return mandaloreBattleStrategyForMission(missionId)
    || rotePriorityBattleStrategyForMission(missionId)
    || roteFactionBattleStrategyForMission(missionId)
    || roteRewardBattleStrategyForMission(missionId)
    || roteDeathStarStrategyForMission(missionId)
    || roteJabbaJkckStrategyForMission(missionId)
    || roteNamedCombatStrategyForMission(missionId)
    || roteCombatExpansionStrategyForMission(missionId)
    || rotePhaseOneBattleStrategyForMission(missionId)
    || roteFleetBattleStrategyForMission(missionId)
    || roteGenericBattleStrategyForMission(missionId)
    || (allowLsGeoLegacyIds ? lsGeoFleetBattleStrategyForMission(missionId) : null)
    || (allowLsGeoLegacyIds ? lsGeoBattleStrategyForMission(missionId) : null)
    || (allowHothDsLegacyIds ? hothDsFleetBattleStrategyForMission(missionId) : null)
    || (allowHothDsLegacyIds ? hothDsBattleStrategyForMission(missionId) : null)
    || (allowDsGeoLegacyIds ? dsGeoFleetBattleStrategyForMission(missionId) : null)
    || (allowDsGeoLegacyIds ? dsGeoBattleStrategyForMission(missionId) : null)
    || (allowDsGeoLegacyIds ? watBattleStrategyForMission(missionId) : null)
    || battleStrategyForMission(missionId);
}

function resolvedSources(strategy) {
  return Array.isArray(strategy?.sources) ? strategy.sources : battleStrategySources(strategy);
}

export function evaluateBattleStrategy(analysis, mission = null) {
  const strategy = resolvedStrategy(analysis?.missionId || mission?.id, mission, analysis);
  if (!strategy) {
    return {
      available: false,
      status: "pending",
      label: "STRATEGY PENDING",
      missionId: String(analysis?.missionId || mission?.id || ""),
      evidenceBoundary: "No sourced battle-strategy pack has been published for this mission yet.",
    };
  }

  const members = Array.isArray(analysis?.members) ? analysis.members : [];
  const selectedIds = members.map(memberBaseId).filter(Boolean);
  const selected = new Set(selectedIds);
  const byId = new Map(members.map((member) => [memberBaseId(member), member]).filter(([id]) => id));
  const capabilities = buildTeamCapabilityIndex(members);

  const leaderCheck = strategy.requiredLeaderBaseId
    ? {
        type: "leader",
        id: strategy.requiredLeaderBaseId,
        label: "Required leader",
        required: true,
        ready: selectedIds[0] === strategy.requiredLeaderBaseId,
        current: selectedIds[0] || "",
        expected: strategy.requiredLeaderBaseId,
      }
    : null;

  const unitChecks = (strategy.keyUnits || []).map((check) => ({
    type: "unit",
    id: check.baseId,
    label: check.name || check.baseId,
    importance: check.importance || "helpful",
    required: check.importance === "critical",
    ready: selected.has(String(check.baseId)),
    reason: check.reason || "",
  }));

  const mechanicChecks = (strategy.requiredMechanics || []).map((check) => {
    const sources = capabilitySources(check, capabilities);
    return {
      type: "mechanic",
      id: check.id,
      label: check.label || check.id,
      importance: check.importance || "high",
      required: ["critical", "high"].includes(normalized(check.importance)),
      ready: sources.length > 0,
      sources,
      expected: check.evidenceKey || check.id,
    };
  });

  const abilityChecks = (strategy.keyAbilities || []).map((check) => {
    const member = byId.get(String(check.baseId));
    const ability = member ? abilityMatch(member, check) : null;
    const requirement = abilityRequirementState(ability, check);
    return {
      type: "ability",
      id: `${check.baseId}:${check.abilityName}`,
      baseId: check.baseId,
      unitName: member ? memberName(member) : check.baseId,
      label: check.abilityName,
      importance: check.importance || "high",
      required: check.importance === "critical",
      ready: requirement.ready,
      hasAbility: requirement.hasAbility,
      tierReady: requirement.tierReady,
      zetaReady: requirement.zetaReady,
      omicronReady: requirement.omicronReady,
      requiresZeta: requirement.requiresZeta,
      requiresOmicron: requirement.requiresOmicron,
      minimumTier: requirement.minimumTier,
      abilityId: String(ability?.id || ""),
      installedTier: ability?.tier == null ? null : Number(ability.tier),
      hasZeta: Boolean(ability?.hasZeta),
      hasOmicron: Boolean(ability?.hasOmicron),
      expected: check.expected || "",
      reason: check.reason || "",
    };
  });

  const speedOrderChecks = (strategy.speedOrders || []).map((check) => {
    const faster = byId.get(String(check.fasterBaseId || ""));
    const slower = byId.get(String(check.slowerBaseId || ""));
    const fasterSpeed = faster ? memberSpeed(faster) : null;
    const slowerSpeed = slower ? memberSpeed(slower) : null;
    const bothPresent = Boolean(faster && slower);
    const speedsKnown = fasterSpeed != null && slowerSpeed != null;
    return {
      type: "speed-order",
      id: `${check.fasterBaseId}>${check.slowerBaseId}`,
      label: check.label || "Recommended speed order",
      importance: check.importance || "helpful",
      required: check.required === true,
      ready: bothPresent && speedsKnown && fasterSpeed > slowerSpeed,
      fasterBaseId: String(check.fasterBaseId || ""),
      slowerBaseId: String(check.slowerBaseId || ""),
      fasterName: faster ? memberName(faster) : String(check.fasterBaseId || ""),
      slowerName: slower ? memberName(slower) : String(check.slowerBaseId || ""),
      fasterSpeed,
      slowerSpeed,
      reason: check.reason || "",
    };
  });

  const checks = [leaderCheck, ...unitChecks, ...mechanicChecks, ...abilityChecks, ...speedOrderChecks].filter(Boolean)
    .sort((a, b) => priorityRank(a.importance || (a.required ? "critical" : "helpful")) - priorityRank(b.importance || (b.required ? "critical" : "helpful")));

  const blockers = checks.filter((check) => check.required && !check.ready);
  const warnings = checks.filter((check) => !check.required && !check.ready);
  const label = blockers.length ? "STRATEGY GAP" : warnings.length ? "PLAN READY · ADVISORIES" : "PLAN READY";
  const status = blockers.length ? "blocked" : warnings.length ? "warning" : "ready";

  return {
    available: true,
    status,
    label,
    missionId: strategy.missionId,
    strategyId: strategy.id,
    title: strategy.title,
    confidence: strategy.confidence,
    strategyStatus: strategy.status,
    lastVerified: strategy.lastVerified,
    summary: strategy.summary,
    sources: resolvedSources(strategy),
    checks,
    blockers,
    warnings,
    stages: (strategy.stages || []).map((entry) => ({
      ...entry,
      steps: [...(entry.steps || [])].sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority)),
    })),
    targetPriorities: [...(strategy.targetPriorities || [])].sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority)),
    failureRisks: strategy.failureRisks || [],
    evidenceBoundary: strategy.evidenceBoundary || "Strategy guidance is source-scoped and does not represent a guaranteed win.",
  };
}

export function battleStrategyStatus(strategyAnalysis) {
  if (!strategyAnalysis?.available) return { level: "unknown", label: "STRATEGY PENDING" };
  if (strategyAnalysis.status === "blocked") return { level: "blocked", label: strategyAnalysis.label };
  if (strategyAnalysis.status === "warning") return { level: "warning", label: strategyAnalysis.label };
  return { level: "ready", label: strategyAnalysis.label };
}
