import { supabaseAuthVerifier } from './supabase-auth.mjs';

const ACCESS_COOKIE = 'swgoh_cc_access';
const REFRESH_COOKIE = 'swgoh_cc_refresh';
const MAX_BODY_BYTES = 32 * 1024;

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
  return Object.freeze({
    url,
    publishableKey,
    secureCookies,
    enabled: Boolean(url && publishableKey),
  });
}

function json(response, status, body, headers = {}) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  });
  response.end(JSON.stringify(body));
}

function parseCookies(request) {
  const cookies = {};
  for (const part of clean(request?.headers?.cookie).split(';')) {
    const index = part.indexOf('=');
    if (index <= 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (!key) continue;
    try {
      cookies[key] = decodeURIComponent(value);
    } catch {
      cookies[key] = value;
    }
  }
  return cookies;
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

function clearSessionCookies(secure) {
  return [
    cookie(ACCESS_COOKIE, '', { maxAge: 0, secure }),
    cookie(REFRESH_COOKIE, '', { maxAge: 0, secure }),
  ];
}

async function readJsonBody(request) {
  const type = clean(request?.headers?.['content-type']).toLowerCase();
  if (type && !type.startsWith('application/json')) {
    const error = new Error('Content-Type must be application/json.');
    error.status = 415;
    throw error;
  }

  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      const error = new Error('Request body is too large.');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    const error = new Error('Request body must contain valid JSON.');
    error.status = 400;
    throw error;
  }
}

function expectedOrigin(request) {
  const host = clean(request?.headers?.['x-forwarded-host'] || request?.headers?.host);
  const proto = clean(clean(request?.headers?.['x-forwarded-proto']).split(',')[0]) || 'https';
  return host ? `${proto}://${host}` : '';
}

function assertSameOrigin(request) {
  const origin = clean(request?.headers?.origin);
  if (!origin) return;
  const expected = expectedOrigin(request);
  if (!expected || origin !== expected) {
    const error = new Error('Cross-origin authentication request rejected.');
    error.status = 403;
    throw error;
  }
}

function validEmail(value) {
  const email = clean(value).toLowerCase();
  return email.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

function validDisplayName(value) {
  return clean(value).replace(/\s+/g, ' ').slice(0, 80);
}

async function authFetch(config, fetchImpl, pathname, { method = 'POST', accessToken = '', body } = {}) {
  if (!config.enabled) {
    const error = new Error('Supabase Auth is not configured on this server.');
    error.status = 503;
    throw error;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetchImpl(`${config.url}${pathname}`, {
      method,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        apikey: config.publishableKey,
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      redirect: 'error',
      signal: controller.signal,
    });
    const text = await response.text();
    let payload = {};
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      payload = {};
    }
    if (!response.ok) {
      const error = new Error(payload?.msg || payload?.message || payload?.error_description || 'Authentication request failed.');
      error.status = response.status >= 400 && response.status < 500 ? response.status : 502;
      error.code = clean(payload?.error_code || payload?.code) || 'AUTH_REQUEST_FAILED';
      throw error;
    }
    return payload;
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeoutError = new Error('Authentication service timed out.');
      timeoutError.status = 504;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function safeUser(user) {
  if (!user?.id) return null;
  return Object.freeze({
    id: clean(user.id),
    email: clean(user.email),
  });
}

export function createSupabaseAuthSession(env = process.env, options = {}) {
  const config = configFromEnv(env);
  const verifier = options.verifier || supabaseAuthVerifier;
  const fetchImpl = options.fetch || fetch;

  function status() {
    return Object.freeze({
      enabled: config.enabled,
      secureCookies: config.secureCookies,
      mode: config.enabled ? 'supabase-auth-http-only-session' : 'disabled',
    });
  }

  async function currentUser(request) {
    const cookies = parseCookies(request);
    const accessToken = clean(cookies[ACCESS_COOKIE]);
    if (!accessToken) return null;
    try {
      return await verifier.verifyAccessToken(accessToken);
    } catch (error) {
      if (error?.status === 401) return null;
      throw error;
    }
  }

  async function handle(request, response, url) {
    if (!url.pathname.startsWith('/api/auth/')) return false;

    try {
      if (request.method === 'GET' && url.pathname === '/api/auth/status') {
        const user = await currentUser(request);
        json(response, 200, { authenticated: Boolean(user), user: user ? safeUser(user) : null, auth: status() });
        return true;
      }

      if (request.method === 'GET' && url.pathname === '/api/auth/me') {
        const user = await currentUser(request);
        if (!user) {
          json(response, 401, { authenticated: false, error: 'A signed-in Command Center session is required.' });
          return true;
        }
        json(response, 200, { authenticated: true, user: safeUser(user) });
        return true;
      }

      if (request.method === 'POST' && url.pathname === '/api/auth/signup') {
        assertSameOrigin(request);
        const body = await readJsonBody(request);
        const email = validEmail(body?.email);
        const password = String(body?.password || '');
        const displayName = validDisplayName(body?.displayName);
        if (!email) throw Object.assign(new Error('A valid email address is required.'), { status: 400 });
        if (password.length < 8 || password.length > 128) throw Object.assign(new Error('Password must be between 8 and 128 characters.'), { status: 400 });

        const payload = await authFetch(config, fetchImpl, '/auth/v1/signup', {
          body: { email, password, data: displayName ? { display_name: displayName } : {} },
        });
        const session = payload?.access_token && payload?.refresh_token ? payload : payload?.session;
        const user = payload?.user || session?.user || payload;
        if (session?.access_token && session?.refresh_token) {
          json(response, 201, { authenticated: true, requiresEmailConfirmation: false, user: safeUser(user) }, {
            'Set-Cookie': sessionCookies(session, config.secureCookies),
          });
        } else {
          json(response, 202, { authenticated: false, requiresEmailConfirmation: true, user: safeUser(user) });
        }
        return true;
      }

      if (request.method === 'POST' && url.pathname === '/api/auth/signin') {
        assertSameOrigin(request);
        const body = await readJsonBody(request);
        const email = validEmail(body?.email);
        const password = String(body?.password || '');
        if (!email || !password) throw Object.assign(new Error('Email and password are required.'), { status: 400 });
        const session = await authFetch(config, fetchImpl, '/auth/v1/token?grant_type=password', { body: { email, password } });
        if (!session?.access_token || !session?.refresh_token) throw Object.assign(new Error('Authentication service did not return a valid session.'), { status: 502 });
        json(response, 200, { authenticated: true, user: safeUser(session.user) }, {
          'Set-Cookie': sessionCookies(session, config.secureCookies),
        });
        return true;
      }

      if (request.method === 'POST' && url.pathname === '/api/auth/refresh') {
        assertSameOrigin(request);
        const cookies = parseCookies(request);
        const refreshToken = clean(cookies[REFRESH_COOKIE]);
        if (!refreshToken) {
          json(response, 401, { authenticated: false, error: 'No refresh session is available.' }, {
            'Set-Cookie': clearSessionCookies(config.secureCookies),
          });
          return true;
        }
        const session = await authFetch(config, fetchImpl, '/auth/v1/token?grant_type=refresh_token', { body: { refresh_token: refreshToken } });
        if (!session?.access_token || !session?.refresh_token) throw Object.assign(new Error('Authentication service did not return a refreshed session.'), { status: 502 });
        json(response, 200, { authenticated: true, user: safeUser(session.user) }, {
          'Set-Cookie': sessionCookies(session, config.secureCookies),
        });
        return true;
      }

      if (request.method === 'POST' && url.pathname === '/api/auth/signout') {
        assertSameOrigin(request);
        const cookies = parseCookies(request);
        const accessToken = clean(cookies[ACCESS_COOKIE]);
        if (accessToken && config.enabled) {
          await authFetch(config, fetchImpl, '/auth/v1/logout', { accessToken, body: {} }).catch(() => undefined);
        }
        json(response, 200, { authenticated: false }, {
          'Set-Cookie': clearSessionCookies(config.secureCookies),
        });
        return true;
      }

      json(response, 405, { error: 'Method not allowed for authentication route.' }, { Allow: 'GET, POST' });
      return true;
    } catch (error) {
      json(response, Number(error?.status) || 500, { error: error?.message || 'Authentication request failed.', code: error?.code || undefined });
      return true;
    }
  }

  return Object.freeze({
    status,
    currentUser,
    handle,
    cookieNames: Object.freeze({ access: ACCESS_COOKIE, refresh: REFRESH_COOKIE }),
  });
}

export const supabaseAuthSession = createSupabaseAuthSession(process.env);
