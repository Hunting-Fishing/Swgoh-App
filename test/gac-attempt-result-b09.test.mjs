import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  latestPostAttempt,
  normalizedBanners,
  resultDraft,
  resultTruthLabel,
} from '../public/gac-attempt-result-model.js';
import {
  confirmedPostAttempt,
  createGacAttackPlanService,
  sanitizeAttempt,
  sanitizeAttemptLog,
  sanitizePostAttempt,
} from '../gac-attack-plan-service.mjs';

const defenders = Object.freeze(['DEF_A','DEF_B','DEF_C']);

test('win result is confirmed cleared and never fabricates post-battle percentages', () => {
  const draft = resultDraft('win', { banners:'65' });
  assert.equal(draft.valid, true);
  assert.equal(draft.status, 'win');
  assert.equal(draft.banners, 65);
  assert.deepEqual(draft.postAttempt, { defenseState:'cleared', survivorBaseIds:[] });

  const post = confirmedPostAttempt(draft.postAttempt, 'win', defenders);
  assert.deepEqual(post, {
    defenseState:'cleared',
    survivorBaseIds:[],
    source:'user-confirmed-result',
    tmState:'unknown',
    healthState:'unknown',
    protectionState:'unknown',
  });
});

test('loss defaults to survivor state unknown and blank banners remain unknown', () => {
  const draft = resultDraft('loss', { banners:'', lossState:'unknown', defenseMembers:defenders });
  assert.equal(draft.valid, true);
  assert.equal(draft.banners, null);
  assert.deepEqual(draft.postAttempt, { defenseState:'unknown', survivorBaseIds:[] });
  const post = confirmedPostAttempt(draft.postAttempt, 'loss', defenders);
  assert.equal(post.defenseState, 'unknown');
  assert.deepEqual(post.survivorBaseIds, []);
  assert.equal(post.tmState, 'unknown');
  assert.equal(post.healthState, 'unknown');
  assert.equal(post.protectionState, 'unknown');
});

test('confirmed loss survivors must be a non-empty subset of the saved defense', () => {
  const draft = resultDraft('loss', { lossState:'survivors-confirmed', survivorBaseIds:['DEF_A','DEF_C'], defenseMembers:defenders, banners:'12' });
  assert.equal(draft.valid, true);
  assert.equal(draft.banners, 12);
  assert.deepEqual(draft.postAttempt.survivorBaseIds, ['DEF_A','DEF_C']);
  const post = confirmedPostAttempt(draft.postAttempt, 'loss', defenders);
  assert.equal(post.defenseState, 'survivors-confirmed');
  assert.deepEqual(post.survivorBaseIds, ['DEF_A','DEF_C']);

  assert.equal(resultDraft('loss', { lossState:'survivors-confirmed', survivorBaseIds:[], defenseMembers:defenders }).valid, false);
  assert.equal(resultDraft('loss', { lossState:'survivors-confirmed', survivorBaseIds:['NOT_DEF'], defenseMembers:defenders }).valid, false);
  assert.throws(() => confirmedPostAttempt({ defenseState:'survivors-confirmed', survivorBaseIds:[] }, 'loss', defenders), /at least one/i);
  assert.throws(() => confirmedPostAttempt({ defenseState:'survivors-confirmed', survivorBaseIds:['NOT_DEF'] }, 'loss', defenders), /not part of the saved defense/i);
});

test('banner input accepts only blank or a non-negative whole number', () => {
  assert.equal(normalizedBanners('0'), 0);
  assert.equal(normalizedBanners('65'), 65);
  assert.equal(normalizedBanners(''), null);
  assert.equal(resultDraft('win', { banners:'-1' }).valid, false);
  assert.equal(resultDraft('win', { banners:'2.5' }).valid, false);
  assert.equal(resultDraft('loss', { banners:'not-a-number' }).valid, false);
});

test('legacy attempt logs normalize safely to cleared win or unknown loss', () => {
  const win = sanitizeAttempt({ members:['ATK_A'], leaderBaseId:'ATK_A', status:'win', banners:65, at:'2026-08-21T06:00:00Z' });
  const loss = sanitizeAttempt({ members:['ATK_B'], leaderBaseId:'ATK_B', status:'loss', banners:null, at:'2026-08-21T06:05:00Z' });
  assert.equal(win.postAttempt.defenseState, 'cleared');
  assert.equal(loss.postAttempt.defenseState, 'unknown');
  assert.deepEqual(sanitizeAttemptLog([win,loss]).map((row)=>row.postAttempt.defenseState), ['cleared','unknown']);
});

