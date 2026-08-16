import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const server = await readFile(new URL("../server.mjs", import.meta.url), "utf8");
const envExample = await readFile(new URL("../.env.example", import.meta.url), "utf8");
const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const registerScript = await readFile(new URL("../scripts/register-discord-tb-commands.mjs", import.meta.url), "utf8");
const discordTransport = await readFile(new URL("../discord-tb.mjs", import.meta.url), "utf8");
const liveService = await readFile(new URL("../discord-tb-live.mjs", import.meta.url), "utf8");
const guildService = await readFile(new URL("../guild-roster-service.mjs", import.meta.url), "utf8");
const discordState = await readFile(new URL("../discord-state-store.mjs", import.meta.url), "utf8");

test("server accepts POST only for the signed Discord interactions endpoint before the GET-only API router", () => {
  const route = server.indexOf('request.method === "POST" && url.pathname === "/api/discord/interactions"');
  const methodGuard = server.indexOf('request.method !== "GET"');
  assert.ok(route >= 0);
  assert.ok(methodGuard > route);
  assert.match(server, /handleDiscordInteractionRequest\(request, response\)/);
});

test("server exposes nonsecret Discord command and durable-state readiness", () => {
  assert.match(server, /\/api\/discord\/status/);
  assert.match(server, /import \{ discordStateStore \} from "\.\/discord-state-store\.mjs"/);
  assert.match(server, /durableState: discordStateStore\.status\(\)/);
  assert.match(server, /discordTbPublicStatus\(\)/);
});

test("Discord environment example is disabled/fail-closed by default and contains no secret value", () => {
  assert.match(envExample, /DISCORD_TB_INTERACTIONS_ENABLED=false/);
  assert.match(envExample, /DISCORD_TB_DELIVERY_ENABLED=false/);
  assert.match(envExample, /DISCORD_PUBLIC_KEY=\n/);
  assert.match(envExample, /DISCORD_BOT_TOKEN=\n/);
  assert.match(envExample, /DISCORD_DEFAULT_ALLY_CODE=\n/);
  assert.match(envExample, /DISCORD_TB_REDUNDANCY_TARGET=2/);
  assert.match(envExample, /SWGOH_STATE_DIR=\n/);
  assert.match(envExample, /SWGOH_STATE_STORAGE_CONFIRMED_DURABLE=false/);
  assert.match(envExample, /SWGOH_STATE_MAX_BYTES=5242880/);
});

test("durable state auto-detects a Railway volume but does not claim arbitrary local paths are durable", () => {
  assert.match(discordState, /RAILWAY_VOLUME_MOUNT_PATH/);
  assert.match(discordState, /SWGOH_STATE_STORAGE_CONFIRMED_DURABLE/);
  assert.match(discordState, /state-directory-not-confirmed-durable/);
  assert.match(discordState, /atomic-json-volume/);
  assert.match(discordState, /discord-state-v1\.json/);
  assert.match(discordState, /async bootstrapGuild/);
  assert.match(discordState, /action: "guild-bootstrap-updated"/);
});

