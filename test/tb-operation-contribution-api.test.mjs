import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';

import {
  createTbOperationContributionApi,
  guildSafeOperationLedger,
  TB_OPERATION_API_MAX_BODY_BYTES,
} from '../tb-operation-contribution-api.mjs';
import { createAccountOnboarding } from '../account-onboarding.mjs';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const GUILD_ID = '33333333-3333-4333-8333-333333333333';
const EVENT_ID = '44444444-4444-4444-8444-444444444444';

function responseCapture() {
  return {
    status: 0,
    headers: {},
    body: '',
    writeHead(status, headers) { this.status = status; this.headers = headers || {}; },
    end(body = '') { this.body = String(body); },
  };
}

function request(method = 'GET', body = null, headers = {}) {
  let payload = [];
  if (body !== null) payload = [typeof body === 'string' ? body : JSON.stringify(body)];
  const stream = Readable.from(payload);
  stream.method = method;
  stream.headers = {
    host: 'command.test',
    'x-forwarded-proto': 'https',
    ...(body === null ? {} : { 'content-type': 'application/json', origin: 'https://command.test' }),
    ...headers,
  };
  return stream;
}

function identity(role = 'member') {
  return {
    userId: USER_ID,
    guildId: GUILD_ID,
    allyCode: '123456789',
    player: { id: '22222222-2222-4222-8222-222222222222', ally_code: '123456789', name: 'Member One' },
    membership: { guild_id: GUILD_ID, user_id: USER_ID, role, status: 'active' },
  };
}

function contribution(overrides = {}) {
  return {
    id: '55555555-5555-4555-8555-555555555555',
    contributionKey: 'a'.repeat(64),
    evidenceFingerprint: 'b'.repeat(64),
    playerId: '22222222-2222-4222-8222-222222222222',
    allyCode: '123456789',
    baseId: 'CEREJUNDA',
    relic: 8,
    rarity: 7,
    status: 'filled',
    evidenceClass: 'GUILD_DATA',
    sourceKind: 'member_web',
    sourceRef: 'member-fill-001',
    observedAt: '2026-08-20T07:00:00.000Z',
    reportedByUserId: USER_ID,
    createdAt: '2026-08-20T07:00:01.000Z',
    unitSnapshot: {
      baseId: 'CEREJUNDA', name: 'Cere Junda', level: 85, stars: 7, gear: 13, relic: 8,
      galacticPower: 35000, zetaCount: 2, omicronCount: 1,
      abilities: [{ id: 'unique01', tier: 8, hasZeta: true, hasOmicron: true, omicronMode: 7 }],
      stats: { speed: 318, health: 100000 }, source: 'player_units_current', fetchedAt: '2026-08-20T06:00:00.000Z',
    },
    metadata: {
      assignmentMatched: true,
      mismatchReasons: [],
      contributorIdentityResolved: true,
      privateAuditNote: 'officer-only',
    },
    ...overrides,
  };
}

function ledgerFixture() {
  return {
    source: 'guild-tb-operation-ledger-v1',
    guildId: GUILD_ID,
    eventId: EVENT_ID,
    phase: 'P3',
    evidenceBoundary: 'ASSIGNED and CONTRIBUTED are separate evidence.',
    slots: [{
      slot: {
        id: '66666666-6666-4666-8666-666666666666', phase: 'P3', planetId: 'tatooine',
        operationId: 'P3-C1:tb3-platoon-4', operationName: 'Tatooine · Operation 4',
        slotId: 'P3:P3-C1:tb3-platoon-4:1', slotIndex: 1, requiredBaseId: 'CEREJUNDA',
        requiredRelic: 7, requiredRarity: 7, sourceKind: 'canonical', sourceRef: 'canonical-source',
        sourceFetchedAt: '2026-08-20T06:59:00.000Z', metadata: { conflictId: 'P3-C1' },
      },
      assignment: {
        id: '77777777-7777-4777-8777-777777777777', assignmentRunId: '88888888-8888-4888-8888-888888888888',
        playerId: '22222222-2222-4222-8222-222222222222', allyCode: '123456789', baseId: 'CEREJUNDA',
        state: 'assigned', source: 'stage9', planHash: 'c'.repeat(64), inputFingerprint: 'd'.repeat(64),
        assignedAt: '2026-08-20T06:30:00.000Z', supersededAt: '',
      },
      effectiveContribution: contribution(),
      contributions: [contribution(), contribution({ id: '99999999-9999-4999-8999-999999999999', sourceKind: 'canonical', evidenceClass: 'GAME_DATA' })],
    }],
  };
}

