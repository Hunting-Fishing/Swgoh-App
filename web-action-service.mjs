import { canonicalRosterService } from './canonical-roster-service.mjs';
import { journeyGoalService } from './journey-goal-service.mjs';
import { buildOrder66RaidMax } from './public/raid-max-order66.js';
import { supabaseCoreStore } from './supabase-core-store.mjs';
import { executePersonalTbFarmPlan } from './tb-farm-plan-action.mjs';
import { findWebAction, publicWebActionCatalog } from './web-action-registry.mjs';

const text = (value) => String(value ?? '').trim();
const array = (value) => Array.isArray(value) ? value : [];
const first = (value) => array(value)[0] || null;
const allyCode = (value) => { const code = text(value).replace(/\D/g, ''); return /^\d{9}$/.test(code) ? code : ''; };
const uuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text(value)) ? text(value).toLowerCase() : '';
const boolEnv = (value, fallback = false) => value == null || value === '' ? fallback : ['1','true','yes','on'].includes(String(value).trim().toLowerCase());

function httpError(message, status, code) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function actionSharingConfig(env = process.env) {
  const explicit = text(env.WEB_ACTION_DISCORD_SHARING_ENABLED);
  return Object.freeze({
    discordEnabled: explicit ? boolEnv(explicit) : boolEnv(env.DISCORD_TB_DELIVERY_ENABLED, false),
    botToken: text(env.DISCORD_BOT_TOKEN),
  });
}

function formatScore(value) {
  const number = Number(value || 0);
  if (number >= 1_000_000) return `${Math.round(number / 100_000) / 10}M`;
  if (number >= 1_000) return `${Math.round(number / 100) / 10}K`;
  return String(number);
}

function raidMaxDiscordContent(run) {
  const result = run?.result || {};
  const player = result.player || {};
  const summary = result.summary || {};
  const lines = [
    `⚔️ **SWGOH Command Center · Raid Max**`,
    `**${text(player.name) || 'Player'}** · ${allyCode(player.allyCode) || 'Ally Code unavailable'}`,
    `Order 66 · ${summary.attemptsBuilt || 0}/5 attempts · validated ceiling ${formatScore(summary.recommendedMaxScoreCeiling)}`,
    '',
  ];
  for (const attempt of array(result.attempts).slice(0, 5)) {
    const units = array(attempt.units).map((unit) => `${text(unit.name)} ${text(unit.progression)}`).join(', ');
    const validated = attempt.source !== 'roster-only-fallback';
    lines.push(`**${attempt.attempt}. ${text(attempt.name)}** — ${text(attempt.difficulty?.requirement)} · ${formatScore(attempt.maxScoreCeiling)} ceiling${validated ? '' : ' · roster-only fallback'}`);
    lines.push(units.slice(0, 650));
  }
  lines.push('', '_Ceilings are roster/difficulty eligibility, not guaranteed damage. Generated on the Command Center website._');
  return lines.join('\n').slice(0, 1950);
}

