import test from "node:test";
import assert from "node:assert/strict";
import {
  ORDER66_RAID,
  order66EligibilityEvidence,
  resolveOrder66EligibleUnits,
  unitMeetsRaidBand,
} from "../public/guild-raid-order66-rules.js";
import {
  buildGuildOrder66Capability,
  filterGuildOrder66Members,
  filterGuildOrder66Units,
} from "../public/guild-raid-order66-model.js";

const catalog = [
  { baseId: "TAGGED", name: "Future Eligible", unitType: "Character", categories: ["raid_order66_allowed"] },
  { baseId: "PIRATE", name: "Pirate Unit", unitType: "Character", factions: ["Pirate"] },
  { baseId: "JEDI", name: "Vanguard Unit", unitType: "Character", factions: ["Jedi Vanguard"] },
  { baseId: "APPO", name: "CC-1119 \"Appo\"", unitType: "Character", factions: ["Empire"] },
  { baseId: "OLD_BB", name: "Echo", unitType: "Character", factions: ["Bad Batch"] },
  { baseId: "SHIP", name: "Tagged Ship", unitType: "Ship", categories: ["raid_order66_allowed"] },
];

const owned = (baseId, relic = 0, gear = relic > 0 ? 13 : 12, stars = 7, power = 30000) => ({ baseId, relic, gear, stars, power });
const guild = {
  members: [
    { playerId: "a", allyCode: "111222333", name: "Alpha", galacticPower: 10_000_000, rosterAvailable: true, units: [owned("TAGGED", 9), owned("PIRATE", 7), owned("JEDI", 5), owned("APPO", 3)] },
    { playerId: "b", allyCode: "444555666", name: "Bravo", galacticPower: 9_000_000, rosterAvailable: true, units: [owned("TAGGED", 7), owned("PIRATE", 5), owned("JEDI", 1), owned("APPO", 0, 12), owned("OLD_BB", 9)] },
    { playerId: "c", allyCode: "777888999", name: "Charlie", galacticPower: 8_000_000, rosterAvailable: true, units: [owned("PIRATE", 0, 11), owned("JEDI", 0, 12, 6)] },
    { playerId: "d", allyCode: "999888777", name: "Unavailable", galacticPower: 7_000_000, rosterAvailable: false, units: [owned("TAGGED", 9), owned("PIRATE", 9), owned("JEDI", 9), owned("APPO", 9)] },
  ],
};

test("prefers catalog Order 66 tags and keeps official fallback eligibility", () => {
  assert.deepEqual(order66EligibilityEvidence(catalog[0]), { allowed: true, source: "catalog-tag", group: "Order 66 Raid" });
  assert.equal(order66EligibilityEvidence(catalog[1]).allowed, true);
  assert.equal(order66EligibilityEvidence(catalog[2]).allowed, true);
  assert.equal(order66EligibilityEvidence(catalog[3]).allowed, true);
  assert.equal(order66EligibilityEvidence(catalog[4]).allowed, false);
});

test("never admits ships even when they carry an Order 66-like tag", () => {
  const resolved = resolveOrder66EligibleUnits(catalog);
  assert.equal(resolved.units.some((row) => row.baseId === "SHIP"), false);
  assert.equal(resolved.units.some((row) => row.baseId === "OLD_BB"), false);
  assert.equal(resolved.tagResolvedCount, 1);
});

test("official progression bands enforce stars gear and relic floors", () => {
  const g12 = ORDER66_RAID.progressionBands.find((row) => row.id === "g12");
  const r7 = ORDER66_RAID.progressionBands.find((row) => row.id === "r7");
  assert.equal(unitMeetsRaidBand(owned("X", 0, 12, 7), g12), true);
  assert.equal(unitMeetsRaidBand(owned("X", 0, 12, 6), g12), false);
  assert.equal(unitMeetsRaidBand(owned("X", 7, 13, 7), r7), true);
  assert.equal(unitMeetsRaidBand(owned("X", 6, 13, 7), r7), false);
});

test("guild capability counts only hydrated member rosters", () => {
  const model = buildGuildOrder66Capability(guild, catalog);
  assert.equal(model.hydratedMembers, 3);
  assert.equal(model.totalMembers, 4);
  assert.equal(model.summary.allowedCatalogUnits, 4);
  assert.equal(model.summary.totalEligibleOwned, 10);
  assert.equal(model.summary.totalR7Eligible, 3);
  assert.equal(model.summary.totalR9Eligible, 1);
  const tagged = model.units.find((row) => row.baseId === "TAGGED");
  assert.equal(tagged.owners, 2);
  assert.equal(tagged.counts.r9, 1);
});

test("five-character pools remain arithmetic roster depth only", () => {
  const expandedCatalog = [...catalog,
    { baseId: "P2", name: "Pirate Two", unitType: "Character", factions: ["Pirate"] },
    { baseId: "P3", name: "Pirate Three", unitType: "Character", factions: ["Pirate"] },
    { baseId: "P4", name: "Pirate Four", unitType: "Character", factions: ["Pirate"] },
  ];
  const expandedGuild = { members: [{ ...guild.members[0], units: [...guild.members[0].units, owned("P2", 7), owned("P3", 7), owned("P4", 7)] }] };
  const model = buildGuildOrder66Capability(expandedGuild, expandedCatalog);
  assert.equal(model.members[0].bands.r7, 5);
  assert.equal(model.members[0].fiveCharacterPools.r7, 1);
});

test("member and unit filters support officer review", () => {
  const model = buildGuildOrder66Capability(guild, catalog);
  assert.deepEqual(filterGuildOrder66Members(model.members, { search: "444-555-666" }).map((row) => row.memberName), ["Bravo"]);
  assert.equal(filterGuildOrder66Members(model.members, { band: "r9" }).length, 1);
  assert.equal(filterGuildOrder66Units(model.units, { group: "Pirates" }).length, 1);
  assert.equal(filterGuildOrder66Units(model.units, { sort: "scarcity" })[0].owners <= filterGuildOrder66Units(model.units, { sort: "scarcity" }).at(-1).owners, true);
});

test("versioned milestone and multiplier references match the encoded Order 66 rules", () => {
  assert.deepEqual(ORDER66_RAID.progressionBands.map((row) => row.multiplier), [1, 1.5, 2, 3, 4, 6, 9, 12]);
  assert.equal(ORDER66_RAID.guildMilestones.length, 11);
  assert.equal(ORDER66_RAID.guildMilestones[0].score, 10_000_000);
  assert.equal(ORDER66_RAID.guildMilestones.at(-1).score, 520_000_000);
  assert.equal(ORDER66_RAID.guildMilestones.at(-1).mk3, 8_770);
});
