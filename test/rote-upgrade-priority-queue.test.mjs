import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { gearPlanTarget, personalGuildSnapshot } from "../public/rote-upgrade-priority-queue.js";

test("personal roster is adapted to the shared guild mission coverage model", () => {
  const snapshot = personalGuildSnapshot({
    player: { playerId: "p1", allyCode: "123456789", name: "Player", galacticPower: 9_000_000 },
    units: [{ baseId: "CHAR_A", unitType: "Character" }],
    ships: [{ baseId: "SHIP_A", unitType: "Ship" }],
  }, "123456789");
  assert.equal(snapshot.members.length, 1);
  assert.equal(snapshot.members[0].name, "Player");
  assert.equal(snapshot.members[0].units.length, 2);
  assert.equal(snapshot.members[0].rosterAvailable, true);
});

test("gear plan target converts ROTE relic and gear gaps into exact planner targets", () => {
  assert.deepEqual(gearPlanTarget({
    baseId: "CHAR_A",
    unit: { baseId: "CHAR_A", unitType: "Character", gear: 13, relic: 5 },
    maxGap: { relic: 2, gear: 0 },
  }), { baseId: "CHAR_A", gear: 13, relic: 7 });

  assert.deepEqual(gearPlanTarget({
    baseId: "CHAR_B",
    unit: { baseId: "CHAR_B", unitType: "Character", gear: 10, relic: 0 },
    maxGap: { relic: 0, gear: 2 },
  }), { baseId: "CHAR_B", gear: 12, relic: 0 });

  assert.equal(gearPlanTarget({
    baseId: "SHIP_A",
    unit: { baseId: "SHIP_A", unitType: "Ship", stars: 6 },
    maxGap: { stars: 1 },
  }), null);
});

test("ROTE queue uses shared evidence-safe coverage model and Gear Planner handoff", () => {
  const index = fs.readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
  const js = fs.readFileSync(new URL("../public/rote-upgrade-priority-queue.js", import.meta.url), "utf8");
  const css = fs.readFileSync(new URL("../public/rote-upgrade-priority-queue.css", import.meta.url), "utf8");
  assert.match(index, /rote-upgrade-priority-queue\.css/);
  assert.match(index, /rote-upgrade-priority-queue\.js/);
  assert.match(js, /buildGuildRoteMissionCoverage/);
  assert.match(js, /Mission Impact Queue/);
  assert.match(js, /swgoh:gear-plan-unit/);
  assert.match(js, /Generic fleet star gates without a complete selectable-ship allow-list/);
  assert.match(css, /\.rote-priority-filters/);
  assert.match(css, /data-rote-priority-plan/);
});
