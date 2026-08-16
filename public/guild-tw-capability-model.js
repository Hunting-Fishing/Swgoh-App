import { isLeader } from "./team-builder.js";

const asArray = (value) => Array.isArray(value) ? value : [];
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const text = (value) => String(value || "").trim();

const NON_FACTION_LABELS = new Set([
  "light side",
  "dark side",
  "neutral",
  "attacker",
  "support",
  "tank",
  "healer",
  "leader",
  "crew member",
  "fleet commander",
  "galactic legend",
]);

function memberId(member, index = 0) {
  return text(member?.playerId || member?.id || member?.allyCode || member?.name || `member-${index + 1}`);
}

function normalizedFaction(value) {
  return text(typeof value === "string" ? value : value?.name || value?.id || value?.categoryId);
}

function factionAllowed(value) {
  const faction = normalizedFaction(value);
  return Boolean(faction) && !NON_FACTION_LABELS.has(faction.toLowerCase());
}

function unitType(unit = {}) {
  const direct = text(unit?.unitType || unit?.combatType || unit?.type).toLowerCase();
  return direct === "ship" || direct === "2" ? "Ship" : "Character";
}

function catalogIndex(catalog = []) {
  return new Map(asArray(catalog).filter((row) => row?.baseId).map((row) => [String(row.baseId), row]));
}

function enrichOwnedUnit(owned = {}, byId = new Map()) {
  const staticUnit = byId.get(String(owned?.baseId || "")) || {};
  const liveFactions = asArray(owned?.factions).filter(factionAllowed);
  const staticFactions = asArray(staticUnit?.factions).filter(factionAllowed);
  return Object.freeze({
    ...staticUnit,
    ...owned,
    baseId: String(owned?.baseId || staticUnit?.baseId || ""),
    name: text(owned?.name || staticUnit?.name || owned?.baseId),
    unitType: unitType({ ...staticUnit, ...owned }),
    factions: Object.freeze((liveFactions.length ? liveFactions : staticFactions).map(normalizedFaction).filter(Boolean)),
    abilities: asArray(owned?.abilities).length ? owned.abilities : asArray(staticUnit?.abilities),
    power: finite(owned?.power, 0),
    stars: finite(owned?.stars, 0),
    gear: finite(owned?.gear, 0),
    relic: finite(owned?.relic, 0),
  });
}

function progressionScore(unit = {}) {
  return finite(unit.relic, 0) * 1_000_000
    + finite(unit.gear, 0) * 100_000
    + finite(unit.stars, 0) * 10_000
    + finite(unit.power, 0);
}

function bestFactionCore(units = [], size = 5) {
  const ranked = asArray(units).slice().sort((a, b) => progressionScore(b) - progressionScore(a) || String(a.name).localeCompare(String(b.name)));
  const leader = ranked.find(isLeader) || null;
  const selected = leader
    ? [leader, ...ranked.filter((row) => row !== leader)].slice(0, size)
    : ranked.slice(0, size);
  return Object.freeze({
    leader,
    selected: Object.freeze(selected),
    complete: selected.length >= size,
    combinedGp: selected.reduce((sum, row) => sum + finite(row.power, 0), 0),
    relicFloor: selected.length >= size ? Math.min(...selected.map((row) => finite(row.relic, 0))) : 0,
    starsFloor: selected.length >= size ? Math.min(...selected.map((row) => finite(row.stars, 0))) : 0,
  });
}

function thresholdCore(units = [], size = 5, threshold = 0) {
  const eligible = asArray(units).filter((row) => finite(row.relic, 0) >= threshold);
  const core = bestFactionCore(eligible, size);
  return Object.freeze({ ...core, threshold, eligibleCount: eligible.length });
}

function upgradeRows(units = [], size = 5, threshold = 5) {
  const ranked = asArray(units).slice().sort((a, b) => progressionScore(b) - progressionScore(a) || String(a.name).localeCompare(String(b.name)));
  const top = ranked.slice(0, size);
  if (top.length < size) return Object.freeze([]);
  return Object.freeze(top
    .filter((unit) => finite(unit.relic, 0) < threshold)
    .map((unit) => Object.freeze({
      baseId: unit.baseId,
      name: unit.name,
      currentRelic: finite(unit.relic, 0),
      targetRelic: threshold,
      relicGap: Math.max(0, threshold - finite(unit.relic, 0)),
      power: finite(unit.power, 0),
    }))
    .sort((a, b) => a.relicGap - b.relicGap || b.power - a.power || a.name.localeCompare(b.name)));
}

