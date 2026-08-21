import test from 'node:test';
import assert from 'node:assert/strict';
import { createGacFleetBoardService } from '../gac-fleet-board-service.mjs';
import { createGacFleetAttackPlanService } from '../gac-fleet-attack-plan-service.mjs';
import { createGacFleetVerifiedBattleService } from '../gac-fleet-verified-battle-service.mjs';

function eq(value){return String(value??'').startsWith('eq.')?String(value).slice(3):null;}
function inFilter(value){
  const text=String(value??'');
  if(!text.startsWith('in.(')||!text.endsWith(')'))return null;
  return text.slice(4,-1).split(',');
}
function makeStore(){
  const tables={
    gac_round_fleets:[],
    gac_fleet_attack_plan_assignments:[],
    gac_events:[{id:'event-row',event_instance_id:'event-1',season_id:'S100',format:'5v5'}],
    gac_battles:[],
  };
  let ids=100;
  function matches(row,key,value){
    const equal=eq(value); if(equal!==null)return String(row[key])===equal;
    const values=inFilter(value); if(values)return values.includes(String(row[key]));
    return true;
  }
  return {
    tables,
    async select(table,query={}){
      const ignored=new Set(['select','limit','order']);
      let rows=[...(tables[table]||[])];
      for(const [key,value] of Object.entries(query)){
        if(ignored.has(key)||value==null)continue;
        rows=rows.filter((row)=>matches(row,key,value));
      }
      if(query.order?.includes('fleet_slot.asc'))rows.sort((a,b)=>Number(a.fleet_slot)-Number(b.fleet_slot));
      if(query.limit)rows=rows.slice(0,Number(query.limit));
      return rows.map((row)=>structuredClone(row));
    },
    async insert(table,rows){
      const saved=rows.map((row)=>({...structuredClone(row),id:row.id??++ids}));
      tables[table].push(...saved);
      return saved.map((row)=>structuredClone(row));
    },
    async upsert(table,rows,{onConflict}={}){
      const keys=String(onConflict||'').split(',').filter(Boolean);
      const saved=[];
      for(const raw of rows){
        const row=structuredClone(raw);
        let index=-1;
        if(keys.length)index=tables[table].findIndex((current)=>keys.every((key)=>String(current[key])===String(row[key])));
        if(index>=0){tables[table][index]={...tables[table][index],...row};saved.push(tables[table][index]);}
        else{const value={...row,id:row.id??++ids};tables[table].push(value);saved.push(value);}
      }
      return saved.map((row)=>structuredClone(row));
    },
    async update(table,patch,query={}){
      const updated=[];
      tables[table]=tables[table].map((row)=>{
        const ok=Object.entries(query).every(([key,value])=>matches(row,key,value));
        if(!ok)return row;
        const next={...row,...structuredClone(patch)};updated.push(next);return next;
      });
      return updated.map((row)=>structuredClone(row));
    },
    async delete(table,query={}){
      const removed=[];
      tables[table]=tables[table].filter((row)=>{
        const ok=Object.entries(query).every(([key,value])=>matches(row,key,value));
        if(ok)removed.push(row);
        return !ok;
      });
      return removed.map((row)=>structuredClone(row));
    },
  };
}

const resolved={
  userId:'user-1',
  allyCode:'111222333',
  opponentAllyCode:'444555666',
  eventInstanceId:'event-1',
  round:1,
  roundRow:{id:'round-1'},
  event:{id:'event-row'},
  player:{id:'player-row',swgoh_player_id:'PLAYER123'},
  confirmed:{opponent:{allyCode:'444555666',name:'Opponent',playerId:'OPP123'}},
};
const rounds={async resolveRound(){return resolved;}};

function fleet(capital,starters,reinforcements=[]){return {capitalShipBaseId:capital,starters,reinforcements,zone:'BACK-TOP'};}

test('canonical fleet board persists enemy and own defense compositions by verified round slot',async()=>{
  const store=makeStore();
  const service=createGacFleetBoardService({store,rounds,now:()=>new Date('2026-08-21T03:00:00Z')});
  const enemy=await service.saveDefense('user-1',{...fleet('CAPITALLEVIATHAN',['SITH1','SITH2','SITH3'],['SITH4']),slot:0});
  const own=await service.savePlayerDefense('user-1',{...fleet('CAPITALPROFUNDITY',['OUTRIDER','YWING','FALCON'],['GHOST']),slot:0});
  assert.equal(enemy.fleet.capitalShipBaseId,'CAPITALLEVIATHAN');
  assert.equal(own.owner,'player');
  const enemyBoard=await service.getDefenses('user-1',{});
  const ownBoard=await service.getPlayerDefenses('user-1',{});
  assert.equal(enemyBoard.fleets.length,1);
  assert.equal(ownBoard.fleets.length,1);
  assert.deepEqual(ownBoard.fleets[0].starters,['OUTRIDER','YWING','FALCON']);
  assert.equal(ownBoard.fleets[0].metadata.datacronApplicable,false);
});

