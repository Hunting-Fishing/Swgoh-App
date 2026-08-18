import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalRosterService } from './canonical-roster-service.mjs';
import { listDiscordHardReservations } from './discord-hard-reservation-service.mjs';
import { guildOperationsService } from './guild-operations-service.mjs';
import { resolveGuildPlanningOverlay } from './guild-planning-overlay.mjs';
import { aggregateRoteOperations } from './rote-operations.mjs';
import { supabaseAuthSession } from './supabase-auth-session.mjs';
import { buildGuildRoteOperationSafety } from './public/guild-rote-operation-safety.js';
import { planGuildTbOperationsParity } from './public/guild-operations-parity-planner.js';
import { planGuildTwDefenseAssignments } from './public/guild-tw-defense-assigner.js';

const MAX_BODY_BYTES = 512 * 1024;
const root = path.dirname(fileURLToPath(import.meta.url));
const defaultOperationsUrl = 'https://raw.githubusercontent.com/swgoh-utils/gamedata/main/swgoh_rote_operations.json';
const cache = { catalog: null, operations: null, operationsAt: 0 };

const array = (value) => Array.isArray(value) ? value : [];
const text = (value) => String(value ?? '').trim();
const object = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};

function httpError(message, status, code) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function writeJson(response, status, body) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
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
  if (type && !type.startsWith('application/json')) throw httpError('Content-Type must be application/json.', 415, 'CONTENT_TYPE_REQUIRED');
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw httpError('Guild Operations request body is too large.', 413, 'BODY_TOO_LARGE');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw httpError('Request body must contain valid JSON.', 400, 'INVALID_JSON'); }
}

