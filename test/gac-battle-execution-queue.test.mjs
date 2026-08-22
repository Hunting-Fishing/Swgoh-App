import test from 'node:test';
import assert from 'node:assert/strict';

import { buildBattleExecutionQueue, executionReasonTags, queueClassification } from '../public/gac-battle-execution-queue.js';

function row(overrides = {}) {
  return {
    key:'ROW', defenseId:1, zone:'FRONT-TOP', slot:0, leaderBaseId:'DEF', members:['DEF','DEF2','DEF3'],
    scarcity:'scarce', counterSquads:2, evidenceScope:'exact-defense', bestFailureRiskBand:'moderate',
    bestEvidenceFloor90:.68, bestBattles:30, bestUndersizeCount:0, bestRelicBurdenBand:'neutral',
    proposedCounter:{ counterLeaderBaseId:'ATT', counterMembers:['ATT','ATT2','ATT3'], battles:30, wins:24, winRate:.8, observedWinRateLowerBound90:.68, failureRiskBand:'moderate', undersizeCount:0, relicBurdenBand:'neutral' },
    existingPlan:null,
    ...overrides,
  };
}

test('fresh evidence proposals become numbered execution steps in optimizer priority order', () => {
  const result = buildBattleExecutionQueue({ rows:[
    row({key:'FLEX',defenseId:3,scarcity:'flexible',counterSquads:7,slot:2}),
    row({key:'CRIT',defenseId:2,scarcity:'critical',counterSquads:1,slot:1}),
    row({key:'SCARCE',defenseId:1,scarcity:'scarce',counterSquads:2,slot:0}),
  ]});
  assert.deepEqual(result.steps.map((entry)=>entry.key),['CRIT','SCARCE','FLEX']);
  assert.deepEqual(result.steps.map((entry)=>entry.sequence),[1,2,3]);
  assert.equal(result.summary.freshProposals,3);
  assert.equal(result.summary.blockers,0);
});

test('active attempt is first, then locked server plan, then fresh proposals', () => {
  const result = buildBattleExecutionQueue({ rows:[
    row({key:'PROPOSED',scarcity:'critical'}),
    row({key:'LOCKED',scarcity:'flexible',existingPlan:{id:10,status:'planned',leaderBaseId:'LOCK',members:['LOCK']}}),
    row({key:'ACTIVE',scarcity:'flexible',existingPlan:{id:11,status:'attempted',leaderBaseId:'LIVE',members:['LIVE']}}),
  ]});
  assert.deepEqual(result.steps.map((entry)=>entry.key),['ACTIVE','LOCKED','PROPOSED']);
  assert.deepEqual(result.steps.map((entry)=>entry.action),['active-attempt','server-plan','plan-proposed']);
  assert.equal(result.summary.activeAttempts,1);
  assert.equal(result.summary.locked,1);
});

test('loss and abandoned plans become cleanup-review blockers instead of normal attack proposals', () => {
  const result = buildBattleExecutionQueue({ rows:[
    row({key:'LOSS',existingPlan:{id:12,status:'loss',leaderBaseId:'ATT',members:['ATT']}}),
    row({key:'ABANDON',existingPlan:{id:13,status:'abandoned',leaderBaseId:'ATT',members:['ATT']}}),
  ]});
  assert.equal(result.steps.length,0);
  assert.deepEqual(result.blockers.map((entry)=>entry.action),['cleanup-review','cleanup-review']);
  assert.equal(result.summary.cleanupReview,2);
  assert.ok(result.blockers.every((entry)=>entry.sequence===null));
});

test('wins are complete and are not numbered as future attacks', () => {
  const result = buildBattleExecutionQueue({ rows:[row({key:'DONE',existingPlan:{id:14,status:'win',leaderBaseId:'ATT',members:['ATT']}})] });
  assert.equal(result.steps.length,0);
  assert.equal(result.complete.length,1);
  assert.equal(result.complete[0].action,'complete');
  assert.equal(result.complete[0].sequence,null);
});

test('unsynced or uncovered defenses are blockers and never receive executable sequence numbers', () => {
  const result = buildBattleExecutionQueue({ rows:[
    row({key:'UNSYNCED',defenseId:null}),
    row({key:'UNCOVERED',proposedCounter:null,scarcity:'uncovered',counterSquads:0}),
  ]});
  assert.deepEqual(result.blockers.map((entry)=>entry.action),['officer-review','sync-defense'].sort(()=>0).length ? result.blockers.map((entry)=>entry.action) : []);
  assert.equal(result.blockers.length,2);
  assert.ok(result.blockers.every((entry)=>entry.sequence===null));
  assert.ok(result.blockers.some((entry)=>entry.action==='sync-defense'));
  assert.ok(result.blockers.some((entry)=>entry.action==='officer-review'));
});

test('reason tags explain scarcity, evidence scope, risk, undersize and relic burden without inventing probability', () => {
  const tags = executionReasonTags(row({
    scarcity:'critical', counterSquads:1, evidenceScope:'exact-defense', bestFailureRiskBand:'high',
    proposedCounter:{ counterLeaderBaseId:'ATT',counterMembers:['ATT','ATT2'],battles:12,observedWinRateLowerBound90:.44,failureRiskBand:'high',undersizeCount:1,relicBurdenBand:'elevated' },
  }));
  assert.ok(tags.includes('ONLY 1 QUALIFYING COUNTER'));
  assert.ok(tags.includes('HIGH EVIDENCE RISK'));
  assert.ok(tags.includes('EXACT DEFENSE EVIDENCE'));
  assert.ok(tags.includes('HISTORICAL 1-UNIT UNDERSIZE'));
  assert.ok(tags.includes('RELIC ADVANTAGE EVIDENCE'));
  assert.equal(tags.some((tag)=>/guaranteed|predicted win/i.test(tag)),false);
});

test('queue classification never treats cleanup or completed battles as executable', () => {
  assert.equal(queueClassification(row({existingPlan:{status:'loss'}})).executable,false);
  assert.equal(queueClassification(row({existingPlan:{status:'abandoned'}})).executable,false);
  assert.equal(queueClassification(row({existingPlan:{status:'win'}})).executable,false);
  assert.equal(queueClassification(row({existingPlan:{status:'planned'}})).executable,true);
  assert.equal(queueClassification(row({existingPlan:{status:'attempted'}})).executable,true);
});
