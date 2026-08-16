import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { Readable } from "node:stream";
import {
  discordTbConfig,
  discordTbMemberHasConfiguredOfficerRole,
  discordTbMemberHasOfficerPermission,
  discordTbOption,
  discordTbPhase,
  discordTbPublicStatus,
  discordTbSubcommand,
  editDiscordOriginalResponse,
  executeDiscordTbDeferredCommand,
  handleDiscordInteractionRequest,
  handleDiscordTbCommand,
  verifyDiscordInteraction,
} from "../discord-tb.mjs";

function testKeys() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const der = publicKey.export({ format: "der", type: "spki" });
  return { publicKeyHex: der.subarray(-32).toString("hex"), privateKey };
}

function signedInteractionRequest(interaction, privateKey, timestamp = "1786887600") {
  const rawBody = Buffer.from(JSON.stringify(interaction), "utf8");
  const message = Buffer.concat([Buffer.from(timestamp, "utf8"), rawBody]);
  const signature = sign(null, message, privateKey).toString("hex");
  const request = Readable.from([rawBody]);
  request.headers = {
    "x-signature-ed25519": signature,
    "x-signature-timestamp": timestamp,
  };
  return request;
}

function captureResponse() {
  const result = { status: null, headers: null, body: "" };
  return {
    result,
    response: {
      writeHead(status, headers) {
        result.status = status;
        result.headers = headers;
      },
      end(chunk = "") {
        result.body += String(chunk || "");
      },
    },
  };
}

function authEnv(publicKeyHex) {
  return {
    DISCORD_TB_INTERACTIONS_ENABLED: "true",
    DISCORD_APPLICATION_ID: "123456789012345678",
    DISCORD_PUBLIC_KEY: publicKeyHex,
    DISCORD_DEFAULT_GUILD_ID: "987654321098765432",
    DISCORD_DEFAULT_ALLY_CODE: "123456789",
  };
}

function configuredRoleStore(roleId = "333333333333333333") {
  return {
    status: () => ({ enabled: true, durable: true, reason: "ready" }),
    readGuild: async () => ({ officerRoleIds: [roleId] }),
  };
}

test("Discord interaction verification accepts the exact signed timestamp+body and rejects mutations", () => {
  const { publicKeyHex, privateKey } = testKeys();
  const timestamp = "1786887600";
  const rawBody = Buffer.from(JSON.stringify({ type: 1 }), "utf8");
  const message = Buffer.concat([Buffer.from(timestamp, "utf8"), rawBody]);
  const signature = sign(null, message, privateKey).toString("hex");

  assert.equal(verifyDiscordInteraction({ publicKey: publicKeyHex, signature, timestamp, rawBody }), true);
  assert.equal(verifyDiscordInteraction({ publicKey: publicKeyHex, signature, timestamp, rawBody: Buffer.from('{"type":2}') }), false);
  assert.equal(verifyDiscordInteraction({ publicKey: publicKeyHex, signature: "00", timestamp, rawBody }), false);
});

test("Discord public status exposes configuration/auth policy but never secret values", () => {
  const env = {
    DISCORD_TB_INTERACTIONS_ENABLED: "true",
    DISCORD_TB_DELIVERY_ENABLED: "false",
    DISCORD_APPLICATION_ID: "123456789012345678",
    DISCORD_PUBLIC_KEY: "ab".repeat(32),
    DISCORD_BOT_TOKEN: "super-secret-token",
    DISCORD_DEFAULT_GUILD_ID: "987654321098765432",
    DISCORD_DEFAULT_ALLY_CODE: "123-456-789",
    DISCORD_TB_REDUNDANCY_TARGET: "4",
  };
  const status = discordTbPublicStatus(env);
  const serialized = JSON.stringify(status);
  assert.equal(status.enabled, true);
  assert.equal(status.configured, true);
  assert.equal(status.botTokenConfigured, true);
  assert.equal(status.commandRegistrationConfigured, true);
  assert.equal(status.pilotGuildLiveConfigured, true);
  assert.equal(status.redundancyTarget, 4);
  assert.equal(status.officerAuthorization, "manage-guild-administrator-or-configured-role");
  assert.equal(status.setupAuthorization, "manage-guild-or-administrator");
  assert.equal(serialized.includes("super-secret-token"), false);
  assert.equal(serialized.includes("ab".repeat(32)), false);
  assert.equal(serialized.includes("123456789"), false);
});

