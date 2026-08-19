import test from "node:test";
import assert from "node:assert/strict";
import {
  compositionMatch,
  evidenceCounterCandidates,
  preferredEvidenceTier,
} from "../public/gac-evidence-counter-candidates.js";

function unit(baseId, overrides = {}) {
  return {
    baseId,
    unitType: "Character",
    stars: 7,
    gear: 13,
    relic: 7,
    power: 30000,
    ...overrides,
  };
}

const own = {
  units: [
    unit("EXACT_LEAD"), unit("EXACT_2"), unit("EXACT_3"),
    unit("VARIANT_LEAD"), unit("VARIANT_2"), unit("VARIANT_3"),
    unit("LOW_LEAD", { relic: 0, gear: 10 }), unit("LOW_2"), unit("LOW_3"),
  ],
};
const defense = {
  leaderBaseId: "DEF_LEAD",
  members: ["DEF_LEAD", "DEF_2", "DEF_3"],
};

function observation(overrides = {}) {
  return {
    format: "3v3",
    enemyLeaderBaseId: "DEF_LEAD",
    enemyMembers: ["DEF_LEAD", "DEF_2", "DEF_3"],
    counterLeaderBaseId: "EXACT_LEAD",
    counterMembers: ["EXACT_LEAD", "EXACT_2", "EXACT_3"],
    battles: 4,
    wins: 3,
    holds: 1,
    draws: 0,
    winRate: 0.75,
    averageBanners: 61,
    confidence: 0.95,
    source: "combined-evidence",
    evidenceSources: ["c3po-gahistory", "verified-owner-war-room"],
    ...overrides,
  };
}

test("composition matching is order-independent and distinguishes exact team from leader variant", () => {
  assert.deepEqual(compositionMatch(["DEF_3", "DEF_LEAD", "DEF_2"], defense.members), {
    exact: true,
    overlapCount: 3,
    overlap: 1,
    label: "exact-team",
  });
  const variant = compositionMatch(["DEF_LEAD", "OTHER_2", "OTHER_3"], defense.members);
  assert.equal(variant.exact, false);
  assert.equal(variant.overlapCount, 1);
  assert.equal(variant.overlap, 1 / 3);
  assert.equal(variant.label, "leader-variant");
});

test("exact evidence counter is resolved to the user's live owned squad with observed facts intact", () => {
  const [candidate] = evidenceCounterCandidates(own, defense, [observation()], { size: 3 });
  assert.equal(candidate.exactTeam, true);
  assert.equal(candidate.owned, true);
  assert.equal(candidate.available, true);
  assert.equal(candidate.rosterReady, true);
  assert.deepEqual(candidate.counterMembers, ["EXACT_LEAD", "EXACT_2", "EXACT_3"]);
  assert.equal(candidate.battles, 4);
  assert.equal(candidate.wins, 3);
  assert.equal(candidate.observedWinRate, 0.75);
  assert.equal(candidate.averageBanners, 61);
  assert.deepEqual(candidate.evidenceSources, ["c3po-gahistory", "verified-owner-war-room"]);
  assert.equal(Object.prototype.hasOwnProperty.call(candidate, "score"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(candidate, "predictedWinRate"), false);
});

test("exact enemy composition outranks a high-sample same-leader variant", () => {
  const candidates = evidenceCounterCandidates(own, defense, [
    observation({
      enemyMembers: ["DEF_LEAD", "OTHER_2", "OTHER_3"],
      counterLeaderBaseId: "VARIANT_LEAD",
      counterMembers: ["VARIANT_LEAD", "VARIANT_2", "VARIANT_3"],
      battles: 100,
      wins: 99,
      winRate: 0.99,
    }),
    observation(),
  ], { size: 3 });
  assert.equal(candidates[0].counterLeaderBaseId, "EXACT_LEAD");
  assert.equal(candidates[0].exactTeam, true);
  assert.equal(candidates[1].evidenceClass, "leader-variant");
});

test("missing or blocked counter members make a sourced counter unavailable", () => {
  const missing = evidenceCounterCandidates(own, defense, [observation({
    counterLeaderBaseId: "MISSING_LEAD",
    counterMembers: ["MISSING_LEAD", "EXACT_2", "EXACT_3"],
  })], { size: 3 })[0];
  assert.equal(missing.owned, false);
  assert.equal(missing.available, false);
  assert.deepEqual(missing.missingBaseIds, ["MISSING_LEAD"]);

  const blocked = evidenceCounterCandidates(own, defense, [observation()], {
    size: 3,
    excludeBaseIds: ["EXACT_2"],
  })[0];
  assert.equal(blocked.owned, true);
  assert.equal(blocked.available, false);
  assert.deepEqual(blocked.blockedBaseIds, ["EXACT_2"]);
});

test("low-investment owned squad is preserved as evidence but not labeled roster-ready", () => {
  const [candidate] = evidenceCounterCandidates(own, defense, [observation({
    counterLeaderBaseId: "LOW_LEAD",
    counterMembers: ["LOW_LEAD", "LOW_2", "LOW_3"],
  })], { size: 3 });
  assert.equal(candidate.owned, true);
  assert.equal(candidate.available, true);
  assert.equal(candidate.rosterReady, false);
  assert.deepEqual(candidate.lowInvestmentMembers, ["LOW_LEAD"]);
});

test("strategic reserve use is reported without making the counter unavailable", () => {
  const [candidate] = evidenceCounterCandidates(own, defense, [observation()], {
    size: 3,
    reserveBaseIds: ["EXACT_3"],
  });
  assert.equal(candidate.available, true);
  assert.deepEqual(candidate.reserveUses, ["EXACT_3"]);
});

test("preferred evidence tier chooses exact ready counters before variants or low-readiness exact teams", () => {
  const candidates = evidenceCounterCandidates(own, defense, [
    observation({
      counterLeaderBaseId: "LOW_LEAD",
      counterMembers: ["LOW_LEAD", "LOW_2", "LOW_3"],
      battles: 50,
      wins: 48,
      winRate: 0.96,
    }),
    observation({
      enemyMembers: ["DEF_LEAD", "OTHER_2", "OTHER_3"],
      counterLeaderBaseId: "VARIANT_LEAD",
      counterMembers: ["VARIANT_LEAD", "VARIANT_2", "VARIANT_3"],
      battles: 80,
      wins: 79,
      winRate: 0.9875,
    }),
    observation(),
  ], { size: 3 });
  const tier = preferredEvidenceTier(candidates);
  assert.equal(tier.tier, "exact-ready");
  assert.equal(tier.candidates[0].counterLeaderBaseId, "EXACT_LEAD");
});
