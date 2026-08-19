import test from "node:test";
import assert from "node:assert/strict";
import { createGacCurrentOpponentConfirmationApi } from "../gac-current-opponent-confirmation-api.mjs";

function harness() {
  const writes = [];
  const boardReads = [];
  const requestGateway = async (pathname) => {
    if (pathname === "/v1/gac/current-event") return { event: { eventInstanceId: "GAC:CURRENT" } };
    if (pathname === "/v1/gac/player/732764286") return { player: { allyCode: "732764286" }, event: { eventInstanceId: "GAC:CURRENT" } };
    throw new Error(`unexpected gateway path ${pathname}`);
  };
  const authSession = { async currentUser() { return { id: "USER-1" }; } };
  const bracketIndex = {
    currentRoundFrom() { return 3; },
    async findIndexedBracket() { return null; },
  };
  const confirmation = {
    async findLatestConfirmed(code, eventId, round) {
      return { opponent: { allyCode: "123456789", name: "Navygators" }, resolution: { exact: true, verified: true, eventInstanceId: eventId, round } };
    },
    async confirm() { throw new Error("opponent confirm should not run for board GET"); },
  };
  const boardObservations = {
    async getDefenses(userId, input) {
      boardReads.push({ userId, input });
      return { source: "user-confirmed-current-board", eventInstanceId: input.eventInstanceId, round: input.round, opponent: { allyCode: input.opponentAllyCode }, defenses: [] };
    },
    async saveDefense() { throw new Error("save should not run for board GET"); },
  };
  const writeJson = (_response, status, body, headers = {}) => writes.push({ status, body, headers });
  const api = createGacCurrentOpponentConfirmationApi({ requestGateway, writeJson, authSession, bracketIndex, confirmation, boardObservations });
  return { api, writes, boardReads };
}

test("GAC confirmation router delegates authenticated current-board reads", async () => {
  const { api, writes, boardReads } = harness();
  const request = { method: "GET", headers: { host: "app.test", "x-forwarded-proto": "https" } };
  const handled = await api.handle(request, {}, new URL("https://app.test/api/gac/current-board/732764286/defense?round=3"));
  assert.equal(handled, true);
  assert.equal(writes[0].status, 200);
  assert.equal(writes[0].headers["X-GAC-Board-Evidence"], "verified-user");
  assert.equal(boardReads.length, 1);
  assert.equal(boardReads[0].userId, "USER-1");
  assert.equal(boardReads[0].input.opponentAllyCode, "123456789");
  assert.equal(boardReads[0].input.round, 3);
});
