import assert from "node:assert/strict";
import test from "node:test";
import { buildGuildRosterSnapshot } from "../public/guild-page-model.js";

const catalog = [
  { baseId: "CHARA", name: "Character A", unitType: "Character", categories: [] },
  { baseId: "CHARB", name: "Character B", unitType: "Character", categories: [] },
  { baseId: "SHIPA", name: "Ship A", unitType: "Ship", categories: [] },
];

test("rich live Guild derives zeta, omicron and ultimate totals from full member units", () => {
  const snapshot = buildGuildRosterSnapshot({
    source: "live",
    guild: { id: "guild-1", name: "Live Guild", memberCount: 2, galacticPower: 20_000_000 },
    hydration: { requested: 2, hydrated: 2, failed: 0, complete: true },
    members: [
      {
        id: "p1", allyCode: "700000001", name: "Alpha", galacticPower: 10_000_000,
        units: [
          { baseId: "CHARA", unitType: "Character", power: 30_000, gear: 13, relic: 7, stars: 7, zetas: 2, omicrons: 1, omegas: 4, ultimateUnlocked: true },
          { baseId: "SHIPA", unitType: "Ship", power: 80_000, stars: 7, zetas: 0, omicrons: 0, omegas: 3, ultimateUnlocked: false },
        ],
      },
      {
        id: "p2", allyCode: "700000002", name: "Beta", galacticPower: 10_000_000,
        units: [
          { baseId: "CHARB", unitType: "Character", power: 25_000, gear: 13, relic: 5, stars: 7, zetas: 1, omicrons: 2, omegas: 5, ultimateUnlocked: false },
        ],
      },
    ],
  }, catalog);

  assert.equal(snapshot.members[0].zetaCount + snapshot.members[1].zetaCount, 3);
  assert.equal(snapshot.members[0].omicronCount + snapshot.members[1].omicronCount, 3);
  assert.equal(snapshot.summary.zetas, 3);
  assert.equal(snapshot.summary.omicrons, 3);
  assert.equal(snapshot.summary.ultimates, 1);
  assert.equal(snapshot.summary.omegaUpgrades, 12);
});

test("one unknown live Omega/Eta unit keeps member and Guild Omega total unknown", () => {
  const snapshot = buildGuildRosterSnapshot({
    source: "live",
    guild: { id: "guild-1", name: "Live Guild", memberCount: 1, galacticPower: 10_000_000 },
    hydration: { requested: 1, hydrated: 1, failed: 0, complete: true },
    members: [{
      id: "p1", allyCode: "700000001", name: "Alpha", galacticPower: 10_000_000,
      units: [
        { baseId: "CHARA", unitType: "Character", power: 30_000, gear: 13, relic: 7, stars: 7, zetas: 2, omicrons: 1, omegas: 4, ultimateUnlocked: true },
        { baseId: "SHIPA", unitType: "Ship", power: 80_000, stars: 7, zetas: 0, omicrons: 0, omegas: null, ultimateUnlocked: false },
      ],
    }],
  }, catalog);

  assert.equal(snapshot.members[0].zetaCount, 2);
  assert.equal(snapshot.members[0].omicronCount, 1);
  assert.equal(snapshot.members[0].ultimateCount, 1);
  assert.equal(snapshot.members[0].omegaUpgradeCount, null);
  assert.equal(snapshot.summary.omegaUpgrades, null);
});

test("canonical summary members preserve persisted ability totals without embedded units", () => {
  const snapshot = buildGuildRosterSnapshot({
    source: "canonical",
    guild: { id: "guild-1", name: "Canonical Guild", memberCount: 1, galacticPower: 10_000_000 },
    hydration: { requested: 1, hydrated: 1, failed: 0, complete: true },
    summary: { zetas: 100, omicrons: 20, ultimates: 7, omegaUpgrades: null },
    members: [{
      id: "p1", allyCode: "700000001", name: "Alpha", galacticPower: 10_000_000,
      characterGalacticPower: 6_000_000, shipGalacticPower: 4_000_000,
      rosterAvailable: true, persistenceSummary: true, characterCount: 300, shipCount: 60,
      gear13: 200, relic5: 150, relic7: 75, relic9: 8, sevenStarShips: 50,
      galacticLegendCount: 7, zetaCount: 100, omicronCount: 20, ultimateCount: 7,
      omegaUpgradeCount: null, units: [], galacticLegends: [], topUnits: [],
    }],
  }, catalog);

  assert.equal(snapshot.members.length, 1);
  assert.equal(snapshot.members[0].zetaCount, 100);
  assert.equal(snapshot.members[0].omicronCount, 20);
  assert.equal(snapshot.members[0].ultimateCount, 7);
  assert.equal(snapshot.summary.zetas, 100);
  assert.equal(snapshot.summary.omicrons, 20);
  assert.equal(snapshot.summary.ultimates, 7);
  assert.equal(snapshot.summary.omegaUpgrades, null);
});
