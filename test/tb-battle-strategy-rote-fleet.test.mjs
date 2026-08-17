import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { ROTE_FLEET_ENTRY_AUDIT } from "../public/rote-fleet-entry-audit-data.js";
import { ROTE_MISSIONS_BY_PLANET } from "../public/rote-mission-data.js";
import { evaluateBattleStrategy } from "../public/tb-battle-strategy.js";
import { ROTE_FLEET_BATTLE_STRATEGIES } from "../public/tb-battle-strategy-rote-fleet-data.js";
import { roteFleetBattleStrategyForMission } from "../public/tb-battle-strategy-rote-fleet-resolver.js";
import { missionStrategyCoverage, STRATEGY_COVERAGE } from "../public/tb-strategy-coverage.js";

const fleetMissions = Object.values(ROTE_MISSIONS_BY_PLANET).flat().filter((mission) => mission.missionType === "fleet");
const fleetIds = fleetMissions.map((mission) => mission.id).sort();

const expectedFleetIds = [
  "bracca-fleet",
  "corellia-fleet",
  "coruscant-fleet",
  "death-star-fleet",
  "felucia-fleet",
  "geonosis-fleet",
  "hoth-fleet",
  "kafrene-fleet",
  "kashyyyk-fleet",
  "kessel-fleet",
  "lothal-fleet",
  "mandalore-fleet",
  "mustafar-fleet",
  "scarif-fleet",
  "tatooine-fleet",
  "vandor-fleet",
  "zeffo-fleet",
].sort();

function ship(baseId, name = baseId) {
  return { baseId, name, unit: { baseId, name }, abilities: [], staticUnit: { baseId, name, abilities: [] } };
}

test("canonical ROTE data exposes exactly 17 fleet missions", () => {
  assert.equal(fleetMissions.length, 17);
  assert.deepEqual(fleetIds, expectedFleetIds);
  assert.deepEqual(Object.keys(ROTE_FLEET_BATTLE_STRATEGIES).sort(), expectedFleetIds);
  assert.deepEqual(Object.keys(ROTE_FLEET_ENTRY_AUDIT).sort(), expectedFleetIds);
});

test("every canonical ROTE fleet mission resolves to sourced execution stages plus the audited entry gate", () => {
  for (const mission of fleetMissions) {
    const strategy = roteFleetBattleStrategyForMission(mission.id);
    const audit = ROTE_FLEET_ENTRY_AUDIT[mission.id];
    assert.ok(strategy, `${mission.id} should resolve`);
    assert.ok(audit, `${mission.id} should have an entry audit`);
    assert.equal(strategy.missionId, mission.id);
    assert.ok(strategy.sources.some((source) => source.kind === "official" || source.kind === "current-reference"));
    assert.ok(strategy.stages.length >= 3);
    assert.ok(strategy.evidenceBoundary);
    assert.deepEqual(strategy.entryAudit.allowedAlignments, [...audit.allowedAlignments]);
    assert.deepEqual(strategy.entryAudit.mandatoryBaseIds, audit.mandatoryMembers.map((member) => member.baseId));
    assert.equal(strategy.entryAudit.sourceRequirement, audit.sourceRequirement);
    assert.equal(strategy.stages[0].steps[0].id, "entry-audit");
    assert.match(strategy.stages[0].steps[0].instruction, new RegExp(audit.sourceRequirement.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

    const analysis = evaluateBattleStrategy({ missionId: mission.id, members: [] }, mission);
    assert.equal(analysis.available, true, `${mission.id} should be available through the global resolver`);
    assert.equal(analysis.strategyId, strategy.id);
    assert.ok(analysis.stages.length >= 3);
    assert.equal("winPercent" in analysis, false);
    assert.equal("guaranteedWin" in analysis, false);
  }
});

test("all 17 fleet missions count as covered in the strategy coverage layer", () => {
  for (const mission of fleetMissions) {
    const coverage = missionStrategyCoverage(mission);
    assert.equal(coverage.coverage, STRATEGY_COVERAGE.COVERED, `${mission.id}: ${coverage.reason}`);
    assert.equal(coverage.strategyAvailable, true);
  }
});

test("every audited required ship identifier is enforced by the strategy resolver", () => {
  for (const [missionId, audit] of Object.entries(ROTE_FLEET_ENTRY_AUDIT)) {
    const strategy = roteFleetBattleStrategyForMission(missionId);
    for (const member of audit.mandatoryMembers) {
      assert.ok(strategy.keyUnits.some((row) => row.baseId === member.baseId && row.importance === "critical"), `${missionId} should require ${member.baseId}`);
      const analysis = evaluateBattleStrategy({ missionId, members: [ship(member.baseId, member.name)] }, fleetMissions.find((mission) => mission.id === missionId));
      assert.ok(!analysis.blockers.some((row) => row.type === "unit" && row.id === member.baseId), `${missionId} should recognize ${member.baseId}`);
    }
  }
});

test("fleet packs preserve official modifier semantics and avoid fabricated odds", () => {
  assert.match(roteFleetBattleStrategyForMission("mustafar-fleet").summary, /Burning/i);
  assert.match(roteFleetBattleStrategyForMission("bracca-fleet").summary, /Decommissioned/i);
  assert.match(roteFleetBattleStrategyForMission("geonosis-fleet").summary, /Target Lock/i);
  assert.match(roteFleetBattleStrategyForMission("tatooine-fleet").summary, /bonus turn/i);
  assert.match(roteFleetBattleStrategyForMission("kessel-fleet").summary, /Confuse/i);
  assert.match(roteFleetBattleStrategyForMission("hoth-fleet").summary, /Damage Over Time/i);
  assert.match(roteFleetBattleStrategyForMission("scarif-fleet").summary, /Reinforcement/i);
  for (const strategy of Object.values(ROTE_FLEET_BATTLE_STRATEGIES)) {
    assert.doesNotMatch(JSON.stringify(strategy), /\b(?:9\d|100)%\s*(?:win|clear)/i);
  }
});

test("fleet strategy modules parse", () => {
  for (const path of [
    new URL("../public/rote-fleet-entry-audit-data.js", import.meta.url),
    new URL("../public/tb-battle-strategy-rote-fleet-data.js", import.meta.url),
    new URL("../public/tb-battle-strategy-rote-fleet-resolver.js", import.meta.url),
    new URL("../public/tb-battle-strategy.js", import.meta.url),
  ]) execFileSync(process.execPath, ["--check", path.pathname]);
});
