import { createHash } from 'node:crypto';
import { guildPersistence, normalizedMember, timestampFromGameValue } from './guild-persistence.mjs';
import { supabaseCoreStore } from './supabase-core-store.mjs';

function clean(value) { return String(value || '').trim(); }
function asArray(value) { return Array.isArray(value) ? value : []; }
function finite(value, fallback = 0) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; }
function integer(value, fallback = 0) { return Math.trunc(finite(value, fallback)); }
function positiveInteger(value, fallback, min = 1, max = 10) { const parsed = Math.floor(Number(value)); return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback; }
function trimUrl(value) { return clean(value).replace(/\/+$/, ''); }

function httpError(message, status, code) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function configFromEnv(env = process.env) {
  return Object.freeze({
    gatewayUrl: trimUrl(env.SWGOH_GATEWAY_URL),
    gatewayApiKey: clean(env.SWGOH_GATEWAY_API_KEY),
    pageSize: positiveInteger(env.GUILD_SYNC_PAGE_SIZE, 5, 1, 10),
    pageTimeoutMs: Math.max(30_000, Math.min(180_000, positiveInteger(env.GUILD_SYNC_PAGE_TIMEOUT_MS, 90_000, 30_000, 180_000))),
  });
}

function activityPayload(raw = {}) {
  return Object.freeze({
    nextChallengesRefresh: timestampFromGameValue(raw.nextChallengesRefresh),
    raidLaunchConfig: asArray(raw.raidLaunchConfig),
    guildEventTracker: asArray(raw.guildEventTracker),
    recentRaidResult: asArray(raw.recentRaidResult),
    recentTerritoryWarResult: asArray(raw.recentTerritoryWarResult),
    territoryBattleResult: asArray(raw.territoryBattleResult),
  });
}

function fingerprintMember(member = {}) {
  return {
    swgohPlayerId: member.swgohPlayerId,
    allyCode: member.allyCode,
    memberLevel: member.memberLevel,
    guildXp: member.guildXp,
    squadPower: member.squadPower,
    lastActivityAt: member.lastActivityAt,
    memberContribution: member.memberContribution,
    seasonStatus: member.seasonStatus,
    lifetimeSeasonScore: member.lifetimeSeasonScore,
    leagueId: member.leagueId,
  };
}

