import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  allocateFleetCounters,
  compositionMatch,
  crewContextForShip,
  fleetCandidate,
  fleetRosterAvailability,
} from '../public/gac-fleet-war-room-model.js';

const ui=fs.readFileSync(new URL('../public/gac-fleet-war-room.js',import.meta.url),'utf8');
const v3=fs.readFileSync(new URL('../public/gac-war-room-v3.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../public/gac-fleet-war-room.css',import.meta.url),'utf8');

function ship(baseId,name=baseId,power=100000){return {baseId,name,unitType:'Ship',power,stars:7,level:85,abilities:[]};}
function character(baseId,name=baseId,relic=7){return {baseId,name,unitType:'Character',relic,gear:13,power:30000};}
const catalog={units:[
  {...ship('CAPITALEXECUTOR','Executor'),crew:['ADMIRALPIETT']},
  {...ship('HOUNDSTOOTH','Hound’s Tooth'),crew:['BOSSK']},
  {...ship('RAZORCREST','Razor Crest'),crew:['THEMANDALORIANBESKARARMOR']},
  {...ship('XANADUBLOOD','Xanadu Blood'),crew:['CADBANE']},
  {...ship('CAPITALPROFUNDITY','Profundity'),crew:['ADMIRALRADDUS']},
  {...ship('OUTRIDER','Outrider'),crew:['DASHRENDAR']},
  ship('Y-WINGREBEL','Rebel Y-wing'),
  {...ship('MILLENNIUMFALCON','Han’s Millennium Falcon'),crew:['HANSOLO','CHEWBACCA']},
]};
const ownerRoster={units:[
  ship('CAPITALEXECUTOR','Executor',180000),ship('HOUNDSTOOTH','Hound’s Tooth',160000),ship('RAZORCREST','Razor Crest',145000),ship('XANADUBLOOD','Xanadu Blood',135000),
  ship('CAPITALPROFUNDITY','Profundity',175000),ship('OUTRIDER','Outrider',130000),ship('Y-WINGREBEL','Rebel Y-wing',120000),ship('MILLENNIUMFALCON','Han’s Millennium Falcon',150000),
  character('ADMIRALPIETT','Admiral Piett',8),character('BOSSK','Bossk',7),character('THEMANDALORIANBESKARARMOR','Beskar Mando',7),character('CADBANE','Cad Bane',5),
  character('ADMIRALRADDUS','Admiral Raddus',8),character('DASHRENDAR','Dash Rendar',7),character('HANSOLO','Han Solo',8),character('CHEWBACCA','Chewbacca',8),
]};
function defense(slot,capital='CAPITALLEVIATHAN',starters=['SITHFIGHTER','SITHBOMBER','FURYCLASSINTERCEPTOR']){
  return {slot,zone:'BACK-TOP',capitalShipBaseId:capital,starters,reinforcements:[],complete:true};
}
function observation(overrides={}){
  return {
    defenderCapitalShipBaseId:'CAPITALLEVIATHAN',
    defenderMembers:['CAPITALLEVIATHAN','SITHFIGHTER','SITHBOMBER','FURYCLASSINTERCEPTOR'],
    attackerCapitalShipBaseId:'CAPITALEXECUTOR',
    attackerMembers:['CAPITALEXECUTOR','HOUNDSTOOTH','RAZORCREST','XANADUBLOOD'],
    battles:10,wins:8,holds:2,draws:0,observedWinRate:.8,
    reliability:{tier:'strong',rank:4,automatic:true,label:'Strong historical sample'},
    evidenceSources:['c3po-gahistory'],seasons:['S1'],lastObservedAt:'2026-08-20T00:00:00Z',
    ...overrides,
  };
}

test('fleet composition matching distinguishes exact member set, compatible visible subset, and capital-only history',()=>{
  const exact=compositionMatch(defense(0),observation());
  assert.equal(exact.key,'exact-members');
  assert.equal(exact.actionable,true);
  const subset=compositionMatch(defense(0,'CAPITALLEVIATHAN',['SITHFIGHTER','SITHBOMBER','FURYCLASSINTERCEPTOR']),observation({defenderMembers:['CAPITALLEVIATHAN','SITHFIGHTER','SITHBOMBER','FURYCLASSINTERCEPTOR','MARKVIINTERCEPTOR']}));
  assert.equal(subset.key,'observed-subset');
  assert.equal(subset.actionable,true);
  const capitalOnly=compositionMatch(defense(0),observation({defenderMembers:['CAPITALLEVIATHAN','OTHER1','OTHER2','OTHER3']}));
  assert.equal(capitalOnly.key,'capital-only');
  assert.equal(capitalOnly.actionable,false);
});

