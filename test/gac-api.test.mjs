import test from "node:test";
import assert from "node:assert/strict";
import { createGacApi } from "../gac-api.mjs";

function liveBracket() {
  return {
    source: "comlink-live",
    event: { id: "GAC", instanceId: "1", eventInstanceId: "GAC:1" },
    league: "KYBER",
    bracketIndex: 42,
    groupId: "GAC:1:KYBER:42",
    players: [
      { playerId: "PLAYER_1", allyCode: "732764286", name: "Warm Bacon" },
      { playerId: "PLAYER_2", allyCode: "123456789", name: "Navygators" },
    ],
    opponents: [{ playerId: "PLAYER_2", allyCode: "123456789", name: "Navygators" }],
  };
}

function harness(options = {}) {
  const calls = [];
  const scoutCalls = [];
  const indexCalls = [];
  const written = [];
  const requestGateway = async (pathname, includeKey) => {
    calls.push({ pathname, includeKey });
    if (pathname === "/v1/gac/current-event") {
      return { source: "comlink-live", active: true, event: { id: "GAC", instanceId: "1", eventInstanceId: "GAC:1" } };
    }
    if (pathname === "/v1/gac/player/732764286") {
      return { source: "comlink-live", player: { allyCode: "732764286" }, event: { eventInstanceId: "GAC:1" }, seasonStatus: [] };
    }
    if (pathname === "/v1/gac/bracket/by-player/732764286") return liveBracket();
    if (pathname === "/v1/gac/bracket/CHROMIUM/42") {
      return { ...liveBracket(), league: "CHROMIUM", groupId: "GAC:1:CHROMIUM:42" };
    }
    return { source: "comlink-live", pathname };
  };
  const scouting = {
    async getScoutingReport(code, readOptions) {
      scoutCalls.push({ code, options: readOptions });
      return {
        source: "persisted-gac-battle-scouting",
        player: { allyCode: code },
        coverage: { hasDefenseEvidence: false, hasOffenseEvidence: true },
        offensiveTendencies: [{ leaderBaseId: "TEST_LEAD" }],
      };
    },
  };
  const bracketIndex = options.bracketIndex || {
    currentRoundFrom() { return null; },
    async findIndexedBracket(code, eventId) {
      indexCalls.push({ type: "find", code, eventId });
      return null;
    },
    async persistBracket(bracket) {
      indexCalls.push({ type: "persist", bracket });
      return { indexed: true, players: bracket.players?.length || 0 };
    },
    async findExactOpponent() { return null; },
  };
  const writeJson = (_response, status, body, headers = {}) => written.push({ status, body, headers });
  return {
    api: createGacApi({ requestGateway, writeJson, scouting, bracketIndex }),
    calls,
    scoutCalls,
    indexCalls,
    written,
  };
}

test("current GAC event route proxies through the authenticated server gateway", async () => {
  const { api, calls, written } = harness();
  const handled = await api.handle({ method: "GET" }, {}, new URL("http://app.test/api/gac/current-event"));
  assert.equal(handled, true);
  assert.deepEqual(calls, [{ pathname: "/v1/gac/current-event", includeKey: true }]);
  assert.equal(written[0].status, 200);
  assert.equal(written[0].headers["X-GAC-Source"], "comlink-live");
});

test("player GAC context route validates a nine digit Ally Code", async () => {
  const { api, calls } = harness();
  assert.equal(await api.handle({ method: "GET" }, {}, new URL("http://app.test/api/gac/player/732764286")), true);
  assert.equal(calls[0].pathname, "/v1/gac/player/732764286");
  assert.equal(await api.handle({ method: "GET" }, {}, new URL("http://app.test/api/gac/player/not-a-code")), false);
});

test("bracket-by-player route checks the persistent index, then scans and indexes on a miss", async () => {
  const { api, calls, indexCalls, written } = harness();
  const handled = await api.handle({ method: "GET" }, {}, new URL("http://app.test/api/gac/bracket/by-player/732764286"));
  assert.equal(handled, true);
  assert.deepEqual(calls.map((call) => call.pathname), [
    "/v1/gac/current-event",
    "/v1/gac/player/732764286",
    "/v1/gac/bracket/by-player/732764286",
  ]);
  assert.equal(indexCalls[0].type, "find");
  assert.equal(indexCalls[0].eventId, "GAC:1");
  assert.equal(indexCalls[1].type, "persist");
  assert.equal(written[0].status, 200);
  assert.equal(written[0].headers["X-GAC-Bracket-Cache"], "miss");
  assert.equal(written[0].body.indexStatus.indexed, true);
  assert.equal(written[0].body.opponentResolution.exact, false);
});

