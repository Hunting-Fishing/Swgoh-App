import assert from "node:assert/strict";
import test from "node:test";

import { buildPlayerCommandDashboard } from "../public/player-command-model.js";

function character(index, extra = {}) {
  return {
    baseId: `CHAR_${index}`,
    name: `Character ${index}`,
    unitType: "Character",
    stars: 7,
    relic: 5,
    power: 30_000 + index,
    ...extra,
  };
}

function ship(index, extra = {}) {
  return {
    baseId: `SHIP_${index}`,
    name: `Ship ${index}`,
    unitType: "Ship",
    stars: 7,
    relic: 0,
    power: 50_000 + index,
    ...extra,
  };
}

test("Player Command preserves a 394-unit logical roster and ranks across all 50 Guild members", () => {
  const characters = Array.from({ length: 325 }, (_, index) => character(index));
  const ships = Array.from({ length: 69 }, (_, index) => ship(index));
  characters[0] = character(0, { baseId: "ROTE_R9", name: "ROTE R9", relic: 9 });
  ships[0] = ship(0, { baseId: "ROTE_SHIP", name: "ROTE Ship", stars: 7 });

  const target = {
    allyCode: "732764286",
    name: "Warm Bacon",
    galacticPower: 10_000_000,
    characterGalacticPower: 6_500_000,
    shipGalacticPower: 3_500_000,
    galacticLegendCount: 8,
    relic7: 120,
    relic9: 20,
    zetaCount: 300,
    omicronCount: 45,
  };
  const guildMembers = [target];
  for (let index = 0; index < 49; index += 1) {
    const above = index < 10;
    guildMembers.push({
      allyCode: String(100000000 + index),
      name: `Member ${index}`,
      galacticPower: above ? 11_000_000 + index : 9_000_000 - index,
      characterGalacticPower: above ? 7_000_000 + index : 6_000_000 - index,
      shipGalacticPower: above ? 4_000_000 + index : 3_000_000 - index,
      galacticLegendCount: above ? 9 : 7,
      relic7: above ? 130 : 110,
      relic9: above ? 21 : 19,
      zetaCount: above ? 320 : 280,
      omicronCount: above ? 50 : 40,
    });
  }

  const model = buildPlayerCommandDashboard({
    playerBody: {
      source: "canonical",
      fetchedAt: "2026-08-17T18:00:00Z",
      player: {
        allyCode: "732764286",
        name: "Warm Bacon",
        level: 85,
        guildName: "Test Guild",
        galacticPower: 12_655_455,
        characterGalacticPower: 8_146_249,
        shipGalacticPower: 4_515_899,
      },
      units: characters,
      ships,
      summary: {
        characters: 325,
        ships: 69,
        galacticLegends: 8,
        gear13: 250,
        relic5Plus: 210,
        relic7Plus: 120,
        relic9: 20,
        sevenStarShips: 65,
        zetas: 300,
        omicrons: 45,
        ultimates: 8,
        omegaUpgrades: null,
      },
      persistence: {
        logicalRosterComplete: true,
        expectedOwnedUnits: 394,
        returnedOwnedUnits: 394,
        lastSyncedAt: "2026-08-17T18:00:00Z",
      },
    },
    guildBody: { members: guildMembers },
    historyBody: {
      player: { allyCode: "732764286" },
      summary: { events: 2, gpGained: 1234, omicronsAdded: 1 },
      trend: { comparable: true, galacticPower: 20_000 },
      progression: [{ id: 2 }, { id: 1 }],
    },
    operations: {
      requirements: [
        {
          baseId: "ROTE_R9",
          name: "ROTE R9",
          unitType: "Character",
          maxRelic: 9,
          requiredCount: 4,
          relicCounts: { 5: 2, 7: 1, 9: 1 },
        },
        {
          baseId: "ROTE_SHIP",
          name: "ROTE Ship",
          unitType: "Ship",
          maxRarity: 7,
          requiredCount: 2,
          rarityCounts: { 7: 2 },
        },
        {
          baseId: "MISSING_R7",
          name: "Missing R7",
          unitType: "Character",
          maxRelic: 7,
          requiredCount: 5,
          relicCounts: { 7: 5 },
        },
      ],
    },
  });

  assert.ok(model);
  assert.equal(model.roster.ownedUnits, 394);
  assert.equal(model.roster.expectedOwnedUnits, 394);
  assert.equal(model.source.logicalRosterComplete, true);
  assert.equal(model.guildRanks.totalMembers, 50);
  assert.equal(model.guildRanks.gp.rank, 11);
  assert.equal(model.guildRanks.gp.total, 50);
  assert.equal(model.guildRanks.omicrons.rank, 11);
  assert.equal(model.rote.uniqueRequiredUnits, 3);
  assert.equal(model.rote.ownedRequiredUnits, 2);
  assert.equal(model.rote.highestGateReadyUnits, 2);
  assert.equal(model.rote.missingRequiredUnits, 1);
  assert.equal(model.rote.demandedOccurrences, 11);
  assert.equal(model.rote.supportedOccurrences, 6);
  assert.equal(model.roster.omegaEta, null);
  assert.equal(model.history.recentChanges.length, 2);
  assert.equal(model.development.roteGaps.length, 1);
  assert.equal(model.development.roteGaps[0].baseId, "MISSING_R7");
  assert.deepEqual(model.development.guildRankSignals, []);
  assert.equal(model.development.hasEvidence, true);
});