test("invalid public key leaves the interaction configuration fail-closed", () => {
  const config = discordTbConfig({
    DISCORD_TB_INTERACTIONS_ENABLED: "true",
    DISCORD_APPLICATION_ID: "123456789012345678",
    DISCORD_PUBLIC_KEY: "not-a-key",
  });
  assert.equal(config.interactionsEnabled, true);
  assert.equal(config.configured, false);
  assert.equal(config.publicKey, "");
});

test("bootstrap officer authorization accepts Manage Guild or Administrator and rejects malformed/missing permissions", () => {
  assert.equal(discordTbMemberHasOfficerPermission({ member: { permissions: "32" } }), true);
  assert.equal(discordTbMemberHasOfficerPermission({ member: { permissions: "8" } }), true);
  assert.equal(discordTbMemberHasOfficerPermission({ member: { permissions: "40" } }), true);
  assert.equal(discordTbMemberHasOfficerPermission({ member: { permissions: "0" } }), false);
  assert.equal(discordTbMemberHasOfficerPermission({}), false);
  assert.equal(discordTbMemberHasOfficerPermission({ member: { permissions: "-1" } }), false);
  assert.equal(discordTbMemberHasOfficerPermission({ member: { permissions: "not-a-bitset" } }), false);
});

test("configured officer-role authorization is durable-state backed and fail-closed", async () => {
  const interaction = {
    guild_id: "987654321098765432",
    member: { permissions: "0", roles: ["333333333333333333"] },
  };
  assert.equal(await discordTbMemberHasConfiguredOfficerRole(interaction, configuredRoleStore()), true);
  assert.equal(await discordTbMemberHasConfiguredOfficerRole(interaction, configuredRoleStore("444444444444444444")), false);
  assert.equal(await discordTbMemberHasConfiguredOfficerRole(interaction, { status: () => ({ enabled: false }), readGuild: async () => ({ officerRoleIds: ["333333333333333333"] }) }), false);
  assert.equal(await discordTbMemberHasConfiguredOfficerRole(interaction, { status: () => ({ enabled: true }), readGuild: async () => { throw new Error("read failed"); } }), false);
});

test("signed application commands are rejected when the member has neither Discord officer permission nor configured role", async () => {
  const { publicKeyHex, privateKey } = testKeys();
  const interaction = {
    type: 2,
    application_id: "123456789012345678",
    guild_id: "987654321098765432",
    member: { permissions: "0", roles: [], user: { id: "111111111111111111" } },
    data: { name: "tb", options: [{ type: 1, name: "status" }] },
  };
  const request = signedInteractionRequest(interaction, privateKey);
  const captured = captureResponse();

  await handleDiscordInteractionRequest(request, captured.response, authEnv(publicKeyHex), { stateStore: configuredRoleStore() });
  assert.equal(captured.result.status, 200);
  const body = JSON.parse(captured.result.body);
  assert.equal(body.type, 4);
  assert.equal(body.data.flags, 64);
  assert.match(body.data.content, /Officer permission required/);
});

test("signed read commands with a durably configured officer role pass without Manage Guild", async () => {
  const { publicKeyHex, privateKey } = testKeys();
  const interaction = {
    type: 2,
    application_id: "123456789012345678",
    guild_id: "987654321098765432",
    member: { permissions: "0", roles: ["333333333333333333"], user: { id: "111111111111111111" } },
    data: { name: "tb", options: [{ type: 1, name: "status" }] },
  };
  const request = signedInteractionRequest(interaction, privateKey);
  const captured = captureResponse();

  await handleDiscordInteractionRequest(request, captured.response, authEnv(publicKeyHex), { stateStore: configuredRoleStore() });
  assert.equal(captured.result.status, 200);
  const body = JSON.parse(captured.result.body);
  assert.equal(body.type, 4);
  assert.match(body.data.content, /durably configured officer role/);
});

test("configured officer roles cannot bootstrap or reconfigure /tb setup", async () => {
  const { publicKeyHex, privateKey } = testKeys();
  const interaction = {
    type: 2,
    application_id: "123456789012345678",
    guild_id: "987654321098765432",
    channel_id: "222222222222222222",
    member: { permissions: "0", roles: ["333333333333333333"], user: { id: "111111111111111111" } },
    data: { name: "tb", options: [{ type: 1, name: "setup" }] },
  };
  const request = signedInteractionRequest(interaction, privateKey);
  const captured = captureResponse();

  await handleDiscordInteractionRequest(request, captured.response, authEnv(publicKeyHex), { stateStore: configuredRoleStore() });
  assert.equal(captured.result.status, 200);
  const body = JSON.parse(captured.result.body);
  assert.equal(body.type, 4);
  assert.match(body.data.content, /Bootstrap permission required/);
});

