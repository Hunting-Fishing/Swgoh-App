import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { extractAbilitySemantics } from "../public/kit-semantics.js";
import { ROTE_NAMED_COMBAT_STRATEGIES, roteNamedCombatStrategyForMission } from "../public/tb-battle-strategy-rote-named-combat-data.js";
import { evaluateBattleStrategy } from "../public/tb-battle-strategy.js";

function member(baseId, name, abilities = []) {
  const rows = abilities.map((ability) => ({ ...ability, semantics: extractAbilitySemantics(ability) }));
  return { baseId, name, unit: { baseId, name }, abilities: rows, staticUnit: { baseId, name, abilities: rows } };
}

const ids = [
  "coruscant-mace-kit",
  "geonosis-geos",
  "felucia-lando",
  "bracca-jedi",
  "dathomir-empire",
  "dathomir-aphra",
  "lothal-jedi",
  "malachor-inqs",
  "kafrene-cassian",
  "scarif-baze",
  "scarif-cassian",
];

test("named combat resolver owns the remaining 11 specific ROTE combat ids", () => {
  assert.deepEqual(Object.keys(ROTE_NAMED_COMBAT_STRATEGIES), ids);
  for (const id of ids) assert.equal(roteNamedCombatStrategyForMission(id), ROTE_NAMED_COMBAT_STRATEGIES[id]);
  assert.equal(roteNamedCombatStrategyForMission("coruscant-jedi"), null);
  assert.equal(roteNamedCombatStrategyForMission("scarif-generic-1"), null);
});

test("Coruscant Mace/Kit pack preserves mandatory duo and three-stack Democracy execution", () => {
  const strategy = ROTE_NAMED_COMBAT_STRATEGIES["coruscant-mace-kit"];
  assert.ok(strategy.keyUnits.some((row) => row.baseId === "MACEWINDU" && row.importance === "critical"));
  assert.ok(strategy.keyUnits.some((row) => row.baseId === "KITFISTO" && row.importance === "critical"));
  assert.match(strategy.summary, /three No Confidence/i);
  assert.match(JSON.stringify(strategy.stages), /Democracy/i);
  assert.match(JSON.stringify(strategy.stages), /Galactic Legend|including a Galactic Legend/i);
});

test("Geonosis Geos pack uses GBA Hive Mind and Entertainment scaling", () => {
  const gba = member("GEONOSIANBROODALPHA", "Geonosian Brood Alpha", [
    { id: "conscription", name: "Conscription", tier: 8, description: "Dispel all debuffs on Geonosian allies, summon Brute, recover Health and Protection and gain Turn Meter." },
  ]);
  const analysis = evaluateBattleStrategy({ missionId: "geonosis-geos", members: [gba] });
  assert.equal(analysis.blockers.length, 0);
  assert.match(analysis.summary, /Entertainment/i);
  assert.match(analysis.summary, /10% Max Health, Offense and Potency/i);
  assert.match(JSON.stringify(analysis.stages), /Conscription/i);
});

