import assert from 'node:assert/strict';
import test from 'node:test';
import { Readable } from 'node:stream';
import { createSupabaseAuthSession } from './supabase-auth-session.mjs';

function request({ method = 'GET', body, headers = {} } = {}) {
  const stream = body === undefined ? Readable.from([]) : Readable.from([Buffer.from(JSON.stringify(body))]);
  stream.method = method;
  stream.headers = { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers };
  return stream;
}

function response() {
  return {
    status: 0,
    headers: {},
    body: '',
    writeHead(status, headers) {
      this.status = status;
      this.headers = headers || {};
    },
    end(value = '') {
      this.body = String(value);
    },
  };
}

const env = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
  AUTH_COOKIE_SECURE: 'true',
};

test('sign in stores access and refresh tokens only in HttpOnly secure cookies', async () => {
  let observed;
  const session = createSupabaseAuthSession(env, {
    verifier: { verifyAccessToken: async () => null },
    fetch: async (url, options) => {
      observed = { url, options };
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({
            access_token: 'access-secret',
            refresh_token: 'refresh-secret',
            expires_in: 3600,
            user: { id: '0f4c45c0-b8f6-4b22-aad7-56ad6390b010', email: 'pilot@example.com' },
          });
        },
      };
    },
  });
  const req = request({
    method: 'POST',
    body: { email: 'pilot@example.com', password: 'correct-horse-battery-staple' },
    headers: { origin: 'https://command.example', host: 'command.example', 'x-forwarded-proto': 'https' },
  });
  const res = response();
  await session.handle(req, res, new URL('https://command.example/api/auth/signin'));

  assert.equal(res.status, 200);
  assert.equal(observed.url, 'https://example.supabase.co/auth/v1/token?grant_type=password');
  assert.equal(observed.options.headers.apikey, 'sb_publishable_test');
  assert.equal(res.body.includes('access-secret'), false);
  assert.equal(res.body.includes('refresh-secret'), false);
  assert.equal(Array.isArray(res.headers['Set-Cookie']), true);
  assert.equal(res.headers['Set-Cookie'].length, 2);
  for (const value of res.headers['Set-Cookie']) {
    assert.match(value, /HttpOnly/);
    assert.match(value, /Secure/);
    assert.match(value, /SameSite=Lax/);
  }
});

test('current user is resolved from the HttpOnly access cookie', async () => {
  let token = '';
  const session = createSupabaseAuthSession(env, {
    verifier: {
      async verifyAccessToken(value) {
        token = value;
        return { id: '0f4c45c0-b8f6-4b22-aad7-56ad6390b010', email: 'pilot@example.com' };
      },
    },
    fetch: async () => { throw new Error('not called'); },
  });
  const user = await session.currentUser(request({ headers: { cookie: 'swgoh_cc_access=signed-user-jwt; other=1' } }));
  assert.equal(token, 'signed-user-jwt');
  assert.equal(user.id, '0f4c45c0-b8f6-4b22-aad7-56ad6390b010');
});

test('cross-origin sign-in is rejected before contacting Supabase', async () => {
  let calls = 0;
  const session = createSupabaseAuthSession(env, {
    verifier: { verifyAccessToken: async () => null },
    fetch: async () => { calls += 1; throw new Error('must not be called'); },
  });
  const req = request({
    method: 'POST',
    body: { email: 'pilot@example.com', password: 'correct-horse-battery-staple' },
    headers: { origin: 'https://evil.example', host: 'command.example', 'x-forwarded-proto': 'https' },
  });
  const res = response();
  await session.handle(req, res, new URL('https://command.example/api/auth/signin'));
  assert.equal(res.status, 403);
  assert.equal(calls, 0);
});

test('sign out clears both session cookies even if upstream logout fails', async () => {
  const session = createSupabaseAuthSession(env, {
    verifier: { verifyAccessToken: async () => null },
    fetch: async () => ({ ok: false, status: 500, async text() { return '{}'; } }),
  });
  const req = request({
    method: 'POST',
    headers: {
      cookie: 'swgoh_cc_access=access-secret; swgoh_cc_refresh=refresh-secret',
      origin: 'https://command.example',
      host: 'command.example',
      'x-forwarded-proto': 'https',
    },
  });
  const res = response();
  await session.handle(req, res, new URL('https://command.example/api/auth/signout'));
  assert.equal(res.status, 200);
  assert.equal(res.headers['Set-Cookie'].length, 2);
  for (const value of res.headers['Set-Cookie']) assert.match(value, /Max-Age=0/);
});
