import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createGuildOperationsApi } from '../guild-operations-api.mjs';

function responseCapture() {
  return {
    status: 0, headers: {}, body: '',
    writeHead(status, headers) { this.status = status; this.headers = headers; },
    end(body='') { this.body = String(body); },
  };
}

function request(method='GET', body=null) {
  const stream = body == null ? Readable.from([]) : Readable.from([JSON.stringify(body)]);
  stream.method = method;
  stream.headers = { host:'command.test', 'x-forwarded-proto':'https', ...(body == null ? {} : {'content-type':'application/json',origin:'https://command.test'}) };
  return stream;
}

const context = { guild:{id:'guild-1',name:'Test Guild',last_synced_at:'2026-08-18T09:00:00Z'}, userId:'user-1', role:'officer' };
const discordBinding = { discordGuildId:'123456789012345678', guildState:{swgohAllyCode:'732764286',commandChannelId:'223456789012345678'} };
const immutableRunId = '11111111-1111-4111-8111-111111111111';
const immutableHash = 'a'.repeat(64);

function apiWith({ publishing=true, binding=discordBinding }={}) {
  const calls = [];
  const service = {
    requireOfficer: async (userId, code) => { calls.push(['officer',userId,code]); return context; },
    getWorkspace: async () => ({guild:{id:'guild-1'},authorization:{role:'officer',officer:true},settings:{},destinations:[],tbPlans:[],twPlans:[],recentTbRuns:[],recentTwRuns:[],audit:[]}),
    getTbPlanDetail: async () => ({plan:{id:'plan-1'},rules:[],preAssignments:[]}),
  };
  const delivery = {
    config: () => ({deliveryEnabled:publishing,botToken:'token',webhookUrl:'',previewMaxAgeMs:1800000}),
    resolveBinding: async (guildId) => { calls.push(['binding',guildId]); return binding; },
    syncVerifiedDestinations: async (guildId) => { calls.push(['sync',guildId]); return {binding}; },
    publish: async (ctx,input) => { calls.push(['publish',ctx,input]); return {status:'published',delivery:{publicMessages:1,memberDms:0,dmFailures:0}}; },
  };
  const immutablePreview = {
    createPreview: async (ctx,input) => {
      calls.push(['immutable-preview',ctx,input]);
      return {source:'stage9-immutable-web-discord-parity-preview',phase:input.phase,version:{id:immutableRunId,versionNumber:3,rotePhase:input.phase,planHash:immutableHash},verification:{valid:true}};
    },
  };
  const assignmentVersions = {
    listVersions: async (ctx,input) => { calls.push(['versions',ctx,input]); return {count:1,versions:[{version:{id:immutableRunId,versionNumber:3,rotePhase:'P6',planHash:immutableHash}}]}; },
    getVersion: async (ctx,input) => { calls.push(['get-version',ctx,input]); return {version:{id:input.runId,versionNumber:3,rotePhase:'P6',planHash:immutableHash},verification:{valid:true}}; },
    approveVersion: async (ctx,input) => { calls.push(['approve',ctx,input]); return {version:{id:input.runId,approvedAt:'2026-08-22T13:00:00Z',approvedPlanHash:input.planHash,planHash:input.planHash},verification:{valid:true}}; },
    cancelVersion: async (ctx,input) => { calls.push(['cancel',ctx,input]); return {version:{id:input.runId,status:'cancelled'},hashVerification:{valid:true}}; },
  };
  const immutableDelivery = {
    preview: async (ctx,input) => { calls.push(['stage10-preview',ctx,input]); return {mode:'preview',artifact:{id:immutableRunId},chunks:[{content:'preview'}]}; },
    status: async (ctx,input) => { calls.push(['stage10-status',ctx,input]); return {mode:'status',artifact:{id:immutableRunId},receipts:[]}; },
    publish: async (ctx,input) => { calls.push(['stage10-publish',ctx,input]); return {mode:'published',artifact:{id:immutableRunId},newMessages:1,reusedChunks:0}; },
  };
  const session = { currentUser: async () => ({id:'user-1',email:'officer@example.test'}) };
  const canonical = { getGuildRosterByPlayer: async () => ({guild:{},members:[]}) };
  const api = createGuildOperationsApi({service,delivery,immutablePreview,assignmentVersions,immutableDelivery,session,canonical,fetch:async()=>{throw new Error('not used');}});
  return {api,calls};
}

