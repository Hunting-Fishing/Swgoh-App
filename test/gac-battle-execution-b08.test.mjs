import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  REQUIRED_CONFIRMATIONS,
  buildExecutionChecklist,
  defenseDatacronTruth,
  executionFingerprint,
  executionReady,
} from '../public/gac-battle-execution-model.js';
import {
  assertExecutionConfirmation,
  assertExecutionLiveState,
  executionConfirmationSnapshot,
} from '../gac-attack-plan-api.mjs';

const roster = Object.freeze({
  units: Object.freeze([
    { baseId:'ATK_A' }, { baseId:'ATK_B' }, { baseId:'ATK_C' }, { baseId:'OTHER' },
  ]),
  datacrons: Object.freeze([{ id:'OWN-DC-9', setId:19, level:9 }]),
});

const assignment = Object.freeze({
  id:10,
  defenseId:44,
  leaderBaseId:'ATK_A',
  members:Object.freeze(['ATK_A','ATK_B','ATK_C']),
  datacron:Object.freeze({ id:'OWN-DC-9', setId:19, level:9 }),
  status:'planned',
});

const defense = Object.freeze({
  id:44,
  leaderBaseId:'DEF_A',
  members:Object.freeze(['DEF_A','DEF_B','DEF_C']),
  zone:'FRONT-TOP',
  slot:0,
  datacronState:'none',
  datacron:null,
});

const allConfirmed = Object.freeze({ defense:true, defenderDatacron:true, attack:true, attackerDatacron:true });

test('B08 client and server build the same exact execution fingerprint', () => {
  const client = executionFingerprint(assignment, defense);
  const server = executionConfirmationSnapshot(assignment, defense);
  assert.deepEqual(client, server);
  assert.equal(client.version, 'b08-v1');
  assert.equal(client.slot, 0);
  assert.equal(client.defenderDatacronState, 'none');
  assert.equal(client.attackerDatacronId, 'OWN-DC-9');
  assert.deepEqual(client.attackerMembers, ['ATK_A','ATK_B','ATK_C']);
});

test('ready checklist requires all four explicit in-game confirmations', () => {
  const checklist = buildExecutionChecklist({ assignment, defense, roster, ownDefenses:[], rosterIntegrity:{status:'good'} });
  assert.equal(checklist.readyForConfirmation, true);
  assert.equal(checklist.blockers.length, 0);
  assert.deepEqual(REQUIRED_CONFIRMATIONS, ['defense','defenderDatacron','attack','attackerDatacron']);
  assert.equal(executionReady(checklist, allConfirmed), true);
  assert.equal(executionReady(checklist, { ...allConfirmed, attack:false }), false);
});

test('unknown enemy Datacron blocks execution rather than inferring none', () => {
  const unknown = { ...defense, datacronState:'unknown' };
  const checklist = buildExecutionChecklist({ assignment, defense:unknown, roster, ownDefenses:[], rosterIntegrity:{status:'good'} });
  assert.equal(defenseDatacronTruth(unknown).state, 'unknown');
  assert.equal(checklist.readyForConfirmation, false);
  assert.ok(checklist.blockers.some((row) => row.code === 'defender-dc'));
  assert.equal(executionReady(checklist, allConfirmed), false);
});

test('assigned enemy Datacron requires an exact stable ID', () => {
  const broken = { ...defense, datacronState:'assigned', datacron:null };
  const exact = { ...defense, datacronState:'assigned', datacron:{ id:'ENEMY-DC-7', setId:21, level:9 } };
  assert.equal(defenseDatacronTruth(broken).exact, false);
  assert.equal(defenseDatacronTruth(exact).exact, true);
  assert.equal(defenseDatacronTruth(exact).id, 'ENEMY-DC-7');
});

test('missing exact zone or slot blocks battle start', () => {
  for (const invalid of [{ ...defense, zone:'' }, { ...defense, slot:null }]) {
    const checklist = buildExecutionChecklist({ assignment, defense:invalid, roster, ownDefenses:[], rosterIntegrity:{status:'good'} });
    assert.equal(checklist.readyForConfirmation, false);
    assert.ok(checklist.blockers.some((row) => row.code === 'defense'));
  }
});

test('missing attacker, own-defense overlap, stale attacker DC and blocked roster truth each fail closed', () => {
  const missingRoster = { ...roster, units:roster.units.filter((row) => row.baseId !== 'ATK_C') };
  const missing = buildExecutionChecklist({ assignment, defense, roster:missingRoster, ownDefenses:[], rosterIntegrity:{status:'good'} });
  assert.ok(missing.blockers.some((row) => row.code === 'roster'));

  const reserved = buildExecutionChecklist({ assignment, defense, roster, ownDefenses:[{ members:['ATK_B','X','Y'] }], rosterIntegrity:{status:'good'} });
  assert.ok(reserved.blockers.some((row) => row.code === 'reserve'));

  const noDc = { ...roster, datacrons:[] };
  const staleDc = buildExecutionChecklist({ assignment, defense, roster:noDc, ownDefenses:[], rosterIntegrity:{status:'good'} });
  assert.ok(staleDc.blockers.some((row) => row.code === 'attacker-dc'));

  const blockedTruth = buildExecutionChecklist({ assignment, defense, roster, ownDefenses:[], rosterIntegrity:{status:'blocked'} });
  assert.ok(blockedTruth.blockers.some((row) => row.code === 'roster-truth'));
});

test('server rejects altered fingerprint, unknown defender DC, missing live attacker and defense overlap', () => {
  const fingerprint = executionConfirmationSnapshot(assignment, defense);
  assert.doesNotThrow(() => assertExecutionConfirmation(fingerprint, assignment, defense));
  assert.throws(() => assertExecutionConfirmation({ ...fingerprint, slot:1 }, assignment, defense), /no longer matches/i);

  const unknown = { ...defense, datacronState:'unknown' };
  assert.throws(() => assertExecutionConfirmation(executionConfirmationSnapshot(assignment, unknown), assignment, unknown), /enemy Datacron/i);

  assert.doesNotThrow(() => assertExecutionLiveState(assignment, roster, { defenses:[] }));
  assert.throws(() => assertExecutionLiveState(assignment, { ...roster, units:roster.units.filter((row) => row.baseId !== 'ATK_C') }, { defenses:[] }), /ATK_C/);
  assert.throws(() => assertExecutionLiveState(assignment, roster, { defenses:[{ members:['ATK_B','X','Y'] }] }), /ATK_B/);
});

test('B08 UI intercepts legacy attempt action and posts only the exact executionConfirmation payload', async () => {
  const ui = await readFile(new URL('../public/gac-battle-execution-ui.js', import.meta.url), 'utf8');
  const bootstrap = await readFile(new URL('../public/gac-war-room-v3.js', import.meta.url), 'utf8');
  const api = await readFile(new URL('../gac-attack-plan-api.mjs', import.meta.url), 'utf8');

  assert.match(bootstrap, /import '\.\/gac-battle-execution-ui\.js';/);
  assert.match(ui, /data-war-action=\\?"attempt\\?"/);
  assert.match(ui, /stopImmediatePropagation\(\)/);
  assert.match(ui, /PRE-BATTLE LOCK · B08/);
  assert.match(ui, /executionConfirmation:checklist\.fingerprint/);
  assert.match(ui, /BEGIN ATTEMPT/);
  assert.match(ui, /TACTICAL SOURCE/);
  assert.match(api, /Begin the verified attempt through the pre-battle checklist/);
  assert.match(api, /assertExecutionLiveState/);
});
