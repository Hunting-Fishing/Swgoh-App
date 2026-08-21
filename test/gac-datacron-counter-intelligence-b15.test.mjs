import test from 'node:test';
import assert from 'node:assert/strict';
import { assessCounterMechanicFit, compareFit, defenderMechanicProfile, strictlyBetterFit, unitAnswerEvidence } from '../public/gac-datacron-counter-intelligence.js';
import { readFile } from 'node:fs/promises';

const dc={id:'DC-9',affixes:[{abilityId:'DC_A',abilityTextResolved:true,abilityDescription:'At the start of battle, allies gain 25% Turn Meter and can Revive once.'}]};
const defense={datacronState:'assigned',datacron:dc,members:['ENEMY_A','ENEMY_B','ENEMY_C']};
const unit=(baseId,speed,description='')=>({baseId,name:baseId,unitType:'Character',stars:7,relic:7,gear:13,power:50000,speed,abilities:[{type:'leader',id:'leader',description}]});

test('B15 derives discrete mechanic gates from verified Datacron text',()=>{
  const profile=defenderMechanicProfile(defense);
  assert.equal(profile.selected,true);
  assert.equal(profile.known,true);
  assert.ok(profile.mechanics.includes('Turn Meter'));
  assert.ok(profile.mechanics.includes('Revive'));
  assert.ok(profile.gates.some((gate)=>gate.id==='opening-tempo'));
  assert.ok(profile.gates.some((gate)=>gate.id==='revive'));
});

test('B15 recognizes explicit anti-revive ability evidence without changing unit power',()=>{
  const counter=unit('COUNTER',330,"Enemies defeated by this character can't be revived.");
  assert.ok(unitAnswerEvidence(counter,'revive').length>0);
  assert.equal(counter.power,50000);
});

test('B15 fit ordering uses blockers and unresolved mechanic gates, not a Datacron power multiplier',()=>{
  const profile=defenderMechanicProfile(defense);
  const enemy=[unit('E1',320),unit('E2',300),unit('E3',280)];
  const risky={squad:[unit('R1',250),unit('R2',240),unit('R3',230)],speedProfile:{known:true,fastestEdge:-70,leaderEdge:-70,medianEdge:-60,risk:24,label:'Severe speed risk'}};
  const answered={squad:[unit('A1',340,"Enemies defeated by this character can't be revived."),unit('A2',330),unit('A3',320)],speedProfile:{known:true,fastestEdge:20,leaderEdge:20,medianEdge:20,risk:0,label:'Healthy speed profile'}};
  const riskyFit=assessCounterMechanicFit(risky,profile,enemy);
  const answeredFit=assessCounterMechanicFit(answered,profile,enemy);
  assert.ok(riskyFit.hardBlockers.some((gate)=>gate.id==='opening-tempo'));
  assert.ok(riskyFit.unresolved.some((gate)=>gate.id==='revive'));
  assert.ok(answeredFit.answered.some((gate)=>gate.id==='opening-tempo'));
  assert.ok(answeredFit.answered.some((gate)=>gate.id==='revive'));
  assert.equal(strictlyBetterFit(answeredFit,riskyFit),true);
  assert.ok(compareFit(answeredFit,riskyFit)<0);
});

test('B15 unknown/unresolved Datacron mechanics do not fabricate selection pressure',()=>{
  const profile=defenderMechanicProfile({datacronState:'assigned',datacron:{id:'DC-X',affixes:[]},members:['E1','E2','E3']});
  assert.equal(profile.selected,true);
  assert.equal(profile.known,false);
  assert.equal(profile.gates.length,0);
});

test('B15 browser UI requires explicit user choice for a mechanic-aware alternate and preserves truth labels',async()=>{
  const source=await readFile(new URL('../public/gac-datacron-counter-intelligence-ui.js',import.meta.url),'utf8');
  assert.match(source,/USE DATACRON-AWARE COUNTER/);
  assert.match(source,/strictly more verified Datacron gates/i);
  assert.match(source,/no arbitrary power multiplier/i);
  assert.match(source,/no predicted win rate/i);
  assert.match(source,/recommendedDatacronId=''/);
});