function tbFarmPlanDiscordContent(run) {
  const result = run?.result || {};
  const player = result.player || {};
  const guild = result.guild || {};
  const summary = result.summary || {};
  const personal = result.personalization || {};
  const lines = [
    '🛰️ **SWGOH Command Center · TB Farm Plan**',
    `**${text(player.name) || 'Player'}** · ${allyCode(player.allyCode) || 'Ally Code unavailable'} · ${text(guild.name) || 'Guild'}`,
    `${summary.personalFarmRows || 0} personal TB farm targets · ${summary.doubleUseRows || 0} Journey-overlap targets · ${summary.journeyTargetsAdvanced || 0} unlock paths advanced`,
    personal.trackedGoalCount ? `Tracked goals: ${personal.trackedGoalCount} · matching farms ${personal.rowsMatchingTrackedGoals || 0}` : 'Tracked goals: none · Guild-impact fallback',
    `Ranking: ${text(summary.priorityMode || 'guild-impact').replaceAll('-', ' ')}`,
    '',
  ];
  for (const row of array(result.recommendations).slice(0, 8)) {
    const tracked = array(row?.personal?.targets).slice(0, 2);
    const journey = tracked.length ? tracked : array(row?.journey?.targets).filter((entry) => ['direct','partial'].includes(text(entry.status))).slice(0, 2);
    const prefix = tracked.length ? ' · MY GOAL ' : ' · ';
    const overlap = journey.length ? `${prefix}${journey.map((entry) => `${text(entry.shortName || entry.eventName)} ${text(entry.requirementLabel)} (${text(entry.status)})`).join(' / ')}` : '';
    lines.push(`**#${row.rank || '?'} ${text(row.unitName || row.baseId)}** — ${text(row.currentLabel)} → ${text(row.tbTargetLabel)} · ${row?.tb?.missionImpact || 0} TB mission${Number(row?.tb?.missionImpact || 0) === 1 ? '' : 's'}${overlap}`);
  }
  lines.push('', '_Journey overlap means this farm advances or satisfies a prerequisite; it does not guarantee the Journey target unlock. Generated on the Command Center website._');
  return lines.join('\n').slice(0, 1950);
}

function discordActionContent(run) {
  if (run?.action_key === 'raid-max') return raidMaxDiscordContent(run);
  if (run?.action_key === 'tb-farm-plan') return tbFarmPlanDiscordContent(run);
  return `SWGOH Command Center action: ${text(run?.action_key)}`;
}

function feedItem(publication, run) {
  return Object.freeze({
    publicationId: text(publication.id),
    targetKind: text(publication.target_kind),
    publishedAt: text(publication.created_at),
    run: Object.freeze({
      id: text(run?.id), actionKey: text(run?.action_key), actionVersion: text(run?.action_version), createdAt: text(run?.created_at),
      summary: run?.summary || {}, result: run?.result || {},
    }),
  });
}

