import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const script = await readFile(new URL('../public/auth-page.js', import.meta.url), 'utf8');
const signup = await readFile(new URL('../public/signup/index.html', import.meta.url), 'utf8');
const login = await readFile(new URL('../public/login/index.html', import.meta.url), 'utf8');

test('social auth browser code never handles Supabase or provider session tokens', () => {
  for (const forbidden of [
    'localStorage',
    'sessionStorage',
    'access_token',
    'refresh_token',
    'provider_token',
    'provider_refresh_token',
    'SUPABASE_SERVICE_ROLE_KEY',
  ]) {
    assert.equal(script.includes(forbidden), false, `${forbidden} must stay out of auth page JavaScript`);
  }
});

test('Discord and Google buttons use the Command Center server OAuth bridge', () => {
  for (const html of [signup, login]) {
    assert.match(html, /\/api\/auth\/oauth\/discord\?next=\/onboarding/);
    assert.match(html, /\/api\/auth\/oauth\/google\?next=\/onboarding/);
    assert.equal(html.includes('supabase.co/auth'), false);
    assert.equal(html.includes('discord.com/oauth'), false);
    assert.equal(html.includes('accounts.google.com'), false);
  }
});

test('signup explicitly separates social account creation from SWGOH ownership proof', () => {
  assert.match(signup, /creates your Command Center identity only/i);
  assert.match(signup, /Ally Code still requires live ownership verification/i);
});
