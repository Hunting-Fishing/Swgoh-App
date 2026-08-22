import test from "node:test";
import assert from "node:assert/strict";
import {
  buildWatMemberReadiness,
  buildGuildWatReadiness,
  WAT_GEONOSIANS,
} from "../public/guild-wat-readiness-model.js";

function unit(baseId, stars = 7, power = 16500) {
  return { baseId, stars, power, gear: 12 };
}
function member(overrides = {}) {
  return {
    allyCode: "123456789",
    name: "Geo Tester",
    galacticPower: 6000000,
    units: WAT_GEONOSIANS.map((row) => unit(row.baseId)),
    ...overrides,
  };
}

test("Wat readiness requires all five Geonosians at 7 stars and 16,500 power", () => {
  const row = buildWatMemberReadiness(member());
  assert.equal(row.status, "READY");
  assert.equal(row.geonosians.length, 5);
  assert.ok(row.geonosians.every((geo) => geo.state.ready));
});

test("Wat readiness uses yellow only as a documented close planning band", () => {
  const units = WAT_GEONOSIANS.map((row, index) => unit(row.baseId, index === 1 ? 6 : 7, index === 2 ? 15000 : 16500));
  const row = buildWatMemberReadiness(member({ units }));
  assert.equal(row.status, "ALMOST");
  assert.ok(row.upgradeText.includes("7★"));
  assert.ok(row.upgradeText.includes("16.5K GP"));
});

test("Wat readiness is FAR when a required Geo falls below close band", () => {
  const units = WAT_GEONOSIANS.map((row, index) => unit(row.baseId, 7, index === 4 ? 13000 : 16500));
  assert.equal(buildWatMemberReadiness(member({ units })).status, "FAR");
});

test("guild Wat summary exposes potential shards rather than a fake unlock threshold", () => {
  const report = buildGuildWatReadiness({ guild: { name: "Test Guild" }, members: [member()] });
  assert.equal(report.summary.ready, 1);
  assert.equal(report.summary.potentialShards, 1);
  assert.equal(report.rewardMode, "shards");
  assert.match(report.gateText, /16,500/);
});
