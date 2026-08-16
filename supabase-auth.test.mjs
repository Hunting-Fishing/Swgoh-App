import assert from 'node:assert/strict';
import test from 'node:test';
import { createSupabaseAuthVerifier } from './supabase-auth.mjs';

test('status never exposes the publishable key value', () => {
  const verifier = createSupabaseAuthVerifier({
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_secretish',
  }, { fetch: async () => { throw new Error('not called'); } });
  const status = verifier.status();
  assert.equal(status.enabled, true);
  assert.equal(status.publishableKeyConfigured, true);
  assert.equal(JSON.stringify(status).includes('sb_publishable_test_secretish'), false);
});

test('authenticateRequest requires a bearer token', async () => {
  const verifier = createSupabaseAuthVerifier({
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
  }, { fetch: async () => { throw new Error('not called'); } });
  await assert.rejects(() => verifier.authenticateRequest({ headers: {} }), (error) => error?.status === 401 && error?.code === 'AUTH_REQUIRED');
});

test('valid token is checked through Supabase Auth user endpoint', async () => {
  let observed;
  const verifier = createSupabaseAuthVerifier({
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
  }, {
    fetch: async (url, options) => {
      observed = { url, options };
      return {
        ok: true,
        status: 200,
        async json() {
          return { id: '0f4c45c0-b8f6-4b22-aad7-56ad6390b010', email: 'pilot@example.com', role: 'authenticated' };
        },
      };
    },
  });

  const user = await verifier.authenticateRequest({ headers: { authorization: 'Bearer user-jwt' } });
  assert.equal(user.id, '0f4c45c0-b8f6-4b22-aad7-56ad6390b010');
  assert.equal(observed.url, 'https://example.supabase.co/auth/v1/user');
  assert.equal(observed.options.headers.apikey, 'sb_publishable_test');
  assert.equal(observed.options.headers.Authorization, 'Bearer user-jwt');
});

test('invalid Supabase session fails closed', async () => {
  const verifier = createSupabaseAuthVerifier({
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
  }, {
    fetch: async () => ({ ok: false, status: 401, async json() { return {}; } }),
  });
  await assert.rejects(() => verifier.verifyAccessToken('expired'), (error) => error?.status === 401 && error?.code === 'AUTH_INVALID');
});