export function createWebActionService(options = {}) {
  const store = options.store || supabaseCoreStore;
  const canonical = options.canonical || canonicalRosterService;
  const journeyGoals = options.journeyGoals || journeyGoalService;
  const env = options.env || process.env;
  const fetchImpl = options.fetch || fetch;
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
    if (!link?.player_id) throw httpError('A verified SWGOH player is required before website actions can run.', 403, 'VERIFIED_PLAYER_REQUIRED');
    const player = first(await store.select('players', {
      select: 'id,ally_code,swgoh_player_id,name,current_guild_id,last_synced_at',
      id: `eq.${link.player_id}`,
      limit: 1,
    }));
    if (!player?.id || !allyCode(player.ally_code)) throw httpError('The verified player identity is unavailable.', 404, 'VERIFIED_PLAYER_NOT_FOUND');
    let membership = null;
    if (player.current_guild_id) {
      membership = first(await store.select('guild_user_memberships', {
        select: 'guild_id,user_id,player_id,role,status,joined_at,updated_at',
        guild_id: `eq.${player.current_guild_id}`,
        user_id: `eq.${userId}`,
        status: 'eq.active',
        limit: 1,
      }));
    }
    return Object.freeze({
      userId,
      player: Object.freeze({ ...player }),
      guildId: text(player.current_guild_id),
      membership: membership ? Object.freeze({ ...membership }) : null,
    });
  }

  async function verifiedDestinations(identity) {
    if (!identity.guildId) return [];
    return array(await store.select('guild_discord_destinations', {
      select: 'id,guild_id,destination_kind,external_id,display_name,verified,metadata,updated_at',
      guild_id: `eq.${identity.guildId}`,
      destination_kind: 'eq.channel',
      verified: 'eq.true',
      order: 'display_name.asc',
      limit: 100,
    })).map((row) => Object.freeze({
      id: text(row.id), displayName: text(row.display_name), externalId: text(row.external_id), verified: row.verified === true,
    }));
  }

  async function catalog(userId) {
    const identity = await verifiedIdentity(userId);
    const destinations = await verifiedDestinations(identity);
    const role = text(identity.membership?.role).toLowerCase();
    return Object.freeze({
      source: 'web-action-center-v1',
      actions: publicWebActionCatalog(),
      identity: Object.freeze({
        playerId: text(identity.player.id), allyCode: allyCode(identity.player.ally_code), playerName: text(identity.player.name),
        guildId: identity.guildId, guildRole: role, activeGuildMember: Boolean(identity.membership),
      }),
      sharing: Object.freeze({
        playerPage: true,
        guildPage: Boolean(identity.membership),
        discord: Boolean(identity.membership && ['owner','leader','officer'].includes(role)),
        discordDestinations: Object.freeze(destinations),
      }),
    });
  }

  async function execute(userId, actionKeyInput, input = {}) {
    const action = findWebAction(actionKeyInput);
    if (!action?.implemented) throw httpError('That website action is not implemented.', 404, 'WEB_ACTION_NOT_IMPLEMENTED');
    const identity = await verifiedIdentity(userId);
    let result;
    if (action.key === 'raid-max') {
      const roster = await canonical.getPlayerRoster(identity.player.ally_code);
      result = buildOrder66RaidMax(roster, { maxAttempts: input?.maxAttempts });
    } else if (action.key === 'tb-farm-plan') {
      if (!identity.membership || !identity.guildId) throw httpError('Active Guild membership is required to build a Guild-impact TB Farm Plan.', 403, 'ACTIVE_GUILD_MEMBERSHIP_REQUIRED');
      const trackedGoalIds = await journeyGoals.listForPlayer(userId, identity.player.id);
      result = await executePersonalTbFarmPlan(canonical, identity.player.ally_code, {
        priorityMode: input?.priorityMode,
        maxRecommendations: input?.maxRecommendations,
        trackedGoalIds,
      });
    } else {
      throw httpError('That website action has no execution adapter.', 501, 'WEB_ACTION_ADAPTER_MISSING');
    }
    const row = first(await store.insert('web_action_runs', [{
      user_id: userId,
      player_id: identity.player.id,
      guild_id: identity.guildId || null,
      action_key: action.key,
      action_version: text(result?.version) || 'v1',
      status: 'completed',
      input: input && typeof input === 'object' ? input : {},
      result,
      summary: result?.summary || {},
      source_data_at: text(result?.sourceDataAt || result?.player?.rosterSyncedAt) || null,
      created_at: now().toISOString(),
    }]));
    if (!row?.id) throw httpError('The website action completed but its durable result could not be saved.', 502, 'WEB_ACTION_RESULT_NOT_SAVED');
    return Object.freeze({ runId: text(row.id), action, result, createdAt: text(row.created_at) });
  }

  async function requireOwnedRun(userId, runIdInput) {
    const runId = uuid(runIdInput);
    if (!runId) throw httpError('A valid action run ID is required.', 400, 'INVALID_ACTION_RUN_ID');
    const run = first(await store.select('web_action_runs', {
      select: 'id,user_id,player_id,guild_id,action_key,action_version,status,input,result,summary,source_data_at,created_at',
      id: `eq.${runId}`,
      user_id: `eq.${userId}`,
      limit: 1,
    }));
    if (!run) throw httpError('That saved website action was not found for this account.', 404, 'ACTION_RUN_NOT_FOUND');
    return run;
  }

  async function existingPublication(runId, targetKind, targetColumn, targetId) {
    return first(await store.select('web_action_publications', {
      select: 'id,run_id,target_kind,target_player_id,target_guild_id,discord_destination_id,status,external_id,metadata,created_at',
      run_id: `eq.${runId}`,
      target_kind: `eq.${targetKind}`,
      [targetColumn]: `eq.${targetId}`,
      status: 'eq.published',
      order: 'created_at.desc',
      limit: 1,
    }));
  }

  async function sharePlayerPage(userId, run, identity) {
    if (text(run.player_id) !== text(identity.player.id)) throw httpError('Only your own verified-player action can be shared to your Player Page.', 403, 'PLAYER_SHARE_FORBIDDEN');
    const existing = await existingPublication(run.id, 'player_page', 'target_player_id', identity.player.id);
    if (existing) return Object.freeze({ reused: true, publication: existing });
    const publication = first(await store.insert('web_action_publications', [{
      run_id: run.id, publisher_user_id: userId, target_kind: 'player_page', target_player_id: identity.player.id,
      status: 'published', metadata: { source: 'web-action-center' },
    }]));
    return Object.freeze({ reused: false, publication });
  }

  async function shareGuildPage(userId, run, identity) {
    if (!identity.membership || !identity.guildId || text(run.guild_id) !== identity.guildId) throw httpError('Active membership in the action run Guild is required.', 403, 'GUILD_SHARE_FORBIDDEN');
    const existing = await existingPublication(run.id, 'guild_page', 'target_guild_id', identity.guildId);
    if (existing) return Object.freeze({ reused: true, publication: existing });
    const publication = first(await store.insert('web_action_publications', [{
      run_id: run.id, publisher_user_id: userId, target_kind: 'guild_page', target_guild_id: identity.guildId,
      status: 'published', metadata: { source: 'web-action-center', publisherPlayerId: identity.player.id },
    }]));
    return Object.freeze({ reused: false, publication });
  }

  async function shareDiscord(userId, run, identity, destinationIdInput) {
    const role = text(identity.membership?.role).toLowerCase();
    if (!identity.membership || !['owner','leader','officer'].includes(role) || !identity.guildId || text(run.guild_id) !== identity.guildId) {
      throw httpError('Guild Officer/Owner authorization is required to publish a website action to a Guild Discord channel.', 403, 'DISCORD_SHARE_FORBIDDEN');
    }
    const destinationId = uuid(destinationIdInput);
    if (!destinationId) throw httpError('Choose a verified Discord destination.', 400, 'INVALID_DISCORD_DESTINATION');
    const destination = first(await store.select('guild_discord_destinations', {
      select: 'id,guild_id,destination_kind,external_id,display_name,verified',
      id: `eq.${destinationId}`,
      guild_id: `eq.${identity.guildId}`,
      destination_kind: 'eq.channel',
      verified: 'eq.true',
      limit: 1,
    }));
    if (!destination?.external_id) throw httpError('The selected Discord channel is not a verified destination for this Guild.', 404, 'DISCORD_DESTINATION_NOT_VERIFIED');
    const existing = await existingPublication(run.id, 'discord', 'discord_destination_id', destination.id);
    if (existing) return Object.freeze({ reused: true, publication: existing });
    const config = actionSharingConfig(env);
    if (!config.discordEnabled || !config.botToken) throw httpError('Discord action sharing is not enabled on this Command Center deployment.', 503, 'DISCORD_ACTION_SHARING_DISABLED');
    const content = discordActionContent(run);
    const response = await fetchImpl(`https://discord.com/api/v10/channels/${encodeURIComponent(destination.external_id)}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bot ${config.botToken}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ content, allowed_mentions: { parse: [] } }),
      redirect: 'error',
    });
    let body = {};
    try { body = await response.json(); } catch {}
    if (!response.ok || !body?.id) throw httpError(`Discord publish failed with HTTP ${response.status}.`, 502, 'DISCORD_ACTION_PUBLISH_FAILED');
    const publication = first(await store.insert('web_action_publications', [{
      run_id: run.id, publisher_user_id: userId, target_kind: 'discord', target_guild_id: identity.guildId,
      discord_destination_id: destination.id, status: 'published', external_id: text(body.id),
      metadata: { source: 'web-action-center', channelId: text(destination.external_id), channelName: text(destination.display_name) },
    }]));
    return Object.freeze({ reused: false, publication });
  }

  async function share(userId, runId, targetKindInput, options = {}) {
    const targetKind = text(targetKindInput).toLowerCase();
    const [identity, run] = await Promise.all([verifiedIdentity(userId), requireOwnedRun(userId, runId)]);
    if (targetKind === 'player-page') return sharePlayerPage(userId, run, identity);
    if (targetKind === 'guild-page') return shareGuildPage(userId, run, identity);
    if (targetKind === 'discord') return shareDiscord(userId, run, identity, options.destinationId);
    throw httpError('Unknown website action publication target.', 400, 'INVALID_ACTION_SHARE_TARGET');
  }

  async function recent(userId, limitInput = 20) {
    await verifiedIdentity(userId);
    const limit = Math.max(1, Math.min(50, Math.trunc(Number(limitInput || 20))));
    return Object.freeze(array(await store.select('web_action_runs', {
      select: 'id,player_id,guild_id,action_key,action_version,status,summary,source_data_at,created_at',
      user_id: `eq.${userId}`,
      order: 'created_at.desc',
      limit,
    })).map((row) => Object.freeze({ ...row })));
  }

  async function feedRuns(publications) {
    const ids = [...new Set(array(publications).map((row) => uuid(row.run_id)).filter(Boolean))];
    if (!ids.length) return [];
    const runs = array(await store.select('web_action_runs', {
      select: 'id,player_id,guild_id,action_key,action_version,status,result,summary,created_at',
      id: `in.(${ids.join(',')})`,
      limit: Math.min(100, ids.length),
    }));
    const byId = new Map(runs.map((run) => [text(run.id), run]));
    return array(publications).map((publication) => feedItem(publication, byId.get(text(publication.run_id)))).filter((item) => item.run.id);
  }

  async function playerFeed(userId, targetAllyCode) {
    const identity = await verifiedIdentity(userId);
    const target = first(await store.select('players', { select: 'id,ally_code,name,current_guild_id', ally_code: `eq.${allyCode(targetAllyCode)}`, limit: 1 }));
    if (!target?.id) throw httpError('Player feed target not found.', 404, 'PLAYER_FEED_NOT_FOUND');
    const self = text(target.id) === text(identity.player.id);
    const sameGuild = Boolean(identity.membership && target.current_guild_id && text(target.current_guild_id) === identity.guildId);
    if (!self && !sameGuild) throw httpError('That Player Page action feed is outside your authorized Guild scope.', 403, 'PLAYER_FEED_FORBIDDEN');
    const publications = array(await store.select('web_action_publications', {
      select: 'id,run_id,target_kind,target_player_id,status,created_at',
      target_kind: 'eq.player_page', target_player_id: `eq.${target.id}`, status: 'eq.published', order: 'created_at.desc', limit: 20,
    }));
    return Object.freeze({ player: { allyCode: allyCode(target.ally_code), name: text(target.name) }, items: Object.freeze(await feedRuns(publications)) });
  }

  async function guildFeed(userId, lookupAllyCode) {
    const identity = await verifiedIdentity(userId);
    const lookup = first(await store.select('players', { select: 'id,ally_code,current_guild_id', ally_code: `eq.${allyCode(lookupAllyCode)}`, limit: 1 }));
    const guildId = text(lookup?.current_guild_id);
    if (!identity.membership || !guildId || guildId !== identity.guildId) throw httpError('Active membership in this Guild is required to read its Command feed.', 403, 'GUILD_FEED_FORBIDDEN');
    const guild = first(await store.select('guilds', { select: 'id,name', id: `eq.${guildId}`, limit: 1 }));
    const publications = array(await store.select('web_action_publications', {
      select: 'id,run_id,target_kind,target_guild_id,status,created_at',
      target_kind: 'eq.guild_page', target_guild_id: `eq.${guildId}`, status: 'eq.published', order: 'created_at.desc', limit: 30,
    }));
    return Object.freeze({ guild: { id: guildId, name: text(guild?.name) }, items: Object.freeze(await feedRuns(publications)) });
  }

  return Object.freeze({ catalog, execute, share, recent, playerFeed, guildFeed, verifiedIdentity });
}

export const webActionService = createWebActionService();
