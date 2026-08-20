import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { createGacBoardObservationService } from "../gac-board-observation-service.mjs";

function confirmation() {
  return {
    async assertVerifiedOwnership() { return { id: "PLAYER-ROW-1", allyCode: "732764286" }; },
    async findLatestConfirmed() {
      return { opponent: { allyCode: "123456789", name: "Opponent", playerId: "OPP-1" } };
    },
  };
}

function fakeStore(savedRows = []) {
  const inserts = [];
  const deletes = [];
  return {
    inserts,
    deletes,
    async select(table, query = {}) {
      if (table === "gac_events") return [{ id: "EVENT-ROW-1", event_instance_id: "GAC:CURRENT" }];
      if (table === "gac_rounds") return [{
        id: "ROUND-ROW-1",
        event_id: "EVENT-ROW-1",
        round_number: 3,
        player_id: "PLAYER-ROW-1",
        opponent_ally_code: "123456789",
        verified: true,
        source: "user-confirmed-current-bracket",
      }];
      if (table === "gac_attack_plan_assignments") return [];
      if (table === "gac_round_squads") {
        if (query.select === "id") return [];
        return savedRows;
      }
      throw new Error(`Unexpected select ${table}`);
    },
    async insert(table, rows) {
      assert.equal(table, "gac_round_squads");
      inserts.push(...rows);
      return rows.map((row, index) => ({ ...row, id: 100 + index }));
    },
    async delete(table, query) {
      deletes.push({ table, query });
      return [];
    },
  };
}

const roundInput = {
  allyCode: "732764286",
  opponentAllyCode: "123456789",
  eventInstanceId: "GAC:CURRENT",
  round: 3,
  size: 3,
  leaderBaseId: "DEF_LEAD",
  members: ["DEF_LEAD", "DEF_2", "DEF_3"],
};

test("verified none is persisted in board metadata without a schema migration", async () => {
  const store = fakeStore();
  const service = createGacBoardObservationService({
    store,
    confirmation: confirmation(),
    now: () => new Date("2026-08-20T08:00:00Z"),
  });
  const result = await service.saveDefense("USER-1", { ...roundInput, datacron: null, datacronState: "none" });
  assert.equal(result.defense.datacronState, "none");
  assert.equal(store.inserts.length, 1);
  assert.equal(store.inserts[0].datacron, null);
  assert.equal(store.inserts[0].metadata.datacronState, "none");
  assert.equal(store.inserts[0].metadata.datacronConfirmed, false);
  assert.equal(store.inserts[0].metadata.datacronAbsenceConfirmed, true);
});

test("assigned Datacron is normalized from the persisted snapshot even for older callers", async () => {
  const store = fakeStore();
  const service = createGacBoardObservationService({ store, confirmation: confirmation() });
  const result = await service.saveDefense("USER-1", {
    ...roundInput,
    datacron: { id: "DC-9", setId: 22, level: 9, affixes: [] },
  });
  assert.equal(result.defense.datacronState, "assigned");
  assert.equal(store.inserts[0].metadata.datacronState, "assigned");
  assert.equal(store.inserts[0].metadata.datacronConfirmed, true);
  assert.equal(store.inserts[0].metadata.datacronAbsenceConfirmed, false);
});

test("old saved rows with neither Datacron nor truth metadata remain unknown", async () => {
  const store = fakeStore([{
    id: 77,
    round_id: "ROUND-ROW-1",
    owner: "opponent",
    side: "defense",
    zone: "front-top",
    squad_slot: 0,
    leader_base_id: "DEF_LEAD",
    members: ["DEF_LEAD", "DEF_2", "DEF_3"],
    datacron: null,
    source: "user-confirmed-current-board",
    source_ref: "legacy-save",
    confidence: 1,
    observed_at: "2026-08-19T08:00:00Z",
    metadata: {},
  }]);
  const service = createGacBoardObservationService({ store, confirmation: confirmation() });
  const result = await service.getDefenses("USER-1", roundInput);
  assert.equal(result.defenses.length, 1);
  assert.equal(result.defenses[0].datacronState, "unknown");
});

test("saved rows recover assigned and confirmed-none truth from canonical metadata/snapshot", async () => {
  const store = fakeStore([
    {
      id: 78,
      round_id: "ROUND-ROW-1",
      owner: "opponent",
      side: "defense",
      zone: "front-top",
      squad_slot: 0,
      leader_base_id: "DEF_LEAD",
      members: ["DEF_LEAD", "DEF_2", "DEF_3"],
      datacron: { id: "DC-9", setId: 22, level: 9, affixes: [] },
      source: "user-confirmed-current-board",
      confidence: 1,
      observed_at: "2026-08-20T08:00:00Z",
      metadata: {},
    },
    {
      id: 79,
      round_id: "ROUND-ROW-1",
      owner: "opponent",
      side: "defense",
      zone: "front-bottom",
      squad_slot: 1,
      leader_base_id: "DEF_LEAD",
      members: ["DEF_LEAD", "DEF_2", "DEF_3"],
      datacron: null,
      source: "user-confirmed-current-board",
      confidence: 1,
      observed_at: "2026-08-20T08:01:00Z",
      metadata: { datacronState: "none", datacronAbsenceConfirmed: true },
    },
  ]);
  const service = createGacBoardObservationService({ store, confirmation: confirmation() });
  const result = await service.getDefenses("USER-1", roundInput);
  assert.deepEqual(result.defenses.map((row) => row.datacronState), ["assigned", "none"]);
});

test("board editor exposes unknown / confirmed-none / assigned states and submits the state", async () => {
  const source = await readFile(new URL("../public/gac-defense-datacron-ui.js", import.meta.url), "utf8");
  assert.match(source, /const NONE_KEY = "__NONE__"/);
  assert.match(source, /const ASSIGNED_UNRESOLVED_KEY = "__ASSIGNED_UNRESOLVED__"/);
  assert.match(source, /Enemy Datacron · not confirmed/);
  assert.match(source, /Enemy Datacron · confirmed none/);
  assert.match(source, /assigned snapshot unavailable/i);
  assert.match(source, /datacronState,/);
  assert.match(source, /selectedDatacronState\(\)/);
  assert.match(source, /DATACRON UNKNOWN/);
  assert.match(source, /const assignedUnresolved = state\.selectedKey === ASSIGNED_UNRESOLVED_KEY/);
  assert.match(source, /Reconfirm the current board state before saving/i);
  assert.match(source, /datacronState === "assigned" && !clean\(datacron\?\.id\)/);
});
