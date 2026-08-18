import test from "node:test";
import assert from "node:assert/strict";
import { shapeDiscordPlanningSnapshot } from "../discord-tb-stage8-view.mjs";
import { planGuildRoteSafeAssignments } from "../public/guild-rote-safe-planner.js";
import { evaluateGuildMemberForMission, guildRoteMissionEvidence } from "../public/guild-rote-mission-coverage-model.js";

const character = (baseId) => ({
  baseId,
  name: baseId,
  unitType: "Character",
  stars: 7,
  gear: 13,
  relic: 7,
  power: 30_000,
});

const operationSlot = (baseId) => ({
  id: `slot-${baseId}`,
  phase: "P1",
  conflictId: "corellia",
  squadId: "op-1",
  slot: 1,
  baseId,
  name: baseId,
  unitType: "Character",
  requiredRarity: 7,
  requiredRelic: 5,
});

test("phase-scoped Discord plan view fixes protection totals and surfaces HELP assignments first", () => {
  const snapshot = {
    safety: {
      summary: { protectedUnits: 3, criticalProtections: 2 },
      protections: [
        { phase: "P1", baseId: "A", severity: 90 },
        { phase: "P1", baseId: "B", severity: 50 },
        { phase: "P6", baseId: "C", severity: 100 },
      ],
    },
    plan: {
      assignments: [
        { phase: "P6", baseId: "SAFE", safety: { status: "SAFE", help: false } },
        { phase: "P1", baseId: "OTHER", safety: { status: "SAFE", help: false } },
        { phase: "P6", baseId: "RISK", safety: { status: "KEEP OVERRIDE", help: true, reasons: ["last resort"] } },
      ],
      unfilled: [],
    },
  };

  const shaped = shapeDiscordPlanningSnapshot(snapshot, "P6");
  assert.equal(shaped.safety.summary.protectedUnits, 1);
  assert.equal(shaped.safety.summary.criticalProtections, 1);
  assert.deepEqual(shaped.safety.protections.map((row) => row.baseId), ["C"]);
  assert.equal(shaped.plan.assignments[0].baseId, "RISK");
  assert.equal(shaped.plan.assignments[0].safety.help, true);
  assert.match(shaped.plan.assignments[0].safety.status, /last resort/i);
  assert.equal(shaped.plan.assignments[1].baseId, "SAFE");
});

test("safe planner uses credible non-zero Galactic Power as the final equal-safety donor tie-break", () => {
  const guild = {
    members: [
      {
        playerId: "low",
        allyCode: "111222333",
        name: "Lower GP",
        galacticPower: 8_000_000,
        rosterAvailable: true,
        units: [character("TIE")],
      },
      {
        playerId: "high",
        allyCode: "444555666",
        name: "Higher GP",
        galacticPower: 10_000_000,
        rosterAvailable: true,
        units: [character("TIE")],
      },
    ],
  };

  const plan = planGuildRoteSafeAssignments(guild, { slots: [operationSlot("TIE")] });
  assert.equal(plan.assignments.length, 1);
  assert.equal(plan.assignments[0].member.playerId, "high");
  assert.equal(plan.assignments[0].member.galacticPower, 10_000_000);
  assert.ok(plan.assignments[0].member.galacticPower > 0);
});

test("generic verified fleet gate remains partial/gate-only instead of exact-ready without selectable-ship evidence", () => {
  const mission = {
    id: "fleet-generic",
    name: "Generic Fleet Mission",
    missionType: "fleet",
    entry: {
      verified: true,
      unitType: "Ship",
      squadSize: 6,
      starsMin: 7,
      powerMin: 1,
      mandatoryMembers: [],
      requiredCategories: [],
      requiredBaseIds: [],
      allowedBaseIds: [],
    },
  };
  const member = {
    id: "fleet-owner",
    playerId: "fleet-owner",
    name: "Fleet Owner",
    galacticPower: 10_000_000,
    rosterAvailable: true,
    units: [],
    ships: Array.from({ length: 6 }, (_, index) => ({
      baseId: `SHIP_${index + 1}`,
      name: `Ship ${index + 1}`,
      unitType: "Ship",
      stars: 7,
      power: 100_000,
      factions: [],
      categories: [],
    })),
  };

  assert.equal(guildRoteMissionEvidence(mission), "gate-only");
  const evaluation = evaluateGuildMemberForMission(member, mission);
  assert.equal(evaluation.evidence, "gate-only");
  assert.equal(evaluation.exactReady, false);
  assert.equal(evaluation.knownGateReady, true);
});
