import test from "node:test";
import assert from "node:assert/strict";
import { buildGuildTbPhaseCommand, guildTbPhaseOptions, normalizeGuildTbPhase } from "../public/guild-tb-phase-command-model.js";

const member = (id, name, gp = 8_000_000) => ({ playerId: id, allyCode: id === "a" ? "111222333" : "444555666", name, galacticPower: gp, rosterAvailable: true });
const memberA = member("a", "Alpha", 9_000_000);
const memberB = member("b", "Beta", 8_000_000);

const exactReady = (m) => ({ member: { id: m.playerId, playerId: m.playerId, allyCode: m.allyCode, name: m.name, galacticPower: m.galacticPower } });

const mission = (key, phase, ready = []) => ({
  key,
  phase,
  planetName: `${phase} Planet`,
  evidence: "exact",
  mission: { id: key, name: key },
  exactReady: ready.map(exactReady),
  close: [],
});

test("normalizes TB phases and discovers available phases", () => {
  assert.equal(normalizeGuildTbPhase("p3"), "P3");
  assert.equal(normalizeGuildTbPhase("bad", "P2"), "P2");
  const phases = guildTbPhaseOptions({ missions: [{ phase: "P3" }, { phase: "P1" }] }, { assignments: [{ phase: "P2" }] });
  assert.deepEqual(phases, ["P1", "P2", "P3"]);
});

test("phase command separates zero coverage, single owner and redundancy coverage", () => {
  const coverage = {
    redundancyTarget: 2,
    missions: [
      mission("zero", "P1", []),
      mission("single", "P1", [memberA]),
      mission("redundant", "P1", [memberA, memberB]),
      mission("other-phase", "P2", [memberA]),
      { key: "fleet-partial", phase: "P1", planetName: "P1 Planet", evidence: "gate-only", mission: { name: "Fleet partial" }, exactReady: [], close: [] },
    ],
    farms: [],
  };
  const command = buildGuildTbPhaseCommand({
    guildSnapshot: { members: [memberA, memberB] },
    coverage,
    safePlan: { assignments: [], unfilled: [] },
    safety: { redundancyTarget: 2, protections: [] },
    phase: "P1",
  });
  assert.equal(command.summary.exactMissions, 3);
  assert.equal(command.summary.zeroCoverageMissions, 1);
  assert.equal(command.summary.singleOwnerMissions, 1);
  assert.equal(command.summary.partialEvidenceMissions, 1);
  assert.equal(command.summary.exactCoveragePercent, 66.7);
  assert.equal(command.summary.redundancyCoveragePercent, 33.3);
  assert.equal(command.alerts[0].kind, "mission-zero");
});

test("phase command surfaces unfilled Operations and mission-protected HELP assignments", () => {
  const coverage = { redundancyTarget: 2, missions: [mission("single", "P1", [memberA])], farms: [] };
  const safePlan = {
    assignments: [{
      id: "slot-1",
      phase: "P1",
      conflictId: "corellia",
      squadId: "op-1",
      slot: 1,
      baseId: "UNIT_A",
      name: "Unit A",
      member: memberA,
      safety: { preference: "default", protection: { reasons: ["mission protected"] } },
    }],
    unfilled: [{
      id: "slot-2",
      phase: "P1",
      conflictId: "corellia",
      squadId: "op-1",
      slot: 2,
      baseId: "UNIT_B",
      name: "Unit B",
      safeOwners: 0,
      availableOwners: 0,
      eligibleOwners: 0,
    }],
  };
  const safety = { redundancyTarget: 2, protections: [{ memberId: "a", phase: "P1", baseId: "UNIT_A", severity: 100 }] };
  const command = buildGuildTbPhaseCommand({ guildSnapshot: { members: [memberA, memberB] }, coverage, safePlan, safety, phase: "P1" });
  assert.equal(command.summary.operationSlots, 2);
  assert.equal(command.summary.operationCoveragePercent, 50);
  assert.equal(command.summary.unfilledOperationSlots, 1);
  assert.equal(command.summary.riskyAssignments, 1);
  assert.ok(command.alerts.some((row) => row.kind === "operation-unfilled"));
  assert.ok(command.alerts.some((row) => row.kind === "operation-risk"));
  const alpha = command.members.find((row) => row.id === "a");
  assert.equal(alpha.operationAssignments, 1);
  assert.equal(alpha.riskyAssignments, 1);
  assert.equal(alpha.soleOwnerMissions, 1);
});

test("farm alerts are informational and phase-scoped", () => {
  const coverage = {
    redundancyTarget: 2,
    missions: [mission("zero", "P1", [])],
    farms: [
      { key: "a|X", member: { name: "Alpha" }, unitName: "Unit X", gapLabel: "+1 relic", missionImpact: 2, missionRefs: [{ phase: "P1" }] },
      { key: "b|Y", member: { name: "Beta" }, unitName: "Unit Y", gapLabel: "+2 relic", missionImpact: 1, missionRefs: [{ phase: "P2" }] },
    ],
  };
  const command = buildGuildTbPhaseCommand({ guildSnapshot: { members: [memberA, memberB] }, coverage, safePlan: { assignments: [], unfilled: [] }, safety: { protections: [] }, phase: "P1" });
  assert.equal(command.farms.length, 1);
  assert.ok(command.alerts.some((row) => row.kind === "farm" && row.title.includes("Unit X")));
  assert.equal(command.alerts.some((row) => row.title.includes("Unit Y")), false);
});
