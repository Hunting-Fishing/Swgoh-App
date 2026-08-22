import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateVariants,
  buildCounterMatrix,
  counterAvailability,
  evidenceClass,
  teamSignature,
} from '../public/gac-counter-matrix-model.js';

const ownRoster = {
  units: [
    { baseId: 'A_LEAD', name: 'Alpha Lead', relic: 7 },
    { baseId: 'A_2', name: 'Alpha Two', relic: 7 },
    { baseId: 'A_3', name: 'Alpha Three', relic: 6 },
    { baseId: 'B_LEAD', name: 'Beta Lead', relic: 5 },
    { baseId: 'B_2', name: 'Beta Two', relic: 5 },
    { baseId: 'B_3', name: 'Beta Three', relic: 5 },
  ],
};

const defenses = [
  { id: 11, zone: 'FRONT-TOP', slot: 0, leaderBaseId: 'ENEMY_A', members: ['ENEMY_A', 'ENEMY_B', 'ENEMY_C'] },
];

const batch = {
  results: [{
    enemyLeaderBaseId: 'ENEMY_A',
    observations: [
      {
        enemyLeaderBaseId: 'ENEMY_A', enemyMembers: ['ENEMY_A', 'ENEMY_B', 'ENEMY_C'],
        counterLeaderBaseId: 'A_LEAD', counterMembers: ['A_LEAD', 'A_2', 'A_3'],
        battles: 100, wins: 93, winRate: 0.93, averageBanners: 54.2, confidence: 0.95,
      },
      {
        enemyLeaderBaseId: 'ENEMY_A', enemyMembers: ['ENEMY_A', 'OTHER_B', 'OTHER_C'],
        counterLeaderBaseId: 'A_LEAD', counterMembers: ['A_LEAD', 'A_2', 'A_3'],
        battles: 200, wins: 100, winRate: 0.5, averageBanners: 49.0, confidence: 0.8,
      },
      {
        enemyLeaderBaseId: 'ENEMY_A', enemyMembers: ['ENEMY_A', 'ENEMY_B', 'ENEMY_C'],
        counterLeaderBaseId: 'B_LEAD', counterMembers: ['B_LEAD', 'B_2', 'B_3'],
        battles: 20, wins: 15, winRate: 0.75, averageBanners: 52.0, confidence: 0.7,
      },
    ],
  }],
};

test('team signatures ignore member ordering while preserving leader identity', () => {
  assert.equal(teamSignature('LEAD', ['B', 'LEAD', 'A']), teamSignature('LEAD', ['A', 'B', 'LEAD']));
  assert.notEqual(teamSignature('OTHER', ['A', 'B', 'LEAD']), teamSignature('LEAD', ['A', 'B', 'LEAD']));
});

test('counter availability requires ownership, non-consumption and minimum relic', () => {
  const variant = { counterMembers: ['A_LEAD', 'A_2', 'A_3'] };
  assert.equal(counterAvailability(variant, ownRoster, [], { minimumRelic: 6 }).available, true);
  assert.equal(counterAvailability(variant, ownRoster, ['A_2'], { minimumRelic: 6 }).reason, 'already-used-or-reserved');
  assert.equal(counterAvailability(variant, ownRoster, [], { minimumRelic: 7 }).reason, 'below-minimum-relic');
  assert.equal(counterAvailability({ counterMembers: ['A_LEAD', 'MISSING'] }, ownRoster, []).reason, 'missing-units');
});

test('matrix prefers exact current defense variants and does not average unrelated leader variants', () => {
  const matrix = buildCounterMatrix({ defenses, batch, ownRoster, minimumBattles: 5, rosterOnly: true, exactDefenseFirst: true });
  assert.equal(matrix.rows.length, 1);
  assert.equal(matrix.rows[0].scope, 'exact-defense');
  const alpha = matrix.rows[0].cells.get('A_LEAD');
  assert.equal(alpha.battles, 100);
  assert.equal(alpha.wins, 93);
  assert.equal(alpha.winRate, 0.93);
  assert.equal(alpha.averageBanners, 54.2);
  assert.equal(alpha.variants.length, 1);
});

test('matrix excludes counters using already consumed or reserved units when rosterOnly is enabled', () => {
  const matrix = buildCounterMatrix({
    defenses,
    batch,
    ownRoster,
    unavailableBaseIds: ['A_2'],
    minimumBattles: 5,
    rosterOnly: true,
    exactDefenseFirst: true,
  });
  assert.equal(matrix.columns.some((column) => column.leaderBaseId === 'A_LEAD'), false);
  assert.equal(matrix.columns.some((column) => column.leaderBaseId === 'B_LEAD'), true);
});

test('minimum relic removes variants the live roster cannot meet', () => {
  const matrix = buildCounterMatrix({ defenses, batch, ownRoster, minimumRelic: 6, rosterOnly: true });
  assert.equal(matrix.columns.some((column) => column.leaderBaseId === 'A_LEAD'), true);
  assert.equal(matrix.columns.some((column) => column.leaderBaseId === 'B_LEAD'), false);
});

test('weighted aggregation uses battle counts for banner and confidence summaries', () => {
  const aggregate = aggregateVariants([
    { battles: 10, wins: 9, averageBanners: 50, confidence: 0.8 },
    { battles: 30, wins: 24, averageBanners: 54, confidence: 1 },
  ]);
  assert.equal(aggregate.battles, 40);
  assert.equal(aggregate.wins, 33);
  assert.equal(aggregate.winRate, 33 / 40);
  assert.equal(aggregate.averageBanners, 53);
  assert.equal(Math.round(aggregate.confidence * 1000) / 1000, 0.95);
});

test('evidence classes are sample-gated before win rate coloring', () => {
  assert.equal(evidenceClass({ battles: 4, winRate: 1 }, 5), 'insufficient');
  assert.equal(evidenceClass({ battles: 10, winRate: 0.95 }, 5), 'elite');
  assert.equal(evidenceClass({ battles: 10, winRate: 0.8 }, 5), 'strong');
  assert.equal(evidenceClass({ battles: 10, winRate: 0.6 }, 5), 'mixed');
  assert.equal(evidenceClass({ battles: 10, winRate: 0.4 }, 5), 'poor');
});
