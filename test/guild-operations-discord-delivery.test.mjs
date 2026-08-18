import test from 'node:test';
import assert from 'node:assert/strict';
import { createGuildOperationsDiscordDelivery } from '../guild-operations-discord-delivery.mjs';

function mockStore() {
  const tables = {
    players:[{id:'player-db',ally_code:'732764286',current_guild_id:'guild-1'}],
    guild_discord_destinations:[],
    guild_tb_assignment_runs:[{
      id:'11111111-1111-4111-8111-111111111111',guild_id:'guild-1',plan_id:'plan-1',status:'preview',
      input_fingerprint:'abc123',created_at:'2026-08-18T09:50:00Z',source_guild_synced_at:'2026-08-18T09:45:00Z',
      assignments:[{phase:'P1',squadId:'op-1',baseId:'UNIT',name:'Unit',member:{playerId:'game-player',allyCode:'732764286',name:'Warm Bacon'},safety:{help:false}}],
      unfilled:[],diagnostics:{parity:{publishReady:true}},delivery:{mode:'preview'}
    }],
    guild_tw_defense_runs:[],
    guild_operations_delivery_receipts:[],
    guild_operations_audit_log:[],
  };
  let serial=0;
  const match=(row,filters)=>Object.entries(filters||{}).every(([key,value])=>{
    if(['select','order','limit'].includes(key)) return true;
    const expected=String(value).replace(/^eq\./,'');
    if(String(value).startsWith('eq.')) return String(row[key]??'')===expected;
    return true;
  });
  return {
    tables,
    status:()=>({configured:true}),
    async select(table,query={}){let rows=(tables[table]||[]).filter((row)=>match(row,query));return rows.slice(0,query.limit||rows.length);},
    async upsert(table,rows,{onConflict}={}){
      const target=tables[table]||(tables[table]=[]);
      const keys=String(onConflict||'').split(',').filter(Boolean);
      return rows.map((incoming)=>{
        let row=keys.length?target.find((candidate)=>keys.every((key)=>String(candidate[key]??'')===String(incoming[key]??''))):null;
        if(row) Object.assign(row,incoming);
        else {row={...incoming,id:incoming.id||`generated-${++serial}`,created_at:incoming.created_at||'2026-08-18T09:55:00Z'};target.push(row);}
        return {...row};
      });
    },
    async insert(table,rows){const target=tables[table]||(tables[table]=[]);return rows.map((incoming)=>{const row={...incoming,id:incoming.id||`generated-${++serial}`,created_at:incoming.created_at||'2026-08-18T09:55:00Z'};target.push(row);return {...row};});},
    async update(table,filters,patch){const rows=(tables[table]||[]).filter((row)=>match(row,filters));for(const row of rows)Object.assign(row,patch);return rows.map((row)=>({...row}));},
  };
}

const stateStore={
  status:()=>({enabled:true,durable:true}),
  readState:async()=>({guilds:{
    '123456789012345678':{
      swgohAllyCode:'732764286',commandChannelId:'223456789012345678',officerRoleIds:[],
      userLinks:{'323456789012345678':{playerId:'game-player',swgohAllyCode:'732764286'}}
    }
  }})
};

function response(payload,status=200){return {ok:status>=200&&status<300,status,headers:{get:()=>null},async json(){return payload;}};}

test('syncs only signed Discord Guild setup destinations as verified', async()=>{
  const store=mockStore();
  const delivery=createGuildOperationsDiscordDelivery({store,stateStore,env:{DISCORD_TB_DELIVERY_ENABLED:'true',DISCORD_BOT_TOKEN:'token'},fetch:async()=>response({}) ,now:()=>new Date('2026-08-18T10:00:00Z')});
  const result=await delivery.syncVerifiedDestinations('guild-1');
  assert.equal(result.binding.discordGuildId,'123456789012345678');
  assert.equal(result.destinations.length,1);
  assert.equal(result.destinations[0].verified,true);
  assert.equal(result.destinations[0].external_id,'223456789012345678');
  assert.equal(result.destinations[0].metadata.verification,'durable-discord-tb-setup');
});

