import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { cleanupCandidatePlan } from '../public/gac-cleanup-intelligence-model.js';
import { cleanupAttackBrief } from '../public/gac-cleanup-attack-brief-model.js';

const unit=(baseId,speed=300)=>({baseId,name:baseId,unitType:'Character',stars:7,relic:7,gear:13,power:32000,speed,zetas:2,omicrons:0,factions:['JEDI'],abilities:[{type:'Leader',id:`leader_${baseId}`} ]});
const defense={id:44,leaderBaseId:'DEF_A',members:['DEF_A','DEF_B','DEF_C'],zone:'FRONT-TOP',slot:0,datacronState:'none'};
const opponentRoster={units:[unit('DEF_A',280),unit('DEF_B',270),unit('DEF_C',260)]};
const lossAssignment={id:10,defenseId:44,status:'loss',members:['OLD_A','OLD_B','OLD_C'],leaderBaseId:'OLD_A',attemptLog:[{status:'loss',members:['OLD_A','OLD_B','OLD_C'],leaderBaseId:'OLD_A',postAttempt:{defenseState:'survivors-confirmed',survivorBaseIds:['DEF_A','DEF_C']}}]};
const ownerRoster={units:[unit('OLD_A'),unit('OLD_B'),unit('OLD_C'),unit('MY_DEF_A'),unit('MY_DEF_B'),unit('MY_DEF_C'),unit('CLEAN_A',340),unit('CLEAN_B',335),unit('CLEAN_C',330),unit('CLEAN_D',325),unit('CLEAN_E',320),unit('CLEAN_F',315)]};

test('manual cleanup candidates use confirmed survivors and exclude spent plus defended units',()=>{
  const plan=cleanupCandidatePlan({ownerRoster,opponentRoster,assignment:lossAssignment,defense,assignments:[lossAssignment],ownDefenses:[{members:['MY_DEF_A','MY_DEF_B','MY_DEF_C']}],size:3,limit:5});
  assert.equal(plan.ready,true);
  assert.deepEqual(plan.truth.survivorBaseIds,['DEF_A','DEF_C']);
  const forbidden=new Set(['OLD_A','OLD_B','OLD_C','MY_DEF_A','MY_DEF_B','MY_DEF_C']);
  assert.ok(plan.candidates.length>0);
  for(const candidate of plan.candidates)for(const member of candidate.squad)assert.equal(forbidden.has(member.baseId),false,member.baseId);
});

test('locked cleanup brief keeps the residual defense instead of restoring the original squad',()=>{
  const cleanup={...lossAssignment,status:'planned',members:['CLEAN_A','CLEAN_B','CLEAN_C'],leaderBaseId:'CLEAN_A',planKind:'cleanup',cleanup:{attemptIndex:0,survivorBaseIds:['DEF_A','DEF_C']}};
  const brief=cleanupAttackBrief({assignment:cleanup,defense,ownerRoster,opponentRoster,assignments:[cleanup],ownDefenses:[],size:3,strategyMatch:null});
  assert.equal(brief.ready,true);
  assert.deepEqual(brief.residual.survivorBaseIds,['DEF_A','DEF_C']);
  assert.deepEqual(brief.attack.ids,['CLEAN_A','CLEAN_B','CLEAN_C']);
  assert.equal(brief.execution.available,false);
  assert.equal(brief.prediction,false);
});

test('manual cleanup UI blocks original-defense retry and shares B08/B09 lifecycle cards',async()=>{
  const ui=await readFile(new URL('../public/gac-manual-cleanup-parity.js',import.meta.url),'utf8');
  assert.match(ui,/ORIGINAL-DEFENSE RETRY BLOCKED/);
  assert.match(ui,/data-gac-manual-dc-lock/);
  assert.match(ui,/data-gac-manual-war-action=\\?"lock\\?"/);
  assert.match(ui,/data-gac-manual-cleanup-lock/);
  assert.match(ui,/\/api\/gac\/attack-plan\//);
  assert.match(ui,/manual-cleanup-counter-locked/);
  assert.match(ui,/gac-visible-defense\[data-defense-id\]/);
  assert.match(ui,/TM UNKNOWN · HP UNKNOWN · PROTECTION UNKNOWN/);
  assert.doesNotMatch(ui,/data-gac-manual-cleanup-(?:tm|health|protection)/i);
});

test('manual cleanup produces the B11 brief and remains source-gated when no exact strategy exists',async()=>{
  const ui=await readFile(new URL('../public/gac-manual-cleanup-parity.js',import.meta.url),'utf8');
  assert.match(ui,/cleanupAttackBrief/);
  assert.match(ui,/findStrategyGuidance/);
  assert.match(ui,/MANUAL CLEANUP ATTACK BRIEF · B11/);
  assert.match(ui,/SOURCE-GATED EXECUTION/);
  assert.match(ui,/No opener or target order is inferred/);
});

test('loader registers manual cleanup before the normal Datacron lock handler',async()=>{
  const bootstrap=await readFile(new URL('../public/asset-resilience.js',import.meta.url),'utf8');
  const cleanup=bootstrap.indexOf("import './gac-manual-cleanup-parity.js';");
  const datacron=bootstrap.indexOf("import './gac-manual-datacron-lock.js';");
  assert.ok(cleanup>=0);
  assert.ok(datacron>cleanup);
});
