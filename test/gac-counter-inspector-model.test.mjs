import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  abilityConcerns,
  alternateExclusions,
  normalizeIds,
  observedPercent,
  primaryEvidenceMatch,
  primarySourceLabel,
  recoveryAlternates,
  sameComposition,
  unitsForIds,
} from "../public/gac-counter-inspector-model.js";

function unit(baseId, overrides = {}) {
  return {
    baseId,
    name: baseId,
    unitType: "Character",
    stars: 7,
    gear: 13,
    relic: 7,
    power: 32000,
    speed: 300,
    zetas: 1,
    omicrons: 0,
    factions: [overrides.faction || "FactionA"],
    abilities: [
      { id: `${baseId}_basic`, type: "Basic", displayTier: 8, omega: true },
      { id: `${baseId}_unique`, type: "Unique", displayTier: 8, zeta: true },
    ],
    ...overrides,
  };
}

const defense = {
  id: 11,
  leaderBaseId: "DEF_LEAD",
  members: ["DEF_LEAD", "DEF_2", "DEF_3"],
};

function observation(counterPrefix, overrides = {}) {
  return {
    format: "3v3",
    enemyLeaderBaseId: "DEF_LEAD",
    enemyMembers: ["DEF_LEAD", "DEF_2", "DEF_3"],
    counterLeaderBaseId: `${counterPrefix}_LEAD`,
    counterMembers: [`${counterPrefix}_LEAD`, `${counterPrefix}_2`, `${counterPrefix}_3`],
    battles: 6,
    wins: 5,
    holds: 1,
    draws: 0,
    winRate: 5 / 6,
    averageBanners: 60.5,
    confidence: 0.9,
    source: "combined-evidence",
    evidenceSources: ["c3po-gahistory", "verified-owner-war-room"],
    ...overrides,
  };
}

test("primary evidence provenance requires the exact saved defense composition", () => {
  const own = {
    units: [unit("PRIMARY_LEAD"), unit("PRIMARY_2"), unit("PRIMARY_3")],
  };
  const exact = primaryEvidenceMatch(own, defense, { observations: [observation("PRIMARY")] }, ["PRIMARY_3", "PRIMARY_LEAD", "PRIMARY_2"], { size: 3 });
  assert.ok(exact);
  assert.equal(exact.exactTeam, true);
  assert.equal(exact.reliability.label, "Established historical sample");
  assert.equal(primarySourceLabel(exact, null), "EXACT HISTORICAL EVIDENCE");

  const variant = primaryEvidenceMatch(own, defense, { observations: [observation("PRIMARY", {
    enemyMembers: ["DEF_LEAD", "OTHER_2", "OTHER_3"],
  })] }, ["PRIMARY_LEAD", "PRIMARY_2", "PRIMARY_3"], { size: 3 });
  assert.equal(variant, null);
  assert.equal(primarySourceLabel(null, null), "AUTHORITATIVE WAR ROOM ALLOCATION");
});

test("recovery alternate exclusions protect all current GAC commitments plus the primary", () => {
  const excluded = alternateExclusions({
    ownDefenses: [{ members: ["OWN_D1", "OWN_D2", "OWN_D3"] }],
    assignments: [
      { status: "planned", members: ["PLAN_1", "PLAN_2", "PLAN_3"], attemptLog: [] },
      { status: "win", members: ["OLD_PRIMARY"], attemptLog: [{ members: ["USED_1", "USED_2", "USED_3"] }] },
    ],
    cardRecommendations: [
      { defenseId: 11, members: ["PRIMARY_LEAD", "PRIMARY_2", "PRIMARY_3"] },
      { defenseId: 12, members: ["OTHER_REC_1", "OTHER_REC_2", "OTHER_REC_3"] },
    ],
    defenseId: 11,
    primaryIds: ["PRIMARY_LEAD", "PRIMARY_2", "PRIMARY_3"],
  });
  for (const id of [
    "OWN_D1", "OWN_D2", "OWN_D3",
    "PLAN_1", "PLAN_2", "PLAN_3",
    "USED_1", "USED_2", "USED_3",
    "OTHER_REC_1", "OTHER_REC_2", "OTHER_REC_3",
    "PRIMARY_LEAD", "PRIMARY_2", "PRIMARY_3",
  ]) assert.equal(excluded.includes(id), true, id);
  assert.equal(excluded.includes("OLD_PRIMARY"), false);
});

