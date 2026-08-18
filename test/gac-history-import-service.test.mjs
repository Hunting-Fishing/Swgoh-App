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
      calls.push({ table, rows, options });
      return rows;
    },
  };
}

function fakeSource() {
  return {
    baseUrl: "https://history.test",
    async getInfo(mode) {
      return { mode, instanceId: `INSTANCE-${mode}`, season: 81, eventInstanceId: `EVENT-${mode}` };
    },
    async getPlayer(mode) {
      return {
        matchResult: [{
          roundNumber: 3,
          opponent: { id: "PLAYER_2", name: "Navygators", allyCode: "123456789" },
          attackResult: [{
            duelResult: [{
              attackerUnit: [
                { definitionId: "LEAD:SEVEN_STAR", squadUnitType: 2 },
                { definitionId: "A2:SEVEN_STAR", squadUnitType: 1 },
                { definitionId: "A3:SEVEN_STAR", squadUnitType: 1 },
              ],
              defenderUnit: [
                { definitionId: "DLEAD:SEVEN_STAR", squadUnitType: 2 },
                { definitionId: "D2:SEVEN_STAR", squadUnitType: 1 },
                { definitionId: "D3:SEVEN_STAR", squadUnitType: 1 },
              ],
              battleOutcome: 1,
            }],
          }],
        }],
      };
    },
  };
}

test("player history import writes event metadata and deterministic battle rows", async () => {
  const store = fakeStore();
  const service = createGacHistoryImportService({
    store,
    source: fakeSource(),
    now: () => new Date("2026-08-18T13:00:00Z"),
  });
  const result = await service.importPlayer("732-764-286", { modes: ["3v3"] });
  assert.equal(result.imported, 1);
  assert.equal(result.results[0].characterBattles, 1);
  const eventWrite = store.calls.find((call) => call.table === "gac_events");
  const battleWrite = store.calls.find((call) => call.table === "gac_battles");
  assert.equal(eventWrite.options.onConflict, "event_instance_id");
  assert.equal(battleWrite.options.onConflict, "battle_key");
  assert.equal(battleWrite.rows[0].opponent_name, "Navygators");
  assert.equal(battleWrite.rows[0].round_number, 3);
  assert.match(battleWrite.rows[0].battle_key, /^[a-f0-9]{64}$/);
});

test("reimporting the same player/event produces the same battle key", async () => {
  const store = fakeStore();
  const service = createGacHistoryImportService({
    store,
    source: fakeSource(),
    now: () => new Date("2026-08-18T13:00:00Z"),
  });
  await service.importPlayer("732764286", { modes: ["3v3"] });
  const first = store.calls.find((call) => call.table === "gac_battles").rows[0].battle_key;
  store.calls.length = 0;
  await service.importPlayer("732764286", { modes: ["3v3"] });
  const second = store.calls.find((call) => call.table === "gac_battles").rows[0].battle_key;
  assert.equal(first, second);
});
