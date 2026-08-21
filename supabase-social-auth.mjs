import { createHash, randomBytes } from 'node:crypto';
import { supabaseCoreStore } from './supabase-core-store.mjs';
import { normalizePublicOrigin, resolvePublicOrigin, resolveRequestOrigin } from './auth-public-origin.mjs';

const ACCESS_COOKIE = 'swgoh_cc_access';
const REFRESH_COOKIE = 'swgoh_cc_refresh';
const OAUTH_COOKIE = 'swgoh_cc_oauth';
const OAUTH_MAX_AGE_SECONDS = 10 * 60;
const PROVIDERS = new Set(['discord', 'google']);

function clean(value) {
  return String(value || '').trim();
}

function trimUrl(value) {
  return clean(value).replace(/\/+$/, '');
}

function boolEnv(value, fallback) {
  if (value == null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(clean(value).toLowerCase());
}

function configFromEnv(env = process.env) {
  const url = trimUrl(env.SUPABASE_URL);
  const publishableKey = clean(env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY);
  const secureCookies = boolEnv(env.AUTH_COOKIE_SECURE, clean(env.NODE_ENV).toLowerCase() !== 'development');
  const publicOrigin = normalizePublicOrigin(env.PUBLIC_APP_ORIGIN || env.APP_PUBLIC_ORIGIN);
  return Object.freeze({ url, publishableKey, secureCookies, publicOrigin, enabled: Boolean(url && publishableKey) });
}

function parseCookies(request) {
  const output = {};
  for (const part of clean(request?.headers?.cookie).split(';')) {
    const index = part.indexOf('=');
    if (index <= 0) continue;
    const key = part.slice(0, index).trim();
    const raw = part.slice(index + 1).trim();
    try { output[key] = decodeURIComponent(raw); } catch { output[key] = raw; }
  }
  return output;
}

function cookie(name, value, { maxAge = 0, secure = true } = {}) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.max(0, Math.floor(maxAge))}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

function sessionCookies(session, secure) {
  const expiresIn = Number(session?.expires_in);
  const accessMaxAge = Number.isFinite(expiresIn) && expiresIn > 0 ? Math.min(Math.floor(expiresIn), 7200) : 3600;
  return [
    cookie(ACCESS_COOKIE, clean(session?.access_token), { maxAge: accessMaxAge, secure }),
    cookie(REFRESH_COOKIE, clean(session?.refresh_token), { maxAge: 60 * 60 * 24 * 30, secure }),
  ];
}

function safeNext(value) {
  const next = clean(value) || '/onboarding';
  return next.startsWith('/') && !next.startsWith('//') && !next.includes('\\') ? next : '/onboarding';
}

