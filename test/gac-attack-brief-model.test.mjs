import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  buildAttackBrief,
  matchupDelta,
  normalizeSourcedExecutionGuidance,
  primarySource,
} from "../public/gac-attack-brief-model.js";

function unit(baseId, overrides = {}) {
  return {
    baseId,
    relic: 7,
    zetas: 2,
    omicrons: 0,
    speed: 300,
    ...overrides,
  };
}

test("matchup delta preserves unresolved roster evidence instead of coercing it to zero", () => {
  const attackers = [unit("A", { speed: null }), unit("B", { relic: null, speed: null })];
  const defenders = [unit("D1", { speed: 310 }), unit("D2", { speed: 280 })];
  const delta = matchupDelta(attackers, defenders, { attackerScore: null, defenderScore: 90 });
  assert.equal(delta.known, true);
  assert.equal(delta.relicDelta, null);
  assert.equal(delta.speedDelta, null);
  assert.equal(delta.abilityDelta, null);
});

test("known risks expose roster disadvantages without claiming battle outcome", () => {
  const delta = matchupDelta(
    [unit("A", { speed: 280, omicrons: 0 }), unit("B", { speed: 270, omicrons: 0 })],
    [unit("D1", { speed: 315, omicrons: 1 }), unit("D2", { speed: 290, omicrons: 0 })],
    { attackerScore: 80, defenderScore: 92 },
  );
  const brief = buildAttackBrief({
    delta,
    heuristicMatch: { confidence: "MEDIUM", score: 70 },
    abilityConcerns: [{ name: "A", lowTierAbilities: 1 }],
    datacron: { selected: false },
  });
  const codes = brief.risks.map((entry) => entry.code);
  assert.ok(codes.includes("speed-disadvantage"));
  assert.ok(codes.includes("omicron-count-disadvantage"));
  assert.ok(codes.includes("ability-readiness-disadvantage"));
  assert.ok(codes.includes("low-tier-ability-concerns"));
  assert.equal(brief.source, "ROSTER-FIT HEURISTIC");
  assert.match(brief.truthBoundary, /not predicted win probability/i);
});

test("execution guidance fails closed unless strategy provenance and content both exist", () => {
  const missingSource = normalizeSourcedExecutionGuidance({ opening: ["Use Special 1"] });
  assert.equal(missingSource.available, false);
  assert.match(missingSource.reason, /withheld/i);

  const sourced = normalizeSourcedExecutionGuidance({
    sourceName: "Curated strategy source",
    sourceRef: "strategy-record:123",
    sourceUpdatedAt: "2026-08-20",
    opening: ["Use the sourced opener"],
    targets: [{ text: "Focus the sourced priority target", note: "Only for this exact record" }],
  });
  assert.equal(sourced.available, true);
  assert.equal(sourced.opening.length, 1);
  assert.equal(sourced.targets.length, 1);
});

test("historical source label requires automatic/actionable evidence reliability", () => {
  assert.equal(primarySource({ reliability: { automatic: false } }, null), "AUTHORITATIVE WAR ROOM ALLOCATION");
  assert.equal(primarySource({ reliability: { automatic: true } }, null), "EXACT HISTORICAL EVIDENCE");
});

test("partial Datacron ability coverage is reported as evidence, not a power multiplier", () => {
  const brief = buildAttackBrief({
    delta: { speedDelta: 5, relicDelta: 2, omicronDelta: 0, abilityDelta: 1 },
    datacron: { selected: true, coverage: { known: true, eligibleMembers: 2, squadSize: 3 } },
  });
  assert.ok(brief.risks.some((entry) => entry.code === "datacron-partial-ability-coverage"));
  assert.match(brief.risks.find((entry) => entry.code === "datacron-partial-ability-coverage").detail, /not an overall Datacron value score/i);
});

test("Attack Brief browser layer is read-only, source-gated and lazy-activated", async () => {
  const controller = await readFile(new URL("../public/gac-war-room-attack-brief.js", import.meta.url), "utf8");
  const activation = await readFile(new URL("../public/gac-war-room-matchup-deltas.js", import.meta.url), "utf8");
  assert.doesNotMatch(controller, /method\s*:\s*["'](?:POST|PUT|PATCH|DELETE)["']/i);
  assert.match(controller, /SOURCE-GATED EXECUTION/);
  assert.match(controller, /will not invent an opening ability, first target, kill order, or turn sequence/);
  assert.match(activation, /import\("\.\/gac-war-room-attack-brief\.js"\)/);
  assert.doesNotMatch(activation, /^import\s+["']\.\/gac-war-room-attack-brief\.js["'];/m);
});