test("Felucia Young Lando remains mandatory while the carry shell is advisory", () => {
  const strategy = ROTE_NAMED_COMBAT_STRATEGIES["felucia-lando"];
  assert.ok(strategy.keyUnits.some((row) => row.baseId === "YOUNGLANDO" && row.importance === "critical"));
  assert.ok(strategy.keyUnits.some((row) => row.baseId === "SUPREMELEADERKYLOREN" && row.importance === "helpful"));
  assert.equal(strategy.requiredLeaderBaseId, undefined);
  assert.match(strategy.summary, /Nysillin/i);
  assert.match(JSON.stringify(strategy.stages), /Dealer's Choice/i);
});

test("Bracca Jedi strips shared Endless Ranks rather than spreading damage", () => {
  const analysis = evaluateBattleStrategy({ missionId: "bracca-jedi", members: [] });
  assert.match(analysis.summary, /Endless Ranks/i);
  assert.match(JSON.stringify(analysis.stages), /one Endless Ranks stack from every Imperial Trooper/i);
  assert.match(JSON.stringify(analysis.stages), /Imperial Supremacy/i);
});

test("Dathomir Empire and Aphra packs plan around the 10-turn mass revive", () => {
  for (const id of ["dathomir-empire", "dathomir-aphra"]) {
    const analysis = evaluateBattleStrategy({ missionId: id, members: id === "dathomir-aphra" ? [member("DOCTORAPHRA", "Doctor Aphra")] : [] });
    assert.match(analysis.summary, /10 turns/i);
    assert.match(JSON.stringify(analysis.stages), /50% Health/i);
    assert.match(JSON.stringify(analysis.stages), /synchronized|post-revive/i);
  }
  assert.equal(ROTE_NAMED_COMBAT_STRATEGIES["dathomir-aphra"].requiredLeaderBaseId, "DOCTORAPHRA");
});

test("Lothal Jedi combines Rebellious scaling with Endless Ranks", () => {
  const strategy = ROTE_NAMED_COMBAT_STRATEGIES["lothal-jedi"];
  assert.match(strategy.summary, /random ally to assist/i);
  assert.match(strategy.summary, /20 stacks/i);
  assert.match(strategy.summary, /30% Offense/i);
  assert.match(JSON.stringify(strategy.stages), /Endless Ranks/i);
});

test("Malachor pack preserves the exact mandatory trio and health-threshold danger", () => {
  const strategy = ROTE_NAMED_COMBAT_STRATEGIES["malachor-inqs"];
  for (const baseId of ["EIGHTHBROTHER", "FIFTHBROTHER", "SEVENTHSISTER"]) {
    assert.ok(strategy.keyUnits.some((row) => row.baseId === baseId && row.importance === "critical"));
  }
  assert.match(strategy.summary, /Drain Essence/i);
  assert.match(strategy.summary, /below 40%/i);
  assert.match(strategy.summary, /above 70%/i);
  assert.match(JSON.stringify(strategy.failureRisks), /permanent Offense/i);
});

test("Kafrene Cassian/K-2SO pack protects the surviving Informant", () => {
  const strategy = ROTE_NAMED_COMBAT_STRATEGIES["kafrene-cassian"];
  assert.ok(strategy.keyUnits.some((row) => row.baseId === "CASSIANANDOR" && row.importance === "critical"));
  assert.ok(strategy.keyUnits.some((row) => row.baseId === "K2SO" && row.importance === "critical"));
  assert.match(strategy.summary, /Informant/i);
  assert.match(JSON.stringify(strategy.stages), /critical-hit|critical hit/i);
  assert.match(JSON.stringify(strategy.targetPriorities), /Enemy Informant/i);
});

test("Scarif packs preserve mandatory cores and the 10-turn massive-damage pulse", () => {
  const baze = ROTE_NAMED_COMBAT_STRATEGIES["scarif-baze"];
  for (const baseId of ["BAZEMALBUS", "CHIRRUTIMWE", "SCARIFREBEL"]) {
    assert.ok(baze.keyUnits.some((row) => row.baseId === baseId && row.importance === "critical"));
  }
  const cassian = ROTE_NAMED_COMBAT_STRATEGIES["scarif-cassian"];
  for (const baseId of ["CASSIANANDOR", "PAO", "K2SO"]) {
    assert.ok(cassian.keyUnits.some((row) => row.baseId === baseId && row.importance === "critical"));
  }
  for (const strategy of [baze, cassian]) {
    assert.match(strategy.summary, /10 turns/i);
    assert.match(strategy.summary, /massive unavoidable damage/i);
    assert.match(JSON.stringify(strategy.stages), /Hope/i);
    assert.match(JSON.stringify(strategy.stages), /Endless Ranks/i);
  }
});

test("named combat packs retain source boundaries and never fabricate win odds", () => {
  for (const strategy of Object.values(ROTE_NAMED_COMBAT_STRATEGIES)) {
    assert.ok(strategy.sources.some((source) => source.kind === "official"));
    assert.ok(strategy.evidenceBoundary);
    assert.equal("winPercent" in strategy, false);
    assert.equal("score" in strategy, false);
    assert.equal("guaranteedWin" in strategy, false);
  }
});

test("named combat modules parse", () => {
  for (const path of [
    new URL("../public/tb-battle-strategy-rote-named-combat-data.js", import.meta.url),
    new URL("../public/tb-battle-strategy.js", import.meta.url),
  ]) execFileSync(process.execPath, ["--check", path.pathname]);
});
