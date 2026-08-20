import test from 'node:test';
import assert from 'node:assert/strict';
import {
  farmTargetModel,
  farmTargetState,
  farmViewCounts,
  filterFarmTargets,
  requirementDelta,
  splitFarmRequirements,
} from '../public/farm-tracker-v3-model.js';

const event = {
  id: 'TEST_JOURNEY',
  name: 'Test Journey',
  category: 'Journey Guide',
  targetBaseId: 'TARGET',
  requirements: [
    { baseId: 'MISSING', type: 'RELIC', tier: 5 },
    { baseId: 'BUILDING', type: 'RELIC', tier: 7 },
    { baseId: 'DONE', type: 'STAR', tier: 7 },
  ],
};

const buildingRoster = new Map([
  ['BUILDING', { baseId: 'BUILDING', stars: 7, level: 85, gear: 13, relic: 4 }],
  ['DONE', { baseId: 'DONE', stars: 7 }],
]);

const readyRoster = new Map([
  ['MISSING', { baseId: 'MISSING', stars: 7, level: 85, gear: 13, relic: 5 }],
  ['BUILDING', { baseId: 'BUILDING', stars: 7, level: 85, gear: 13, relic: 7 }],
  ['DONE', { baseId: 'DONE', stars: 7 }],
]);

test('target state separates available, active, ready-to-unlock and completed', () => {
  assert.equal(farmTargetState(event, buildingRoster, false).key, 'available');
  assert.equal(farmTargetState(event, buildingRoster, true).key, 'active');
  assert.equal(farmTargetState(event, readyRoster, true).key, 'ready');
  const completed = new Map([...readyRoster, ['TARGET', { baseId: 'TARGET', stars: 7 }]]);
  assert.equal(farmTargetState(event, completed, false).key, 'completed');
});

test('missing acquisition sorts ahead of progression blockers and completed rows are separated', () => {
  const split = splitFarmRequirements(event, buildingRoster);
  assert.equal(split.total, 3);
  assert.equal(split.blockers.length, 2);
  assert.equal(split.complete.length, 1);
  assert.equal(split.blockers[0].baseId, 'MISSING');
  assert.equal(split.blockers[0].delta.key, 'missing');
  assert.equal(split.blockers[1].baseId, 'BUILDING');
  assert.equal(split.complete[0].baseId, 'DONE');
});

test('progression delta remains explicit instead of collapsing unlike metrics into one fake score', () => {
  const delta = requirementDelta(
    { baseId: 'BUILDING', type: 'RELIC', tier: 7 },
    { baseId: 'BUILDING', stars: 7, level: 85, gear: 13, relic: 4 },
  );
  assert.equal(delta.key, 'needs');
  assert.match(delta.label, /R4→R7/);
  assert.equal(delta.gaps.relic, 3);
  assert.equal(delta.gaps.stars, 0);
});

test('command view counts and filters follow the FT2 contract', () => {
  const active = farmTargetModel(event, buildingRoster, true);
  const untracked = farmTargetModel({ ...event, id: 'OTHER', name: 'Other Journey' }, buildingRoster, false);
  const ready = farmTargetModel({ ...event, id: 'READY', name: 'Ready Journey' }, readyRoster, false);
  const completedRoster = new Map([...readyRoster, ['TARGET', { baseId: 'TARGET', stars: 7 }]]);
  const completed = farmTargetModel({ ...event, id: 'DONE_TARGET', name: 'Done Journey' }, completedRoster, false);
  const models = [active, untracked, ready, completed];
  const counts = farmViewCounts(models);
  assert.deepEqual(counts, { active: 1, ready: 1, completed: 1, all: 4 });
  assert.deepEqual(filterFarmTargets(models, 'active').map((row) => row.event.id), ['TEST_JOURNEY']);
  assert.deepEqual(filterFarmTargets(models, 'ready').map((row) => row.event.id), ['READY']);
  assert.deepEqual(filterFarmTargets(models, 'completed').map((row) => row.event.id), ['DONE_TARGET']);
  assert.equal(filterFarmTargets(models, 'all', 'other').length, 1);
});
