import test from "node:test";
import assert from "node:assert/strict";
import { createGacApi } from "../gac-api.mjs";

function harness(options = {}) {
  const gatewayCalls = [];
  const historyCalls = [];
  const importCalls = [];
  const written = [];
  const requestGateway = async (pathname, includeKey) => {
    gatewayCalls.push({ pathname, includeKey });
    return { source: "comlink-live" };
  };
  let historyReads = 0;
  const history = options.history || {
    async getPlayerHistory(allyCode, readOptions) {
      historyCalls.push({ type: "history", allyCode, options: readOptions });
      historyReads += 1;
      if (options.historyAfterImport && historyReads > 1) return options.historyAfterImport;
      return { source: "gac-history", player: { allyCode }, rounds: [], summary: { rounds: 0 } };
    },
    async getCounterEvidence(counterOptions) {
      historyCalls.push({ type: "counter", options: counterOptions });
      return { source: "gac-counter-evidence", observations: [] };
    },
  };
  const historyImport = options.historyImport || {
    async importPlayer(allyCode) {
      importCalls.push(allyCode);
      return {
        source: "c3po-gahistory",
        imported: 7,
        importedRounds: 3,
        importedCounters: 4,
        importedAt: "2026-08-19T00:00:00.000Z",
      };
    },
  };
  const writeJson = (_response, status, body, headers = {}) => written.push({ status, body, headers });
  return {
    api: createGacApi({ requestGateway, writeJson, history, historyImport, now: () => 1_800_000_000_000 }),
    gatewayCalls,
    historyCalls,
    importCalls,
    written,
  };
}

test("persisted GAC history can explicitly skip auto-import", async () => {
  const { api, gatewayCalls, historyCalls, importCalls, written } = harness();
  const handled = await api.handle({ method: "GET" }, {}, new URL("http://app.test/api/gac/history/732764286?limit=25&import=0"));
  assert.equal(handled, true);
  assert.equal(gatewayCalls.length, 0);
  assert.deepEqual(historyCalls[0], { type: "history", allyCode: "732764286", options: { limit: 25 } });
  assert.equal(importCalls.length, 0);
  assert.equal(written[0].headers["X-GAC-Source"], "persisted-history");
});

test("empty persisted history lazy-imports C-3PO evidence and reloads the player history", async () => {
  const importedHistory = {
    source: "gac-history",
    player: { allyCode: "732764286", name: "Warm Bacon" },
    rounds: [{ round: 3, opponent: { name: "Navygators" } }],
    summary: { rounds: 1 },
  };
  const { api, historyCalls, importCalls, written } = harness({ historyAfterImport: importedHistory });
  const handled = await api.handle({ method: "GET" }, {}, new URL("http://app.test/api/gac/history/732764286?limit=30"));
  assert.equal(handled, true);
  assert.deepEqual(importCalls, ["732764286"]);
  assert.equal(historyCalls.filter((call) => call.type === "history").length, 2);
  assert.equal(written[0].status, 200);
  assert.equal(written[0].headers["X-GAC-History-Import"], "complete");
  assert.equal(written[0].body.autoImport.imported, 7);
  assert.equal(written[0].body.autoImport.importedCounters, 4);
  assert.equal(written[0].body.rounds[0].opponent.name, "Navygators");
});

test("failed lazy import preserves an existing empty history response", async () => {
  const { api, written } = harness({
    historyImport: {
      async importPlayer() {
        const error = new Error("history source unavailable");
        error.status = 503;
        throw error;
      },
    },
  });
  await api.handle({ method: "GET" }, {}, new URL("http://app.test/api/gac/history/732764286"));
  assert.equal(written[0].status, 200);
  assert.equal(written[0].body.rounds.length, 0);
  assert.equal(written[0].body.autoImport.status, "failed");
  assert.equal(written[0].headers["X-GAC-History-Import"], "failed");
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
