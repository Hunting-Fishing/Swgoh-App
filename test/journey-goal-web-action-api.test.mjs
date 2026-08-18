import test from 'node:test';
import assert from 'node:assert/strict';
import { createWebActionApi } from '../web-action-api.mjs';

function request(method='GET', body=null, origin='https://command.example') {
  const chunks = body == null ? [] : [Buffer.from(JSON.stringify(body))];
  return {
    method,
    headers: { host:'command.example', 'x-forwarded-proto':'https', ...(origin ? { origin } : {}), ...(body == null ? {} : { 'content-type':'application/json' }) },
    async *[Symbol.asyncIterator]() { for (const chunk of chunks) yield chunk; },
  };
}
function response() {
  return {
    status:0, headers:{}, body:'',
    writeHead(status,headers){this.status=status;this.headers=headers;},
    end(value=''){this.body=String(value);},
    json(){return JSON.parse(this.body||'{}');},
  };
}
const service={catalog:async()=>({}),recent:async()=>[],playerFeed:async()=>({}),guildFeed:async()=>({}),execute:async()=>({}),share:async()=>({})};

test('GET Journey goals returns the signed-in verified account snapshot', async () => {
  const calls=[];
  const api=createWebActionApi({
    session:{async currentUser(){return {id:'user-1'};}},
    service,
    journeyGoals:{async snapshot(userId){calls.push(userId);return {trackedIds:['JOURNEY_JEDIMASTERKENOBI']};},async replace(){throw new Error('not used');}},
  });
  const res=response();
  const handled=await api.handle(request('GET'),res,new URL('https://command.example/api/account/web-actions/journey-goals'));
  assert.equal(handled,true);
  assert.equal(res.status,200);
  assert.deepEqual(calls,['user-1']);
  assert.deepEqual(res.json().trackedIds,['JOURNEY_JEDIMASTERKENOBI']);
});

test('PUT Journey goals is same-origin and passes only the submitted event ID list to durable service', async () => {
  const calls=[];
  const api=createWebActionApi({
    session:{async currentUser(){return {id:'user-1'};}},
    service,
    journeyGoals:{async snapshot(){return {};},async replace(userId,eventIds){calls.push([userId,eventIds]);return {trackedIds:eventIds};}},
  });
  const res=response();
  await api.handle(request('PUT',{eventIds:['JOURNEY_GLAHSOKATANO']}),res,new URL('https://command.example/api/account/web-actions/journey-goals'));
  assert.equal(res.status,200);
  assert.deepEqual(calls,[['user-1',['JOURNEY_GLAHSOKATANO']]]);
});

test('cross-origin Journey goal write is rejected before durable mutation', async () => {
  let writes=0;
  const api=createWebActionApi({
    session:{async currentUser(){return {id:'user-1'};}},
    service,
    journeyGoals:{async snapshot(){return {};},async replace(){writes+=1;return {}; }},
  });
  const res=response();
  await api.handle(request('PUT',{eventIds:[]},'https://evil.example'),res,new URL('https://command.example/api/account/web-actions/journey-goals'));
  assert.equal(res.status,403);
  assert.equal(res.json().code,'CROSS_ORIGIN_REJECTED');
  assert.equal(writes,0);
});

test('Journey goals API requires a signed-in account', async () => {
  const api=createWebActionApi({
    session:{async currentUser(){return null;}},
    service,
    journeyGoals:{async snapshot(){throw new Error('must not run');},async replace(){throw new Error('must not run');}},
  });
  const res=response();
  await api.handle(request('GET'),res,new URL('https://command.example/api/account/web-actions/journey-goals'));
  assert.equal(res.status,401);
  assert.equal(res.json().code,'AUTH_REQUIRED');
});
