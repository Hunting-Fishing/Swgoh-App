import test from "node:test";
import assert from "node:assert/strict";
import { JOURNEY_PRESETS, journeyPresetById } from "../public/farm-presets.js";
import { eventProgress, metricReadiness, readinessBand, readinessLabel, requirementProgress } from "../public/journey-progress.js";

const relic7 = { baseId: "A", stars: 7, level: 85, gear: 13, relic: 7 };

test("relic requirement uses stars, level, gear and relic", () => {
  assert.deepEqual(requirementProgress(relic7, { baseId: "A", type: "RELIC", tier: 7 }), {
    percent: 100, complete: true, stars: 7, level: 85, gear: 13, relic: 7,
    requiredStars: 7, requiredLevel: 85, requiredGear: 13, requiredRelic: 7,
  });
});

test("locked required unit is zero percent", () => {
  const result = requirementProgress(null, { baseId: "A", type: "RELIC", tier: 5 });
  assert.equal(result.percent, 0);
  assert.equal(result.complete, false);
});

test("star-only ship requirement does not invent gear or relic gates", () => {
  const result = requirementProgress({ baseId: "SHIP", stars: 5, level: 1 }, { baseId: "SHIP", type: "STAR", tier: 5 });
  assert.equal(result.percent, 100);
  assert.equal(result.complete, true);
  assert.equal(result.requiredGear, 0);
  assert.equal(result.requiredRelic, 0);
});

test("event progress averages requirement-specific progress", () => {
  const live = new Map([["A", relic7], ["B", { baseId: "B", stars: 4 }]]);
  const result = eventProgress([
    { baseId: "A", type: "RELIC", tier: 7 },
    { baseId: "B", type: "STAR", tier: 7 },
  ], live);
  assert.equal(result.completeCount, 1);
  assert.equal(result.total, 2);
  assert.equal(result.percent, 79);
});

test("readiness bands map to red orange yellow green states", () => {
  assert.equal(readinessBand(25), "far");
  assert.equal(readinessBand(55), "building");
  assert.equal(readinessBand(85), "close");
  assert.equal(readinessBand(100), "ready");
  assert.equal(readinessLabel(0, false, false), "Missing");
  assert.equal(readinessLabel(85, false, true), "Close");
  assert.equal(metricReadiness(7, 9), "building");
  assert.equal(metricReadiness(8, 9), "close");
  assert.equal(metricReadiness(9, 9), "ready");
});

test("journey preset IDs are unique and requirements are normalized", () => {
  assert.equal(new Set(JOURNEY_PRESETS.map((event) => event.id)).size, JOURNEY_PRESETS.length);
  assert.ok(JOURNEY_PRESETS.length >= 20);
  for (const event of JOURNEY_PRESETS) {
    assert.ok(event.id);
    assert.ok(event.name);
    assert.ok(event.targetBaseId);
    assert.ok(event.requirements.length > 0);
    for (const requirement of event.requirements) {
      assert.ok(requirement.baseId);
      assert.ok(["STAR", "GEAR", "RELIC"].includes(requirement.type));
      assert.ok(Number(requirement.tier) > 0);
    }
  }
});

test("GL Ahsoka preset contains all sixteen verified requirements", () => {
  const ahsoka = journeyPresetById("JOURNEY_GLAHSOKATANO");
  assert.ok(ahsoka);
  assert.equal(ahsoka.targetBaseId, "GLAHSOKATANO");
  assert.equal(ahsoka.requirements.length, 16);
  assert.deepEqual(ahsoka.requirements.find((requirement) => requirement.baseId === "AHSOKATANO"), { baseId: "AHSOKATANO", type: "RELIC", tier: 9 });
  assert.deepEqual(ahsoka.requirements.find((requirement) => requirement.baseId === "JEDISTARFIGHTERAHSOKATANO"), { baseId: "JEDISTARFIGHTERAHSOKATANO", type: "STAR", tier: 7 });
});

test("Pirate King Hondo preset contains all sixteen verified requirements", () => {
  const hondo = journeyPresetById("JOURNEY_GLHONDO");
  assert.ok(hondo);
  assert.equal(hondo.targetBaseId, "GLHONDO");
  assert.equal(hondo.requirements.length, 16);
  assert.deepEqual(hondo.requirements.find((requirement) => requirement.baseId === "HONDO"), { baseId: "HONDO", type: "RELIC", tier: 9 });
  assert.deepEqual(hondo.requirements.find((requirement) => requirement.baseId === "MILLENNIUMFALCONEP7"), { baseId: "MILLENNIUMFALCONEP7", type: "STAR", tier: 7 });
});

test("Bo-Katan Mand'alor preset uses the four R7 prerequisites", () => {
  const bokatan = journeyPresetById("JOURNEY_BOKATANMANDALOR");
  assert.equal(bokatan.targetBaseId, "MANDALORBOKATAN");
  assert.deepEqual(bokatan.requirements.map((requirement) => [requirement.baseId, requirement.tier]), [
    ["THEMANDALORIANBESKARARMOR", 7], ["KELLERANBEQ", 7], ["IG12", 7], ["PAZVIZSLA", 7],
  ]);
});

test("Baylan Skoll preset uses the five R7 Epic Confrontation prerequisites", () => {
  const baylan = journeyPresetById("JOURNEY_BAYLANSKOLL");
  assert.equal(baylan.targetBaseId, "BAYLANSKOLL");
  assert.equal(baylan.requirements.length, 5);
  assert.ok(baylan.requirements.every((requirement) => requirement.type === "RELIC" && requirement.tier === 7));
  assert.deepEqual(baylan.requirements.map((requirement) => requirement.baseId), ["GRANDADMIRALTHRAWN", "GREATMOTHERS", "MARROK", "MORGANELSBETH", "SHINHATI"]);
});

test("Jar Jar preset uses the four R5 Gungan prerequisites", () => {
  const jarjar = journeyPresetById("JOURNEY_JARJARBINKS");
  assert.equal(jarjar.targetBaseId, "JARJARBINKS");
  assert.deepEqual(jarjar.requirements.map((requirement) => [requirement.baseId, requirement.tier]), [
    ["BOSSNASS", 5], ["CAPTAINTARPALS", 5], ["BOOMADIER", 5], ["GUNGANPHALANX", 5],
  ]);
});

test("Jabba preset contains the 7-star Outrider gate and relic requirements", () => {
  const jabba = journeyPresetById("JOURNEY_JABBATHEHUTT");
  assert.ok(jabba);
  assert.deepEqual(jabba.requirements.find((requirement) => requirement.baseId === "OUTRIDER"), {
    baseId: "OUTRIDER", type: "STAR", tier: 7,
  });
  assert.deepEqual(jabba.requirements.find((requirement) => requirement.baseId === "HANSOLO"), {
    baseId: "HANSOLO", type: "RELIC", tier: 8,
  });
});
