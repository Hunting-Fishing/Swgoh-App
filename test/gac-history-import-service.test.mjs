import test from "node:test";
import assert from "node:assert/strict";
import { createGacHistoryImportService } from "../gac-history-import-service.mjs";

function fakeStore() {
  const calls = [];
  return {
    calls,
    async select(table) {
      if (table === "players") {
        return [{ id: "11111111-1111-1111-1111-111111111111", ally_code: "732764286", swgoh_player_id: "PLAYER_1", name: "Warmbacon" }];
      }
      return [];
    },
    async upsert(table, rows, options) {
      const persistedRows = table === "gac_events"
        ? rows.map((row) => ({ ...row, id: "22222222-2222-2222-2222-222222222222" }))
        : rows;
      calls.push({ table, rows: persistedRows, options });
      return persistedRows;
    },
  };
}

function duel(outcome = 1, attackerLeader = "LEAD", defenderLeader = "DLEAD") {
  return {
    attackerUnit: [
      { definitionId: `${attackerLeader}:SEVEN_STAR`, squadUnitType: 2 },
      { definitionId: "A2:SEVEN_STAR", squadUnitType: 1 },
      { definitionId: "A3:SEVEN_STAR", squadUnitType: 1 },
    ],
    defenderUnit: [
      { definitionId: `${defenderLeader}:SEVEN_STAR`, squadUnitType: 2 },
      { definitionId: "D2:SEVEN_STAR", squadUnitType: 1 },
      { definitionId: "D3:SEVEN_STAR", squadUnitType: 1 },
    ],
    battleOutcome: outcome,
  };
}

function fakeSource(outcome = 1) {
  return {
    baseUrl: "https://history.test",
    async getInfo(mode) {
      return { mode, instanceId: `INSTANCE-${mode}`, season: 81, eventInstanceId: `EVENT-${mode}` };
    },
    async getPlayer() {
      return {
        matchResult: [{
          roundNumber: 3,
          opponent: { id: "PLAYER_2", name: "Navygators", allyCode: "123456789" },
          attackResult: [{ duelResult: [duel(outcome)] }],
        }],
      };
    },
  };
}

function inferredChronologySource() {
  return {
    baseUrl: "https://history.test",
    async getInfo(mode) {
      return { mode, instanceId: `INSTANCE-${mode}`, season: 81, eventInstanceId: `EVENT-${mode}` };
    },
    async getPlayer() {
      return {
        matchResult: [
          { attackResult: [{ duelResult: [duel(1, "ROUND1", "DEF1")] }] },
          { attackResult: [{ duelResult: [duel(1, "ROUND2", "DEF2")] }] },
          { attackResult: [{ duelResult: [duel(2, "ROUND3", "DEF3")] }] },
        ],
      };
    },
  };
}

test("player history import writes event, battles, explicit round and deterministic counter evidence", async () => {
  const store = fakeStore();
  const service = createGacHistoryImportService({
    store,
    source: fakeSource(),
    now: () => new Date("2026-08-18T13:00:00Z"),
  });
  const result = await service.importPlayer("732-764-286", { modes: ["3v3"] });
  assert.equal(result.imported, 1);
  assert.equal(result.importedCounters, 1);
  assert.equal(result.importedRounds, 1);
  assert.equal(result.inferredRounds, 0);
  assert.equal(result.results[0].characterBattles, 1);
  const eventWrite = store.calls.find((call) => call.table === "gac_events");
  const battleWrite = store.calls.find((call) => call.table === "gac_battles");
  const counterWrite = store.calls.find((call) => call.table === "gac_counter_observations");
  const roundWrite = store.calls.find((call) => call.table === "gac_rounds");
  assert.equal(eventWrite.options.onConflict, "event_instance_id");
  assert.equal(battleWrite.options.onConflict, "battle_key");
  assert.equal(counterWrite.options.onConflict, "observation_key");
  assert.equal(roundWrite.options.onConflict, "event_id,round_number,player_id,source");
  assert.equal(roundWrite.rows[0].source, "c3po-gahistory");
  assert.equal(roundWrite.rows[0].confidence, 0.95);
  assert.equal(roundWrite.rows[0].metadata.roundInferred, false);
  assert.equal(battleWrite.rows[0].opponent_name, "Navygators");
  assert.equal(battleWrite.rows[0].round_number, 3);
  assert.equal(battleWrite.rows[0].metadata.roundDerivation, "explicit-source-field");
  assert.match(battleWrite.rows[0].battle_key, /^[a-f0-9]{64}$/);
  assert.equal(counterWrite.rows[0].enemy_leader_base_id, "DLEAD");
  assert.deepEqual(counterWrite.rows[0].enemy_members, ["D2", "D3", "DLEAD"]);
  assert.equal(counterWrite.rows[0].counter_leader_base_id, "LEAD");
  assert.deepEqual(counterWrite.rows[0].counter_members, ["A2", "A3", "LEAD"]);
  assert.equal(counterWrite.rows[0].battles, 1);
  assert.equal(counterWrite.rows[0].wins, 1);
  assert.equal(counterWrite.rows[0].holds, 0);
  assert.match(counterWrite.rows[0].observation_key, /^[a-f0-9]{64}$/);
});

