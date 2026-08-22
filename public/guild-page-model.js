import { guildMemberRole, guildRoleRank, isGuildLeadership, playerPortraitId, playerPortraitUrl, playerProfileTitle } from './guild-member-identity.js';

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

function suppliedNumber(value, fallback = 0) {
  return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function nullableNumber(value) {
  return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value)) ? Number(value) : null;
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

  const hasDetailedUnits = units.length > 0;
  const characters = units.filter((row) => row.unitType !== "Ship");
  const ships = units.filter((row) => row.unitType === "Ship");
  const derivedCharacterGp = characters.reduce((sum, row) => sum + finite(row.power, 0), 0);
  const derivedShipGp = ships.reduce((sum, row) => sum + finite(row.power, 0), 0);
  const characterGp = hasDetailedUnits ? derivedCharacterGp : suppliedNumber(member.characterGalacticPower ?? member.characterGp ?? member.memberCharacterPower, 0);
  const shipGp = hasDetailedUnits ? derivedShipGp : suppliedNumber(member.shipGalacticPower ?? member.shipGp ?? member.memberShipPower, 0);
  const derivedGalacticLegends = characters.filter(isGalacticLegend);
  const galacticLegends = hasDetailedUnits ? derivedGalacticLegends : asArray(member.galacticLegends);
  const derivedTopUnits = units.slice().sort((a, b) => finite(b.power, 0) - finite(a.power, 0) || a.name.localeCompare(b.name)).slice(0, 8);
  const topUnits = hasDetailedUnits ? derivedTopUnits : asArray(member.topUnits);
  const derivedZetaCount = hasDetailedUnits ? units.reduce((sum, row) => sum + finite(row.zetas, 0), 0) : null;
  const derivedOmicronCount = hasDetailedUnits ? units.reduce((sum, row) => sum + finite(row.omicrons, 0), 0) : null;
  const derivedUltimateCount = hasDetailedUnits ? units.filter((row) => row.ultimateUnlocked === true).length : null;
  const omegaEvidenceComplete = hasDetailedUnits && units.every((row) => nullableNumber(row.omegas) !== null);
  const derivedOmegaCount = omegaEvidenceComplete ? units.reduce((sum, row) => sum + finite(row.omegas, 0), 0) : null;
  const memberLevel = suppliedNumber(member.memberLevel ?? member.guildMemberLevel, 0);
  const memberRole = guildMemberRole({ ...member, memberLevel });

  return Object.freeze({
    id: memberId(member, index),
    playerId: text(member.playerId || member.id),
    allyCode: text(member.allyCode),
    name: text(member.name || member.playerName || memberId(member, index)),
    galacticPower: finite(member.galacticPower, characterGp + shipGp),
    rosterAvailable: member.rosterAvailable === true || hasDetailedUnits,
    persistenceSummary: member.persistenceSummary === true,
    memberLevel,
    memberRole,
    profileTitle: playerProfileTitle(member),
    playerPortrait: playerPortraitId(member),
    playerPortraitUrl: playerPortraitUrl(member),
    characterGp,
    shipGp,
    characterCount: hasDetailedUnits ? characters.length : suppliedNumber(member.characterCount, 0),
    shipCount: hasDetailedUnits ? ships.length : suppliedNumber(member.shipCount, 0),
    gear13: hasDetailedUnits ? characters.filter((row) => finite(row.gear, 0) >= 13).length : suppliedNumber(member.gear13, 0),
    relic5: hasDetailedUnits ? characters.filter((row) => finite(row.relic, 0) >= 5).length : suppliedNumber(member.relic5, 0),
    relic7: hasDetailedUnits ? characters.filter((row) => finite(row.relic, 0) >= 7).length : suppliedNumber(member.relic7, 0),
    relic9: hasDetailedUnits ? characters.filter((row) => finite(row.relic, 0) >= 9).length : suppliedNumber(member.relic9, 0),
    sevenStarShips: hasDetailedUnits ? ships.filter((row) => finite(row.stars, 0) >= 7).length : suppliedNumber(member.sevenStarShips, 0),
    galacticLegendCount: hasDetailedUnits ? galacticLegends.length : suppliedNumber(member.galacticLegendCount, galacticLegends.length),
    zetaCount: member.zetaCount == null ? derivedZetaCount : suppliedNumber(member.zetaCount, 0),
    omicronCount: member.omicronCount == null ? derivedOmicronCount : suppliedNumber(member.omicronCount, 0),
    ultimateCount: member.ultimateCount == null ? derivedUltimateCount : suppliedNumber(member.ultimateCount, 0),
    omegaUpgradeCount: member.omegaUpgradeCount == null ? derivedOmegaCount : suppliedNumber(member.omegaUpgradeCount, 0),
    galacticLegends: Object.freeze(galacticLegends.map((row) => Object.freeze({ baseId: row.baseId, name: row.name, power: finite(row.power, 0), relic: finite(row.relic, 0) }))),
    topUnits: Object.freeze(topUnits.map((row) => Object.freeze({ baseId: row.baseId, name: row.name, unitType: row.unitType, power: finite(row.power, 0), relic: finite(row.relic, 0), stars: finite(row.stars, 0) }))),
  });
}

