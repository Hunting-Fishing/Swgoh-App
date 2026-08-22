import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeGuildRoster,
  normalizedMemberPortrait,
  normalizedMemberTitle,
  profileIdentityValue,
} from '../guild-roster-service.mjs';

test('live Guild portrait normalization accepts string and object game shapes', () => {
  assert.equal(normalizedMemberPortrait({ playerPortrait: 'PLAYERPORTRAIT_JEDIMASTER' }), 'PLAYERPORTRAIT_JEDIMASTER');
  assert.equal(normalizedMemberPortrait({ playerPortrait: { id: 'PLAYERPORTRAIT_JEDIMASTER' } }), 'PLAYERPORTRAIT_JEDIMASTER');
  assert.equal(normalizedMemberPortrait({ selectedPlayerPortrait: { portraitId: 'playerportrait_default' } }), 'PLAYERPORTRAIT_DEFAULT');
  assert.equal(normalizedMemberPortrait({ playerPortrait: { id: 'not-a-portrait' } }), '');
});

test('live Guild title normalization accepts string and object game shapes without object-string leakage', () => {
  assert.equal(normalizedMemberTitle({ playerTitle: 'The Chosen One' }), 'The Chosen One');
  assert.equal(normalizedMemberTitle({ playerTitle: { name: 'The Chosen One' } }), 'The Chosen One');
  assert.equal(normalizedMemberTitle({ selectedPlayerTitle: { id: 'PLAYERTITLE_TEST' } }), 'PLAYERTITLE_TEST');
  assert.equal(profileIdentityValue({ id: 'PLAYERPORTRAIT_DEFAULT' }, ['id']), 'PLAYERPORTRAIT_DEFAULT');
  assert.equal(normalizedMemberTitle({ playerTitle: {} }), '');
});

test('Guild roster normalization preserves all member data while canonicalizing portrait/title identity', () => {
  const body = {
    source: 'live',
    guild: { id: 'g1', name: 'Guild', memberCount: 1, galacticPower: 0 },
    members: [{
      playerId: 'p1',
      name: 'Alpha',
      galacticPower: 0,
      characterGalacticPower: 6000000,
      shipGalacticPower: 4000000,
      memberLevel: 4,
      selectedPlayerPortrait: { id: 'PLAYERPORTRAIT_JEDIMASTER' },
      selectedPlayerTitle: { name: 'Guild Master' },
      units: [{ baseId: 'UNITA' }],
    }],
  };
  const normalized = normalizeGuildRoster(body);
  assert.equal(normalized.members[0].galacticPower, 10000000);
  assert.equal(normalized.guild.galacticPower, 10000000);
  assert.equal(normalized.members[0].memberLevel, 4);
  assert.equal(normalized.members[0].playerPortrait, 'PLAYERPORTRAIT_JEDIMASTER');
  assert.equal(normalized.members[0].playerTitle, 'Guild Master');
  assert.deepEqual(normalized.members[0].units, [{ baseId: 'UNITA' }]);
});
