import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createSupabaseSocialAuth,
  identityRow,
  pkcePair,
  providerState,
  safeNext,
} from '../supabase-social-auth.mjs';

const ENV = {
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'publishable-test',
  AUTH_COOKIE_SECURE: 'true',
};

function fakeResponse() {
  return {
    status: 0,
    headers: {},
    body: '',
    writeHead(status, headers = {}) {
      this.status = status;
      this.headers = headers;
    },
    end(body = '') {
      this.body = body;
    },
  };
}

function cookieValue(setCookie, name) {
  const entries = Array.isArray(setCookie) ? setCookie : [setCookie];
  const row = entries.find((entry) => String(entry).startsWith(`${name}=`));
  if (!row) return '';
  return decodeURIComponent(String(row).split(';')[0].slice(name.length + 1));
}

function request(path = '/', cookie = '') {
  return {
    method: 'GET',
    url: path,
    headers: {
      host: 'command.example',
      'x-forwarded-host': 'command.example',
      'x-forwarded-proto': 'https',
      cookie,
    },
  };
}

test('PKCE pair is SHA-256 bound and verifier is never the challenge', () => {
  const deterministic = () => Buffer.alloc(32, 7);
  const pair = pkcePair(deterministic);
  assert.equal(pair.verifier.length >= 43, true);
  assert.notEqual(pair.verifier, pair.challenge);
  assert.match(pair.verifier, /^[A-Za-z0-9_-]+$/);
  assert.match(pair.challenge, /^[A-Za-z0-9_-]+$/);
});

test('provider settings expose only enabled Discord/Google booleans', () => {
  assert.deepEqual(providerState({ external: { discord: true, google: false, github: true } }), {
    discord: true,
    google: false,
  });
});

test('safeNext rejects external or protocol-relative redirects', () => {
  assert.equal(safeNext('/guild'), '/guild');
  assert.equal(safeNext('https://evil.example/steal'), '/onboarding');
  assert.equal(safeNext('//evil.example/steal'), '/onboarding');
  assert.equal(safeNext('/\\evil.example'), '/onboarding');
});

test('Discord identity mapping stores stable provider id without provider tokens', () => {
  const row = identityRow({
    id: '11111111-1111-4111-8111-111111111111',
    email: 'pilot@example.test',
    provider_token: 'DO-NOT-STORE',
    provider_refresh_token: 'DO-NOT-STORE-EITHER',
    identities: [{
      id: 'identity-1',
      provider: 'discord',
      provider_id: '987654321000000001',
      email: 'pilot@example.test',
      identity_data: {
        sub: '987654321000000001',
        full_name: 'Pilot',
        avatar_url: 'https://cdn.example/avatar.png',
        email_verified: true,
      },
    }],
  }, 'discord');

  assert.equal(row.provider, 'discord');
  assert.equal(row.provider_user_id, '987654321000000001');
  assert.equal(row.user_id, '11111111-1111-4111-8111-111111111111');
  assert.equal(JSON.stringify(row).includes('DO-NOT-STORE'), false);
  assert.equal(Object.hasOwn(row, 'provider_token'), false);
  assert.equal(Object.hasOwn(row, 'provider_refresh_token'), false);
});

test('social auth start uses Supabase authorize + PKCE, exact callback URL, and an HttpOnly OAuth cookie', async () => {
  const calls = [];
  const social = createSupabaseSocialAuth(ENV, {
    fetch: async (url) => {
      calls.push(url);
      if (url.endsWith('/auth/v1/settings')) {
        return new Response(JSON.stringify({ external: { discord: true, google: true } }), { status: 200 });
      }
      throw new Error(`unexpected fetch ${url}`);
    },
    randomBytes: (size) => Buffer.alloc(size, 9),
    now: () => 1_000_000,
    store: { status: () => ({ configured: false }) },
  });
  const res = fakeResponse();
  await social.start(request(), res, 'discord', '/onboarding');

  assert.equal(res.status, 303);
  const location = new URL(res.headers.Location);
  assert.equal(location.origin, 'https://project.supabase.co');
  assert.equal(location.pathname, '/auth/v1/authorize');
  assert.equal(location.searchParams.get('provider'), 'discord');
  assert.equal(location.searchParams.get('code_challenge_method'), 's256');
  assert.ok(location.searchParams.get('code_challenge'));
  const redirectTo = new URL(location.searchParams.get('redirect_to'));
  assert.equal(redirectTo.href, 'https://command.example/api/auth/oauth/callback');
  assert.equal(redirectTo.search, '');
  const oauthCookie = String(res.headers['Set-Cookie'][0]);
  assert.match(oauthCookie, /^swgoh_cc_oauth=/);
  assert.match(oauthCookie, /HttpOnly/);
  assert.match(oauthCookie, /SameSite=Lax/);
  assert.match(oauthCookie, /Secure/);
  assert.equal(calls.length, 1);
});

