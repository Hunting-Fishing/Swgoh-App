import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  candidateSummary,
  promoteCandidate,
  promotionReady,
  reviewBlockers,
} from "../public/gac-strategy-source-review-model.js";

function validApprovedCandidate() {
  return {
    schemaVersion: 1,
    candidateId: "research:fixture:approved",
    proposedRecord: {
      schemaVersion: 1,
      id: "strategy:fixture:approved",
      status: "active",
      format: "3v3",
      defender: { leaderBaseId: "DEF_LEAD", members: ["DEF_LEAD", "DEF_2", "DEF_3"] },
      attacker: { leaderBaseId: "ATT_LEAD", members: ["ATT_LEAD", "ATT_2", "ATT_3"] },
      attackerDatacron: { presence: "any", required: false, setIds: [], mechanicIds: [] },
      defenderDatacron: { presence: "none", required: false, setIds: [], mechanicIds: [] },
      guidance: { opening: [{ text: "Paraphrased sourced opener." }], targets: [], mechanics: [], avoid: [] },
      provenance: {
        sourceName: "Fixture source",
        sourceRef: "fixture:source",
        sourceType: "curated",
        sourceUpdatedAt: "2026-08-20T00:00:00Z",
        capturedAt: "2026-08-20T01:00:00Z"
      },
      validity: { validFrom: "2026-08-20T00:00:00Z", validUntil: "", gameDataVersion: "fixture-v1", notes: "" }
    },
    review: {
      status: "approved",
      flags: {
        sourceVerified: true,
        exactCompositionVerified: true,
        baseIdsVerified: true,
        guidanceParaphraseVerified: true,
        datacronScopeVerified: true,
        versionValidityVerified: true,
        copyrightParaphraseReviewed: true
      },
      blockers: [],
      reviewer: "fixture",
      reviewedAt: "2026-08-20T02:00:00Z",
      notes: ""
    },
    research: { discoveredAt: "2026-08-20T00:00:00Z", sourceSnapshotDate: "2026-08-20", sourceNotes: "" }
  };
}

test("approved candidate with every review flag can promote into the runtime strategy contract", () => {
  const candidate = validApprovedCandidate();
  assert.equal(promotionReady(candidate), true);
  assert.deepEqual(reviewBlockers(candidate), []);
  const promoted = promoteCandidate(candidate);
  assert.equal(promoted.id, "strategy:fixture:approved");
  assert.equal(promoted.defenderDatacron.presence, "none");
});

test("a candidate cannot promote merely because its proposed runtime record is structurally valid", () => {
  const candidate = validApprovedCandidate();
  candidate.review.status = "quarantined";
  candidate.review.flags.datacronScopeVerified = false;
  candidate.review.blockers = ["datacron-scope-unverified"];
  const blockers = reviewBlockers(candidate);
  assert.ok(blockers.includes("datacron-scope-unverified"));
  assert.ok(blockers.includes("review:datacronScopeVerified"));
  assert.ok(blockers.includes("review:not-approved"));
  assert.equal(promotionReady(candidate), false);
  assert.throws(() => promoteCandidate(candidate), /not promotion-ready/i);
});

test("staged Baylan research is quarantined and cannot affect the live strategy catalog", async () => {
  const candidates = JSON.parse(await readFile(new URL("../public/data/gac-strategy-source-candidates.json", import.meta.url), "utf8"));
  const production = JSON.parse(await readFile(new URL("../public/data/gac-strategy-records.json", import.meta.url), "utf8"));
  assert.equal(candidates.schemaVersion, 1);
  assert.equal(candidates.candidates.length, 1);
  const staged = candidates.candidates[0];
  const summary = candidateSummary(staged);
  assert.equal(summary.status, "quarantined");
  assert.equal(summary.promotionReady, false);
  assert.ok(summary.blockers.includes("datacron-scope-unverified"));
  assert.ok(summary.blockers.includes("current-version-validity-unverified"));
  assert.ok(summary.blockers.includes("base-ids-unverified"));
  assert.ok(summary.blockers.some((entry) => entry.startsWith("record:invalid-attacker-datacron-presence")));
  assert.ok(summary.blockers.some((entry) => entry.startsWith("record:invalid-defender-datacron-presence")));
  assert.deepEqual(production.records, []);
});

test("source-review model has no browser or persistence side effects", async () => {
  const source = await readFile(new URL("../public/gac-strategy-source-review-model.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /\bdocument\b|\bwindow\b/);
  assert.doesNotMatch(source, /method\s*:\s*["'](?:POST|PUT|PATCH|DELETE)["']/i);
});