test("signed application commands with Manage Guild permission pass the bootstrap officer gate", async () => {
  const { publicKeyHex, privateKey } = testKeys();
  const interaction = {
    type: 2,
    application_id: "123456789012345678",
    guild_id: "987654321098765432",
    member: { permissions: "32", roles: [], user: { id: "111111111111111111" } },
    data: { name: "tb", options: [{ type: 1, name: "status" }] },
  };
  const request = signedInteractionRequest(interaction, privateKey);
  const captured = captureResponse();

  await handleDiscordInteractionRequest(request, captured.response, authEnv(publicKeyHex));
  assert.equal(captured.result.status, 200);
  const body = JSON.parse(captured.result.body);
  assert.equal(body.type, 4);
  assert.match(body.data.content, /SWGOH Command Center · TB/);
  assert.match(body.data.content, /Setup authorization/);
});

test("signed application commands from a different Discord application are rejected", async () => {
  const { publicKeyHex, privateKey } = testKeys();
  const interaction = {
    type: 2,
    application_id: "999999999999999999",
    guild_id: "987654321098765432",
    member: { permissions: "32" },
    data: { name: "tb", options: [{ type: 1, name: "status" }] },
  };
  const request = signedInteractionRequest(interaction, privateKey);
  const captured = captureResponse();

  await handleDiscordInteractionRequest(request, captured.response, authEnv(publicKeyHex));
  assert.equal(captured.result.status, 401);
  assert.match(JSON.parse(captured.result.body).error, /application does not match/);
});

test("signed Discord PING remains valid without guild member permissions", async () => {
  const { publicKeyHex, privateKey } = testKeys();
  const request = signedInteractionRequest({ type: 1 }, privateKey);
  const captured = captureResponse();

  await handleDiscordInteractionRequest(request, captured.response, authEnv(publicKeyHex));
  assert.equal(captured.result.status, 200);
  assert.deepEqual(JSON.parse(captured.result.body), { type: 1 });
});

test("/tb status is ephemeral and pilot-guild restricted", () => {
  const config = discordTbConfig({
    DISCORD_TB_INTERACTIONS_ENABLED: "true",
    DISCORD_APPLICATION_ID: "123456789012345678",
    DISCORD_PUBLIC_KEY: "ab".repeat(32),
    DISCORD_DEFAULT_GUILD_ID: "987654321098765432",
  });
  const allowed = handleDiscordTbCommand({
    guild_id: "987654321098765432",
    data: { name: "tb", options: [{ type: 1, name: "status" }] },
  }, config);
  assert.equal(allowed.type, 4);
  assert.equal(allowed.data.flags, 64);
  assert.match(allowed.data.content, /SWGOH Command Center · TB/);

  const denied = handleDiscordTbCommand({
    guild_id: "111111111111111111",
    data: { name: "tb", options: [{ type: 1, name: "status" }] },
  }, config);
  assert.match(denied.data.content, /restricted to the configured pilot Discord server/);
});

test("live read commands can defer without the fallback Ally Code while /tb setup still requires the bootstrap seed", () => {
  const configured = discordTbConfig({
    DISCORD_TB_INTERACTIONS_ENABLED: "true",
    DISCORD_APPLICATION_ID: "123456789012345678",
    DISCORD_PUBLIC_KEY: "ab".repeat(32),
    DISCORD_DEFAULT_GUILD_ID: "987654321098765432",
    DISCORD_DEFAULT_ALLY_CODE: "123456789",
  });
  const syncInteraction = {
    guild_id: "987654321098765432",
    data: { name: "tb", options: [{ type: 1, name: "sync" }] },
  };
  const setupInteraction = {
    guild_id: "987654321098765432",
    channel_id: "222222222222222222",
    data: { name: "tb", options: [{ type: 1, name: "setup" }] },
  };
  assert.equal(handleDiscordTbCommand(syncInteraction, configured).type, 5);
  assert.equal(handleDiscordTbCommand(setupInteraction, configured).type, 5);

  const phaseInteraction = {
    guild_id: "987654321098765432",
    data: { name: "tb", options: [{ type: 1, name: "phase", options: [{ type: 3, name: "phase", value: "P2" }] }] },
  };
  assert.equal(handleDiscordTbCommand(phaseInteraction, configured).type, 5);

  const missingPhase = handleDiscordTbCommand({
    guild_id: "987654321098765432",
    data: { name: "tb", options: [{ type: 1, name: "phase" }] },
  }, configured);
  assert.equal(missingPhase.type, 4);
  assert.match(missingPhase.data.content, /Choose a ROTE phase/);

  const durableOnly = discordTbConfig({
    DISCORD_TB_INTERACTIONS_ENABLED: "true",
    DISCORD_APPLICATION_ID: "123456789012345678",
    DISCORD_PUBLIC_KEY: "ab".repeat(32),
    DISCORD_DEFAULT_GUILD_ID: "987654321098765432",
  });
  const syncResponse = handleDiscordTbCommand(syncInteraction, durableOnly);
  assert.equal(syncResponse.type, 5);

  const setupResponse = handleDiscordTbCommand(setupInteraction, durableOnly);
  assert.equal(setupResponse.type, 4);
  assert.match(setupResponse.data.content, /Initial.*tb setup.*DISCORD_DEFAULT_ALLY_CODE/);
});

