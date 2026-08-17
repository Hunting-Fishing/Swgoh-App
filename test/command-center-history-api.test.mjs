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

test("Guild Intelligence route delegates to the daily intelligence service", async () => {
  let call = null;
  const api = createCommandCenterHistoryApi({
    service: {},
    intelligence: {
      async getByPlayer(allyCode) {
        call = allyCode;
        return { guild: { name: "Ludus Venatus" }, summary: { totalPages: 29, returnedTotal: 16 } };
      },
    },
  });
  const response = responseCapture();
  const url = new URL("http://localhost/api/guild/by-player/732764286/intelligence");
  assert.equal(await api.handle({ method: "POST" }, response, url), false);
  assert.equal(await api.handle({ method: "GET" }, response, url), true);
  assert.equal(call, "732764286");
  assert.equal(response.status, 200);
  const body = JSON.parse(response.text);
  assert.equal(body.summary.totalPages, 29);
  assert.equal(body.summary.returnedTotal, 16);
});

test("Guild historical coverage route delegates to the archive service", async () => {
  let call = null;
  const api = createCommandCenterHistoryApi({
    service: {}, intelligence: {},
    archive: {
      async getCoverage(allyCode) {
        call = allyCode;
        return { available: true, counts: { guildSnapshots: 666, returns: 16 } };
      },
    },
  });
  const response = responseCapture();
  const url = new URL("http://localhost/api/guild/by-player/732764286/history/coverage");
  assert.equal(await api.handle({ method: "GET" }, response, url), true);
  assert.equal(call, "732764286");
  assert.equal(response.status, 200);
  assert.equal(JSON.parse(response.text).counts.guildSnapshots, 666);
});

test("Guild historical section route lazy-loads only the requested section", async () => {
  let call = null;
  const api = createCommandCenterHistoryApi({
    service: {}, intelligence: {},
    archive: {
      async getSection(allyCode, section) {
        call = { allyCode, section };
        return { source: "historical-guild-archive", section, data: [["2026-08-14", 50, 29020, 44, 0, 6]] };
      },
    },
  });
  const response = responseCapture();
  const url = new URL("http://localhost/api/guild/by-player/732764286/history/archive?section=tickets");
  assert.equal(await api.handle({ method: "GET" }, response, url), true);
  assert.deepEqual(call, { allyCode: "732764286", section: "tickets" });
  assert.equal(response.status, 200);
  assert.equal(JSON.parse(response.text).section, "tickets");
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