test('fleet candidate requires every historical attacker ship to be owned and respects manual defense reserves',()=>{
  const candidate=fleetCandidate(ownerRoster,catalog,defense(0),observation(),{});
  assert.equal(candidate.available,true);
  assert.equal(candidate.actionable,true);
  assert.equal(candidate.counterCapitalShipBaseId,'CAPITALEXECUTOR');
  const reserved=fleetCandidate(ownerRoster,catalog,defense(0),observation(),{reservedBaseIds:['CAPITALEXECUTOR']});
  assert.equal(reserved.available,false);
  assert.equal(reserved.actionable,false);
  assert.deepEqual(reserved.reserveUses,['CAPITALEXECUTOR']);
});

test('fleet allocator prevents capital ships and normal ships from being reused across fleet attacks',()=>{
  const defenses=[defense(0),defense(1,'CAPITALPROFUNDITY',['OUTRIDER','Y-WINGREBEL','MILLENNIUMFALCON'])];
  const evidence={results:[
    {enemyCapitalShipBaseId:'CAPITALLEVIATHAN',observations:[observation()]},
    {enemyCapitalShipBaseId:'CAPITALPROFUNDITY',observations:[observation({
      defenderCapitalShipBaseId:'CAPITALPROFUNDITY',
      defenderMembers:['CAPITALPROFUNDITY','OUTRIDER','Y-WINGREBEL','MILLENNIUMFALCON'],
      attackerCapitalShipBaseId:'CAPITALEXECUTOR',
      attackerMembers:['CAPITALEXECUTOR','HOUNDSTOOTH','RAZORCREST','XANADUBLOOD'],
    }),observation({
      defenderCapitalShipBaseId:'CAPITALPROFUNDITY',
      defenderMembers:['CAPITALPROFUNDITY','OUTRIDER','Y-WINGREBEL','MILLENNIUMFALCON'],
      attackerCapitalShipBaseId:'CAPITALPROFUNDITY',
      attackerMembers:['CAPITALPROFUNDITY','OUTRIDER','Y-WINGREBEL','MILLENNIUMFALCON'],
      battles:6,wins:4,observedWinRate:4/6,reliability:{tier:'established',rank:3,automatic:true,label:'Established historical sample'},
    })]},
  ]};
  const plan=allocateFleetCounters(ownerRoster,catalog,defenses,evidence);
  assert.equal(plan.assignments.length,2);
  const used=plan.assignments.flatMap((row)=>row.recommendation.fleetIds);
  assert.equal(new Set(used).size,used.length,'no ship may appear in two fleet allocations');
  assert.equal(new Set(plan.assignments.map((row)=>row.recommendation.counterCapitalShipBaseId)).size,2,'capital ships are scarce resources');
});

test('crew context reports real owned crew relics without converting crew strength into a fake outcome score',()=>{
  const executor=ownerRoster.units.find((unit)=>unit.baseId==='CAPITALEXECUTOR');
  const context=crewContextForShip(executor,ownerRoster,catalog);
  assert.equal(context.known,true);
  assert.equal(context.crew[0].name,'Admiral Piett');
  assert.equal(context.crew[0].relic,8);
  assert.equal(context.minimumRelic,8);
});

test('fleet roster availability separates AVAILABLE, ALLOCATED, and DEFENSE RESERVED ships',()=>{
  const plan={assignments:[{recommendation:{fleetIds:['CAPITALEXECUTOR','HOUNDSTOOTH','RAZORCREST','XANADUBLOOD']}}]};
  const availability=fleetRosterAvailability(ownerRoster,plan,['CAPITALPROFUNDITY','OUTRIDER']);
  assert.equal(availability.rows.find((row)=>row.baseId==='CAPITALEXECUTOR').status,'allocated');
  assert.equal(availability.rows.find((row)=>row.baseId==='CAPITALPROFUNDITY').status,'reserved');
  assert.equal(availability.rows.find((row)=>row.baseId==='Y-WINGREBEL').status,'available');
});

test('Fleet War Room is wired into GAC v3 with evidence endpoint, local reserves, source gate and no fleet heuristic fallback',()=>{
  assert.match(v3,/import '\.\/gac-fleet-war-room\.js'/);
  assert.match(ui,/\/api\/gac\/fleet\/counters\/batch/);
  assert.match(ui,/OWN-DEFENSE FLEET RESERVE/);
  assert.match(ui,/Capital \+ ships cannot overlap/);
  assert.match(ui,/Historical fleet battles only/);
  assert.match(ui,/observed rate is not a predicted win probability/i);
  assert.match(ui,/EXECUTION GUIDANCE · SOURCE GATED/);
  assert.match(ui,/No opening sequence, reinforcement call order, target priority, or timing instruction is generated/);
  assert.doesNotMatch(ui,/ROSTER-FIT HEURISTIC/);
  assert.match(css,/\.gac-fleet-command/);
  assert.match(css,/\.gac-fleet-brief/);
});
