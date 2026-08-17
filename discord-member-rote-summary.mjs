function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function digits(value) {
  return String(value || "").replace(/\D/g, "");
}

function text(value) {
  return String(value || "").trim();
}

function identityKeys(linkedPlayer = {}) {
  const member = linkedPlayer?.member || {};
  return Object.freeze({
    allyCode: digits(linkedPlayer?.link?.swgohAllyCode || member?.allyCode),
    playerId: text(linkedPlayer?.link?.playerId || member?.playerId),
    name: text(member?.name).toLowerCase(),
  });
}

function matchesMember(candidate = {}, identity = {}) {
  const member = candidate?.member || candidate || {};
  const allyCode = digits(member?.allyCode || member?.swgohAllyCode);
  if (identity.allyCode && allyCode && allyCode === identity.allyCode) return true;
  const playerId = text(member?.playerId || member?.id);
  if (identity.playerId && playerId && playerId === identity.playerId) return true;
  const name = text(member?.name).toLowerCase();
  return Boolean(identity.name && name && name === identity.name);
}

function assignmentRisk(row = {}) {
  return Boolean(row?.safety?.protection || row?.safety?.preference === "keep" || row?.safety?.help);
}

function phaseOfFarm(row = {}) {
  return [...new Set(asArray(row?.missionRefs).map((mission) => text(mission?.phase)).filter((phase) => /^P[1-6]$/.test(phase)))].sort();
}

export function buildDiscordMemberRoteSummary({ linkedPlayer = {}, planningSnapshot = {} } = {}) {
  const identity = identityKeys(linkedPlayer);
  if (!identity.allyCode && !identity.playerId && !identity.name) throw new Error("A linked SWGOH player identity is required for the personal ROTE summary.");

  const missions = asArray(planningSnapshot?.safety?.coverage?.missions);
  const exactMissions = asArray(planningSnapshot?.safety?.coverage?.exactMissions);
  const missionRows = exactMissions.length ? exactMissions : missions.filter((row) => row?.evidence === "exact");
  const assignments = asArray(planningSnapshot?.plan?.assignments).filter((row) => matchesMember(row?.member, identity));
  const protections = asArray(planningSnapshot?.safety?.protections).filter((row) => {
    const memberId = text(row?.memberId);
    return Boolean((identity.playerId && memberId === identity.playerId) || (identity.allyCode && memberId === identity.allyCode));
  });
  const farms = asArray(planningSnapshot?.safety?.coverage?.farms).filter((row) => matchesMember(row?.member, identity));

  const phaseMap = new Map(["P1", "P2", "P3", "P4", "P5", "P6"].map((phase) => [phase, {
    phase, ready: 0, sole: 0, close: 0, operations: 0, riskyOperations: 0, farms: 0,
  }]));

  let missionReady = 0;
  let soleOwnerMissions = 0;
  let closeMissions = 0;
  for (const mission of missionRows) {
    const phaseRow = phaseMap.get(text(mission?.phase));
    const readyOwners = asArray(mission?.exactReady);
    const isReady = readyOwners.some((row) => matchesMember(row, identity));
    const isClose = asArray(mission?.close).some((row) => matchesMember(row, identity));
    if (isReady) {
      missionReady += 1;
      if (phaseRow) phaseRow.ready += 1;
      if (readyOwners.length === 1) {
        soleOwnerMissions += 1;
        if (phaseRow) phaseRow.sole += 1;
      }
    } else if (isClose) {
      closeMissions += 1;
      if (phaseRow) phaseRow.close += 1;
    }
  }

  for (const assignment of assignments) {
    const phaseRow = phaseMap.get(text(assignment?.phase));
    if (!phaseRow) continue;
    phaseRow.operations += 1;
    if (assignmentRisk(assignment)) phaseRow.riskyOperations += 1;
  }

  for (const farm of farms) {
    for (const phase of phaseOfFarm(farm)) {
      const phaseRow = phaseMap.get(phase);
      if (phaseRow) phaseRow.farms += 1;
    }
  }

  return Object.freeze({
    missionReady,
    soleOwnerMissions,
    closeMissions,
    operationAssignments: assignments.length,
    riskyAssignments: assignments.filter(assignmentRisk).length,
    protectedUnits: protections.length,
    assignments: Object.freeze(assignments.map((row) => Object.freeze({
      phase: text(row?.phase),
      baseId: text(row?.baseId),
      name: text(row?.name || row?.baseId || "Operation unit"),
      risky: assignmentRisk(row),
      safetyStatus: text(row?.safety?.status || (assignmentRisk(row) ? "CHECK" : "SAFE")),
    }))),
    farms: Object.freeze(farms.map((row) => Object.freeze({
      baseId: text(row?.baseId),
      unitName: text(row?.unitName || row?.baseId || "Required unit"),
      gapLabel: text(row?.gapLabel || "Upgrade needed"),
      missionImpact: Number(row?.missionImpact || 0),
      mandatoryImpact: Number(row?.mandatoryImpact || 0),
      phases: Object.freeze(phaseOfFarm(row)),
    }))),
    phases: Object.freeze([...phaseMap.values()].map((row) => Object.freeze(row))),
  });
}
