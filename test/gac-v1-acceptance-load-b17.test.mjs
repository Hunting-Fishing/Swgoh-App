import test from 'node:test';
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { GAC_V1_ACCEPTANCE_SCENARIOS, scenarioSummary } from '../gac-v1-acceptance-manifest.mjs';
import { captureQueue, captureStatus } from '../public/gac-board-capture-model.js';
import { rosterIntegrity } from '../public/gac-roster-integrity-model.js';
import {
  buildExecutionChecklist,
  executionReady,
} from '../public/gac-battle-execution-model.js';
import { resultDraft } from '../public/gac-attempt-result-model.js';
import { createGacEvidenceWarehouseService } from '../gac-evidence-warehouse-service.mjs';
import { normalizeBattleObservation } from '../gac-evidence-warehouse-model.mjs';

function liveRoster(allyCode='123456789') {
  return {
    source:'live',
    player:{allyCode},
    units:[
      {baseId:'ATK_A',name:'A'},
      {baseId:'ATK_B',name:'B'},
      {baseId:'ATK_C',name:'C'},
    ],
    ships:[],
    datacrons:[{id:'DC-OWN-1'}],
    summary:{characters:3,ships:0,rosterUnits:3},
    capabilities:{liveRoster:true,characterRoster:true,shipRoster:true},
  };
}

function aggregateRow(index=0) {
  return {
    format:'3v3',
    enemy_leader_base_id:'DEF_A',
    enemy_members:['DEF_A','DEF_B','DEF_C'],
    counter_leader_base_id:'ATK_A',
    counter_members:index % 2 ? ['ATK_A','ATK_B'] : ['ATK_A','ATK_C'],
    battles:10 + index,
    wins:8,
    holds:2,
    draws:0,
    average_banners:52,
    league:'Kyber',
    season_id:'S81',
    source:'c3po-gahistory',
    source_ref:`history:${index}`,
    source_updated_at:`2026-08-${String((index % 20)+1).padStart(2,'0')}T00:00:00Z`,
    confidence:.95,
    observed_at:'2026-08-20T00:00:00Z',
  };
}

function battleRow(index=0) {
  return {
    format:'3v3',
    season_id:'S81',
    attacker_leader_base_id:'ATK_A',
    attacker_members:['ATK_A','ATK_B','ATK_C'],
    defender_leader_base_id:'DEF_A',
    defender_members:['DEF_A','DEF_B','DEF_C'],
    battle_outcome:index % 5 === 0 ? 'loss' : 'win',
    source:'verified-owner-war-room',
    source_ref:`war-room:${index}`,
    source_updated_at:`2026-08-${String((index % 20)+1).padStart(2,'0')}T01:00:00Z`,
    imported_at:'2026-08-21T00:00:00Z',
    metadata:{banners:50 + (index % 5),attackerDatacronId:'DC-OWN-1',defenderDatacronId:'DC-ENEMY-1'},
  };
}

test('B17 manifest contains 18 unique release scenarios and every referenced regression file exists', async () => {
  const summary=scenarioSummary();
  assert.equal(summary.count,18);
  assert.deepEqual(summary.ids,[...new Set(summary.ids)]);
  assert.deepEqual(summary.ids,Array.from({length:18},(_,index)=>`A${String(index+1).padStart(2,'0')}`));
  const files=[...new Set(GAC_V1_ACCEPTANCE_SCENARIOS.flatMap((row)=>row.tests))];
  assert.ok(files.length >= 15);
  await Promise.all(files.map((file)=>access(new URL(`../${file}`,import.meta.url))));
});

test('B17 hidden rear territories are excluded from visible capture completion', () => {
  const queue=captureQueue([
    {zone:'FRONT-TOP',capacity:1,entered:1,revealed:true,slots:[{zone:'FRONT-TOP',slot:0,kind:'squad',occupied:true}]},
    {zone:'FRONT-BOTTOM',capacity:1,entered:1,revealed:true,slots:[{zone:'FRONT-BOTTOM',slot:0,kind:'squad',occupied:true}]},
    {zone:'BACK-TOP',capacity:1,entered:0,revealed:false,slots:[{zone:'BACK-TOP',slot:0,kind:'fleet',occupied:false}]},
    {zone:'BACK-BOTTOM',capacity:1,entered:0,revealed:false,slots:[{zone:'BACK-BOTTOM',slot:0,kind:'squad',occupied:false}]},
  ]);
  assert.equal(queue.visibleComplete,true);
  assert.equal(queue.fullComplete,false);
  assert.equal(queue.hiddenCapacity,2);
  assert.equal(captureStatus(queue).code,'visible-complete');
});

test('B17 roster truth blocks wrong identity and warns on stale-but-valid roster', () => {
  const wrong=rosterIntegrity(liveRoster('999999999'),{'X-Roster-Source':'comlink-live','X-Roster-Cache':'fresh'},{expectedAllyCode:'123456789'});
  assert.equal(wrong.status,'blocked');
  assert.match(wrong.blocking.join(' '),/identity mismatch/i);

  const stale=rosterIntegrity(liveRoster(),{'X-Roster-Source':'comlink-live','X-Roster-Cache':'stale','Age':'700'},{expectedAllyCode:'123456789'});
  assert.equal(stale.status,'warn');
  assert.equal(stale.freshness.stale,true);
});

