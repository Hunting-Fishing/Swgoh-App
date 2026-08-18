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

test("round 3 live matchup resolves opponent, computes deltas, detects defense, and excludes committed counters", async () => {
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
  const confirmedOpponent = {
    async findLatestConfirmed() {
      throw new Error("saved pairing should not be read when live opponent is usable");
    },
  };

  const service = createGacMatchupService({ requestGateway, history, confirmedOpponent });
  const result = await service.analyze(myAllyCode, { enemyLeaderBaseId: "ENEMY_LEAD" });

  assert.equal(result.event.round, 3);
  assert.equal(result.event.status, "ATTACK");
  assert.equal(result.format, "5v5");
  assert.equal(result.opponentResolution.method, "live-event-payload");
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

test("verified saved pairing supplies current opponent when public live event has no usable opponent", async () => {
  const myAllyCode = "732764286";
  const opponentAllyCode = "123456789";
  const currentEvent = {
    source: "comlink-live",
    active: true,
    event: {
      id: "GAC-SEASON-81",
      eventInstanceId: "GAC:CURRENT",
      status: "ATTACK",
    },
  };
  const playerContext = {
    source: "comlink-live",
    player: { allyCode: myAllyCode, playerId: "PLAYER_1", name: "Warm Bacon" },
    event: { eventInstanceId: "GAC:CURRENT" },
    seasonStatus: [],
  };
  const myRoster = player(myAllyCode, "Warm Bacon", 10_000_000, [
    unit("MY_LEAD", 9, { zetas: 3, omicrons: 1 }),
    unit("MY_2", 8), unit("MY_3", 8), unit("MY_4", 7), unit("MY_5", 7),
  ]);
  const opponentRoster = player(opponentAllyCode, "Navygators", 9_800_000, [
    unit("NAVY_LEAD", 9, { zetas: 3, omicrons: 1 }),
    unit("NAVY_2", 8), unit("NAVY_3", 8), unit("NAVY_4", 7), unit("NAVY_5", 7),
  ]);
  const responses = new Map([
    ["/v1/gac/current-event", currentEvent],
    [`/v1/gac/player/${myAllyCode}`, playerContext],
    [`/v1/player/${myAllyCode}`, myRoster],
    [`/v1/player/${opponentAllyCode}`, opponentRoster],
  ]);
  const gatewayCalls = [];
  const requestGateway = async (path) => {
    gatewayCalls.push(path);
    assert.ok(responses.has(path), `unexpected gateway path ${path}`);
    return structuredClone(responses.get(path));
  };
  const confirmedCalls = [];
  const confirmedOpponent = {
    async findLatestConfirmed(code, eventId, round) {
      confirmedCalls.push({ code, eventId, round });
      return {
        opponent: { allyCode: opponentAllyCode, playerId: "PLAYER_2", name: "Navygators" },
        resolution: {
          exact: true,
          method: "verified-user-confirmed-current-bracket",
          eventInstanceId: "GAC:CURRENT",
          round: 3,
          source: "user-confirmed-current-bracket",
          confidence: 1,
          verified: true,
          recordedAt: "2026-08-19T01:30:00+08:00",
          roundSource: "verified-user-confirmed",
        },
      };
    },
  };

  const service = createGacMatchupService({ requestGateway, history: null, confirmedOpponent });
  const result = await service.analyze(myAllyCode);

  assert.deepEqual(confirmedCalls, [{ code: myAllyCode, eventId: "GAC:CURRENT", round: null }]);
  assert.ok(gatewayCalls.includes(`/v1/player/${opponentAllyCode}`));
  assert.equal(result.opponentResolution.source, "user-confirmed-current-bracket");
  assert.equal(result.opponentResolution.verified, true);
  assert.equal(result.event.eventInstanceId, "GAC:CURRENT");
  assert.equal(result.event.round, 3);
  assert.equal(result.event.status, "ATTACK");
  assert.equal(result.matchup.me.name, "Warm Bacon");
  assert.equal(result.matchup.opponent.name, "Navygators");
  assert.equal(result.matchup.opponent.allyCode, opponentAllyCode);
  assert.equal(result.matchup.delta.galacticPower, 200_000);
  assert.match(result.notes[1], /verified owner confirmation/);
});
