import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { extractAbilitySemantics } from "../public/kit-semantics.js";
import { mandaloreBattleStrategyForMission } from "../public/tb-battle-strategy-mandalore-data.js";
import {
  ROTE_PRIORITY_BATTLE_STRATEGIES,
  rotePriorityBattleStrategyForMission,
} from "../public/tb-battle-strategy-rote-priority-data.js";
import { evaluateBattleStrategy } from "../public/tb-battle-strategy.js";

function member(baseId, name, abilities = [], speed = null) {
  const rows = abilities.map((ability) => ({ ...ability, semantics: extractAbilitySemantics(ability) }));
  return {
    baseId,
    name,
    currentSpeed: speed,
    unit: { baseId, name, ...(speed == null ? {} : { speed }) },
    abilities: rows,
    staticUnit: { baseId, name, abilities: rows },
  };
}

function bkmUnlockMembers({ includeBam = true, leaderFirst = true } = {}) {
  const bkm = member("MANDALORBOKATAN", "Bo-Katan (Mand'alor)", [
    { id: "darksaber", name: "Darksaber Flourish", tier: 8, description: "Deal Physical and True damage, inflict Armor Shred and Stun." },
    { id: "reinforcements", name: "Reinforcements Have Arrived", tier: 8, description: "Dispel all debuffs from Light Side Mandalorian allies and call them to assist twice." },
  ], 280);
  const bam = member("THEMANDALORIANBESKARARMOR", "The Mandalorian (Beskar Armor)", [], 310);
  const ig12 = member("IG12", "IG-12 & Grogu");
  const rows = [bkm, ...(includeBam ? [bam] : []), ig12];
  return leaderFirst ? rows : [ig12, ...rows.filter((row) => row.baseId !== "IG12")];
}

function dtmgMembers({ leaderFirst = true } = {}) {
  const dtmg = member("MOFFGIDEONS3", "Dark Trooper Moff Gideon", [
    { id: "force_lance", name: "Force Lance", tier: 8, description: "Gain Insight and Stun the target if it had Daze, Offense Down, or Stagger." },
    { id: "unwavering", name: "Unwavering Presence", tier: 8, description: "Taunt, recover Health and Protection, call an ally to assist, and revive Imperial Remnant allies." },
  ]);
  const gideon = member("MOFFGIDEON", "Moff Gideon");
  const scout = member("SCOUTTROOPER", "Scout Trooper");
  const death = member("DEATHTROOPER", "Death Trooper");
  const storm = member("STORMTROOPER", "Stormtrooper");
  return leaderFirst ? [dtmg, gideon, scout, death, storm] : [gideon, dtmg, scout, death, storm];
}

function havenMembers({ leaderFirst = true } = {}) {
  const reva = member("THIRDSISTER", "Third Sister");
  const gi = member("GRANDINQUISITOR", "Grand Inquisitor");
  const fifth = member("FIFTHBROTHER", "Fifth Brother");
  const seventh = member("SEVENTHSISTER", "Seventh Sister");
  return leaderFirst ? [reva, gi, fifth, seventh] : [gi, reva, fifth, seventh];
}

const ids = ["tatooine-mandalore-unlock", "mandalore-dtmg", "haven-reva"];

test("priority resolver owns only the three missing mission ids", () => {
  assert.deepEqual(Object.keys(ROTE_PRIORITY_BATTLE_STRATEGIES), ids);
  for (const id of ids) assert.equal(rotePriorityBattleStrategyForMission(id), ROTE_PRIORITY_BATTLE_STRATEGIES[id]);
  assert.equal(rotePriorityBattleStrategyForMission("mandalore-bkm"), null);
  assert.ok(mandaloreBattleStrategyForMission("mandalore-bkm"), "existing BKM module must retain ownership");
  assert.equal(rotePriorityBattleStrategyForMission("tatooine-reva"), null);
});

test("Tatooine Mandalore unlock uses canonical BKM and BAM identifiers", () => {
  const strategy = ROTE_PRIORITY_BATTLE_STRATEGIES["tatooine-mandalore-unlock"];
  assert.equal(strategy.requiredLeaderBaseId, "MANDALORBOKATAN");
  assert.ok(strategy.keyUnits.some((row) => row.baseId === "THEMANDALORIANBESKARARMOR" && row.importance === "critical"));
  assert.doesNotMatch(JSON.stringify(strategy), /BOKATANMANDALORE|BESKARMANDO/);
});

