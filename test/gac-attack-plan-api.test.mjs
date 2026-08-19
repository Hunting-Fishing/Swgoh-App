import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { createGacAttackPlanApi } from "../gac-attack-plan-api.mjs";

function request(method, body = null, options = {}) {
  const stream = body == null ? Readable.from([]) : Readable.from([Buffer.from(JSON.stringify(body))]);
  stream.method = method;
  stream.headers = {
    host: "app.test",
    "x-forwarded-proto": "https",
    ...(body == null ? {} : { "content-type": "application/json", origin: "https://app.test" }),
    ...(options.headers || {}),
  };
  return stream;
}

function harness(options = {}) {
  const writes = [];
  const gatewayCalls = [];
  const planCalls = [];
  const playerRoster = {
    player: { allyCode: "732764286", name: "Warm Bacon" },
    units: [
      { baseId: "ATK_A", name: "Attack A", relic: 9 },
      { baseId: "ATK_B", name: "Attack B", relic: 8 },
      { baseId: "ATK_C", name: "Attack C", relic: 7 },
      { baseId: "DEF_ME", name: "My Defense", relic: 9 },
    ],
    datacrons: [{ id: "OWN-DC-9", setId: 19, level: 9, affixes: [] }],
  };
  const requestGateway = async (pathname, includeKey) => {
    gatewayCalls.push({ pathname, includeKey });
    if (pathname === "/v1/gac/current-event") return { event: { eventInstanceId: "GAC:CURRENT" } };
    if (pathname === "/v1/gac/player/732764286") return { event: { eventInstanceId: "GAC:CURRENT" }, player: { allyCode: "732764286" } };
    if (pathname === "/v1/player/732764286") return playerRoster;
    throw new Error(`unexpected gateway call ${pathname}`);
  };
  const authSession = { async currentUser() { return options.anonymous ? null : { id: "USER-1" }; } };
  const bracketIndex = { currentRoundFrom() { return options.liveRound ?? null; } };
  const confirmation = {
    async findLatestConfirmed(_code, eventInstanceId, round) {
      if (options.noConfirmation) return null;
      return { opponent: { allyCode: "123456789", name: "Navygators" }, resolution: { eventInstanceId, round, exact: true } };
    },
  };
  const boards = {
    async getPlayerDefenses(userId, input) {
      planCalls.push({ type: "getPlayerDefenses", userId, input });
      return {
        owner: "player",
        defenses: options.ownDefenses || [{ id: 77, members: ["DEF_ME", "DEF_2", "DEF_3"] }],
      };
    },
  };
  const plans = {
    async getAssignments(userId, input) {
      planCalls.push({ type: "getAssignments", userId, input });
      return { source: "verified-owner-war-room", round: input.round, assignments: [] };
    },
    async saveAssignment(userId, input) {
      planCalls.push({ type: "saveAssignment", userId, input });
      return {
        source: "verified-owner-war-room",
        saved: true,
        round: input.round,
        assignment: { id: 10, defenseId: Number(input.defenseId), members: input.members, leaderBaseId: input.leaderBaseId, datacron: input.datacron, status: "planned" },
      };
    },
    async updateStatus(userId, input) {
      planCalls.push({ type: "updateStatus", userId, input });
      return { source: "verified-owner-war-room", updated: true, round: input.round, assignment: { id: Number(input.id), status: input.status, banners: input.banners ?? null } };
    },
  };
  const writeJson = (_response, status, body, headers = {}) => writes.push({ status, body, headers });
  const api = createGacAttackPlanApi({ requestGateway, writeJson, authSession, bracketIndex, confirmation, boards, plans });
  return { api, writes, gatewayCalls, planCalls, playerRoster };
}

const planBody = {
  round: 3,
  defenseId: 44,
  leaderBaseId: "ATK_A",
  members: ["ATK_A", "ATK_B", "ATK_C"],
  datacronId: "OWN-DC-9",
};

test("verified owner can read current-round war-room assignments", async () => {
  const { api, writes, planCalls } = harness();
  const handled = await api.handle(request("GET"), {}, new URL("https://app.test/api/gac/attack-plan/732764286?round=3"));
  assert.equal(handled, true);
  assert.equal(writes[0].status, 200);
  assert.equal(writes[0].headers["X-GAC-War-Room"], "verified-owner");
  assert.equal(planCalls.find((call) => call.type === "getAssignments").input.round, 3);
});

