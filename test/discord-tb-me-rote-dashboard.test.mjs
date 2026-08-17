import test from "node:test";
import assert from "node:assert/strict";
import { discordTbConfig, executeDiscordTbDeferredCommand } from "../discord-tb.mjs";

const guildId = "987654321098765432";
const actorId = "111111111111111111";
const linkedMember = {
  id: "player-warm",
  playerId: "player-warm",
  allyCode: "732764286",
  name: "Warm Bacon",
};

function config() {
  return discordTbConfig({
    DISCORD_TB_INTERACTIONS_ENABLED: "true",
    DISCORD_APPLICATION_ID: "123456789012345678",
    DISCORD_PUBLIC_KEY: "ab".repeat(32),
    DISCORD_DEFAULT_GUILD_ID: guildId,
    DISCORD_TB_REDUNDANCY_TARGET: "2",
  });
}

function interaction() {
  return {
    guild_id: guildId,
    member: { user: { id: actorId } },
    data: { name: "tb", options: [{ type: 1, name: "me" }] },
  };
}

function stateStore() {
  return {
    status: () => ({ enabled: true, durable: true, reason: "ready" }),
  };
}

function linkedSnapshot() {
  return {
    discordGuildId: guildId,
    discordUserId: actorId,
    guildName: "Ludus Venatus",
    link: { swgohAllyCode: "732764286", playerId: "player-warm" },
    member: {
      ...linkedMember,
      galacticPower: 12_655_455,
      units: Array.from({ length: 394 }, (_, index) => ({ baseId: `UNIT_${index}` })),
    },
    rosterCache: "fresh",
  };
}

test("/tb me adds personal ROTE readiness, Operation obligations, and highest-impact farms", async () => {
  const content = await executeDiscordTbDeferredCommand(interaction(), config(), {
    stateStore: stateStore(),
    authorizedAsOfficer: false,
    getDiscordLinkedPlayerSnapshot: async () => linkedSnapshot(),
    buildPlan: async ({ interaction: requestInteraction, redundancyTarget }) => {
      assert.equal(requestInteraction.guild_id, guildId);
      assert.equal(redundancyTarget, 2);
      return {
        safety: {
          coverage: {
            exactMissions: [
              { phase: "P1", exactReady: [{ member: linkedMember }], close: [] },
              { phase: "P2", exactReady: [{ member: linkedMember }, { member: { allyCode: "111222333", name: "Other" } }], close: [] },
              { phase: "P3", exactReady: [], close: [{ member: linkedMember }] },
            ],
            farms: [
              {
                member: linkedMember,
                baseId: "FARM_UNIT",
                unitName: "Important Farm",
                gapLabel: "+2 relic",
                missionImpact: 3,
                missionRefs: [{ phase: "P3" }, { phase: "P4" }],
              },
            ],
          },
          protections: [{ memberId: "player-warm", phase: "P1", baseId: "PROTECTED" }],
        },
        plan: {
          assignments: [
            { phase: "P1", baseId: "OP_SAFE", name: "Safe Operation Unit", member: linkedMember, safety: { status: "SAFE" } },
            { phase: "P2", baseId: "OP_CHECK", name: "Protected Operation Unit", member: linkedMember, safety: { status: "HELP", protection: true } },
          ],
        },
      };
    },
  });

  assert.match(content, /My Linked Player/);
  assert.match(content, /12,655,455/);
  assert.match(content, /Units: \*\*394\*\*/);
  assert.match(content, /My ROTE Readiness/);
  assert.match(content, /Missions ready: \*\*2\*\*/);
  assert.match(content, /Sole-owner: \*\*1\*\*/);
  assert.match(content, /Close: \*\*1\*\*/);
  assert.match(content, /Operations: \*\*2 assigned\*\*/);
  assert.match(content, /Risk\/check: \*\*1\*\*/);
  assert.match(content, /My Operation Slots/);
  assert.match(content, /Safe Operation Unit/);
  assert.match(content, /Protected Operation Unit · \*\*CHECK\*\*/);
  assert.match(content, /Highest-Impact Farms/);
  assert.match(content, /Important Farm → \+2 relic · 3 mission impact · P3\/P4/);
  assert.match(content, /Read-only personal view/);
});

test("/tb me preserves the linked-player profile when ROTE planning is temporarily unavailable", async () => {
  const content = await executeDiscordTbDeferredCommand(interaction(), config(), {
    stateStore: stateStore(),
    authorizedAsOfficer: false,
    getDiscordLinkedPlayerSnapshot: async () => linkedSnapshot(),
    buildPlan: async () => {
      throw new Error("ROTE operations source timed out");
    },
  });

  assert.match(content, /My Linked Player/);
  assert.match(content, /Warm Bacon/);
  assert.match(content, /12,655,455/);
  assert.match(content, /ROTE dashboard: temporarily unavailable/);
  assert.match(content, /ROTE operations source timed out/);
  assert.doesNotMatch(content, /TB command failed/);
});

test("/tb me remains backward-compatible when no planning service is injected", async () => {
  const content = await executeDiscordTbDeferredCommand(interaction(), config(), {
    stateStore: stateStore(),
    authorizedAsOfficer: false,
    getDiscordLinkedPlayerSnapshot: async () => linkedSnapshot(),
  });

  assert.match(content, /My Linked Player/);
  assert.match(content, /Warm Bacon/);
  assert.doesNotMatch(content, /My ROTE Readiness/);
  assert.match(content, /Read-only personal view/);
});
