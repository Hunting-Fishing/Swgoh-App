import { supabaseAuthSession } from './supabase-auth-session.mjs';
import { tbOperationContributionService } from './tb-operation-contribution-service.mjs';

const MAX_BODY_BYTES = 64 * 1024;
const OFFICER_ROLES = new Set(['owner', 'officer']);
const DEFAULT_OPERATIONS_URL = 'https://raw.githubusercontent.com/swgoh-utils/gamedata/main/swgoh_rote_operations.json';
const OPERATIONS_CACHE_MS = 6 * 60 * 60 * 1000;

const array = (value) => Array.isArray(value) ? value : [];
const text = (value) => String(value ?? '').trim();
const object = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};

function httpError(message, status, code) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function writeJson(response, status, body, headers = {}) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  });
  response.end(JSON.stringify(body));
}

function sameOrigin(request) {
  const origin = text(request?.headers?.origin);
  if (!origin) return true;
  const host = text(request?.headers?.['x-forwarded-host'] || request?.headers?.host);
  const proto = text(text(request?.headers?.['x-forwarded-proto']).split(',')[0]) || 'https';
  return Boolean(host && origin === `${proto}://${host}`);
}

async function readJsonBody(request) {
  const type = text(request?.headers?.['content-type']).toLowerCase();
  if (!type.startsWith('application/json')) {
    throw httpError('Content-Type must be application/json.', 415, 'CONTENT_TYPE_REQUIRED');
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      throw httpError('ROTE Operation contribution request body is too large.', 413, 'BODY_TOO_LARGE');
    }
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw httpError('Request body must contain valid JSON.', 400, 'INVALID_JSON');
  }
}

function officer(identity = {}) {
  return OFFICER_ROLES.has(text(identity?.membership?.role).toLowerCase());
}

function safeEvent(event = {}) {
  return Object.freeze({
    id: text(event.id),
    guildId: text(event.guild_id),
    tbKey: text(event.tb_key),
    currentPhase: text(event.current_phase),
    status: text(event.status),
    startedAt: text(event.started_at),
    endsAt: text(event.ends_at),
    updatedAt: text(event.updated_at),
  });
}

function safeUnitSnapshot(snapshot = {}) {
  const row = object(snapshot);
  return Object.freeze({
    baseId: text(row.baseId),
    name: text(row.name),
    level: row.level ?? null,
    stars: row.stars ?? null,
    gear: row.gear ?? null,
    relic: row.relic ?? null,
    galacticPower: row.galacticPower ?? null,
    zetaCount: row.zetaCount ?? null,
    omicronCount: row.omicronCount ?? null,
    abilities: Object.freeze(array(row.abilities).map((ability) => Object.freeze({
      id: text(ability?.id),
      name: text(ability?.name),
      tier: ability?.tier ?? null,
      hasZeta: ability?.hasZeta ?? null,
      hasOmicron: ability?.hasOmicron ?? null,
      omicronMode: ability?.omicronMode ?? null,
    }))),
    stats: Object.freeze({ ...object(row.stats) }),
    source: text(row.source),
    fetchedAt: text(row.fetchedAt),
  });
}

function safeContribution(row = {}, { audit = false } = {}) {
  if (!row) return null;
  const metadata = object(row.metadata);
  const common = {
    playerId: text(row.playerId),
    allyCode: text(row.allyCode),
    baseId: text(row.baseId),
    relic: row.relic ?? null,
    rarity: row.rarity ?? null,
    status: text(row.status),
    evidenceClass: text(row.evidenceClass),
    sourceKind: text(row.sourceKind),
    observedAt: text(row.observedAt),
    unitSnapshot: safeUnitSnapshot(row.unitSnapshot),
    assignmentMatched: metadata.assignmentMatched === true,
    mismatchReasons: Object.freeze(array(metadata.mismatchReasons).map(text).filter(Boolean)),
    contributorIdentityResolved: metadata.contributorIdentityResolved === true,
  };
  if (!audit) return Object.freeze(common);
  return Object.freeze({
    ...common,
    evidenceId: text(row.id),
    contributionKey: text(row.contributionKey),
    evidenceFingerprint: text(row.evidenceFingerprint),
    sourceRef: text(row.sourceRef),
    reportedByUserId: text(row.reportedByUserId),
    createdAt: text(row.createdAt),
    metadata: Object.freeze({ ...metadata }),
  });
}