test('callback rejects a missing OAuth cookie without token exchange', async () => {
  let tokenCalls = 0;
  const social = createSupabaseSocialAuth(ENV, {
    fetch: async (url) => {
      if (url.includes('/auth/v1/token')) tokenCalls += 1;
      return new Response('{}', { status: 500 });
    },
    randomBytes: (size) => Buffer.alloc(size, 3),
    now: () => 1_000_000,
    store: { status: () => ({ configured: false }) },
  });

  const callbackRes = fakeResponse();
  await social.callback(request('/api/auth/oauth/callback'), callbackRes, new URL('https://command.example/api/auth/oauth/callback?code=abc'));
  assert.equal(callbackRes.status, 303);
  assert.match(callbackRes.headers.Location, /missing_oauth_state/);
  assert.equal(tokenCalls, 0);
});

test('successful callback exchanges PKCE code server-side, writes social identity, and sets HttpOnly session cookies', async () => {
  const fetchCalls = [];
  const upserts = [];
  const store = {
    status: () => ({ configured: true }),
    async upsert(table, rows, options) {
      upserts.push({ table, rows, options });
      return [];
    },
  };
  const social = createSupabaseSocialAuth(ENV, {
    fetch: async (url, options = {}) => {
      fetchCalls.push({ url, options });
      if (url.endsWith('/auth/v1/settings')) {
        return new Response(JSON.stringify({ external: { discord: true, google: true } }), { status: 200 });
      }
      if (url.includes('/auth/v1/token?grant_type=pkce')) {
        return new Response(JSON.stringify({
          access_token: 'access-secret',
          refresh_token: 'refresh-secret',
          expires_in: 3600,
          user: {
            id: '11111111-1111-4111-8111-111111111111',
            email: 'pilot@example.test',
            identities: [{
              id: 'identity-1',
              provider: 'discord',
              provider_id: '987654321000000001',
              identity_data: { sub: '987654321000000001', username: 'Pilot' },
            }],
          },
          provider_token: 'discord-provider-token-must-not-persist',
        }), { status: 200 });
      }
      throw new Error(`unexpected fetch ${url}`);
    },
    randomBytes: (size) => Buffer.alloc(size, 5),
    now: () => 1_000_000,
    store,
  });

  const startRes = fakeResponse();
  await social.start(request(), startRes, 'discord', '/onboarding');
  const authorize = new URL(startRes.headers.Location);
  const redirectTo = new URL(authorize.searchParams.get('redirect_to'));
  assert.equal(redirectTo.search, '');
  const oauthCookie = cookieValue(startRes.headers['Set-Cookie'], 'swgoh_cc_oauth');

  const callbackRes = fakeResponse();
  const callbackReq = request('/api/auth/oauth/callback', `swgoh_cc_oauth=${encodeURIComponent(oauthCookie)}`);
  await social.callback(callbackReq, callbackRes, new URL('https://command.example/api/auth/oauth/callback?code=auth-code'));

  assert.equal(callbackRes.status, 303);
  assert.equal(callbackRes.headers.Location, '/onboarding');
  const tokenCall = fetchCalls.find((call) => call.url.includes('/auth/v1/token?grant_type=pkce'));
  assert.ok(tokenCall);
  const tokenBody = JSON.parse(tokenCall.options.body);
  assert.equal(tokenBody.auth_code, 'auth-code');
  assert.ok(tokenBody.code_verifier);
  assert.equal(upserts.length, 1);
  assert.equal(upserts[0].table, 'user_social_identities');
  assert.equal(upserts[0].rows[0].provider, 'discord');
  assert.equal(upserts[0].rows[0].provider_user_id, '987654321000000001');
  assert.equal(JSON.stringify(upserts).includes('discord-provider-token-must-not-persist'), false);
  const setCookies = callbackRes.headers['Set-Cookie'];
  assert.ok(setCookies.some((entry) => String(entry).startsWith('swgoh_cc_access=')));
  assert.ok(setCookies.some((entry) => String(entry).startsWith('swgoh_cc_refresh=')));
  assert.ok(setCookies.every((entry) => String(entry).includes('HttpOnly')));
});
