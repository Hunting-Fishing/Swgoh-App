import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const router = await readFile(new URL('../public/guild-tw-router.js', import.meta.url), 'utf8');
const schedule = await readFile(new URL('../public/guild-operations-schedule-enhancer.js', import.meta.url), 'utf8');
const discordAdmin = await readFile(new URL('../public/guild-discord-admin-enhancer.js', import.meta.url), 'utf8');
const account = await readFile(new URL('../account-onboarding.mjs', import.meta.url), 'utf8');

test('Guild route loads scheduling and Discord administration enhancers', () => {
  assert.match(router, /guild-operations-schedule-enhancer\.js/);
  assert.match(router, /guild-discord-admin-enhancer\.js/);
});

test('account router exposes all secure Guild Operations namespaces', () => {
  assert.match(account, /guild-discord-admin\//);
  assert.match(account, /guild-operation-schedules\//);
  assert.match(account, /guild-operations\//);
});

test('scheduler binds the real delivery destination selector and remains a sibling card', () => {
  assert.match(schedule, /getElementById\('opsDestination'\)/);
  assert.match(schedule, /insertAdjacentHTML\('afterend', cardHtml\(\)\)/);
  assert.doesNotMatch(schedule, /view\.insertAdjacentHTML\('beforeend'/);
});

test('scheduler sends timezone-local first-run data for server-side IANA conversion', () => {
  assert.match(schedule, /scheduledLocalDateTime:\s*runAtLocal/);
  assert.match(schedule, /scheduledTimezone/);
});

test('Discord administration UI makes exact-match safety explicit', () => {
  assert.match(discordAdmin, /Preview Exact Matches/);
  assert.match(discordAdmin, /Apply Exact Matches/);
  assert.match(discordAdmin, /Fuzzy matches are never applied automatically/);
  assert.match(discordAdmin, /Verify Channel/);
  assert.match(discordAdmin, /Unverify/);
});
