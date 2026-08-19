import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { createGacBoardObservationApi } from "../gac-board-observation-api.mjs";

function postRequest(body, options = {}) {
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

function getRequest() {
  return { method: "GET", headers: { host: "app.test", "x-forwarded-proto": "https" } };
}

function harness(options = {}) {
  const gatewayCalls = [];
  const saveCalls = [];
  const getCalls = [];
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
  const requestGateway = async (pathname, includeKey) => {
    gatewayCalls.push({ pathname, includeKey });
    if (pathname === "/v1/gac/current-event") return { event: { eventInstanceId: "GAC:CURRENT" } };
    if (pathname === "/v1/gac/player/732764286") return { player: { allyCode: "732764286" }, event: { eventInstanceId: "GAC:CURRENT" } };
    if (pathname === "/v1/player/123456789") return opponentRoster;
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
  const observations = {
    async saveDefense(userId, input) {
      saveCalls.push({ userId, input });
      return { source: "user-confirmed-current-board", saved: true, defense: input, round: input.round };
    },
    async getDefenses(userId, input) {
      getCalls.push({ userId, input });
      return {
        source: "user-confirmed-current-board",
        round: input.round,
        opponent: { allyCode: input.opponentAllyCode, name: "Navygators" },
        defenses: [],
      };
    },
  };
  const writeJson = (_response, status, body, headers = {}) => writes.push({ status, body, headers });
  const api = createGacBoardObservationApi({
    requestGateway,
    writeJson,
    authSession,
    bracketIndex,
    confirmation,
    observations,
  });
  return { api, gatewayCalls, saveCalls, getCalls, writes, opponentRoster };
}

const validBody = {
  opponentAllyCode: "123456789",
  round: 3,
  size: 3,
  leaderBaseId: "DEF_LEAD",
  members: ["DEF_LEAD", "DEF_2", "DEF_3"],
  datacronId: "DC-ENEMY-9",
};

test("verified current-board save validates live roster members and resolves the exact live datacron snapshot", async () => {
  const { api, saveCalls, writes } = harness();
  const handled = await api.handle(
    postRequest(validBody),
    {},
    new URL("https://app.test/api/gac/current-board/732764286/defense")
  );
  assert.equal(handled, true);
  assert.equal(writes[0].status, 200);
  assert.equal(writes[0].headers["X-GAC-Board-Evidence"], "verified-user");
  assert.equal(saveCalls.length, 1);
  assert.equal(saveCalls[0].userId, "USER-1");
  assert.equal(saveCalls[0].input.eventInstanceId, "GAC:CURRENT");
  assert.equal(saveCalls[0].input.round, 3);
  assert.equal(saveCalls[0].input.datacron.id, "DC-ENEMY-9");
  assert.deepEqual(saveCalls[0].input.members, ["DEF_LEAD", "DEF_2", "DEF_3"]);
});

test("submitted defender must exist in the verified opponent live roster", async () => {
  const { api, saveCalls, writes } = harness();
  await api.handle(
    postRequest({ ...validBody, members: ["DEF_LEAD", "DEF_2", "NOT_OWNED"] }),
    {},
    new URL("https://app.test/api/gac/current-board/732764286/defense")
  );
  assert.equal(writes[0].status, 409);
  assert.match(writes[0].body.error, /NOT_OWNED/);
  assert.equal(saveCalls.length, 0);
});

test("submitted datacron id must exist in the opponent current live inventory", async () => {
  const { api, saveCalls, writes } = harness();
  await api.handle(
    postRequest({ ...validBody, datacronId: "FAKE-DATACRON" }),
    {},
    new URL("https://app.test/api/gac/current-board/732764286/defense")
  );
  assert.equal(writes[0].status, 409);
  assert.match(writes[0].body.error, /not present in the opponent's current live datacron inventory/);
  assert.equal(saveCalls.length, 0);
});

test("wrong opponent cannot be saved even when the submitted squad is otherwise valid", async () => {
  const { api, saveCalls, writes } = harness();
  await api.handle(
    postRequest({ ...validBody, opponentAllyCode: "999999999" }),
    {},
    new URL("https://app.test/api/gac/current-board/732764286/defense")
  );
  assert.equal(writes[0].status, 409);
  assert.equal(saveCalls.length, 0);
});

test("live round mismatch rejects stale board writes", async () => {
  const { api, saveCalls, writes } = harness({ liveRound: 2 });
  await api.handle(
    postRequest(validBody),
    {},
    new URL("https://app.test/api/gac/current-board/732764286/defense")
  );
  assert.equal(writes[0].status, 409);
  assert.match(writes[0].body.error, /Round 2, not Round 3/);
  assert.equal(saveCalls.length, 0);
});

test("anonymous users cannot read or write current-board evidence", async () => {
  const postHarness = harness({ anonymous: true });
  await postHarness.api.handle(
    postRequest(validBody),
    {},
    new URL("https://app.test/api/gac/current-board/732764286/defense")
  );
  assert.equal(postHarness.writes[0].status, 401);
  assert.equal(postHarness.gatewayCalls.length, 0);

  const getHarness = harness({ anonymous: true });
  await getHarness.api.handle(
    getRequest(),
    {},
    new URL("https://app.test/api/gac/current-board/732764286/defense?round=3")
  );
  assert.equal(getHarness.writes[0].status, 401);
  assert.equal(getHarness.gatewayCalls.length, 0);
});

test("verified owner can reload current-round board observations", async () => {
  const { api, getCalls, writes } = harness();
  await api.handle(
    getRequest(),
    {},
    new URL("https://app.test/api/gac/current-board/732764286/defense?round=3")
  );
  assert.equal(writes[0].status, 200);
  assert.equal(getCalls.length, 1);
  assert.equal(getCalls[0].input.round, 3);
  assert.equal(getCalls[0].input.opponentAllyCode, "123456789");
});
