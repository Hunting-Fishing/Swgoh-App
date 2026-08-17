import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { Readable } from "node:stream";
import { handleDiscordInteractionRequest } from "../discord-interaction-router.mjs";

const applicationId = "123456789012345678";
const guildId = "987654321098765432";
const actorId = "111111111111111111";
const otherId = "222222222222222222";

function keys() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const der = publicKey.export({ format: "der", type: "spki" });
  return { publicKeyHex: der.subarray(-32).toString("hex"), privateKey };
}

function env(publicKeyHex) {
  return {
    DISCORD_TB_INTERACTIONS_ENABLED: "true",
    DISCORD_APPLICATION_ID: applicationId,
    DISCORD_PUBLIC_KEY: publicKeyHex,
    DISCORD_DEFAULT_GUILD_ID: guildId,
    DISCORD_DEFAULT_ALLY_CODE: "732764286",
  };
}

function interaction(permissions = "32", member = "") {
  const options = member ? [{ type: 6, name: "member", value: member }] : [];
  return {
    type: 2,
    application_id: applicationId,
    token: "interaction-token",
    guild_id: guildId,
    member: { permissions, roles: [], user: { id: actorId } },
    data: { name: "tb", options: [{ type: 1, name: "controls", ...(options.length ? { options } : {}) }] },
  };
}

function signedRequest(body, privateKey) {
  const timestamp = "1786993200";
  const rawBody = Buffer.from(JSON.stringify(body), "utf8");
  const signature = sign(null, Buffer.concat([Buffer.from(timestamp), rawBody]), privateKey).toString("hex");
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

async function waitFor(predicate) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("Timed out waiting for deferred Discord response edit.");
}

function guildState() {
  return {
    discordGuildId: guildId,
    officerRoleIds: [],
    userLinks: {
      first: { discordUserId: actorId, swgohAllyCode: "732764286", playerId: "warm" },
      second: { discordUserId: otherId, swgohAllyCode: "123456789", playerId: "other" },
    },
    memberAvailability: {
      [actorId]: { discordUserId: actorId, availability: "unavailable" },
    },
    memberPreferences: {
      firstGive: { discordUserId: actorId, baseId: "JEDIKNIGHTCAL", preference: "give" },
      firstKeep: { discordUserId: actorId, baseId: "DARTHVADER", preference: "keep" },
      secondGive: { discordUserId: otherId, baseId: "REY", preference: "give" },
    },
  };
}

test("officer /tb controls defers then edits the private response with durable member controls", async () => {
  const { publicKeyHex, privateKey } = keys();
  const capture = captureResponse();
  const edits = [];
  let reads = 0;

  await handleDiscordInteractionRequest(
    signedRequest(interaction(), privateKey),
    capture.response,
    env(publicKeyHex),
    {
      stateStore: {
        status: () => ({ enabled: true, durable: true }),
        readGuild: async (requestedGuildId) => {
          reads += 1;
          assert.equal(requestedGuildId, guildId);
          return guildState();
        },
      },
      fetch: async (url, options) => {
        edits.push({ url, options });
        return { ok: true, status: 200, text: async () => "" };
      },
    },
  );

  assert.equal(capture.result.status, 200);
  const initial = JSON.parse(capture.result.body);
  assert.equal(initial.type, 5);
  assert.equal(initial.data.flags, 64);

  await waitFor(() => edits.length === 1);
  assert.equal(reads, 1);
  const patch = JSON.parse(edits[0].options.body);
  assert.match(patch.content, /Member TB Controls/);
  assert.match(patch.content, /Linked: \*\*2\*\*/);
  assert.match(patch.content, /Unavailable: \*\*1\*\*/);
  assert.match(patch.content, /GIVE JEDIKNIGHTCAL/);
  assert.match(patch.content, /KEEP DARTHVADER/);
  assert.deepEqual(patch.allowed_mentions, { parse: [] });
});

test("officer /tb controls member scope returns only the requested linked member", async () => {
  const { publicKeyHex, privateKey } = keys();
  const capture = captureResponse();
  const edits = [];

  await handleDiscordInteractionRequest(
    signedRequest(interaction("32", otherId), privateKey),
    capture.response,
    env(publicKeyHex),
    {
      stateStore: {
        status: () => ({ enabled: true, durable: true }),
        readGuild: async () => guildState(),
      },
      fetch: async (url, options) => {
        edits.push({ url, options });
        return { ok: true, status: 200, text: async () => "" };
      },
    },
  );

  await waitFor(() => edits.length === 1);
  const patch = JSON.parse(edits[0].options.body);
  assert.match(patch.content, new RegExp(`<@${otherId}>`));
  assert.match(patch.content, /123-456-789/);
  assert.match(patch.content, /GIVE REY/);
  assert.doesNotMatch(patch.content, /732-764-286/);
  assert.doesNotMatch(patch.content, /JEDIKNIGHTCAL/);
});

test("normal member /tb controls is rejected before durable controls are read", async () => {
  const { publicKeyHex, privateKey } = keys();
  const capture = captureResponse();
  let reads = 0;

  await handleDiscordInteractionRequest(
    signedRequest(interaction("0"), privateKey),
    capture.response,
    env(publicKeyHex),
    {
      stateStore: {
        status: () => ({ enabled: true, durable: true }),
        readGuild: async () => {
          reads += 1;
          return guildState();
        },
      },
    },
  );

  assert.equal(capture.result.status, 200);
  const response = JSON.parse(capture.result.body);
  assert.equal(response.type, 4);
  assert.match(response.data.content, /Officer permission required/);
  assert.equal(reads, 0);
});
