import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardKey, recommendationMembers, statusLabel, warRoomProgress } from '../public/gac-manual-war-room-bridge.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('manual war room bridge maps verified defenses by exact zone and slot', () => {
  assert.equal(boardKey({ zone:'front-top', slot:0 }), 'FRONT-TOP|0');
  assert.equal(boardKey({ zone:'BACK-BOTTOM', slot:2 }), 'BACK-BOTTOM|2');
});

test('manual war room bridge derives the exact recommended attacker ids in squad order', () => {
  assert.deepEqual(recommendationMembers({ recommendation:{ squad:[{baseId:'LEADER'},{baseId:'ALLY_1'},{baseId:'ALLY_2'}] } }), ['LEADER','ALLY_1','ALLY_2']);
});

test('manual war room bridge progress is based on verified saved defenses and wins', () => {
  const progress = warRoomProgress(
    [{id:11},{id:12},{id:13},{id:14}],
    [
      {defenseId:11,status:'win'},
      {defenseId:12,status:'planned'},
      {defenseId:13,status:'attempted'},
      {defenseId:14,status:'loss'},
      {defenseId:999,status:'win'},
    ],
  );
  assert.deepEqual(progress, { total:4, won:1, locked:2, attempted:1, losses:1, open:3, completion:25 });
  assert.equal(statusLabel('planned'), 'LOCKED PLAN');
  assert.equal(statusLabel('win'), 'DEFENSE CLEARED');
});

test('manual bridge is wired to the authoritative attack plan and whole-board allocator', () => {
  const source = fs.readFileSync(path.join(root, 'public/gac-manual-war-room-bridge.js'), 'utf8');
  assert.match(source, /buildOpenWarRoomPlan/);
  assert.match(source, /\/api\/gac\/attack-plan\//);
  assert.match(source, /\/api\/gac\/current-board\//);
  assert.match(source, /credentials: 'same-origin'/);
  assert.match(source, /manual-board-counter-locked/);
  assert.match(source, /status: 'abandoned'/);
  assert.match(source, /PRE-BATTLE CHECKLIST/);
  assert.match(source, /RECORD WIN \/ LOSS/);
});
