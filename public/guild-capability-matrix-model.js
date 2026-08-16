import { buildGuildRosterSnapshot } from "./guild-page-model.js";
import { buildGuildRoteMissionCoverage } from "./guild-rote-mission-coverage-model.js";
import { buildGuildRoteOperationProtectionsFromCoverage } from "./guild-rote-operation-safety.js";
import { planGuildRoteSafeAssignments } from "./guild-rote-safe-planner.js";
import { buildGuildTwCapability } from "./guild-tw-capability-model.js";
import { buildGuildOrder66Capability } from "./guild-raid-order66-model.js";

const asArray = (value) => Array.isArray(value) ? value : [];
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const text = (value) => String(value || "").trim();
const digits = (value) => String(value || "").replace(/\D/g, "");

function memberKeys(member = {}) {
  return new Set([member?.playerId, member?.id, member?.allyCode, member?.name].map((value) => String(value || "")).filter(Boolean));
}

function sameMember(left = {}, right = {}) {
  const leftKeys = memberKeys(left);
  const rightKeys = memberKeys(right);
  for (const key of leftKeys) if (rightKeys.has(key)) return true;
  const leftAlly = digits(left?.allyCode);
  const rightAlly = digits(right?.allyCode);
  return leftAlly.length === 9 && leftAlly === rightAlly;
}

function canonicalId(member = {}) {
  return text(member?.playerId || member?.id || member?.allyCode || member?.name);
}

function assignmentMember(row = {}) {
  return {
    playerId: row?.member?.playerId,
    allyCode: row?.member?.allyCode,
    name: row?.member?.name,
  };
}

function riskAssignment(row = {}) {
  return Boolean(row?.safety?.help || row?.safety?.preference === "keep" || row?.safety?.protection);
}

function ignoredMember(ignoredMembers = [], member = {}) {
  const keys = memberKeys(member);
  const ignored = new Set(asArray(ignoredMembers).map(String));
  for (const key of keys) if (ignored.has(key)) return true;
  return false;
}

function durableUnavailable(planningOverlay = {}, member = {}) {
  return asArray(planningOverlay?.unavailableMembers).find((row) => sameMember({
    id: row?.memberId,
    playerId: row?.memberId,
    allyCode: row?.allyCode,
    name: row?.memberName,
  }, member)) || null;
}

function phaseLoad(assignments = []) {
  const counts = new Map();
  for (const row of asArray(assignments)) {
    const phase = text(row?.phase || "Unknown");
    counts.set(phase, (counts.get(phase) || 0) + 1);
  }
  return Object.freeze([...counts.entries()].map(([phase, count]) => Object.freeze({ phase, count })).sort((a, b) => a.phase.localeCompare(b.phase)));
}

function attentionReasons(row = {}) {
  const reasons = [];
  if (!row.rosterAvailable) reasons.push({ code: "roster-unavailable", severity: "critical", label: "Roster hydration unavailable" });
  if (row.operationUnavailable && row.tbSoleOwner > 0) reasons.push({ code: "unavailable-sole-owner", severity: "critical", label: `Unavailable for Operations · ${row.tbSoleOwner} sole-owner TB mission${row.tbSoleOwner === 1 ? "" : "s"}` });
  if (row.operationRisk > 0) reasons.push({ code: "operation-risk", severity: "high", label: `${row.operationRisk} HELP / protected Operation assignment${row.operationRisk === 1 ? "" : "s"}` });
  if (row.tbSoleOwner > 0 && !row.operationUnavailable) reasons.push({ code: "sole-owner", severity: "medium", label: `${row.tbSoleOwner} sole-owner TB mission${row.tbSoleOwner === 1 ? "" : "s"}` });
  if (row.protectedUnits > 0 && row.operationAssignments > 0) reasons.push({ code: "protected-load", severity: "low", label: `${row.protectedUnits} protected unit${row.protectedUnits === 1 ? "" : "s"} with Operation load` });
  return Object.freeze(reasons.map(Object.freeze));
}

