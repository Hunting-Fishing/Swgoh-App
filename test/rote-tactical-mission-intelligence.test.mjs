import test from 'node:test';
import assert from 'node:assert/strict';

import { roteTacticalMissionNode } from '../public/rote-tactical-node-model.js';
import {
  buildRoteTacticalMissionIntelligence,
  ROTE_TACTICAL_EVIDENCE_CLASS,
} from '../public/rote-tactical-mission-intelligence.js';

const team = (fifth = 'NINTHSISTER') => [
  { slot: 0, baseId: 'GRANDINQUISITOR', relic: 7, speed: 330 },
  { slot: 1, baseId: 'SECONDSISTER', relic: 7 },
  { slot: 2, baseId: 'FIFTHBROTHER', relic: 7 },
  { slot: 3, baseId: 'SEVENTHSISTER', relic: 7 },
  { slot: 4, baseId: fifth, relic: 7 },
];

function attempt(playerId, result, fifth = 'NINTHSISTER') {
  return {
    guildId: 'guild-1',
    eventId: 'event-1',
    phase: 'P3',
    planetId: 'tatooine',
    missionId: 'tatooine-reva',
    playerId,
    allyCode: playerId === 'p1' ? '123456789' : '',
    team: team(fifth),
    result,
  };
}

test('mission intelligence keeps verified game data, community guidance and observed Guild/player evidence as separate layers', () => {
  const node = roteTacticalMissionNode('tatooine', 'tatooine-reva', { catalog: { units: [] } });
  const attempts = [
    attempt('p1', '2_of_2'),
    attempt('p1', '2_of_2'),
    attempt('p2', '2_of_2'),
    attempt('p3', '2_of_2'),
    attempt('p4', '0_of_2'),
  ];

  const intelligence = buildRoteTacticalMissionIntelligence({
    node,
    attempts,
    player: { playerId: 'p1' },
    samplePolicy: { minimumRateSample: 5, adequateSample: 20 },
  });

  assert.ok(intelligence);
  assert.equal(intelligence.missionId, 'tatooine-reva');
  assert.equal(intelligence.evidence.official.class, ROTE_TACTICAL_EVIDENCE_CLASS.GAME_DATA);
  assert.equal(intelligence.evidence.official.verifiedEntry, true);
  assert.equal(intelligence.evidence.community.class, ROTE_TACTICAL_EVIDENCE_CLASS.COMMUNITY);
  assert.equal(intelligence.evidence.guild.class, ROTE_TACTICAL_EVIDENCE_CLASS.GUILD);
  assert.equal(intelligence.evidence.player.class, ROTE_TACTICAL_EVIDENCE_CLASS.PLAYER);

  assert.equal(intelligence.observed.guild.attempts, 5);
  assert.equal(intelligence.observed.guild.observedCompletionRate, 80);
  assert.equal(intelligence.observed.guild.predictiveProbability, null);
  assert.equal(intelligence.observed.player.attempts, 2);
  assert.equal(intelligence.observed.player.observedCompletionRate, null, 'personal sample is intentionally too small for a displayed rate');
  assert.match(intelligence.evidenceBoundary, /remain separate/i);
});

test('different squad variants remain separate in the mission intelligence evidence layer', () => {
  const node = roteTacticalMissionNode('tatooine', 'tatooine-reva', { catalog: { units: [] } });
  const attempts = [
    attempt('p1', '2_of_2', 'NINTHSISTER'),
    attempt('p2', '2_of_2', 'NINTHSISTER'),
    attempt('p3', '0_of_2', 'EIGHTHBROTHER'),
  ];

  const intelligence = buildRoteTacticalMissionIntelligence({ node, attempts, samplePolicy: { minimumRateSample: 2 } });

  assert.equal(intelligence.observed.bySquad.length, 2);
  assert.match(intelligence.observed.bySquad[0].squadSignature, /NINTHSISTER/);
  assert.equal(intelligence.observed.bySquad[0].observedCompletionRate, 100);
  assert.match(intelligence.observed.bySquad[1].squadSignature, /EIGHTHBROTHER/);
  assert.equal(intelligence.observed.bySquad[1].observedCompletionRate, null);
});
