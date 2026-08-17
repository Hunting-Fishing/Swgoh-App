import test from "node:test";
import assert from "node:assert/strict";
import { planGuildRoteSafeAssignments, normalizeDonationPreference } from "../public/guild-rote-safe-planner.js";
import { buildGuildRoteOperationProtectionsFromCoverage } from "../public/guild-rote-operation-safety.js";

const unit = (baseId, relic = 7, stars = 7) => ({ baseId, name: baseId, unitType: "Character", stars, gear: 13, relic, power: 30000 });
const member = (id, gp, units) => ({ playerId: id, allyCode: id === "a" ? "111222333" : "444555666", name: `Member ${id.toUpperCase()}`, galacticPower: gp, rosterAvailable: true, units });
const slot = (id, baseId, slotNo = 1) => ({ id, phase: "P1", conflictId: "corellia", squadId: "op-1", slot: slotNo, baseId, name: baseId, unitType: "Character", requiredRarity: 7, requiredRelic: 5 });

const guild = {
  members: [
    member("a", 9_000_000, [unit("X"), unit("Y"), unit("Z"), unit("ONLY")]),
    member("b", 8_000_000, [unit("X"), unit("Y"), unit("Z")]),
  ],
};

test("normalizes donation preferences", () => {
  assert.equal(normalizeDonationPreference("GIVE"), "give");
  assert.equal(normalizeDonationPreference("keep"), "keep");
  assert.equal(normalizeDonationPreference("anything"), "default");
});

test("GIVE beats DEFAULT while KEEP is avoided when owners are equally mission-safe", () => {
  const plan = planGuildRoteSafeAssignments(guild, { slots: [slot("x", "X"), slot("y", "Y", 2)] }, {
    preferences: [
      { memberId: "b", baseId: "X", preference: "give" },
      { memberId: "a", baseId: "Y", preference: "keep" },
    ],
  });
  const x = plan.assignments.find((row) => row.baseId === "X");
  const y = plan.assignments.find((row) => row.baseId === "Y");
  assert.equal(x.member.playerId, "b");
  assert.equal(x.safety.preference, "give");
  assert.equal(y.member.playerId, "b");
  assert.notEqual(y.safety.preference, "keep");
});

test("mission-protected owner is avoided when a safe owner exists", () => {
  const plan = planGuildRoteSafeAssignments(guild, { slots: [slot("z", "Z")] }, {
    protections: [{ memberId: "a", phase: "P1", baseId: "Z", severity: 100, reasons: ["sole mission owner"] }],
  });
  assert.equal(plan.assignments[0].member.playerId, "b");
  assert.equal(plan.assignments[0].safety.status, "SAFE");
  assert.equal(plan.assignments[0].safeOwners, 1);
});

test("mission protection outranks GIVE so a protected donor cannot jump a safe default owner", () => {
  const plan = planGuildRoteSafeAssignments(guild, { slots: [slot("x-protected-give", "X")] }, {
    preferences: [{ memberId: "a", baseId: "X", preference: "give" }],
    protections: [{ memberId: "a", phase: "P1", baseId: "X", severity: 100, reasons: ["sole mission owner"] }],
  });
  const assignment = plan.assignments[0];
  assert.equal(assignment.member.playerId, "b");
  assert.equal(assignment.safety.status, "SAFE");
  assert.equal(assignment.safeOwners, 1);
  assert.equal(plan.safetySummary.protectedOverrides, 0);
});

test("mission protection outranks KEEP so an unprotected KEEP owner is safer than a protected default owner", () => {
  const plan = planGuildRoteSafeAssignments(guild, { slots: [slot("y-safe-keep", "Y")] }, {
    preferences: [{ memberId: "b", baseId: "Y", preference: "keep" }],
    protections: [{ memberId: "a", phase: "P1", baseId: "Y", severity: 82, reasons: ["tight mission depth"] }],
  });
  const assignment = plan.assignments[0];
  assert.equal(assignment.member.playerId, "b");
  assert.equal(assignment.safety.preference, "keep");
  assert.equal(assignment.safety.status, "KEEP OVERRIDE");
  assert.equal(assignment.safety.help, true);
  assert.equal(assignment.safeOwners, 0);
  assert.equal(plan.safetySummary.keepOverrides, 1);
  assert.equal(plan.safetySummary.protectedOverrides, 0);
});

