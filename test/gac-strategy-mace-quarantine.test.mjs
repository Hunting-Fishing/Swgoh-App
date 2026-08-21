import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { promotionReady } from "../public/gac-strategy-source-review-model.js";

async function readJson(url) {
  return JSON.parse(await readFile(url, "utf8"));
}

const candidateId = "research:jmmw-aayla-depa:traya-nihilus-savage:3v3:2026-01";

test("Mace 3v3 research clears identity review while remaining execution-quarantined", async () => {
  const body = await readJson(new URL("../public/data/gac-strategy-source-candidates.json", import.meta.url));
  const row = body.candidates.find((candidate) => candidate.candidateId === candidateId);
  assert.ok(row, "expected refreshed Mace tactical candidate");

  assert.equal(row.review.status, "quarantined");
  assert.equal(row.review.flags.sourceVerified, true);
  assert.equal(row.review.flags.exactCompositionVerified, true);
  assert.equal(row.review.flags.baseIdsVerified, true);
  assert.equal(row.review.flags.guidanceParaphraseVerified, false);
  assert.equal(row.review.flags.datacronScopeVerified, false);
  assert.equal(row.review.flags.versionValidityVerified, false);
  assert.deepEqual(row.review.blockers, [
    "guidance-sequence-missing",
    "datacron-scope-unverified",
    "current-version-validity-unverified",
  ]);
  assert.equal(promotionReady(row), false);
});

test("Mace candidate preserves exact historical composition without manufacturing current guidance", async () => {
  const body = await readJson(new URL("../public/data/gac-strategy-source-candidates.json", import.meta.url));
  const row = body.candidates.find((candidate) => candidate.candidateId === candidateId);

  assert.deepEqual(row.proposedRecord.defender.members, [
    "JEDIMASTERMACEWINDU",
    "AAYLASECURA",
    "DEPABILLABA",
  ]);
  assert.deepEqual(row.proposedRecord.attacker.members, [
    "DARTHTRAYA",
    "DARTHNIHILUS",
    "SAVAGEOPRESS",
  ]);
  assert.deepEqual(row.proposedRecord.guidance, {
    opening: [],
    targets: [],
    mechanics: [],
    avoid: [],
  });
});

test("recent Mace evidence is explicitly context-only and all six Base IDs have current unit references", async () => {
  const body = await readJson(new URL("../public/data/gac-strategy-source-candidates.json", import.meta.url));
  const row = body.candidates.find((candidate) => candidate.candidateId === candidateId);
  const refs = row.research.validationRefs;
  const tactical = refs.find((ref) => ref.kind === "recent-tactical-context");
  const ids = refs.filter((ref) => ref.kind === "canonical-unit-id");

  assert.ok(tactical);
  assert.match(tactical.sourceRef, /swgoh\.tv\/video\/48466/);
  assert.match(tactical.note, /context only/i);
  assert.doesNotMatch(tactical.note, /proves? (?:the )?(?:opening|sequence|kill order)/i);
  assert.equal(ids.length, 6);
  assert.match(row.review.notes, /does not expose a reviewable move sequence/i);
  assert.match(row.research.sourceNotes, /does not prove the exact defender teammate composition/i);
});

test("production tactical catalog remains empty while Mace execution is quarantined", async () => {
  const production = await readJson(new URL("../public/data/gac-strategy-records.json", import.meta.url));
  assert.deepEqual(production.records, []);
});
