import { guildRoteMissionEvidence } from "./guild-rote-mission-coverage-model.js";
import { missionRosterEligibility } from "./rote-mission-node-eligibility.js";

const asArray = (value) => Array.isArray(value) ? value : [];

export function buildRoteManualSquadCore(body = {}, mission = {}) {
  const eligibility = missionRosterEligibility(body, mission);
  const evidence = guildRoteMissionEvidence(mission);
  const unitType = String(eligibility.rule?.unitType || mission?.entry?.unitType || "Character");
  const squadSize = Math.max(0, Number(eligibility.squadSize || eligibility.rule?.squadSize || 0));
  if (!eligibility.loaded || unitType !== "Character") {
    return Object.freeze({
      available: false,
      reason: unitType !== "Character" ? "character-workbench-only" : "mission-entry-unavailable",
      evidence,
      unitType,
      squadSize,
      baseIds: Object.freeze([]),
      mandatoryBlockers: Object.freeze([]),
      unownedMandatory: Object.freeze([]),
      legalPoolCount: 0,
      exactEntryCore: false,
      actionLabel: "Manual core unavailable",
    });
  }

  const mandatory = asArray(eligibility.mandatory);
  const mandatoryOwned = mandatory.filter((row) => row.unit?.baseId);
  const mandatoryBlockers = mandatory.filter((row) => !row.legal);
  const unownedMandatory = mandatory.filter((row) => !row.unit?.baseId);
  const legalCandidates = asArray(eligibility.candidates)
    .slice()
    .sort((a, b) => Number(b.power || 0) - Number(a.power || 0)
      || Number(b.speed || 0) - Number(a.speed || 0)
      || String(a.name || "").localeCompare(String(b.name || "")));

  const selected = [];
  const selectedIds = new Set();
  const add = (unit) => {
    const baseId = String(unit?.baseId || "");
    if (!baseId || selectedIds.has(baseId) || (squadSize > 0 && selected.length >= squadSize)) return;
    selectedIds.add(baseId);
    selected.push(unit);
  };

  // Put owned mandatory units first—even below-gate ones—so the Workbench exposes
  // their exact blocker instead of hiding a required unit behind a stronger legal pool.
  mandatoryOwned
    .slice()
    .sort((a, b) => Number(b.legal) - Number(a.legal) || Number(b.unit?.power || 0) - Number(a.unit?.power || 0))
    .forEach((row) => add(row.unit));
  legalCandidates.forEach(add);

  const baseIds = selected.map((unit) => String(unit.baseId));
  const sizeReady = squadSize > 0 ? baseIds.length >= squadSize : baseIds.length > 0;
  const mandatoryReady = mandatory.length === 0 || mandatory.every((row) => row.legal && row.unit?.baseId && selectedIds.has(String(row.unit.baseId)));
  const exactEntryCore = evidence === "exact" && sizeReady && mandatoryReady && mandatoryBlockers.length === 0;

  let actionLabel = "Build Best Legal Pool Core";
  if (exactEntryCore) actionLabel = "Build Legal Mission Core";
  else if (mandatoryBlockers.length) actionLabel = "Build Planning Core + Blockers";

  return Object.freeze({
    available: baseIds.length > 0,
    reason: baseIds.length ? "" : "no-owned-candidates",
    evidence,
    unitType,
    squadSize,
    baseIds: Object.freeze(baseIds),
    selectedUnits: Object.freeze(selected),
    mandatory: Object.freeze(mandatory),
    mandatoryBlockers: Object.freeze(mandatoryBlockers),
    unownedMandatory: Object.freeze(unownedMandatory),
    legalPoolCount: legalCandidates.length,
    exactEntryCore,
    sizeReady,
    mandatoryReady,
    actionLabel,
  });
}