test('B17 execution fingerprint fails closed on unknown enemy Datacron and requires explicit confirmations', () => {
  const assignment={id:10,defenseId:20,status:'planned',leaderBaseId:'ATK_A',members:['ATK_A','ATK_B','ATK_C'],datacron:{id:'DC-OWN-1'}};
  const unknownDefense={id:20,leaderBaseId:'DEF_A',members:['DEF_A','DEF_B','DEF_C'],zone:'FRONT-TOP',slot:0,datacronState:'unknown'};
  const blocked=buildExecutionChecklist({assignment,defense:unknownDefense,roster:liveRoster(),ownDefenses:[],rosterIntegrity:{status:'good'}});
  assert.equal(blocked.readyForConfirmation,false);
  assert.ok(blocked.blockers.some((row)=>row.code==='defender-dc'));

  const exact=buildExecutionChecklist({assignment,defense:{...unknownDefense,datacronState:'none'},roster:liveRoster(),ownDefenses:[],rosterIntegrity:{status:'good'}});
  assert.equal(exact.readyForConfirmation,true);
  assert.equal(executionReady(exact,{defense:true,defenderDatacron:true,attack:true,attackerDatacron:false}),false);
  assert.equal(executionReady(exact,{defense:true,defenderDatacron:true,attack:true,attackerDatacron:true}),true);
});

test('B17 loss capture never invents residual defenders and rejects impossible survivors', () => {
  const unknown=resultDraft('loss',{defenseMembers:['DEF_A','DEF_B','DEF_C'],lossState:'unknown'});
  assert.equal(unknown.valid,true);
  assert.equal(unknown.postAttempt.defenseState,'unknown');
  assert.deepEqual(unknown.postAttempt.survivorBaseIds,[]);

  const invalid=resultDraft('loss',{defenseMembers:['DEF_A','DEF_B','DEF_C'],lossState:'survivors-confirmed',survivorBaseIds:['DEF_A','FAKE_DEFENDER']});
  assert.equal(invalid.valid,false);
  assert.match(invalid.error,/invalid survivors/i);

  const confirmed=resultDraft('loss',{defenseMembers:['DEF_A','DEF_B','DEF_C'],lossState:'survivors-confirmed',survivorBaseIds:['DEF_A','DEF_C'],banners:18});
  assert.equal(confirmed.valid,true);
  assert.deepEqual(confirmed.postAttempt.survivorBaseIds,['DEF_A','DEF_C']);
  assert.equal(confirmed.banners,18);
});

test('B17 fleet evidence remains Datacron-not-applicable and role-unknown', () => {
  const row=normalizeBattleObservation({
    format:'5v5',season_id:'S81',
    attacker_leader_base_id:'CAPITAL_EXECUTOR',attacker_members:['CAPITAL_EXECUTOR','SHIP_A','SHIP_B','SHIP_C'],
    defender_leader_base_id:'CAPITAL_LEVIATHAN',defender_members:['CAPITAL_LEVIATHAN','SHIP_X','SHIP_Y','SHIP_Z'],
    battle_outcome:'win',source:'verified-owner-fleet-war-room',source_ref:'fleet:1',source_updated_at:'2026-08-21T00:00:00Z',
    metadata:{battleType:'fleet',attackerDatacronId:'SHOULD-NOT-APPLY'},
  });
  assert.equal(row.battleType,'fleet');
  assert.equal(row.datacron.attacker.applicable,false);
  assert.equal(row.datacron.attacker.presence,'not-applicable');
  assert.equal(row.role.known,false);
});

test('B17 concurrent warehouse reads stay bounded and preserve truth boundaries', async () => {
  const aggregates=Array.from({length:80},(_,index)=>aggregateRow(index));
  const battles=Array.from({length:80},(_,index)=>battleRow(index));
  let inFlight=0;
  let maxInFlight=0;
  const store={
    async select(table){
      inFlight+=1;maxInFlight=Math.max(maxInFlight,inFlight);
      await new Promise((resolve)=>setTimeout(resolve,2));
      inFlight-=1;
      if(table==='gac_counter_observations')return aggregates;
      if(table==='gac_battles')return battles;
      return [];
    },
  };
  const service=createGacEvidenceWarehouseService({store,strategyLoader:async()=>[]});
  const requests=Array.from({length:48},(_,index)=>service.getEvidence({format:'3v3',battleType:'character',enemyLeaderBaseId:'DEF_A',limit:17 + (index % 4)}));
  const results=await Promise.all(requests);
  assert.equal(results.length,48);
  for(const result of results){
    assert.ok(result.records.length <= result.filters.limit);
    assert.equal(result.truthBoundaries.legacyDatacronAbsenceMeansNone,false);
    assert.equal(result.truthBoundaries.observedRateIsPrediction,false);
    assert.equal(result.truthBoundaries.internalUserIdentifiersExposed,false);
    assert.ok(result.records.every((row)=>row.format==='3v3'));
  }
  assert.ok(maxInFlight > 1,'load harness did not exercise concurrent store reads');
});
