import { unitMeetsRoteSlot } from "./guild-rote-planner.js";

const asArray = (value) => Array.isArray(value) ? value : [];
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function memberId(member, index = 0) {
  return String(member?.playerId || member?.allyCode || member?.name || `member-${index + 1}`);
}

function unitTypeOf(slot = {}) {
  return String(slot?.unitType || "Character");
}

function maxRequirement(slots = []) {
  const unitType = unitTypeOf(slots[0]);
  return Object.freeze({
    unitType,
    requiredRarity: Math.max(0, ...slots.map((slot) => finite(slot?.requiredRarity, 0))),
    requiredRelic: unitType === "Ship" ? 0 : Math.max(0, ...slots.map((slot) => finite(slot?.requiredRelic, 0))),
  });
}

export function guildOperationUnitsForPhase(operations = {}, phase = "P1") {
  const grouped = new Map();
  for (const slot of asArray(operations?.slots).filter((row) => String(row?.phase || "") === String(phase))) {
    const baseId = String(slot?.baseId || "");
    if (!baseId) continue;
    let row = grouped.get(baseId);
    if (!row) {
      row = { baseId, name: String(slot?.name || baseId), unitType: unitTypeOf(slot), slots: [] };
      grouped.set(baseId, row);
    }
    row.slots.push(slot);
  }
  return Object.freeze([...grouped.values()].map((row) => Object.freeze({
    ...row,
    demand: row.slots.length,
    maxRequirement: maxRequirement(row.slots),
    slots: Object.freeze(row.slots.slice()),
  })).sort((a, b) => b.demand - a.demand || a.name.localeCompare(b.name)));
}

function preferenceMap(rows = []) {
  const map = new Map();
  for (const row of asArray(rows)) {
    if (!row?.memberId || !row?.baseId) continue;
    map.set(`${String(row.memberId)}|${String(row.baseId)}`, String(row.preference || "default").toLowerCase());
  }
  return map;
}

function protectionMap(rows = []) {
  const map = new Map();
  for (const row of asArray(rows)) {
    if (!row?.memberId || !row?.phase || !row?.baseId) continue;
    map.set(`${String(row.memberId)}|${String(row.phase)}|${String(row.baseId)}`, row);
  }
  return map;
}

function assignmentCountMap(rows = []) {
  const map = new Map();
  for (const row of asArray(rows)) {
    const id = String(row?.member?.playerId || row?.member?.allyCode || row?.member?.name || "");
    if (!id || !row?.baseId) continue;
    const key = `${id}|${String(row.phase || "")}|${String(row.baseId)}`;
    map.set(key, finite(map.get(key), 0) + 1);
  }
  return map;
}

function safetyBand(preference, protection, owned, qualifiesAny) {
  if (!owned) return "missing";
  if (!qualifiesAny) return "below";
  if (preference === "give") return "give";
  if (preference === "keep") return "keep";
  if (protection) return "protected";
  return "safe";
}

function safetyRank(band) {
  return ({ give: 0, safe: 1, protected: 2, keep: 3, below: 4, missing: 5 })[band] ?? 9;
}

export function buildGuildUnitOwnershipMatrix({ guildSnapshot, operations, phase, baseId, preferences = [], protections = [], assignments = [] }) {
  const units = guildOperationUnitsForPhase(operations, phase);
  const requirement = units.find((row) => row.baseId === String(baseId || "")) || units[0] || null;
  if (!requirement) {
    return Object.freeze({ phase: String(phase || "P1"), requirement: null, members: Object.freeze([]), summary: Object.freeze({}) });
  }

  const prefMap = preferenceMap(preferences);
  const protectMap = protectionMap(protections);
  const assignedMap = assignmentCountMap(assignments);
  const members = asArray(guildSnapshot?.members).map((member, index) => {
    const id = memberId(member, index);
    const unit = asArray(member?.units).find((row) => String(row?.baseId || "") === requirement.baseId) || null;
    const qualifyingSlots = unit ? requirement.slots.filter((slot) => unitMeetsRoteSlot(unit, slot)).length : 0;
    const preference = prefMap.get(`${id}|${requirement.baseId}`) || "default";
    const protection = protectMap.get(`${id}|${String(phase)}|${requirement.baseId}`) || null;
    const assigned = finite(assignedMap.get(`${id}|${String(phase)}|${requirement.baseId}`), 0);
    const band = safetyBand(preference, protection, Boolean(unit), qualifyingSlots > 0);
    return Object.freeze({
      id,
      playerId: String(member?.playerId || ""),
      allyCode: String(member?.allyCode || ""),
      memberName: String(member?.name || id),
      memberGp: finite(member?.galacticPower, 0),
      rosterAvailable: Boolean(member?.rosterAvailable),
      unit,
      owned: Boolean(unit),
      stars: finite(unit?.stars, 0),
      gear: finite(unit?.gear, 0),
      relic: finite(unit?.relic, 0),
      unitGp: finite(unit?.power, 0),
      qualifyingSlots,
      totalDemandSlots: requirement.demand,
      preference,
      protection,
      assigned,
      band,
    });
  }).sort((a, b) => safetyRank(a.band) - safetyRank(b.band)
    || b.qualifyingSlots - a.qualifyingSlots
    || b.unitGp - a.unitGp
    || b.memberGp - a.memberGp
    || a.memberName.localeCompare(b.memberName));

  const owners = members.filter((row) => row.owned);
  const qualifying = members.filter((row) => row.qualifyingSlots > 0);
  const safe = members.filter((row) => row.band === "safe" || row.band === "give");
  const protectedOwners = members.filter((row) => row.band === "protected");
  const keepOwners = members.filter((row) => row.band === "keep");
  const assignedOwners = members.filter((row) => row.assigned > 0);

  return Object.freeze({
    phase: String(phase || "P1"),
    requirement,
    members: Object.freeze(members),
    summary: Object.freeze({
      demand: requirement.demand,
      owners: owners.length,
      qualifyingOwners: qualifying.length,
      safeOwners: safe.length,
      protectedOwners: protectedOwners.length,
      keepOwners: keepOwners.length,
      assignedOwners: assignedOwners.length,
      missingMembers: members.length - owners.length,
    }),
  });
}
