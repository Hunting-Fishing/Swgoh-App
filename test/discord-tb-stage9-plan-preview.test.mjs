import test from 'node:test';
import assert from 'node:assert/strict';

import { createDiscordTbStage9PlanPreviewCommand } from '../discord-tb-stage9-plan-preview-command.mjs';

const fullHash = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
const fingerprint = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
const context = Object.freeze({
  guild: { id: 'guild-1', name: 'Test Guild' },
  userId: '11111111-1111-4111-8111-111111111111',
  role: 'officer',
  discordGuildId: '123456789012345678',
  seedAllyCode: '123456789',
});

function interaction(phase = 'P6') {
  return {
    guild_id: context.discordGuildId,
    member: { user: { id: '234567890123456789' } },
    data: {
      name: 'tb',
      options: [{ type: 1, name: 'plan-preview', options: [{ type: 3, name: 'phase', value: phase }] }],
    },
  };
}

function fixture(options = {}) {
  const calls = [];
  const store = {
    async select(table, query) {
      calls.push({ table, query });
      if (table !== 'guild_tb_plans') throw new Error(`Unexpected table: ${table}`);
      if (options.noPlan) return [];
      return [{ id: 'plan-1', guild_id: 'guild-1', tb_key: 'rote', name: 'Officer ROTE Plan', status: 'previewed', updated_at: '2026-08-19T14:00:00Z' }];
    },
  };
  const contextResolver = { async resolve() { return context; } };
  const previewService = {
    async createPreview(receivedContext, input) {
      calls.push({ service: 'createPreview', receivedContext, input });
      return {
        plan: { id: 'plan-1', name: 'Officer ROTE Plan', status: 'previewed' },
        phase: 'P6',
        inputFingerprint: fingerprint,
        version: {
          id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
          planId: 'plan-1',
          rotePhase: 'P6',
          versionNumber: 7,
          planHash: fullHash,
          supersedesRunId: options.noSupersede ? '' : '11111111-2222-4333-8444-555555555555',
        },
        verification: { valid: options.hashValid !== false },
        controlsStable: options.controlsStable !== false,
        summary: { assigned: 112, unfilled: 158, helpAssignments: 3 },
      };
    },
  };
  return { command: createDiscordTbStage9PlanPreviewCommand({ store, contextResolver, previewService }), calls };
}

test('/tb plan-preview creates a phase-scoped immutable version and prints exact approval material', async () => {
  const { command, calls } = fixture();
  const content = await command.execute(interaction());

  const create = calls.find((row) => row.service === 'createPreview');
  assert.ok(create);
  assert.equal(create.receivedContext.userId, context.userId);
  assert.equal(create.input.planId, 'plan-1');
  assert.equal(create.input.phase, 'P6');
  assert.equal(create.input.interaction.guild_id, context.discordGuildId);

  assert.match(content, /Immutable ROTE Plan Preview Created/);
  assert.match(content, /v7/);
  assert.match(content, /112/);
  assert.match(content, /158/);
  assert.match(content, /3/);
  assert.match(content, new RegExp(fullHash));
  assert.match(content, new RegExp(fingerprint));
  assert.match(content, /PASS ✅/);
  assert.match(content, /controls stable: \*\*YES ✅\*\*/);
  assert.match(content, /AWAITING OFFICER APPROVAL/);
  assert.match(content, /plan-approve phase:P6 version:7 hash:abcdef123456/);
  assert.match(content, /Stage 10 delivery remains locked/);
  assert.match(content, /did not publish assignments and did not send member DMs/);
});

test('/tb plan-preview refuses to run without a current persisted ROTE plan', async () => {
  const { command, calls } = fixture({ noPlan: true });
  await assert.rejects(() => command.execute(interaction()), /No active persisted ROTE plan exists/i);
  assert.equal(calls.some((row) => row.service === 'createPreview'), false);
});

test('/tb plan-preview validates the requested ROTE phase before live planner execution', async () => {
  const { command, calls } = fixture();
  await assert.rejects(() => command.execute(interaction('P7')), /P1 through P6/i);
  assert.equal(calls.some((row) => row.service === 'createPreview'), false);
});
