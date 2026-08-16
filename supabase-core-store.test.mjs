import assert from "node:assert/strict";
import test from "node:test";
import { createSupabaseCoreStore } from "./supabase-core-store.mjs";

test("status reports configuration without exposing the service-role key", () => {
  const secret = "super-secret-service-role-key";
  const store = createSupabaseCoreStore({
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: secret,
  }, { fetch: async () => { throw new Error("unused"); } });

  const status = store.status();
  assert.deepEqual(status, {
    configured: true,
    mode: "supabase-rest-service-role",
    urlConfigured: true,
    serviceRoleConfigured: true,
  });
  assert.equal(JSON.stringify(status).includes(secret), false);
});

test("upsert uses server authorization and merge-duplicates semantics", async () => {
  const calls = [];
  const store = createSupabaseCoreStore({
    SUPABASE_URL: "https://example.supabase.co/",
    SUPABASE_SERVICE_ROLE_KEY: "service-key",
  }, {
    fetch: async (url, init) => {
      calls.push({ url, init });
      return {
        ok: true,
        status: 201,
        async text() { return '[{"id":"1"}]'; },
      };
    },
  });

  const result = await store.upsert("players", [{ ally_code: "123456789", name: "Test" }], {
    onConflict: "ally_code",
  });

  assert.deepEqual(result, [{ id: "1" }]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://example.supabase.co/rest/v1/players?on_conflict=ally_code");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers.apikey, "service-key");
  assert.equal(calls[0].init.headers.Authorization, "Bearer service-key");
  assert.match(calls[0].init.headers.Prefer, /resolution=merge-duplicates/);
  assert.match(calls[0].init.headers.Prefer, /return=representation/);
});

test("unconfigured store fails closed", async () => {
  const store = createSupabaseCoreStore({}, { fetch: async () => { throw new Error("unused"); } });
  assert.equal(store.status().configured, false);
  await assert.rejects(() => store.select("players"), /not configured/i);
});
