import test from 'node:test';
import assert from 'node:assert/strict';
import { eligiblePredictions, reviewTarget } from '../public/gac-scouting-history-model.js';

const snapshot = {
  format: '5v5',
  rule: {
    territories: [
      { value: 'FRONT-TOP', capacity: 3 },
      { value: 'FRONT-BOTTOM', capacity: 2 },
      { value: 'BACK-BOTTOM', capacity: 2 },
      { value: 'BACK-TOP', capacity: 2 },
    ],
  },
  defenses: [
    { zone: 'FRONT-TOP', slot: 0, leaderBaseId: 'USED', members: ['USED'] },
  ],
};

test('scouting model only exposes predictions for the current GAC format', () => {
  const report = {
    defensePrediction: {
      predictions: [
        { format: '5v5', leaderBaseId: 'A', members: ['A', 'B', 'C', 'D', 'E'] },
        { format: '3v3', leaderBaseId: 'X', members: ['X', 'Y', 'Z'] },
      ],
    },
  };
  const rows = eligiblePredictions(report, snapshot);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].leaderBaseId, 'A');
});

test('review target prefers an open verified slot tendency', () => {
  const prediction = {
    slotTendencies: [
      { zone: 'FRONT-TOP', slot: 0, verifiedBoards: 3 },
      { zone: 'FRONT-TOP', slot: 1, verifiedBoards: 2 },
    ],
    zoneTendencies: [{ zone: 'FRONT-BOTTOM', verifiedBoards: 5 }],
  };
  const target = reviewTarget(prediction, snapshot);
  assert.deepEqual(target, { zone: 'FRONT-TOP', slot: 1, source: 'verified-slot-tendency', samples: 2 });
});

test('review target falls back to first open slot in a verified zone tendency', () => {
  const prediction = {
    slotTendencies: [],
    zoneTendencies: [{ zone: 'FRONT-TOP', verifiedBoards: 4 }],
  };
  const target = reviewTarget(prediction, snapshot);
  assert.equal(target.zone, 'FRONT-TOP');
  assert.equal(target.slot, 1);
  assert.equal(target.source, 'verified-zone-tendency');
});

test('fleet territory is never staged through squad scouting', () => {
  const prediction = {
    slotTendencies: [{ zone: 'BACK-TOP', slot: 0, verifiedBoards: 9 }],
    zoneTendencies: [{ zone: 'BACK-TOP', verifiedBoards: 9 }],
  };
  assert.equal(reviewTarget(prediction, snapshot), null);
});
