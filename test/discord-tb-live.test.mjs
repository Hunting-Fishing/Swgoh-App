import test from "node:test";
import assert from "node:assert/strict";
import { createDiscordTbLiveServices, resolveDiscordGuildAllyCode } from "../discord-tb-live.mjs";

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  };
}

test("Discord guild Ally Code resolution prefers durable guild binding over the pilot fallback", async () => {
  const stateStore = {
    status: () => ({ enabled: true, durable: true }),
    readGuild: async (discordGuildId) => {
      assert.equal(discordGuildId, "987654321098765432");
      return { swgohAllyCode: "111222333" };
    },
  };

  const resolved = await resolveDiscordGuildAllyCode({
    allyCode: "999888777",
    interaction: { guild_id: "987654321098765432" },
    stateStore,
  });

  assert.deepEqual(resolved, {
    allyCode: "111222333",
    source: "durable-guild-binding",
    discordGuildId: "987654321098765432",
  });
});

test("Discord guild Ally Code resolution uses the explicit fallback when durable state is unavailable", async () => {
  const resolved = await resolveDiscordGuildAllyCode({
    allyCode: "999-888-777",
    interaction: { guild_id: "987654321098765432" },
    stateStore: {
      status: () => ({ enabled: false, durable: false }),
      readGuild: async () => {
        throw new Error("should not read disabled state");
      },
    },
  });

  assert.equal(resolved.allyCode, "999888777");
  assert.equal(resolved.source, "explicit-fallback");
});

test("Discord guild Ally Code resolution fails closed when enabled durable state cannot be read", async () => {
  await assert.rejects(
    resolveDiscordGuildAllyCode({
      allyCode: "999888777",
      interaction: { guild_id: "987654321098765432" },
      stateStore: {
        status: () => ({ enabled: true, durable: true }),
        readGuild: async () => {
          throw new Error("volume read failed");
        },
      },
    }),
    (error) => error?.code === "DISCORD_GUILD_BINDING_READ_FAILED" && /refusing to use a possibly stale fallback guild/.test(error.message),
  );
});

test("Discord live guild sync reads the durable guild binding before hitting the roster service", async () => {
  let requestedAllyCode = "";
  const services = createDiscordTbLiveServices({}, {
    stateStore: {
      status: () => ({ enabled: true, durable: true }),
      readGuild: async () => ({ swgohAllyCode: "111222333" }),
    },
    guildRosterService: {
      refreshGuildRoster: async (allyCode) => {
        requestedAllyCode = allyCode;
        return {
          value: { guild: { name: "Durable Guild" }, members: [] },
          cache: "refreshed",
          ageMs: 0,
        };
      },
    },
  });

  const result = await services.syncGuild({
    allyCode: "999888777",
    interaction: { guild_id: "987654321098765432" },
  });

  assert.equal(requestedAllyCode, "111222333");
  assert.equal(result.guildBindingSource, "durable-guild-binding");
  assert.equal(result.guild.guild.name, "Durable Guild");
});

test("Discord live TB services hydrate the guild and run the real mission-safe Operation and phase command models", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    if (String(url).includes("/v1/guild/by-player/999888777/roster")) {
      return jsonResponse({
        source: "live",
        guild: { id: "guild-test", name: "Discord Test Guild", galacticPower: 10_000_000 },
        members: [
          {
            playerId: "player-1",
            allyCode: "999888777",
            name: "Test Officer",
            galacticPower: 10_000_000,
            rosterAvailable: true,
            units: [
              {
                baseId: "DISCORD_TEST_UNIT",
                name: "Discord Test Unit",
                unitType: "Character",
                stars: 7,
                rarity: 7,
                gear: 13,
                relic: 9,
                power: 35_000,
              },
            ],
          },
        ],
      });
    }
    if (String(url) === "https://example.test/rote.json") {
      return jsonResponse([
        {
          id: "phase-1-test",
          phase: "P1",
          squads: [
            {
              id: "operation-1",
              units: [
                {
                  baseId: "DISCORD_TEST_UNIT",
                  nameKey: "Discord Test Unit",
                  combatType: 1,
                  unitRelicTier: 5,
                  rarity: 7,
                },
              ],
            },
          ],
        },
      ]);
    }
    throw new Error(`Unexpected test fetch: ${url}`);
  };

  const services = createDiscordTbLiveServices({
    SWGOH_GATEWAY_URL: "https://gateway.test",
    SWGOH_GATEWAY_API_KEY: "test-secret",
    SWGOH_GUILD_REQUEST_TIMEOUT_MS: "5000",
    SWGOH_GUILD_CACHE_FRESH_SECONDS: "600",
    SWGOH_ROTE_OPERATIONS_URL: "https://example.test/rote.json",
    SWGOH_ROTE_CACHE_SECONDS: "600",
  }, { fetch: fetchImpl });

  const synced = await services.syncGuild({ allyCode: "999888777" });
  assert.equal(synced.cache, "refreshed");
  assert.equal(synced.guildBindingSource, "explicit-fallback");
  assert.equal(synced.guild.guild.name, "Discord Test Guild");

  const result = await services.buildPlan({ allyCode: "999888777", redundancyTarget: 2 });
  assert.equal(result.cache, "fresh");
  assert.equal(result.guildBindingSource, "explicit-fallback");
  assert.equal(result.plan.totalSlots, 1);
  assert.equal(result.plan.assignedSlots, 1);
  assert.equal(result.plan.unfilledSlots, 0);
  assert.equal(result.plan.assignments[0].member.name, "Test Officer");
  assert.equal(result.plan.assignments[0].baseId, "DISCORD_TEST_UNIT");
  assert.equal(result.safety.redundancyTarget, 2);

  const phaseResult = await services.buildPhaseCommand({ allyCode: "999888777", redundancyTarget: 2, phase: "P1" });
  assert.equal(phaseResult.phaseCommand.phase, "P1");
  assert.equal(phaseResult.guildBindingSource, "explicit-fallback");
  assert.equal(phaseResult.phaseCommand.summary.totalMembers, 1);
  assert.equal(phaseResult.phaseCommand.summary.hydratedMembers, 1);
  assert.equal(phaseResult.phaseCommand.summary.operationSlots, 1);
  assert.equal(phaseResult.phaseCommand.summary.assignedOperationSlots, 1);
  assert.equal(phaseResult.phaseCommand.summary.unfilledOperationSlots, 0);
  assert.equal(phaseResult.phaseCommand.summary.operationCoveragePercent, 100);

  assert.equal(calls.filter((url) => url.includes("/v1/guild/by-player/")).length, 1);
  assert.equal(calls.filter((url) => url === "https://example.test/rote.json").length, 1);
});
