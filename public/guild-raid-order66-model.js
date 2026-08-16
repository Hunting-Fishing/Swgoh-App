import {
  ORDER66_RAID,
  resolveOrder66EligibleUnits,
  unitMeetsRaidBand,
} from "./guild-raid-order66-rules.js";

const asArray = (value) => Array.isArray(value) ? value : [];
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const text = (value) => String(value || "").trim();

function memberId(member, index = 0) {
  return text(member?.playerId || member?.id || member?.allyCode || member?.name || `member-${index + 1}`);
}

function catalogIndex(catalog = []) {
  return new Map(asArray(catalog).filter((row) => row?.baseId).map((row) => [String(row.baseId), row]));
}

function enrichedOwnedUnit(unit = {}, byId = new Map()) {
  const staticUnit = byId.get(String(unit?.baseId || "")) || {};
  return Object.freeze({
    ...staticUnit,
    ...unit,
    baseId: String(unit?.baseId || staticUnit?.baseId || ""),
    name: text(unit?.name || staticUnit?.name || unit?.baseId),
    stars: finite(unit?.stars, 0),
    gear: finite(unit?.gear, 0),
    relic: finite(unit?.relic, 0),
    power: finite(unit?.power, 0),
  });
}

function progressionRank(unit = {}) {
  return finite(unit.relic, 0) * 1_000_000
    + finite(unit.gear, 0) * 100_000
    + finite(unit.stars, 0) * 10_000
    + finite(unit.power, 0);
}

function bandCount(units, band) {
  return units.filter((unit) => unitMeetsRaidBand(unit, band)).length;
}

function bandMap(units) {
  return Object.freeze(Object.fromEntries(ORDER66_RAID.progressionBands.map((band) => [band.id, bandCount(units, band)])));
}

function groupsOf(units = []) {
  const counts = new Map();
  for (const unit of units) {
    const group = text(unit?.raidGroup || "Other Eligible");
    counts.set(group, (counts.get(group) || 0) + 1);
  }
  return Object.freeze([...counts.entries()]
    .map(([group, count]) => Object.freeze({ group, count }))
    .sort((a, b) => b.count - a.count || a.group.localeCompare(b.group)));
}

function progressionLabel(unit = {}) {
  if (finite(unit.relic, 0) > 0) return `R${finite(unit.relic, 0)}`;
  if (finite(unit.gear, 0) > 0) return `G${finite(unit.gear, 0)}`;
  return `${finite(unit.stars, 0)}★`;
}

