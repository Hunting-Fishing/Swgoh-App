const asArray = (value) => Array.isArray(value) ? value : [];
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function memberId(member, index = 0) {
  return String(member?.id || member?.playerId || member?.allyCode || member?.name || `member-${index + 1}`);
}

function phaseNumber(value) {
  const match = String(value || "").match(/\d+/);
  return match ? Number(match[0]) : Number.MAX_SAFE_INTEGER;
}

function missionName(row = {}) {
  return String(row?.mission?.name || row?.mission?.id || row?.key || "ROTE mission");
}

function assignmentRisk(row = {}) {
  const preference = String(row?.safety?.preference || "default");
  if (preference === "keep") return "keep";
  if (row?.safety?.protection && preference !== "give") return "protected";
  return preference === "give" ? "give" : "safe";
}

function operationKey(row = {}) {
  return `${String(row.phase || "")}|${String(row.conflictId || "")}|${String(row.squadId || "")}`;
}

export function normalizeGuildTbPhase(value, fallback = "P1") {
  const text = String(value || "").toUpperCase();
  return /^P[1-6]$/.test(text) ? text : fallback;
}

export function guildTbPhaseOptions(coverage = {}, safePlan = {}) {
  const values = new Set();
  for (const row of asArray(coverage?.missions)) if (/^P[1-6]$/.test(String(row?.phase || ""))) values.add(String(row.phase));
  for (const row of asArray(safePlan?.assignments)) if (/^P[1-6]$/.test(String(row?.phase || ""))) values.add(String(row.phase));
  for (const row of asArray(safePlan?.unfilled)) if (/^P[1-6]$/.test(String(row?.phase || ""))) values.add(String(row.phase));
  return Object.freeze([...values].sort((a, b) => phaseNumber(a) - phaseNumber(b)));
}

function buildMemberRows(guildSnapshot, phaseMissions, assignments, protections) {
  const protectionKeys = new Map();
  for (const row of protections) {
    if (!row?.memberId || !row?.baseId) continue;
    const id = String(row.memberId);
    const list = protectionKeys.get(id) || [];
    list.push(row);
    protectionKeys.set(id, list);
  }

  const missionReadyByMember = new Map();
  const soleOwnerByMember = new Map();
  const closeByMember = new Map();
  for (const mission of phaseMissions) {
    for (const evaluation of asArray(mission?.exactReady)) {
      const id = memberId(evaluation?.member);
      missionReadyByMember.set(id, finite(missionReadyByMember.get(id), 0) + 1);
    }
    if (asArray(mission?.exactReady).length === 1) {
      const id = memberId(mission.exactReady[0]?.member);
      soleOwnerByMember.set(id, finite(soleOwnerByMember.get(id), 0) + 1);
    }
    for (const evaluation of asArray(mission?.close)) {
      const id = memberId(evaluation?.member);
      closeByMember.set(id, finite(closeByMember.get(id), 0) + 1);
    }
  }

  const assignmentByMember = new Map();
  for (const row of assignments) {
    const id = String(row?.member?.playerId || row?.member?.allyCode || row?.member?.name || "");
    if (!id) continue;
    const list = assignmentByMember.get(id) || [];
    list.push(row);
    assignmentByMember.set(id, list);
  }

  return Object.freeze(asArray(guildSnapshot?.members).map((member, index) => {
    const id = memberId(member, index);
    const memberAssignments = assignmentByMember.get(id) || [];
    const risks = memberAssignments.filter((row) => ["keep", "protected"].includes(assignmentRisk(row)));
    const protectionRows = protectionKeys.get(id) || [];
    const ready = finite(missionReadyByMember.get(id), 0);
    const sole = finite(soleOwnerByMember.get(id), 0);
    const close = finite(closeByMember.get(id), 0);
    const opCount = memberAssignments.length;
    const burden = (sole * 100) + (risks.length * 60) + (opCount * 5) + (protectionRows.length * 3) + ready;
    return Object.freeze({
      id,
      playerId: String(member?.playerId || ""),
      allyCode: String(member?.allyCode || ""),
      name: String(member?.name || id),
      galacticPower: finite(member?.galacticPower, 0),
      rosterAvailable: Boolean(member?.rosterAvailable),
      missionReady: ready,
      soleOwnerMissions: sole,
      closeMissions: close,
      operationAssignments: opCount,
      riskyAssignments: risks.length,
      protectedUnits: protectionRows.length,
      burden,
      assignments: Object.freeze(memberAssignments),
      protections: Object.freeze(protectionRows),
    });
  }).sort((a, b) => b.burden - a.burden || b.soleOwnerMissions - a.soleOwnerMissions || b.riskyAssignments - a.riskyAssignments || b.galacticPower - a.galacticPower || a.name.localeCompare(b.name)));
}

