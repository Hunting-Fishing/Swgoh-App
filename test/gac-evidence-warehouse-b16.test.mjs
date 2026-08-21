import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeBattleObservation,
  normalizeCounterAggregate,
  normalizeStrategyRecord,
  sourceFamily,
} from '../gac-evidence-warehouse-model.mjs';
import { createGacEvidenceWarehouseService } from '../gac-evidence-warehouse-service.mjs';

const aggregate={format:'3v3',enemy_leader_base_id:'DEF_A',enemy_members:['DEF_A','DEF_B','DEF_C'],counter_leader_base_id:'ATK_A',counter_members:['ATK_A','ATK_B'],battles:10,wins:8,holds:2,draws:0,average_banners:52.5,season_id:'S81',source:'c3po-gahistory',source_ref:'https://example/history',source_updated_at:'2026-08-20T00:00:00Z',confidence:.95,observed_at:'2026-08-20T00:00:00Z'};
const verified={format:'3v3',season_id:'S81',attacker_leader_base_id:'ATK_A',attacker_members:['ATK_A','ATK_B','ATK_C'],defender_leader_base_id:'DEF_A',defender_members:['DEF_A','DEF_B','DEF_C'],battle_outcome:'win',source:'verified-owner-war-room',source_ref:'war-room:10:attempt:1',source_updated_at:'2026-08-21T00:00:00Z',imported_at:'2026-08-21T00:01:00Z',player_id:'PRIVATE',ally_code:'732764286',metadata:{banners:54,attackerDatacronId:'PLAYER-DC-1',defenderDatacronId:'ENEMY-DC-9',confirmedByUserId:'PRIVATE-USER'}};

test('B16 normalizes C-3PO aggregate with exact composition and Datacron scope not-recorded',()=>{
  const row=normalizeCounterAggregate(aggregate);
  assert.equal(row.evidenceKind,'counter-aggregate');
  assert.equal(row.provenance.sourceFamily,'c3po');
  assert.deepEqual(row.enemy.members,['DEF_A','DEF_B','DEF_C']);
  assert.equal(row.datacron.attacker.known,false);
  assert.equal(row.datacron.attacker.presence,'not-recorded');
  assert.equal(row.datacron.defender.presence,'not-recorded');
  assert.equal(row.prediction,false);
});

test('B16 verified battle preserves recorded Datacron instance IDs and strips internal identifiers',()=>{
  const row=normalizeBattleObservation(verified);
  assert.equal(row.provenance.sourceFamily,'verified-owner');
  assert.equal(row.datacron.attacker.presence,'assigned');
  assert.equal(row.datacron.attacker.instanceId,'PLAYER-DC-1');
  assert.equal(row.datacron.defender.instanceId,'ENEMY-DC-9');
  const serialized=JSON.stringify(row);
  assert.doesNotMatch(serialized,/PRIVATE|732764286|confirmedByUserId|player_id|ally_code/);
});

test('B16 missing verified battle Datacron IDs remain not-recorded rather than none',()=>{
  const row=normalizeBattleObservation({...verified,metadata:{banners:50}});
  assert.equal(row.datacron.attacker.known,false);
  assert.equal(row.datacron.attacker.presence,'not-recorded');
  assert.equal(row.datacron.defender.presence,'not-recorded');
});

test('B16 fleet battle makes Datacrons explicitly not applicable and does not invent historical ship roles',()=>{
  const row=normalizeBattleObservation({...verified,attacker_leader_base_id:'CAPITAL_EXECUTOR',defender_leader_base_id:'CAPITAL_LEVIATHAN',metadata:{battleType:'fleet'},attacker_members:['CAPITAL_EXECUTOR','SHIP_A','SHIP_B'],defender_members:['CAPITAL_LEVIATHAN','SHIP_X','SHIP_Y']});
  assert.equal(row.battleType,'fleet');
  assert.equal(row.datacron.attacker.applicable,false);
  assert.equal(row.datacron.defender.presence,'not-applicable');
  assert.equal(row.role.known,false);
  assert.match(row.role.scope,/roles not recorded/i);
});

test('B16 tactical strategy warehouse record keeps DC constraints and provenance but no execution guidance',()=>{
  const record={schemaVersion:1,id:'TACTIC-1',status:'active',format:'3v3',defender:{leaderBaseId:'DEF_A',members:['DEF_A','DEF_B','DEF_C']},attacker:{leaderBaseId:'ATK_A',members:['ATK_A','ATK_B']},attackerDatacron:{presence:'none',required:false,setIds:[],mechanicIds:[]},defenderDatacron:{presence:'assigned',required:true,setIds:['SET30'],mechanicIds:['MECH-X']},validity:{validFrom:'2026-08-01',validUntil:'2026-09-01',gameDataVersion:'2026.08'},provenance:{sourceName:'Xaereth',sourceType:'video',sourceRef:'video:1',sourceUpdatedAt:'2026-08-20',capturedAt:'2026-08-21',author:'Xaereth'},guidance:{opening:[{text:'SHOULD NOT LEAK'}]}};
  const row=normalizeStrategyRecord(record);
  assert.equal(row.evidenceKind,'tactical-strategy');
  assert.equal(row.datacron.attacker.presence,'none');
  assert.deepEqual(row.datacron.defender.setIds,['SET30']);
  assert.equal(row.era.gameDataVersion,'2026.08');
  const serialized=JSON.stringify(row);
  assert.doesNotMatch(serialized,/SHOULD NOT LEAK|"guidance"|"opening"|"targets"|"avoid"/);
});

test('B16 source-family mapping preserves unfamiliar sources without pretending approval',()=>{
  assert.equal(sourceFamily('swgoh.gg'),'swgoh.gg');
  assert.equal(sourceFamily('mystery-feed'),'other-public-or-imported');
  assert.equal(sourceFamily(''),'unknown-source');
});

test('B16 service combines aggregate, battles, and active strategy metadata with filters and bounded limit',async()=>{
  const store={async select(table){if(table==='gac_counter_observations')return [aggregate];if(table==='gac_battles')return [verified];return [];}};
  const activeStrategy={schemaVersion:1,id:'TACTIC-2',status:'active',format:'3v3',defender:{leaderBaseId:'DEF_A',members:['DEF_A','DEF_B','DEF_C']},attacker:{leaderBaseId:'ATK_A',members:['ATK_A','ATK_B']},attackerDatacron:{presence:'any',required:false,setIds:[],mechanicIds:[]},defenderDatacron:{presence:'any',required:false,setIds:[],mechanicIds:[]},validity:{validFrom:'2026-08-01',validUntil:'2026-09-01',gameDataVersion:'2026.08',notes:''},provenance:{sourceName:'Reviewed',sourceType:'community',sourceRef:'guide:1',sourceUpdatedAt:'2026-08-20',sourcePublishedAt:'2026-08-20',capturedAt:'2026-08-21',author:'Author'},guidance:{opening:[{text:'verified'}],targets:[],mechanics:[],avoid:[]}};
  const service=createGacEvidenceWarehouseService({store,strategyLoader:async()=>[activeStrategy]});
  const result=await service.getEvidence({format:'3v3',battleType:'character',enemyLeaderBaseId:'DEF_A',limit:2});
  assert.equal(result.records.length,2);
  assert.equal(result.filters.limit,2);
  assert.equal(result.truthBoundaries.legacyDatacronAbsenceMeansNone,false);
  assert.equal(result.truthBoundaries.tacticalGuidanceIncluded,false);
  assert.equal(result.truthBoundaries.internalUserIdentifiersExposed,false);
  assert.equal(result.summary.count,2);
});