test("verified owner can lock a roster-validated counter and exact owned datacron", async () => {
  const { api, writes, planCalls } = harness({ ownDefenses: [] });
  await api.handle(request("POST", planBody), {}, new URL("https://app.test/api/gac/attack-plan/732764286"));
  assert.equal(writes[0].status, 200);
  const save = planCalls.find((call) => call.type === "saveAssignment");
  assert.deepEqual(save.input.members, ["ATK_A", "ATK_B", "ATK_C"]);
  assert.equal(save.input.datacron.id, "OWN-DC-9");
  assert.equal(save.input.defenseId, 44);
});

test("cannot lock an attacker reserved on verified own defense", async () => {
  const { api, writes, planCalls } = harness({ ownDefenses: [{ id: 77, members: ["ATK_B", "DEF_2", "DEF_3"] }] });
  await api.handle(request("POST", planBody), {}, new URL("https://app.test/api/gac/attack-plan/732764286"));
  assert.equal(writes[0].status, 409);
  assert.match(writes[0].body.error, /ATK_B/);
  assert.equal(planCalls.some((call) => call.type === "saveAssignment"), false);
});

test("cannot lock a unit absent from the current live roster", async () => {
  const { api, writes, planCalls } = harness({ ownDefenses: [] });
  await api.handle(request("POST", { ...planBody, members: ["ATK_A", "ATK_B", "NOT_OWNED"] }), {}, new URL("https://app.test/api/gac/attack-plan/732764286"));
  assert.equal(writes[0].status, 409);
  assert.match(writes[0].body.error, /NOT_OWNED/);
  assert.equal(planCalls.some((call) => call.type === "saveAssignment"), false);
});

test("cannot persist a datacron missing from current owned inventory", async () => {
  const { api, writes, planCalls } = harness({ ownDefenses: [] });
  await api.handle(request("POST", { ...planBody, datacronId: "FAKE-DC" }), {}, new URL("https://app.test/api/gac/attack-plan/732764286"));
  assert.equal(writes[0].status, 409);
  assert.match(writes[0].body.error, /player current live datacron inventory/i);
  assert.equal(planCalls.some((call) => call.type === "saveAssignment"), false);
});

test("status transitions are routed through authenticated PATCH without roster revalidation", async () => {
  const { api, writes, gatewayCalls, planCalls } = harness();
  await api.handle(request("PATCH", { round: 3, id: 10, status: "win", banners: 65 }), {}, new URL("https://app.test/api/gac/attack-plan/732764286"));
  assert.equal(writes[0].status, 200);
  const update = planCalls.find((call) => call.type === "updateStatus");
  assert.equal(update.input.id, 10);
  assert.equal(update.input.status, "win");
  assert.equal(update.input.banners, 65);
  assert.equal(gatewayCalls.some((call) => call.pathname === "/v1/player/732764286"), false);
});

test("live round mismatch blocks stale war-room writes", async () => {
  const { api, writes, planCalls } = harness({ liveRound: 2, ownDefenses: [] });
  await api.handle(request("POST", planBody), {}, new URL("https://app.test/api/gac/attack-plan/732764286"));
  assert.equal(writes[0].status, 409);
  assert.match(writes[0].body.error, /Round 2, not Round 3/);
  assert.equal(planCalls.some((call) => call.type === "saveAssignment"), false);
});

test("anonymous users cannot read or mutate war-room state", async () => {
  const get = harness({ anonymous: true });
  await get.api.handle(request("GET"), {}, new URL("https://app.test/api/gac/attack-plan/732764286?round=3"));
  assert.equal(get.writes[0].status, 401);
  assert.equal(get.gatewayCalls.length, 0);

  const post = harness({ anonymous: true });
  await post.api.handle(request("POST", planBody), {}, new URL("https://app.test/api/gac/attack-plan/732764286"));
  assert.equal(post.writes[0].status, 401);
  assert.equal(post.gatewayCalls.length, 0);
});

test("cross-origin war-room writes are rejected before any live-data lookup", async () => {
  const { api, writes, gatewayCalls } = harness({ ownDefenses: [] });
  await api.handle(request("POST", planBody, { headers: { origin: "https://evil.test" } }), {}, new URL("https://app.test/api/gac/attack-plan/732764286"));
  assert.equal(writes[0].status, 403);
  assert.equal(gatewayCalls.length, 0);
});
