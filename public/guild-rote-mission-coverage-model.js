import { ROTE_PLANETS } from "./rote-map-data.js";
import { roteMissionMap } from "./rote-mission-map-registry.js";
import {
  missionEntryRule,
  missionRosterEligibility,
  resolveRoteMissionNodes,
} from "./rote-mission-node-eligibility.js";
import { entryGap, normalizeRosterName } from "./tb-mission-intelligence.js";

const asArray = (value) => Array.isArray(value) ? value : [];
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const normalizeName = normalizeRosterName;

function memberId(member, index = 0) {
  return String(member?.playerId || member?.allyCode || member?.name || `member-${index + 1}`);
}

function catalogMaps(catalog = []) {
  return {
    byId: new Map(asArray(catalog).map((unit) => [String(unit?.baseId || ""), unit]).filter(([id]) => id)),
    byName: new Map(asArray(catalog).map((unit) => [normalizeName(unit?.name), unit]).filter(([name]) => name)),
  };
}

function catalogMatch(unit = {}, maps) {
  const baseId = String(unit?.baseId || "");
  if (baseId && maps.byId.has(baseId)) return maps.byId.get(baseId);
  const name = normalizeName(unit?.name);
  return name ? maps.byName.get(name) || null : null;
}

function enrichedUnit(unit = {}, maps) {
  const staticUnit = catalogMatch(unit, maps) || {};
  const liveFactions = asArray(unit.factions).length ? unit.factions : null;
  const liveCategories = asArray(unit.categories).length ? unit.categories : null;
  const liveAlignment = String(unit.alignment || "");
  return {
    ...staticUnit,
    ...unit,
    baseId: String(unit.baseId || staticUnit.baseId || ""),
    name: unit.name || staticUnit.name || unit.baseId || "Unknown",
    unitType: unit.unitType || staticUnit.unitType || "Character",
    alignment: liveAlignment && liveAlignment !== "Unknown" ? liveAlignment : staticUnit.alignment || liveAlignment || "Unknown",
    factions: liveFactions || staticUnit.factions || [],
    categories: liveCategories || staticUnit.categories || [],
    image: unit.image || staticUnit.image || "",
  };
}

export function enrichGuildRoteMember(member, catalog = [], index = 0) {
  const maps = catalogMaps(catalog);
  const roster = asArray(member?.units).map((unit) => enrichedUnit(unit, maps));
  return Object.freeze({
    id: memberId(member, index),
    playerId: String(member?.playerId || ""),
    allyCode: String(member?.allyCode || ""),
    name: String(member?.name || memberId(member, index)),
    galacticPower: finite(member?.galacticPower, 0),
    rosterAvailable: Boolean(member?.rosterAvailable),
    units: Object.freeze(roster.filter((unit) => String(unit.unitType || "Character") !== "Ship")),
    ships: Object.freeze(roster.filter((unit) => String(unit.unitType || "Character") === "Ship")),
  });
}

export function guildRoteMissionEvidence(mission = {}) {
  const rule = missionEntryRule(mission);
  if (String(rule.unitType || "Character").toLowerCase() !== "ship") return "exact";
  if (rule.allowedBaseIds.length || rule.requiredBaseIds.length || rule.categories.length || rule.alignments.length) return "exact";
  return "gate-only";
}

function gapScore(row = {}) {
  return finite(row?.gap?.score, row?.owned === false ? 1_000_000 : 0);
}

function readinessRank(row = {}) {
  if (!row.rosterAvailable) return 5;
  if (row.exactReady) return 0;
  if (row.knownGateReady) return 1;
  if (row.close) return 2;
  return 3;
}