test("protected GIVE remains a clearly risky last resort when it is the only eligible owner", () => {
  const onlyProtected = {
    members: [member("a", 9_000_000, [unit("ONLY")])],
  };
  const plan = planGuildRoteSafeAssignments(onlyProtected, { slots: [slot("protected-only", "ONLY")] }, {
    preferences: [{ memberId: "a", baseId: "ONLY", preference: "give" }],
    protections: [{ memberId: "a", phase: "P1", baseId: "ONLY", severity: 100, reasons: ["sole mission owner"] }],
  });
  assert.equal(plan.unfilledSlots, 0);
  assert.equal(plan.assignments.length, 1);
  assert.equal(plan.assignments[0].member.playerId, "a");
  assert.equal(plan.assignments[0].safety.preference, "give");
  assert.equal(plan.assignments[0].safety.status, "MISSION PROTECTED — GIVE DEFERRED");
  assert.equal(plan.assignments[0].safety.help, true);
  assert.equal(plan.assignments[0].safeOwners, 0);
  assert.equal(plan.safetySummary.protectedOverrides, 1);
  assert.equal(plan.safetySummary.helpAssignments, 1);
});

test("KEEP remains a last-resort donor instead of making a completable slot unfilled", () => {
  const plan = planGuildRoteSafeAssignments(guild, { slots: [slot("only", "ONLY")] }, {
    preferences: [{ memberId: "a", baseId: "ONLY", preference: "keep" }],
  });
  assert.equal(plan.unfilledSlots, 0);
  assert.equal(plan.assignments[0].member.playerId, "a");
  assert.equal(plan.assignments[0].safety.preference, "keep");
  assert.equal(plan.assignments[0].safety.status, "KEEP OVERRIDE");
  assert.equal(plan.safetySummary.keepOverrides, 1);
});

test("ignored members are unavailable while hard mission reserves stay absolute", () => {
  const ignored = planGuildRoteSafeAssignments(guild, { slots: [slot("x", "X")] }, { ignoredMembers: ["b"] });
  assert.equal(ignored.assignments[0].member.playerId, "a");
  assert.equal(ignored.safetySummary.ignoredMembers, 1);

  const reserved = planGuildRoteSafeAssignments({ members: [guild.members[0]] }, { slots: [slot("only", "ONLY")] }, {
    reservations: [{ memberId: "a", phase: "P1", baseId: "ONLY" }],
  });
  assert.equal(reserved.assignments.length, 0);
  assert.equal(reserved.unfilledSlots, 1);
});

test("protection builder protects mandatory and exact-tight flex units", () => {
  const mission = {
    id: "mission-1",
    name: "Two slot mission",
    entry: {
      verified: true,
      unitType: "Character",
      squadSize: 2,
      mandatoryMembers: [{ name: "Required", baseId: "REQ" }],
    },
  };
  const coverage = {
    redundancyTarget: 2,
    exactMissions: [{
      key: "planet:mission-1",
      phase: "P1",
      planetName: "Planet",
      mission,
      exactReady: [{
        member: { id: "a" },
        eligibility: {
          mandatory: [{ legal: true, unit: { baseId: "REQ", name: "Required" } }],
          candidates: [{ baseId: "REQ", name: "Required" }, { baseId: "FLEX", name: "Flex" }],
        },
      }],
    }],
  };
  const protections = buildGuildRoteOperationProtectionsFromCoverage(coverage);
  assert.equal(protections.length, 2);
  assert.deepEqual(new Set(protections.map((row) => row.baseId)), new Set(["REQ", "FLEX"]));
  assert.ok(protections.every((row) => row.phase === "P1"));
  assert.ok(protections.every((row) => row.severity >= 80));
});

test("flex units are not auto-protected when the member has surplus mission depth", () => {
  const mission = {
    id: "mission-2",
    name: "Two slot mission with surplus",
    entry: {
      verified: true,
      unitType: "Character",
      squadSize: 2,
      mandatoryMembers: [{ name: "Required", baseId: "REQ" }],
    },
  };
  const protections = buildGuildRoteOperationProtectionsFromCoverage({
    redundancyTarget: 2,
    exactMissions: [{
      key: "planet:mission-2",
      phase: "P1",
      planetName: "Planet",
      mission,
      exactReady: [{
        member: { id: "a" },
        eligibility: {
          mandatory: [{ legal: true, unit: { baseId: "REQ", name: "Required" } }],
          candidates: [{ baseId: "REQ" }, { baseId: "FLEX1" }, { baseId: "FLEX2" }],
        },
      }],
    }],
  });
  assert.deepEqual(protections.map((row) => row.baseId), ["REQ"]);
});
