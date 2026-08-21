import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ui=fs.readFileSync(new URL('../public/gac-fleet-round-operations.js',import.meta.url),'utf8');
const sync=fs.readFileSync(new URL('../public/gac-fleet-canonical-sync.js',import.meta.url),'utf8');
const bootstrap=fs.readFileSync(new URL('../public/asset-resilience.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../public/gac-fleet-round-operations.css',import.meta.url),'utf8');

test('Fleet War Room operational UI requires verified owner opponent and round context',()=>{
  assert.match(ui,/function canonicalReady\(snapshot\)/);
  assert.match(ui,/ownerCode/);
  assert.match(ui,/opponentCode/);
  assert.match(ui,/\[1,2,3\]\.includes\(Number\(snapshot\?\.round\)\)/);
});

test('canonical own defense reserve covers capital starters and reinforcements',()=>{
  assert.match(ui,/function reserveIds\(rows = \[\]\)/);
  assert.match(ui,/row\.capitalShipBaseId/);
  assert.match(ui,/\.\.\.\(row\.starters\|\|\[\]\)/);
  assert.match(ui,/\.\.\.\(row\.reinforcements\|\|\[\]\)/);
});

test('operational allocator reserves completed attempts and active locks',()=>{
  assert.match(ui,/function assignmentUsedIds\(assignments = \[\]\)/);
  assert.match(ui,/attemptLog/);
  assert.match(ui,/\['planned','attempted'\]\.includes\(status\)/);
  assert.match(ui,/allocateFleetCounters/);
  assert.match(ui,/assignmentUsedIds\(state\.assignments\)/);
});

test('Fleet War Room operational UI exposes canonical board plan lifecycle and explicit role confirmation',()=>{
  assert.match(ui,/current-fleet-board/);
  assert.match(ui,/fleet-attack-plan/);
  assert.match(ui,/fleet-verified-battle/);
  assert.match(ui,/MY DEFENSE FLEETS/);
  assert.match(ui,/Save Canonical Defense/);
  assert.match(ui,/Confirm the attacking starting three/);
  assert.match(ui,/Historical GAHistory proves fleet member identity, not starter-vs-reinforcement roles/);
  assert.match(ui,/selected\.size===3/);
  assert.match(ui,/Lock Canonical Fleet Counter/);
  assert.match(ui,/Start Attempt/);
  assert.match(ui,/Record Win/);
  assert.match(ui,/Record Loss/);
  assert.match(ui,/Release Counter/);
  assert.match(ui,/Archive Verified Evidence/);
  assert.match(ui,/confirm:true/);
  assert.match(ui,/No roster-fit fleet guess is generated/);
});

test('canonical sync retains local recovery fallback while hydrating verified enemy fleet state',()=>{
  assert.match(sync,/migrateLocal:true/);
  assert.match(sync,/local-fallback/);
  assert.match(sync,/current-fleet-board/);
  assert.match(sync,/hydrateLocal/);
  assert.match(sync,/gac-fleet-canonical-updated/);
});

test('canonical operations are loaded through the asset bootstrap and visually supersede local reserve/order controls',()=>{
  assert.match(bootstrap,/import '\.\/gac-fleet-round-operations\.js'/);
  assert.match(css,/gac-fleet-canonical-active \.gac-fleet-command \.gac-fleet-order/);
  assert.match(css,/gac-fleet-canonical-active \.gac-fleet-command \.gac-fleet-reserve/);
  assert.match(css,/\.gac-fleet-role-editor/);
  assert.match(css,/\.gac-fleet-own-defense/);
  assert.match(css,/\.gac-fleet-canonical-plans/);
});
