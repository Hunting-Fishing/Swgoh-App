import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('interaction router intercepts /guild only after Discord signature and officer authorization', async () => {
  const source = await read('discord-interaction-router.mjs');
  assert.match(source, /executeDiscordGuildCommand/);
  assert.match(source, /command === "guild"/);
  assert.match(source, /verifyDiscordInteraction/);
  assert.match(source, /discordTbMemberHasOfficerPermission/);
  assert.match(source, /discordTbMemberHasConfiguredOfficerRole/);
  assert.match(source, /if \(!officerAuthorized\)/);
  assert.match(source, /scheduleGuildCommandResponse/);
});

test('Guild slash command schema exposes officer operations without removing existing /tb controls', async () => {
  const source = await read('scripts/register-discord-tb-commands.mjs');
  assert.match(source, /name: "tb"/);
  assert.match(source, /name: "guild"/);
  for (const name of ['status','verify-channel','unverify-channel','register-mates','ignore','sync','platoon-report']) {
    assert.ok(source.includes(`name: "${name}"`), `missing /guild ${name}`);
  }
});

test('Discord live planner merges canonical timed ignores and donation preferences with Discord controls', async () => {
  const source = await read('discord-tb-live.mjs');
  assert.match(source, /guild_member_operation_controls/);
  assert.match(source, /guild_unit_donation_preferences/);
  assert.match(source, /ignored_until/);
  assert.match(source, /Date\.parse/);
  assert.match(source, /stateIgnored/);
  assert.match(source, /canonical\.ignoredMembers/);
  assert.match(source, /statePreferences/);
  assert.match(source, /canonical\.preferences/);
  assert.match(source, /CANONICAL_OPERATION_CONTROLS_READ_FAILED/);
});

test('timed ignore writes to the shared tenant-bound Operations control table', async () => {
  const source = await read('discord-guild-operations-command.mjs');
  assert.match(source, /guild_member_operation_controls/);
  assert.match(source, /guild_id: context\.guild\.id/);
  assert.match(source, /player_id: member\.persistentId/);
  assert.match(source, /ignored_until: ignoredUntil/);
  assert.match(source, /days > 0/);
  assert.match(source, /days=0|Ignore Cleared/);
});
