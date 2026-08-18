import test from 'node:test';
import assert from 'node:assert/strict';
import { planGuildTwDefenseAssignments } from '../public/guild-tw-defense-assigner.js';

function member(playerId, gp) {
  return {
    playerId,
    allyCode: playerId === 'a' ? '111111111' : '222222222',
    name: playerId.toUpperCase(),
    galacticPower: gp,
    rosterAvailable: true,
    units: ['U1','U2','U3','U4'].map((baseId) => ({ baseId, stars: 7, gear: 13, relic: 7, power: 30_000 })),
  };
}

const guild = { members: [member('a', 10_000_000), member('b', 9_500_000)] };
const strategy = {
  templates: [
    { id: 'team-a', name: 'Team A', units: [{ baseId: 'U1', minRelic: 5 }, { baseId: 'U2', minRelic: 5 }] },
    { id: 'team-b', name: 'Team B', units: [{ baseId: 'U3', minRelic: 5 }, { baseId: 'U4', minRelic: 5 }] },
  ],
  zones: [
    { id: 'front', name: 'Front Wall', priority: 1, requirements: [{ templateId: 'team-a', count: 1 }, { templateId: 'team-b', count: 1 }] },
  ],
};

test('assigns a complete prioritized defense strategy with balanced member load', () => {
  const plan = planGuildTwDefenseAssignments(guild, strategy);
  assert.equal(plan.strategyValid, true);
  assert.equal(plan.publishReady, true);
  assert.equal(plan.assignments.length, 2);
  assert.equal(plan.unfilled.length, 0);
  const loads = plan.memberSummary.map((row) => row.assignedTeams).sort();
  assert.deepEqual(loads, [1, 1]);
});

test('prevents a member from reusing the same defensive team units', () => {
  const repeated = {
    templates: strategy.templates,
    zones: [{ id: 'front', name: 'Front Wall', priority: 1, requirements: [{ templateId: 'team-a', count: 3 }] }],
  };
  const plan = planGuildTwDefenseAssignments(guild, repeated);
  assert.equal(plan.assignments.length, 2);
  assert.equal(plan.unfilled.length, 1);
  assert.equal(plan.publishReady, false);
});

test('requires at least one priority-1 TW territory', () => {
  const invalid = {
    templates: strategy.templates,
    zones: [{ id: 'front', name: 'Front Wall', priority: 2, requirements: [{ templateId: 'team-a', count: 1 }] }],
  };
  const plan = planGuildTwDefenseAssignments(guild, invalid);
  assert.equal(plan.strategyValid, false);
  assert.equal(plan.diagnostics.hasPriorityOne, false);
  assert.equal(plan.publishReady, false);
});
