import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createDiscordHardReservationStore } from "../discord-hard-reservation-store.mjs";
import { listDiscordHardReservations, setDiscordHardReservation } from "../discord-hard-reservation-service.mjs";

const guildId = "1422643338586099745";
const officerId = "111111111111111111";
const memberId = "222222222222222222";
const ally = "732764286";
const playerId = "player-warm-bacon";

async function tempStore(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "swgoh-hard-reserve-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return createDiscordHardReservationStore({
    SWGOH_STATE_DIR: root,
    SWGOH_STATE_STORAGE_CONFIRMED_DURABLE: "true",
  }, {
    now: () => new Date("2026-08-18T02:00:00.000Z"),
    randomUUID: (() => { let i = 0; return () => `audit-${++i}`; })(),
  });
}

function identityStore() {
  return {
    status: () => ({ enabled: true, durable: true }),
    readGuild: async () => ({
      discordGuildId: guildId,
      swgohAllyCode: ally,
      userLinks: {
        [memberId]: { discordUserId: memberId, swgohAllyCode: ally, playerId },
      },
    }),
  };
}

function liveRosterService() {
  return {
    getGuildRoster: async () => ({
      cache: "refreshed",
      ageMs: 0,
      value: {
        guild: { name: "Ludus Venatus" },
        members: [{
          playerId,
          allyCode: ally,
          name: "Warm Bacon",
          units: [
            { baseId: "DARTHVADER", name: "Darth Vader", stars: 7, relic: 9 },
            { baseId: "JEDIKNIGHTCAL", name: "Jedi Knight Cal Kestis", stars: 7, relic: 7 },
          ],
        }],
      },
    }),
  };
}

test("hard reservation store writes and clears phase-scoped absolute reserves", async (t) => {
  const store = await tempStore(t);
  const saved = await store.setReservation({
    discordGuildId: guildId,
    discordUserId: memberId,
    swgohAllyCode: ally,
    playerId,
    unitBaseId: "DARTHVADER",
    unitName: "Darth Vader",
    rotePhase: "P1",
    reserved: true,
    actorDiscordUserId: officerId,
  });
  assert.equal(saved.reserved, true);
  assert.equal(saved.memberId, playerId);
  assert.equal(saved.phase, "P1");

  let guild = await store.readGuild(guildId);
  assert.equal(Object.keys(guild.reservations).length, 1);
  assert.equal(Object.values(guild.reservations)[0].baseId, "DARTHVADER");

  const cleared = await store.setReservation({
    discordGuildId: guildId,
    discordUserId: memberId,
    swgohAllyCode: ally,
    playerId,
    unitBaseId: "DARTHVADER",
    rotePhase: "P1",
    reserved: false,
    actorDiscordUserId: officerId,
  });
  assert.equal(cleared.cleared, true);
  guild = await store.readGuild(guildId);
  assert.equal(Object.keys(guild.reservations).length, 0);
});

test("setting a hard reserve requires current bound-Guild ownership evidence", async (t) => {
  const reservationStore = await tempStore(t);
  const result = await setDiscordHardReservation({
    discordGuildId: guildId,
    discordUserId: memberId,
    unitBaseId: "DARTHVADER",
    rotePhase: "P2",
    reserved: true,
    actorDiscordUserId: officerId,
    stateStore: identityStore(),
    reservationStore,
    rosterService: liveRosterService(),
  });
  assert.equal(result.reserved, true);
  assert.equal(result.verification.mode, "live-bound-guild-ownership");
  assert.equal(result.unitName, "Darth Vader");

  const listed = await listDiscordHardReservations({
    discordGuildId: guildId,
    stateStore: identityStore(),
    reservationStore,
  });
  assert.equal(listed.rows.length, 1);
  assert.equal(listed.rows[0].memberId, playerId);
  assert.equal(listed.rows[0].phase, "P2");
  assert.equal(listed.rows[0].baseId, "DARTHVADER");
});

test("hard reserve rejects an unowned unit and does not persist it", async (t) => {
  const reservationStore = await tempStore(t);
  await assert.rejects(() => setDiscordHardReservation({
    discordGuildId: guildId,
    discordUserId: memberId,
    unitBaseId: "UNIT_NOT_OWNED",
    rotePhase: "P3",
    reserved: true,
    actorDiscordUserId: officerId,
    stateStore: identityStore(),
    reservationStore,
    rosterService: liveRosterService(),
  }), /does not currently own that unit/);
  assert.equal((await reservationStore.readGuild(guildId)), null);
});

test("clearing a hard reserve does not require live gateway access", async (t) => {
  const reservationStore = await tempStore(t);
  await reservationStore.setReservation({
    discordGuildId: guildId,
    discordUserId: memberId,
    swgohAllyCode: ally,
    playerId,
    unitBaseId: "JEDIKNIGHTCAL",
    unitName: "Jedi Knight Cal Kestis",
    rotePhase: "P4",
    reserved: true,
    actorDiscordUserId: officerId,
  });

  const result = await setDiscordHardReservation({
    discordGuildId: guildId,
    discordUserId: memberId,
    unitBaseId: "JEDIKNIGHTCAL",
    rotePhase: "P4",
    reserved: false,
    actorDiscordUserId: officerId,
    stateStore: identityStore(),
    reservationStore,
    rosterService: { getGuildRoster: async () => { throw new Error("must not be called"); } },
  });
  assert.equal(result.reserved, false);
  assert.equal(result.verification.mode, "durable-clear");
  assert.equal((await listDiscordHardReservations({ discordGuildId: guildId, stateStore: identityStore(), reservationStore })).rows.length, 0);
});
