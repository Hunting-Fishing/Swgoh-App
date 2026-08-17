import test from "node:test";
import assert from "node:assert/strict";
import {
  formatDiscordGuildActivityCommand,
  getDiscordGuildActivityCommand,
} from "../discord-guild-activity-service.mjs";

const discordGuildId = "987654321098765432";

function activityResult() {
  return {
    guild: { name: "Ludus Venatus" },
    activityCommand: {
      window: {
        from: "2026-08-18T00:00:00Z",
        to: "2026-08-18T02:30:00Z",
        capturedEvents: 200,
        truncated: true,
      },
      summary: {
        currentMembers: 50,
        membersWithCapturedProgression: 34,
        membersWithoutCapturedProgression: 16,
        abilityInvestments: 12,
        membershipChanges: 1,
        gpGained: 456789,
        relicLevelsGained: 23,
        zetasAdded: 9,
        omicronsAdded: 4,
        ultimatesAdded: 1,
      },
      momentumLeaders: [
        { name: "Alpha", eventCount: 5, gpGained: 22000, relicLevelsGained: 2, zetasAdded: 1, omicronsAdded: 1, ultimatesAdded: 0 },
        { name: "Bravo", eventCount: 4, gpGained: 18000, relicLevelsGained: 3, zetasAdded: 0, omicronsAdded: 0, ultimatesAdded: 1 },
      ],
      noCapturedProgression: [
        { name: "Charlie", galacticPower: 10000000 },
      ],
      recentAbilityInvestments: [
        { playerName: "Alpha", unitName: "Jedi Knight Cal Kestis", omicronsAdded: 1, zetasAdded: 0, ultimatesAdded: 0 },
      ],
    },
  };
}

test("Discord Guild Activity resolves the durable Discord guild binding before reading canonical history", async () => {
  let capturedAllyCode = "";
  let capturedOptions = null;
  const result = await getDiscordGuildActivityCommand({
    discordGuildId,
    fallbackGuildAllyCode: "111222333",
    stateStore: {
      readGuild: async (id) => {
        assert.equal(id, discordGuildId);
        return { swgohAllyCode: "732764286" };
      },
    },
    historyService: {
      getGuildHistoryByPlayer: async (allyCode, options) => {
        capturedAllyCode = allyCode;
        capturedOptions = options;
        return { source: "canonical-history", ...activityResult() };
      },
    },
  });

  assert.equal(capturedAllyCode, "732764286");
  assert.deepEqual(capturedOptions, { eventLimit: 200, snapshotLimit: 2 });
  assert.equal(result.guild.name, "Ludus Venatus");
  assert.equal(result.source, "canonical-history");
});

test("Discord Guild Activity falls back to configured Ally Code only when persisted binding has none", async () => {
  let capturedAllyCode = "";
  await getDiscordGuildActivityCommand({
    discordGuildId,
    fallbackGuildAllyCode: "111222333",
    stateStore: { readGuild: async () => ({ swgohAllyCode: "" }) },
    historyService: {
      getGuildHistoryByPlayer: async (allyCode) => {
        capturedAllyCode = allyCode;
        return activityResult();
      },
    },
  });
  assert.equal(capturedAllyCode, "111222333");
});

test("Discord Guild Activity formatter is compact, non-pinging, and evidence-bounded", () => {
  const content = formatDiscordGuildActivityCommand(activityResult());
  assert.match(content, /Guild Activity/);
  assert.match(content, /Ludus Venatus/);
  assert.match(content, /Progressing: \*\*34\/50\*\*/);
  assert.match(content, /Review queue: \*\*16\*\*/);
  assert.match(content, /capped event window/);
  assert.match(content, /Alpha/);
  assert.match(content, /\+1 Omi/);
  assert.match(content, /Charlie/);
  assert.match(content, /no tracked roster progression in this window/);
  assert.match(content, /Jedi Knight Cal Kestis/);
  assert.match(content, /not an inactivity verdict/);
  assert.doesNotMatch(content, /<@/);
  assert.ok(content.length <= 1900);
});

test("Discord Guild Activity fails closed when the Discord server has no durable setup", async () => {
  await assert.rejects(
    getDiscordGuildActivityCommand({
      discordGuildId,
      stateStore: { readGuild: async () => null },
      historyService: { getGuildHistoryByPlayer: async () => activityResult() },
    }),
    /has not completed durable \/tb setup/,
  );
});
