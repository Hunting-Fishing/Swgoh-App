import { planBoardCounters } from "./gac-counter-engine.js";
import { allocateEvidenceCounters } from "./gac-evidence-board-allocator.js";

function clean(value) { return String(value ?? "").trim(); }
function normalizeBaseId(value) { return clean(value).split(":")[0].toUpperCase(); }

function hybridBoardPlan(ownRoster, opponentRoster, openEntries = [], evidenceByLeader = new Map(), options = {}) {
  const size = Number(options.size) === 3 ? 3 : 5;
  const baseExcluded = [...new Set((options.excludeBaseIds || []).map(normalizeBaseId).filter(Boolean))];
  const entries = (Array.isArray(openEntries) ? openEntries : []).map((entry, index) => ({
    ...entry,
    hybridIndex: index,
    defenseId: Number(entry?.defenseId || entry?.defense?.id || 0),
    defense: entry?.defense || entry,
  }));

  const evidence = allocateEvidenceCounters(ownRoster, entries, evidenceByLeader, {
    size,
    excludeBaseIds: baseExcluded,
    reserveBaseIds: options.reserveBaseIds || [],
  });
  const evidenceByDefense = new Map(evidence.assignments.map((assignment) => [Number(assignment.defenseId), assignment]));
  const remainingEntries = entries.filter((entry) => !evidenceByDefense.has(entry.defenseId));
  const heuristicExcluded = [...new Set([...baseExcluded, ...evidence.newlyUsedBaseIds])];
  const heuristic = planBoardCounters(
    ownRoster,
    opponentRoster,
    remainingEntries.map((entry) => entry.defense),
    {
      ...options,
      size,
      excludeBaseIds: heuristicExcluded,
    },
  );

  const heuristicAssignments = heuristic.map((assignment) => {
    const entry = remainingEntries[assignment.defenseIndex];
    return Object.freeze({
      ...assignment,
      defenseId: entry?.defenseId || 0,
      sourceIndex: entry?.hybridIndex ?? assignment.defenseIndex,
      source: "roster-fit-heuristic",
    });
  });
  const evidenceAssignments = evidence.assignments.map((assignment) => {
    const entry = entries.find((value) => value.defenseId === Number(assignment.defenseId));
    return Object.freeze({
      ...assignment,
      sourceIndex: entry?.hybridIndex ?? assignment.sourceIndex,
      source: "historical-counter-evidence",
    });
  });

  return Object.freeze({
    source: "evidence-first-hybrid-board-plan",
    size,
    baseExcludedIds: Object.freeze(baseExcluded),
    evidenceUsedBaseIds: evidence.newlyUsedBaseIds,
    heuristicExcludedIds: Object.freeze(heuristicExcluded),
    evidenceDefenseCount: evidenceAssignments.length,
    heuristicDefenseCount: heuristicAssignments.length,
    assignments: Object.freeze([...evidenceAssignments, ...heuristicAssignments]
      .sort((a, b) => Number(a.sourceIndex) - Number(b.sourceIndex))),
  });
}

export { hybridBoardPlan };
