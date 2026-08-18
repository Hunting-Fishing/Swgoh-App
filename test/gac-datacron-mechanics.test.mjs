import test from "node:test";
import assert from "node:assert/strict";
import {
  aggregateDatacronMechanics,
  parseAffixMechanics,
  parseMechanics,
} from "../public/gac-datacron-mechanics.js";

test("mechanics parser extracts traceable signals and keeps the CG sentence as evidence", () => {
  const parsed = parseMechanics("At the start of battle, Sith allies gain 20% Speed and 30% Offense. The first time an ally is defeated, revive them with 50% Health.");
  const ids = parsed.signals.map((signal) => signal.id);
  assert.equal(parsed.known, true);
  assert.ok(ids.includes("start-of-battle"));
  assert.ok(ids.includes("speed"));
  assert.ok(ids.includes("offense"));
  assert.ok(ids.includes("first-time-trigger"));
  assert.ok(ids.includes("revive"));
  assert.ok(ids.includes("health-recovery") === false);
  assert.deepEqual(parsed.percentages.map((entry) => entry.value), [20, 30, 50]);
  const revive = parsed.signals.find((signal) => signal.id === "revive");
  assert.match(revive.sentence, /revive them with 50% Health/i);
});

test("turn meter, cooldown and recovery signals are identified without assigning strength", () => {
  const parsed = parseMechanics("Whenever an ally gains a buff, they gain 10% Turn Meter and reduce their cooldowns by 1. At the end of their turn, they recover 15% Protection.");
  const ids = parsed.signals.map((signal) => signal.id);
  assert.ok(ids.includes("whenever-trigger"));
  assert.ok(ids.includes("turn-meter"));
  assert.ok(ids.includes("cooldown"));
  assert.ok(ids.includes("end-of-turn"));
  assert.ok(ids.includes("protection-recovery"));
  assert.equal(Object.hasOwn(parsed, "score"), false);
});

test("empty or unresolved ability text remains unknown", () => {
  const parsed = parseMechanics("");
  assert.equal(parsed.known, false);
  assert.deepEqual(parsed.signals, []);

  const affix = parseAffixMechanics({ abilityId: "RAW_ID", abilityTextResolved: false });
  assert.equal(affix.known, false);
  assert.equal(affix.abilityId, "RAW_ID");
});

test("datacron aggregation de-duplicates mechanics while retaining source ability evidence", () => {
  const result = aggregateDatacronMechanics({
    affixes: [
      {
        abilityId: "A1",
        abilityName: "Momentum",
        abilityDescription: "At the start of battle, allies gain 20% Speed and 25% Offense.",
        abilityTextResolved: true,
      },
      {
        abilityId: "A2",
        abilityName: "Second Wind",
        abilityDescription: "The first time an ally is defeated, revive them with 50% Health. They also gain 10% Speed.",
        abilityTextResolved: true,
      },
    ],
  });
  assert.equal(result.known, true);
  assert.equal(result.abilitiesResolved, 2);
  assert.equal(result.signals.filter((signal) => signal.id === "speed").length, 1);
  const revive = result.signals.find((signal) => signal.id === "revive");
  assert.equal(revive.abilityId, "A2");
  assert.equal(revive.abilityName, "Second Wind");
});
