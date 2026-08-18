import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const router = await readFile(new URL('public/guild-tw-router.js', root), 'utf8');
const ui = await readFile(new URL('public/guild-integration-report-enhancer.js', root), 'utf8');
const api = await readFile(new URL('guild-discord-admin-api.mjs', root), 'utf8');
const service = await readFile(new URL('guild-integration-report-service.mjs', root), 'utf8');

test('Guild route loads the integration intelligence enhancer', () => {
  assert.match(router, /guild-integration-report-enhancer\.js/);
});

test('integration intelligence UI is read-only and exposes health plus GIVE KEEP precedence', () => {
  assert.match(ui, /GUILD INTEGRATION INTELLIGENCE/);
  assert.match(ui, /Operations Health & Donation Preferences/);
  assert.match(ui, /LATEST DISCORD DELIVERY/);
  assert.match(ui, /GIVE \/ KEEP INTELLIGENCE/);
  assert.match(ui, /canonical web officer value wins/);
  assert.match(ui, /Refresh Integration Intelligence/);
  assert.doesNotMatch(ui, /fetch\([^\n]*method:\s*['"]POST/);
});

test('integration report route stays inside the authenticated Guild Discord admin namespace', () => {
  assert.match(api, /integration-report/);
  assert.match(api, /request\.method === 'GET' && action === 'integration-report'/);
  assert.match(api, /session\.currentUser/);
});

test('integration report never returns server Discord credentials and preserves planner preference precedence', () => {
  assert.match(service, /Discord player preferences are loaded first/);
  assert.match(service, /Canonical Command Center officer/);
  assert.match(service, /botConfigured:\s*Boolean\(config\.botToken\)/);
  assert.doesNotMatch(service, /botToken:\s*config\.botToken/);
  assert.doesNotMatch(service, /webhookUrl:\s*config\.webhookUrl/);
});