function fingerprint(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

async function loadCatalog() {
  if (cache.catalog) return cache.catalog;
  const raw = await readFile(path.join(root, 'public', 'data', 'catalog.json'), 'utf8');
  const parsed = JSON.parse(raw);
  const units = array(parsed?.units);
  if (!units.length) throw httpError('Static game catalog is unavailable for mission-safe planning.', 503, 'CATALOG_UNAVAILABLE');
  cache.catalog = units;
  return units;
}

async function loadRoteOperations(fetchImpl = fetch) {
  const ttlMs = 6 * 60 * 60 * 1000;
  if (cache.operations && Date.now() - cache.operationsAt < ttlMs) return cache.operations;
  const url = text(process.env.SWGOH_ROTE_OPERATIONS_URL) || defaultOperationsUrl;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetchImpl(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'SWGOH-Command-Center (guild-operations)' },
      redirect: 'error',
      signal: controller.signal,
    });
    if (!response.ok) throw httpError(`ROTE operation source returned HTTP ${response.status}.`, 502, 'ROTE_OPERATIONS_SOURCE_FAILED');
    const aggregated = aggregateRoteOperations(await response.json());
    if (!array(aggregated?.slots).length) throw httpError('ROTE operation requirements are empty.', 502, 'ROTE_OPERATIONS_EMPTY');
    cache.operations = aggregated;
    cache.operationsAt = Date.now();
    return aggregated;
  } catch (error) {
    if (error?.name === 'AbortError') throw httpError('ROTE operation source timed out.', 504, 'ROTE_OPERATIONS_TIMEOUT');
    if (cache.operations) return cache.operations;
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function currentIgnoredControls(workspace) {
  const now = Date.now();
  return array(workspace?.memberControls).filter((row) => {
    if (row.available === false) return true;
    const until = Date.parse(row.ignoredUntil || '');
    return Number.isFinite(until) && until > now;
  }).map((row) => row.playerId).filter(Boolean);
}

function mergePreferences(...lists) {
  const map = new Map();
  for (const list of lists) for (const row of array(list)) {
    const memberId = text(row?.memberId || row?.playerId);
    const baseId = text(row?.baseId).toUpperCase();
    const preference = text(row?.preference).toLowerCase();
    if (!memberId || !baseId || !['give','keep'].includes(preference)) continue;
    map.set(`${memberId}|${baseId}`, { memberId, baseId, preference, source: text(row?.source) || 'durable' });
  }
  return [...map.values()];
}

function mergeIgnored(...lists) {
  return [...new Set(lists.flatMap((list) => array(list).map((row) => text(typeof row === 'string' ? row : row?.memberId)).filter(Boolean)))];
}

async function loadHardReservations(guildBody) {
  const discordGuildId = text(process.env.DISCORD_DEFAULT_GUILD_ID);
  if (!/^\d{16,22}$/.test(discordGuildId)) return [];
  try {
    const result = await listDiscordHardReservations({ discordGuildId });
    return array(result?.rows).map((row) => ({
      memberId: text(row.memberId),
      phase: text(row.phase),
      baseId: text(row.baseId).toUpperCase(),
      source: 'durable-discord-hard-reserve',
    })).filter((row) => row.memberId && row.phase && row.baseId);
  } catch (error) {
    // If the durable hard-reserve subsystem is configured, planner safety must
    // fail closed rather than silently ignoring state that may protect missions.
    if (guildBody?.members?.length) {
      throw httpError(`Hard-reservation state is unavailable: ${error?.message || 'unknown error'}`, 503, 'HARD_RESERVATION_STATE_UNAVAILABLE');
    }
    return [];
  }
}

async function buildTbPreview(userId, allyCode, planId, service, canonical, fetchImpl) {
  const context = await service.requireOfficer(userId, allyCode);
  const [detail, guildBody, operations, catalog, workspace] = await Promise.all([
    service.getTbPlanDetail(userId, allyCode, planId),
    canonical.getGuildRosterByPlayer(allyCode),
    loadRoteOperations(fetchImpl),
    loadCatalog(),
    service.getWorkspace(userId, allyCode),
  ]);
  const [overlay, hardReservations] = await Promise.all([
    resolveGuildPlanningOverlay(guildBody).catch(() => ({ preferences: [], ignoredMembers: [] })),
    loadHardReservations(guildBody),
  ]);
  const safety = buildGuildRoteOperationSafety(guildBody, catalog, { redundancyTarget: 2 });
  const preferences = mergePreferences(overlay?.preferences, workspace.donationPreferences);
  const ignoredMembers = mergeIgnored(overlay?.ignoredMembers, currentIgnoredControls(workspace));
  const plan = detail.plan;
  const preview = planGuildTbOperationsParity(guildBody, operations, {
    phaseLayout: plan.phaseLayout,
    requirementOverrides: plan.requirementOverrides,
    ignoredMissions: plan.ignoredMissions,
    ignoredPlatoons: plan.ignoredPlatoons,
    ignoredSlots: plan.ignoredSlots,
    preAssignments: detail.preAssignments,
    groupingRules: detail.rules,
    reservations: hardReservations,
    preferences,
    ignoredMembers,
    protections: safety.protections,
    maxPerTerritory: 10,
  });
  const input = {
    guildId: context.guild.id,
    guildSyncedAt: context.guild.last_synced_at,
    plan,
    rules: detail.rules,
    preAssignments: detail.preAssignments,
    preferences,
    ignoredMembers,
    hardReservations,
    protectionSummary: safety.summary,
    operationSlots: operations.slots.length,
  };
  const inputFingerprint = fingerprint(input);
  const run = await service.persistTbRun(context, {
    planId: plan.id,
    status: 'preview',
    inputFingerprint,
    assignments: preview.assignments,
    unfilled: preview.unfilled,
    diagnostics: {
      parity: preview.parity,
      safety: safety.summary,
      phases: preview.phases,
      summary: preview.summary,
    },
    delivery: { mode: 'preview', published: false },
  });
  return Object.freeze({
    source: 'server-generated-guild-operations-preview',
    runId: text(run?.id),
    inputFingerprint,
    guildFreshness: { lastSyncedAt: text(context.guild.last_synced_at) },
    plan: preview,
    safety: safety.summary,
    publishing: { enabled: false, reason: 'Outbound Discord publishing remains safety-gated until verified-destination delivery receipts are enabled.' },
  });
}

async function buildTwPreview(userId, allyCode, planId, service, canonical) {
  const context = await service.requireOfficer(userId, allyCode);
  const workspace = await service.getWorkspace(userId, allyCode);
  const plan = workspace.twPlans.find((row) => row.id === planId);
  if (!plan) throw httpError('TW defense plan was not found in this Guild.', 404, 'TW_PLAN_NOT_FOUND');
  const guildBody = await canonical.getGuildRosterByPlayer(allyCode);
  const ignoredMembers = currentIgnoredControls(workspace);
  const preview = planGuildTwDefenseAssignments(guildBody, plan.strategy, { ignoredMembers });
  const inputFingerprint = fingerprint({ guildId: context.guild.id, guildSyncedAt: context.guild.last_synced_at, plan, ignoredMembers });
  const run = await service.persistTwRun(context, {
    planId,
    status: 'preview',
    inputFingerprint,
    assignments: preview.assignments,
    unfilled: preview.unfilled,
    diagnostics: preview.diagnostics,
    delivery: { mode: 'preview', published: false },
  });
  return Object.freeze({
    source: 'server-generated-tw-defense-preview',
    runId: text(run?.id),
    inputFingerprint,
    guildFreshness: { lastSyncedAt: text(context.guild.last_synced_at) },
    plan: preview,
    publishing: { enabled: false, reason: 'Outbound Discord publishing remains safety-gated until verified-destination delivery receipts are enabled.' },
  });
}

export function createGuildOperationsApi(options = {}) {
  const session = options.session || supabaseAuthSession;
  const service = options.service || guildOperationsService;
  const canonical = options.canonical || canonicalRosterService;
  const fetchImpl = options.fetch || fetch;

  async function requireUser(request) {
    const user = await session.currentUser(request);
    if (!user?.id) throw httpError('A signed-in Command Center session is required.', 401, 'AUTH_REQUIRED');
    return user;
  }

  async function handle(request, response, url) {
    if (!url.pathname.startsWith('/api/account/guild-operations/')) return false;
    try {
      const user = await requireUser(request);
      const base = url.pathname.match(/^\/api\/account\/guild-operations\/(\d{9})(\/.*)?$/);
      if (!base) throw httpError('A valid Guild lookup Ally Code is required.', 400, 'INVALID_ALLY_CODE');
      const code = base[1];
      const suffix = base[2] || '';

      if (request.method === 'GET' && suffix === '/workspace') {
        writeJson(response, 200, await service.getWorkspace(user.id, code));
        return true;
      }

      const tbDetail = suffix.match(/^\/tb\/plans\/([0-9a-f-]{36})$/i);
      if (request.method === 'GET' && tbDetail) {
        writeJson(response, 200, await service.getTbPlanDetail(user.id, code, tbDetail[1]));
        return true;
      }

      if (!sameOrigin(request)) throw httpError('Cross-origin Guild Operations write rejected.', 403, 'CROSS_ORIGIN_REJECTED');
      if (request.method !== 'POST') throw httpError('Method not allowed for Guild Operations route.', 405, 'METHOD_NOT_ALLOWED');
      const body = await readJsonBody(request);

      if (suffix === '/settings') {
        writeJson(response, 200, await service.saveSettings(user.id, code, body));
        return true;
      }
      if (suffix === '/member-control') {
        writeJson(response, 200, await service.setMemberControl(user.id, code, body));
        return true;
      }
      if (suffix === '/donation-preference') {
        writeJson(response, 200, await service.setDonationPreference(user.id, code, body));
        return true;
      }
      if (suffix === '/tb/plans') {
        writeJson(response, body?.id ? 200 : 201, await service.saveTbPlan(user.id, code, body));
        return true;
      }
      const tbRules = suffix.match(/^\/tb\/plans\/([0-9a-f-]{36})\/rules$/i);
      if (tbRules) {
        writeJson(response, 200, { rules: await service.replaceTbRules(user.id, code, tbRules[1], body?.rules) });
        return true;
      }
      const tbPre = suffix.match(/^\/tb\/plans\/([0-9a-f-]{36})\/preassignments$/i);
      if (tbPre) {
        writeJson(response, 200, { preAssignments: await service.replaceTbPreassignments(user.id, code, tbPre[1], body?.preAssignments) });
        return true;
      }
      const tbPreview = suffix.match(/^\/tb\/plans\/([0-9a-f-]{36})\/preview$/i);
      if (tbPreview) {
        writeJson(response, 201, await buildTbPreview(user.id, code, tbPreview[1], service, canonical, fetchImpl));
        return true;
      }
      if (suffix === '/tw/plans') {
        writeJson(response, body?.id ? 200 : 201, await service.saveTwPlan(user.id, code, body));
        return true;
      }
      const twPreview = suffix.match(/^\/tw\/plans\/([0-9a-f-]{36})\/preview$/i);
      if (twPreview) {
        writeJson(response, 201, await buildTwPreview(user.id, code, twPreview[1], service, canonical));
        return true;
      }
      if (suffix.endsWith('/publish')) {
        throw httpError('Publishing is intentionally safety-gated. Generate a preview first; verified-destination queue delivery is the next activation gate.', 409, 'PUBLISHING_SAFETY_GATED');
      }

      throw httpError('Guild Operations route not found.', 404, 'OPERATIONS_ROUTE_NOT_FOUND');
    } catch (error) {
      writeJson(response, Number(error?.status) || 500, {
        error: error?.message || 'Guild Operations request failed.',
        code: error?.code || 'GUILD_OPERATIONS_FAILED',
      });
      return true;
    }
  }

  return Object.freeze({ handle });
}

export const guildOperationsApi = createGuildOperationsApi();