function apiWith({ role = 'member', signedIn = true, serviceOverrides = {}, fetchImpl } = {}) {
  const calls = [];
  const who = identity(role);
  const service = {
    verifiedIdentity: async (userId) => { calls.push(['identity', userId]); return who; },
    eventFor: async (resolved) => ({
      id: EVENT_ID, guild_id: resolved.guildId, tb_key: 'rote', current_phase: 'P3', status: 'active',
      started_at: '2026-08-19T00:00:00.000Z', ends_at: '2026-08-25T00:00:00.000Z', updated_at: '2026-08-20T07:00:00.000Z',
    }),
    ledger: async (userId, filters) => { calls.push(['ledger', userId, filters]); return ledgerFixture(); },
    recordMemberConfirmation: async (userId, body) => { calls.push(['self', userId, body]); return { source: 'guild-tb-operation-contributions-v1', saved: true, alreadyRecorded: false, contribution: contribution() }; },
    recordOfficerConfirmation: async (userId, body) => { calls.push(['officer', userId, body]); return { source: 'guild-tb-operation-contributions-v1', saved: true, alreadyRecorded: false, contribution: contribution({ sourceKind: 'officer_web' }) }; },
    syncReferenceSlots: async (userId, payload, options) => { calls.push(['sync', userId, payload, options]); return { source: 'guild-tb-operation-ledger-v1', eventId: EVENT_ID, guildId: GUILD_ID, savedSlots: 90, skipped: [], evidenceBoundary: 'Reference state does not prove contribution.' }; },
    ...serviceOverrides,
  };
  const session = { currentUser: async () => signedIn ? ({ id: USER_ID, email: 'member@example.test' }) : null };
  const api = createTbOperationContributionApi({
    session,
    service,
    operationsUrl: 'https://reference.test/rote.json',
    now: () => new Date('2026-08-20T07:30:00.000Z'),
    fetch: fetchImpl || (async () => ({ ok: true, json: async () => ([{ phase: 'P3' }]) })),
  });
  return { api, calls, service };
}

test('all A3 routes require a signed-in Command Center session', async () => {
  const { api } = apiWith({ signedIn: false });
  const res = responseCapture();
  const handled = await api.handle(request('GET'), res, new URL('https://command.test/api/account/tb-operations/event/current'));
  assert.equal(handled, true);
  assert.equal(res.status, 401);
  assert.equal(JSON.parse(res.body).code, 'AUTH_REQUIRED');
});

test('current-event route returns durable event context without inferring contributions', async () => {
  const { api } = apiWith();
  const res = responseCapture();
  await api.handle(request('GET'), res, new URL('https://command.test/api/account/tb-operations/event/current'));
  assert.equal(res.status, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.event.id, EVENT_ID);
  assert.equal(body.event.currentPhase, 'P3');
  assert.equal(body.authorization.officer, false);
  assert.match(body.evidenceBoundary, /does not infer/i);
});

test('member ledger is Guild-safe while preserving actionable assignment and effective contribution data', async () => {
  const { api, calls } = apiWith({ role: 'member' });
  const res = responseCapture();
  await api.handle(request('GET'), res, new URL('https://command.test/api/account/tb-operations/event/current/ledger?phase=P3&planetId=tatooine'));
  assert.equal(res.status, 200);
  const body = JSON.parse(res.body);
  assert.deepEqual(calls.find((row) => row[0] === 'ledger'), ['ledger', USER_ID, { phase: 'P3', planetId: 'tatooine' }]);
  assert.equal(body.authorization.officer, false);
  assert.equal(body.slots[0].assignment.allyCode, '123456789');
  assert.equal(body.slots[0].effectiveContribution.unitSnapshot.stats.speed, 318);
  assert.equal(body.slots[0].contributionHistoryCount, 2);
  assert.equal('contributions' in body.slots[0], false);
  assert.equal('planHash' in body.slots[0].assignment, false);
  assert.equal('sourceRef' in body.slots[0].slot, false);
  assert.equal('reportedByUserId' in body.slots[0].effectiveContribution, false);
  assert.equal('evidenceFingerprint' in body.slots[0].effectiveContribution, false);
});

