import test from "node:test";
import assert from "node:assert/strict";

import {
  recordMatches,
  validateRecord,
} from "../public/gac-strategy-record-model.js";
import {
  auditSourceCandidates,
  buildProductionCatalog,
  catalogBaseIdSet,
  invalidCandidateBaseIds,
  strategyBaseIds,
} from "../gac-strategy-source-audit.mjs";

function strategyRecord(attackerMembers = ["DARTHBANE", "SITHMARAUDER"], overrides = {}) {
  return {
    schemaVersion: 1,
    id: "strategy:queen:undersized-bane:3v3",
    status: "active",
    format: "3v3",
    defender: {
      leaderBaseId: "QUEENAMIDALA",
      members: ["QUEENAMIDALA", "PADAWANOBIWAN", "MASTERQUIGON"],
    },
    attacker: {
      leaderBaseId: attackerMembers[0] || "",
      members: attackerMembers,
    },
    attackerDatacron: { presence: "any", required: false, setIds: [], mechanicIds: [] },
    defenderDatacron: { presence: "none", required: false, setIds: [], mechanicIds: [] },
    guidance: {
      opening: [],
      targets: [],
      mechanics: [{ text: "Use the exact sourced undersized composition; do not add a fake third attacker." }],
      avoid: [],
    },
    provenance: {
      sourceName: "Reviewed fixture source",
      sourceRef: "fixture:b03-v2",
      sourceType: "curated",
      sourcePublishedAt: "2026-08-20T00:00:00Z",
      sourceUpdatedAt: "2026-08-20T00:00:00Z",
      capturedAt: "2026-08-21T00:00:00Z",
    },
    validity: {
      validFrom: "2026-08-20T00:00:00Z",
      validUntil: "",
      gameDataVersion: "fixture-current",
      notes: "Fixture only.",
    },
    ...overrides,
  };
}

function candidate({ status = "approved", attackerMembers, recordOverrides = {}, candidateId = "research:queen:bane:3v3" } = {}) {
  return {
    schemaVersion: 1,
    candidateId,
    proposedRecord: strategyRecord(attackerMembers, recordOverrides),
    review: {
      status,
      flags: {
        sourceVerified: true,
        exactCompositionVerified: true,
        baseIdsVerified: true,
        guidanceParaphraseVerified: true,
        datacronScopeVerified: true,
        versionValidityVerified: true,
        copyrightParaphraseReviewed: true,
      },
      blockers: [],
      reviewer: "B03-v2 regression",
      reviewedAt: "2026-08-21T01:00:00Z",
      notes: "",
    },
  };
}

const emptyProduction = {
  schemaVersion: 1,
  generatedAt: null,
  sourcePolicy: "Only reviewed provenance-backed records.",
  records: [],
};

const canonicalCatalog = {
  units: [
    "QUEENAMIDALA",
    "PADAWANOBIWAN",
    "MASTERQUIGON",
    "DARTHBANE",
    "SITHMARAUDER",
    "THIRD_ATTACKER",
  ].map((baseId) => ({ baseId })),
};

test("3v3 tactical records allow truthful undersized attackers without inventing a third unit", () => {
  const result = validateRecord(strategyRecord(["DARTHBANE", "SITHMARAUDER"]));
  assert.equal(result.valid, true);
  assert.deepEqual(result.record.attacker.members, ["DARTHBANE", "SITHMARAUDER"]);
  assert.equal(result.record.attacker.members.length, 2);
});

test("3v3 attacker size remains fail-closed for zero or more than three units", () => {
  const zero = validateRecord(strategyRecord([], {
    attacker: { leaderBaseId: "", members: [] },
  }));
  assert.equal(zero.valid, false);
  assert.ok(zero.errors.includes("invalid-attacker-size"));

  const tooMany = validateRecord(strategyRecord(["DARTHBANE", "SITHMARAUDER", "THIRD_ATTACKER", "FOURTH_ATTACKER"]));
  assert.equal(tooMany.valid, false);
  assert.ok(tooMany.errors.includes("invalid-attacker-size"));
});

