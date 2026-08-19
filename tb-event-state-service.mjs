import { createHash } from 'node:crypto';
import { canonicalRosterService } from './canonical-roster-service.mjs';
import { guildOperationsService } from './guild-operations-service.mjs';
import { supabaseCoreStore } from './supabase-core-store.mjs';
import { ROTE_PLANETS } from './public/rote-map-data.js';
import { buildTbMemberTasks, todayTaskSummary } from './tb-member-action-service.mjs';

const array = (value) => Array.isArray(value) ? value : [];
const text = (value) => String(value ?? '').trim();
const first = (value) => array(value)[0] || null;
const object = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const allyCode = (value) => { const code = text(value).replace(/\D/g, ''); return /^\d{9}$/.test(code) ? code : ''; };
const uuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text(value)) ? text(value).toLowerCase() : '';
const iso = (value) => { const parsed = Date.parse(text(value)); return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null; };

function httpError(message, status, code) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function cleanPhase(value) {
  const phase = text(value).toUpperCase();
  return /^P[1-6]$/.test(phase) ? phase : '';
}

function cleanStatus(value, fallback = 'active') {
  const status = text(value).toLowerCase();
  return ['planned','active','completed','archived'].includes(status) ? status : fallback;
}

function cleanCommand(value, fallback = 'attack') {
  const command = text(value).toLowerCase();
  return ['attack','preload','hold','deploy','stop'].includes(command) ? command : fallback;
}

function bounded(value, max = 500) {
  return text(value).slice(0, max);
}

