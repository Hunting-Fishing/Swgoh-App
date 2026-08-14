import test from "node:test";
import assert from "node:assert/strict";
import { capabilityContract, withCapabilityContract } from "../capability-contract.mjs";

test("capability contract distinguishes unavailable account inventory from zero balances", () => {
  const capabilities = capabilityContract({
    source: "live",
    player: { galacticPower: 10_000_000 },
    units: [{ abilities: [] }],
    ships: [],
    summary: { datacrons: 0, sixDotMods: 0 },
  });

  assert.equal(capabilities.liveRoster, true);
  assert.equal(capabilities.profileGp, true);
  assert.equal(capabilities.datacrons, true);
  assert.equal(capabilities.sixDotMods, true);
  assert.equal(capabilities.materials, false);
  assert.equal(capabilities.currencyBalances, false);
  assert.equal(capabilities.unequippedGear, false);
  assert.equal(capabilities.unequippedMods, false);
});

test("zero-valued supported summary fields remain available", () => {
  const capabilities = capabilityContract({
    source: "live",
    units: [],
    ships: [],
    summary: { datacrons: 0, sixDotMods: 0 },
  });

  assert.equal(capabilities.datacrons, true);
  assert.equal(capabilities.sixDotMods, true);
});

test("gateway-provided capability fields override app defaults", () => {
  const body = withCapabilityContract({
    source: "live",
    units: [],
    ships: [],
    capabilities: { materials: true, customField: true },
  });

  assert.equal(body.capabilities.materials, true);
  assert.equal(body.capabilities.currencyBalances, false);
  assert.equal(body.capabilities.customField, true);
});
