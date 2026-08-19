import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { createGacBoardObservationApi } from "../gac-board-observation-api.mjs";

function bodyRequest(method, body, options = {}) {
  const stream = Readable.from([Buffer.from(JSON.stringify(body || {}))]);
  stream.method = method;
  stream.headers = {
    "content-type": "application/json",
    host: "app.test",
    "x-forwarded-proto": "https",
    origin: "https://app.test",
    ...(options.headers || {}),
  };
  return stream;
}
function postRequest(body, options = {}) { return bodyRequest("POST", body, options); }
function deleteRequest(body, options = {}) { return bodyRequest("DELETE", body, options); }
function getRequest() { return { method: "GET", headers: { host: "app.test", "x-forwarded-proto": "https" } }; }

function harness(options = {}) {
  const gatewayCalls = [];
  const saveCalls = [];
  const getCalls = [];
  const deleteCalls = [];
  const writes = [];
  const opponentRoster = {
    source: "live",
    player: { allyCode: "123456789", name: "Navygators" },
    units: [
      { baseId: "DEF_LEAD", name: "Defense Lead", relic: 9 },
      { baseId: "DEF_2", name: "Defense 2", relic: 8 },
      { baseId: "DEF_3", name: "Defense 3", relic: 7 },
    ],
    datacrons: [{ id: "DC-ENEMY-9", setId: 19, level: 9, affixes: [{ tier: 9, abilityId: "DC_TEST" }] }],
  };
  const playerRoster = {
    source: "live",
    player: { allyCode: "732764286", name: "Warm Bacon" },
    units: [
      { baseId: "MY_LEAD", name: "My Lead", relic: 9 },
      { baseId: "MY_2", name: "My 2", relic: 8 },
      { baseId: "MY_3", name: "My 3", relic: 8 },
    ],
    datacrons: [{ id: "DC-MINE-9", setId: 20, level: 9, affixes: [{ tier: 9, abilityId: "DC_MINE" }] }],
  };
  const requestGateway = async (pathname, includeKey) => {
    gatewayCalls.push({ pathname, includeKey });
    if (pathname === "/v1/gac/current-event") return { event: { eventInstanceId: "GAC:CURRENT" } };
    if (pathname === "/v1/gac/player/732764286") return { player: { allyCode: "732764286" }, event: { eventInstanceId: "GAC:CURRENT" } };
    if (pathname === "/v1/player/123456789") return opponentRoster;
    if (pathname === "/v1/player/732764286") return playerRoster;
    throw new Error(`unexpected gateway call ${pathname}`);
  };
  const authSession = {
    async currentUser() { return options.anonymous ? null : { id: "USER-1" }; },
  };
  const bracketIndex = {
    currentRoundFrom() { return options.liveRound ?? null; },
  };
  const confirmation = {
    async findLatestConfirmed(code, eventId, round) {
      if (options.noConfirmedOpponent) return null;
      return {
        opponent: { allyCode: "123456789", playerId: "PLAYER-2", name: "Navygators" },
        resolution: { eventInstanceId: eventId, round, exact: true, verified: true, confidence: 1 },
      };
    },
  };
  function saved(owner, userId, input) {
    saveCalls.push({ owner, userId, input });
    return { source: "user-confirmed-current-board", saved: true, owner, defense: input, round: input.round };
  }
  function loaded(owner, userId, input) {
    getCalls.push({ owner, userId, input });
    return { source: "user-confirmed-current-board", owner, round: input.round, opponent: { allyCode: input.opponentAllyCode, name: "Navygators" }, defenses: [] };
  }
  function deleted(owner, userId, input) {
    deleteCalls.push({ owner, userId, input });
    return { source: "user-confirmed-current-board", deleted: true, owner, id: Number(input.id), round: input.round };
  }
  const observations = {
    async saveDefense(userId, input) { return saved("opponent", userId, input); },
    async savePlayerDefense(userId, input) { return saved("player", userId, input); },
    async getDefenses(userId, input) { return loaded("opponent", userId, input); },
    async getPlayerDefenses(userId, input) { return loaded("player", userId, input); },
    async deleteDefense(userId, input) { return deleted("opponent", userId, input); },
    async deletePlayerDefense(userId, input) { return deleted("player", userId, input); },
  };
  const writeJson = (_response, status, body, headers = {}) => writes.push({ status, body, headers });
  const api = createGacBoardObservationApi({ requestGateway, writeJson, authSession, bracketIndex, confirmation, observations });
  return { api, gatewayCalls, saveCalls, getCalls, deleteCalls, writes, opponentRoster, playerRoster };
}

const validBody = {
  opponentAllyCode: "123456789",
  round: 3,
  size: 3,
  leaderBaseId: "DEF_LEAD",
  members: ["DEF_LEAD", "DEF_2", "DEF_3"],
  datacronId: "DC-ENEMY-9",
};
const ownBody = {
  round: 3,
  size: 3,
  leaderBaseId: "MY_LEAD",
  members: ["MY_LEAD", "MY_2", "MY_3"],
  datacronId: "DC-MINE-9",
};