function safeAssignment(row = {}, { audit = false } = {}) {
  if (!row) return null;
  const common = {
    playerId: text(row.playerId),
    allyCode: text(row.allyCode),
    baseId: text(row.baseId),
    state: text(row.state),
    source: text(row.source),
    assignedAt: text(row.assignedAt),
  };
  if (!audit) return Object.freeze(common);
  return Object.freeze({
    ...common,
    assignmentId: text(row.id),
    assignmentRunId: text(row.assignmentRunId),
    planHash: text(row.planHash),
    inputFingerprint: text(row.inputFingerprint),
    supersededAt: text(row.supersededAt),
  });
}

function safeSlot(row = {}, { audit = false } = {}) {
  const common = {
    id: text(row.id),
    phase: text(row.phase),
    planetId: text(row.planetId),
    operationId: text(row.operationId),
    operationName: text(row.operationName),
    slotId: text(row.slotId),
    slotIndex: Number(row.slotIndex || 0),
    requiredBaseId: text(row.requiredBaseId),
    requiredRelic: row.requiredRelic ?? null,
    requiredRarity: row.requiredRarity ?? null,
    sourceKind: text(row.sourceKind),
    sourceFetchedAt: text(row.sourceFetchedAt),
  };
  if (!audit) return Object.freeze(common);
  return Object.freeze({ ...common, sourceRef: text(row.sourceRef), metadata: Object.freeze({ ...object(row.metadata) }) });
}

export function guildSafeOperationLedger(ledger = {}, identity = {}) {
  const audit = officer(identity);
  return Object.freeze({
    source: text(ledger.source),
    guildId: text(ledger.guildId),
    eventId: text(ledger.eventId),
    phase: text(ledger.phase),
    authorization: Object.freeze({ role: text(identity?.membership?.role).toLowerCase(), officer: audit }),
    slots: Object.freeze(array(ledger.slots).map((entry) => Object.freeze({
      slot: safeSlot(entry?.slot, { audit }),
      assignment: safeAssignment(entry?.assignment, { audit }),
      effectiveContribution: safeContribution(entry?.effectiveContribution, { audit }),
      contributionHistoryCount: array(entry?.contributions).length,
      ...(audit ? { contributions: Object.freeze(array(entry?.contributions).map((row) => safeContribution(row, { audit: true }))) } : {}),
    }))),
    evidenceBoundary: text(ledger.evidenceBoundary),
  });
}

