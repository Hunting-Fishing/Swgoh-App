import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { attackOrder, territoryStates } from '../public/gac-attack-order-model.js';

const defenses=[
  {id:1,zone:'FRONT-TOP',slot:0},{id:2,zone:'FRONT-TOP',slot:1},
  {id:3,zone:'BACK-TOP',slot:0},
  {id:4,zone:'FRONT-BOTTOM',slot:0},{id:5,zone:'BACK-BOTTOM',slot:0},
];

test('back territories stay locked until their exact corresponding front territory is cleared',()=>{
  let states=territoryStates(defenses,[]);
  assert.equal(states['BACK-TOP'].unlocked,false);
  assert.equal(states['BACK-BOTTOM'].unlocked,false);
  states=territoryStates(defenses,[{defenseId:1,status:'win'},{defenseId:2,status:'win'}]);
  assert.equal(states['BACK-TOP'].unlocked,true);
  assert.equal(states['BACK-BOTTOM'].unlocked,false);
  states=territoryStates(defenses,[{defenseId:4,status:'win'}]);
  assert.equal(states['BACK-TOP'].unlocked,false);
  assert.equal(states['BACK-BOTTOM'].unlocked,true);
});

test('the last front defense that unlocks a back lane outranks an ordinary accessible defense',()=>{
  const result=attackOrder({
    defenses,
    assignments:[{defenseId:1,status:'win'}],
    openPlan:[{defenseId:2,recommendation:{squad:[{baseId:'A'}]}},{defenseId:4,recommendation:{squad:[{baseId:'B'}]}}],
  });
  assert.equal(result.next.defenseId,2);
  assert.match(result.next.reason,/unlocks Fleet Territory/i);
  assert.ok(result.blocked.some((entry)=>entry.defenseId===3));
});

test('an attempt already in progress becomes the highest operational priority',()=>{
  const result=attackOrder({defenses,assignments:[{id:20,defenseId:4,status:'attempted'}],openPlan:[{defenseId:1,recommendation:{squad:[{baseId:'A'}]}}]});
  assert.equal(result.next.defenseId,4);
  assert.equal(result.next.status,'attempted');
  assert.match(result.next.reason,/resolve its result/i);
});

test('loss cleanup state is prioritized and never described as a win probability',()=>{
  const result=attackOrder({defenses,assignments:[{id:30,defenseId:4,status:'loss',attemptLog:[{status:'loss'}]}],openPlan:[]});
  assert.equal(result.next.defenseId,4);
  assert.match(result.next.reason,/confirmed-survivor cleanup/i);
  assert.doesNotMatch(result.next.reason,/probability|win rate/i);
});

test('attack-order UI is wired to the authoritative plan and verified board',async()=>{
  const ui=await readFile(new URL('../public/gac-attack-order-ui.js',import.meta.url),'utf8');
  const bootstrap=await readFile(new URL('../public/asset-resilience.js',import.meta.url),'utf8');
  assert.match(ui,/buildOpenWarRoomPlan/);
  assert.match(ui,/\/api\/gac\/attack-plan\//);
  assert.match(ui,/\/api\/gac\/current-board\//);
  assert.match(ui,/TACTICAL ROUTE · BOARD ORDER/);
  assert.match(ui,/Operational priority only/);
  assert.match(ui,/gac-visible-defense\[data-defense-id/);
  assert.match(bootstrap,/import '\.\/gac-attack-order-ui\.js';/);
});