test("verified opponent-board save validates the opponent live roster and exact datacron snapshot", async () => {
  const { api, saveCalls, writes } = harness();
  const handled = await api.handle(postRequest(validBody), {}, new URL("https://app.test/api/gac/current-board/732764286/defense"));
  assert.equal(handled, true);
  assert.equal(writes[0].status, 200);
  assert.equal(writes[0].headers["X-GAC-Board-Owner"], "opponent");
  assert.equal(saveCalls[0].owner, "opponent");
  assert.equal(saveCalls[0].input.datacron.id, "DC-ENEMY-9");
});

test("verified own-defense save validates Warm Bacon live roster rather than the opponent roster", async () => {
  const { api, gatewayCalls, saveCalls, writes } = harness();
  await api.handle(postRequest(ownBody), {}, new URL("https://app.test/api/gac/current-board/732764286/my-defense"));
  assert.equal(writes[0].status, 200);
  assert.equal(writes[0].headers["X-GAC-Board-Owner"], "player");
  assert.equal(saveCalls[0].owner, "player");
  assert.equal(saveCalls[0].input.datacron.id, "DC-MINE-9");
  assert.ok(gatewayCalls.some((call) => call.pathname === "/v1/player/732764286"));
  assert.equal(gatewayCalls.some((call) => call.pathname === "/v1/player/123456789"), false);
});

test("own defense cannot contain a unit that only exists on the opponent roster", async () => {
  const { api, saveCalls, writes } = harness();
  await api.handle(
    postRequest({ ...ownBody, members: ["MY_LEAD", "MY_2", "DEF_3"] }),
    {},
    new URL("https://app.test/api/gac/current-board/732764286/my-defense")
  );
  assert.equal(writes[0].status, 409);
  assert.match(writes[0].body.error, /DEF_3/);
  assert.equal(saveCalls.length, 0);
});

test("submitted opponent defender must exist in the opponent live roster", async () => {
  const { api, saveCalls, writes } = harness();
  await api.handle(postRequest({ ...validBody, members: ["DEF_LEAD", "DEF_2", "NOT_OWNED"] }), {}, new URL("https://app.test/api/gac/current-board/732764286/defense"));
  assert.equal(writes[0].status, 409);
  assert.match(writes[0].body.error, /NOT_OWNED/);
  assert.equal(saveCalls.length, 0);
});

test("submitted datacron id must exist in the correct current live inventory", async () => {
  const { api, saveCalls, writes } = harness();
  await api.handle(postRequest({ ...validBody, datacronId: "FAKE-DATACRON" }), {}, new URL("https://app.test/api/gac/current-board/732764286/defense"));
  assert.equal(writes[0].status, 409);
  assert.match(writes[0].body.error, /opponent current live datacron inventory/);
  assert.equal(saveCalls.length, 0);
});

test("wrong opponent cannot be saved even when the submitted squad is otherwise valid", async () => {
  const { api, saveCalls, writes } = harness();
  await api.handle(postRequest({ ...validBody, opponentAllyCode: "999999999" }), {}, new URL("https://app.test/api/gac/current-board/732764286/defense"));
  assert.equal(writes[0].status, 409);
  assert.equal(saveCalls.length, 0);
});

test("live round mismatch rejects stale board writes", async () => {
  const { api, saveCalls, writes } = harness({ liveRound: 2 });
  await api.handle(postRequest(validBody), {}, new URL("https://app.test/api/gac/current-board/732764286/defense"));
  assert.equal(writes[0].status, 409);
  assert.match(writes[0].body.error, /Round 2, not Round 3/);
  assert.equal(saveCalls.length, 0);
});

test("anonymous users cannot read or write either current board", async () => {
  const postHarness = harness({ anonymous: true });
  await postHarness.api.handle(postRequest(ownBody), {}, new URL("https://app.test/api/gac/current-board/732764286/my-defense"));
  assert.equal(postHarness.writes[0].status, 401);
  assert.equal(postHarness.gatewayCalls.length, 0);

  const getHarness = harness({ anonymous: true });
  await getHarness.api.handle(getRequest(), {}, new URL("https://app.test/api/gac/current-board/732764286/defense?round=3"));
  assert.equal(getHarness.writes[0].status, 401);
  assert.equal(getHarness.gatewayCalls.length, 0);
});

test("verified owner can reload both opponent and own defenses", async () => {
  const opponent = harness();
  await opponent.api.handle(getRequest(), {}, new URL("https://app.test/api/gac/current-board/732764286/defense?round=3"));
  assert.equal(opponent.writes[0].status, 200);
  assert.equal(opponent.getCalls[0].owner, "opponent");

  const mine = harness();
  await mine.api.handle(getRequest(), {}, new URL("https://app.test/api/gac/current-board/732764286/my-defense?round=3"));
  assert.equal(mine.writes[0].status, 200);
  assert.equal(mine.writes[0].headers["X-GAC-Board-Owner"], "player");
  assert.equal(mine.getCalls[0].owner, "player");
});

test("verified owner can delete an exact own-defense row from the current round", async () => {
  const { api, deleteCalls, writes } = harness();
  await api.handle(deleteRequest({ id: 44, round: 3 }), {}, new URL("https://app.test/api/gac/current-board/732764286/my-defense"));
  assert.equal(writes[0].status, 200);
  assert.equal(deleteCalls[0].owner, "player");
  assert.equal(deleteCalls[0].input.id, 44);
  assert.equal(deleteCalls[0].input.round, 3);
});
