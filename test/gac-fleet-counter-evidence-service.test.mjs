import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateFleetRows, createGacFleetCounterEvidenceService, evidenceReliability, isFleetBattle } from '../gac-fleet-counter-evidence-service.mjs';
import { createGacApi } from '../gac-api.mjs';

function fleetRow(overrides = {}) {
  return {
    format: '5v5',
    season_id: 'S1',
    attacker_leader_base_id: 'CAPITALEXECUTOR',
    attacker_members: ['CAPITALEXECUTOR','HOUNDSTOOTH','RAZORCREST','XANADUBLOOD'],
    defender_leader_base_id: 'CAPITALLEVIATHAN',
    defender_members: ['CAPITALLEVIATHAN','SITHFIGHTER','SITHBOMBER','FURYCLASSINTERCEPTOR'],
    battle_outcome: 'win',
    source: 'c3po-gahistory',
    source_ref: 'https://example.invalid/history',
    source_updated_at: '2026-08-20T00:00:00.000Z',
    metadata: { battleType: 'fleet' },
    ...overrides,
  };
}

test('fleet evidence aggregation ignores character battles and preserves observed fleet samples', () => {
  const rows = [
    fleetRow(),
    fleetRow({ season_id:'S2', battle_outcome:'loss', source_updated_at:'2026-08-21T00:00:00.000Z' }),
    fleetRow({
      attacker_leader_base_id:'JABBATHEHUTT',
      attacker_members:['JABBATHEHUTT','BOUSHH','KRRSANTAN'],
      defender_leader_base_id:'GLREY',
      defender_members:['GLREY','BEN-SOLO','50RT'],
      metadata:{battleType:'character'},
    }),
  ];
  const aggregated = aggregateFleetRows(rows);
  assert.equal(aggregated.length,1);
  assert.equal(aggregated[0].battles,2);
  assert.equal(aggregated[0].wins,1);
  assert.equal(aggregated[0].holds,1);
  assert.equal(aggregated[0].observedWinRate,0.5);
  assert.deepEqual(aggregated[0].seasons,['S1','S2']);
  assert.equal(aggregated[0].compositionScope,'capital-plus-member-set');
  assert.equal(aggregated[0].roleScope,'starter-reinforcement-roles-not-retained-by-history-store');
});

test('fleet battle detection uses explicit battleType and only capital signature as legacy fallback', () => {
  assert.equal(isFleetBattle(fleetRow()),true);
  assert.equal(isFleetBattle(fleetRow({metadata:{battleType:'character'}})),false);
  assert.equal(isFleetBattle(fleetRow({metadata:{}})),true);
  assert.equal(isFleetBattle(fleetRow({metadata:{},attacker_leader_base_id:'JABBATHEHUTT'})),false);
});

test('fleet reliability mirrors the established GAC evidence policy without converting observed rate into prediction', () => {
  assert.deepEqual(evidenceReliability({battles:1,wins:1}),{tier:'single-positive',rank:1,automatic:true,label:'Single observed win'});
  assert.equal(evidenceReliability({battles:4,wins:1}).automatic,false);
  assert.equal(evidenceReliability({battles:10,wins:8}).tier,'strong');
});

test('fleet evidence service queries persisted GAC battles by format and defender capital ship', async () => {
  const queries=[];
  const store={
    async select(table,query){ queries.push({table,query}); return [fleetRow()]; },
  };
  const service=createGacFleetCounterEvidenceService({store});
  const body=await service.getFleetCounterEvidenceBatch({format:'5v5',enemyCapitalShipBaseIds:['CAPITALLEVIATHAN'],limit:10});
  assert.equal(queries[0].table,'gac_battles');
  assert.equal(queries[0].query.format,'eq.5v5');
  assert.equal(queries[0].query.defender_leader_base_id,'in.(CAPITALLEVIATHAN)');
  assert.equal(body.results[0].count,1);
  assert.equal(body.battleSamples,1);
  assert.equal(body.scope.observedRateIsPrediction,false);
});

test('GAC API exposes a dedicated read-only fleet counter batch endpoint', async () => {
  let captured=null;
  let fleetInput=null;
  const api=createGacApi({
    requestGateway:async()=>({}),
    writeJson(_response,status,body,headers){captured={status,body,headers};},
    history:{
      async getPlayerHistory(){return {rounds:[]};},
      async getCounterEvidence(){return {};},
    },
    historyImport:{async importPlayer(){return {source:'test',imported:0,importedRounds:0,importedCounters:0};}},
    bracketIndex:{currentRoundFrom(){return null;}},
    counterBatch:{async getCounterEvidenceBatch(){return {}; }},
    fleetCounters:{async getFleetCounterEvidenceBatch(input){fleetInput=input;return {source:'gac-fleet-counter-evidence',results:[]};}},
    scouting:{async getScoutingReport(){return {}; }},
  });
  const handled=await api.handle(
    {method:'GET'},
    {},
    new URL('https://example.test/api/gac/fleet/counters/batch?format=5v5&capitals=CAPITALLEVIATHAN,CAPITALEXECUTOR&limit=25'),
  );
  assert.equal(handled,true);
  assert.equal(fleetInput.format,'5v5');
  assert.deepEqual(fleetInput.enemyCapitalShipBaseIds,['CAPITALLEVIATHAN','CAPITALEXECUTOR']);
  assert.equal(fleetInput.limit,25);
  assert.equal(captured.status,200);
  assert.equal(captured.headers['X-GAC-Source'],'persisted-fleet-counter-evidence');
});
