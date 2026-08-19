import { datacronLabel, squadCoverage } from "./gac-datacron-eligibility.js";
import { mechanicsLabels } from "./gac-datacron-mechanics.js";

function clean(value) { return String(value ?? "").trim(); }
function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function assessDefenseDatacron(datacron, squad = [], context = {}) {
  if (!datacron || typeof datacron !== "object") {
    return Object.freeze({
      selected: false,
      known: false,
      source: "no-user-confirmed-defense-datacron",
      datacronId: "",
      label: "No enemy datacron confirmed",
      level: null,
      squadSize: Array.isArray(squad) ? squad.length : 0,
      eligibleMembers: 0,
      unknownMembers: Array.isArray(squad) ? squad.length : 0,
      coverage: null,
      leaderEligible: null,
      mechanics: Object.freeze([]),
    });
  }

  const coverage = squadCoverage(
    datacron,
    Array.isArray(squad) ? squad : [],
    context?.unitIndex instanceof Map ? context.unitIndex : new Map(),
    context?.datacronCatalog || null,
  );
  const mechanics = mechanicsLabels(datacron, 8);
  const level = finite(datacron?.level) ?? (Array.isArray(datacron?.affixes) ? datacron.affixes.length : null);

  return Object.freeze({
    selected: true,
    known: coverage.known === true,
    source: "user-confirmed-current-board",
    datacronId: clean(datacron?.id),
    label: datacronLabel(datacron, context?.datacronCatalog || null),
    level,
    squadSize: coverage.squadSize,
    eligibleMembers: coverage.eligibleMembers,
    unknownMembers: coverage.unknownMembers,
    coverage: coverage.coverage,
    leaderEligible: coverage.leaderEligible,
    abilityAffixes: coverage.abilityAffixes,
    eligibleAbilityHits: coverage.eligibleAbilityHits,
    mechanics: Object.freeze(mechanics),
    members: coverage.members,
    reason: coverage.reason,
  });
}

function exposureLabel(assessment = {}) {
  if (assessment?.selected !== true) return "NO ENEMY DATACRON CONFIRMED";
  if (assessment?.known !== true) return "ENEMY DATACRON · COVERAGE PARTIAL";
  if (assessment.squadSize > 0 && assessment.eligibleMembers === assessment.squadSize) return "ENEMY DATACRON · FULL SQUAD COVERAGE";
  if (assessment.eligibleMembers > 0) return "ENEMY DATACRON · PARTIAL SQUAD COVERAGE";
  return "ENEMY DATACRON · NO VERIFIED ABILITY-TARGET COVERAGE";
}

export { assessDefenseDatacron, exposureLabel };
