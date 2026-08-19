import test from "node:test";
import assert from "node:assert/strict";
import { createGacAttackPlanService } from "../gac-attack-plan-service.mjs";

function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
function unfilter(value) { return String(value ?? "").replace(/^(eq\.|in\.\()/, "").replace(/\)$/, ""); }

function harness(options = {}) {
  const calls = [];
  const rows = {
    gac_round_squads: clone(options.defenses || [
      {
        id: 44,
        round_id: "ROUND-ROW",
        owner: "opponent",
        side: "defense",
        leader_base_id: "DEF_A",
        members: ["DEF_A", "DEF_B", "DEF_C"],
        datacron: null,
        zone: "FRONT-TOP",
        squad_slot: 0,
        source: "user-confirmed-current-board",
      },
      {
        id: 45,
        round_id: "ROUND-ROW",
        owner: "opponent",
        side: "defense",
        leader_base_id: "DEF_D",
        members: ["DEF_D", "DEF_E", "DEF_F"],
        datacron: null,
        zone: "FRONT-BOTTOM",
        squad_slot: 1,
        source: "user-confirmed-current-board",
      },
    ]),
    gac_attack_plan_assignments: clone(options.assignments || []),
  };

  function matches(row, query = {}) {
    for (const [key, raw] of Object.entries(query)) {
      if (["select", "limit", "order"].includes(key)) continue;
      const text = String(raw ?? "");
      if (text.startsWith("eq.")) {
        if (String(row[key] ?? "") !== text.slice(3)) return false;
      } else if (text.startsWith("in.(")) {
        const allowed = text.slice(4, -1).split(",");
        if (!allowed.includes(String(row[key] ?? ""))) return false;
      }
    }
    return true;
  }

  const store = {
    async select(table, query) {
      calls.push({ type: "select", table, query: clone(query) });
      return clone((rows[table] || []).filter((row) => matches(row, query)).slice(0, Number(query?.limit || 100)));
    },
    async upsert(table, values) {
      calls.push({ type: "upsert", table, rows: clone(values) });
      const output = [];
      for (const value of values) {
        let current = rows[table].find((row) => row.round_id === value.round_id && Number(row.defense_squad_id) === Number(value.defense_squad_id));
        if (current) Object.assign(current, clone(value));
        else {
          current = { id: rows[table].length + 1, ...clone(value) };
          rows[table].push(current);
        }
        output.push(clone(current));
      }
      return output;
    },
    async update(table, values, query) {
      calls.push({ type: "update", table, values: clone(values), query: clone(query) });
      const output = [];
      for (const row of rows[table] || []) {
        if (!matches(row, query)) continue;
        Object.assign(row, clone(values));
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
        roundRow: { id: "ROUND-ROW" },
        confirmed: { opponent: { allyCode: "123456789", name: "Navygators" } },
      };
    },
  };

  let tick = 0;
  const service = createGacAttackPlanService({
    store,
    boards,
    now: () => new Date(Date.parse("2026-08-19T14:00:00.000Z") + tick++ * 1000),
  });
  return { service, calls, rows };
}

const context = {
  allyCode: "732764286",
  opponentAllyCode: "123456789",
  eventInstanceId: "GAC:CURRENT",
  round: 3,
};

function plan(defenseId, members = ["ATK_A", "ATK_B", "ATK_C"]) {
  return {
    ...context,
    defenseId,
    leaderBaseId: members[0],
    members,
    datacron: { id: "OWN-DC-9", setId: 19, level: 9, affixes: [] },
  };
}

test("locks one verified saved defense with a sanitized planned counter", async () => {
  const { service, rows } = harness();
  const result = await service.saveAssignment("USER-1", plan(44));
  assert.equal(result.saved, true);
  assert.equal(result.assignment.defenseId, 44);
  assert.equal(result.assignment.status, "planned");
  assert.deepEqual(result.assignment.members, ["ATK_A", "ATK_B", "ATK_C"]);
  assert.equal(result.assignment.datacron.id, "OWN-DC-9");
  assert.equal(rows.gac_attack_plan_assignments.length, 1);
  assert.deepEqual(rows.gac_attack_plan_assignments[0].attempt_log, []);
});

