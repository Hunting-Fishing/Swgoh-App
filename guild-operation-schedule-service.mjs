import { guildOperationsService } from './guild-operations-service.mjs';
import { supabaseCoreStore } from './supabase-core-store.mjs';

const text = (value) => String(value ?? '').trim();
const rows = (value) => Array.isArray(value) ? value : value ? [value] : [];
const first = (value) => rows(value)[0] || null;

function httpError(message, status, code) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function uuid(value, label = 'ID') {
  const normalized = text(value).toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(normalized)) {
    throw httpError(`${label} is invalid.`, 400, 'INVALID_ID');
  }
  return normalized;
}

function validTimezone(value) {
  const zone = text(value) || 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone }).format(new Date());
    return zone;
  } catch {
    throw httpError('scheduledTimezone must be a valid IANA timezone.', 400, 'INVALID_TIMEZONE');
  }
}

function isoFuture(value, now = () => new Date()) {
  const date = new Date(value || '');
  if (Number.isNaN(date.getTime())) throw httpError('nextRunAt must be a valid date/time.', 400, 'INVALID_SCHEDULE_TIME');
  if (date.getTime() < now().getTime() - 30_000) throw httpError('nextRunAt cannot be in the past.', 400, 'SCHEDULE_IN_PAST');
  return date.toISOString();
}

function localTime(value) {
  const normalized = text(value || '00:00:00');
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(normalized)) {
    throw httpError('scheduledLocalTime must use HH:MM or HH:MM:SS.', 400, 'INVALID_LOCAL_TIME');
  }
  return normalized.length === 5 ? `${normalized}:00` : normalized;
}

function zonedParts(date, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hour12: false,
    hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const map = Object.fromEntries(formatter.formatToParts(date)
    .filter((part) => part.type !== 'literal')
    .map((part) => [part.type, Number(part.value)]));
  return {
    year: map.year,
    month: map.month,
    day: map.day,
    hour: map.hour,
    minute: map.minute,
    second: map.second,
  };
}

function zoneOffsetMs(date, timeZone) {
  const parts = zonedParts(date, timeZone);
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - date.getTime();
}

export function zonedLocalToIso(value, timeZoneInput, now = () => new Date()) {
  const normalized = text(value);
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/);
  if (!match) throw httpError('scheduledLocalDateTime must use YYYY-MM-DDTHH:MM.', 400, 'INVALID_LOCAL_DATETIME');
  const timeZone = validTimezone(timeZoneInput);
  const desired = {
    year: Number(match[1]), month: Number(match[2]), day: Number(match[3]),
    hour: Number(match[4]), minute: Number(match[5]), second: Number(match[6] || 0),
  };
  const desiredAsUtc = Date.UTC(desired.year, desired.month - 1, desired.day, desired.hour, desired.minute, desired.second);
  let candidate = desiredAsUtc;
  for (let i = 0; i < 4; i += 1) {
    candidate = desiredAsUtc - zoneOffsetMs(new Date(candidate), timeZone);
  }
  const date = new Date(candidate);
  const roundTrip = zonedParts(date, timeZone);
  const same = Object.keys(desired).every((key) => desired[key] === roundTrip[key]);
  if (!same) {
    throw httpError('That local schedule time does not exist in the selected timezone, likely because of a daylight-saving transition.', 400, 'NONEXISTENT_LOCAL_TIME');
  }
  if (date.getTime() < now().getTime() - 30_000) throw httpError('Scheduled local date/time cannot be in the past.', 400, 'SCHEDULE_IN_PAST');
  return date.toISOString();
}

function sanitize(row) {
  if (!row) return null;
  return Object.freeze({
    id: text(row.id),
    guildId: text(row.guild_id),
    runType: text(row.run_type),
    planId: text(row.plan_id),
    name: text(row.name),
    status: text(row.status),
    recurrenceKind: text(row.recurrence_kind),
    scheduledTimezone: text(row.scheduled_timezone),
    scheduledLocalTime: text(row.scheduled_local_time),
    scheduledWeekday: row.scheduled_weekday == null ? null : Number(row.scheduled_weekday),
    nextRunAt: text(row.next_run_at),
    lastRunAt: text(row.last_run_at),
    destinationId: text(row.destination_id),
    includeMentions: row.include_mentions === true,
    sendDms: row.send_dms === true,
    autoPublish: row.auto_publish !== false,
    stage: text(row.stage),
    syncJobId: text(row.sync_job_id),
    lastAssignmentRunId: text(row.last_assignment_run_id),
    attemptCount: Number(row.attempt_count || 0),
    maxAttempts: Number(row.max_attempts || 3),
    lastError: text(row.last_error),
    metadata: row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata) ? row.metadata : {},
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
  });
}

