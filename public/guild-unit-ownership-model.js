import { unitMeetsRoteSlot } from "./guild-rote-planner.js";

const asArray = (value) => Array.isArray(value) ? value : [];
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const text = (value) => String(value || "").trim();

function memberId(member, index = 0) {
  return text(member?.playerId || member?.id || member?.allyCode || member?.name || `member-${index + 1}`);
}

function unitTypeOf(unit = {}) {
  const direct = text(unit?.unitType || unit?.combatType || unit?.type).toLowerCase();
  return direct === "ship" || direct === "2" ? "Ship" : "Character";
}

function staticUnitIndex(catalog = []) {
  return new Map(asArray(catalog).filter((row) => row?.baseId).map((row) => [String(row.baseId), row]));
}

function maxRequirement(slots = [], fallbackType = "Character") {
  const unitType = unitTypeOf(slots[0] || { unitType: fallbackType });
  return Object.freeze({
    unitType,
    requiredRarity: Math.max(0, ...slots.map((slot) => finite(slot?.requiredRarity, 0))),
    requiredRelic: unitType === "Ship" ? 0 : Math.max(0, ...slots.map((slot) => finite(slot?.requiredRelic, 0))),
  });
}

export function guildOperationUnitsForPhase(operations = {}, phase = "P1") {
  const grouped = new Map();
  for (const slot of asArray(operations?.slots).filter((row) => String(row?.phase || "") === String(phase))) {
    const baseId = text(slot?.baseId);
    if (!baseId) continue;
    let row = grouped.get(baseId);
    if (!row) {
      row = { baseId, name: text(slot?.name || baseId), unitType: unitTypeOf(slot), slots: [] };
      grouped.set(baseId, row);
    }
    row.slots.push(slot);
  }
  return Object.freeze([...grouped.values()].map((row) => Object.freeze({
    ...row,
    demand: row.slots.length,
    maxRequirement: maxRequirement(row.slots, row.unitType),
    slots: Object.freeze(row.slots.slice()),
  })).sort((a, b) => b.demand - a.demand || a.name.localeCompare(b.name)));
}

export function guildOperationRequirementForUnit(operations = {}, phase = "P1", baseId = "") {
  return guildOperationUnitsForPhase(operations, phase).find((row) => row.baseId === String(baseId || "")) || null;
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
    const id = text(row?.member?.playerId || row?.member?.allyCode || row?.member?.name);
    if (!id || !row?.baseId) continue;
    const key = `${id}|${String(row.phase || "")}|${String(row.baseId)}`;
    map.set(key, finite(map.get(key), 0) + 1);
  }
  return map;
}

function ignoredMemberSet(rows = []) {
  const set = new Set();
  for (const row of asArray(rows)) {
    if (typeof row === "string" || typeof row === "number") {
      const value = text(row);
      if (value) set.add(value);
      continue;
    }
    for (const value of [row?.memberId, row?.playerId, row?.id, row?.allyCode, row?.memberName, row?.name]) {
      const key = text(value);
      if (key) set.add(key);
    }
  }
  return set;
}

function memberUnavailable(member = {}, id = "", ignored = new Set()) {
  return [id, member?.playerId, member?.id, member?.allyCode, member?.name]
    .map(text)
    .filter(Boolean)
    .some((value) => ignored.has(value));
}

function safetyBand({ owned, qualifiesAny, operationContext, preference, protection, unavailable }) {
  if (!owned) return "missing";
  if (!operationContext) return "owned";
  if (!qualifiesAny) return "below";
  if (unavailable) return "unavailable";
  if (preference === "give") return "give";
  if (preference === "keep") return "keep";
  if (protection) return "protected";
  return "safe";
}

function safetyRank(band) {
  return ({ give: 0, safe: 1, owned: 1, protected: 2, keep: 3, unavailable: 4, below: 5, missing: 6 })[band] ?? 9;
}

function memberUnit(member = {}, baseId = "", catalogIndex = new Map()) {
  const owned = asArray(member?.units).find((row) => String(row?.baseId || "") === String(baseId || "")) || null;
  if (!owned) return null;
  const staticUnit = catalogIndex.get(String(baseId || "")) || {};
  return Object.freeze({
    ...staticUnit,
    ...owned,
    baseId: String(baseId || owned?.baseId || staticUnit?.baseId || ""),
    name: text(owned?.name || staticUnit?.name || baseId),
    unitType: unitTypeOf({ ...staticUnit, ...owned }),
  });
}

