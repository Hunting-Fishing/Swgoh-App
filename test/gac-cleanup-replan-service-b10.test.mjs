import test from 'node:test';
import assert from 'node:assert/strict';
import { createGacAttackPlanService } from '../gac-attack-plan-service.mjs';

const clone=(value)=>value==null?value:JSON.parse(JSON.stringify(value));
function harness(options={}){
  const postAttempt=options.postAttempt??null;
  const rows={
    gac_round_squads:[{id:44,round_id:'ROUND',owner:'opponent',side:'defense',leader_base_id:'DEF_A',members:['DEF_A','DEF_B','DEF_C'],datacron:null,zone:'FRONT-TOP',squad_slot:0,source:'user-confirmed-current-board'}],
    gac_attack_plan_assignments:postAttempt?[{id:10,round_id:'ROUND',defense_squad_id:44,attacker_leader_base_id:options.attackerLeaderBaseId||'OLD_A',attacker_members:options.attackerMembers||['OLD_A','OLD_B','OLD_C'],datacron:null,status:options.status||'loss',attempt_count:options.attemptCount??1,attempt_log:[{status:'loss',members:['OLD_A','OLD_B','OLD_C'],leaderBaseId:'OLD_A',banners:null,at:'2026-08-21T00:00:00.000Z',postAttempt}],planned_at:'2026-08-21T00:00:00.000Z',metadata:clone(options.metadata||{})}]:[],
  };
  const matches=(row,query={})=>Object.entries(query).every(([key,value])=>{
    if(['select','limit','order'].includes(key))return true;
    const text=String(value??'');
    return text.startsWith('eq.')?String(row[key]??'')===text.slice(3):true;
  });
  const store={
    async select(table,query){return clone((rows[table]||[]).filter((row)=>matches(row,query)).slice(0,Number(query?.limit||100)));},
    async upsert(table,values){const output=[];for(const value of values){let row=rows[table].find((item)=>item.round_id===value.round_id&&Number(item.defense_squad_id)===Number(value.defense_squad_id));if(row)Object.assign(row,clone(value));else{row={id:rows[table].length+1,...clone(value)};rows[table].push(row);}output.push(clone(row));}return output;},
    async update(table,values,query){const output=[];for(const row of rows[table]||[]){if(!matches(row,query))continue;Object.assign(row,clone(values));output.push(clone(row));}return output;},
  };
  const boards={async resolveRound(){return {allyCode:'732764286',opponentAllyCode:'123456789',eventInstanceId:'GAC:CURRENT',round:3,roundRow:{id:'ROUND'},confirmed:{opponent:{allyCode:'123456789'}}};}};
  return {service:createGacAttackPlanService({store,boards,now:()=>new Date('2026-08-21T01:00:00.000Z')}),rows};
}
const input={allyCode:'732764286',opponentAllyCode:'123456789',eventInstanceId:'GAC:CURRENT',round:3,defenseId:44,leaderBaseId:'NEW_A',members:['NEW_A','NEW_B','NEW_C'],datacron:null};
const context={allyCode:'732764286',opponentAllyCode:'123456789',eventInstanceId:'GAC:CURRENT',round:3};

test('server rejects cleanup replan when latest loss survivor state is unknown',async()=>{
  const {service}=harness({postAttempt:{defenseState:'unknown',survivorBaseIds:[]}});
  await assert.rejects(()=>service.saveAssignment('USER',input),(error)=>error?.status===409&&/Confirm the surviving enemy defenders/i.test(error.message));
});

