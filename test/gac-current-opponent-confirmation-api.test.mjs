import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { createGacCurrentOpponentConfirmationApi } from "../gac-current-opponent-confirmation-api.mjs";

function request(body, options = {}) {
  const stream = Readable.from([Buffer.from(JSON.stringify(body || {}))]);
  stream.method = "POST";
  stream.headers = {
    "content-type": "application/json",
    host: "app.test",
    "x-forwarded-proto": "https",
    origin: "https://app.test",
    ...(options.headers || {}),
  };
  return stream;
}

function harness(options = {}) {
  const gatewayCalls = [];
  const confirmationCalls = [];
  const writes = [];
  const requestGateway = async (pathname, includeKey) => {
    gatewayCalls.push({ pathname, includeKey });
    if (pathname === "/v1/gac/current-event") {
      return { source: "comlink-live", event: { eventInstanceId: "GAC:CURRENT" } };
    }
    if (pathname === "/v1/gac/player/732764286") {
      return { source: "comlink-live", player: { allyCode: "732764286" }, event: { eventInstanceId: "GAC:CURRENT" } };
    }
    throw new Error(`unexpected gateway call ${pathname}`);
  };
  const authSession = {
    async currentUser() {
      return options.anonymous ? null : { id: "USER-1", email: "owner@example.test" };
    },
  };
  const bracket = {
    source: "persisted-gac-bracket-index",
    event: { eventInstanceId: "GAC:CURRENT" },
    league: "KYBER",
    bracketIndex: 42,
    groupId: "GAC:CURRENT:KYBER:42",
    players: [
      { playerId: "PLAYER_1", allyCode: "732764286", name: "Warm Bacon" },
      { playerId: "PLAYER_2", allyCode: "123456789", name: "Navygators" },
    ],
  };
  const bracketIndex = {
    currentRoundFrom() { return options.liveRound ?? null; },
    async findIndexedBracket() { return bracket; },
    async persistBracket() { throw new Error("persist should not run for indexed fixture"); },
  };
  const confirmation = {
    async confirm(userId, input) {
      confirmationCalls.push({ userId, input });
      return {
        source: "user-confirmed-current-bracket",
        opponent: { allyCode: input.opponentAllyCode, playerId: "PLAYER_2", name: "Navygators" },
        resolution: {
          exact: true,
          method: "verified-user-confirmed-current-bracket",
          eventInstanceId: input.eventInstanceId,
          round: input.round,
          source: "user-confirmed-current-bracket",
          confidence: 1,
          verified: true,
        },
      };
    },
  };
  const writeJson = (_response, status, body, headers = {}) => writes.push({ status, body, headers });
  const api = createGacCurrentOpponentConfirmationApi({
    requestGateway,
    writeJson,
    authSession,
    bracketIndex,
    confirmation,
  });
  return { api, gatewayCalls, confirmationCalls, writes };
}

test("signed-in owner can confirm a selected round when live context does not expose it", async () => {
  const { api, confirmationCalls, writes } = harness();
  const handled = await api.handle(
    request({ opponentAllyCode: "123456789", round: 3 }),
    {},
    new URL("https://app.test/api/gac/current-opponent/732764286/confirm")
  );
  assert.equal(handled, true);
  assert.equal(writes[0].status, 200);
  assert.equal(writes[0].headers["X-GAC-Confirmation"], "verified-user");
  assert.equal(confirmationCalls[0].userId, "USER-1");
  assert.equal(confirmationCalls[0].input.round, 3);
  assert.equal(confirmationCalls[0].input.roundSource, "verified-user-confirmed");
  assert.equal(confirmationCalls[0].input.eventInstanceId, "GAC:CURRENT");
});

test("live current round wins and a conflicting user-selected round is rejected", async () => {
  const { api, confirmationCalls, writes } = harness({ liveRound: 2 });
  await api.handle(
    request({ opponentAllyCode: "123456789", round: 3 }),
    {},
    new URL("https://app.test/api/gac/current-opponent/732764286/confirm")
  );
  assert.equal(writes[0].status, 409);
  assert.match(writes[0].body.error, /Round 2, not Round 3/);
  assert.equal(confirmationCalls.length, 0);
});

test("live round can be used without trusting a client round", async () => {
  const { api, confirmationCalls, writes } = harness({ liveRound: 3 });
  await api.handle(
    request({ opponentAllyCode: "123456789" }),
    {},
    new URL("https://app.test/api/gac/current-opponent/732764286/confirm")
  );
  assert.equal(writes[0].status, 200);
  assert.equal(confirmationCalls[0].input.round, 3);
  assert.equal(confirmationCalls[0].input.roundSource, "live-context");
});

test("anonymous sessions cannot write a confirmed current opponent", async () => {
  const { api, gatewayCalls, confirmationCalls, writes } = harness({ anonymous: true });
  await api.handle(
    request({ opponentAllyCode: "123456789", round: 3 }),
    {},
    new URL("https://app.test/api/gac/current-opponent/732764286/confirm")
  );
  assert.equal(writes[0].status, 401);
  assert.equal(gatewayCalls.length, 0);
  assert.equal(confirmationCalls.length, 0);
});

test("cross-origin cookie write is rejected before authentication", async () => {
  const { api, gatewayCalls, confirmationCalls, writes } = harness();
  await api.handle(
    request({ opponentAllyCode: "123456789", round: 3 }, { headers: { origin: "https://evil.test" } }),
    {},
    new URL("https://app.test/api/gac/current-opponent/732764286/confirm")
  );
  assert.equal(writes[0].status, 403);
  assert.equal(gatewayCalls.length, 0);
  assert.equal(confirmationCalls.length, 0);
});
