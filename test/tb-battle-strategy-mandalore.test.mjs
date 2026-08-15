import test from "node:test";
import assert from "node:assert/strict";
import { extractAbilitySemantics } from "../public/kit-semantics.js";
import { mandaloreBattleStrategyForMission } from "../public/tb-battle-strategy-mandalore-data.js";
import { evaluateBattleStrategy } from "../public/tb-battle-strategy.js";

function member(baseId, name, abilities = [], speed = null) {
  const rows = abilities.map((ability) => ({ ...ability, semantics: extractAbilitySemantics(ability) }));
  return {
    baseId,
    name,
    currentSpeed: speed,
    unit: { baseId, name, ...(speed == null ? {} : { speed }) },
    abilities: rows,
    staticUnit: { baseId, name, abilities: rows },
  };
}

function squad(bamSpeed = 310, bkmSpeed = 280) {
  return [
    member("MANDALORBOKATAN", "Bo-Katan (Mand'alor)", [
      { name: "Darksaber Flourish", tier: 8, description: "Inflict Armor Shred and Stun on target enemy." },
      { name: "Reinforcements Have Arrived", tier: 8, description: "Dispel all debuffs on all Light Side Mandalorian allies and call all Light Side Mandalorian allies to assist twice." },
      { name: "Way of the Mandalore", tier: 8, description: "Light Side Mandalorian allies gain Defense, Health and Offense." },
    ], bkmSpeed),
    member("THEMANDALORIANBESKARARMOR", "The Mandalorian (Beskar Armor)", [], bamSpeed),
    member("PAZVIZSLA", "Paz Vizsla", [{ name: "Overheat", description: "Stun target enemy." }], 250),
    member("IG12", "IG-12 & Grogu", [{ name: "Yes. No. Yes. No.", description: "Dispel debuffs on target ally and call another ally to assist." }], 300),
    member("ARMORER", "The Armorer", [], 260),
  ];
}

test("Mandalore BKM pack is registered with current BKM/BAM Base IDs", () => {
  const pack = mandaloreBattleStrategyForMission("mandalore-bkm");
  assert.ok(pack);
  assert.equal(pack.requiredLeaderBaseId, "MANDALORBOKATAN");
  assert.equal(pack.speedOrders[0].fasterBaseId, "THEMANDALORIANBESKARARMOR");
  assert.equal(pack.speedOrders[0].slowerBaseId, "MANDALORBOKATAN");
});

test("Armor Shred is normalized as a first-class debuff", () => {
  const semantics = extractAbilitySemantics({ description: "Inflict Armor Shred and Stun on target enemy." });
  assert.ok(semantics.debuffs.includes("Armor Shred"));
  assert.ok(semantics.debuffs.includes("Stun"));
});

test("BAM-before-BKM speed order is roster-aware and advisory", () => {
  const ready = evaluateBattleStrategy({ missionId: "mandalore-bkm", members: squad(310, 280) });
  const readySpeed = ready.checks.find((check) => check.type === "speed-order");
  assert.equal(readySpeed?.ready, true);
  assert.equal(readySpeed?.fasterSpeed, 310);
  assert.equal(readySpeed?.slowerSpeed, 280);
  assert.equal(ready.blockers.length, 0);

  const reversed = evaluateBattleStrategy({ missionId: "mandalore-bkm", members: squad(280, 310) });
  const reversedSpeed = reversed.checks.find((check) => check.type === "speed-order");
  assert.equal(reversedSpeed?.ready, false);
  assert.equal(reversedSpeed?.required, false);
  assert.equal(reversed.status, "warning");
  assert.equal(reversed.blockers.length, 0);
  assert.equal("winPercent" in reversed, false);
});
