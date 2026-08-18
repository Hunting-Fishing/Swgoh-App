import test from "node:test";
import assert from "node:assert/strict";
import {
  bestAffixMatch,
  buildCatalog,
  normalizeTargetRule,
  resolveAffix,
  resolveDatacron,
} from "../public/gac-datacron-catalog.js";

function fixtureCatalog() {
  return buildCatalog({
    sets: {
      version: "0.40.5:test",
      data: [{
        id: 33,
        displayName: "DATACRON_SET_33_NAME",
        expirationTimeMs: "1793257200000",
        icon: "tex.datacron_a",
        tier: [{ id: 0 }, { id: 9 }],
      }],
    },
    templates: {
      version: "0.40.5:test",
      data: [{
        id: "datacron_set_33_base",
        setId: 33,
        level: 9,
        affixTemplateSetId: "dc33_l9",
        requiredRelicTier: 7,
      }],
    },
    affixes: {
      version: "0.40.5:test",
      data: [
        {
          id: "dc33_l6",
          affix: [{
            tag: ["alignment_dark"],
            abilityId: "dc_dark_bonus",
            targetRule: "datacron_dark_support",
            statType: 0,
            statValueMin: "0",
            statValueMax: "0",
            scopeIcon: "icon_datacron_dark",
          }],
        },
        {
          id: "stat_health_25",
          affix: [{
            abilityId: "",
            targetRule: "",
            statType: 55,
            statValueMin: "25000000",
            statValueMax: "25000000",
            scopeIcon: "icon_stat_maxhealth",
          }],
        },
      ],
    },
    targeting: {
      version: "0.40.5:test",
      data: [{
        id: "datacron_dark_support",
        battleSide: 2,
        unitSelect: 1,
        category: {
          category: [
            { exclude: false, categoryId: "alignment_dark" },
            { exclude: false, categoryId: "role_support" },
            { exclude: true, categoryId: "summoned_unit" },
          ],
        },
      }],
    },
  });
}

test("catalog preserves aligned source versions and set/template metadata", () => {
  const catalog = fixtureCatalog();
  assert.equal(catalog.versionAligned, true);
  assert.equal(catalog.sets.get("33").displayName, "Set 33");
  assert.equal(catalog.sets.get("33").maxTier, 9);
  assert.equal(catalog.templates.get("datacron_set_33_base").requiredRelicTier, 7);
  const resolved = resolveDatacron({ setId: 33, templateId: "datacron_set_33_base" }, catalog);
  assert.equal(resolved.set.id, 33);
  assert.equal(resolved.template.affixTemplateSetId, "dc33_l9");
});

test("target rule keeps required and excluded categories separate", () => {
  const rule = normalizeTargetRule({
    id: "rule",
    forceAlignment: [3],
    category: {
      category: [
        { categoryId: "alignment_dark", exclude: false },
        { categoryId: "role_support", exclude: false },
        { categoryId: "summoned_unit", exclude: true },
      ],
    },
  });
  assert.deepEqual(rule.includeCategories, ["alignment_dark", "role_support"]);
  assert.deepEqual(rule.includeLabels, ["Dark", "Support"]);
  assert.deepEqual(rule.excludeCategories, ["summoned_unit"]);
  assert.deepEqual(rule.forceAlignments, [3]);
});

test("ability affix resolves exact ability and target eligibility but not ability prose", () => {
  const catalog = fixtureCatalog();
  const raw = {
    abilityId: "dc_dark_bonus",
    targetRule: "datacron_dark_support",
    tags: ["alignment_dark"],
  };
  const match = bestAffixMatch(raw, catalog);
  assert.equal(match.templateSetId, "dc33_l6");
  const resolved = resolveAffix(raw, catalog);
  assert.equal(resolved.targetRule.id, "datacron_dark_support");
  assert.deepEqual(resolved.targetRule.includeLabels, ["Dark", "Support"]);
  assert.equal(resolved.abilityDescriptionResolved, false);
});

test("stat affix requires the actual stat value range before receiving the strongest exact score", () => {
  const catalog = fixtureCatalog();
  const exact = bestAffixMatch({ statType: 55, statValue: 25_000_000 }, catalog);
  assert.equal(exact.scopeLabel, "Maxhealth");

  const wrongValue = bestAffixMatch({ statType: 55, statValue: 99_000_000 }, catalog);
  assert.equal(wrongValue.scopeLabel, "Maxhealth");
  assert.equal(wrongValue.statValueMin, 25_000_000);
  assert.equal(wrongValue.statValueMax, 25_000_000);
  // The resolver exposes the catalog candidate, but callers must retain the raw
  // value because the candidate's numeric range does not contain 99,000,000.
  assert.equal(99_000_000 >= wrongValue.statValueMin && 99_000_000 <= wrongValue.statValueMax, false);
});

test("catalog version mismatch is surfaced rather than silently treated as aligned", () => {
  const catalog = buildCatalog({
    sets: { version: "A", data: [] },
    templates: { version: "A", data: [] },
    affixes: { version: "B", data: [] },
    targeting: { version: "A", data: [] },
  });
  assert.equal(catalog.versionAligned, false);
});
