import { tbEventStateService } from './tb-event-state-service.mjs';
import { guildOperationsService } from './guild-operations-service.mjs';
import { supabaseCoreStore } from './supabase-core-store.mjs';
import { ROTE_MISSIONS_BY_PLANET } from './public/rote-mission-data.js';

const array = (value) => Array.isArray(value) ? value : [];
const object = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const text = (value) => String(value ?? '').trim();
const first = (value) => array(value)[0] || null;
const uuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text(value)) ? text(value).toLowerCase() : '';

const RESULT_CODES = Object.freeze(['2/2','1/2','0/2','failed','skipped']);
const MISSIONS = Object.freeze(Object.values(ROTE_MISSIONS_BY_PLANET).flat());
const MISSION_BY_ID = new Map(MISSIONS.map((mission) => [text(mission.id), mission]));

function httpError(message, status, code, details = null) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  if (details) error.details = details;
  return error;
}

function cleanResult(value) {
  const result = text(value).toLowerCase();
  if (!RESULT_CODES.includes(result)) throw httpError('Mission result must be 2/2, 1/2, 0/2, FAILED, or SKIPPED.', 400, 'TB_ATTEMPT_RESULT_INVALID');
  return result;
}

function cleanNote(value, max = 1200) {
  return text(value).slice(0, max);
}

function cleanTeamSnapshot(value) {
  const raw = object(value);
  const members = array(raw.members).slice(0, 5).map((member) => Object.freeze({
    baseId: text(member?.baseId ?? member?.base_id).toUpperCase().slice(0, 80),
    name: text(member?.name).slice(0, 120),
    relic: Number.isFinite(Number(member?.relic)) ? Math.max(0, Math.min(15, Math.trunc(Number(member.relic)))) : null,
    gear: Number.isFinite(Number(member?.gear)) ? Math.max(0, Math.min(20, Math.trunc(Number(member.gear)))) : null,
    stars: Number.isFinite(Number(member?.stars)) ? Math.max(0, Math.min(7, Math.trunc(Number(member.stars)))) : null,
    speed: Number.isFinite(Number(member?.speed)) ? Math.max(0, Math.min(10000, Math.trunc(Number(member.speed)))) : null,
  })).filter((member) => member.baseId || member.name);
  return Object.freeze({
    squadName: text(raw.squadName ?? raw.squad_name).slice(0, 160),
    members: Object.freeze(members),
  });
}

function missionById(value) {
  return MISSION_BY_ID.get(text(value)) || null;
}

function phaseForMission(mission) {
  const value = Number(mission?.phase || 0);
  return value >= 1 && value <= 6 ? `P${value}` : '';
}

function sanitizeAttempt(row = {}, playerName = '') {
  return Object.freeze({
    id: text(row.id),
    eventId: text(row.event_id),
    phase: text(row.phase),
    planetId: text(row.planet_id),
    missionId: text(row.mission_id),
    playerId: text(row.player_id),
    allyCode: text(row.ally_code),
    playerName: text(playerName),
    resultCode: text(row.result_code),
    teamSnapshot: object(row.team_snapshot),
    note: text(row.note),
    sourceKind: text(row.source_kind),
    revision: Number(row.revision || 1),
    correctionReason: text(row.correction_reason),
    reportedAt: text(row.reported_at),
  });
}

function resultSummary(rows) {
  const counts = { '2/2': 0, '1/2': 0, '0/2': 0, failed: 0, skipped: 0 };
  for (const row of rows) if (Object.hasOwn(counts, text(row.result_code))) counts[text(row.result_code)] += 1;
  const attempts = counts['2/2'] + counts['1/2'] + counts['0/2'] + counts.failed;
  return Object.freeze({
    reports: rows.length,
    attempts,
    skipped: counts.skipped,
    counts: Object.freeze(counts),
    lastFive: Object.freeze(rows.slice(0, 5).map((row) => text(row.result_code))),
    evidenceBoundary: 'Counts describe reported Guild outcomes only. They are not a universal win probability and do not correct for roster, mods, datacrons, strategy, player skill, or reporting bias.',
  });
}