test("Player development queue keeps Guild-rank weakness and recent momentum as separate evidence", () => {
  const playerBody = {
    source: "canonical",
    player: { allyCode: "732764286", name: "Warm Bacon", galacticPower: 10_000_000 },
    units: [character(1, { baseId: "REY", name: "Rey", relic: 7 })],
    ships: [],
    summary: { characters: 1, ships: 0, relic7Plus: 1, zetas: 10, omicrons: 2 },
    persistence: { logicalRosterComplete: true, expectedOwnedUnits: 1, returnedOwnedUnits: 1 },
  };
  const target = {
    allyCode: "732764286",
    galacticPower: 10_000_000,
    characterGalacticPower: 7_000_000,
    shipGalacticPower: 2_000_000,
    galacticLegendCount: 2,
    relic7: 10,
    relic9: 1,
    zetaCount: 10,
    omicronCount: 2,
  };
  const members = [target, ...Array.from({ length: 49 }, (_, index) => ({
    allyCode: String(200000000 + index),
    galacticPower: 11_000_000 + index,
    characterGalacticPower: index < 20 ? 4_000_000 : 6_000_000 + index,
    shipGalacticPower: 3_000_000 + index,
    galacticLegendCount: 3,
    relic7: 20,
    relic9: 2,
    zetaCount: 20,
    omicronCount: 4,
  }))];
  const model = buildPlayerCommandDashboard({
    playerBody,
    guildBody: { members },
    historyBody: {
      player: { allyCode: "732764286" },
      progression: [{
        id: 9,
        baseId: "REY",
        unitName: "Rey",
        changedAt: "2026-08-18T00:00:00Z",
        delta: { relicTier: 1, galacticPower: 850, omicronCount: 1 },
      }],
    },
    operations: { requirements: [] },
  });

  assert.ok(model);
  assert.ok(model.development.guildRankSignals.some((row) => row.key === "shipGp" && row.band === "lower-quartile"));
  assert.ok(model.development.guildRankSignals.some((row) => row.key === "omicrons"));
  assert.equal(model.development.guildRankSignals.some((row) => row.key === "characterGp"), false);
  assert.equal(model.development.recentMomentum.length, 1);
  assert.equal(model.development.recentMomentum[0].baseId, "REY");
  assert.deepEqual(model.development.recentMomentum[0].evidence, ["Omicron", "Relic", "GP"]);
});
