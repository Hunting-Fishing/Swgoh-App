import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { executionFingerprint } from '../public/gac-battle-execution-model.js';
import { assertExecutionConfirmation, executionConfirmationSnapshot } from '../gac-attack-plan-api.mjs';
import { confirmedPostAttempt, resultDefenseMembersForAssignment } from '../gac-attack-plan-service.mjs';
import { cleanupTruth } from '../public/gac-cleanup-intelligence-model.js';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const read=(name)=>fs.readFileSync(path.join(root,name),'utf8');

const defense={
  id:44,
  leaderBaseId:'DEF_A',
  members:['DEF_A','DEF_B','DEF_C'],
  zone:'FRONT-TOP',
  slot:0,
  datacronState:'none',
  datacron:null,
};
const cleanupAssignment={
  id:10,
  defenseId:44,
  status:'planned',
  leaderBaseId:'ATK_A',
  members:['ATK_A','ATK_B','ATK_C'],
  datacron:null,
  planKind:'cleanup',
  cleanup:{attemptIndex:0,survivorBaseIds:['DEF_A','DEF_C'],telemetryState:'unknown'},
  attemptLog:[{status:'loss',members:['OLD_A','OLD_B','OLD_C'],postAttempt:{defenseState:'survivors-confirmed',survivorBaseIds:['DEF_A','DEF_C']}}],
};

test('B08 client and server fingerprints use only the confirmed cleanup residual',()=>{
  const client=executionFingerprint(cleanupAssignment,defense);
  const server=executionConfirmationSnapshot(cleanupAssignment,defense);
  assert.deepEqual(client,server);
  assert.deepEqual(client.defenderMembers,['DEF_A','DEF_C']);
  assert.equal(client.zone,'FRONT-TOP');
  assert.equal(client.slot,0);
  assert.doesNotThrow(()=>assertExecutionConfirmation(client,cleanupAssignment,defense));
});

test('server rejects a stale full-defense fingerprint for a cleanup battle',()=>{
  const stale={...executionConfirmationSnapshot(cleanupAssignment,defense),defenderMembers:['DEF_A','DEF_B','DEF_C']};
  assert.throws(()=>assertExecutionConfirmation(stale,cleanupAssignment,defense),(error)=>error?.status===409&&/no longer matches/i.test(error.message));
});

test('cleanup result survivor validation cannot resurrect a defender eliminated before the cleanup',()=>{
  const rawAssignment={metadata:{planKind:'cleanup',cleanupSurvivorBaseIds:['DEF_A','DEF_C']}};
  const allowed=resultDefenseMembersForAssignment(rawAssignment,defense.members);
  assert.deepEqual(allowed,['DEF_A','DEF_C']);
  assert.throws(
    ()=>confirmedPostAttempt({defenseState:'survivors-confirmed',survivorBaseIds:['DEF_B']},'loss',allowed),
    (error)=>error?.status===409&&/DEF_B/.test(error.message),
  );
  const valid=confirmedPostAttempt({defenseState:'survivors-confirmed',survivorBaseIds:['DEF_C']},'loss',allowed);
  assert.deepEqual(valid.survivorBaseIds,['DEF_C']);
});

test('released cleanup state remains eligible for residual planning when the loss truth is still confirmed',()=>{
  const opponentRoster={units:[
    {baseId:'DEF_A',unitType:'Character'},
    {baseId:'DEF_B',unitType:'Character'},
    {baseId:'DEF_C',unitType:'Character'},
  ]};
  const truth=cleanupTruth({...cleanupAssignment,status:'abandoned'},defense,opponentRoster);
  assert.equal(truth.ready,true);
  assert.deepEqual(truth.survivorBaseIds,['DEF_A','DEF_C']);
  assert.equal(truth.telemetryKnown,false);
});

test('B09 cleanup result UI sources its survivor choices from assignment cleanup residual',()=>{
  const source=read('public/gac-attempt-result-ui.js');
  assert.match(source,/function resultDefenseMembers/);
  assert.match(source,/assignment\?\.cleanup\?\.survivorBaseIds/);
  assert.match(source,/alive at the start of this cleanup/);
  assert.match(source,/defenseMembers:availableDefenders/);
});
