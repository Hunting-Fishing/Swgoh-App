import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const router = await readFile(new URL('public/guild-tw-router.js', root), 'utf8');
const ui = await readFile(new URL('public/guild-discord-link-admin-enhancer.js', root), 'utf8');
const api = await readFile(new URL('guild-discord-admin-api.mjs', root), 'utf8');
const service = await readFile(new URL('guild-discord-link-admin-service.mjs', root), 'utf8');

test('Guild Operations loads the Discord registration manager', () => {
  assert.match(router, /guild-discord-link-admin-enhancer\.js/);
  assert.match(ui, /Guild Mention Coverage & Officer Pairing/);
  assert.match(ui, /EXACT SAFE SUGGESTIONS/);
  assert.match(ui, /OFFICER MANUAL PAIRING/);
  assert.match(ui, /Verify & Link Selected Members/);
  assert.match(ui, /CURRENT DURABLE LINKS/);
  assert.match(ui, /LEFT GUILD/);
  assert.match(ui, /LEFT SERVER/);
});

test('registration manager uses selectable candidate inventories and explicit confirmations', () => {
  assert.match(ui, /availableDiscordMembers/);
  assert.match(ui, /unlinkedCurrentPlayers/);
  assert.match(ui, /exactSuggestions/);
  assert.match(ui, /opsManualDiscordUserId/);
  assert.match(ui, /opsManualSwgohAllyCode/);
  assert.match(ui, /confirm\(`Link \$\{discordLabel\} to \$\{playerLabel\}/);
  assert.match(ui, /confirm\(`Apply \$\{suggestions\.length\} one-to-one exact normalized/);
  assert.match(ui, /api\('match-guildmates'\)/);
  assert.match(ui, /api\('link-member'\)/);
  assert.match(ui, /api\('unlink-member'\)/);
  assert.match(ui, /method: 'POST'/);
});

test('registration backend exposes safe candidates and verifies current Guild/player identity before durable link', () => {
  assert.match(service, /availableDiscordMembers/);
  assert.match(service, /unlinkedCurrentPlayers/);
  assert.match(service, /exactSuggestions/);
  assert.match(service, /ambiguousSuggestions/);
  assert.match(service, /mentionCoveragePercent/);
  assert.match(service, /PLAYER_NOT_CURRENT_GUILD_MEMBER/);
  assert.match(service, /\/guilds\/\$\{bound\.discordGuildId\}\/members\/\$\{discordUserId\}/);
  assert.match(service, /DISCORD_MEMBER_NOT_ELIGIBLE/);
  assert.match(service, /DISCORD_USER_ALREADY_LINKED/);
  assert.match(service, /ALLY_CODE_ALREADY_LINKED/);
  assert.match(service, /stateStore\.linkPlayer/);
  assert.match(service, /stateStore\.unlinkPlayer/);
  assert.match(service, /guild_operations_audit_log/);
});

test('manual and bulk link routes remain session protected and same-origin writes', () => {
  assert.match(api, /session\.currentUser/);
  assert.match(api, /action === 'links'/);
  assert.match(api, /action === 'match-guildmates'/);
  assert.match(api, /action === 'link-member'/);
  assert.match(api, /action === 'unlink-member'/);
  assert.match(api, /sameOrigin\(request\)/);
});
