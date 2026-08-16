import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  guildFarmKey,
  guildFarmPlanTarget,
  snapshotMatchesAllyCode,
} from "../public/guild-rote-member-plan-handoff.js";

test("guild farm key is stable across display punctuation and case", () => {
  assert.equal(guildFarmKey("Player One", "Jedi Knight Revan"), "player one|jedi knight revan");
  assert.equal(guildFarmKey("PLAYER-ONE", "Jedi  Knight  Revan"), "player one|jedi knight revan");
});

test("guild farm plan target converts member-specific gear and relic gaps", () => {
  assert.deepEqual(guildFarmPlanTarget({
    member: { allyCode: "123-456-789" },
    baseId: "CHAR_A",
    unit: { baseId: "CHAR_A", unitType: "Character", gear: 13, relic: 5 },
    maxGap: { relic: 2, gear: 0 },
  }), {
    allyCode: "123456789",
    baseId: "CHAR_A",
    gear: 13,
    relic: 7,
  });

  assert.deepEqual(guildFarmPlanTarget({
    member: { allyCode: "123456789" },
    baseId: "CHAR_B",
    unit: { baseId: "CHAR_B", unitType: "Character", gear: 10, relic: 0 },
    maxGap: { relic: 0, gear: 2 },
  }), {
    allyCode: "123456789",
    baseId: "CHAR_B",
    gear: 12,
    relic: 0,
  });
});

test("ships and acquisition-only blockers do not pretend to be Gear Planner targets", () => {
  assert.equal(guildFarmPlanTarget({
    member: { allyCode: "123456789" },
    baseId: "SHIP_A",
    unit: { baseId: "SHIP_A", unitType: "Ship", stars: 6 },
    maxGap: { stars: 1 },
  }), null);
  assert.equal(guildFarmPlanTarget({
    member: { allyCode: "123456789" },
    baseId: "CHAR_MISSING",
    unit: null,
    maxGap: { missing: true },
  }), null);
});

test("target roster confirmation accepts only the requested Ally Code", () => {
  assert.equal(snapshotMatchesAllyCode({ allyCode: "123456789" }, "123-456-789"), true);
  assert.equal(snapshotMatchesAllyCode({ body: { player: { allyCode: "123456789" } } }, "123456789"), true);
  assert.equal(snapshotMatchesAllyCode({ allyCode: "987654321" }, "123456789"), false);
  assert.equal(snapshotMatchesAllyCode(null, "123456789"), false);
});

test("guild member handoff is wired after guild mission coverage and Gear Planner bridge", () => {
  const index = fs.readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
  const source = fs.readFileSync(new URL("../public/guild-rote-member-plan-handoff.js", import.meta.url), "utf8");
  const coveragePosition = index.indexOf("/guild-rote-mission-coverage.js");
  const bridgePosition = index.indexOf("/gear-planner-deeplink.js");
  const handoffPosition = index.indexOf("/guild-rote-member-plan-handoff.js");
  assert.ok(coveragePosition >= 0);
  assert.ok(bridgePosition >= 0);
  assert.ok(handoffPosition > coveragePosition);
  assert.ok(handoffPosition > bridgePosition);
  assert.match(source, /Plan Member Upgrade/);
  assert.match(source, /Load Member Roster/);
  assert.match(source, /swgoh:gear-plan-unit/);
  assert.match(source, /waitForLiveAllyCode/);
  assert.match(source, /stopImmediatePropagation/);
});
