import test from "node:test";
import assert from "node:assert/strict";
import { createGacHistoryService } from "../gac-history-service.mjs";

function aggregate() {
  return {
    format: "3v3",
    enemy_leader_base_id: "DEF_LEAD",
    enemy_members: ["DEF_LEAD", "DEF_2", "DEF_3"],
    counter_leader_base_id: "ATK_LEAD",
    counter_members: ["ATK_LEAD", "ATK_2", "ATK_3"],
    battles: 10,
    wins: 8,
    holds: 2,
    draws: 0,
    average_banners: 60,
    league: "KYBER",
    season_id: "81",
    source: "c3po-gahistory",
    source_ref: "c3po://aggregate",
    source_updated_at: "2026-08-18T00:00:00.000Z",
    confidence: 0.95,
    observed_at: "2026-08-18T00:00:00.000Z",
  };
}

function verified() {
  return {
    format: "3v3",
    season_id: "82",
    attacker_leader_base_id: "ATK_LEAD",
    attacker_members: ["ATK_LEAD", "ATK_2", "ATK_3"],
    defender_leader_base_id: "DEF_LEAD",
    defender_members: ["DEF_LEAD", "DEF_2", "DEF_3"],
    battle_outcome: "win",
    source: "verified-owner-war-room",
    source_ref: "war-room:17:attempt:1",
    source_updated_at: "2026-08-19T15:00:00.000Z",
    imported_at: "2026-08-19T15:10:00.000Z",
    metadata: { banners: 65, explicitOwnerConfirmation: true },
  };
}

test("counter evidence reads only verified-owner battle samples and merges them with aggregates", async () => {
  const calls = [];
  const store = {
    async select(table, query) {
      calls.push({ table, query });
      if (table === "gac_counter_observations") return [aggregate()];
      if (table === "gac_battles") return [verified()];
      return [];
    },
  };
  const service = createGacHistoryService({ store });
  const result = await service.getCounterEvidence({ format: "3v3", enemyLeaderBaseId: "DEF_LEAD", limit: 100 });

  assert.equal(result.count, 1);
  assert.equal(result.verifiedBattleSamples, 1);
  assert.deepEqual(result.evidenceSources, ["c3po-gahistory", "verified-owner-war-room"]);
  assert.equal(result.observations[0].battles, 11);
  assert.equal(result.observations[0].wins, 9);
  assert.equal(result.observations[0].holds, 2);
  assert.equal(result.observations[0].source, "combined-evidence");
  assert.deepEqual(result.observations[0].evidenceSources, ["c3po-gahistory", "verified-owner-war-room"]);

  const battleQuery = calls.find((call) => call.table === "gac_battles")?.query;
  assert.equal(battleQuery.source, "eq.verified-owner-war-room");
  assert.equal(battleQuery.format, "eq.3v3");
  assert.equal(battleQuery.defender_leader_base_id, "eq.DEF_LEAD");
});

test("no verified owner battles leaves existing aggregate evidence unchanged", async () => {
  const store = {
    async select(table) {
      if (table === "gac_counter_observations") return [aggregate()];
      if (table === "gac_battles") return [];
      return [];
    },
  };
  const service = createGacHistoryService({ store });
  const result = await service.getCounterEvidence({ format: "3v3", enemyLeaderBaseId: "DEF_LEAD" });
  assert.equal(result.count, 1);
  assert.equal(result.verifiedBattleSamples, 0);
  assert.equal(result.observations[0].battles, 10);
  assert.equal(result.observations[0].wins, 8);
  assert.equal(result.observations[0].source, "c3po-gahistory");
});
