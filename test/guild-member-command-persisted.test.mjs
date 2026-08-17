import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGuildMemberCommandProfile } from '../public/guild-member-command-model.js';

const catalog = [
  { baseId: 'J1', name: 'Jedi Leader', unitType: 'Character', factions: ['Jedi'], categories: ['raid_order66_allowed'], abilities: [{ id: 'leader_jedi', type: 'leader' }] },
  { baseId: 'J2', name: 'Jedi Two', unitType: 'Character', factions: ['Jedi'], categories: ['raid_order66_allowed'] },
  { baseId: 'J3', name: 'Jedi Three', unitType: 'Character', factions: ['Jedi'], categories: ['raid_order66_allowed'] },
  { baseId: 'J4', name: 'Jedi Four', unitType: 'Character', factions: ['Jedi'], categories: ['raid_order66_allowed'] },
  { baseId: 'J5', name: 'Jedi Five', unitType: 'Character', factions: ['Jedi'], categories: ['raid_order66_allowed'] },
];

const persistedGuild = {
  source: 'persisted',
  fetchedAt: '2026-08-18T00:00:00.000Z',
  guild: { id: 'g1', name: 'Persisted Guild', galacticPower: 10_000_000, memberCount: 1 },
  hydration: { requested: 1, hydrated: 1, failed: 0, complete: true },
  persistence: { unitShape: 'compact-progression-v1', sharedHistory: true },
  members: [{
    playerId: 'p1', allyCode: '111222333', name: 'Alpha', galacticPower: 10_000_000, rosterAvailable: true,
    units: ['J1', 'J2', 'J3', 'J4', 'J5'].map((baseId) => ({ baseId, stars: 7, gear: 13, relic: 7, power: 30_000 })),
  }],
};

test('cross-mode Guild member profile accepts compact persisted progression and enriches it from catalog', () => {
  const profile = buildGuildMemberCommandProfile({
    guildSnapshot: persistedGuild,
    catalog,
    operations: { slots: [] },
    targetMember: '111222333',
  });

  assert.ok(profile);
  assert.equal(profile.guild.name, 'Persisted Guild');
  assert.equal(profile.member.characterCount, 5);
  assert.equal(profile.member.galacticLegendCount, 0);
  assert.equal(profile.tw.r7Factions, 1);
  assert.equal(profile.tw.leaderCapableFactions, 1);
  assert.equal(profile.raid.bands.r7, 5);
  assert.equal(profile.raid.fiveCharacterPools.r7, 1);
});
