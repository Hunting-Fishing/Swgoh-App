import test from "node:test";
import assert from "node:assert/strict";
import { createGacVerifiedBattleService } from "../gac-verified-battle-service.mjs";

function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }

function harness(options = {}) {
  const calls = [];
  const assignment = options.assignment || {
    id: 17,
    round_id: "ROUND-ROW",
    defense_squad_id: 44,
    source: "verified-owner-war-room",
    attempt_log: [{
      members: ["ATK_LEAD", "ATK_2", "ATK_3"],
      leaderBaseId: "ATK_LEAD",
      datacronId: "MY-DC-9",
      status: "win",
      banners: 65,
      at: "2026-08-19T15:00:00.000Z",
    }],
  };
  const defense = options.defense || {
    id: 44,
    round_id: "ROUND-ROW",
    leader_base_id: "DEF_LEAD",
    members: ["DEF_LEAD", "DEF_2", "DEF_3"],
    datacron: { id: "ENEMY-DC-9" },
    zone: "FRONT-TOP",
    squad_slot: 2,
    owner: "opponent",
    side: "defense",
    source: "user-confirmed-current-board",
  };
  const event = options.event || {
    id: "EVENT-ROW",
    event_instance_id: "GAC:CURRENT",
    season_id: "82",
    format: "3v3",
  };
  const existingBattle = options.existingBattle || null;
  const rows = { gac_battles: existingBattle ? [clone(existingBattle)] : [] };

  const store = {
    async select(table, query) {
      calls.push({ type: "select", table, query: clone(query) });
      if (table === "gac_attack_plan_assignments") return options.noAssignment ? [] : [clone(assignment)];
      if (table === "gac_round_squads") return options.noDefense ? [] : [clone(defense)];
      if (table === "gac_events") return [clone(event)];
      if (table === "gac_battles") {
        const key = String(query?.battle_key || "").replace(/^eq\./, "");
        return clone(rows.gac_battles.filter((row) => !key || row.battle_key === key));
      }
      return [];
    },
    async upsert(table, values, config) {
      calls.push({ type: "upsert", table, rows: clone(values), config: clone(config) });
      if (table !== "gac_battles") return clone(values);
      const output = [];
      for (const value of values) {
        let row = rows.gac_battles.find((entry) => entry.battle_key === value.battle_key);
        if (row) Object.assign(row, clone(value));
        else {
          row = { id: rows.gac_battles.length + 101, ...clone(value) };
          rows.gac_battles.push(row);
        }
        output.push(clone(row));
      }
      return output;
    },
  };
  const boards = {
    async resolveRound(userId, input) {
      calls.push({ type: "resolveRound", userId, input: clone(input) });
      return {
        userId,
        allyCode: "732764286",
        opponentAllyCode: "123456789",
        eventInstanceId: "GAC:CURRENT",
        round: 3,
        player: { id: "PLAYER-ROW", ally_code: "732764286", swgoh_player_id: "PLAYER-SWGOH", name: "Warm Bacon" },
        event: { id: "EVENT-ROW", event_instance_id: "GAC:CURRENT" },
        roundRow: { id: "ROUND-ROW" },
        confirmed: { opponent: { allyCode: "123456789", playerId: "OPP-SWGOH", name: "Navygators" } },
      };
    },
  };
  const service = createGacVerifiedBattleService({
    store,
    boards,
    now: () => new Date("2026-08-19T15:10:00.000Z"),
  });
  return { service, calls, rows };
}

const input = {
  allyCode: "732764286",
  opponentAllyCode: "123456789",
  eventInstanceId: "GAC:CURRENT",
  round: 3,
  assignmentId: 17,
  attemptIndex: 0,
  confirm: true,
};

test("operational result is not archived without explicit owner confirmation", async () => {
  const { service, calls } = harness();
  await assert.rejects(
    () => service.verifyAttempt("USER-1", { ...input, confirm: false }),
    (error) => error?.status === 400 && /Explicit owner confirmation/i.test(error.message)
  );
  assert.equal(calls.length, 0);
});

