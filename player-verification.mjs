import { randomInt } from 'node:crypto';
import { supabaseAuthSession } from './supabase-auth-session.mjs';
import { supabaseCoreStore } from './supabase-core-store.mjs';

function clean(value) {
  return String(value || '').trim();
}

function trimUrl(value) {
  return clean(value).replace(/\/+$/, '');
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function first(value) {
  return asArray(value)[0] || null;
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
}

function configFromEnv(env = process.env) {
  return Object.freeze({
    gatewayUrl: trimUrl(env.SWGOH_GATEWAY_URL),
    gatewayApiKey: clean(env.SWGOH_GATEWAY_API_KEY),
    ttlSeconds: Math.min(3600, Math.max(300, positiveInteger(env.PLAYER_VERIFICATION_TTL_SECONDS, 900))),
    requestTimeoutMs: Math.min(30_000, Math.max(3000, positiveInteger(env.PLAYER_VERIFICATION_TIMEOUT_MS, 12_000))),
  });
}

function httpError(message, status, code) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function safeChallenge(row, player = null) {
  if (!row) return null;
  return Object.freeze({
    id: row.id,
    status: row.status,
    type: row.challenge_type,
    targetValue: row.target_value,
    previousValue: row.previous_value,
    expiresAt: row.expires_at,
    attemptCount: Number(row.attempt_count || 0),
    ...(player ? {
      player: Object.freeze({
        allyCode: clean(player.ally_code),
        name: clean(player.name),
      }),
    } : {}),
  });
}

function sameOrigin(request) {
  const origin = clean(request?.headers?.origin);
  if (!origin) return true;
  const host = clean(request?.headers?.['x-forwarded-host'] || request?.headers?.host);
  const proto = clean(clean(request?.headers?.['x-forwarded-proto']).split(',')[0]) || 'https';
  return Boolean(host && origin === `${proto}://${host}`);
}

async function requestVerificationProfile(config, allyCode, options = {}, fetchImpl = fetch) {
  if (!config.gatewayUrl || !config.gatewayApiKey) {
    throw httpError('The live SWGOH verification gateway is not configured.', 503, 'VERIFICATION_GATEWAY_NOT_CONFIGURED');
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);
  try {
    const suffix = options.forceRefresh ? '?refresh=1' : '';
    const response = await fetchImpl(`${config.gatewayUrl}/v1/player/${encodeURIComponent(allyCode)}/verification-profile${suffix}`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'X-API-Key': config.gatewayApiKey,
        'User-Agent': 'SWGOH-Command-Center (player-verification)',
      },
      redirect: 'error',
      signal: controller.signal,
    });
    const text = await response.text();
    let body = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = {};
    }
    if (!response.ok) {
      throw httpError(body?.error || `Verification gateway returned HTTP ${response.status}.`, response.status >= 400 && response.status < 500 ? response.status : 502, 'VERIFICATION_GATEWAY_FAILED');
    }
    if (body?.source !== 'live' || !body?.player?.playerId || !body?.player?.allyCode || !body?.unlocked) {
      throw httpError('The verification gateway returned an incomplete player profile.', 502, 'VERIFICATION_PROFILE_INCOMPLETE');
    }
    return body;
  } catch (error) {
    if (error?.name === 'AbortError') throw httpError('The verification gateway timed out.', 504, 'VERIFICATION_GATEWAY_TIMEOUT');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function chooseChallenge(profile, randomIndex = randomInt) {
  const selectedPortrait = clean(profile?.player?.selectedPortraitId);
  const selectedTitle = clean(profile?.player?.selectedTitleId);
  const portraitCandidates = [...new Set(asArray(profile?.unlocked?.portraitIds).map(clean).filter((id) => id && id !== selectedPortrait))];
  const titleCandidates = [...new Set(asArray(profile?.unlocked?.titleIds).map(clean).filter((id) => id && id !== selectedTitle))];

  if (portraitCandidates.length) {
    const index = portraitCandidates.length === 1 ? 0 : randomIndex(portraitCandidates.length);
    return Object.freeze({ type: 'portrait', previousValue: selectedPortrait, targetValue: portraitCandidates[index] });
  }
  if (titleCandidates.length) {
    const index = titleCandidates.length === 1 ? 0 : randomIndex(titleCandidates.length);
    return Object.freeze({ type: 'title', previousValue: selectedTitle, targetValue: titleCandidates[index] });
  }
  return null;
}

function selectedValue(profile, challengeType) {
  return challengeType === 'title'
    ? clean(profile?.player?.selectedTitleId)
    : clean(profile?.player?.selectedPortraitId);
}

export function createPlayerVerification(env = process.env, options = {}) {
  const config = configFromEnv(env);
  const session = options.session || supabaseAuthSession;
  const store = options.store || supabaseCoreStore;
  const fetchImpl = options.fetch || fetch;
  const now = typeof options.now === 'function' ? options.now : () => new Date();
  const randomIndex = typeof options.randomInt === 'function' ? options.randomInt : randomInt;

  async function requireUser(request) {
    const user = await session.currentUser(request);
    if (!user?.id) throw httpError('A signed-in Command Center account is required.', 401, 'AUTH_REQUIRED');
    return user;
  }

  async function pendingLink(userId) {
    const link = first(await store.select('user_player_links', {
      select: 'user_id,player_id,verification_status,verification_method,created_at,updated_at',
      user_id: `eq.${userId}`,
      verification_status: 'eq.pending',
      order: 'created_at.desc',
      limit: 1,
    }));
    if (!link) throw httpError('Link an Ally Code before starting ownership verification.', 409, 'PLAYER_LINK_REQUIRED');
    const player = first(await store.select('players', {
      select: 'id,ally_code,swgoh_player_id,name,current_guild_id',
      id: `eq.${link.player_id}`,
      limit: 1,
    }));
    if (!player?.id || !player?.ally_code || !player?.swgoh_player_id) {
      throw httpError('The pending player identity is incomplete.', 409, 'PLAYER_IDENTITY_INCOMPLETE');
    }
    return Object.freeze({ link, player });
  }

  async function currentPendingChallenge(userId) {
    return first(await store.select('player_verification_challenges', {
      select: 'id,user_id,player_id,challenge_type,previous_value,target_value,status,attempt_count,expires_at,verified_at,created_at,updated_at',
      user_id: `eq.${userId}`,
      status: 'eq.pending',
      order: 'created_at.desc',
      limit: 1,
    }));
  }

  async function expireIfNeeded(challenge) {
    if (!challenge) return null;
    if (new Date(challenge.expires_at).getTime() > now().getTime()) return challenge;
    await store.update('player_verification_challenges', {
      id: `eq.${challenge.id}`,
      status: 'eq.pending',
    }, {
      status: 'expired',
      updated_at: now().toISOString(),
    }, { returning: false });
    return null;
  }

  async function start(user) {
    if (!store.status().configured) throw httpError('Command Center persistence is not configured.', 503, 'PERSISTENCE_NOT_CONFIGURED');
    const { player } = await pendingLink(user.id);
    const existing = await expireIfNeeded(await currentPendingChallenge(user.id));
    if (existing) {
      if (existing.player_id !== player.id) throw httpError('Another verification challenge is already pending for this account.', 409, 'VERIFICATION_ALREADY_PENDING');
      return Object.freeze({ challenge: safeChallenge(existing, player), reused: true });
    }

    const profile = await requestVerificationProfile(config, player.ally_code, {}, fetchImpl);
    if (clean(profile.player.playerId) !== clean(player.swgoh_player_id) || clean(profile.player.allyCode) !== clean(player.ally_code)) {
      throw httpError('The live verification identity does not match the pending player link.', 409, 'VERIFICATION_IDENTITY_MISMATCH');
    }
    const selected = chooseChallenge(profile, randomIndex);
    if (!selected) {
      throw httpError('No alternate unlocked portrait or title is available for automatic verification.', 409, 'NO_VERIFICATION_COSMETIC_AVAILABLE');
    }

    const createdAt = now();
    const expiresAt = new Date(createdAt.getTime() + config.ttlSeconds * 1000);
    const row = first(await store.insert('player_verification_challenges', [{
      user_id: user.id,
      player_id: player.id,
      challenge_type: selected.type,
      previous_value: selected.previousValue,
      target_value: selected.targetValue,
      status: 'pending',
      attempt_count: 0,
      expires_at: expiresAt.toISOString(),
      created_at: createdAt.toISOString(),
      updated_at: createdAt.toISOString(),
    }]));
    if (!row?.id) throw httpError('Could not create the verification challenge.', 502, 'VERIFICATION_CHALLENGE_WRITE_FAILED');
    return Object.freeze({ challenge: safeChallenge(row, player), reused: false });
  }

  async function check(user) {
    if (!store.status().configured) throw httpError('Command Center persistence is not configured.', 503, 'PERSISTENCE_NOT_CONFIGURED');
    const { player } = await pendingLink(user.id);
    const challenge = await expireIfNeeded(await currentPendingChallenge(user.id));
    if (!challenge) throw httpError('No active verification challenge exists. Start a new challenge.', 409, 'VERIFICATION_CHALLENGE_REQUIRED');
    if (challenge.player_id !== player.id) throw httpError('The verification challenge does not belong to the pending player link.', 409, 'VERIFICATION_PLAYER_MISMATCH');

    const timestamp = now().toISOString();
    const attempts = Number(challenge.attempt_count || 0) + 1;
    const profile = await requestVerificationProfile(config, player.ally_code, { forceRefresh: true }, fetchImpl);
    if (clean(profile.player.playerId) !== clean(player.swgoh_player_id) || clean(profile.player.allyCode) !== clean(player.ally_code)) {
      throw httpError('The refreshed live identity does not match the pending player link.', 409, 'VERIFICATION_IDENTITY_MISMATCH');
    }

    const observed = selectedValue(profile, challenge.challenge_type);
    if (observed !== clean(challenge.target_value)) {
      await store.update('player_verification_challenges', {
        id: `eq.${challenge.id}`,
        user_id: `eq.${user.id}`,
        status: 'eq.pending',
      }, {
        attempt_count: attempts,
        updated_at: timestamp,
      }, { returning: false });
      return Object.freeze({
        verified: false,
        observedValue: observed,
        challenge: safeChallenge({ ...challenge, attempt_count: attempts }, player),
      });
    }

    // The unique verified-player index is the final race-condition guard: two
    // users cannot both become the verified owner of one canonical SWGOH player.
    await store.update('user_player_links', {
      user_id: `eq.${user.id}`,
      player_id: `eq.${player.id}`,
      verification_status: 'eq.pending',
    }, {
      verification_status: 'verified',
      verification_method: 'cosmetic_challenge',
      verified_at: timestamp,
      updated_at: timestamp,
    }, { returning: false });

    await store.update('guild_user_memberships', {
      user_id: `eq.${user.id}`,
      player_id: `eq.${player.id}`,
      status: 'eq.pending',
    }, {
      status: 'active',
      joined_at: timestamp,
      left_at: null,
      updated_at: timestamp,
    }, { returning: false });

    await store.update('player_verification_challenges', {
      id: `eq.${challenge.id}`,
      user_id: `eq.${user.id}`,
      status: 'eq.pending',
    }, {
      status: 'verified',
      attempt_count: attempts,
      verified_at: timestamp,
      updated_at: timestamp,
    }, { returning: false });

    return Object.freeze({
      verified: true,
      player: Object.freeze({ allyCode: player.ally_code, name: player.name }),
      verificationMethod: 'cosmetic_challenge',
    });
  }

  async function status(user) {
    const { player } = await pendingLink(user.id).catch((error) => {
      if (error?.code === 'PLAYER_LINK_REQUIRED') return { player: null };
      throw error;
    });
    const challenge = await expireIfNeeded(await currentPendingChallenge(user.id));
    return Object.freeze({ challenge: safeChallenge(challenge, player) });
  }

  async function handle(request, response, url) {
    if (!url.pathname.startsWith('/api/account/verification')) return false;
    const writeJson = (statusCode, body) => {
      response.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      response.end(JSON.stringify(body));
    };

    try {
      const user = await requireUser(request);
      if (request.method === 'GET' && url.pathname === '/api/account/verification') {
        writeJson(200, await status(user));
        return true;
      }
      if (!sameOrigin(request)) throw httpError('Cross-origin verification request rejected.', 403, 'CROSS_ORIGIN_REJECTED');
      if (request.method === 'POST' && url.pathname === '/api/account/verification/start') {
        writeJson(201, await start(user));
        return true;
      }
      if (request.method === 'POST' && url.pathname === '/api/account/verification/check') {
        const result = await check(user);
        writeJson(result.verified ? 200 : 202, result);
        return true;
      }
      writeJson(405, { error: 'Method not allowed for verification route.', code: 'METHOD_NOT_ALLOWED' });
      return true;
    } catch (error) {
      writeJson(Number(error?.status) || 500, { error: error?.message || 'Player verification failed.', code: error?.code || 'PLAYER_VERIFICATION_FAILED' });
      return true;
    }
  }

  return Object.freeze({ handle, start, check, status, chooseChallenge });
}

export { chooseChallenge, requestVerificationProfile, safeChallenge };
export const playerVerification = createPlayerVerification();
