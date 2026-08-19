import test from "node:test";
import assert from "node:assert/strict";
import { createGacApi } from "../gac-api.mjs";

function harness(options = {}) {
  const writes = [];
  const batchCalls = [];
  const gatewayCalls = [];
  const counterBatch = {
    async getCounterEvidenceBatch(input) {
      batchCalls.push(input);
      if (options.fail) {
        const error = new Error("At least one valid enemy leader base ID is required.");
        error.status = 400;
        throw error;
      }
      return {
        source: "gac-counter-evidence-batch",
        format: input.format,
        leaders: input.enemyLeaderBaseIds,
        results: [],
        count: 0,
        verifiedBattleSamples: 0,
        evidenceSources: [],
      };
    },
  };
  const api = createGacApi({
    requestGateway: async (...args) => {
      gatewayCalls.push(args);
      throw new Error("batch evidence should not call the live gateway");
    },
    writeJson: (_response, status, body, headers = {}) => writes.push({ status, body, headers }),
    counterBatch,
  });
  return { api, writes, batchCalls, gatewayCalls };
}

test("batch route combines repeated and comma-separated leader parameters", async () => {
  const { api, writes, batchCalls, gatewayCalls } = harness();
  const handled = await api.handle(
    { method: "GET", headers: {} },
    {},
    new URL("https://app.test/api/gac/counters/batch?format=3v3&leaders=DEF_A,DEF_B&enemyLeader=DEF_C&limit=25")
  );
  assert.equal(handled, true);
  assert.equal(writes[0].status, 200);
  assert.equal(writes[0].headers["X-GAC-Source"], "persisted-counter-evidence-batch");
  assert.equal(batchCalls.length, 1);
  assert.equal(batchCalls[0].format, "3v3");
  assert.deepEqual(batchCalls[0].enemyLeaderBaseIds, ["DEF_C", "DEF_A", "DEF_B"]);
  assert.equal(batchCalls[0].limit, 25);
  assert.equal(gatewayCalls.length, 0);
});

test("batch route caps requested per-leader evidence limit at 100", async () => {
  const { api, batchCalls } = harness();
  await api.handle(
    { method: "GET", headers: {} },
    {},
    new URL("https://app.test/api/gac/counters/batch?format=5v5&leaders=DEF_A&limit=999")
  );
  assert.equal(batchCalls[0].limit, 100);
});

test("invalid empty leader request is returned as a 400 from the batch service", async () => {
  const { api, writes } = harness({ fail: true });
  await api.handle(
    { method: "GET", headers: {} },
    {},
    new URL("https://app.test/api/gac/counters/batch?format=3v3")
  );
  assert.equal(writes[0].status, 400);
  assert.match(writes[0].body.error, /At least one valid enemy leader/i);
});
