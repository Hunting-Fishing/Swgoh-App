import test from "node:test";
import assert from "node:assert/strict";
import { createGacHistoryService } from "../gac-history-service.mjs";

const PLAYER_ID = "11111111-1111-1111-1111-111111111111";
const EVENT_ID = "22222222-2222-2222-2222-222222222222";
const ROUND_ID = "33333333-3333-3333-3333-333333333333";

function fakeStore() {
  const calls = [];
  return {
    calls,
    status: () => ({ configured: true }),
    async select(table, query) {
      calls.push({ table, query });
      if (table === "players") return [{ id: PLAYER_ID, ally_code: "732764286", swgoh_player_id: "P1", name: "Warmbacon" }];
      if (table === "gac_rounds") return [{
        id: ROUND_ID,
        event_id: EVENT_ID,
        round_number: 3,
        opponent_swgoh_player_id: "P2",
        opponent_ally_code: "123456789",
        opponent_name: "Navygators",
        result: "unknown",
        player_banners: null,
        opponent_banners: null,
        source: "user-confirmed",
        source_ref: "current-round",
        confidence: 1,
        verified: true,
        recorded_at: "2026-08-18T12:00:00Z",
      }];
      if (table === "gac_events") return [{
        id: EVENT_ID,
        event_instance_id: "GAC_SEASON_81:O123",
        season_id: "81",
        format: "3v3",
        status: "active",
        starts_at: "2026-08-17T00:00:00Z",
        ends_at: "2026-08-19T00:00:00Z",
      }];
      if (table === "gac_round_squads") return [{
        round_id: ROUND_ID,
        owner: "opponent",
        side: "defense",
        zone: "front",
        squad_slot: 1,
        leader_base_id: "DARTHREVAN",
        members: ["DARTHREVAN", "BASTILASHANDARK", "DARTHMALAK"],
        datacron: null,
        source: "user-confirmed",
        source_ref: "board-observation",
        confidence: 1,
        observed_at: "2026-08-18T12:05:00Z",
      }];
      if (table === "gac_counter_observations") return [{
        format: "3v3",
        enemy_leader_base_id: "DARTHREVAN",
        enemy_members: ["DARTHREVAN", "BASTILASHANDARK", "DARTHMALAK"],
        counter_leader_base_id: "JEDIMASTERLUKE",
        counter_members: ["JEDIMASTERLUKE", "JEDIKNIGHTLUKE", "HERMITYODA"],
        battles: 1000,
        wins: 900,
        holds: 100,
        average_banners: 51.4,
        league: "CHROMIUM",
        season_id: "81",
        source: "swgoh.gg",
        source_ref: "counter-source",
        confidence: 0.95,
        observed_at: "2026-08-18T11:00:00Z",
      }];
      return [];
    },
  };
}

test("player GAC history joins rounds, event metadata and observed squads", async () => {
  const store = fakeStore();
  const service = createGacHistoryService({ store });
  const body = await service.getPlayerHistory("732-764-286", { limit: 20 });
  assert.equal(body.player.name, "Warmbacon");
  assert.equal(body.rounds.length, 1);
  assert.equal(body.rounds[0].round, 3);
  assert.equal(body.rounds[0].opponent.name, "Navygators");
  assert.equal(body.rounds[0].event.format, "3v3");
  assert.equal(body.rounds[0].squads[0].leaderBaseId, "DARTHREVAN");
  assert.equal(body.summary.verified, 1);
  assert.ok(store.calls.some((call) => call.table === "gac_events" && String(call.query.id).startsWith("in.(")));
});

test("counter evidence query is mode and enemy-leader specific", async () => {
  const store = fakeStore();
  const service = createGacHistoryService({ store });
  const body = await service.getCounterEvidence({ format: "3v3", enemyLeaderBaseId: "darthrevan", limit: 50 });
  assert.equal(body.count, 1);
  assert.equal(body.observations[0].winRate, 0.9);
  assert.equal(body.observations[0].source, "swgoh.gg");
  const call = store.calls.find((entry) => entry.table === "gac_counter_observations");
  assert.equal(call.query.format, "eq.3v3");
  assert.equal(call.query.enemy_leader_base_id, "eq.DARTHREVAN");
});

test("GAC history service rejects invalid public inputs before querying persistence", async () => {
  const store = fakeStore();
  const service = createGacHistoryService({ store });
  await assert.rejects(() => service.getPlayerHistory("bad"), /9-digit Ally Code/);
  await assert.rejects(() => service.getCounterEvidence({ format: "7v7", enemyLeaderBaseId: "DARTHREVAN" }), /3v3 or 5v5/);
  await assert.rejects(() => service.getCounterEvidence({ format: "3v3", enemyLeaderBaseId: "!" }), /enemy leader base ID/);
});
