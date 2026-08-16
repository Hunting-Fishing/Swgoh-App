import { guildRosterService } from './guild-roster-service.mjs';
import { playerVerification } from './player-verification.mjs';
import { supabaseAuthSession } from './supabase-auth-session.mjs';
import { supabaseCoreStore } from './supabase-core-store.mjs';

const MAX_BODY_BYTES = 16 * 1024;

function clean(value) {
  return String(value || '').trim();
}

function finite(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function allyCode(value) {
  const digits = clean(value).replace(/\D/g, '');
  return /^\d{9}$/.test(digits) ? digits : '';
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function first(value) {
  return asArray(value)[0] || null;
}

function unitType(unit = {}) {
  const value = clean(unit.unitType || unit.combatType || unit.type).toLowerCase();
  return value === 'ship' || value === '2' ? 'ship' : 'character';
}

function memberPowers(member = {}) {
  let characterPower = 0;
  let shipPower = 0;
  for (const unit of asArray(member.units)) {
    const power = Math.max(0, Math.trunc(finite(unit?.power, 0)));
    if (unitType(unit) === 'ship') shipPower += power;
    else characterPower += power;
  }
  return Object.freeze({ characterPower, shipPower });
}

function memberIdentity(member = {}) {
  return clean(member.playerId || member.id);
}

function findMember(guildBody, lookupAllyCode) {
  return asArray(guildBody?.members).find((member) => allyCode(member?.allyCode) === lookupAllyCode) || null;
}

function httpError(message, status, code) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function assertSameOrigin(request) {
  const origin = clean(request?.headers?.origin);
  if (!origin) return;
  const host = clean(request?.headers?.['x-forwarded-host'] || request?.headers?.host);
  const proto = clean(clean(request?.headers?.['x-forwarded-proto']).split(',')[0]) || 'https';
  if (!host || origin !== `${proto}://${host}`) {
    throw httpError('Cross-origin account request rejected.', 403, 'CROSS_ORIGIN_REJECTED');
  }
}

async function readJsonBody(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw httpError('Request body is too large.', 413, 'BODY_TOO_LARGE');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw httpError('Request body must contain valid JSON.', 400, 'INVALID_JSON');
  }
}

function writeJson(response, status, body) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(JSON.stringify(body));
}

async function selectOne(store, table, query) {
  return first(await store.select(table, { ...query, limit: 1 }));
}

async function userStatus(store, userId) {
  const links = asArray(await store.select('user_player_links', {
    select: 'player_id,is_primary,verification_status,verification_method,verified_at,created_at,updated_at',
    user_id: `eq.${userId}`,
    order: 'created_at.desc',
  }));
  const memberships = asArray(await store.select('guild_user_memberships', {
    select: 'guild_id,player_id,role,status,joined_at,left_at,created_at,updated_at',
    user_id: `eq.${userId}`,
    order: 'created_at.desc',
  }));

  const players = [];
  for (const link of links) {
    const player = await selectOne(store, 'players', {
      select: 'id,ally_code,swgoh_player_id,name,level,galactic_power,character_power,ship_power,current_guild_id,last_seen_at,last_synced_at',
      id: `eq.${link.player_id}`,
    });
    players.push(Object.freeze({ ...link, player }));
  }

  const guilds = [];
  for (const membership of memberships) {
    const guild = await selectOne(store, 'guilds', {
      select: 'id,swgoh_guild_id,name,member_count,galactic_power,last_seen_at,last_synced_at',
      id: `eq.${membership.guild_id}`,
    });
    guilds.push(Object.freeze({ ...membership, guild }));
  }

  return Object.freeze({ playerLinks: Object.freeze(players), guildMemberships: Object.freeze(guilds) });
}

