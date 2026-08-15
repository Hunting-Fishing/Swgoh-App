import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { extractAbilitySemantics } from "../public/kit-semantics.js";
import { battleStrategyForMission } from "../public/tb-battle-strategy-data.js";
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

function kamMembers({ fivesZeta = true, formUpTier = 8 } = {}) {
  return [
    member("SHAAKTI", "Shaak Ti", [
      { id: "training", name: "Training Exercises", tier: 8, description: "Call target ally to assist and recover Health and Protection." },
      { id: "assault", name: "Assault Team", tier: 8, description: "Dispel all debuffs on all allies and call Clone Trooper allies to assist." },
    ]),
    member("ARCTROOPER501ST", "ARC Trooper", [
      { id: "assign_command", name: "Assign Command", tier: 8, description: "Grant Command to target other Clone Trooper ally." },
    ]),
    member("CT7567", "CT-7567 'Rex'", [
      { id: "form_up", name: "Form Up", tier: formUpTier, description: "Dispel all debuffs on all allies and grant them Tenacity Up for 3 turns." },
      { id: "aerial_advantage", name: "Aerial Advantage", tier: 8, description: "Deal Physical damage to target enemy and bonus damage based on Max Health." },
    ]),
    member("CT5555", "CT-5555 'Fives'", [
      { id: "tactical_awareness", name: "Tactical Awareness", tier: 8, hasZeta: fivesZeta, description: "When another 501st Clone Trooper ally would be defeated, Fives is defeated instead and allies gain his stats." },
    ]),
    member("CT210408", "CT-21-0408 'Echo'", [
      { id: "emp_grenade", name: "EMP Grenade", tier: 8, description: "Deal Special damage to all enemies and dispel all buffs on all enemies." },
    ]),
  ];
}

test("kit semantics recognize Purge and Thermal Detonator as named debuffs", () => {
  const semantics = extractAbilitySemantics({
    description: "Inflict a stack of Purge on all enemies. Inflict Thermal Detonator on target enemy.",
  });
  assert.ok(semantics.debuffs.includes("Purge"));
  assert.ok(semantics.debuffs.includes("Thermal Detonator"));
  assert.ok(semantics.mechanicKinds.includes("debuff"));
});

test("Zeffo Clone strategy pack requires a real Stun source and passes with Captain Rex", () => {
  const captainRex = member("CAPTAINREX", "Captain Rex", [{
    id: "master_marksman",
    name: "Master Marksman",
    description: "Deal Physical damage to target enemy and Stun them for 1 turn.",
  }]);
  const analysis = evaluateBattleStrategy({ missionId: "zeffo-clones", members: [captainRex] });
  assert.equal(analysis.available, true);
  assert.equal(analysis.status, "ready");
  assert.equal(analysis.blockers.length, 0);
  assert.ok(analysis.checks.some((check) => check.type === "mechanic" && check.id === "stun" && check.ready));
  assert.equal("score" in analysis, false);
  assert.equal("winPercent" in analysis, false);
});

test("Zeffo Clone strategy fails closed when the listed team has no explicit Stun", () => {
  const clone = member("CLONE", "Clone", [{ id: "basic", name: "Basic", description: "Deal Physical damage to target enemy." }]);
  const analysis = evaluateBattleStrategy({ missionId: "zeffo-clones", members: [clone] });
  assert.equal(analysis.status, "blocked");
  assert.ok(analysis.blockers.some((check) => check.id === "stun"));
});

test("Reva opening strategy validates GI lead, Purge, Tenacity Up, dispel and named key abilities", () => {
  const gi = member("GRANDINQUISITOR", "Grand Inquisitor", [{
    id: "ready_to_die",
    name: "Ready to Die?",
    tier: 8,
    description: "Gain buffs based on Purge on the target enemy. At 6 stacks, Inquisitorius allies gain Tenacity Up for 2 turns.",
  }]);
  const fifth = member("FIFTHBROTHER", "Fifth Brother", [{
    id: "the_kill_is_mine",
    name: "The Kill is Mine",
    tier: 8,
    description: "Dispel all buffs on all enemies. Inflict a stack of Purge on all enemies, which can't be evaded or resisted.",
  }]);
  const seventh = member("SEVENTHSISTER", "Seventh Sister", [{ id: "basic", name: "Basic", description: "Deal damage and inflict Purge on target enemy." }]);
  const eighth = member("EIGHTHBROTHER", "Eighth Brother", [{ id: "basic", name: "Basic", description: "Deal damage and inflict Purge on target enemy." }]);
  const ninth = member("NINTHSISTER", "Ninth Sister", [{ id: "basic", name: "Basic", description: "Deal damage and inflict Purge on target enemy." }]);

  const analysis = evaluateBattleStrategy({ missionId: "tatooine-reva", members: [gi, seventh, fifth, eighth, ninth] });
  assert.equal(analysis.available, true);
  assert.equal(analysis.status, "ready");
  assert.equal(analysis.blockers.length, 0);
  assert.ok(analysis.checks.some((check) => check.id === "purge" && check.ready));
  assert.ok(analysis.checks.some((check) => check.id === "tenacity_up" && check.ready));
  assert.ok(analysis.checks.some((check) => check.id === "dispel_enemy" && check.ready));
  assert.ok(analysis.stages.some((stage) => stage.id === "wave-1-opening"));
});

