import test from "node:test";
import assert from "node:assert/strict";
import {
  buildGuildUnitOwnershipMatrix,
  filterGuildUnitOwnershipRows,
  guildOperationRequirementForUnit,
  guildOperationUnitsForPhase,
} from "../public/guild-unit-ownership-model.js";

const catalog = [
  { baseId: "X", name: "Unit X", unitType: "Character" },
  { baseId: "Y", name: "Ship Y", unitType: "Ship" },
  { baseId: "Z", name: "Generic Z", unitType: "Character" },
];

const guild = {
  guild: { id: "g1", name: "Test Guild" },
  members: [
    { playerId: "a", allyCode: "111222333", name: "Alpha", galacticPower: 10_000_000, rosterAvailable: true, units: [
      { baseId: "X", stars: 7, gear: 13, relic: 7, power: 35000 },
      { baseId: "Y", stars: 7, power: 50000 },
      { baseId: "Z", stars: 7, gear: 13, relic: 5, power: 28000 },
    ] },
    { playerId: "b", allyCode: "444555666", name: "Bravo", galacticPower: 9_000_000, rosterAvailable: true, units: [
      { baseId: "X", stars: 7, gear: 13, relic: 5, power: 30000 },
      { baseId: "Y", stars: 6, power: 42000 },
    ] },
    { playerId: "c", allyCode: "777888999", name: "Charlie", galacticPower: 8_000_000, rosterAvailable: true, units: [] },
  ],
};

const operations = {
  slots: [
    { id: "x1", phase: "P1", baseId: "X", name: "Unit X", unitType: "Character", requiredRarity: 7, requiredRelic: 5 },
    { id: "x2", phase: "P1", baseId: "X", name: "Unit X", unitType: "Character", requiredRarity: 7, requiredRelic: 7 },
    { id: "y1", phase: "P2", baseId: "Y", name: "Ship Y", unitType: "Ship", requiredRarity: 7, requiredRelic: 0 },
  ],
};

test("groups Operation demand by phase and unit", () => {
  const rows = guildOperationUnitsForPhase(operations, "P1");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].baseId, "X");
  assert.equal(rows[0].demand, 2);
  assert.equal(rows[0].maxRequirement.requiredRelic, 7);
  assert.equal(guildOperationRequirementForUnit(operations, "P2", "Y")?.demand, 1);
});

test("generic ownership works without pretending an Operation donor state", () => {
  const matrix = buildGuildUnitOwnershipMatrix({ guildSnapshot: guild, catalog, operations, phase: "", baseId: "Z" });
  assert.equal(matrix.requirement, null);
  assert.equal(matrix.summary.owners, 1);
  assert.equal(matrix.summary.missingMembers, 2);
  assert.equal(matrix.members.find((row) => row.id === "a")?.band, "owned");
  assert.equal(matrix.members.find((row) => row.id === "b")?.band, "missing");
  assert.equal(matrix.summary.safeOwners, 0);
});

test("Operation context separates qualifying safe protected KEEP and missing owners", () => {
  const matrix = buildGuildUnitOwnershipMatrix({
    guildSnapshot: guild,
    catalog,
    operations,
    phase: "P1",
    baseId: "X",
    preferences: [{ memberId: "b", baseId: "X", preference: "keep" }],
    protections: [{ memberId: "a", phase: "P1", baseId: "X", severity: 100, reasons: ["sole mission owner"] }],
    assignments: [{ phase: "P1", baseId: "X", member: { playerId: "a" } }],
  });
  assert.equal(matrix.requirement?.demand, 2);
  assert.equal(matrix.summary.owners, 2);
  assert.equal(matrix.summary.qualifyingOwners, 2);
  assert.equal(matrix.summary.protectedOwners, 1);
  assert.equal(matrix.summary.keepOwners, 1);
  assert.equal(matrix.summary.assignedOwners, 1);
  assert.equal(matrix.members.find((row) => row.id === "a")?.band, "protected");
  assert.equal(matrix.members.find((row) => row.id === "b")?.band, "keep");
});

test("a unit not required in the selected phase remains generic ownership", () => {
  const matrix = buildGuildUnitOwnershipMatrix({ guildSnapshot: guild, catalog, operations, phase: "P1", baseId: "Y" });
  assert.equal(matrix.requirement, null);
  assert.equal(matrix.members.find((row) => row.id === "a")?.band, "owned");
  assert.equal(matrix.members.find((row) => row.id === "b")?.band, "owned");
});

test("ships use stars for Operation qualification", () => {
  const matrix = buildGuildUnitOwnershipMatrix({ guildSnapshot: guild, catalog, operations, phase: "P2", baseId: "Y" });
  assert.equal(matrix.summary.owners, 2);
  assert.equal(matrix.summary.sevenStarOwners, 1);
  assert.equal(matrix.summary.qualifyingOwners, 1);
  assert.equal(matrix.members.find((row) => row.id === "a")?.qualifyingSlots, 1);
  assert.equal(matrix.members.find((row) => row.id === "b")?.band, "below");
});

test("filters member rows by ownership safety search and sort", () => {
  const matrix = buildGuildUnitOwnershipMatrix({ guildSnapshot: guild, catalog, operations, phase: "P1", baseId: "X" });
  assert.equal(filterGuildUnitOwnershipRows(matrix.members, { ownership: "Owned" }).length, 2);
  assert.equal(filterGuildUnitOwnershipRows(matrix.members, { ownership: "Missing" }).length, 1);
  assert.equal(filterGuildUnitOwnershipRows(matrix.members, { search: "444-555-666" })[0]?.memberName, "Bravo");
  assert.equal(filterGuildUnitOwnershipRows(matrix.members, { sort: "unitGp" })[0]?.memberName, "Alpha");
});
