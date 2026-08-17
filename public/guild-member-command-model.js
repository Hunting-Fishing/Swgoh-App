import { buildGuildRosterSnapshot } from "./guild-page-model.js";
import { buildGuildRoteMissionCoverage } from "./guild-rote-mission-coverage-model.js";
import { buildGuildRoteOperationProtectionsFromCoverage } from "./guild-rote-operation-safety.js";
import { planGuildRoteSafeAssignments } from "./guild-rote-safe-planner.js";
import { buildGuildTwCapability } from "./guild-tw-capability-model.js";
import { buildGuildOrder66Capability } from "./guild-raid-order66-model.js";

const asArray = (value) => Array.isArray(value) ? value : [];
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const digits = (value) => String(value || "").replace(/\D/g, "").slice(0, 9);
const text = (value) => String(value || "").trim();

function sameMember(member, target) {
  const targetDigits = digits(target);
  if (targetDigits.length === 9 && digits(member?.allyCode) === targetDigits) return true;
  const targetText = text(target);
  return Boolean(targetText) && [member?.id, member?.playerId, member?.memberId, member?.name, member?.memberName]
    .some((value) => String(value || "") === targetText);
}

function rankBy(rows, predicate, comparator) {
  const sorted = asArray(rows).filter(predicate).slice().sort(comparator);
  return (memberId) => {
    const index = sorted.findIndex((row) => String(row?.id || row?.memberId || row?.member?.id || "") === String(memberId || ""));
    return index >= 0 ? index + 1 : 0;
  };
}

function assignmentMemberId(row) {
  return String(row?.member?.playerId || row?.member?.allyCode || row?.member?.name || "");
}

function profileMemberId(member = {}) {
  return String(member?.playerId || member?.id || member?.allyCode || member?.name || "");
}

function matchingAssignment(row, member = {}) {
  const id = assignmentMemberId(row);
  return [member?.playerId, member?.id, member?.allyCode, member?.name].some((value) => String(value || "") === id);
}

function riskAssignment(row) {
  return Boolean(row?.safety?.help || row?.safety?.preference === "keep" || row?.safety?.protection);
}

function phaseLoads(assignments = []) {
  const map = new Map();
  for (const row of asArray(assignments)) map.set(String(row.phase || "Unknown"), finite(map.get(String(row.phase || "Unknown")), 0) + 1);
  return Object.freeze([...map.entries()].map(([phase, count]) => Object.freeze({ phase, count })).sort((a, b) => a.phase.localeCompare(b.phase)));
}

function ignoredMember(ignoredMembers, member = {}) {
  const ids = new Set(asArray(ignoredMembers).map(String));
  return [member?.playerId, member?.id, member?.allyCode, member?.name].some((value) => ids.has(String(value || "")));
}

function durableUnavailableRow(planningOverlay, member = {}) {
  return asArray(planningOverlay?.unavailableMembers).find((row) => {
    if (row?.memberId && [member?.playerId, member?.id, member?.allyCode, member?.name].some((value) => String(value || "") === String(row.memberId))) return true;
    return digits(row?.allyCode).length === 9 && digits(row?.allyCode) === digits(member?.allyCode);
  }) || null;
}

