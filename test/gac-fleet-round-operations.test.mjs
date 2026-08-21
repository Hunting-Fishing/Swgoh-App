import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  assignmentUsedIds,
  canonicalReady,
  normalizeFleetRow,
  reserveIds,
} from '../public/gac-fleet-round-operations.js';

const ui=fs.readFileSync(new URL('../public/gac-fleet-round-operations.js',import.meta.url),'utf8');
const sync=fs.readFileSync(new URL('../public/gac-fleet-canonical-sync.js',import.meta.url),'utf8');
const bootstrap=fs.readFileSync(new URL('../public/asset-resilience.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../public/gac-fleet-round-operations.css',import.meta.url),'utf8');

test('canonical fleet operations require verified owner opponent and round context',()=>{
  assert.equal(canonicalReady({ownerCode:'111222333',opponentCode:'444555666',round:1}),true);
  assert.equal(canonicalReady({ownerCode:'111222333',opponentCode:'',round:1}),false);
  assert.equal(canonicalReady({ownerCode:'111222333',opponentCode:'444555666',round:0}),false);
});

test('canonical own defense reserve contains capital starters and reinforcements',()=>{
  const ids=reserveIds([{capitalShipBaseId:'CAPITALPROFUNDITY',starters:['OUTRIDER','YWING','FALCON'],reinforcements:['GHOST']}]);
  assert.deepEqual(ids,['CAPITALPROFUNDITY','OUTRIDER','YWING','FALCON','GHOST']);
});

test('operational allocator excludes ships consumed by attempts and active locks',()=>{
  const ids=assignmentUsedIds([
    {status:'planned',members:['CAPITALEXECUTOR','HT','RC','XB'],attemptLog:[]},
    {status:'loss',members:['CAPITALNEGOTIATOR','N1','N2','N3'],attemptLog:[{members:['CAPITALNEGOTIATOR','N1','N2','N3'],status:'loss'}]},
    {status:'abandoned',members:['CAPITALHOMEONE','H1','H2','H3'],attemptLog:[]},
  ]);
  assert.ok(ids.includes('CAPITALEXECUTOR'));
  assert.ok(ids.includes('CAPITALNEGOTIATOR'));
  assert.equal(ids.includes('CAPITALHOMEONE'),false);
});

test('canonical fleet rows retain exact slot and role identity',()=>{
  const row=normalizeFleetRow({id:42,slot:1,zone:'BACK-TOP',capitalShipBaseId:'CAPITALLEVIATHAN',starters:['S1','S2','S3'],reinforcements:['S4'],source:'user-confirmed-current-fleet-board'});
  assert.equal(row.id,'42');
  assert.equal(row.slot,1);
  assert.equal(row.capitalShipBaseId,'CAPITALLEVIATHAN');
  assert.deepEqual(row.starters,['S1','S2','S3']);
  assert.deepEqual(row.reinforcements,['S4']);
});

test('Fleet War Room operational UI exposes canonical board plan lifecycle and explicit role confirmation',()=>{
  assert.match(ui,/current-fleet-board/);
  assert.match(ui,/fleet-attack-plan/);
  assert.match(ui,/fleet-verified-battle/);
  assert.match(ui,/MY DEFENSE FLEETS/);
  assert.match(ui,/Save Canonical Defense/);
  assert.match(ui,/Confirm the attacking starting three/);
  assert.match(ui,/Historical GAHistory proves fleet member identity, not starter-vs-reinforcement roles/);
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
