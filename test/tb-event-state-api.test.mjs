import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createTbEventStateApi } from '../tb-event-state-api.mjs';

function request(method, body = null, headers = {}) {
  const stream = Readable.from(body == null ? [] : [JSON.stringify(body)]);
  stream.method = method;
  stream.headers = { host: 'command.example', 'x-forwarded-proto': 'https', ...headers };
  return stream;
}

function response() {
  return {
    status: 0,
    headers: {},
    payload: null,
    writeHead(status, headers) { this.status = status; this.headers = headers; },
    end(value) { this.payload = value ? JSON.parse(value) : null; },
  };
}

const session = { async currentUser() { return { id: 'user-1' }; } };

test('GET Today delegates to the TB event-state service', async () => {
  const service = { async today(userId) { assert.equal(userId, 'user-1'); return { configured: true, tasks: [{ actionKey: 'one' }] }; } };
  const api = createTbEventStateApi({ session, service });
  const res = response();
  const handled = await api.handle(request('GET'), res, new URL('https://command.example/api/account/web-actions/tb/today'));
  assert.equal(handled, true);
  assert.equal(res.status, 200);
  assert.equal(res.payload.tasks.length, 1);
});

test('POST event rejects cross-origin writes before calling the service', async () => {
  let called = false;
  const service = { async saveEvent() { called = true; return {}; } };
  const api = createTbEventStateApi({ session, service });
  const res = response();
  await api.handle(
    request('POST', { currentPhase: 'P2' }, { origin: 'https://evil.example', 'content-type': 'application/json' }),
    res,
    new URL('https://command.example/api/account/web-actions/tb/event'),
  );
  assert.equal(called, false);
  assert.equal(res.status, 403);
  assert.equal(res.payload.code, 'CROSS_ORIGIN_REJECTED');
});

test('POST refresh persists the generated Today queue through the service', async () => {
  const service = { async refreshToday(userId) { assert.equal(userId, 'user-1'); return { durable: true, tasks: [] }; } };
  const api = createTbEventStateApi({ session, service });
  const res = response();
  await api.handle(
    request('POST', {}, { origin: 'https://command.example', 'content-type': 'application/json' }),
    res,
    new URL('https://command.example/api/account/web-actions/tb/today/refresh'),
  );
  assert.equal(res.status, 200);
  assert.equal(res.payload.durable, true);
});

test('POST member action status route extracts the UUID and status', async () => {
  const actionId = '44444444-4444-4444-8444-444444444444';
  const service = {
    async setActionStatus(userId, receivedId, status) {
      assert.equal(userId, 'user-1');
      assert.equal(receivedId, actionId);
      assert.equal(status, 'completed');
      return { id: receivedId, status };
    },
  };
  const api = createTbEventStateApi({ session, service });
  const res = response();
  await api.handle(
    request('POST', { status: 'completed' }, { origin: 'https://command.example', 'content-type': 'application/json' }),
    res,
    new URL(`https://command.example/api/account/web-actions/tb/action/${actionId}/status`),
  );
  assert.equal(res.status, 200);
  assert.equal(res.payload.status, 'completed');
});
