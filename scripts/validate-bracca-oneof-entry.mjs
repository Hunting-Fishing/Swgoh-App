import assert from "node:assert/strict";
import { ROTE_MISSIONS_BY_PLANET } from "../public/rote-mission-data.js";
import { normalizeRoteMissions } from "../public/rote-mission-overrides.js";
import {
  mandatoryRosterStatus,
  missionRosterEntrySummary,
  recommendationRosterFit,
} from "../public/tb-mission-intelligence.js";

const char = (baseId, name, relic = 7) => ({
  baseId,
  name,
  unitType: "Character",
  alignment: "Light",
  stars: 7,
  relic,
  power: 30000,
  speed: 250,
});

const CERE = char("CEREJUNDA", "Cere Junda");
const CAL = char("CALKESTIS", "Cal Kestis");
const JKCK = char("JEDIKNIGHTCAL", "Jedi Knight Cal Kestis");

const missions = normalizeRoteMissions(Object.values(ROTE_MISSIONS_BY_PLANET).flat());
const mission = missions.find((item) => item.id === "bracca-zeffo-unlock");
assert.ok(mission, "Bracca Zeffo unlock mission missing");
assert.equal(mission.entry.verified, true);
assert.equal(mission.entry.squadSize, 2);
assert.equal(mission.entry.relicMin, 7);
assert.deepEqual(mission.entry.mandatoryMembers.map((member) => member.baseId), ["CEREJUNDA"]);
assert.equal(mission.entry.mandatoryAnyGroups.length, 1, "Bracca needs one formal one-of group");
assert.equal(mission.entry.mandatoryAnyGroups[0].count, 1);
assert.deepEqual(mission.entry.mandatoryAnyGroups[0].members.map((member) => member.baseId), ["CALKESTIS", "JEDIKNIGHTCAL"]);
assert.equal(mission.recommendations.length, 2, "Both legal Cal variants should have an exact 2-unit entry core");

function body(...units) {
  return { units, ships: [] };
}

const cereCal = missionRosterEntrySummary(body(CERE, CAL), mission);
assert.equal(cereCal.ready, true, "Cere + Cal must satisfy the official Bracca gate");
assert.equal(cereCal.mandatory.complete, true);
assert.equal(cereCal.mandatory.anyGroups[0].complete, true);

const cereJkck = missionRosterEntrySummary(body(CERE, JKCK), mission);
assert.equal(cereJkck.ready, true, "Cere + Jedi Knight Cal must satisfy the official Bracca gate");

const cereOnly = missionRosterEntrySummary(body(CERE), mission);
assert.equal(cereOnly.ready, false, "Cere without a Cal variant must fail the Bracca gate");
assert.equal(cereOnly.mandatory.anyGroups[0].complete, false);

const calsWithoutCere = missionRosterEntrySummary(body(CAL, JKCK), mission);
assert.equal(calsWithoutCere.ready, false, "Two Cal variants without Cere must fail the Bracca gate");
assert.equal(calsWithoutCere.mandatory.rows[0].legal, false);

for (const recommendation of mission.recommendations) {
  const variantBody = recommendation.members.some((member) => member.baseId === "JEDIKNIGHTCAL") ? body(CERE, JKCK) : body(CERE, CAL);
  const fit = recommendationRosterFit(variantBody, mission, recommendation);
  assert.equal(fit.complete, true, `${recommendation.name} should be an exact legal entry composition`);
  assert.equal(fit.includesMandatory, true);
  assert.equal(fit.includesMandatoryAnyGroups, true);
}

const mandatory = mandatoryRosterStatus(body(CERE, CAL), mission);
assert.equal(mandatory.requirementTotal, 2, "Cere plus one Cal choice should count as two mandatory requirement slots");
assert.equal(mandatory.requirementReady, 2);

assert.equal("winPercent" in mission, false, "Entry contract must not invent win probability");
console.log("[bracca-oneof] validated Cere + one-of Cal mission-entry contract");
