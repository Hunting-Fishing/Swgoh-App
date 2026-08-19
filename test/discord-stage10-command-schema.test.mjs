import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyDiscordStage10TbCommandSchema,
  DISCORD_STAGE10_DELIVERY_SCHEMA_VERSION,
} from '../discord-stage10-command-schema.mjs';

const base = {
  type: 1,
  name: 'tb',
  description: 'SWGOH Territory Battle guild command',
  options: Array.from({ length: 24 }, (_, index) => ({ type: 1, name: `existing-${index + 1}`, description: `Existing ${index + 1}` })),
};

test('Stage 10 uses exactly the final /tb subcommand slot', () => {
  const result = applyDiscordStage10TbCommandSchema(base);
  assert.equal(result.changed, true);
  assert.deepEqual(result.added, ['plan-delivery']);
  assert.equal(result.command.options.length, 25);

  const delivery = result.command.options.find((row) => row.name === 'plan-delivery');
  assert.ok(delivery);
  assert.deepEqual(delivery.options.map((row) => row.name), ['action', 'phase', 'version', 'hash', 'confirm']);
  assert.deepEqual(delivery.options.map((row) => row.required), [true, true, true, false, false]);
  assert.deepEqual(delivery.options.find((row) => row.name === 'action').choices.map((row) => row.value), ['preview', 'status', 'publish']);
  assert.equal(delivery.options.find((row) => row.name === 'hash').min_length, 12);
  assert.deepEqual(delivery.options.find((row) => row.name === 'confirm').choices.map((row) => row.value), ['PUBLISH']);

  const second = applyDiscordStage10TbCommandSchema(result.command);
  assert.equal(second.changed, false);
  assert.equal(second.command.options.length, 25);
});

test('Stage 10 refuses to exceed Discord 25-subcommand limit', () => {
  const full = { ...base, options: [...base.options, { type: 1, name: 'already-25', description: '25' }] };
  assert.throws(() => applyDiscordStage10TbCommandSchema(full), /25-subcommand/i);
});

test('Stage 10 schema has an explicit version identifier', () => {
  assert.match(DISCORD_STAGE10_DELIVERY_SCHEMA_VERSION, /stage10-controlled-delivery-v2$/);
});

test('Stage 10 schema rejects non-TB command patching', () => {
  assert.throws(() => applyDiscordStage10TbCommandSchema({ name: 'guild', options: [] }), /registered \/tb command/i);
});