test("recovery alternates are pairwise non-overlapping and avoid protected resources", () => {
  const prefixes = ["PRIMARY", "ALT_A", "ALT_B", "ALT_C", "FILL_1", "FILL_2", "FILL_3"];
  const own = { units: prefixes.flatMap((prefix, index) => [
    unit(`${prefix}_LEAD`, { faction: `Faction${index}` }),
    unit(`${prefix}_2`, { faction: `Faction${index}` }),
    unit(`${prefix}_3`, { faction: `Faction${index}` }),
  ]) };
  const enemyUnits = [
    unit("DEF_LEAD", { faction: "Enemy" }),
    unit("DEF_2", { faction: "Enemy" }),
    unit("DEF_3", { faction: "Enemy" }),
  ];
  const evidence = {
    observations: [
      observation("PRIMARY", { battles: 12, wins: 10, winRate: 10 / 12 }),
      observation("ALT_A", { battles: 8, wins: 6, winRate: 0.75 }),
      observation("ALT_B", { battles: 5, wins: 4, winRate: 0.8 }),
      observation("ALT_C", { battles: 3, wins: 2, winRate: 2 / 3 }),
    ],
  };
  const protectedIds = ["PRIMARY_LEAD", "PRIMARY_2", "PRIMARY_3", "ALT_B_2"];
  const alternates = recoveryAlternates(own, enemyUnits, defense, evidence, {
    size: 3,
    excludeBaseIds: protectedIds,
    limit: 3,
  });
  assert.ok(alternates.length >= 1);
  const used = new Set(protectedIds);
  for (const alternate of alternates) {
    const ids = normalizeIds(alternate.squad);
    assert.equal(ids.length, 3);
    assert.equal(ids.some((id) => used.has(id)), false, `${alternate.key} overlaps protected/previous alternate`);
    for (const id of ids) used.add(id);
  }
  assert.equal(alternates.some((entry) => entry.key.includes("ALT_B")), false);
});

test("ability concerns report only known low-tier purchased ability profiles", () => {
  const concerns = abilityConcerns([
    unit("READY"),
    unit("LOW", {
      abilities: [
        { id: "LOW_basic", type: "Basic", displayTier: 5 },
        { id: "LOW_unique", type: "Unique", displayTier: 8, zeta: true },
      ],
    }),
    unit("UNKNOWN", { abilities: [] }),
  ]);
  assert.equal(concerns.length, 1);
  assert.equal(concerns[0].baseId, "LOW");
  assert.equal(concerns[0].lowTierAbilities, 1);
});

test("roster resolution and composition helpers fail closed on partial current rosters", () => {
  const roster = { units: [unit("A"), unit("B")] };
  assert.deepEqual(unitsForIds(roster, ["A", "B"]).map((entry) => entry.baseId), ["A", "B"]);
  assert.deepEqual(unitsForIds(roster, ["A", "B", "C"]), []);
  assert.equal(sameComposition(["B", "A"], ["A", "B"]), true);
  assert.equal(sameComposition(["A", "B"], ["A", "C"]), false);
  assert.equal(observedPercent(0.756), 75.6);
  assert.equal(observedPercent(null), 0);
});

test("counter inspector is explicitly browser-loaded and contains no persistent mutation method", async () => {
  const entrySource = await readFile(new URL("../public/gac-evidence-war-room.js", import.meta.url), "utf8");
  const inspectorSource = await readFile(new URL("../public/gac-war-room-counter-inspector.js", import.meta.url), "utf8");
  assert.match(entrySource, /import "\.\/gac-war-room-counter-inspector\.js";/);
  assert.doesNotMatch(inspectorSource, /method\s*:\s*["'](?:POST|PUT|PATCH|DELETE)["']/i);
  assert.match(inspectorSource, /Inspector is read-only/);
  assert.match(inspectorSource, /Observed results only · not a predicted win rate/);
  assert.match(inspectorSource, /Readiness is a roster heuristic/);
});
