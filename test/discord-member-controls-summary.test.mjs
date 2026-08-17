import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDiscordMemberControlsSummary,
  formatDiscordMemberControlsSummary,
} from "../discord-member-controls-summary.mjs";

const guildId = "987654321098765432";
const firstId = "111111111111111111";
const secondId = "222222222222222222";

function guildState() {
  return {
    discordGuildId: guildId,
    userLinks: {
      first: { discordUserId: firstId, swgohAllyCode: "732764286", playerId: "warm" },
      second: { discordUserId: secondId, swgohAllyCode: "123456789", playerId: "other" },
    },
    memberAvailability: {
      [firstId]: { discordUserId: firstId, availability: "unavailable" },
    },
    memberPreferences: {
      firstGive: { discordUserId: firstId, baseId: "JEDIKNIGHTCAL", preference: "give" },
      firstKeep: { discordUserId: firstId, baseId: "DARTHVADER", preference: "keep" },
      secondGive: { discordUserId: secondId, baseId: "REY", preference: "give" },
      ignoredDefault: { discordUserId: firstId, baseId: "AHSOKATANO", preference: "default" },
    },
  };
}

test("member controls summary aggregates durable availability and GIVE/KEEP state", () => {
  const summary = buildDiscordMemberControlsSummary(guildState());
  assert.equal(summary.linkedMembers, 2);
  assert.equal(summary.unavailableMembers, 1);
  assert.equal(summary.preferenceCount, 3);
  assert.equal(summary.giveCount, 2);
  assert.equal(summary.keepCount, 1);
  assert.equal(summary.members[0].discordUserId, firstId);
  assert.equal(summary.members[0].availability, "UNAVAILABLE");
  assert.deepEqual(summary.members[0].preferences, [
    { baseId: "JEDIKNIGHTCAL", preference: "GIVE" },
    { baseId: "DARTHVADER", preference: "KEEP" },
  ]);
});

test("member controls summary can scope to one linked Discord member", () => {
  const summary = buildDiscordMemberControlsSummary(guildState(), { discordUserId: secondId });
  assert.equal(summary.scopedDiscordUserId, secondId);
  assert.equal(summary.linkedMembers, 1);
  assert.equal(summary.unavailableMembers, 0);
  assert.equal(summary.preferenceCount, 1);
  assert.equal(summary.members[0].allyCode, "123456789");
});

test("formatted controls are private officer-readable state without pings or writes", () => {
  const content = formatDiscordMemberControlsSummary(buildDiscordMemberControlsSummary(guildState()));
  assert.match(content, /Member TB Controls/);
  assert.match(content, /Linked: \*\*2\*\*/);
  assert.match(content, /Unavailable: \*\*1\*\*/);
  assert.match(content, /732-764-286/);
  assert.match(content, /UNAVAILABLE/);
  assert.match(content, /GIVE JEDIKNIGHTCAL/);
  assert.match(content, /KEEP DARTHVADER/);
  assert.match(content, /Mentions are suppressed/);
  assert.ok(content.length <= 1900);
});
