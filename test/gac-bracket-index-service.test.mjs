import test from "node:test";
import assert from "node:assert/strict";
import { createGacBracketIndexService, currentRoundFrom } from "../gac-bracket-index-service.mjs";

test("current round is read only from explicit current-event/player fields", () => {
  assert.equal(currentRoundFrom({ currentRound: 3 }, { event: { eventInstanceId: "GAC:1" } }), 3);
  assert.equal(currentRoundFrom({ seasonStatus: [{ eventInstanceId: "GAC:1", roundNumber: 2 }] }, { event: { eventInstanceId: "GAC:1" } }), 2);
  assert.equal(currentRoundFrom({ seasonStatus: [{ eventInstanceId: "OLD:1", roundNumber: 1 }] }, { event: { eventInstanceId: "GAC:1" } }), null);
});

test("live bracket persistence writes event, bracket and all player memberships", async () => {
  const calls = [];
  const store = {
    status() { return { configured: true }; },
    async upsert(table, rows, options) {
      calls.push({ type: "upsert", table, rows, options });
      if (table === "gac_events") return [{ ...rows[0], id: "11111111-1111-1111-1111-111111111111" }];
      if (table === "gac_brackets") return [{ ...rows[0], id: "22222222-2222-2222-2222-222222222222" }];
      return rows;
    },
    async select(table) {
      if (table === "players") return [{ id: "33333333-3333-3333-3333-333333333333", ally_code: "732764286" }];
      return [];
    },
  };
  const service = createGacBracketIndexService({ store, now: () => new Date("2026-08-19T01:10:00+08:00") });
  const result = await service.persistBracket({
    event: { id: "GAC", instanceId: "1", eventInstanceId: "GAC:1", startTime: "1787072400000" },
    league: "KYBER",
    bracketIndex: 42,
    groupId: "GAC:1:KYBER:42",
    lookup: { method: "rank-hint", allyCode: "732764286" },
    players: [
      { playerId: "PLAYER_1", allyCode: "732764286", name: "Warm Bacon", score: 2 },
      { playerId: "PLAYER_2", allyCode: "123456789", name: "Navygators", score: 2 },
    ],
  });
  assert.equal(result.indexed, true);
  assert.equal(result.players, 2);
  const eventWrite = calls.find((call) => call.table === "gac_events");
  const bracketWrite = calls.find((call) => call.table === "gac_brackets");
  const playerWrite = calls.find((call) => call.table === "gac_bracket_players");
  assert.equal(eventWrite.options.onConflict, "event_instance_id");
  assert.equal(bracketWrite.options.onConflict, "event_id,league,bracket_index");
  assert.equal(playerWrite.options.onConflict, "bracket_id,swgoh_player_id");
  assert.equal(playerWrite.rows.length, 2);
  assert.equal(playerWrite.rows[0].player_id, "33333333-3333-3333-3333-333333333333");
  assert.equal(playerWrite.rows[1].ally_code, "123456789");
});

test("indexed bracket lookup reconstructs the eight-player response without Comlink", async () => {
  const store = {
    async select(table, query) {
      if (table === "gac_events") return [{ id: "11111111-1111-1111-1111-111111111111", event_instance_id: "GAC:1", season_id: "GAC", instance_id: "1" }];
      if (table === "gac_bracket_players" && query.ally_code) {
        return [{ bracket_id: "22222222-2222-2222-2222-222222222222", ally_code: "732764286", swgoh_player_id: "PLAYER_1", player_name: "Warm Bacon" }];
      }
      if (table === "gac_brackets") {
        return [{ id: "22222222-2222-2222-2222-222222222222", event_id: "11111111-1111-1111-1111-111111111111", league: "KYBER", bracket_index: 42, group_id: "GAC:1:KYBER:42", captured_at: "2026-08-18T17:00:00Z" }];
      }
      if (table === "gac_bracket_players") {
        return [
          { swgoh_player_id: "PLAYER_1", ally_code: "732764286", player_name: "Warm Bacon", bracket_score: 2, metadata: { profileAvailable: true } },
          { swgoh_player_id: "PLAYER_2", ally_code: "123456789", player_name: "Navygators", bracket_score: 2, metadata: { profileAvailable: true } },
        ];
      }
      return [];
    },
  };
  const service = createGacBracketIndexService({ store });
  const bracket = await service.findIndexedBracket("732-764-286", "GAC:1");
  assert.equal(bracket.source, "persisted-gac-bracket-index");
  assert.equal(bracket.bracketIndex, 42);
  assert.equal(bracket.players.length, 2);
  assert.equal(bracket.opponents.length, 1);
  assert.equal(bracket.opponents[0].name, "Navygators");
});

test("exact opponent requires matching event, explicit round and high-confidence evidence", async () => {
  const store = {
    async select(table) {
      if (table === "players") return [{ id: "33333333-3333-3333-3333-333333333333", ally_code: "732764286", swgoh_player_id: "PLAYER_1", name: "Warm Bacon" }];
      if (table === "gac_events") return [{ id: "11111111-1111-1111-1111-111111111111", event_instance_id: "GAC:1" }];
      if (table === "gac_rounds") return [{
        opponent_swgoh_player_id: "PLAYER_2",
        opponent_ally_code: "123456789",
        opponent_name: "Navygators",
        source: "c3po-gahistory",
        source_ref: "https://history.test/player.json",
        confidence: 0.95,
        verified: false,
        recorded_at: "2026-08-18T17:00:00Z",
      }];
      return [];
    },
  };
  const service = createGacBracketIndexService({ store });
  assert.equal(await service.findExactOpponent("732764286", "GAC:1", null), null);
  const exact = await service.findExactOpponent("732764286", "GAC:1", 3);
  assert.equal(exact.opponent.name, "Navygators");
  assert.equal(exact.opponent.allyCode, "123456789");
  assert.equal(exact.resolution.exact, true);
  assert.equal(exact.resolution.round, 3);
  assert.equal(exact.resolution.method, "persisted-event-round-evidence");
});
