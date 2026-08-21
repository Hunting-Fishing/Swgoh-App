import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  createGacFleetCleanupObservationService,
  latestObservations,
  normalizeObservationUnits,
  optionalPercent,
} from '../gac-fleet-cleanup-observation-service.mjs';

function eq(value){return String(value??'').startsWith('eq.')?String(value).slice(3):null;}
function makeStore(){
  const tables={
    gac_fleet_attack_plan_assignments:[{
      id:501,
      round_id:'round-1',
      defense_fleet_id:301,
      source:'verified-owner-fleet-war-room',
      attempt_log:[{
        capitalShipBaseId:'CAPITALEXECUTOR',
        starters:['HT','RC','XB'],
        reinforcements:['IG2000'],
        members:['CAPITALEXECUTOR','HT','RC','XB','IG2000'],
        status:'loss',
        banners:12,
        at:'2026-08-21T04:00:00Z',
      }],
    }],
    gac_round_fleets:[{
      id:301,
      round_id:'round-1',
      owner:'opponent',
      side:'defense',
      source:'user-confirmed-current-fleet-board',
      zone:'BACK-TOP',
      fleet_slot:0,
      capital_ship_base_id:'CAPITALLEVIATHAN',
      starters:['SITH1','SITH2','SITH3'],
      reinforcements:['SITH4'],
      members:['CAPITALLEVIATHAN','SITH1','SITH2','SITH3','SITH4'],
    }],
    gac_fleet_cleanup_observations:[],
  };
  let id=900;
  function matches(row,key,value){const expected=eq(value);return expected===null||String(row[key])===expected;}
  return {
    tables,
    async select(table,query={}){
      const ignored=new Set(['select','limit','order']);
      let rows=[...(tables[table]||[])];
      for(const [key,value] of Object.entries(query)){if(ignored.has(key)||value==null)continue;rows=rows.filter((row)=>matches(row,key,value));}
      if(query.order?.includes('revision.desc'))rows.sort((a,b)=>Number(b.revision)-Number(a.revision));
      if(query.order?.includes('revision.asc'))rows.sort((a,b)=>Number(a.assignment_id)-Number(b.assignment_id)||Number(a.attempt_index)-Number(b.attempt_index)||Number(a.revision)-Number(b.revision));
      if(query.limit)rows=rows.slice(0,Number(query.limit));
      return rows.map((row)=>structuredClone(row));
    },
    async insert(table,rows){const saved=rows.map((row)=>({...structuredClone(row),id:row.id??++id}));tables[table].push(...saved);return saved.map((row)=>structuredClone(row));},
  };
}

const resolved={
  userId:'user-1',allyCode:'111222333',opponentAllyCode:'444555666',eventInstanceId:'event-1',round:1,
  roundRow:{id:'round-1'},confirmed:{opponent:{allyCode:'444555666',name:'Opponent'}},
};
const boards={async resolveRound(){return resolved;}};
const defense={capital_ship_base_id:'CAPITALLEVIATHAN',starters:['SITH1','SITH2','SITH3'],reinforcements:['SITH4'],members:['CAPITALLEVIATHAN','SITH1','SITH2','SITH3','SITH4']};

test('post-loss observation fills unreported original fleet members as unknown instead of inferring them',()=>{
  const rows=normalizeObservationUnits([{baseId:'SITH1',status:'destroyed'},{baseId:'CAPITALLEVIATHAN',status:'alive',healthPct:44}],defense);
  assert.equal(rows.length,5);
  assert.equal(rows.find((row)=>row.baseId==='SITH1').status,'destroyed');
  assert.equal(rows.find((row)=>row.baseId==='CAPITALLEVIATHAN').healthPct,44);
  assert.equal(rows.find((row)=>row.baseId==='SITH2').status,'unknown');
  assert.equal(rows.find((row)=>row.baseId==='SITH2').turnMeterPct,null);
});

test('manual telemetry accepts only explicit 0-100 values and only for ships observed alive',()=>{
  assert.equal(optionalPercent('45.26','TM'),45.3);
  assert.throws(()=>optionalPercent(101,'TM'),/0 to 100/);
  assert.throws(()=>normalizeObservationUnits([{baseId:'SITH1',status:'destroyed',turnMeterPct:0}],defense),/only be entered for a ship explicitly observed alive/i);
  assert.throws(()=>normalizeObservationUnits([{baseId:'SITH1',status:'unknown'}],defense),/Confirm at least one enemy ship as Alive or Destroyed/i);
});

