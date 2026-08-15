import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  analyzeMissionMechanicCoverage,
  parseMissionMechanicContract,
  resolveMissionEnemies,
} from "../public/mission-mechanic-intelligence.js";

test("Zeffo Tomb Guardian note becomes an explicit Stun requirement", () => {
  const mission = {
    mechanics: ["Tomb Guardians cannot be defeated unless they are stunned; reliable Stun access is materially important."],
  };
  const contract = parseMissionMechanicContract(mission);
  assert.equal(contract.requirements.length, 1);
  assert.equal(contract.requirements[0].id, "stun");
  assert.equal(contract.hazards.length, 0);
});

test("entry and mode notes remain informational rather than fake battle requirements", () => {
  const contract = parseMissionMechanicContract({ mechanics: [
    "Bo-Katan (Mand'alor) specifically requires R9 while the planet baseline is R8.",
    "Jedi Knight Cal Kestis has Territory Battle Omicrons that are relevant to this battle mode.",
  ] });
  assert.equal(contract.requirements.length, 0);
  assert.equal(contract.hazards.length, 0);
  assert.equal(contract.informational.length, 2);
});

test("team mechanic coverage identifies the exact ability supplying a required Stun", () => {
  const mission = { mechanics: ["Tomb Guardians cannot be defeated unless they are stunned; reliable Stun access is materially important."], enemies: [] };
  const members = [{ staticUnit: {
    baseId: "A",
    name: "Alpha",
    abilities: [{ id: "special_a", name: "Control Shot", type: "Special", description: "Deal damage and inflict Stun for 1 turn." }],
  } }];
  const analysis = analyzeMissionMechanicCoverage(mission, members);
  assert.equal(analysis.covered.length, 1);
  assert.equal(analysis.missing.length, 0);
  assert.equal(analysis.covered[0].sources[0].unitName, "Alpha");
  assert.equal(analysis.covered[0].sources[0].abilityName, "Control Shot");
});

test("team without an explicit mechanic reports a gap without creating a win score", () => {
  const mission = { mechanics: ["Reliable Stun is required for this encounter."], enemies: [] };
  const members = [{ staticUnit: { baseId: "A", name: "Alpha", abilities: [{ id: "basic_a", name: "Strike", type: "Basic", description: "Deal physical damage." }] } }];
  const analysis = analyzeMissionMechanicCoverage(mission, members);
  assert.equal(analysis.covered.length, 0);
  assert.equal(analysis.missing.length, 1);
  assert.equal("score" in analysis, false);
  assert.equal("winPercent" in analysis, false);
  assert.match(analysis.evidenceBoundary, /not a win probability/i);
});

test("hazards stay separate from required team capabilities", () => {
  const contract = parseMissionMechanicContract({ mechanics: ["This enemy punishes Turn Meter gain, so avoid unnecessary TM loops."] });
  assert.equal(contract.requirements.length, 0);
  assert.equal(contract.hazards.length, 1);
  assert.equal(contract.hazards[0].id, "avoid_tm_gain");
});

test("mission enemies resolve by concrete definition id, base id, or name", () => {
  const enemyKitIndex = {
    archetypes: [{ archetypeId: "ENEMY#1", baseId: "ENEMY", name: "Enemy Trooper", definitionIds: ["ENEMY:TB01"], kit: { mechanicKinds: ["debuff"], debuffs: ["Stun"] } }],
  };
  for (const token of ["ENEMY:TB01", "ENEMY", "Enemy Trooper"]) {
    const result = resolveMissionEnemies({ enemies: [token] }, enemyKitIndex);
    assert.equal(result.resolved.length, 1);
    assert.equal(result.unresolved.length, 0);
  }
});

test("mission mechanic browser modules parse", () => {
  for (const path of [
    new URL("../public/mission-mechanic-intelligence.js", import.meta.url),
    new URL("../public/tb-combat-intelligence.js", import.meta.url),
    new URL("../public/tb-combat-prep-ui.js", import.meta.url),
  ]) execFileSync(process.execPath, ["--check", path.pathname]);
});