export function createTbOperationContributionApi(options = {}) {
  const session = options.session || supabaseAuthSession;
  const service = options.service || tbOperationContributionService;
  const fetchImpl = options.fetch || fetch;
  const operationsUrl = text(options.operationsUrl || process.env.SWGOH_ROTE_OPERATIONS_URL) || DEFAULT_OPERATIONS_URL;
  const now = typeof options.now === 'function' ? options.now : () => new Date();
  let operationCache = { payload: null, fetchedAt: '', expiresAt: 0 };

  async function requireUser(request) {
    const user = await session.currentUser(request);
    if (!user?.id) throw httpError('A signed-in Command Center session is required.', 401, 'AUTH_REQUIRED');
    return user;
  }

  async function identityFor(userId) {
    return service.verifiedIdentity(userId);
  }

  async function loadOperationReference() {
    const current = Date.now();
    if (operationCache.payload && operationCache.expiresAt > current) return operationCache;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetchImpl(operationsUrl, {
        headers: { Accept: 'application/json', 'User-Agent': 'SWGOH-Command-Center (rote-operation-ledger)' },
        redirect: 'error',
        signal: controller.signal,
      });
      if (!response.ok) throw httpError(`ROTE Operation reference source returned HTTP ${response.status}.`, 502, 'ROTE_OPERATION_REFERENCE_FAILED');
      const payload = await response.json();
      const fetchedAt = now().toISOString();
      operationCache = { payload, fetchedAt, expiresAt: current + OPERATIONS_CACHE_MS };
      return operationCache;
    } catch (error) {
      if (error?.name === 'AbortError') throw httpError('ROTE Operation reference source timed out.', 504, 'ROTE_OPERATION_REFERENCE_TIMEOUT');
      if (operationCache.payload) return operationCache;
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async function handle(request, response, url) {
    if (!url.pathname.startsWith('/api/account/tb-operations/')) return false;
    try {
      const user = await requireUser(request);
      const identity = await identityFor(user.id);

      if (request.method === 'GET' && url.pathname === '/api/account/tb-operations/event/current') {
        const event = await service.eventFor(identity);
        writeJson(response, 200, {
          source: 'guild-tb-operation-ledger-v1',
          event: safeEvent(event),
          authorization: { role: text(identity?.membership?.role).toLowerCase(), officer: officer(identity) },
          evidenceBoundary: 'This endpoint reports durable ROTE event context only. It does not infer Operation assignments or contributions.',
        });
        return true;
      }

      if (request.method === 'GET' && url.pathname === '/api/account/tb-operations/event/current/ledger') {
        const ledger = await service.ledger(user.id, {
          phase: url.searchParams.get('phase') || '',
          planetId: url.searchParams.get('planetId') || '',
        });
        writeJson(response, 200, guildSafeOperationLedger(ledger, identity));
        return true;
      }

      if (request.method === 'POST' && url.pathname === '/api/account/tb-operations/event/current/reference-sync') {
        if (!sameOrigin(request)) throw httpError('Cross-origin ROTE Operation write rejected.', 403, 'CROSS_ORIGIN_REJECTED');
        if (!officer(identity)) throw httpError('Guild officer authorization is required to synchronize Operation slot reference state.', 403, 'OFFICER_REQUIRED');
        const reference = await loadOperationReference();
        const result = await service.syncReferenceSlots(user.id, reference.payload, {
          sourceKind: 'canonical',
          sourceRef: operationsUrl,
          sourceFetchedAt: reference.fetchedAt,
        });
        writeJson(response, 200, {
          source: text(result.source),
          eventId: text(result.eventId),
          guildId: text(result.guildId),
          savedSlots: Number(result.savedSlots || 0),
          skipped: array(result.skipped),
          evidenceBoundary: text(result.evidenceBoundary),
        });
        return true;
      }

      if (request.method === 'POST' && url.pathname === '/api/account/tb-operations/contributions/self') {
        if (!sameOrigin(request)) throw httpError('Cross-origin ROTE Operation write rejected.', 403, 'CROSS_ORIGIN_REJECTED');
        const body = await readJsonBody(request);
        const result = await service.recordMemberConfirmation(user.id, body);
        writeJson(response, result.alreadyRecorded ? 200 : 201, {
          source: text(result.source),
          saved: result.saved === true,
          alreadyRecorded: result.alreadyRecorded === true,
          contribution: safeContribution(result.contribution, { audit: false }),
        });
        return true;
      }

      if (request.method === 'POST' && url.pathname === '/api/account/tb-operations/contributions/officer') {
        if (!sameOrigin(request)) throw httpError('Cross-origin ROTE Operation write rejected.', 403, 'CROSS_ORIGIN_REJECTED');
        if (!officer(identity)) throw httpError('Guild officer authorization is required to confirm another member’s Operation contribution.', 403, 'OFFICER_REQUIRED');
        const body = await readJsonBody(request);
        const result = await service.recordOfficerConfirmation(user.id, body);
        writeJson(response, result.alreadyRecorded ? 200 : 201, {
          source: text(result.source),
          saved: result.saved === true,
          alreadyRecorded: result.alreadyRecorded === true,
          contribution: safeContribution(result.contribution, { audit: true }),
        });
        return true;
      }

      writeJson(response, 405, { error: 'Method not allowed for ROTE Operation route.', code: 'METHOD_NOT_ALLOWED' }, { Allow: 'GET, POST' });
      return true;
    } catch (error) {
      writeJson(response, Number(error?.status) || 500, {
        error: error?.message || 'ROTE Operation request failed.',
        code: error?.code || 'TB_OPERATION_REQUEST_FAILED',
      });
      return true;
    }
  }

  return Object.freeze({ handle, loadOperationReference });
}

export const tbOperationContributionApi = createTbOperationContributionApi();

export { MAX_BODY_BYTES as TB_OPERATION_API_MAX_BODY_BYTES, sameOrigin as tbOperationSameOrigin };