test("subcommand/option resolver handles Discord setup channel/role snowflake values and validates phase", () => {
  const setup = {
    data: {
      options: [{
        type: 1,
        name: "setup",
        options: [
          { type: 7, name: "channel", value: "222222222222222222" },
          { type: 8, name: "officer_role", value: "333333333333333333" },
        ],
      }],
    },
  };
  assert.equal(discordTbSubcommand(setup), "setup");
  assert.equal(discordTbOption(setup, "channel"), "222222222222222222");
  assert.equal(discordTbOption(setup, "officer_role"), "333333333333333333");
  assert.equal(discordTbSubcommand({ data: {} }), "status");
  assert.equal(discordTbPhase({ data: { options: [{ type: 1, name: "assignments", options: [{ type: 3, name: "phase", value: "P3" }] }] } }), "P3");
  assert.equal(discordTbPhase({ data: { options: [{ type: 1, name: "assignments", options: [{ type: 3, name: "phase", value: "P9" }] }] } }), "");
});

test("deferred setup performs one durable atomic bootstrap and defaults channel to the interaction channel", async () => {
  const config = discordTbConfig({
    DISCORD_APPLICATION_ID: "123456789012345678",
    DISCORD_PUBLIC_KEY: "ab".repeat(32),
    DISCORD_DEFAULT_GUILD_ID: "987654321098765432",
    DISCORD_DEFAULT_ALLY_CODE: "123456789",
  });
  let capturedArgs;
  const content = await executeDiscordTbDeferredCommand(
    {
      guild_id: "987654321098765432",
      channel_id: "222222222222222222",
      member: { user: { id: "111111111111111111" } },
      data: {
        name: "tb",
        options: [{ type: 1, name: "setup", options: [{ type: 8, name: "officer_role", value: "333333333333333333" }] }],
      },
    },
    config,
    {
      stateStore: {
        status: () => ({ enabled: true, durable: true, reason: "ready" }),
        bootstrapGuild: async (args) => {
          capturedArgs = args;
          return {
            discordGuildId: args.discordGuildId,
            swgohAllyCode: args.swgohAllyCode,
            commandChannelId: args.commandChannelId,
            officerRoleIds: args.officerRoleIds,
          };
        },
      },
    },
  );
  assert.deepEqual(capturedArgs, {
    discordGuildId: "987654321098765432",
    swgohAllyCode: "123456789",
    commandChannelId: "222222222222222222",
    officerRoleIds: ["333333333333333333"],
    actorDiscordUserId: "111111111111111111",
  });
  assert.match(content, /Durable Setup Saved/);
  assert.match(content, /Publishing and DMs are still disabled/);
});

test("deferred setup refuses to mutate when durable state is not ready", async () => {
  const config = discordTbConfig({
    DISCORD_APPLICATION_ID: "123456789012345678",
    DISCORD_PUBLIC_KEY: "ab".repeat(32),
    DISCORD_DEFAULT_GUILD_ID: "987654321098765432",
    DISCORD_DEFAULT_ALLY_CODE: "123456789",
  });
  let mutations = 0;
  await assert.rejects(
    () => executeDiscordTbDeferredCommand(
      {
        guild_id: "987654321098765432",
        channel_id: "222222222222222222",
        member: { user: { id: "111111111111111111" } },
        data: { name: "tb", options: [{ type: 1, name: "setup" }] },
      },
      config,
      {
        stateStore: {
          status: () => ({ enabled: false, durable: false, reason: "durable-storage-not-configured" }),
          bootstrapGuild: async () => { mutations += 1; },
        },
      },
    ),
    /Attach a persistent Railway Volume/,
  );
  assert.equal(mutations, 0);
});

