import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createWebActionApi } from '../web-action-api.mjs';

function request(method='GET', body='', headers={}) {
  const stream = Readable.from(body ? [Buffer.from(body)] : []);
  stream.method = method;
  stream.headers = headers;
  return stream;
}
function responseCapture() {
  return { status:0, body:'', headers:{}, writeHead(status,headers={}){this.status=status;this.headers=headers;}, end(body=''){this.body=String(body);} };
}

test('catalog and recent history require authenticated account but do not require Discord', async () => {
  const calls=[];
  const api=createWebActionApi({
    session:{async currentUser(){return {id:'user-1'};}},
    service:{
      async catalog(userId){calls.push(['catalog',userId]);return {actions:[{key:'raid-max',discordRequired:false}]};},
      async recent(userId,limit){calls.push(['recent',userId,limit]);return [{id:'run-1'}];},
    },
  });
  const catalogResponse=responseCapture();
  await api.handle(request(),catalogResponse,new URL('https://app.test/api/account/web-actions/catalog'));
  assert.equal(catalogResponse.status,200);
  assert.equal(JSON.parse(catalogResponse.body).actions[0].discordRequired,false);
  const recentResponse=responseCapture();
  await api.handle(request(),recentResponse,new URL('https://app.test/api/account/web-actions/recent?limit=5'));
  assert.equal(recentResponse.status,200);
  assert.deepEqual(calls,[['catalog','user-1'],['recent','user-1','5']]);
});

test('execute saves first and never receives an implicit share target', async () => {
  let executeInput=null;
  const api=createWebActionApi({
    session:{async currentUser(){return {id:'user-1'};}},
    service:{async execute(userId,key,input){executeInput={userId,key,input};return {runId:'11111111-1111-4111-8111-111111111111',result:{action:'raid-max'}};}},
  });
  const response=responseCapture();
  await api.handle(request('POST',JSON.stringify({actionKey:'raid-max',input:{maxAttempts:5},targetKind:'discord'}),{'content-type':'application/json','origin':'https://app.test','host':'app.test','x-forwarded-proto':'https'}),response,new URL('https://app.test/api/account/web-actions/execute'));
  assert.equal(response.status,201);
  assert.deepEqual(executeInput,{userId:'user-1',key:'raid-max',input:{maxAttempts:5}});
});

test('sharing is an explicit separate POST and same-origin protected', async () => {
  const runId='11111111-1111-4111-8111-111111111111';
  let calls=0;
  const api=createWebActionApi({
    session:{async currentUser(){return {id:'user-1'};}},
    service:{async share(){calls+=1;return {publication:{target_kind:'guild_page'}};}},
  });
  const rejected=responseCapture();
  await api.handle(request('POST',JSON.stringify({targetKind:'guild-page'}),{'content-type':'application/json','origin':'https://evil.test','host':'app.test','x-forwarded-proto':'https'}),rejected,new URL(`https://app.test/api/account/web-actions/${runId}/share`));
  assert.equal(rejected.status,403);
  assert.equal(calls,0);
  const accepted=responseCapture();
  await api.handle(request('POST',JSON.stringify({targetKind:'guild-page'}),{'content-type':'application/json','origin':'https://app.test','host':'app.test','x-forwarded-proto':'https'}),accepted,new URL(`https://app.test/api/account/web-actions/${runId}/share`));
  assert.equal(accepted.status,200);
  assert.equal(calls,1);
});

test('Player and Guild feed reads are separate authenticated GET surfaces', async () => {
  const calls=[];
  const api=createWebActionApi({
    session:{async currentUser(){return {id:'user-1'};}},
    service:{
      async playerFeed(userId,code){calls.push(['player',userId,code]);return {items:[]};},
      async guildFeed(userId,code){calls.push(['guild',userId,code]);return {items:[]};},
    },
  });
  const player=responseCapture();await api.handle(request(),player,new URL('https://app.test/api/account/web-actions/feed/player/732764286'));
  const guild=responseCapture();await api.handle(request(),guild,new URL('https://app.test/api/account/web-actions/feed/guild/732764286'));
  assert.equal(player.status,200);assert.equal(guild.status,200);
  assert.deepEqual(calls,[['player','user-1','732764286'],['guild','user-1','732764286']]);
});

test('anonymous website action requests fail before execution', async () => {
  const api=createWebActionApi({session:{async currentUser(){return null;}},service:{async catalog(){throw new Error('must not execute');}}});
  const response=responseCapture();
  await api.handle(request(),response,new URL('https://app.test/api/account/web-actions/catalog'));
  assert.equal(response.status,401);
  assert.equal(JSON.parse(response.body).code,'AUTH_REQUIRED');
});
