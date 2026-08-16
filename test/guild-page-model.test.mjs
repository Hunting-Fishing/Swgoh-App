import test from "node:test";
import assert from "node:assert/strict";
import {
  buildGuildRosterSnapshot,
  compactGuildSnapshot,
  compareGuildSnapshots,
  filterGuildMembers,
} from "../public/guild-page-model.js";

const catalog = [
  { baseId: "GL", name: "Legend", unitType: "Character", categories: ["Galactic Legend"] },
  { baseId: "CHAR", name: "Character", unitType: "Character", categories: [] },
  { baseId: "SHIP", name: "Ship", unitType: "Ship", categories: [] },
];

const guildBody = {
  source: "live",
  fetchedAt: "2026-08-17T00:00:00.000Z",
  guild: { id: "guild-1", name: "Test Guild", galacticPower: 19_000_000, memberCount: 3 },
  hydration: { requested: 3, hydrated: 2, failed: 1, complete: false },
  members: [
    { playerId: "p1", allyCode: "111222333", name: "Alpha", galacticPower: 10_000_000, rosterAvailable: true, units: [
      { baseId: "GL", power: 40000, gear: 13, relic: 9, stars: 7 },
      { baseId: "CHAR", power: 30000, gear: 13, relic: 7, stars: 7 },
      { baseId: "SHIP", power: 50000, stars: 7 },
    ] },
    { playerId: "p2", allyCode: "444555666", name: "Bravo", galacticPower: 9_000_000, rosterAvailable: true, units: [
      { baseId: "CHAR", power: 25000, gear: 13, relic: 5, stars: 7 },
      { baseId: "SHIP", power: 45000, stars: 6 },
    ] },
    { playerId: "p3", allyCode: "777888999", name: "Charlie", galacticPower: 0, rosterAvailable: false, units: [] },
  ],
};

test("builds normalized guild and member roster statistics", () => {
  const snapshot = buildGuildRosterSnapshot(guildBody, catalog);
  assert.equal(snapshot.guild.name, "Test Guild");
  assert.equal(snapshot.summary.totalMembers, 3);
  assert.equal(snapshot.summary.hydratedMembers, 2);
  assert.equal(snapshot.summary.galacticLegends, 1);
  assert.equal(snapshot.summary.relic7Characters, 2);
  assert.equal(snapshot.summary.relic9Characters, 1);
  assert.equal(snapshot.summary.characterGp, 95_000);
  assert.equal(snapshot.summary.shipGp, 95_000);
  const alpha = snapshot.members.find((row) => row.id === "p1");
  assert.equal(alpha.characterGp, 70_000);
  assert.equal(alpha.shipGp, 50_000);
  assert.equal(alpha.galacticLegendCount, 1);
  assert.equal(alpha.relic7, 2);
  assert.equal(alpha.relic9, 1);
  assert.equal(alpha.sevenStarShips, 1);
});

test("compares membership joins leaves renames and GP deltas", () => {
  const previous = {
    guildId: "guild-1",
    members: [
      { id: "p1", name: "Old Alpha", galacticPower: 9_900_000 },
      { id: "gone", name: "Gone", galacticPower: 8_000_000 },
    ],
  };
  const current = {
    guildId: "guild-1",
    members: [
      { id: "p1", name: "Alpha", galacticPower: 10_000_000 },
      { id: "new", name: "New", galacticPower: 7_000_000 },
    ],
  };
  const delta = compareGuildSnapshots(previous, current);
  assert.equal(delta.joined.length, 1);
  assert.equal(delta.left.length, 1);
  assert.equal(delta.renamed.length, 1);
  assert.equal(delta.gpChanges.length, 1);
  assert.equal(delta.gpChanges[0].delta, 100_000);
  assert.equal(delta.changed, true);
});

test("filters and sorts guild members for officer roster review", () => {
  const snapshot = buildGuildRosterSnapshot(guildBody, catalog);
  const hydrated = filterGuildMembers(snapshot.members, { status: "Hydrated", sort: "gl" });
  assert.equal(hydrated.length, 2);
  assert.equal(hydrated[0].name, "Alpha");
  const search = filterGuildMembers(snapshot.members, { search: "444-555-666", status: "All", sort: "name" });
  assert.equal(search.length, 0, "formatted Ally Code is a UI concern; model stores canonical digits");
  const digitsSearch = filterGuildMembers(snapshot.members, { search: "444555666", status: "All", sort: "name" });
  assert.equal(digitsSearch.length, 1);
  assert.equal(digitsSearch[0].name, "Bravo");
});

test("compact snapshot keeps only membership identity and GP history fields", () => {
  const snapshot = buildGuildRosterSnapshot(guildBody, catalog);
  const compact = compactGuildSnapshot(snapshot);
  assert.equal(compact.guildId, "guild-1");
  assert.equal(compact.members.length, 3);
  assert.equal(Object.hasOwn(compact.members[0], "characterGp"), false);
});
