import test from "node:test";
import assert from "node:assert/strict";
import { buildGuildMemberCommandProfile } from "../public/guild-member-command-model.js";

const catalog = [
  { baseId: "J1", name: "Jedi Leader", unitType: "Character", factions: ["Jedi"], categories: ["raid_order66_allowed"], abilities: [{ id: "leader_jedi", type: "leader" }] },
  { baseId: "J2", name: "Jedi Two", unitType: "Character", factions: ["Jedi"], categories: ["raid_order66_allowed"] },
  { baseId: "J3", name: "Jedi Three", unitType: "Character", factions: ["Jedi"], categories: ["raid_order66_allowed"] },
  { baseId: "J4", name: "Jedi Four", unitType: "Character", factions: ["Jedi"], categories: ["raid_order66_allowed"] },
  { baseId: "J5", name: "Jedi Five", unitType: "Character", factions: ["Jedi"], categories: ["raid_order66_allowed"] },
  { baseId: "SHIP", name: "Ship", unitType: "Ship", factions: [] },
];
const unit = (baseId, relic = 7, power = 30000) => ({ baseId, stars: 7, gear: 13, relic, power });
const guild = {
  source: "live",
  fetchedAt: "2026-08-17T00:00:00.000Z",
  guild: { id: "g1", name: "Test Guild", galacticPower: 18_000_000, memberCount: 2 },
  hydration: { requested: 2, hydrated: 2, failed: 0, complete: true },
  members: [
    { playerId: "a", allyCode: "111222333", name: "Alpha", galacticPower: 10_000_000, rosterAvailable: true, units: [...catalog.slice(0, 5).map((row) => unit(row.baseId, 7)), { baseId: "SHIP", stars: 7, power: 50000 }] },
    { playerId: "b", allyCode: "444555666", name: "Bravo", galacticPower: 8_000_000, rosterAvailable: true, units: [unit("J2", 5), unit("J3", 5)] },
  ],
};
const operations = {
  slots: [{ id: "op1", phase: "P1", conflictId: "planet", squadId: "op", slot: 1, baseId: "J1", name: "Jedi Leader", unitType: "Character", requiredRarity: 7, requiredRelic: 5 }],
};

test("builds one member profile from the shared guild roster across modes", () => {
  const profile = buildGuildMemberCommandProfile({ guildSnapshot: guild, catalog, operations, targetMember: "111222333", redundancyTarget: 2 });
  assert.ok(profile);
  assert.equal(profile.member.name, "Alpha");
  assert.equal(profile.member.galacticPower, 10_000_000);
  assert.equal(profile.member.characterCount, 5);
  assert.equal(profile.member.shipCount, 1);
  assert.equal(profile.ranks.gp, 1);
  assert.equal(profile.tw.r7Factions, 1);
  assert.equal(profile.tw.leaderCapableFactions, 1);
  assert.equal(profile.raid.bands.r7, 5);
  assert.equal(profile.raid.fiveCharacterPools.r7, 1);
  assert.equal(profile.tb.operationAssignedCount, 1);
  assert.equal(profile.tb.operationAssignments[0].baseId, "J1");
});

test("guild-relative TW and Raid ranks remain separate metrics", () => {
  const alpha = buildGuildMemberCommandProfile({ guildSnapshot: guild, catalog, operations, targetMember: "111222333" });
  const bravo = buildGuildMemberCommandProfile({ guildSnapshot: guild, catalog, operations, targetMember: "444555666" });
  assert.equal(alpha.ranks.tw, 1);
  assert.equal(alpha.ranks.raid, 1);
  assert.equal(bravo.ranks.gp, 2);
  assert.equal(bravo.tw.r7Factions, 0);
  assert.equal(bravo.raid.bands.r7, 0);
});

test("unknown Ally Code fails closed instead of inventing a guild member", () => {
  assert.equal(buildGuildMemberCommandProfile({ guildSnapshot: guild, catalog, operations, targetMember: "999999999" }), null);
});
