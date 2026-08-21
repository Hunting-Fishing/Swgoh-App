import test from "node:test";
import assert from "node:assert/strict";
import { createDiscordTbLiveServices } from "../discord-tb-live.mjs";

const discordGuildId = "987654321098765432";

function stateStore() {
  return {
    status: () => ({ enabled: true, durable: true }),
    readGuild: async (requestedGuildId) => {
      assert.equal(requestedGuildId, discordGuildId);
      return {
        discordGuildId,
        swgohAllyCode: "123456789",
        userLinks: {},
        memberPreferences: {},
        memberAvailability: {},
      };
    },
  };
}

function disabledReservationStore() {
  return {
    status: () => ({ enabled: false, durable: false }),
  };
}

function operationsResponse() {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify([{
      id: "phase-1-contract",
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

test("configured canonical Guild Operations controls are consumed by the Discord planner", async () => {
  const selectCalls = [];
  const operationStore = {
    status: () => ({ configured: true }),
    async select(table, query) {
      selectCalls.push({ table, query });
      if (table === "players" && query?.ally_code) {
        return [{ id: "seed-uuid", ally_code: "123456789", current_guild_id: "guild-uuid" }];
      }
      if (table === "players" && query?.current_guild_id) {
        return [
          { id: "high-uuid", ally_code: "444555666", swgoh_player_id: "player-high", name: "High GP Keeper", current_guild_id: "guild-uuid" },
          { id: "low-uuid", ally_code: "777888999", swgoh_player_id: "player-low", name: "Lower GP Donor", current_guild_id: "guild-uuid" },
        ];
      }
      if (table === "guild_member_operation_controls") return [];
      if (table === "guild_unit_donation_preferences") {
        return [{
          player_id: "high-uuid",
          base_id: "DISCORD_TEST_UNIT",
          preference: "keep",
          source: "command-center",
          updated_at: "2026-08-21T00:00:00.000Z",
        }];
      }
      throw new Error(`Unexpected canonical store read: ${table}`);
    },
  };

  const guildSnapshot = {
    guild: { id: "guild-test", name: "Canonical Contract Guild" },
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

  const services = createDiscordTbLiveServices({
    SWGOH_ROTE_OPERATIONS_URL: "https://example.test/canonical-contract-rote.json",
    SWGOH_ROTE_CACHE_SECONDS: "600",
  }, {
    fetch: async (url) => {
      assert.equal(String(url), "https://example.test/canonical-contract-rote.json");
      return operationsResponse();
    },
    stateStore: stateStore(),
    reservationStore: disabledReservationStore(),
    guildRosterService: {
      async getGuildRoster(allyCode, options) {
        assert.equal(allyCode, "123456789");
        assert.equal(options.staleWhileRevalidate, false);
        return { value: guildSnapshot, cache: "fresh", ageMs: 0 };
      },
    },
    store: operationStore,
  });

  const result = await services.buildPlan({
    allyCode: "999888777",
    interaction: { guild_id: discordGuildId },
    redundancyTarget: 2,
  });

  assert.equal(result.guildBindingSource, "durable-guild-binding");
  assert.equal(result.planningControls.preferenceCount, 1);
  assert.equal(result.plan.assignedSlots, 1);
  assert.equal(result.plan.assignments[0].member.playerId, "player-low");
  assert.equal(result.plan.assignments[0].member.name, "Lower GP Donor");
  assert.deepEqual(selectCalls.map((row) => row.table), [
    "players",
    "players",
    "guild_member_operation_controls",
    "guild_unit_donation_preferences",
  ]);
});

test("configured canonical Guild Operations storage fails closed when a read is unavailable", async () => {
  let rosterRead = false;
  const services = createDiscordTbLiveServices({
    SWGOH_ROTE_OPERATIONS_URL: "https://example.test/canonical-contract-rote.json",
  }, {
    stateStore: stateStore(),
    reservationStore: disabledReservationStore(),
    guildRosterService: {
      async getGuildRoster() {
        rosterRead = true;
        throw new Error("roster must not be read after canonical controls fail");
      },
    },
    store: {
      status: () => ({ configured: true }),
      async select() {
        throw new Error("canonical database unavailable");
      },
    },
  });

  await assert.rejects(
    () => services.buildPlan({
      allyCode: "999888777",
      interaction: { guild_id: discordGuildId },
      redundancyTarget: 2,
    }),
    (error) => error?.code === "CANONICAL_OPERATION_CONTROLS_READ_FAILED"
      && /refusing to build a Discord plan without shared officer controls/.test(error.message),
  );
  assert.equal(rosterRead, false);
});
