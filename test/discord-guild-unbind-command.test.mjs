import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const command = await readFile(new URL('../discord-guild-operations-command.mjs', import.meta.url), 'utf8');
const schema = await readFile(new URL('../scripts/register-discord-tb-commands.mjs', import.meta.url), 'utf8');
const service = await readFile(new URL('../discord-guild-unbind-service.mjs', import.meta.url), 'utf8');

test('/guild unregister requires an explicit confirmation choice', () => {
  assert.match(schema, /name: "unregister"[\s\S]*name: "confirm"[\s\S]*required: true[\s\S]*UNREGISTER GUILD INTEGRATION/);
  assert.match(command, /option\(interaction, 'confirm'\)[\s\S]*!== 'UNREGISTER'/);
  assert.match(command, /explicit UNREGISTER confirmation choice/);
});

test('Guild unregister disables integrations instead of deleting canonical Guild intelligence', () => {
  assert.match(service, /guild_discord_destinations/);
  assert.match(service, /verified: false/);
  assert.match(service, /guild_operation_schedules/);
  assert.match(service, /status: 'paused'/);
  assert.match(service, /default_delivery_mode: 'preview'/);
  assert.match(service, /clearGuild/);
  assert.match(service, /stateStore\.unbindGuild/);
  assert.doesNotMatch(service, /delete\(['"]guilds['"]/);
  assert.doesNotMatch(service, /delete\(['"]players['"]/);
  assert.doesNotMatch(service, /delete\(['"]guild_intelligence/);
  assert.match(service, /canonical Guild identity and roster history/);
  assert.match(service, /Guild Intelligence daily\/history data/);
  assert.match(service, /Discord delivery receipts and Operations audit history/);
});

test('Guild unregister reports disabled and cleared Discord-specific state', () => {
  assert.match(command, /Verified destinations disabled/);
  assert.match(command, /Scheduled Operations paused/);
  assert.match(command, /Discord player links cleared/);
  assert.match(command, /Discord hard reserves cleared/);
  assert.match(command, /cannot use the pilot Guild fallback/);
  assert.match(command, /\/tb setup/);
});