function attentionWeight(reasons = []) {
  const weights = { critical: 1000, high: 250, medium: 50, low: 10 };
  return asArray(reasons).reduce((sum, reason) => sum + (weights[reason.severity] || 0), 0);
}

export function buildGuildCapabilityMatrix({
  guildSnapshot,
  catalog = [],
  operations = {},
  redundancyTarget = 2,
  locks = [],
  reservations = [],
  preferences = [],
  ignoredMembers = [],
  planningOverlay = {},
} = {}) {
  const roster = buildGuildRosterSnapshot(guildSnapshot, catalog);
  const coverage = buildGuildRoteMissionCoverage(guildSnapshot, catalog, { redundancyTarget });
  const protections = buildGuildRoteOperationProtectionsFromCoverage(coverage);
  const operationsPlan = asArray(operations?.slots).length ? planGuildRoteSafeAssignments(guildSnapshot, operations, {
    maxPerTerritory: 10,
    locks,
    reservations,
    preferences,
    ignoredMembers,
    protections,
  }) : null;
  const tw = buildGuildTwCapability(guildSnapshot, catalog);
  const raid = buildGuildOrder66Capability(guildSnapshot, catalog);

  const rawMembers = asArray(guildSnapshot?.members);
  const rows = roster.members.map((member) => {
    const raw = rawMembers.find((candidate) => sameMember(candidate, member)) || member;
    const tb = coverage.memberCoverage.find((entry) => sameMember(entry.member, raw)) || {};
    const twRow = tw.members.find((entry) => sameMember({ id: entry.memberId, playerId: entry.playerId, allyCode: entry.allyCode, name: entry.memberName }, raw)) || {};
    const raidRow = raid.members.find((entry) => sameMember({ id: entry.id, playerId: entry.playerId, allyCode: entry.allyCode, name: entry.memberName }, raw)) || {};
    const assignments = asArray(operationsPlan?.assignments).filter((entry) => sameMember(assignmentMember(entry), raw));
    const operationRiskRows = assignments.filter(riskAssignment);
    const memberProtections = protections.filter((entry) => memberKeys(raw).has(String(entry?.memberId || "")));
    const durableRow = durableUnavailable(planningOverlay, raw);
    const operationUnavailable = ignoredMember(ignoredMembers, raw);

    const base = {
      id: canonicalId(raw),
      playerId: text(raw?.playerId || raw?.id),
      allyCode: digits(raw?.allyCode),
      name: text(raw?.name || member.name),
      rosterAvailable: Boolean(member.rosterAvailable),
      galacticPower: finite(member.galacticPower, 0),
      characterGp: finite(member.characterGp, 0),
      shipGp: finite(member.shipGp, 0),
      galacticLegends: finite(member.galacticLegendCount, 0),
      relic7: finite(member.relic7, 0),
      relic9: finite(member.relic9, 0),
      operationUnavailable,
      availabilitySource: durableRow ? "durable-discord" : operationUnavailable ? "local-web" : planningOverlay?.bound ? "durable-discord" : "none",
      availabilityUpdatedAt: text(durableRow?.updatedAt),
      tbExactReady: finite(tb?.exactReady, 0),
      tbSoleOwner: finite(tb?.soleOwner, 0),
      tbClose: finite(tb?.close, 0),
      tbMissionLeads: finite(tb?.missionLeads, 0),
      operationAssignments: assignments.length,
      operationRisk: operationRiskRows.length,
      operationPhaseLoad: phaseLoad(assignments),
      protectedUnits: memberProtections.length,
      twCompleteFactions: finite(twRow?.completeFactions, 0),
      twR5Factions: finite(twRow?.r5Factions, 0),
      twR7Factions: finite(twRow?.r7Factions, 0),
      twLeaderFactions: finite(twRow?.leaderCapableFactions, 0),
      raidEligibleOwned: finite(raidRow?.eligibleOwnedCount, 0),
      raidR5: finite(raidRow?.bands?.r5, 0),
      raidR7: finite(raidRow?.bands?.r7, 0),
      raidR9: finite(raidRow?.bands?.r9, 0),
    };
    const reasons = attentionReasons(base);
    return Object.freeze({ ...base, attentionReasons: reasons, attentionWeight: attentionWeight(reasons) });
  });

  const sorted = rows.slice().sort((a, b) => b.attentionWeight - a.attentionWeight
    || b.tbSoleOwner - a.tbSoleOwner
    || b.operationRisk - a.operationRisk
    || b.galacticPower - a.galacticPower
    || a.name.localeCompare(b.name));

  return Object.freeze({
    guild: roster.guild,
    hydration: roster.hydration,
    planning: Object.freeze({
      durableBound: Boolean(planningOverlay?.bound),
      source: text(planningOverlay?.source || "none"),
      reason: text(planningOverlay?.reason || ""),
      redundancyTarget,
    }),
    rows: Object.freeze(sorted),
    summary: Object.freeze({
      totalMembers: rows.length,
      hydratedMembers: rows.filter((row) => row.rosterAvailable).length,
      operationUnavailableMembers: rows.filter((row) => row.operationUnavailable).length,
      attentionMembers: rows.filter((row) => row.attentionReasons.length > 0).length,
      soleOwnerMembers: rows.filter((row) => row.tbSoleOwner > 0).length,
      exactReadyMemberMissions: rows.reduce((sum, row) => sum + row.tbExactReady, 0),
      operationAssignments: rows.reduce((sum, row) => sum + row.operationAssignments, 0),
      operationRiskAssignments: rows.reduce((sum, row) => sum + row.operationRisk, 0),
      twR7FactionCores: rows.reduce((sum, row) => sum + row.twR7Factions, 0),
      raidR7EligibleUnits: rows.reduce((sum, row) => sum + row.raidR7, 0),
      raidR9EligibleUnits: rows.reduce((sum, row) => sum + row.raidR9, 0),
    }),
  });
}

