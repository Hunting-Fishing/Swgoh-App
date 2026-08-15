import test from "node:test";
import assert from "node:assert/strict";
import { buildInteractionIndex, buildMentionIndexes, extractUnitInteractions, teamInteractionProfile } from "../public/interaction-graph.js";

const catalog = {
  gameVersion: "test",
  units: [
    {
      baseId: "LEADER",
      name: "Test Leader",
      unitType: "Character",
      factions: ["Galactic Republic", "Jedi"],
      role: "Support",
      kit: { mechanicKinds: ["assist", "buff", "turn_meter_gain"] },
      abilities: [{
        id: "leader_test",
        name: "Together",
        description: "Galactic Republic allies gain Speed Up. Call target Galactic Republic ally to assist. If Ahsoka Tano is present, she gains 20% Turn Meter.",
        semantics: {
          abilityType: "leader",
          mechanics: [
            { kind: "buff", sentence: "Galactic Republic allies gain Speed Up." },
            { kind: "assist", sentence: "Call target Galactic Republic ally to assist." },
            { kind: "turn_meter_gain", sentence: "If Ahsoka Tano is present, she gains 20% Turn Meter." },
          ],
        },
      }],
    },
    { baseId: "AHSOKA", name: "Ahsoka Tano", unitType: "Character", factions: ["Galactic Republic", "Jedi"], role: "Attacker", kit: { mechanicKinds: ["damage"] }, abilities: [] },
    { baseId: "OTHER", name: "Other Unit", unitType: "Character", factions: ["Empire"], role: "Tank", kit: { mechanicKinds: ["counter"] }, abilities: [] },
  ],
};

test("builds name and faction mention indexes", () => {
  const indexes = buildMentionIndexes(catalog);
  assert.ok(indexes.unitNames.some((item) => item.baseId === "AHSOKA"));
  assert.ok(indexes.factionNames.some((item) => item.name === "Galactic Republic"));
});

test("extracts named-unit and faction interaction evidence", () => {
  const indexes = buildMentionIndexes(catalog);
  const interactions = extractUnitInteractions(catalog.units[0], indexes);
  assert.ok(interactions.some((item) => item.targetType === "unit" && item.targetId === "AHSOKA"));
  assert.ok(interactions.some((item) => item.targetType === "faction" && item.targetId === "Galactic Republic" && item.relationTypes.includes("assist")));
  assert.ok(interactions.some((item) => item.abilityType === "leader" && item.relationTypes.includes("leader_scope")));
});

test("team profile activates only references satisfied by selected team", () => {
  const index = buildInteractionIndex(catalog);
  const withAhsoka = teamInteractionProfile(["LEADER", "AHSOKA"], index);
  assert.ok(withAhsoka.namedUnitLinks.some((item) => item.targetId === "AHSOKA"));
  assert.ok(withAhsoka.factionLinks.some((item) => item.targetId === "Galactic Republic"));
  assert.ok(withAhsoka.mechanics.some((item) => item.mechanic === "assist"));

  const withoutAhsoka = teamInteractionProfile(["LEADER", "OTHER"], index);
  assert.ok(!withoutAhsoka.namedUnitLinks.some((item) => item.targetId === "AHSOKA"));
});

test("interaction counts are evidence counts, not a universal synergy score", () => {
  const index = buildInteractionIndex(catalog);
  const profile = teamInteractionProfile(["LEADER", "AHSOKA"], index);
  assert.equal("score" in profile, false);
  assert.match(profile.evidenceBoundary, /not a universal synergy or win score/i);
});
