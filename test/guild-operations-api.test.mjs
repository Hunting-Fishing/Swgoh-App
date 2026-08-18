import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createGuildOperationsApi } from '../guild-operations-api.mjs';

function responseCapture() {
  return {
    status: 0,
    headers: {},
    body: '',
    writeHead(status, headers) { this.status = status; this.headers = headers; },
    end(body='') { this.body = String(body); },
  };
}

function request(method='GET', body=null) {
  const stream = body == null ? Readable.from([]) : Readable.from([JSON.stringify(body)]);
  stream.method = method;
  stream.headers = { host: 'command.test', 'x-forwarded-proto': 'https', ...(body == null ? {} : { 'content-type': 'application/json', origin: 'https://command.test' }) };
  return stream;
}

const context = { guild: { id:'guild-1', last_synced_at:'2026-08-18T09:00:00Z' }, userId:'user-1', role:'officer' };

function apiWith({ publishing=true }={}) {
  const calls = [];
  const service = {
    requireOfficer: async () => context,
    getWorkspace: async () => ({
      guild:{id:'guild-1'},authorization:{role:'officer',officer:true},settings:{},destinations:[],tbPlans:[],twPlans:[],recentTbRuns:[],recentTwRuns:[],audit:[],
    }),
    getTbPlanDetail: async () => ({plan:{id:'plan-1'},rules:[],preAssignments:[]}),
  };
  const delivery = {
    config: () => ({deliveryEnabled:publishing,botToken:'token',webhookUrl:'',previewMaxAgeMs:1800000}),
    syncVerifiedDestinations: async (guildId) => { calls.push(['sync',guildId]); return {binding:{discordGuildId:'123456789012345678',guildState:{commandChannelId:'223456789012345678'}}}; },
    publish: async (ctx,input) => { calls.push(['publish',ctx,input]); return {status:'published',delivery:{publicMessages:1,memberDms:0,dmFailures:0}}; },
  };
  const session = { currentUser: async () => ({id:'user-1',email:'officer@example.test'}) };
  const canonical = { getGuildRosterByPlayer: async () => ({guild:{},members:[]}) };
  const api = createGuildOperationsApi({service,delivery,session,canonical,fetch:async()=>{throw new Error('not used');}});
  return {api,calls};
}

test('workspace syncs verified Discord destination state before returning', async () => {
  const {api,calls} = apiWith();
  const req = request('GET');
  const res = responseCapture();
  const handled = await api.handle(req,res,new URL('https://command.test/api/account/guild-operations/732764286/workspace'));
  assert.equal(handled,true);
  assert.equal(res.status,200);
  assert.deepEqual(calls[0],['sync','guild-1']);
  const body = JSON.parse(res.body);
  assert.equal(body.discordBinding.verified,true);
  assert.equal(body.publishing.enabled,true);
});

test('TB publish route publishes only the named saved preview run', async () => {
  const {api,calls} = apiWith();
  const runId='11111111-1111-4111-8111-111111111111';
  const req=request('POST',{destinationId:'22222222-2222-4222-8222-222222222222',includeMentions:true,sendDms:true});
  const res=responseCapture();
  await api.handle(req,res,new URL(`https://command.test/api/account/guild-operations/732764286/tb/runs/${runId}/publish`));
  assert.equal(res.status,200);
  const call=calls.find((row)=>row[0]==='publish');
  assert.ok(call);
  assert.equal(call[2].runType,'tb');
  assert.equal(call[2].runId,runId);
  assert.equal(call[2].includeMentions,true);
  assert.equal(call[2].sendDms,true);
});

test('cross-origin publish write is rejected before delivery', async () => {
  const {api,calls}=apiWith();
  const runId='11111111-1111-4111-8111-111111111111';
  const req=request('POST',{destinationId:'22222222-2222-4222-8222-222222222222'});
  req.headers.origin='https://evil.example';
  const res=responseCapture();
  await api.handle(req,res,new URL(`https://command.test/api/account/guild-operations/732764286/tw/runs/${runId}/publish`));
  assert.equal(res.status,403);
  assert.equal(JSON.parse(res.body).code,'CROSS_ORIGIN_REJECTED');
  assert.equal(calls.some((row)=>row[0]==='publish'),false);
});
