import test from 'node:test';
import assert from 'node:assert/strict';
import { createWebActionService } from '../web-action-service.mjs';

const playerId = '11111111-1111-4111-8111-111111111111';
const guildId = '22222222-2222-4222-8222-222222222222';
const destinationId = '33333333-3333-4333-8333-333333333333';

function roster() {
  return {
    fetchedAt: '2026-08-18T15:00:00Z',
    player: { allyCode:'732764286', name:'Warm Bacon', galacticPower:12000000 },
    units: [
      { name:'Grand Moff Tarkin',baseId:'TARKIN',stars:7,gear:13,relic:9,power:40000,tags:[] },
      { name:'RC-1262 “Scorch”',baseId:'SCORCH',stars:7,gear:13,relic:9,power:40000,tags:[] },
    ], ships: [],
  };
}

function makeStore(role = 'member') {
  let serial = 0;
  const tables = {
    user_player_links:[{user_id:'user-1',player_id:playerId,is_primary:true,verification_status:'verified',verified_at:'2026-08-18T12:00:00Z'}],
    players:[{id:playerId,ally_code:'732764286',swgoh_player_id:'game-player',name:'Warm Bacon',current_guild_id:guildId,last_synced_at:'2026-08-18T15:00:00Z'}],
    guild_user_memberships:[{guild_id:guildId,user_id:'user-1',player_id:playerId,role,status:'active',joined_at:'2026-08-01T00:00:00Z'}],
    guild_discord_destinations:[{id:destinationId,guild_id:guildId,destination_kind:'channel',external_id:'777777777777777777',display_name:'rote-command',verified:true,metadata:{},updated_at:'2026-08-18T10:00:00Z'}],
    guilds:[{id:guildId,name:'Ludus Venatus'}],
    web_action_runs:[],
    web_action_publications:[],
  };
  const matches = (row, query={}) => Object.entries(query).every(([key,value]) => {
    if (['select','order','limit','offset'].includes(key)) return true;
    const raw = String(value);
    if (raw.startsWith('eq.')) return String(row[key] ?? '') === raw.slice(3);
    if (raw.startsWith('in.(')) return raw.slice(4,-1).split(',').includes(String(row[key] ?? ''));
    return true;
  });
  return {
    tables,
    async select(table, query={}) { return (tables[table]||[]).filter((row)=>matches(row,query)).slice(0,Number(query.limit||1000)).map((row)=>({...row})); },
    async insert(table, rows) {
      const target=tables[table]||(tables[table]=[]);
      return rows.map((incoming)=>{const row={...incoming,id:incoming.id||`${String(++serial).padStart(8,'0')}-0000-4000-8000-000000000000`,created_at:incoming.created_at||'2026-08-18T16:00:00Z'};target.push(row);return {...row};});
    },
  };
}

test('Raid Max executes and persists from verified website identity without Discord configuration or Discord calls', async () => {
  const store = makeStore('member');
  let discordCalls = 0;
  const service = createWebActionService({
    store,
    canonical:{async getPlayerRoster(code){assert.equal(code,'732764286');return roster();}},
    env:{},
    fetch:async()=>{discordCalls += 1; throw new Error('Discord must not be called during action execution');},
    now:()=>new Date('2026-08-18T16:00:00Z'),
  });
  const result = await service.execute('user-1','raid-max',{maxAttempts:5});
  assert.equal(result.result.action,'raid-max');
  assert.equal(result.result.attempts[0].name,'Tarkin + Scorch');
  assert.equal(result.result.summary.recommendedMaxScoreCeiling,3_600_000);
  assert.equal(discordCalls,0);
  assert.equal(store.tables.web_action_runs.length,1);
  assert.equal(store.tables.web_action_runs[0].user_id,'user-1');
  assert.equal(store.tables.web_action_runs[0].player_id,playerId);
  assert.equal(store.tables.web_action_runs[0].guild_id,guildId);
});

test('normal active Guild member can publish own saved result to Player Page and Guild Page but cannot publish to Discord', async () => {
  const store = makeStore('member');
  const service = createWebActionService({store,canonical:{async getPlayerRoster(){return roster();}},env:{}});
  const executed = await service.execute('user-1','raid-max',{maxAttempts:1});
  const player = await service.share('user-1',executed.runId,'player-page');
  const guild = await service.share('user-1',executed.runId,'guild-page');
  assert.equal(player.publication.target_kind,'player_page');
  assert.equal(guild.publication.target_kind,'guild_page');
  await assert.rejects(service.share('user-1',executed.runId,'discord',{destinationId}), (error)=>error?.code==='DISCORD_SHARE_FORBIDDEN');
  assert.equal(store.tables.web_action_publications.length,2);
});

test('Officer may optionally publish a saved action to an exact verified Guild Discord channel with mentions disabled', async () => {
  const store = makeStore('officer');
  const requests=[];
  const service = createWebActionService({
    store,canonical:{async getPlayerRoster(){return roster();}},
    env:{WEB_ACTION_DISCORD_SHARING_ENABLED:'true',DISCORD_BOT_TOKEN:'secret-token'},
    fetch:async(url,options)=>{requests.push({url:String(url),body:JSON.parse(options.body),auth:options.headers.Authorization});return {ok:true,status:200,async json(){return {id:'discord-message-1'};}};},
  });
  const executed=await service.execute('user-1','raid-max',{maxAttempts:1});
  const shared=await service.share('user-1',executed.runId,'discord',{destinationId});
  assert.equal(shared.publication.target_kind,'discord');
  assert.equal(shared.publication.external_id,'discord-message-1');
  assert.equal(requests.length,1);
  assert.match(requests[0].url,/channels\/777777777777777777\/messages$/);
  assert.deepEqual(requests[0].body.allowed_mentions,{parse:[]});
  assert.match(requests[0].body.content,/Raid Max/);
  assert.match(requests[0].auth,/^Bot /);
});

test('publishing the same saved result to the same app target is idempotent', async () => {
  const store=makeStore('member');
  const service=createWebActionService({store,canonical:{async getPlayerRoster(){return roster();}},env:{}});
  const executed=await service.execute('user-1','raid-max',{maxAttempts:1});
  const first=await service.share('user-1',executed.runId,'guild-page');
  const second=await service.share('user-1',executed.runId,'guild-page');
  assert.equal(first.reused,false);
  assert.equal(second.reused,true);
  assert.equal(store.tables.web_action_publications.filter((row)=>row.target_kind==='guild_page').length,1);
});

test('Action catalog explicitly exposes Discord as optional rather than an execution dependency', async () => {
  const service=createWebActionService({store:makeStore('member'),env:{}});
  const catalog=await service.catalog('user-1');
  const action=catalog.actions.find((row)=>row.key==='raid-max');
  assert.equal(action.execution,'website-native');
  assert.equal(action.discordRequired,false);
  assert.equal(catalog.sharing.discord,false);
  assert.equal(catalog.sharing.playerPage,true);
  assert.equal(catalog.sharing.guildPage,true);
});
