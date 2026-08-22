import assert from "node:assert/strict";
import test from "node:test";

import {
  compactGuildTbReadinessRoster,
  createGuildTbReadinessRosterService,
} from "../guild-tb-readiness-roster-service.mjs";

const catalog = [
  { baseId: "CEREJUNDA", name: "Cere Junda", categories: ["Unaligned Force User"] },
  { baseId: "JEDIKNIGHTCAL", name: "Jedi Knight Cal Kestis", categories: ["Jedi"] },
  { baseId: "CALKESTIS", name: "Cal Kestis", categories: ["Unaligned Force User"] },
  { baseId: "PAZVIZSLA", name: "Paz Vizsla", categories: ["Mandalorian"] },
  { baseId: "FIFTHBROTHER", name: "Fifth Brother", categories: ["Inquisitorius"] },
  { baseId: "DARTHVADER", name: "Darth Vader", categories: ["Empire"] },
];

function unit(baseId, gear = 13, relic = 7, power = 30000) {
  return { baseId, gear, relic, stars: 7, power };
}

test("compact Guild TB roster keeps exact gates and dynamic faction candidates only", () => {
  const body = compactGuildTbReadinessRoster({
    guild: { id: "g1", name: "Test Guild", memberCount: 1 },
    members: [{
      persistentId: "11111111-1111-1111-1111-111111111111",
      allyCode: "123456789",
      name: "Tester",
      rosterAvailable: true,
      units: [
        unit("CEREJUNDA"),
        unit("JEDIKNIGHTCAL"),
        unit("CALKESTIS", 12, 0, 18000),
        unit("PAZVIZSLA"),
        unit("FIFTHBROTHER"),
        unit("DARTHVADER"),
      ],
    }],
  }, catalog);

  const ids = body.members[0].units.map((row) => row.baseId).sort();
  assert.deepEqual(ids, ["CALKESTIS", "CEREJUNDA", "FIFTHBROTHER", "JEDIKNIGHTCAL", "PAZVIZSLA"]);
  assert.equal(body.tbReadiness.returnedUnitRows, 5);
  assert.equal(body.tbReadiness.memberCount, 1);
  assert.equal(body.members[0].tbReadinessRoster, true);
});

test("bulk service queries relevant progression once and assigns it to Guild members", async () => {
  const selectCalls = [];
  const service = createGuildTbReadinessRosterService({
    canonical: {
      async getGuildRosterByPlayer() {
        return {
          guild: { id: "g1", name: "Test Guild", memberCount: 2 },
          members: [
            { persistentId: "11111111-1111-1111-1111-111111111111", allyCode: "123456789", name: "One", rosterAvailable: true, units: [] },
            { persistentId: "22222222-2222-2222-2222-222222222222", allyCode: "987654321", name: "Two", rosterAvailable: true, units: [] },
          ],
        };
      },
      async getGameUnitCatalog() { return catalog; },
    },
    store: {
      async select(table, query) {
        selectCalls.push({ table, query });
        return [
          { player_id: "11111111-1111-1111-1111-111111111111", base_id: "CEREJUNDA", unit_name: "Cere Junda", rarity: 7, level: 85, gear_level: 13, relic_tier: 7, galactic_power: 32000 },
          { player_id: "11111111-1111-1111-1111-111111111111", base_id: "PAZVIZSLA", unit_name: "Paz Vizsla", rarity: 7, level: 85, gear_level: 13, relic_tier: 7, galactic_power: 31000 },
          { player_id: "22222222-2222-2222-2222-222222222222", base_id: "FIFTHBROTHER", unit_name: "Fifth Brother", rarity: 7, level: 85, gear_level: 13, relic_tier: 6, galactic_power: 29000 },
        ];
      },
    },
  });

  const body = await service.getGuildTbReadinessRosterByPlayer("123-456-789");
  assert.equal(selectCalls.length, 1);
  assert.equal(selectCalls[0].table, "player_units_current");
  assert.match(selectCalls[0].query.player_id, /11111111-1111-1111-1111-111111111111/);
  assert.match(selectCalls[0].query.player_id, /22222222-2222-2222-2222-222222222222/);
  assert.match(selectCalls[0].query.base_id, /PAZVIZSLA/);
  assert.match(selectCalls[0].query.base_id, /FIFTHBROTHER/);
  assert.deepEqual(body.members[0].units.map((row) => row.baseId).sort(), ["CEREJUNDA", "PAZVIZSLA"]);
  assert.deepEqual(body.members[1].units.map((row) => row.baseId), ["FIFTHBROTHER"]);
});
