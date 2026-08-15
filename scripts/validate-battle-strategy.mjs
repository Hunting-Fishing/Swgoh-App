import assert from "node:assert/strict";
import { extractAbilitySemantics } from "../public/kit-semantics.js";
import { battleStrategyForMission } from "../public/tb-battle-strategy-data.js";
import { watBattleStrategyForMission } from "../public/tb-battle-strategy-wat-data.js";
import { mandaloreBattleStrategyForMission } from "../public/tb-battle-strategy-mandalore-data.js";
import { evaluateBattleStrategy } from "../public/tb-battle-strategy.js";

function member(baseId, name, abilities, speed = null) {
  const rows = abilities.map((ability) => ({ ...ability, semantics: extractAbilitySemantics(ability) }));
  return {
    baseId,
    name,
    unit: { baseId, name, ...(speed == null ? {} : { speed }) },
    currentSpeed: speed,
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

function mandaloreMembers({ bkmSpeed = 280, bamSpeed = 310 } = {}) {
  return [
    member("MANDALORBOKATAN", "Bo-Katan (Mand'alor)", [
      { id: "darksaber", name: "Darksaber Flourish", tier: 8, description: "Deal Physical and True damage to target enemy, inflict Armor Shred and Stun them for 1 turn." },
      { id: "reinforcements", name: "Reinforcements Have Arrived", tier: 8, description: "Dispel all debuffs on all Light Side Mandalorian allies, then call all Light Side Mandalorian allies to assist twice." },
      { id: "way", name: "Way of the Mandalore", tier: 8, description: "Light Side Mandalorian allies gain Defense, Health and Offense and gain Ancestral Resolve during battle." },
    ], bkmSpeed),
    member("THEMANDALORIANBESKARARMOR", "The Mandalorian (Beskar Armor)", [{ id: "whistling", name: "Whistling Birds", tier: 8, description: "Deal damage to target enemy." }], bamSpeed),
    member("PAZVIZSLA", "Paz Vizsla", [{ id: "overheat", name: "Overheat", tier: 8, description: "Deal True damage and Stun target enemy." }], 250),
    member("IG12", "IG-12 & Grogu", [{ id: "yes_no", name: "Yes. No. Yes. No.", tier: 8, description: "Dispel debuffs from target ally and call a Light Side Mandalorian ally to assist." }], 300),
    member("ARMORER", "The Armorer", [{ id: "forge", name: "The Forge", tier: 8, description: "Grant an ally protection and defensive benefits." }], 260),
  ];
}

const corePackIds = ["zeffo-clones", "tatooine-reva", "p3-kam"];
for (const id of corePackIds) assert.ok(battleStrategyForMission(id), `${id} strategy pack missing`);
assert.ok(watBattleStrategyForMission("s3"), "s3 Wat strategy pack missing");
assert.ok(mandaloreBattleStrategyForMission("mandalore-bkm"), "Mandalore BKM strategy pack missing");

const statusSemantics = extractAbilitySemantics({ description: "Inflict Purge, Thermal Detonator and Armor Shred on target enemy." });
assert.ok(statusSemantics.debuffs.includes("Purge"), "Purge semantic recognition missing");
assert.ok(statusSemantics.debuffs.includes("Thermal Detonator"), "Thermal Detonator semantic recognition missing");
assert.ok(statusSemantics.debuffs.includes("Armor Shred"), "Armor Shred semantic recognition missing");

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

const mandalore = evaluateBattleStrategy({ missionId: "mandalore-bkm", members: mandaloreMembers() });
assert.equal(mandalore.status, "ready", "Mandalore BKM should be ready with official BAM-before-BKM speed order");
assert.equal(mandalore.blockers.length, 0, "Mandalore validation unexpectedly has blockers");
assert.ok(mandalore.checks.some((check) => check.id === "armor_shred" && check.ready), "Mandalore Armor Shred mechanic missing");
const speedReady = mandalore.checks.find((check) => check.type === "speed-order");
assert.equal(speedReady?.ready, true, "BAM 310 should satisfy the speed-order advisory ahead of BKM 280");
assert.equal(speedReady?.fasterSpeed, 310);
assert.equal(speedReady?.slowerSpeed, 280);
assert.equal("winPercent" in mandalore, false, "Mandalore strategy must not invent win probability");

const reversed = evaluateBattleStrategy({ missionId: "mandalore-bkm", members: mandaloreMembers({ bkmSpeed: 320, bamSpeed: 290 }) });
assert.equal(reversed.status, "warning", "Reversed BKM/BAM speed order should be advisory, not an entry blocker");
assert.equal(reversed.blockers.length, 0, "Speed-order recommendation must not be promoted to a hard mission gate");
assert.ok(reversed.warnings.some((check) => check.type === "speed-order" && check.ready === false), "Reversed speed order should surface an advisory");

console.log(`[battle-strategy] validated ${corePackIds.length + 2} strategy packs, semantic gates, installed upgrades, Wat control and Mandalore speed order`);
