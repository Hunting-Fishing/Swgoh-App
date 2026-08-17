import assert from "node:assert/strict";
import test from "node:test";
import {
  isCanonicalRosterBody,
  isLiveRosterBody,
  nullableMetric,
  rosterCapabilityKnown,
  rosterEndpoint,
  rosterNeedsLiveDetail,
  rosterSourceStatus,
  unitCapabilityKnown,
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

test("canonical progression capability must be explicitly verified", () => {
  assert.equal(rosterCapabilityKnown({ source: "canonical", capabilities: { zetas: true } }, "zetas"), true);
  assert.equal(rosterCapabilityKnown({ source: "canonical", capabilities: { zetas: false } }, "zetas"), false);
  assert.equal(rosterCapabilityKnown({ source: "canonical", capabilities: {} }, "zetas"), false);
  assert.equal(rosterCapabilityKnown({ source: "live", capabilities: {} }, "zetas"), true);
  assert.equal(rosterCapabilityKnown({ source: "live", capabilities: { zetas: false } }, "zetas"), false);
});

test("canonical unit progression honors persistence classification completeness", () => {
  assert.equal(unitCapabilityKnown({ persistenceCapabilities: { zetas: true } }, "zetas"), true);
  assert.equal(unitCapabilityKnown({ persistenceCapabilities: { zetas: false } }, "zetas"), false);
  assert.equal(unitCapabilityKnown({ persistenceCapabilities: {} }, "omicrons"), false);
  assert.equal(unitCapabilityKnown({ zetas: 2 }, "zetas"), true);
});

test("user-facing roster source wording never labels canonical data as live", () => {
  const canonical = rosterSourceStatus({
    source: "canonical",
    player: { name: "Warm Bacon" },
    persistence: { lastSyncedAt: "2026-08-17T17:55:08.229Z" },
  }, 394);
  assert.match(canonical, /Warm Bacon/);
  assert.match(canonical, /persisted full roster/);
  assert.match(canonical, /394 owned/);
  assert.match(canonical, /live detail available on refresh/);
  assert.doesNotMatch(canonical, /live roster \+/);

  const live = rosterSourceStatus({
    source: "live",
    player: { name: "Warm Bacon" },
  }, 394);
  assert.match(live, /live roster/);
  assert.match(live, /394 owned/);
});
