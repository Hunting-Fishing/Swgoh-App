import test from 'node:test';
import assert from 'node:assert/strict';

import { buildBoardOptimization, priorityRows, riskSummary, rowCandidateSummary } from '../public/gac-board-optimization-model.js';

const available = { available:true };

test('row candidate selection prefers conservative evidence quality over tiny perfect win rate', () => {
  const summary = rowCandidateSummary({ variants:[
    { enemyMembers:['D1','D2','D3'], counterLeaderBaseId:'TINY', counterMembers:['T1','T2','T3'], battles:5, wins:5, winRate:1, confidence:1, averageBanners:55, availability:available },
    { enemyMembers:['D1','D2','D3'], counterLeaderBaseId:'DEEP', counterMembers:['A1','A2','A3'], battles:100, wins:88, winRate:.88, confidence:.9, averageBanners:53, availability:available },
  ]}, 5);

  assert.equal(summary.best.counterLeaderBaseId, 'DEEP');
  assert.equal(summary.bestRisk.sampleQuality, 'deep');
  assert.equal(summary.bestRisk.observedWinRateLowerBound90 > .8, true);
});

test('board risk summary separates high-risk, undersize and relic-burden evidence', () => {
  const summary = riskSummary([
    { battles:100, wins:95, winRate:.95, observedWinRateLowerBound90:.90, failureRiskBand:'very-low', undersizeCount:1, relicBurdenBand:'neutral' },
    { battles:20, wins:12, winRate:.6, observedWinRateLowerBound90:.42, failureRiskBand:'critical', undersizeCount:0, relicBurdenBand:'high' },
  ]);

  assert.equal(summary.highOrCritical, 1);
  assert.equal(summary.undersizeAttacks, 1);
  assert.equal(summary.undersizeSlots, 1);
  assert.equal(summary.relicBurdenAttacks, 1);
  assert.equal(Number.isFinite(summary.weightedEvidenceFloor90), true);
});

test('whole-board optimization exposes evidence floor and proposed risk metadata', () => {
  const ownRoster = { units:[
    { baseId:'A1', relic:7 }, { baseId:'A2', relic:7 }, { baseId:'A3', relic:7 },
  ]};
  const defenses = [{ id:1, zone:'FRONT-TOP', slot:0, leaderBaseId:'D1', members:['D1','D2','D3'] }];
  const batch = { results:[{
    enemyLeaderBaseId:'D1',
    observations:[{
      enemyLeaderBaseId:'D1', enemyMembers:['D1','D2','D3'],
      counterLeaderBaseId:'A1', counterMembers:['A1','A2','A3'],
      battles:100, wins:88, winRate:.88, averageBanners:53, confidence:.9,
      averageRelicDelta:1.2, relicDeltaSamples:50,
    }],
  }]};

  const result = buildBoardOptimization({ defenses, batch, ownRoster, minimumBattles:5 });
  assert.equal(result.coveredDefenses, 1);
  assert.equal(Number.isFinite(result.projectedEvidenceFloor90), true);
  assert.match(result.evidenceBoundary, /not guaranteed/i);
  assert.equal(typeof result.rows[0].bestFailureRiskBand, 'string');
  assert.equal(Number.isFinite(result.rows[0].bestEvidenceFloor90), true);
  assert.equal(typeof result.allocation.assignments[0].failureRiskBand, 'string');
});

test('priority sorting raises risky scarce rows before safer rows of equal scarcity', () => {
  const rows = priorityRows({ rows:[
    { key:'SAFE', scarcity:'scarce', bestFailureRiskBand:'low', counterSquads:2, bestEvidenceFloor90:.85, slot:0 },
    { key:'RISK', scarcity:'scarce', bestFailureRiskBand:'high', counterSquads:2, bestEvidenceFloor90:.55, slot:1 },
  ]});
  assert.deepEqual(rows.map((row) => row.key), ['RISK','SAFE']);
});
