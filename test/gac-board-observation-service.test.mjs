import test from "node:test";
import assert from "node:assert/strict";
import { createGacBoardObservationService } from "../gac-board-observation-service.mjs";

function harness(options = {}) {
  const calls = [];
  const store = {
    async select(table, query) {
      calls.push({ type: "select", table, query });
      if (table === "gac_events") return [{ id: "EVENT-ROW", event_instance_id: "GAC:CURRENT" }];
      if (table === "gac_rounds") {
        return [{
          id: "ROUND-ROW",
          event_id: "EVENT-ROW",
          round_number: 3,
          player_id: "PLAYER-ROW",
          opponent_ally_code: "123456789",
          verified: true,
          source: "user-confirmed-current-bracket",
        }];
      }
      if (table === "gac_round_squads") {
        return options.savedRows || [{
          id: 44,
          round_id: "ROUND-ROW",
          owner: "opponent",
          side: "defense",
          zone: "FRONT-TOP",
          squad_slot: 0,
          leader_base_id: "DEF_LEAD",
          members: ["DEF_LEAD", "DEF_2", "DEF_3"],
          datacron: { id: "DC-9", setId: 19, level: 9, affixes: [] },
          source: "user-confirmed-current-board",
          source_ref: "gac-command-center-current-board",
          confidence: 1,
          observed_at: "2026-08-19T12:00:00.000Z",
          metadata: {},
        }];
      }
      return [];
    },
    async delete(table, query) {
      calls.push({ type: "delete", table, query });
      return null;
    },
    async insert(table, rows) {
      calls.push({ type: "insert", table, rows });
      return rows.map((row, index) => ({ id: index + 1, ...row }));
    },
  };
  const confirmation = {
    async assertVerifiedOwnership(userId, allyCode) {
      calls.push({ type: "ownership", userId, allyCode });
      return { id: "PLAYER-ROW", ally_code: allyCode, swgoh_player_id: "PLAYER_1", name: "Warm Bacon" };
    },
    async findLatestConfirmed(allyCode, eventInstanceId, round) {
      calls.push({ type: "confirmed", allyCode, eventInstanceId, round });
      return options.noConfirmation ? null : {
        opponent: { allyCode: options.confirmedOpponent || "123456789", playerId: "PLAYER_2", name: "Navygators" },
        resolution: { exact: true, verified: true, confidence: 1, eventInstanceId, round },
      };
    },
  };
  const service = createGacBoardObservationService({
    store,
    confirmation,
    now: () => new Date("2026-08-19T12:34:56.000Z"),
  });
  return { service, calls };
}

const saveInput = {
  allyCode: "732764286",
  opponentAllyCode: "123456789",
  eventInstanceId: "GAC:CURRENT",
  round: 3,
  size: 3,
  leaderBaseId: "DEF_LEAD",
  members: ["DEF_LEAD", "DEF_2", "DEF_3"],
  zone: "FRONT-TOP",
  slot: 0,
  datacron: {
    id: "DC-9",
    setId: 19,
    templateId: "TEMPLATE-9",
    level: 9,
    rerollCount: 2,
    affixes: [{
      tier: 9,
      abilityId: "DC_REVIVE",
      abilityName: "Return to Battle",
      abilityDescription: "The first time this unit is defeated, revive with 50% Health.",
      abilityTextResolved: true,
      requiredRelicTier: 5,
    }],
  },
};

test("save replaces only the same verified current-board source and persists a sanitized datacron snapshot", async () => {
  const { service, calls } = harness();
  const result = await service.saveDefense("USER-1", saveInput);
  assert.equal(result.saved, true);
  assert.equal(result.source, "user-confirmed-current-board");
  assert.equal(result.defense.datacron.id, "DC-9");

  const deletion = calls.find((call) => call.type === "delete");
  assert.equal(deletion.table, "gac_round_squads");
  assert.equal(deletion.query.round_id, "eq.ROUND-ROW");
  assert.equal(deletion.query.owner, "eq.opponent");
  assert.equal(deletion.query.side, "eq.defense");
  assert.equal(deletion.query.source, "eq.user-confirmed-current-board");
  assert.equal(deletion.query.zone, "eq.FRONT-TOP");
  assert.equal(deletion.query.squad_slot, "eq.0");
  assert.equal(Object.values(deletion.query).some((value) => String(value).includes("c3po")), false);

  const insertion = calls.find((call) => call.type === "insert");
  const row = insertion.rows[0];
  assert.equal(row.round_id, "ROUND-ROW");
  assert.equal(row.confidence, 1);
  assert.equal(row.source, "user-confirmed-current-board");
  assert.deepEqual(row.members, ["DEF_LEAD", "DEF_2", "DEF_3"]);
  assert.equal(row.datacron.id, "DC-9");
  assert.equal(row.datacron.affixes[0].abilityName, "Return to Battle");
  assert.equal(row.metadata.datacronConfirmed, true);
  assert.equal(row.metadata.opponentAllyCode, "123456789");
});

test("save rejects an opponent that differs from the verified current-round pairing", async () => {
  const { service, calls } = harness({ confirmedOpponent: "999999999" });
  await assert.rejects(
    () => service.saveDefense("USER-1", saveInput),
    (error) => error?.status === 409 && /submitted opponent/i.test(error.message)
  );
  assert.equal(calls.some((call) => call.type === "delete"), false);
  assert.equal(calls.some((call) => call.type === "insert"), false);
});

test("save rejects an incomplete defense before any board row is written", async () => {
  const { service, calls } = harness();
  await assert.rejects(
    () => service.saveDefense("USER-1", { ...saveInput, members: ["DEF_LEAD", "DEF_2"] }),
    (error) => error?.status === 400 && /complete 3\/5-character defense/i.test(error.message)
  );
  assert.equal(calls.some((call) => call.type === "delete"), false);
  assert.equal(calls.some((call) => call.type === "insert"), false);
});

test("verified owner can read only current-board opponent defense observations for the confirmed round", async () => {
  const { service, calls } = harness();
  const result = await service.getDefenses("USER-1", {
    allyCode: "732764286",
    opponentAllyCode: "123456789",
    eventInstanceId: "GAC:CURRENT",
    round: 3,
  });
  assert.equal(result.round, 3);
  assert.equal(result.opponent.allyCode, "123456789");
  assert.equal(result.defenses.length, 1);
  assert.equal(result.defenses[0].leaderBaseId, "DEF_LEAD");
  assert.equal(result.defenses[0].datacron.id, "DC-9");
  const read = calls.find((call) => call.type === "select" && call.table === "gac_round_squads");
  assert.equal(read.query.owner, "eq.opponent");
  assert.equal(read.query.side, "eq.defense");
  assert.equal(read.query.source, "eq.user-confirmed-current-board");
});
