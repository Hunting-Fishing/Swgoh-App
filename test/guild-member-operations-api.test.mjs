import test from 'node:test';
import assert from 'node:assert/strict';
import { createGuildDiscordAdminApi } from '../guild-discord-admin-api.mjs';

function responseCapture() {
  return { status: 0, body: '', writeHead(status) { this.status = status; }, end(body) { this.body = String(body || ''); } };
}

const playerId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

test('member Operations directory and detail are authenticated GET-only reads', async () => {
  const calls = [];
  const api = createGuildDiscordAdminApi({
    session: { async currentUser() { return { id: 'officer-user' }; } },
    members: {
      async directory(userId, allyCode) { calls.push(['directory', userId, allyCode]); return { members: [{ playerId }] }; },
      async member(userId, allyCode, requestedPlayerId) { calls.push(['member', userId, allyCode, requestedPlayerId]); return { player: { playerId: requestedPlayerId } }; },
    },
  });

  const directoryResponse = responseCapture();
  await api.handle({ method: 'GET', headers: {} }, directoryResponse, new URL('https://command.test/api/account/guild-discord-admin/732764286/member-operations'));
  assert.equal(directoryResponse.status, 200);
  assert.equal(JSON.parse(directoryResponse.body).members[0].playerId, playerId);

  const detailResponse = responseCapture();
  await api.handle({ method: 'GET', headers: {} }, detailResponse, new URL(`https://command.test/api/account/guild-discord-admin/732764286/member-operations/${playerId}`));
  assert.equal(detailResponse.status, 200);
  assert.equal(JSON.parse(detailResponse.body).player.playerId, playerId);
  assert.deepEqual(calls, [
    ['directory','officer-user','732764286'],
    ['member','officer-user','732764286',playerId],
  ]);
});

test('member Operations read refuses anonymous sessions', async () => {
  const api = createGuildDiscordAdminApi({
    session: { async currentUser() { return null; } },
    members: { async directory() { throw new Error('must not execute'); } },
  });
  const response = responseCapture();
  await api.handle({ method: 'GET', headers: {} }, response, new URL('https://command.test/api/account/guild-discord-admin/732764286/member-operations'));
  assert.equal(response.status, 401);
  assert.equal(JSON.parse(response.body).code, 'AUTH_REQUIRED');
});

test('member Operations route rejects mutation methods so writes stay on canonical Guild Operations endpoints', async () => {
  const api = createGuildDiscordAdminApi({
    session: { async currentUser() { return { id: 'officer-user' }; } },
    members: { async directory() { throw new Error('must not execute on POST'); } },
  });
  const response = responseCapture();
  await api.handle({ method: 'POST', headers: {} }, response, new URL('https://command.test/api/account/guild-discord-admin/732764286/member-operations'));
  assert.equal(response.status, 405);
  assert.equal(JSON.parse(response.body).code, 'METHOD_NOT_ALLOWED');
});