export function compareGuildMissionCandidates(a = {}, b = {}) {
  const rank = readinessRank(a) - readinessRank(b);
  if (rank) return rank;
  const percent = finite(b.percent) - finite(a.percent);
  if (percent) return percent;
  const mandatory = finite(a.mandatoryBlockers) - finite(b.mandatoryBlockers);
  if (mandatory) return mandatory;
  const pool = finite(a.poolShortfall) - finite(b.poolShortfall);
  if (pool) return pool;
  const gap = finite(a.gapScore) - finite(b.gapScore);
  if (gap) return gap;
  const gp = finite(b.member?.galacticPower) - finite(a.member?.galacticPower);
  if (gp) return gp;
  return String(a.member?.name || "").localeCompare(String(b.member?.name || ""));
}

export function evaluateGuildMemberForMission(memberBody, mission) {
  if (!memberBody?.rosterAvailable) {
    return Object.freeze({
      member: memberBody,
      rosterAvailable: false,
      evidence: guildRoteMissionEvidence(mission),
      exactReady: false,
      knownGateReady: false,
      close: false,
      percent: 0,
      poolCount: 0,
      poolTarget: 0,
      poolShortfall: 0,
      mandatoryBlockers: 0,
      blockerRows: Object.freeze([]),
      gapScore: Number.MAX_SAFE_INTEGER,
    });
  }

  const eligibility = missionRosterEligibility(memberBody, mission);
  const evidence = guildRoteMissionEvidence(mission);
  const blockerRows = asArray(eligibility.mandatory).filter((row) => !row.legal);
  const poolTarget = finite(eligibility.poolTarget, 0);
  const poolCount = asArray(eligibility.candidates).length;
  const poolShortfall = Math.max(0, poolTarget - poolCount);
  const blockerScore = blockerRows.reduce((sum, row) => sum + gapScore(row), 0);
  const depthScore = poolShortfall * 250_000;
  const exactReady = evidence === "exact" && Boolean(eligibility.ready);
  const knownGateReady = evidence === "gate-only" && Boolean(eligibility.ready);
  const close = !exactReady && !knownGateReady && blockerRows.length <= 1 && poolShortfall <= 1 && finite(eligibility.percent, 0) >= 60;

  return Object.freeze({
    member: memberBody,
    rosterAvailable: true,
    evidence,
    exactReady,
    knownGateReady,
    close,
    percent: finite(eligibility.percent, 0),
    poolCount,
    poolTarget,
    poolShortfall,
    mandatoryBlockers: blockerRows.length,
    blockerRows: Object.freeze(blockerRows),
    gapScore: blockerScore + depthScore,
    eligibility,
  });
}

function unitFactionSet(unit = {}) {
  return new Set([...asArray(unit.factions), ...asArray(unit.categories)].map((value) => String(value).toLowerCase()));
}

export function unitMatchesGuildMissionIdentity(unit = {}, mission = {}) {
  const rule = missionEntryRule(mission);
  if (String(unit.unitType || "Character").toLowerCase() !== String(rule.unitType || "Character").toLowerCase()) return false;
  const baseId = String(unit.baseId || "");
  if (rule.requiredBaseIds.length && !rule.requiredBaseIds.includes(baseId)) return false;
  if (rule.allowedBaseIds.length && !rule.allowedBaseIds.includes(baseId)) return false;
  if (rule.alignments.length) {
    const alignment = String(unit.alignment || "").toLowerCase();
    if (!rule.alignments.some((allowed) => String(allowed).toLowerCase() === alignment)) return false;
  }
  if (rule.categories.length) {
    const factions = unitFactionSet(unit);
    const checks = rule.categories.map((category) => factions.has(String(category).toLowerCase()));
    if (rule.categoryMode === "any" ? !checks.some(Boolean) : !checks.every(Boolean)) return false;
  }
  return true;
}

