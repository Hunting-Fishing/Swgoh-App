import test from "node:test";
import assert from "node:assert/strict";

import { primaryEvidenceMatch } from "../public/gac-counter-inspector-model.js";

function unit(baseId) {
  return {
    baseId,
    name: baseId,
    unitType: "Character",
    stars: 7,
    gear: 13,
    relic: 7,
    power: 32000,
    speed: 300,
    zetas: 1,
    omicrons: 0,
    factions: ["FactionA"],
    abilities: [{ id: `${baseId}_basic`, type: "Basic", displayTier: 8, omega: true }],
  };
}

const defense = {
  id: 99,
  leaderBaseId: "DEF_LEAD",
  members: ["DEF_LEAD", "DEF_2", "DEF_3"],
};

function observation(overrides = {}) {
  return {
    format: "3v3",
    enemyLeaderBaseId: "DEF_LEAD",
    enemyMembers: ["DEF_LEAD", "DEF_2", "DEF_3"],
    counterLeaderBaseId: "ATT_LEAD",
    counterMembers: ["ATT_LEAD", "ATT_2", "ATT_3"],
    battles: 4,
    wins: 1,
    holds: 3,
    draws: 0,
    winRate: 0.25,
    source: "c3po-gahistory",
    ...overrides,
  };
}

test("primary exact historical provenance rejects non-actionable hold-heavy evidence", () => {
  const ownRoster = { units: [unit("ATT_LEAD"), unit("ATT_2"), unit("ATT_3")] };
  const match = primaryEvidenceMatch(
    ownRoster,
    defense,
    { observations: [observation()] },
    ["ATT_LEAD", "ATT_2", "ATT_3"],
    { size: 3 },
  );
  assert.equal(match, null);
});

test("primary exact historical provenance still accepts evidence that passes the allocator reliability gate", () => {
  const ownRoster = { units: [unit("ATT_LEAD"), unit("ATT_2"), unit("ATT_3")] };
  const match = primaryEvidenceMatch(
    ownRoster,
    defense,
    { observations: [observation({ battles: 6, wins: 5, holds: 1, winRate: 5 / 6 })] },
    ["ATT_3", "ATT_LEAD", "ATT_2"],
    { size: 3 },
  );
  assert.ok(match);
  assert.equal(match.reliability.automatic, true);
  assert.equal(match.reliability.label, "Established historical sample");
});
