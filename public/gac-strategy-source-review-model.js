import { validateRecord } from "./gac-strategy-record-model.js";

const REVIEW_STATUSES = new Set(["pending", "quarantined", "approved", "rejected"]);
const REQUIRED_REVIEW_FLAGS = Object.freeze([
  "sourceVerified",
  "exactCompositionVerified",
  "baseIdsVerified",
  "guidanceParaphraseVerified",
  "datacronScopeVerified",
  "versionValidityVerified",
  "copyrightParaphraseReviewed",
]);

function clean(value) { return String(value ?? "").trim(); }
function bool(value) { return value === true; }
function uniqueStrings(values = []) {
  return Object.freeze([...new Set((Array.isArray(values) ? values : []).map(clean).filter(Boolean))]);
}
function normalizedReview(value = {}) {
  const flags = Object.freeze(Object.fromEntries(REQUIRED_REVIEW_FLAGS.map((key) => [key, bool(value?.flags?.[key])])));
  return Object.freeze({
    status: clean(value.status).toLowerCase(),
    flags,
    blockers: uniqueStrings(value.blockers),
    reviewer: clean(value.reviewer),
    reviewedAt: clean(value.reviewedAt),
    notes: clean(value.notes),
  });
}
function normalizeCandidate(value = {}) {
  return Object.freeze({
    schemaVersion: Number(value.schemaVersion || 0),
    candidateId: clean(value.candidateId),
    proposedRecord: value.proposedRecord && typeof value.proposedRecord === "object" ? value.proposedRecord : {},
    review: normalizedReview(value.review),
    research: Object.freeze({
      discoveredAt: clean(value?.research?.discoveredAt),
      sourceSnapshotDate: clean(value?.research?.sourceSnapshotDate),
      sourceNotes: clean(value?.research?.sourceNotes),
    }),
  });
}
function reviewBlockers(candidateInput = {}) {
  const candidate = normalizeCandidate(candidateInput);
  const blockers = new Set(candidate.review.blockers);
  if (candidate.schemaVersion !== 1) blockers.add("unsupported-candidate-schema");
  if (!candidate.candidateId) blockers.add("missing-candidate-id");
  if (!REVIEW_STATUSES.has(candidate.review.status)) blockers.add("invalid-review-status");
  for (const flag of REQUIRED_REVIEW_FLAGS) {
    if (!candidate.review.flags[flag]) blockers.add(`review:${flag}`);
  }
  const runtime = validateRecord(candidate.proposedRecord);
  if (!runtime.valid) {
    for (const error of runtime.errors) blockers.add(`record:${error}`);
  }
  if (candidate.review.status !== "approved") blockers.add("review:not-approved");
  return Object.freeze([...blockers].sort());
}
function promotionReady(candidateInput = {}) {
  return reviewBlockers(candidateInput).length === 0;
}
function promoteCandidate(candidateInput = {}) {
  const candidate = normalizeCandidate(candidateInput);
  const blockers = reviewBlockers(candidate);
  if (blockers.length) {
    const error = new Error(`Strategy candidate is not promotion-ready: ${blockers.join(", ")}`);
    error.code = "GAC_STRATEGY_REVIEW_BLOCKED";
    error.blockers = blockers;
    throw error;
  }
  return validateRecord(candidate.proposedRecord).record;
}
function candidateSummary(candidateInput = {}) {
  const candidate = normalizeCandidate(candidateInput);
  const blockers = reviewBlockers(candidate);
  return Object.freeze({
    candidateId: candidate.candidateId,
    status: candidate.review.status,
    promotionReady: blockers.length === 0,
    blockers,
    sourceName: clean(candidate.proposedRecord?.provenance?.sourceName),
    sourceRef: clean(candidate.proposedRecord?.provenance?.sourceRef),
    format: clean(candidate.proposedRecord?.format),
  });
}

export {
  REQUIRED_REVIEW_FLAGS,
  REVIEW_STATUSES,
  candidateSummary,
  normalizeCandidate,
  promoteCandidate,
  promotionReady,
  reviewBlockers,
};
