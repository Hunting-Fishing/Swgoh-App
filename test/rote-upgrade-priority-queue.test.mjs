import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  aggregateRoteUpgradeEntries,
  roteGapLabel,
  rotePoolEvidence,
  unitMatchesRotePoolIdentity,
} from "../public/rote-upgrade-priority-queue.js";

test("upgrade queue aggregates repeated mandatory and pool mission impact by unit", () => {
  const rows = aggregateRoteUpgradeEntries([
    {
      baseId: "UNIT_A",
      name: "Unit A",
      owned: true,
      unit: { baseId: "UNIT_A", name: "Unit A", relic: 5 },
      gap: { relic: 1, score: 10_000 },
      ref: { key: "p1:m1", kind: "mandatory", planetId: "p1", missionId: "m1" },
    },
    {
      baseId: "UNIT_A",
      name: "Unit A",
      owned: true,
      unit: { baseId: "UNIT_A", name: "Unit A", relic: 5 },
      gap: { relic: 2, score: 20_000 },
      ref: { key: "p2:m2", kind: "mandatory", planetId: "p2", missionId: "m2" },
    },
    {
      baseId: "UNIT_A",
      name: "Unit A",
      owned: true,
      unit: { baseId: "UNIT_A", name: "Unit A", relic: 5 },
      gap: { relic: 1, score: 10_000 },
      ref: { key: "p3:m3", kind: "pool", planetId: "p3", missionId: "m3" },
    },
    {
      baseId: "UNIT_B",
      name: "Unit B",
      owned: false,
      gap: { missing: true, score: 1_000_000 },
      ref: { key: "p1:m4", kind: "mandatory", planetId: "p1", missionId: "m4" },
    },
  ]);

  assert.equal(rows.length, 2);
  assert.equal(rows[0].baseId, "UNIT_A");
  assert.equal(rows[0].mandatoryImpact, 2);
  assert.equal(rows[0].poolImpact, 1);
  assert.equal(rows[0].missionImpact, 3);
  assert.equal(rows[0].maxGap.relic, 2);
  assert.equal(rows[1].baseId, "UNIT_B");
});

test("pool identity matching honors unit type, alignment, categories, and exact allow lists", () => {
  const rule = {
    unitType: "Character",
    alignments: ["Light", "Neutral"],
    categories: ["Jedi"],
    categoryMode: "all",
    allowedBaseIds: ["JEDI_A"],
    requiredBaseIds: [],
  };
  assert.equal(unitMatchesRotePoolIdentity({
    baseId: "JEDI_A",
    unitType: "Character",
    alignment: "Light",
    factions: ["Jedi"],
  }, rule), true);
  assert.equal(unitMatchesRotePoolIdentity({
    baseId: "JEDI_B",
    unitType: "Character",
    alignment: "Light",
    factions: ["Jedi"],
  }, rule), false);
  assert.equal(unitMatchesRotePoolIdentity({
    baseId: "JEDI_A",
    unitType: "Character",
    alignment: "Dark",
    factions: ["Jedi"],
  }, rule), false);
});

test("generic fleets are gate-only while encoded fleet restrictions are exact", () => {
  assert.equal(rotePoolEvidence({ entry: { unitType: "Ship", verified: true } }), "gate-only");
  assert.equal(rotePoolEvidence({ entry: { unitType: "Ship", verified: true, allowedBaseIds: ["SHIP_A"] } }), "exact");
  assert.equal(rotePoolEvidence({ entry: { unitType: "Character", verified: true } }), "exact");
});

test("gap labels remain concise and actionable", () => {
  assert.equal(roteGapLabel({ missing: true }), "Acquire unit");
  assert.equal(roteGapLabel({ stars: 1, relic: 2, gear: 0, power: 2500 }), "+1★ · +2 relic · +2,500 GP");
  assert.equal(roteGapLabel({ stars: 0, relic: 0, gear: 0, power: 0 }), "Gate met");
});

test("ROTE priority queue assets are wired into the production shell", () => {
  const index = fs.readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
  const js = fs.readFileSync(new URL("../public/rote-upgrade-priority-queue.js", import.meta.url), "utf8");
  const css = fs.readFileSync(new URL("../public/rote-upgrade-priority-queue.css", import.meta.url), "utf8");
  assert.match(index, /rote-upgrade-priority-queue\.css/);
  assert.match(index, /rote-upgrade-priority-queue\.js/);
  assert.match(js, /Mission Impact Queue/);
  assert.match(js, /PARTIAL FLEET EVIDENCE/);
  assert.match(js, /Generic fleet star gates without a complete allow-list/);
  assert.match(css, /\.rote-priority-filters/);
  assert.match(css, /\.rote-priority-row/);
});
