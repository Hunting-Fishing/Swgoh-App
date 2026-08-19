import test from 'node:test';
import assert from 'node:assert/strict';

import { createDiscordTbStage9PlanCommand } from '../discord-tb-stage9-plan-command.mjs';

const fullHash = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
const context = {
  guild: { id: 'guild-1', name: 'Test Guild' },
  userId: '11111111-1111-4111-8111-111111111111',
  role: 'officer',
};

function interaction(hash = fullHash.slice(0, 12), version = '2') {
  return {
    guild_id: '123456789012345678',
    member: { user: { id: '234567890123456789' } },
    data: {
      name: 'tb',
      options: [{
        type: 1,
        name: 'plan-approve',
        options: [
          { type: 3, name: 'phase', value: 'P6' },
          { type: 3, name: 'version', value: version },
          { type: 3, name: 'hash', value: hash },
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
    planHash: fullHash,
    assignments: [{ id: 'S1' }, { id: 'S2', safety: { help: true } }],
    unfilled: [{ id: 'S3' }],
    diagnostics: { safetySummary: { helpAssignments: 1 } },
    approvedAt: '',
    approvedPlanHash: '',
  };
  const versionService = {
    async listVersions(receivedContext, input) {
      calls.push({ service: 'listVersions', receivedContext, input });
      return { versions: [{ version: { id: 'run-2', versionNumber: 2 } }] };
    },
    async getVersion(receivedContext, input) {
      calls.push({ service: 'getVersion', receivedContext, input });
      return { version, verification: { valid: options.hashValid !== false, stored: fullHash, recomputed: fullHash } };
    },
    async approveVersion(receivedContext, input) {
      calls.push({ service: 'approveVersion', receivedContext, input });
      return {
        version: {
          ...version,
          approvedAt: '2026-08-19T15:00:00Z',
          approvedByUserId: context.userId,
          approvedPlanHash: fullHash,
        },
      };
    },
  };
  const compareService = { async compareVersions() { throw new Error('not used'); } };
  return { command: createDiscordTbStage9PlanCommand({ store, contextResolver, versionService, compareService }), calls };
}

test('/tb plan-approve resolves version number, verifies hash prefix and approves with full stored hash', async () => {
  const { command, calls } = makeCommand();
  const content = await command.execute(interaction());

  const approve = calls.find((row) => row.service === 'approveVersion');
  assert.ok(approve);
  assert.equal(approve.receivedContext.userId, context.userId);
  assert.deepEqual(approve.input, { runId: 'run-2', planHash: fullHash });
  assert.match(content, /Immutable ROTE Plan Approved/);
  assert.match(content, /v2/);
  assert.match(content, /2 assigned/);
  assert.match(content, /1 unfilled/);
  assert.match(content, /1 HELP/);
  assert.match(content, /Stage 10 delivery remains locked/);
  assert.match(content, /does not publish assignments or send DMs/);
});

test('/tb plan-approve rejects short or mismatched hash confirmation before approval RPC', async () => {
  let fixture = makeCommand();
  await assert.rejects(() => fixture.command.execute(interaction('abcdef')), /at least the first 12 hexadecimal/i);
  assert.equal(fixture.calls.some((row) => row.service === 'approveVersion'), false);

  fixture = makeCommand();
  await assert.rejects(() => fixture.command.execute(interaction('111111111111')), /does not match/i);
  assert.equal(fixture.calls.some((row) => row.service === 'approveVersion'), false);
});

test('/tb plan-approve rejects corrupt hash, wrong plan or wrong phase before approval RPC', async () => {
  for (const options of [{ hashValid: false }, { planId: 'plan-old' }, { phase: 'P5' }]) {
    const fixture = makeCommand(options);
    await assert.rejects(() => fixture.command.execute(interaction()));
    assert.equal(fixture.calls.some((row) => row.service === 'approveVersion'), false);
  }
});