export function filterGuildCapabilityRows(rows = [], options = {}) {
  const search = text(options.search).toLowerCase().replace(/-/g, "");
  const view = text(options.view || "All");
  const sort = text(options.sort || "attention");
  let filtered = asArray(rows).filter((row) => {
    if (view === "Attention" && row.attentionReasons.length === 0) return false;
    if (view === "Unavailable" && !row.operationUnavailable) return false;
    if (view === "TBCritical" && row.tbSoleOwner <= 0) return false;
    if (view === "OperationRisk" && row.operationRisk <= 0) return false;
    if (view === "TWR7" && row.twR7Factions <= 0) return false;
    if (view === "RaidR7" && row.raidR7 <= 0) return false;
    if (!search) return true;
    return [row.name, row.allyCode, ...row.attentionReasons.map((reason) => reason.label)]
      .join(" ").toLowerCase().replace(/-/g, "").includes(search);
  });

  const comparators = {
    attention: (a, b) => b.attentionWeight - a.attentionWeight || b.tbSoleOwner - a.tbSoleOwner || b.operationRisk - a.operationRisk || b.galacticPower - a.galacticPower,
    gp: (a, b) => b.galacticPower - a.galacticPower || a.name.localeCompare(b.name),
    tb: (a, b) => b.tbExactReady - a.tbExactReady || b.tbSoleOwner - a.tbSoleOwner || b.galacticPower - a.galacticPower,
    sole: (a, b) => b.tbSoleOwner - a.tbSoleOwner || b.tbExactReady - a.tbExactReady,
    operations: (a, b) => b.operationAssignments - a.operationAssignments || b.operationRisk - a.operationRisk,
    tw: (a, b) => b.twR7Factions - a.twR7Factions || b.twR5Factions - a.twR5Factions || b.galacticPower - a.galacticPower,
    raid: (a, b) => b.raidR7 - a.raidR7 || b.raidR9 - a.raidR9 || b.galacticPower - a.galacticPower,
    name: (a, b) => a.name.localeCompare(b.name),
  };
  return Object.freeze(filtered.slice().sort(comparators[sort] || comparators.attention));
}
