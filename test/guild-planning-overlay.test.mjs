import test from "node:test";
import assert from "node:assert/strict";
import { resolveGuildPlanningOverlay } from "../guild-planning-overlay.mjs";

const guildRoster = {
  guild: { id: "swgoh-guild", name: "Test Guild" },
  members: [
    { playerId: "p1", allyCode: "111222333", name: "Alpha" },
    { playerId: "p2", allyCode: "444555666", name: "Bravo" },
  ],
};

function store(state, status = { enabled: true, durable: true }) {
  return {
    status: () => status,
    readState: async () => structuredClone(state),
  };
}

test("returns only normalized SWGOH planning controls for the bound guild", async () => {
  const overlay = await resolveGuildPlanningOverlay(guildRoster, {
    stateStore: store({
      guilds: {
        discord1: {
          swgohAllyCode: "111222333",
          memberPreferences: {
            a: { discordUserId: "secret-discord-id", memberId: "p1", baseId: " jedi_1 ", preference: "GIVE" },
            b: { discordUserId: "other-secret", swgohAllyCode: "444555666", baseId: "sith_2", preference: "keep" },
            invalid: { memberId: "not-in-guild", baseId: "X", preference: "give" },
          },
          memberAvailability: {
            a: { discordUserId: "secret-discord-id", memberId: "p2", availability: "unavailable", updatedAt: "2026-08-17T00:00:00Z" },
          },
        },
      },
    }),
  });

  assert.equal(overlay.bound, true);
  assert.equal(overlay.source, "durable-discord-planning-state");
  assert.deepEqual(overlay.preferences, [
    { memberId: "p1", allyCode: "111222333", baseId: "JEDI_1", preference: "give" },
    { memberId: "p2", allyCode: "444555666", baseId: "SITH_2", preference: "keep" },
  ]);
  assert.deepEqual(overlay.ignoredMembers, ["p2"]);
  assert.equal(overlay.unavailableMembers[0].memberName, "Bravo");
  const serialized = JSON.stringify(overlay);
  assert.equal(serialized.includes("secret-discord-id"), false);
  assert.equal(serialized.includes("discord1"), false);
});

test("binding can be discovered from any current guild member Ally Code", async () => {
  const overlay = await resolveGuildPlanningOverlay(guildRoster, {
    stateStore: store({ guilds: { discord1: { swgohAllyCode: "444555666" } } }),
  });
  assert.equal(overlay.bound, true);
});

test("multiple Discord bindings for the same SWGOH guild fail closed", async () => {
  const overlay = await resolveGuildPlanningOverlay(guildRoster, {
    stateStore: store({
      guilds: {
        one: { swgohAllyCode: "111222333", memberAvailability: { x: { memberId: "p1", availability: "unavailable" } } },
        two: { swgohAllyCode: "444555666", memberAvailability: { y: { memberId: "p2", availability: "unavailable" } } },
      },
    }),
  });
  assert.equal(overlay.bound, false);
  assert.equal(overlay.reason, "ambiguous-discord-guild-bindings");
  assert.deepEqual(overlay.ignoredMembers, []);
});

test("disabled durable state returns a harmless unbound overlay", async () => {
  const overlay = await resolveGuildPlanningOverlay(guildRoster, {
    stateStore: store({}, { enabled: false, durable: false, reason: "disabled" }),
  });
  assert.equal(overlay.bound, false);
  assert.equal(overlay.reason, "disabled");
  assert.deepEqual(overlay.preferences, []);
  assert.deepEqual(overlay.ignoredMembers, []);
});