export function createGuildOperationScheduleService(options = {}) {
  const store = options.store || supabaseCoreStore;
  const operations = options.operations || guildOperationsService;
  const now = typeof options.now === 'function' ? options.now : () => new Date();

  async function selectOne(table, query) {
    return first(await store.select(table, { ...query, limit: 1 }));
  }

  async function validatePlan(context, runType, planId) {
    if (runType === 'tb') {
      await operations.getTbPlanDetail(context.userId, context.code, planId);
      return;
    }
    const workspace = await operations.getWorkspace(context.userId, context.code);
    if (!workspace.twPlans.some((plan) => plan.id === planId)) {
      throw httpError('TW defense plan was not found in this Guild.', 404, 'TW_PLAN_NOT_FOUND');
    }
  }

  async function validateDestination(context, destinationId) {
    if (!destinationId) return;
    const destination = await selectOne('guild_discord_destinations', {
      select: 'id,guild_id,verified', id: `eq.${destinationId}`, guild_id: `eq.${context.guild.id}`, verified: 'eq.true',
    });
    if (!destination) throw httpError('Scheduled Discord destination must be verified for this Guild.', 409, 'VERIFIED_DESTINATION_REQUIRED');
  }

  async function list(userId, allyCode) {
    const context = await operations.requireOfficer(userId, allyCode);
    const schedules = await store.select('guild_operation_schedules', {
      select: '*', guild_id: `eq.${context.guild.id}`, order: 'next_run_at.asc', limit: 100,
    });
    return Object.freeze({ source: 'durable-guild-operation-schedules', schedules: Object.freeze(rows(schedules).map(sanitize)) });
  }

  async function save(userId, allyCode, input = {}) {
    const context = await operations.requireOfficer(userId, allyCode);
    const id = text(input.id) ? uuid(input.id, 'Schedule ID') : '';
    const before = id ? await selectOne('guild_operation_schedules', { select: '*', id: `eq.${id}`, guild_id: `eq.${context.guild.id}` }) : null;
    if (id && !before) throw httpError('Scheduled Guild Operation was not found.', 404, 'SCHEDULE_NOT_FOUND');

    const runType = ['tb','tw'].includes(text(input.runType)) ? text(input.runType) : text(before?.run_type || '');
    if (!runType) throw httpError('runType must be tb or tw.', 400, 'INVALID_RUN_TYPE');
    const planId = uuid(input.planId || before?.plan_id, 'Plan ID');
    await validatePlan(context, runType, planId);

    const destinationId = text(input.destinationId ?? before?.destination_id);
    if (destinationId) await validateDestination(context, uuid(destinationId, 'Destination ID'));
    const recurrenceKind = ['once','daily','weekly'].includes(text(input.recurrenceKind))
      ? text(input.recurrenceKind) : text(before?.recurrence_kind || 'once');
    const timezone = validTimezone(input.scheduledTimezone || before?.scheduled_timezone || 'UTC');
    const localDateTimeInput = text(input.scheduledLocalDateTime);
    const scheduledClock = localDateTimeInput
      ? localTime(localDateTimeInput.split('T')[1])
      : localTime(input.scheduledLocalTime || before?.scheduled_local_time || '00:00:00');
    const runAt = localDateTimeInput
      ? zonedLocalToIso(localDateTimeInput, timezone, now)
      : isoFuture(input.nextRunAt || before?.next_run_at, now);
    const weekday = input.scheduledWeekday == null || input.scheduledWeekday === ''
      ? (before?.scheduled_weekday ?? null) : Number(input.scheduledWeekday);
    if (weekday != null && (!Number.isInteger(weekday) || weekday < 0 || weekday > 6)) {
      throw httpError('scheduledWeekday must be 0 through 6.', 400, 'INVALID_WEEKDAY');
    }

    const payload = {
      guild_id: context.guild.id,
      created_by_user_id: before?.created_by_user_id || context.userId,
      requested_by_player_id: before?.requested_by_player_id || context.membership.player_id,
      lookup_ally_code: context.code,
      run_type: runType,
      plan_id: planId,
      name: text(input.name || before?.name || `${runType.toUpperCase()} Scheduled Assignment`).slice(0, 160),
      status: ['active','paused'].includes(text(input.status)) ? text(input.status) : text(before?.status || 'active'),
      recurrence_kind: recurrenceKind,
      scheduled_timezone: timezone,
      scheduled_local_time: scheduledClock,
      scheduled_weekday: recurrenceKind === 'weekly' ? weekday : null,
      next_run_at: runAt,
      destination_id: destinationId ? uuid(destinationId, 'Destination ID') : null,
      include_mentions: input.includeMentions === true,
      send_dms: input.sendDms === true,
      auto_publish: input.autoPublish !== false,
      stage: 'idle',
      sync_job_id: null,
      locked_at: null,
      locked_by: null,
      last_error: null,
      max_attempts: Math.max(1, Math.min(10, Math.trunc(Number(input.maxAttempts || before?.max_attempts || 3)))),
      metadata: input.metadata && typeof input.metadata === 'object' && !Array.isArray(input.metadata) ? input.metadata : (before?.metadata || {}),
      updated_at: now().toISOString(),
      ...(id ? { id } : {}),
    };
    const saved = id
      ? first(await store.update('guild_operation_schedules', { id: `eq.${id}`, guild_id: `eq.${context.guild.id}` }, payload))
      : first(await store.insert('guild_operation_schedules', [payload]));
    if (!saved?.id) throw httpError('Scheduled Guild Operation could not be persisted.', 502, 'SCHEDULE_WRITE_FAILED');
    return sanitize(saved);
  }

  async function setStatus(userId, allyCode, scheduleId, statusInput, nextRunAt = '') {
    const context = await operations.requireOfficer(userId, allyCode);
    const id = uuid(scheduleId, 'Schedule ID');
    const before = await selectOne('guild_operation_schedules', { select: '*', id: `eq.${id}`, guild_id: `eq.${context.guild.id}` });
    if (!before) throw httpError('Scheduled Guild Operation was not found.', 404, 'SCHEDULE_NOT_FOUND');
    const status = text(statusInput);
    if (!['active','paused'].includes(status)) throw httpError('Schedule status must be active or paused.', 400, 'INVALID_SCHEDULE_STATUS');
    const patch = {
      status,
      stage: status === 'active' ? 'idle' : before.stage,
      locked_at: null,
      locked_by: null,
      updated_at: now().toISOString(),
      ...(nextRunAt ? { next_run_at: isoFuture(nextRunAt, now) } : {}),
    };
    return sanitize(first(await store.update('guild_operation_schedules', { id: `eq.${id}`, guild_id: `eq.${context.guild.id}` }, patch)));
  }

  async function remove(userId, allyCode, scheduleId) {
    const context = await operations.requireOfficer(userId, allyCode);
    const id = uuid(scheduleId, 'Schedule ID');
    const before = await selectOne('guild_operation_schedules', { select: 'id,status,stage', id: `eq.${id}`, guild_id: `eq.${context.guild.id}` });
    if (!before) throw httpError('Scheduled Guild Operation was not found.', 404, 'SCHEDULE_NOT_FOUND');
    if (['syncing','planning','publishing'].includes(text(before.stage))) {
      throw httpError('A schedule already executing cannot be deleted. Pause it after the current attempt finishes.', 409, 'SCHEDULE_IN_FLIGHT');
    }
    await store.delete('guild_operation_schedules', { id: `eq.${id}`, guild_id: `eq.${context.guild.id}` });
    return Object.freeze({ id, deleted: true });
  }

  return Object.freeze({ list, save, setStatus, remove });
}

export const guildOperationScheduleService = createGuildOperationScheduleService();
