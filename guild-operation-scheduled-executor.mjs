import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalRosterService } from './canonical-roster-service.mjs';
import { listDiscordHardReservations } from './discord-hard-reservation-service.mjs';
import { guildOperationsDiscordDelivery } from './guild-operations-discord-delivery.mjs';
import { guildOperationsService } from './guild-operations-service.mjs';
import { resolveGuildPlanningOverlay } from './guild-planning-overlay.mjs';
import { aggregateRoteOperations } from './rote-operations.mjs';
import { buildGuildRoteOperationSafety } from './public/guild-rote-operation-safety.js';
import { planGuildTbOperationsParity } from './public/guild-operations-parity-planner.js';
import { planGuildTwDefenseAssignments } from './public/guild-tw-defense-assigner.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_OPERATIONS_URL = 'https://raw.githubusercontent.com/swgoh-utils/gamedata/main/swgoh_rote_operations.json';
const cache = { catalog: null, operations: null, operationsAt: 0 };
const array = (value) => Array.isArray(value) ? value : [];
const text = (value) => String(value ?? '').trim();

function fingerprint(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function scheduledError(message, code = 'SCHEDULED_OPERATION_NOT_PUBLISH_READY') {
  const error = new Error(message);
  error.code = code;
  return error;
}

async function loadCatalog() {
  if (cache.catalog) return cache.catalog;
  const parsed = JSON.parse(await readFile(path.join(root, 'public', 'data', 'catalog.json'), 'utf8'));
  const units = array(parsed?.units);
  if (!units.length) throw scheduledError('Static game catalog is unavailable.', 'CATALOG_UNAVAILABLE');
  cache.catalog = units;
  return units;
}

async function loadRoteOperations(fetchImpl = fetch) {
  if (cache.operations && Date.now() - cache.operationsAt < 6 * 60 * 60 * 1000) return cache.operations;
  const response = await fetchImpl(text(process.env.SWGOH_ROTE_OPERATIONS_URL) || DEFAULT_OPERATIONS_URL, {
    headers: { Accept: 'application/json', 'User-Agent': 'SWGOH-Command-Center (scheduled-guild-operations)' },
    redirect: 'error',
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw scheduledError(`ROTE operation source returned HTTP ${response.status}.`, 'ROTE_OPERATIONS_SOURCE_FAILED');
  const operations = aggregateRoteOperations(await response.json());
  if (!array(operations?.slots).length) throw scheduledError('ROTE operation requirements are empty.', 'ROTE_OPERATIONS_EMPTY');
  cache.operations = operations;
  cache.operationsAt = Date.now();
  return operations;
}

function ignoredControls(workspace) {
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

function requireOverlay(overlay) {
  const reason = text(overlay?.reason);
  if (overlay?.durable && ['state-read-failed','ambiguous-discord-guild-bindings'].includes(reason)) {
    throw scheduledError(`Durable Discord planning controls are unavailable: ${reason}.`, 'PLANNING_OVERLAY_UNAVAILABLE');
  }
  return overlay;
}

async function hardReservations(discordGuildIdInput) {
  const discordGuildId = text(discordGuildIdInput);
  if (!/^\d{16,22}$/.test(discordGuildId)) return [];
  const result = await listDiscordHardReservations({ discordGuildId });
  return array(result?.rows).map((row) => ({
    memberId: text(row.memberId), phase: text(row.phase), baseId: text(row.baseId).toUpperCase(), source: 'durable-discord-hard-reserve',
  })).filter((row) => row.memberId && row.phase && row.baseId);
}

export function createGuildOperationScheduledExecutor(options = {}) {
  const service = options.service || guildOperationsService;
  const canonical = options.canonical || canonicalRosterService;
  const delivery = options.delivery || guildOperationsDiscordDelivery;
  const fetchImpl = options.fetch || fetch;

  async function buildTb(schedule) {
    const userId = text(schedule.created_by_user_id);
    const code = text(schedule.lookup_ally_code);
    const planId = text(schedule.plan_id);
    const context = await service.requireOfficer(userId, code);
    const [detail, guildBody, operations, catalog, workspace, binding] = await Promise.all([
      service.getTbPlanDetail(userId, code, planId), canonical.getGuildRosterByPlayer(code), loadRoteOperations(fetchImpl), loadCatalog(),
      service.getWorkspace(userId, code), delivery.resolveBinding(context.guild.id),
    ]);
    const [overlayRaw, reserves] = await Promise.all([
      resolveGuildPlanningOverlay(guildBody), hardReservations(binding?.discordGuildId),
    ]);
    const overlay = requireOverlay(overlayRaw);
    const safety = buildGuildRoteOperationSafety(guildBody, catalog, { redundancyTarget: 2 });
    const preferences = mergePreferences(overlay?.preferences, workspace.donationPreferences);
    const ignoredMembers = mergeIgnored(overlay?.ignoredMembers, ignoredControls(workspace));
    const plan = detail.plan;
    const preview = planGuildTbOperationsParity(guildBody, operations, {
      phaseLayout: plan.phaseLayout,
      requirementOverrides: plan.requirementOverrides,
      ignoredMissions: plan.ignoredMissions,
      ignoredPlatoons: plan.ignoredPlatoons,
      ignoredSlots: plan.ignoredSlots,
      preAssignments: detail.preAssignments,
      groupingRules: detail.rules,
      reservations: reserves,
      preferences,
      ignoredMembers,
      protections: safety.protections,
      maxPerTerritory: 10,
    });
    const inputFingerprint = fingerprint({
      scheduleId: schedule.id, guildId: context.guild.id, guildSyncedAt: context.guild.last_synced_at, plan,
      rules: detail.rules, preAssignments: detail.preAssignments, preferences, ignoredMembers, reserves,
      protectionSummary: safety.summary, operationSlots: operations.slots.length,
    });
    const run = await service.persistTbRun(context, {
      planId, status: 'preview', inputFingerprint, assignments: preview.assignments, unfilled: preview.unfilled,
      diagnostics: { parity: preview.parity, safety: safety.summary, phases: preview.phases, summary: preview.summary, guildFreshness: { lastSyncedAt: text(context.guild.last_synced_at) }, scheduled: true, scheduleId: schedule.id },
      delivery: { mode: 'scheduled-preview', published: false },
    });
    if (preview?.parity?.publishReady !== true) {
      throw scheduledError(`Scheduled TB preview is not publish-ready: ${array(preview?.parity?.unresolvedRequirements).length} unresolved requirement(s), ${array(preview?.unfilled).length} unfilled slot(s), ${array(preview?.lockIssues).length} lock issue(s).`);
    }
    return { context, runId: text(run?.id), preview };
  }

  async function buildTw(schedule) {
    const userId = text(schedule.created_by_user_id);
    const code = text(schedule.lookup_ally_code);
    const planId = text(schedule.plan_id);
    const context = await service.requireOfficer(userId, code);
    const workspace = await service.getWorkspace(userId, code);
    const plan = workspace.twPlans.find((row) => row.id === planId);
    if (!plan) throw scheduledError('Scheduled TW defense plan no longer exists.', 'TW_PLAN_NOT_FOUND');
    const guildBody = await canonical.getGuildRosterByPlayer(code);
    const ignoredMembers = ignoredControls(workspace);
    const preview = planGuildTwDefenseAssignments(guildBody, plan.strategy, { ignoredMembers });
    const inputFingerprint = fingerprint({ scheduleId: schedule.id, guildId: context.guild.id, guildSyncedAt: context.guild.last_synced_at, plan, ignoredMembers });
    const run = await service.persistTwRun(context, {
      planId, status: 'preview', inputFingerprint, assignments: preview.assignments, unfilled: preview.unfilled,
      diagnostics: { ...preview.diagnostics, strategyValid: preview.strategyValid, publishReady: preview.publishReady, guildFreshness: { lastSyncedAt: text(context.guild.last_synced_at) }, scheduled: true, scheduleId: schedule.id },
      delivery: { mode: 'scheduled-preview', published: false },
    });
    if (preview?.publishReady !== true) {
      throw scheduledError(`Scheduled TW preview is not publish-ready; ${array(preview?.unfilled).length} requested defense assignment(s) remain unfilled.`);
    }
    return { context, runId: text(run?.id), preview };
  }

  async function execute(schedule) {
    const built = text(schedule.run_type) === 'tw' ? await buildTw(schedule) : await buildTb(schedule);
    if (schedule.auto_publish === false) return Object.freeze({ runId: built.runId, published: false, previewOnly: true });
    const published = await delivery.publish(built.context, {
      runType: text(schedule.run_type),
      runId: built.runId,
      destinationId: text(schedule.destination_id),
      includeMentions: schedule.include_mentions === true,
      sendDms: schedule.send_dms === true,
    });
    return Object.freeze({ runId: built.runId, published: true, delivery: published });
  }

  return Object.freeze({ execute });
}

export const guildOperationScheduledExecutor = createGuildOperationScheduledExecutor();
