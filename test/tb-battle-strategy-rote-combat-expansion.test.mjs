import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { extractAbilitySemantics } from "../public/kit-semantics.js";
import {
  ROTE_COMBAT_EXPANSION_STRATEGIES,
  roteCombatExpansionStrategyForMission,
} from "../public/tb-battle-strategy-rote-combat-expansion-data.js";
import { evaluateBattleStrategy } from "../public/tb-battle-strategy.js";

function member(baseId, name, abilities = []) {
  const rows = abilities.map((ability) => ({ ...ability, semantics: extractAbilitySemantics(ability) }));
  return { baseId, name, unit: { baseId, name }, abilities: rows, staticUnit: { baseId, name, abilities: rows } };
}

const ids = ["tatooine-fennec", "kashyyyk-wookiee", "zeffo-generic-1", "zeffo-ufu"];

test("ROTE combat expansion resolver owns the four non-Death-Star expansion ids", () => {
  assert.deepEqual(Object.keys(ROTE_COMBAT_EXPANSION_STRATEGIES), ids);
  for (const id of ids) assert.equal(roteCombatExpansionStrategyForMission(id), ROTE_COMBAT_EXPANSION_STRATEGIES[id]);
  assert.equal(roteCombatExpansionStrategyForMission("death-star-vader"), null);
  assert.equal(roteCombatExpansionStrategyForMission("mandalore-dtmg"), null);
});

test("Fennec pack treats Dune Sandstorm as unavoidable and supports alternative shells", () => {
  const analysis = evaluateBattleStrategy({ missionId: "tatooine-fennec", members: [member("FENNECSHAND", "Fennec Shand")] });
  assert.equal(analysis.available, true);
  assert.equal(analysis.blockers.length, 0);
  assert.match(analysis.summary, /unavoidable/i);
  assert.match(analysis.summary, /Rey/i);
  assert.match(analysis.summary, /Bounty Hunter/i);
});

test("Kashyyyk Wookiee strategy enforces Tarfful-led variant and wave priorities", () => {
  const tarfful = member("TARFFUL", "Tarfful", [
    { id: "roar", name: "Rrrruuuurrr", tier: 8, description: "Dispel all debuffs on allies and inflict Provoked." },
    { id: "fury", name: "Wookiee Fury", tier: 8, description: "Call Wookiee allies to assist and Stun target enemy." },
  ]);
  const analysis = evaluateBattleStrategy({ missionId: "kashyyyk-wookiee", members: [tarfful] });
  assert.equal(analysis.blockers.length, 0);
  assert.ok(analysis.targetPriorities.some((row) => row.target === "Scout Trooper" && row.priority === "critical"));
  assert.ok(analysis.targetPriorities.some((row) => row.target === "Purge Trooper" && row.priority === "critical"));
  assert.match(JSON.stringify(analysis.stages), /Ninth Sister/i);

  const wrongLeader = evaluateBattleStrategy({ missionId: "kashyyyk-wookiee", members: [member("ZAALBAR", "Zaalbar"), tarfful] });
  assert.ok(wrongLeader.blockers.some((check) => check.type === "leader" && check.expected === "TARFFUL"));
});

test("open Zeffo combat mission requires a real Stun source for Tomb Guardian defeat windows", () => {
  const noStun = evaluateBattleStrategy({ missionId: "zeffo-generic-1", members: [member("GRANDMASTERLUKE", "Jedi Master Luke Skywalker")] });
  assert.ok(noStun.blockers.some((check) => check.id === "stun"));

  const jkl = member("JEDIKNIGHTLUKE", "Jedi Knight Luke Skywalker", [
    { id: "repulse", name: "Repulse", tier: 8, description: "Deal Physical damage to all enemies and inflict Stun." },
  ]);
  const ready = evaluateBattleStrategy({ missionId: "zeffo-generic-1", members: [jkl] });
  assert.equal(ready.blockers.length, 0);
  assert.match(JSON.stringify(ready.stages), /Cannon Fodder/i);
  assert.match(JSON.stringify(ready.stages), /Tomb Guardian/i);
});

test("Zeffo UFU strategy is an explicit Rey-led community variant", () => {
  const rey = member("GLREY", "Rey", [
    { id: "ultimate", name: "Heir to the Jedi", tier: 3, description: "Enter a defensive stance and reduce damage Light Side allies receive to 1." },
    { id: "whirlwind", name: "Sudden Whirlwind", tier: 3, description: "Deal massive damage to target enemy." },
  ]);
  const analysis = evaluateBattleStrategy({ missionId: "zeffo-ufu", members: [rey] });
  assert.equal(analysis.blockers.length, 0);
  assert.match(analysis.summary, /AT-ST/i);
  assert.match(JSON.stringify(analysis.stages), /defensive/i);

  const wrongLeader = evaluateBattleStrategy({ missionId: "zeffo-ufu", members: [member("CEREJUNDA", "Cere Junda"), rey] });
  assert.ok(wrongLeader.blockers.some((check) => check.type === "leader" && check.expected === "GLREY"));
});

test("expanded packs keep authoritative/current sources and avoid fabricated odds", () => {
  for (const strategy of Object.values(ROTE_COMBAT_EXPANSION_STRATEGIES)) {
    assert.ok(strategy.sources.some((source) => source.kind === "official" || source.kind === "current-reference"));
    assert.ok(strategy.evidenceBoundary);
    assert.equal("winPercent" in strategy, false);
    assert.equal("score" in strategy, false);
    assert.equal("guaranteedWin" in strategy, false);
  }
});

test("expanded ROTE strategy modules parse", () => {
  for (const path of [
    new URL("../public/tb-battle-strategy-rote-combat-expansion-data.js", import.meta.url),
    new URL("../public/tb-battle-strategy.js", import.meta.url),
  ]) execFileSync(process.execPath, ["--check", path.pathname]);
});
