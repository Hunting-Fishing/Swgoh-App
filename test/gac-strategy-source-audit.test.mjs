import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { auditSourceCandidates, buildProductionCatalog } from "../gac-strategy-source-audit.mjs";

function approvedCandidate(id = "strategy:fixture:approved") {
  return {
    schemaVersion: 1,
    candidateId: `research:${id}`,
    proposedRecord: {
      schemaVersion: 1,
      id,
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
      reviewedAt: "2026-08-20T02:00:00Z"
    }
  };
}

const emptyProduction = {
  schemaVersion: 1,
  generatedAt: null,
  sourcePolicy: "Only reviewed records.",
  records: []
};

test("audit allows quarantined research while preventing it from becoming promotion-ready", async () => {
  const body = JSON.parse(await readFile(new URL("../public/data/gac-strategy-source-candidates.json", import.meta.url), "utf8"));
  const audit = auditSourceCandidates(body, emptyProduction);
  assert.equal(audit.safe, true);
  assert.equal(audit.candidateCount, 1);
  assert.equal(audit.quarantined, 1);
  assert.equal(audit.approved, 0);
  assert.equal(audit.promotionReady, 0);
  assert.equal(audit.candidates[0].promotionReady, false);
});

test("an approved fully reviewed candidate is deterministically added to production", () => {
  const candidateBody = { schemaVersion: 1, candidates: [approvedCandidate()] };
  const audit = auditSourceCandidates(candidateBody, emptyProduction);
  assert.equal(audit.safe, true);
  assert.equal(audit.approved, 1);
  assert.equal(audit.promotionReady, 1);
  const built = buildProductionCatalog(candidateBody, emptyProduction, "2026-08-20T03:00:00Z");
  assert.equal(built.records.length, 1);
  assert.equal(built.records[0].id, "strategy:fixture:approved");
  assert.equal(built.generatedAt, "2026-08-20T03:00:00Z");
});

test("duplicate production IDs block promotion instead of silently replacing provenance", () => {
  const candidate = approvedCandidate("strategy:duplicate");
  const production = buildProductionCatalog({ schemaVersion: 1, candidates: [candidate] }, emptyProduction, "2026-08-20T03:00:00Z");
  const audit = auditSourceCandidates({ schemaVersion: 1, candidates: [candidate] }, production);
  assert.equal(audit.safe, false);
  assert.deepEqual(audit.duplicateProductionIds, ["strategy:duplicate"]);
  assert.throws(
    () => buildProductionCatalog({ schemaVersion: 1, candidates: [candidate] }, production),
    /not safe for promotion/i,
  );
});

test("an invalid approved candidate makes the audit unsafe", () => {
  const candidate = approvedCandidate();
  candidate.review.flags.datacronScopeVerified = false;
  const audit = auditSourceCandidates({ schemaVersion: 1, candidates: [candidate] }, emptyProduction);
  assert.equal(audit.safe, false);
  assert.equal(audit.invalidApproved.length, 1);
  assert.ok(audit.invalidApproved[0].blockers.includes("review:datacronScopeVerified"));
});