function base64urlJson(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function parseBase64urlJson(value) {
  try {
    const parsed = JSON.parse(Buffer.from(clean(value), 'base64url').toString('utf8'));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function pkcePair(random = randomBytes) {
  const verifier = random(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return Object.freeze({ verifier, challenge });
}

async function authRequest(config, fetchImpl, pathname, { method = 'GET', body } = {}) {
  if (!config.enabled) {
    const error = new Error('Supabase Auth is not configured on this deployment.');
    error.status = 503;
    throw error;
  }
  const response = await fetchImpl(`${config.url}${pathname}`, {
    method,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      apikey: config.publishableKey,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    redirect: 'error',
  });
  const text = await response.text();
  let payload = {};
  try { payload = text ? JSON.parse(text) : {}; } catch { payload = {}; }
  if (!response.ok) {
    const error = new Error(payload?.msg || payload?.message || payload?.error_description || `Supabase Auth returned HTTP ${response.status}.`);
    error.status = response.status >= 400 && response.status < 500 ? response.status : 502;
    error.code = clean(payload?.error_code || payload?.code) || 'SOCIAL_AUTH_REQUEST_FAILED';
    throw error;
  }
  return payload;
}

function providerState(settings = {}) {
  const external = settings?.external && typeof settings.external === 'object' ? settings.external : {};
  return Object.freeze({
    discord: external.discord === true,
    google: external.google === true,
  });
}

function identityRow(user, provider) {
  const identities = Array.isArray(user?.identities) ? user.identities : [];
  const identity = identities.find((item) => clean(item?.provider) === provider) || null;
  if (!identity) return null;
  const data = identity.identity_data && typeof identity.identity_data === 'object' ? identity.identity_data : {};
  const providerUserId = clean(identity.provider_id || data.provider_id || data.sub || data.id);
  if (!providerUserId || !user?.id) return null;
  return Object.freeze({
    user_id: clean(user.id),
    provider,
    provider_user_id: providerUserId,
    email: clean(identity.email || data.email || user.email) || null,
    display_name: clean(data.full_name || data.name || data.user_name || data.username) || null,
    avatar_url: clean(data.avatar_url || data.picture) || null,
    metadata: Object.freeze({
      identityId: clean(identity.id),
      emailVerified: Boolean(data.email_verified),
    }),
    last_seen_at: new Date().toISOString(),
  });
}

function redirect(response, location, cookies = []) {
  response.writeHead(303, {
    Location: location,
    'Cache-Control': 'private, no-store',
    Pragma: 'no-cache',
    ...(cookies.length ? { 'Set-Cookie': cookies } : {}),
  });
  response.end();
}

function writeJson(response, status, body) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(JSON.stringify(body));
}

export function createSupabaseSocialAuth(env = process.env, options = {}) {
  const config = configFromEnv(env);
  const fetchImpl = options.fetch || fetch;
  const store = options.store || supabaseCoreStore;
  const random = options.randomBytes || randomBytes;
  const now = typeof options.now === 'function' ? options.now : () => Date.now();
  let settingsCache = { value: null, expiresAt: 0 };

  async function providers({ force = false } = {}) {
    if (!force && settingsCache.value && settingsCache.expiresAt > now()) return settingsCache.value;
    const settings = await authRequest(config, fetchImpl, '/auth/v1/settings');
    const value = providerState(settings);
    settingsCache = { value, expiresAt: now() + 60_000 };
    return value;
  }

  async function start(request, response, provider, next = '/onboarding') {
    if (!PROVIDERS.has(provider)) {
      writeJson(response, 404, { error: 'Social login provider is not supported.' });
      return;
    }

    // Social OAuth must begin and end on the same browser origin because the
    // PKCE verifier is stored in a host-scoped HttpOnly cookie. Railway remains
    // the backend origin, but direct Railway browser OAuth starts are moved to
    // the canonical public app before any verifier/state cookie is created.
    const requestOrigin = resolveRequestOrigin(request);
    if (config.publicOrigin && requestOrigin && requestOrigin !== config.publicOrigin) {
      const canonicalStart = new URL(`/api/auth/oauth/${provider}`, `${config.publicOrigin}/`);
      canonicalStart.searchParams.set('next', safeNext(next));
      redirect(response, canonicalStart.href);
      return;
    }

    const enabled = await providers();
    if (!enabled[provider]) {
      redirect(response, `/login?oauth_error=${encodeURIComponent(`${provider}_not_enabled`)}`);
      return;
    }
    const origin = resolvePublicOrigin(request, config.publicOrigin);
    if (!origin) throw Object.assign(new Error('Could not determine the public Command Center origin.'), { status: 500 });

    const { verifier, challenge } = pkcePair(random);
    const callback = new URL('/api/auth/oauth/callback', origin);
    const oauthState = base64urlJson({
      provider,
      verifier,
      next: safeNext(next),
      createdAt: now(),
    });

    const authorize = new URL('/auth/v1/authorize', `${config.url}/`);
    authorize.searchParams.set('provider', provider);
    authorize.searchParams.set('redirect_to', callback.href);
    authorize.searchParams.set('code_challenge', challenge);
    authorize.searchParams.set('code_challenge_method', 's256');

    redirect(response, authorize.href, [
      cookie(OAUTH_COOKIE, oauthState, { maxAge: OAUTH_MAX_AGE_SECONDS, secure: config.secureCookies }),
    ]);
  }

  async function callback(request, response, url) {
    const cookies = parseCookies(request);
    const oauth = parseBase64urlJson(cookies[OAUTH_COOKIE]);
    const clearOauth = cookie(OAUTH_COOKIE, '', { maxAge: 0, secure: config.secureCookies });
    if (!oauth || !PROVIDERS.has(clean(oauth.provider))) {
      redirect(response, '/login?oauth_error=missing_oauth_state', [clearOauth]);
      return;
    }
    const age = now() - Number(oauth.createdAt || 0);
    if (!Number.isFinite(age) || age < 0 || age > OAUTH_MAX_AGE_SECONDS * 1000) {
      redirect(response, '/login?oauth_error=expired_oauth_state', [clearOauth]);
      return;
    }
    if (url.searchParams.get('error')) {
      redirect(response, `/login?oauth_error=${encodeURIComponent(clean(url.searchParams.get('error')))}`, [clearOauth]);
      return;
    }
    const code = clean(url.searchParams.get('code'));
    if (!code || !clean(oauth.verifier)) {
      redirect(response, '/login?oauth_error=missing_auth_code', [clearOauth]);
      return;
    }

    const session = await authRequest(config, fetchImpl, '/auth/v1/token?grant_type=pkce', {
      method: 'POST',
      body: { auth_code: code, code_verifier: clean(oauth.verifier) },
    });
    if (!session?.access_token || !session?.refresh_token || !session?.user?.id) {
      throw Object.assign(new Error('Social login did not return a valid Command Center session.'), { status: 502 });
    }

    const provider = clean(oauth.provider);
    const row = identityRow(session.user, provider);
    if (row && store.status().configured) {
      await store.upsert('user_social_identities', [row], {
        onConflict: 'provider,provider_user_id',
        returning: false,
      });
    }

    redirect(response, safeNext(oauth.next), [
      ...sessionCookies(session, config.secureCookies),
      clearOauth,
    ]);
  }

  async function handle(request, response, url) {
    if (request.method === 'GET' && url.pathname === '/api/auth/providers') {
      try {
        writeJson(response, 200, { social: await providers() });
      } catch (error) {
        writeJson(response, Number(error?.status) || 502, { error: error?.message || 'Social provider status is unavailable.' });
      }
      return true;
    }

    const startMatch = url.pathname.match(/^\/api\/auth\/oauth\/(discord|google)$/);
    if (request.method === 'GET' && startMatch) {
      try {
        await start(request, response, startMatch[1], url.searchParams.get('next') || '/onboarding');
      } catch (error) {
        redirect(response, `/login?oauth_error=${encodeURIComponent(clean(error?.code || 'oauth_start_failed'))}`);
      }
      return true;
    }

    if (request.method === 'GET' && url.pathname === '/api/auth/oauth/callback') {
      try {
        await callback(request, response, url);
      } catch (error) {
        const clearOauth = cookie(OAUTH_COOKIE, '', { maxAge: 0, secure: config.secureCookies });
        redirect(response, `/login?oauth_error=${encodeURIComponent(clean(error?.code || 'oauth_callback_failed'))}`, [clearOauth]);
      }
      return true;
    }

    return false;
  }

  return Object.freeze({
    handle,
    providers,
    start,
    callback,
    status: () => Object.freeze({
      enabled: config.enabled,
      providers: [...PROVIDERS],
      publicOriginConfigured: Boolean(config.publicOrigin),
      publicOrigin: config.publicOrigin || null,
    }),
  });
}

export { identityRow, pkcePair, providerState, safeNext };
export const supabaseSocialAuth = createSupabaseSocialAuth();
