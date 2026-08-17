import test from "node:test";
import assert from "node:assert/strict";
import { buildDiscordMemberRoteSummary } from "../discord-member-rote-summary.mjs";

const linkedPlayer = {
  link: { swgohAllyCode: "732764286", playerId: "player-warm" },
  member: { playerId: "player-warm", allyCode: "732764286", name: "Warm Bacon" },
};

const warm = { id: "player-warm", playerId: "player-warm", allyCode: "732764286", name: "Warm Bacon" };
const other = { id: "player-other", playerId: "player-other", allyCode: "111222333", name: "Other" };

test("personal ROTE summary scopes mission readiness, Operations, protections, and farms to the linked member", () => {
  const result = buildDiscordMemberRoteSummary({
    linkedPlayer,
    planningSnapshot: {
      safety: {
        coverage: {
          exactMissions: [
            { phase: "P1", exactReady: [{ member: warm }], close: [] },
            { phase: "P1", exactReady: [{ member: warm }, { member: other }], close: [] },
            { phase: "P2", exactReady: [{ member: other }], close: [{ member: warm }] },
          ],
          farms: [
            { member: warm, baseId: "FARM1", unitName: "Farm One", gapLabel: "+2 relic", missionImpact: 3, mandatoryImpact: 1, missionRefs: [{ phase: "P2" }, { phase: "P3" }] },
            { member: other, baseId: "IGNORE", unitName: "Ignore", gapLabel: "+1 relic", missionImpact: 1, missionRefs: [{ phase: "P1" }] },
          ],
        },
        protections: [
          { memberId: "player-warm", phase: "P1", baseId: "SAFE1" },
          { memberId: "player-other", phase: "P1", baseId: "SAFE2" },
        ],
      },
      plan: {
        assignments: [
          { phase: "P1", baseId: "OP1", name: "Operation One", member: warm, safety: { status: "SAFE" } },
          { phase: "P2", baseId: "OP2", name: "Operation Two", member: warm, safety: { status: "HELP", protection: true } },
          { phase: "P1", baseId: "OTHER", name: "Other Operation", member: other, safety: { status: "SAFE" } },
        ],
      },
    },
  });

  assert.equal(result.missionReady, 2);
  assert.equal(result.soleOwnerMissions, 1);
  assert.equal(result.closeMissions, 1);
  assert.equal(result.operationAssignments, 2);
  assert.equal(result.riskyAssignments, 1);
  assert.equal(result.protectedUnits, 1);
  assert.equal(result.assignments.length, 2);
  assert.equal(result.assignments[1].risky, true);
  assert.equal(result.farms.length, 1);
  assert.equal(result.farms[0].unitName, "Farm One");
  assert.deepEqual(result.farms[0].phases, ["P2", "P3"]);

  const p1 = result.phases.find((row) => row.phase === "P1");
  const p2 = result.phases.find((row) => row.phase === "P2");
  const p3 = result.phases.find((row) => row.phase === "P3");
  assert.deepEqual(p1, { phase: "P1", ready: 2, sole: 1, close: 0, operations: 1, riskyOperations: 0, farms: 0 });
  assert.deepEqual(p2, { phase: "P2", ready: 0, sole: 0, close: 1, operations: 1, riskyOperations: 1, farms: 1 });
  assert.equal(p3.farms, 1);
});

test("personal ROTE summary can match guild evidence by Ally Code when player IDs differ or are absent", () => {
  const result = buildDiscordMemberRoteSummary({
    linkedPlayer,
    planningSnapshot: {
      safety: {
        coverage: {
          exactMissions: [{ phase: "P4", exactReady: [{ member: { allyCode: "732-764-286", name: "Renamed" } }], close: [] }],
          farms: [],
        },
        protections: [{ memberId: "732764286", phase: "P4", baseId: "UNIT" }],
      },
      plan: { assignments: [] },
    },
  });

  assert.equal(result.missionReady, 1);
  assert.equal(result.soleOwnerMissions, 1);
  assert.equal(result.protectedUnits, 1);
});

test("personal ROTE summary rejects an input with no linked identity", () => {
  assert.throws(() => buildDiscordMemberRoteSummary({ linkedPlayer: {}, planningSnapshot: {} }), /linked SWGOH player identity/);
});