test("deferred sync returns a live read-only guild summary", async () => {
  const config = discordTbConfig({
    DISCORD_APPLICATION_ID: "123456789012345678",
    DISCORD_PUBLIC_KEY: "ab".repeat(32),
    DISCORD_DEFAULT_GUILD_ID: "987654321098765432",
    DISCORD_DEFAULT_ALLY_CODE: "123456789",
  });
  const content = await executeDiscordTbDeferredCommand(
    { data: { name: "tb", options: [{ type: 1, name: "sync" }] } },
    config,
    {
      syncGuild: async () => ({
        cache: "refreshed",
        guild: {
          guild: { name: "Pilot Guild" },
          members: [{ rosterAvailable: true, galacticPower: 1234 }],
        },
      }),
    },
  );
  assert.match(content, /Pilot Guild/);
  assert.match(content, /No TB assignments or officer state were changed/);
});

test("deferred sync permits a durable-only live service with no environment fallback Ally Code", async () => {
  const config = discordTbConfig({
    DISCORD_APPLICATION_ID: "123456789012345678",
    DISCORD_PUBLIC_KEY: "ab".repeat(32),
    DISCORD_DEFAULT_GUILD_ID: "987654321098765432",
  });
  let capturedArgs;
  const interaction = {
    guild_id: "987654321098765432",
    data: { name: "tb", options: [{ type: 1, name: "sync" }] },
  };
  const content = await executeDiscordTbDeferredCommand(interaction, config, {
    syncGuild: async (args) => {
      capturedArgs = args;
      return {
        cache: "refreshed",
        guild: {
          guild: { name: "Durable Guild" },
          members: [{ rosterAvailable: true, galacticPower: 5678 }],
        },
      };
    },
  });
  assert.equal(capturedArgs.allyCode, "");
  assert.equal(capturedArgs.interaction, interaction);
  assert.match(content, /Durable Guild/);
});

test("deferred phase command returns the shared officer phase summary", async () => {
  const config = discordTbConfig({
    DISCORD_APPLICATION_ID: "123456789012345678",
    DISCORD_PUBLIC_KEY: "ab".repeat(32),
    DISCORD_DEFAULT_GUILD_ID: "987654321098765432",
    DISCORD_DEFAULT_ALLY_CODE: "123456789",
    DISCORD_TB_REDUNDANCY_TARGET: "2",
  });
  const content = await executeDiscordTbDeferredCommand(
    {
      data: {
        name: "tb",
        options: [{ type: 1, name: "phase", options: [{ type: 3, name: "phase", value: "P2" }] }],
      },
    },
    config,
    {
      buildPhaseCommand: async ({ phase, redundancyTarget }) => ({
        guild: { guild: { name: "Pilot Guild" }, members: [{ rosterAvailable: true }, { rosterAvailable: true }] },
        phaseCommand: {
          phase,
          redundancyTarget,
          summary: {
            hydratedMembers: 2,
            totalMembers: 2,
            exactCoveragePercent: 75,
            zeroCoverageMissions: 1,
            singleOwnerMissions: 2,
            redundancyCoveragePercent: 50,
            partialEvidenceMissions: 1,
            assignedOperationSlots: 9,
            operationSlots: 10,
            operationCoveragePercent: 90,
            unfilledOperationSlots: 1,
            riskyAssignments: 2,
            protectedUnits: 4,
            farmPriorities: 3,
          },
          alerts: [{ severity: "critical", title: "No exact-ready member", detail: "Mission needs officer attention." }],
          members: [{ name: "High Burden Officer", burden: 125, soleOwnerMissions: 1, operationAssignments: 3, riskyAssignments: 1 }],
        },
      }),
    },
  );
  assert.match(content, /ROTE Phase Command · P2/);
  assert.match(content, /Pilot Guild/);
  assert.match(content, /75% exact coverage/);
  assert.match(content, /No exact-ready member/);
  assert.match(content, /High Burden Officer/);
  assert.match(content, /Same phase model as the web Command Board/);
});

test("Discord deferred response edits the original interaction and suppresses mentions", async () => {
  const config = discordTbConfig({
    DISCORD_APPLICATION_ID: "123456789012345678",
    DISCORD_PUBLIC_KEY: "ab".repeat(32),
  });
  let request;
  const ok = await editDiscordOriginalResponse(
    { token: "interaction-token" },
    config,
    "hello",
    async (url, options) => {
      request = { url, options };
      return { ok: true, status: 200, text: async () => "" };
    },
  );
  assert.equal(ok, true);
  assert.match(request.url, /\/messages\/@original$/);
  assert.equal(request.options.method, "PATCH");
  assert.deepEqual(JSON.parse(request.options.body).allowed_mentions, { parse: [] });
});
