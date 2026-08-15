import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { extractAbilitySemantics } from "../public/kit-semantics.js";
import { ROTE_DEATHSTAR_STRATEGIES, roteDeathStarStrategyForMission } from "../public/tb-battle-strategy-rote-deathstar-data.js";
import { evaluateBattleStrategy } from "../public/tb-battle-strategy.js";

function member(baseId, name, abilities = []) {
  const rows = abilities.map((ability) => ({ ...ability, semantics: extractAbilitySemantics(ability) }));
  return { baseId, name, unit: { baseId, name }, abilities: rows, staticUnit: { baseId, name, abilities: rows } };
}

test("Death Star resolver owns Vader and Iden packs", () => {
  assert.deepEqual(Object.keys(ROTE_DEATHSTAR_STRATEGIES), ["death-star-vader", "death-star-iden"]);
  assert.equal(roteDeathStarStrategyForMission("death-star-vader"), ROTE_DEATHSTAR_STRATEGIES["death-star-vader"]);
  assert.equal(roteDeathStarStrategyForMission("death-star-iden"), ROTE_DEATHSTAR_STRATEGIES["death-star-iden"]);
  assert.equal(roteDeathStarStrategyForMission("hoth-jabba"), null);
});

test("Death Star Vader uses Volatile Energies and Superlaser, never Hoth Deadly Storm", () => {
  const vader = member("VADER", "Darth Vader", [
    { id: "merciless", name: "Merciless Massacre", tier: 8, description: "Gain Merciless and take bonus turns against enemies." },
    { id: "crush", name: "Force Crush", tier: 8, description: "Inflict Damage Over Time and Speed Down on all enemies." },
    { id: "basic", name: "Terrifying Swing", tier: 8, description: "Inflict Ability Block." },
  ]);
  const analysis = evaluateBattleStrategy({ missionId: "death-star-vader", members: [vader] });
  assert.equal(analysis.blockers.length, 0);
  assert.equal(analysis.strategyStatus, "community-tested-high-risk");
  assert.match(analysis.summary, /Volatile Energies/i);
  assert.match(analysis.summary, /5%/i);
  assert.match(analysis.summary, /Superlaser/i);
  assert.match(JSON.stringify(analysis.stages), /destroy.*target|instant defeat/i);
  assert.doesNotMatch(JSON.stringify(analysis), /Smells Bad on the Outside/i);
  assert.match(JSON.stringify(analysis.failureRisks), /Deadly Storm.*Hoth|Hoth.*Deadly Storm/i);
  assert.equal("winPercent" in analysis, false);
});

test("Death Star Iden preserves mixed-shell conditional warning and correct modifier", () => {
  const iden = member("IDENVERSIO", "Iden Versio", [
    { id: "push", name: "Push Forward", tier: 8, description: "Dispel buffs and inflict Healing Immunity and Stun." },
    { id: "grieve", name: "We Can Grieve Later", tier: 8, description: "Dispel debuffs on Imperial Trooper allies and grant Protection Up." },
  ]);
  const analysis = evaluateBattleStrategy({ missionId: "death-star-iden", members: [iden] });
  assert.equal(analysis.blockers.length, 0);
  assert.match(analysis.summary, /Supreme Leader Kylo Ren/i);
  assert.match(analysis.summary, /does not satisfy/i);
  assert.match(analysis.summary, /Superlaser/i);
  assert.match(JSON.stringify(analysis.stages), /Volatile Energies/i);
  assert.doesNotMatch(JSON.stringify(analysis), /Smells Bad on the Outside/i);
  assert.equal(analysis.targetPriorities.length, 0);
});

test("Death Star source boundaries remain explicit and odds-free", () => {
  for (const strategy of Object.values(ROTE_DEATHSTAR_STRATEGIES)) {
    assert.ok(strategy.sources.some((source) => source.kind === "official"));
    assert.ok(strategy.sources.some((source) => source.kind === "current-reference"));
    assert.ok(strategy.evidenceBoundary);
    assert.equal("winPercent" in strategy, false);
    assert.equal("score" in strategy, false);
    assert.equal("guaranteedWin" in strategy, false);
  }
});

test("Death Star modules parse", () => {
  for (const path of [
    new URL("../public/tb-battle-strategy-rote-deathstar-data.js", import.meta.url),
    new URL("../public/tb-battle-strategy.js", import.meta.url),
  ]) execFileSync(process.execPath, ["--check", path.pathname]);
});
