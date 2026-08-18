import test from "node:test";
import assert from "node:assert/strict";
import {
  datacronDelta,
  datacronInventory,
  rosterSummary,
  summarizeDatacronInventory,
} from "../gac-matchup-service.mjs";

function liveRoster(datacrons) {
  return {
    player: {
      allyCode: "732764286",
      name: "Warm Bacon",
      galacticPower: 10_000_000,
      characterGalacticPower: 5_500_000,
      shipGalacticPower: 4_500_000,
    },
    units: [{
      baseId: "DARTHVADER",
      unitType: "Character",
      relic: 8,
      zetas: 3,
      omicrons: 1,
      power: 35_000,
    }],
    ...(datacrons === undefined ? {} : { datacrons }),
  };
}

test("datacron inventory preserves live instance evidence and unlocked affix tiers", () => {
  const inventory = datacronInventory(liveRoster([{
    id: "dc-33-1",
    setId: 33,
    templateId: "datacron_set_33_base",
    tags: ["alignment_dark"],
    level: 6,
    locked: true,
    rerollIndex: 2,
    rerollCount: 3,
    affixes: [
      { tier: 1, kind: "stat", statType: 55, statValue: 25_000_000, requiredRelicTier: 1 },
      { tier: 2, kind: "stat", statType: 48, statValue: 15_000_000 },
      { tier: 3, kind: "ability", targetRule: "targetrule_dark", abilityId: "dc_dark_3" },
      { tier: 4, kind: "stat", statType: 49, statValue: 20_000_000 },
      { tier: 5, kind: "stat", statType: 17, statValue: 30_000_000 },
      { tier: 6, kind: "ability", targetRule: "targetrule_sith", abilityId: "dc_sith_6", requiredRelicTier: 6 },
    ],
  }]));

  assert.equal(inventory.known, true);
  assert.equal(inventory.items.length, 1);
  assert.equal(inventory.items[0].setId, 33);
  assert.equal(inventory.items[0].level, 6);
  assert.equal(inventory.items[0].locked, true);
  assert.equal(inventory.items[0].rerollCount, 3);
  assert.equal(inventory.items[0].affixes[2].abilityId, "dc_dark_3");
  assert.equal(inventory.items[0].affixes[5].targetRule, "targetrule_sith");
  assert.equal(inventory.items[0].affixes[5].requiredRelicTier, 6);
});

test("datacron summary counts Level 3, 6 and 9 inventory plus sets without interpreting bonuses", () => {
  const body = liveRoster([
    { id: "a", setId: 33, level: 3, affixes: [{}, {}, { abilityId: "A3" }] },
    { id: "b", setId: 33, level: 6, rerollCount: 1, affixes: [{}, {}, {}, {}, {}, { abilityId: "A6" }] },
    { id: "c", setId: 32, level: 9, locked: true, affixes: [{}, {}, {}, {}, {}, {}, {}, {}, { abilityId: "A9" }] },
  ]);
  const summary = summarizeDatacronInventory(body);

  assert.equal(summary.known, true);
  assert.equal(summary.count, 3);
  assert.equal(summary.maxLevel, 9);
  assert.equal(summary.level3Plus, 3);
  assert.equal(summary.level6Plus, 2);
  assert.equal(summary.level9Plus, 1);
  assert.equal(summary.locked, 1);
  assert.equal(summary.rerolled, 1);
  assert.equal(summary.abilityAffixes, 3);
  assert.deepEqual(summary.sets, { "32": 1, "33": 2 });
});

test("missing detailed datacron collection remains unknown rather than fake zero", () => {
  const inventory = datacronInventory(liveRoster(undefined));
  const summary = summarizeDatacronInventory(liveRoster(undefined));

  assert.equal(inventory.known, false);
  assert.deepEqual(inventory.items, []);
  assert.equal(summary.known, false);
  assert.equal(summary.count, null);
  assert.equal(summary.level9Plus, null);
  assert.equal(summary.abilityAffixes, null);
});

test("datacron delta is only numeric when both player inventories are known", () => {
  const left = rosterSummary(liveRoster([
    { id: "mine-1", setId: 33, level: 9, affixes: Array.from({ length: 9 }, (_, index) => index === 8 ? { abilityId: "MY_L9" } : {}) },
    { id: "mine-2", setId: 33, level: 6, affixes: Array.from({ length: 6 }, (_, index) => index === 5 ? { abilityId: "MY_L6" } : {}) },
  ]));
  const right = rosterSummary({
    ...liveRoster([
      { id: "enemy-1", setId: 32, level: 6, affixes: Array.from({ length: 6 }, (_, index) => index === 5 ? { abilityId: "ENEMY_L6" } : {}) },
    ]),
    player: { ...liveRoster([]).player, allyCode: "222222222", name: "Navygators" },
  });
  const known = datacronDelta(left, right);

  assert.equal(known.known, true);
  assert.equal(known.count, 1);
  assert.equal(known.level6Plus, 1);
  assert.equal(known.level9Plus, 1);
  assert.equal(known.abilityAffixes, 1);

  const unknownOpponent = rosterSummary({ ...liveRoster(undefined), player: { ...liveRoster([]).player, allyCode: "333333333", name: "Unknown" } });
  const unknown = datacronDelta(left, unknownOpponent);
  assert.equal(unknown.known, false);
  assert.equal(unknown.count, null);
  assert.equal(unknown.level9Plus, null);
});