test("undersized strategy matching remains exact to the actual two-person attacker composition", () => {
  const record = validateRecord(strategyRecord(["DARTHBANE", "SITHMARAUDER"])).record;
  const context = {
    format: "3v3",
    defenderMembers: ["MASTERQUIGON", "QUEENAMIDALA", "PADAWANOBIWAN"],
    attackerMembers: ["SITHMARAUDER", "DARTHBANE"],
    attackerDatacron: { known: false, state: "unknown", setId: "", mechanicIds: [] },
    defenderDatacron: { known: true, state: "none", setId: "", mechanicIds: [] },
    now: Date.parse("2026-08-21T02:00:00Z"),
  };
  assert.equal(recordMatches(record, context), true);
  assert.equal(recordMatches(record, { ...context, attackerMembers: ["DARTHBANE", "SITHMARAUDER", "THIRD_ATTACKER"] }), false);
  assert.equal(recordMatches(record, { ...context, attackerMembers: ["DARTHBANE"] }), false);
});

test("strategy Base-ID extraction and catalog audit are canonical and deterministic", () => {
  const row = candidate();
  assert.deepEqual(strategyBaseIds(row), [
    "DARTHBANE",
    "MASTERQUIGON",
    "PADAWANOBIWAN",
    "QUEENAMIDALA",
    "SITHMARAUDER",
  ]);
  assert.equal(catalogBaseIdSet(canonicalCatalog).has("DARTHBANE"), true);
  assert.deepEqual(invalidCandidateBaseIds(row, canonicalCatalog), []);
});

test("approved candidate with an unknown Base ID makes catalog-backed promotion audit unsafe", () => {
  const row = candidate({
    attackerMembers: ["DARTHBANE", "NOT_A_CANONICAL_UNIT"],
  });
  const audit = auditSourceCandidates({ schemaVersion: 1, candidates: [row] }, emptyProduction, canonicalCatalog);
  assert.equal(audit.safe, false);
  assert.deepEqual(audit.gameCatalog.approvedInvalidBaseIds, ["NOT_A_CANONICAL_UNIT"]);
  assert.deepEqual(audit.baseIdAudit[0].invalidBaseIds, ["NOT_A_CANONICAL_UNIT"]);
  assert.throws(
    () => buildProductionCatalog({ schemaVersion: 1, candidates: [row] }, emptyProduction, "2026-08-21T03:00:00Z", canonicalCatalog),
    /not safe for promotion/i,
  );
});

test("quarantined unresolved Base IDs are reported but do not contaminate production eligibility", () => {
  const row = candidate({
    status: "quarantined",
    attackerMembers: ["DARTHBANE", "RESEARCH_ID_PENDING_AUDIT"],
  });
  row.review.flags.baseIdsVerified = false;
  row.review.flags.datacronScopeVerified = false;
  row.review.flags.versionValidityVerified = false;
  row.review.blockers = ["base-ids-unverified", "datacron-scope-unverified", "current-version-validity-unverified"];

  const audit = auditSourceCandidates({ schemaVersion: 1, candidates: [row] }, emptyProduction, canonicalCatalog);
  assert.equal(audit.safe, true);
  assert.equal(audit.approved, 0);
  assert.equal(audit.promotionReady, 0);
  assert.deepEqual(audit.gameCatalog.approvedInvalidBaseIds, []);
  assert.deepEqual(audit.baseIdAudit[0].invalidBaseIds, ["RESEARCH_ID_PENDING_AUDIT"]);
});

test("explicit catalog audit fails closed when the supplied canonical catalog is empty", () => {
  const row = candidate();
  const audit = auditSourceCandidates({ schemaVersion: 1, candidates: [row] }, emptyProduction, { units: [] });
  assert.equal(audit.gameCatalog.audited, true);
  assert.equal(audit.gameCatalog.unitCount, 0);
  assert.equal(audit.safe, false);
});

test("fully reviewed canonical undersized candidate remains promotion-ready with catalog audit enabled", () => {
  const row = candidate();
  const audit = auditSourceCandidates({ schemaVersion: 1, candidates: [row] }, emptyProduction, canonicalCatalog);
  assert.equal(audit.safe, true);
  assert.equal(audit.approved, 1);
  assert.equal(audit.promotionReady, 1);
  assert.deepEqual(audit.gameCatalog.approvedInvalidBaseIds, []);
  const built = buildProductionCatalog(
    { schemaVersion: 1, candidates: [row] },
    emptyProduction,
    "2026-08-21T03:00:00Z",
    canonicalCatalog,
  );
  assert.equal(built.records.length, 1);
  assert.deepEqual(built.records[0].attacker.members, ["DARTHBANE", "SITHMARAUDER"]);
});
