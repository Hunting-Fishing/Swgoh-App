import test from "node:test";
import assert from "node:assert/strict";
import { createGacApi } from "../gac-api.mjs";

function harness() {
  const gatewayCalls = [];
  const historyCalls = [];
  const written = [];
  const requestGateway = async (pathname, includeKey) => {
    gatewayCalls.push({ pathname, includeKey });
    return { source: "comlink-live" };
  };
  const history = {
    async getPlayerHistory(allyCode, options) {
      historyCalls.push({ type: "history", allyCode, options });
      return { source: "gac-history", player: { allyCode }, rounds: [] };
    },
    async getCounterEvidence(options) {
      historyCalls.push({ type: "counter", options });
      return { source: "gac-counter-evidence", observations: [] };
    },
  };
  const writeJson = (_response, status, body, headers = {}) => written.push({ status, body, headers });
  return { api: createGacApi({ requestGateway, writeJson, history }), gatewayCalls, historyCalls, written };
}

test("persisted GAC history route stays separate from live player context", async () => {
  const { api, gatewayCalls, historyCalls, written } = harness();
  const handled = await api.handle({ method: "GET" }, {}, new URL("http://app.test/api/gac/history/732764286?limit=25"));
  assert.equal(handled, true);
  assert.equal(gatewayCalls.length, 0);
  assert.deepEqual(historyCalls[0], { type: "history", allyCode: "732764286", options: { limit: 25 } });
  assert.equal(written[0].headers["X-GAC-Source"], "persisted-history");
});

test("counter evidence API forwards mode, enemy leader and bounded limit", async () => {
  const { api, gatewayCalls, historyCalls, written } = harness();
  const url = new URL("http://app.test/api/gac/counters?format=3v3&enemyLeader=DARTHREVAN&limit=50");
  const handled = await api.handle({ method: "GET" }, {}, url);
  assert.equal(handled, true);
  assert.equal(gatewayCalls.length, 0);
  assert.deepEqual(historyCalls[0], {
    type: "counter",
    options: { format: "3v3", enemyLeaderBaseId: "DARTHREVAN", limit: 50 },
  });
  assert.equal(written[0].headers["X-GAC-Source"], "persisted-counter-evidence");
});

test("counter evidence API caps public result limits", async () => {
  const { api, historyCalls } = harness();
  await api.handle({ method: "GET" }, {}, new URL("http://app.test/api/gac/counters?format=5v5&enemyLeader=JMK&limit=99999"));
  assert.equal(historyCalls[0].options.limit, 500);
});
