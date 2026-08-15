import assert from "node:assert/strict";
import { extractAbilitySemantics } from "../public/kit-semantics.js";
import { battleStrategyForMission } from "../public/tb-battle-strategy-data.js";
import { watBattleStrategyForMission } from "../public/tb-battle-strategy-wat-data.js";
import { rotePhaseOneBattleStrategyForMission } from "../public/tb-battle-strategy-rote-p1-data.js";
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

function kamMembers(fivesZeta = true) {
  return [
    member("SHAAKTI", "Shaak Ti", [
      { id: "training", name: "Training Exercises", tier: 8, description: "Call target ally to assist and recover Health and Protection." },
      { id: "assault", name: "Assault Team", tier: 8, description: "Dispel all debuffs on all allies and call Clone Trooper allies to assist." },
    ]),
    member("ARCTROOPER501ST", "ARC Trooper", [{ id: "assign_command", name: "Assign Command", tier: 8, description: "Grant Command to target other Clone Trooper ally." }]),
    member("CT7567", "CT-7567 'Rex'", [
      { id: "form_up", name: "Form Up", tier: 8, description: "Dispel all debuffs on all allies and grant them Tenacity Up for 3 turns." },
      { id: "aerial_advantage", name: "Aerial Advantage", tier: 8, description: "Deal Physical damage to target enemy and bonus damage based on Max Health." },
    ]),
    member("CT5555", "CT-5555 'Fives'", [{ id: "tactical_awareness", name: "Tactical Awareness", tier: 8, hasZeta: fivesZeta, description: "When another 501st Clone Trooper ally would be defeated, Fives is defeated instead and allies gain his stats." }]),
    member("CT210408", "CT-21-0408 'Echo'", [{ id: "emp_grenade", name: "EMP Grenade", tier: 8, description: "Deal Special damage to all enemies and dispel all buffs on all enemies." }]),
  ];
}

function watMembers() {
  return [
    member("GEONOSIANBROODALPHA", "Geonosian Brood Alpha", [
      { id: "conscription", name: "Conscription", tier: 8, description: "Dispel all debuffs on all Geonosian allies. Summon a Geonosian Brute. All Geonosian allies gain Turn Meter and recover Health and Protection." },
      { id: "queens_will", name: "Queen's Will", tier: 8, description: "All Geonosian allies have Hive Mind while Geonosian Brood Alpha is active." },
    ]),
    member("POGGLETHELESSER", "Poggle the Lesser", [{ id: "martial_doom", name: "Martial Doom", tier: 8, description: "Deal Physical damage to target enemy with an 80% chance to inflict Ability Block for 1 turn." }]),
    member("GEONOSIANSOLDIER", "Geonosian Soldier", [{ id: "aggressive_advance", name: "Aggressive Advance", tier: 8, description: "Deal Physical damage to target enemy and inflict Tenacity Down for 2 turns." }]),
    member("GEONOSIANSPY", "Geonosian Spy", [{ id: "silent_strike", name: "Silent Strike", tier: 8, description: "Deal Physical damage to target enemy and dispel status effects from the target." }]),
    member("SUNFAC", "Sun Fac", [{ id: "browbeat", name: "Browbeat", tier: 8, description: "Deal Physical damage to target enemy and dispel all buffs on them." }]),
  ];
}

const corePackIds = ["zeffo-clones", "tatooine-reva", "p3-kam"];
for (const id of corePackIds) assert.ok(battleStrategyForMission(id), `${id} strategy pack missing`);
assert.ok(watBattleStrategyForMission("s3"), "s3 Wat strategy pack missing");

const roteP1PackIds = ["mustafar-lv", "corellia-jabba", "corellia-aphra", "coruscant-jedi"];
for (const id of roteP1PackIds) {
  const strategy = rotePhaseOneBattleStrategyForMission(id);
  assert.ok(strategy, `${id} ROTE Phase 1 strategy pack missing`);
  assert.ok(Array.isArray(strategy.sources) && strategy.sources.length > 0, `${id} strategy sources missing`);
  assert.ok(strategy.evidenceBoundary, `${id} evidence boundary missing`);
}

const statusSemantics = extractAbilitySemantics({ description: "Inflict Purge and Thermal Detonator on target enemy." });
assert.ok(statusSemantics.debuffs.includes("Purge"), "Purge semantic recognition missing");
assert.ok(statusSemantics.debuffs.includes("Thermal Detonator"), "Thermal Detonator semantic recognition missing");

const rex = member("CAPTAINREX", "Captain Rex", [{
  id: "master_marksman",
  name: "Master Marksman",
  description: "Deal Physical damage to target enemy and Stun them for 1 turn.",
}]);
const zeffo = evaluateBattleStrategy({ missionId: "zeffo-clones", members: [rex] });
assert.equal(zeffo.status, "ready", "Zeffo strategy should recognize Captain Rex Stun");
assert.equal(zeffo.blockers.length, 0, "Zeffo validation unexpectedly has blockers");
assert.equal("winPercent" in zeffo, false, "Battle strategy must not invent win probability");

const kam = evaluateBattleStrategy({ missionId: "p3-kam", members: kamMembers(true) });
assert.equal(kam.status, "ready", "KAM strategy should pass with the required plan and Fives Zeta");
assert.equal(kam.blockers.length, 0, "KAM validation unexpectedly has blockers");
const tacticalReady = kam.checks.find((check) => check.type === "ability" && check.label === "Tactical Awareness");
assert.equal(tacticalReady?.requiresZeta, true, "KAM Tactical Awareness must require the Zeta");
assert.equal(tacticalReady?.ready, true, "Installed Fives Zeta should satisfy KAM preflight");

const kamMissingZeta = evaluateBattleStrategy({ missionId: "p3-kam", members: kamMembers(false) });
assert.equal(kamMissingZeta.status, "blocked", "KAM strategy must fail closed without the required Fives Zeta");
assert.ok(kamMissingZeta.blockers.some((check) => check.label === "Tactical Awareness" && check.zetaReady === false));

const wat = evaluateBattleStrategy({ missionId: "s3", members: watMembers() });
assert.equal(wat.status, "ready", "Wat strategy should pass with the standard GBA-led Geo control kit");
assert.equal(wat.blockers.length, 0, "Wat validation unexpectedly has blockers");
assert.ok(wat.checks.some((check) => check.id === "ability_block" && check.ready), "Wat Ability Block control missing");
assert.ok(wat.checks.some((check) => check.id === "tenacity_down" && check.ready), "Wat Tenacity Down setup missing");
assert.equal("winPercent" in wat, false, "Wat strategy must not invent win probability");

console.log(`[battle-strategy] validated ${corePackIds.length + 1 + roteP1PackIds.length} strategy packs, semantic gates, KAM installed upgrades, Wat control requirements and ROTE Phase 1 evidence boundaries`);
