import test from "node:test";
import assert from "node:assert/strict";

import { createGacMatchupService } from "../gac-matchup-service.mjs";

function player(allyCode, name, gp, units) {
  return {
    player: {
      allyCode,
      name,
      galacticPower: gp,
      characterGalacticPower: Math.floor(gp * 0.55),
      shipGalacticPower: Math.floor(gp * 0.45),
    },
    units,
  };
}

function unit(baseId, relic, { zetas = 0, omicrons = 0, power = 30_000, ultimateUnlocked = false } = {}) {
  return { baseId, name: baseId, unitType: "CHARACTER", relic, zetas, omicrons, power, ultimateUnlocked };
}

test("round 3 matchup resolves opponent, computes deltas, detects defense, and excludes committed counters", async () => {
  const myAllyCode = "111111111";
  const opponentAllyCode = "222222222";
  const currentEvent = {
    eventInstanceId: "GAC-ROUND-3",
    round: 3,
    status: "ATTACK",
    format: "5v5",
    matchups: [
      {
        players: [
          { allyCode: myAllyCode, name: "Warmbacon" },
          { allyCode: opponentAllyCode, name: "Navygators" },
        ],
      },
    ],
    placements: [
      {
        owner: { allyCode: opponentAllyCode },
        type: "DEFENSE",
        zone: "FRONT-TOP",
        slot: 1,
        leaderBaseId: "ENEMY_LEAD",
        members: ["ENEMY_LEAD", "ENEMY_2", "ENEMY_3", "ENEMY_4", "ENEMY_5"],
      },
      {
        owner: { allyCode: myAllyCode },
        type: "DEFENSE",
        zone: "FRONT-TOP",
        slot: 1,
        leaderBaseId: "USED_LEAD",
        members: ["USED_LEAD", "USED_2", "USED_3", "USED_4", "USED_5"],
      },
    ],
  };

  const myRoster = player(myAllyCode, "Warmbacon", 10_000_000, [
    unit("USED_LEAD", 8, { zetas: 2, omicrons: 1 }),
    unit("USED_2", 7), unit("USED_3", 7), unit("USED_4", 7), unit("USED_5", 7),
    unit("COUNTER_LEAD", 9, { zetas: 3, omicrons: 1, ultimateUnlocked: true }),
    unit("COUNTER_2", 8, { zetas: 2 }),
    unit("COUNTER_3", 8, { zetas: 2 }),
    unit("COUNTER_4", 7, { zetas: 1 }),
    unit("COUNTER_5", 7, { zetas: 1 }),
  ]);
  const opponentRoster = player(opponentAllyCode, "Navygators", 9_700_000, [
    unit("ENEMY_LEAD", 8, { zetas: 3, omicrons: 1 }),
    unit("ENEMY_2", 7, { zetas: 1 }), unit("ENEMY_3", 7), unit("ENEMY_4", 7), unit("ENEMY_5", 7),
  ]);

  const responses = new Map([
    ["/v1/gac/current-event", currentEvent],
    [`/v1/gac/player/${myAllyCode}`, { allyCode: myAllyCode, playerId: "ME", round: 3, status: "ATTACK", format: "5v5" }],
    [`/v1/player/${myAllyCode}`, myRoster],
    [`/v1/player/${opponentAllyCode}`, opponentRoster],
  ]);

  const requestGateway = async (path) => {
    assert.ok(responses.has(path), `unexpected gateway path ${path}`);
    return structuredClone(responses.get(path));
  };

  const history = {
    async getCounterEvidence() {
      return {
        observations: [
          {
            counterLeaderBaseId: "USED_LEAD",
            counterMembers: ["USED_LEAD", "USED_2", "USED_3", "USED_4", "USED_5"],
            battles: 300,
            wins: 299,
            winRate: 299 / 300,
            averageBanners: 65,
            source: "history",
            sourceRef: "committed-counter",
          },
          {
            counterLeaderBaseId: "COUNTER_LEAD",
            counterMembers: ["COUNTER_LEAD", "COUNTER_2", "COUNTER_3", "COUNTER_4", "COUNTER_5"],
            battles: 160,
            wins: 144,
            winRate: 0.9,
            averageBanners: 63,
            source: "history",
            sourceRef: "available-counter",
          },
        ],
      };
    },
  };

  const service = createGacMatchupService({ requestGateway, history });
  const result = await service.analyze(myAllyCode, { enemyLeaderBaseId: "ENEMY_LEAD" });

  assert.equal(result.event.round, 3);
  assert.equal(result.event.status, "ATTACK");
  assert.equal(result.format, "5v5");
  assert.equal(result.matchup.me.name, "Warmbacon");
  assert.equal(result.matchup.opponent.name, "Navygators");
  assert.equal(result.matchup.delta.galacticPower, 300_000);
  assert.equal(result.defense.mine.length, 1);
  assert.equal(result.defense.opponent.length, 1);
  assert.equal(result.defense.opponent[0].leaderBaseId, "ENEMY_LEAD");
  assert.equal(result.recommendedCounters.length, 1);
  assert.equal(result.recommendedCounters[0].leaderBaseId, "COUNTER_LEAD");
  assert.equal(result.recommendedCounters[0].sourceRef, "available-counter");
});
