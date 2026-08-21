import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanupAttackBrief, cleanupResidualTruth, recoveryAlternatives } from '../public/gac-cleanup-attack-brief-model.js';
import { readFile } from 'node:fs/promises';

const unit=(baseId,power=50000)=>({baseId,name:baseId,unitType:'Character',stars:7,relic:7,gear:13,power,speed:300,zetas:2,omicrons:0,factions:['Jedi'],abilities:[{type:'leader',id:'leader'}]});
const owner={units:['A','B','C','D','E','F','G','H','I'].map((id,index)=>unit(id,70000-index*1000))};
const opponent={units:['X','Y','Z'].map((id,index)=>unit(id,65000-index*1000))};
const defense={id:44,members:['X','Y','Z'],leaderBaseId:'X',zone:'FRONT-TOP',slot:0,datacronState:'none'};
const cleanupAssignment={id:10,defenseId:44,defense,status:'planned',planKind:'cleanup',leaderBaseId:'A',members:['A','B','C'],datacron:null,cleanup:{attemptIndex:0,survivorBaseIds:['X','Z'],telemetryState:'unknown'},attemptLog:[{status:'loss',members:['OLD1','OLD2','OLD3'],postAttempt:{defenseState:'survivors-confirmed',survivorBaseIds:['X','Z']}}]};

test('B11 residual truth uses canonical cleanup survivor metadata rather than original full defense',()=>{
  const truth=cleanupResidualTruth(cleanupAssignment,defense,opponent);
  assert.equal(truth.ready,true);
  assert.deepEqual(truth.survivorBaseIds,['X','Z']);
  assert.equal(truth.survivorUnits.length,2);
});

test('B11 fails closed when cleanup survivor metadata is not a subset of original defense',()=>{
  const truth=cleanupResidualTruth({...cleanupAssignment,cleanup:{attemptIndex:0,survivorBaseIds:['X','NOT_DEFENSE']}},defense,opponent);
  assert.equal(truth.ready,false);
  assert.equal(truth.code,'cleanup-survivor-mismatch');
});

test('B11 heuristic brief never becomes a predicted win rate or invented execution sequence',()=>{
  const brief=cleanupAttackBrief({assignment:cleanupAssignment,defense,ownerRoster:owner,opponentRoster:opponent,assignments:[cleanupAssignment],ownDefenses:[],size:3,strategyMatch:null});
  assert.equal(brief.ready,true);
  assert.equal(brief.prediction,false);
  assert.equal(brief.source,'cleanup-roster-fit-heuristic');
  assert.equal(brief.execution.available,false);
  assert.match(brief.execution.reason,/No approved exact-composition strategy record/i);
  assert.equal(brief.telemetry.tm,'unknown');
  assert.equal(brief.telemetry.health,'unknown');
  assert.equal(brief.telemetry.protection,'unknown');
});

test('B11 exposes exact sourced execution only when exact strategy guidance is supplied',()=>{
  const strategyMatch={matched:true,record:{id:'S1'},guidance:{sourceName:'Reviewed source',opening:[{text:'Verified opener'}],targets:[],mechanics:[],avoid:[]}};
  const brief=cleanupAttackBrief({assignment:cleanupAssignment,defense,ownerRoster:owner,opponentRoster:opponent,assignments:[cleanupAssignment],ownDefenses:[],size:3,strategyMatch});
  assert.equal(brief.execution.available,true);
  assert.equal(brief.source,'approved-exact-strategy');
  assert.equal(brief.execution.guidance.opening[0].text,'Verified opener');
});

test('B11 recovery ordering releases current unattempted cleanup reservation but preserves consumed resources',()=>{
  const assignments=[cleanupAssignment,{id:11,status:'loss',members:['D','E','F'],attemptLog:[{status:'loss',members:['D','E','F'],postAttempt:{defenseState:'unknown',survivorBaseIds:[]}}]}];
  const alternatives=recoveryAlternatives({ownerRoster:owner,survivorUnits:[opponent.units[0],opponent.units[2]],assignments,ownDefenses:[],currentAssignmentId:10,size:3,limit:3,currentMembers:['A','B','C']});
  for(const candidate of alternatives){
    const ids=candidate.squad.map((row)=>row.baseId);
    assert.equal(ids.some((id)=>['D','E','F'].includes(id)),false,'consumed units must remain unavailable');
    assert.notDeepEqual(ids.slice().sort(),['A','B','C']);
    assert.equal(candidate.prediction,false);
  }
});

test('B11 browser surface states the cleanup truth and source boundaries',async()=>{
  const source=await readFile(new URL('../public/gac-cleanup-attack-brief.js',import.meta.url),'utf8');
  assert.match(source,/CLEANUP ATTACK BRIEF · B11/);
  assert.match(source,/SOURCE-GATED EXECUTION/);
  assert.match(source,/NOT a win probability/);
  assert.match(source,/TM \/ HP \/ Protection \/ cooldowns remain UNKNOWN/);
  assert.match(source,/findStrategyGuidance/);
});
