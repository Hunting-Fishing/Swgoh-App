import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const registry = await readFile(new URL('web-action-registry.mjs', root), 'utf8');
const service = await readFile(new URL('web-action-service.mjs', root), 'utf8');
const api = await readFile(new URL('web-action-api.mjs', root), 'utf8');
const account = await readFile(new URL('account-onboarding.mjs', root), 'utf8');
const page = await readFile(new URL('public/actions/index.html', root), 'utf8');
const ui = await readFile(new URL('public/web-actions.js', root), 'utf8');
const feed = await readFile(new URL('public/web-action-feed.js', root), 'utf8');
const guildRouter = await readFile(new URL('public/guild-tw-router.js', root), 'utf8');
const onboarding = await readFile(new URL('public/onboarding/index.html', root), 'utf8');
const migration = await readFile(new URL('supabase/migrations/20260818160000_web_action_center_foundation.sql', root), 'utf8');

test('Raid Max is registered as a website-native action with Discord explicitly optional', () => {
  assert.match(registry, /key: 'raid-max'/);
  assert.match(registry, /'\/raid max'/);
  assert.match(registry, /'\/raidmax'/);
  assert.match(registry, /execution: 'website-native'/);
  assert.match(registry, /discordRequired: false/);
  assert.match(registry, /shareTargets: Object\.freeze\(\['player-page', 'guild-page', 'discord'\]\)/);
});

test('execution and publication are separate server operations', () => {
  assert.match(api, /\/api\/account\/web-actions\/execute/);
  assert.match(api, /\/share\$/);
  assert.match(api, /sameOrigin/);
  assert.match(service, /canonical\.getPlayerRoster/);
  assert.match(service, /web_action_runs/);
  assert.match(service, /web_action_publications/);
  assert.doesNotMatch(service, /execute\([\s\S]{0,800}shareDiscord/);
});

test('website UI tells users Discord is optional and never auto-posts a completed action', () => {
  assert.match(page, /Run the tools\. <span>Discord optional\.<\/span>/);
  assert.match(page, /Publishing is optional\. Running the action never posts automatically\./);
  assert.match(page, /Share to My Player Page/);
  assert.match(page, /Share to Guild Page/);
  assert.match(page, /Share to Discord/);
  assert.match(ui, /Nothing was posted automatically/);
});

test('app-native Player and Guild command feeds are wired globally and link back to the Action Center', () => {
  assert.match(guildRouter, /web-action-feed\.js/);
  assert.match(feed, /feed\/player/);
  assert.match(feed, /feed\/guild/);
  assert.match(feed, /Open Action Center/);
  assert.match(feed, /SHARED COMMAND RESULTS/);
});

test('verified onboarding exposes the normal-click Action Center entry point', () => {
  assert.match(onboarding, /href="\/actions"/);
  assert.match(onboarding, /Open Action Center/);
});

test('website action API is routed before generic account onboarding handling', () => {
  assert.match(account, /import \{ webActionApi \}/);
  assert.match(account, /startsWith\('\/api\/account\/web-actions'\)/);
  assert.match(account, /webActionApi\.handle/);
});

test('durable action tables are server-only and support independent app or Discord publications', () => {
  assert.match(migration, /create table if not exists public\.web_action_runs/);
  assert.match(migration, /create table if not exists public\.web_action_publications/);
  assert.match(migration, /target_kind in \('player_page','guild_page','discord'\)/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all on table public\.web_action_runs from anon,authenticated/);
  assert.match(migration, /revoke all on table public\.web_action_publications from anon,authenticated/);
});
