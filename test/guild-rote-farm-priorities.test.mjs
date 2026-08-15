import assert from "node:assert/strict";
import test from "node:test";
import { planGuildRoteAssignments, roteProgressionGap } from "../public/guild-rote-planner.js";

function slot(id, baseId, extra = {}) {
  return {
    id,
    phase: "P3",
    conflictId: "P3-C1",
    squadId: "op-1",
    slot: Number(id.replace(/\D/g, "")) || 1,
    baseId,
    name: baseId,
    unitType: "Character",
    requiredRelic: 8,
    requiredRarity: 7,
    ...extra,
  };
}

test("scores near-term character progression below missing ownership", () => {
  const requirement = slot("1", "A", { requiredRelic: 8 });
  const r7 = roteProgressionGap({ stars: 7, gear: 13, relic: 7 }, requirement);
  const g12 = roteProgressionGap({ stars: 7, gear: 12, relic: 0 }, requirement);
  const missing = roteProgressionGap(null, requirement);
  assert.deepEqual(r7, { owned: true, stars: 0, gear: 0, relic: 1, score: 10 });
  assert.equal(r7.score < g12.score, true);
  assert.equal(g12.score < missing.score, true);
});

test("builds ROTE farm priorities from exact guild shortages", () => {
  const members = [
    { playerId: "p1", name: "R7", galacticPower: 10, rosterAvailable: true, units: [{ baseId: "A", stars: 7, gear: 13, relic: 7 }] },
    { playerId: "p2", name: "R6", galacticPower: 9, rosterAvailable: true, units: [{ baseId: "A", stars: 7, gear: 13, relic: 6 }] },
    { playerId: "p3", name: "Missing", galacticPower: 8, rosterAvailable: true, units: [] },
  ];
  const operations = { slots: [slot("1", "A"), slot("2", "A")] };
  const plan = planGuildRoteAssignments({ members }, operations);
  assert.equal(plan.assignedSlots, 0);
  assert.equal(plan.developmentTargets.length, 1);
  const target = plan.developmentTargets[0];
  assert.equal(target.shortage, 2);
  assert.equal(target.ownedCount, 2);
  assert.equal(target.belowRequirement, 2);
  assert.equal(target.missingOwnership, 1);
  assert.equal(target.closest[0].member.playerId, "p1");
  assert.equal(target.closest[0].gap.relic, 1);
  assert.equal(target.closest[1].member.playerId, "p2");
});

test("ranks one-star ship farms as near-term coverage", () => {
  const members = [
    { playerId: "p1", name: "Six Star", rosterAvailable: true, units: [{ baseId: "SHIP", stars: 6, gear: 1, relic: 0 }] },
    { playerId: "p2", name: "Five Star", rosterAvailable: true, units: [{ baseId: "SHIP", stars: 5, gear: 1, relic: 0 }] },
  ];
  const operations = { slots: [slot("1", "SHIP", { unitType: "Ship", requiredRelic: 0, requiredRarity: 7 })] };
  const plan = planGuildRoteAssignments({ members }, operations);
  assert.equal(plan.developmentTargets[0].closest[0].member.playerId, "p1");
  assert.equal(plan.developmentTargets[0].closest[0].gap.stars, 1);
});
