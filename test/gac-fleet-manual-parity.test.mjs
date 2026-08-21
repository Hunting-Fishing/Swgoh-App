import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { attackOrder } from '../public/gac-attack-order-model.js';
import { fleetRouteId, fleetRouteRows, isFleetRouteId } from '../public/gac-attack-order-ui.js';

test('canonical fleet records become Fleet Territory route rows without colliding with squad defense ids',()=>{
  const rows=fleetRouteRows({fleets:[{id:7,slot:0,complete:true},{id:8,slot:1,complete:true}]},{assignments:[{id:90,defenseFleetId:7,status:'planned'},{id:91,defenseFleetId:8,status:'win'}]});
  assert.equal(rows.defenses.length,2);
  assert.equal(rows.assignments.length,2);
  assert.equal(rows.defenses[0].zone,'BACK-TOP');
  assert.equal(isFleetRouteId(rows.defenses[0].id),true);
  assert.equal(rows.assignments[0].defenseId,fleetRouteId(7));
  assert.equal(rows.assignments[0].planKind,'fleet');
});

test('Fleet Territory remains locked until Front Top clears, then canonical fleet status enters the route',()=>{
  const fleetId=fleetRouteId(7);
  const defenses=[{id:1,zone:'FRONT-TOP',slot:0},{id:fleetId,zone:'BACK-TOP',slot:0}];
  let result=attackOrder({defenses,assignments:[{defenseId:fleetId,status:'planned',planKind:'fleet'}]});
  assert.equal(result.states['BACK-TOP'].unlocked,false);
  assert.ok(result.blocked.some((entry)=>entry.defenseId===fleetId));
  result=attackOrder({defenses,assignments:[{defenseId:1,status:'win'},{defenseId:fleetId,status:'planned',planKind:'fleet'}]});
  assert.equal(result.states['BACK-TOP'].unlocked,true);
  assert.equal(result.next.defenseId,fleetId);
  assert.equal(result.next.status,'planned');
});

test('manual fleet panel reuses canonical fleet action contracts instead of a duplicate backend',async()=>{
  const ui=await readFile(new URL('../public/gac-fleet-manual-parity.js',import.meta.url),'utf8');
  assert.match(ui,/__gacFleetCanonicalOperations/);
  assert.match(ui,/data-gac-fleet-lock/);
  assert.match(ui,/data-gac-fleet-status/);
  assert.match(ui,/data-gac-fleet-result/);
  assert.match(ui,/data-gac-fleet-banners/);
  assert.match(ui,/data-gac-fleet-cleanup-control/);
  assert.match(ui,/FLEET LANE LOCKED/);
  assert.match(ui,/Front Top/);
});

test('attack-order loader includes canonical fleet board and fleet attack-plan APIs',async()=>{
  const ui=await readFile(new URL('../public/gac-attack-order-ui.js',import.meta.url),'utf8');
  assert.match(ui,/\/api\/gac\/current-fleet-board\//);
  assert.match(ui,/\/api\/gac\/fleet-attack-plan\//);
  assert.match(ui,/FLEET_ID_OFFSET/);
  assert.match(ui,/OPEN FLEET PLANNER/);
  assert.match(ui,/gac-fleet-round-state-updated/);
});

test('manual fleet bridge loads after canonical fleet operations and cleanup handlers',async()=>{
  const bootstrap=await readFile(new URL('../public/asset-resilience.js',import.meta.url),'utf8');
  const operations=bootstrap.indexOf("import './gac-fleet-round-operations.js';");
  const cleanup=bootstrap.indexOf("import './gac-fleet-cleanup-control.js';");
  const parity=bootstrap.indexOf("import './gac-fleet-manual-parity.js';");
  assert.ok(operations>=0);
  assert.ok(cleanup>operations);
  assert.ok(parity>cleanup);
});