export function nearestGuildMissionPoolUpgrades(memberBody, mission, evaluation, limit = 3) {
  if (!memberBody?.rosterAvailable || guildRoteMissionEvidence(mission) !== "exact") return Object.freeze([]);
  if (finite(evaluation?.poolShortfall, 0) <= 0) return Object.freeze([]);
  const legalIds = new Set(asArray(evaluation?.eligibility?.candidates).map((unit) => String(unit.baseId || "")).filter(Boolean));
  const roster = [...asArray(memberBody.units), ...asArray(memberBody.ships)];
  const rows = roster
    .filter((unit) => unit?.baseId && !legalIds.has(String(unit.baseId)))
    .filter((unit) => unitMatchesGuildMissionIdentity(unit, mission))
    .map((unit) => ({ unit, gap: entryGap(unit, mission) }))
    .filter((row) => finite(row.gap?.score, 0) > 0)
    .sort((a, b) => finite(a.gap?.score) - finite(b.gap?.score) || finite(b.unit?.power) - finite(a.unit?.power) || String(a.unit?.name || "").localeCompare(String(b.unit?.name || "")))
    .slice(0, Math.max(1, limit));
  return Object.freeze(rows.map((row) => Object.freeze(row)));
}

function missionCoverageBand(readyCount, evidence) {
  if (evidence !== "exact") return "partial";
  if (readyCount === 0) return "zero";
  if (readyCount === 1) return "fragile";
  if (readyCount <= 3) return "thin";
  return "deep";
}

function missionIdentity(planet, mission) {
  return `${planet.id}:${mission.id}`;
}

function buildMissionRows(guildSnapshot, catalog) {
  const members = asArray(guildSnapshot?.members).map((member, index) => enrichGuildRoteMember(member, catalog, index));
  const missions = [];

  for (const planet of ROTE_PLANETS) {
    const map = roteMissionMap(planet.id);
    if (!map) continue;
    const resolved = resolveRoteMissionNodes(planet.id, map);
    const seen = new Set();
    for (const mission of resolved.missions || []) {
      if (!mission?.entry?.verified || seen.has(mission.id)) continue;
      seen.add(mission.id);
      const evidence = guildRoteMissionEvidence(mission);
      const evaluations = members.map((member) => evaluateGuildMemberForMission(member, mission)).sort(compareGuildMissionCandidates);
      const exactReady = evaluations.filter((row) => row.exactReady);
      const knownGateReady = evaluations.filter((row) => row.knownGateReady);
      const close = evaluations.filter((row) => row.close);
      missions.push({
        key: missionIdentity(planet, mission),
        planetId: planet.id,
        planetName: planet.name,
        phase: planet.phase,
        lane: planet.lane,
        mission,
        evidence,
        evaluations,
        exactReady,
        knownGateReady,
        close,
        coverageBand: missionCoverageBand(exactReady.length, evidence),
      });
    }
  }
  return { members, missions };
}

export function assignGuildRoteMissionLeads(missions = []) {
  const loads = new Map();
  const assignments = [];
  const exactMissions = asArray(missions)
    .filter((row) => row.evidence === "exact")
    .slice()
    .sort((a, b) => a.exactReady.length - b.exactReady.length || String(a.phase).localeCompare(String(b.phase)) || String(a.planetName).localeCompare(String(b.planetName)) || String(a.mission?.name || "").localeCompare(String(b.mission?.name || "")));

  for (const row of exactMissions) {
    if (!row.exactReady.length) {
      assignments.push(Object.freeze({ missionKey: row.key, mission: row, member: null, alternatives: Object.freeze([]) }));
      continue;
    }
    const candidates = row.exactReady.slice().sort((a, b) => {
      const loadDiff = finite(loads.get(a.member.id), 0) - finite(loads.get(b.member.id), 0);
      if (loadDiff) return loadDiff;
      return compareGuildMissionCandidates(a, b);
    });
    const chosen = candidates[0];
    loads.set(chosen.member.id, finite(loads.get(chosen.member.id), 0) + 1);
    assignments.push(Object.freeze({
      missionKey: row.key,
      mission: row,
      member: chosen.member,
      evaluation: chosen,
      alternatives: Object.freeze(candidates.slice(1, 4).map((candidate) => candidate.member)),
    }));
  }

  return Object.freeze(assignments);
}

