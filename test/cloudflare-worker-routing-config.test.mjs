import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const wranglerUrl = new URL('../wrangler.jsonc', import.meta.url);

test('Cloudflare runs Worker first for API routes and root OAuth returns', async () => {
  const raw = await readFile(wranglerUrl, 'utf8');
  const config = JSON.parse(raw);
  const routes = config?.assets?.run_worker_first;

  assert.ok(Array.isArray(routes), 'assets.run_worker_first must be an explicit route list');
  assert.ok(routes.includes('/api/*'), 'API requests must run through the Worker before assets');
  assert.ok(routes.includes('/'), 'Root navigation must run through the Worker so /?code= OAuth returns are intercepted');
});
