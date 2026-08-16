import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createDiscordStateStore } from "../discord-state-store.mjs";
import { setDiscordDonationPreference } from "../discord-donation-preference-service.mjs";
import { createDiscordTbLiveServices } from "../discord-tb-live.mjs";

const guildId = "987654321098765432";
const actorId = "111111111111111111";
const targetId = "222222222222222222";

async function durableStore(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "swgoh-discord-pref-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let sequence = 0;
  return createDiscordStateStore({
    SWGOH_STATE_DIR: directory,
    SWGOH_STATE_STORAGE_CONFIRMED_DURABLE: "true",
  }, {
    now: () => new Date("2026-08-17T00:00:00.000Z"),
    randomUUID: () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`,
  });
}

async function linkedStore(t) {
  const store = await durableStore(t);
  await store.bootstrapGuild({
    discordGuildId: guildId,
    swgohAllyCode: "123456789",
    actorDiscordUserId: actorId,
  });
  await store.linkPlayer({
    discordGuildId: guildId,
    discordUserId: targetId,
    swgohAllyCode: "444555666",
    playerId: "player-444",
    actorDiscordUserId: actorId,
  });
  return store;
}

function liveRosterService(units = [{ baseId: "JEDIKNIGHTCAL", name: "Jedi Knight Cal Kestis" }]) {
  return {
    async getGuildRoster(allyCode, options) {
      assert.equal(allyCode, "123456789");
      assert.equal(options.staleWhileRevalidate, false);
      return {
        value: {
          guild: { id: "guild-live", name: "Command Guild" },
          members: [{
            playerId: "player-444",
            allyCode: "444555666",
            name: "Linked Player",
            rosterAvailable: true,
            units,
          }],
        },
        cache: "fresh",
        ageMs: 123,
      };
    },
  };
}

test("durable state stores GIVE/KEEP and DEFAULT removes the override with audit records", async (t) => {
  const store = await linkedStore(t);

  const keep = await store.setDonationPreference({
    discordGuildId: guildId,
    discordUserId: targetId,
    unitBaseId: "jediknightcal",
    preference: "KEEP",
    actorDiscordUserId: actorId,
  });
  assert.equal(keep.baseId, "JEDIKNIGHTCAL");
  assert.equal(keep.preference, "keep");
  assert.equal(keep.memberId, "player-444");

  let state = await store.readState();
  assert.equal(state.guilds[guildId].memberPreferences[`${targetId}|JEDIKNIGHTCAL`].preference, "keep");

  const cleared = await store.setDonationPreference({
    discordGuildId: guildId,
    discordUserId: targetId,
    unitBaseId: "JEDIKNIGHTCAL",
    preference: "default",
    actorDiscordUserId: actorId,
  });
  assert.equal(cleared.cleared, true);
  assert.equal(cleared.previous.preference, "keep");

  state = await store.readState();
  assert.equal(state.guilds[guildId].memberPreferences[`${targetId}|JEDIKNIGHTCAL`], undefined);
  assert.deepEqual(state.audit.map((row) => row.action), [
    "guild-bootstrap-updated",
    "player-linked",
    "donation-preference-updated",
    "donation-preference-cleared",
  ]);
});

test("relinking to a different SWGOH account and unlinking both clear stale member preferences", async (t) => {
  const store = await linkedStore(t);
  await store.setDonationPreference({
    discordGuildId: guildId,
    discordUserId: targetId,
    unitBaseId: "JEDIKNIGHTCAL",
    preference: "give",
    actorDiscordUserId: actorId,
  });

  await store.linkPlayer({
    discordGuildId: guildId,
    discordUserId: targetId,
    swgohAllyCode: "777888999",
    playerId: "player-777",
    actorDiscordUserId: actorId,
  });
  let guild = await store.readGuild(guildId);
  assert.deepEqual(guild.memberPreferences, {});

  await store.setDonationPreference({
    discordGuildId: guildId,
    discordUserId: targetId,
    unitBaseId: "JEDIKNIGHTCAL",
    preference: "keep",
    actorDiscordUserId: actorId,
  });
  await store.unlinkPlayer({
    discordGuildId: guildId,
    discordUserId: targetId,
    actorDiscordUserId: actorId,
  });
  guild = await store.readGuild(guildId);
  assert.deepEqual(guild.memberPreferences, {});
});

test("verified preference service requires current unit ownership for GIVE/KEEP before writing", async (t) => {
  const store = await linkedStore(t);
  const result = await setDiscordDonationPreference({
    discordGuildId: guildId,
    discordUserId: targetId,
    unitBaseId: "jediknightcal",
    donationPreference: "keep",
    actorDiscordUserId: actorId,
    stateStore: store,
    rosterService: liveRosterService(),
  });

  assert.equal(result.preference, "keep");
  assert.equal(result.baseId, "JEDIKNIGHTCAL");
  assert.equal(result.verification.mode, "live-bound-guild-ownership");
  assert.equal(result.verification.playerName, "Linked Player");

  await assert.rejects(
    setDiscordDonationPreference({
      discordGuildId: guildId,
      discordUserId: targetId,
      unitBaseId: "DARTHVADER",
      donationPreference: "give",
      actorDiscordUserId: actorId,
      stateStore: store,
      rosterService: liveRosterService(),
    }),
    (error) => error?.code === "LINKED_PLAYER_DOES_NOT_OWN_UNIT",
  );

  const guild = await store.readGuild(guildId);
  assert.equal(guild.memberPreferences[`${targetId}|DARTHVADER`], undefined);
});

test("DEFAULT can clear an override without the live gateway while GIVE/KEEP remain verification-gated", async (t) => {
  const store = await linkedStore(t);
  await store.setDonationPreference({
    discordGuildId: guildId,
    discordUserId: targetId,
    unitBaseId: "JEDIKNIGHTCAL",
    preference: "keep",
    actorDiscordUserId: actorId,
  });

  let rosterCalls = 0;
  const result = await setDiscordDonationPreference({
    discordGuildId: guildId,
    discordUserId: targetId,
    unitBaseId: "JEDIKNIGHTCAL",
    donationPreference: "default",
    actorDiscordUserId: actorId,
    stateStore: store,
    rosterService: {
      async getGuildRoster() {
        rosterCalls += 1;
        throw new Error("gateway should not be required for clear");
      },
    },
  });

  assert.equal(result.preference, "default");
  assert.equal(result.verification.mode, "durable-clear");
  assert.equal(rosterCalls, 0);
  assert.deepEqual((await store.readGuild(guildId)).memberPreferences, {});
});

test("Discord live ROTE planner consumes durable KEEP preference and changes donor selection", async () => {
  const preferenceState = {
    swgohAllyCode: "123456789",
    memberPreferences: {
      [`${targetId}|DISCORD_TEST_UNIT`]: {
        discordUserId: targetId,
        memberId: "player-high",
        playerId: "player-high",
        swgohAllyCode: "444555666",
        baseId: "DISCORD_TEST_UNIT",
        preference: "keep",
      },
    },
  };
  const stateStore = {
    status: () => ({ enabled: true, durable: true }),
    readGuild: async (requestedGuildId) => {
      assert.equal(requestedGuildId, guildId);
      return preferenceState;
    },
  };

  const guildSnapshot = {
    guild: { id: "guild-test", name: "Preference Guild" },
    members: [
      {
        playerId: "player-high",
        allyCode: "444555666",
        name: "High GP Keeper",
        galacticPower: 10_000_000,
        rosterAvailable: true,
        units: [{ baseId: "DISCORD_TEST_UNIT", name: "Discord Test Unit", unitType: "Character", stars: 7, rarity: 7, gear: 13, relic: 9 }],
      },
      {
        playerId: "player-low",
        allyCode: "777888999",
        name: "Lower GP Donor",
        galacticPower: 5_000_000,
        rosterAvailable: true,
        units: [{ baseId: "DISCORD_TEST_UNIT", name: "Discord Test Unit", unitType: "Character", stars: 7, rarity: 7, gear: 13, relic: 9 }],
      },
    ],
  };

  const guildRosterService = {
    async getGuildRoster(allyCode, options) {
      assert.equal(allyCode, "123456789");
      assert.equal(options.staleWhileRevalidate, false);
      return { value: guildSnapshot, cache: "fresh", ageMs: 0 };
    },
    async refreshGuildRoster() {
      return { value: guildSnapshot, cache: "refreshed", ageMs: 0 };
    },
  };

  const fetchImpl = async (url) => {
    if (String(url) === "https://example.test/preference-rote.json") {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify([{
          id: "phase-1-test",
          phase: "P1",
          squads: [{
            id: "operation-1",
            units: [{
              baseId: "DISCORD_TEST_UNIT",
              nameKey: "Discord Test Unit",
              combatType: 1,
              unitRelicTier: 5,
              rarity: 7,
            }],
          }],
        }]),
      };
    }
    throw new Error(`Unexpected test fetch: ${url}`);
  };

  const services = createDiscordTbLiveServices({
    SWGOH_ROTE_OPERATIONS_URL: "https://example.test/preference-rote.json",
    SWGOH_ROTE_CACHE_SECONDS: "600",
  }, {
    fetch: fetchImpl,
    stateStore,
    guildRosterService,
  });

  const result = await services.buildPlan({
    allyCode: "999888777",
    redundancyTarget: 2,
    interaction: { guild_id: guildId },
  });

  assert.equal(result.guildBindingSource, "durable-guild-binding");
  assert.equal(result.planningControls.preferenceCount, 1);
  assert.equal(result.plan.assignedSlots, 1);
  assert.equal(result.plan.assignments[0].member.name, "Lower GP Donor");
  assert.equal(result.plan.assignments[0].safety.preference, "default");
});
