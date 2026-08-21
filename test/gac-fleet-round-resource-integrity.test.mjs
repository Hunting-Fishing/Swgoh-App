import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assignmentConsumedOrActiveIds,
  createGacFleetBoardService,
  overlapIds,
} from '../gac-fleet-board-service.mjs';

function eq(value){return String(value??'').startsWith('eq.')?String(value).slice(3):null;}
function makeStore(){
  const tables={gac_round_fleets:[],gac_fleet_attack_plan_assignments:[]};
  let id=100;
  function matches(row,key,value){const expected=eq(value);return expected===null||String(row[key])===expected;}
  return {
    tables,
    async select(table,query={}){
      const ignored=new Set(['select','limit','order']);
      let rows=[...(tables[table]||[])];
      for(const [key,value] of Object.entries(query)){if(ignored.has(key)||value==null)continue;rows=rows.filter((row)=>matches(row,key,value));}
      if(query.limit)rows=rows.slice(0,Number(query.limit));
      return rows.map((row)=>structuredClone(row));
    },
    async insert(table,rows){const saved=rows.map((row)=>({...structuredClone(row),id:row.id??++id}));tables[table].push(...saved);return saved.map((row)=>structuredClone(row));},
    async delete(table,query={}){
      const removed=[];
      tables[table]=tables[table].filter((row)=>{const ok=Object.entries(query).every(([key,value])=>matches(row,key,value));if(ok)removed.push(row);return !ok;});
      return removed.map((row)=>structuredClone(row));
    },
  };
}

const resolved={
  userId:'user-1',allyCode:'111222333',opponentAllyCode:'444555666',eventInstanceId:'event-1',round:1,
  roundRow:{id:'round-1'},confirmed:{opponent:{allyCode:'444555666',name:'Opponent'}},
};
const rounds={async resolveRound(){return resolved;}};
function fleet(capital,starters,reinforcements=[]){return {capitalShipBaseId:capital,starters,reinforcements,zone:'BACK-TOP'};}

function assignment(overrides={}){
  return {
    id:501,
    round_id:'round-1',
    defense_fleet_id:301,
    attacker_members:['CAPITALEXECUTOR','HT','RC','XB'],
    status:'planned',
    attempt_count:0,
    attempt_log:[],
    ...overrides,
  };
}

test('same roster owner cannot save the same fleet unit into two defense fleet slots',async()=>{
  const store=makeStore();
  const service=createGacFleetBoardService({store,rounds});
  await service.saveDefense('user-1',{...fleet('CAPITALLEVIATHAN',['SITH1','SITH2','SITH3']),slot:0});
  await assert.rejects(
    service.saveDefense('user-1',{...fleet('CAPITALNEGOTIATOR',['SITH3','N2','N3']),slot:1}),
    /same fleet unit cannot be saved in multiple enemy-defense slots.*SITH3/i,
  );
  assert.equal(store.tables.gac_round_fleets.length,1);
});

test('resource uniqueness is scoped by roster owner, not globally by Base ID',async()=>{
  const store=makeStore();
  const service=createGacFleetBoardService({store,rounds});
  await service.saveDefense('user-1',{...fleet('CAPITALLEVIATHAN',['SITH1','SITH2','SITH3']),slot:0});
  const own=await service.savePlayerDefense('user-1',{...fleet('CAPITALLEVIATHAN',['SITH1','SITH2','SITH3']),slot:0});
  assert.equal(own.saved,true);
  assert.equal(store.tables.gac_round_fleets.length,2);
});

test('my-defense save rejects ships currently locked on offense',async()=>{
  const store=makeStore();
  store.tables.gac_fleet_attack_plan_assignments.push(assignment());
  const service=createGacFleetBoardService({store,rounds});
  await assert.rejects(
    service.savePlayerDefense('user-1',{...fleet('CAPITALPROFUNDITY',['OUTRIDER','HT','FALCON']),slot:0}),
    /already allocated or consumed on offense.*HT/i,
  );
  assert.equal(store.tables.gac_round_fleets.length,0);
});

test('my-defense save rejects ships consumed by a completed loss even when no active lock remains',async()=>{
  const store=makeStore();
  store.tables.gac_fleet_attack_plan_assignments.push(assignment({
    status:'loss',
    attempt_count:1,
    attacker_members:['CAPITALPROFUNDITY','OUTRIDER','YWING','FALCON'],
    attempt_log:[{
      capitalShipBaseId:'CAPITALEXECUTOR',
      starters:['HT','RC','XB'],
      reinforcements:['IG2000'],
      members:['CAPITALEXECUTOR','HT','RC','XB','IG2000'],
      status:'loss',
      at:'2026-08-21T04:00:00Z',
    }],
  }));
  const service=createGacFleetBoardService({store,rounds});
  await assert.rejects(
    service.savePlayerDefense('user-1',{...fleet('CAPITALHOMEONE',['BISTAN','RC','BIGGS']),slot:0}),
    /already allocated or consumed on offense.*RC/i,
  );
});

test('abandoned attack fleet with no recorded attempt is released and may be documented on defense',async()=>{
  const store=makeStore();
  store.tables.gac_fleet_attack_plan_assignments.push(assignment({status:'abandoned',attempt_count:0,attempt_log:[]}));
  const service=createGacFleetBoardService({store,rounds});
  const saved=await service.savePlayerDefense('user-1',{...fleet('CAPITALEXECUTOR',['HT','RC','XB']),slot:0});
  assert.equal(saved.saved,true);
  assert.equal(saved.fleet.capitalShipBaseId,'CAPITALEXECUTOR');
});

test('editing the same defense slot may retain its own ships without self-conflict',async()=>{
  const store=makeStore();
  const service=createGacFleetBoardService({store,rounds});
  await service.savePlayerDefense('user-1',{...fleet('CAPITALPROFUNDITY',['OUTRIDER','YWING','FALCON']),slot:0});
  const edited=await service.savePlayerDefense('user-1',{...fleet('CAPITALPROFUNDITY',['OUTRIDER','YWING','FALCON'],['GHOST']),slot:0});
  assert.equal(edited.saved,true);
  assert.deepEqual(edited.fleet.reinforcements,['GHOST']);
  assert.equal(store.tables.gac_round_fleets.filter((row)=>row.owner==='player').length,1);
});

test('helper resource extraction treats attempts as consumed and only planned/attempted current fleets as active',()=>{
  assert.deepEqual(
    assignmentConsumedOrActiveIds(assignment({status:'abandoned',attacker_members:['A','B','C','D'],attempt_log:[]})),
    [],
  );
  const ids=assignmentConsumedOrActiveIds(assignment({
    status:'loss',
    attacker_members:['UNUSED1','UNUSED2','UNUSED3','UNUSED4'],
    attempt_log:[{members:['CAPITAL1','SHIP1','SHIP2','SHIP3'],status:'loss'}],
  }));
  assert.deepEqual(ids,['CAPITAL1','SHIP1','SHIP2','SHIP3']);
  assert.deepEqual(overlapIds(['A','B','C'],['C','D']),['C']);
});
