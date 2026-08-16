import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const script = await readFile(new URL('../public/auth-page.js', import.meta.url), 'utf8');
const login = await readFile(new URL('../public/login/index.html', import.meta.url), 'utf8');
const signup = await readFile(new URL('../public/signup/index.html', import.meta.url), 'utf8');

test('browser auth never stores or handles Supabase session tokens directly', () => {
  assert.equal(script.includes('localStorage'), false);
  assert.equal(script.includes('sessionStorage'), false);
  assert.equal(script.includes('access_token'), false);
  assert.equal(script.includes('refresh_token'), false);
  assert.equal(script.includes('SUPABASE_SERVICE_ROLE_KEY'), false);
});

test('browser auth talks only to same-origin Command Center auth endpoints', () => {
  assert.match(script, /\/api\/auth\/status/);
  assert.match(script, /\/api\/auth\/signup/);
  assert.match(script, /\/api\/auth\/signin/);
  assert.match(script, /\/api\/auth\/signout/);
  assert.equal(script.includes('supabase.co'), false);
});

test('login and signup are separate dedicated pages', () => {
  assert.match(login, /data-auth-mode="login"/);
  assert.match(signup, /data-auth-mode="signup"/);
  assert.match(login, /href="\/signup"/);
  assert.match(signup, /href="\/login"/);
});

test('signup explicitly states that account creation does not claim a Guild', () => {
  assert.match(signup, /does not claim an Ally Code or Guild/i);
  assert.match(signup, /Guild access requires verification/i);
});
