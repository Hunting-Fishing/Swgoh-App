import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  mutationPolicy,
  normalizeFleet,
} from '../gac-fleet-board-service.mjs';
import {
  normalizeAttackFleet,
  transitionAllowed,
} from '../gac-fleet-attack-plan-service.mjs';

const migration=fs.readFileSync(new URL('../supabase/migrations/20260821033548_gac_fleet_round_state.sql',import.meta.url),'utf8');
const boardApi=fs.readFileSync(new URL('../gac-fleet-board-api.mjs',import.meta.url),'utf8');
const planApi=fs.readFileSync(new URL('../gac-fleet-attack-plan-api.mjs',import.meta.url),'utf8');
const battleApi=fs.readFileSync(new URL('../gac-fleet-verified-battle-api.mjs',import.meta.url),'utf8');
const router=fs.readFileSync(new URL('../gac-current-opponent-confirmation-api.mjs',import.meta.url),'utf8');

test('fleet schema uses parallel canonical round and plan tables with explicit role fields',()=>{
  assert.match(migration,/create table if not exists public\.gac_round_fleets/);
  assert.match(migration,/create table if not exists public\.gac_fleet_attack_plan_assignments/);
  assert.match(migration,/capital_ship_base_id text not null/);
  assert.match(migration,/starters jsonb not null/);
  assert.match(migration,/reinforcements jsonb not null/);
  assert.match(migration,/jsonb_array_length\(starters\) = 3/);
  assert.match(migration,/jsonb_array_length\(reinforcements\) <= 4/);
  assert.match(migration,/unique\(round_id, defense_fleet_id\)/);
  assert.match(migration,/enable row level security/);
  assert.match(migration,/revoke all on public\.gac_round_fleets, public\.gac_fleet_attack_plan_assignments from anon, authenticated/);
});

test('fleet observation normalization requires one capital, exact starting three and unique optional reinforcements',()=>{
  const row=normalizeFleet({capitalShipBaseId:'capitalexecutor',starters:['a','b','c'],reinforcements:['d','e']});
  assert.equal(row.capitalShipBaseId,'CAPITALEXECUTOR');
  assert.deepEqual(row.starters,['A','B','C']);
  assert.deepEqual(row.reinforcements,['D','E']);
  assert.deepEqual(row.members,['CAPITALEXECUTOR','A','B','C','D','E']);
  assert.throws(()=>normalizeFleet({capitalShipBaseId:'CAPITALEXECUTOR',starters:['A','B'],reinforcements:[]}),/exactly three starting ships/i);
  assert.throws(()=>normalizeFleet({capitalShipBaseId:'CAPITALEXECUTOR',starters:['A','B','C'],reinforcements:['D','E','F','G','H']}),/at most four reinforcements/i);
});

test('fleet attack lock refuses to infer historical starter roles',()=>{
  assert.throws(()=>normalizeAttackFleet({capitalShipBaseId:'CAPITALEXECUTOR',starters:[],reinforcements:['A','B','C']}),/Confirm exactly three starting ships/i);
  const fleet=normalizeAttackFleet({capitalShipBaseId:'CAPITALEXECUTOR',starters:['A','B','C'],reinforcements:['D']});
  assert.equal(fleet.starters.length,3);
  assert.deepEqual(fleet.reinforcements,['D']);
});

test('fleet plan lifecycle follows planned -> attempted -> result and prevents completed rewrites',()=>{
  assert.equal(transitionAllowed('planned','attempted'),true);
  assert.equal(transitionAllowed('planned','win'),true);
  assert.equal(transitionAllowed('planned','loss'),true);
  assert.equal(transitionAllowed('planned','abandoned'),true);
  assert.equal(transitionAllowed('attempted','win'),true);
  assert.equal(transitionAllowed('attempted','loss'),true);
  assert.equal(transitionAllowed('win','planned'),false);
  assert.equal(transitionAllowed('loss','attempted'),false);
});

test('fleet board mutation policy protects locked and attempted fleet history',()=>{
  assert.equal(mutationPolicy(null).allowed,true);
  assert.deepEqual(mutationPolicy({id:1,status:'planned',attempt_count:0,attempt_log:[]}).code,'locked');
  assert.deepEqual(mutationPolicy({id:1,status:'loss',attempt_count:1,attempt_log:[{}]}).code,'history');
  assert.equal(mutationPolicy({id:1,status:'abandoned',attempt_count:0,attempt_log:[]}).allowed,true);
});

test('canonical fleet APIs are authenticated round-scoped routes and reject Datacrons',()=>{
  assert.ok(boardApi.includes('current-fleet-board'));
  assert.ok(boardApi.includes('defense|my-defense'));
  assert.match(boardApi,/Datacrons do not apply to fleet defenses/);
  assert.match(boardApi,/current live roster/);
  assert.ok(planApi.includes('fleet-attack-plan'));
  assert.match(planApi,/exactly three user-confirmed starters/);
  assert.match(planApi,/Datacrons do not apply to fleet attacks/);
  assert.ok(battleApi.includes('fleet-verified-battle'));
  assert.match(battleApi,/confirm: body\?\.confirm === true/);
});

test('main GAC confirmation router composes all three canonical fleet handlers',()=>{
  assert.match(router,/createGacFleetBoardApi/);
  assert.match(router,/createGacFleetAttackPlanApi/);
  assert.match(router,/createGacFleetVerifiedBattleApi/);
  assert.match(router,/await fleetBoardApi\.handle/);
  assert.match(router,/await fleetAttackPlanApi\.handle/);
  assert.match(router,/await fleetVerifiedBattleApi\.handle/);
});