test("Reva strategy flags an incorrect leader instead of treating roster strength as sufficient", () => {
  const fifth = member("FIFTHBROTHER", "Fifth Brother", [{
    id: "the_kill_is_mine",
    name: "The Kill is Mine",
    description: "Dispel all buffs on all enemies. Inflict a stack of Purge on all enemies.",
  }]);
  const gi = member("GRANDINQUISITOR", "Grand Inquisitor", [{
    id: "ready_to_die",
    name: "Ready to Die?",
    description: "At 6 stacks of Purge, Inquisitorius allies gain Tenacity Up for 2 turns.",
  }]);
  const analysis = evaluateBattleStrategy({ missionId: "tatooine-reva", members: [fifth, gi] });
  assert.equal(analysis.status, "blocked");
  assert.ok(analysis.blockers.some((check) => check.type === "leader"));
});

test("KAM Reek strategy recognizes the standard Shaak 501st plan with installed Fives Zeta", () => {
  const analysis = evaluateBattleStrategy({ missionId: "p3-kam", members: kamMembers() });
  assert.equal(analysis.available, true);
  assert.equal(analysis.status, "ready");
  assert.equal(analysis.blockers.length, 0);
  assert.ok(analysis.checks.some((check) => check.type === "ability" && check.label === "Tactical Awareness" && check.ready && check.requiresZeta));
  assert.ok(analysis.checks.some((check) => check.id === "tenacity_up" && check.ready));
  assert.ok(analysis.checks.some((check) => check.id === "cleanse" && check.ready));
  assert.deepEqual(analysis.targetPriorities.slice(0, 3).map((item) => item.target), ["B2 Super Battle Droid", "Jango Fett", "Reek"]);
  assert.equal("winPercent" in analysis, false);
});

test("KAM strategy blocks when Fives Tactical Awareness Zeta is not installed", () => {
  const analysis = evaluateBattleStrategy({ missionId: "p3-kam", members: kamMembers({ fivesZeta: false }) });
  assert.equal(analysis.status, "blocked");
  const tactical = analysis.blockers.find((check) => check.type === "ability" && check.label === "Tactical Awareness");
  assert.ok(tactical);
  assert.equal(tactical.hasAbility, true);
  assert.equal(tactical.zetaReady, false);
  assert.equal(tactical.requiresZeta, true);
});

test("KAM strategy blocks when Rex Form Up has not reached the Tenacity Up tier", () => {
  const analysis = evaluateBattleStrategy({ missionId: "p3-kam", members: kamMembers({ formUpTier: 3 }) });
  assert.equal(analysis.status, "blocked");
  const formUp = analysis.blockers.find((check) => check.type === "ability" && check.label === "Form Up");
  assert.ok(formUp);
  assert.equal(formUp.tierReady, false);
  assert.equal(formUp.minimumTier, 4);
});

test("unresearched missions explicitly remain STRATEGY PENDING", () => {
  const analysis = evaluateBattleStrategy({ missionId: "unknown-mission", members: [] });
  assert.equal(analysis.available, false);
  assert.equal(analysis.label, "STRATEGY PENDING");
});

test("strategy packs preserve evidence classification", () => {
  assert.equal(battleStrategyForMission("zeffo-clones").confidence, "high");
  assert.equal(battleStrategyForMission("tatooine-reva").confidence, "community-validated");
  assert.equal(battleStrategyForMission("p3-kam").confidence, "community-validated");
});

test("battle strategy browser modules parse", () => {
  for (const path of [
    new URL("../public/tb-battle-strategy-data.js", import.meta.url),
    new URL("../public/tb-battle-strategy.js", import.meta.url),
    new URL("../public/tb-battle-strategy-ui.js", import.meta.url),
    new URL("../public/tb-combat-intelligence.js", import.meta.url),
    new URL("../public/tb-combat-prep-ui.js", import.meta.url),
  ]) execFileSync(process.execPath, ["--check", path.pathname]);
});
