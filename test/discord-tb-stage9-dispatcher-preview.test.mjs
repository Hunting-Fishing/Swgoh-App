import test from 'node:test';
import assert from 'node:assert/strict';

import { createDiscordTbStage9Command } from '../discord-tb-stage9-command.mjs';

function interaction(name) {
  return { data: { name: 'tb', options: [{ type: 1, name, options: [] }] } };
}

test('Stage 9 dispatcher routes plan-preview to its isolated mutating lifecycle command', async () => {
  const calls = [];
  const command = createDiscordTbStage9Command({
    previewCommand: { execute: async () => { calls.push('preview'); return 'preview'; } },
    cancelCommand: { execute: async () => { calls.push('cancel'); return 'cancel'; } },
    planCommand: { execute: async () => { calls.push('plan'); return 'plan'; } },
  });
  assert.equal(await command.execute(interaction('plan-preview')), 'preview');
  assert.deepEqual(calls, ['preview']);
});

test('Stage 9 dispatcher preserves isolated cancellation and read/approval routing', async () => {
  const calls = [];
  const command = createDiscordTbStage9Command({
    previewCommand: { execute: async () => { calls.push('preview'); return 'preview'; } },
    cancelCommand: { execute: async () => { calls.push('cancel'); return 'cancel'; } },
    planCommand: { execute: async () => { calls.push('plan'); return 'plan'; } },
  });
  assert.equal(await command.execute(interaction('plan-cancel')), 'cancel');
  assert.equal(await command.execute(interaction('plan-status')), 'plan');
  assert.deepEqual(calls, ['cancel', 'plan']);
});
