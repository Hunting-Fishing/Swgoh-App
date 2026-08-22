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
  const [selector, mandalore, reva, parser] = await Promise.all([
    read('guild-tb-readiness-roster-service.mjs'),
    read('public/guild-mandalore-readiness-model.js'),
    read('public/guild-reva-readiness-model.js'),
    read('public/guild-tb-faction-tags.js'),
  ]);
  assert.match(selector, /guild-tb-faction-tags/);
  assert.match(mandalore, /guild-tb-faction-tags/);
  assert.match(reva, /guild-tb-faction-tags/);
  assert.match(parser, /startsWith\('ls'\)/);
  assert.match(parser, /startsWith\('ds'\)/);
});

test('TB reward truth is centralized and Zeffo cannot regress to GET2', async () => {
  const [facts, zeffo, mandalore, registry] = await Promise.all([
    read('public/tb-special-mission-facts.js'),
    read('public/guild-zeffo-readiness-model.js'),
    read('public/guild-mandalore-readiness-model.js'),
    read('public/tb-special-readiness-registry.js'),
  ]);
  assert.match(facts, /currency:\s*'GET3'/);
  assert.match(facts, /currency:\s*'GET2'/);
  assert.match(facts, /perSuccessfulClear:\s*50/);
  assert.match(facts, /theoreticalGuildMaximum:\s*2500/);
  assert.match(zeffo, /potentialGet3/);
  assert.doesNotMatch(zeffo, /rewardCurrency:\s*['"]GET2['"]/);
  assert.match(mandalore, /potentialGet2/);
  assert.match(registry, /TB_SPECIAL_MISSION_FACTS/);
});

test('TB officer UI keeps eligibility distinct from successful clears and all potential rewards', async () => {
  const page = await read('public/guild-tb-readiness-page.js');
  assert.match(page, /Eligible Attempts/);
  assert.match(page, /Successful Clears Required/);
  assert.match(page, /Potential GET3/);
  assert.match(page, /Potential GET2/);
  assert.match(page, /Potential Shards/);
  assert.match(page, /eligibility does not guarantee/i);
  assert.doesNotMatch(page, /Bracca mission also awards GET2/i);
  assert.match(page, /sourceLink\(report\)/);
});

test('Production data build and browser fallback both support real player portrait artwork', async () => {
  const [build, sync, registry, enhancer] = await Promise.all([
    read('scripts/build-production-data.mjs'),
    read('scripts/sync-player-portraits.mjs'),
    read('public/guild-player-portrait-registry.js'),
    read('public/guild-player-portrait-enhancer.js'),
  ]);
  assert.match(build, /sync-player-portraits\.mjs/);
  assert.match(sync, /playerPortrait\.json/);
  assert.match(sync, /game-assets\.swgoh\.gg/);
  assert.match(registry, /TRUSTED_ASSET_ORIGIN\s*=\s*'https:\/\/game-assets\.swgoh\.gg'/);
  assert.match(registry, /raw\.githubusercontent\.com\/swgoh-utils\/gamedata\/main\/playerPortrait\.json/);
  assert.match(registry, /public-gamedata-fallback/);
  assert.match(registry, /force-cache/);
  assert.match(enhancer, /data-player-portrait-id/);
});
