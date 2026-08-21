import test from 'node:test';
import assert from 'node:assert/strict';
import { createGacAttackPlanService } from '../gac-attack-plan-service.mjs';

const clone=(value)=>value==null?value:JSON.parse(JSON.stringify(value));
function harness(postAttempt=null){
  const rows={
    gac_round_squads:[{id:44,round_id:'ROUND',owner:'opponent',side:'defense',leader_base_id:'DEF_A',members:['DEF_A','DEF_B','DEF_C'],datacron:null,zone:'FRONT-TOP',squad_slot:0,source:'user-confirmed-current-board'}],
    gac_attack_plan_assignments:postAttempt?[{id:10,round_id:'ROUND',defense_squad_id:44,attacker_leader_base_id:'OLD_A',attacker_members:['OLD_A','OLD_B','OLD_C'],datacron:null,status:'loss',attempt_count:1,attempt_log:[{status:'loss',members:['OLD_A','OLD_B','OLD_C'],leaderBaseId:'OLD_A',banners:null,at:'2026-08-21T00:00:00.000Z',postAttempt}],planned_at:'2026-08-21T00:00:00.000Z',metadata:{}}]:[],
  };
  const matches=(row,query={})=>Object.entries(query).every(([key,value])=>{
    if(['select','limit','order'].includes(key))return true;
    const text=String(value??'');
    return text.startsWith('eq.')?String(row[key]??'')===text.slice(3):true;
  });
  const store={
    async select(table,query){return clone((rows[table]||[]).filter((row)=>matches(row,query)).slice(0,Number(query?.limit||100)));},
    async upsert(table,values){const output=[];for(const value of values){let row=rows[table].find((item)=>item.round_id===value.round_id&&Number(item.defense_squad_id)===Number(value.defense_squad_id));if(row)Object.assign(row,clone(value));else{row={id:rows[table].length+1,...clone(value)};rows[table].push(row);}output.push(clone(row));}return output;},
    async update(){throw new Error('not used');},
  };
  const boards={async resolveRound(){return {allyCode:'732764286',opponentAllyCode:'123456789',eventInstanceId:'GAC:CURRENT',round:3,roundRow:{id:'ROUND'},confirmed:{opponent:{allyCode:'123456789'}}};}};
  return {service:createGacAttackPlanService({store,boards,now:()=>new Date('2026-08-21T01:00:00.000Z')}),rows};
}
const input={allyCode:'732764286',opponentAllyCode:'123456789',eventInstanceId:'GAC:CURRENT',round:3,defenseId:44,leaderBaseId:'NEW_A',members:['NEW_A','NEW_B','NEW_C'],datacron:null};

test('server rejects cleanup replan when latest loss survivor state is unknown',async()=>{
  const {service}=harness({defenseState:'unknown',survivorBaseIds:[]});
  await assert.rejects(()=>service.saveAssignment('USER',input),(error)=>error?.status===409&&/Confirm the surviving enemy defenders/i.test(error.message));
});

test('confirmed-survivor replan persists cleanup provenance and survivor ids',async()=>{
  const {service,rows}=harness({defenseState:'survivors-confirmed',survivorBaseIds:['DEF_A','DEF_C']});
  const saved=await service.saveAssignment('USER',input);
  assert.equal(saved.assignment.status,'planned');
  assert.equal(saved.assignment.planKind,'cleanup');
  assert.equal(saved.assignment.cleanup.attemptIndex,0);
  assert.deepEqual(saved.assignment.cleanup.survivorBaseIds,['DEF_A','DEF_C']);
  assert.equal(saved.assignment.cleanup.telemetryState,'unknown');
  const row=rows.gac_attack_plan_assignments[0];
  assert.equal(row.source_ref,'gac-command-center-cleanup-intelligence');
  assert.equal(row.metadata.planKind,'cleanup');
  assert.equal(row.metadata.cleanupAttemptIndex,0);
  assert.deepEqual(row.metadata.cleanupSurvivorBaseIds,['DEF_A','DEF_C']);
});

test('consumed attackers from the failed attempt cannot be reused by cleanup',async()=>{
  const {service}=harness({defenseState:'survivors-confirmed',survivorBaseIds:['DEF_A','DEF_B']});
  await assert.rejects(()=>service.saveAssignment('USER',{...input,leaderBaseId:'OLD_A',members:['OLD_A','NEW_B','NEW_C']}),(error)=>error?.status===409&&/OLD_A/.test(error.message));
});

test('ordinary first plan remains standard and has no cleanup attempt index',async()=>{
  const {service}=harness(null);
  const saved=await service.saveAssignment('USER',input);
  assert.equal(saved.assignment.planKind,'standard');
  assert.equal(saved.assignment.cleanup.attemptIndex,null);
  assert.deepEqual(saved.assignment.cleanup.survivorBaseIds,[]);
  assert.equal(saved.assignment.cleanup.telemetryState,'not-applicable');
});