function memberFactionEvaluation(member, faction, units, size) {
  const factionUnits = units.filter((unit) => asArray(unit.factions).includes(faction));
  const ownedCore = bestFactionCore(factionUnits, size);
  const r5Core = thresholdCore(factionUnits, size, 5);
  const r7Core = thresholdCore(factionUnits, size, 7);
  const leaders = factionUnits.filter(isLeader);
  return Object.freeze({
    memberId: member.id,
    memberName: member.name,
    allyCode: member.allyCode,
    memberGp: member.galacticPower,
    faction,
    ownedCount: factionUnits.length,
    complete: ownedCore.complete,
    r5Complete: r5Core.complete,
    r7Complete: r7Core.complete,
    leaderCapable: ownedCore.complete && leaders.length > 0,
    leaderCount: leaders.length,
    combinedGp: ownedCore.combinedGp,
    relicFloor: ownedCore.relicFloor,
    bestCore: ownedCore.selected,
    r5UpgradeRows: upgradeRows(factionUnits, size, 5),
    r7UpgradeRows: upgradeRows(factionUnits, size, 7),
  });
}

function catalogFactionCounts(catalog = []) {
  const counts = new Map();
  for (const unit of asArray(catalog)) {
    if (unitType(unit) === "Ship") continue;
    for (const faction of asArray(unit?.factions).filter(factionAllowed).map(normalizedFaction)) {
      counts.set(faction, (counts.get(faction) || 0) + 1);
    }
  }
  return counts;
}

function concentration(ownerCount, hydratedMembers) {
  if (!hydratedMembers || ownerCount <= 0) return "none";
  const ratio = ownerCount / hydratedMembers;
  if (ratio <= 0.1) return "very-thin";
  if (ratio <= 0.25) return "thin";
  if (ratio <= 0.5) return "moderate";
  return "broad";
}

