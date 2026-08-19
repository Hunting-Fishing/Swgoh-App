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

test('adds Stage 9 plan commands exactly once without changing existing TB subcommands', () => {
  const first = applyDiscordStage9TbCommandSchema(base);
  assert.equal(first.changed, true);
  assert.deepEqual(first.added, ['plan-status', 'plan-diff', 'plan-approve']);
  assert.deepEqual(first.command.options.slice(0, 2), base.options);

  const status = first.command.options.find((row) => row.name === 'plan-status');
  assert.ok(status);
  assert.equal(status.options[0].name, 'phase');
  assert.equal(status.options[0].required, false);
  assert.deepEqual(status.options[0].choices.map((row) => row.value), ['P1', 'P2', 'P3', 'P4', 'P5', 'P6']);

  const diff = first.command.options.find((row) => row.name === 'plan-diff');
  assert.ok(diff);
  assert.deepEqual(diff.options.map((row) => row.name), ['phase', 'from', 'to']);
  assert.equal(diff.options.every((row) => row.required === true), true);

  const approve = first.command.options.find((row) => row.name === 'plan-approve');
  assert.ok(approve);
  assert.deepEqual(approve.options.map((row) => row.name), ['phase', 'version', 'hash']);
  assert.equal(approve.options.every((row) => row.required === true), true);
  assert.equal(approve.options.find((row) => row.name === 'hash').min_length, 12);
  assert.equal(approve.options.find((row) => row.name === 'hash').max_length, 64);

  const second = applyDiscordStage9TbCommandSchema(first.command);
  assert.equal(second.changed, false);
  for (const name of ['plan-status', 'plan-diff', 'plan-approve']) {
    assert.equal(second.command.options.filter((row) => row.name === name).length, 1);
  }
});

test('Stage 9 command schema has its own explicit version identifier', () => {
  assert.match(DISCORD_STAGE9_PLAN_SCHEMA_VERSION, /stage9-plan-approve-v3$/);
});

test('rejects accidental patching of a non-TB Discord command', () => {
  assert.throws(() => applyDiscordStage9TbCommandSchema({ name: 'guild', options: [] }), /requires the registered \/tb command/i);
});
