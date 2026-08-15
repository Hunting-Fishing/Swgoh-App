import test from "node:test";
import assert from "node:assert/strict";
import { classifyAbilityType, enrichCatalogWithKitSemantics, extractAbilitySemantics, summarizeUnitKit } from "../public/kit-semantics.js";

test("classifies common SWGOH ability slots", () => {
  assert.equal(classifyAbilityType("Basic", "basic_test"), "basic");
  assert.equal(classifyAbilityType("Leader", "leader_test"), "leader");
  assert.equal(classifyAbilityType("Passive", "unique_test"), "unique");
  assert.equal(classifyAbilityType("Special", "special_test"), "special");
});

test("extracts explicit combat mechanics without inventing hidden effects", () => {
  const semantics = extractAbilitySemantics({
    id: "special_test",
    type: "Special",
    description: "Dispel all buffs on target enemy, inflict Stun for 1 turn, and remove 50% Turn Meter. Call target ally to assist. This attack can't be evaded.",
  });
  assert.ok(semantics.mechanicKinds.includes("dispel_enemy"));
  assert.ok(semantics.mechanicKinds.includes("debuff"));
  assert.ok(semantics.mechanicKinds.includes("turn_meter_remove"));
  assert.ok(semantics.mechanicKinds.includes("assist"));
  assert.ok(semantics.mechanicKinds.includes("cannot_evade"));
  assert.deepEqual(semantics.debuffs, ["Stun"]);
  assert.ok(!semantics.mechanicKinds.includes("revive"));
  assert.ok(!semantics.mechanicKinds.includes("instakill"));
});

test("tracks revive, cooldown and summon mechanics separately", () => {
  const semantics = extractAbilitySemantics({
    description: "Revive a defeated ally at 50% Health. Reduce this ability's cooldown by 1. Summon a Droid ally if the ally slot is available.",
  });
  assert.ok(semantics.mechanicKinds.includes("revive"));
  assert.ok(semantics.mechanicKinds.includes("cooldown_reduce"));
  assert.ok(semantics.mechanicKinds.includes("summon"));
});

test("preserves upgrade metadata and omicron mode", () => {
  const semantics = extractAbilitySemantics({ zeta: true, omega: true, omicron: true, omicronMode: 7, description: "All allies gain Defense Up." });
  assert.equal(semantics.zeta, true);
  assert.equal(semantics.omega, true);
  assert.equal(semantics.omicron, true);
  assert.equal(semantics.omicronMode, 7);
});

test("summarizes unit-wide kit capabilities", () => {
  const unit = {
    baseId: "TEST",
    name: "Test Unit",
    unitType: "Character",
    abilities: [
      { id: "leader_test", type: "Leader", zeta: true, description: "All allies gain Speed Up." },
      { id: "special_test", type: "Special", description: "Remove 100% Turn Meter from target enemy and call an ally to assist." },
      { id: "unique_test", type: "Unique", omicron: true, description: "Revive this unit with 50% Health." },
    ],
  };
  const kit = summarizeUnitKit(unit);
  assert.equal(kit.hasLeader, true);
  assert.equal(kit.hasRevive, true);
  assert.equal(kit.hasTurnMeterControl, true);
  assert.equal(kit.hasAssist, true);
  assert.equal(kit.zetaAbilityCount, 1);
  assert.equal(kit.omicronAbilityCount, 1);
});

test("enriches the catalog without changing unit identity", () => {
  const catalog = { gameVersion: "test", units: [{ baseId: "A", name: "A", abilities: [{ id: "basic_a", type: "Basic", description: "Deal damage and inflict Daze." }] }] };
  const enriched = enrichCatalogWithKitSemantics(catalog);
  assert.equal(enriched.kitSchemaVersion, 1);
  assert.equal(enriched.units[0].baseId, "A");
  assert.ok(enriched.units[0].abilities[0].semantics.mechanicKinds.includes("debuff"));
  assert.deepEqual(enriched.units[0].abilities[0].semantics.debuffs, ["Daze"]);
});