export function buildGuildMemberCommandProfile({
  guildSnapshot,
  catalog = [],
  operations = {},
  targetMember,
  redundancyTarget = 2,
  locks = [],
  reservations = [],
  preferences = [],
  ignoredMembers = [],
  planningOverlay = {},
} = {}) {
  const normalized = buildGuildRosterSnapshot(guildSnapshot, catalog);
  const rosterMember = normalized.members.find((member) => sameMember(member, targetMember));
  if (!rosterMember) return null;
  const rawMember = asArray(guildSnapshot?.members).find((member) => sameMember(member, targetMember)) || null;
  if (!rawMember) return null;
  const id = profileMemberId(rawMember);
  const unavailable = ignoredMember(ignoredMembers, rawMember);
  const durableUnavailable = durableUnavailableRow(planningOverlay, rawMember);

  const coverage = buildGuildRoteMissionCoverage(guildSnapshot, catalog, { redundancyTarget });
  const tbMember = coverage.memberCoverage.find((row) => sameMember(row.member, targetMember)) || null;
  const protections = buildGuildRoteOperationProtectionsFromCoverage(coverage);
  const plan = asArray(operations?.slots).length ? planGuildRoteSafeAssignments(guildSnapshot, operations, {
    maxPerTerritory: 10,
    locks,
    reservations,
    preferences,
    ignoredMembers,
    protections,
  }) : null;
  const assignments = asArray(plan?.assignments).filter((row) => matchingAssignment(row, rawMember));
  const memberProtections = protections.filter((row) => String(row.memberId) === id || [rawMember?.playerId, rawMember?.allyCode, rawMember?.name].some((value) => String(value || "") === String(row.memberId)));
  const farms = coverage.farms.filter((row) => sameMember(row.member, targetMember));

  const tw = buildGuildTwCapability(guildSnapshot, catalog);
  const twMember = tw.members.find((row) => sameMember({ ...row, id: row.memberId, name: row.memberName }, targetMember)) || null;
  const raid = buildGuildOrder66Capability(guildSnapshot, catalog);
  const raidMember = raid.members.find((row) => sameMember({ ...row, id: row.id, name: row.memberName }, targetMember)) || null;

  const gpRank = rankBy(normalized.members, (row) => row.rosterAvailable, (a, b) => finite(b.galacticPower) - finite(a.galacticPower) || String(a.name).localeCompare(String(b.name)))(rosterMember.id);
  const tbRank = rankBy(coverage.memberCoverage, () => true, (a, b) => finite(b.exactReady) - finite(a.exactReady) || finite(b.soleOwner) - finite(a.soleOwner) || String(a.member?.name || "").localeCompare(String(b.member?.name || "")))(tbMember?.member?.id);
  const twRank = rankBy(tw.members, () => true, (a, b) => finite(b.r7Factions) - finite(a.r7Factions) || finite(b.r5Factions) - finite(a.r5Factions) || finite(b.memberGp) - finite(a.memberGp))(twMember?.memberId);
  const raidRank = rankBy(raid.members, () => true, (a, b) => finite(b.bands?.r7) - finite(a.bands?.r7) || finite(b.bands?.r5) - finite(a.bands?.r5) || finite(b.memberGp) - finite(a.memberGp))(raidMember?.id);

  const exactMissionRows = coverage.exactMissions.filter((mission) => mission.exactReady.some((entry) => sameMember(entry.member, targetMember)));
  const soleOwnerRows = exactMissionRows.filter((mission) => mission.exactReady.length === 1);
  const missionLeadRows = coverage.leads.filter((lead) => lead.member && sameMember(lead.member, targetMember));
  const operationRisk = assignments.filter(riskAssignment);

  return Object.freeze({
    guild: normalized.guild,
    hydration: normalized.hydration,
    member: rosterMember,
    rawMember,
    availability: Object.freeze({
      unavailable,
      source: durableUnavailable ? "durable-discord" : unavailable ? "local-web" : planningOverlay?.bound ? "durable-discord" : "none",
      durableBound: Boolean(planningOverlay?.bound),
      overlayReason: text(planningOverlay?.reason),
      updatedAt: text(durableUnavailable?.updatedAt),
      operationEligible: !unavailable,
    }),
    ranks: Object.freeze({ gp: gpRank, tb: tbRank, tw: twRank, raid: raidRank }),
    tb: Object.freeze({
      exactReady: finite(tbMember?.exactReady, 0),
      soleOwner: finite(tbMember?.soleOwner, 0),
      close: finite(tbMember?.close, 0),
      knownGate: finite(tbMember?.knownGate, 0),
      missionLeads: finite(tbMember?.missionLeads, 0),
      exactMissionRows: Object.freeze(exactMissionRows),
      soleOwnerRows: Object.freeze(soleOwnerRows),
      missionLeadRows: Object.freeze(missionLeadRows),
      farmRows: Object.freeze(farms.slice(0, 12)),
      protectedUnits: Object.freeze(memberProtections),
      operationAssignments: Object.freeze(assignments),
      operationRiskAssignments: Object.freeze(operationRisk),
      operationPhaseLoads: phaseLoads(assignments),
      operationAssignedCount: assignments.length,
      operationRiskCount: operationRisk.length,
    }),
    tw: Object.freeze({
      completeFactions: finite(twMember?.completeFactions, 0),
      r5Factions: finite(twMember?.r5Factions, 0),
      r7Factions: finite(twMember?.r7Factions, 0),
      leaderCapableFactions: finite(twMember?.leaderCapableFactions, 0),
      strongestFactions: Object.freeze(asArray(twMember?.strongestFactions)),
    }),
    raid: Object.freeze({
      eligibleOwned: finite(raidMember?.eligibleOwnedCount, 0),
      bands: Object.freeze({ ...(raidMember?.bands || {}) }),
      fiveCharacterPools: Object.freeze({ ...(raidMember?.fiveCharacterPools || {}) }),
      strongestEligible: Object.freeze(asArray(raidMember?.strongestEligible)),
      groups: Object.freeze(asArray(raidMember?.groups)),
    }),
  });
}
