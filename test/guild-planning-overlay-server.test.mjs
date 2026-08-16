import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const server = await readFile(new URL("../server.mjs", import.meta.url), "utf8");
const overlay = await readFile(new URL("../guild-planning-overlay.mjs", import.meta.url), "utf8");

test("server exposes a sanitized per-guild planning overlay route", () => {
  assert.ok(server.includes("planning-overlay"));
  assert.match(server, /planningOverlayMatch/);
  assert.match(server, /resolveGuildPlanningOverlay\(cached\.value\)/);
  assert.match(server, /X-Guild-Planning-Overlay/);
  assert.match(server, /X-Guild-Planning-Source/);
});

test("planning overlay does not serialize Discord identity or bot-state fields", () => {
  assert.equal(/discordUserId/.test(overlay), false);
  assert.equal(/roleIds/.test(overlay), false);
  assert.equal(/channelId/.test(overlay), false);
  assert.equal(/botToken/i.test(overlay), false);
  assert.match(overlay, /preferences/);
  assert.match(overlay, /ignoredMembers/);
  assert.match(overlay, /unavailableMembers/);
});

test("multiple durable bindings fail closed instead of combining controls", () => {
  assert.match(overlay, /ambiguous-discord-guild-bindings/);
  assert.match(overlay, /bindings\.length > 1/);
});
