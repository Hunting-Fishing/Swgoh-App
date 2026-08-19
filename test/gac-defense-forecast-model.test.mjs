import test from "node:test";
import assert from "node:assert/strict";

import {
  historicalDatacronSummary,
  predictionBroadSummary,
  predictionEvidenceLabel,
  predictionEvidenceTone,
  predictionFormatForMode,
  predictionVerifiedSummary,
  predictionZoneSummary,
  visiblePredictions,
} from "../public/gac-defense-forecast-model.js";

function prediction(overrides = {}) {
  return {
    format: "5v5",
    leaderBaseId: "LEAD",
    members: ["LEAD", "A", "B", "C", "D"],
    evidenceClass: "verified-zone-recurring",
    verifiedHistoricalBoards: 2,
    battleObservedMatchups: 4,
    zoneTendencies: [{ zone: "FRONT_TOP", verifiedBoards: 2, shareOfVerifiedAppearances: 1 }],
    slotTendencies: [{ zone: "FRONT_TOP", slot: 0, verifiedBoards: 1, shareOfVerifiedAppearances: 0.5 }],
    ...overrides,
  };
}

test("forecast mode filtering never mixes 3v3 and 5v5", () => {
  const report = {
    predictions: [
      prediction({ format: "5v5", leaderBaseId: "FIVE" }),
      prediction({ format: "3v3", leaderBaseId: "THREE", members: ["THREE", "A", "B"] }),
    ],
  };
  assert.deepEqual(visiblePredictions(report, "5").map((row) => row.leaderBaseId), ["FIVE"]);
  assert.deepEqual(visiblePredictions(report, "3v3").map((row) => row.leaderBaseId), ["THREE"]);
  assert.equal(predictionFormatForMode("3"), "3v3");
  assert.equal(predictionFormatForMode("5"), "5v5");
  assert.equal(predictionFormatForMode(""), "");
});

test("forecast evidence classes render explicit historical-strength labels", () => {
  assert.equal(predictionEvidenceLabel("verified-zone-recurring"), "VERIFIED ZONE · RECURRING");
  assert.equal(predictionEvidenceLabel("verified-zone-once"), "VERIFIED ZONE · SEEN ONCE");
  assert.equal(predictionEvidenceLabel("battle-recurring"), "BATTLE HISTORY · RECURRING");
  assert.equal(predictionEvidenceLabel("battle-observed"), "BATTLE HISTORY · OBSERVED");
  assert.equal(predictionEvidenceTone("verified-zone-recurring"), "strong");
  assert.equal(predictionEvidenceTone("battle-recurring"), "recurring");
});

test("zone summaries use verified historical placements only", () => {
  assert.equal(
    predictionZoneSummary(prediction()),
    "FRONT_TOP · slot 1 · 2/2 verified appearances",
  );
  assert.equal(
    predictionZoneSummary(prediction({ zoneTendencies: [], slotTendencies: [] })),
    "No verified historical zone evidence",
  );
});

test("broad and verified recurrence summaries keep their denominators separate", () => {
  const row = prediction({ battleObservedMatchups: 4, verifiedHistoricalBoards: 2 });
  const coverage = { battleObservedMatchups: 10, verifiedHistoricalBoards: 3 };
  assert.equal(predictionBroadSummary(row, coverage), "4/10 observed historical matchups");
  assert.equal(predictionVerifiedSummary(row, coverage), "2/3 completed verified boards");
});

test("historical datacron label cannot be mistaken for a current recommendation", () => {
  assert.equal(
    historicalDatacronSummary({ level: 9, setId: "SET-12" }),
    "Last verified historical datacron · Level 9 · Set SET-12",
  );
  assert.equal(historicalDatacronSummary(null), "");
});