export function createPagedGuildPersistence(env = process.env, options = {}) {
  const config = configFromEnv(env);
  const store = options.store || supabaseCoreStore;
  const contextResolver = options.contextResolver || guildPersistence;
  const fetchImpl = options.fetch || fetch;
  const now = typeof options.now === 'function' ? options.now : () => new Date();

  async function fetchPage(allyCode, offset) {
    if (!config.gatewayUrl || !config.gatewayApiKey) throw httpError('Live Guild gateway is not configured for paged persistence.', 503, 'GUILD_SYNC_GATEWAY_NOT_CONFIGURED');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.pageTimeoutMs);
    try {
      const url = new URL(`${config.gatewayUrl}/v1/guild/by-player/${encodeURIComponent(allyCode)}/sync-page`);
      url.searchParams.set('activity', '1');
      url.searchParams.set('offset', String(offset));
      url.searchParams.set('limit', String(config.pageSize));
      const response = await fetchImpl(url, {
        headers: {
          Accept: 'application/json',
          'X-API-Key': config.gatewayApiKey,
          'User-Agent': 'SWGOH-Command-Center (bounded-guild-persistence)',
        },
        redirect: 'error',
        signal: controller.signal,
      });
      const text = await response.text();
      let body = null;
      try { body = text ? JSON.parse(text) : {}; } catch { body = null; }
      if (!response.ok) throw httpError(body?.error || `Guild sync page returned HTTP ${response.status}.`, response.status, 'GUILD_SYNC_PAGE_FAILED');
      if (body?.source !== 'live' || !body?.guild || !Array.isArray(body?.members) || !body?.page) {
        throw httpError('Guild sync page returned an invalid live payload.', 502, 'GUILD_SYNC_PAGE_INVALID');
      }
      return body;
    } catch (error) {
      if (error?.name === 'AbortError') throw httpError(`Guild sync page exceeded ${Math.round(config.pageTimeoutMs / 1000)} seconds.`, 504, 'GUILD_SYNC_PAGE_TIMEOUT');
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async function sync(user, syncOptions = {}) {
    const jobId = clean(syncOptions.jobId || user?.syncJobId);
    if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(jobId)) throw httpError('A durable Guild sync job ID is required for bounded persistence.', 400, 'GUILD_SYNC_JOB_ID_REQUIRED');
    if (!store.status?.().configured) throw httpError('Command Center persistence is not configured.', 503, 'PERSISTENCE_NOT_CONFIGURED');

    const context = await contextResolver.verifiedContext(user.id);
    await store.delete('guild_sync_stage_members', { job_id: `eq.${jobId}` }, { returning: false });

    let offset = 0;
    let expectedMembers = null;
    let guildBody = null;
    let capturedAt = null;
    let activity = null;
    let hydratedMembers = 0;
    let failedRosters = 0;
    let calcRequested = 0;
    let calcCalculated = 0;
    let calcFailed = 0;
    let calcConfigured = true;
    const calcErrors = new Set();
    const fingerprint = createHash('sha256');
    let stagedMembers = 0;
    let stagedUnits = 0;

    while (true) {
      const page = await fetchPage(context.player.ally_code, offset);
      const pageGuildId = clean(page?.guild?.id);
      if (!pageGuildId || pageGuildId !== clean(context.guild.swgoh_guild_id)) {
        throw httpError('Paged Guild sync resolved to a different SWGOH Guild tenant.', 409, 'GUILD_SYNC_TENANT_MISMATCH');
      }

      const pageTotal = Math.max(0, integer(page.page.totalMembers, 0));
      if (!expectedMembers) expectedMembers = pageTotal;
      if (!pageTotal || pageTotal !== expectedMembers) throw httpError('Guild member count changed during paged synchronization; retry required.', 409, 'GUILD_SYNC_PAGE_MEMBER_COUNT_CHANGED');
      if (integer(page.page.offset, -1) !== offset) throw httpError('Guild sync page offset did not match the requested cursor.', 502, 'GUILD_SYNC_PAGE_CURSOR_MISMATCH');
      if (page.hydration?.complete !== true || Number(page.hydration?.failed || 0) !== 0) {
        throw httpError(`Guild sync page hydration is incomplete at offset ${offset}; no permanent snapshot was finalized.`, 409, 'GUILD_SYNC_HYDRATION_INCOMPLETE');
      }

      if (!guildBody) {
        guildBody = page.guild;
        capturedAt = timestampFromGameValue(page.fetchedAt) || now().toISOString();
        activity = activityPayload(page.activity || {});
        fingerprint.update(JSON.stringify(activity));
      }

      const normalized = page.members.map(normalizedMember);
      if (normalized.some((member) => !member)) throw httpError(`Guild sync page contains an incomplete member at offset ${offset}.`, 409, 'GUILD_SYNC_MEMBER_INCOMPLETE');

      const stageRows = normalized.map((member, index) => {
        fingerprint.update(JSON.stringify(fingerprintMember(member)));
        stagedUnits += member.units.length;
        return {
          job_id: jobId,
          member_index: offset + index,
          guild_id: context.guild.id,
          requester_user_id: user.id,
          swgoh_player_id: member.swgohPlayerId,
          ally_code: member.allyCode,
          payload: member,
          staged_at: now().toISOString(),
        };
      });
      await store.upsert('guild_sync_stage_members', stageRows, { onConflict: 'job_id,member_index', returning: false });

      stagedMembers += normalized.length;
      hydratedMembers += integer(page.hydration?.hydrated, normalized.length);
      failedRosters += integer(page.hydration?.failed, 0);
      calcRequested += integer(page.calculation?.requested, normalized.length);
      calcCalculated += integer(page.calculation?.calculated, 0);
      calcFailed += integer(page.calculation?.failed, 0);
      calcConfigured = calcConfigured && page.calculation?.configured === true;
      if (clean(page.calculation?.error)) calcErrors.add(clean(page.calculation.error).slice(0, 180));

      const nextOffset = page.page.nextOffset;
      if (nextOffset == null) break;
      const next = integer(nextOffset, -1);
      if (next <= offset) throw httpError('Guild sync page cursor did not advance.', 502, 'GUILD_SYNC_PAGE_CURSOR_STALLED');
      offset = next;
    }

    if (!expectedMembers || stagedMembers !== expectedMembers || hydratedMembers !== expectedMembers || failedRosters !== 0) {
      throw httpError(`Bounded Guild staging is incomplete (${stagedMembers}/${expectedMembers || 0}); no permanent snapshot was finalized.`, 409, 'GUILD_SYNC_STAGE_INCOMPLETE');
    }

    const requesterRows = await store.select('guild_sync_stage_members', {
      select: 'ally_code,swgoh_player_id',
      job_id: `eq.${jobId}`,
      ally_code: `eq.${context.player.ally_code}`,
      limit: 1,
    });
    const requester = asArray(requesterRows)[0];
    if (!requester || clean(requester.swgoh_player_id) !== clean(context.player.swgoh_player_id)) {
      throw httpError('The verified requester is not present in the fully staged Guild roster.', 409, 'GUILD_SYNC_REQUESTER_NOT_IN_GUILD');
    }

    const calculationComplete = calcConfigured && calcRequested === expectedMembers && calcCalculated === expectedMembers && calcFailed === 0;
    const header = {
      requesterUserId: user.id,
      lookupAllyCode: context.player.ally_code,
      capturedAt,
      sourceCache: 'bounded-live-pages',
      snapshotKind: 'user_sync',
      rosterDetail: 'rich',
      guild: {
        swgohGuildId: clean(guildBody.id),
        name: clean(guildBody.name) || context.guild.name,
        galacticPower: Math.max(0, integer(guildBody.galacticPower, 0)),
        metadata: {
          memberMax: Math.max(0, integer(guildBody.memberMax, 0)),
          bannerColorId: clean(guildBody.bannerColorId),
          bannerLogoId: clean(guildBody.bannerLogoId),
          externalMessageKey: clean(guildBody.externalMessageKey),
          enrollmentStatus: integer(guildBody.enrollmentStatus, 0),
          level: integer(guildBody.level, 0),
          levelRequirement: integer(guildBody.levelRequirement, 0),
          guildType: clean(guildBody.guildType),
          boundedTransport: true,
          pageSize: config.pageSize,
        },
      },
      hydration: { requested: expectedMembers, hydrated: hydratedMembers, failed: 0, complete: true },
      calculation: {
        source: 'SWGOH Stats',
        configured: calcConfigured,
        requested: calcRequested,
        calculated: calcCalculated,
        failed: calcFailed,
        complete: calculationComplete,
        error: calcErrors.size ? [...calcErrors].join(' | ').slice(0, 220) : null,
        dataQuality: calculationComplete ? 'hydrated-and-stats-complete' : 'hydrated-raw-stats-partial',
      },
      activity,
      activityFingerprint: fingerprint.digest('hex'),
    };

    const finalized = await store.rpc('finalize_staged_guild_sync', { p_job_id: jobId, p_header: header });
    const result = Array.isArray(finalized) ? finalized[0] : finalized;
    if (!result?.ok) throw httpError(result?.error || 'Bounded Guild finalize failed.', 502, 'GUILD_SYNC_PERSISTENCE_FAILED');

    return Object.freeze({
      ok: true,
      guild: Object.freeze({ id: context.guild.id, swgohGuildId: context.guild.swgoh_guild_id, name: clean(guildBody.name) || context.guild.name }),
      syncRunId: result.syncRunId,
      membersStored: Number(result.membersStored || stagedMembers),
      unitsStored: Number(result.unitsStored || stagedUnits),
      activitySnapshotId: result.activitySnapshotId || null,
      capturedAt: result.capturedAt || capturedAt,
      boundedTransport: true,
      integrity: Object.freeze({
        expectedMembers,
        hydratedMembers,
        failedRosters: 0,
        calculationComplete,
        calculatedMembers: calcCalculated,
        calculationFailedMembers: calcFailed,
        dataQuality: calculationComplete ? 'hydrated-and-stats-complete' : 'hydrated-raw-stats-partial',
      }),
    });
  }

  return Object.freeze({ sync, fetchPage, status: () => Object.freeze({ mode: 'bounded-staged-guild-pages', pageSize: config.pageSize, pageTimeoutMs: config.pageTimeoutMs }) });
}

export const pagedGuildPersistence = createPagedGuildPersistence(process.env);