test('fleet attack plan automatically excludes canonical own-defense fleets and prevents ship reuse',async()=>{
  const store=makeStore();
  const boards=createGacFleetBoardService({store,rounds});
  const enemy1=await boards.saveDefense('user-1',{...fleet('CAPITALLEVIATHAN',['SITH1','SITH2','SITH3']),slot:0});
  const enemy2=await boards.saveDefense('user-1',{...fleet('CAPITALNEGOTIATOR',['N1','N2','N3']),slot:1});
  await boards.savePlayerDefense('user-1',{...fleet('CAPITALPROFUNDITY',['OUTRIDER','YWING','FALCON'],['GHOST']),slot:0});
  const plans=createGacFleetAttackPlanService({store,boards,now:()=>new Date('2026-08-21T03:10:00Z')});
  await assert.rejects(
    plans.saveAssignment('user-1',{defenseFleetId:enemy1.fleet.id,...fleet('CAPITALPROFUNDITY',['OUTRIDER','YWING','FALCON'])}),
    /already reserved on defense, allocated, or consumed/i,
  );
  const first=await plans.saveAssignment('user-1',{defenseFleetId:enemy1.fleet.id,...fleet('CAPITALEXECUTOR',['HT','RC','XB'],['IG2000'])});
  assert.equal(first.assignment.status,'planned');
  await assert.rejects(
    plans.saveAssignment('user-1',{defenseFleetId:enemy2.fleet.id,...fleet('CAPITALEXECUTOR',['OTHER1','OTHER2','OTHER3'])}),
    /already reserved on defense, allocated, or consumed/i,
  );
});

test('locked fleet defense cannot be replaced while a plan exists',async()=>{
  const store=makeStore();
  const boards=createGacFleetBoardService({store,rounds});
  const enemy=await boards.saveDefense('user-1',{...fleet('CAPITALLEVIATHAN',['SITH1','SITH2','SITH3']),slot:0});
  const plans=createGacFleetAttackPlanService({store,boards});
  await plans.saveAssignment('user-1',{defenseFleetId:enemy.fleet.id,...fleet('CAPITALEXECUTOR',['HT','RC','XB'])});
  await assert.rejects(
    boards.saveDefense('user-1',{...fleet('CAPITALLEVIATHAN',['SITH1','SITH2','SITH4']),slot:0}),
    /Release the locked Fleet War Room plan/i,
  );
});

test('fleet attempt lifecycle snapshots exact roles and verified archival feeds gac_battles as fleet evidence',async()=>{
  const store=makeStore();
  const boards=createGacFleetBoardService({store,rounds,now:()=>new Date('2026-08-21T03:00:00Z')});
  const enemy=await boards.saveDefense('user-1',{...fleet('CAPITALLEVIATHAN',['SITH1','SITH2','SITH3'],['SITH4']),slot:0});
  const plans=createGacFleetAttackPlanService({store,boards,now:(()=>{let i=0;return()=>new Date(`2026-08-21T03:${10+i++}:00Z`);})()});
  const locked=await plans.saveAssignment('user-1',{defenseFleetId:enemy.fleet.id,...fleet('CAPITALEXECUTOR',['HT','RC','XB'],['IG2000'])});
  const started=await plans.updateStatus('user-1',{id:locked.assignment.id,status:'attempted'});
  assert.equal(started.assignment.status,'attempted');
  const won=await plans.updateStatus('user-1',{id:locked.assignment.id,status:'win',banners:74});
  assert.equal(won.assignment.attemptLog.length,1);
  assert.deepEqual(won.assignment.attemptLog[0].starters,['HT','RC','XB']);
  assert.deepEqual(won.assignment.attemptLog[0].reinforcements,['IG2000']);
  const battles=createGacFleetVerifiedBattleService({store,boards,now:()=>new Date('2026-08-21T03:30:00Z')});
  await assert.rejects(battles.verifyAttempt('user-1',{assignmentId:locked.assignment.id,attemptIndex:0,confirm:false}),/Explicit owner confirmation/i);
  const archived=await battles.verifyAttempt('user-1',{assignmentId:locked.assignment.id,attemptIndex:0,confirm:true});
  assert.equal(archived.saved,true);
  assert.equal(store.tables.gac_battles.length,1);
  const row=store.tables.gac_battles[0];
  assert.equal(row.metadata.battleType,'fleet');
  assert.equal(row.metadata.counterEvidenceEligible,true);
  assert.equal(row.metadata.datacronApplicable,false);
  assert.deepEqual(row.metadata.attackerRoles.starters,['HT','RC','XB']);
  assert.deepEqual(row.metadata.defenderRoles.starters,['SITH1','SITH2','SITH3']);
  const duplicate=await battles.verifyAttempt('user-1',{assignmentId:locked.assignment.id,attemptIndex:0,confirm:true});
  assert.equal(duplicate.alreadyVerified,true);
  assert.equal(store.tables.gac_battles.length,1);
});
