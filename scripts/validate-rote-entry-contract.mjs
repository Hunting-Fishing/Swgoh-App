import assert from "node:assert/strict";
import { ROTE_FLEET_ENTRY_AUDIT, ROTE_FLEET_ENTRY_AUDIT_COUNT } from "../public/rote-fleet-entry-audit-data.js";
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

const fleetMissions = missions.filter((mission) => mission.missionType === "fleet");
assert.equal(ROTE_FLEET_ENTRY_AUDIT_COUNT, 17, "ROTE fleet-entry audit must remain complete for all 17 fleet missions");
assert.equal(fleetMissions.length, 17, "Normalized ROTE catalog must expose exactly 17 fleet missions");
assert.deepEqual(
  fleetMissions.map((mission) => mission.id).sort(),
  Object.keys(ROTE_FLEET_ENTRY_AUDIT).sort(),
  "Fleet-entry audit IDs must exactly match the canonical ROTE fleet mission IDs",
);

for (const mission of fleetMissions) {
  const audit = ROTE_FLEET_ENTRY_AUDIT[mission.id];
  assert.ok(audit, `${mission.id} is missing its audited entry contract`);
  assert.equal(mission.entry?.verified, true, `${mission.id} must remain verified`);
  assert.equal(mission.entry?.unitType, "Ship", `${mission.id} must remain a ship mission`);
  assert.equal(mission.entry?.starsMin, 7, `${mission.id} must remain a 7-star fleet gate`);
  assert.deepEqual(mission.entry?.allowedAlignments || [], [...audit.allowedAlignments], `${mission.id} alignment gate drifted`);
  assert.deepEqual(
    (mission.entry?.mandatoryMembers || []).map((member) => member.baseId),
    audit.mandatoryMembers.map((member) => member.baseId),
    `${mission.id} mandatory ship requirement drifted`,
  );
  assert.ok(mission.sources?.includes("swgoh-wiki-rote-zones"), `${mission.id} lost the ROTE zone-reference provenance`);
  assert.ok(mission.sources?.includes("genskaar-rote"), `${mission.id} lost the GenSkaar provenance`);
  assert.match(String(mission.entry?.notes || ""), /^Audited fleet entry:/, `${mission.id} must expose its audited source requirement`);

  const sevenStar = (alignment) => ({
    baseId: `VALIDATION_${alignment.toUpperCase()}`,
    name: `${alignment} validation ship`,
    unitType: "Ship",
    stars: 7,
    alignment,
    factions: [],
    categories: [],
  });
  const sixStar = { ...sevenStar(audit.allowedAlignments[0] || "Light"), stars: 6 };
  assert.equal(rosterUnitMeetsEntry(sixStar, mission), false, `${mission.id} must reject ships below 7 stars`);

  for (const alignment of ["Light", "Dark", "Neutral"]) {
    const expected = audit.allowedAlignments.includes(alignment);
    assert.equal(
      rosterUnitMeetsEntry(sevenStar(alignment), mission),
      expected,
      `${mission.id} ${alignment} ship eligibility must match the audited side gate`,
    );
  }
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
assert.equal(unlock.recommendations.length, 2, "UI should expose only conservative three-unit Mandalorian unlock variants");
for (const recommendation of unlock.recommendations) {
  assert.equal(recommendation.members.length, 3, `${recommendation.id} must stay a three-unit unlock team`);
  assert.deepEqual(recommendation.members.slice(0, 2).map((row) => row.baseId), ["MANDALORBOKATAN", "THEMANDALORIANBESKARARMOR"]);
  assert.equal(recommendation.verifiedLegal, true, `${recommendation.id} must remain verified against the encoded entry contract`);
}
assert.deepEqual(unlock.recommendations[0].members.map((row) => row.baseId), ["MANDALORBOKATAN", "THEMANDALORIANBESKARARMOR", "IG12"]);
assert.deepEqual(unlock.recommendations[1].members.map((row) => row.baseId), ["MANDALORBOKATAN", "THEMANDALORIANBESKARARMOR", "PAZVIZSLA"]);

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

console.log(`[rote-entry-contract] validated all ${ROTE_FLEET_ENTRY_AUDIT_COUNT} audited fleet gates plus official Krayt and canonical named-unit IDs across normalized ROTE mission data`);
