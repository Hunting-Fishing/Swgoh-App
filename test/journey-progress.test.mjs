import test from "node:test";
import assert from "node:assert/strict";
import { JOURNEY_PRESETS, journeyPresetById } from "../public/farm-presets.js";
import { eventProgress, requirementProgress } from "../public/journey-progress.js";

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

test("journey preset IDs are unique and requirements are normalized", () => {
  assert.equal(new Set(JOURNEY_PRESETS.map((event) => event.id)).size, JOURNEY_PRESETS.length);
  assert.ok(JOURNEY_PRESETS.length >= 15);
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
