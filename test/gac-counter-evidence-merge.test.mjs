import test from "node:test";
import assert from "node:assert/strict";
import { mergeCounterEvidence, signature, verifiedBattleObservation } from "../gac-counter-evidence-merge.mjs";

function aggregate(overrides = {}) {
  return {
    format: "3v3",
    enemy_leader_base_id: "DEF_LEAD",
    enemy_members: ["DEF_3", "DEF_LEAD", "DEF_2"],
    counter_leader_base_id: "ATK_LEAD",
    counter_members: ["ATK_3", "ATK_2", "ATK_LEAD"],
    battles: 10,
    wins: 8,
    holds: 2,
    draws: 0,
    average_banners: 60,
    season_id: "81",
    source: "c3po-gahistory",
    source_ref: "c3po://sample",
    source_updated_at: "2026-08-18T00:00:00.000Z",
    confidence: 0.95,
    observed_at: "2026-08-18T00:00:00.000Z",
    ...overrides,
  };
}

function verifiedBattle(overrides = {}) {
  return {
    format: "3v3",
    season_id: "82",
    attacker_leader_base_id: "ATK_LEAD",
    attacker_members: ["ATK_LEAD", "ATK_2", "ATK_3"],
    defender_leader_base_id: "DEF_LEAD",
    defender_members: ["DEF_LEAD", "DEF_2", "DEF_3"],
    battle_outcome: "win",
    source: "verified-owner-war-room",
    source_ref: "war-room:17:attempt:1",
    source_updated_at: "2026-08-19T15:00:00.000Z",
    imported_at: "2026-08-19T15:10:00.000Z",
    metadata: { banners: 65 },
    ...overrides,
  };
}

test("team signature is stable regardless of member order", () => {
  const left = signature(aggregate());
  const right = signature(aggregate({ enemy_members: ["DEF_2", "DEF_3", "DEF_LEAD"], counter_members: ["ATK_2", "ATK_LEAD", "ATK_3"] }));
  assert.equal(left, right);
});

test("only verified-owner-war-room battle rows become new individual observations", () => {
  assert.equal(verifiedBattleObservation(verifiedBattle()).battles, 1);
  assert.equal(verifiedBattleObservation(verifiedBattle()).wins, 1);
  assert.equal(verifiedBattleObservation(verifiedBattle()).average_banners, 65);
  assert.equal(verifiedBattleObservation(verifiedBattle({ source: "c3po-gahistory" })), null);
});

test("equivalent imported aggregate and verified owner battle merge into one evidence record", () => {
  const owner = verifiedBattleObservation(verifiedBattle());
  const [merged] = mergeCounterEvidence([aggregate(), owner]);
  assert.equal(merged.battles, 11);
  assert.equal(merged.wins, 9);
  assert.equal(merged.holds, 2);
  assert.equal(merged.draws, 0);
  assert.equal(merged.source, "combined-evidence");
  assert.deepEqual(merged.evidence_sources, ["c3po-gahistory", "verified-owner-war-room"]);
  assert.deepEqual(merged.season_ids, ["81", "82"]);
  assert.equal(merged.season_id, null);
  assert.equal(merged.average_banners, (60 * 10 + 65) / 11);
});

test("verified owner loss increases sample and holds without becoming a win", () => {
  const ownerLoss = verifiedBattleObservation(verifiedBattle({ battle_outcome: "loss", metadata: { banners: 0 } }));
  const [merged] = mergeCounterEvidence([aggregate(), ownerLoss]);
  assert.equal(merged.battles, 11);
  assert.equal(merged.wins, 8);
  assert.equal(merged.holds, 3);
});

test("different counter compositions stay separate", () => {
  const other = verifiedBattleObservation(verifiedBattle({ attacker_leader_base_id: "OTHER_LEAD", attacker_members: ["OTHER_LEAD", "O2", "O3"] }));
  const merged = mergeCounterEvidence([aggregate(), other]);
  assert.equal(merged.length, 2);
});
