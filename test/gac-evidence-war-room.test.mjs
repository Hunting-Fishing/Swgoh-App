import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  batchEvidenceKey,
  consumedBaseIds,
  defenseReservedIds,
  evidenceMapFromBatch,
  evidencePercent,
  expectedPayload,
  openDefenseEntries,
} from "../public/gac-evidence-war-room.js";

const defenses = [
  { id: 11, leaderBaseId: "DEF_A", members: ["DEF_A", "A2", "A3"] },
  { id: 12, leaderBaseId: "DEF_B", members: ["DEF_B", "B2", "B3"] },
  { id: 13, leaderBaseId: "DEF_C", members: ["DEF_C", "C2", "C3"] },
];

test("open defense filtering excludes locked, attempted, and cleared rows but keeps loss/replan rows", () => {
  const assignments = [
    { defenseId: 11, status: "planned" },
    { defenseId: 12, status: "win" },
    { defenseId: 13, status: "loss" },
  ];
  const open = openDefenseEntries(defenses, assignments);
  assert.deepEqual(open.map((entry) => entry.defenseId), [13]);
});

test("batch evidence key deduplicates visible open leader IDs and uses current GAC format", () => {
  const batch = batchEvidenceKey(3, [defenses[0], defenses[0], defenses[1]], [{ defenseId: 12, status: "win" }]);
  assert.equal(batch.format, "3v3");
  assert.deepEqual(batch.leaders, ["DEF_A"]);
  assert.equal(batch.key, "3v3|DEF_A");
});

test("battle attempts and active plans are both unavailable to evidence and fallback planners", () => {
  const ids = consumedBaseIds([
    {
      defenseId: 11,
      status: "planned",
      members: ["A", "B", "C"],
      attemptLog: [{ status: "loss", members: ["D", "E", "F"] }],
    },
    {
      defenseId: 12,
      status: "win",
      members: ["G", "H", "I"],
      attemptLog: [{ status: "win", members: ["G", "H", "I"] }],
    },
  ]);
  assert.deepEqual(new Set(ids), new Set(["A", "B", "C", "D", "E", "F", "G", "H", "I"]));
});

test("own defense reservation is deduplicated before counter allocation", () => {
  assert.deepEqual(new Set(defenseReservedIds([
    { members: ["A", "B", "C"] },
    { members: ["C", "D", "E"] },
  ])), new Set(["A", "B", "C", "D", "E"]));
});

test("batch API response becomes a leader-indexed evidence map", () => {
  const map = evidenceMapFromBatch({
    results: [
      { enemyLeaderBaseId: "def_a", observations: [{ battles: 4 }] },
      { enemyLeaderBaseId: "DEF_B", observations: [{ battles: 9 }] },
    ],
  });
  assert.equal(map.size, 2);
  assert.equal(map.get("DEF_A").observations[0].battles, 4);
  assert.equal(map.get("DEF_B").observations[0].battles, 9);
});

test("authoritative lock payload is derived only from the chosen squad and owned datacron coverage", () => {
  const recommendation = {
    squad: [{ baseId: "LEAD" }, { baseId: "TWO" }, { baseId: "THREE" }],
  };
  const coverage = { datacron: { id: "OWN-DC-9" } };
  assert.deepEqual(expectedPayload(recommendation, coverage), {
    members: "LEAD,TWO,THREE",
    leader: "LEAD",
    datacronId: "OWN-DC-9",
  });
});

test("displayed evidence percentage is bounded and labeled as observed data", () => {
  assert.equal(evidencePercent(0.81234), 81.2);
  assert.equal(evidencePercent(2), 100);
  assert.equal(evidencePercent(-1), 0);
  assert.equal(evidencePercent("bad"), 0);
});

test("the loaded GAC browser entrypoint mounts the evidence-first War Room planner", async () => {
  const source = await readFile(new URL("../public/gac-datacron-counter-eligibility.js", import.meta.url), "utf8");
  assert.match(source, /import\s+["']\.\/gac-evidence-war-room\.js["'];/);
});
