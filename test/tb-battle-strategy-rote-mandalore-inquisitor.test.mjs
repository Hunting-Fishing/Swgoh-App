import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { extractAbilitySemantics } from "../public/kit-semantics.js";
import {
  ROTE_MANDALORE_INQUISITOR_STRATEGIES,
  roteMandaloreInquisitorStrategyForMission,
} from "../public/tb-battle-strategy-rote-mandalore-inquisitor-data.js";
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

function bkmAbilities() {
  return [
    { id: "darksaber_flourish", name: "Darksaber Flourish", tier: 8, description: "Deal damage, inflict Armor Shred, deal True damage and Stun." },
    { id: "reinforcements", name: "Reinforcements Have Arrived", tier: 8, description: "Dispel all debuffs from Light Side Mandalorian allies, call them to assist, and grant Ancestral Resolve." },
  ];
}

function bkmUnlockMembers({ leaderFirst = true, includeBam = true } = {}) {
  const bkm = member("MANDALORBOKATAN", "Bo-Katan (Mand'alor)", bkmAbilities());
  const bam = member("THEMANDALORIANBESKARARMOR", "The Mandalorian (Beskar Armor)");
  const ig12 = member("IG12", "IG-12 & Grogu");
  const rows = [bkm, ...(includeBam ? [bam] : []), ig12];
  return leaderFirst ? rows : [ig12, ...rows.filter((row) => row.baseId !== "IG12")];
}

function bkmMandaloreMembers({ leaderFirst = true } = {}) {
  const bkm = member("MANDALORBOKATAN", "Bo-Katan (Mand'alor)", bkmAbilities());
  const bam = member("THEMANDALORIANBESKARARMOR", "The Mandalorian (Beskar Armor)");
  const paz = member("PAZVIZSLA", "Paz Vizsla");
  const ig12 = member("IG12", "IG-12 & Grogu");
  const armorer = member("ARMORER", "The Armorer");
  return leaderFirst ? [bkm, bam, paz, ig12, armorer] : [paz, bkm, bam, ig12, armorer];
}

