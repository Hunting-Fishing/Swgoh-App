function clean(value) {
  return String(value || '').trim();
}

function trimUrl(value) {
  return clean(value).replace(/\/+$/, '');
}

function uuid(value) {
  const text = clean(value).toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(text) ? text : '';
}

function configFromEnv(env = process.env) {
  const url = trimUrl(env.SUPABASE_URL);
  const publishableKey = clean(env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY);
  return Object.freeze({
    url,
    publishableKey,
    enabled: Boolean(url && publishableKey),
  });
}

function authError(message, status = 401, code = 'AUTH_REQUIRED') {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function bearerFromRequest(request) {
  const raw = clean(request?.headers?.authorization || request?.headers?.Authorization);
  const match = raw.match(/^Bearer\s+(.+)$/i);
  return match ? clean(match[1]) : '';
}

export function createSupabaseAuthVerifier(env = process.env, options = {}) {
  const config = configFromEnv(env);
  const fetchImpl = options.fetch || fetch;
  const timeoutMs = Number.isFinite(Number(options.timeoutMs)) ? Math.max(1000, Number(options.timeoutMs)) : 10_000;

  function status() {
    return Object.freeze({
      enabled: config.enabled,
      urlConfigured: Boolean(config.url),
      publishableKeyConfigured: Boolean(config.publishableKey),
      mode: config.enabled ? 'supabase-auth-user-endpoint' : 'disabled',
    });
  }

  async function verifyAccessToken(accessToken) {
    const token = clean(accessToken);
    if (!config.enabled) throw authError('Supabase Auth is not configured on this server.', 503, 'AUTH_NOT_CONFIGURED');
    if (!token) throw authError('A signed-in Command Center session is required.');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${config.url}/auth/v1/user`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          apikey: config.publishableKey,
          Authorization: `Bearer ${token}`,
        },
        redirect: 'error',
        signal: controller.signal,
      });

      let body = {};
      try {
        body = await response.json();
      } catch {
        body = {};
      }

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw authError('The Command Center session is invalid or expired.', 401, 'AUTH_INVALID');
        }
        throw authError('Supabase Auth could not validate the session.', 502, 'AUTH_UPSTREAM_ERROR');
      }

      const id = uuid(body?.id);
      if (!id) throw authError('Supabase Auth returned an invalid user identity.', 502, 'AUTH_INVALID_RESPONSE');

      return Object.freeze({
        id,
        email: clean(body?.email),
        role: clean(body?.role) || 'authenticated',
      });
    } catch (error) {
      if (error?.name === 'AbortError') throw authError('Supabase Auth validation timed out.', 504, 'AUTH_TIMEOUT');
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  return Object.freeze({
    status,
    verifyAccessToken,
    async authenticateRequest(request) {
      return verifyAccessToken(bearerFromRequest(request));
    },
    bearerFromRequest,
  });
}

export const supabaseAuthVerifier = createSupabaseAuthVerifier(process.env);
