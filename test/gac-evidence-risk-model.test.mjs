import test from 'node:test';
import assert from 'node:assert/strict';

import {
  gacEvidenceRankingScore,
  gacEvidenceSampleQuality,
  gacFailureRiskBand,
  gacRelicBurdenBand,
  historicalGacEvidenceRisk,
  wilsonLowerBound,
} from '../public/gac-evidence-risk-model.js';

test('Wilson lower bound penalizes tiny perfect samples compared with deep strong evidence', () => {
  const perfectFive = wilsonLowerBound(5, 5);
  const strongHundred = wilsonLowerBound(88, 100);
  assert.equal(perfectFive < strongHundred, true);
  assert.equal(perfectFive > 0.5 && perfectFive < 0.8, true);
  assert.equal(strongHundred > 0.8, true);
});

test('sample and failure-risk bands remain explicit evidence labels', () => {
  assert.equal(gacEvidenceSampleQuality(0), 'none');
  assert.equal(gacEvidenceSampleQuality(4), 'very-low');
  assert.equal(gacEvidenceSampleQuality(12), 'low');
  assert.equal(gacEvidenceSampleQuality(30), 'moderate');
  assert.equal(gacEvidenceSampleQuality(70), 'strong');
  assert.equal(gacEvidenceSampleQuality(150), 'deep');

  assert.equal(gacFailureRiskBand(null, 0), 'unknown');
  assert.equal(gacFailureRiskBand(0.95, 3), 'insufficient');
  assert.equal(gacFailureRiskBand(0.92, 100), 'very-low');
  assert.equal(gacFailureRiskBand(0.82, 100), 'low');
  assert.equal(gacFailureRiskBand(0.7, 30), 'moderate');
  assert.equal(gacFailureRiskBand(0.55, 20), 'high');
  assert.equal(gacFailureRiskBand(0.4, 20), 'critical');
});

test('historical risk exposes undersize and relic burden without converting them into current-board truth', () => {
  const result = historicalGacEvidenceRisk({
    enemyMembers: ['D1','D2','D3','D4','D5'],
    counterMembers: ['A1','A2','A3','A4'],
    battles: 80,
    wins: 72,
    confidence: 0.9,
    averageRelicDelta: 1.4,
    relicDeltaSamples: 30,
  });

  assert.equal(result.undersizeCount, 1);
  assert.equal(result.relicBurdenBand, 'elevated');
  assert.equal(result.sampleQuality, 'strong');
  assert.equal(result.observedWinRate, 0.9);
  assert.equal(result.observedWinRateLowerBound90 < result.observedWinRate, true);
  assert.match(result.evidenceBoundary, /not a predicted win probability/i);
});

test('relic burden labels distinguish historical over-investment from efficient wins', () => {
  assert.equal(gacRelicBurdenBand(null, 0), 'unknown');
  assert.equal(gacRelicBurdenBand(2.2, 10), 'high');
  assert.equal(gacRelicBurdenBand(1.1, 10), 'elevated');
  assert.equal(gacRelicBurdenBand(0.5, 10), 'slight');
  assert.equal(gacRelicBurdenBand(0, 10), 'neutral');
  assert.equal(gacRelicBurdenBand(-1, 10), 'efficient');
});

test('ranking score prefers deeper safer evidence over tiny perfect evidence', () => {
  const tinyPerfect = gacEvidenceRankingScore({ battles:5, wins:5, winRate:1, confidence:1, averageBanners:55 });
  const deepStrong = gacEvidenceRankingScore({ battles:100, wins:88, winRate:.88, confidence:.9, averageBanners:53 });
  assert.equal(deepStrong > tinyPerfect, true);
});