test('latest result truth renders confirmed survivors without inventing TM/health/protection', () => {
  const assignment = {
    attemptLog:[{
      status:'loss', banners:9, at:'2026-08-21T06:10:00Z',
      postAttempt:{ defenseState:'survivors-confirmed', survivorBaseIds:['DEF_B'], source:'user-confirmed-result' },
    }],
  };
  const post = latestPostAttempt(assignment);
  assert.equal(post.defenseState, 'survivors-confirmed');
  assert.deepEqual(post.survivorBaseIds, ['DEF_B']);
  assert.equal(post.tmState, 'unknown');
  assert.equal(post.healthState, 'unknown');
  assert.equal(post.protectionState, 'unknown');
  assert.equal(resultTruthLabel(post).title, 'LOSS · SURVIVORS CONFIRMED');
});

function serviceHarness() {
  const defense = {
    id:44, round_id:'ROUND-1', owner:'opponent', side:'defense', source:'user-confirmed-current-board',
    leader_base_id:'DEF_A', members:[...defenders], datacron:null, zone:'FRONT-TOP', squad_slot:0,
  };
  const assignment = {
    id:10, round_id:'ROUND-1', defense_squad_id:44,
    attacker_leader_base_id:'ATK_A', attacker_members:['ATK_A','ATK_B','ATK_C'], datacron:null,
    status:'attempted', attempt_count:1, attempt_log:[], banners:null, planned_at:'2026-08-21T05:50:00Z', completed_at:null,
  };
  const rows = { gac_round_squads:[defense], gac_attack_plan_assignments:[assignment] };
  const matches = (row,query={}) => Object.entries(query).every(([key,value]) => {
    if(['select','limit','order'].includes(key)) return true;
    const text=String(value??'');
    return !text.startsWith('eq.') || String(row[key]??'')===text.slice(3);
  });
  const store = {
    async select(table,query){return (rows[table]||[]).filter((row)=>matches(row,query)).map((row)=>structuredClone(row));},
    async update(table,values,query){const out=[];for(const row of rows[table]||[]){if(!matches(row,query))continue;Object.assign(row,structuredClone(values));out.push(structuredClone(row));}return out;},
  };
  const boards = { async resolveRound(){return { userId:'USER-1', allyCode:'732764286', opponentAllyCode:'123456789', eventInstanceId:'GAC:CURRENT', round:3, roundRow:{id:'ROUND-1'}, confirmed:{opponent:{allyCode:'123456789'}} };} };
  const service = createGacAttackPlanService({ store, boards, now:()=>new Date('2026-08-21T06:20:00Z') });
  return { service, rows };
}

test('completed attempted loss persists exact confirmed post-attempt truth in the canonical attempt log', async () => {
  const { service, rows } = serviceHarness();
  const result = await service.updateStatus('USER-1', {
    allyCode:'732764286', opponentAllyCode:'123456789', eventInstanceId:'GAC:CURRENT', round:3,
    id:10, status:'loss', banners:11,
    postAttempt:{ defenseState:'survivors-confirmed', survivorBaseIds:['DEF_A','DEF_C'] },
  });
  assert.equal(result.assignment.status, 'loss');
  assert.equal(result.assignment.attemptLog.length, 1);
  assert.deepEqual(result.assignment.attemptLog[0].postAttempt, {
    defenseState:'survivors-confirmed',
    survivorBaseIds:['DEF_A','DEF_C'],
    source:'user-confirmed-result',
    tmState:'unknown',
    healthState:'unknown',
    protectionState:'unknown',
  });
  assert.deepEqual(rows.gac_attack_plan_assignments[0].attempt_log[0].postAttempt.survivorBaseIds, ['DEF_A','DEF_C']);
});

test('B09 public UI intercepts legacy result buttons and contains no TM/health/protection capture input', async () => {
  const ui = await readFile(new URL('../public/gac-attempt-result-ui.js', import.meta.url), 'utf8');
  const api = await readFile(new URL('../gac-attack-plan-api.mjs', import.meta.url), 'utf8');
  const bootstrap = await readFile(new URL('../public/gac-war-room-v3.js', import.meta.url), 'utf8');

  assert.match(bootstrap, /import '\.\/gac-attempt-result-ui\.js';/);
  assert.match(ui, /data-war-action=\\?"win\\?"/);
  assert.match(ui, /data-war-action=\\?"loss\\?"/);
  assert.match(ui, /stopImmediatePropagation\(\)/);
  assert.match(ui, /postAttempt:model\.postAttempt/);
  assert.match(ui, /TM \/ HEALTH \/ PROTECTION: NOT CAPTURED/);
  assert.doesNotMatch(ui, /data-gac-result-(?:tm|health|protection)/i);
  assert.match(api, /postAttempt: body\?\.postAttempt/);
});
