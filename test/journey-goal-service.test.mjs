import test from 'node:test';
import assert from 'node:assert/strict';
import { createJourneyGoalService } from '../journey-goal-service.mjs';

const playerId = '11111111-1111-4111-8111-111111111111';

function makeStore() {
  const tables = {
    user_player_links: [{ user_id:'user-1', player_id:playerId, is_primary:true, verification_status:'verified', verified_at:'2026-08-19T00:00:00Z' }],
    players: [{ id:playerId, ally_code:'732764286', name:'Warm Bacon', current_guild_id:'guild-1' }],
    user_journey_goals: [],
  };
  const rpcCalls = [];
  const matches = (row, query={}) => Object.entries(query).every(([key,value]) => {
    if (['select','order','limit','offset'].includes(key)) return true;
    const raw=String(value);
    if(raw.startsWith('eq.')) return String(row[key]??'')===raw.slice(3);
    return true;
  });
  return {
    tables,
    rpcCalls,
    async select(table,query={}){return (tables[table]||[]).filter((row)=>matches(row,query)).slice(0,Number(query.limit||1000)).map((row)=>({...row}));},
    async rpc(name,args){
      rpcCalls.push([name,{...args}]);
      assert.equal(name,'replace_user_journey_goals');
      tables.user_journey_goals = (args.p_event_ids||[]).map((id,index)=>({user_id:args.p_user_id,player_id:args.p_player_id,journey_event_id:id,priority_rank:index+1}));
      return tables.user_journey_goals.map((row)=>({...row}));
    },
  };
}

test('Journey goals are scoped to the verified user/player identity and preserve supplied order', async () => {
  const store=makeStore();
  const service=createJourneyGoalService({store});
  const saved=await service.replace('user-1',['JOURNEY_GLAHSOKATANO','JOURNEY_JEDIMASTERKENOBI','JOURNEY_GLAHSOKATANO']);
  assert.deepEqual(saved.trackedIds,['JOURNEY_GLAHSOKATANO','JOURNEY_JEDIMASTERKENOBI']);
  assert.equal(store.rpcCalls.length,1);
  assert.equal(store.rpcCalls[0][1].p_user_id,'user-1');
  assert.equal(store.rpcCalls[0][1].p_player_id,playerId);
  assert.deepEqual(store.rpcCalls[0][1].p_event_ids,['JOURNEY_GLAHSOKATANO','JOURNEY_JEDIMASTERKENOBI']);
});

test('unknown Journey IDs are rejected before durable mutation', async () => {
  const store=makeStore();
  const service=createJourneyGoalService({store});
  await assert.rejects(service.replace('user-1',['JOURNEY_NOT_REAL']), (error)=>error?.code==='UNKNOWN_JOURNEY_GOAL' && error?.status===400);
  assert.equal(store.rpcCalls.length,0);
});

test('goal snapshot exposes public preset metadata without requirement payloads', async () => {
  const store=makeStore();
  store.tables.user_journey_goals=[{user_id:'user-1',player_id:playerId,journey_event_id:'JOURNEY_JEDIMASTERKENOBI',priority_rank:1}];
  const service=createJourneyGoalService({store});
  const body=await service.snapshot('user-1');
  assert.equal(body.player.allyCode,'732764286');
  assert.deepEqual(body.trackedIds,['JOURNEY_JEDIMASTERKENOBI']);
  const jmk=body.goals.find((goal)=>goal.id==='JOURNEY_JEDIMASTERKENOBI');
  assert.equal(jmk.tracked,true);
  assert.ok(jmk.requirementCount>0);
  assert.equal('requirements' in jmk,false);
});

test('unverified account cannot manage durable Journey goals', async () => {
  const store=makeStore();
  store.tables.user_player_links=[];
  const service=createJourneyGoalService({store});
  await assert.rejects(service.snapshot('user-1'), (error)=>error?.code==='VERIFIED_PLAYER_REQUIRED' && error?.status===403);
});
