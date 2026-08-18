const array = (value) => Array.isArray(value) ? value : [];

function phase(value) {
  const text = String(value || "").trim().toUpperCase();
  return /^P[1-6]$/.test(text) ? text : "";
}

function safetyStatus(row = {}) {
  return String(row?.safety?.status || "SAFE").trim().toUpperCase();
}

function isRiskyAssignment(row = {}) {
  return row?.safety?.help === true || row?.safety?.forced === true || safetyStatus(row) !== "SAFE";
}

/**
 * Shapes an already-built Discord planning snapshot for a selected phase.
 * This never changes planner decisions. It only makes the officer-facing
 * aggregate counters and preview ordering match the requested phase.
 */
export function shapeDiscordPlanningSnapshot(snapshot = {}, requestedPhase = "") {
  const selectedPhase = phase(requestedPhase);
  const safety = snapshot?.safety || {};
  const plan = snapshot?.plan || {};
  const sourceAssignments = array(plan.assignments);

  const assignments = sourceAssignments.slice().sort((a, b) => {
    if (selectedPhase) {
      const aInPhase = String(a?.phase || "").toUpperCase() === selectedPhase;
      const bInPhase = String(b?.phase || "").toUpperCase() === selectedPhase;
      if (aInPhase !== bInPhase) return aInPhase ? -1 : 1;
    }
    const aRisky = isRiskyAssignment(a);
    const bRisky = isRiskyAssignment(b);
    if (aRisky !== bRisky) return aRisky ? -1 : 1;
    return 0;
  });

  if (!selectedPhase) {
    return Object.freeze({
      ...snapshot,
      plan: Object.freeze({ ...plan, assignments: Object.freeze(assignments) }),
    });
  }

  const protections = array(safety.protections)
    .filter((row) => String(row?.phase || "").toUpperCase() === selectedPhase);
  const summary = Object.freeze({
    ...(safety.summary || {}),
    protectedUnits: protections.length,
    criticalProtections: protections.filter((row) => Number(row?.severity || 0) >= 80).length,
  });

  return Object.freeze({
    ...snapshot,
    safety: Object.freeze({
      ...safety,
      protections: Object.freeze(protections),
      summary,
    }),
    plan: Object.freeze({
      ...plan,
      assignments: Object.freeze(assignments),
    }),
  });
}

export const discordAssignmentIsRisky = isRiskyAssignment;
