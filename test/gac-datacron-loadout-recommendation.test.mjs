import test from "node:test";
import assert from "node:assert/strict";

function installBrowserStubs() {
  globalThis.document = {
    getElementById() { return null; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener() {},
    documentElement: {},
  };
  globalThis.window = { addEventListener() {} };
  globalThis.MutationObserver = class MutationObserver {
    observe() {}
  };
}

test("counter datacron loadout recommendation preserves coverage and traceable mechanics without a strength multiplier", async () => {
  installBrowserStubs();
  const { loadoutRecommendation } = await import("../public/gac-datacron-counter-eligibility.js");

  const coverage = {
    eligibleMembers: 3,
    squadSize: 3,
    leaderEligible: true,
    datacron: {
      id: "DC-ROUND-3",
      setId: 19,
      level: 9,
      affixes: [
        {
          tier: 6,
          abilityId: "DATACRON_ABILITY_TM",
          abilityName: "Tactical Momentum",
          abilityDescription: "At the start of battle, allies gain 20% Turn Meter and 15% Speed.",
          abilityTextResolved: true,
        },
        {
          tier: 9,
          abilityId: "DATACRON_ABILITY_REVIVE",
          abilityName: "Return to the Fight",
          abilityDescription: "The first time an ally is defeated, revive that ally with 50% Health.",
          abilityTextResolved: true,
        },
      ],
    },
  };

  const recommendation = loadoutRecommendation(coverage, null);
  assert.equal(recommendation.datacronId, "DC-ROUND-3");
  assert.equal(recommendation.level, 9);
  assert.equal(recommendation.eligibleMembers, 3);
  assert.equal(recommendation.squadSize, 3);
  assert.equal(recommendation.fullCoverage, true);
  assert.equal(recommendation.leaderEligible, true);
  assert.ok(recommendation.mechanics.includes("Turn Meter"));
  assert.ok(recommendation.mechanics.includes("Speed"));
  assert.ok(recommendation.mechanics.includes("Revive"));
  assert.ok(recommendation.mechanics.includes("Start of Battle"));
  assert.equal("score" in recommendation, false);
  assert.equal("multiplier" in recommendation, false);
});