function rpcError(error) {
  const message = text(error?.message);
  if (message.includes('TB_ATTEMPT_ALREADY_REPORTED')) return httpError('You already reported this mission for the active event. An officer can correct the report without deleting its history.', 409, 'TB_ATTEMPT_ALREADY_REPORTED');
  if (message.includes('TB_ATTEMPT_STATE_STALE')) return httpError('That mission report changed before the correction was applied. Refresh the evidence and try again.', 409, 'TB_ATTEMPT_STATE_STALE');
  if (message.includes('TB_ATTEMPT_NOT_FOUND')) return httpError('The current mission report no longer exists.', 404, 'TB_ATTEMPT_NOT_FOUND');
  if (message.includes('TB_ATTEMPT_CORRECTION_REASON_REQUIRED')) return httpError('Officer corrections require a short reason for the audit history.', 400, 'TB_ATTEMPT_CORRECTION_REASON_REQUIRED');
  if (message.includes('TB_ATTEMPT_')) return httpError('The mission report transaction rejected an invalid payload.', 400, 'TB_ATTEMPT_WRITE_REJECTED', { databaseMessage: message });
  return error;
}

export function createTbMissionEvidenceService(options = {}) {
  const events = options.events || tbEventStateService;
  const operations = options.operations || guildOperationsService;
  const store = options.store || supabaseCoreStore;

  async function officerContext(userId, identity) {
    try {
      const context = await operations.requireOfficer(userId, identity.allyCode);
      return Object.freeze({ isOfficer: true, guildId: text(context?.guild?.id || identity.guildId) });
    } catch (error) {
      if (Number(error?.status) === 403 || text(error?.code).includes('OFFICER')) return Object.freeze({ isOfficer: false, guildId: identity.guildId });
      throw error;
    }
  }

  async function evidence(userId, input = {}) {
    const identity = await events.verifiedIdentity(userId);
    const snapshot = await events.eventSnapshot(userId);
    const officer = await officerContext(userId, identity);
    const requested = array(input.missionIds ?? input.mission_ids).map(text).filter(Boolean);
    const missions = requested.length
      ? requested.map((id) => missionById(id)).filter(Boolean)
      : MISSIONS;
    if (requested.length && missions.length !== new Set(requested).size) {
      const valid = new Set(missions.map((mission) => mission.id));
      const unknown = [...new Set(requested)].filter((id) => !valid.has(id));
      throw httpError(`Unknown ROTE mission ID: ${unknown.join(', ')}.`, 400, 'TB_MISSION_UNKNOWN', { unknownMissionIds: unknown });
    }

    const missionIds = missions.map((mission) => mission.id);
    let rows = [];
    if (missionIds.length) {
      rows = array(await store.select('guild_tb_mission_attempts', {
        select: '*',
        guild_id: `eq.${identity.guildId}`,
        is_current: 'eq.true',
        mission_id: `in.(${missionIds.join(',')})`,
        order: 'reported_at.desc',
        limit: 10000,
      }));
    }

    const playerIds = [...new Set(rows.map((row) => text(row.player_id)).filter(uuid))];
    const playerNames = new Map();
    if (officer.isOfficer && playerIds.length) {
      const players = array(await store.select('players', {
        select: 'id,name,ally_code',
        id: `in.(${playerIds.join(',')})`,
        limit: Math.min(1000, playerIds.length),
      }));
      for (const player of players) playerNames.set(text(player.id), text(player.name));
    }

    const activeEventId = text(snapshot?.event?.id);
    const activePhase = text(snapshot?.event?.currentPhase);
    const evidenceRows = missions.map((mission) => {
      const missionRows = rows.filter((row) => text(row.mission_id) === mission.id);
      const yourRows = missionRows.filter((row) => text(row.player_id) === text(identity.player.id));
      const currentEventRows = activeEventId ? missionRows.filter((row) => text(row.event_id) === activeEventId) : [];
      const yourCurrent = first(currentEventRows.filter((row) => text(row.player_id) === text(identity.player.id)));
      const canReport = Boolean(snapshot?.configured && activeEventId && activePhase === phaseForMission(mission) && !yourCurrent);
      return Object.freeze({
        missionId: mission.id,
        missionName: mission.name,
        missionType: mission.missionType,
        planetId: mission.territoryId,
        phase: phaseForMission(mission),
        canReport,
        community: Object.freeze({
          sourceIds: Object.freeze(array(mission.sources)),
          planningTeamClaims: array(mission.recommendations).length,
          evidenceBoundary: 'Community/reference sources describe mission rules, mechanics, or planning teams. No community win-rate claim is inferred here unless a separately sourced sample is added.',
        }),
        guild: resultSummary(missionRows),
        you: Object.freeze({
          ...resultSummary(yourRows),
          currentEventReport: yourCurrent ? sanitizeAttempt(yourCurrent, identity.player.name) : null,
        }),
        officerCurrentEventReports: officer.isOfficer
          ? Object.freeze(currentEventRows.slice(0, 50).map((row) => sanitizeAttempt(row, playerNames.get(text(row.player_id)))))
          : Object.freeze([]),
      });
    });

    return Object.freeze({
      source: 'tb-mission-evidence-v1',
      configured: snapshot?.configured === true,
      officer: officer.isOfficer,
      identity: Object.freeze({ allyCode: identity.allyCode, playerName: text(identity.player.name), guildId: identity.guildId }),
      event: snapshot?.event || null,
      missions: Object.freeze(evidenceRows),
      resultCodes: RESULT_CODES,
      evidenceBoundary: 'Community, Guild, and personal evidence are intentionally separated. Guild/personal counts are member-reported current revisions; superseded correction revisions remain stored for audit but are not double-counted.',
    });
  }

  async function report(userId, input = {}) {
    const identity = await events.verifiedIdentity(userId);
    const snapshot = await events.eventSnapshot(userId);
    if (!snapshot?.configured || !snapshot?.event) throw httpError('An active TB event is required before reporting a mission result.', 409, 'TB_EVENT_REQUIRED');
    const mission = missionById(input.missionId ?? input.mission_id);
    if (!mission) throw httpError('A canonical ROTE mission ID is required.', 400, 'TB_MISSION_UNKNOWN');
    if (phaseForMission(mission) !== text(snapshot.event.currentPhase)) {
      throw httpError(`${mission.name} belongs to ${phaseForMission(mission)}, not the active ${text(snapshot.event.currentPhase)} phase.`, 409, 'TB_MISSION_NOT_ACTIVE_PHASE');
    }
    const resultCode = cleanResult(input.resultCode ?? input.result_code);
    const teamSnapshot = cleanTeamSnapshot(input.teamSnapshot ?? input.team_snapshot);
    const note = cleanNote(input.note);
    let saved;
    try {
      saved = await store.rpc('record_guild_tb_mission_attempt', {
        p_guild_id: identity.guildId,
        p_event_id: snapshot.event.id,
        p_phase: snapshot.event.currentPhase,
        p_planet_id: mission.territoryId,
        p_mission_id: mission.id,
        p_player_id: identity.player.id,
        p_ally_code: identity.allyCode,
        p_result_code: resultCode,
        p_team_snapshot: teamSnapshot,
        p_note: note,
        p_reported_by_user_id: userId,
        p_source_kind: 'member_report',
        p_allow_correction: false,
        p_expected_current_attempt_id: null,
        p_correction_reason: '',
      });
    } catch (error) {
      throw rpcError(error);
    }
    return Object.freeze({
      saved: true,
      source: 'tb-mission-evidence-v1',
      mission: Object.freeze({ id: mission.id, name: mission.name, planetId: mission.territoryId, phase: phaseForMission(mission) }),
      attempt: Object.freeze({ id: text(saved?.id), revision: Number(saved?.revision || 1), resultCode, reportedAt: text(saved?.reportedAt) }),
      evidenceBoundary: 'This is a verified-account member report, not canonical game telemetry. It contributes to Your Guild and You evidence after saving.',
    });
  }

  async function correct(userId, attemptIdInput, input = {}) {
    const attemptId = uuid(attemptIdInput);
    if (!attemptId) throw httpError('A valid current mission attempt ID is required.', 400, 'TB_ATTEMPT_ID_INVALID');
    const identity = await events.verifiedIdentity(userId);
    const officer = await operations.requireOfficer(userId, identity.allyCode);
    const row = first(await store.select('guild_tb_mission_attempts', {
      select: '*',
      id: `eq.${attemptId}`,
      is_current: 'eq.true',
      limit: 1,
    }));
    if (!row) throw httpError('That current mission report was not found. Refresh evidence before correcting.', 404, 'TB_ATTEMPT_NOT_FOUND');
    if (text(row.guild_id) !== text(officer?.guild?.id || identity.guildId)) throw httpError('That mission report does not belong to your verified Guild.', 403, 'TB_ATTEMPT_GUILD_FORBIDDEN');
    const mission = missionById(row.mission_id);
    if (!mission || mission.id !== text(row.mission_id)) throw httpError('The stored mission report no longer maps to a canonical ROTE mission.', 409, 'TB_MISSION_UNKNOWN');
    const resultCode = cleanResult(input.resultCode ?? input.result_code);
    const correctionReason = cleanNote(input.correctionReason ?? input.correction_reason, 600);
    if (correctionReason.length < 3) throw httpError('Officer corrections require a short reason.', 400, 'TB_ATTEMPT_CORRECTION_REASON_REQUIRED');
    const teamSnapshot = input.teamSnapshot !== undefined || input.team_snapshot !== undefined
      ? cleanTeamSnapshot(input.teamSnapshot ?? input.team_snapshot)
      : cleanTeamSnapshot(row.team_snapshot);
    const note = input.note !== undefined ? cleanNote(input.note) : cleanNote(row.note);
    let saved;
    try {
      saved = await store.rpc('record_guild_tb_mission_attempt', {
        p_guild_id: row.guild_id,
        p_event_id: row.event_id,
        p_phase: row.phase,
        p_planet_id: row.planet_id,
        p_mission_id: row.mission_id,
        p_player_id: row.player_id,
        p_ally_code: row.ally_code,
        p_result_code: resultCode,
        p_team_snapshot: teamSnapshot,
        p_note: note,
        p_reported_by_user_id: userId,
        p_source_kind: 'officer_correction',
        p_allow_correction: true,
        p_expected_current_attempt_id: attemptId,
        p_correction_reason: correctionReason,
      });
    } catch (error) {
      throw rpcError(error);
    }
    return Object.freeze({
      corrected: true,
      source: 'tb-mission-evidence-v1',
      mission: Object.freeze({ id: mission.id, name: mission.name, planetId: mission.territoryId, phase: phaseForMission(mission) }),
      attempt: Object.freeze({
        id: text(saved?.id),
        revision: Number(saved?.revision || Number(row.revision || 1) + 1),
        supersedesAttemptId: text(saved?.supersedesAttemptId || attemptId),
        resultCode,
        correctionReason,
        reportedAt: text(saved?.reportedAt),
      }),
      evidenceBoundary: 'The prior report remains preserved as a superseded revision. Guild evidence counts only the new current revision.',
    });
  }

  return Object.freeze({ evidence, report, correct });
}

export const tbMissionEvidenceService = createTbMissionEvidenceService();
