import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { LiveRosterCache } from '../live-roster-cache.mjs';
import {
  createGacEvidenceWarehouseApi,
  PUBLIC_LIMIT_MAX,
  warehouseCacheKey,
  warehouseInput,
} from '../gac-evidence-warehouse-api.mjs';
import { GAC_V1_RELEASE_STATUS } from '../gac-v1-release-status.mjs';

function harness(options={}){
  const writes=[];
  let calls=0;
  const warehouse=options.warehouse||{
    async getEvidence(input){
      calls+=1;
      if(options.delay)await new Promise((resolve)=>setTimeout(resolve,options.delay));
      return {source:'normalized-gac-evidence-warehouse',filters:input,records:[],summary:{count:0},truthBoundaries:{observedRateIsPrediction:false}};
    },
  };
  const api=createGacEvidenceWarehouseApi({
    writeJson:(_response,status,body,headers={})=>writes.push({status,body,headers}),
    warehouse,
    cache:options.cache,
    maxConcurrentLoads:options.maxConcurrentLoads,
  });
  return {api,writes,warehouse,getCalls:()=>calls};
}

async function warehouseGet(api,url='https://app.test/api/gac/evidence/warehouse?format=3v3&battleType=character&enemyLeader=DEF_A&limit=25'){
  return api.handle({method:'GET',headers:{}},{},new URL(url));
}

test('B18 public warehouse input is canonical and capped at 250 records',()=>{
  const input=warehouseInput(new URL('https://app.test/api/gac/evidence/warehouse?format=3V3&battleType=CHARACTER&enemyLeader=def_a%3Ajunk&sourceFamily=C3PO%20!!&evidenceKind=BATTLE-OBSERVATION&limit=99999'));
  assert.equal(input.format,'3v3');
  assert.equal(input.battleType,'character');
  assert.equal(input.enemyLeaderBaseId,'DEF_A');
  assert.equal(input.sourceFamily,'c3po');
  assert.equal(input.evidenceKind,'battle-observation');
  assert.equal(input.limit,PUBLIC_LIMIT_MAX);
  assert.equal(warehouseCacheKey(input),'3v3|character|DEF_A|c3po|battle-observation|250');
});

test('B18 identical concurrent public reads coalesce to one warehouse load',async()=>{
  const {api,writes,getCalls}=harness({delay:8});
  await Promise.all(Array.from({length:32},()=>warehouseGet(api)));
  assert.equal(getCalls(),1);
  assert.equal(writes.length,32);
  assert.ok(writes.every((row)=>row.status===200));
  assert.ok(writes.every((row)=>row.headers['X-GAC-Source']==='normalized-gac-evidence-warehouse'));
  assert.ok(writes.every((row)=>String(row.headers['X-GAC-Read-Policy']).includes('public-limit-250')));
});

test('B18 subsequent identical read is served fresh without another warehouse load',async()=>{
  const {api,writes,getCalls}=harness();
  await warehouseGet(api);
  await warehouseGet(api);
  assert.equal(getCalls(),1);
  assert.equal(writes[0].headers['X-GAC-Cache'],'miss');
  assert.equal(writes[1].headers['X-GAC-Cache'],'fresh');
});

test('B18 stale evidence is served while failed refresh remains isolated',async()=>{
  let now=0;
  let calls=0;
  const cache=new LiveRosterCache({freshMs:30_000,staleMs:180_000,maxEntries:8,now:()=>now});
  const warehouse={async getEvidence(input){calls+=1;if(calls>1)throw Object.assign(new Error('temporary store outage'),{status:503});return {source:'normalized-gac-evidence-warehouse',filters:input,records:[{evidenceKey:'stable'}],summary:{count:1},truthBoundaries:{observedRateIsPrediction:false}};}};
  const {api,writes}=harness({warehouse,cache});
  await warehouseGet(api);
  now=45_000;
  await warehouseGet(api);
  await new Promise((resolve)=>setTimeout(resolve,0));
  assert.equal(writes[1].status,200);
  assert.equal(writes[1].headers['X-GAC-Cache'],'stale');
  assert.equal(writes[1].body.records[0].evidenceKey,'stable');
  assert.equal(calls,2);
});

test('B18 unique cache-miss fanout is admission-capped with Retry-After',async()=>{
  const releases=[];
  const warehouse={async getEvidence(input){return await new Promise((resolve)=>releases.push(()=>resolve({source:'normalized-gac-evidence-warehouse',filters:input,records:[],summary:{count:0},truthBoundaries:{observedRateIsPrediction:false}})));}};
  const {api,writes}=harness({warehouse,maxConcurrentLoads:2});
  const p1=warehouseGet(api,'https://app.test/api/gac/evidence/warehouse?format=3v3&enemyLeader=DEF_A');
  const p2=warehouseGet(api,'https://app.test/api/gac/evidence/warehouse?format=3v3&enemyLeader=DEF_B');
  while(releases.length<2)await new Promise((resolve)=>setTimeout(resolve,0));
  await warehouseGet(api,'https://app.test/api/gac/evidence/warehouse?format=3v3&enemyLeader=DEF_C');
  const rejected=writes.find((row)=>row.status===429);
  assert.ok(rejected);
  assert.equal(rejected.headers['Retry-After'],'2');
  releases.splice(0).forEach((release)=>release());
  await Promise.all([p1,p2]);
  assert.equal(writes.filter((row)=>row.status===200).length,2);
});

test('B18 release-status endpoint exposes immutable truth and scale policy',async()=>{
  const {api,writes}=harness();
  const handled=await api.handle({method:'GET',headers:{}},{},new URL('https://app.test/api/gac/release-status'));
  assert.equal(handled,true);
  assert.equal(writes[0].status,200);
  assert.equal(writes[0].body.release,'gac-v1');
  assert.equal(writes[0].body.truthBoundaries.unsourcedExecutionGuidance,false);
  assert.equal(writes[0].body.truthBoundaries.fleetDatacronsApplicable,false);
  assert.equal(writes[0].body.scale.warehousePublicLimit,250);
  assert.equal(writes[0].body.scale.maxConcurrentCacheMissLoads,24);
  assert.equal(GAC_V1_RELEASE_STATUS.tacticalSources.threeVThree.state,'quarantine-enforced');
});

test('B18 evidence routes are mounted before owner-only GAC mutation routers',async()=>{
  const source=await readFile(new URL('../gac-current-opponent-confirmation-api.mjs',import.meta.url),'utf8');
  assert.match(source,/createGacEvidenceWarehouseApi/);
  const evidence=source.indexOf('evidenceWarehouseApi.handle');
  const board=source.indexOf('boardApi.handle');
  assert.ok(evidence>=0&&board>evidence);
});
