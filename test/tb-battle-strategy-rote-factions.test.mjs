import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { extractAbilitySemantics } from "../public/kit-semantics.js";
import { battleStrategyForMission } from "../public/tb-battle-strategy-data.js";
import {
  ROTE_FACTION_BATTLE_STRATEGIES,
  roteFactionBattleStrategyForMission,
} from "../public/tb-battle-strategy-rote-factions-data.js";
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

function phoenixMembers({ leaderFirst = true, includeRex = true } = {}) {
  const hera = member("HERASYNDULLAS3", "Hera Syndulla", [
    { id: "play_to_strengths", name: "Play to Strengths", tier: 8, description: "Call another target ally to assist. If target ally is Phoenix, dispel all debuffs, reduce cooldowns and grant Turn Meter." },
  ]);
  const rex = member("CAPTAINREX", "Captain Rex", [
    { id: "suppressing_fire", name: "Suppressing Fire", tier: 8, description: "Inflict Tenacity Down, Daze and Offense Down on all enemies. Phoenix allies gain Turn Meter for each debuff inflicted." },
    { id: "lost_commander", name: "The Lost Commander", tier: 8, description: "Whenever any other Phoenix ally uses a Special ability, Rex assists." },
  ]);
  const flex1 = member("PHOENIXFLEX1", "Phoenix Flex 1");
  const flex2 = member("PHOENIXFLEX2", "Phoenix Flex 2");
  const flex3 = member("PHOENIXFLEX3", "Phoenix Flex 3");
  const rows = [hera, ...(includeRex ? [rex] : []), flex1, flex2, flex3];
  return leaderFirst ? rows : [flex1, ...rows.filter((row) => row.baseId !== "PHOENIXFLEX1")];
}

function merrinMembers({ leaderFirst = true, includeMerrin = true } = {}) {
  const daka = member("DAKA", "Old Daka", [
    { id: "nightsister_elder", name: "Nightsister Elder", tier: 8, description: "Nightsister allies have +50% Health and +50% Defense." },
  ]);
  const merrin = member("MERRIN", "Merrin", [
    { id: "shadow_stride", name: "Shadow Stride", tier: 8, description: "Inflict Plague on all enemies, recover Nightsister Health and Protection, gain Magick Stealth, then cleanse allies and revive a Nightsister when triggered." },
    { id: "dathomir_grave", name: "Dathomir Will Be Your Grave", tier: 8, description: "Deal Special damage and Stun the target. On a defeat, inflict Plague on all enemies." },
  ]);
  const flex1 = member("NIGHTSFLEX1", "Nightsister Flex 1");
  const flex2 = member("NIGHTSFLEX2", "Nightsister Flex 2");
  const flex3 = member("NIGHTSFLEX3", "Nightsister Flex 3");
  const rows = [daka, ...(includeMerrin ? [merrin] : []), flex1, flex2, flex3];
  return leaderFirst ? rows : [flex1, ...rows.filter((row) => row.baseId !== "NIGHTSFLEX1")];
}

const ids = ["lothal-phoenix", "dathomir-merrin"];

test("ROTE faction resolver owns Phoenix and Merrin but not the existing Clone strategy", () => {
  assert.deepEqual(Object.keys(ROTE_FACTION_BATTLE_STRATEGIES), ids);
  for (const id of ids) assert.equal(roteFactionBattleStrategyForMission(id), ROTE_FACTION_BATTLE_STRATEGIES[id]);
  assert.equal(roteFactionBattleStrategyForMission("zeffo-clones"), null);
  assert.ok(battleStrategyForMission("zeffo-clones"), "existing Zeffo Clone strategy must retain ownership");
});

test("Phoenix strategy uses canonical Hera and Captain Rex identifiers", () => {
  const strategy = ROTE_FACTION_BATTLE_STRATEGIES["lothal-phoenix"];
  assert.equal(strategy.requiredLeaderBaseId, "HERASYNDULLAS3");
  assert.ok(strategy.keyUnits.some((row) => row.baseId === "CAPTAINREX"));
  assert.match(strategy.summary, /Rebellious/i);
  assert.match(strategy.summary, /Endless Ranks/i);
});

test("Hera-led Captain Rex Phoenix plan recognizes the Lothal assist engine", () => {
  const analysis = evaluateBattleStrategy({ missionId: "lothal-phoenix", members: phoenixMembers() });
  assert.equal(analysis.blockers.length, 0);
  assert.match(JSON.stringify(analysis.stages), /random Lothal assist/i);
  assert.match(JSON.stringify(analysis.stages), /shared revive pool/i);
  assert.ok(analysis.checks.some((check) => check.label === "Suppressing Fire" && check.ready));
  assert.ok(analysis.checks.some((check) => check.label === "The Lost Commander" && check.ready));
  assert.equal("winPercent" in analysis, false);
});