function farmGapLabel(gap = {}) {
  if (gap?.missing) return "Acquire unit";
  const parts = [];
  if (finite(gap.stars) > 0) parts.push(`+${finite(gap.stars)}★`);
  if (finite(gap.gear) > 0) parts.push(`+${finite(gap.gear)} gear`);
  if (finite(gap.relic) > 0) parts.push(`+${finite(gap.relic)} relic`);
  if (finite(gap.power) > 0) parts.push(`+${finite(gap.power)} GP`);
  return parts.join(" · ") || "Entry gate met";
}

function aggregateFarmRows(rows = []) {
  const grouped = new Map();
  for (const row of rows) {
    const memberKey = String(row.member?.id || "");
    const unitKey = String(row.baseId || normalizeName(row.unitName));
    const key = `${memberKey}|${unitKey}`;
    if (!memberKey || !unitKey) continue;
    let item = grouped.get(key);
    if (!item) {
      item = {
        key,
        member: row.member,
        baseId: String(row.baseId || ""),
        unitName: String(row.unitName || row.baseId || "Required unit"),
        unit: row.unit || null,
        mandatoryMissions: new Map(),
        poolMissions: new Map(),
        gaps: [],
      };
      grouped.set(key, item);
    }
    if (!item.unit && row.unit) item.unit = row.unit;
    if (row.kind === "mandatory") item.mandatoryMissions.set(row.mission.key, row.mission);
    else item.poolMissions.set(row.mission.key, row.mission);
    if (row.gap) item.gaps.push(row.gap);
  }

  return [...grouped.values()].map((item) => {
    const mandatoryImpact = item.mandatoryMissions.size;
    const poolImpact = item.poolMissions.size;
    const missionImpact = new Set([...item.mandatoryMissions.keys(), ...item.poolMissions.keys()]).size;
    const maxGap = item.gaps.slice().sort((a, b) => finite(b?.score) - finite(a?.score))[0] || {};
    const minGap = item.gaps.slice().sort((a, b) => finite(a?.score) - finite(b?.score))[0] || {};
    return Object.freeze({
      ...item,
      mandatoryImpact,
      poolImpact,
      missionImpact,
      maxGap: Object.freeze({ ...maxGap }),
      minGap: Object.freeze({ ...minGap }),
      gapLabel: farmGapLabel(maxGap),
      missionRefs: Object.freeze([...item.mandatoryMissions.values(), ...item.poolMissions.values()]),
    });
  }).sort((a, b) => b.mandatoryImpact - a.mandatoryImpact
    || b.missionImpact - a.missionImpact
    || finite(a.minGap?.score, Number.MAX_SAFE_INTEGER) - finite(b.minGap?.score, Number.MAX_SAFE_INTEGER)
    || finite(b.member?.galacticPower) - finite(a.member?.galacticPower)
    || String(a.member?.name || "").localeCompare(String(b.member?.name || "")));
}

export function buildGuildRoteMissionFarms(missions = [], redundancyTarget = 2) {
  const rows = [];
  for (const missionRow of asArray(missions)) {
    if (missionRow.evidence !== "exact") continue;
    const neededOwners = Math.max(0, Math.floor(finite(redundancyTarget, 2)) - missionRow.exactReady.length);
    if (!neededOwners) continue;
    const near = missionRow.evaluations.filter((evaluation) => evaluation.rosterAvailable && !evaluation.exactReady).slice(0, Math.max(neededOwners * 2, 4));
    for (const evaluation of near) {
      for (const blocker of evaluation.blockerRows) {
        rows.push({
          kind: "mandatory",
          member: evaluation.member,
          baseId: String(blocker.baseId || blocker.unit?.baseId || blocker.member?.baseId || ""),
          unitName: String(blocker.name || blocker.unit?.name || blocker.member?.name || blocker.baseId || "Required unit"),
          unit: blocker.unit || null,
          gap: blocker.gap || {},
          mission: missionRow,
        });
      }
      if (evaluation.poolShortfall > 0) {
        for (const candidate of nearestGuildMissionPoolUpgrades(evaluation.member, missionRow.mission, evaluation, Math.min(3, evaluation.poolShortfall))) {
          rows.push({
            kind: "pool",
            member: evaluation.member,
            baseId: String(candidate.unit?.baseId || ""),
            unitName: String(candidate.unit?.name || candidate.unit?.baseId || "Pool candidate"),
            unit: candidate.unit,
            gap: candidate.gap,
            mission: missionRow,
          });
        }
      }
    }
  }
  return Object.freeze(aggregateFarmRows(rows));
}

