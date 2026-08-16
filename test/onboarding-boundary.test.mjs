import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const script = await readFile(new URL('../public/onboarding.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../public/onboarding/index.html', import.meta.url), 'utf8');
const authScript = await readFile(new URL('../public/auth-page.js', import.meta.url), 'utf8');

test('onboarding keeps credentials out of browser storage and token handling', () => {
  assert.equal(script.includes('localStorage'), false);
  assert.equal(script.includes('sessionStorage'), false);
  assert.equal(script.includes('access_token'), false);
  assert.equal(script.includes('refresh_token'), false);
  assert.equal(script.includes('SUPABASE_SERVICE_ROLE_KEY'), false);
  assert.equal(script.includes('supabase.co'), false);
});

test('onboarding uses only signed same-origin account and auth APIs', () => {
  for (const endpoint of [
    '/api/auth/status',
    '/api/account/status',
    '/api/account/link-player',
    '/api/account/verification',
    '/api/account/verification/start',
    '/api/account/verification/check',
  ]) assert.match(script, new RegExp(endpoint.replaceAll('/', '\\/')));
});

test('UI explains that Guild access waits for proof of player control', () => {
  assert.match(html, /verify that you control the Ally Code before activating Guild access/i);
  assert.match(html, /does not yet grant access to the Guild workspace/i);
  assert.match(html, /force-refresh the game data/i);
});

test('successful authentication routes to onboarding instead of bypassing verification', () => {
  assert.match(authScript, /window\.location\.assign\('\/onboarding'\)/);
  assert.equal(authScript.includes('/?auth=success'), false);
});
