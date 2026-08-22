import test from "node:test";
import assert from "node:assert/strict";
import {
  buildRevaMemberReadiness,
  buildGuildRevaReadiness,
} from "../public/guild-reva-readiness-model.js";

const catalog = [
  ["GRANDINQUISITOR", "Grand Inquisitor"],
  ["FIFTHBROTHER", "Fifth Brother"],
  ["SEVENTHSISTER", "Seventh Sister"],
  ["EIGHTHBROTHER", "Eighth Brother"],
  ["NINTHSISTER", "Ninth Sister"],
  ["THIRDSISTER", "Third Sister"],
].map(([baseId, name]) => ({ baseId, name, categories: [{ name: "Inquisitorius" }] }));

function unit(baseId, relic, power = 30000) {
  return { baseId, gear: 13, relic, power, stars: 7 };
}

function member(overrides = {}) {
  return {
    allyCode: "123456789",
    name: "Officer Test",
    galacticPower: 10000000,
    units: [
      unit("GRANDINQUISITOR", 7),
      unit("FIFTHBROTHER", 7),
      unit("SEVENTHSISTER", 7),
      unit("EIGHTHBROTHER", 7),
      unit("NINTHSISTER", 7),
    ],
    ...overrides,
  };
}

test("Reva readiness requires GI plus four additional Inquisitorius at R7", () => {
  const row = buildRevaMemberReadiness(member(), catalog);
  assert.equal(row.status, "READY");
  assert.equal(row.grandInquisitor.label, "R7");
  assert.equal(row.supports.length, 4);
  assert.ok(row.supports.every((slot) => slot.state.relic >= 7));
});

test("Reva readiness dynamically accepts another Inquisitorius in the best four", () => {
  const units = member().units.filter((row) => row.baseId !== "NINTHSISTER");
  units.push(unit("THIRDSISTER", 8));
  const row = buildRevaMemberReadiness(member({ units }), catalog);
  assert.equal(row.status, "READY");
  assert.ok(row.supports.some((slot) => slot.baseId === "THIRDSISTER"));
});

test("Reva readiness marks all-R5+ gates as ALMOST and lower gates as FAR", () => {
  const closeUnits = member().units.map((row) => row.baseId === "FIFTHBROTHER" ? unit(row.baseId, 6) : row);
  assert.equal(buildRevaMemberReadiness(member({ units: closeUnits }), catalog).status, "ALMOST");

  const farUnits = member().units.map((row) => row.baseId === "FIFTHBROTHER" ? unit(row.baseId, 4) : row);
  assert.equal(buildRevaMemberReadiness(member({ units: farUnits }), catalog).status, "FAR");
});

test("guild Reva summary treats ready accounts as potential shards per TB", () => {
  const guild = buildGuildRevaReadiness({ guild: { name: "Test Guild" }, members: [member(), member({ allyCode: "987654321", name: "Second" })] }, catalog);
  assert.equal(guild.summary.ready, 2);
  assert.equal(guild.summary.potentialShards, 2);
  assert.equal(guild.rewardMode, "shards");
});
