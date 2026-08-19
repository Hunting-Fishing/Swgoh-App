import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyDiscordStage9TbCommandSchema,
  DISCORD_STAGE9_PLAN_SCHEMA_VERSION,
} from '../discord-stage9-command-schema.mjs';

const base = {
  type: 1,
  name: 'tb',
  description: 'SWGOH Territory Battle guild command',
  options: [
    { type: 1, name: 'status', description: 'Status' },
    { type: 1, name: 'assignments', description: 'Assignments' },
  ],
};

test('adds Stage 9 plan lifecycle commands exactly once without changing existing TB subcommands', () => {
  const first = applyDiscordStage9TbCommandSchema(base);
  assert.equal(first.changed, true);
  assert.deepEqual(first.added, ['plan-preview', 'plan-status', 'plan-diff', 'plan-approve', 'plan-cancel']);
  assert.deepEqual(first.command.options.slice(0, 2), base.options);

  const preview = first.command.options.find((row) => row.name === 'plan-preview');
  assert.ok(preview);
  assert.deepEqual(preview.options.map((row) => row.name), ['phase']);
  assert.equal(preview.options[0].required, true);
  assert.equal(preview.options[0].choices.length, 6);

  const status = first.command.options.find((row) => row.name === 'plan-status');
  assert.ok(status);
  assert.equal(status.options[0].required, false);

  const diff = first.command.options.find((row) => row.name === 'plan-diff');
  assert.deepEqual(diff.options.map((row) => row.name), ['phase', 'from', 'to']);
  assert.equal(diff.options.every((row) => row.required === true), true);

  const approve = first.command.options.find((row) => row.name === 'plan-approve');
  assert.deepEqual(approve.options.map((row) => row.name), ['phase', 'version', 'hash']);
  assert.equal(approve.options.find((row) => row.name === 'hash').min_length, 12);

  const cancel = first.command.options.find((row) => row.name === 'plan-cancel');
  assert.deepEqual(cancel.options.map((row) => row.name), ['phase', 'version', 'reason']);
  assert.deepEqual(cancel.options.map((row) => row.required), [true, true, false]);
  assert.equal(cancel.options.find((row) => row.name === 'reason').max_length, 300);

  const second = applyDiscordStage9TbCommandSchema(first.command);
  assert.equal(second.changed, false);
  for (const name of ['plan-preview', 'plan-status', 'plan-diff', 'plan-approve', 'plan-cancel']) {
    assert.equal(second.command.options.filter((row) => row.name === name).length, 1);
  }
});

test('Stage 9 command schema has its own explicit version identifier', () => {
  assert.match(DISCORD_STAGE9_PLAN_SCHEMA_VERSION, /stage9-plan-preview-v5$/);
});

test('rejects accidental patching of a non-TB Discord command', () => {
  assert.throws(() => applyDiscordStage9TbCommandSchema({ name: 'guild', options: [] }), /requires the registered \/tb command/i);
});

test('fails closed before Discord root command option overflow', () => {
  const crowded = {
    ...base,
    options: Array.from({ length: 21 }, (_, index) => ({ type: 1, name: `base-${index}`, description: 'Base command' })),
  };
  assert.throws(() => applyDiscordStage9TbCommandSchema(crowded), /25-option \/tb limit/i);
});
