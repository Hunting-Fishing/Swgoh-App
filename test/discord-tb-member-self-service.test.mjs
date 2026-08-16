import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { Readable } from "node:stream";
import {
  discordTbConfig,
  discordTbSelfServiceTargetAllowed,
  executeDiscordTbDeferredCommand,
  handleDiscordInteractionRequest,
} from "../discord-tb.mjs";

const applicationId = "123456789012345678";
const guildId = "987654321098765432";
const actorId = "111111111111111111";
const otherId = "222222222222222222";

function testKeys() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const der = publicKey.export({ format: "der", type: "spki" });
  return { publicKeyHex: der.subarray(-32).toString("hex"), privateKey };
}

function authEnv(publicKeyHex) {
  return {
    DISCORD_TB_INTERACTIONS_ENABLED: "true",
    DISCORD_APPLICATION_ID: applicationId,
    DISCORD_PUBLIC_KEY: publicKeyHex,
    DISCORD_DEFAULT_GUILD_ID: guildId,
  };
}

function config() {
  return discordTbConfig({
    DISCORD_TB_INTERACTIONS_ENABLED: "true",
    DISCORD_APPLICATION_ID: applicationId,
    DISCORD_PUBLIC_KEY: "ab".repeat(32),
    DISCORD_DEFAULT_GUILD_ID: guildId,
  });
}

function interaction(name, options = [], permissions = "0") {
  return {
    type: 2,
    application_id: applicationId,
    token: "interaction-token",
    guild_id: guildId,
    member: { permissions, roles: [], user: { id: actorId } },
    data: {
      name: "tb",
      options: [{ type: 1, name, ...(options.length ? { options } : {}) }],
    },
  };
}

function signedRequest(body, privateKey, timestamp = "1786887600") {
  const rawBody = Buffer.from(JSON.stringify(body), "utf8");
  const signature = sign(null, Buffer.concat([Buffer.from(timestamp, "utf8"), rawBody]), privateKey).toString("hex");
  const request = Readable.from([rawBody]);
  request.headers = {
    "x-signature-ed25519": signature,
    "x-signature-timestamp": timestamp,
  };
  return request;
}

function captureResponse() {
  const result = { status: null, body: "" };
  return {
    result,
    response: {
      writeHead(status) { result.status = status; },
      end(chunk = "") { result.body += String(chunk || ""); },
    },
  };
}

function durableState(guild = null) {
  return {
    status: () => ({ enabled: true, durable: true, reason: "ready" }),
    readGuild: async () => guild,
  };
}

test("self-service target resolver allows only caller-owned member workflows", () => {
  assert.equal(discordTbSelfServiceTargetAllowed(interaction("me")), true);
  assert.equal(discordTbSelfServiceTargetAllowed(interaction("preference", [
    { type: 3, name: "unit", value: "JEDIKNIGHTCAL" },
    { type: 3, name: "preference", value: "keep" },
  ])), true);
  assert.equal(discordTbSelfServiceTargetAllowed(interaction("preference", [
    { type: 6, name: "member", value: actorId },
    { type: 3, name: "unit", value: "JEDIKNIGHTCAL" },
    { type: 3, name: "preference", value: "keep" },
  ])), true);
  assert.equal(discordTbSelfServiceTargetAllowed(interaction("preference", [
    { type: 6, name: "member", value: otherId },
    { type: 3, name: "unit", value: "JEDIKNIGHTCAL" },
    { type: 3, name: "preference", value: "keep" },
  ])), false);
  assert.equal(discordTbSelfServiceTargetAllowed(interaction("sync")), false);
});

test("/tb me reads only the calling Discord member's verified linked player", async () => {
  let captured;
  const content = await executeDiscordTbDeferredCommand(interaction("me"), config(), {
    stateStore: durableState(),
    authorizedAsOfficer: false,
    getDiscordLinkedPlayerSnapshot: async (args) => {
      captured = args;
      return {
        discordGuildId: guildId,
        discordUserId: actorId,
        guildName: "Command Guild",
        link: { swgohAllyCode: "444555666", playerId: "player-444" },
        member: {
          playerId: "player-444",
          allyCode: "444555666",
          name: "Linked Player",
          galacticPower: 10_500_000,
          units: [{ baseId: "A" }, { baseId: "B" }],
        },
        rosterCache: "fresh",
      };
    },
  });

  assert.equal(captured.discordGuildId, guildId);
  assert.equal(captured.discordUserId, actorId);
  assert.match(content, /My Linked Player/);
  assert.match(content, /Linked Player/);
  assert.match(content, /444-555-666/);
  assert.match(content, /10,500,000/);
  assert.match(content, /Hydrated roster units: \*\*2\*\*/);
});