test("Discord transport exposes only the controlled bootstrap mutation; publishing and other state mutations stay disconnected", () => {
  assert.match(discordTransport, /import \{ discordStateStore \} from "\.\/discord-state-store\.mjs"/);
  assert.match(discordTransport, /stateStore\.bootstrapGuild\(/);
  assert.doesNotMatch(discordTransport, /stateStore\.upsertGuildConnection\(/);
  assert.doesNotMatch(discordTransport, /stateStore\.setOfficerRoleIds\(/);
  assert.doesNotMatch(discordTransport, /stateStore\.linkPlayer\(/);
  assert.doesNotMatch(discordTransport, /stateStore\.savePlanVersion\(/);
  assert.doesNotMatch(discordTransport, /sendDirectMessage|sendDm/);
});

test("guild command registration exposes setup selectors while server-side authorization remains authoritative", () => {
  assert.equal(packageJson.scripts["discord:register-tb"], "node scripts/register-discord-tb-commands.mjs");
  assert.doesNotMatch(registerScript, /default_member_permissions/);
  assert.match(registerScript, /Picker visibility stays broad in the pilot/);
  assert.match(registerScript, /name: "status"/);
  assert.match(registerScript, /name: "setup"/);
  assert.match(registerScript, /type: 7,[\s\S]*name: "channel"/);
  assert.match(registerScript, /type: 8,[\s\S]*name: "officer_role"/);
  assert.match(registerScript, /name: "sync"/);
  assert.match(registerScript, /name: "phase"/);
  assert.match(registerScript, /description: "ROTE phase to inspect"/);
  assert.match(registerScript, /required: true/);
  assert.match(registerScript, /name: "assignments"/);
  assert.match(registerScript, /name: "farms"/);
  assert.match(registerScript, /Authorization: `Bot \$\{config\.botToken\}`/);
});

test("signed Discord application commands authorize bootstrap before configured-role fallback and command execution", () => {
  const typeGuard = discordTransport.indexOf('Number(interaction?.type) !== DISCORD_INTERACTION_TYPES.APPLICATION_COMMAND');
  const appGuard = discordTransport.indexOf('String(interaction?.application_id || "") !== config.applicationId');
  const subcommand = discordTransport.indexOf('const subcommand = discordTbSubcommand(interaction)');
  const bootstrapPermission = discordTransport.indexOf('const bootstrapAuthorized = discordTbMemberHasOfficerPermission(interaction)');
  const configuredRole = discordTransport.indexOf('authorized = await discordTbMemberHasConfiguredOfficerRole(interaction, stateStore)');
  const authorizationFailure = discordTransport.indexOf('if (!authorized)');
  const commandExecution = discordTransport.indexOf('const commandResponse = handleDiscordTbCommand(interaction, config)');

  assert.ok(typeGuard >= 0);
  assert.ok(appGuard > typeGuard);
  assert.ok(subcommand > appGuard);
  assert.ok(bootstrapPermission > subcommand);
  assert.ok(configuredRole > bootstrapPermission);
  assert.ok(authorizationFailure > configuredRole);
  assert.ok(commandExecution > authorizationFailure);
  assert.match(discordTransport, /subcommand !== "setup"/);
  assert.match(discordTransport, /setupAuthorization: "manage-guild-or-administrator"/);
  assert.match(discordTransport, /officerAuthorization: "manage-guild-administrator-or-configured-role"/);
  assert.match(discordTransport, /MANAGE_GUILD_PERMISSION = 1n << 5n/);
  assert.match(discordTransport, /ADMINISTRATOR_PERMISSION = 1n << 3n/);
});

test("/tb setup verifies durable storage before the single bootstrap mutation", () => {
  const setupBranch = discordTransport.indexOf('if (subcommand === "setup")');
  const statusCheck = discordTransport.indexOf('const stateStatus = stateStore.status()', setupBranch);
  const durabilityGuard = discordTransport.indexOf('if (!stateStatus?.enabled || !stateStatus?.durable)', setupBranch);
  const bootstrapMutation = discordTransport.indexOf('const guild = await stateStore.bootstrapGuild({', setupBranch);
  const publishDisabled = discordTransport.indexOf('Publishing and DMs are still disabled', setupBranch);

  assert.ok(setupBranch >= 0);
  assert.ok(statusCheck > setupBranch);
  assert.ok(durabilityGuard > statusCheck);
  assert.ok(bootstrapMutation > durabilityGuard);
  assert.ok(publishDisabled > bootstrapMutation);
});

test("Discord PING response remains before application/member authorization for endpoint verification", () => {
  const ping = discordTransport.indexOf('Number(interaction?.type) === DISCORD_INTERACTION_TYPES.PING');
  const appGuard = discordTransport.indexOf('String(interaction?.application_id || "") !== config.applicationId');
  const bootstrapPermission = discordTransport.indexOf('const bootstrapAuthorized = discordTbMemberHasOfficerPermission(interaction)');
  assert.ok(ping >= 0);
  assert.ok(appGuard > ping);
  assert.ok(bootstrapPermission > ping);
});

test("web API and Discord production path import the same process-wide guild roster service", () => {
  assert.match(server, /import \{ guildRosterService \} from "\.\/guild-roster-service\.mjs"/);
  assert.match(server, /const forceRefresh = url\.searchParams\.get\("refresh"\) === "1"/);
  assert.match(server, /guildRosterService\.getGuildRoster\(allyCode, \{/);
  assert.match(server, /forceRefresh,/);
  assert.match(server, /staleWhileRevalidate: !forceRefresh/);
  assert.match(server, /"X-Guild-Refresh": forceRefresh \? "requested" : "normal"/);
  assert.match(server, /guildRosterCache: guildRosterService\.status\(\)/);
  assert.doesNotMatch(server, /const guildCache = new LiveRosterCache/);

  assert.match(liveService, /import \{ createGuildRosterService, guildRosterService \} from "\.\/guild-roster-service\.mjs"/);
  assert.match(liveService, /if \(env === process\.env && !options\.fetch\) return guildRosterService/);
  assert.match(liveService, /staleWhileRevalidate: false/);
  assert.match(liveService, /refreshGuildRoster\(allyCode\)/);
  assert.doesNotMatch(liveService, /const guildCache = new Map/);
});

test("shared guild service owns the one live guild gateway route and reports scope accurately", () => {
  assert.match(guildService, /\/v1\/guild\/by-player\/\$\{encodeURIComponent\(allyCode\)\}\/roster/);
  assert.match(guildService, /sharedBetweenWebAndDiscord: true/);
  assert.match(guildService, /sharedAcrossInstances: false/);
  assert.match(guildService, /shared: false/);
});

test("live Discord TB reads use the shared mission-safe and Phase Command models and never require browser state", () => {
  assert.match(liveService, /buildGuildRoteOperationSafety/);
  assert.match(liveService, /planGuildRoteSafeAssignments/);
  assert.match(liveService, /buildGuildTbPhaseCommand/);
  assert.doesNotMatch(liveService, /localStorage|document\.|window\./);
});
