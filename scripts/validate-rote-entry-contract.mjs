import assert from "node:assert/strict";
import { ROTE_MISSIONS_BY_PLANET } from "../public/rote-mission-data.js";
import { normalizeRoteMissions } from "../public/rote-mission-overrides.js";
import { rosterUnitMeetsEntry } from "../public/tb-mission-intelligence.js";
import { rotePriorityBattleStrategyForMission } from "../public/tb-battle-strategy-rote-priority-data.js";

const missions = normalizeRoteMissions(Object.values(ROTE_MISSIONS_BY_PLANET).flat());
assert.equal(missions.length, Object.values(ROTE_MISSIONS_BY_PLANET).flat().length, "Overrides must not add or drop ROTE missions");

const unlock = missions.find((mission) => mission.id === "tatooine-mandalore-unlock");
assert.ok(unlock, "Tatooine Mandalore unlock mission missing");
assert.equal(unlock.entry.verified, true);
assert.equal(unlock.entry.squadSize, 3, "Official Krayt unlock must be modeled as a three-unit mission");
assert.equal(unlock.entry.starsMin, 7);
assert.equal(unlock.entry.relicMin, 7);
assert.equal(unlock.entry.alignment, null);
assert.deepEqual(unlock.entry.allowedAlignments, []);
assert.deepEqual(unlock.entry.requiredCategories, ["Mandalorian"]);
assert.deepEqual(unlock.entry.mandatoryMembers.map((row) => row.baseId), ["MANDALORBOKATAN", "THEMANDALORIANBESKARARMOR"]);
assert.equal(unlock.recommendations.length, 1, "UI should expose one conservative 3-unit community core, not the generic 5-unit BKM squad");
assert.deepEqual(unlock.recommendations[0].members.map((row) => row.baseId), ["MANDALORBOKATAN", "THEMANDALORIANBESKARARMOR", "IG12"]);

const neutralMandalorian = {
  baseId: "FUTURENEUTRALMANDO",
  name: "Future Neutral Mandalorian",
  unitType: "Character",
  alignment: "Neutral",
  stars: 7,
  relic: 7,
  factions: ["Mandalorian"],
  categories: ["Mandalorian"],
};
const nonMandalorian = {
  baseId: "NOTMANDO",
  name: "Not Mandalorian",
  unitType: "Character",
  alignment: "Light",
  stars: 7,
  relic: 9,
  factions: ["Jedi"],
  categories: ["Jedi"],
};
assert.equal(rosterUnitMeetsEntry(neutralMandalorian, unlock), true, "Official 'any Mandalorian' rule must not inherit an alignment restriction");
assert.equal(rosterUnitMeetsEntry(nonMandalorian, unlock), false, "Third slot must still require Mandalorian category");

const strategy = rotePriorityBattleStrategyForMission("tatooine-mandalore-unlock");
assert.ok(strategy, "Existing Tatooine Krayt strategy pack must remain registered after mission normalization");
assert.equal(strategy.requiredLeaderBaseId, "MANDALORBOKATAN");
assert.equal("winPercent" in strategy, false, "Entry-contract normalization must not introduce fabricated odds");

const mandalore = missions.find((mission) => mission.id === "mandalore-bkm");
assert.ok(mandalore, "Mandalore BKM mission missing");
assert.ok(mandalore.entry.mandatoryMembers.some((row) => row.baseId === "MANDALORBOKATAN"), "Mandalore BKM entry should expose the current BKM Base ID");
assert.ok(!mandalore.entry.mandatoryMembers.some((row) => row.baseId === "BOKATANMANDALORE"), "Stale BKM Base ID must not survive normalization");

console.log("[rote-entry-contract] validated 3-unit Krayt gate, flexible Mandalorian third slot and canonical BKM/BAM IDs");
