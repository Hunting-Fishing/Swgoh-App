import test from 'node:test';
import assert from 'node:assert/strict';

import { createDiscordTbStage9PlanCancelCommand } from '../discord-tb-stage9-plan-cancel-command.mjs';

const context = {
  guild: { id: 'guild-1', name: 'Test Guild' },
  userId: '11111111-1111-4111-8111-111111111111',
  role: 'officer',
};

function interaction(version = '2', reason = 'Roster changed after officer review') {
  return {
    guild_id: '123456789012345678',
    member: { user: { id: '234567890123456789' } },
    data: {
      name: 'tb',
      options: [{
        type: 1,
        name: 'plan-cancel',
        options: [
          { type: 3, name: 'phase', value: 'P6' },
          { type: 3, name: 'version', value: version },
          { type: 3, name: 'reason', value: reason },
        ],
      }],
    },
  };
}

function makeCommand(options = {}) {
  const calls = [];
  const store = {
    async select(table) {
      assert.equal(table, 'guild_tb_plans');
      return [{ id: 'plan-1', guild_id: 'guild-1', tb_key: 'rote', name: 'P6 Operations', status: 'previewed' }];
    },
  };
  const contextResolver = { async resolve() { return context; } };
  const version = {
    id: 'run-2',
    guildId: 'guild-1',
    planId: options.planId || 'plan-1',
    rotePhase: options.phase || 'P6',
    versionNumber: 2,
    planHash: 'a'.repeat(64),
    assignments: [{ id: 'S1' }, { id: 'S2' }],
    unfilled: [{ id: 'S3' }],
    diagnostics: {},
  };
  const versionService = {
    async listVersions(receivedContext, input) {
      calls.push({ service: 'listVersions', receivedContext, input });
      return { versions: [{ version: { id: 'run-2', versionNumber: 2 } }] };
    },
    async getVersion(receivedContext, input) {
      calls.push({ service: 'getVersion', receivedContext, input });
      return { version, verification: { valid: options.hashValid !== false } };
    },
    async cancelVersion(receivedContext, input) {
      calls.push({ service: 'cancelVersion', receivedContext, input });
      return {
        version: {
          ...version,
          status: 'cancelled',
          cancelledAt: '2026-08-19T15:30:00Z',
          cancelledByUserId: context.userId,
          cancellationReason: input.reason,
        },
        hashVerification: { valid: true },
      };
    },
  };
  return { command: createDiscordTbStage9PlanCancelCommand({ store, contextResolver, versionService }), calls };
}

test('/tb plan-cancel resolves version number, verifies version identity and records cancellation reason', async () => {
  const fixture = makeCommand();
  const content = await fixture.command.execute(interaction());

  const cancel = fixture.calls.find((row) => row.service === 'cancelVersion');
  assert.ok(cancel);
  assert.equal(cancel.receivedContext.userId, context.userId);
  assert.deepEqual(cancel.input, { runId: 'run-2', reason: 'Roster changed after officer review' });
  assert.match(content, /Immutable ROTE Plan Cancelled/);
  assert.match(content, /v2/);
  assert.match(content, /payload hash ✅/);
  assert.match(content, /immutable assignment payload was not edited/i);
  assert.match(content, /fail-closed for future Stage 10 delivery/i);
  assert.match(content, /No assignments were published and no DMs were sent/);
});

test('/tb plan-cancel accepts direct immutable version ID without numeric lookup', async () => {
  const fixture = makeCommand();
  await fixture.command.execute(interaction('run-direct'));
  assert.equal(fixture.calls.some((row) => row.service === 'listVersions'), false);
  assert.equal(fixture.calls.find((row) => row.service === 'cancelVersion').input.runId, 'run-direct');
});

test('/tb plan-cancel rejects corrupt hash, wrong plan or wrong phase before cancellation RPC', async () => {
  for (const options of [{ hashValid: false }, { planId: 'plan-old' }, { phase: 'P5' }]) {
    const fixture = makeCommand(options);
    await assert.rejects(() => fixture.command.execute(interaction()));
    assert.equal(fixture.calls.some((row) => row.service === 'cancelVersion'), false);
  }
});