async function invoke(api, method, pathname, body=null) {
  const req=request(method,body); const res=responseCapture();
  const handled=await api.handle(req,res,new URL(`https://command.test${pathname}`));
  return {req,res,handled,body:JSON.parse(res.body||'{}')};
}

test('workspace syncs verified Discord destination state before returning', async () => {
  const {api,calls}=apiWith();
  const result=await invoke(api,'GET','/api/account/guild-operations/732764286/workspace');
  assert.equal(result.handled,true); assert.equal(result.res.status,200);
  assert.deepEqual(calls.find((row)=>row[0]==='sync'),['sync','guild-1']);
  assert.equal(result.body.discordBinding.verified,true); assert.equal(result.body.publishing.enabled,true);
});

test('legacy TB publish route remains available and unchanged', async () => {
  const {api,calls}=apiWith();
  const result=await invoke(api,'POST',`/api/account/guild-operations/732764286/tb/runs/${immutableRunId}/publish`,{destinationId:'22222222-2222-4222-8222-222222222222',includeMentions:true,sendDms:true});
  assert.equal(result.res.status,200);
  const call=calls.find((row)=>row[0]==='publish');
  assert.equal(call[2].runType,'tb'); assert.equal(call[2].runId,immutableRunId); assert.equal(call[2].includeMentions,true); assert.equal(call[2].sendDms,true);
});

test('immutable web preview resolves Discord/SWGOH binding server-side and ignores client identity fields', async () => {
  const {api,calls}=apiWith(); const planId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const result=await invoke(api,'POST',`/api/account/guild-operations/732764286/tb/plans/${planId}/immutable-preview`,{phase:'P6',discordGuildId:'999999999999999999',seedAllyCode:'999999999'});
  assert.equal(result.res.status,201);
  assert.deepEqual(calls.find((row)=>row[0]==='binding'),['binding','guild-1']);
  const call=calls.find((row)=>row[0]==='immutable-preview');
  assert.equal(call[1].guild.id,'guild-1'); assert.equal(call[1].userId,'user-1'); assert.equal(call[1].discordGuildId,'123456789012345678'); assert.equal(call[1].seedAllyCode,'732764286');
  assert.equal(call[2].planId,planId); assert.equal(call[2].phase,'P6'); assert.equal(call[2].interaction.guild_id,'123456789012345678');
});

test('immutable preview fails closed when no verified Guild binding exists', async () => {
  const {api,calls}=apiWith({binding:null}); const planId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const result=await invoke(api,'POST',`/api/account/guild-operations/732764286/tb/plans/${planId}/immutable-preview`,{phase:'P6'});
  assert.equal(result.res.status,409); assert.equal(result.body.code,'TB_IMMUTABLE_VERIFIED_BINDING_REQUIRED');
  assert.equal(calls.some((row)=>row[0]==='immutable-preview'),false);
});

test('immutable version list is officer-scoped and plan/phase filtered from URL', async () => {
  const {api,calls}=apiWith(); const planId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const result=await invoke(api,'GET',`/api/account/guild-operations/732764286/tb/plans/${planId}/assignment-versions?phase=P6`);
  assert.equal(result.res.status,200);
  const call=calls.find((row)=>row[0]==='versions');
  assert.equal(call[1].guild.id,'guild-1'); assert.equal(call[1].userId,'user-1'); assert.equal(call[2].planId,planId); assert.equal(call[2].phase,'P6');
});

test('immutable approval sends exact full hash to existing version service', async () => {
  const {api,calls}=apiWith();
  const result=await invoke(api,'POST',`/api/account/guild-operations/732764286/tb/assignment-versions/${immutableRunId}/approve`,{planHash:immutableHash});
  assert.equal(result.res.status,200);
  assert.deepEqual(calls.find((row)=>row[0]==='approve')[2],{runId:immutableRunId,planHash:immutableHash});
});

