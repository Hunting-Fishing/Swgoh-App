import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createGuildDiscordAdminApi } from '../guild-discord-admin-api.mjs';

function responseCapture() {
  return {
    status: 0,
    body: '',
    writeHead(status) { this.status = status; },
    end(body) { this.body = String(body || ''); },
  };
}
function request(method, body = null, headers = {}) {
  const stream = Readable.from(body == null ? [] : [Buffer.from(JSON.stringify(body))]);
  stream.method = method;
  stream.headers = headers;
  return stream;
}
function apiFixture() {
  const calls = [];
  const api = createGuildDiscordAdminApi({
    session: { async currentUser() { return { id: 'web-officer' }; } },
    service: {},
    integration: {},
    links: {
      async list(userId, code) { calls.push(['list', userId, code]); return { total: 2, stale: 1 }; },
      async link(userId, code, input) { calls.push(['link', userId, code, input]); return { discordUserId: input.discordUserId, swgohAllyCode: input.swgohAllyCode }; },
      async unlink(userId, code, input) { calls.push(['unlink', userId, code, input]); return { removed: true, discordUserId: input.discordUserId }; },
    },
  });
  return { api, calls };
}

test('officer can read durable manual link inventory through existing Guild Discord admin namespace', async () => {
  const { api, calls } = apiFixture();
  const response = responseCapture();
  await api.handle(
    request('GET'),
    response,
    new URL('https://command.test/api/account/guild-discord-admin/732764286/links'),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(calls, [['list', 'web-officer', '732764286']]);
  assert.equal(JSON.parse(response.body).stale, 1);
});

test('manual link and unlink POST bodies route only after same-origin validation', async () => {
  const { api, calls } = apiFixture();
  const linkResponse = responseCapture();
  await api.handle(
    request('POST', { discordUserId: '700000000000000001', swgohAllyCode: '111222333' }, { host: 'command.test', origin: 'https://command.test', 'x-forwarded-proto': 'https' }),
    linkResponse,
    new URL('https://command.test/api/account/guild-discord-admin/732764286/link-member'),
  );
  assert.equal(linkResponse.status, 200);
  assert.deepEqual(calls[0], ['link', 'web-officer', '732764286', { discordUserId: '700000000000000001', swgohAllyCode: '111222333' }]);

  const unlinkResponse = responseCapture();
  await api.handle(
    request('POST', { discordUserId: '700000000000000001' }, { host: 'command.test', origin: 'https://command.test', 'x-forwarded-proto': 'https' }),
    unlinkResponse,
    new URL('https://command.test/api/account/guild-discord-admin/732764286/unlink-member'),
  );
  assert.equal(unlinkResponse.status, 200);
  assert.deepEqual(calls[1], ['unlink', 'web-officer', '732764286', { discordUserId: '700000000000000001' }]);
});

test('cross-origin manual link write is rejected before durable link service mutation', async () => {
  const { api, calls } = apiFixture();
  const response = responseCapture();
  await api.handle(
    request('POST', { discordUserId: '700000000000000001', swgohAllyCode: '111222333' }, { host: 'command.test', origin: 'https://evil.example', 'x-forwarded-proto': 'https' }),
    response,
    new URL('https://command.test/api/account/guild-discord-admin/732764286/link-member'),
  );
  assert.equal(response.status, 403);
  assert.equal(JSON.parse(response.body).code, 'CROSS_ORIGIN_REJECTED');
  assert.equal(calls.length, 0);
});