test("persisted bracket membership prevents another Comlink bracket scan", async () => {
  const indexed = { ...liveBracket(), source: "persisted-gac-bracket-index", lookup: { allyCode: "732764286", method: "persisted-bracket-index" } };
  const bracketIndex = {
    currentRoundFrom() { return null; },
    async findIndexedBracket() { return indexed; },
    async persistBracket() { throw new Error("persist should not run on a hit"); },
    async findExactOpponent() { return null; },
  };
  const { api, calls, written } = harness({ bracketIndex });
  await api.handle({ method: "GET" }, {}, new URL("http://app.test/api/gac/bracket/by-player/732764286"));
  assert.deepEqual(calls.map((call) => call.pathname), [
    "/v1/gac/current-event",
    "/v1/gac/player/732764286",
  ]);
  assert.equal(written[0].headers["X-GAC-Bracket-Cache"], "hit");
  assert.equal(written[0].body.source, "persisted-gac-bracket-index");
});

test("matching event and round evidence resolves the exact current opponent only when they belong to the live bracket", async () => {
  const indexed = { ...liveBracket(), source: "persisted-gac-bracket-index", lookup: { allyCode: "732764286", method: "persisted-bracket-index" } };
  const bracketIndex = {
    currentRoundFrom() { return 3; },
    async findIndexedBracket() { return indexed; },
    async persistBracket() { throw new Error("persist should not run on a hit"); },
    async findExactOpponent(code, eventId, round) {
      assert.equal(code, "732764286");
      assert.equal(eventId, "GAC:1");
      assert.equal(round, 3);
      return {
        opponent: { playerId: "PLAYER_2", allyCode: "123456789", name: "Navygators" },
        resolution: {
          exact: true,
          method: "persisted-event-round-evidence",
          eventInstanceId: "GAC:1",
          round: 3,
          source: "c3po-gahistory",
          confidence: 0.95,
        },
      };
    },
  };
  const { api, written } = harness({ bracketIndex });
  await api.handle({ method: "GET" }, {}, new URL("http://app.test/api/gac/bracket/by-player/732764286"));
  assert.equal(written[0].body.opponentResolution.exact, true);
  assert.equal(written[0].body.opponentResolution.round, 3);
  assert.equal(written[0].body.currentOpponent.name, "Navygators");
  assert.equal(written[0].body.currentOpponent.allyCode, "123456789");
});

test("scouting route reads persisted battle evidence without calling the live gateway", async () => {
  const { api, calls, scoutCalls, written } = harness();
  const handled = await api.handle({ method: "GET" }, {}, new URL("http://app.test/api/gac/scouting/732764286?limit=2500"));
  assert.equal(handled, true);
  assert.equal(calls.length, 0);
  assert.deepEqual(scoutCalls, [{ code: "732764286", options: { limit: 2500 } }]);
  assert.equal(written[0].status, 200);
  assert.equal(written[0].headers["X-GAC-Source"], "persisted-gac-battle-scouting");
});

test("direct bracket route normalizes the league and indexes the returned bracket", async () => {
  const { api, calls, indexCalls } = harness();
  const handled = await api.handle({ method: "GET" }, {}, new URL("http://app.test/api/gac/bracket/chromium/42"));
  assert.equal(handled, true);
  assert.equal(calls[0].pathname, "/v1/gac/bracket/CHROMIUM/42");
  assert.equal(indexCalls[0].type, "persist");
});

test("GAC proxy ignores non-GET and unrelated API routes", async () => {
  const { api, calls } = harness();
  assert.equal(await api.handle({ method: "POST" }, {}, new URL("http://app.test/api/gac/current-event")), false);
  assert.equal(await api.handle({ method: "GET" }, {}, new URL("http://app.test/api/guild/by-player/732764286/roster")), false);
  assert.equal(calls.length, 0);
});