export function buildGuildUnitOwnershipMatrix({
  guildSnapshot,
  catalog = [],
  operations = {},
  phase = "",
  baseId = "",
  preferences = [],
  protections = [],
  assignments = [],
  ignoredMembers = [],
} = {}) {
  const catalogIndex = staticUnitIndex(catalog);
  const staticUnit = catalogIndex.get(String(baseId || "")) || null;
  const requirement = phase ? guildOperationRequirementForUnit(operations, phase, baseId) : null;
  const prefMap = preferenceMap(preferences);
  const protectMap = protectionMap(protections);
  const assignedMap = assignmentCountMap(assignments);
  const ignored = ignoredMemberSet(ignoredMembers);
  const members = asArray(guildSnapshot?.members).map((member, index) => {
    const id = memberId(member, index);
    const unit = memberUnit(member, baseId, catalogIndex);
    const qualifyingSlots = unit && requirement ? requirement.slots.filter((slot) => unitMeetsRoteSlot(unit, slot)).length : 0;
    const preference = prefMap.get(`${id}|${String(baseId)}`) || "default";
    const protection = phase ? protectMap.get(`${id}|${String(phase)}|${String(baseId)}`) || null : null;
    const assigned = phase ? finite(assignedMap.get(`${id}|${String(phase)}|${String(baseId)}`), 0) : 0;
    const unavailable = memberUnavailable(member, id, ignored);
    const band = safetyBand({ owned: Boolean(unit), qualifiesAny: qualifyingSlots > 0, operationContext: Boolean(requirement), preference, protection, unavailable });
    return Object.freeze({
      id,
      playerId: text(member?.playerId || member?.id),
      allyCode: text(member?.allyCode),
      memberName: text(member?.name || id),
      memberGp: finite(member?.galacticPower, 0),
      rosterAvailable: Boolean(member?.rosterAvailable),
      unavailable,
      unit,
      owned: Boolean(unit),
      stars: finite(unit?.stars, 0),
      gear: finite(unit?.gear, 0),
      relic: finite(unit?.relic, 0),
      unitGp: finite(unit?.power, 0),
      qualifyingSlots,
      totalDemandSlots: requirement?.demand || 0,
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
  const safe = members.filter((row) => ["safe", "give"].includes(row.band));
  const protectedOwners = members.filter((row) => row.band === "protected");
  const keepOwners = members.filter((row) => row.band === "keep");
  const unavailableOwners = members.filter((row) => row.band === "unavailable");
  const assignedOwners = members.filter((row) => row.assigned > 0);
  const sevenStar = owners.filter((row) => row.stars >= 7);
  const relic5 = owners.filter((row) => row.relic >= 5);
  const relic7 = owners.filter((row) => row.relic >= 7);
  const relic9 = owners.filter((row) => row.relic >= 9);
  const unitGpValues = owners.map((row) => row.unitGp).filter((value) => value > 0);

  return Object.freeze({
    phase: String(phase || ""),
    baseId: String(baseId || ""),
    staticUnit: staticUnit ? Object.freeze({
      baseId: String(staticUnit.baseId || baseId),
      name: text(staticUnit.name || baseId),
      unitType: unitTypeOf(staticUnit),
      image: text(staticUnit.image),
    }) : null,
    requirement,
    members: Object.freeze(members),
    summary: Object.freeze({
      guildMembers: members.length,
      owners: owners.length,
      missingMembers: members.length - owners.length,
      sevenStarOwners: sevenStar.length,
      relic5Owners: relic5.length,
      relic7Owners: relic7.length,
      relic9Owners: relic9.length,
      qualifyingOwners: qualifying.length,
      safeOwners: safe.length,
      protectedOwners: protectedOwners.length,
      keepOwners: keepOwners.length,
      unavailableOwners: unavailableOwners.length,
      assignedOwners: assignedOwners.length,
      demand: requirement?.demand || 0,
      averageUnitGp: unitGpValues.length ? Math.round(unitGpValues.reduce((sum, value) => sum + value, 0) / unitGpValues.length) : 0,
      maxUnitGp: unitGpValues.length ? Math.max(...unitGpValues) : 0,
    }),
  });
}

export function filterGuildUnitOwnershipRows(rows = [], options = {}) {
  const search = text(options.search).toLowerCase().replace(/-/g, "");
  const ownership = text(options.ownership || "All");
  const sort = text(options.sort || "safety");
  let filtered = asArray(rows).filter((row) => {
    if (ownership === "Owned" && !row.owned) return false;
    if (ownership === "Missing" && row.owned) return false;
    if (ownership === "Qualifying" && row.qualifyingSlots <= 0) return false;
    if (ownership === "Safe" && !["safe", "give"].includes(row.band)) return false;
    if (ownership === "Protected" && !["protected", "keep"].includes(row.band)) return false;
    if (ownership === "Unavailable" && row.band !== "unavailable") return false;
    if (!search) return true;
    return [row.memberName, row.allyCode, row.playerId, row.band, ...(asArray(row.protection?.reasons))]
      .join(" ").toLowerCase().replace(/-/g, "").includes(search);
  });

  const comparators = {
    safety: (a, b) => safetyRank(a.band) - safetyRank(b.band) || b.qualifyingSlots - a.qualifyingSlots || b.unitGp - a.unitGp || b.memberGp - a.memberGp,
    unitGp: (a, b) => b.unitGp - a.unitGp || b.memberGp - a.memberGp,
    memberGp: (a, b) => b.memberGp - a.memberGp || b.unitGp - a.unitGp,
    relic: (a, b) => b.relic - a.relic || b.gear - a.gear || b.stars - a.stars || b.unitGp - a.unitGp,
    name: (a, b) => a.memberName.localeCompare(b.memberName),
  };
  filtered = filtered.slice().sort(comparators[sort] || comparators.safety);
  return Object.freeze(filtered);
}
