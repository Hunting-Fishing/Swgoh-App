import test from "node:test";
import assert from "node:assert/strict";
import { mergeAbilityProgression, progressionCounts } from "../public/progression-policy.js";

test("positive live Omega survives stale static classification", () => {
  const ability = mergeAbilityProgression(
    { id: "basic_test", upgradeTiers: [{ tier: 7, omega: false, zeta: false, omicron: false }] },
    { id: "basic_test", tier: 5, omega: true }
  );

  assert.equal(ability.tier, 7);
  assert.equal(ability.omegaCount, 1);
  assert.equal(ability.hasOmega, true);
});

test("nested/static Omega progression is counted from the owned display tier", () => {
  const ability = mergeAbilityProgression(
    {
      id: "basic_test",
      upgradeTiers: [
        { tier: 6, omega: false },
        { tier: 7, omega: true },
        { tier: 8, omega: false },
      ],
    },
    { id: "basic_test", tier: 5 }
  );

  assert.equal(ability.tier, 7);
  assert.equal(ability.omegaCount, 1);
});

test("unit progression never downgrades a positive live count to zero", () => {
  const counts = progressionCounts(
    { zetas: 4, omegas: 38, omicrons: 2 },
    [{ zetaCount: 3, omegaCount: 0, omicronCount: 2 }]
  );

  assert.deepEqual(counts, { zetas: 4, omegas: 38, omicrons: 2 });
});

test("derived static counts can enrich lower live counts", () => {
  const counts = progressionCounts(
    { zetas: 1, omegas: 1, omicrons: 0 },
    [
      { zetaCount: 1, omegaCount: 1, omicronCount: 0 },
      { zetaCount: 1, omegaCount: 1, omicronCount: 1 },
    ]
  );

  assert.deepEqual(counts, { zetas: 2, omegas: 2, omicrons: 1 });
});
