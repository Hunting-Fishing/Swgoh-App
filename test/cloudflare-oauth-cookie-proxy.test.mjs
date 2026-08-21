import assert from 'node:assert/strict';
import test from 'node:test';

import worker from '../cloudflare/worker.mjs';

function setCookies(headers) {
  if (typeof headers.getSetCookie === 'function') return headers.getSetCookie();
  if (typeof headers.getAll === 'function') return headers.getAll('Set-Cookie');
  const value = headers.get('Set-Cookie');
  return value ? [value] : [];
}

test('Cloudflare API proxy preserves inbound OAuth cookie and distinct Railway Set-Cookie headers', async () => {
  const originalFetch = globalThis.fetch;
  let capturedRequest = null;

  globalThis.fetch = async (request) => {
    capturedRequest = request;
    const headers = new Headers();
    headers.set('location', '/onboarding');
    headers.append('set-cookie', 'swgoh_cc_access=access-token; Path=/; HttpOnly; Secure; SameSite=Lax');
    headers.append('set-cookie', 'swgoh_cc_refresh=refresh-token; Path=/; HttpOnly; Secure; SameSite=Lax');
    headers.append('set-cookie', 'swgoh_cc_oauth=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
    return new Response(null, { status: 303, headers });
  };

  try {
    const response = await worker.fetch(
      new Request('https://swgohcommandcenter.app/api/auth/oauth/callback?code=xyz', {
        headers: {
          cookie: 'swgoh_cc_oauth=temporary-state',
          'user-agent': 'oauth-proxy-test',
        },
      }),
      {
        RAILWAY_APP_ORIGIN: 'https://swgoh-app-production.up.railway.app',
        ASSETS: { fetch: () => new Response('unused') },
      },
    );

    assert.ok(capturedRequest);
    assert.equal(capturedRequest.url, 'https://swgoh-app-production.up.railway.app/api/auth/oauth/callback?code=xyz');
    assert.equal(capturedRequest.headers.get('cookie'), 'swgoh_cc_oauth=temporary-state');
    assert.equal(capturedRequest.headers.get('x-forwarded-host'), 'swgohcommandcenter.app');
    assert.equal(capturedRequest.headers.get('x-forwarded-proto'), 'https');
    assert.equal(capturedRequest.redirect, 'manual');

    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), '/onboarding');
    assert.deepEqual(setCookies(response.headers), [
      'swgoh_cc_access=access-token; Path=/; HttpOnly; Secure; SameSite=Lax',
      'swgoh_cc_refresh=refresh-token; Path=/; HttpOnly; Secure; SameSite=Lax',
      'swgoh_cc_oauth=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0',
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Cloudflare intercepts Supabase Site URL OAuth fallback before the SPA loads', async () => {
  const originalFetch = globalThis.fetch;
  let capturedRequest = null;
  let assetCalls = 0;

  globalThis.fetch = async (request) => {
    capturedRequest = request;
    const headers = new Headers();
    headers.set('location', '/onboarding');
    headers.append('set-cookie', 'swgoh_cc_access=access-token; Path=/; HttpOnly; Secure; SameSite=Lax');
    headers.append('set-cookie', 'swgoh_cc_refresh=refresh-token; Path=/; HttpOnly; Secure; SameSite=Lax');
    headers.append('set-cookie', 'swgoh_cc_oauth=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
    return new Response(null, { status: 303, headers });
  };

  try {
    const response = await worker.fetch(
      new Request('https://swgohcommandcenter.app/?code=supabase-auth-code', {
        headers: {
          cookie: 'swgoh_cc_oauth=temporary-pkce-state',
          'user-agent': 'oauth-root-fallback-test',
        },
      }),
      {
        RAILWAY_APP_ORIGIN: 'https://swgoh-app-production.up.railway.app',
        ASSETS: {
          fetch: () => {
            assetCalls += 1;
            return new Response('landing-page-should-not-load');
          },
        },
      },
    );

    assert.ok(capturedRequest);
    assert.equal(assetCalls, 0);
    assert.equal(capturedRequest.url, 'https://swgoh-app-production.up.railway.app/api/auth/oauth/callback?code=supabase-auth-code');
    assert.equal(capturedRequest.headers.get('cookie'), 'swgoh_cc_oauth=temporary-pkce-state');
    assert.equal(capturedRequest.headers.get('x-forwarded-host'), 'swgohcommandcenter.app');
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), '/onboarding');
    assert.deepEqual(setCookies(response.headers), [
      'swgoh_cc_access=access-token; Path=/; HttpOnly; Secure; SameSite=Lax',
      'swgoh_cc_refresh=refresh-token; Path=/; HttpOnly; Secure; SameSite=Lax',
      'swgoh_cc_oauth=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0',
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Cloudflare signout always clears every browser auth cookie after upstream logout', async () => {
  const originalFetch = globalThis.fetch;
  let capturedRequest = null;
  let capturedBody = '';

  globalThis.fetch = async (request) => {
    capturedRequest = request;
    capturedBody = await request.clone().text();
    return new Response(JSON.stringify({ authenticated: false }), {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  };

  try {
    const response = await worker.fetch(
      new Request('https://swgohcommandcenter.app/api/auth/signout', {
        method: 'POST',
        headers: {
          origin: 'https://swgohcommandcenter.app',
          cookie: 'swgoh_cc_access=access; swgoh_cc_refresh=refresh',
          'content-type': 'application/json',
        },
        body: '{}',
        duplex: 'half',
      }),
      {
        RAILWAY_APP_ORIGIN: 'https://swgoh-app-production.up.railway.app',
        ASSETS: { fetch: () => new Response('unused') },
      },
    );

    assert.ok(capturedRequest);
    assert.equal(capturedRequest.method, 'POST');
    assert.equal(capturedRequest.url, 'https://swgoh-app-production.up.railway.app/api/auth/signout');
    assert.equal(capturedRequest.headers.get('cookie'), 'swgoh_cc_access=access; swgoh_cc_refresh=refresh');
    assert.equal(capturedRequest.headers.get('x-forwarded-host'), 'swgohcommandcenter.app');
    assert.equal(capturedBody, '{}');
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-swgoH-edge-signout'), 'cleared');
    assert.deepEqual(setCookies(response.headers), [
      'swgoh_cc_access=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0',
      'swgoh_cc_refresh=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0',
      'swgoh_cc_oauth=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0',
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Cloudflare signout still clears browser cookies if Railway logout is unavailable', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error('railway unavailable');
  };

  try {
    const response = await worker.fetch(
      new Request('https://swgohcommandcenter.app/api/auth/signout', {
        method: 'POST',
        headers: {
          origin: 'https://swgohcommandcenter.app',
          cookie: 'swgoh_cc_access=access; swgoh_cc_refresh=refresh',
          'content-type': 'application/json',
        },
        body: '{}',
        duplex: 'half',
      }),
      {
        RAILWAY_APP_ORIGIN: 'https://swgoh-app-production.up.railway.app',
        ASSETS: { fetch: () => new Response('unused') },
      },
    );

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-swgoH-edge-signout'), 'cleared-upstream-unavailable');
    assert.deepEqual(setCookies(response.headers), [
      'swgoh_cc_access=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0',
      'swgoh_cc_refresh=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0',
      'swgoh_cc_oauth=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0',
    ]);
    assert.deepEqual(await response.json(), {
      authenticated: false,
      upstreamRevocation: 'unavailable',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
