import assert from 'node:assert/strict';
import test from 'node:test';
import { createSupabaseCoreStore } from '../supabase-core-store.mjs';

const env = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-secret',
};

test('RPC uses service-role authorization without exposing the key in status', async () => {
  let observed;
  const store = createSupabaseCoreStore(env, {
    fetch: async (url, options) => {
      observed = { url, options };
      return {
        ok: true,
        status: 200,
        async text() { return JSON.stringify({ ok: true }); },
      };
    },
  });

  const result = await store.rpc('ingest_verified_user_guild_sync', { p_payload: { requesterUserId: 'user-1' } });
  assert.deepEqual(result, { ok: true });
  assert.equal(observed.url, 'https://example.supabase.co/rest/v1/rpc/ingest_verified_user_guild_sync');
  assert.equal(observed.options.method, 'POST');
  assert.equal(observed.options.headers.apikey, 'service-role-secret');
  assert.equal(observed.options.headers.Authorization, 'Bearer service-role-secret');
  assert.equal(JSON.parse(observed.options.body).p_payload.requesterUserId, 'user-1');
  assert.equal(JSON.stringify(store.status()).includes('service-role-secret'), false);
});

test('invalid RPC names are rejected before network access', async () => {
  let calls = 0;
  const store = createSupabaseCoreStore(env, {
    fetch: async () => { calls += 1; throw new Error('must not be called'); },
  });
  await assert.rejects(() => store.rpc('../admin', {}), /Invalid Supabase RPC name/);
  assert.equal(calls, 0);
});