test('confirmed-survivor replan persists cleanup provenance and survivor ids',async()=>{
  const {service,rows}=harness({postAttempt:{defenseState:'survivors-confirmed',survivorBaseIds:['DEF_A','DEF_C']}});
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

test('released cleanup plan replans from the same confirmed residual rather than original full defense',async()=>{
  const {service}=harness({
    postAttempt:{defenseState:'survivors-confirmed',survivorBaseIds:['DEF_A','DEF_C']},
    status:'abandoned',
    attackerLeaderBaseId:'RELEASED_A',
    attackerMembers:['RELEASED_A','RELEASED_B','RELEASED_C'],
    metadata:{planKind:'cleanup',cleanupAttemptIndex:0,cleanupSurvivorBaseIds:['DEF_A','DEF_C'],cleanupTelemetryState:'unknown'},
  });
  const saved=await service.saveAssignment('USER',input);
  assert.equal(saved.assignment.planKind,'cleanup');
  assert.equal(saved.assignment.cleanup.attemptIndex,0);
  assert.deepEqual(saved.assignment.cleanup.survivorBaseIds,['DEF_A','DEF_C']);
  assert.equal(saved.assignment.sourceRef,'gac-command-center-cleanup-intelligence');
});

test('consumed attackers from the failed attempt cannot be reused by cleanup',async()=>{
  const {service}=harness({postAttempt:{defenseState:'survivors-confirmed',survivorBaseIds:['DEF_A','DEF_B']}});
  await assert.rejects(()=>service.saveAssignment('USER',{...input,leaderBaseId:'OLD_A',members:['OLD_A','NEW_B','NEW_C']}),(error)=>error?.status===409&&/OLD_A/.test(error.message));
});

test('cleanup loss result cannot resurrect a defender eliminated before the cleanup attempt',async()=>{
  const {service,rows}=harness({
    postAttempt:{defenseState:'survivors-confirmed',survivorBaseIds:['DEF_A','DEF_C']},
    status:'attempted',
    attemptCount:2,
    attackerLeaderBaseId:'CLEAN_A',
    attackerMembers:['CLEAN_A','CLEAN_B','CLEAN_C'],
    metadata:{planKind:'cleanup',cleanupAttemptIndex:0,cleanupSurvivorBaseIds:['DEF_A','DEF_C'],cleanupTelemetryState:'unknown'},
  });
  await assert.rejects(
    ()=>service.updateStatus('USER',{...context,id:10,status:'loss',banners:null,postAttempt:{defenseState:'survivors-confirmed',survivorBaseIds:['DEF_B']}}),
    (error)=>error?.status===409&&/DEF_B/.test(error.message),
  );
  assert.equal(rows.gac_attack_plan_assignments[0].status,'attempted');
  assert.equal(rows.gac_attack_plan_assignments[0].attempt_log.length,1);
});

test('cleanup loss result may narrow the residual survivor set further',async()=>{
  const {service}=harness({
    postAttempt:{defenseState:'survivors-confirmed',survivorBaseIds:['DEF_A','DEF_C']},
    status:'attempted',
    attemptCount:2,
    attackerLeaderBaseId:'CLEAN_A',
    attackerMembers:['CLEAN_A','CLEAN_B','CLEAN_C'],
    metadata:{planKind:'cleanup',cleanupAttemptIndex:0,cleanupSurvivorBaseIds:['DEF_A','DEF_C'],cleanupTelemetryState:'unknown'},
  });
  const result=await service.updateStatus('USER',{...context,id:10,status:'loss',banners:null,postAttempt:{defenseState:'survivors-confirmed',survivorBaseIds:['DEF_C']}});
  assert.equal(result.assignment.status,'loss');
  assert.equal(result.assignment.attemptLog.length,2);
  assert.deepEqual(result.assignment.attemptLog[1].postAttempt.survivorBaseIds,['DEF_C']);
});

test('ordinary first plan remains standard and has no cleanup attempt index',async()=>{
  const {service}=harness();
  const saved=await service.saveAssignment('USER',input);
  assert.equal(saved.assignment.planKind,'standard');
  assert.equal(saved.assignment.cleanup.attemptIndex,null);
  assert.deepEqual(saved.assignment.cleanup.survivorBaseIds,[]);
  assert.equal(saved.assignment.cleanup.telemetryState,'not-applicable');
});
