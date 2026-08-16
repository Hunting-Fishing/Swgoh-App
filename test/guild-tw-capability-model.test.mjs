import test from "node:test";
import assert from "node:assert/strict";
import { buildGuildTwCapability, filterGuildTwFactions } from "../public/guild-tw-capability-model.js";

const jedi = [
  { baseId: "J1", name: "Jedi Leader", unitType: "Character", factions: ["Jedi", "Light Side"], abilities: [{ id: "leader_jedi", type: "leader" }] },
  { baseId: "J2", name: "Jedi Two", unitType: "Character", factions: ["Jedi", "Light Side"] },
  { baseId: "J3", name: "Jedi Three", unitType: "Character", factions: ["Jedi", "Light Side"] },
  { baseId: "J4", name: "Jedi Four", unitType: "Character", factions: ["Jedi", "Light Side"] },
  { baseId: "J5", name: "Jedi Five", unitType: "Character", factions: ["Jedi", "Light Side"] },
];
const sith = [
  { baseId: "S1", name: "Sith One", unitType: "Character", factions: ["Sith", "Dark Side"] },
  { baseId: "S2", name: "Sith Two", unitType: "Character", factions: ["Sith", "Dark Side"] },
  { baseId: "S3", name: "Sith Three", unitType: "Character", factions: ["Sith", "Dark Side"] },
  { baseId: "S4", name: "Sith Four", unitType: "Character", factions: ["Sith", "Dark Side"] },
  { baseId: "S5", name: "Sith Five", unitType: "Character", factions: ["Sith", "Dark Side"] },
];
const catalog = [...jedi, ...sith];

const owned = (baseId, relic, power = 30000) => ({ baseId, stars: 7, gear: 13, relic, power });
const guild = {
  guild: { id: "g1", name: "Test Guild" },
  members: [
    {
      playerId: "a", allyCode: "111222333", name: "Alpha", galacticPower: 10_000_000, rosterAvailable: true,
      units: [owned("J1", 6, 25000), owned("J2", 7), owned("J3", 7), owned("J4", 7), owned("J5", 7), owned("S1", 5), owned("S2", 5), owned("S3", 5), owned("S4", 5), owned("S5", 5)],
    },
    {
      playerId: "b", allyCode: "444555666", name: "Bravo", galacticPower: 9_000_000, rosterAvailable: true,
      units: [owned("J1", 7), owned("J2", 7), owned("J3", 7), owned("J4", 7), owned("J5", 7)],
    },
    {
      playerId: "c", allyCode: "777888999", name: "Charlie", galacticPower: 8_000_000, rosterAvailable: true,
      units: [owned("J1", 7), owned("J2", 7), owned("J3", 7), owned("J4", 7)],
    },
    {
      playerId: "d", allyCode: "999888777", name: "Unavailable", galacticPower: 7_000_000, rosterAvailable: false,
      units: [owned("J1", 9), owned("J2", 9), owned("J3", 9), owned("J4", 9), owned("J5", 9)],
    },
  ],
};

test("builds factual five-character faction depth without counting unavailable rosters", () => {
  const model = buildGuildTwCapability(guild, catalog);
  assert.equal(model.hydratedMembers, 3);
  assert.equal(model.totalMembers, 4);
  const jediRow = model.factions.find((row) => row.faction === "Jedi");
  assert.ok(jediRow);
  assert.equal(jediRow.completeOwners, 2);
  assert.equal(jediRow.r5Owners, 2);
  assert.equal(jediRow.r7Owners, 1);
  assert.equal(jediRow.leaderCapableOwners, 2);
  assert.equal(jediRow.nearR7Owners, 1);
  assert.equal(jediRow.r7CoveragePercent, 33.3);
  assert.equal(jediRow.concentration, "moderate");
});

test("does not promote generic alignment labels into TW factions", () => {
  const model = buildGuildTwCapability(guild, catalog);
  assert.equal(model.factions.some((row) => row.faction === "Light Side"), false);
  assert.equal(model.factions.some((row) => row.faction === "Dark Side"), false);
});

test("four owned faction characters never count as a complete five-character core", () => {
  const model = buildGuildTwCapability(guild, catalog);
  const jediRow = model.factions.find((row) => row.faction === "Jedi");
  const charlie = jediRow.evaluations.find((row) => row.memberId === "c");
  assert.equal(charlie.ownedCount, 4);
  assert.equal(charlie.complete, false);
  assert.equal(charlie.r5Complete, false);
  assert.equal(charlie.r7Complete, false);
});

test("near-R7 bottlenecks come from an R5-complete core that still needs relic levels", () => {
  const model = buildGuildTwCapability(guild, catalog);
  const jediRow = model.factions.find((row) => row.faction === "Jedi");
  assert.equal(jediRow.bottlenecks.length, 1);
  assert.equal(jediRow.bottlenecks[0].baseId, "J1");
  assert.equal(jediRow.bottlenecks[0].affectedMembers, 1);
  assert.equal(jediRow.bottlenecks[0].totalRelicGap, 1);
  assert.equal(jediRow.bottlenecks[0].members[0].memberName, "Alpha");
});

test("member depth separates owned, R5 and R7 faction cores", () => {
  const model = buildGuildTwCapability(guild, catalog);
  const alpha = model.members.find((row) => row.memberId === "a");
  const bravo = model.members.find((row) => row.memberId === "b");
  assert.equal(alpha.completeFactions, 2);
  assert.equal(alpha.r5Factions, 2);
  assert.equal(alpha.r7Factions, 0);
  assert.equal(bravo.completeFactions, 1);
  assert.equal(bravo.r7Factions, 1);
});

test("filters faction coverage for officer review", () => {
  const model = buildGuildTwCapability(guild, catalog);
  const noR7 = filterGuildTwFactions(model.factions, { coverage: "NoR7" });
  assert.deepEqual(noR7.map((row) => row.faction), ["Sith"]);
  const search = filterGuildTwFactions(model.factions, { search: "jedi" });
  assert.deepEqual(search.map((row) => row.faction), ["Jedi"]);
  const risk = filterGuildTwFactions(model.factions, { sort: "risk" });
  assert.equal(risk[0].r7Owners <= risk.at(-1).r7Owners, true);
});
