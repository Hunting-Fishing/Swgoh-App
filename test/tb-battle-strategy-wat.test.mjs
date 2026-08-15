import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { extractAbilitySemantics } from "../public/kit-semantics.js";
import { WAT_BATTLE_STRATEGY, watBattleStrategyForMission } from "../public/tb-battle-strategy-wat-data.js";
import { evaluateBattleStrategy } from "../public/tb-battle-strategy.js";

function member(baseId, name, abilities) {
  const rows = abilities.map((ability) => ({ ...ability, semantics: extractAbilitySemantics(ability) }));
  return {
    baseId,
    name,
    unit: { baseId, name },
    abilities: rows,
    staticUnit: { baseId, name, abilities: rows },
  };
}

function watMembers({ leaderFirst = true, poggleAbilityBlock = true, soldierTenacityDown = true } = {}) {
  const gba = member("GEONOSIANBROODALPHA", "Geonosian Brood Alpha", [
    { id: "conscription", name: "Conscription", tier: 8, description: "Dispel all debuffs on all Geonosian allies. Summon a Geonosian Brute. All Geonosian allies gain Turn Meter and recover Health and Protection." },
    { id: "queens_will", name: "Queen's Will", tier: 8, description: "All Geonosian allies have Hive Mind while Geonosian Brood Alpha is active." },
  ]);
  const poggle = member("POGGLETHELESSER", "Poggle the Lesser", [
    { id: "martial_doom", name: "Martial Doom", tier: 8, description: poggleAbilityBlock ? "Deal Physical damage to target enemy with an 80% chance to inflict Ability Block for 1 turn." : "Deal Physical damage to target enemy." },
  ]);
  const soldier = member("GEONOSIANSOLDIER", "Geonosian Soldier", [
    { id: "aggressive_advance", name: "Aggressive Advance", tier: 8, description: soldierTenacityDown ? "Deal Physical damage to target enemy and inflict Tenacity Down for 2 turns." : "Deal Physical damage to target enemy." },
  ]);
  const spy = member("GEONOSIANSPY", "Geonosian Spy", [
    { id: "silent_strike", name: "Silent Strike", tier: 8, description: "Deal Physical damage to target enemy and dispel status effects from the target." },
  ]);
  const sunFac = member("SUNFAC", "Sun Fac", [
    { id: "browbeat", name: "Browbeat", tier: 8, description: "Deal Physical damage to target enemy and dispel all buffs on them." },
  ]);
  const standard = [gba, poggle, soldier, spy, sunFac];
  return leaderFirst ? standard : [poggle, gba, soldier, spy, sunFac];
}

test("Wat strategy pack resolves only the Wat mission id", () => {
  assert.equal(watBattleStrategyForMission("s3"), WAT_BATTLE_STRATEGY);
  assert.equal(watBattleStrategyForMission("p3-kam"), null);
  assert.equal(WAT_BATTLE_STRATEGY.confidence, "community-validated-partial");
});

test("standard GBA-led Geonosians satisfy Wat control preflight", () => {
  const analysis = evaluateBattleStrategy({ missionId: "s3", members: watMembers() });
  assert.equal(analysis.available, true);
  assert.equal(analysis.status, "ready");
  assert.equal(analysis.blockers.length, 0);
  assert.ok(analysis.checks.some((check) => check.id === "ability_block" && check.ready));
  assert.ok(analysis.checks.some((check) => check.id === "tenacity_down" && check.ready));
  assert.deepEqual(analysis.targetPriorities.slice(0, 2).map((item) => item.target), ["ARC Trooper", "Clone Medic"]);
  assert.equal("winPercent" in analysis, false);
  assert.equal("score" in analysis, false);
});

test("Wat strategy blocks an incorrect leader", () => {
  const analysis = evaluateBattleStrategy({ missionId: "s3", members: watMembers({ leaderFirst: false }) });
  assert.equal(analysis.status, "blocked");
  assert.ok(analysis.blockers.some((check) => check.type === "leader" && check.expected === "GEONOSIANBROODALPHA"));
});

test("Wat strategy blocks when Poggle no longer exposes Ability Block", () => {
  const analysis = evaluateBattleStrategy({ missionId: "s3", members: watMembers({ poggleAbilityBlock: false }) });
  assert.equal(analysis.status, "blocked");
  assert.ok(analysis.blockers.some((check) => check.id === "ability_block"));
});

test("Wat strategy blocks when Soldier no longer exposes Tenacity Down", () => {
  const analysis = evaluateBattleStrategy({ missionId: "s3", members: watMembers({ soldierTenacityDown: false }) });
  assert.equal(analysis.status, "blocked");
  assert.ok(analysis.blockers.some((check) => check.id === "tenacity_down"));
});

test("Wat strategy intentionally avoids a universal four-wave exact script", () => {
  const text = JSON.stringify(WAT_BATTLE_STRATEGY);
  assert.match(text, /does not claim a universal exact four-wave turn script/i);
  assert.doesNotMatch(text, /100% win|guaranteed clear|win probability/i);
});

test("Wat strategy modules parse", () => {
  for (const path of [
    new URL("../public/tb-battle-strategy-wat-data.js", import.meta.url),
    new URL("../public/tb-battle-strategy.js", import.meta.url),
  ]) execFileSync(process.execPath, ["--check", path.pathname]);
});