function buildAlerts({ phase, exactMissions, unfilled, assignments, farms }) {
  const alerts = [];
  for (const mission of exactMissions.filter((row) => asArray(row?.exactReady).length === 0)) {
    alerts.push(Object.freeze({
      severity: "critical",
      kind: "mission-zero",
      phase,
      title: `No exact-ready member · ${missionName(mission)}`,
      detail: `${mission.planetName || mission.planetId || "ROTE"} has zero verified-entry owners in the hydrated guild roster.`,
      key: mission.key,
    }));
  }
  for (const row of unfilled) {
    alerts.push(Object.freeze({
      severity: "critical",
      kind: "operation-unfilled",
      phase,
      title: `Unfilled Operation slot · ${row.name || row.baseId || "Required unit"}`,
      detail: `${row.conflictId || "Territory"} · ${row.squadId || "Operation"} · ${finite(row.safeOwners)} safe / ${finite(row.availableOwners)} assignable / ${finite(row.eligibleOwners)} physical owners.`,
      key: String(row.id || `${row.conflictId}:${row.squadId}:${row.slot}`),
    }));
  }
  for (const mission of exactMissions.filter((row) => asArray(row?.exactReady).length === 1)) {
    const owner = mission.exactReady[0]?.member?.name || "one member";
    alerts.push(Object.freeze({
      severity: "warning",
      kind: "mission-fragile",
      phase,
      title: `Single-owner mission · ${missionName(mission)}`,
      detail: `${mission.planetName || mission.planetId || "ROTE"} currently depends on ${owner}.`,
      key: mission.key,
    }));
  }
  for (const row of assignments.filter((assignment) => ["keep", "protected"].includes(assignmentRisk(assignment)))) {
    alerts.push(Object.freeze({
      severity: "warning",
      kind: "operation-risk",
      phase,
      title: `${assignmentRisk(row) === "keep" ? "KEEP override" : "Mission-protected donor"} · ${row.name || row.baseId}`,
      detail: `${row.member?.name || "Member"} is assigned in ${row.conflictId || "territory"}; completing this Operation may consume a roster-protected unit.`,
      key: String(row.id || `${row.member?.name}:${row.baseId}:${row.slot}`),
    }));
  }
  for (const farm of farms.slice(0, 5)) {
    alerts.push(Object.freeze({
      severity: "info",
      kind: "farm",
      phase,
      title: `Coverage farm · ${farm.unitName || farm.baseId}`,
      detail: `${farm.member?.name || "Member"} · ${farm.gapLabel || "upgrade needed"} · impacts ${finite(farm.missionImpact)} mission${finite(farm.missionImpact) === 1 ? "" : "s"}.`,
      key: farm.key,
    }));
  }
  const rank = { critical: 0, warning: 1, info: 2 };
  return Object.freeze(alerts.sort((a, b) => rank[a.severity] - rank[b.severity] || a.title.localeCompare(b.title)));
}

