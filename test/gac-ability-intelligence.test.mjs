import test from "node:test";
import assert from "node:assert/strict";
import {
  abilityGapSummary,
  abilityGaps,
  abilityTierDelta,
  abilityTierTotal,
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