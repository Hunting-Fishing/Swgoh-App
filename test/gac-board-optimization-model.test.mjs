import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBoardOptimization, priorityRows, roundPlanSummary, rowCandidateSummary } from '../public/gac-board-optimization-model.js';

const ownRoster = {
  units: [
    { baseId:'A', relic:7 }, { baseId:'A2', relic:7 }, { baseId:'A3', relic:7 },
    { baseId:'B', relic:5 }, { baseId:'B2', relic:5 }, { baseId:'B3', relic:5 },
    { baseId:'C', relic:7 }, { baseId:'C2', relic:7 }, { baseId:'C3', relic:7 },
  ],
};
const defenses = [
  { id:1, zone:'FRONT-TOP', slot:0, leaderBaseId:'D1', members:['D1','D1A','D1B'] },
  { id:2, zone:'FRONT-TOP', slot:1, leaderBaseId:'D2', members:['D2','D2A','D2B'] },
];
const batch = {
  results: [
    { enemyLeaderBaseId:'D1', observations:[
      { enemyLeaderBaseId:'D1', enemyMembers:['D1','D1A','D1B'], counterLeaderBaseId:'A', counterMembers:['A','A2','A3'], battles:80, wins:72, winRate:.9, averageBanners:54, confidence:.9 },
      { enemyLeaderBaseId:'D1', enemyMembers:['D1','D1A','D1B'], counterLeaderBaseId:'B', counterMembers:['B','B2','B3'], battles:20, wins:15, winRate:.75, averageBanners:51, confidence:.7 },
    ]},
    { enemyLeaderBaseId:'D2', observations:[
      { enemyLeaderBaseId:'D2', enemyMembers:['D2','D2A','D2B'], counterLeaderBaseId:'A', counterMembers:['A','A2','A3'], battles:50, wins:48, winRate:.96, averageBanners:53, confidence:.9 },
      { enemyLeaderBaseId:'D2', enemyMembers:['D2','D2A','D2B'], counterLeaderBaseId:'C', counterMembers:['C','C2','C3'], battles:25, wins:20, winRate:.8, averageBanners:52, confidence:.8 },
    ]},
  ],
};

test('whole-board optimizer allocates unique counters and reports coverage/banners', () => {
  const result = buildBoardOptimization({ defenses, batch, ownRoster, minimumBattles:5 });
  assert.equal(result.totalDefenses, 2);
  assert.equal(result.coveredDefenses, 2);
  assert.equal(result.coverageRate, 1);
  assert.equal(result.projectedUniqueAttackers, 6);
  assert.equal(Number.isFinite(result.projectedBanners), true);
  const assigned = result.allocation.assignments.map((row) => new Set(row.counterMembers));
  for (const id of assigned[0]) assert.equal(assigned[1].has(id), false);
});

test('reserved or consumed attackers change whole-board coverage instead of being reused', () => {
  const result = buildBoardOptimization({ defenses, batch, ownRoster, unavailableBaseIds:['A2'], minimumBattles:5 });
  assert.equal(result.coveredDefenses, 2);
  assert.equal(result.allocation.usedBaseIds.includes('A'), false);
  assert.equal(result.allocation.usedBaseIds.includes('A2'), false);
});

test('candidate scarcity distinguishes uncovered, critical and flexible rows', () => {
  assert.equal(rowCandidateSummary({ variants:[] }, 5).scarcity, 'uncovered');
  assert.equal(rowCandidateSummary({ variants:[{ battles:10, availability:{available:true}, counterLeaderBaseId:'A', counterMembers:['A','A2','A3'], winRate:.9 }] }, 5).scarcity, 'critical');
  const many = Array.from({ length:7 }, (_, index) => ({ battles:10, availability:{available:true}, counterLeaderBaseId:`L${index}`, counterMembers:[`L${index}`,`M${index}`], winRate:.7 }));
  assert.equal(rowCandidateSummary({ variants:many }, 5).scarcity, 'flexible');
});

test('priority rows put uncovered and one-counter defenses first', () => {
  const rows = priorityRows({ rows:[
    { key:'FLEX', scarcity:'flexible', counterSquads:9, bestWinRate:.99, slot:0 },
    { key:'CRIT', scarcity:'critical', counterSquads:1, bestWinRate:.9, slot:1 },
    { key:'NONE', scarcity:'uncovered', counterSquads:0, bestWinRate:0, slot:2 },
  ]});
  assert.deepEqual(rows.map((row) => row.key), ['NONE','CRIT','FLEX']);
});

test('round plan summary preserves status counts and used attacker set', () => {
  const result = roundPlanSummary({ assignments:[
    { status:'planned', members:['A','A2','A3'] },
    { status:'win', members:['B','B2','B3'], banners:55, attemptLog:[{ members:['B','B2','B3'], banners:55 }] },
    { status:'loss', members:['C','C2','C3'], attemptLog:[{ members:['C','C2','C3'] }] },
  ]});
  assert.equal(result.statuses.planned, 1);
  assert.equal(result.statuses.win, 1);
  assert.equal(result.statuses.loss, 1);
  assert.equal(result.usedBaseIds.length, 9);
  assert.equal(result.recordedBannerSamples >= 1, true);
});

test('existing server plan is shown separately from evidence proposal', () => {
  const attackPlan = { assignments:[{ id:77, defenseId:1, status:'planned', leaderBaseId:'B', members:['B','B2','B3'], datacron:{ id:'dc-1' } }] };
  const result = buildBoardOptimization({ defenses, batch, ownRoster, attackPlan, minimumBattles:5 });
  const row = result.rows.find((entry) => entry.defenseId === 1);
  assert.equal(row.existingPlan.id, 77);
  assert.equal(row.existingPlan.status, 'planned');
  assert.equal(row.existingPlan.datacronId, 'dc-1');
});
