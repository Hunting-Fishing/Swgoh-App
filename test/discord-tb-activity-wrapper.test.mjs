import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { Readable } from "node:stream";
import { handleDiscordInteractionRequest } from "../discord-interaction-router.mjs";

const applicationId = "123456789012345678";
const guildId = "987654321098765432";
const actorId = "111111111111111111";

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

function interaction(subcommand, permissions = "32") {
  return {
    type: 2,
    application_id: applicationId,
    token: "interaction-token",
    guild_id: guildId,
    member: { permissions, roles: [], user: { id: actorId } },
    data: { name: "tb", options: [{ type: 1, name: subcommand }] },
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

function activityResult() {
  return {
    guild: { name: "Ludus Venatus" },
    activityCommand: {
      window: { from: "2026-08-18T00:00:00Z", to: "2026-08-18T02:30:00Z", truncated: false },
      summary: {
        currentMembers: 50,
        membersWithCapturedProgression: 34,
        membersWithoutCapturedProgression: 16,
        abilityInvestments: 4,
        membershipChanges: 1,
        gpGained: 100000,
        relicLevelsGained: 8,
        zetasAdded: 3,
        omicronsAdded: 2,
      },
      momentumLeaders: [{ name: "Alpha", eventCount: 3, gpGained: 10000, omicronsAdded: 1 }],
      noCapturedProgression: [{ name: "Charlie" }],
      recentAbilityInvestments: [{ playerName: "Alpha", unitName: "Unit A", omicronsAdded: 1 }],
    },
  };
}

test("officer /tb activity defers then edits the private response with canonical Guild Activity intelligence", async () => {
  const { publicKeyHex, privateKey } = keys();
  const capture = captureResponse();
  const edits = [];
  let readerCalls = 0;

  await handleDiscordInteractionRequest(
    signedRequest(interaction("activity"), privateKey),
    capture.response,
    env(publicKeyHex),
    {
      stateStore: { status: () => ({ enabled: true }), readGuild: async () => ({ swgohAllyCode: "732764286", officerRoleIds: [] }) },
      getDiscordGuildActivityCommand: async ({ discordGuildId }) => {
        readerCalls += 1;
        assert.equal(discordGuildId, guildId);
        return activityResult();
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
  assert.equal(readerCalls, 1);
  const patch = JSON.parse(edits[0].options.body);
  assert.match(patch.content, /Guild Activity/);
  assert.match(patch.content, /Ludus Venatus/);
  assert.match(patch.content, /Progressing: \*\*34\/50\*\*/);
  assert.doesNotMatch(patch.content, /<@/);
});

test("normal member /tb activity is rejected before the Activity reader runs", async () => {
  const { publicKeyHex, privateKey } = keys();
  const capture = captureResponse();
  let readerCalls = 0;

  await handleDiscordInteractionRequest(
    signedRequest(interaction("activity", "0"), privateKey),
    capture.response,
    env(publicKeyHex),
    {
      stateStore: {
        status: () => ({ enabled: true }),
        readGuild: async () => ({ swgohAllyCode: "732764286", officerRoleIds: [] }),
      },
      getDiscordGuildActivityCommand: async () => {
        readerCalls += 1;
        return activityResult();
      },
    },
  );

  assert.equal(capture.result.status, 200);
  const response = JSON.parse(capture.result.body);
  assert.equal(response.type, 4);
  assert.match(response.data.content, /Officer permission required/);
  assert.equal(readerCalls, 0);
});

test("existing /tb status still delegates through the proven core transport", async () => {
  const { publicKeyHex, privateKey } = keys();
  const capture = captureResponse();

  await handleDiscordInteractionRequest(
    signedRequest(interaction("status"), privateKey),
    capture.response,
    env(publicKeyHex),
    {},
  );

  assert.equal(capture.result.status, 200);
  const response = JSON.parse(capture.result.body);
  assert.equal(response.type, 4);
  assert.match(response.data.content, /SWGOH Command Center · TB/);
});
