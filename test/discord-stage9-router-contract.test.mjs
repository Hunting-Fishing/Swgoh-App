import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const source = (path) => readFile(new URL(path, root), 'utf8');

test('Discord router intercepts all Stage 9 plan commands and applies existing officer authorization before execution', async () => {
  const router = await source('discord-interaction-router.mjs');
  assert.match(router, /isDiscordTbStage9PlanSubcommand/);
  assert.match(router, /const isStage9Plan =/);
  assert.match(router, /if \(!officerAuthorized\)/);
  assert.match(router, /else if \(isStage9Plan\) scheduleStage9PlanResponse/);
  assert.match(router, /command\.execute\(interaction\)/);
  assert.match(router, /No guild state was changed, no assignments were published, and no DMs were sent/);
});

test('Stage 9 command itself retains canonical Command Center officer context and no delivery surface', async () => {
  const command = await source('discord-tb-stage9-plan-command.mjs');
  assert.match(command, /discordStage9OfficerContext/);
  assert.match(command, /tbAssignmentPublishabilityService/);
  assert.match(command, /tbAssignmentVersionCompareService/);
  assert.match(command, /delivery: \{ mode: 'preview', published: false, dmsSent: false \}/);
  assert.match(command, /Approval only\. No assignments were published and no DMs were sent/);
  assert.doesNotMatch(command, /\.publish\(/);
  assert.doesNotMatch(command, /sendDms\s*:\s*true/);
});
