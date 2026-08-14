import test from "node:test";
import assert from "node:assert/strict";
import { readinessAnalysis, requirementGaps } from "../public/readiness-policy.js";
import { buildFactionSquads, isLeader, squadReadiness } from "../public/team-builder.js";

test("readiness analysis identifies concrete roster gaps", () => {
  const analysis = readinessAnalysis({
    unitType: "Character",
    stars: 6,
    level: 85,
    gear: 12,
    relic: 0,
    speed: 180,
    equippedMods: 4,
    readiness: 68,
  });

  assert.equal(analysis.band, "Developing");
  assert.equal(analysis.score, 68);
  assert.equal(analysis.gaps.some((gap) => gap.key === "stars"), true);
  assert.equal(analysis.gaps.some((gap) => gap.key === "gear"), true);
  assert.equal(analysis.gaps.some((gap) => gap.key === "mods"), true);
  assert.equal(analysis.gaps.some((gap) => gap.key === "speed"), true);
});

test("complete character has no baseline star level gear or mod gaps", () => {
  const gaps = requirementGaps({
    unitType: "Character",
    stars: 7,
    level: 85,
    gear: 13,
    relic: 5,
    speed: 250,
    equippedMods: 6,
  });
  assert.deepEqual(gaps, []);
});

test("team builder creates five-unit squads from shared owned factions", () => {
  const units = Array.from({ length: 7 }, (_, index) => ({
    baseId: `SITH_${index}`,
    name: `Sith ${index}`,
    unitType: "Character",
    factions: ["Sith", index < 5 ? "Empire" : "Other"],
    power: 20000 + index * 1000,
    speed: 200 + index,
    readiness: 70 + index,
  }));

  const squads = buildFactionSquads(units, { size: 5, limit: 5 });
  const sith = squads.find((squad) => squad.faction === "Sith");
  assert.ok(sith);
  assert.equal(sith.members.length, 5);
  assert.equal(sith.benchCount, 2);
  assert.equal(sith.members[0].baseId, "SITH_6");
});

test("team builder puts an owned faction leader in the leader slot", () => {
  const units = Array.from({ length: 6 }, (_, index) => ({
    baseId: `JEDI_${index}`,
    name: `Jedi ${index}`,
    unitType: "Character",
    factions: ["Jedi"],
    power: 30000 + index * 1000,
    speed: 200 + index,
    readiness: 80 + index,
    abilities: index === 0 ? [{ id: "leader_jedi_test", type: "Leader" }] : [],
  }));

  assert.equal(isLeader(units[0]), true);
  const squad = buildFactionSquads(units, { size: 5, limit: 1 })[0];
  assert.equal(squad.leaderBaseId, "JEDI_0");
  assert.equal(squad.members[0].baseId, "JEDI_0");
  assert.equal(squad.members.length, 5);
});

test("squad readiness buckets members", () => {
  assert.deepEqual(squadReadiness({ members: [
    { readiness: 90 },
    { readiness: 80 },
    { readiness: 60 },
  ] }), { ready: 1, developing: 1, needsWork: 1 });
});
