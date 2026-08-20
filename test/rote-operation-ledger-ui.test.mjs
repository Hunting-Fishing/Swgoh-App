import test from 'node:test';
import assert from 'node:assert/strict';

import {
  operationLedgerRequirementLabel,
  operationLedgerSamePlayer,
  operationLedgerState,
  operationLedgerSummary,
  operationLedgerViewerRows,
  roteLedgerPendingKey,
} from '../public/rote-operation-ledger-ui.js';

const slot = (phase = 'P3') => ({ id: `slot-${phase}`, phase, planetId: 'tatooine', requiredBaseId: 'GRANDINQUISITOR', requiredRelic: 7 });
const assignment = (playerId = 'player-a', allyCode = '123456789') => ({ playerId, allyCode, baseId: 'GRANDINQUISITOR', state: 'assigned' });
const contribution = (status, playerId = 'player-a', allyCode = '123456789') => ({
  playerId,
  allyCode,
  baseId: 'GRANDINQUISITOR',
  status,
  contributorIdentityResolved: true,
});

test('classifies the full Operation ledger lifecycle without treating missing contribution evidence as filled', () => {
  assert.equal(operationLedgerState({ slot: slot() }), 'VACANT');
  assert.equal(operationLedgerState({ slot: slot(), assignment: assignment() }), 'ASSIGNED');
  assert.equal(operationLedgerState({ slot: slot(), assignment: assignment(), effectiveContribution: contribution('filled') }), 'FILLED');
  assert.equal(operationLedgerState({ slot: slot(), assignment: assignment(), effectiveContribution: contribution('verified') }), 'VERIFIED');
  assert.equal(operationLedgerState({ slot: slot(), assignment: assignment(), effectiveContribution: contribution('mismatch', 'player-b', '987654321') }), 'MISMATCH');
  assert.equal(operationLedgerState({ slot: slot(), assignment: assignment(), effectiveContribution: contribution('unknown', '', '') }), 'UNKNOWN');
});

test('effective mismatch evidence takes precedence over the assignment state', () => {
  assert.equal(operationLedgerState({
    slot: slot(),
    assignment: assignment(),
    effectiveContribution: contribution('mismatch', 'player-b', '987654321'),
  }), 'MISMATCH');
});

test('summarizes each state independently', () => {
  const rows = [
    { slot: slot('P1') },
    { slot: slot('P2'), assignment: assignment() },
    { slot: slot('P3'), effectiveContribution: contribution('filled') },
    { slot: slot('P4'), effectiveContribution: contribution('verified') },
    { slot: slot('P5'), assignment: assignment(), effectiveContribution: contribution('mismatch', 'player-b', '987654321') },
    { slot: slot('P6'), effectiveContribution: contribution('unknown', '', '') },
  ];
  assert.deepEqual(operationLedgerSummary(rows), {
    total: 6,
    VACANT: 1,
    ASSIGNED: 1,
    FILLED: 1,
    VERIFIED: 1,
    MISMATCH: 1,
    UNKNOWN: 1,
  });
});

test('member view includes only their assigned or actual-contributor rows in the requested phase', () => {
  const viewer = { playerId: 'player-a', allyCode: '123456789' };
  const rows = [
    { slot: slot('P3'), assignment: assignment('player-a', '123456789') },
    { slot: { ...slot('P3'), id: 'actual-p3' }, assignment: assignment('player-b', '987654321'), effectiveContribution: contribution('mismatch', 'player-a', '123456789') },
    { slot: { ...slot('P3'), id: 'other-p3' }, assignment: assignment('player-b', '987654321') },
    { slot: slot('P2'), assignment: assignment('player-a', '123456789') },
  ];
  const visible = operationLedgerViewerRows(rows, viewer, 'P3');
  assert.equal(visible.length, 2);
  assert.deepEqual(visible.map((row) => row.slot.id), ['slot-P3', 'actual-p3']);
});

test('member matching falls back to exact Ally Code when player ID is unavailable', () => {
  assert.equal(operationLedgerSamePlayer({ allyCode: '123-456-789' }, { allyCode: '123456789' }), true);
  assert.equal(operationLedgerSamePlayer({ allyCode: '123456789' }, { allyCode: '987654321' }), false);
});

test('pending evidence key is deterministic for the same action and contributor and isolated across contributors', () => {
  const first = roteLedgerPendingKey('officer', 'slot-1', '123456789');
  const retry = roteLedgerPendingKey('officer', 'slot-1', '123-456-789');
  const other = roteLedgerPendingKey('officer', 'slot-1', '987654321');
  assert.equal(first, retry);
  assert.notEqual(first, other);
  assert.equal(roteLedgerPendingKey('self', 'slot-1'), 'swgoh:rote-operation-pending:self:slot-1:self');
});

test('requirement labels preserve character Relics and use stars for ship-style R0 requirements', () => {
  assert.equal(operationLedgerRequirementLabel({ requiredRelic: 7, requiredRarity: 7 }), 'R7');
  assert.equal(operationLedgerRequirementLabel({ requiredRelic: 0, requiredRarity: 7 }), '7★');
  assert.equal(operationLedgerRequirementLabel({ requiredRelic: null, requiredRarity: 7 }), '7★');
  assert.equal(operationLedgerRequirementLabel({ requiredRelic: null, requiredRarity: null }), 'Requirement unknown');
});
