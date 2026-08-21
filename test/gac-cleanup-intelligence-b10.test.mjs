import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanupCandidatePlan, cleanupTruth, consumedAndReservedIds } from '../public/gac-cleanup-intelligence-model.js';
import { cleanupContextFromAttemptLog } from '../gac-attack-plan-service.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const read=(name)=>fs.readFileSync(path.join(root,name),'utf8');

function unit(baseId,options={}){
  return {baseId,name:baseId,unitType:'Character',stars:7,relic:options.relic??7,gear:13,power:options.power??32000,speed:options.speed??300,zetas:2,omicrons:options.omicrons??0,factions:options.factions||['Sith'],abilities:[{type:'leader',id:`leader_${baseId}`}],...options};
}
const defense={id:44,leaderBaseId:'DEF_A',members:['DEF_A','DEF_B','DEF_C'],zone:'FRONT-TOP',slot:0};
const opponentRoster={units:[unit('DEF_A',{speed:280}),unit('DEF_B',{speed:270}),unit('DEF_C',{speed:260})]};
const confirmedLoss={
  id:10,defenseId:44,status:'loss',members:['OLD_A','OLD_B','OLD_C'],
  attemptLog:[{status:'loss',members:['OLD_A','OLD_B','OLD_C'],leaderBaseId:'OLD_A',postAttempt:{defenseState:'survivors-confirmed',survivorBaseIds:['DEF_A','DEF_B']}}],
};

test('cleanup truth fails closed when survivor state was not confirmed',()=>{
  const assignment={...confirmedLoss,attemptLog:[{...confirmedLoss.attemptLog[0],postAttempt:{defenseState:'unknown',survivorBaseIds:[]}}]};
  const truth=cleanupTruth(assignment,defense,opponentRoster);
  assert.equal(truth.ready,false);
  assert.equal(truth.code,'survivors-unknown');
  const plan=cleanupCandidatePlan({ownerRoster:{units:[unit('CLEAN_A'),unit('CLEAN_B'),unit('CLEAN_C')]},opponentRoster,assignment,defense,size:3});
  assert.equal(plan.ready,false);
  assert.equal(plan.candidates.length,0);
  assert.equal(plan.turnMeterState,'unknown');
});

test('confirmed survivor ids must remain a subset of the exact saved defense',()=>{
  const assignment={...confirmedLoss,attemptLog:[{...confirmedLoss.attemptLog[0],postAttempt:{defenseState:'survivors-confirmed',survivorBaseIds:['DEF_A','NOT_DEFENSE']}}]};
  const truth=cleanupTruth(assignment,defense,opponentRoster);
  assert.equal(truth.ready,false);
  assert.equal(truth.code,'survivor-mismatch');
});

test('cleanup resource set excludes prior attempts, verified defense, and other active plans',()=>{
  const assignments=[
    confirmedLoss,
    {id:11,status:'planned',members:['ACTIVE_A','ACTIVE_B','ACTIVE_C'],attemptLog:[]},
    {id:12,status:'loss',members:['OLD_X','OLD_Y','OLD_Z'],attemptLog:[{status:'loss',members:['OLD_X','OLD_Y','OLD_Z'],postAttempt:{defenseState:'unknown'}}]},
  ];
  const ids=consumedAndReservedIds(assignments,[{members:['MY_DEF_A','MY_DEF_B','MY_DEF_C']}]);
  for(const id of ['OLD_A','OLD_B','OLD_C','ACTIVE_A','ACTIVE_B','ACTIVE_C','OLD_X','OLD_Y','OLD_Z','MY_DEF_A','MY_DEF_B','MY_DEF_C'])assert.equal(ids.includes(id),true,id);
});

test('cleanup candidates use only remaining roster and never claim prediction or telemetry truth',()=>{
  const ownerRoster={units:[
    unit('OLD_A'),unit('OLD_B'),unit('OLD_C'),
    unit('MY_DEF_A'),unit('MY_DEF_B'),unit('MY_DEF_C'),
    unit('ACTIVE_A'),unit('ACTIVE_B'),unit('ACTIVE_C'),
    unit('CLEAN_A',{speed:330}),unit('CLEAN_B',{speed:325}),unit('CLEAN_C',{speed:320}),unit('CLEAN_D',{speed:315}),unit('CLEAN_E',{speed:310}),unit('CLEAN_F',{speed:305}),
  ]};
  const assignments=[confirmedLoss,{id:11,status:'planned',members:['ACTIVE_A','ACTIVE_B','ACTIVE_C'],attemptLog:[]}];
  const plan=cleanupCandidatePlan({ownerRoster,opponentRoster,assignment:confirmedLoss,defense,assignments,ownDefenses:[{members:['MY_DEF_A','MY_DEF_B','MY_DEF_C']}],size:3,limit:5});
  assert.equal(plan.ready,true);
  assert.deepEqual(plan.truth.survivorBaseIds,['DEF_A','DEF_B']);
  assert.ok(plan.candidates.length>0);
  const forbidden=new Set(['OLD_A','OLD_B','OLD_C','MY_DEF_A','MY_DEF_B','MY_DEF_C','ACTIVE_A','ACTIVE_B','ACTIVE_C']);
  for(const candidate of plan.candidates){
    assert.equal(candidate.prediction,false);
    assert.equal(candidate.turnMeterState,'unknown');
    for(const member of candidate.squad)assert.equal(forbidden.has(member.baseId),false,member.baseId);
  }
  assert.equal(plan.healthState,'unknown');
  assert.equal(plan.protectionState,'unknown');
});

test('server cleanup context uses the latest loss and requires confirmed survivors',()=>{
  const unknown=cleanupContextFromAttemptLog([{status:'loss',members:['A','B','C'],postAttempt:{defenseState:'unknown'}}],['DEF_A','DEF_B','DEF_C']);
  assert.equal(unknown.ready,false);
  assert.equal(unknown.code,'survivors-unknown');
  const confirmed=cleanupContextFromAttemptLog([{status:'loss',members:['A','B','C'],postAttempt:{defenseState:'survivors-confirmed',survivorBaseIds:['DEF_A','DEF_C']}}],['DEF_A','DEF_B','DEF_C']);
  assert.equal(confirmed.ready,true);
  assert.equal(confirmed.attemptIndex,0);
  assert.deepEqual(confirmed.survivorBaseIds,['DEF_A','DEF_C']);
});

test('B10 UI suppresses original-defense retry and exposes no post-battle telemetry inputs',()=>{
  const ui=read('public/gac-cleanup-intelligence-ui.js');
  const resultUi=read('public/gac-attempt-result-ui.js');
  const service=read('gac-attack-plan-service.mjs');
  assert.match(ui,/Original-defense retry disabled/);
  assert.match(ui,/NOT A WIN PROBABILITY/);
  assert.match(ui,/TM UNKNOWN · HP UNKNOWN · PROTECTION UNKNOWN/);
  assert.doesNotMatch(ui,/data-gac-b10-(?:tm|health|protection)/i);
  assert.match(resultUi,/import '\.\/gac-cleanup-intelligence-ui\.js'/);
  assert.match(service,/Confirm the surviving enemy defenders in the recorded loss before locking a cleanup counter/);
  assert.match(service,/planKind: isCleanup \? "cleanup" : "standard"/);
  assert.match(service,/cleanupTelemetryState: isCleanup \? "unknown" : null/);
});
