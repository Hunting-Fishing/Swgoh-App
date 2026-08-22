import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStagingPlan, exactSlotTarget, predictionSignature, zoneFallbackTarget } from '../public/gac-scouting-history-model.js';

const snapshot = {
  format:'5v5',
  rule:{ format:'5v5', territories:[
    { value:'FRONT-TOP', capacity:3 },
    { value:'FRONT-BOTTOM', capacity:2 },
    { value:'BACK-BOTTOM', capacity:2 },
    { value:'BACK-TOP', capacity:2 },
  ]},
  defenses:[{ zone:'FRONT-TOP', slot:0, leaderBaseId:'CURRENT', members:['CURRENT','C2','C3','C4','C5'] }],
};

const exact = {
  format:'5v5', leaderBaseId:'LEIA', members:['LEIA','R2','DROGAN','OLD_BEN','MON_MOTHMA'], priorityRank:1,
  verifiedHistoricalBoards:3, battleObservedMatchups:8,
  slotTendencies:[{ zone:'FRONT-TOP', slot:1, verifiedBoards:2 }],
  zoneTendencies:[{ zone:'FRONT-TOP', verifiedBoards:3 }],
};
const zoneOnly = {
  format:'5v5', leaderBaseId:'JABBA', members:['JABBA','KRR','BOUSHH','SKIFF','EMBO'], priorityRank:2,
  verifiedHistoricalBoards:2, battleObservedMatchups:4,
  slotTendencies:[], zoneTendencies:[{ zone:'FRONT-BOTTOM', verifiedBoards:2 }],
};
const report = { defensePrediction:{ predictions:[exact, zoneOnly] } };

test('exact historical slot evidence maps only to an open valid current slot', () => {
  assert.deepEqual(exactSlotTarget(exact, snapshot), { zone:'FRONT-TOP', slot:1, source:'verified-slot-tendency', samples:2, exactSlot:true });
  const occupied = { ...snapshot, defenses:[...snapshot.defenses,{ zone:'FRONT-TOP', slot:1, leaderBaseId:'X', members:['X'] }] };
  assert.equal(exactSlotTarget(exact, occupied), null);
});

test('zone-only fallback chooses an open slot but is explicitly not exact historical slot truth', () => {
  const target = zoneFallbackTarget(zoneOnly, snapshot, new Set());
  assert.equal(target.zone, 'FRONT-BOTTOM');
  assert.equal(target.slot, 0);
  assert.equal(target.exactSlot, false);
  assert.equal(target.source, 'verified-zone-tendency');
});

test('staging defaults to exact-slot evidence only', () => {
  const plan = buildStagingPlan(report, snapshot);
  assert.equal(plan.staged.length, 1);
  assert.equal(plan.staged[0].leaderBaseId, 'LEIA');
  assert.equal(plan.staged[0].exactSlot, true);
  assert.equal(plan.zoneOnlyCount, 0);
  assert.equal(plan.skipped.some((row)=>row.reason==='no-verified-open-slot'), true);
});

test('zone fallback must be explicitly enabled and remains labeled zone-only', () => {
  const plan = buildStagingPlan(report, snapshot, { allowZoneFallback:true });
  assert.equal(plan.staged.length, 2);
  const jabba = plan.staged.find((row)=>row.leaderBaseId==='JABBA');
  assert.equal(jabba.exactSlot, false);
  assert.equal(plan.zoneOnlyCount, 1);
});

test('staging never allocates two historical squads into the same current slot', () => {
  const second = { ...exact, leaderBaseId:'REY', members:['REY','A','B','C','D'], priorityRank:2 };
  const plan = buildStagingPlan({ defensePrediction:{ predictions:[exact,second] } }, snapshot);
  assert.equal(plan.staged.length, 1);
});

test('prediction signatures ignore member ordering but preserve leader identity', () => {
  assert.equal(predictionSignature({ leaderBaseId:'L', members:['B','L','A'] }), predictionSignature({ leaderBaseId:'L', members:['A','B','L'] }));
  assert.notEqual(predictionSignature({ leaderBaseId:'X', members:['A','B','L'] }), predictionSignature({ leaderBaseId:'L', members:['A','B','L'] }));
});
