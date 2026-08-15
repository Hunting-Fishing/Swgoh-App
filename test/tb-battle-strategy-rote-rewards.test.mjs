import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { extractAbilitySemantics } from "../public/kit-semantics.js";
import {
  ROTE_REWARD_BATTLE_STRATEGIES,
  roteRewardBattleStrategyForMission,
} from "../public/tb-battle-strategy-rote-rewards-data.js";
import { evaluateBattleStrategy } from "../public/tb-battle-strategy.js";

function member(baseId, name, abilities = []) {
  const rows = abilities.map((ability) => ({ ...ability, semantics: extractAbilitySemantics(ability) }));
  return { baseId, name, unit: { baseId, name }, abilities: rows, staticUnit: { baseId, name, abilities: rows } };
}

const cere = () => member("CEREJUNDA", "Cere Junda");
const jkck = () => member("JEDIKNIGHTCAL", "Jedi Knight Cal Kestis", [
  { id: "windmill", name: "Windmill Defense", tier: 8, description: "Dispel debuffs, grant Protection Up and Riposte, and call an ally to assist." },
  { id: "impetuous", name: "Impetuous Assault", tier: 8, description: "Deal damage and defeat the target under the configured Territory Battle condition." },
]);
const qira = () => member("QIRA", "Qi'ra", [
  { id: "scattering", name: "Scattering Blast", tier: 8, description: "Dispel buffs and deal damage to all enemies, inflicting Stagger." },
  { id: "joint", name: "Joint Operation", tier: 8, description: "Call another ally to assist; Prepared allies can also assist." },
]);
const youngHan = () => member("YOUNGHAN", "Young Han Solo", [
  { id: "upper", name: "Upper Hand", tier: 8, description: "Gain Protection Up and Retribution and permanently increase Speed." },
  { id: "just", name: "Just In Time", tier: 8, description: "Deal damage, recover ally Protection and transfer Prepared." },
]);
const l3 = () => member("L3_37", "L3-37");
const vandor = () => member("YOUNGCHEWBACCA", "Vandor Chewbacca", [
  { id: "freedom", name: "Freedom Fighter", tier: 8, description: "Deal damage based on Max Health, recover Health and grant Protection Up. Prepared increases the effect." },
]);
const baylan = () => member("BAYLANSKOLL", "Baylan Skoll", [
  { id: "power", name: "Power. Such as You've Never Dreamed", tier: 8, description: "Dispel buffs on all enemies and Stun them; resisted Stun removes Turn Meter." },
]);
const shin = () => member("SHINHATI", "Shin Hati");
const marrok = () => member("MARROK", "Marrok");

const ids = ["bracca-zeffo-unlock", "corellia-qira", "kessel-qira-l3", "vandor-yhan"];

test("reward mission resolver owns exactly the four reward/unlock packs", () => {
  assert.deepEqual(Object.keys(ROTE_REWARD_BATTLE_STRATEGIES), ids);
  for (const id of ids) assert.equal(roteRewardBattleStrategyForMission(id), ROTE_REWARD_BATTLE_STRATEGIES[id]);
  for (const id of ["mandalore-bkm", "lothal-phoenix", "zeffo-clones", "mustafar-lv"]) assert.equal(roteRewardBattleStrategyForMission(id), null);
});

test("Bracca JKCK variant requires Cere leader and JKCK core", () => {
  const ready = evaluateBattleStrategy({ missionId: "bracca-zeffo-unlock", members: [cere(), jkck()] });
  assert.equal(ready.blockers.length, 0);
  assert.match(ready.summary, /Imperial Probe Droid/i);
  assert.match(JSON.stringify(ready.stages), /event-granted Special/i);
  assert.match(JSON.stringify(ready.stages), /Windmill Defense/i);

  const wrongLeader = evaluateBattleStrategy({ missionId: "bracca-zeffo-unlock", members: [jkck(), cere()] });
  assert.equal(wrongLeader.status, "blocked");
  assert.ok(wrongLeader.blockers.some((check) => check.type === "leader" && check.expected === "CEREJUNDA"));

  const missingJkck = evaluateBattleStrategy({ missionId: "bracca-zeffo-unlock", members: [cere()] });
  assert.equal(missingJkck.status, "blocked");
  assert.ok(missingJkck.blockers.some((check) => check.id === "JEDIKNIGHTCAL"));
});

