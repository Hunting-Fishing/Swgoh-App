import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const navigation = await readFile(new URL('public/navigation-guard.js', root), 'utf8');

test('main Command Center redirects signed-out sessions to the login experience', () => {
  assert.match(navigation, /\/api\/auth\/status/);
  assert.match(navigation, /if \(!auth\?\.authenticated\)/);
  assert.match(navigation, /location\.replace\(`\/login\?next=/);
});

test('verified account Ally Code is restored from durable account state and auto-loads the roster', () => {
  assert.match(navigation, /\/api\/account\/status/);
  assert.match(navigation, /verification_status === "verified"/);
  assert.match(navigation, /player\?\.ally_code/);
  assert.match(navigation, /form\.requestSubmit\(\)/);
});

test('verified account context is shared with dedicated Guild routes', () => {
  assert.match(navigation, /swgoh:active-ally-code/);
  assert.match(navigation, /swgoh:guild-route-ally-code/);
  assert.match(navigation, /params\.set\("allyCode", code\)/);
  assert.match(navigation, /swgoh:account-context-ready/);
});

test('authenticated users without a verified player are returned to onboarding', () => {
  assert.match(navigation, /location\.replace\("\/onboarding"\)/);
});