export function buildGuildOrder66Capability(guildSnapshot = {}, catalog = []) {
  const byId = catalogIndex(catalog);
  const eligibility = resolveOrder66EligibleUnits(catalog);
  const allowedById = new Map(eligibility.units.map((unit) => [String(unit.baseId), unit]));
  const members = asArray(guildSnapshot?.members).map((member, index) => {
    const id = memberId(member, index);
    const owned = asArray(member?.units)
      .map((unit) => enrichedOwnedUnit(unit, byId))
      .filter((unit) => allowedById.has(String(unit.baseId)))
      .map((unit) => Object.freeze({
        ...allowedById.get(String(unit.baseId)),
        ...unit,
      }))
      .sort((a, b) => progressionRank(b) - progressionRank(a) || String(a.name).localeCompare(String(b.name)));
    const bands = bandMap(owned);
    return Object.freeze({
      id,
      playerId: text(member?.playerId || member?.id),
      allyCode: text(member?.allyCode),
      memberName: text(member?.name || id),
      memberGp: finite(member?.galacticPower, 0),
      rosterAvailable: Boolean(member?.rosterAvailable),
      eligibleOwned: Object.freeze(owned),
      eligibleOwnedCount: owned.length,
      bands,
      fiveCharacterPools: Object.freeze(Object.fromEntries(ORDER66_RAID.progressionBands.map((band) => [band.id, Math.floor((bands[band.id] || 0) / ORDER66_RAID.rosterSize)]))),
      groups: groupsOf(owned),
      strongestEligible: Object.freeze(owned.slice(0, 10).map((unit) => Object.freeze({
        baseId: unit.baseId,
        name: unit.name,
        power: unit.power,
        relic: unit.relic,
        gear: unit.gear,
        stars: unit.stars,
        raidGroup: unit.raidGroup,
        progression: progressionLabel(unit),
      }))),
    });
  });
  const hydrated = members.filter((member) => member.rosterAvailable);

  const unitRows = eligibility.units.map((staticUnit) => {
    const owners = hydrated.map((member) => {
      const unit = member.eligibleOwned.find((row) => String(row.baseId) === String(staticUnit.baseId));
      return unit ? Object.freeze({
        memberId: member.id,
        memberName: member.memberName,
        allyCode: member.allyCode,
        memberGp: member.memberGp,
        unit,
      }) : null;
    }).filter(Boolean);
    const counts = Object.fromEntries(ORDER66_RAID.progressionBands.map((band) => [band.id, owners.filter((row) => unitMeetsRaidBand(row.unit, band)).length]));
    return Object.freeze({
      baseId: String(staticUnit.baseId),
      name: text(staticUnit.name || staticUnit.baseId),
      raidGroup: text(staticUnit.raidGroup || "Eligible"),
      eligibilitySource: text(staticUnit.eligibilitySource),
      image: text(staticUnit.image),
      owners: owners.length,
      missingMembers: Math.max(0, hydrated.length - owners.length),
      counts: Object.freeze(counts),
      ownershipPercent: hydrated.length ? Math.round((owners.length / hydrated.length) * 1000) / 10 : 0,
      ownerRows: Object.freeze(owners.sort((a, b) => progressionRank(b.unit) - progressionRank(a.unit) || b.memberGp - a.memberGp || a.memberName.localeCompare(b.memberName))),
    });
  }).sort((a, b) => b.counts.r9 - a.counts.r9
    || b.counts.r7 - a.counts.r7
    || b.counts.r5 - a.counts.r5
    || b.owners - a.owners
    || a.name.localeCompare(b.name));

  const guildBandCounts = Object.freeze(Object.fromEntries(ORDER66_RAID.progressionBands.map((band) => [
    band.id,
    hydrated.reduce((sum, member) => sum + finite(member.bands[band.id], 0), 0),
  ])));
  const memberRows = hydrated.slice().sort((a, b) => finite(b.bands.r9) - finite(a.bands.r9)
    || finite(b.bands.r7) - finite(a.bands.r7)
    || finite(b.bands.r5) - finite(a.bands.r5)
    || b.eligibleOwnedCount - a.eligibleOwnedCount
    || b.memberGp - a.memberGp
    || a.memberName.localeCompare(b.memberName));

  return Object.freeze({
    raid: ORDER66_RAID,
    eligibility,
    totalMembers: members.length,
    hydratedMembers: hydrated.length,
    members: Object.freeze(memberRows),
    units: Object.freeze(unitRows),
    guildBandCounts,
    summary: Object.freeze({
      allowedCatalogUnits: eligibility.units.length,
      tagResolvedUnits: eligibility.tagResolvedCount,
      fallbackResolvedUnits: eligibility.fallbackResolvedCount,
      membersWithEligibleUnits: hydrated.filter((member) => member.eligibleOwnedCount > 0).length,
      membersWithFiveEligible: hydrated.filter((member) => finite(member.bands.none) >= ORDER66_RAID.rosterSize).length,
      membersWithFiveG12: hydrated.filter((member) => finite(member.bands.g12) >= ORDER66_RAID.rosterSize).length,
      membersWithFiveR5: hydrated.filter((member) => finite(member.bands.r5) >= ORDER66_RAID.rosterSize).length,
      membersWithFiveR7: hydrated.filter((member) => finite(member.bands.r7) >= ORDER66_RAID.rosterSize).length,
      membersWithFiveR9: hydrated.filter((member) => finite(member.bands.r9) >= ORDER66_RAID.rosterSize).length,
      totalEligibleOwned: guildBandCounts.none || 0,
      totalR5Eligible: guildBandCounts.r5 || 0,
      totalR7Eligible: guildBandCounts.r7 || 0,
      totalR9Eligible: guildBandCounts.r9 || 0,
    }),
  });
}

export function filterGuildOrder66Members(rows = [], options = {}) {
  const search = text(options.search).toLowerCase().replace(/-/g, "");
  const band = text(options.band || "all");
  let filtered = asArray(rows).filter((row) => {
    if (band !== "all" && finite(row.bands?.[band], 0) <= 0) return false;
    if (!search) return true;
    return [row.memberName, row.allyCode, ...row.strongestEligible.map((unit) => unit.name)]
      .join(" ").toLowerCase().replace(/-/g, "").includes(search);
  });
  filtered = filtered.slice().sort((a, b) => finite(b.bands.r9) - finite(a.bands.r9)
    || finite(b.bands.r7) - finite(a.bands.r7)
    || finite(b.bands.r5) - finite(a.bands.r5)
    || b.eligibleOwnedCount - a.eligibleOwnedCount
    || b.memberGp - a.memberGp);
  return Object.freeze(filtered);
}

export function filterGuildOrder66Units(rows = [], options = {}) {
  const search = text(options.search).toLowerCase();
  const group = text(options.group || "All");
  const sort = text(options.sort || "r7");
  let filtered = asArray(rows).filter((row) => {
    if (group !== "All" && row.raidGroup !== group) return false;
    return !search || [row.name, row.baseId, row.raidGroup].join(" ").toLowerCase().includes(search);
  });
  const comparators = {
    r9: (a, b) => b.counts.r9 - a.counts.r9 || b.counts.r7 - a.counts.r7 || b.owners - a.owners,
    r7: (a, b) => b.counts.r7 - a.counts.r7 || b.counts.r5 - a.counts.r5 || b.owners - a.owners,
    owners: (a, b) => b.owners - a.owners || b.counts.r7 - a.counts.r7,
    scarcity: (a, b) => a.owners - b.owners || a.counts.r7 - b.counts.r7 || a.name.localeCompare(b.name),
    name: (a, b) => a.name.localeCompare(b.name),
  };
  return Object.freeze(filtered.slice().sort(comparators[sort] || comparators.r7));
}