test("Tatooine unlock recognizes the official required core and boss response", () => {
  const analysis = evaluateBattleStrategy({ missionId: "tatooine-mandalore-unlock", members: bkmUnlockMembers() });
  assert.equal(analysis.blockers.length, 0);
  assert.match(analysis.summary, /Fire Ballista/i);
  assert.match(JSON.stringify(analysis.stages), /Armor Shred/i);
  assert.ok(analysis.checks.some((check) => check.type === "speed-order" && check.ready === true));
  assert.equal("winPercent" in analysis, false);
});

test("Tatooine unlock blocks when the official Beskar Mando core is absent", () => {
  const analysis = evaluateBattleStrategy({ missionId: "tatooine-mandalore-unlock", members: bkmUnlockMembers({ includeBam: false }) });
  assert.equal(analysis.status, "blocked");
  assert.ok(analysis.blockers.some((check) => check.id === "THEMANDALORIANBESKARARMOR"));
});

test("DTMG pack uses canonical DTMG id and cross-checked Death Trooper shell", () => {
  const strategy = ROTE_PRIORITY_BATTLE_STRATEGIES["mandalore-dtmg"];
  assert.equal(strategy.requiredLeaderBaseId, "MOFFGIDEONS3");
  assert.ok(strategy.keyUnits.some((row) => row.baseId === "DEATHTROOPER"));
  assert.ok(!strategy.keyUnits.some((row) => row.baseId === "DARKTROOPER"));
  assert.match(strategy.evidenceBoundary, /cross-check/i);
});

test("DTMG battle plan exposes the two-wave threat order", () => {
  const analysis = evaluateBattleStrategy({ missionId: "mandalore-dtmg", members: dtmgMembers() });
  assert.equal(analysis.blockers.length, 0);
  assert.ok(analysis.targetPriorities.some((row) => row.target === "Maul" && row.priority === "critical"));
  assert.ok(analysis.targetPriorities.some((row) => row.target === "Bo-Katan (Mand'alor)" && row.priority === "critical"));
  assert.match(JSON.stringify(analysis.stages), /IG-12 & Grogu/);
  assert.equal("score" in analysis, false);
});

test("DTMG strategy variant fails closed when DTMG is not leader", () => {
  const analysis = evaluateBattleStrategy({ missionId: "mandalore-dtmg", members: dtmgMembers({ leaderFirst: false }) });
  assert.equal(analysis.status, "blocked");
  assert.ok(analysis.blockers.some((check) => check.type === "leader" && check.expected === "MOFFGIDEONS3"));
});

test("Haven Reva encodes official Brain Worm and Brain Freeze rules", () => {
  const analysis = evaluateBattleStrategy({ missionId: "haven-reva", members: havenMembers() });
  assert.equal(analysis.blockers.length, 0);
  assert.match(analysis.summary, /5% Health/i);
  assert.match(analysis.summary, /ignoring Protection|ignores Protection/i);
  assert.match(JSON.stringify(analysis.stages), /Brain Freeze/);
  assert.match(JSON.stringify(analysis.failureRisks), /prevents allied dispels|ordinary cleanse/i);
});

test("Haven pack is explicitly a Third Sister-led strategy variant", () => {
  const analysis = evaluateBattleStrategy({ missionId: "haven-reva", members: havenMembers({ leaderFirst: false }) });
  assert.equal(analysis.status, "blocked");
  assert.ok(analysis.blockers.some((check) => check.type === "leader" && check.expected === "THIRDSISTER"));
  assert.match(analysis.evidenceBoundary, /Brain Worm/i);
});

test("new packs preserve authoritative sourcing and avoid fabricated odds", () => {
  for (const strategy of Object.values(ROTE_PRIORITY_BATTLE_STRATEGIES)) {
    assert.ok(strategy.sources.some((source) => source.kind === "official" || source.kind === "current-reference"));
    assert.ok(strategy.evidenceBoundary);
    assert.equal("winPercent" in strategy, false);
    assert.equal("score" in strategy, false);
    assert.equal("guaranteedWin" in strategy, false);
    assert.doesNotMatch(JSON.stringify(strategy), /\b(?:9\d|100)%\s*(?:win|clear)/i);
  }
});

test("priority strategy modules parse", () => {
  for (const path of [
    new URL("../public/tb-battle-strategy-rote-priority-data.js", import.meta.url),
    new URL("../public/tb-battle-strategy.js", import.meta.url),
  ]) execFileSync(process.execPath, ["--check", path.pathname]);
});