test("normal member preference write defaults to the caller and cannot target another Discord member", async () => {
  let captured;
  const own = await executeDiscordTbDeferredCommand(interaction("preference", [
    { type: 3, name: "unit", value: "JEDIKNIGHTCAL" },
    { type: 3, name: "preference", value: "give" },
  ]), config(), {
    stateStore: durableState(),
    authorizedAsOfficer: false,
    setDiscordDonationPreference: async (args) => {
      captured = args;
      return {
        discordGuildId: guildId,
        discordUserId: actorId,
        baseId: "JEDIKNIGHTCAL",
        preference: "give",
        verification: { playerName: "Linked Player", unitName: "Jedi Knight Cal Kestis" },
      };
    },
  });
  assert.equal(captured.discordUserId, actorId);
  assert.equal(captured.actorDiscordUserId, actorId);
  assert.match(own, /GIVE/);

  await assert.rejects(
    executeDiscordTbDeferredCommand(interaction("preference", [
      { type: 6, name: "member", value: otherId },
      { type: 3, name: "unit", value: "JEDIKNIGHTCAL" },
      { type: 3, name: "preference", value: "keep" },
    ]), config(), {
      stateStore: durableState(),
      authorizedAsOfficer: false,
      setDiscordDonationPreference: async () => {
        throw new Error("must not reach transaction");
      },
    }),
    /only for their own linked SWGOH player/,
  );
});

test("normal member preference read is automatically scoped to the caller's linked player", async () => {
  const content = await executeDiscordTbDeferredCommand(interaction("preferences"), config(), {
    authorizedAsOfficer: false,
    stateStore: durableState({
      discordGuildId: guildId,
      userLinks: {
        [actorId]: { discordUserId: actorId, swgohAllyCode: "444555666" },
        [otherId]: { discordUserId: otherId, swgohAllyCode: "777888999" },
      },
      memberPreferences: {
        own: { discordUserId: actorId, baseId: "JEDIKNIGHTCAL", preference: "keep" },
        other: { discordUserId: otherId, baseId: "DARTHVADER", preference: "give" },
      },
    }),
  });
  assert.match(content, new RegExp(`<@${actorId}>`));
  assert.match(content, /JEDIKNIGHTCAL/);
  assert.doesNotMatch(content, /DARTHVADER/);
});

test("signed non-officer /tb me is admitted as self-service while signed /tb sync remains officer-only", async () => {
  const { publicKeyHex, privateKey } = testKeys();
  const stateStore = durableState({
    discordGuildId: guildId,
    officerRoleIds: [],
    userLinks: { [actorId]: { discordUserId: actorId, swgohAllyCode: "444555666" } },
  });

  const selfCapture = captureResponse();
  await handleDiscordInteractionRequest(
    signedRequest(interaction("me"), privateKey),
    selfCapture.response,
    authEnv(publicKeyHex),
    {
      stateStore,
      getDiscordLinkedPlayerSnapshot: async () => ({
        discordGuildId: guildId,
        discordUserId: actorId,
        guildName: "Command Guild",
        link: { swgohAllyCode: "444555666" },
        member: { name: "Linked Player", galacticPower: 1, units: [] },
        rosterCache: "fresh",
      }),
      fetch: async () => ({ ok: true, status: 200, text: async () => "" }),
    },
  );
  assert.equal(selfCapture.result.status, 200);
  assert.equal(JSON.parse(selfCapture.result.body).type, 5);

  const syncCapture = captureResponse();
  await handleDiscordInteractionRequest(
    signedRequest(interaction("sync"), privateKey),
    syncCapture.response,
    authEnv(publicKeyHex),
    { stateStore },
  );
  assert.equal(syncCapture.result.status, 200);
  const syncBody = JSON.parse(syncCapture.result.body);
  assert.equal(syncBody.type, 4);
  assert.match(syncBody.data.content, /Officer permission required/);
});
