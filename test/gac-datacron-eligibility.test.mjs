import test from "node:test";
import assert from "node:assert/strict";
import {
  bestCoverage,
  buildUnitIndex,
  evaluateAffixForUnit,
  ruleMatch,
  squadCoverage,
} from "../public/gac-datacron-eligibility.js";
import { buildCatalog } from "../public/gac-datacron-catalog.js";

function context() {
  const catalogBody = {
    units: [
      { baseId: "DARTHVADER", name: "Darth Vader", unitType: "Character", combatType: 1, alignment: "Dark", categories: ["alignment_dark", "affiliation_sith", "affiliation_empire", "role_attacker"] },
      { baseId: "PALPATINE", name: "Emperor Palpatine", unitType: "Character", combatType: 1, alignment: "Dark", categories: ["alignment_dark", "affiliation_sith", "affiliation_empire", "role_support"] },
      { baseId: "MARAJADE", name: "Mara Jade", unitType: "Character", combatType: 1, alignment: "Dark", categories: ["alignment_dark", "affiliation_empire", "role_attacker"] },
    ],
  };
  const datacronCatalog = buildCatalog({
    sets: { version: "V", data: [{ id: 33, displayName: "DATACRON_SET_33_NAME", tier: [{ id: 9 }] }] },
    templates: { version: "V", data: [] },
    affixes: {
      version: "V",
      data: [{ id: "sith_bonus", affix: [{ abilityId: "DC_SITH", targetRule: "target_sith", scopeIcon: "icon_datacron_sith" }] }],
    },
    targeting: {
      version: "V",
      data: [{ id: "target_sith", unitClass: [1], category: { category: [{ categoryId: "affiliation_sith", exclude: false }, { categoryId: "summoned_unit", exclude: true }] } }],
    },
  });
  return { catalogBody, unitIndex: buildUnitIndex(catalogBody), datacronCatalog };
}

test("target category entries act as allowed targets while exclusions still block", () => {
  const rule = { includeCategories: ["affiliation_sith", "role_support"], excludeCategories: ["summoned_unit"], forceAlignments: [], unitClasses: [1] };
  const vader = { baseId: "DARTHVADER", combatType: 1, alignment: "Dark", categories: ["alignment_dark", "affiliation_sith", "role_attacker"] };
  const result = ruleMatch({ relic: 7 }, vader, rule);
  assert.equal(result.eligible, true);

  const summoned = { ...vader, categories: [...vader.categories, "summoned_unit"] };
  const excluded = ruleMatch({ relic: 7 }, summoned, rule);
  assert.equal(excluded.eligible, false);
  assert.ok(excluded.reasons.includes("excluded:summoned_unit"));
});

test("relic gate is enforced on an otherwise eligible ability target", () => {
  const { unitIndex, datacronCatalog } = context();
  const affix = { tier: 6, abilityId: "DC_SITH", targetRule: "target_sith", requiredRelicTier: 6 };
  const staticVader = unitIndex.get("DARTHVADER");

  const blocked = evaluateAffixForUnit(affix, { baseId: "DARTHVADER", relic: 5, gear: 13 }, staticVader, datacronCatalog);
  assert.equal(blocked.eligible, false);
  assert.ok(blocked.reasons.includes("requires-r6"));

  const eligible = evaluateAffixForUnit(affix, { baseId: "DARTHVADER", relic: 7, gear: 13 }, staticVader, datacronCatalog);
  assert.equal(eligible.eligible, true);
});

test("squad coverage reports which members receive at least one ability bonus", () => {
  const { unitIndex, datacronCatalog } = context();
  const datacron = {
    id: "DC1",
    setId: 33,
    level: 6,
    affixes: [{ tier: 6, abilityId: "DC_SITH", targetRule: "target_sith", requiredRelicTier: 6 }],
  };
  const squad = [
    { baseId: "DARTHVADER", name: "Darth Vader", relic: 8, gear: 13 },
    { baseId: "PALPATINE", name: "Emperor Palpatine", relic: 7, gear: 13 },
    { baseId: "MARAJADE", name: "Mara Jade", relic: 7, gear: 13 },
  ];
  const result = squadCoverage(datacron, squad, unitIndex, datacronCatalog);
  assert.equal(result.known, true);
  assert.equal(result.eligibleMembers, 2);
  assert.equal(result.squadSize, 3);
  assert.equal(result.coverage, 2 / 3);
  assert.equal(result.leaderEligible, true);
  assert.equal(result.members[2].benefitEligible, false);
});

test("best coverage favors more squad members, not assumed ability strength", () => {
  const { unitIndex, datacronCatalog } = context();
  const squad = [
    { baseId: "DARTHVADER", relic: 8, gear: 13 },
    { baseId: "PALPATINE", relic: 7, gear: 13 },
    { baseId: "MARAJADE", relic: 7, gear: 13 },
  ];
  const datacrons = [
    { id: "SITH", setId: 33, level: 6, affixes: [{ tier: 6, abilityId: "DC_SITH", targetRule: "target_sith", requiredRelicTier: 6 }] },
    { id: "UNKNOWN", setId: 33, level: 9, affixes: [{ tier: 9, abilityId: "MISSING", targetRule: "unknown_rule" }] },
  ];
  const result = bestCoverage(datacrons, squad, unitIndex, datacronCatalog);
  assert.equal(result.datacron.id, "SITH");
  assert.equal(result.eligibleMembers, 2);
});

test("missing static unit metadata remains unknown instead of false eligibility", () => {
  const { datacronCatalog } = context();
  const affix = { tier: 6, abilityId: "DC_SITH", targetRule: "target_sith" };
  const result = evaluateAffixForUnit(affix, { baseId: "NEWUNIT", relic: 8 }, null, datacronCatalog);
  assert.equal(result.eligible, null);
  assert.equal(result.known, false);
});
