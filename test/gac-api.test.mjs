import test from "node:test";
import assert from "node:assert/strict";
import { createGacApi } from "../gac-api.mjs";

function harness() {
  const calls = [];
  const written = [];
  const requestGateway = async (pathname, includeKey) => {
    calls.push({ pathname, includeKey });
    return { source: "comlink-live", pathname };
  };
  const writeJson = (_response, status, body, headers = {}) => written.push({ status, body, headers });
  return { api: createGacApi({ requestGateway, writeJson }), calls, written };
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

test("bracket-by-player route proxies the Ally Code to the live gateway", async () => {
  const { api, calls, written } = harness();
  const handled = await api.handle({ method: "GET" }, {}, new URL("http://app.test/api/gac/bracket/by-player/732764286"));
  assert.equal(handled, true);
  assert.deepEqual(calls, [{ pathname: "/v1/gac/bracket/by-player/732764286", includeKey: true }]);
  assert.equal(written[0].status, 200);
  assert.equal(written[0].headers["X-GAC-Source"], "comlink-live");
  assert.equal(await api.handle({ method: "GET" }, {}, new URL("http://app.test/api/gac/bracket/by-player/not-a-code")), false);
});

test("direct bracket route normalizes the league and bracket number", async () => {
  const { api, calls } = harness();
  const handled = await api.handle({ method: "GET" }, {}, new URL("http://app.test/api/gac/bracket/chromium/42"));
  assert.equal(handled, true);
  assert.equal(calls[0].pathname, "/v1/gac/bracket/CHROMIUM/42");
});

test("GAC proxy ignores non-GET and unrelated API routes", async () => {
  const { api, calls } = harness();
  assert.equal(await api.handle({ method: "POST" }, {}, new URL("http://app.test/api/gac/current-event")), false);
  assert.equal(await api.handle({ method: "GET" }, {}, new URL("http://app.test/api/guild/by-player/732764286/roster")), false);
  assert.equal(calls.length, 0);
});
