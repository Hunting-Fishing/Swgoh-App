import assert from "node:assert/strict";
import { ROTE_MISSIONS_BY_PLANET } from "../public/rote-mission-data.js";
import { normalizeRoteMissions } from "../public/rote-mission-overrides.js";
import { rosterUnitMeetsEntry } from "../public/tb-mission-intelligence.js";
import { rotePriorityBattleStrategyForMission } from "../public/tb-battle-strategy-rote-priority-data.js";

const rawMissions = Object.values(ROTE_MISSIONS_BY_PLANET).flat();
const missions = normalizeRoteMissions(rawMissions);
const missionById = (id) => missions.find((mission) => mission.id === id);
const mandatoryIds = (rows) => rows.flatMap((mission) => mission.entry?.mandatoryMembers || []).map((row) => row.baseId).filter(Boolean);

assert.equal(missions.length, rawMissions.length, "Overrides must not add or drop ROTE missions");

const staleAliases = ["BOKATANMANDALORE", "BESKARMANDO", "DARKTROOPERMOFFGIDEON", "L337", "000"];
const canonicalIds = ["MANDALORBOKATAN", "THEMANDALORIANBESKARARMOR", "MOFFGIDEONS3", "L3_37", "TRIPLEZERO"];
for (const staleId of staleAliases) {
  assert.ok(!mandatoryIds(rawMissions).includes(staleId), `Raw ROTE mission catalog still contains stale mandatory baseId ${staleId}`);
  assert.ok(!mandatoryIds(missions).includes(staleId), `Normalized ROTE mission catalog still contains stale mandatory baseId ${staleId}`);
}
for (const canonicalId of canonicalIds) {
  assert.ok(mandatoryIds(missions).includes(canonicalId), `Normalized ROTE mission catalog is missing canonical baseId ${canonicalId}`);
}

const unlock = missionById("tatooine-mandalore-unlock");
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

const mandalore = missionById("mandalore-bkm");
assert.ok(mandalore, "Mandalore BKM mission missing");
assert.deepEqual(mandalore.entry.mandatoryMembers.map((row) => row.baseId), ["MANDALORBOKATAN"]);

const dtmg = missionById("mandalore-dtmg");
assert.ok(dtmg, "Mandalore DTMG mission missing");
assert.deepEqual(dtmg.entry.mandatoryMembers.map((row) => row.baseId), ["MOFFGIDEONS3"]);

const kessel = missionById("kessel-qira-l3");
assert.ok(kessel, "Kessel Qi'ra/L3-37 mission missing");
assert.deepEqual(kessel.entry.mandatoryMembers.map((row) => row.baseId), ["QIRA", "L3_37"]);

const hothAphra = missionById("hoth-aphra");
assert.ok(hothAphra, "Hoth Aphra mission missing");
assert.deepEqual(hothAphra.entry.mandatoryMembers.map((row) => row.baseId), ["DOCTORAPHRA", "BT1", "TRIPLEZERO"]);

console.log("[rote-entry-contract] validated official Krayt gate plus canonical BKM/BAM, DTMG, L3-37 and 0-0-0 IDs across raw and normalized ROTE mission data");
