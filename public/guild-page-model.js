const asArray = (value) => Array.isArray(value) ? value : [];
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function text(value) {
  return String(value || "").trim();
}

function memberId(member, index = 0) {
  return text(member?.playerId || member?.id || member?.allyCode || member?.name || `member-${index + 1}`);
}

function categoryNames(unit = {}) {
  return asArray(unit.categories).map((row) => typeof row === "string" ? row : row?.name || row?.id || row?.categoryId || "").map(text).filter(Boolean);
}

function isGalacticLegend(unit = {}) {
  return categoryNames(unit).some((name) => name.toLowerCase().replace(/[_-]+/g, " ").includes("galactic legend"));
}

function unitType(unit = {}) {
  const direct = text(unit.unitType || unit.combatType || unit.type).toLowerCase();
  if (direct === "ship" || direct === "2") return "Ship";
  if (direct === "character" || direct === "1") return "Character";
  return "Character";
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

export function buildGuildCatalogIndex(catalog = []) {
  return new Map(asArray(catalog).filter((row) => row?.baseId).map((row) => [String(row.baseId), row]));
}

export function enrichGuildMember(member = {}, catalogIndex = new Map(), index = 0) {
  const units = asArray(member.units).map((owned) => {
    const staticUnit = catalogIndex.get(String(owned?.baseId || "")) || {};
    return {
      ...staticUnit,
      ...owned,
      baseId: String(owned?.baseId || staticUnit?.baseId || ""),
      name: text(owned?.name || staticUnit?.name || owned?.baseId),
      unitType: unitType({ ...staticUnit, ...owned }),
      categories: asArray(staticUnit?.categories).length ? staticUnit.categories : asArray(owned?.categories),
    };
  });

  const characters = units.filter((row) => row.unitType !== "Ship");
  const ships = units.filter((row) => row.unitType === "Ship");
  const characterGp = characters.reduce((sum, row) => sum + finite(row.power, 0), 0);
  const shipGp = ships.reduce((sum, row) => sum + finite(row.power, 0), 0);
  const galacticLegends = characters.filter(isGalacticLegend);
  const relic5 = characters.filter((row) => finite(row.relic, 0) >= 5).length;
  const relic7 = characters.filter((row) => finite(row.relic, 0) >= 7).length;
  const relic9 = characters.filter((row) => finite(row.relic, 0) >= 9).length;
  const gear13 = characters.filter((row) => finite(row.gear, 0) >= 13).length;
  const sevenStarShips = ships.filter((row) => finite(row.stars, 0) >= 7).length;
  const topUnits = units.slice().sort((a, b) => finite(b.power, 0) - finite(a.power, 0) || a.name.localeCompare(b.name)).slice(0, 8);

  return Object.freeze({
    id: memberId(member, index),
    playerId: text(member.playerId || member.id),
    allyCode: text(member.allyCode),
    name: text(member.name || member.playerName || memberId(member, index)),
    galacticPower: finite(member.galacticPower, characterGp + shipGp),
    rosterAvailable: Boolean(member.rosterAvailable),
    characterGp,
    shipGp,
    characterCount: characters.length,
    shipCount: ships.length,
    gear13,
    relic5,
    relic7,
    relic9,
    sevenStarShips,
    galacticLegendCount: galacticLegends.length,
    galacticLegends: Object.freeze(galacticLegends.map((row) => Object.freeze({ baseId: row.baseId, name: row.name, power: finite(row.power, 0), relic: finite(row.relic, 0) }))),
    topUnits: Object.freeze(topUnits.map((row) => Object.freeze({ baseId: row.baseId, name: row.name, unitType: row.unitType, power: finite(row.power, 0), relic: finite(row.relic, 0), stars: finite(row.stars, 0) }))),
  });
}

export function buildGuildRosterSnapshot(guildBody = {}, catalog = []) {
  const catalogIndex = catalog instanceof Map ? catalog : buildGuildCatalogIndex(catalog);
  const members = asArray(guildBody.members).map((member, index) => enrichGuildMember(member, catalogIndex, index));
  const hydrated = members.filter((row) => row.rosterAvailable);
  const gpValues = members.map((row) => row.galacticPower).filter((value) => value > 0);
  const guildGpFromMembers = gpValues.reduce((sum, value) => sum + value, 0);
  const guild = guildBody.guild || {};
  const hydration = guildBody.hydration || {};
  const totalCharacterGp = hydrated.reduce((sum, row) => sum + row.characterGp, 0);
  const totalShipGp = hydrated.reduce((sum, row) => sum + row.shipGp, 0);
  const totalGl = hydrated.reduce((sum, row) => sum + row.galacticLegendCount, 0);
  const totalR7 = hydrated.reduce((sum, row) => sum + row.relic7, 0);
  const totalR9 = hydrated.reduce((sum, row) => sum + row.relic9, 0);

  return Object.freeze({
    source: text(guildBody.source || "live"),
    fetchedAt: text(guildBody.fetchedAt),
    guild: Object.freeze({
      id: text(guild.id),
      name: text(guild.name || "Unknown Guild"),
      galacticPower: finite(guild.galacticPower, guildGpFromMembers),
      memberCount: finite(guild.memberCount, members.length),
    }),
    hydration: Object.freeze({
      requested: finite(hydration.requested, members.length),
      hydrated: finite(hydration.hydrated, hydrated.length),
      failed: finite(hydration.failed, Math.max(0, members.length - hydrated.length)),
      complete: hydration.complete === true || (members.length > 0 && hydrated.length === members.length),
    }),
    members: Object.freeze(members.slice().sort((a, b) => b.galacticPower - a.galacticPower || a.name.localeCompare(b.name))),
    summary: Object.freeze({
      totalMembers: members.length,
      hydratedMembers: hydrated.length,
      guildGp: finite(guild.galacticPower, guildGpFromMembers),
      averageGp: gpValues.length ? Math.round(guildGpFromMembers / gpValues.length) : 0,
      medianGp: median(gpValues),
      highestGp: gpValues.length ? Math.max(...gpValues) : 0,
      lowestGp: gpValues.length ? Math.min(...gpValues) : 0,
      characterGp: totalCharacterGp,
      shipGp: totalShipGp,
      galacticLegends: totalGl,
      relic7Characters: totalR7,
      relic9Characters: totalR9,
      sevenStarShips: hydrated.reduce((sum, row) => sum + row.sevenStarShips, 0),
    }),
  });
}

export function compactGuildSnapshot(snapshot = {}) {
  return Object.freeze({
    guildId: text(snapshot?.guild?.id),
    guildName: text(snapshot?.guild?.name),
    fetchedAt: text(snapshot?.fetchedAt) || new Date().toISOString(),
    members: Object.freeze(asArray(snapshot?.members).map((member) => Object.freeze({
      id: text(member.id),
      playerId: text(member.playerId),
      allyCode: text(member.allyCode),
      name: text(member.name),
      galacticPower: finite(member.galacticPower, 0),
    })).sort((a, b) => a.id.localeCompare(b.id))),
  });
}

export function compareGuildSnapshots(previous = null, current = null) {
  const previousMembers = new Map(asArray(previous?.members).map((row) => [text(row.id || row.playerId || row.allyCode || row.name), row]));
  const currentMembers = new Map(asArray(current?.members).map((row) => [text(row.id || row.playerId || row.allyCode || row.name), row]));
  const joined = [];
  const left = [];
  const renamed = [];
  const gpChanges = [];

  for (const [id, member] of currentMembers) {
    const before = previousMembers.get(id);
    if (!before) {
      joined.push(member);
      continue;
    }
    if (text(before.name) && text(member.name) && text(before.name) !== text(member.name)) renamed.push({ id, before: text(before.name), after: text(member.name) });
    const delta = finite(member.galacticPower, 0) - finite(before.galacticPower, 0);
    if (delta !== 0) gpChanges.push({ id, name: text(member.name), before: finite(before.galacticPower, 0), after: finite(member.galacticPower, 0), delta });
  }
  for (const [id, member] of previousMembers) if (!currentMembers.has(id)) left.push(member);

  gpChanges.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.name.localeCompare(b.name));
  return Object.freeze({
    hasPrevious: Boolean(previous),
    joined: Object.freeze(joined),
    left: Object.freeze(left),
    renamed: Object.freeze(renamed),
    gpChanges: Object.freeze(gpChanges),
    changed: joined.length + left.length + renamed.length + gpChanges.length > 0,
  });
}

export function filterGuildMembers(members = [], options = {}) {
  const search = text(options.search).toLowerCase().replace(/-/g, "");
  const status = text(options.status || "All");
  const sort = text(options.sort || "gp");
  let rows = asArray(members).filter((member) => {
    if (status === "Hydrated" && !member.rosterAvailable) return false;
    if (status === "Unavailable" && member.rosterAvailable) return false;
    if (!search) return true;
    return [member.name, member.allyCode, member.playerId, ...asArray(member.galacticLegends).map((row) => row.name)].join(" ").toLowerCase().replace(/-/g, "").includes(search);
  });

  const comparators = {
    gp: (a, b) => b.galacticPower - a.galacticPower,
    characterGp: (a, b) => b.characterGp - a.characterGp,
    shipGp: (a, b) => b.shipGp - a.shipGp,
    gl: (a, b) => b.galacticLegendCount - a.galacticLegendCount || b.galacticPower - a.galacticPower,
    relic7: (a, b) => b.relic7 - a.relic7 || b.galacticPower - a.galacticPower,
    name: (a, b) => a.name.localeCompare(b.name),
  };
  rows = rows.slice().sort((comparators[sort] || comparators.gp));
  return Object.freeze(rows);
}