test('cleanup observations are append-only revisions tied to a recorded loss attempt',async()=>{
  const store=makeStore();
  const service=createGacFleetCleanupObservationService({store,boards,now:(()=>{let i=0;return()=>new Date(`2026-08-21T04:${10+i++}:00Z`);})()});
  const first=await service.saveObservation('user-1',{assignmentId:501,attemptIndex:0,units:[{baseId:'CAPITALLEVIATHAN',status:'alive',healthPct:50},{baseId:'SITH1',status:'destroyed'}]});
  const second=await service.saveObservation('user-1',{assignmentId:501,attemptIndex:0,units:[{baseId:'CAPITALLEVIATHAN',status:'alive',healthPct:40},{baseId:'SITH1',status:'destroyed'},{baseId:'SITH2',status:'alive'}]});
  assert.equal(first.observation.revision,1);
  assert.equal(second.observation.revision,2);
  assert.equal(store.tables.gac_fleet_cleanup_observations.length,2);
  const body=await service.getObservations('user-1',{});
  assert.equal(body.observations.length,2);
  assert.equal(body.latest.length,1);
  assert.equal(body.latest[0].revision,2);
  assert.equal(body.scope.hiddenStateInference,false);
  assert.equal(body.scope.predictedWinProbability,false);
});

test('cleanup state refuses non-loss attempts and foreign fleet units',async()=>{
  const store=makeStore();
  store.tables.gac_fleet_attack_plan_assignments[0].attempt_log[0].status='win';
  const service=createGacFleetCleanupObservationService({store,boards});
  await assert.rejects(service.saveObservation('user-1',{assignmentId:501,attemptIndex:0,units:[{baseId:'CAPITALLEVIATHAN',status:'alive'}]}),/only be attached to a recorded Fleet War Room loss/i);
  store.tables.gac_fleet_attack_plan_assignments[0].attempt_log[0].status='loss';
  await assert.rejects(service.saveObservation('user-1',{assignmentId:501,attemptIndex:0,units:[{baseId:'NOT_IN_DEFENSE',status:'alive'}]}),/only reference ships from the verified saved enemy fleet/i);
});

test('latest observation selection preserves historical revisions while returning the newest current view',()=>{
  const rows=[
    {id:1,assignment_id:5,defense_fleet_id:3,attempt_index:0,revision:1,observed_units:[],source:'x'},
    {id:2,assignment_id:5,defense_fleet_id:3,attempt_index:0,revision:3,observed_units:[],source:'x'},
    {id:3,assignment_id:5,defense_fleet_id:3,attempt_index:0,revision:2,observed_units:[],source:'x'},
  ];
  assert.equal(latestObservations(rows)[0].revision,3);
});

const migration=fs.readFileSync(new URL('../supabase/migrations/20260821035813_gac_fleet_cleanup_observations.sql',import.meta.url),'utf8');
const api=fs.readFileSync(new URL('../gac-fleet-cleanup-observation-api.mjs',import.meta.url),'utf8');
const router=fs.readFileSync(new URL('../gac-current-opponent-confirmation-api.mjs',import.meta.url),'utf8');
const ui=fs.readFileSync(new URL('../public/gac-fleet-cleanup-control.js',import.meta.url),'utf8');
const bootstrap=fs.readFileSync(new URL('../public/asset-resilience.js',import.meta.url),'utf8');

test('cleanup schema is append-only service-role storage tied to canonical fleet attempts',()=>{
  assert.match(migration,/create table if not exists public\.gac_fleet_cleanup_observations/);
  assert.match(migration,/assignment_id bigint not null references public\.gac_fleet_attack_plan_assignments/);
  assert.match(migration,/attempt_index integer not null/);
  assert.match(migration,/revision integer not null/);
  assert.match(migration,/unique\(assignment_id, attempt_index, revision\)/);
  assert.match(migration,/enable row level security/);
  assert.match(migration,/revoke all on public\.gac_fleet_cleanup_observations from anon, authenticated/);
});

test('cleanup API and router share verified current-round authority',()=>{
  assert.ok(api.includes('/api/gac/fleet-cleanup/'));
  assert.match(api,/Confirm the current opponent before saving or loading fleet cleanup state/);
  assert.match(api,/assertSameOrigin/);
  assert.match(router,/createGacFleetCleanupObservationApi/);
  assert.match(router,/await fleetCleanupObservationApi\.handle/);
});

test('Fleet Cleanup Control blocks residual inference and labels historical references correctly',()=>{
  assert.match(ui,/POST-LOSS STATE REQUIRED/);
  assert.match(ui,/DO NOT REPLAN FROM THE ORIGINAL BOARD SNAPSHOT/);
  assert.match(ui,/Unknown remains unknown/);
  assert.match(ui,/FULL-FLEET HISTORICAL REFERENCE/);
  assert.match(ui,/not residual-specific win rates/);
  assert.match(ui,/residual state not represented by this sample/);
  assert.match(ui,/Confirm the cleanup starting three/);
  assert.match(ui,/Lock Cleanup Fleet/);
  assert.match(ui,/gac-command-center-fleet-cleanup-lock/);
  assert.match(bootstrap,/import '\.\/gac-fleet-cleanup-control\.js'/);
});
