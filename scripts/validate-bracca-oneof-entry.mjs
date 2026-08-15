import assert from "node:assert/strict";
import { ROTE_MISSIONS_BY_PLANET } from "../public/rote-mission-data.js";
import { normalizeRoteMissions } from "../public/rote-mission-overrides.js";
import {
  mandatoryRosterStatus,
  missionRosterEntrySummary,
  recommendationRosterFit,
} from "../public/tb-mission-intelligence.js";
import { evaluateBattleStrategy } from "../public/tb-battle-strategy.js";

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

const member = (baseId, name) => ({
  baseId,
  name,
  unit: char(baseId, name),
  abilities: [],
  staticUnit: { baseId, name, abilities: [] },
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
assert.deepEqual(mission.entry.mandatoryMembers.map((row) => row.baseId), ["CEREJUNDA"]);
assert.equal(mission.entry.mandatoryAnyGroups.length, 1, "Bracca needs one formal one-of group");
assert.equal(mission.entry.mandatoryAnyGroups[0].count, 1);
assert.deepEqual(mission.entry.mandatoryAnyGroups[0].members.map((row) => row.baseId), ["CALKESTIS", "JEDIKNIGHTCAL"]);
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
  const variantBody = recommendation.members.some((row) => row.baseId === "JEDIKNIGHTCAL") ? body(CERE, JKCK) : body(CERE, CAL);
  const fit = recommendationRosterFit(variantBody, mission, recommendation);
  assert.equal(fit.complete, true, `${recommendation.name} should be an exact legal entry composition`);
  assert.equal(fit.includesMandatory, true);
  assert.equal(fit.includesMandatoryAnyGroups, true);
}

const mandatory = mandatoryRosterStatus(body(CERE, CAL), mission);
assert.equal(mandatory.requirementTotal, 2, "Cere plus one Cal choice should count as two mandatory requirement slots");
assert.equal(mandatory.requirementReady, 2);

const strategyCal = evaluateBattleStrategy({ missionId: "bracca-zeffo-unlock", members: [member("CEREJUNDA", "Cere Junda"), member("CALKESTIS", "Cal Kestis")] }, mission);
assert.equal(strategyCal.available, true, "Existing Bracca strategy provider must remain registered");
assert.equal(strategyCal.status, "ready", "Original Cal legal variant must not be penalized by variant-specific advice");
assert.equal(strategyCal.blockers.length, 0);

const strategyJkck = evaluateBattleStrategy({ missionId: "bracca-zeffo-unlock", members: [member("CEREJUNDA", "Cere Junda"), member("JEDIKNIGHTCAL", "Jedi Knight Cal Kestis")] }, mission);
assert.equal(strategyJkck.available, true);
assert.equal(strategyJkck.status, "ready", "JKCK legal variant should resolve the current Bracca strategy pack");
assert.equal("winPercent" in strategyJkck, false, "Bracca strategy must not invent win probability");

console.log("[bracca-oneof] validated Cere + one-of Cal entry contract against the existing Bracca strategy provider");
