import { createHash } from 'node:crypto';
import { normalizeTbMissionAttempt, TB_ATTEMPT_OUTCOME } from './public/tb-mission-attempt-evidence.js';
import { supabaseCoreStore } from './supabase-core-store.mjs';

const array = (value) => Array.isArray(value) ? value : [];
const text = (value) => String(value ?? '').trim();
const first = (value) => array(value)[0] || null;
const object = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const uuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text(value)) ? text(value).toLowerCase() : '';
const allyCode = (value) => { const code = text(value).replace(/\D/g, ''); return /^\d{9}$/.test(code) ? code : ''; };
const phase = (value) => { const normalized = text(value).toUpperCase(); return /^P[1-6]$/.test(normalized) ? normalized : ''; };
const iso = (value) => { const parsed = Date.parse(text(value)); return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null; };

function httpError(message, status, code) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function hash(value) {
  return createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
}

function bounded(value, max = 240) {
  return text(value).slice(0, max);
}

function reportSource(value) {
  const source = text(value || 'member_web').toLowerCase();
  return ['member_web','officer_web','discord','import','system','unknown'].includes(source) ? source : 'member_web';
}

function logicalAttemptId(input = {}) {
  const id = text(input.id || input.attemptId || input.sourceRef);
  if (!id || id.length > 200) throw httpError('A stable attempt ID is required so retries cannot create duplicate evidence.', 400, 'TB_ATTEMPT_ID_REQUIRED');
  return id;
}

function sanitizeRow(row = {}) {
  const normalized = normalizeTbMissionAttempt({
    id: row.id,
    guildId: row.guild_id,
    eventId: row.event_id,
    phase: row.phase,
    planetId: row.planet_id,
    missionId: row.mission_id,
    playerId: row.player_id,
    allyCode: row.ally_code,
    team: row.team_snapshot,
    squadSignature: row.squad_signature,
    result: row.outcome,
    wavesCompleted: row.waves_completed,
    wavesTotal: row.waves_total,
    strategicAbilitySnapshot: row.strategic_ability_snapshot,
    operationStateSnapshot: row.operation_state_snapshot,
    source: row.report_source,
    reportedAt: row.reported_at,
  });
  return Object.freeze({
    ...normalized,
    attemptKey: text(row.attempt_key),
    evidenceFingerprint: text(row.evidence_fingerprint),
    logicalAttemptId: text(row?.metadata?.logicalAttemptId || row.source_ref),
    sourceRef: text(row.source_ref),
    reportedByUserId: text(row.reported_by_user_id),
    recordedAt: text(row.created_at),
    metadata: Object.freeze({ ...object(row.metadata) }),
  });
}

