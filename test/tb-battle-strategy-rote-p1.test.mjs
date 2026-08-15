import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { extractAbilitySemantics } from "../public/kit-semantics.js";
import {
  ROTE_P1_BATTLE_STRATEGIES,
  rotePhaseOneBattleStrategyForMission,
} from "../public/tb-battle-strategy-rote-p1-data.js";
import { evaluateBattleStrategy } from "../public/tb-battle-strategy.js";

function member(baseId, name, abilities = []) {
  const rows = abilities.map((ability) => ({ ...ability, semantics: extractAbilitySemantics(ability) }));
  return {
    baseId,
    name,
    unit: { baseId, name },
    abilities: rows,
    staticUnit: { baseId, name, abilities: rows },
  };
}

function lvMembers({ leaderFirst = true } = {}) {
  const lv = member("LORDVADER", "Lord Vader", [
    { id: "dark_harbinger", name: "Dark Harbinger", tier: 3, description: "Inflict Buff Immunity and Healing Immunity and gain Ultimate Charge." },
    { id: "unshackled_emotions", name: "Unshackled Emotions", tier: 3, description: "Deal damage to all enemies and inflict Daze and Damage Over Time effects." },
  ]);
  const maul = member("MAUL", "Maul");
  const rg = member("ROYALGUARD", "Royal Guard");
  const piett = member("ADMIRALPIETT", "Admiral Piett");
  const vader = member("VADER", "Darth Vader");
  return leaderFirst ? [lv, maul, rg, piett, vader] : [vader, lv, maul, rg, piett];
}

function jabbaMembers({ leaderFirst = true } = {}) {
  const jabba = member("JABBATHEHUTT", "Jabba the Hutt", [
    { id: "crumbs_revenge", name: "Crumb's Revenge", tier: 3, description: "Inflict Thermal Detonators on all enemies." },
  ]);
  const boushh = member("BOUSHH", "Boushh (Leia Organa)");
  const krrsantan = member("KRRSANTAN", "Krrsantan");
  return leaderFirst ? [jabba, boushh, krrsantan] : [boushh, jabba, krrsantan];
}

function aphraMembers({ leaderFirst = true, rogueArchaeology = true } = {}) {
  const aphra = member("DOCTORAPHRA", "Doctor Aphra", [
    ...(rogueArchaeology ? [{ id: "rogue_archaeology", name: "Rogue Archaeology", tier: 8, description: "Increase enemy cooldowns and inflict Doubt." }] : []),
    { id: "dangerous_tech", name: "Dangerous Tech", tier: 8, description: "Grant Potency Up and Turn Meter and recover Dark Side Droid allies." },
  ]);
  const bt1 = member("BT1", "BT-1");
  const tripleZero = member("TRIPLEZERO", "0-0-0");
  const vader = member("VADER", "Darth Vader");
  const krrsantan = member("KRRSANTAN", "Krrsantan");
  return leaderFirst ? [aphra, bt1, tripleZero, vader, krrsantan] : [vader, aphra, bt1, tripleZero, krrsantan];
}

function jmlMembers({ leaderFirst = true } = {}) {
  const jml = member("GRANDMASTERLUKE", "Jedi Master Luke Skywalker", [
    { id: "efflux", name: "Efflux", tier: 3, description: "Deal Special damage to all enemies and provide Jedi control." },
  ]);
  const jkl = member("JEDIKNIGHTLUKE", "Jedi Knight Luke Skywalker", [
    { id: "repulse", name: "Repulse", tier: 8, description: "Deal Physical damage to all enemies and inflict Stun." },
  ]);
  const jkr = member("JEDIKNIGHTREVAN", "Jedi Knight Revan");
  const hyoda = member("HERMITYODA", "Hermit Yoda");
  const jkck = member("JEDIKNIGHTCAL", "Jedi Knight Cal Kestis");
  return leaderFirst ? [jml, jkl, jkr, hyoda, jkck] : [jkl, jml, jkr, hyoda, jkck];
}

const ids = ["mustafar-lv", "corellia-jabba", "corellia-aphra", "coruscant-jedi"];

