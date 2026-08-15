import assert from "node:assert/strict";
import { ROTE_MISSIONS_BY_PLANET } from "../public/rote-mission-data.js";
import { normalizeRoteMissions } from "../public/rote-mission-overrides.js";
import { extractAbilitySemantics } from "../public/kit-semantics.js";
import { rosterUnitMeetsEntry } from "../public/tb-mission-intelligence.js";
import { mandaloreBattleStrategyForMission } from "../public/tb-battle-strategy-mandalore-data.js";
import { evaluateBattleStrategy } from "../public/tb-battle-strategy.js";

function member(baseId, name, abilities = []) {
  const rows = abilities.map((ability) => ({ ...ability, semantics: extractAbilitySemantics(ability) }));
  return {
    baseId,
    name,
    unit: { baseId, name },
    abilities: rows,
    staticUnit: { baseId, name, abilities: rows },
  };
}

const missions = normalizeRoteMissions(Object.values(ROTE_MISSIONS_BY_PLANET).flat());
const unlock = missions.find((mission) => mission.id === "tatooine-mandalore-unlock");
assert.ok(unlock, "Tatooine Mandalore unlock mission missing");
assert.equal(unlock.entry.verified, true);
assert.equal(unlock.entry.squadSize, 3, "Krayt unlock must be modeled as a three-unit mission");
assert.equal(unlock.entry.relicMin, 7);
assert.deepEqual(unlock.entry.requiredCategories, ["Mandalorian"]);
assert.deepEqual(unlock.entry.mandatoryMembers.map((row) => row.baseId), ["MANDALORBOKATAN", "THEMANDALORIANBESKARARMOR"]);
assert.equal(unlock.recommendations.length, 1, "Unlock mission should expose one conservative community reference core");
assert.deepEqual(unlock.recommendations[0].members.map((row) => row.baseId), ["MANDALORBOKATAN", "THEMANDALORIANBESKARARMOR", "IG12"]);

const paz = { baseId: "PAZVIZSLA", name: "Paz Vizsla", unitType: "Character", stars: 7, relic: 7, alignment: "Light", factions: ["Mandalorian"], categories: ["Mandalorian"] };
const outsider = { baseId: "NOTMANDALORIAN", name: "Not Mandalorian", unitType: "Character", stars: 7, relic: 9, alignment: "Light", factions: ["Jedi"], categories: ["Jedi"] };
assert.equal(rosterUnitMeetsEntry(paz, unlock), true, "Any R7 Mandalorian must remain legal as the third slot");
assert.equal(rosterUnitMeetsEntry(outsider, unlock), false, "Non-Mandalorian third slot must remain illegal");

const pack = mandaloreBattleStrategyForMission("tatooine-mandalore-unlock");
assert.ok(pack, "Krayt Dragon strategy pack missing");
assert.equal(pack.requiredLeaderBaseId, "MANDALORBOKATAN");
assert.ok(pack.sources.some((source) => source.kind === "official"), "Krayt pack needs official entry evidence");
assert.ok(pack.sources.some((source) => source.kind === "community-tested"), "Krayt pack needs community battle evidence");

const analysis = evaluateBattleStrategy({
  missionId: "tatooine-mandalore-unlock",
  members: [
    member("MANDALORBOKATAN", "Bo-Katan (Mand'alor)", [
      { name: "Darksaber Flourish", tier: 8, description: "Inflict Armor Shred and Stun on target enemy." },
      { name: "Reinforcements Have Arrived", tier: 8, description: "Dispel all debuffs on all Light Side Mandalorian allies and call all Light Side Mandalorian allies to assist twice." },
      { name: "Way of the Mandalore", tier: 8, description: "Light Side Mandalorian allies gain Defense and Offense." },
    ]),
    member("THEMANDALORIANBESKARARMOR", "The Mandalorian (Beskar Armor)", [{ name: "Basic", description: "Deal Physical damage to target enemy." }]),
    member("IG12", "IG-12 & Grogu", [{ name: "No. No. No.", description: "Heal target ally and call another Light Side Mandalorian ally to assist." }]),
  ],
});
assert.equal(analysis.status, "ready", "BKM/BAM/IG-12 reference core should satisfy sourced Krayt preflight");
assert.equal(analysis.blockers.length, 0);
assert.ok(analysis.checks.some((check) => check.id === "armor_shred" && check.ready), "Armor Shred preflight missing");
assert.ok(analysis.checks.some((check) => check.id === "cleanse" && check.ready), "Cleanse preflight missing");
assert.ok(analysis.checks.some((check) => check.id === "assist" && check.ready), "Assist preflight missing");
assert.equal("winPercent" in analysis, false, "Krayt strategy must not invent win probability");

console.log("[tatooine-unlock] validated official 3-unit gate, flexible Mandalorian slot and Krayt strategy preflight");
