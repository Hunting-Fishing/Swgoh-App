import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { Readable } from "node:stream";
import { handleDiscordInteractionRequest } from "../discord-interaction-router.mjs";

const applicationId = "123456789012345678";
const guildId = "987654321098765432";
const officerId = "111111111111111111";
const targetId = "222222222222222222";

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

function reserveInteraction(permissions = "32", state = "reserve") {
  return {
    type: 2,
    application_id: applicationId,
    token: "interaction-token",
    guild_id: guildId,
    member: { permissions, roles: [], user: { id: officerId } },
    data: {
      name: "tb",
      options: [{
        type: 1,
        name: "reserve",
        options: [
          { type: 6, name: "member", value: targetId },
          { type: 3, name: "unit", value: "DARTHVADER" },
          { type: 3, name: "phase", value: "P1" },
          { type: 3, name: "state", value: state },
        ],
      }],
    },
  };
}

function reservesInteraction(permissions = "32") {
  return {
    type: 2,
    application_id: applicationId,
    token: "interaction-token",
    guild_id: guildId,
    member: { permissions, roles: [], user: { id: officerId } },
    data: {
      name: "tb",
      options: [{
        type: 1,
        name: "reserves",
        options: [
          { type: 6, name: "member", value: targetId },
          { type: 3, name: "phase", value: "P1" },
        ],
      }],
    },
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

function identityStateStore() {
  return {
    status: () => ({ enabled: true, durable: true }),
    readGuild: async () => ({
      discordGuildId: guildId,
      officerRoleIds: [],
      userLinks: {
        [targetId]: { discordUserId: targetId, swgohAllyCode: "732764286", playerId: "warm" },
      },
    }),
  };
}

function durableReservationStore() {
  return {
    status: () => ({ enabled: true, durable: true }),
    readGuild: async () => ({ discordGuildId: guildId, reservations: {} }),
  };
}

test("officer /tb reserve defers then persists a private hard-reserve request through the signed wrapper", async () => {
  const { publicKeyHex, privateKey } = keys();
  const capture = captureResponse();
  const edits = [];
  const calls = [];

  await handleDiscordInteractionRequest(
    signedRequest(reserveInteraction("32", "reserve"), privateKey),
    capture.response,
    env(publicKeyHex),
    {
      stateStore: identityStateStore(),
      reservationStore: durableReservationStore(),
      setDiscordHardReservation: async (args) => {
        calls.push(args);
        return {
          discordGuildId: guildId,
          discordUserId: targetId,
          phase: "P1",
          baseId: "DARTHVADER",
          unitName: "Darth Vader",
          reserved: true,
          verification: { mode: "live-bound-guild-ownership", playerName: "Warm Bacon", guildName: "Ludus Venatus" },
        };
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
  assert.equal(calls.length, 1);
  assert.equal(calls[0].discordGuildId, guildId);
  assert.equal(calls[0].discordUserId, targetId);
  assert.equal(calls[0].unitBaseId, "DARTHVADER");
  assert.equal(calls[0].rotePhase, "P1");
  assert.equal(calls[0].reserved, true);
  assert.equal(calls[0].actorDiscordUserId, officerId);

  const patch = JSON.parse(edits[0].options.body);
  assert.match(patch.content, /ROTE Hard Reserve/);
  assert.match(patch.content, /HARD RESERVED/);
  assert.match(patch.content, /Darth Vader/);
  assert.match(patch.content, /absolute Operation donor exclusion/);
  assert.deepEqual(patch.allowed_mentions, { parse: [] });
});

test("officer /tb reserve CLEAR is routed as a durable clear without changing authorization semantics", async () => {
  const { publicKeyHex, privateKey } = keys();
  const capture = captureResponse();
  const edits = [];
  let received = null;

  await handleDiscordInteractionRequest(
    signedRequest(reserveInteraction("32", "clear"), privateKey),
    capture.response,
    env(publicKeyHex),
    {
      stateStore: identityStateStore(),
      reservationStore: durableReservationStore(),
      setDiscordHardReservation: async (args) => {
        received = args;
        return {
          discordGuildId: guildId,
          discordUserId: targetId,
          phase: "P1",
          baseId: "DARTHVADER",
          unitName: "Darth Vader",
          reserved: false,
          verification: { mode: "durable-clear" },
        };
      },
      fetch: async (url, options) => {
        edits.push({ url, options });
        return { ok: true, status: 200, text: async () => "" };
      },
    },
  );

  await waitFor(() => edits.length === 1);
  assert.equal(received.reserved, false);
  const patch = JSON.parse(edits[0].options.body);
  assert.match(patch.content, /CLEARED/);
  assert.match(patch.content, /explicit hard reservation was removed/);
});

test("officer /tb reserves reads the exact scoped hard reservations privately", async () => {
  const { publicKeyHex, privateKey } = keys();
  const capture = captureResponse();
  const edits = [];
  let received = null;

  await handleDiscordInteractionRequest(
    signedRequest(reservesInteraction("32"), privateKey),
    capture.response,
    env(publicKeyHex),
    {
      stateStore: identityStateStore(),
      reservationStore: durableReservationStore(),
      listDiscordHardReservations: async (args) => {
        received = args;
        return {
          discordGuildId: guildId,
          discordUserId: targetId,
          phase: "P1",
          rows: [{ discordUserId: targetId, phase: "P1", baseId: "DARTHVADER", unitName: "Darth Vader", reserved: true }],
        };
      },
      fetch: async (url, options) => {
        edits.push({ url, options });
        return { ok: true, status: 200, text: async () => "" };
      },
    },
  );

  await waitFor(() => edits.length === 1);
  assert.equal(received.discordGuildId, guildId);
  assert.equal(received.discordUserId, targetId);
  assert.equal(received.rotePhase, "P1");
  const patch = JSON.parse(edits[0].options.body);
  assert.match(patch.content, /ROTE Hard Reserves/);
  assert.match(patch.content, /Active hard reserves: \*\*1\*\*/);
  assert.match(patch.content, /Darth Vader/);
  assert.deepEqual(patch.allowed_mentions, { parse: [] });
});

test("normal member /tb reserve is rejected before any hard-reservation write runs", async () => {
  const { publicKeyHex, privateKey } = keys();
  const capture = captureResponse();
  let writes = 0;

  await handleDiscordInteractionRequest(
    signedRequest(reserveInteraction("0", "reserve"), privateKey),
    capture.response,
    env(publicKeyHex),
    {
      stateStore: identityStateStore(),
      reservationStore: durableReservationStore(),
      setDiscordHardReservation: async () => {
        writes += 1;
        throw new Error("must not run");
      },
    },
  );

  assert.equal(capture.result.status, 200);
  const response = JSON.parse(capture.result.body);
  assert.equal(response.type, 4);
  assert.match(response.data.content, /Officer permission required/);
  assert.match(response.data.content, /\/tb reserve/);
  assert.equal(writes, 0);
});

test("/tb reserve unit autocomplete uses the same verified static SWGOH lookup path", async () => {
  const { publicKeyHex, privateKey } = keys();
  const capture = captureResponse();
  const values = [];
  const interaction = {
    type: 4,
    application_id: applicationId,
    token: "interaction-token",
    guild_id: guildId,
    member: { permissions: "32", roles: [], user: { id: officerId } },
    data: {
      name: "tb",
      options: [{
        type: 1,
        name: "reserve",
        options: [{ type: 3, name: "unit", value: "vader", focused: true }],
      }],
    },
  };

  await handleDiscordInteractionRequest(
    signedRequest(interaction, privateKey),
    capture.response,
    env(publicKeyHex),
    {
      autocompleteSwgohUnits: async (value) => {
        values.push(value);
        return [{ name: "Darth Vader · DARTHVADER", value: "DARTHVADER" }];
      },
    },
  );

  assert.equal(capture.result.status, 200);
  const response = JSON.parse(capture.result.body);
  assert.equal(response.type, 8);
  assert.deepEqual(values, ["vader"]);
  assert.deepEqual(response.data.choices, [{ name: "Darth Vader · DARTHVADER", value: "DARTHVADER" }]);
});
