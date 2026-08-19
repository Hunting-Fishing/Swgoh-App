import test from 'node:test';
import assert from 'node:assert/strict';

import {
  aggregateTbMissionAttempts,
  aggregateTbMissionAttemptsBySquad,
  normalizeTbMissionAttemptOutcome,
  normalizedTbSquadSignature,
  TB_ATTEMPT_OUTCOME,
} from '../public/tb-mission-attempt-evidence.js';

const team = (leader = 'LEADER', fifth = 'FIFTH') => [
  { slot: 0, baseId: leader, relic: 7, speed: 320 },
  { slot: 1, baseId: 'A', relic: 7 },
  { slot: 2, baseId: 'B', relic: 7 },
  { slot: 3, baseId: 'C', relic: 7 },
  { slot: 4, baseId: fifth, relic: 7 },
];

function attempt(result, overrides = {}) {
  return {
    guildId: 'guild-1',
    eventId: 'event-1',
    phase: 'P3',
    planetId: 'tatooine',
    missionId: 'tatooine-reva',
    playerId: `player-${Math.random()}`,
    team: team(),
    result,
    ...overrides,
  };
}

test('normalizes explicit wave results and wave-count fallbacks without inventing a success', () => {
  assert.equal(normalizeTbMissionAttemptOutcome({ result: '2_of_2' }), TB_ATTEMPT_OUTCOME.COMPLETE);
  assert.equal(normalizeTbMissionAttemptOutcome({ result: '1_of_2' }), TB_ATTEMPT_OUTCOME.PARTIAL);
  assert.equal(normalizeTbMissionAttemptOutcome({ result: '0_of_2' }), TB_ATTEMPT_OUTCOME.FAILED);
  assert.equal(normalizeTbMissionAttemptOutcome({ result: 'SKIPPED' }), TB_ATTEMPT_OUTCOME.SKIPPED);
  assert.equal(normalizeTbMissionAttemptOutcome({ wavesCompleted: 1, wavesTotal: 2 }), TB_ATTEMPT_OUTCOME.PARTIAL);
  assert.equal(normalizeTbMissionAttemptOutcome({}), TB_ATTEMPT_OUTCOME.UNKNOWN);
});

test('squad signature keeps the leader identity while normalizing non-leader member order', () => {
  const first = normalizedTbSquadSignature(team('GRANDINQUISITOR', 'NINTHSISTER'));
  const reordered = [team('GRANDINQUISITOR', 'NINTHSISTER')[0], team()[3], team()[1], team()[4], team()[2]];
  const second = normalizedTbSquadSignature(reordered);

  assert.equal(first, 'GRANDINQUISITOR|A|B|C|NINTHSISTER');
  assert.equal(second, 'GRANDINQUISITOR|A|B|C|FIFTH');
});

test('small samples expose raw attempts but withhold an observed completion percentage', () => {
  const result = aggregateTbMissionAttempts([
    attempt('2_of_2'),
    attempt('2_of_2'),
    attempt('1_of_2'),
    attempt('0_of_2'),
  ], { minimumRateSample: 5 });

  assert.equal(result.attempts, 4);
  assert.equal(result.complete, 2);
  assert.equal(result.partial, 1);
  assert.equal(result.failed, 1);
  assert.equal(result.observedCompletionRate, null);
  assert.equal(result.sampleLabel, 'RAW ATTEMPTS ONLY');
  assert.equal(result.predictiveProbability, null);
});

test('adequate-for-display sample produces an explicitly observed completion rate, not predicted win chance', () => {
  const result = aggregateTbMissionAttempts([
    attempt('2_of_2'),
    attempt('2_of_2'),
    attempt('2_of_2'),
    attempt('2_of_2'),
    attempt('0_of_2'),
  ], { minimumRateSample: 5, adequateSample: 20 });

  assert.equal(result.attempts, 5);
  assert.equal(result.observedCompletionRate, 80);
  assert.equal(result.sampleLabel, 'LOW SAMPLE — OBSERVED RATE');
  assert.equal(result.predictiveProbability, null);
  assert.match(result.evidenceBoundary, /not a predicted win probability/i);
});

test('skipped and unknown records never dilute the observed completion denominator', () => {
  const rows = [
    attempt('2_of_2'),
    attempt('2_of_2'),
    attempt('2_of_2'),
    attempt('2_of_2'),
    attempt('0_of_2'),
    attempt('skipped'),
    attempt(''),
  ];
  const result = aggregateTbMissionAttempts(rows, { minimumRateSample: 5 });

  assert.equal(result.recorded, 7);
  assert.equal(result.attempts, 5);
  assert.equal(result.skipped, 1);
  assert.equal(result.unknown, 1);
  assert.equal(result.observedCompletionRate, 80);
});

test('mission evidence can be compared by normalized squad signature without merging different fifth slots', () => {
  const rows = [
    attempt('2_of_2', { team: team('GRANDINQUISITOR', 'NINTHSISTER') }),
    attempt('2_of_2', { team: team('GRANDINQUISITOR', 'NINTHSISTER') }),
    attempt('0_of_2', { team: team('GRANDINQUISITOR', 'SEVENTHSISTER') }),
  ];
  const groups = aggregateTbMissionAttemptsBySquad(rows, { minimumRateSample: 2 });

  assert.equal(groups.length, 2);
  assert.equal(groups[0].attempts, 2);
  assert.match(groups[0].squadSignature, /NINTHSISTER/);
  assert.equal(groups[0].observedCompletionRate, 100);
  assert.equal(groups[1].attempts, 1);
  assert.match(groups[1].squadSignature, /SEVENTHSISTER/);
  assert.equal(groups[1].observedCompletionRate, null);
});