export function createTbMissionAttemptHistoryService(options = {}) {
  const store = options.store || supabaseCoreStore;
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
    if (!link?.player_id) throw httpError('A verified SWGOH player is required to record Territory Battle evidence.', 403, 'VERIFIED_PLAYER_REQUIRED');

    const player = first(await store.select('players', {
      select: 'id,ally_code,swgoh_player_id,name,current_guild_id',
      id: `eq.${link.player_id}`,
      limit: 1,
    }));
    if (!player?.id || !allyCode(player.ally_code)) throw httpError('Verified SWGOH player identity is unavailable.', 404, 'VERIFIED_PLAYER_NOT_FOUND');
    if (!player.current_guild_id) throw httpError('Your verified player is not currently attached to a Guild.', 409, 'ACTIVE_GUILD_REQUIRED');

    const membership = first(await store.select('guild_user_memberships', {
      select: 'guild_id,user_id,player_id,role,status',
      guild_id: `eq.${player.current_guild_id}`,
      user_id: `eq.${userId}`,
      player_id: `eq.${player.id}`,
      status: 'eq.active',
      limit: 1,
    }));
    if (!membership) throw httpError('Current verified Guild membership is required.', 403, 'ACTIVE_GUILD_MEMBERSHIP_REQUIRED');

    return Object.freeze({
      userId: text(userId),
      guildId: text(player.current_guild_id),
      allyCode: allyCode(player.ally_code),
      player: Object.freeze(player),
      membership: Object.freeze(membership),
    });
  }

  async function eventFor(identity, requestedEventId = '') {
    const requested = requestedEventId ? uuid(requestedEventId) : '';
    if (requestedEventId && !requested) throw httpError('The Territory Battle event ID is invalid.', 400, 'TB_EVENT_ID_INVALID');
    const query = {
      select: 'id,guild_id,tb_key,current_phase,status,started_at,ends_at,updated_at',
      guild_id: `eq.${identity.guildId}`,
      tb_key: 'eq.rote',
      ...(requested ? { id: `eq.${requested}` } : { status: 'eq.active' }),
      order: 'updated_at.desc',
      limit: 1,
    };
    const event = first(await store.select('guild_tb_events', query));
    if (!event?.id) throw httpError(requested ? 'That ROTE event does not belong to your current Guild.' : 'No active ROTE event is configured for your Guild.', 404, 'TB_EVENT_NOT_FOUND');
    return Object.freeze(event);
  }

  function prepare(identity, event, input = {}, optionsForRecord = {}) {
    const logicalId = logicalAttemptId(input);
    const normalizedPhase = phase(input.phase || event.current_phase);
    if (!normalizedPhase) throw httpError('A valid ROTE phase P1-P6 is required.', 400, 'TB_ATTEMPT_PHASE_INVALID');
    const planetId = text(input.planetId).toLowerCase();
    const missionId = text(input.missionId);
    if (!/^[a-z0-9-]{2,80}$/.test(planetId)) throw httpError('A canonical ROTE planet ID is required.', 400, 'TB_ATTEMPT_PLANET_INVALID');
    if (missionId.length < 2 || missionId.length > 160) throw httpError('A canonical ROTE mission ID is required.', 400, 'TB_ATTEMPT_MISSION_INVALID');
    const requestedAlly = allyCode(input.allyCode);
    if (requestedAlly && requestedAlly !== identity.allyCode) throw httpError('Member web attempt evidence may only be recorded for the signed-in verified player.', 403, 'TB_ATTEMPT_PLAYER_MISMATCH');

    const source = reportSource(optionsForRecord.reportSource || 'member_web');
    const reportedAt = iso(input.reportedAt) || now().toISOString();
    const normalized = normalizeTbMissionAttempt({
      ...input,
      id: logicalId,
      guildId: identity.guildId,
      eventId: event.id,
      phase: normalizedPhase,
      planetId,
      missionId,
      playerId: identity.player.id,
      allyCode: identity.allyCode,
      result: input.result ?? input.outcome,
      source,
      reportedAt,
    });

    const combatOutcome = [TB_ATTEMPT_OUTCOME.COMPLETE, TB_ATTEMPT_OUTCOME.PARTIAL, TB_ATTEMPT_OUTCOME.FAILED].includes(normalized.outcome);
    if (combatOutcome && (!normalized.team.length || !normalized.squadSignature)) {
      throw httpError('Completed, partial, and failed battle evidence requires the exact squad snapshot used.', 409, 'TB_ATTEMPT_SQUAD_REQUIRED');
    }

    const attemptKey = hash(['rote-attempt-v1', event.id, identity.player.id, normalizedPhase, missionId, logicalId].join('|'));
    const evidenceFingerprint = hash({
      eventId: event.id,
      phase: normalizedPhase,
      planetId,
      missionId,
      playerId: identity.player.id,
      allyCode: identity.allyCode,
      team: normalized.team,
      squadSignature: normalized.squadSignature,
      outcome: normalized.outcome,
      wavesCompleted: normalized.wavesCompleted,
      wavesTotal: normalized.wavesTotal,
      strategicAbilitySnapshot: normalized.strategicAbilitySnapshot,
      operationStateSnapshot: normalized.operationStateSnapshot,
      reportSource: source,
    });

    return Object.freeze({ normalized, logicalId, attemptKey, evidenceFingerprint, source, reportedAt });
  }

  async function existingByKey(attemptKey) {
    return first(await store.select('guild_tb_mission_attempts', {
      select: '*',
      attempt_key: `eq.${attemptKey}`,
      limit: 1,
    }));
  }

  function assertSameEvidence(existing, prepared) {
    if (!existing) return;
    if (text(existing.evidence_fingerprint) !== prepared.evidenceFingerprint) {
      throw httpError('This attempt ID already exists with different evidence. Create a new correction attempt instead of rewriting history.', 409, 'TB_ATTEMPT_EVIDENCE_CONFLICT');
    }
  }

  async function record(userId, input = {}, recordOptions = {}) {
    if (!store.status().configured) throw httpError('Command Center persistence is not configured.', 503, 'PERSISTENCE_NOT_CONFIGURED');
    const identity = await verifiedIdentity(userId);
    const event = await eventFor(identity, input.eventId);
    const prepared = prepare(identity, event, input, recordOptions);

    const existing = await existingByKey(prepared.attemptKey);
    if (existing) {
      assertSameEvidence(existing, prepared);
      return Object.freeze({ source: 'guild-tb-mission-attempts-v1', saved: true, alreadyRecorded: true, attempt: sanitizeRow(existing) });
    }

    const row = {
      attempt_key: prepared.attemptKey,
      evidence_fingerprint: prepared.evidenceFingerprint,
      event_id: event.id,
      guild_id: identity.guildId,
      phase: prepared.normalized.phase,
      planet_id: prepared.normalized.planetId,
      mission_id: prepared.normalized.missionId,
      player_id: identity.player.id,
      ally_code: identity.allyCode,
      squad_signature: prepared.normalized.squadSignature,
      team_snapshot: prepared.normalized.team,
      outcome: prepared.normalized.outcome,
      waves_completed: prepared.normalized.wavesCompleted,
      waves_total: prepared.normalized.wavesTotal,
      strategic_ability_snapshot: prepared.normalized.strategicAbilitySnapshot,
      operation_state_snapshot: prepared.normalized.operationStateSnapshot,
      report_source: prepared.source,
      source_ref: bounded(input.sourceRef || prepared.logicalId),
      reported_by_user_id: identity.userId,
      reported_at: prepared.reportedAt,
      metadata: {
        logicalAttemptId: prepared.logicalId,
        evidenceClass: 'GUILD_DATA',
        predictiveProbability: null,
        evidenceBoundary: 'Observed mission result evidence is descriptive and is not a predicted win probability.',
      },
    };

    try {
      const saved = first(await store.insert('guild_tb_mission_attempts', [row]));
      if (!saved?.id) throw httpError('The mission attempt evidence could not be persisted.', 502, 'TB_ATTEMPT_WRITE_FAILED');
      return Object.freeze({ source: 'guild-tb-mission-attempts-v1', saved: true, alreadyRecorded: false, attempt: sanitizeRow(saved) });
    } catch (error) {
      if (Number(error?.status) !== 409) throw error;
      const raced = await existingByKey(prepared.attemptKey);
      if (!raced) throw error;
      assertSameEvidence(raced, prepared);
      return Object.freeze({ source: 'guild-tb-mission-attempts-v1', saved: true, alreadyRecorded: true, attempt: sanitizeRow(raced) });
    }
  }

  async function list(userId, filters = {}) {
    if (!store.status().configured) throw httpError('Command Center persistence is not configured.', 503, 'PERSISTENCE_NOT_CONFIGURED');
    const identity = await verifiedIdentity(userId);
    let event = null;
    if (filters.eventId) event = await eventFor(identity, filters.eventId);
    const normalizedPhase = filters.phase ? phase(filters.phase) : '';
    if (filters.phase && !normalizedPhase) throw httpError('A valid ROTE phase P1-P6 is required.', 400, 'TB_ATTEMPT_PHASE_INVALID');
    const requestedAlly = filters.allyCode ? allyCode(filters.allyCode) : '';
    if (filters.allyCode && !requestedAlly) throw httpError('A valid 9-digit Ally Code is required.', 400, 'TB_ATTEMPT_ALLY_INVALID');
    const limit = Math.max(1, Math.min(500, Math.floor(Number(filters.limit) || 100)));
    const rows = array(await store.select('guild_tb_mission_attempts', {
      select: '*',
      guild_id: `eq.${identity.guildId}`,
      ...(event ? { event_id: `eq.${event.id}` } : {}),
      ...(normalizedPhase ? { phase: `eq.${normalizedPhase}` } : {}),
      ...(text(filters.planetId) ? { planet_id: `eq.${text(filters.planetId).toLowerCase()}` } : {}),
      ...(text(filters.missionId) ? { mission_id: `eq.${text(filters.missionId)}` } : {}),
      ...(requestedAlly ? { ally_code: `eq.${requestedAlly}` } : {}),
      order: 'reported_at.desc,created_at.desc',
      limit,
    }));
    return Object.freeze({
      source: 'guild-tb-mission-attempts-v1',
      guildId: identity.guildId,
      attempts: Object.freeze(rows.map(sanitizeRow)),
      evidenceBoundary: 'Recorded Guild mission attempts are observed evidence only. No predictive probability is produced by this service.',
    });
  }

  return Object.freeze({ record, list, verifiedIdentity, eventFor });
}

export const tbMissionAttemptHistoryService = createTbMissionAttemptHistoryService();

export { hash as tbMissionAttemptHash, logicalAttemptId, reportSource, sanitizeRow as sanitizeTbMissionAttemptRow };