test("Corellia Qi'ra strategy enforces mandatory core and exposes Coaxium logic", () => {
  const analysis = evaluateBattleStrategy({ missionId: "corellia-qira", members: [qira(), youngHan(), l3(), vandor()] });
  assert.equal(analysis.blockers.length, 0);
  assert.match(analysis.summary, /Coaxium/i);
  assert.ok(analysis.checks.some((check) => check.id === "QIRA" && check.required));
  assert.ok(analysis.checks.some((check) => check.id === "YOUNGHAN" && check.required));
  assert.ok(analysis.checks.some((check) => check.id === "L3_37" && !check.required));
  assert.match(JSON.stringify(analysis.stages), /Scattering Blast/);
});

test("Kessel Baylan variant encodes official Confuse/Recompute resource management", () => {
  const analysis = evaluateBattleStrategy({ missionId: "kessel-qira-l3", members: [baylan(), qira(), l3(), shin(), marrok()] });
  assert.equal(analysis.blockers.length, 0);
  assert.match(analysis.summary, /Confusing Tunnels/i);
  assert.match(JSON.stringify(analysis.stages), /Recompute/i);
  assert.match(JSON.stringify(analysis.stages), /buff gain/i);
  assert.match(JSON.stringify(analysis.stages), /assist\/counter\/bonus-Turn-Meter/i);
  assert.ok(analysis.checks.some((check) => check.label === "Power. Such as You've Never Dreamed" && check.ready));
});

test("Kessel strategy fails closed without Baylan or an official required unit", () => {
  const noBaylan = evaluateBattleStrategy({ missionId: "kessel-qira-l3", members: [qira(), l3(), shin(), marrok()] });
  assert.equal(noBaylan.status, "blocked");
  assert.ok(noBaylan.blockers.some((check) => check.type === "leader" && check.expected === "BAYLANSKOLL"));

  const noL3 = evaluateBattleStrategy({ missionId: "kessel-qira-l3", members: [baylan(), qira(), shin(), marrok()] });
  assert.equal(noL3.status, "blocked");
  assert.ok(noL3.blockers.some((check) => check.id === "L3_37"));
});

test("Vandor pack remains conservative while enforcing the mandatory Prepared core", () => {
  const analysis = evaluateBattleStrategy({ missionId: "vandor-yhan", members: [youngHan(), vandor(), qira()] });
  const strategy = ROTE_REWARD_BATTLE_STRATEGIES["vandor-yhan"];
  assert.equal(analysis.blockers.length, 0);
  assert.equal(analysis.strategyStatus, "kit-driven-conservative");
  assert.match(analysis.summary, /Sabacc Shift/i);
  assert.match(analysis.summary, /Health Up \(35%\)/i);
  assert.match(analysis.summary, /Boxed In/i);
  assert.match(analysis.summary, /Prepared/i);
  assert.match(JSON.stringify(analysis.stages), /Crate/i);
  assert.match(JSON.stringify(analysis.stages), /50% Health and Protection/i);
  assert.match(analysis.evidenceBoundary, /adaptive/i);
  assert.doesNotMatch(JSON.stringify(strategy), /\bdice\b|\broll\b/i);
  assert.ok(analysis.checks.some((check) => check.id === "YOUNGHAN" && check.required));
  assert.ok(analysis.checks.some((check) => check.id === "YOUNGCHEWBACCA" && check.required));
  assert.equal("winPercent" in analysis, false);
});

test("Vandor pack blocks when either official mandatory unit is absent", () => {
  const missingVandor = evaluateBattleStrategy({ missionId: "vandor-yhan", members: [youngHan(), qira()] });
  assert.equal(missingVandor.status, "blocked");
  assert.ok(missingVandor.blockers.some((check) => check.id === "YOUNGCHEWBACCA"));
});

test("reward packs preserve authoritative sourcing and prohibit fabricated odds", () => {
  for (const strategy of Object.values(ROTE_REWARD_BATTLE_STRATEGIES)) {
    assert.ok(strategy.sources.some((source) => source.kind === "official"));
    assert.ok(strategy.sources.some((source) => source.kind === "current-reference"));
    assert.ok(strategy.evidenceBoundary);
    assert.equal("winPercent" in strategy, false);
    assert.equal("score" in strategy, false);
    assert.equal("guaranteedWin" in strategy, false);
    assert.doesNotMatch(JSON.stringify(strategy), /\b(?:9\d|100)%\s*(?:win|clear)/i);
  }
});

test("reward strategy modules parse", () => {
  for (const path of [
    new URL("../public/tb-battle-strategy-rote-rewards-data.js", import.meta.url),
    new URL("../public/tb-battle-strategy.js", import.meta.url),
  ]) execFileSync(process.execPath, ["--check", path.pathname]);
});
