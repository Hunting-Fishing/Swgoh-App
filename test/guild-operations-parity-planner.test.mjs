import test from 'node:test';
import assert from 'node:assert/strict';
import { buildScopedTbOperations, planGuildTbOperationsParity } from '../public/guild-operations-parity-planner.js';

function member(id, units) {
  return {
    playerId: id,
    allyCode: id === 'a' ? '111111111' : '222222222',
    name: id.toUpperCase(),
    rosterAvailable: true,
    galacticPower: id === 'a' ? 10_000_000 : 9_000_000,
    units: units.map((baseId) => ({ baseId, stars: 7, gear: 13, relic: 9, power: 30_000 })),
  };
}

const guild = {
  members: [member('a', ['X','Y','Z']), member('b', ['X','Z'])],
};

const operations = {
  slots: [
    { id: 's1', phase: 'P1', conflictId: 'mission-1', squadId: 'op-1', slot: 1, baseId: 'X', name: 'X', unitType: 'Character', requiredRelic: 5 },
    { id: 's2', phase: 'P1', conflictId: 'mission-2', squadId: 'op-2', slot: 1, baseId: 'Y', name: 'Y', unitType: 'Character', requiredRelic: 5 },
    { id: 's3', phase: 'P2', conflictId: 'mission-3', squadId: 'op-3', slot: 1, baseId: 'Z', name: 'Z', unitType: 'Character', requiredRelic: 6 },
  ],
};

test('scopes phases and ignored missions without mutating canonical requirements', () => {
  const scoped = buildScopedTbOperations(operations, {
    phaseLayout: { includedPhases: ['P1'] },
    ignoredMissions: ['mission-1'],
  });
  assert.equal(scoped.slots.length, 1);
  assert.equal(scoped.slots[0].id, 's2');
  assert.equal(scoped.parityScope.ignoredSlots, 2);
  assert.equal(operations.slots.length, 3);
});

test('cleared requirement blocks preview until replaced or explicitly ignored', () => {
  const plan = planGuildTbOperationsParity(guild, operations, {
    phaseLayout: { includedPhases: ['P1'] },
    ignoredMissions: ['mission-1'],
    requirementOverrides: { s2: { clear: true } },
  });
  assert.equal(plan.parity.unresolvedRequirements.length, 1);
  assert.equal(plan.parity.previewReady, false);
  assert.equal(plan.parity.publishReady, false);
});

test('pre-assignments compile to the proven hard lock mechanism', () => {
  const plan = planGuildTbOperationsParity(guild, operations, {
    phaseLayout: { includedPhases: ['P2'] },
    preAssignments: [{ slotId: 's3', memberId: 'b' }],
  });
  assert.equal(plan.assignments.length, 1);
  assert.equal(plan.assignments[0].member.playerId, 'b');
  assert.equal(plan.assignments[0].locked, true);
  assert.equal(plan.parity.publishReady, true);
});

test('EchoBase-style avoid-pair grouping rules create second-pass constraints', () => {
  const plan = planGuildTbOperationsParity(guild, operations, {
    phaseLayout: { includedPhases: ['P1'] },
    groupingRules: [{
      id: 'rule-1',
      enabled: true,
      priority: 1,
      rule_type: 'avoid_pair',
      when_spec: { baseId: 'Y' },
      then_spec: { baseIds: ['X'] },
    }],
  });
  assert.ok(plan.parity.groupingRulesApplied.some((row) => row.ruleId === 'rule-1' && row.baseId === 'X'));
  assert.ok(plan.parity.effectiveReservations.some((row) => row.ruleId === 'rule-1' && row.baseId === 'X'));
});