function fingerprint(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function memberMatchesAssignment(assignment = {}, player = {}) {
  const member = object(assignment.member);
  const assignmentPlayerId = text(member.playerId || member.player_id || assignment.playerId || assignment.player_id);
  const assignmentAlly = allyCode(member.allyCode || member.ally_code || assignment.allyCode || assignment.ally_code);
  const dbId = text(player.id);
  const gameId = text(player.swgoh_player_id);
  const code = allyCode(player.ally_code);
  return Boolean(
    (assignmentPlayerId && [dbId, gameId].includes(assignmentPlayerId))
    || (assignmentAlly && code && assignmentAlly === code)
  );
}

function sanitizeOperationAssignment(row = {}) {
  return Object.freeze({
    phase: cleanPhase(row.phase),
    slotId: text(row.slotId || row.slot_id),
    operationId: text(row.squadId || row.conflictId || row.operationId || row.operation_id),
    planetId: text(row.planetId || row.planet_id || row.territoryId || row.territory_id),
    baseId: text(row.baseId || row.base_id).toUpperCase(),
    unitName: text(row.name || row.unitName || row.unit_name || row.baseId || row.base_id),
    locked: row.locked === true,
    help: row?.safety?.help === true,
    preference: text(row?.safety?.preference),
  });
}

function sanitizeEvent(row = {}) {
  if (!row?.id) return null;
  return Object.freeze({
    id: text(row.id),
    guildId: text(row.guild_id),
    tbKey: text(row.tb_key),
    startedAt: text(row.started_at),
    endsAt: text(row.ends_at),
    currentPhase: cleanPhase(row.current_phase),
    phaseEndsAt: text(row.phase_ends_at),
    status: text(row.status),
    strategyPlanId: text(row.strategy_plan_id),
    sourceKind: text(row.source_kind),
    sourceFetchedAt: text(row.source_fetched_at),
    metadata: object(row.metadata),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
  });
}

function sanitizeZone(row = {}) {
  return Object.freeze({
    id: text(row.id),
    eventId: text(row.event_id),
    phase: cleanPhase(row.phase),
    planetId: text(row.planet_id),
    currentTp: Number(row.current_tp || 0),
    currentStars: Number(row.current_stars || 0),
    deploymentTp: Number(row.deployment_tp || 0),
    combatTp: Number(row.combat_tp || 0),
    operationTp: Number(row.operation_tp || 0),
    targetStars: Number(row.target_stars || 0),
    commandState: cleanCommand(row.command_state),
    commandMessage: text(row.command_message),
    lockedByOfficer: row.locked_by_officer === true,
    sourceKind: text(row.source_kind),
    observedAt: text(row.observed_at),
    updatedAt: text(row.updated_at),
  });
}

function sanitizeAction(row = {}) {
  return Object.freeze({
    id: text(row.id),
    actionKey: text(row.action_key),
    actionType: text(row.action_type),
    phase: cleanPhase(row.phase),
    planetId: text(row.planet_id),
    missionId: text(row.mission_id),
    operationSlotId: text(row.operation_slot_id),
    priority: Number(row.priority || 0),
    status: text(row.status),
    recommendedTeamId: text(row.recommended_team_id),
    deploymentTargetTp: row.deployment_target_tp == null ? null : Number(row.deployment_target_tp),
    explanation: text(row.explanation),
    generatedFromFingerprint: text(row.generated_from_fingerprint),
    payload: object(row.payload),
    completedAt: text(row.completed_at),
    updatedAt: text(row.updated_at),
  });
}

export function createTbEventStateService(options = {}) {
  const store = options.store || supabaseCoreStore;
  const canonical = options.canonical || canonicalRosterService;
  const operations = options.operations || guildOperationsService;
  const now = typeof options.now === 'function' ? options.now : () => new Date();

  async function verifiedIdentity(userId) {
    const links = array(await store.select('user_player_links', {
      select: 'player_id,is_primary,verification_status,verified_at',
      user_id: `eq.${userId}`,
      verification_status: 'eq.verified',
      order: 'is_primary.desc,verified_at.desc',
      limit: 10,
    }));
    const link = links.find((row) => row.is_primary === true) || links[0];
    if (!link?.player_id) throw httpError('A verified SWGOH player is required for Territory Battle Command Center.', 403, 'VERIFIED_PLAYER_REQUIRED');
    const player = first(await store.select('players', {
      select: 'id,ally_code,swgoh_player_id,name,current_guild_id,last_synced_at',
      id: `eq.${link.player_id}`,
      limit: 1,
    }));
    if (!player?.id || !allyCode(player.ally_code)) throw httpError('Verified SWGOH player identity is unavailable.', 404, 'VERIFIED_PLAYER_NOT_FOUND');
    if (!player.current_guild_id) throw httpError('Your verified player is not currently attached to a Guild.', 409, 'ACTIVE_GUILD_REQUIRED');
    const membership = first(await store.select('guild_user_memberships', {
      select: 'guild_id,user_id,player_id,role,status,joined_at,updated_at',
      guild_id: `eq.${player.current_guild_id}`,
      user_id: `eq.${userId}`,
      status: 'eq.active',
      limit: 1,
    }));
    if (!membership) throw httpError('Current verified Guild membership is required.', 403, 'ACTIVE_GUILD_MEMBERSHIP_REQUIRED');
    return Object.freeze({ userId, player: Object.freeze(player), membership: Object.freeze(membership), guildId: text(player.current_guild_id), allyCode: allyCode(player.ally_code) });
  }

  async function activeEvent(identity) {
    return first(await store.select('guild_tb_events', {
      select: '*',
      guild_id: `eq.${identity.guildId}`,
      tb_key: 'eq.rote',
      status: 'eq.active',
      order: 'updated_at.desc',
      limit: 1,
    }));
  }

  async function eventZones(eventId, phase = '') {
    const eventUuid = uuid(eventId);
    if (!eventUuid) return [];
    return array(await store.select('guild_tb_zone_states', {
      select: '*',
      event_id: `eq.${eventUuid}`,
      ...(phase ? { phase: `eq.${phase}` } : {}),
      order: 'phase.asc,planet_id.asc',
      limit: 100,
    }));
  }

  async function eventSnapshot(userId) {
    const identity = await verifiedIdentity(userId);
    const rawEvent = await activeEvent(identity);
    if (!rawEvent) {
      return Object.freeze({
        configured: false,
        source: 'tb-event-state-v1',
        identity: Object.freeze({ allyCode: identity.allyCode, playerName: text(identity.player.name), guildId: identity.guildId }),
        event: null,
        zones: Object.freeze([]),
        evidenceBoundary: 'No active durable TB event is configured. Static ROTE map/reference data is not being presented as live event state.',
      });
    }
    const phase = cleanPhase(rawEvent.current_phase);
    const zones = (await eventZones(rawEvent.id, phase)).map(sanitizeZone);
    return Object.freeze({
      configured: true,
      source: 'tb-event-state-v1',
      identity: Object.freeze({ allyCode: identity.allyCode, playerName: text(identity.player.name), guildId: identity.guildId }),
      event: sanitizeEvent(rawEvent),
      zones: Object.freeze(zones),
      evidenceBoundary: rawEvent.source_kind === 'canonical'
        ? 'Event state is marked canonical by the event-state source.'
        : 'Event state is officer-entered Command Center state. It is not inferred from static map/reference data.',
    });
  }

  async function latestPublishedOperationAssignments(identity) {
    const runs = array(await store.select('guild_tb_assignment_runs', {
      select: 'id,status,assignments,created_at,published_at',
      guild_id: `eq.${identity.guildId}`,
      order: 'created_at.desc',
      limit: 10,
    }));
    const run = runs.find((row) => text(row.published_at)) || null;
    if (!run) return Object.freeze({ runId: '', publishedAt: '', assignments: Object.freeze([]) });
    const assignments = array(run.assignments)
      .filter((row) => memberMatchesAssignment(row, identity.player))
      .map(sanitizeOperationAssignment);
    return Object.freeze({ runId: text(run.id), publishedAt: text(run.published_at), assignments: Object.freeze(assignments) });
  }

  async function existingActions(identity, event, phase) {
    return array(await store.select('guild_tb_member_actions', {
      select: '*',
      event_id: `eq.${event.id}`,
      phase: `eq.${phase}`,
      player_id: `eq.${identity.player.id}`,
      order: 'priority.asc,created_at.asc',
      limit: 250,
    }));
  }

  async function generateToday(identity, event, zones) {
    const [rosterBody, operationsSnapshot] = await Promise.all([
      canonical.getPlayerRoster(identity.allyCode),
      latestPublishedOperationAssignments(identity),
    ]);
    const phase = cleanPhase(event.current_phase || event.currentPhase);
    const tasks = buildTbMemberTasks({
      event,
      zones,
      rosterBody,
      operationAssignments: operationsSnapshot.assignments,
    });
    const inputFingerprint = fingerprint({
      eventId: text(event.id),
      eventUpdatedAt: text(event.updated_at || event.updatedAt),
      phase,
      zones: zones.map((zone) => ({ planet: zone.planet_id || zone.planetId, command: zone.command_state || zone.commandState, updatedAt: zone.updated_at || zone.updatedAt })),
      rosterSyncedAt: text(rosterBody?.lastSyncedAt || rosterBody?.player?.lastSyncedAt || identity.player.last_synced_at),
      operationRunId: operationsSnapshot.runId,
      operationPublishedAt: operationsSnapshot.publishedAt,
    });
    return Object.freeze({ rosterBody, operationsSnapshot, phase, tasks, inputFingerprint });
  }

  async function today(userId, { persist = false } = {}) {
    const identity = await verifiedIdentity(userId);
    const rawEvent = await activeEvent(identity);
    if (!rawEvent) {
      return Object.freeze({
        configured: false,
        source: 'tb-today-v1',
        identity: Object.freeze({ allyCode: identity.allyCode, playerName: text(identity.player.name), guildId: identity.guildId }),
        event: null,
        zones: Object.freeze([]),
        tasks: Object.freeze([]),
        summary: todayTaskSummary([]),
        durable: false,
        evidenceBoundary: 'No active TB event is configured. No live task queue is inferred from ROTE reference data.',
      });
    }
    const phase = cleanPhase(rawEvent.current_phase);
    const rawZones = await eventZones(rawEvent.id, phase);
    const generated = await generateToday(identity, rawEvent, rawZones);
    let durableRows = [];
    if (persist) {
      const prior = await existingActions(identity, rawEvent, phase);
      const priorByKey = new Map(prior.map((row) => [text(row.action_key), row]));
      const taskKeys = new Set(generated.tasks.map((task) => task.actionKey));
      const staleIds = prior.filter((row) => row.source_kind === 'generated' && !taskKeys.has(text(row.action_key))).map((row) => text(row.id)).filter(uuid);
      if (staleIds.length) await store.delete('guild_tb_member_actions', { id: `in.(${staleIds.join(',')})` });
      const timestamp = now().toISOString();
      const rows = generated.tasks.map((task) => {
        const previous = priorByKey.get(task.actionKey);
        const preserved = ['acknowledged','completed','skipped'].includes(text(previous?.status)) ? text(previous.status) : 'pending';
        return {
          event_id: rawEvent.id,
          phase,
          player_id: identity.player.id,
          ally_code: identity.allyCode,
          action_key: task.actionKey,
          action_type: task.actionType,
          planet_id: task.planetId || null,
          mission_id: task.missionId || null,
          operation_slot_id: task.operationSlotId || null,
          priority: Number(task.priority || 100),
          status: preserved,
          recommended_team_id: task.recommendedTeamId || null,
          deployment_target_tp: task.deploymentTargetTp,
          explanation: bounded(task.explanation, 2000),
          generated_from_fingerprint: generated.inputFingerprint,
          source_kind: 'generated',
          payload: { ...object(task.payload), title: text(task.title), order: Number(task.order || 0) },
          completed_at: preserved === 'completed' ? previous?.completed_at || timestamp : null,
          updated_at: timestamp,
        };
      });
      durableRows = rows.length ? array(await store.upsert('guild_tb_member_actions', rows, { onConflict: 'event_id,phase,player_id,action_key' })) : [];
    } else {
      durableRows = await existingActions(identity, rawEvent, phase);
    }

    const durableByKey = new Map(durableRows.map((row) => [text(row.action_key), row]));
    const tasks = generated.tasks.map((task) => {
      const durable = durableByKey.get(task.actionKey);
      return Object.freeze({
        ...task,
        status: text(durable?.status) || 'pending',
        durableId: text(durable?.id),
        generatedFromFingerprint: generated.inputFingerprint,
      });
    });
    return Object.freeze({
      configured: true,
      source: 'tb-today-v1',
      identity: Object.freeze({ allyCode: identity.allyCode, playerName: text(identity.player.name), guildId: identity.guildId }),
      event: sanitizeEvent(rawEvent),
      zones: Object.freeze(rawZones.map(sanitizeZone)),
      operations: generated.operationsSnapshot,
      tasks: Object.freeze(tasks),
      summary: todayTaskSummary(tasks),
      durable: persist || durableRows.length > 0,
      inputFingerprint: generated.inputFingerprint,
      evidenceBoundary: 'Tasks are generated from the durable officer/canonical event state, the current verified roster, and the latest published Operations run. Completion is not inferred from the game unless explicitly reported or sourced.',
    });
  }

  async function saveEvent(userId, input = {}) {
    const identity = await verifiedIdentity(userId);
    const context = await operations.requireOfficer(userId, identity.allyCode);
    const eventId = uuid(input.id);
    const before = eventId ? first(await store.select('guild_tb_events', { select: '*', id: `eq.${eventId}`, guild_id: `eq.${context.guild.id}`, limit: 1 })) : null;
    if (eventId && !before) throw httpError('TB event was not found in this Guild.', 404, 'TB_EVENT_NOT_FOUND');
    const status = cleanStatus(input.status, text(before?.status) || 'active');
    const phase = cleanPhase(input.currentPhase || input.current_phase || before?.current_phase || 'P1');
    if (!phase) throw httpError('TB current phase must be P1 through P6.', 400, 'INVALID_TB_PHASE');
    const timestamp = now().toISOString();
    if (status === 'active') {
      await store.update('guild_tb_events', {
        guild_id: `eq.${context.guild.id}`,
        tb_key: 'eq.rote',
        status: 'eq.active',
        ...(eventId ? { id: `neq.${eventId}` } : {}),
      }, { status: 'archived', updated_at: timestamp }, { returning: false });
    }
    const payload = {
      guild_id: context.guild.id,
      tb_key: 'rote',
      started_at: iso(input.startedAt || input.started_at || before?.started_at),
      ends_at: iso(input.endsAt || input.ends_at || before?.ends_at),
      current_phase: phase,
      phase_ends_at: iso(input.phaseEndsAt || input.phase_ends_at || before?.phase_ends_at),
      status,
      strategy_plan_id: uuid(input.strategyPlanId || input.strategy_plan_id || before?.strategy_plan_id) || null,
      source_kind: 'officer',
      source_fetched_at: timestamp,
      created_by_user_id: before?.created_by_user_id || context.userId,
      metadata: { ...object(before?.metadata), ...object(input.metadata) },
      updated_at: timestamp,
    };
    const row = before
      ? first(await store.update('guild_tb_events', { id: `eq.${before.id}`, guild_id: `eq.${context.guild.id}` }, payload))
      : first(await store.insert('guild_tb_events', [payload]));
    if (!row?.id) throw httpError('TB event state could not be saved.', 502, 'TB_EVENT_WRITE_FAILED');
    return Object.freeze({ event: sanitizeEvent(row), evidenceBoundary: 'This event was explicitly saved by a verified Guild officer and is labeled officer-entered state.' });
  }

  async function saveZoneState(userId, input = {}) {
    const identity = await verifiedIdentity(userId);
    const context = await operations.requireOfficer(userId, identity.allyCode);
    const eventId = uuid(input.eventId || input.event_id);
    const event = eventId
      ? first(await store.select('guild_tb_events', { select: '*', id: `eq.${eventId}`, guild_id: `eq.${context.guild.id}`, limit: 1 }))
      : await activeEvent(identity);
    if (!event?.id) throw httpError('An active or specified TB event is required before saving zone state.', 409, 'TB_EVENT_REQUIRED');
    const phase = cleanPhase(input.phase || event.current_phase);
    if (!phase) throw httpError('TB zone phase must be P1 through P6.', 400, 'INVALID_TB_PHASE');
    const planetId = text(input.planetId || input.planet_id);
    const planet = ROTE_PLANETS.find((row) => row.id === planetId);
    if (!planet) throw httpError('Unknown ROTE planet ID.', 400, 'INVALID_TB_PLANET');
    const commandState = cleanCommand(input.commandState || input.command_state, 'attack');
    const timestamp = now().toISOString();
    const numeric = (value, fallback = 0) => Number.isFinite(Number(value)) ? Math.max(0, Math.trunc(Number(value))) : fallback;
    const stars = (value, fallback = 0) => Math.min(3, numeric(value, fallback));
    const row = first(await store.upsert('guild_tb_zone_states', [{
      event_id: event.id,
      phase,
      planet_id: planetId,
      current_tp: numeric(input.currentTp ?? input.current_tp),
      current_stars: stars(input.currentStars ?? input.current_stars),
      deployment_tp: numeric(input.deploymentTp ?? input.deployment_tp),
      combat_tp: numeric(input.combatTp ?? input.combat_tp),
      operation_tp: numeric(input.operationTp ?? input.operation_tp),
      target_stars: stars(input.targetStars ?? input.target_stars),
      command_state: commandState,
      command_message: bounded(input.commandMessage || input.command_message, 800),
      locked_by_officer: input.lockedByOfficer === true || input.locked_by_officer === true,
      source_kind: 'officer',
      observed_at: iso(input.observedAt || input.observed_at) || timestamp,
      updated_by_user_id: context.userId,
      metadata: object(input.metadata),
      updated_at: timestamp,
    }], { onConflict: 'event_id,phase,planet_id' }));
    if (!row?.id) throw httpError('TB zone state could not be saved.', 502, 'TB_ZONE_WRITE_FAILED');
    return Object.freeze({ zone: sanitizeZone(row), planet: Object.freeze({ id: planet.id, name: planet.name, phase: planet.phase }), evidenceBoundary: 'This zone state is officer-entered until a canonical live-event source supersedes it.' });
  }

  async function setActionStatus(userId, actionIdInput, statusInput) {
    const identity = await verifiedIdentity(userId);
    const actionId = uuid(actionIdInput);
    if (!actionId) throw httpError('A valid TB member action ID is required.', 400, 'INVALID_TB_ACTION_ID');
    const status = text(statusInput).toLowerCase();
    if (!['pending','acknowledged','completed','skipped'].includes(status)) throw httpError('Unsupported TB action status.', 400, 'INVALID_TB_ACTION_STATUS');
    const row = first(await store.select('guild_tb_member_actions', {
      select: '*',
      id: `eq.${actionId}`,
      player_id: `eq.${identity.player.id}`,
      ally_code: `eq.${identity.allyCode}`,
      limit: 1,
    }));
    if (!row) throw httpError('That TB action does not belong to your verified player.', 404, 'TB_ACTION_NOT_FOUND');
    const timestamp = now().toISOString();
    const saved = first(await store.update('guild_tb_member_actions', { id: `eq.${actionId}`, player_id: `eq.${identity.player.id}` }, {
      status,
      completed_at: status === 'completed' ? timestamp : null,
      updated_at: timestamp,
    }));
    return sanitizeAction(saved || { ...row, status, completed_at: status === 'completed' ? timestamp : null, updated_at: timestamp });
  }

  return Object.freeze({
    verifiedIdentity,
    eventSnapshot,
    today,
    refreshToday: (userId) => today(userId, { persist: true }),
    saveEvent,
    saveZoneState,
    setActionStatus,
  });
}

export const tbEventStateService = createTbEventStateService();