test('officer ledger exposes append-only evidence audit details', async () => {
  const { api } = apiWith({ role: 'officer' });
  const res = responseCapture();
  await api.handle(request('GET'), res, new URL('https://command.test/api/account/tb-operations/event/current/ledger?phase=P3'));
  const body = JSON.parse(res.body);
  assert.equal(res.status, 200);
  assert.equal(body.authorization.officer, true);
  assert.equal(body.slots[0].contributions.length, 2);
  assert.equal(body.slots[0].assignment.planHash, 'c'.repeat(64));
  assert.equal(body.slots[0].effectiveContribution.reportedByUserId, USER_ID);
  assert.equal(body.slots[0].effectiveContribution.evidenceFingerprint, 'b'.repeat(64));
});

test('member self-confirmation is same-origin, JSON-only, and delegates to the self-only service path', async () => {
  const { api, calls } = apiWith({ role: 'member' });
  const req = request('POST', { id: 'member-fill-001', slotRecordId: '66666666-6666-4666-8666-666666666666', sourceKind: 'canonical' });
  const res = responseCapture();
  await api.handle(req, res, new URL('https://command.test/api/account/tb-operations/contributions/self'));
  assert.equal(res.status, 201);
  const call = calls.find((row) => row[0] === 'self');
  assert.ok(call);
  assert.equal(call[1], USER_ID);
  assert.equal(JSON.parse(res.body).contribution.sourceKind, 'member_web');
});

test('cross-origin contribution writes are rejected before persistence', async () => {
  const { api, calls } = apiWith();
  const req = request('POST', { id: 'member-fill-evil' }, { origin: 'https://evil.example' });
  const res = responseCapture();
  await api.handle(req, res, new URL('https://command.test/api/account/tb-operations/contributions/self'));
  assert.equal(res.status, 403);
  assert.equal(JSON.parse(res.body).code, 'CROSS_ORIGIN_REJECTED');
  assert.equal(calls.some((row) => row[0] === 'self'), false);
});

test('contribution writes require application/json and reject malformed or oversized payloads', async () => {
  const { api, calls } = apiWith();

  const missingType = request('POST', JSON.stringify({ id: 'x' }), { 'content-type': '' });
  const missingTypeRes = responseCapture();
  await api.handle(missingType, missingTypeRes, new URL('https://command.test/api/account/tb-operations/contributions/self'));
  assert.equal(missingTypeRes.status, 415);
  assert.equal(JSON.parse(missingTypeRes.body).code, 'CONTENT_TYPE_REQUIRED');

  const malformed = request('POST', '{bad-json');
  const malformedRes = responseCapture();
  await api.handle(malformed, malformedRes, new URL('https://command.test/api/account/tb-operations/contributions/self'));
  assert.equal(malformedRes.status, 400);
  assert.equal(JSON.parse(malformedRes.body).code, 'INVALID_JSON');

  const huge = request('POST', 'x'.repeat(TB_OPERATION_API_MAX_BODY_BYTES + 1));
  const hugeRes = responseCapture();
  await api.handle(huge, hugeRes, new URL('https://command.test/api/account/tb-operations/contributions/self'));
  assert.equal(hugeRes.status, 413);
  assert.equal(JSON.parse(hugeRes.body).code, 'BODY_TOO_LARGE');
  assert.equal(calls.some((row) => row[0] === 'self'), false);
});

