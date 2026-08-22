import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFile(path.join(root, file), 'utf8');

test('Guild shells load leadership and TB portrait enhancement modules', async () => {
  const [guildIndex, membersIndex, readinessEntry] = await Promise.all([
    read('public/guild/index.html'),
    read('public/guild/members/index.html'),
    read('public/guild-safe-readiness-entry.js'),
  ]);
  assert.match(guildIndex, /guild-leadership-ui\.js/);
  assert.match(membersIndex, /guild-leadership-ui\.js/);
  assert.match(readinessEntry, /guild-player-portrait-enhancer\.js/);
});

test('Canonical Guild identity migration exposes rank, title and portrait without a new table', async () => {
  const migration = await read('supabase/migrations/20260822194000_guild_member_identity_profile.sql');
  assert.match(migration, /memberLevel/);
  assert.match(migration, /memberRole/);
  assert.match(migration, /profileTitle/);
  assert.match(migration, /playerPortrait/);
  assert.doesNotMatch(migration, /create\s+table/i);
  assert.match(migration, /when 4 then 'Guild Leader'/);
  assert.match(migration, /when 3 then 'Officer'/);
  assert.match(migration, /when 2 then 'Member'/);
});

test('TB category selection and mission models share normalized faction-tag handling', async () => {
  const [selector, mandalore, reva] = await Promise.all([
    read('guild-tb-readiness-roster-service.mjs'),
    read('public/guild-mandalore-readiness-model.js'),
    read('public/guild-reva-readiness-model.js'),
  ]);
  assert.match(selector, /guild-tb-faction-tags/);
  assert.match(mandalore, /guild-tb-faction-tags/);
  assert.match(reva, /guild-tb-faction-tags/);
});

test('TB officer UI keeps eligibility distinct from successful clears and potential rewards', async () => {
  const page = await read('public/guild-tb-readiness-page.js');
  assert.match(page, /Eligible Attempts/);
  assert.match(page, /Successful Clears Required/);
  assert.match(page, /Potential GET2/);
  assert.match(page, /Potential Shards/);
  assert.match(page, /eligibility does not guarantee/i);
});

test('Production data build refreshes the fail-soft player portrait registry', async () => {
  const [build, sync, registry] = await Promise.all([
    read('scripts/build-production-data.mjs'),
    read('scripts/sync-player-portraits.mjs'),
    read('public/guild-player-portrait-registry.js'),
  ]);
  assert.match(build, /sync-player-portraits\.mjs/);
  assert.match(sync, /playerPortrait\.json/);
  assert.match(sync, /game-assets\.swgoh\.gg/);
  assert.match(registry, /TRUSTED_ASSET_ORIGIN\s*=\s*'https:\/\/game-assets\.swgoh\.gg'/);
  assert.match(registry, /force-cache/);
});
