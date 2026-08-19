import test from 'node:test';
import assert from 'node:assert/strict';

import {
  compareTbAssignmentVersions,
  tbAssignmentDonorKey,
  tbAssignmentSlotKey,
} from '../tb-assignment-version-diff.mjs';

function assignment(id, playerId, options = {}) {
  return {
    id,
    phase: 'P6',
    conflictId: 'P6-M1',
    squadId: 'OP-1',
    slot: options.slot ?? 1,
    baseId: options.baseId || 'UNIT_A',
    name: options.name || 'Unit A',
    member: { playerId, allyCode: options.allyCode || '', name: options.playerName || playerId },
    safety: { status: options.help ? 'KEEP OVERRIDE' : 'SAFE', help: options.help === true },
  };
}

function unfilled(id, options = {}) {
  return {
    id,
    phase: 'P6',
    conflictId: 'P6-M1',
    squadId: 'OP-1',
    slot: options.slot ?? 1,
    baseId: options.baseId || 'UNIT_A',
    name: options.name || 'Unit A',
    eligibleOwners: options.eligibleOwners ?? 1,
    availableOwners: options.availableOwners ?? 0,
    safeOwners: options.safeOwners ?? 0,
  };
}

test('slot and donor keys use production ROTE slot/member identities with fallbacks', () => {
  assert.equal(tbAssignmentSlotKey({ id: 'slot-1' }), 'slot-1');
  assert.equal(tbAssignmentSlotKey({ slotId: 'slot-2' }), 'slot-2');
  assert.equal(tbAssignmentSlotKey({ phase: 'P6', conflictId: 'M1', squadId: 'S1', slot: 4, baseId: 'ABC' }), 'P6|M1|S1|4|ABC');
  assert.equal(tbAssignmentDonorKey({ member: { playerId: 'player-1', allyCode: '123456789' } }), 'player-1');
  assert.equal(tbAssignmentDonorKey({ member: { allyCode: '123456789' } }), '123456789');
});

test('version diff detects donor changes, assignment adds/removals and filled/unfilled transitions', () => {
  const fromRun = {
    id: 'run-1',
    version_number: 1,
    plan_hash: 'hash-1',
    diagnostics: { safetySummary: { helpAssignments: 1 } },
    assignments: [
      assignment('S1', 'P1'),
      assignment('S2', 'P2'),
      assignment('S4', 'P4'),
      assignment('S5', 'P5'),
    ],
    unfilled: [unfilled('S3')],
  };
  const toRun = {
    id: 'run-2',
    version_number: 2,
    plan_hash: 'hash-2',
    diagnostics: { safetySummary: { helpAssignments: 3 } },
    assignments: [
      assignment('S1', 'P9'),
      assignment('S3', 'P3'),
      assignment('S4', 'P4'),
    ],
    unfilled: [unfilled('S2')],
  };

  const diff = compareTbAssignmentVersions(fromRun, toRun);

  assert.equal(diff.summary.addedAssignments, 1);
  assert.equal(diff.summary.removedAssignments, 2);
  assert.equal(diff.summary.changedDonors, 1);
  assert.equal(diff.summary.newlyFilledSlots, 1);
  assert.equal(diff.summary.newlyUnfilledSlots, 1);
  assert.equal(diff.summary.helpDelta, 2);
  assert.equal(diff.changedDonors[0].slotKey, 'S1');
  assert.equal(diff.changedDonors[0].from.donorId, 'P1');
  assert.equal(diff.changedDonors[0].to.donorId, 'P9');
  assert.equal(diff.newlyFilledSlots[0].slotKey, 'S3');
  assert.equal(diff.newlyUnfilledSlots[0].slotKey, 'S2');
  assert.deepEqual(diff.removedAssignments.map((row) => row.slotKey).sort(), ['S2', 'S5']);
});

test('version diff derives HELP count from assignment safety when diagnostics do not provide it', () => {
  const fromRun = {
    assignments: [assignment('S1', 'P1', { help: true }), assignment('S2', 'P2')],
    unfilled: [],
  };
  const toRun = {
    assignments: [assignment('S1', 'P1'), assignment('S2', 'P2'), assignment('S3', 'P3', { help: true })],
    unfilled: [],
  };

  const diff = compareTbAssignmentVersions(fromRun, toRun);

  assert.equal(diff.from.helpCount, 1);
  assert.equal(diff.to.helpCount, 1);
  assert.equal(diff.summary.helpDelta, 0);
});
