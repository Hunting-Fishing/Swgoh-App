import test from 'node:test';
import assert from 'node:assert/strict';

import { createDiscordTbStage10Command } from '../discord-tb-stage10-command.mjs';

function interaction(action) {
  return {
    data: {
      options: [{
        type: 1,
        name: 'plan-delivery',
        options: [
          { type: 3, name: 'action', value: action },
          { type: 3, name: 'phase', value: 'P6' },
          { type: 4, name: 'version', value: 3 },
        ],
      }],
    },
  };
}

const artifact = {
  rotePhase: 'P6',
  versionNumber: 3,
  planHash: 'a'.repeat(64),
  approvedAt: '2026-08-20T00:34:00+08:00',
  approvedPlanHash: 'a'.repeat(64),
  assignments: [{ member: { name: 'Warm Bacon' } }],
  unfilled: [],
};

function makeService() {
  return {
    preview: async () => ({
      context: { guild: { name: 'Ludus Venatus' } }, artifact,
      destination: { display_name: '#all-bots' }, channelId: '123456789012345678',
      chunks: ['one'], idempotencyKey: 'b'.repeat(64), delivered: 0, deliveryEnabled: false,
    }),
    status: async () => ({
      context: { guild: { name: 'Ludus Venatus' } }, artifact,
      verification: { valid: true }, channelId: '123456789012345678',
      idempotencyKey: 'b'.repeat(64), receipts: [],
    }),
    publish: async () => ({
      context: { guild: { name: 'Ludus Venatus' } }, artifact,
      channelId: '123456789012345678', idempotencyKey: 'b'.repeat(64),
      chunks: 1, newMessages: 1, reusedChunks: 0, memberDms: 0,
    }),
  };
}

test('plan-delivery PREVIEW is read-only and reports Stage 10 gate state', async () => {
  const command = createDiscordTbStage10Command({ service: makeService() });
  const output = await command.execute(interaction('preview'));
  assert.match(output, /Stage 10 ROTE Delivery Preview/);
  assert.match(output, /Safety gate: LOCKED/);
  assert.match(output, /Member DMs: OFF/);
});

test('plan-delivery STATUS renders durable receipt view', async () => {
  const command = createDiscordTbStage10Command({ service: makeService() });
  const output = await command.execute(interaction('status'));
  assert.match(output, /Stage 10 ROTE Delivery Status/);
  assert.match(output, /Lifecycle: \*\*APPROVED\*\*/);
  assert.match(output, /Receipts: \*\*0\*\*/);
});

test('plan-delivery PUBLISH reports no member DMs', async () => {
  const command = createDiscordTbStage10Command({ service: makeService() });
  const output = await command.execute(interaction('publish'));
  assert.match(output, /Channel Delivery Complete/);
  assert.match(output, /Member DMs sent: 0/);
});
