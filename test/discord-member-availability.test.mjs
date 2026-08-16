import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createDiscordStateStore } from "../discord-state-store.mjs";
import { setDiscordMemberAvailability } from "../discord-member-availability-service.mjs";
import { createDiscordTbLiveServices } from "../discord-tb-live.mjs";

const guildId = "987654321098765432";
const actorId = "111111111111111111";
const targetId = "222222222222222222";

async function durableStore(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "swgoh-discord-availability-"));
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
    playerId: "player-high",
    actorDiscordUserId: actorId,
  });
  return store;
}

test("durable UNAVAILABLE state is audited and AVAILABLE clears the planner exclusion", async (t) => {
  const store = await linkedStore(t);
  const unavailable = await store.setMemberAvailability({
    discordGuildId: guildId,
    discordUserId: targetId,
    availability: "UNAVAILABLE",
    actorDiscordUserId: actorId,
  });
  assert.equal(unavailable.availability, "unavailable");
  assert.equal(unavailable.memberId, "player-high");

  let state = await store.readState();
  assert.equal(state.guilds[guildId].memberAvailability[targetId].availability, "unavailable");

  const available = await store.setMemberAvailability({
    discordGuildId: guildId,
    discordUserId: targetId,
    availability: "available",
    actorDiscordUserId: actorId,
  });
  assert.equal(available.availability, "available");
  assert.equal(available.cleared, true);

  state = await store.readState();
  assert.deepEqual(state.guilds[guildId].memberAvailability, {});
  assert.deepEqual(state.audit.map((row) => row.action), [
    "guild-bootstrap-updated",
    "player-linked",
    "member-unavailable-set",
    "member-availability-cleared",
  ]);
});

test("relink and unlink clear stale availability controls", async (t) => {
  const store = await linkedStore(t);
  await store.setMemberAvailability({
    discordGuildId: guildId,
    discordUserId: targetId,
    availability: "unavailable",
    actorDiscordUserId: actorId,
  });

  await store.linkPlayer({
    discordGuildId: guildId,
    discordUserId: targetId,
    swgohAllyCode: "777888999",
    playerId: "player-new",
    actorDiscordUserId: actorId,
  });
  let guild = await store.readGuild(guildId);
  assert.deepEqual(guild.memberAvailability, {});

  await store.setMemberAvailability({
    discordGuildId: guildId,
    discordUserId: targetId,
    availability: "unavailable",
    actorDiscordUserId: actorId,
  });
  await store.unlinkPlayer({
    discordGuildId: guildId,
    discordUserId: targetId,
    actorDiscordUserId: actorId,
  });
  guild = await store.readGuild(guildId);
  assert.deepEqual(guild.memberAvailability, {});
});

test("UNAVAILABLE requires a current bound-guild linked-player verification before persistence", async (t) => {
  const store = await linkedStore(t);
  let readerCalls = 0;
  const result = await setDiscordMemberAvailability({
    discordGuildId: guildId,
    discordUserId: targetId,
    memberAvailability: "unavailable",
    actorDiscordUserId: actorId,
    stateStore: store,
    rosterService: { getGuildRoster: async () => { throw new Error("reader owns roster call"); } },
    linkedPlayerReader: async ({ discordGuildId, discordUserId }) => {
      readerCalls += 1;
      assert.equal(discordGuildId, guildId);
      assert.equal(discordUserId, targetId);
      return {
        discordGuildId,
        discordUserId,
        guildName: "Command Guild",
        member: { name: "Unavailable Player" },
        rosterCache: "fresh",
        rosterAgeMs: 5,
      };
    },
  });

  assert.equal(readerCalls, 1);
  assert.equal(result.availability, "unavailable");
  assert.equal(result.verification.mode, "live-bound-guild-membership");
  assert.equal(result.verification.playerName, "Unavailable Player");
  assert.equal((await store.readGuild(guildId)).memberAvailability[targetId].availability, "unavailable");
});

test("AVAILABLE can clear an exclusion during a live-gateway outage", async (t) => {
  const store = await linkedStore(t);
  await store.setMemberAvailability({
    discordGuildId: guildId,
    discordUserId: targetId,
    availability: "unavailable",
    actorDiscordUserId: actorId,
  });
  let readerCalls = 0;
  const result = await setDiscordMemberAvailability({
    discordGuildId: guildId,
    discordUserId: targetId,
    memberAvailability: "available",
    actorDiscordUserId: actorId,
    stateStore: store,
    linkedPlayerReader: async () => {
      readerCalls += 1;
      throw new Error("must not be required to clear");
    },
  });
  assert.equal(result.availability, "available");
  assert.equal(result.verification.mode, "durable-clear");
  assert.equal(readerCalls, 0);
  assert.deepEqual((await store.readGuild(guildId)).memberAvailability, {});
});

test("Discord ROTE planning excludes durably unavailable members from candidate assignments", async () => {
  const stateStore = {
    status: () => ({ enabled: true, durable: true }),
    readGuild: async (requestedGuildId) => {
      assert.equal(requestedGuildId, guildId);
      return {
        swgohAllyCode: "123456789",
        memberPreferences: {},
        memberAvailability: {
          [targetId]: {
            discordUserId: targetId,
            memberId: "player-high",
            playerId: "player-high",
            swgohAllyCode: "444555666",
            availability: "unavailable",
          },
        },
      };
    },
  };

  const guildSnapshot = {
    guild: { id: "guild-test", name: "Availability Guild" },
    members: [
      {
        playerId: "player-high",
        allyCode: "444555666",
        name: "Unavailable High GP",
        galacticPower: 10_000_000,
        rosterAvailable: true,
        units: [{ baseId: "DISCORD_AVAILABILITY_TEST_UNIT", name: "Availability Test Unit", unitType: "Character", stars: 7, rarity: 7, gear: 13, relic: 9 }],
      },
      {
        playerId: "player-low",
        allyCode: "777888999",
        name: "Available Lower GP",
        galacticPower: 5_000_000,
        rosterAvailable: true,
        units: [{ baseId: "DISCORD_AVAILABILITY_TEST_UNIT", name: "Availability Test Unit", unitType: "Character", stars: 7, rarity: 7, gear: 13, relic: 9 }],
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
    if (String(url) === "https://example.test/availability-rote.json") {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify([{
          id: "phase-1-availability-test",
          phase: "P1",
          squads: [{
            id: "operation-availability-1",
            units: [{
              baseId: "DISCORD_AVAILABILITY_TEST_UNIT",
              nameKey: "Availability Test Unit",
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
    SWGOH_ROTE_OPERATIONS_URL: "https://example.test/availability-rote.json",
    SWGOH_ROTE_CACHE_SECONDS: "600",
  }, {
    fetch: fetchImpl,
    stateStore,
    guildRosterService,
  });

  const result = await services.buildPlan({
    redundancyTarget: 2,
    interaction: { guild_id: guildId },
  });

  assert.equal(result.guildBindingSource, "durable-guild-binding");
  assert.equal(result.planningControls.unavailableMemberCount, 1);
  assert.equal(result.plan.assignedSlots, 1);
  assert.equal(result.plan.assignments[0].member.name, "Available Lower GP");
  assert.equal(result.plan.assignments[0].eligibleOwners, 2);
  assert.equal(result.plan.assignments[0].availableOwners, 1);
});