test('immutable cancellation delegates to append-only version lifecycle service', async () => {
  const {api,calls}=apiWith();
  const result=await invoke(api,'POST',`/api/account/guild-operations/732764286/tb/assignment-versions/${immutableRunId}/cancel`,{reason:'Officer replaced this plan'});
  assert.equal(result.res.status,200);
  assert.deepEqual(calls.find((row)=>row[0]==='cancel')[2],{runId:immutableRunId,reason:'Officer replaced this plan'});
});

test('Stage 10 web preview derives phase/version from stored immutable artifact rather than client body', async () => {
  const {api,calls}=apiWith();
  const result=await invoke(api,'POST',`/api/account/guild-operations/732764286/tb/assignment-versions/${immutableRunId}/stage10-preview`,{phase:'P1',versionNumber:999,includeMentions:false});
  assert.equal(result.res.status,200);
  const call=calls.find((row)=>row[0]==='stage10-preview');
  assert.equal(call[1].discordGuildId,'123456789012345678');
  assert.deepEqual(call[2],{phase:'P6',versionNumber:3,includeMentions:false,channelId:undefined});
});

test('Stage 10 website publish derives artifact phase/version server-side and passes explicit confirmation/hash unchanged', async () => {
  const {api,calls}=apiWith();
  const result=await invoke(api,'POST',`/api/account/guild-operations/732764286/tb/assignment-versions/${immutableRunId}/publish-immutable`,{phase:'P1',versionNumber:999,includeMentions:true,confirm:'PUBLISH',planHash:immutableHash});
  assert.equal(result.res.status,200); assert.equal(result.body.mode,'published');
  const call=calls.find((row)=>row[0]==='stage10-publish');
  assert.equal(call[2].phase,'P6'); assert.equal(call[2].versionNumber,3); assert.equal(call[2].confirm,'PUBLISH'); assert.equal(call[2].planHash,immutableHash);
});

test('Stage 10 status also derives stored artifact metadata', async () => {
  const {api,calls}=apiWith();
  const result=await invoke(api,'POST',`/api/account/guild-operations/732764286/tb/assignment-versions/${immutableRunId}/stage10-status`,{includeMentions:true});
  assert.equal(result.res.status,200);
  const call=calls.find((row)=>row[0]==='stage10-status');
  assert.equal(call[2].phase,'P6'); assert.equal(call[2].versionNumber,3);
});

test('cross-origin immutable approval is rejected before version mutation', async () => {
  const {api,calls}=apiWith(); const req=request('POST',{planHash:immutableHash}); req.headers.origin='https://evil.example'; const res=responseCapture();
  await api.handle(req,res,new URL(`https://command.test/api/account/guild-operations/732764286/tb/assignment-versions/${immutableRunId}/approve`));
  assert.equal(res.status,403); assert.equal(JSON.parse(res.body).code,'CROSS_ORIGIN_REJECTED'); assert.equal(calls.some((row)=>row[0]==='approve'),false);
});

test('cross-origin immutable Stage 10 publish is rejected before delivery adapter', async () => {
  const {api,calls}=apiWith(); const req=request('POST',{confirm:'PUBLISH',planHash:immutableHash}); req.headers.origin='https://evil.example'; const res=responseCapture();
  await api.handle(req,res,new URL(`https://command.test/api/account/guild-operations/732764286/tb/assignment-versions/${immutableRunId}/publish-immutable`));
  assert.equal(res.status,403); assert.equal(JSON.parse(res.body).code,'CROSS_ORIGIN_REJECTED'); assert.equal(calls.some((row)=>row[0]==='stage10-publish'),false);
});

test('cross-origin legacy publish write is rejected before delivery', async () => {
  const {api,calls}=apiWith(); const req=request('POST',{destinationId:'22222222-2222-4222-8222-222222222222'}); req.headers.origin='https://evil.example'; const res=responseCapture();
  await api.handle(req,res,new URL(`https://command.test/api/account/guild-operations/732764286/tw/runs/${immutableRunId}/publish`));
  assert.equal(res.status,403); assert.equal(JSON.parse(res.body).code,'CROSS_ORIGIN_REJECTED'); assert.equal(calls.some((row)=>row[0]==='publish'),false);
});
