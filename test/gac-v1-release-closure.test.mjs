import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { allocateFleetCounters, fleetRosterAvailability } from '../public/gac-fleet-war-room-model.js';
import { normalizeBattleObservation } from '../gac-evidence-warehouse-model.mjs';
import { GAC_V1_RELEASE_STATUS } from '../gac-v1-release-status.mjs';

async function jsonFile(path){return JSON.parse(await readFile(new URL(`../${path}`,import.meta.url),'utf8'));}
function ship(baseId,power=100000){return {baseId,name:baseId,unitType:'Ship',stars:7,maxRarity:7,level:85,maxLevel:85,power,abilities:[]};}
function observation({enemyCapital,enemyMembers,ownCapital,ownMembers,wins=9,battles=10}){
  return {
    defenderCapitalShipBaseId:enemyCapital,
    defenderMembers:enemyMembers,
    attackerCapitalShipBaseId:ownCapital,
    attackerMembers:ownMembers,
    battles,wins,holds:battles-wins,draws:0,
    observedWinRate:wins/battles,
    reliability:{tier:'strong',rank:4,automatic:true,label:'Strong historical sample'},
    evidenceSources:['verified-owner-fleet-war-room'],
    seasons:['S81'],lastObservedAt:'2026-08-21T00:00:00Z',
    roleScope:'starter-reinforcement-roles-not-retained-by-history-store',
  };
}

test('v1 production strategy catalog stays empty until a tactic crosses every source gate',async()=>{
  const production=await jsonFile('public/data/gac-strategy-records.json');
  const three=await jsonFile('public/data/gac-strategy-source-candidates.json');
  const five=await jsonFile('public/data/gac-strategy-source-candidates-5v5.json');

  assert.equal(production.schemaVersion,1);
  assert.deepEqual(production.records,[]);
  assert.ok(three.candidates.length>0,'3v3 research quarantine should retain reviewed candidates');
  assert.ok(three.candidates.every((row)=>row?.review?.status==='quarantined'));
  assert.ok(three.candidates.every((row)=>Array.isArray(row?.review?.blockers)&&row.review.blockers.length>0));
  assert.ok(three.candidates.every((row)=>row?.proposedRecord?.format==='3v3'));
  assert.equal(five.format,'5v5');
  assert.equal(five.releaseState,'source-blocked-production-safe');
  assert.deepEqual(five.candidates,[]);
  assert.match(five.reason,/no reviewed 5v5 candidate/i);
});

test('v1 release contract marks both tactical packs production-safe but source blocked',()=>{
  assert.equal(GAC_V1_RELEASE_STATUS.state,'production');
  assert.equal(GAC_V1_RELEASE_STATUS.packages.fleetAcceptance,'production');
  assert.equal(GAC_V1_RELEASE_STATUS.packages.tacticalSourceQuarantine,'production');
  assert.equal(GAC_V1_RELEASE_STATUS.tacticalSources.threeVThree.state,'source-blocked-production-safe');
  assert.equal(GAC_V1_RELEASE_STATUS.tacticalSources.fiveVFive.state,'source-blocked-production-safe');
  assert.equal(GAC_V1_RELEASE_STATUS.tacticalSources.approvedProductionRecordsAtRelease,0);
  assert.equal(GAC_V1_RELEASE_STATUS.tacticalSources.executionFallback,'source-gated-no-invention');
});

test('fleet T5 acceptance allocates two exact historical fleets without resource overlap',()=>{
  const ownerRoster={units:[
    ship('CAPITAL_OWN_A',150000),ship('A1'),ship('A2'),ship('A3'),ship('A4'),
    ship('CAPITAL_OWN_B',145000),ship('B1'),ship('B2'),ship('B3'),ship('B4'),
  ]};
  const catalog={units:ownerRoster.units};
  const defenses=[
    {slot:0,complete:true,capitalShipBaseId:'CAPITAL_ENEMY_A',starters:['EA1','EA2','EA3'],reinforcements:['EA4']},
    {slot:1,complete:true,capitalShipBaseId:'CAPITAL_ENEMY_B',starters:['EB1','EB2','EB3'],reinforcements:['EB4']},
  ];
  const evidence={results:[
    {enemyCapitalShipBaseId:'CAPITAL_ENEMY_A',observations:[observation({enemyCapital:'CAPITAL_ENEMY_A',enemyMembers:['CAPITAL_ENEMY_A','EA1','EA2','EA3','EA4'],ownCapital:'CAPITAL_OWN_A',ownMembers:['CAPITAL_OWN_A','A1','A2','A3','A4']})]},
    {enemyCapitalShipBaseId:'CAPITAL_ENEMY_B',observations:[observation({enemyCapital:'CAPITAL_ENEMY_B',enemyMembers:['CAPITAL_ENEMY_B','EB1','EB2','EB3','EB4'],ownCapital:'CAPITAL_OWN_B',ownMembers:['CAPITAL_OWN_B','B1','B2','B3','B4'],wins:8})]},
  ]};

  const plan=allocateFleetCounters(ownerRoster,catalog,defenses,evidence);
  assert.equal(plan.fleetDefenseCount,2);
  assert.equal(plan.allocatedFleetCount,2);
  assert.equal(plan.assignments.length,2);
  const first=new Set(plan.assignments[0].recommendation.fleetIds);
  const second=new Set(plan.assignments[1].recommendation.fleetIds);
  assert.equal([...first].some((id)=>second.has(id)),false);
  assert.equal(new Set(plan.newlyUsedBaseIds).size,10);
  assert.ok(plan.assignments.every((row)=>row.recommendation.compositionMatch.key==='exact-members'));
  assert.ok(plan.assignments.every((row)=>row.recommendation.roleScope==='starter-reinforcement-roles-not-retained-by-history-store'));

  const availability=fleetRosterAvailability(ownerRoster,plan,[]);
  assert.equal(availability.counts.allocated,10);
  assert.equal(availability.counts.reserved,0);
  assert.equal(availability.counts.available,0);
});

test('fleet T5 acceptance keeps Datacrons not-applicable and historical roles unknown',()=>{
  const row=normalizeBattleObservation({
    format:'5v5',season_id:'S81',
    attacker_leader_base_id:'CAPITAL_OWN_A',attacker_members:['CAPITAL_OWN_A','A1','A2','A3','A4'],
    defender_leader_base_id:'CAPITAL_ENEMY_A',defender_members:['CAPITAL_ENEMY_A','EA1','EA2','EA3','EA4'],
    battle_outcome:'win',source:'verified-owner-fleet-war-room',source_ref:'fleet:t5',source_updated_at:'2026-08-21T00:00:00Z',
    metadata:{battleType:'fleet',attackerDatacronId:'INVALID-IF-USED',defenderDatacronId:'INVALID-IF-USED'},
  });
  assert.equal(row.battleType,'fleet');
  assert.equal(row.datacron.attacker.applicable,false);
  assert.equal(row.datacron.defender.presence,'not-applicable');
  assert.equal(row.role.known,false);
  assert.match(row.role.scope,/roles not recorded/i);
});

test('release docs keep B03/B04 source-gated rather than claiming approved tactics',async()=>{
  const source=await readFile(new URL('../docs/GAC_TACTICAL_SOURCE_RELEASE_STATUS.md',import.meta.url),'utf8');
  assert.match(source,/B03 — 3v3 tactical source pack/);
  assert.match(source,/B04 — 5v5 tactical source pack/);
  assert.match(source,/source-blocked-production-safe/g);
  assert.match(source,/zero records/i);
  assert.doesNotMatch(source,/all tactics approved/i);
});
