import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCharacterModRows,
  characterModAudit,
  equippedModAuditSummary,
  flattenEquippedMods,
  modSetName,
  modSlotName,
  statDisplay,
} from "../public/mods-audit.js";

function mod(pips, speed = 0, extra = {}) {
  return {
    id: `m-${pips}-${speed}-${extra.slot || 2}`,
    pips,
    rarity: pips,
    level: extra.level ?? 15,
    tier: extra.tier ?? pips,
    slot: extra.slot ?? 2,
    setId: extra.setId ?? "4",
    primaryStat: { name: "Offense", displayValue: 5.88, percent: true },
    secondaryStats: speed ? [{ name: "Speed", unitStatId: 5, displayValue: speed, percent: false }] : [],
    speedSecondary: speed,
  };
}

test("character audit preserves every 1 through 6 dot mod", () => {
  const mods = [
    mod(1, 0),
    mod(2, 4),
    mod(3, 9),
    mod(4, 12),
    mod(5, 21),
    mod(6, 27),
  ];
  const row = characterModAudit(
    { baseId: "UNIT", name: "Unit", power: 30000, speed: 300, relic: 7, gear: 13 },
    { baseId: "UNIT", mods },
  );

  assert.equal(row.equipped, 6);
  assert.equal(row.openSlots, 0);
  assert.equal(row.underSixDot, 5);
  assert.equal(row.sixDot, 1);
  assert.equal(row.oneToFourDot, 4);
  assert.equal(row.fiveDot, 1);
  assert.equal(row.maxLevel, 6);
  assert.deepEqual(row.byRarity, { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1 });
  assert.equal(row.speedSecondaryMods, 5);
  assert.equal(row.totalSpeedSecondary, 73);
  assert.equal(row.bestSpeedSecondary, 27);
  assert.equal(row.speed10Plus, 3);
  assert.equal(row.speed15Plus, 2);
  assert.equal(row.speed20Plus, 2);
  assert.equal(row.speed25Plus, 1);
});

test("builds character rows including characters with zero equipped mods", () => {
  const live = {
    units: [
      { baseId: "A", name: "Alpha", power: 40000 },
      { baseId: "B", name: "Beta", power: 35000 },
    ],
  };
  const detailed = { units: [{ baseId: "A", mods: [mod(5, 15)] }] };
  const rows = buildCharacterModRows(live, detailed);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].equipped, 1);
  assert.equal(rows[1].equipped, 0);
  assert.equal(rows[1].openSlots, 6);
});

test("flattens all individual mods with friendly slot and set labels", () => {
  const rows = [characterModAudit(
    { baseId: "A", name: "Alpha", power: 40000 },
    { baseId: "A", mods: [mod(4, 10, { slot: 3, setId: "4" }), mod(6, 25, { slot: 5, setId: "2" })] },
  )];
  const flat = flattenEquippedMods(rows);
  assert.equal(flat.length, 2);
  assert.equal(flat[0].characterName, "Alpha");
  assert.equal(flat[0].slotName, "Arrow");
  assert.equal(flat[0].setName, "Speed");
  assert.equal(flat[1].slotName, "Triangle");
  assert.equal(flat[1].setName, "Offense");
});

test("summary keeps lower-pip totals separate from six-dot and open-slot coverage", () => {
  const characters = [
    characterModAudit({ baseId: "A", name: "A" }, { mods: [mod(4), mod(5, 20), mod(6, 26)] }),
    characterModAudit({ baseId: "B", name: "B" }, { mods: [mod(5, 10, { level: 12 })] }),
  ];
  const summary = equippedModAuditSummary(characters, {});
  assert.equal(summary.totalMods, 4);
  assert.equal(summary.underSixDot, 3);
  assert.equal(summary.sixDot, 1);
  assert.equal(summary.maxLevel, 3);
  assert.equal(summary.speed10Plus, 3);
  assert.equal(summary.speed20Plus, 2);
  assert.equal(summary.speed25Plus, 1);
  assert.equal(summary.charactersWithOpenSlots, 2);
  assert.equal(summary.charactersWithOneToFourDot, 1);
  assert.equal(summary.charactersWithUnderSixDot, 2);
});

test("formats static mod metadata and stats", () => {
  assert.equal(modSlotName(6), "Circle");
  assert.equal(modSetName("8"), "Tenacity");
  assert.equal(statDisplay({ name: "Offense", displayValue: 5.876, percent: true }), "Offense 5.88%");
  assert.equal(statDisplay({ name: "Speed", displayValue: 23, percent: false }), "Speed 23");
});
