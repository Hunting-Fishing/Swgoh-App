import test from 'node:test';
import assert from 'node:assert/strict';
import { createGuildDiscordAdminApi } from '../guild-discord-admin-api.mjs';

function responseCapture() {
  return {
    status: 0,
    headers: null,
    body: '',
    writeHead(status, headers) { this.status = status; this.headers = headers; },
    end(body) { this.body = String(body || ''); },
  };
}

test('Guild integration report is exposed as an authenticated officer read through the existing admin namespace', async () => {
  const calls = [];
  const api = createGuildDiscordAdminApi({
    session: { async currentUser() { return { id: 'user-1' }; } },
    service: {
      async status() { throw new Error('status service should not be used'); },
      async verifyChannel() { throw new Error('write service should not be used'); },
      async unverifyChannel() { throw new Error('write service should not be used'); },
      async matchGuildmates() { throw new Error('write service should not be used'); },
    },
    integration: {
      async report(userId, allyCode) {
        calls.push({ userId, allyCode });
        return { source: 'guild-integration-intelligence-v1', donations: { overrideCount: 12 } };
      },
    },
  });
  const request = { method: 'GET', headers: {} };
  const response = responseCapture();
  const handled = await api.handle(
    request,
    response,
    new URL('https://command.test/api/account/guild-discord-admin/732764286/integration-report'),
  );
  assert.equal(handled, true);
  assert.equal(response.status, 200);
  assert.deepEqual(calls, [{ userId: 'user-1', allyCode: '732764286' }]);
  assert.equal(JSON.parse(response.body).donations.overrideCount, 12);
});

test('Guild integration report refuses anonymous sessions', async () => {
  const api = createGuildDiscordAdminApi({
    session: { async currentUser() { return null; } },
    integration: { async report() { throw new Error('must not run'); } },
  });
  const response = responseCapture();
  await api.handle(
    { method: 'GET', headers: {} },
    response,
    new URL('https://command.test/api/account/guild-discord-admin/732764286/integration-report'),
  );
  assert.equal(response.status, 401);
  assert.equal(JSON.parse(response.body).code, 'AUTH_REQUIRED');
});
