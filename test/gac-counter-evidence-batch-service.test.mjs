import test from "node:test";
import assert from "node:assert/strict";
import { createGacCounterEvidenceBatchService, normalizeLeaderList } from "../gac-counter-evidence-batch-service.mjs";

function aggregate(leader, overrides = {}) {
  return {
    format: "3v3",
    enemy_leader_base_id: leader,
    enemy_members: [leader, `${leader}_2`, `${leader}_3`],
    counter_leader_base_id: `COUNTER_${leader}`,
    counter_members: [`COUNTER_${leader}`, `C_${leader}_2`, `C_${leader}_3`],
    battles: 10,
    wins: 8,
    holds: 2,
    draws: 0,
    average_banners: 60,
    league: "KYBER",
    season_id: "81",
    source: "c3po-gahistory",
    source_ref: `c3po://${leader}`,
    source_updated_at: "2026-08-18T00:00:00.000Z",
    confidence: 0.95,
    observed_at: "2026-08-18T00:00:00.000Z",
    ...overrides,
  };
}

function verifiedBattle(leader, outcome = "win") {
  return {
    format: "3v3",
    season_id: "82",
    attacker_leader_base_id: `COUNTER_${leader}`,
    attacker_members: [`COUNTER_${leader}`, `C_${leader}_2`, `C_${leader}_3`],
    defender_leader_base_id: leader,
    defender_members: [leader, `${leader}_2`, `${leader}_3`],
    battle_outcome: outcome,
    source: "verified-owner-war-room",
    source_ref: `war-room:${leader}`,
    source_updated_at: "2026-08-19T15:00:00.000Z",
    imported_at: "2026-08-19T15:10:00.000Z",
    metadata: { banners: outcome === "win" ? 65 : 0 },
  };
}

test("batch service uses two database reads for multiple enemy leaders", async () => {
  const calls = [];
  const store = {
    async select(table, query) {
      calls.push({ table, query });
      if (table === "gac_counter_observations") return [aggregate("DEF_A"), aggregate("DEF_B", { battles: 5, wins: 2, holds: 3 })];
      if (table === "gac_battles") return [verifiedBattle("DEF_A", "win"), verifiedBattle("DEF_B", "loss")];
      return [];
    },
  };
  const service = createGacCounterEvidenceBatchService({ store });
  const result = await service.getCounterEvidenceBatch({ format: "3v3", enemyLeaderBaseIds: ["def_a", "DEF_B", "DEF_A"], limit: 40 });

  assert.equal(calls.length, 2);
  assert.deepEqual(result.leaders, ["DEF_A", "DEF_B"]);
  assert.equal(result.results.length, 2);
  const a = result.results.find((entry) => entry.enemyLeaderBaseId === "DEF_A");
  const b = result.results.find((entry) => entry.enemyLeaderBaseId === "DEF_B");
  assert.equal(a.count, 1);
  assert.equal(a.observations[0].battles, 11);
  assert.equal(a.observations[0].wins, 9);
  assert.equal(a.verifiedBattleSamples, 1);
  assert.equal(b.observations[0].battles, 6);
  assert.equal(b.observations[0].wins, 2);
  assert.equal(b.observations[0].holds, 4);
  assert.equal(result.verifiedBattleSamples, 2);

  const aggregateQuery = calls.find((call) => call.table === "gac_counter_observations").query;
  const battleQuery = calls.find((call) => call.table === "gac_battles").query;
  assert.equal(aggregateQuery.enemy_leader_base_id, "in.(DEF_A,DEF_B)");
  assert.equal(battleQuery.defender_leader_base_id, "in.(DEF_A,DEF_B)");
  assert.equal(battleQuery.source, "eq.verified-owner-war-room");
});

test("leaders without evidence remain explicit empty results", async () => {
  const store = { async select() { return []; } };
  const service = createGacCounterEvidenceBatchService({ store });
  const result = await service.getCounterEvidenceBatch({ format: "5v5", enemyLeaderBaseIds: ["DEF_A", "DEF_B"] });
  assert.equal(result.results.length, 2);
  assert.equal(result.results[0].count, 0);
  assert.equal(result.results[1].count, 0);
  assert.equal(result.count, 0);
});

test("leader normalization deduplicates, validates, and caps batch width", () => {
  const values = Array.from({ length: 25 }, (_, index) => `LEADER_${index + 1}`);
  const leaders = normalizeLeaderList(["leader_1", ...values, "not valid spaces"]);
  assert.equal(leaders.length, 20);
  assert.equal(leaders[0], "LEADER_1");
  assert.equal(new Set(leaders).size, 20);
});

test("invalid format or empty leader set is rejected", async () => {
  const service = createGacCounterEvidenceBatchService({ store: { async select() { return []; } } });
  await assert.rejects(() => service.getCounterEvidenceBatch({ format: "2v2", enemyLeaderBaseIds: ["DEF_A"] }), /3v3 or 5v5/i);
  await assert.rejects(() => service.getCounterEvidenceBatch({ format: "3v3", enemyLeaderBaseIds: [] }), /At least one valid enemy leader/i);
});
