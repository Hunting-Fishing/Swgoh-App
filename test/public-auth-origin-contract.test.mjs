import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizePublicOrigin, resolvePublicOrigin, resolveRequestOrigin } from '../auth-public-origin.mjs';
import { createSupabaseSocialAuth } from '../supabase-social-auth.mjs';

function fakeResponse() {
  return {
    status: 0,
    headers: {},
    writeHead(status, headers = {}) {
      this.status = status;
      this.headers = headers;
    },
    end() {},
  };
}

function socialAuth(envOverrides = {}) {
  const env = {
    SUPABASE_URL: 'https://project.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'publishable-test',
    AUTH_COOKIE_SECURE: 'true',
    PUBLIC_APP_ORIGIN: 'https://swgohcommandcenter.app',
    ...envOverrides,
  };
  return createSupabaseSocialAuth(env, {
    fetch: async (url) => {
      if (String(url).endsWith('/auth/v1/settings')) {
        return new Response(JSON.stringify({ external: { discord: true, google: true } }), { status: 200 });
      }
      throw new Error(`unexpected fetch ${url}`);
    },
    randomBytes: (size) => Buffer.alloc(size, 11),
    now: () => 1_000_000,
    store: { status: () => ({ configured: false }) },
  });
}

test('direct Railway OAuth start redirects to canonical .app before a PKCE cookie is created', async () => {
  const social = socialAuth();
  const request = {
    method: 'GET',
    headers: {
      host: 'swgoh-app-production.up.railway.app',
      'x-forwarded-host': 'swgoh-app-production.up.railway.app',
      'x-forwarded-proto': 'https',
    },
  };
  const response = fakeResponse();
  await social.start(request, response, 'discord', '/onboarding');

  assert.equal(response.status, 303);
  assert.equal(response.headers.Location, 'https://swgohcommandcenter.app/api/auth/oauth/discord?next=%2Fonboarding');
  assert.equal(Object.hasOwn(response.headers, 'Set-Cookie'), false);
});

test('Cloudflare forwarded public host produces the exact production OAuth callback', async () => {
  const social = socialAuth();
  const request = {
    method: 'GET',
    headers: {
      host: 'swgoh-app-production.up.railway.app',
      'x-forwarded-host': 'swgohcommandcenter.app',
      'x-forwarded-proto': 'https',
    },
  };
  const response = fakeResponse();
  await social.start(request, response, 'discord', '/onboarding');

  assert.equal(response.status, 303);
  const authorize = new URL(response.headers.Location);
  assert.equal(authorize.origin, 'https://project.supabase.co');
  const redirectTo = new URL(authorize.searchParams.get('redirect_to'));
  assert.equal(redirectTo.href, 'https://swgohcommandcenter.app/api/auth/oauth/callback');
  assert.equal(redirectTo.search, '');
  assert.ok(Array.isArray(response.headers['Set-Cookie']));
  assert.ok(String(response.headers['Set-Cookie'][0]).startsWith('swgoh_cc_oauth='));
});

test('public origin resolver validates explicit origins and retains proxy fallback for development', () => {
  assert.equal(normalizePublicOrigin('https://swgohcommandcenter.app/'), 'https://swgohcommandcenter.app');
  assert.equal(normalizePublicOrigin('javascript:alert(1)'), '');
  assert.equal(normalizePublicOrigin('https://user:pass@example.com'), '');

  const request = {
    headers: {
      host: 'localhost:8080',
      'x-forwarded-host': 'localhost:8080',
      'x-forwarded-proto': 'http',
    },
  };
  assert.equal(resolveRequestOrigin(request), 'http://localhost:8080');
  assert.equal(resolvePublicOrigin(request, ''), 'http://localhost:8080');
  assert.equal(resolvePublicOrigin(request, 'https://swgohcommandcenter.app'), 'https://swgohcommandcenter.app');
});
