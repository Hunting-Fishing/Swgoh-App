import { buildGuildRoteMissionCoverage } from "./guild-rote-mission-coverage-model.js";
import { missionSlotModel } from "./tb-mission-slot-model.js";

const asArray = (value) => Array.isArray(value) ? value : [];
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function protectionKey(memberId, phase, baseId) {
  return `${String(memberId)}|${String(phase)}|${String(baseId)}`;
}

function severityForMission(ownerCount, redundancyTarget, role) {
  let severity = 30;
  if (ownerCount <= 1) severity = 100;
  else if (ownerCount <= redundancyTarget) severity = 82;
  else if (ownerCount <= redundancyTarget + 1) severity = 58;
  if (role === "mandatory") severity = Math.min(100, severity + 12);
  return severity;
}

function reasonForMission(missionRow, role, ownerCount, redundancyTarget) {
  const missionName = String(missionRow?.mission?.name || "ROTE mission");
  const planet = String(missionRow?.planetName || missionRow?.planetId || "ROTE");
  const coverage = ownerCount <= 1
    ? "sole exact-ready owner"
    : ownerCount <= redundancyTarget
      ? `${ownerCount} exact-ready owners vs ${redundancyTarget}-owner target`
      : `${ownerCount} exact-ready owners`;
  return `${planet} · ${missionName} · ${role === "mandatory" ? "required mission unit" : "tight flexible entry depth"} · ${coverage}`;
}

function addProtection(map, input) {
  const memberId = String(input.memberId || "");
  const phase = String(input.phase || "");
  const baseId = String(input.baseId || "");
  if (!memberId || !phase || !baseId) return;
  const key = protectionKey(memberId, phase, baseId);
  let row = map.get(key);
  if (!row) {
    row = {
      memberId,
      phase,
      baseId,
      unitName: String(input.unitName || baseId),
      severity: finite(input.severity, 0),
      mandatory: Boolean(input.mandatory),
      missions: new Map(),
      reasons: new Set(),
    };
    map.set(key, row);
  }
  row.severity = Math.max(row.severity, finite(input.severity, 0));
  row.mandatory = row.mandatory || Boolean(input.mandatory);
  if (input.missionKey) row.missions.set(String(input.missionKey), {
    key: String(input.missionKey),
    planetName: String(input.planetName || ""),
    missionName: String(input.missionName || ""),
  });
  if (input.reason) row.reasons.add(String(input.reason));
}

export function buildGuildRoteOperationProtectionsFromCoverage(coverage = {}) {
  const redundancyTarget = Math.max(1, Math.floor(finite(coverage?.redundancyTarget, 2)));
  const protections = new Map();

  for (const missionRow of asArray(coverage?.exactMissions)) {
    const ownerCount = asArray(missionRow?.exactReady).length;
    if (!ownerCount) continue;
    const phase = String(missionRow?.phase || "");
    if (!/^P[1-6]$/.test(phase)) continue;

    for (const evaluation of asArray(missionRow.exactReady)) {
      const memberId = String(evaluation?.member?.id || evaluation?.member?.playerId || evaluation?.member?.allyCode || "");
      if (!memberId) continue;

      for (const mandatory of asArray(evaluation?.eligibility?.mandatory).filter((row) => row?.legal && row?.unit?.baseId)) {
        addProtection(protections, {
          memberId,
          phase,
          baseId: mandatory.unit.baseId,
          unitName: mandatory.unit.name || mandatory.name,
          severity: severityForMission(ownerCount, redundancyTarget, "mandatory"),
          mandatory: true,
          missionKey: missionRow.key,
          planetName: missionRow.planetName,
          missionName: missionRow.mission?.name,
          reason: reasonForMission(missionRow, "mandatory", ownerCount, redundancyTarget),
        });
      }

      const slotModel = missionSlotModel(missionRow.mission, evaluation.eligibility);
      if (slotModel.flexSlots <= 0 || slotModel.flexCandidates.length > slotModel.flexSlots) continue;
      for (const unit of slotModel.flexCandidates) {
        if (!unit?.baseId) continue;
        addProtection(protections, {
          memberId,
          phase,
          baseId: unit.baseId,
          unitName: unit.name || unit.baseId,
          severity: severityForMission(ownerCount, redundancyTarget, "flex"),
          mandatory: false,
          missionKey: missionRow.key,
          planetName: missionRow.planetName,
          missionName: missionRow.mission?.name,
          reason: reasonForMission(missionRow, "flex", ownerCount, redundancyTarget),
        });
      }
    }
  }

  return Object.freeze([...protections.values()].map((row) => Object.freeze({
    memberId: row.memberId,
    phase: row.phase,
    baseId: row.baseId,
    unitName: row.unitName,
    severity: row.severity,
    mandatory: row.mandatory,
    missions: Object.freeze([...row.missions.values()].map(Object.freeze)),
    reasons: Object.freeze([...row.reasons]),
  })).sort((a, b) => b.severity - a.severity || a.phase.localeCompare(b.phase) || a.unitName.localeCompare(b.unitName)));
}

export function buildGuildRoteOperationSafety(guildSnapshot, catalog = [], options = {}) {
  const redundancyTarget = Math.max(1, Math.min(5, Math.floor(finite(options.redundancyTarget, 2))));
  const coverage = buildGuildRoteMissionCoverage(guildSnapshot, catalog, { redundancyTarget });
  const protections = buildGuildRoteOperationProtectionsFromCoverage(coverage);
  const members = new Set(protections.map((row) => row.memberId));
  const critical = protections.filter((row) => row.severity >= 80);
  return Object.freeze({
    redundancyTarget,
    coverage,
    protections,
    summary: Object.freeze({
      protectedUnits: protections.length,
      protectedMembers: members.size,
      criticalProtections: critical.length,
      mandatoryProtections: protections.filter((row) => row.mandatory).length,
    }),
  });
}
