import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const server = await readFile(new URL("../server.mjs", import.meta.url), "utf8");
const envExample = await readFile(new URL("../.env.example", import.meta.url), "utf8");
const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const registerScript = await readFile(new URL("../scripts/register-discord-tb-commands.mjs", import.meta.url), "utf8");
const liveService = await readFile(new URL("../discord-tb-live.mjs", import.meta.url), "utf8");

test("server accepts POST only for the signed Discord interactions endpoint before the GET-only API router", () => {
  const route = server.indexOf('request.method === "POST" && url.pathname === "/api/discord/interactions"');
  const methodGuard = server.indexOf('request.method !== "GET"');
  assert.ok(route >= 0);
  assert.ok(methodGuard > route);
  assert.match(server, /handleDiscordInteractionRequest\(request, response\)/);
});

test("server exposes a nonsecret Discord configuration status endpoint", () => {
  assert.match(server, /\/api\/discord\/status/);
  assert.match(server, /discordTbPublicStatus\(\)/);
});

test("Discord environment example is disabled by default and contains no secret value", () => {
  assert.match(envExample, /DISCORD_TB_INTERACTIONS_ENABLED=false/);
  assert.match(envExample, /DISCORD_TB_DELIVERY_ENABLED=false/);
  assert.match(envExample, /DISCORD_PUBLIC_KEY=\n/);
  assert.match(envExample, /DISCORD_BOT_TOKEN=\n/);
  assert.match(envExample, /DISCORD_DEFAULT_ALLY_CODE=\n/);
  assert.match(envExample, /DISCORD_TB_REDUNDANCY_TARGET=2/);
});

test("guild command registration is explicit, officer-first, and phase-aware", () => {
  assert.equal(packageJson.scripts["discord:register-tb"], "node scripts/register-discord-tb-commands.mjs");
  assert.match(registerScript, /default_member_permissions: "32"/);
  assert.match(registerScript, /name: "status"/);
  assert.match(registerScript, /name: "sync"/);
  assert.match(registerScript, /name: "phase"/);
  assert.match(registerScript, /description: "ROTE phase to inspect"/);
  assert.match(registerScript, /required: true/);
  assert.match(registerScript, /name: "assignments"/);
  assert.match(registerScript, /name: "farms"/);
  assert.match(registerScript, /Authorization: `Bot \$\{config\.botToken\}`/);
});

test("live Discord TB reads use the shared mission-safe and Phase Command models and never require browser state", () => {
  assert.match(liveService, /buildGuildRoteOperationSafety/);
  assert.match(liveService, /planGuildRoteSafeAssignments/);
  assert.match(liveService, /buildGuildTbPhaseCommand/);
  assert.match(liveService, /\/v1\/guild\/by-player\//);
  assert.doesNotMatch(liveService, /localStorage|document\.|window\./);
});
