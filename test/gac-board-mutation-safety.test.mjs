import test from "node:test";
import assert from "node:assert/strict";
import { boardMutationPolicy, createGacBoardObservationService } from "../gac-board-observation-service.mjs";

function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
function eq(value) { return String(value ?? "").replace(/^eq\./, ""); }

function harness(plan = null) {
  const calls = [];
  const defense = {
    id: 44,
    round_id: "ROUND-ROW",
    owner: "opponent",
    side: "defense",
    zone: "FRONT-TOP",
    squad_slot: 0,
    leader_base_id: "DEF_LEAD",
    members: ["DEF_LEAD", "DEF_2", "DEF_3"],
    datacron: null,
    source: "user-confirmed-current-board",
  };
  const store = {
    async select(table, query = {}) {
      calls.push({ type: "select", table, query: clone(query) });
      if (table === "gac_events") return [{ id: "EVENT-ROW", event_instance_id: "GAC:CURRENT" }];
      if (table === "gac_rounds") return [{ id: "ROUND-ROW", event_id: "EVENT-ROW", round_number: 3, player_id: "PLAYER-ROW", opponent_ally_code: "123456789", verified: true, source: "user-confirmed-current-bracket" }];
      if (table === "gac_round_squads") {
        if (query.id && eq(query.id) !== String(defense.id)) return [];
        if (query.round_id && eq(query.round_id) !== defense.round_id) return [];
        if (query.owner && eq(query.owner) !== defense.owner) return [];
        if (query.zone && eq(query.zone) !== defense.zone) return [];
        if (query.squad_slot && eq(query.squad_slot) !== String(defense.squad_slot)) return [];
        return [clone(defense)];
      }
      if (table === "gac_attack_plan_assignments") {
        if (!plan) return [];
        if (query.defense_squad_id && eq(query.defense_squad_id) !== String(plan.defense_squad_id)) return [];
        return [clone(plan)];
      }
      return [];
    },
    async delete(table, query) {
      calls.push({ type: "delete", table, query: clone(query) });
      return null;
    },
    async insert(table, rows) {
      calls.push({ type: "insert", table, rows: clone(rows) });
      return rows.map((row) => ({ id: 99, ...clone(row) }));
    },
  };
  const confirmation = {
    async assertVerifiedOwnership(_userId, allyCode) {
      return { id: "PLAYER-ROW", ally_code: allyCode, swgoh_player_id: "PLAYER-SWGOH", name: "Warm Bacon" };
    },
    async findLatestConfirmed(_allyCode, eventInstanceId, round) {
      return { opponent: { allyCode: "123456789", playerId: "OPP-SWGOH", name: "Navygators" }, resolution: { eventInstanceId, round, exact: true, verified: true } };
    },
  };
  const service = createGacBoardObservationService({ store, confirmation, now: () => new Date("2026-08-19T16:30:00.000Z") });
  return { service, calls };
}

const context = {
  allyCode: "732764286",
  opponentAllyCode: "123456789",
  eventInstanceId: "GAC:CURRENT",
  round: 3,
};
const replacement = {
  ...context,
  size: 3,
  leaderBaseId: "DEF_LEAD",
  members: ["DEF_LEAD", "DEF_2", "DEF_3"],
  zone: "FRONT-TOP",
  slot: 0,
};

test("mutation policy allows no plan and released zero-attempt plan", () => {
  assert.equal(boardMutationPolicy(null).allowed, true);
  const released = boardMutationPolicy({ id: 1, status: "abandoned", attempt_count: 0, attempt_log: [] });
  assert.equal(released.allowed, true);
  assert.equal(released.code, "released");
});

test("mutation policy blocks locked plan and any attempt history", () => {
  const locked = boardMutationPolicy({ id: 1, status: "planned", attempt_count: 0, attempt_log: [] });
  assert.equal(locked.allowed, false);
  assert.equal(locked.code, "locked");

  const history = boardMutationPolicy({ id: 1, status: "loss", attempt_count: 1, attempt_log: [{ status: "loss" }] });
  assert.equal(history.allowed, false);
  assert.equal(history.code, "history");
  assert.equal(history.attempts, 1);
});

test("replacing a defense with a locked War Room plan is blocked before delete or insert", async () => {
  const { service, calls } = harness({ id: 7, defense_squad_id: 44, status: "planned", attempt_count: 0, attempt_log: [] });
  await assert.rejects(
    () => service.saveDefense("USER-1", replacement),
    (error) => error?.status === 409 && /Release the locked War Room plan/i.test(error.message)
  );
  assert.equal(calls.some((call) => call.type === "delete" && call.table === "gac_round_squads"), false);
  assert.equal(calls.some((call) => call.type === "insert" && call.table === "gac_round_squads"), false);
});

test("deleting a defense with completed attempt history is blocked before database delete", async () => {
  const { service, calls } = harness({ id: 7, defense_squad_id: 44, status: "loss", attempt_count: 1, attempt_log: [{ status: "loss" }] });
  await assert.rejects(
    () => service.deleteDefense("USER-1", { ...context, id: 44 }),
    (error) => error?.status === 409 && /attempt history/i.test(error.message)
  );
  assert.equal(calls.some((call) => call.type === "delete" && call.table === "gac_round_squads"), false);
});

test("released zero-attempt plan may be deleted or replaced deliberately", async () => {
  const released = { id: 7, defense_squad_id: 44, status: "abandoned", attempt_count: 0, attempt_log: [] };
  const deletion = harness(released);
  const deleted = await deletion.service.deleteDefense("USER-1", { ...context, id: 44 });
  assert.equal(deleted.deleted, true);
  assert.equal(deletion.calls.some((call) => call.type === "delete" && call.table === "gac_round_squads"), true);

  const replacementHarness = harness(released);
  const saved = await replacementHarness.service.saveDefense("USER-1", replacement);
  assert.equal(saved.saved, true);
  assert.equal(replacementHarness.calls.some((call) => call.type === "delete" && call.table === "gac_round_squads"), true);
  assert.equal(replacementHarness.calls.some((call) => call.type === "insert" && call.table === "gac_round_squads"), true);
});
