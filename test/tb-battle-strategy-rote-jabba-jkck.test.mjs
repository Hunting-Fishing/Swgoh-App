import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { extractAbilitySemantics } from "../public/kit-semantics.js";
import { ROTE_JABBA_JKCK_STRATEGIES, roteJabbaJkckStrategyForMission } from "../public/tb-battle-strategy-rote-jabba-jkck-data.js";
import { evaluateBattleStrategy } from "../public/tb-battle-strategy.js";

function member(baseId, name, abilities = []) {
  const rows = abilities.map((ability) => ({ ...ability, semantics: extractAbilitySemantics(ability) }));
  return { baseId, name, unit: { baseId, name }, abilities: rows, staticUnit: { baseId, name, abilities: rows } };
}

const ids = ["zeffo-jkck", "felucia-jabba", "tatooine-jabba", "kessel-jabba", "vandor-jabba", "hoth-jabba"];

test("JKCK/Jabba resolver owns the six new mission packs", () => {
  assert.deepEqual(Object.keys(ROTE_JABBA_JKCK_STRATEGIES), ids);
  for (const id of ids) assert.equal(roteJabbaJkckStrategyForMission(id), ROTE_JABBA_JKCK_STRATEGIES[id]);
  assert.equal(roteJabbaJkckStrategyForMission("corellia-jabba"), null);
});

test("Jabba packs use the canonical Skiff Guard identifier", () => {
  const strategy = ROTE_JABBA_JKCK_STRATEGIES["felucia-jabba"];
  assert.ok(strategy.keyUnits.some((row) => row.baseId === "UNDERCOVERLANDO" && /Skiff Guard/i.test(row.name)));
  assert.ok(!strategy.keyUnits.some((row) => row.baseId === "SKIFFGUARD"));
});

test("Zeffo JKCK uses Impetuous execution but never requires the TB Omicron", () => {
  const jkck = member("JEDIKNIGHTCAL", "Jedi Knight Cal Kestis", [
    { id: "whirlwind", name: "Whirlwind Slam", tier: 8, description: "Gain Configuration - Double-Bladed and Impetuous. Stun and Armor Shred enemies." },
    { id: "windmill", name: "Windmill Defense", tier: 8, description: "Dispel all debuffs on allies, call an assist, gain Protection Up and Impetuous." },
    { id: "assault", name: "Impetuous Assault", tier: 8, hasOmicron: false, description: "Requires 30 stacks of Impetuous. The first use instantly defeats target enemy." },
  ]);
  const analysis = evaluateBattleStrategy({ missionId: "zeffo-jkck", members: [jkck] });
  assert.equal(analysis.blockers.length, 0);
  assert.match(analysis.summary, /30 stacks/i);
  assert.match(analysis.summary, /without.*Omicron|Omicron.*enhancement/i);
  assert.ok(!analysis.checks.some((check) => check.requiresOmicron === true));
  assert.match(JSON.stringify(analysis.stages), /Impetuous Assault/i);
});

test("Felucia Jabba respects Nysillin Buff Immunity immunity", () => {
  const jabba = member("JABBATHEHUTT", "Jabba the Hutt", [
    { id: "crumb", name: "Crumb's Revenge", tier: 3, description: "Inflict Thermal Detonators and Buff Immunity." },
    { id: "ult", name: "There Will Be No Bargain", tier: 1, description: "Instantly defeat target enemy and recover allies." },
  ]);
  const analysis = evaluateBattleStrategy({ missionId: "felucia-jabba", members: [jabba] });
  assert.equal(analysis.blockers.length, 0);
  assert.match(analysis.summary, /Heal Over Time/i);
  assert.match(analysis.summary, /immunity to Buff Immunity/i);
});

test("Tatooine Jabba treats Sandstorm as unavoidable attrition", () => {
  const analysis = evaluateBattleStrategy({ missionId: "tatooine-jabba", members: [member("JABBATHEHUTT", "Jabba the Hutt")] });
  assert.equal(analysis.blockers.length, 0);
  assert.match(analysis.summary, /unavoidable/i);
  assert.match(analysis.summary, /full Health\/Protection|full Health and Protection/i);
  assert.match(JSON.stringify(analysis.stages), /does not disable future environmental DoTs/i);
});

test("Kessel Jabba explicitly manages Confuse thresholds and Recompute", () => {
  const analysis = evaluateBattleStrategy({ missionId: "kessel-jabba", members: [member("JABBATHEHUTT", "Jabba the Hutt")] });
  assert.match(analysis.summary, /at 2 it cannot counter, assist or gain bonus Turn Meter/i);
  assert.match(JSON.stringify(analysis.stages), /Recompute/i);
  assert.match(JSON.stringify(analysis.failureRisks), /2-3 Confuse/i);
});

test("Vandor Jabba preserves official Crate recovery and Sabacc interpretation", () => {
  const analysis = evaluateBattleStrategy({ missionId: "vandor-jabba", members: [member("JABBATHEHUTT", "Jabba the Hutt")] });
  assert.match(analysis.summary, /50% Health and Protection/i);
  assert.match(JSON.stringify(analysis.failureRisks), /cannot be prevented|unpreventable/i);
  assert.match(JSON.stringify(analysis.failureRisks), /Health Up\/Health Down/i);
  assert.doesNotMatch(JSON.stringify(analysis), /dice roll|attack roll/i);
});

test("Hoth Jabba owns Deadly Storm while Death Star does not", () => {
  const hoth = evaluateBattleStrategy({ missionId: "hoth-jabba", members: [member("JABBATHEHUTT", "Jabba the Hutt")] });
  const deathStar = evaluateBattleStrategy({ missionId: "death-star-vader", members: [member("VADER", "Darth Vader")] });
  assert.match(hoth.summary, /Frostbite/i);
  assert.match(hoth.summary, /Deadly Storm/i);
  assert.match(JSON.stringify(hoth.stages), /Thermoregulate/i);
  assert.match(JSON.stringify(hoth.stages), /Smells Bad on the Outside/i);
  assert.doesNotMatch(deathStar.summary, /Deadly Storm/i);
});

test("new packs preserve evidence boundaries and avoid fabricated odds", () => {
  for (const strategy of Object.values(ROTE_JABBA_JKCK_STRATEGIES)) {
    assert.ok(strategy.sources.some((source) => source.kind === "official"));
    assert.ok(strategy.sources.some((source) => source.kind === "current-reference"));
    assert.ok(strategy.evidenceBoundary);
    assert.equal("winPercent" in strategy, false);
    assert.equal("score" in strategy, false);
    assert.equal("guaranteedWin" in strategy, false);
  }
});

test("JKCK/Jabba modules parse", () => {
  for (const path of [
    new URL("../public/tb-battle-strategy-rote-jabba-jkck-data.js", import.meta.url),
    new URL("../public/tb-battle-strategy.js", import.meta.url),
  ]) execFileSync(process.execPath, ["--check", path.pathname]);
});
