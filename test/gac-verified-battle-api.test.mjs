import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { createGacVerifiedBattleApi } from "../gac-verified-battle-api.mjs";
import { createGacCurrentOpponentConfirmationApi } from "../gac-current-opponent-confirmation-api.mjs";

function request(body, options = {}) {
  const stream = Readable.from([Buffer.from(JSON.stringify(body || {}))]);
  stream.method = "POST";
  stream.headers = {
    host: "app.test",
    "x-forwarded-proto": "https",
    "content-type": "application/json",
    origin: "https://app.test",
    ...(options.headers || {}),
  };
  return stream;
}

function harness(options = {}, factory = createGacVerifiedBattleApi) {
  const writes = [];
  const gatewayCalls = [];
  const battleCalls = [];
  const requestGateway = async (pathname, includeKey) => {
    gatewayCalls.push({ pathname, includeKey });
    if (pathname === "/v1/gac/current-event") return { event: { eventInstanceId: "GAC:CURRENT" } };
    if (pathname === "/v1/gac/player/732764286") return { event: { eventInstanceId: "GAC:CURRENT" }, player: { allyCode: "732764286" } };
    throw new Error(`unexpected gateway call ${pathname}`);
  };
  const authSession = { async currentUser() { return options.anonymous ? null : { id: "USER-1" }; } };
  const bracketIndex = {
    currentRoundFrom() { return options.liveRound ?? null; },
    async findIndexedBracket() { return null; },
    async persistBracket() {},
  };
  const confirmation = {
    async findLatestConfirmed(_code, eventId, round) {
      if (options.noConfirmation) return null;
      return { opponent: { allyCode: "123456789", playerId: "OPP-1", name: "Navygators" }, resolution: { eventInstanceId: eventId, round, exact: true } };
    },
  };
  const battles = {
    async verifyAttempt(userId, input) {
      battleCalls.push({ userId, input });
      if (input.confirm !== true) {
        const error = new Error("Explicit owner confirmation is required.");
        error.status = 400;
        throw error;
      }
      return { source: "verified-owner-war-room", saved: true, alreadyVerified: false, round: input.round, battle: { battleKey: "KEY-1", outcome: "win" } };
    },
  };
  const writeJson = (_response, status, body, headers = {}) => writes.push({ status, body, headers });
  const api = factory({ requestGateway, writeJson, authSession, bracketIndex, confirmation, verifiedBattles: battles, battles });
  return { api, writes, gatewayCalls, battleCalls };
}

const body = { round: 3, assignmentId: 17, attemptIndex: 0, confirm: true };

test("verified battle API forwards only current-round pointers to the archive service", async () => {
  const { api, writes, battleCalls } = harness();
  const handled = await api.handle(request({ ...body, result: "win", attackerMembers: ["FAKE"] }), {}, new URL("https://app.test/api/gac/verified-battle/732764286"));
  assert.equal(handled, true);
  assert.equal(writes[0].status, 200);
  assert.equal(writes[0].headers["X-GAC-Battle-Evidence"], "verified-owner-explicit-confirmation");
  assert.equal(battleCalls.length, 1);
  assert.deepEqual(Object.keys(battleCalls[0].input).sort(), ["allyCode", "assignmentId", "attemptIndex", "confirm", "eventInstanceId", "opponentAllyCode", "round"].sort());
  assert.equal(battleCalls[0].input.assignmentId, 17);
  assert.equal(battleCalls[0].input.attemptIndex, 0);
  assert.equal(battleCalls[0].input.opponentAllyCode, "123456789");
  assert.equal(Object.prototype.hasOwnProperty.call(battleCalls[0].input, "result"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(battleCalls[0].input, "attackerMembers"), false);
});

test("explicit confirm=true is required through the HTTP boundary", async () => {
  const { api, writes, battleCalls } = harness();
  await api.handle(request({ ...body, confirm: false }), {}, new URL("https://app.test/api/gac/verified-battle/732764286"));
  assert.equal(writes[0].status, 400);
  assert.equal(battleCalls.length, 1);
  assert.equal(battleCalls[0].input.confirm, false);
});

test("anonymous and cross-origin result verification are rejected before live context lookup", async () => {
  const anonymous = harness({ anonymous: true });
  await anonymous.api.handle(request(body), {}, new URL("https://app.test/api/gac/verified-battle/732764286"));
  assert.equal(anonymous.writes[0].status, 401);
  assert.equal(anonymous.gatewayCalls.length, 0);
  assert.equal(anonymous.battleCalls.length, 0);

  const crossOrigin = harness();
  await crossOrigin.api.handle(request(body, { headers: { origin: "https://evil.test" } }), {}, new URL("https://app.test/api/gac/verified-battle/732764286"));
  assert.equal(crossOrigin.writes[0].status, 403);
  assert.equal(crossOrigin.gatewayCalls.length, 0);
  assert.equal(crossOrigin.battleCalls.length, 0);
});

test("live round mismatch and missing confirmed opponent block result verification", async () => {
  const mismatch = harness({ liveRound: 2 });
  await mismatch.api.handle(request(body), {}, new URL("https://app.test/api/gac/verified-battle/732764286"));
  assert.equal(mismatch.writes[0].status, 409);
  assert.match(mismatch.writes[0].body.error, /Round 2, not Round 3/);
  assert.equal(mismatch.battleCalls.length, 0);

  const noOpponent = harness({ noConfirmation: true });
  await noOpponent.api.handle(request(body), {}, new URL("https://app.test/api/gac/verified-battle/732764286"));
  assert.equal(noOpponent.writes[0].status, 409);
  assert.match(noOpponent.writes[0].body.error, /Confirm the current opponent/i);
  assert.equal(noOpponent.battleCalls.length, 0);
});

test("current opponent router delegates verified-battle path before pairing confirmation", async () => {
  const { api, writes, battleCalls } = harness({}, createGacCurrentOpponentConfirmationApi);
  const handled = await api.handle(request(body), {}, new URL("https://app.test/api/gac/verified-battle/732764286"));
  assert.equal(handled, true);
  assert.equal(writes[0].status, 200);
  assert.equal(battleCalls.length, 1);
});