export function buildGuildTbPhaseCommand({ guildSnapshot, coverage, safePlan, safety, phase }) {
  const selectedPhase = normalizeGuildTbPhase(phase, guildTbPhaseOptions(coverage, safePlan)[0] || "P1");
  const missions = asArray(coverage?.missions).filter((row) => String(row?.phase || "") === selectedPhase);
  const exactMissions = missions.filter((row) => row?.evidence === "exact");
  const partialMissions = missions.filter((row) => row?.evidence !== "exact");
  const assignments = asArray(safePlan?.assignments).filter((row) => String(row?.phase || "") === selectedPhase);
  const unfilled = asArray(safePlan?.unfilled).filter((row) => String(row?.phase || "") === selectedPhase);
  const protections = asArray(safety?.protections).filter((row) => String(row?.phase || "") === selectedPhase);
  const farms = asArray(coverage?.farms).filter((row) => asArray(row?.missionRefs).some((mission) => String(mission?.phase || "") === selectedPhase));

  const zeroCoverage = exactMissions.filter((row) => asArray(row?.exactReady).length === 0);
  const singleOwner = exactMissions.filter((row) => asArray(row?.exactReady).length === 1);
  const redundancyTarget = Math.max(1, finite(coverage?.redundancyTarget, safety?.redundancyTarget || 2));
  const redundancyReady = exactMissions.filter((row) => asArray(row?.exactReady).length >= redundancyTarget);
  const riskyAssignments = assignments.filter((row) => ["keep", "protected"].includes(assignmentRisk(row)));
  const giveAssignments = assignments.filter((row) => assignmentRisk(row) === "give");
  const operationGroups = new Set([...assignments, ...unfilled].map(operationKey));
  const totalOperationSlots = assignments.length + unfilled.length;
  const operationCoveragePercent = totalOperationSlots ? Math.round((assignments.length / totalOperationSlots) * 1000) / 10 : 0;
  const exactCoveragePercent = exactMissions.length ? Math.round(((exactMissions.length - zeroCoverage.length) / exactMissions.length) * 1000) / 10 : 0;
  const redundancyCoveragePercent = exactMissions.length ? Math.round((redundancyReady.length / exactMissions.length) * 1000) / 10 : 0;

  const members = buildMemberRows(guildSnapshot, exactMissions, assignments, protections);
  const alerts = buildAlerts({ phase: selectedPhase, exactMissions, unfilled, assignments, farms });

  return Object.freeze({
    phase: selectedPhase,
    redundancyTarget,
    missions: Object.freeze(missions),
    exactMissions: Object.freeze(exactMissions),
    partialMissions: Object.freeze(partialMissions),
    zeroCoverage: Object.freeze(zeroCoverage),
    singleOwner: Object.freeze(singleOwner),
    redundancyReady: Object.freeze(redundancyReady),
    assignments: Object.freeze(assignments),
    unfilled: Object.freeze(unfilled),
    riskyAssignments: Object.freeze(riskyAssignments),
    giveAssignments: Object.freeze(giveAssignments),
    protections: Object.freeze(protections),
    farms: Object.freeze(farms),
    members,
    alerts,
    summary: Object.freeze({
      hydratedMembers: asArray(guildSnapshot?.members).filter((row) => row?.rosterAvailable).length,
      totalMembers: asArray(guildSnapshot?.members).length,
      exactMissions: exactMissions.length,
      zeroCoverageMissions: zeroCoverage.length,
      singleOwnerMissions: singleOwner.length,
      partialEvidenceMissions: partialMissions.length,
      exactCoveragePercent,
      redundancyCoveragePercent,
      operationGroups: operationGroups.size,
      operationSlots: totalOperationSlots,
      assignedOperationSlots: assignments.length,
      unfilledOperationSlots: unfilled.length,
      operationCoveragePercent,
      riskyAssignments: riskyAssignments.length,
      giveAssignments: giveAssignments.length,
      protectedUnits: protections.length,
      farmPriorities: farms.length,
    }),
  });
}
