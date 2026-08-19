import test from 'node:test';
import assert from 'node:assert/strict';

import { createDiscordTbStage9PlanCommand } from '../discord-tb-stage9-plan-command.mjs';

const context = {
  guild: { id: 'guild-1', name: 'Test Guild' },
  userId: '11111111-1111-4111-8111-111111111111',
  role: 'officer',
};

function interaction(from = '1', to = '2') {
  return {
    guild_id: '123456789012345678',
    member: { user: { id: '234567890123456789' } },
    data: {
      name: 'tb',
      options: [{
        type: 1,
        name: 'plan-diff',
        options: [
          { type: 3, name: 'phase', value: 'P6' },
          { type: 3, name: 'from', value: from },
          { type: 3, name: 'to', value: to },
        ],
      }],
    },
  };
}

function makeCommand() {
  const calls = [];
  const store = {
    async select(table) {
      assert.equal(table, 'guild_tb_plans');
      return [{ id: 'plan-1', guild_id: 'guild-1', tb_key: 'rote', name: 'P6 Operations', status: 'previewed' }];
    },
  };
  const contextResolver = { async resolve() { return context; } };
  const versionService = {
    async listVersions(receivedContext, input) {
      calls.push({ service: 'listVersions', receivedContext, input });
      return {
        versions: [
          { version: { id: 'run-2', versionNumber: 2 } },
          { version: { id: 'run-1', versionNumber: 1 } },
        ],
      };
    },
  };
  const compareService = {
    async compareVersions(receivedContext, input) {
      calls.push({ service: 'compareVersions', receivedContext, input });
      return {
        diff: {
          from: { id: 'run-1', versionNumber: 1, planHash: 'a'.repeat(64) },
          to: { id: 'run-2', versionNumber: 2, planHash: 'b'.repeat(64) },
          summary: { changedDonors: 1, addedAssignments: 2, removedAssignments: 1, newlyFilledSlots: 2, newlyUnfilledSlots: 1, helpDelta: -1 },
          changedDonors: [{ slotKey: 'P6-M1-OP1-S1', from: { donorId: 'P1', donorName: 'Old Donor' }, to: { donorId: 'P2', donorName: 'New Donor' } }],
          newlyFilledSlots: [{ slotKey: 'P6-M1-OP1-S2' }],
          newlyUnfilledSlots: [{ slotKey: 'P6-M1-OP1-S3' }],
        },
      };
    },
  };
  return { command: createDiscordTbStage9PlanCommand({ store, contextResolver, versionService, compareService }), calls };
}

test('/tb plan-diff resolves version numbers inside current plan/phase and formats verified changes', async () => {
  const { command, calls } = makeCommand();
  const content = await command.execute(interaction());

  const list = calls.find((row) => row.service === 'listVersions');
  assert.equal(list.input.planId, 'plan-1');
  assert.equal(list.input.rotePhase, 'P6');
  const compare = calls.find((row) => row.service === 'compareVersions');
  assert.deepEqual(compare.input, { fromRunId: 'run-1', toRunId: 'run-2' });

  assert.match(content, /Immutable ROTE Plan Diff/);
  assert.match(content, /v1/);
  assert.match(content, /v2/);
  assert.match(content, /1 donor swaps/);
  assert.match(content, /2 newly filled/);
  assert.match(content, /HELP delta \*\*-1\*\*/);
  assert.match(content, /Old Donor.*New Donor/);
  assert.match(content, /No assignments were published and no DMs were sent/);
});

test('/tb plan-diff accepts direct immutable version IDs without version-number lookup', async () => {
  const { command, calls } = makeCommand();
  await command.execute(interaction('run-old', 'run-new'));

  assert.equal(calls.some((row) => row.service === 'listVersions'), false);
  const compare = calls.find((row) => row.service === 'compareVersions');
  assert.deepEqual(compare.input, { fromRunId: 'run-old', toRunId: 'run-new' });
});

test('/tb plan-diff rejects an unknown numeric version before compare execution', async () => {
  const { command, calls } = makeCommand();
  await assert.rejects(() => command.execute(interaction('99', '2')), /version v99 was not found/i);
  assert.equal(calls.some((row) => row.service === 'compareVersions'), false);
});
