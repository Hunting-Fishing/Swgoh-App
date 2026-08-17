import assert from "node:assert/strict";
import test from "node:test";
import { buildGuildRosterSnapshot, filterGuildMembers } from "../public/guild-page-model.js";

test("Guild page keeps the full 50-member canonical list without embedded 19k unit payload", () => {
  const members = Array.from({ length: 50 }, (_, index) => ({
    id: `player-${index + 1}`,
    playerId: `player-${index + 1}`,
    allyCode: String(700000000 + index),
    name: index === 0 ? "Warm Bacon" : `Member ${index + 1}`,
    galacticPower: 12_000_000 - index,
    characterGalacticPower: 8_000_000 - index,
    shipGalacticPower: 4_000_000,
    rosterAvailable: true,
    persistenceSummary: true,
    characterCount: 325,
    shipCount: 69,
    gear13: 250,
    relic5: 180,
    relic7: 90,
    relic9: 9,
    sevenStarShips: 60,
    galacticLegendCount: 8,
    zetaCount: 282,
    omicronCount: 28,
    ultimateCount: 8,
    omegaUpgradeCount: null,
    galacticLegends: [],
    topUnits: [],
    units: [],
  }));
  members[0].allyCode = "732764286";

  const snapshot = buildGuildRosterSnapshot({
    source: "canonical",
    fetchedAt: "2026-08-17T17:55:08.229Z",
    guild: { id: "guild-1", name: "Ludus Venatus", galacticPower: 574397661, memberCount: 50 },
    hydration: { requested: 50, hydrated: 50, failed: 0, complete: true },
    summary: { characterGp: 368491019, shipGp: 206238998, galacticLegends: 331, relic7Characters: 4325, relic9Characters: 437, sevenStarShips: 2885, zetas: 14174, omicrons: 2050, ultimates: 323, omegaUpgrades: null },
    members,
  }, []);

  assert.equal(snapshot.members.length, 50);
  assert.equal(snapshot.summary.totalMembers, 50);
  assert.equal(snapshot.hydration.complete, true);
  assert.equal(snapshot.summary.characterGp, 368491019);
  assert.equal(snapshot.summary.shipGp, 206238998);
  assert.equal(snapshot.summary.zetas, 14174);
  assert.equal(snapshot.summary.omicrons, 2050);

  const warmBacon = snapshot.members.find((member) => member.allyCode === "732764286");
  assert.ok(warmBacon);
  assert.equal(warmBacon.characterCount, 325);
  assert.equal(warmBacon.shipCount, 69);
  assert.equal(warmBacon.characterGp, 8_000_000);
  assert.equal(warmBacon.shipGp, 4_000_000);
  assert.equal(warmBacon.galacticLegendCount, 8);
  assert.equal(warmBacon.zetaCount, 282);
  assert.equal(warmBacon.omicronCount, 28);
  assert.equal(warmBacon.rosterAvailable, true);

  assert.equal(filterGuildMembers(snapshot.members, { search: "Warm Bacon", sort: "gp" }).length, 1);
  assert.equal(filterGuildMembers(snapshot.members, { status: "Hydrated", sort: "gp" }).length, 50);
});
