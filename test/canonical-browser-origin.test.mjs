import assert from 'node:assert/strict';
import test from 'node:test';

import { canonicalBrowserRedirect } from '../canonical-browser-origin.mjs';

function request(host, { forwardedHost = '', forwardedProto = 'https' } = {}) {
  return {
    method: 'GET',
    headers: {
      host,
      ...(forwardedHost ? { 'x-forwarded-host': forwardedHost } : {}),
      ...(forwardedProto ? { 'x-forwarded-proto': forwardedProto } : {}),
    },
  };
}

const canonical = 'https://swgohcommandcenter.app';

test('direct Railway browser routes redirect to the canonical .app origin', () => {
  const url = new URL('https://swgoh-app-production.up.railway.app/login?next=%2Fguild');
  assert.equal(
    canonicalBrowserRedirect(request('swgoh-app-production.up.railway.app'), url, canonical),
    'https://swgohcommandcenter.app/login?next=%2Fguild',
  );
});

test('direct Railway social OAuth starts redirect before any verifier cookie is created', () => {
  const url = new URL('https://swgoh-app-production.up.railway.app/api/auth/oauth/discord?next=/onboarding');
  assert.equal(
    canonicalBrowserRedirect(request('swgoh-app-production.up.railway.app'), url, canonical),
    'https://swgohcommandcenter.app/api/auth/oauth/discord?next=/onboarding',
  );
});

test('Cloudflare proxied requests remain on Railway when the forwarded public host is canonical', () => {
  const url = new URL('https://swgoh-app-production.up.railway.app/api/auth/oauth/discord?next=/onboarding');
  assert.equal(
    canonicalBrowserRedirect(
      request('swgoh-app-production.up.railway.app', { forwardedHost: 'swgohcommandcenter.app' }),
      url,
      canonical,
    ),
    null,
  );
});

test('backend APIs stay reachable directly on Railway', () => {
  const url = new URL('https://swgoh-app-production.up.railway.app/api/health');
  assert.equal(
    canonicalBrowserRedirect(request('swgoh-app-production.up.railway.app'), url, canonical),
    null,
  );
});
