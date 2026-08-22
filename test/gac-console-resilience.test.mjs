import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const resilience = fs.readFileSync(path.join(root, 'public/gac-console-resilience.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');

test('GAC console resilience rate-limits repeated gateway failures', () => {
  assert.match(resilience, /GATEWAY_ERROR_TTL_MS = 15000/);
  assert.match(resilience, /status === 502 \|\| status === 503 \|\| status === 504/);
  assert.match(resilience, /gatewayCache\.set\(key, entry\)/);
  assert.match(resilience, /params\.delete\('refresh'\)/);
});

test('GAC console resilience blocks forbidden SWGOH.GG static portrait fallback', () => {
  assert.match(resilience, /swgoh\\\.gg\\\/static\\\/img\\\/assets/);
  assert.match(resilience, /gacBlockedExternalAsset/);
  assert.match(resilience, /data:image\/svg\+xml/);
});

test('console resilience loads immediately after the shared live fetch cache', () => {
  const cacheIndex = index.indexOf('/live-fetch-cache.js');
  const guardIndex = index.indexOf('/gac-console-resilience.js');
  const appIndex = index.indexOf('/app.js');
  assert.ok(cacheIndex >= 0);
  assert.ok(guardIndex > cacheIndex);
  assert.ok(appIndex > guardIndex);
});
