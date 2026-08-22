import test from 'node:test';
import assert from 'node:assert/strict';

import {
  allocateNonOverlapping,
  evidenceVariant,
  variantScore,
} from '../public/gac-counter-matrix-model.js';

test('counter evidence variants expose conservative floor, sample quality, undersize and relic burden', () => {
  const variant = evidenceVariant({
    enemyLeaderBaseId:'DEF',
    enemyMembers:['D1','D2','D3','D4','D5'],
    counterLeaderBaseId:'ATK',
    counterMembers:['A1','A2','A3','A4'],
    battles:80,
    wins:72,
    winRate:.9,
    confidence:.9,
    averageRelicDelta:1.2,
    relicDeltaSamples:25,
  });

  assert.equal(variant.sampleQuality, 'strong');
  assert.equal(variant.undersizeCount, 1);
  assert.equal(variant.relicBurdenBand, 'elevated');
  assert.equal(variant.observedWinRateLowerBound90 < variant.winRate, true);
  assert.notEqual(variant.failureRiskBand, 'unknown');
});

test('risk-aware score prefers deep strong evidence over tiny perfect evidence', () => {
  const tinyPerfect = evidenceVariant({
    enemyMembers:['D1','D2','D3'], counterMembers:['A1','A2','A3'],
    battles:5, wins:5, winRate:1, confidence:1, averageBanners:55,
  });
  const deepStrong = evidenceVariant({
    enemyMembers:['D1','D2','D3'], counterMembers:['B1','B2','B3'],
    battles:100, wins:88, winRate:.88, confidence:.9, averageBanners:53,
  });
  assert.equal(variantScore(deepStrong) > variantScore(tinyPerfect), true);
});

test('non-overlap allocation carries risk metadata for each proposed counter', () => {
  const available = { available:true };
  const rows = [{
    key:'FRONT-TOP|0', defenseId:1, leaderBaseId:'DEF',
    variants:[{
      enemyMembers:['D1','D2','D3'],
      counterLeaderBaseId:'ATK', counterMembers:['A1','A2','A3'],
      battles:100, wins:88, winRate:.88, averageBanners:53, confidence:.9,
      averageRelicDelta:0, relicDeltaSamples:50, availability:available,
    }],
  }];
  const allocation = allocateNonOverlapping(rows, 5);
  const assignment = allocation.assignments[0];
  assert.equal(Number.isFinite(assignment.observedWinRateLowerBound90), true);
  assert.equal(typeof assignment.failureRiskBand, 'string');
  assert.equal(typeof assignment.sampleQuality, 'string');
  assert.equal(Number.isFinite(assignment.evidenceRankingScore), true);
});
