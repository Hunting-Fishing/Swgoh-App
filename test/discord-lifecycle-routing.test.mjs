import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const router = await readFile(new URL('../discord-interaction-router.mjs', import.meta.url), 'utf8');
const schema = await readFile(new URL('../scripts/register-discord-tb-commands.mjs', import.meta.url), 'utf8');
const lifecycle = await readFile(new URL('../discord-player-lifecycle-command.mjs', import.meta.url), 'utf8');
const guild = await readFile(new URL('../discord-guild-operations-command.mjs', import.meta.url), 'utf8');

test('self-service lifecycle still occurs only after signed Discord request checks', () => {
  const verify = router.indexOf('verifyDiscordInteraction');
  const lifecycleBranch = router.indexOf('if (isPlayerLifecycle)');
  const officerBranch = router.indexOf('let officerAuthorized');
  assert.ok(verify >= 0 && lifecycleBranch > verify, 'lifecycle must not run before signature verification');
  assert.ok(officerBranch > lifecycleBranch, 'self-service must be evaluated before officer-only gate');
  assert.match(router, /config\.pilotGuildId/);
  assert.match(router, /application_id/);
});

test('self-service schema exposes no target-member option for /tb ignore or unregister', () => {
  const ignoreStart = schema.indexOf('name: "ignore"');
  const unregisterStart = schema.indexOf('name: "unregister"', ignoreStart);
  const ignoreBlock = schema.slice(ignoreStart, unregisterStart);
  assert.match(ignoreBlock, /name: "days"/);
  assert.match(ignoreBlock, /name: "reason"/);
  assert.doesNotMatch(ignoreBlock, /name: "member"/);
  assert.match(schema, /name: "unregister"/);
});

test('player unregister uses the durable self link and does not delete canonical Guild history', () => {
  assert.match(lifecycle, /stateStore\.unlinkPlayer/);
  assert.match(lifecycle, /discordUserId: context\.discordUserId/);
  assert.doesNotMatch(lifecycle, /delete\('players'/);
  assert.doesNotMatch(lifecycle, /delete\('guilds'/);
  assert.match(lifecycle, /Canonical Guild history and your Command Center account data were not deleted/);
});

test('Guild donation report deduplicates member-unit preferences across canonical and Discord sources', () => {
  assert.match(guild, /guild_unit_donation_preferences/);
  assert.match(guild, /memberPreferences/);
  assert.match(guild, /rows = new Map\(\)/);
  assert.match(guild, /if \(!rows\.has\(key\)\)/);
  assert.match(guild, /donation-report/);
});