test('publishes a publish-ready TB preview and records a durable receipt', async()=>{
  const store=mockStore();
  const requests=[];
  const delivery=createGuildOperationsDiscordDelivery({
    store,stateStore,env:{DISCORD_TB_DELIVERY_ENABLED:'true',DISCORD_BOT_TOKEN:'token'},now:()=>new Date('2026-08-18T10:00:00Z'),
    fetch:async(url,options)=>{requests.push({url:String(url),body:JSON.parse(options.body)});return response({id:'discord-message-1',channel_id:'223456789012345678'},200);}
  });
  const synced=await delivery.syncVerifiedDestinations('guild-1');
  const destination=synced.destinations[0];
  const context={guild:{id:'guild-1',last_synced_at:'2026-08-18T09:45:00Z'},userId:'user-1'};
  const result=await delivery.publish(context,{runType:'tb',runId:'11111111-1111-4111-8111-111111111111',destinationId:destination.id,includeMentions:true,sendDms:false});
  assert.equal(result.status,'published');
  assert.equal(result.delivery.publicMessages,1);
  assert.equal(requests.length,1);
  assert.match(requests[0].url,/\/channels\/223456789012345678\/messages$/);
  assert.match(requests[0].body.content,/Warm Bacon|<@323456789012345678>/);
  assert.deepEqual(requests[0].body.allowed_mentions.users,['323456789012345678']);
  assert.equal(store.tables.guild_operations_delivery_receipts[0].status,'delivered');
  assert.equal(store.tables.guild_tb_assignment_runs[0].status,'published');
});

test('repeat publish reuses the successful receipt rather than duplicating public messages', async()=>{
  const store=mockStore();
  let calls=0;
  const delivery=createGuildOperationsDiscordDelivery({
    store,stateStore,env:{DISCORD_TB_DELIVERY_ENABLED:'true',DISCORD_BOT_TOKEN:'token'},now:()=>new Date('2026-08-18T10:00:00Z'),
    fetch:async()=>{calls+=1;return response({id:`message-${calls}`,channel_id:'223456789012345678'},200);}
  });
  const destination=(await delivery.syncVerifiedDestinations('guild-1')).destinations[0];
  const context={guild:{id:'guild-1',last_synced_at:'2026-08-18T09:45:00Z'},userId:'user-1'};
  const input={runType:'tb',runId:'11111111-1111-4111-8111-111111111111',destinationId:destination.id,includeMentions:false,sendDms:false};
  await delivery.publish(context,input);
  // Re-open status to preview only to exercise idempotency against the same saved run.
  store.tables.guild_tb_assignment_runs[0].status='preview';
  await delivery.publish(context,input);
  assert.equal(calls,1);
  assert.equal(store.tables.guild_operations_delivery_receipts.length,1);
});

test('rejects a preview when the Guild has synced after it was generated', async()=>{
  const store=mockStore();
  const delivery=createGuildOperationsDiscordDelivery({store,stateStore,env:{DISCORD_TB_DELIVERY_ENABLED:'true',DISCORD_BOT_TOKEN:'token'},now:()=>new Date('2026-08-18T10:00:00Z'),fetch:async()=>response({})});
  const destination=(await delivery.syncVerifiedDestinations('guild-1')).destinations[0];
  const context={guild:{id:'guild-1',last_synced_at:'2026-08-18T09:46:30Z'},userId:'user-1'};
  await assert.rejects(()=>delivery.publish(context,{runType:'tb',runId:'11111111-1111-4111-8111-111111111111',destinationId:destination.id}),/Guild roster changed after this preview/);
  assert.equal(store.tables.guild_operations_delivery_receipts.length,0);
});
