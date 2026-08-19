import test from 'node:test';
import assert from 'node:assert/strict';

import { createDiscordTbStage9PlanCommand } from '../discord-tb-stage9-plan-command.mjs';

const interaction = {
  guild_id: '123456789012345678',
  member: { user: { id: '234567890123456789' } },
  data: { name: 'tb', options: [{ type: 1, name: 'plan-status', options: [{ type: 3, name: 'phase', value: 'P6' }] }] },
};

const context = {
  guild: { id: 'guild-1', name: 'Test Guild' },
  userId: '11111111-1111-4111-8111-111111111111',
  role: 'officer',
};

function makeCommand(options = {}) {
  const calls = [];
  const store = {
    async select(table, query) {
      calls.push({ table, query });
      if (table !== 'guild_tb_plans') throw new Error(`Unexpected table ${table}`);
      if (options.noPlan) return [];
      return [{ id: 'plan-1', guild_id: 'guild-1', tb_key: 'rote', name: 'P6 Operations', status: 'previewed', updated_at: '2026-08-19T14:00:00Z' }];
    },
  };
  const contextResolver = { async resolve() { return context; } };
  const versionService = {
    async listVersions(receivedContext, input) {
      calls.push({ service: 'listVersions', receivedContext, input });
      return {
        versions: options.noVersions ? [] : [
          {
            version: {
              id: 'run-2', rotePhase: 'P6', versionNumber: 2, planHash: 'a'.repeat(64), status: 'preview',
              assignments: [{ id: 'S1' }, { id: 'S2', safety: { help: true } }], unfilled: [{ id: 'S3' }],
              diagnostics: { safetySummary: { helpAssignments: 1 } }, approvedAt: '2026-08-19T15:00:00Z', approvedPlanHash: 'a'.repeat(64),
              supersededByRunId: '', cancelledAt: '',
            },
            verification: { valid: true },
          },
          {
            version: {
              id: 'run-1', rotePhase: 'P6', versionNumber: 1, planHash: 'b'.repeat(64), status: 'preview',
              assignments: [{ id: 'S1' }], unfilled: [{ id: 'S2' }, { id: 'S3' }], diagnostics: {},
              approvedAt: '', approvedPlanHash: '', supersededByRunId: 'run-2', cancelledAt: '',
            },
            verification: { valid: true },
          },
        ],
      };
    },
  };
  return { command: createDiscordTbStage9PlanCommand({ store, contextResolver, versionService }), calls };
}

test('/tb plan-status shows latest immutable version, approval, hash, assignment and HELP counts', async () => {
  const { command, calls } = makeCommand();
  const content = await command.execute(interaction);

  assert.match(content, /Immutable ROTE Plan Status/);
  assert.match(content, /P6 Operations/);
  assert.match(content, /v2/);
  assert.match(content, /APPROVED/);
  assert.match(content, /2 assigned \/ 1 unfilled \/ 1 HELP/);
  assert.match(content, /v1/);
  assert.match(content, /SUPERSEDED/);
  assert.match(content, /cannot publish assignments or send DMs/i);

  const call = calls.find((row) => row.service === 'listVersions');
  assert.equal(call.input.planId, 'plan-1');
  assert.equal(call.input.rotePhase, 'P6');
  assert.equal(call.receivedContext.userId, context.userId);
});

test('/tb plan-status is read-only and handles no current plan without creating a version', async () => {
  const { command, calls } = makeCommand({ noPlan: true });
  const content = await command.execute(interaction);

  assert.match(content, /No active persisted ROTE plan exists yet/);
  assert.equal(calls.some((row) => row.service === 'listVersions'), false);
  assert.match(content, /No assignments were published and no DMs were sent/);
});

test('/tb plan-status handles current plan with no immutable versions', async () => {
  const { command } = makeCommand({ noVersions: true });
  const content = await command.execute(interaction);
  assert.match(content, /No Stage 9 immutable assignment versions exist/);
});
