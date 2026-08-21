import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  FIVE_V_FIVE_CANDIDATE_PATH,
  auditSourceCandidates,
  candidatePathFromArgv,
} from '../gac-strategy-source-audit.mjs';

async function jsonFile(path){return JSON.parse(await readFile(new URL(`../${path}`,import.meta.url),'utf8'));}

test('B04 --format=5v5 selects the dedicated 5v5 quarantine artifact',()=>{
  assert.equal(candidatePathFromArgv(['--format=5v5']),FIVE_V_FIVE_CANDIDATE_PATH);
  assert.equal(candidatePathFromArgv(['--format','5v5']),FIVE_V_FIVE_CANDIDATE_PATH);
  assert.match(candidatePathFromArgv(['--candidates=public/data/gac-strategy-source-candidates-5v5.json']),/gac-strategy-source-candidates-5v5\.json$/);
});

test('B04 empty 5v5 quarantine audits safe without promoting a tactic',async()=>{
  const [candidates,production,catalog]=await Promise.all([
    jsonFile('public/data/gac-strategy-source-candidates-5v5.json'),
    jsonFile('public/data/gac-strategy-records.json'),
    jsonFile('public/data/catalog.json'),
  ]);
  const audit=auditSourceCandidates(candidates,production,catalog);
  assert.equal(audit.safe,true);
  assert.equal(audit.declaredFormat,'5v5');
  assert.equal(audit.candidateCount,0);
  assert.equal(audit.approved,0);
  assert.equal(audit.promotionReady,0);
  assert.deepEqual(audit.formatMismatches,[]);
  assert.equal(audit.production.accepted,0);
  assert.ok(audit.gameCatalog.unitCount>0);
});

test('B04 format declaration fails closed if a future candidate is mislabeled 3v3',async()=>{
  const [production,catalog]=await Promise.all([
    jsonFile('public/data/gac-strategy-records.json'),
    jsonFile('public/data/catalog.json'),
  ]);
  const candidates={
    schemaVersion:1,
    format:'5v5',
    candidates:[{
      candidateId:'wrong-format',
      proposedRecord:{schemaVersion:1,id:'wrong-format',status:'active',format:'3v3',defender:{leaderBaseId:'X',members:['X','Y','Z']},attacker:{leaderBaseId:'A',members:['A']},attackerDatacron:{presence:'any',required:false,setIds:[],mechanicIds:[]},defenderDatacron:{presence:'any',required:false,setIds:[],mechanicIds:[]},guidance:{opening:[{text:'fixture'}]},provenance:{sourceName:'fixture',sourceRef:'fixture',sourceType:'tool',sourceUpdatedAt:'2026-08-21',capturedAt:'2026-08-21'},validity:{}},
      review:{status:'quarantined',flags:{},blockers:['wrong-format']},
    }],
  };
  const audit=auditSourceCandidates(candidates,production,catalog);
  assert.equal(audit.safe,false);
  assert.deepEqual(audit.formatMismatches,['wrong-format']);
});
