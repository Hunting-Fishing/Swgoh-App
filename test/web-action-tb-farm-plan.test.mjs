import test from 'node:test';
import assert from 'node:assert/strict';
import { createWebActionService } from '../web-action-service.mjs';

const playerId = '11111111-1111-4111-8111-111111111111';
const guildId = '22222222-2222-4222-8222-222222222222';
const allyCode = '732764286';

function storeFixture() {
  let serial = 0;
  const tables = {
    user_player_links:[{user_id:'user-1',player_id:playerId,is_primary:true,verification_status:'verified',verified_at:'2026-08-19T00:00:00Z'}],
    players:[{id:playerId,ally_code:allyCode,swgoh_player_id:'game-player-1',name:'Warm Bacon',current_guild_id:guildId,last_synced_at:'2026-08-19T00:00:00Z'}],
    guild_user_memberships:[{guild_id:guildId,user_id:'user-1',player_id:playerId,role:'member',status:'active'}],
    guild_discord_destinations:[],
    web_action_runs:[],
    web_action_publications:[],
  };
  const match=(row,query={})=>Object.entries(query).every(([key,value])=>{
    if(['select','order','limit','offset'].includes(key))return true;
    const raw=String(value);
    if(raw.startsWith('eq.'))return String(row[key]??'')===raw.slice(3);
    return true;
  });
  return {
    tables,
    async select(table,query={}){return (tables[table]||[]).filter((row)=>match(row,query)).slice(0,Number(query.limit||1000)).map((row)=>({...row}));},
    async insert(table,rows){const target=tables[table]||(tables[table]=[]);return rows.map((incoming)=>{const row={...incoming,id:incoming.id||`${String(++serial).padStart(8,'0')}-0000-4000-8000-000000000000`,created_at:incoming.created_at||'2026-08-19T00:10:00Z'};target.push(row);return {...row};});},
  };
}

function canonicalFixture() {
  const member={id:'game-player-1',playerId:'game-player-1',persistentId:playerId,allyCode,name:'Warm Bacon',galacticPower:12_000_000,rosterAvailable:true,characterCount:2,shipCount:0};
  const rawUnits=[
    {player_id:playerId,base_id:'AAYLASECURA',unit_name:'Aayla Secura',combat_type:1,rarity:7,level:85,gear_level:13,relic_tier:2,galactic_power:25_000,zeta_count:1,omicron_count:0,metadata:{speed:250}},
    {player_id:playerId,base_id:'PLOKOON',unit_name:'Plo Koon',combat_type:1,rarity:7,level:85,gear_level:13,relic_tier:3,galactic_power:24_000,zeta_count:0,omicron_count:0,metadata:{speed:240}},
  ];
  const catalog=[
    {baseId:'AAYLASECURA',name:'Aayla Secura',unitType:'Character',alignment:'Light Side',categories:['Jedi','Galactic Republic'],factions:['Jedi','Galactic Republic']},
    {baseId:'PLOKOON',name:'Plo Koon',unitType:'Character',alignment:'Light Side',categories:['Jedi','Galactic Republic'],factions:['Jedi','Galactic Republic']},
  ];
  let unitReads=0;
  return {
    async getPlayerRoster(){throw new Error('TB Farm Plan must use the batched Guild hydration path, not per-player roster fan-out');},
    async getGuildRosterByPlayer(code){assert.equal(code,allyCode);return {source:'canonical',fetchedAt:'2026-08-19T00:00:00Z',guild:{id:'guild-game-id',persistentId:guildId,name:'Ludus Venatus',memberCount:1},hydration:{requested:1,hydrated:1,failed:0,complete:true},members:[member],summary:{totalMembers:1,hydratedMembers:1}};},
    async getGameUnitCatalog(){return catalog;},
    async _selectPaged(table,query){unitReads+=1;assert.equal(table,'player_units_current');assert.match(query.player_id,/^in\.\(/);return rawUnits;},
    get unitReads(){return unitReads;},
  };
}

test('TB Farm Plan executes and persists for an active verified Guild member without calling Discord', async () => {
  const store=storeFixture();
  const canonical=canonicalFixture();
  let discordCalls=0;
  const service=createWebActionService({store,canonical,env:{},fetch:async()=>{discordCalls+=1;throw new Error('Discord must not run during website execution');},now:()=>new Date('2026-08-19T00:10:00Z')});
  const result=await service.execute('user-1','tb-farm-plan',{priorityMode:'journey-overlap',maxRecommendations:5});
  assert.equal(result.result.action,'tb-farm-plan');
  assert.equal(result.result.player.allyCode,allyCode);
  assert.equal(result.result.input.priorityMode,'journey-overlap');
  assert.ok(result.result.recommendations.length<=5);
  assert.equal(canonical.unitReads,1,'all current Guild units should be hydrated through one bounded paged read');
  assert.equal(discordCalls,0);
  assert.equal(store.tables.web_action_runs.length,1);
  assert.equal(store.tables.web_action_runs[0].action_key,'tb-farm-plan');
  assert.equal(store.tables.web_action_runs[0].guild_id,guildId);
  assert.equal(store.tables.web_action_publications.length,0,'execution must remain private until an explicit share action');
});
