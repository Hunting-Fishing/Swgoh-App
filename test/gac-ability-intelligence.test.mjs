import test from "node:test";
import assert from "node:assert/strict";
import {
  abilityGapSummary,
  abilityGaps,
  abilityTierDelta,
  abilityTierTotal,
  squadAbilityReadiness,
  unitAbilityReadiness,
} from "../public/gac-ability-intelligence.js";

const mine = {
  abilities: [
    { id: "basic", name: "Basic", displayTier: 8, omega: true },
    { id: "leader", name: "Leader", displayTier: 7, zeta: true },
    { id: "unique", name: "Unique", displayTier: 6, omicron: false },
  ],
};

const theirs = {
  abilities: [
    { id: "basic", name: "Basic", displayTier: 8, omega: true },
    { id: "leader", name: "Leader", displayTier: 8, zeta: true },
    { id: "unique", name: "Unique", displayTier: 8, omicron: true },
  ],
};

test("ability tier totals and delta are calculated from normalized abilities", () => {
  assert.equal(abilityTierTotal(mine), 21);
  assert.equal(abilityTierTotal(theirs), 24);
  assert.equal(abilityTierDelta(mine, theirs), -3);
});

test("ability gaps expose exact per-ability tier and omicron differences", () => {
  const gaps = abilityGaps(mine, theirs);
  const unique = gaps.find((gap) => gap.id === "unique");
  assert.equal(unique.delta, -2);
  assert.equal(unique.omicronMine, false);
  assert.equal(unique.omicronTheirs, true);
  assert.match(abilityGapSummary(mine, theirs), /Unique -2/);
});

test("ability readiness scores purchased tiers without claiming counter-specific requirements", () => {
  const ready = unitAbilityReadiness(theirs);
  const partial = unitAbilityReadiness({
    abilities: [
      { id: "basic", displayTier: 5 },
      { id: "leader", displayTier: 4 },
      { id: "unique", displayTier: 3 },
    ],
  });
  assert.equal(ready.known, true);
  assert.equal(ready.score, 100);
  assert.ok(partial.score < ready.score);
  assert.equal(partial.lowTierAbilities, 3);
});

test("squad ability readiness reports evidence coverage when some units lack ability data", () => {
  const summary = squadAbilityReadiness([theirs, mine, { abilities: [] }]);
  assert.equal(summary.known, true);
  assert.equal(summary.unitsKnown, 2);
  assert.equal(summary.units, 3);
  assert.equal(summary.coverage, 2 / 3);
  assert.ok(summary.score > 80);
});
