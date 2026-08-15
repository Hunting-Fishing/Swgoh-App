import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAdaptiveScales,
  buildDefaultOptimizerTargets,
  defaultPresetForUnit,
  modStatVector,
  optimizeEquippedMods,
} from "../public/mod-optimizer-engine.js";

const slots = [2, 3, 4, 5, 6, 7];

function mod(owner, slot, speed, extra = {}) {
  return {
    id: `${owner}-${slot}-${speed}-${extra.pips || 5}`,
    characterBaseId: owner,
    characterName: owner,
    slot,
    slotName: ({ 2: "Square", 3: "Arrow", 4: "Diamond", 5: "Triangle", 6: "Circle", 7: "Cross" })[slot],
    setName: extra.setName || "Speed",
    setId: "4",
    pips: extra.pips || 5,
    rarity: extra.pips || 5,
    level: 15,
    primaryStat: extra.primaryStat || { unitStatId: 55, name: "Health", displayValue: 5.88, percent: true },
    secondaryStats: speed ? [{ unitStatId: 5, name: "Speed", displayValue: speed, percent: false }] : [],
    speedSecondary: speed,
  };
}

function fullSet(owner, baseSpeed, extra = {}) {
  return slots.map((slot, index) => mod(owner, slot, baseSpeed + index, extra));
}

const liveUnits = [
  { baseId: "A", name: "Alpha", role: "Support", power: 40000, gear: 13, relic: 7 },
  { baseId: "B", name: "Beta", role: "Attacker", power: 35000, gear: 13, relic: 5 },
  { baseId: "C", name: "Gamma", role: "Tank", power: 30000, gear: 13, relic: 3 },
];

test("stat vector and adaptive scales use actual equipped-mod values", () => {
  const sample = mod("A", 2, 25, {
    primaryStat: { unitStatId: 48, name: "Offense", displayValue: 5.88, percent: true },
  });
  const vector = modStatVector(sample);
  assert.equal(vector.speed, 25);
  assert.equal(vector.offensePct, 5.88);
  const scales = buildAdaptiveScales([sample, mod("B", 2, 10)]);
  assert.ok(scales.speed >= 25);
  assert.ok(scales.offensePct >= 5.88);
});

test("higher-priority character receives the best unlocked equipped speed mods first", () => {
  const mods = [...fullSet("A", 5), ...fullSet("B", 20), ...fullSet("C", 10)];
  const plan = optimizeEquippedMods({
    liveUnits,
    mods,
    targets: [
      { baseId: "A", included: true, priority: 1, preset: "Max Speed" },
      { baseId: "B", included: true, priority: 2, preset: "Max Speed" },
    ],
    options: { donorScope: "all", moveMode: "aggressive", candidatesPerSlot: 10, beamWidth: 100 },
  });
  const alpha = plan.assignments.find((entry) => entry.baseId === "A");
  assert.equal(alpha.mods.length, 6);
  assert.ok(alpha.mods.every((entry) => entry.characterBaseId === "B"));
  assert.equal(plan.moves.filter((entry) => entry.toBaseId === "A").length, 6);
});

test("locked characters preserve their loadout and their mods never enter the donor pool", () => {
  const mods = [...fullSet("A", 5), ...fullSet("B", 30)];
  const plan = optimizeEquippedMods({
    liveUnits,
    mods,
    targets: [
      { baseId: "A", included: true, priority: 1, preset: "Max Speed" },
      { baseId: "B", included: true, locked: true, priority: 2, preset: "Max Speed" },
    ],
    options: { donorScope: "all", moveMode: "aggressive" },
  });
  const beta = plan.assignments.find((entry) => entry.baseId === "B");
  const alpha = plan.assignments.find((entry) => entry.baseId === "A");
  assert.equal(beta.locked, true);
  assert.equal(beta.mods.length, 6);
  assert.ok(alpha.mods.every((entry) => entry.characterBaseId === "A"));
  assert.equal(plan.moves.length, 0);
});

test("included-only donor scope prevents stripping a non-selected character", () => {
  const mods = [...fullSet("A", 5), ...fullSet("C", 30)];
  const plan = optimizeEquippedMods({
    liveUnits,
    mods,
    targets: [{ baseId: "A", included: true, priority: 1, preset: "Max Speed" }],
    options: { donorScope: "included", moveMode: "aggressive" },
  });
  const alpha = plan.assignments[0];
  assert.ok(alpha.mods.every((entry) => entry.characterBaseId === "A"));
  assert.equal(plan.moves.length, 0);
});

test("6-dot mods are not proposed onto a character below Gear XII", () => {
  const lowGear = [{ baseId: "A", name: "Alpha", role: "Support", power: 20000, gear: 11, relic: 0 }];
  const mods = [
    ...fullSet("A", 5, { pips: 5 }),
    ...fullSet("B", 30, { pips: 6 }),
  ];
  const plan = optimizeEquippedMods({
    liveUnits: lowGear,
    mods,
    targets: [{ baseId: "A", included: true, priority: 1, preset: "Max Speed" }],
    options: { donorScope: "all", moveMode: "aggressive" },
  });
  assert.equal(plan.assignments[0].mods.length, 6);
  assert.ok(plan.assignments[0].mods.every((entry) => entry.pips < 6));
});

test("role defaults and generated targets create a usable prioritized starting plan", () => {
  assert.equal(defaultPresetForUnit({ role: "Tank" }), "Durable Tank");
  assert.equal(defaultPresetForUnit({ role: "Healer" }), "Durable Healer");
  assert.equal(defaultPresetForUnit({ role: "Support" }), "Fast Support");
  assert.equal(defaultPresetForUnit({ role: "Attacker" }), "Physical Attacker");
  const targets = buildDefaultOptimizerTargets(liveUnits, 2);
  assert.equal(targets.length, 3);
  assert.equal(targets.filter((entry) => entry.included).length, 2);
  assert.deepEqual(targets.filter((entry) => entry.included).map((entry) => entry.baseId), ["A", "B"]);
});