export function buildGuildRoteMissionCoverage(guildSnapshot, catalog = [], options = {}) {
  const redundancyTarget = Math.max(1, Math.floor(finite(options.redundancyTarget, 2)));
  const { members, missions } = buildMissionRows(guildSnapshot, catalog);
  const leads = assignGuildRoteMissionLeads(missions);
  const farms = buildGuildRoteMissionFarms(missions, redundancyTarget);
  const leadCounts = new Map();
  for (const lead of leads) {
    if (!lead.member) continue;
    leadCounts.set(lead.member.id, finite(leadCounts.get(lead.member.id), 0) + 1);
  }

  const memberCoverage = members.map((member) => {
    const exactReady = missions.filter((mission) => mission.exactReady.some((row) => row.member.id === member.id)).length;
    const soleOwner = missions.filter((mission) => mission.exactReady.length === 1 && mission.exactReady[0]?.member.id === member.id).length;
    const close = missions.filter((mission) => mission.close.some((row) => row.member.id === member.id)).length;
    const knownGate = missions.filter((mission) => mission.knownGateReady.some((row) => row.member.id === member.id)).length;
    return Object.freeze({
      member,
      exactReady,
      soleOwner,
      close,
      knownGate,
      missionLeads: finite(leadCounts.get(member.id), 0),
    });
  }).sort((a, b) => b.soleOwner - a.soleOwner || b.exactReady - a.exactReady || b.missionLeads - a.missionLeads || String(a.member.name).localeCompare(String(b.member.name)));

  const exactMissions = missions.filter((mission) => mission.evidence === "exact");
  const partialMissions = missions.filter((mission) => mission.evidence !== "exact");
  const zeroCoverage = exactMissions.filter((mission) => mission.exactReady.length === 0);
  const fragile = exactMissions.filter((mission) => mission.exactReady.length === 1);
  const deep = exactMissions.filter((mission) => mission.exactReady.length >= Math.max(4, redundancyTarget + 2));
  const redundancyReady = exactMissions.filter((mission) => mission.exactReady.length >= redundancyTarget);

  return Object.freeze({
    redundancyTarget,
    members: Object.freeze(members),
    missions: Object.freeze(missions),
    leads,
    farms,
    memberCoverage: Object.freeze(memberCoverage),
    exactMissions: Object.freeze(exactMissions),
    partialMissions: Object.freeze(partialMissions),
    zeroCoverage: Object.freeze(zeroCoverage),
    fragile: Object.freeze(fragile),
    deep: Object.freeze(deep),
    summary: Object.freeze({
      hydratedMembers: members.filter((member) => member.rosterAvailable).length,
      totalMembers: members.length,
      verifiedMissions: missions.length,
      exactMissions: exactMissions.length,
      partialEvidenceMissions: partialMissions.length,
      zeroCoverageMissions: zeroCoverage.length,
      fragileMissions: fragile.length,
      redundancyReadyMissions: redundancyReady.length,
      exactCoveragePercent: exactMissions.length ? Math.round(((exactMissions.length - zeroCoverage.length) / exactMissions.length) * 1000) / 10 : 0,
      redundancyCoveragePercent: exactMissions.length ? Math.round((redundancyReady.length / exactMissions.length) * 1000) / 10 : 0,
    }),
  });
}
