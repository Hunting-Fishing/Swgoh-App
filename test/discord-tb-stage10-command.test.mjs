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

function makeService({ includeMentions = true } = {}) {
  const common = {
    context: { guild: { name: 'Ludus Venatus' } },
    artifact,
    destination: { display_name: '#tb-assignments' },
    channelId: '123456789012345678',
    includeMentions,
    mentionCoverage: { assignedMembers: 2, linkedMembers: 1, unlinkedMembers: 1 },
    idempotencyKey: 'b'.repeat(64),
  };
  return {
    preview: async () => ({
      ...common,
      chunks: [{ content: 'one', allowedUsers: [] }], delivered: 0, deliveryEnabled: false,
    }),
    status: async () => ({
      ...common,
      verification: { valid: true }, receipts: [],
    }),
    publish: async () => ({
      ...common,
      chunks: 1, newMessages: 1, reusedChunks: 0, memberDms: 0,
    }),
  };
}

test('plan-delivery PREVIEW reports safe mention coverage and verified channel without sending', async () => {
  const command = createDiscordTbStage10Command({ service: makeService() });
  const output = await command.execute(interaction('preview'));
  assert.match(output, /Stage 10 ROTE Delivery Preview/);
  assert.match(output, /Safety gate: LOCKED/);
  assert.match(output, /Member @mentions: ON/);
  assert.match(output, /linked assigned members \*\*1\/2\*\*/);
  assert.match(output, /<\#123456789012345678>/);
  assert.match(output, /@everyone\/@here\/role parsing: OFF/);
  assert.match(output, /Member DMs: OFF/);
});

test('plan-delivery STATUS renders durable receipt and mention-policy view', async () => {
  const command = createDiscordTbStage10Command({ service: makeService() });
  const output = await command.execute(interaction('status'));
  assert.match(output, /Stage 10 ROTE Delivery Status/);
  assert.match(output, /Lifecycle: \*\*APPROVED\*\*/);
  assert.match(output, /Member @mentions: ON/);
  assert.match(output, /Receipts: \*\*0\*\*/);
});

test('plan-delivery PUBLISH reports linked mentions but no member DMs', async () => {
  const command = createDiscordTbStage10Command({ service: makeService() });
  const output = await command.execute(interaction('publish'));
  assert.match(output, /Channel Delivery Complete/);
  assert.match(output, /Member @mentions: ON/);
  assert.match(output, /Member DMs sent: 0/);
});

test('plan-delivery can explicitly report mentions OFF', async () => {
  const command = createDiscordTbStage10Command({ service: makeService({ includeMentions: false }) });
  const output = await command.execute(interaction('preview'));
  assert.match(output, /Member @mentions: OFF/);
  assert.match(output, /names only/);
});
