import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const source = await readFile(new URL('public/guild-route-pages.js', root), 'utf8');

test('Guild sub-pages use client-side routing instead of reloading the application', () => {
  assert.match(source, /function navigateGuildRoute\(/);
  assert.match(source, /history\.pushState\(/);
  assert.match(source, /installGuildClientRouting\(\)/);
  assert.match(source, /a\[data-guild-route-nav\], a\.guild-route-card-link/);
  assert.match(source, /renderActivePage\(\)/);
});

test('Guild request loading cannot spin forever', () => {
  assert.match(source, /GUILD_REQUEST_TIMEOUT_MS = 25000/);
  assert.match(source, /new AbortController\(\)/);
  assert.match(source, /Guild data request timed out/);
  assert.match(source, /guildRouteRetry/);
});

test('Guild route health exposes client-routing and snapshot state', () => {
  assert.match(source, /__swgohGuildRouteHealth/);
  assert.match(source, /snapshotReady/);
  assert.match(source, /clientRouting/);
});
