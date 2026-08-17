import test from "node:test";
import assert from "node:assert/strict";
import { buildGuildActivityCommand } from "../guild-activity-command.mjs";

const members = [
  { id: "p1", ally_code: "111222333", name: "Alpha", galactic_power: 12_000_000 },
  { id: "p2", ally_code: "222333444", name: "Bravo", galactic_power: 11_000_000 },
  { id: "p3", ally_code: "333444555", name: "Charlie", galactic_power: 10_000_000 },
];

const progression = [
  {
    id: 3,
    playerId: "p1",
    playerName: "Alpha",
    allyCode: "111222333",
    baseId: "UNIT_A",
    unitName: "Unit A",
    changedAt: "2026-08-18T02:00:00Z",
    delta: { galacticPower: 12_000, relicTier: 1, gearLevel: 0, zetaCount: 0, omicronCount: 1, ultimateUnlocked: 0 },
  },
  {
    id: 2,
    playerId: "p2",
    playerName: "Bravo",
    allyCode: "222333444",
    baseId: "UNIT_B",
    unitName: "Unit B",
    changedAt: "2026-08-18T01:00:00Z",
    delta: { galacticPower: 8_000, relicTier: 2, gearLevel: 1, zetaCount: 1, omicronCount: 0, ultimateUnlocked: 0 },
  },
  {
    id: 1,
    playerId: "p1",
    playerName: "Alpha",
    allyCode: "111222333",
    baseId: "UNIT_C",
    unitName: "Unit C",
    changedAt: "2026-08-18T00:00:00Z",
    delta: { galacticPower: 3_000, relicTier: 0, gearLevel: 0, zetaCount: 1, omicronCount: 0, ultimateUnlocked: 1 },
  },
];

test("Guild Activity Command aggregates officer-useful member momentum without inventing inactivity", () => {
  const command = buildGuildActivityCommand({
    currentMembers: members,
    progression,
    membership: [],
    guildMemberCount: 3,
    eventLimit: 200,
  });

  assert.equal(command.summary.currentMembers, 3);
  assert.equal(command.summary.membersWithCapturedProgression, 2);
  assert.equal(command.summary.membersWithoutCapturedProgression, 1);
  assert.equal(command.summary.gpGained, 23_000);
  assert.equal(command.summary.relicLevelsGained, 3);
  assert.equal(command.summary.zetasAdded, 2);
  assert.equal(command.summary.omicronsAdded, 1);
  assert.equal(command.summary.ultimatesAdded, 1);
  assert.equal(command.momentumLeaders[0].name, "Alpha");
  assert.equal(command.momentumLeaders[0].omicronsAdded, 1);
  assert.equal(command.momentumLeaders[0].ultimatesAdded, 1);
  assert.equal(command.noCapturedProgression[0].name, "Charlie");
  assert.equal(command.window.from, "2026-08-18T00:00:00Z");
  assert.equal(command.window.to, "2026-08-18T02:00:00Z");
  assert.equal(command.window.truncated, false);
});

test("Guild Activity Command exposes recent classified ability investments", () => {
  const command = buildGuildActivityCommand({ currentMembers: members, progression, eventLimit: 3 });

  assert.equal(command.summary.abilityInvestments, 3);
  assert.equal(command.recentAbilityInvestments[0].playerName, "Alpha");
  assert.equal(command.recentAbilityInvestments[0].unitName, "Unit A");
  assert.equal(command.recentAbilityInvestments[0].omicronsAdded, 1);
  assert.equal(command.window.truncated, true);
});

test("Guild Activity Command removes mass-join bootstrap rows from true membership movement", () => {
  const baselineTime = "2026-08-17T00:00:00Z";
  const membership = [
    { id: 1, eventType: "joined", occurredAt: baselineTime, playerName: "Alpha" },
    { id: 2, eventType: "joined", occurredAt: baselineTime, playerName: "Bravo" },
    { id: 3, eventType: "joined", occurredAt: baselineTime, playerName: "Charlie" },
    { id: 4, eventType: "left", occurredAt: "2026-08-18T02:30:00Z", playerName: "Former Member" },
  ];

  const command = buildGuildActivityCommand({
    currentMembers: members,
    progression,
    membership,
    guildMemberCount: 3,
    eventLimit: 200,
  });

  assert.equal(command.summary.membershipChanges, 1);
  assert.equal(command.membershipChanges[0].eventType, "left");
  assert.equal(command.membershipChanges[0].playerName, "Former Member");
});