test("priority ROTE phase one strategy pack resolves only its mission ids", () => {
  assert.deepEqual(Object.keys(ROTE_P1_BATTLE_STRATEGIES), ids);
  for (const id of ids) assert.equal(rotePhaseOneBattleStrategyForMission(id), ROTE_P1_BATTLE_STRATEGIES[id]);
  assert.equal(rotePhaseOneBattleStrategyForMission("tatooine-reva"), null);
  assert.equal(rotePhaseOneBattleStrategyForMission("s3"), null);
});

test("Lord Vader strategy recognizes a complete LV-led advisory squad", () => {
  const analysis = evaluateBattleStrategy({ missionId: "mustafar-lv", members: lvMembers() });
  assert.equal(analysis.available, true);
  assert.equal(analysis.blockers.length, 0);
  assert.ok(analysis.stages.some((entry) => entry.id === "lava-opening"));
  assert.match(analysis.summary, /Lava Fields/i);
  assert.equal("winPercent" in analysis, false);
});

test("Lord Vader strategy fails closed when Lord Vader is not leader", () => {
  const analysis = evaluateBattleStrategy({ missionId: "mustafar-lv", members: lvMembers({ leaderFirst: false }) });
  assert.equal(analysis.status, "blocked");
  assert.ok(analysis.blockers.some((check) => check.type === "leader" && check.expected === "LORDVADER"));
});

test("Jabba strategy preserves the Wave 2 Qi'ra execution plan", () => {
  const analysis = evaluateBattleStrategy({ missionId: "corellia-jabba", members: jabbaMembers() });
  assert.equal(analysis.blockers.length, 0);
  assert.ok(analysis.targetPriorities.some((item) => item.target === "Qi'ra" && item.priority === "critical"));
  assert.match(JSON.stringify(analysis.stages), /There Will Be No Bargain/);
  assert.match(analysis.summary, /Coaxium/i);
});

test("Aphra strategy requires the sourced Rogue Archaeology control tool", () => {
  const ready = evaluateBattleStrategy({ missionId: "corellia-aphra", members: aphraMembers() });
  assert.equal(ready.blockers.length, 0);
  assert.ok(ready.checks.some((check) => check.label === "Rogue Archaeology" && check.ready));

  const missing = evaluateBattleStrategy({ missionId: "corellia-aphra", members: aphraMembers({ rogueArchaeology: false }) });
  assert.equal(missing.status, "blocked");
  assert.ok(missing.blockers.some((check) => check.label === "Rogue Archaeology"));
});

test("JML strategy encodes the Coruscant enemy-leader 1 percent gate", () => {
  const analysis = evaluateBattleStrategy({ missionId: "coruscant-jedi", members: jmlMembers() });
  assert.equal(analysis.blockers.length, 0);
  assert.match(analysis.summary, /1% Health/i);
  assert.deepEqual(analysis.targetPriorities.slice(0, 2).map((item) => item.target), ["Enemy supporting units", "Enemy leader"]);
  assert.match(JSON.stringify(analysis.stages), /Democracy/);
  assert.equal("score" in analysis, false);
});

test("JML strategy fails closed for a non-JML leader", () => {
  const analysis = evaluateBattleStrategy({ missionId: "coruscant-jedi", members: jmlMembers({ leaderFirst: false }) });
  assert.equal(analysis.status, "blocked");
  assert.ok(analysis.blockers.some((check) => check.type === "leader" && check.expected === "GRANDMASTERLUKE"));
});

test("ROTE phase one strategies keep evidence boundaries and avoid fabricated odds", () => {
  for (const strategy of Object.values(ROTE_P1_BATTLE_STRATEGIES)) {
    assert.ok(strategy.sources.some((source) => source.kind === "official" || source.kind === "current-reference"));
    assert.match(strategy.evidenceBoundary, /(official|current|community)/i);
    const text = JSON.stringify(strategy);
    assert.doesNotMatch(text, /100% win|guaranteed clear|win probability/i);
  }
});

test("ROTE phase one strategy modules parse", () => {
  for (const path of [
    new URL("../public/tb-battle-strategy-rote-p1-data.js", import.meta.url),
    new URL("../public/tb-battle-strategy.js", import.meta.url),
  ]) execFileSync(process.execPath, ["--check", path.pathname]);
});