export function createAccountOnboarding(options = {}) {
  const session = options.session || supabaseAuthSession;
  const store = options.store || supabaseCoreStore;
  const guildService = options.guildService || guildRosterService;
  const now = typeof options.now === 'function' ? options.now : () => new Date();

  async function requireUser(request) {
    const user = await session.currentUser(request);
    if (!user?.id) throw httpError('A signed-in Command Center account is required.', 401, 'AUTH_REQUIRED');
    return user;
  }

  async function requestPlayerLink(user, lookupAllyCode) {
    if (!store.status().configured) throw httpError('Command Center persistence is not configured.', 503, 'PERSISTENCE_NOT_CONFIGURED');

    const existingForUser = asArray(await store.select('user_player_links', {
      select: 'player_id,verification_status',
      user_id: `eq.${user.id}`,
      verification_status: 'neq.rejected',
    }));

    const guildResult = await guildService.getGuildRoster(lookupAllyCode, { staleWhileRevalidate: false });
    const guildBody = guildResult?.value || {};
    const guild = guildBody.guild || {};
    const member = findMember(guildBody, lookupAllyCode);
    if (!member) throw httpError('That Ally Code was not found in the live Guild roster response.', 404, 'PLAYER_NOT_FOUND_IN_GUILD');

    const swgohGuildId = clean(guild.id);
    const swgohPlayerId = memberIdentity(member);
    if (!swgohGuildId || !swgohPlayerId) throw httpError('The live game response is missing stable Guild or player identity.', 502, 'LIVE_IDENTITY_INCOMPLETE');

    const timestamp = now().toISOString();
    const powers = memberPowers(member);
    const guildRow = first(await store.upsert('guilds', [{
      swgoh_guild_id: swgohGuildId,
      name: clean(guild.name) || 'Unknown Guild',
      member_count: Math.max(0, Math.trunc(finite(guild.memberCount, asArray(guildBody.members).length))),
      galactic_power: Math.max(0, Math.trunc(finite(guild.galacticPower, 0))),
      last_seen_at: timestamp,
      source: 'comlink',
      metadata: { identity_discovered_from_signed_user: true },
      updated_at: timestamp,
    }], { onConflict: 'swgoh_guild_id' }));
    if (!guildRow?.id) throw httpError('Could not create the canonical Guild identity.', 502, 'GUILD_IDENTITY_WRITE_FAILED');

    const playerRow = first(await store.upsert('players', [{
      ally_code: lookupAllyCode,
      swgoh_player_id: swgohPlayerId,
      name: clean(member.name || member.playerName) || lookupAllyCode,
      galactic_power: Math.max(0, Math.trunc(finite(member.galacticPower, powers.characterPower + powers.shipPower))),
      character_power: powers.characterPower,
      ship_power: powers.shipPower,
      current_guild_id: guildRow.id,
      last_seen_at: timestamp,
      source: 'comlink',
      metadata: { roster_available_at_identity_request: Boolean(member.rosterAvailable) },
      updated_at: timestamp,
    }], { onConflict: 'ally_code' }));
    if (!playerRow?.id) throw httpError('Could not create the canonical player identity.', 502, 'PLAYER_IDENTITY_WRITE_FAILED');

    const otherVerifiedOwner = await selectOne(store, 'user_player_links', {
      select: 'user_id,player_id,verification_status',
      player_id: `eq.${playerRow.id}`,
      verification_status: 'eq.verified',
    });
    if (otherVerifiedOwner && otherVerifiedOwner.user_id !== user.id) {
      throw httpError('That SWGOH player is already verified to another Command Center account.', 409, 'PLAYER_ALREADY_VERIFIED');
    }

    const currentSame = await selectOne(store, 'user_player_links', {
      select: 'player_id,verification_status',
      user_id: `eq.${user.id}`,
      player_id: `eq.${playerRow.id}`,
    });
    if (currentSame?.verification_status === 'verified') {
      return Object.freeze({ status: 'verified', player: playerRow, guild: guildRow, alreadyVerified: true });
    }

    const conflicting = existingForUser.find((row) => row.player_id !== playerRow.id);
    if (conflicting) {
      throw httpError('This Command Center account already has another active or pending primary SWGOH link.', 409, 'USER_ALREADY_HAS_PLAYER_LINK');
    }

    await store.upsert('user_player_links', [{
      user_id: user.id,
      player_id: playerRow.id,
      is_primary: true,
      verification_status: 'pending',
      verification_method: 'manual',
      verified_at: null,
      updated_at: timestamp,
    }], { onConflict: 'user_id,player_id', returning: false });

    const existingMembership = await selectOne(store, 'guild_user_memberships', {
      select: 'status,role,player_id',
      guild_id: `eq.${guildRow.id}`,
      user_id: `eq.${user.id}`,
    });
    if (existingMembership?.status !== 'active') {
      await store.upsert('guild_user_memberships', [{
        guild_id: guildRow.id,
        user_id: user.id,
        player_id: playerRow.id,
        role: 'member',
        status: 'pending',
        joined_at: null,
        left_at: null,
        updated_at: timestamp,
      }], { onConflict: 'guild_id,user_id', returning: false });
    }

    return Object.freeze({
      status: 'pending',
      player: playerRow,
      guild: guildRow,
      verificationMethod: 'manual',
      rosterAvailable: Boolean(member.rosterAvailable),
    });
  }

  async function handle(request, response, url) {
    if (!url.pathname.startsWith('/api/account/')) return false;
    if (url.pathname.startsWith('/api/account/verification')) {
      return playerVerification.handle(request, response, url);
    }
    try {
      const user = await requireUser(request);

      if (request.method === 'GET' && url.pathname === '/api/account/status') {
        writeJson(response, 200, { user: { id: user.id, email: user.email || '' }, ...(await userStatus(store, user.id)) });
        return true;
      }

      if (request.method === 'POST' && url.pathname === '/api/account/link-player') {
        assertSameOrigin(request);
        const body = await readJsonBody(request);
        const lookupAllyCode = allyCode(body?.allyCode);
        if (!lookupAllyCode) throw httpError('A valid 9-digit Ally Code is required.', 400, 'INVALID_ALLY_CODE');
        const result = await requestPlayerLink(user, lookupAllyCode);
        writeJson(response, result.status === 'verified' ? 200 : 202, result);
        return true;
      }

      writeJson(response, 405, { error: 'Method not allowed for account route.', code: 'METHOD_NOT_ALLOWED' });
      return true;
    } catch (error) {
      writeJson(response, Number(error?.status) || 500, { error: error?.message || 'Account onboarding request failed.', code: error?.code || 'ACCOUNT_REQUEST_FAILED' });
      return true;
    }
  }

  return Object.freeze({ handle, requestPlayerLink, userStatus });
}

export const accountOnboarding = createAccountOnboarding();
