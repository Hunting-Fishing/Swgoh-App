import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const router = await readFile(new URL('public/guild-tw-router.js', root), 'utf8');
const ui = await readFile(new URL('public/guild-discord-link-admin-enhancer.js', root), 'utf8');
const api = await readFile(new URL('guild-discord-admin-api.mjs', root), 'utf8');
const service = await readFile(new URL('guild-discord-link-admin-service.mjs', root), 'utf8');

test('Guild Operations loads manual Discord player-link administration', () => {
  assert.match(router, /guild-discord-link-admin-enhancer\.js/);
  assert.match(ui, /Manual Link Management & Stale-Link Cleanup/);
  assert.match(ui, /Verify & Link Member/);
  assert.match(ui, /CURRENT DURABLE LINKS/);
  assert.match(ui, /LEFT GUILD/);
  assert.match(ui, /LEFT SERVER/);
});

test('manual UI uses explicit confirmation for link and unlink writes', () => {
  assert.match(ui, /confirm\(`Link Discord user/);
  assert.match(ui, /confirm\(`Unlink/);
  assert.match(ui, /api\('link-member'\)/);
  assert.match(ui, /api\('unlink-member'\)/);
  assert.match(ui, /method: 'POST'/);
});

test('manual link backend verifies current Guild player and current bound Discord member before durable link', () => {
  assert.match(service, /PLAYER_NOT_CURRENT_GUILD_MEMBER/);
  assert.match(service, /\/guilds\/\$\{bound\.discordGuildId\}\/members\/\$\{discordUserId\}/);
  assert.match(service, /DISCORD_MEMBER_NOT_ELIGIBLE/);
  assert.match(service, /stateStore\.linkPlayer/);
  assert.match(service, /stateStore\.unlinkPlayer/);
  assert.match(service, /guild_operations_audit_log/);
});

test('manual link routes remain session protected and same-origin writes', () => {
  assert.match(api, /session\.currentUser/);
  assert.match(api, /action === 'links'/);
  assert.match(api, /action === 'link-member'/);
  assert.match(api, /action === 'unlink-member'/);
  assert.match(api, /sameOrigin\(request\)/);
});
