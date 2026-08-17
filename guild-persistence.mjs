import { createHash } from 'node:crypto';
import { guildRosterService } from './guild-roster-service.mjs';
import { supabaseAuthSession } from './supabase-auth-session.mjs';
import { supabaseCoreStore } from './supabase-core-store.mjs';

function clean(value) {
  return String(value || '').trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function first(value) {
  return asArray(value)[0] || null;
}

function finite(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function integer(value, fallback = 0) {
  return Math.trunc(finite(value, fallback));
}

function allyCode(value) {
  const digits = clean(value).replace(/\D/g, '');
  return /^\d{9}$/.test(digits) ? digits : '';
}

function httpError(message, status, code) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function timestampFromGameValue(value) {
  const text = clean(value);
  if (!text) return null;
  if (/^\d+$/.test(text)) {
    const number = Number(text);
    if (!Number.isFinite(number) || number <= 0) return null;
    const millis = number > 10_000_000_000 ? number : number * 1000;
    const date = new Date(millis);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function combatType(unit = {}) {
  const text = clean(unit.unitType || unit.combatType || unit.type).toLowerCase();
  const numeric = Number(unit.combatType);
  if (text === 'ship' || numeric === 2) return 'ship';
  if (text === 'character' || numeric === 1) return 'character';
  return 'unknown';
}

function unitPower(unit = {}) {
  return Math.max(0, integer(unit.power ?? unit.gp ?? unit.galacticPower, 0));
}

function memberPowers(member = {}) {
  let characterPower = Math.max(0, integer(member.characterGalacticPower ?? member.characterPower, 0));
  let shipPower = Math.max(0, integer(member.shipGalacticPower ?? member.shipPower, 0));
  if (characterPower || shipPower) return Object.freeze({ characterPower, shipPower });

  for (const unit of asArray(member.units)) {
    const power = unitPower(unit);
    if (combatType(unit) === 'ship') shipPower += power;
    else if (combatType(unit) === 'character') characterPower += power;
  }
  return Object.freeze({ characterPower, shipPower });
}

function normalizedUnit(unit = {}) {
  const baseId = clean(unit.baseId || unit.baseID || unit.definitionId).split(':')[0];
  if (!baseId) return null;
  const purchasedAbilityIds = asArray(unit.purchasedAbilityIds).map(clean).filter(Boolean);
  const abilityClassificationComplete = Array.isArray(unit.zetas) && Array.isArray(unit.omicrons);
  return Object.freeze({
    baseId,
    name: clean(unit.name) || baseId,
    combatType: combatType(unit),
    rarity: Math.min(7, Math.max(0, integer(unit.stars ?? unit.rarity, 0))),
    level: Math.max(0, integer(unit.level, 0)),
    gearLevel: Math.max(0, integer(unit.gear ?? unit.gearLevel, 0)),
    relicTier: Math.max(0, integer(unit.relic ?? unit.relicTier, 0)),
    galacticPower: unitPower(unit),
    zetaCount: abilityClassificationComplete ? asArray(unit.zetas).length : null,
    omicronCount: abilityClassificationComplete ? asArray(unit.omicrons).length : null,
    ultimateUnlocked: null,
    metadata: Object.freeze({
      unitId: clean(unit.id),
      definitionId: clean(unit.definitionId),
      speed: Math.max(0, integer(unit.speed, 0)),
      skills: asArray(unit.skills),
      equipment: asArray(unit.equipment),
      equippedStatMods: asArray(unit.equippedStatMods),
      purchasedAbilityIds,
      calculatedStats: unit.calculatedStats && typeof unit.calculatedStats === 'object' ? unit.calculatedStats : {},
      abilityClassificationPendingCatalog: !abilityClassificationComplete,
    }),
  });
}

function normalizedMember(member = {}) {
  const code = allyCode(member.allyCode);
  const swgohPlayerId = clean(member.playerId || member.id);
  if (!code || !swgohPlayerId || member.rosterAvailable !== true) return null;
  const powers = memberPowers(member);
  const units = asArray(member.units).map(normalizedUnit).filter(Boolean);
  if (!units.length) return null;
  const galacticPower = Math.max(0, integer(member.galacticPower, powers.characterPower + powers.shipPower));

  return Object.freeze({
    swgohPlayerId,
    allyCode: code,
    name: clean(member.name || member.playerName) || code,
    level: Math.max(0, integer(member.level, 0)),
    galacticPower,
    characterPower: powers.characterPower,
    shipPower: powers.shipPower,
    memberLevel: Math.max(0, integer(member.memberLevel, 0)),
    guildXp: Math.max(0, integer(member.guildXp, 0)),
    squadPower: Math.max(0, integer(member.squadPower, 0)),
    lastActivityAt: timestampFromGameValue(member.lastActivityTime),
    guildJoinedAt: timestampFromGameValue(member.guildJoinTime),
    lifetimeSeasonScore: Math.max(0, integer(member.lifetimeSeasonScore, 0)),
    leagueId: clean(member.leagueId) || null,
    memberContribution: asArray(member.memberContribution),
    seasonStatus: asArray(member.seasonStatus),
    raidTicketsCurrent: null,
    raidTicketsLifetime: null,
    playerMetadata: Object.freeze({
      playerTitle: clean(member.playerTitle),
      playerPortrait: clean(member.playerPortrait),
      raidTicketContributionTypePendingVerification: true,
    }),
    activityMetadata: Object.freeze({
      raidTicketContributionTypePendingVerification: true,
    }),
    units,
  });
}

function activityFingerprint(activity, members) {
  const stable = {
    activity: activity && typeof activity === 'object' ? activity : {},
    members: members.map((member) => ({
      swgohPlayerId: member.swgohPlayerId,
      memberLevel: member.memberLevel,
      guildXp: member.guildXp,
      squadPower: member.squadPower,
      lastActivityAt: member.lastActivityAt,
      memberContribution: member.memberContribution,
      seasonStatus: member.seasonStatus,
      lifetimeSeasonScore: member.lifetimeSeasonScore,
      leagueId: member.leagueId,
    })),
  };
  return createHash('sha256').update(JSON.stringify(stable)).digest('hex');
}

function safeUpstreamDiagnostic(value) {
  return clean(value)
    .replace(/https?:\/\/\S+/gi, '[upstream-url]')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, 220);
}

function calculationFailureMessage(calculation = {}) {
  const source = clean(calculation.source) || 'SWGOH Stats';
  const configured = calculation.configured === true ? 'yes' : 'no';
  const requested = Math.max(0, integer(calculation.requested, 0));
  const calculated = Math.max(0, integer(calculation.calculated, 0));
  const failed = Math.max(0, integer(calculation.failed, Math.max(0, requested - calculated)));
  const diagnostic = safeUpstreamDiagnostic(calculation.error);
  const upstream = diagnostic ? `; upstream: ${diagnostic}` : '';
  return `Guild GP/stat calculation is incomplete (${source}: configured ${configured}, requested ${requested}, calculated ${calculated}, failed ${failed}${upstream}); no permanent snapshot was written.`;
}

function assertIntegrity(body, context) {
  if (body?.source !== 'live' || !body?.guild || !Array.isArray(body?.members)) {
    throw httpError('The live Guild response is not a valid rich roster.', 502, 'GUILD_SYNC_INVALID_LIVE_RESPONSE');
  }
  if (body?.rosterDetail !== 'rich') {
    throw httpError('Permanent Guild synchronization requires the rich roster payload.', 502, 'GUILD_SYNC_RICH_ROSTER_REQUIRED');
  }
  if (body?.hydration?.complete !== true || Number(body?.hydration?.failed || 0) !== 0) {
    throw httpError('Guild roster hydration is incomplete; no permanent snapshot was written.', 409, 'GUILD_SYNC_HYDRATION_INCOMPLETE');
  }
  if (body?.calculation?.complete !== true) {
    throw httpError(calculationFailureMessage(body?.calculation), 409, 'GUILD_SYNC_CALCULATION_INCOMPLETE');
  }
  if (clean(body.guild.id) !== clean(context.guild.swgoh_guild_id)) {
    throw httpError('The fresh live Guild does not match this account’s authorized Guild tenant.', 409, 'GUILD_SYNC_TENANT_MISMATCH');
  }

  const expected = Math.max(0, integer(body.guild.memberCount, body.members.length));
  if (expected && expected !== body.members.length) {
    throw httpError(`Live Guild member count mismatch (${body.members.length}/${expected}); no permanent snapshot was written.`, 409, 'GUILD_SYNC_MEMBER_COUNT_MISMATCH');
  }

  const members = body.members.map(normalizedMember);
  if (members.some((member) => !member)) {
    throw httpError('At least one Guild member roster is incomplete or missing stable identity.', 409, 'GUILD_SYNC_MEMBER_INCOMPLETE');
  }
  const allyCodes = new Set(members.map((member) => member.allyCode));
  const playerIds = new Set(members.map((member) => member.swgohPlayerId));
  if (allyCodes.size !== members.length || playerIds.size !== members.length) {
    throw httpError('The live Guild roster contains duplicate member identity.', 409, 'GUILD_SYNC_DUPLICATE_MEMBER');
  }

  const requester = members.find((member) => member.allyCode === context.player.ally_code);
  if (!requester || requester.swgohPlayerId !== context.player.swgoh_player_id) {
    throw httpError('The verified signed-in player is not present in the fresh live Guild roster.', 409, 'GUILD_SYNC_REQUESTER_NOT_IN_GUILD');
  }
  return Object.freeze(members);
}

function writeJson(response, status, body) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(JSON.stringify(body));
}

function assertSameOrigin(request) {
  const origin = clean(request?.headers?.origin);
  if (!origin) return;
  const host = clean(request?.headers?.['x-forwarded-host'] || request?.headers?.host);
  const proto = clean(clean(request?.headers?.['x-forwarded-proto']).split(',')[0]) || 'https';
  if (!host || origin !== `${proto}://${host}`) {
    throw httpError('Cross-origin Guild synchronization request rejected.', 403, 'CROSS_ORIGIN_REJECTED');
  }
}

export function createGuildPersistence(options = {}) {
  const session = options.session || supabaseAuthSession;
  const store = options.store || supabaseCoreStore;
  const guildService = options.guildService || guildRosterService;
  const now = typeof options.now === 'function' ? options.now : () => new Date();

  async function requireUser(request) {
    const user = await session.currentUser(request);
    if (!user?.id) throw httpError('A signed-in Command Center account is required.', 401, 'AUTH_REQUIRED');
    return user;
  }

  async function verifiedContext(userId) {
    if (!store.status().configured) throw httpError('Command Center persistence is not configured.', 503, 'PERSISTENCE_NOT_CONFIGURED');
    const link = first(await store.select('user_player_links', {
      select: 'player_id,verification_status,verification_method,verified_at',
      user_id: `eq.${userId}`,
      verification_status: 'eq.verified',
      order: 'verified_at.desc',
      limit: 1,
    }));
    if (!link?.player_id) throw httpError('Verify your SWGOH player before synchronizing a Guild.', 403, 'VERIFIED_PLAYER_REQUIRED');

    const player = first(await store.select('players', {
      select: 'id,ally_code,swgoh_player_id,name,current_guild_id',
      id: `eq.${link.player_id}`,
      limit: 1,
    }));
    if (!player?.id || !player?.ally_code || !player?.swgoh_player_id || !player?.current_guild_id) {
      throw httpError('The verified SWGOH player identity is incomplete.', 409, 'VERIFIED_PLAYER_INCOMPLETE');
    }

    const membership = first(await store.select('guild_user_memberships', {
      select: 'guild_id,user_id,player_id,role,status,joined_at',
      user_id: `eq.${userId}`,
      player_id: `eq.${player.id}`,
      guild_id: `eq.${player.current_guild_id}`,
      status: 'eq.active',
      limit: 1,
    }));
    if (!membership) throw httpError('This account does not have an active membership in the player’s current Guild tenant.', 403, 'ACTIVE_GUILD_MEMBERSHIP_REQUIRED');

    const guild = first(await store.select('guilds', {
      select: 'id,swgoh_guild_id,name,last_synced_at',
      id: `eq.${membership.guild_id}`,
      limit: 1,
    }));
    if (!guild?.id || !guild?.swgoh_guild_id) throw httpError('The authorized Guild tenant is incomplete.', 409, 'GUILD_TENANT_INCOMPLETE');
    return Object.freeze({ link, player, membership, guild });
  }

  async function sync(user) {
    const context = await verifiedContext(user.id);
    const live = await guildService.refreshGuildRoster(context.player.ally_code, { includeActivity: true });
    const body = live?.value || {};
    const members = assertIntegrity(body, context);
    const capturedAt = timestampFromGameValue(body.fetchedAt) || now().toISOString();
    const rawActivity = body.activity && typeof body.activity === 'object' ? body.activity : {};
    const activity = Object.freeze({
      nextChallengesRefresh: timestampFromGameValue(rawActivity.nextChallengesRefresh),
      raidLaunchConfig: asArray(rawActivity.raidLaunchConfig),
      guildEventTracker: asArray(rawActivity.guildEventTracker),
      recentRaidResult: asArray(rawActivity.recentRaidResult),
      recentTerritoryWarResult: asArray(rawActivity.recentTerritoryWarResult),
      territoryBattleResult: asArray(rawActivity.territoryBattleResult),
    });

    const payload = Object.freeze({
      requesterUserId: user.id,
      lookupAllyCode: context.player.ally_code,
      capturedAt,
      sourceCache: clean(live.cache) || 'refreshed',
      snapshotKind: 'user_sync',
      rosterDetail: 'rich',
      guild: Object.freeze({
        swgohGuildId: clean(body.guild.id),
        name: clean(body.guild.name) || context.guild.name,
        galacticPower: Math.max(0, integer(body.guild.galacticPower, 0)),
        metadata: Object.freeze({
          memberMax: Math.max(0, integer(body.guild.memberMax, 0)),
          bannerColorId: clean(body.guild.bannerColorId),
          bannerLogoId: clean(body.guild.bannerLogoId),
          externalMessageKey: clean(body.guild.externalMessageKey),
          enrollmentStatus: integer(body.guild.enrollmentStatus, 0),
          level: integer(body.guild.level, 0),
          levelRequirement: integer(body.guild.levelRequirement, 0),
          guildType: clean(body.guild.guildType),
        }),
      }),
      hydration: Object.freeze({
        requested: integer(body.hydration.requested, members.length),
        hydrated: integer(body.hydration.hydrated, members.length),
        failed: integer(body.hydration.failed, 0),
        complete: body.hydration.complete === true,
      }),
      calculation: Object.freeze({
        source: clean(body.calculation.source) || 'SWGOH Stats',
        configured: body.calculation.configured === true,
        requested: integer(body.calculation.requested, members.length),
        calculated: integer(body.calculation.calculated, members.length),
        failed: integer(body.calculation.failed, 0),
        complete: body.calculation.complete === true,
        error: safeUpstreamDiagnostic(body.calculation.error) || null,
      }),
      activity,
      activityFingerprint: activityFingerprint(activity, members),
      members,
    });

    const result = await store.rpc('ingest_verified_user_guild_sync', { p_payload: payload });
    const normalizedResult = Array.isArray(result) ? result[0] : result;
    if (!normalizedResult?.ok) {
      throw httpError(normalizedResult?.error || 'The transactional Guild persistence step failed.', 502, 'GUILD_SYNC_PERSISTENCE_FAILED');
    }
    return Object.freeze({
      ok: true,
      guild: Object.freeze({ id: context.guild.id, swgohGuildId: context.guild.swgoh_guild_id, name: body.guild.name }),
      syncRunId: normalizedResult.syncRunId,
      membersStored: Number(normalizedResult.membersStored || 0),
      unitsStored: Number(normalizedResult.unitsStored || 0),
      activitySnapshotId: normalizedResult.activitySnapshotId || null,
      capturedAt: normalizedResult.capturedAt || capturedAt,
      integrity: Object.freeze({
        expectedMembers: integer(body.hydration.requested, members.length),
        hydratedMembers: integer(body.hydration.hydrated, members.length),
        failedRosters: integer(body.hydration.failed, 0),
        calculationComplete: body.calculation.complete === true,
      }),
    });
  }

  async function latestStatus(user) {
    const context = await verifiedContext(user.id);
    const latest = first(await store.select('guild_sync_runs', {
      select: 'id,status,source,source_cache,started_at,completed_at,expected_members,members_discovered,rosters_hydrated,rosters_failed,units_loaded,error_message,request_origin,metadata',
      guild_id: `eq.${context.guild.id}`,
      order: 'started_at.desc',
      limit: 1,
    }));
    return Object.freeze({
      guild: Object.freeze({ id: context.guild.id, swgohGuildId: context.guild.swgoh_guild_id, name: context.guild.name }),
      sync: latest || null,
    });
  }

  async function handle(request, response, url) {
    if (!url.pathname.startsWith('/api/guild/sync')) return false;
    try {
      const user = await requireUser(request);
      if (request.method === 'GET' && url.pathname === '/api/guild/sync/status') {
        writeJson(response, 200, await latestStatus(user));
        return true;
      }
      if (request.method === 'POST' && url.pathname === '/api/guild/sync') {
        assertSameOrigin(request);
        writeJson(response, 200, await sync(user));
        return true;
      }
      writeJson(response, 405, { error: 'Method not allowed for Guild sync route.', code: 'METHOD_NOT_ALLOWED' });
      return true;
    } catch (error) {
      writeJson(response, Number(error?.status) || 500, {
        error: error?.message || 'Guild synchronization failed.',
        code: error?.code || 'GUILD_SYNC_FAILED',
      });
      return true;
    }
  }

  return Object.freeze({ handle, sync, latestStatus, verifiedContext, assertIntegrity });
}

export { activityFingerprint, assertIntegrity, calculationFailureMessage, normalizedMember, normalizedUnit, timestampFromGameValue };
export const guildPersistence = createGuildPersistence();