function dtmgMembers({ leaderFirst = true } = {}) {
  const dtmg = member("MOFFGIDEONS3", "Dark Trooper Moff Gideon", [
    { id: "force_lance", name: "Force Lance", tier: 8, description: "Gain Insight and Stun if target had Daze, Offense Down, or Stagger." },
    { id: "unwavering_presence", name: "Unwavering Presence", tier: 8, description: "Taunt, recover Health and Protection, call an ally to assist, and revive Imperial Remnant allies." },
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
  const marrok = member("MARROK", "Marrok");
  return leaderFirst ? [reva, gi, fifth, seventh, marrok] : [gi, reva, fifth, seventh, marrok];
}

const ids = ["tatooine-mandalore-unlock", "mandalore-bkm", "mandalore-dtmg", "haven-reva"];

test("Mandalore/Inquisitor priority resolver owns only its mission ids", () => {
  assert.deepEqual(Object.keys(ROTE_MANDALORE_INQUISITOR_STRATEGIES), ids);
  for (const id of ids) assert.equal(roteMandaloreInquisitorStrategyForMission(id), ROTE_MANDALORE_INQUISITOR_STRATEGIES[id]);
  assert.equal(roteMandaloreInquisitorStrategyForMission("tatooine-reva"), null);
  assert.equal(roteMandaloreInquisitorStrategyForMission("mustafar-lv"), null);
});

test("Tatooine Mandalore unlock uses canonical BKM and BAM base IDs", () => {
  const strategy = ROTE_MANDALORE_INQUISITOR_STRATEGIES["tatooine-mandalore-unlock"];
  assert.equal(strategy.requiredLeaderBaseId, "MANDALORBOKATAN");
  assert.ok(strategy.keyUnits.some((row) => row.baseId === "THEMANDALORIANBESKARARMOR" && row.importance === "critical"));
  assert.doesNotMatch(JSON.stringify(strategy), /BOKATANMANDALORE|BESKARMANDO/);
});

test("Tatooine Mandalore unlock blocks when the official BAM core is absent", () => {
  const ready = evaluateBattleStrategy({ missionId: "tatooine-mandalore-unlock", members: bkmUnlockMembers() });
  assert.equal(ready.blockers.length, 0);
  assert.match(ready.summary, /Fire Ballista/i);
  assert.match(JSON.stringify(ready.stages), /Armor Shred/);

  const missing = evaluateBattleStrategy({ missionId: "tatooine-mandalore-unlock", members: bkmUnlockMembers({ includeBam: false }) });
  assert.equal(missing.status, "blocked");
  assert.ok(missing.blockers.some((check) => check.id === "THEMANDALORIANBESKARARMOR"));
});

test("BKM Mandalore pack keeps optional Mandalorians advisory", () => {
  const analysis = evaluateBattleStrategy({ missionId: "mandalore-bkm", members: bkmMandaloreMembers() });
  assert.equal(analysis.blockers.length, 0);
  assert.match(analysis.summary, /Ancestral Resolve/i);
  assert.ok(analysis.checks.some((check) => check.id === "PAZVIZSLA" && check.required === false));
  assert.equal("winPercent" in analysis, false);
});

test("BKM Mandalore pack fails the BKM-led strategy variant with another leader", () => {
  const analysis = evaluateBattleStrategy({ missionId: "mandalore-bkm", members: bkmMandaloreMembers({ leaderFirst: false }) });
  assert.equal(analysis.status, "blocked");
  assert.ok(analysis.blockers.some((check) => check.type === "leader" && check.expected === "MANDALORBOKATAN"));
});

test("DTMG pack uses canonical DTMG id and cross-checked Death Trooper composition", () => {
  const strategy = ROTE_MANDALORE_INQUISITOR_STRATEGIES["mandalore-dtmg"];
  assert.equal(strategy.requiredLeaderBaseId, "MOFFGIDEONS3");
  assert.ok(strategy.keyUnits.some((row) => row.baseId === "DEATHTROOPER"));
  assert.ok(!strategy.keyUnits.some((row) => row.baseId === "DARKTROOPER"));
  assert.match(strategy.evidenceBoundary, /inconsistency|cross-check/i);
});

test("DTMG strategy exposes the Mandalore two-wave threat order", () => {
  const analysis = evaluateBattleStrategy({ missionId: "mandalore-dtmg", members: dtmgMembers() });
  assert.equal(analysis.blockers.length, 0);
  assert.ok(analysis.targetPriorities.some((row) => row.target === "Maul" && row.priority === "critical"));
  assert.ok(analysis.targetPriorities.some((row) => row.target === "Bo-Katan (Mand'alor)" && row.priority === "critical"));
  assert.match(JSON.stringify(analysis.stages), /IG-12 & Grogu/);
  assert.equal("score" in analysis, false);
});

test("DTMG strategy fails closed when DTMG is not leader", () => {
  const analysis = evaluateBattleStrategy({ missionId: "mandalore-dtmg", members: dtmgMembers({ leaderFirst: false }) });
  assert.equal(analysis.status, "blocked");
  assert.ok(analysis.blockers.some((check) => check.type === "leader" && check.expected === "MOFFGIDEONS3"));
});

test("Haven Reva variant encodes official Brain Worm and Brain Freeze rules", () => {
  const analysis = evaluateBattleStrategy({ missionId: "haven-reva", members: havenMembers() });
  assert.equal(analysis.blockers.length, 0);
  assert.match(analysis.summary, /5% Health/i);
  assert.match(analysis.summary, /ignoring Protection|ignores Protection/i);
  assert.match(JSON.stringify(analysis.stages), /Brain Freeze/);
  assert.match(JSON.stringify(analysis.failureRisks), /immune to allied dispels/i);
});

test("Haven Reva strategy is explicitly a Third Sister-led variant", () => {
  const analysis = evaluateBattleStrategy({ missionId: "haven-reva", members: havenMembers({ leaderFirst: false }) });
  assert.equal(analysis.status, "blocked");
  assert.ok(analysis.blockers.some((check) => check.type === "leader" && check.expected === "THIRDSISTER"));
  assert.match(analysis.evidenceBoundary, /Brain Worm/i);
});

test("new priority packs preserve evidence boundaries without fabricated odds", () => {
  for (const strategy of Object.values(ROTE_MANDALORE_INQUISITOR_STRATEGIES)) {
    assert.ok(strategy.sources.some((source) => source.kind === "official" || source.kind === "current-reference"));
    assert.ok(strategy.evidenceBoundary);
    assert.equal("winPercent" in strategy, false);
    assert.equal("score" in strategy, false);
    assert.equal("guaranteedWin" in strategy, false);
    assert.doesNotMatch(JSON.stringify(strategy), /\b(?:9\d|100)%\s*(?:win|clear)/i);
  }
});

test("Mandalore/Inquisitor strategy modules parse", () => {
  for (const path of [
    new URL("../public/tb-battle-strategy-rote-mandalore-inquisitor-data.js", import.meta.url),
    new URL("../public/tb-battle-strategy.js", import.meta.url),
  ]) execFileSync(process.execPath, ["--check", path.pathname]);
});
