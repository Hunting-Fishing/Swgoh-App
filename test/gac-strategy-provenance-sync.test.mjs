import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { buildProvenanceIndex } from "../gac-strategy-provenance-index.mjs";

async function readJson(url) {
  return JSON.parse(await readFile(url, "utf8"));
}

test("runtime-safe provenance index is deterministic and in sync with the research candidate catalog", async () => {
  const candidates = await readJson(new URL("../public/data/gac-strategy-source-candidates.json", import.meta.url));
  const index = await readJson(new URL("../public/data/gac-strategy-provenance-index.json", import.meta.url));
  const generated = buildProvenanceIndex(candidates);

  assert.deepEqual(index, generated);
  assert.equal(index.generatedAt, candidates.generatedAt);
});

test("sanitized provenance index contains no execution instruction fields", async () => {
  const index = await readJson(new URL("../public/data/gac-strategy-provenance-index.json", import.meta.url));
  const serialized = JSON.stringify(index);
  for (const key of ["guidance", "opening", "targets", "mechanics", "avoid"]) {
    assert.equal(serialized.includes(`\"${key}\"`), false, `runtime provenance leaked ${key}`);
  }
});

test("War Room provenance reflects refreshed Mace review blockers without unlocking execution", async () => {
  const index = await readJson(new URL("../public/data/gac-strategy-provenance-index.json", import.meta.url));
  const row = index.entries.find((entry) => entry.candidateId === "research:jmmw-aayla-depa:traya-nihilus-savage:3v3:2026-01");

  assert.ok(row);
  assert.equal(row.review.status, "quarantined");
  assert.equal(row.review.promotionReady, false);
  assert.equal(row.review.flags.baseIdsVerified, true);
  assert.equal(row.review.flags.guidanceParaphraseVerified, false);
  assert.equal(row.review.flags.datacronScopeVerified, false);
  assert.equal(row.review.flags.versionValidityVerified, false);
  assert.deepEqual(row.review.blockers, [
    "guidance-sequence-missing",
    "datacron-scope-unverified",
    "current-version-validity-unverified",
  ]);
  assert.ok(row.research.validationRefs.some((ref) => ref.kind === "recent-tactical-context" && /swgoh\.tv\/video\/48466/.test(ref.sourceRef)));
  assert.equal(row.research.validationRefs.filter((ref) => ref.kind === "canonical-unit-id").length, 6);
});