function guildLeadership(members = []) {
  const leadership = asArray(members).filter(isGuildLeadership).slice().sort((a, b) => guildRoleRank(a.memberRole) - guildRoleRank(b.memberRole) || b.galacticPower - a.galacticPower || a.name.localeCompare(b.name));
  const leader = leadership.find((row) => row.memberRole === 'Guild Leader') || null;
  const officers = leadership.filter((row) => row.memberRole === 'Officer');
  return Object.freeze({
    leader,
    officers: Object.freeze(officers),
    leadership: Object.freeze(leadership),
    leaderCount: leader ? 1 : 0,
    officerCount: officers.length,
    memberCount: asArray(members).filter((row) => row.memberRole === 'Member').length,
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
  const suppliedSummary = guildBody.summary || {};
  const totalCharacterGp = hydrated.reduce((sum, row) => sum + row.characterGp, 0);
  const totalShipGp = hydrated.reduce((sum, row) => sum + row.shipGp, 0);
  const totalGl = hydrated.reduce((sum, row) => sum + row.galacticLegendCount, 0);
  const totalR7 = hydrated.reduce((sum, row) => sum + row.relic7, 0);
  const totalR9 = hydrated.reduce((sum, row) => sum + row.relic9, 0);
  const totalSevenStarShips = hydrated.reduce((sum, row) => sum + row.sevenStarShips, 0);
  const totalZetas = hydrated.reduce((sum, row) => sum + finite(row.zetaCount, 0), 0);
  const totalOmicrons = hydrated.reduce((sum, row) => sum + finite(row.omicronCount, 0), 0);
  const totalUltimates = hydrated.reduce((sum, row) => sum + finite(row.ultimateCount, 0), 0);
  const omegaComplete = hydrated.length > 0 && hydrated.every((row) => row.omegaUpgradeCount !== null);
  const totalOmegaUpgrades = omegaComplete ? hydrated.reduce((sum, row) => sum + finite(row.omegaUpgradeCount, 0), 0) : null;
  const sortedMembers = members.slice().sort((a, b) => b.galacticPower - a.galacticPower || a.name.localeCompare(b.name));
  const leadership = guildLeadership(sortedMembers);

  return Object.freeze({
    source: text(guildBody.source || "live"),
    sourceDetail: text(guildBody.sourceDetail),
    fetchedAt: text(guildBody.fetchedAt),
    persistence: guildBody.persistence || null,
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
    leadership,
    members: Object.freeze(sortedMembers),
    summary: Object.freeze({
      totalMembers: members.length,
      hydratedMembers: hydrated.length,
      leaderCount: leadership.leaderCount,
      officerCount: leadership.officerCount,
      guildGp: suppliedNumber(suppliedSummary.guildGp, finite(guild.galacticPower, guildGpFromMembers)),
      averageGp: gpValues.length ? Math.round(guildGpFromMembers / gpValues.length) : 0,
      medianGp: median(gpValues),
      highestGp: gpValues.length ? Math.max(...gpValues) : 0,
      lowestGp: gpValues.length ? Math.min(...gpValues) : 0,
      characterGp: suppliedNumber(suppliedSummary.characterGp, totalCharacterGp),
      shipGp: suppliedNumber(suppliedSummary.shipGp, totalShipGp),
      galacticLegends: suppliedNumber(suppliedSummary.galacticLegends, totalGl),
      relic7Characters: suppliedNumber(suppliedSummary.relic7Characters, totalR7),
      relic9Characters: suppliedNumber(suppliedSummary.relic9Characters, totalR9),
      sevenStarShips: suppliedNumber(suppliedSummary.sevenStarShips, totalSevenStarShips),
      zetas: suppliedSummary.zetas == null ? totalZetas : suppliedNumber(suppliedSummary.zetas, totalZetas),
      omicrons: suppliedSummary.omicrons == null ? totalOmicrons : suppliedNumber(suppliedSummary.omicrons, totalOmicrons),
      ultimates: suppliedSummary.ultimates == null ? totalUltimates : suppliedNumber(suppliedSummary.ultimates, totalUltimates),
      omegaUpgrades: suppliedSummary.omegaUpgrades == null ? totalOmegaUpgrades : suppliedNumber(suppliedSummary.omegaUpgrades, totalOmegaUpgrades),
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
      memberRole: text(member.memberRole),
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
    if (!before) { joined.push(member); continue; }
    if (text(before.name) && text(member.name) && text(before.name) !== text(member.name)) renamed.push({ id, before: text(before.name), after: text(member.name) });
    const delta = finite(member.galacticPower, 0) - finite(before.galacticPower, 0);
    if (delta !== 0) gpChanges.push({ id, name: text(member.name), before: finite(before.galacticPower, 0), after: finite(member.galacticPower, 0), delta });
  }
  for (const [id, member] of previousMembers) if (!currentMembers.has(id)) left.push(member);

  gpChanges.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.name.localeCompare(b.name));
  return Object.freeze({ hasPrevious: Boolean(previous), joined: Object.freeze(joined), left: Object.freeze(left), renamed: Object.freeze(renamed), gpChanges: Object.freeze(gpChanges), changed: joined.length + left.length + renamed.length + gpChanges.length > 0 });
}

export function filterGuildMembers(members = [], options = {}) {
  const search = text(options.search).toLowerCase().replace(/-/g, "");
  const status = text(options.status || "All");
  const sort = text(options.sort || "gp");
  let rows = asArray(members).filter((member) => {
    if (status === "Hydrated" && !member.rosterAvailable) return false;
    if (status === "Unavailable" && member.rosterAvailable) return false;
    if (status === "Leadership" && !isGuildLeadership(member)) return false;
    if (status === "Officers" && member.memberRole !== 'Officer') return false;
    if (status === "Members" && member.memberRole !== 'Member') return false;
    if (!search) return true;
    return [member.name, member.allyCode, member.playerId, member.memberRole, member.profileTitle, ...asArray(member.galacticLegends).map((row) => row.name)].join(" ").toLowerCase().replace(/-/g, "").includes(search);
  });

  const comparators = {
    gp: (a, b) => b.galacticPower - a.galacticPower,
    role: (a, b) => guildRoleRank(a.memberRole) - guildRoleRank(b.memberRole) || b.galacticPower - a.galacticPower,
    characterGp: (a, b) => b.characterGp - a.characterGp,
    shipGp: (a, b) => b.shipGp - a.shipGp,
    gl: (a, b) => b.galacticLegendCount - a.galacticLegendCount || b.galacticPower - a.galacticPower,
    relic7: (a, b) => b.relic7 - a.relic7 || b.galacticPower - a.galacticPower,
    name: (a, b) => a.name.localeCompare(b.name),
  };
  rows = rows.slice().sort((comparators[sort] || comparators.gp));
  return Object.freeze(rows);
}

export { guildLeadership };
