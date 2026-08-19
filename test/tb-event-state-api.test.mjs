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

test('POST route preview delegates only through the authenticated route preview service', async () => {
  const body = {
    remainingGuildDeploymentTp: 60_000_000,
    remainingTpByPlanet: { geonosis: { remainingMissionTp: 0, remainingOperationTp: 0 } },
  };
  let received = null;
  const routePreview = {
    async preview(userId, input) {
      assert.equal(userId, 'user-1');
      received = input;
      return { configured: true, persisted: false, plan: { algorithm: 'tb-route-optimizer-v1' } };
    },
  };
  const api = createTbEventStateApi({ session, service: {}, routePreview });
  const res = response();
  await api.handle(
    request('POST', body, { origin: 'https://command.example', 'content-type': 'application/json' }),
    res,
    new URL('https://command.example/api/account/web-actions/tb/route/preview'),
  );
  assert.equal(res.status, 200);
  assert.deepEqual(received, body);
  assert.equal(res.payload.persisted, false);
  assert.equal(res.payload.plan.algorithm, 'tb-route-optimizer-v1');
});

test('POST route apply delegates to the authenticated audited apply service', async () => {
  const body = {
    expectedInputFingerprint: 'a'.repeat(64),
    remainingGuildDeploymentTp: 60_000_000,
    remainingTpByPlanet: { geonosis: { remainingMissionTp: 0, remainingOperationTp: 0 } },
  };
  let received = null;
  const routeApply = {
    async apply(userId, input) {
      assert.equal(userId, 'user-1');
      received = input;
      return { applied: true, snapshotId: 'snapshot-1', appliedZoneCount: 1 };
    },
  };
  const api = createTbEventStateApi({ session, service: {}, routeApply });
  const res = response();
  await api.handle(
    request('POST', body, { origin: 'https://command.example', 'content-type': 'application/json' }),
    res,
    new URL('https://command.example/api/account/web-actions/tb/route/apply'),
  );
  assert.equal(res.status, 200);
  assert.deepEqual(received, body);
  assert.equal(res.payload.applied, true);
  assert.equal(res.payload.appliedZoneCount, 1);
});

test('route preview errors expose structured missing-input details', async () => {
  const routePreview = {
    async preview() {
      const error = new Error('Missing route inputs.');
      error.status = 400;
      error.code = 'ROUTE_ZONE_INPUTS_INCOMPLETE';
      error.details = { missingPlanets: ['bracca'] };
      throw error;
    },
  };
  const api = createTbEventStateApi({ session, service: {}, routePreview });
  const res = response();
  await api.handle(
    request('POST', {}, { origin: 'https://command.example', 'content-type': 'application/json' }),
    res,
    new URL('https://command.example/api/account/web-actions/tb/route/preview'),
  );
  assert.equal(res.status, 400);
  assert.equal(res.payload.code, 'ROUTE_ZONE_INPUTS_INCOMPLETE');
  assert.deepEqual(res.payload.details.missingPlanets, ['bracca']);
});

test('route apply errors expose stale preview details without falling through to generic failure', async () => {
  const routeApply = {
    async apply() {
      const error = new Error('Recalculate.');
      error.status = 409;
      error.code = 'ROUTE_PREVIEW_STALE';
      error.details = { currentInputFingerprint: 'b'.repeat(64) };
      throw error;
    },
  };
  const api = createTbEventStateApi({ session, service: {}, routeApply });
  const res = response();
  await api.handle(
    request('POST', {}, { origin: 'https://command.example', 'content-type': 'application/json' }),
    res,
    new URL('https://command.example/api/account/web-actions/tb/route/apply'),
  );
  assert.equal(res.status, 409);
  assert.equal(res.payload.code, 'ROUTE_PREVIEW_STALE');
  assert.equal(res.payload.details.currentInputFingerprint, 'b'.repeat(64));
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
