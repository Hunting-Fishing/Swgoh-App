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
          owner: query?.owner === "eq.player" ? "player" : "opponent",
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
  assert.equal(result.owner, "opponent");
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
  assert.equal(row.owner, "opponent");
  assert.equal(row.confidence, 1);
  assert.equal(row.source, "user-confirmed-current-board");
  assert.deepEqual(row.members, ["DEF_LEAD", "DEF_2", "DEF_3"]);
  assert.equal(row.datacron.id, "DC-9");
  assert.equal(row.datacron.affixes[0].abilityName, "Return to Battle");
  assert.equal(row.metadata.datacronConfirmed, true);
  assert.equal(row.metadata.opponentAllyCode, "123456789");
  assert.equal(row.metadata.boardOwner, "opponent");
});

test("zone without slot still replaces only the same leader instead of every defense in the zone", async () => {
  const { service, calls } = harness();
  await service.saveDefense("USER-1", { ...saveInput, slot: null });
  const deletion = calls.find((call) => call.type === "delete");
  assert.equal(deletion.query.zone, "eq.FRONT-TOP");
  assert.equal(deletion.query.leader_base_id, "eq.DEF_LEAD");
  assert.equal(Object.prototype.hasOwnProperty.call(deletion.query, "squad_slot"), false);
});

test("own-board save writes owner=player while preserving the same verified round boundary", async () => {
  const { service, calls } = harness();
  const result = await service.savePlayerDefense("USER-1", saveInput);
  assert.equal(result.owner, "player");
  const deletion = calls.find((call) => call.type === "delete");
  const insertion = calls.find((call) => call.type === "insert");
  assert.equal(deletion.query.owner, "eq.player");
  assert.equal(insertion.rows[0].owner, "player");
  assert.equal(insertion.rows[0].metadata.boardOwner, "player");
  assert.equal(insertion.rows[0].source, "user-confirmed-current-board");
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

test("save rejects an incomplete defense before ownership or board persistence work", async () => {
  const { service, calls } = harness();
  await assert.rejects(
    () => service.saveDefense("USER-1", { ...saveInput, members: ["DEF_LEAD", "DEF_2"] }),
    (error) => error?.status === 400 && /complete 3-character defense/i.test(error.message)
  );
  assert.equal(calls.some((call) => call.type === "ownership"), false);
  assert.equal(calls.some((call) => call.type === "delete"), false);
  assert.equal(calls.some((call) => call.type === "insert"), false);
});

test("verified owner can read opponent and player current-board rows separately", async () => {
  const opponentHarness = harness();
  const opponentResult = await opponentHarness.service.getDefenses("USER-1", {
    allyCode: "732764286",
    opponentAllyCode: "123456789",
    eventInstanceId: "GAC:CURRENT",
    round: 3,
  });
  assert.equal(opponentResult.owner, "opponent");
  const opponentRead = opponentHarness.calls.find((call) => call.type === "select" && call.table === "gac_round_squads");
  assert.equal(opponentRead.query.owner, "eq.opponent");

  const playerHarness = harness();
  const playerResult = await playerHarness.service.getPlayerDefenses("USER-1", {
    allyCode: "732764286",
    opponentAllyCode: "123456789",
    eventInstanceId: "GAC:CURRENT",
    round: 3,
  });
  assert.equal(playerResult.owner, "player");
  assert.equal(playerResult.defenses.length, 1);
  const playerRead = playerHarness.calls.find((call) => call.type === "select" && call.table === "gac_round_squads");
  assert.equal(playerRead.query.owner, "eq.player");
  assert.equal(playerRead.query.source, "eq.user-confirmed-current-board");
});

test("exact player-board delete verifies the row owner/source before deleting", async () => {
  const { service, calls } = harness();
  const result = await service.deletePlayerDefense("USER-1", {
    allyCode: "732764286",
    opponentAllyCode: "123456789",
    eventInstanceId: "GAC:CURRENT",
    round: 3,
    id: 44,
  });
  assert.equal(result.deleted, true);
  assert.equal(result.owner, "player");
  const rowCheck = calls.find((call) => call.type === "select" && call.table === "gac_round_squads" && call.query.id === "eq.44");
  assert.equal(rowCheck.query.owner, "eq.player");
  assert.equal(rowCheck.query.source, "eq.user-confirmed-current-board");
  const deletion = calls.find((call) => call.type === "delete");
  assert.equal(deletion.query.id, "eq.44");
  assert.equal(deletion.query.owner, "eq.player");
  assert.equal(deletion.query.source, "eq.user-confirmed-current-board");
});
