import { datacronLabel, squadCoverage } from "./gac-datacron-eligibility.js";
import { mechanicsLabels } from "./gac-datacron-mechanics.js";

function clean(value) { return String(value ?? "").trim(); }
function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function normalizeBaseId(value) { return clean(value).split(":")[0].toUpperCase(); }
function asArray(value) { return Array.isArray(value) ? value : []; }

function assessDefenseDatacron(datacron, squad = [], context = {}, options = {}) {
  const source = clean(options.source) || "user-confirmed-current-board";
  if (!datacron || typeof datacron !== "object") {
    return Object.freeze({
      selected: false,
      known: false,
      source: source === "explicit-live-placement-reference" ? source : "no-user-confirmed-defense-datacron",
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
    source,
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

function objectWalk(root, maxNodes = 20_000) {
  const output = [];
  const stack = [root];
  const seen = new WeakSet();
  while (stack.length && output.length < maxNodes) {
    const value = stack.pop();
    if (!value || typeof value !== "object") continue;
    if (seen.has(value)) continue;
    seen.add(value);
    output.push(value);
    for (const child of Object.values(value)) {
      if (child && typeof child === "object") stack.push(child);
    }
  }
  return output;
}

function memberIds(value = {}) {
  const collection = [value.members, value.units, value.squad, value.unit]
    .find((entry) => Array.isArray(entry));
  if (!collection) return [];
  return collection.map((unit) => normalizeBaseId(
    typeof unit === "string" ? unit : unit?.baseId || unit?.defId || unit?.definitionId || unit?.definition_id,
  )).filter(Boolean);
}

function explicitDatacronReference(value = {}) {
  const nested = [value.datacron, value.datacronData, value.datacron_data]
    .find((entry) => entry && typeof entry === "object" && !Array.isArray(entry)) || null;
  const id = clean(
    value.datacronId || value.datacronID || value.datacron_id ||
    nested?.id || nested?.datacronId || nested?.datacronID,
  );
  if (!id && !nested) return null;
  return Object.freeze({ id, embedded: nested });
}

function placementKey(ids) {
  return [...new Set(asArray(ids).map(normalizeBaseId).filter(Boolean))].sort().join("|");
}

function extractAssignedDefenseDatacrons(payload) {
  const bySquad = new Map();
  for (const object of objectWalk(payload)) {
    const members = memberIds(object);
    if (members.length < 2) continue;
    const side = clean(object.side || object.type || object.placementType || object.deploymentType).toLowerCase();
    if (side && !/(defen|deploy|placed|home)/i.test(side)) continue;
    const datacron = explicitDatacronReference(object);
    if (!datacron) continue;
    const key = placementKey(members);
    if (!key || bySquad.has(key)) continue;
    bySquad.set(key, Object.freeze({
      members: Object.freeze(members),
      datacron,
      zone: clean(object.zone || object.zoneId || object.territory || object.territoryId),
      slot: Number.isFinite(Number(object.slot ?? object.squadSlot)) ? Number(object.slot ?? object.squadSlot) : null,
      source: "explicit-live-placement-reference",
    }));
  }
  return bySquad;
}

function resolveAssignedDatacron(reference, opponentRoster = {}) {
  if (!reference) return null;
  const inventory = Array.isArray(opponentRoster?.datacrons) ? opponentRoster.datacrons : [];
  if (reference.id) {
    const exact = inventory.find((item) => clean(item?.id) === reference.id);
    if (exact) return Object.freeze({ datacron: exact, resolution: "live-roster-id-match" });
  }
  if (reference.embedded) {
    return Object.freeze({
      datacron: reference.embedded,
      resolution: reference.id ? "embedded-live-placement-fallback" : "embedded-live-placement",
    });
  }
  return Object.freeze({
    datacron: Object.freeze({ id: reference.id, level: null, affixes: Object.freeze([]) }),
    resolution: "explicit-id-unresolved-in-roster",
  });
}

function threatLabel(assessment = {}) {
  if (assessment?.selected !== true) return "UNKNOWN";
  const level = Number(assessment?.level);
  if (Number.isFinite(level) && level >= 9) return "HIGH";
  if (Number.isFinite(level) && level >= 6) return "ELEVATED";
  if (Number.isFinite(level) && level >= 3) return "ACTIVE";
  return assessment?.known === true ? "ASSIGNED" : "PARTIAL";
}

if (typeof document !== "undefined") {
  void import("./gac-defense-datacron-live.js").catch(() => {});
}

export {
  assessDefenseDatacron,
  explicitDatacronReference,
  exposureLabel,
  extractAssignedDefenseDatacrons,
  placementKey,
  resolveAssignedDatacron,
  threatLabel,
};