test("explicitly confirmed completed attempt creates one verified battle archive row", async () => {
  const { service, calls, rows } = harness();
  const result = await service.verifyAttempt("USER-1", input);
  assert.equal(result.saved, true);
  assert.equal(result.alreadyVerified, false);
  assert.equal(result.round, 3);
  assert.equal(result.battle.outcome, "win");
  assert.equal(result.battle.banners, 65);
  assert.equal(rows.gac_battles.length, 1);

  const write = calls.find((call) => call.type === "upsert" && call.table === "gac_battles");
  assert.equal(write.config.onConflict, "battle_key");
  const row = write.rows[0];
  assert.equal(row.player_id, "PLAYER-ROW");
  assert.equal(row.swgoh_player_id, "PLAYER-SWGOH");
  assert.equal(row.ally_code, "732764286");
  assert.equal(row.event_instance_id, "GAC:CURRENT");
  assert.equal(row.season_id, "82");
  assert.equal(row.format, "3v3");
  assert.equal(row.round_number, 3);
  assert.equal(row.match_index, 2);
  assert.equal(row.attack_group_index, 2);
  assert.equal(row.duel_index, 0);
  assert.equal(row.opponent_ally_code, "123456789");
  assert.equal(row.opponent_name, "Navygators");
  assert.equal(row.attacker_leader_base_id, "ATK_LEAD");
  assert.deepEqual(row.attacker_members, ["ATK_LEAD", "ATK_2", "ATK_3"]);
  assert.equal(row.defender_leader_base_id, "DEF_LEAD");
  assert.deepEqual(row.defender_members, ["DEF_LEAD", "DEF_2", "DEF_3"]);
  assert.equal(row.source, "verified-owner-war-room");
  assert.equal(row.metadata.explicitOwnerConfirmation, true);
  assert.equal(row.metadata.verificationMethod, "verified-owner-explicit-battle-confirmation");
  assert.equal(row.metadata.attackerDatacronId, "MY-DC-9");
  assert.equal(row.metadata.defenderDatacronId, "ENEMY-DC-9");
  assert.equal(row.metadata.counterEvidenceEligible, true);
});

test("the same assignment attempt is idempotent and cannot create a second battle sample", async () => {
  const first = harness();
  const saved = await first.service.verifyAttempt("USER-1", input);
  const existing = clone(first.rows.gac_battles[0]);
  const second = harness({ existingBattle: existing });
  const again = await second.service.verifyAttempt("USER-1", input);
  assert.equal(saved.battle.battleKey, again.battle.battleKey);
  assert.equal(again.alreadyVerified, true);
  assert.equal(second.calls.some((call) => call.type === "upsert"), false);
});

test("a loss is archived as the attacker loss without converting it into a win", async () => {
  const { service, rows } = harness({
    assignment: {
      id: 17,
      round_id: "ROUND-ROW",
      defense_squad_id: 44,
      source: "verified-owner-war-room",
      attempt_log: [{ members: ["ATK_LEAD", "ATK_2", "ATK_3"], leaderBaseId: "ATK_LEAD", status: "loss", banners: 0, at: "2026-08-19T15:00:00.000Z" }],
    },
  });
  const result = await service.verifyAttempt("USER-1", input);
  assert.equal(result.battle.outcome, "loss");
  assert.equal(rows.gac_battles[0].battle_outcome, "loss");
});

test("invalid attempt index and incomplete saved defense are rejected before archive write", async () => {
  const indexHarness = harness();
  await assert.rejects(
    () => indexHarness.service.verifyAttempt("USER-1", { ...input, attemptIndex: 4 }),
    (error) => error?.status === 400 && /completed War Room attempt/i.test(error.message)
  );
  assert.equal(indexHarness.calls.some((call) => call.type === "upsert"), false);

  const defenseHarness = harness({ defense: { id: 44, round_id: "ROUND-ROW", leader_base_id: "DEF_LEAD", members: ["DEF_2", "DEF_3"], owner: "opponent", side: "defense", source: "user-confirmed-current-board" } });
  await assert.rejects(
    () => defenseHarness.service.verifyAttempt("USER-1", input),
    (error) => error?.status === 409 && /defense snapshot is incomplete/i.test(error.message)
  );
  assert.equal(defenseHarness.calls.some((call) => call.type === "upsert"), false);
});

test("assignment and defense must belong to the verified current round", async () => {
  const assignmentHarness = harness({ noAssignment: true });
  await assert.rejects(
    () => assignmentHarness.service.verifyAttempt("USER-1", input),
    (error) => error?.status === 404 && /not part of the verified current round/i.test(error.message)
  );

  const defenseHarness = harness({ noDefense: true });
  await assert.rejects(
    () => defenseHarness.service.verifyAttempt("USER-1", input),
    (error) => error?.status === 409 && /enemy defense snapshot/i.test(error.message)
  );
});