test("Phoenix strategy variant blocks a non-Hera leader but treats Captain Rex as advisory", () => {
  const wrongLeader = evaluateBattleStrategy({ missionId: "lothal-phoenix", members: phoenixMembers({ leaderFirst: false }) });
  assert.equal(wrongLeader.status, "blocked");
  assert.ok(wrongLeader.blockers.some((check) => check.type === "leader" && check.expected === "HERASYNDULLAS3"));

  const noRex = evaluateBattleStrategy({ missionId: "lothal-phoenix", members: phoenixMembers({ includeRex: false }) });
  assert.equal(noRex.blockers.length, 0);
  assert.ok(noRex.warnings.some((check) => check.id === "CAPTAINREX"));
});

test("Phoenix data explicitly prevents Suppressing Fire from being misclassified as Stun", () => {
  const strategy = ROTE_FACTION_BATTLE_STRATEGIES["lothal-phoenix"];
  const suppressing = strategy.keyAbilities.find((row) => row.abilityName === "Suppressing Fire");
  assert.match(suppressing.expected, /Tenacity Down/i);
  assert.match(suppressing.expected, /Daze/i);
  assert.doesNotMatch(suppressing.expected, /Stun/i);
  assert.match(JSON.stringify(strategy.failureRisks), /not a Stun/i);

  const clones = battleStrategyForMission("zeffo-clones");
  assert.ok(clones.keyAbilities.some((row) => row.abilityName === "Master Marksman" && row.importance === "critical"));
});

test("Dathomir Merrin pack uses the tested Old Daka survivability variant", () => {
  const strategy = ROTE_FACTION_BATTLE_STRATEGIES["dathomir-merrin"];
  assert.equal(strategy.requiredLeaderBaseId, "DAKA");
  assert.ok(strategy.keyUnits.some((row) => row.baseId === "MERRIN" && row.importance === "critical"));
  assert.match(strategy.summary, /\+50% Health and Defense/i);
  assert.match(strategy.summary, /Dark Magick/i);
});

test("Daka/Merrin strategy recognizes Plague recovery and Dash control", () => {
  const analysis = evaluateBattleStrategy({ missionId: "dathomir-merrin", members: merrinMembers() });
  assert.equal(analysis.blockers.length, 0);
  assert.ok(analysis.checks.some((check) => check.label === "Shadow Stride" && check.ready));
  assert.ok(analysis.checks.some((check) => check.label === "Dathomir Will Be Your Grave" && check.ready));
  assert.ok(analysis.targetPriorities.some((row) => row.target === "Dash Rendar" && row.priority === "critical"));
  assert.match(JSON.stringify(analysis.stages), /Every 10 turns/i);
  assert.equal("score" in analysis, false);
});

test("Dathomir strategy blocks wrong leader or missing mandatory Merrin", () => {
  const wrongLeader = evaluateBattleStrategy({ missionId: "dathomir-merrin", members: merrinMembers({ leaderFirst: false }) });
  assert.equal(wrongLeader.status, "blocked");
  assert.ok(wrongLeader.blockers.some((check) => check.type === "leader" && check.expected === "DAKA"));

  const noMerrin = evaluateBattleStrategy({ missionId: "dathomir-merrin", members: merrinMembers({ includeMerrin: false }) });
  assert.equal(noMerrin.status, "blocked");
  assert.ok(noMerrin.blockers.some((check) => check.id === "MERRIN"));
});

test("ROTE faction packs preserve source boundaries and avoid fabricated odds", () => {
  for (const strategy of Object.values(ROTE_FACTION_BATTLE_STRATEGIES)) {
    assert.ok(strategy.sources.some((source) => source.kind === "official"));
    assert.ok(strategy.sources.some((source) => source.kind === "current-reference"));
    assert.ok(strategy.evidenceBoundary);
    assert.equal("winPercent" in strategy, false);
    assert.equal("score" in strategy, false);
    assert.equal("guaranteedWin" in strategy, false);
    assert.doesNotMatch(JSON.stringify(strategy), /\b(?:9\d|100)%\s*(?:win|clear)/i);
  }
});

test("ROTE faction strategy modules parse", () => {
  for (const path of [
    new URL("../public/tb-battle-strategy-rote-factions-data.js", import.meta.url),
    new URL("../public/tb-battle-strategy.js", import.meta.url),
  ]) execFileSync(process.execPath, ["--check", path.pathname]);
});