test('officer confirmation is unavailable to ordinary members and service conflicts keep their HTTP status/code', async () => {
  const member = apiWith({ role: 'member' });
  const memberRes = responseCapture();
  await member.api.handle(request('POST', { id: 'officer-fill-001' }), memberRes, new URL('https://command.test/api/account/tb-operations/contributions/officer'));
  assert.equal(memberRes.status, 403);
  assert.equal(JSON.parse(memberRes.body).code, 'OFFICER_REQUIRED');
  assert.equal(member.calls.some((row) => row[0] === 'officer'), false);

  const conflictError = Object.assign(new Error('same contribution ID contains different evidence'), { status: 409, code: 'TB_OPERATION_CONTRIBUTION_EVIDENCE_CONFLICT' });
  const officerApi = apiWith({ role: 'officer', serviceOverrides: { recordOfficerConfirmation: async () => { throw conflictError; } } });
  const conflictRes = responseCapture();
  await officerApi.api.handle(request('POST', { id: 'officer-fill-001' }), conflictRes, new URL('https://command.test/api/account/tb-operations/contributions/officer'));
  assert.equal(conflictRes.status, 409);
  assert.equal(JSON.parse(conflictRes.body).code, 'TB_OPERATION_CONTRIBUTION_EVIDENCE_CONFLICT');
});

test('reference sync is officer-only and fetches server-controlled canonical source rather than a client payload', async () => {
  const fetched = [];
  const { api, calls } = apiWith({
    role: 'officer',
    fetchImpl: async (url, options) => { fetched.push([url, options]); return { ok: true, json: async () => ([{ id: 'P3-C1', phase: 'P3' }]) }; },
  });
  const res = responseCapture();
  await api.handle(request('POST', null, { origin: 'https://command.test' }), res, new URL('https://command.test/api/account/tb-operations/event/current/reference-sync'));
  assert.equal(res.status, 200);
  assert.equal(fetched[0][0], 'https://reference.test/rote.json');
  const sync = calls.find((row) => row[0] === 'sync');
  assert.ok(sync);
  assert.deepEqual(sync[2], [{ id: 'P3-C1', phase: 'P3' }]);
  assert.equal(sync[3].sourceKind, 'canonical');
  assert.equal(sync[3].sourceRef, 'https://reference.test/rote.json');

  const memberApi = apiWith({ role: 'member' });
  const memberRes = responseCapture();
  await memberApi.api.handle(request('POST', null, { origin: 'https://command.test' }), memberRes, new URL('https://command.test/api/account/tb-operations/event/current/reference-sync'));
  assert.equal(memberRes.status, 403);
  assert.equal(JSON.parse(memberRes.body).code, 'OFFICER_REQUIRED');
});

test('A3 exposes no game-evidence, UPDATE, PATCH, or DELETE write surface', async () => {
  const { api, calls } = apiWith({ role: 'officer' });
  for (const method of ['PUT', 'PATCH', 'DELETE']) {
    const res = responseCapture();
    await api.handle(request(method), res, new URL('https://command.test/api/account/tb-operations/contributions/self'));
    assert.equal(res.status, 405);
  }
  const gameRes = responseCapture();
  await api.handle(request('POST', { id: 'fake-game' }), gameRes, new URL('https://command.test/api/account/tb-operations/contributions/game'));
  assert.equal(gameRes.status, 405);
  assert.equal(calls.some((row) => row[0] === 'game'), false);
});

test('account onboarding delegates tb-operations routes before its generic account method handling', async () => {
  const delegated = [];
  const injected = {
    handle: async (req, res, url) => {
      delegated.push([req.method, url.pathname]);
      res.writeHead(204, { 'Cache-Control': 'no-store' });
      res.end();
      return true;
    },
  };
  const onboarding = createAccountOnboarding({
    tbOperationContributionApi: injected,
    session: { currentUser: async () => { throw new Error('generic account auth should not run'); } },
    store: { status: () => ({ configured: false }) },
    guildService: {},
    discordStateStore: {},
  });
  const res = responseCapture();
  const handled = await onboarding.handle(request('POST'), res, new URL('https://command.test/api/account/tb-operations/contributions/self'));
  assert.equal(handled, true);
  assert.equal(res.status, 204);
  assert.deepEqual(delegated, [['POST', '/api/account/tb-operations/contributions/self']]);
});

test('Guild-safe ledger helper does not expose audit fields to members', () => {
  const safe = guildSafeOperationLedger(ledgerFixture(), identity('member'));
  const entry = safe.slots[0];
  assert.equal(entry.assignment.playerId, '22222222-2222-4222-8222-222222222222');
  assert.equal('inputFingerprint' in entry.assignment, false);
  assert.equal('contributionKey' in entry.effectiveContribution, false);
  assert.equal('metadata' in entry.effectiveContribution, false);
});