export function buildGuildTwCapability(guildSnapshot = {}, catalog = [], options = {}) {
  const squadSize = Math.max(1, Math.floor(finite(options.squadSize, 5)));
  const byId = catalogIndex(catalog);
  const catalogCounts = catalogFactionCounts(catalog);
  const members = asArray(guildSnapshot?.members).map((member, index) => {
    const id = memberId(member, index);
    const units = asArray(member?.units).map((unit) => enrichOwnedUnit(unit, byId)).filter((unit) => unit.unitType === "Character");
    return Object.freeze({
      id,
      playerId: text(member?.playerId || member?.id),
      allyCode: text(member?.allyCode),
      name: text(member?.name || id),
      galacticPower: finite(member?.galacticPower, 0),
      rosterAvailable: Boolean(member?.rosterAvailable),
      units: Object.freeze(units),
    });
  });
  const hydrated = members.filter((member) => member.rosterAvailable);

  const guildFactionNames = new Set();
  for (const member of hydrated) for (const unit of member.units) for (const faction of unit.factions) {
    if ((catalogCounts.get(faction) || 0) >= squadSize) guildFactionNames.add(faction);
  }

  const factionRows = [...guildFactionNames].map((faction) => {
    const evaluations = hydrated.map((member) => memberFactionEvaluation(member, faction, member.units, squadSize));
    const complete = evaluations.filter((row) => row.complete);
    const r5 = evaluations.filter((row) => row.r5Complete);
    const r7 = evaluations.filter((row) => row.r7Complete);
    const leaders = evaluations.filter((row) => row.leaderCapable);
    const nearR5 = evaluations.filter((row) => row.complete && !row.r5Complete && row.r5UpgradeRows.length > 0);
    const nearR7 = evaluations.filter((row) => row.r5Complete && !row.r7Complete && row.r7UpgradeRows.length > 0);
    const bottlenecks = new Map();
    for (const evaluation of nearR7) for (const unit of evaluation.r7UpgradeRows) {
      const key = unit.baseId;
      let row = bottlenecks.get(key);
      if (!row) {
        row = { baseId: unit.baseId, name: unit.name, affectedMembers: 0, totalRelicGap: 0, members: [] };
        bottlenecks.set(key, row);
      }
      row.affectedMembers += 1;
      row.totalRelicGap += unit.relicGap;
      row.members.push({ memberId: evaluation.memberId, memberName: evaluation.memberName, allyCode: evaluation.allyCode, currentRelic: unit.currentRelic, targetRelic: 7 });
    }
    const bottleneckRows = [...bottlenecks.values()].sort((a, b) => b.affectedMembers - a.affectedMembers || a.totalRelicGap - b.totalRelicGap || a.name.localeCompare(b.name));
    return Object.freeze({
      faction,
      catalogCharacters: catalogCounts.get(faction) || 0,
      squadSize,
      completeOwners: complete.length,
      r5Owners: r5.length,
      r7Owners: r7.length,
      leaderCapableOwners: leaders.length,
      nearR5Owners: nearR5.length,
      nearR7Owners: nearR7.length,
      r7CoveragePercent: hydrated.length ? Math.round((r7.length / hydrated.length) * 1000) / 10 : 0,
      concentration: concentration(r7.length, hydrated.length),
      evaluations: Object.freeze(evaluations.sort((a, b) => Number(b.r7Complete) - Number(a.r7Complete)
        || Number(b.r5Complete) - Number(a.r5Complete)
        || Number(b.complete) - Number(a.complete)
        || b.combinedGp - a.combinedGp
        || b.memberGp - a.memberGp
        || a.memberName.localeCompare(b.memberName))),
      bottlenecks: Object.freeze(bottleneckRows.map((row) => Object.freeze({ ...row, members: Object.freeze(row.members) }))),
    });
  }).sort((a, b) => b.r7Owners - a.r7Owners || b.r5Owners - a.r5Owners || b.completeOwners - a.completeOwners || a.faction.localeCompare(b.faction));

  const memberRows = hydrated.map((member) => {
    const evaluations = factionRows.map((faction) => faction.evaluations.find((row) => row.memberId === member.id)).filter(Boolean);
    return Object.freeze({
      memberId: member.id,
      playerId: member.playerId,
      allyCode: member.allyCode,
      memberName: member.name,
      memberGp: member.galacticPower,
      completeFactions: evaluations.filter((row) => row.complete).length,
      r5Factions: evaluations.filter((row) => row.r5Complete).length,
      r7Factions: evaluations.filter((row) => row.r7Complete).length,
      leaderCapableFactions: evaluations.filter((row) => row.leaderCapable).length,
      strongestFactions: Object.freeze(evaluations.filter((row) => row.complete).sort((a, b) => b.relicFloor - a.relicFloor || b.combinedGp - a.combinedGp || a.faction.localeCompare(b.faction)).slice(0, 8).map((row) => Object.freeze({ faction: row.faction, relicFloor: row.relicFloor, combinedGp: row.combinedGp }))),
    });
  }).sort((a, b) => b.r7Factions - a.r7Factions || b.r5Factions - a.r5Factions || b.completeFactions - a.completeFactions || b.memberGp - a.memberGp || a.memberName.localeCompare(b.memberName));

  const globalBottlenecks = new Map();
  for (const faction of factionRows) for (const bottleneck of faction.bottlenecks) {
    const key = `${faction.faction}|${bottleneck.baseId}`;
    globalBottlenecks.set(key, Object.freeze({
      faction: faction.faction,
      baseId: bottleneck.baseId,
      name: bottleneck.name,
      affectedMembers: bottleneck.affectedMembers,
      totalRelicGap: bottleneck.totalRelicGap,
      members: bottleneck.members,
    }));
  }
  const bottleneckRows = [...globalBottlenecks.values()].sort((a, b) => b.affectedMembers - a.affectedMembers || a.totalRelicGap - b.totalRelicGap || a.faction.localeCompare(b.faction) || a.name.localeCompare(b.name));

  return Object.freeze({
    squadSize,
    hydratedMembers: hydrated.length,
    totalMembers: members.length,
    factions: Object.freeze(factionRows),
    members: Object.freeze(memberRows),
    bottlenecks: Object.freeze(bottleneckRows),
    summary: Object.freeze({
      factionsTracked: factionRows.length,
      completeFactionCores: factionRows.reduce((sum, row) => sum + row.completeOwners, 0),
      r5FactionCores: factionRows.reduce((sum, row) => sum + row.r5Owners, 0),
      r7FactionCores: factionRows.reduce((sum, row) => sum + row.r7Owners, 0),
      leaderCapableCores: factionRows.reduce((sum, row) => sum + row.leaderCapableOwners, 0),
      thinR7Factions: factionRows.filter((row) => ["very-thin", "thin"].includes(row.concentration) && row.r7Owners > 0).length,
      zeroR7Factions: factionRows.filter((row) => row.r7Owners === 0).length,
    }),
  });
}

export function filterGuildTwFactions(rows = [], options = {}) {
  const search = text(options.search).toLowerCase();
  const coverage = text(options.coverage || "All");
  const sort = text(options.sort || "r7");
  let filtered = asArray(rows).filter((row) => {
    if (coverage === "R7" && row.r7Owners <= 0) return false;
    if (coverage === "NoR7" && row.r7Owners > 0) return false;
    if (coverage === "Thin" && !["very-thin", "thin"].includes(row.concentration)) return false;
    if (coverage === "NearR7" && row.nearR7Owners <= 0) return false;
    return !search || row.faction.toLowerCase().includes(search);
  });
  const comparators = {
    r7: (a, b) => b.r7Owners - a.r7Owners || b.r5Owners - a.r5Owners || b.completeOwners - a.completeOwners,
    r5: (a, b) => b.r5Owners - a.r5Owners || b.r7Owners - a.r7Owners || b.completeOwners - a.completeOwners,
    complete: (a, b) => b.completeOwners - a.completeOwners || b.r5Owners - a.r5Owners,
    risk: (a, b) => a.r7Owners - b.r7Owners || a.r5Owners - b.r5Owners || a.faction.localeCompare(b.faction),
    name: (a, b) => a.faction.localeCompare(b.faction),
  };
  return Object.freeze(filtered.slice().sort(comparators[sort] || comparators.r7));
}