test("three ordered match groups persist inferred Round 1/2/3 below the exact-opponent confidence threshold", async () => {
  const store = fakeStore();
  const service = createGacHistoryImportService({
    store,
    source: inferredChronologySource(),
    now: () => new Date("2026-08-18T13:00:00Z"),
  });
  const result = await service.importPlayer("732764286", { modes: ["3v3"] });
  assert.equal(result.imported, 3);
  assert.equal(result.importedRounds, 3);
  assert.equal(result.inferredRounds, 3);

  const battleWrite = store.calls.find((call) => call.table === "gac_battles");
  assert.deepEqual(battleWrite.rows.map((row) => row.round_number), [1, 2, 3]);
  assert.ok(battleWrite.rows.every((row) => row.metadata.roundInferred === true));
  assert.ok(battleWrite.rows.every((row) => row.metadata.roundConfidence === 0.65));

  const roundWrites = store.calls.filter((call) => call.table === "gac_rounds");
  assert.equal(roundWrites.length, 1);
  assert.deepEqual(roundWrites[0].rows.map((row) => row.round_number), [1, 2, 3]);
  assert.ok(roundWrites[0].rows.every((row) => row.source === "c3po-gahistory-inferred-round"));
  assert.ok(roundWrites[0].rows.every((row) => row.confidence === 0.65));
  assert.ok(roundWrites[0].rows.every((row) => row.confidence < 0.9));
  assert.ok(roundWrites[0].rows.every((row) => row.metadata.roundInferred === true));
  assert.ok(roundWrites[0].rows.every((row) => row.metadata.exactOpponentEligible === false));
});

test("reimporting the same player/event produces the same battle and counter keys", async () => {
  const store = fakeStore();
  const service = createGacHistoryImportService({
    store,
    source: fakeSource(),
    now: () => new Date("2026-08-18T13:00:00Z"),
  });
  await service.importPlayer("732764286", { modes: ["3v3"] });
  const firstBattle = store.calls.find((call) => call.table === "gac_battles").rows[0].battle_key;
  const firstCounter = store.calls.find((call) => call.table === "gac_counter_observations").rows[0].observation_key;
  store.calls.length = 0;
  await service.importPlayer("732764286", { modes: ["3v3"] });
  const secondBattle = store.calls.find((call) => call.table === "gac_battles").rows[0].battle_key;
  const secondCounter = store.calls.find((call) => call.table === "gac_counter_observations").rows[0].observation_key;
  assert.equal(firstBattle, secondBattle);
  assert.equal(firstCounter, secondCounter);
});

test("attacker losses are recorded as defensive holds in counter evidence", async () => {
  const store = fakeStore();
  const service = createGacHistoryImportService({
    store,
    source: fakeSource(2),
    now: () => new Date("2026-08-18T13:00:00Z"),
  });
  await service.importPlayer("732764286", { modes: ["3v3"] });
  const counter = store.calls.find((call) => call.table === "gac_counter_observations").rows[0];
  assert.equal(counter.battles, 1);
  assert.equal(counter.wins, 0);
  assert.equal(counter.holds, 1);
});
