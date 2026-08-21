import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const login = fs.readFileSync(new URL('../public/login/index.html', import.meta.url), 'utf8');
const signup = fs.readFileSync(new URL('../public/signup/index.html', import.meta.url), 'utf8');
const styles = fs.readFileSync(new URL('../public/auth-professional.css', import.meta.url), 'utf8');

test('Login and Signup load the additive professional Auth stylesheet', () => {
  assert.match(login, /auth-professional\.css\?v=20260821-authpro1/);
  assert.match(signup, /auth-professional\.css\?v=20260821-authpro1/);
  assert.match(styles, /SWGOH Command Center — Login \/ Signup professional visual layer/);
});

test('OAuth provider and onboarding redirect contracts are retained on both auth pages', () => {
  for (const html of [login, signup]) {
    assert.match(html, /data-social-provider="discord"[^>]*href="\/api\/auth\/oauth\/discord\?next=\/onboarding"/);
    assert.match(html, /data-social-provider="google"[^>]*href="\/api\/auth\/oauth\/google\?next=\/onboarding"/);
    assert.match(html, /href="\/onboarding">Continue to onboarding/);
    assert.match(html, /src="\/auth-page\.js\?v=20260817b"/);
  }
});

test('Auth status, session and email/password controls remain present', () => {
  for (const html of [login, signup]) {
    assert.match(html, /data-session-card/);
    assert.match(html, /data-auth-message[^>]*role="status"[^>]*aria-live="polite"/);
    assert.match(html, /data-social-auth/);
    assert.match(html, /data-auth-form/);
    assert.match(html, /name="email"[^>]*type="email"/);
    assert.match(html, /name="password"[^>]*type="password"/);
    assert.match(html, /data-auth-submit/);
    assert.match(html, /data-signout/);
  }
  assert.match(signup, /name="passwordConfirm"[^>]*type="password"/);
  assert.match(signup, /name="displayName"[^>]*type="text"/);
});

test('Auth professional CSS is presentation-only and keeps visible state classes', () => {
  assert.match(styles, /\.auth-message\.is-error/);
  assert.match(styles, /\.auth-message\.is-success/);
  assert.match(styles, /\.auth-message\.is-info/);
  assert.match(styles, /\.auth-session-card/);
  assert.match(styles, /\.auth-social-discord/);
  assert.match(styles, /\.auth-social-google/);
  assert.match(styles, /:focus-visible/);
  assert.match(styles, /@media \(max-width:900px\)/);
  assert.match(styles, /@media \(max-width:520px\)/);
  assert.doesNotMatch(styles, /url\(['\"]?\/api\/auth/);
});
