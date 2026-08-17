import assert from "node:assert/strict";
import test from "node:test";
import {
  isCanonicalRosterBody,
  isLiveRosterBody,
  nullableMetric,
  rosterCapabilityKnown,
  rosterEndpoint,
  rosterNeedsLiveDetail,
  rosterProgressionTotal,
  unitProgressionValue,
  validPlayerRosterBody,
} from "../public/roster-source-policy.js";

test("normal Roster Commander loads the persisted full-roster endpoint", () => {
  assert.equal(rosterEndpoint("732-764-286"), "/api/player/732764286/baseline");
  assert.equal(rosterEndpoint("732764286", { forceLive: true }), "/api/player/732764286");
});

test("source detection separates canonical baseline from live enrichment", () => {
  assert.equal(isCanonicalRosterBody({ source: "canonical" }), true);
  assert.equal(isCanonicalRosterBody({ capabilities: { persistedFullRoster: true } }), true);
  assert.equal(isLiveRosterBody({ source: "live" }), true);
  assert.equal(isLiveRosterBody({ source: "canonical" }), false);
  assert.equal(validPlayerRosterBody({ source: "canonical", player: {}, units: [], ships: [] }), true);
  assert.equal(validPlayerRosterBody({ source: "live", player: {}, units: [], ships: [] }), true);
});

test("only filters requiring non-persisted evidence force live detail", () => {
  assert.equal(rosterNeedsLiveDetail({ mods: "Any", upgrade: "omicron", readiness: "All", sort: "power" }), false);
  assert.equal(rosterNeedsLiveDetail({ mods: "open", upgrade: "Any", readiness: "All", sort: "power" }), true);
  assert.equal(rosterNeedsLiveDetail({ mods: "Any", upgrade: "omega", readiness: "All", sort: "power" }), true);
  assert.equal(rosterNeedsLiveDetail({ mods: "Any", upgrade: "Any", readiness: "75", sort: "power" }), true);
  assert.equal(rosterNeedsLiveDetail({ mods: "Any", upgrade: "Any", readiness: "All", sort: "readiness" }), true);
});

test("unknown persisted metrics remain unknown instead of becoming fake zero", () => {
  assert.equal(nullableMetric(null), "—");
  assert.equal(nullableMetric(undefined), "—");
  assert.equal(nullableMetric(""), "—");
  assert.equal(nullableMetric(null, null), null);
  assert.equal(nullableMetric(0), 0);
  assert.equal(nullableMetric("28"), 28);
});

test("canonical unknown ability evidence remains null at roster and unit scope", () => {
  const body = {
    source: "canonical",
    player: {},
    units: [{ zetas: 0, persistenceCapabilities: { zetas: false } }],
    ships: [],
    capabilities: { persistedFullRoster: true, zetas: false, omicrons: true, omegas: false },
    summary: { zetas: null, omicrons: 12, omegaUpgrades: null },
  };
  assert.equal(rosterCapabilityKnown(body, "zetas"), false);
  assert.equal(rosterProgressionTotal(body, "zetas", "zetas"), null);
  assert.equal(unitProgressionValue(body.units[0], "zetas", "zetas"), null);
  assert.equal(rosterProgressionTotal(body, "omicrons", "omicrons"), 12);
  assert.equal(rosterProgressionTotal(body, "omegas", "omegas", { summaryAliases: ["omegaUpgrades"] }), null);
});

test("known canonical omega totals use the verified snapshot alias", () => {
  const body = {
    source: "canonical",
    player: {},
    units: [],
    ships: [],
    capabilities: { persistedFullRoster: true, omegas: true },
    summary: { omegaUpgrades: 44 },
  };
  assert.equal(rosterProgressionTotal(body, "omegas", "omegas", { summaryAliases: ["omegaUpgrades"] }), 44);
});

test("live progression can fall back to unit-level totals when a summary is absent", () => {
  const body = {
    source: "live",
    player: {},
    units: [{ zetas: 2 }, { zetas: 3 }],
    ships: [],
    capabilities: { liveRoster: true },
    summary: {},
  };
  assert.equal(rosterCapabilityKnown(body, "zetas"), true);
  assert.equal(rosterProgressionTotal(body, "zetas", "zetas"), 5);
});
