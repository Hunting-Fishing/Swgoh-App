import assert from "node:assert/strict";
import test from "node:test";
import { createCommandCenterHistoryApi } from "../command-center-history-api.mjs";

function responseCapture() {
  return {
    status: 0,
    headers: {},
    text: "",
    writeHead(status, headers) { this.status = status; this.headers = headers; },
    end(text = "") { this.text = text; },
  };
}

test("player history route delegates bounded query options", async () => {
  let call = null;
  const api = createCommandCenterHistoryApi({
    service: {
      async getPlayerHistory(allyCode, options) {
        call = { allyCode, options };
        return { source: "canonical-history", progression: [] };
      },
    },
  });
  const response = responseCapture();
  const url = new URL("http://localhost/api/player/732764286/history?events=9999&snapshots=12");
  const handled = await api.handle({ method: "GET" }, response, url);
  assert.equal(handled, true);
  assert.equal(response.status, 200);
  assert.deepEqual(call, { allyCode: "732764286", options: { eventLimit: 500, snapshotLimit: 12 } });
  assert.equal(JSON.parse(response.text).source, "canonical-history");
});

test("Guild history route is read-only and delegates to Guild history service", async () => {
  let call = null;
  const api = createCommandCenterHistoryApi({
    service: {
      async getGuildHistoryByPlayer(allyCode, options) {
        call = { allyCode, options };
        return { source: "canonical-history", guild: { name: "Ludus Venatus" } };
      },
    },
  });
  const response = responseCapture();
  const url = new URL("http://localhost/api/guild/by-player/732764286/history?events=250&snapshots=400");
  assert.equal(await api.handle({ method: "POST" }, response, url), false);
  assert.equal(await api.handle({ method: "GET" }, response, url), true);
  assert.deepEqual(call, { allyCode: "732764286", options: { eventLimit: 250, snapshotLimit: 365 } });
  assert.equal(JSON.parse(response.text).guild.name, "Ludus Venatus");
});

test("history routes preserve safe status codes", async () => {
  const api = createCommandCenterHistoryApi({
    service: {
      async getPlayerHistory() {
        const error = new Error("No persisted player history exists.");
        error.status = 404;
        throw error;
      },
    },
  });
  const response = responseCapture();
  const url = new URL("http://localhost/api/player/732764286/history");
  assert.equal(await api.handle({ method: "GET" }, response, url), true);
  assert.equal(response.status, 404);
  assert.match(JSON.parse(response.text).error, /No persisted player history/i);
});