test("rejects double-booking an attacker across active defenses", async () => {
  const { service } = harness();
  await service.saveAssignment("USER-1", plan(44));
  await assert.rejects(
    () => service.saveAssignment("USER-1", plan(45, ["ATK_A", "ATK_X", "ATK_Y"])),
    (error) => error?.status === 409 && /already reserved or consumed/i.test(error.message)
  );
});

test("planned to attempted to loss is one attempt and appends the failed squad exactly once", async () => {
  const { service } = harness();
  const saved = await service.saveAssignment("USER-1", plan(44));
  const attempted = await service.updateStatus("USER-1", { ...context, id: saved.assignment.id, status: "attempted" });
  assert.equal(attempted.assignment.attemptCount, 1);
  assert.equal(attempted.assignment.attemptLog.length, 0);

  const lost = await service.updateStatus("USER-1", { ...context, id: saved.assignment.id, status: "loss", banners: 0 });
  assert.equal(lost.assignment.attemptCount, 1);
  assert.equal(lost.assignment.attemptLog.length, 1);
  assert.equal(lost.assignment.attemptLog[0].status, "loss");
  assert.deepEqual(lost.assignment.attemptLog[0].members, ["ATK_A", "ATK_B", "ATK_C"]);

  const duplicateLoss = await service.updateStatus("USER-1", { ...context, id: saved.assignment.id, status: "loss", banners: 0 });
  assert.equal(duplicateLoss.assignment.attemptCount, 1);
  assert.equal(duplicateLoss.assignment.attemptLog.length, 1);
});

test("direct planned to win counts once and preserves banners in the attempt log", async () => {
  const { service } = harness();
  const saved = await service.saveAssignment("USER-1", plan(44));
  const won = await service.updateStatus("USER-1", { ...context, id: saved.assignment.id, status: "win", banners: 65 });
  assert.equal(won.assignment.attemptCount, 1);
  assert.equal(won.assignment.banners, 65);
  assert.equal(won.assignment.attemptLog.length, 1);
  assert.equal(won.assignment.attemptLog[0].status, "win");
  assert.equal(won.assignment.attemptLog[0].banners, 65);
});

test("after a loss the same defense can be replanned, but consumed attackers cannot be reused", async () => {
  const { service } = harness();
  const first = await service.saveAssignment("USER-1", plan(44));
  await service.updateStatus("USER-1", { ...context, id: first.assignment.id, status: "loss" });

  await assert.rejects(
    () => service.saveAssignment("USER-1", plan(44, ["ATK_A", "ATK_D", "ATK_E"])),
    (error) => error?.status === 409 && /ATK_A/.test(error.message)
  );

  const retry = await service.saveAssignment("USER-1", plan(44, ["ATK_D", "ATK_E", "ATK_F"]));
  assert.equal(retry.assignment.status, "planned");
  assert.equal(retry.assignment.attemptCount, 1);
  assert.equal(retry.assignment.attemptLog.length, 1);
  assert.deepEqual(retry.assignment.members, ["ATK_D", "ATK_E", "ATK_F"]);
});

test("abandoning an unattempted plan frees its attackers for another defense", async () => {
  const { service } = harness();
  const first = await service.saveAssignment("USER-1", plan(44));
  const abandoned = await service.updateStatus("USER-1", { ...context, id: first.assignment.id, status: "abandoned" });
  assert.equal(abandoned.assignment.attemptCount, 0);
  assert.equal(abandoned.assignment.attemptLog.length, 0);

  const second = await service.saveAssignment("USER-1", plan(45));
  assert.equal(second.assignment.status, "planned");
});

test("rejects attack planning against a defense outside verified current-board evidence", async () => {
  const { service } = harness();
  await assert.rejects(
    () => service.saveAssignment("USER-1", plan(999)),
    (error) => error?.status === 404 && /not verified current-board evidence/i.test(error.message)
  );
});
