import { listDiscordHardReservations } from './discord-hard-reservation-service.mjs';
import { discordStateStore } from './discord-state-store.mjs';
import { guildOperationsDiscordDelivery } from './guild-operations-discord-delivery.mjs';
import { guildOperationsService } from './guild-operations-service.mjs';
import { supabaseCoreStore } from './supabase-core-store.mjs';

const text = (value) => String(value ?? '').trim();
const array = (value) => Array.isArray(value) ? value : [];
const object = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const first = (value) => array(value)[0] || null;
const uuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text(value)) ? text(value).toLowerCase() : '';
const allyCode = (value) => { const code = text(value).replace(/\D/g, ''); return /^\d{9}$/.test(code) ? code : ''; };
const timestamp = (value) => { const parsed = Date.parse(text(value)); return Number.isFinite(parsed) ? parsed : 0; };

function httpError(message, status, code) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function memberMatches(assignment = {}, player = {}) {
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

function assignmentMemberName(assignment = {}, player = {}) {
  return text(assignment?.member?.name || assignment?.memberName || player.name);
}

function sanitizeTbAssignment(row = {}, player = {}) {
  return Object.freeze({
    phase: text(row.phase),
    operation: text(row.squadId || row.conflictId || row.operationId),
    baseId: text(row.baseId).toUpperCase(),
    unitName: text(row.name || row.unitName || row.baseId),
    memberName: assignmentMemberName(row, player),
    locked: row.locked === true,
    help: row?.safety?.help === true,
    preference: text(row?.safety?.preference),
  });
}

function sanitizeTwAssignment(row = {}, player = {}) {
  return Object.freeze({
    priority: Number(row.priority || 0),
    zoneName: text(row.zoneName || row.territoryName),
    teamName: text(row.teamName || row.name),
    memberName: assignmentMemberName(row, player),
  });
}

function latestAssignmentRun(runs, player, type) {
  const latest = array(runs)[0] || null;
  if (!latest) return Object.freeze({ runId: '', status: '', createdAt: '', publishedAt: '', assignments: Object.freeze([]) });
  const matches = array(latest.assignments).filter((row) => memberMatches(row, player));
  const mapped = type === 'tb'
    ? matches.map((row) => sanitizeTbAssignment(row, player))
    : matches.map((row) => sanitizeTwAssignment(row, player));
  return Object.freeze({
    runId: text(latest.id),
    status: text(latest.status),
    createdAt: text(latest.created_at),
    publishedAt: text(latest.published_at),
    assignments: Object.freeze(mapped),
  });
}

function sanitizeControl(row = {}) {
  const ignoredUntil = text(row.ignored_until);
  const activeTimedIgnore = timestamp(ignoredUntil) > Date.now();
  return Object.freeze({
    available: row.available !== false,
    ignoredUntil,
    ignoreReason: text(row.ignore_reason),
    source: text(row.source),
    updatedAt: text(row.updated_at),
    activelyExcluded: row.available === false || activeTimedIgnore,
  });
}

function sanitizeDonation(row = {}) {
  return Object.freeze({
    baseId: text(row.base_id).toUpperCase(),
    preference: text(row.preference).toLowerCase(),
    source: text(row.source),
    updatedAt: text(row.updated_at),
  });
}

function sanitizeSchedule(row = {}) {
  return Object.freeze({
    id: text(row.id),
    runType: text(row.run_type),
    name: text(row.name),
    status: text(row.status),
    stage: text(row.stage),
    nextRunAt: text(row.next_run_at),
    lastRunAt: text(row.last_run_at),
    lastError: text(row.last_error),
    autoPublish: row.auto_publish !== false,
  });
}

function linkForPlayer(guildState, player) {
  const code = allyCode(player.ally_code);
  const gameId = text(player.swgoh_player_id);
  const dbId = text(player.id);
  for (const [discordUserId, linkRaw] of Object.entries(object(guildState?.userLinks))) {
    const link = object(linkRaw);
    if (
      (code && allyCode(link.swgohAllyCode) === code)
      || (text(link.playerId) && [gameId, dbId].includes(text(link.playerId)))
    ) {
      return Object.freeze({
        linked: true,
        discordUserId: text(discordUserId),
        swgohAllyCode: allyCode(link.swgohAllyCode),
        playerId: text(link.playerId),
        linkedAt: text(link.linkedAt),
        updatedAt: text(link.updatedAt),
      });
    }
  }
  return Object.freeze({ linked: false, discordUserId: '', swgohAllyCode: code, playerId: gameId || dbId, linkedAt: '', updatedAt: '' });
}

function auditMatches(row, player) {
  const id = text(player.id);
  const code = allyCode(player.ally_code);
  const entityId = text(row.entity_id);
  if (id && (entityId === id || entityId.startsWith(`${id}:`))) return true;
  const haystack = JSON.stringify(row.metadata || {});
  return Boolean((id && haystack.includes(id)) || (code && haystack.includes(code)));
}

export function createGuildMemberOperationsService(options = {}) {
  const store = options.store || supabaseCoreStore;
  const operations = options.operations || guildOperationsService;
  const delivery = options.delivery || guildOperationsDiscordDelivery;
  const stateStore = options.stateStore || discordStateStore;
  const hardReservations = options.listHardReservations || listDiscordHardReservations;

  async function currentDirectory(context) {
    const [playersRaw, membersRaw] = await Promise.all([
      store.select('players', {
        select: 'id,ally_code,swgoh_player_id,name,level,galactic_power,character_power,ship_power,last_synced_at',
        current_guild_id: `eq.${context.guild.id}`,
        order: 'name.asc',
        limit: 100,
      }),
      store.select('guild_members_current', {
        select: 'player_id,member_name,member_galactic_power,member_character_power,member_ship_power,last_synced_at',
        guild_id: `eq.${context.guild.id}`,
        limit: 100,
      }),
    ]);
    const memberships = new Map(array(membersRaw).map((row) => [text(row.player_id), row]));
    return array(playersRaw)
      .filter((player) => memberships.has(text(player.id)))
      .map((player) => {
        const membership = memberships.get(text(player.id)) || {};
        return Object.freeze({
          playerId: text(player.id),
          allyCode: allyCode(player.ally_code),
          name: text(membership.member_name || player.name),
          level: Number(player.level || 0),
          galacticPower: Number(membership.member_galactic_power ?? player.galactic_power ?? 0),
          characterPower: Number(membership.member_character_power ?? player.character_power ?? 0),
          shipPower: Number(membership.member_ship_power ?? player.ship_power ?? 0),
          lastSyncedAt: text(membership.last_synced_at || player.last_synced_at),
        });
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async function directory(userId, lookupAllyCode) {
    const context = await operations.requireOfficer(userId, lookupAllyCode);
    const members = await currentDirectory(context);
    return Object.freeze({ source: 'guild-member-operations-directory-v1', guildId: text(context.guild.id), members: Object.freeze(members) });
  }

  async function requireCurrentPlayer(context, playerIdInput) {
    const playerId = uuid(playerIdInput);
    if (!playerId) throw httpError('A valid Guild player ID is required.', 400, 'INVALID_PLAYER_ID');
    const [player, membership] = await Promise.all([
      store.select('players', {
        select: 'id,ally_code,swgoh_player_id,name,level,galactic_power,character_power,ship_power,last_synced_at',
        id: `eq.${playerId}`,
        current_guild_id: `eq.${context.guild.id}`,
        limit: 1,
      }).then(first),
      store.select('guild_members_current', {
        select: 'player_id,member_name,member_galactic_power,member_character_power,member_ship_power,last_synced_at',
        guild_id: `eq.${context.guild.id}`,
        player_id: `eq.${playerId}`,
        limit: 1,
      }).then(first),
    ]);
    if (!player?.id || !membership?.player_id) throw httpError('That player is not a current member of this Guild.', 404, 'PLAYER_NOT_CURRENT_GUILD_MEMBER');
    return { player, membership };
  }

  async function member(userId, lookupAllyCode, playerIdInput) {
    const context = await operations.requireOfficer(userId, lookupAllyCode);
    const { player, membership } = await requireCurrentPlayer(context, playerIdInput);
    const guildId = text(context.guild.id);
    const playerId = text(player.id);

    const [controlRaw, donationsRaw, tbRunsRaw, twRunsRaw, schedulesRaw, auditsRaw, binding] = await Promise.all([
      store.select('guild_member_operation_controls', { select: '*', guild_id: `eq.${guildId}`, player_id: `eq.${playerId}`, limit: 1 }),
      store.select('guild_unit_donation_preferences', { select: 'player_id,base_id,preference,source,updated_at', guild_id: `eq.${guildId}`, player_id: `eq.${playerId}`, order: 'updated_at.desc', limit: 500 }),
      store.select('guild_tb_assignment_runs', { select: 'id,status,assignments,created_at,published_at', guild_id: `eq.${guildId}`, order: 'created_at.desc', limit: 5 }),
      store.select('guild_tw_defense_runs', { select: 'id,status,assignments,created_at,published_at', guild_id: `eq.${guildId}`, order: 'created_at.desc', limit: 5 }),
      store.select('guild_operation_schedules', { select: 'id,run_type,name,status,stage,next_run_at,last_run_at,last_error,auto_publish', guild_id: `eq.${guildId}`, order: 'next_run_at.asc', limit: 100 }),
      store.select('guild_operations_audit_log', { select: 'id,action,entity_type,entity_id,metadata,occurred_at', guild_id: `eq.${guildId}`, order: 'occurred_at.desc', limit: 100 }),
      typeof delivery?.resolveBinding === 'function' ? delivery.resolveBinding(guildId).catch(() => null) : null,
    ]);

    const guildState = binding?.discordGuildId && stateStore?.status?.()?.enabled && typeof stateStore.readGuild === 'function'
      ? await stateStore.readGuild(binding.discordGuildId).catch(() => null)
      : null;
    const discordLink = linkForPlayer(guildState, player);

    let reserveState = {
      available: false,
      reason: !binding?.discordGuildId ? 'discord-guild-not-bound' : !discordLink.linked ? 'discord-player-not-linked' : 'hard-reservation-state-unavailable',
      rows: [],
    };
    if (binding?.discordGuildId && discordLink.linked) {
      try {
        const result = await hardReservations({ discordGuildId: binding.discordGuildId, discordUserId: discordLink.discordUserId });
        reserveState = {
          available: true,
          reason: '',
          rows: array(result?.rows).map((row) => Object.freeze({
            phase: text(row.phase),
            baseId: text(row.baseId).toUpperCase(),
            unitName: text(row.unitName || row.baseId),
            updatedAt: text(row.updatedAt),
          })),
        };
      } catch (error) {
        reserveState = { available: false, reason: text(error?.code || error?.message || 'hard-reservation-state-unavailable'), rows: [] };
      }
    }

    const activeSchedules = array(schedulesRaw).filter((row) => row.status === 'active').map(sanitizeSchedule);
    const recentAudit = array(auditsRaw).filter((row) => auditMatches(row, player)).slice(0, 20).map((row) => Object.freeze({
      id: text(row.id),
      action: text(row.action),
      entityType: text(row.entity_type),
      entityId: text(row.entity_id),
      occurredAt: text(row.occurred_at),
    }));

    return Object.freeze({
      source: 'guild-member-operations-control-v1',
      guild: Object.freeze({ id: guildId, name: text(context.guild.name), lastSyncedAt: text(context.guild.last_synced_at) }),
      player: Object.freeze({
        playerId,
        allyCode: allyCode(player.ally_code),
        swgohPlayerId: text(player.swgoh_player_id),
        name: text(membership.member_name || player.name),
        level: Number(player.level || 0),
        galacticPower: Number(membership.member_galactic_power ?? player.galactic_power ?? 0),
        characterPower: Number(membership.member_character_power ?? player.character_power ?? 0),
        shipPower: Number(membership.member_ship_power ?? player.ship_power ?? 0),
        lastSyncedAt: text(membership.last_synced_at || player.last_synced_at),
      }),
      control: sanitizeControl(first(controlRaw) || {}),
      donations: Object.freeze(array(donationsRaw).map(sanitizeDonation)),
      discord: Object.freeze({ bound: Boolean(binding?.discordGuildId), discordGuildId: text(binding?.discordGuildId), ...discordLink }),
      hardReservations: Object.freeze({ available: reserveState.available, reason: reserveState.reason, rows: Object.freeze(reserveState.rows) }),
      assignments: Object.freeze({
        tb: latestAssignmentRun(tbRunsRaw, player, 'tb'),
        tw: latestAssignmentRun(twRunsRaw, player, 'tw'),
      }),
      upcomingPlannerRuns: Object.freeze(activeSchedules),
      recentAudit: Object.freeze(recentAudit),
      semantics: Object.freeze({
        upcomingPlannerRuns: 'Active schedules are future planner executions, not guaranteed member assignments. Member assignments are shown only from persisted TB/TW runs.',
        hardReservations: 'Hard reserves remain ownership-verified through the Discord-linked reserve workflow; this drawer reports them but does not create weaker web-only reserves.',
      }),
    });
  }

  return Object.freeze({ directory, member });
}

export const guildMemberOperationsService = createGuildMemberOperationsService();
